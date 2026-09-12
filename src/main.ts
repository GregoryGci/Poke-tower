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
import { Game } from '@/game/game';
import { AccountManager, createStore, resolveAccountId } from '@/save';
import { createPokemon } from '@/data/roll';

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
  await account.flush();
}

/* ---------- Une manche ---------- */

/** Joue une manche et rend la main quand le joueur la quitte. */
async function jouerManche(): Promise<void> {
  input.reset();

  const rosterSpecies = [...new Set(account.account.roster.map((p) => p.speciesId))];
  const game = await Game.create(
    stage.scene,
    stage.camera,
    input,
    rosterSpecies,
    account.account.progression.storyLevel
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
  });
  hud.setRoster(account.account.roster);

  // Une capture rejoint l'equipe sur-le-champ : le joueur peut poser sa prise
  // dans la manche en cours, ce qui est tout l'interet d'affaiblir sans achever.
  game.onCapture = (speciesId) => {
    if (account.account.roster.some((p) => p.speciesId === speciesId)) return;
    account.account.roster.push(createPokemon(speciesId, 'normal'));
    hud.setRoster(account.account.roster);
    account.touch();
  };

  // Première run : les consignes s'effacent d'elles-mêmes dès que le geste est fait.
  const tutorial = account.account.progression.tutorialDone
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
      stage.renderer.render(stage.scene, stage.camera);
      hud.update(game.status);
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
  const bilanFinal = game.status;
  hud.dispose();
  tutorial?.dispose();

  // La scène reste affichée derrière le bilan : le joueur voit où en était le
  // terrain au moment où tout s'est joué.
  if (!abandon) await afficherBilan(bilanFinal);

  game.dispose();
  input.reset();

  // Une manche gagnée fait progresser l'histoire.
  if (bilanFinal.outcome === 'victoire') {
    account.account.progression.storyLevel += 1;
  }
  await account.flush();
}

/* ---------- Enchaînement des écrans ---------- */

if (!account.account.starterId) {
  await choisirStarter();
}

// Le menu revient après chaque manche : c'est le point fixe du jeu.
for (;;) {
  const destination = await ouvrirMenu(account.account);

  if (destination === 'histoire') {
    await jouerManche();
    continue;
  }

  if (destination === 'equipe') {
    await ouvrirEquipe(account.account);
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
