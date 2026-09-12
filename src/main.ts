/**
 * Point d'entrée.
 *
 * Deux temps : la vitrine des starters au premier lancement, puis la manche.
 * Les deux partagent le même renderer mais pas la même scène — la vitrine a
 * son propre éclairage, pensé pour du blanc, et il n'aurait aucun sens sur le
 * terrain.
 */

import './ui/theme.css';

import { GameLoop } from '@/core/loop';
import { InputState } from '@/core/input';
import { createStage } from '@/render/scene';
import { createShowcase } from '@/render/showcase';
import { demanderStarter } from '@/ui/starter-screen';
import { Game } from '@/game/game';
import { AccountManager, createStore, resolveAccountId } from '@/save';
import { createPokemon } from '@/data/roll';
import { STARTER_CASES } from '@/data/content';
import { Hud } from '@/ui/hud';

const container = document.getElementById('app');
if (!container) throw new Error('#app introuvable');

const stage = createStage(container);
const input = new InputState(stage.renderer.domElement);

const store = createStore();
const account = await AccountManager.open(store, resolveAccountId());

/* ---------- Premier lancement : choix du starter ---------- */

if (!account.account.starterId) {
  const showcase = await createShowcase(stage.renderer);
  await showcase.charger(STARTER_CASES[0]!.starters);

  let vitrineActive = true;
  let precedent = performance.now();

  const boucleVitrine = (maintenant: number): void => {
    if (!vitrineActive) return;
    requestAnimationFrame(boucleVitrine);
    const dt = Math.min(0.1, (maintenant - precedent) / 1000);
    precedent = maintenant;
    showcase.resize(container.clientWidth, container.clientHeight);
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

/* ---------- Manche ---------- */

const rosterSpecies = [...new Set(account.account.roster.map((p) => p.speciesId))];
const game = await Game.create(stage.scene, stage.camera, input, rosterSpecies);

const hud = new Hud(container, {
  onSelection(owned) {
    game.pendingPlacement = owned;
  },
});
hud.setRoster(account.account.roster);

let lastCrystals = 0;

const loop = new GameLoop({
  update(dt, tick) {
    game.update(dt, tick);

    // La pose consomme la sélection : on remet la barre en phase.
    if (!game.pendingPlacement) hud.clearSelection();

    const status = game.status;
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

loop.start();

// Accès au jeu depuis la console du navigateur, pour inspecter une partie
// en cours. Retiré du build de production.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__game'] = game;
  (window as unknown as Record<string, unknown>)['__stage'] = stage;
  (window as unknown as Record<string, unknown>)['__account'] = account;
}

window.addEventListener('beforeunload', () => void account.flush());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    loop.stop();
    game.dispose();
    input.dispose();
    stage.dispose();
    hud.dispose();
  });
}
