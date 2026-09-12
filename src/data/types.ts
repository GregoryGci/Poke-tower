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
  /**
   * Temps d'incantation, en secondes.
   *
   * L'unité se prépare avant de frapper, et la zone visée s'affiche pendant
   * ce temps : c'est ce qui rend une grosse attaque lisible — on voit où elle
   * va tomber avant qu'elle tombe. Les attaques rapides gardent 0.
   */
  cast: number;
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

/**
 * Maniere de frapper d'une espece.
 *
 * C'est ce qui rend un Pokemon situationnel plutot qu'un simple paquet de
 * chiffres : un tireur longue portee et un cogneur de melee ne se posent pas
 * au meme endroit, meme a puissance egale.
 */
export type AttackStyle = 'unique' | 'ligne' | 'zone' | 'cac';

export interface StyleProfil {
  /** Multiplicateur de degats propre au style. */
  degats: number;
  /** Multiplicateur de cadence : sous 1, l'unite tire plus vite. */
  cadence: number;
  /** Rayon touche autour de l'impact, pour le style « zone ». */
  rayon: number;
  /** Demi-largeur du couloir touche, pour le style « ligne ». */
  couloir: number;
  libelle: string;
}

export const STYLES: Record<AttackStyle, StyleProfil> = {
  // Touche une cible. L'etalon auquel les autres se comparent.
  unique: { degats: 1, cadence: 1, rayon: 0, couloir: 0, libelle: 'Cible unique' },
  // Traverse la file : redoutable sur une ligne droite, quelconque ailleurs.
  ligne: { degats: 0.7, cadence: 1.15, rayon: 0, couloir: 0.9, libelle: 'Transperce' },
  // Frappe un groupe, mais moins fort chacun.
  zone: { degats: 0.62, cadence: 1.2, rayon: 2, couloir: 0, libelle: 'Zone' },
  // Courte portee, mais frappe vite et tres fort.
  cac: { degats: 1.5, cadence: 0.75, rayon: 0, couloir: 0, libelle: 'Corps a corps' },
};

/** Définition d'une espèce : partagée, jamais modifiée par le joueur. */
export interface Species {
  id: string;
  dexNumber: number;
  name: string;
  types: [PokemonType] | [PokemonType, PokemonType];
  baseStats: BaseStats;
  /** Portée de base en unités monde (1 unité = 1 case). */
  range: number;
  /** Manière de frapper : décide du placement autant que la portée. */
  style: AttackStyle;
  /** Identifiants des attaques réellement apprenables par l'espèce. */
  movepool: string[];
  /** Nom du fichier .glb dans public/models, sans extension. */
  model: string;
  /** Hauteur approximative, pour poser la barre de vie au-dessus. */
  height: number;
}

/** Instance possédée par un joueur. */
/**
 * Experience necessaire pour quitter ce niveau.
 *
 * Courbe volontairement douce au debut : les premiers niveaux doivent tomber
 * en une manche ou deux, pour que la progression se voie tout de suite.
 */
export function xpRequise(niveau: number): number {
  return Math.round(40 * Math.pow(niveau, 1.45));
}

/** Applique un gain d'experience et retourne les niveaux pris. */
export function ajouterXp(owned: OwnedPokemon, gain: number): number {
  owned.xp += Math.max(0, Math.round(gain));
  let gagnes = 0;
  while (owned.xp >= xpRequise(owned.level)) {
    owned.xp -= xpRequise(owned.level);
    owned.level += 1;
    gagnes += 1;
  }
  return gagnes;
}

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
  /** Experience accumulee au niveau courant. */
  xp: number;
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

/** Arme possedee. Le modele vit dans data/weapons ; ceci est l'exemplaire. */
export interface OwnedWeapon {
  id: string;
  weaponId: string;
  rarity: Rarity;
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
  /** Armes possedees par le dresseur. */
  weapons: OwnedWeapon[];
  /** Arme portee sur le terrain. */
  equippedWeaponId: string | null;
  /** Equipe emmenee en manche : au plus six identifiants du roster. */
  team: string[];
  /** Nom choisi a la creation. */
  trainerName: string;
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
    weapons: [],
    equippedWeaponId: null,
    team: [],
    trainerName: '',
    crystals: 0,
    inventory: [],
    progression: { storyLevel: 1, raidUnlocked: false, tutorialDone: false, clearedLevels: [] },
    updatedAt: Date.now(),
  };
}
