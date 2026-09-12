/**
 * Vagues d'ennemis.
 *
 * Une vague est une liste de lots : « 12 Rattata, un toutes les 0,6 s ».
 * Le spawner ne connaît ni la scène ni le rendu : il annonce simplement
 * qu'un ennemi doit apparaître.
 */

import type { Species } from '@/data/types';
import { getSpecies } from '@/data/content';

export interface SpawnBatch {
  speciesId: string;
  count: number;
  /** Secondes entre deux apparitions du lot. */
  interval: number;
  hp: number;
  speed: number;
}

export interface Wave {
  batches: SpawnBatch[];
  /** Pause avant la vague suivante. */
  restAfter: number;
}

export interface SpawnRequest {
  species: Species;
  hp: number;
  speed: number;
}

export const WAVES: Wave[] = [
  { batches: [{ speciesId: 'rattata', count: 8, interval: 0.9, hp: 20, speed: 2 }], restAfter: 6 },
  {
    batches: [
      { speciesId: 'rattata', count: 10, interval: 0.7, hp: 24, speed: 2.1 },
      { speciesId: 'weedle', count: 6, interval: 0.9, hp: 34, speed: 1.6 },
    ],
    restAfter: 6,
  },
  {
    batches: [
      { speciesId: 'zigzagoon', count: 14, interval: 0.5, hp: 30, speed: 2.4 },
      { speciesId: 'weedle', count: 10, interval: 0.6, hp: 40, speed: 1.7 },
    ],
    restAfter: 8,
  },
];

/**
 * Met les vagues à l'échelle du niveau d'histoire.
 *
 * Les points de vie montent plus vite que les effectifs : allonger les vagues
 * rallongerait surtout l'attente, alors que des ennemis plus coriaces obligent
 * vraiment à élargir son équipe. La cadence d'apparition se resserre un peu,
 * sans jamais descendre sous un tiers de seconde.
 */
export function vaguesPourNiveau(niveau: number): Wave[] {
  const palier = Math.max(0, niveau - 1);
  const vie = 1 + palier * 0.4;
  const renfort = Math.floor(palier * 0.75);

  return WAVES.map((vague) => ({
    restAfter: vague.restAfter,
    batches: vague.batches.map((lot) => ({
      ...lot,
      count: lot.count + renfort,
      hp: Math.round(lot.hp * vie),
      speed: lot.speed * (1 + palier * 0.04),
      interval: Math.max(0.33, lot.interval * (1 - palier * 0.05)),
    })),
  }));
}

export type WaveEvent =
  | { kind: 'spawn'; request: SpawnRequest }
  | { kind: 'waveCleared'; index: number }
  | { kind: 'allCleared' };

export class WaveRunner {
  private waveIndex = 0;
  private batchIndex = 0;
  private spawned = 0;
  private timer = 0;
  private resting = 0;
  private finished = false;

  constructor(private readonly waves: readonly Wave[] = WAVES) {}

  get currentWave(): number {
    return this.waveIndex + 1;
  }

  get totalWaves(): number {
    return this.waves.length;
  }

  get done(): boolean {
    return this.finished;
  }

  /** Avance le temps et renvoie ce qui doit se produire ce tick. */
  update(dt: number, aliveEnemies: number): WaveEvent[] {
    const events: WaveEvent[] = [];
    if (this.finished) return events;

    if (this.resting > 0) {
      this.resting -= dt;
      return events;
    }

    const wave = this.waves[this.waveIndex];
    if (!wave) return events;

    const batch = wave.batches[this.batchIndex];
    if (batch) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = batch.interval;
        events.push({
          kind: 'spawn',
          request: { species: getSpecies(batch.speciesId), hp: batch.hp, speed: batch.speed },
        });
        this.spawned++;
        if (this.spawned >= batch.count) {
          this.spawned = 0;
          this.batchIndex++;
        }
      }
      return events;
    }

    // Tous les lots sont sortis : la vague se termine quand le terrain est vide.
    if (aliveEnemies > 0) return events;

    events.push({ kind: 'waveCleared', index: this.waveIndex });
    this.waveIndex++;
    this.batchIndex = 0;
    this.spawned = 0;
    this.timer = 0;
    if (this.waveIndex >= this.waves.length) {
      this.finished = true;
      events.push({ kind: 'allCleared' });
    } else {
      this.resting = wave.restAfter;
    }
    return events;
  }
}
