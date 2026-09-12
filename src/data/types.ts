/**
 * Modèles de données du jeu. Ces types sont la référence : le reste du code
 * s'y conforme, et la couche de sauvegarde les sérialise tels quels.
 */

export const RARITIES = ['normal', 'rare', 'epique', 'legendaire', 'prismatique'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Multiplicateur de stats appliqué selon la rareté du Pokémon. */
export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  normal: 1,
  rare: 1.15,
  epique: 1.35,
  legendaire: 1.6,
  prismatique: 2,
};

export const POKEMON_TYPES = [
  'normal', 'feu', 'eau', 'plante', 'electrik', 'glace', 'combat', 'poison',
  'sol', 'vol', 'psy', 'insecte', 'roche', 'spectre', 'dragon', 'tenebres',
  'acier', 'fee',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export type MoveCategory = 'physique' | 'special' | 'statut';

export interface Move {
  id: string;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  /** Puissance brute ; 0 pour les attaques de statut. */
  power: number;
  /** 0 à 1. Une attaque qui rate ne consomme pas le temps de recharge. */
  accuracy: number;
  /** Secondes entre deux utilisations, propre à l'attaque. */
  cooldown: number;
}

export type TraitEffect =
  | { kind: 'stat'; stat: StatType; percent: number }
  | { kind: 'range'; percent: number }
  | { kind: 'cooldown'; percent: number }
  | { kind: 'onKill'; crystals: number };

export interface Trait {
  id: string;
  name: string;
  rarity: Rarity;
  effect: TraitEffect;
}

export const STAT_TYPES = ['pv', 'atk', 'def', 'atkSpe', 'defSpe', 'vitesse'] as const;
export type StatType = (typeof STAT_TYPES)[number];

export const SUBSTAT_MAX_STACK = 12;

export interface SubStat {
  statType: StatType;
  /** 0 à SUBSTAT_MAX_STACK. Chaque palier coûte des cristaux. */
  stack: number;
}

/** Stats de base d'une espèce, façon Pokédex. */
export type BaseStats = Record<StatType, number>;

/** Définition d'une espèce : partagée, jamais modifiée par le joueur. */
export interface Species {
  id: string;
  dexNumber: number;
  name: string;
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: BaseStats;
  /** Portée de base en unités monde (1 unité = 1 case). */
  range: number;
  /** Identifiants des attaques réellement apprenables par l'espèce. */
  movepool: string[];
  /** Nom du fichier .glb dans public/models, sans extension. */
  model: string;
  /** Hauteur approximative, pour poser la barre de vie au-dessus. */
  height: number;
}

/** Instance possédée par un joueur. */
/** Étoiles : de 1 à 6. La sixième ne s'obtient qu'en raid. */
export const ETOILES_MAX = 6;
export const ETOILES_MAX_FUSION = 5;

/**
 * Gain de stats par étoile.
 *
 * Volontairement lineaire et lisible : le joueur doit pouvoir estimer ce que
 * lui rapporte une fusion sans calculer.
 */
export function multiplicateurEtoiles(etoiles: number): number {
  return 1 + (Math.max(1, etoiles) - 1) * 0.18;
}

/** Doublons a consommer pour atteindre ce palier : 2 pour la 2e, 3 pour la 3e… */
export function doublonsRequis(etoilesCourantes: number): number | null {
  if (etoilesCourantes >= ETOILES_MAX_FUSION) return null;
  return etoilesCourantes + 1;
}

export interface OwnedPokemon {
  id: string;
  speciesId: string;
  rarity: Rarity;
  level: number;
  /** 1 a 6. Monte par fusion de doublons, la 6e par ressource de raid. */
  stars: number;
  /** Obtenu a la sixieme etoile. */
  shiny: boolean;
  /** Exactement 4 attaques, tirées du movepool de l'espèce. */
  moves: [Move, Move, Move, Move];
  /** Exactement 2 traits. */
  traits: [Trait, Trait];
  /** Exactement 4 sub-stats. */
  subStats: [SubStat, SubStat, SubStat, SubStat];
}

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  quantity: number;
}

export interface Progression {
  storyLevel: number;
  raidUnlocked: boolean;
  /** La première run explicative a été suivie jusqu'au bout. */
  tutorialDone: boolean;
  /** Niveaux terminés, pour ne pas re-donner les récompenses de première fois. */
  clearedLevels: string[];
}

export interface PlayerAccount {
  id: string;
  /** Version du schéma, pour migrer les sauvegardes sans les perdre. */
  schemaVersion: number;
  starterId: string | null;
  roster: OwnedPokemon[];
  crystals: number;
  inventory: Item[];
  progression: Progression;
  updatedAt: number;
}

export const CURRENT_SCHEMA_VERSION = 1;

export function emptyAccount(id: string): PlayerAccount {
  return {
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    starterId: null,
    roster: [],
    crystals: 0,
    inventory: [],
    progression: { storyLevel: 1, raidUnlocked: false, tutorialDone: false, clearedLevels: [] },
    updatedAt: Date.now(),
  };
}
