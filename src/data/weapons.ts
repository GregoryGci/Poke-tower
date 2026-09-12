/**
 * Armes du dresseur.
 *
 * Le dresseur n'était qu'un lanceur d'objets : il devient une unité de combat
 * à part entière, dont le joueur choisit la position à chaque instant. C'est
 * la seule pièce mobile du terrain, donc la seule qui puisse corriger un
 * placement raté en cours de vague.
 *
 * Les armes reprennent les styles de frappe des Pokémon plutôt que d'inventer
 * un second système : un fusil à pompe et un Pokémon de zone se jouent
 * pareil, et le joueur n'a qu'un vocabulaire à apprendre.
 */

import { STYLES, type AttackStyle, type Rarity } from './types';

export interface WeaponModel {
  id: string;
  name: string;
  rarity: Rarity;
  /** Dégâts par tir, avant modificateurs. */
  damage: number;
  /** Secondes entre deux tirs. */
  cooldown: number;
  range: number;
  style: AttackStyle;
  description: string;
}

/**
 * Catalogue.
 *
 * La montée en rareté n'est pas qu'une montée de chiffres : chaque palier
 * change la façon de jouer. Le Glock est volontairement quelconque — c'est
 * l'étalon auquel le joueur comparera ses trouvailles.
 */
export const WEAPONS: Record<string, WeaponModel> = {
  glock: {
    id: 'glock',
    name: 'Glock',
    rarity: 'normal',
    damage: 9,
    cooldown: 0.55,
    range: 6,
    style: 'unique',
    description: 'Fiable, sans surprise. Le point de comparaison.',
  },
  uzi: {
    id: 'uzi',
    name: 'Uzi',
    rarity: 'rare',
    damage: 6,
    cooldown: 0.18,
    range: 5,
    style: 'unique',
    description: 'Crache vite et court. Redoutable collé au chemin.',
  },
  pompe: {
    id: 'pompe',
    name: 'Fusil à pompe',
    rarity: 'rare',
    damage: 22,
    cooldown: 1.1,
    range: 3.6,
    style: 'zone',
    description: 'Arrose un groupe serré, à condition de s’en approcher.',
  },
  precision: {
    id: 'precision',
    name: 'Fusil de précision',
    rarity: 'epique',
    damage: 48,
    cooldown: 1.6,
    range: 14,
    style: 'unique',
    description: 'Couvre presque toute la carte. Un tir, une cible.',
  },
  lance_roquettes: {
    id: 'lance_roquettes',
    name: 'Lance-roquettes',
    rarity: 'legendaire',
    damage: 42,
    cooldown: 2.1,
    range: 9,
    style: 'zone',
    description: 'Souffle large. À ne pas gâcher sur un traînard.',
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    rarity: 'prismatique',
    damage: 70,
    cooldown: 2.4,
    range: 16,
    style: 'ligne',
    description: 'Transperce une file entière d’un bout à l’autre.',
  },
};

/** Arme offerte au premier lancement. */
export const ARME_DE_DEPART = 'glock';

export function getWeapon(id: string): WeaponModel {
  const arme = WEAPONS[id];
  if (!arme) throw new Error(`Arme inconnue : ${id}`);
  return arme;
}

/** Libellé du style, pour l'affichage. */
export function libelleStyle(arme: WeaponModel): string {
  return STYLES[arme.style].libelle;
}

/**
 * Tire une arme selon la rareté demandée.
 *
 * Si aucune arme n'existe à ce palier, on redescend : mieux vaut donner un
 * cran en dessous que rien du tout.
 */
export function armePourRarete(rarete: Rarity, rng: () => number = Math.random): WeaponModel {
  const paliers: Rarity[] = ['prismatique', 'legendaire', 'epique', 'rare', 'normal'];
  const depart = paliers.indexOf(rarete);

  for (let i = Math.max(0, depart); i < paliers.length; i++) {
    const candidates = Object.values(WEAPONS).filter((arme) => arme.rarity === paliers[i]);
    if (candidates.length) {
      const choisie = candidates[Math.floor(rng() * candidates.length)];
      if (choisie) return choisie;
    }
  }
  return WEAPONS[ARME_DE_DEPART]!;
}
