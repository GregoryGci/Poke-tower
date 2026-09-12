/**
 * Raids.
 *
 * Un raid est une manche ordinaire — même terrain généré, mêmes vagues, même
 * pose de Pokémon — avec deux différences : il est plus dur que tout ce que la
 * campagne propose au même moment, et il est le **seul** endroit d'où tombent
 * les pierres d'évolution.
 *
 * C'est délibéré et c'est le point : Évoli est le seul Pokémon dont on choisit
 * la forme finale, et ce choix ne vaut quelque chose que si la pierre se
 * mérite. Une pierre qu'on ramasse en jouant normalement transformerait la
 * décision en formalité.
 *
 * Techniquement, un raid emprunte un monde de la campagne et se présente comme
 * un `Niveau` : tout le générateur de carte, de tracé et de vagues fonctionne
 * sans rien savoir des raids.
 */

import { getMonde, type Niveau } from './campaign';

export interface DropPierre {
  pierreId: string;
  /** Probabilité par manche gagnée, de 0 à 1. */
  chance: number;
}

export interface Raid {
  id: string;
  nom: string;
  description: string;
  /** Monde dont le raid emprunte le décor et le bestiaire. */
  mondeId: string;
  /** Rang simulé : c'est lui qui décide de la dureté des vagues. */
  rang: number;
  /** Palier de boss, de 1 à 4. Un raid en a toujours un. */
  palierBoss: number;
  /** Niveaux de campagne terminés pour qu'il s'ouvre. */
  requis: number;
  butin: DropPierre[];
}

/**
 * La Grotte des Pierres.
 *
 * Un seul raid pour l'instant, et il porte les trois pierres. Les taux sont
 * bas et **indépendants** : une manche peut n'en donner aucune, ce qui est le
 * cas le plus fréquent. À 12 % chacune, il faut une huitaine de manches pour
 * viser une pierre précise, et les trois tombent rarement ensemble.
 */
export const RAIDS: Raid[] = [
  {
    id: 'grotte-pierres',
    nom: 'Grotte des Pierres',
    description:
      'Des vagues renforcées, sans répit. C’est le seul endroit d’où sortent les pierres d’évolution — et elles sortent rarement.',
    mondeId: 'kanto',
    rang: 18,
    palierBoss: 3,
    requis: 10,
    butin: [
      { pierreId: 'pierre-eau', chance: 0.12 },
      { pierreId: 'pierre-foudre', chance: 0.12 },
      { pierreId: 'pierre-feu', chance: 0.12 },
    ],
  },
];

export function getRaid(id: string): Raid | null {
  return RAIDS.find((raid) => raid.id === id) ?? null;
}

/** Un raid est ouvert quand assez de lieux de campagne sont tombés. */
export function raidOuvert(raid: Raid, lieuxFaits: number): boolean {
  return lieuxFaits >= raid.requis;
}

/**
 * Présente un raid comme un niveau.
 *
 * L'identifiant sert de graine à la carte : elle est donc stable d'une
 * tentative à l'autre, comme pour un lieu de campagne. On peut préparer son
 * placement.
 */
export function niveauDuRaid(raid: Raid): Niveau {
  // On vérifie le monde à la construction plutôt qu'en jeu : un raid qui
  // pointerait vers un monde inexistant doit échouer au chargement.
  getMonde(raid.mondeId);
  return {
    id: `raid-${raid.id}`,
    mondeId: raid.mondeId,
    rang: raid.rang,
    index: raid.rang,
    sorte: 'boss',
    nom: raid.nom,
    palierBoss: raid.palierBoss,
  };
}

/** Tire le butin d'un raid gagné. Chaque pierre est tirée séparément. */
export function butinDuRaid(raid: Raid, rng: () => number = Math.random): string[] {
  return raid.butin.filter((drop) => rng() < drop.chance).map((drop) => drop.pierreId);
}
