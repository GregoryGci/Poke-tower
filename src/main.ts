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
import { invocationOfferte, ouvrirInvocation } from '@/ui/summon';
import { ouvrirCollection } from '@/ui/collection';
import { ouvrirSac } from '@/ui/sac';
import { ouvrirArmes } from '@/ui/weapons';
import { ouvrirCampagne } from '@/ui/campaign';
import { getMonde, niveauParIndex, type Niveau } from '@/data/campaign';
import {
  VIE_PAR_DIFFICULTE,
  ballDuRaid,
  butinDuRaid,
  niveauDuRaid,
  rareteButin,
  type ChoixRaidComplet,
} from '@/data/raids';
import { LIBELLE_RARETE } from '@/data/gacha';
import { getFamille, itemNeuf } from '@/data/items';
import { ajouterPierres, getPierre } from '@/data/pierres';
import { recolter } from '@/data/recolte';
import { alerterEvolution, alerterInfo } from '@/ui/evolution-annonce';
import { ouvrirRaids } from '@/ui/raids';
import { ouvrirSalon } from '@/ui/salon';
import type { SessionCoop } from '@/net/partie';
import { demanderNomDresseur } from '@/ui/creation';
import { Game } from '@/game/game';
import { AccountManager, createStore, resolveAccountId } from '@/save';
import { createPokemon } from '@/data/roll';
import { ARME_DE_DEPART } from '@/data/weapons';
import { armeNeuve } from '@/data/gacha';
import type { OwnedPokemon, OwnedWeapon } from '@/data/types';
import type { OwnedItem } from '@/data/items';
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
  account.account.roster.push(createPokemon(choix.speciesId));
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

/**
 * Joue une manche et rend la main quand le joueur la quitte.
 *
 * `coop` change qui simule, et rien d'autre : l'écran, le HUD et les
 * récompenses sont les mêmes. C'est ce qui permet à une manche en réseau de
 * ne pas être un deuxième jeu à maintenir.
 */
async function jouerManche(
  niveau: Niveau,
  tutoriel: boolean,
  raid: ChoixRaidComplet | null = null,
  coop: SessionCoop | null = null
): Promise<void> {
  input.reset();

  // Le ciel suit le monde : le Mont Braise ne peut pas avoir le fond clair de
  // la Prairie, sinon son sol cendreux paraît sale au lieu de volcanique.
  stage.appliquerCiel(getMonde(niveau.mondeId).theme.ciel);

  // Seule l'équipe part au combat : les modèles chargés sont les siens, pas
  // ceux de toute la collection.
  normaliserEquipe(account.account);
  const equipe = membresEquipe(account.account);
  // En coopération, les Pokémon de l'équipier doivent être chargés ici aussi :
  // ceux qu'il pose s'afficheront sur notre terrain.
  const rosterSpecies = [
    ...new Set([...equipe.map((p) => p.speciesId), ...(coop?.especesDesAutres ?? [])]),
  ];
  const game = await Game.create(
    stage.scene,
    stage.camera,
    input,
    rosterSpecies,
    niveau,
    tutoriel,
    armeEquipee(account.account),
    raid ? VIE_PAR_DIFFICULTE[raid.difficulte] : null
  );

  // Les objets équipés doivent être connus avant la première pose.
  game.inventaireItems = account.account.items ?? [];

  /* ---------- Branchement du réseau ---------- */

  const debrancher: Array<() => void> = [];
  if (coop) {
    game.reseau = coop.estHote ? 'hote' : 'invite';
    game.joueurLocal = coop.moi;
    // Six places chacun : un plafond partagé ferait de la pose une course.
    game.maxPoses = 6 * Math.max(1, coop.joueurs.length);
    game.enregistrerEquipe(coop.moi, equipe, account.account.items ?? []);
    for (const joueur of coop.joueurs) {
      if (joueur.joueur === coop.moi) continue;
      game.enregistrerEquipe(
        joueur.joueur,
        joueur.equipe as OwnedPokemon[],
        joueur.objets as OwnedItem[]
      );
    }

    if (coop.estHote) {
      debrancher.push(
        coop.ecouterIntentions((joueur, intention) => game.appliquerIntention(joueur, intention))
      );
    } else {
      game.envoyerIntention = (intention) => coop.demander(intention);
      debrancher.push(
        coop.ecouterInstantanes((instantane) => game.appliquerInstantane(instantane))
      );
    }
  }

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
      // L'invité ne simule pas : accélérer sa boucle ne ferait rien avancer,
      // et lui laisser croire le contraire serait pire que de refuser.
      if (coop && !coop.estHote) return;
      loop.speed = multiplicateur;
    },
    onPalier() {
      game.monterPalierSelection();
    },
    onFermerSelection() {
      game.deselectionner();
    },
  });
  hud.setRoster(equipe);

  // La camera reste sur le dresseur : c'est autour de lui qu'on tourne la
  // vue. Seul le glisser au bouton du milieu la detache, et une touche la
  // recolle.
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
  let derniereImage = performance.now();
  // La cadence des instantanés se compte en temps réel et non en pas de
  // simulation : à vitesse ×3 la boucle fait trois pas par image, et compter
  // en pas enverrait trente instantanés par seconde au lieu de dix.
  let dernierInstantane = 0;

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

      if (coop?.estHote) {
        const maintenant = performance.now();
        if (maintenant - dernierInstantane >= 100) {
          dernierInstantane = maintenant;
          coop.publier(game.instantane());
        }
      }

      if (status.outcome !== 'en_cours') terminer?.(false);
      // Ce qui remonte au compte est le **gain** de la manche, pas son total.
      // L'affectation directe écrasait le solde : cinq mille cristaux mis de
      // côté devenaient les trois cents gagnés dans la run qui suivait. Le
      // compteur de manche repart de zéro à chaque partie, le solde non.
      if (status.crystals !== lastCrystals) {
        account.account.crystals += status.crystals - lastCrystals;
        lastCrystals = status.crystals;
        account.touch();
      }
    },
    render(alpha) {
      game.render(alpha);
      // La caméra avance sur le temps réel, pas sur le pas de simulation :
      // à vitesse ×3 la boucle fait trois pas par image, et amortir sur ces
      // pas-là ferait tourner la vue trois fois plus vite que la main du
      // joueur ne le demande.
      const maintenant = performance.now();
      const dtCamera = Math.min(0.1, (maintenant - derniereImage) / 1000);
      derniereImage = maintenant;
      stage.avancer(dtCamera);
      // La camera colle au dresseur, sauf si le joueur l a saisie.
      // Bouger le dresseur recolle la camera : lacher le suivi pour regarder
      // ailleurs est utile, mais devoir appuyer sur une touche pour le reprendre
      // alors qu on vient de se deplacer ne l est pas.
      if (game.dresseurEnMouvement && !stage.suit) stage.reprendreSuivi();
      stage.suivre(game.positionDresseur, dtCamera);
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

  if (coop) {
    // Un dernier instantané avant de couper : sans lui, l'invité resterait
    // sur l'avant-dernier et ne verrait jamais le coup qui a tout décidé.
    if (coop.estHote) {
      coop.publier(game.instantane());
      const issue = game.status.outcome;
      if (issue !== 'en_cours') coop.annoncerFin(issue);
    }
    for (const off of debrancher) off();
    await coop.quitter();
  }
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

  // Le tutoriel est fini dès qu'on en a vu le bout, gagné ou perdu.
  //
  // Le drapeau était laissé au module de consignes, qui ne le lève qu'une fois
  // tous ses gestes accomplis : à vitesse ×3 la manche se terminait avant, le
  // tutoriel n'était jamais marqué, et « Défendre la tour » le relançait
  // indéfiniment — la campagne devenait inatteignable.
  if (tutoriel && !abandon) {
    account.account.progression.tutorialDone = true;
  }

  // Une manche gagnée marque le niveau et ouvre le suivant. Rejouer un
  // niveau déjà fait ne repousse donc pas la frontière — c'est le seul moyen
  // de laisser farmer les niveaux faciles sans casser la progression.
  if (bilanFinal.outcome === 'victoire' && !tutoriel) {
    const progression = account.account.progression;

    // L'expérience du dresseur suit les manches, gagnées ou non : c'est un
    // compteur de temps passé, pas une récompense de performance.
    progression.dresseurXp =
      (progression.dresseurXp ?? 0) + 40 + niveau.index * 12;

    if (raid) {
      // Le butin d'un raid est tiré ici et nulle part ailleurs : c'est la
      // seule source de pierres du jeu.
      const pierres = butinDuRaid(raid.raid, raid.difficulte);
      for (const pierreId of pierres) ajouterPierres(account.account, pierreId, 1);

      // La Master Ball se tire a part, et plus rarement : une pierre debloque
      // une evolution qu'on a deja choisie, une Ball ouvre un legendaire.
      const ball = ballDuRaid(raid.raid);
      if (ball) account.account.balls = (account.account.balls ?? 0) + 1;

      const lots = pierres.map((id) => getPierre(id)?.name ?? id);
      if (ball) lots.push('Master Ball');

      // L'objet, lui, tombe a coup sur : c'est la recompense garantie du
      // raid, et seul son palier depend du cran. Une vague de trois minutes
      // qui peut ne rien donner serait insupportable.
      const famille = raid.raid.familleItem ? getFamille(raid.raid.familleItem) : null;
      if (famille) {
        const rarete = rareteButin(raid.difficulte);
        const emplacement = 1 + Math.floor(Math.random() * 3);
        const objet = itemNeuf(famille.id, rarete, emplacement);
        account.account.items = account.account.items ?? [];
        account.account.items.push(objet);
        lots.push(`${famille.nom} ${LIBELLE_RARETE[rarete]} (emplacement ${emplacement})`);
      }

      if (lots.length) await alerterButin(lots.join(', '));
    } else {
      if (!progression.clearedLevels.includes(niveau.id)) {
        progression.clearedLevels.push(niveau.id);
      }
      if (niveau.index >= progression.storyLevel) {
        progression.storyLevel = niveau.index + 1;
      }

      // Une manche tenue sans perdre une seule vie ouvre la récolte
      // automatique de ce lieu. Le critère porte sur `leaked` et non sur les
      // vies affichées : c'est le compteur brut, il ne peut pas mentir.
      progression.perfectLevels = progression.perfectLevels ?? [];
      if (bilanFinal.leaked === 0 && !progression.perfectLevels.includes(niveau.id)) {
        progression.perfectLevels.push(niveau.id);
      }
    }
  }
  await account.flush();
}

/**
 * Annonce le résultat d'une récolte automatique.
 *
 * Même cadre que l'annonce d'évolution, et c'est voulu : inventer une
 * seconde fenêtre modale pour trois chiffres aurait ajouté un vocabulaire
 * visuel de plus sans rien clarifier.
 */
async function alerterRecolte(
  lieu: string,
  cristaux: number,
  xp: number,
  bonbons: number
): Promise<void> {
  const lignes = [`+${cristaux} cristaux`, `+${xp} XP par Pokémon de l’équipe`];
  if (bonbons > 0) lignes.push(`+${bonbons} bonbon${bonbons > 1 ? 's' : ''}`);
  await alerterInfo('Récolte automatique', lieu, lignes);
}

/** Annonce les pierres tombées d'un raid. */
async function alerterButin(noms: string): Promise<void> {
  await alerterInfo('Butin du raid', noms);
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
  // Le ×10 offert s'intercale avant le menu, une seule fois, à la sortie du
  // tutoriel. Il est placé ici et pas à la fin de la manche : si le joueur
  // ferme l'onglet entre les deux, il le retrouvera au lancement suivant
  // plutôt que de le perdre.
  if (
    account.account.progression.tutorialDone &&
    !account.account.progression.invocationOfferteFaite
  ) {
    await invocationOfferte(account);
    continue;
  }

  const destination = await ouvrirMenu(account.account);

  if (destination === 'histoire') {
    // La première run reste une introduction : on ne montre pas quarante
    // niveaux à quelqu'un qui n'a pas encore posé un Pokémon.
    if (!account.account.progression.tutorialDone) {
      await jouerManche(niveauParIndex(1), true);
      continue;
    }
    const choix = await ouvrirCampagne(account.account);
    if (!choix) continue;
    if (choix.auto) {
      const gains = recolter(account.account, choix.niveau);
      await account.flush();
      await alerterRecolte(choix.niveau.nom, gains.cristaux, gains.xpParPokemon, gains.bonbons.length);
      if (gains.evolutions.length) {
        await alerterEvolution(gains.evolutions.map((espece) => espece.name));
      }
      continue;
    }
    await jouerManche(choix.niveau, false);
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

  if (destination === 'sac') {
    await ouvrirSac(account);
    continue;
  }

  if (destination === 'collection') {
    await ouvrirCollection(account.account, () => account.touch());
    continue;
  }

  if (destination === 'invocation') {
    await ouvrirInvocation(account);
    continue;
  }

  if (destination === 'raid') {
    const choix = await ouvrirRaids(account.account);
    if (choix === 'coop') {
      const partie = await ouvrirSalon(account.account);
      if (partie) {
        const complet = { raid: partie.raid, difficulte: partie.difficulte };
        await jouerManche(
          niveauDuRaid(partie.raid, partie.difficulte),
          false,
          complet,
          partie.session
        );
      }
      continue;
    }
    if (choix) {
      await jouerManche(niveauDuRaid(choix.raid, choix.difficulte), false, choix);
    }
    continue;
  }

  // Les autres sections n'existent pas encore : on retombe sur le menu plutôt
  // que de laisser le joueur devant un écran vide.
  console.info(`Section « ${destination} » à construire.`);
}
