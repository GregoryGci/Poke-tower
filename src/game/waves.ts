/**
 * Vagues d'ennemis.
 *
 * Une vague est une liste de lots : « 12 Rattata, un toutes les 0,6 s ».
 * Le spawner ne connaît ni la scène ni le rendu : il annonce simplement
 * qu'un ennemi doit apparaître.
 */

import type { Species } from '@/data/types';
import { getSpecies } from '@/data/content';
import { getMonde, type Niveau } from '@/data/campaign';

export interface SpawnBatch {
  speciesId: string;
  count: number;
  /** Secondes entre deux apparitions du lot. */
  interval: number;
  hp: number;
  speed: number;
  /**
   * Échelle du modèle.
   *
   * Un boss doit se voir avant d'être compris : le premier signal est sa
   * taille, pas sa barre de vie. Les foules instanciées acceptent une échelle
   * par instance, donc cela ne coûte aucun appel de rendu de plus.
   */
  scale: number;
  /** Vrai pour un mini-boss ou un boss : le HUD et le bilan s'en servent. */
  boss: boolean;
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
  scale: number;
  boss: boolean;
}

/**
 * Les quatre paliers de boss d'une region.
 *
 * Les points de vie quadruplent du premier au quatrieme, et la taille suit :
 * c'est la silhouette qui previent le joueur avant la barre de vie.
 */
const PALIERS_BOSS: ReadonlyArray<{ pv: number; taille: number; vitesse: number }> = [
  { pv: 260, taille: 1.6, vitesse: 0.62 },
  { pv: 620, taille: 1.95, vitesse: 0.55 },
  { pv: 1150, taille: 2.25, vitesse: 0.5 },
  { pv: 2000, taille: 2.6, vitesse: 0.45 },
];

/** Lot ordinaire : taille normale, pas un boss. */
function lot(
  speciesId: string,
  count: number,
  interval: number,
  hp: number,
  speed: number
): SpawnBatch {
  return { speciesId, count, interval, hp, speed, scale: 1, boss: false };
}

/**
 * Vagues de reference.
 *
 * Elles ne servent plus qu'au prechargement des modeles d'ennemis : les
 * vagues reellement jouees sont construites par niveau.
 */
export const WAVES: Wave[] = [
  { batches: [lot('rattata', 8, 0.9, 20, 2)], restAfter: 6 },
  {
    batches: [lot('rattata', 10, 0.7, 24, 2.1), lot('weedle', 6, 0.9, 34, 1.6)],
    restAfter: 6,
  },
  {
    batches: [lot('zigzagoon', 14, 0.5, 30, 2.4), lot('weedle', 10, 0.6, 40, 1.7)],
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
/**
 * Vagues de la premiere run.
 *
 * Volontairement maigres : cette manche sert a comprendre ou l'on pose et
 * comment on lance, pas a etre mise en difficulte. Elle doit se gagner du
 * premier coup avec l'unique Pokemon de depart.
 */
export function vaguesTutoriel(): Wave[] {
  return [
    { batches: [lot('rattata', 4, 1.6, 12, 1.7)], restAfter: 4 },
    { batches: [lot('rattata', 5, 1.4, 14, 1.8)], restAfter: 0 },
  ];
}

/**
 * Vagues d'un niveau de campagne.
 *
 * Le bestiaire vient du monde, la difficulte du rang, et la forme de la sorte
 * de niveau. Les points de vie montent plus vite que les effectifs : allonger
 * les vagues rallongerait surtout l'attente, alors que des ennemis plus
 * coriaces obligent vraiment a elargir son equipe.
 *
 * Le mini-boss arrive en renfort d'une vague ordinaire ; le boss occupe sa
 * propre vague finale, avec une escorte maigre. Un boss noye dans trente
 * Rattata ne se verrait pas.
 */
export function vaguesDuNiveau(niveau: Niveau): Wave[] {
  const monde = getMonde(niveau.mondeId);
  const palier = niveau.rang - 1;
  const boss = niveau.palierBoss;

  // Progression a l'interieur du monde, puis durete propre au monde : le
  // premier niveau du Mont Braise doit etre plus dur que le dernier de la
  // Prairie, sinon changer de monde n'est qu'un changement de decor.
  const vie = (1 + palier * 0.22) * monde.durete;
  const renfort = Math.floor(palier * 0.55);
  const cadence = Math.max(0.3, 0.85 * (1 - palier * 0.025));
  const vitesse = 2 * (1 + palier * 0.02);

  const espece = (rang: number): string =>
    monde.bestiaire[rang % monde.bestiaire.length] ?? monde.bestiaire[0]!;

  const vagues: Wave[] = [];
  // Une vague d'echauffement de plus avant un boss : elle sert a poser et a
  // recolter de quoi renforcer avant le vrai rendez-vous.
  const vaguesOrdinaires = boss > 0 ? 3 : 3;

  for (let i = 0; i < vaguesOrdinaires; i++) {
    const batches: SpawnBatch[] = [
      lot(
        espece(i),
        6 + i * 3 + renfort,
        Math.max(0.3, cadence - i * 0.08),
        Math.round((18 + i * 7) * vie),
        vitesse
      ),
    ];
    // Une seconde espece des la deuxieme vague : deux profils a la fois, c'est
    // ce qui rend un placement discutable.
    if (i > 0) {
      batches.push(
        lot(
          espece(i + 2),
          4 + i * 2 + renfort,
          Math.max(0.35, cadence + 0.05 - i * 0.06),
          Math.round((26 + i * 9) * vie),
          vitesse * 0.85
        )
      );
    }
    vagues.push({ batches, restAfter: 6 });
  }

  if (boss > 0) {
    // Le boss occupe sa propre vague finale, avec une escorte maigre : noye
    // dans trente Rattata, il ne se verrait pas.
    //
    // Quatre paliers par region, chacun nettement plus dur que le precedent :
    // le premier est une lecon, le quatrieme un mur. Sans cet ecart, un
    // rendez-vous tous les cinq niveaux deviendrait une formalite repetee.
    const durete = PALIERS_BOSS[boss - 1] ?? PALIERS_BOSS[PALIERS_BOSS.length - 1]!;
    const especeBoss = monde.boss[Math.min(boss, monde.boss.length) - 1] ?? monde.boss[0];

    vagues.push({
      batches: [
        {
          speciesId: especeBoss,
          count: 1,
          interval: 1,
          hp: Math.round(durete.pv * vie),
          speed: vitesse * durete.vitesse,
          scale: durete.taille,
          boss: true,
        },
        lot(espece(1), 5 + renfort + boss * 2, 0.7, Math.round(24 * vie), vitesse),
      ],
      restAfter: 0,
    });
  }

  const derniere = vagues[vagues.length - 1];
  if (derniere) derniere.restAfter = 0;
  return vagues;
}

/** Toutes les especes qu'un niveau peut faire apparaitre. */
export function especesDuNiveau(niveau: Niveau): string[] {
  const monde = getMonde(niveau.mondeId);
  return [...new Set([...monde.bestiaire, ...monde.boss])];
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
          request: {
            species: getSpecies(batch.speciesId),
            hp: batch.hp,
            speed: batch.speed,
            scale: batch.scale,
            boss: batch.boss,
          },
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
