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
import { getSpecies, STARTER_CASES } from '@/data/content';
import type { OwnedPokemon } from '@/data/types';

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

const hud = document.createElement('div');
hud.style.cssText = `
  position: fixed; inset: auto auto 0 0; width: 100%;
  display: flex; gap: 16px; align-items: flex-end; justify-content: space-between;
  padding: 14px 18px; box-sizing: border-box; pointer-events: none;
  font: 13px/1.4 ui-monospace, monospace; color: #16201a;
`;
const readout = document.createElement('div');
readout.style.cssText = 'background: rgba(255,255,255,.82); padding: 8px 12px; border-radius: 4px; white-space: pre;';
const bar = document.createElement('div');
bar.style.cssText = 'display: flex; gap: 6px; pointer-events: auto;';
hud.append(readout, bar);
container.appendChild(hud);

let selectedId: string | null = null;

function renderBar(): void {
  bar.innerHTML = '';
  for (const owned of account.account.roster) {
    const species = getSpecies(owned.speciesId);
    const button = document.createElement('button');
    button.id = `roster-${owned.id}`;
    button.textContent = `${species.name} · ${owned.moves[0].name}`;
    const active = selectedId === owned.id;
    button.style.cssText = `
      font: 12px ui-monospace, monospace; padding: 8px 11px; cursor: pointer;
      border: 1px solid ${active ? '#2e7d52' : '#c3ccbc'};
      background: ${active ? '#2e7d52' : 'rgba(255,255,255,.9)'};
      color: ${active ? '#fff' : '#16201a'}; border-radius: 4px;
    `;
    button.addEventListener('click', () => select(owned));
    bar.appendChild(button);
  }
}

function select(owned: OwnedPokemon): void {
  selectedId = selectedId === owned.id ? null : owned.id;
  game.pendingPlacement = selectedId ? owned : null;
  renderBar();
}

renderBar();

let lastCrystals = 0;

const loop = new GameLoop({
  update(dt, tick) {
    game.update(dt, tick);

    // La pose consomme la sélection : on resynchronise la barre quand ça arrive.
    if (!game.pendingPlacement && selectedId) {
      selectedId = null;
      renderBar();
    }

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

    const s = game.status;
    readout.textContent =
      `vague ${s.wave}/${s.totalWaves}   ennemis ${s.alive}   passés ${s.leaked}\n` +
      `cristaux ${s.crystals}   posés ${s.placed}   draw calls ${s.drawCalls}   sauvegarde ${store.kind}` +
      (s.message ? `\n${s.message}` : '');
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
    hud.remove();
  });
}
