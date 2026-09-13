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

/**
 * Où trouver le modèle 3D d'une arme.
 *
 * Les trois armes de la collection Printstream vivent dans **un seul** .glb :
 * le découper en trois aurait multiplié les requêtes pour le même poids, et
 * le fichier n'est chargé que quand on ouvre l'arsenal ou le portail.
 */
export interface ModeleArme {
  /** Nom du .glb dans public/models, sans extension. */
  fichier: string;
  /** Nom du noeud à extraire dans ce fichier. */
  noeud: string;
}

export interface WeaponModel {
  id: string;
  name: string;
  rarity: Rarity;
  /**
   * Modèle 3D, quand il en existe un.
   *
   * Les armes qui n'en ont pas gardent leur sprite dessiné au pixel. Les deux
   * coexistent volontairement : une arme dont on a le modèle mérite d'être
   * montrée telle qu'elle est, et attendre d'avoir les six pour en montrer une
   * seule n'aurait servi personne.
   */
  modele?: ModeleArme;
  /** Dégâts par tir, avant modificateurs. */
  damage: number;
  /** Secondes entre deux tirs. */
  cooldown: number;
  /** Temps de visée avant le tir, en secondes. Zéro pour les armes légères. */
  cast: number;
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
    cast: 0,
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
    cast: 0,
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
    cast: 0.12,
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
    cast: 0.45,
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
    cast: 0.35,
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
    cast: 0.7,
    range: 16,
    style: 'ligne',
    description: 'Transperce une file entière d’un bout à l’autre.',
  },

  // --- Collection Printstream
  //
  // Trois armes réelles, avec leur modèle. Leurs chiffres suivent ce qu'elles
  // sont plutôt que de reprendre ceux d'une arme existante : un Desert Eagle
  // n'est pas un Glock rebaptisé, et le faire passer pour tel aurait gâché le
  // seul intérêt d'avoir le vrai modèle.
  usp_s: {
    id: 'usp_s',
    name: 'USP-S',
    rarity: 'rare',
    damage: 12,
    cooldown: 0.5,
    cast: 0,
    range: 8,
    style: 'unique',
    description: 'Silencieux et précis. Porte plus loin que le Glock, pour à peine plus fort.',
    modele: { fichier: 'armes-printstream', noeud: 'usp-s_2' },
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    rarity: 'epique',
    damage: 38,
    cooldown: 1.3,
    cast: 0.2,
    range: 9,
    style: 'unique',
    description: 'Lourd, lent, et il ne pardonne pas. Un tir bien placé vaut cinq rafales.',
    modele: { fichier: 'armes-printstream', noeud: 'desert_eagle_0' },
  },
  m4a1_s: {
    id: 'm4a1_s',
    name: 'M4A1-S',
    rarity: 'legendaire',
    damage: 16,
    cooldown: 0.28,
    cast: 0,
    range: 11,
    style: 'unique',
    description: 'La cadence d’un Uzi avec l’allonge d’un fusil. Aucun défaut, et c’est le problème.',
    modele: { fichier: 'armes-printstream', noeud: 'm4a1_s_1' },
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
