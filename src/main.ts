/**
 * Point d'entrée.
 *
 * Trois temps : la vitrine des starters au premier lancement, le menu, puis
 * la manche. Le menu et la manche s'alternent — chaque partie construit un
 * `Game` neuf et le détruit en sortant, ce qui évite d'avoir à remettre à zéro
 * un état de manche devenu complexe.
 *
 * Tous partagent le même renderer, mais pas la même scène : la vitrine a son
 * éclairage à elle, pensé pour du blanc, qui n'aurait aucun sens sur le terrain.
 */

import './ui/theme.css';

import { GameLoop } from '@/core/loop';
import { InputState } from '@/core/input';
import { createStage } from '@/render/scene';
import { createShowcase } from '@/render/showcase';
import { demanderStarter } from '@/ui/starter-screen';
import { ouvrirMenu } from '@/ui/menu';
import { afficherBilan } from '@/ui/result';
import { ouvrirEquipe } from '@/ui/team';
import { ouvrirInvocation } from '@/ui/summon';
import { ouvrirCollection } from '@/ui/collection';
import { ouvrirArmes } from '@/ui/weapons';
import { ouvrirCampagne } from '@/ui/campaign';
import { getMonde, niveauParIndex, type Niveau } from '@/data/campaign';
import { demanderNomDresseur } from '@/ui/creation';
import { Game } from '@/game/game';
import { AccountManager, createStore, resolveAccountId } from '@/save';
import { createPokemon } from '@/data/roll';
import { ARME_DE_DEPART } from '@/data/weapons';
import { armeNeuve } from '@/data/gacha';
import type { OwnedWeapon } from '@/data/types';
import { membresEquipe, normaliserEquipe } from '@/data/team';

import { STARTER_CASES } from '@/data/content';
import { Hud } from '@/ui/hud';
import { Tutorial } from '@/ui/tutorial';

const container = document.getElementById('app');
if (!container) throw new Error('#app introuvable');

const stage = createStage(container);
const input = new InputState(stage.renderer.domElement);

const store = createStore();
const account = await AccountManager.open(store, resolveAccountId());

window.addEventListener('beforeunload', () => void account.flush());

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__stage'] = stage;
  (window as unknown as Record<string, unknown>)['__account'] = account;
}

/* ---------- Premier lancement : choix du starter ---------- */

async function choisirStarter(): Promise<void> {
  const showcase = await createShowcase(stage.renderer);
  await showcase.charger(STARTER_CASES[0]!.starters);

  let vitrineActive = true;
  let precedent = performance.now();

  const boucleVitrine = (maintenant: number): void => {
    if (!vitrineActive) return;
    requestAnimationFrame(boucleVitrine);
    const dt = Math.min(0.1, (maintenant - precedent) / 1000);
    precedent = maintenant;
    showcase.resize(container!.clientWidth, container!.clientHeight);
    showcase.update(dt);
    stage.renderer.render(showcase.scene, showcase.camera);
  };
  requestAnimationFrame(boucleVitrine);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['__showcase'] = showcase;
  }

  const choix = await demanderStarter(showcase);

  vitrineActive = false;
  showcase.dispose();

  // Le starter choisi ouvre le roster ; le reste viendra du gacha.
  account.account.roster.push(createPokemon(choix.speciesId, 'normal'));
  account.account.starterId = choix.speciesId;
  account.account.team = account.account.roster.map((membre) => membre.id);

  // Le dresseur ne part pas les mains vides. Le Glock passe par le meme
  // tirage que les autres : il a donc son innee, comme toute arme.
  account.account.weapons.push(armeNeuve(ARME_DE_DEPART, 'normal'));
  account.account.equippedWeaponId = account.account.weapons[0]!.id;
  await account.flush();
}

/** Arme portee, ou null si le dresseur n'en a aucune. */
function armeEquipee(compte: typeof account.account): OwnedWeapon | null {
  return compte.weapons.find((arme) => arme.id === compte.equippedWeaponId) ?? null;
}

/* ---------- Une manche ---------- */

/** Joue une manche et rend la main quand le joueur la quitte. */
async function jouerManche(niveau: Niveau, tutoriel: boolean): Promise<void> {
  input.reset();

  // Le ciel suit le monde : le Mont Braise ne peut pas avoir le fond clair de
  // la Prairie, sinon son sol cendreux paraît sale au lieu de volcanique.
  stage.appliquerCiel(getMonde(niveau.mondeId).theme.ciel);

  // Seule l'équipe part au combat : les modèles chargés sont les siens, pas
  // ceux de toute la collection.
  normaliserEquipe(account.account);
  const equipe = membresEquipe(account.account);
  const rosterSpecies = [...new Set(equipe.map((p) => p.speciesId))];
  const game = await Game.create(
    stage.scene,
    stage.camera,
    input,
    rosterSpecies,
    niveau,
    tutoriel,
    armeEquipee(account.account)
  );

  let selectionActive = false;
  let terminer: ((abandon: boolean) => void) | null = null;

  const hud = new Hud(container!, {
    onSelection(owned) {
      selectionActive = owned !== null;
      game.pendingPlacement = owned;
    },
    onQuit() {
      terminer?.(true);
    },
    onStart() {
      game.lancerRun();
    },
    onSpeed(multiplicateur) {
      loop.speed = multiplicateur;
    },
  });
  hud.setRoster(equipe);

  // Le clic gauche a vide lache la camera ; une touche la recolle au dresseur.
  game.onCameraLibre = () => stage.libererSuivi();
  const recoller = (evenement: KeyboardEvent): void => {
    if (evenement.code === 'Space' || evenement.code === 'Escape') stage.reprendreSuivi();
  };
  window.addEventListener('keydown', recoller);


  // Première run : les consignes s'effacent d'elles-mêmes dès que le geste est fait.
  const tutorial = !tutoriel
    ? null
    : new Tutorial(container!, () => {
        account.account.progression.tutorialDone = true;
        account.touch();
      });

  let lastCrystals = 0;

  const loop = new GameLoop({
    update(dt) {
      game.update(dt, loop.tick);

      // La pose consomme la sélection : on remet la barre en phase.
      if (!game.pendingPlacement) {
        hud.clearSelection();
        selectionActive = false;
      }

      tutorial?.update(dt, { status: game.status, selection: selectionActive });

      const status = game.status;
      if (status.outcome !== 'en_cours') terminer?.(false);
      if (status.crystals !== lastCrystals) {
        lastCrystals = status.crystals;
        account.account.crystals = status.crystals;
        account.touch();
      }
    },
    render(alpha) {
      game.render(alpha);
      // La camera colle au dresseur, sauf si le joueur l a saisie.
      stage.suivre(game.positionDresseur, 1 / 60);
      stage.renderer.render(stage.scene, stage.camera);
      hud.update(game.status);
      hud.afficherSurvol(game.survol);
    },
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['__game'] = game;
  }

  loop.start();

  const abandon = await new Promise<boolean>((resolve) => {
    terminer = resolve;
  });

  // On fige la simulation avant de lire le bilan : sans cela, les compteurs
  // continueraient d'avancer pendant que le joueur lit son résultat.
  loop.stop();
  window.removeEventListener('keydown', recoller);
  stage.reprendreSuivi();
  const bilanFinal = game.status;
  hud.dispose();
  tutorial?.dispose();

  // La scène reste affichée derrière le bilan : le joueur voit où en était le
  // terrain au moment où tout s'est joué.
  if (!abandon) await afficherBilan(bilanFinal, game.rapport, account.account);

  game.dispose();
  input.reset();

  // Une manche gagnée marque le niveau et ouvre le suivant. Rejouer un
  // niveau déjà fait ne repousse donc pas la frontière — c'est le seul moyen
  // de laisser farmer les niveaux faciles sans casser la progression.
  if (bilanFinal.outcome === 'victoire' && !tutoriel) {
    const progression = account.account.progression;
    if (!progression.clearedLevels.includes(niveau.id)) {
      progression.clearedLevels.push(niveau.id);
    }
    if (niveau.index >= progression.storyLevel) {
      progression.storyLevel = niveau.index + 1;
    }
  }
  await account.flush();
}

/* ---------- Enchaînement des écrans ---------- */

if (!account.account.trainerName) {
  account.account.trainerName = await demanderNomDresseur();
  await account.flush();
}

if (!account.account.starterId) {
  await choisirStarter();
}

// Le menu revient après chaque manche : c'est le point fixe du jeu.
for (;;) {
  const destination = await ouvrirMenu(account.account);

  if (destination === 'histoire') {
    // La première run reste une introduction : on ne montre pas quarante
    // niveaux à quelqu'un qui n'a pas encore posé un Pokémon.
    if (!account.account.progression.tutorialDone) {
      await jouerManche(niveauParIndex(1), true);
      continue;
    }
    const choix = await ouvrirCampagne(account.account);
    if (choix) await jouerManche(choix, false);
    continue;
  }

  if (destination === 'equipe') {
    await ouvrirEquipe(account);
    continue;
  }

  if (destination === 'armes') {
    await ouvrirArmes(account);
    continue;
  }

  if (destination === 'collection') {
    await ouvrirCollection(account.account);
    continue;
  }

  if (destination === 'invocation') {
    await ouvrirInvocation(account);
    continue;
  }

  // Les autres sections n'existent pas encore : on retombe sur le menu plutôt
  // que de laisser le joueur devant un écran vide.
  console.info(`Section « ${destination} » à construire.`);
}
