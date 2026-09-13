/**
 * Modèles de données du jeu. Ces types sont la référence : le reste du code
 * s'y conforme, et la couche de sauvegarde les sérialise tels quels.
 */

/**
 * Les cinq paliers, du plus commun au plus rare.
 *
 * Le prismatique est le sommet, et il ne se subdivise pas : ce qui distingue
 * un Carchacrok d'un Mewtwo n'est pas leur rareté — elle est la même — mais
 * **où on les trouve**. Le premier sort du portail à cristaux, le second de
 * la Master Ball, et cette appartenance est déclarée espèce par espèce dans
 * le catalogue plutôt que déduite d'un palier de plus.
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

/**
 * Rôle d'une attaque.
 *
 * Le Pokémon n'en porte plus quatre interchangeables mais deux, aux emplois
 * distincts : celle qu'il lance sans arrêt, et celle qu'il ne lance qu'une
 * fois arrivé au bout de ses paliers. Quatre attaques de puissance voisine ne
 * donnaient aucun relief — la tour retenait de toute façon la plus rentable
 * et ignorait les trois autres.
 */
export type MoveSorte = 'auto' | 'ultime';

export interface Move {
  id: string;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  /** Puissance brute ; 0 pour les attaques de statut. */
  power: number;
  /** 0 à 1. Une attaque qui rate ne consomme pas le temps de recharge. */
  accuracy: number;
  /** Auto-attaque, ou grosse attaque débloquée au palier 3. */
  sorte: MoveSorte;
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

/**
 * Une évolution, et sa condition.
 *
 * Deux formes, et la distinction porte tout le reste du système :
 *
 *  - **par niveau** : elle se déclenche toute seule quand l'expérience passe
 *    le palier. C'est le cas ordinaire ;
 *  - **par pierre** : elle demande un objet, et le joueur décide quand — et
 *    surtout **laquelle**, quand il y en a plusieurs. La pierre ne tombe que
 *    dans un raid dédié, à taux faible : c'est ce qui fait d'un Aquali autre
 *    chose qu'un palier de plus.
 */
export type Evolution =
  | { into: string; niveau: number }
  | { into: string; pierre: string };

/** Vrai pour une évolution qui se déclenche à l'expérience. */
export function estEvolutionNiveau(
  evolution: Evolution
): evolution is { into: string; niveau: number } {
  return 'niveau' in evolution;
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
  /**
   * Rareté de l'espèce.
   *
   * Elle appartient à l'espèce et non à l'exemplaire : un Aspicot est normal,
   * toujours, et aucun tirage n'en fera un légendaire. Deux exemplaires de la
   * même espèce à des raretés différentes ne voulaient rien dire — on ne
   * pouvait pas savoir ce que valait un Aspicot sans ouvrir sa fiche.
   *
   * Ce qui distingue encore deux exemplaires : le potentiel, les traits et
   * les sub-stats. La rareté, elle, décide du socle et de la puissance des
   * attaques.
   */
  rarity: Rarity;
  /** Portée de base en unités monde (1 unité = 1 case). */
  range: number;
  /** Manière de frapper : décide du placement autant que la portée. */
  style: AttackStyle;
  /** Auto-attaques réellement apprenables par l'espèce. */
  movepool: string[];
  /**
   * Évolutions possibles. Vide quand la lignée s'arrête là.
   *
   * C'est une **liste** et non une case unique parce que toutes les lignées
   * ne sont pas linéaires : Évoli a trois suites, chacune derrière sa propre
   * pierre. Une case unique aurait obligé à choisir laquelle des trois
   * mériterait d'exister.
   */
  evolutions: readonly Evolution[];
  /** Nom du fichier .glb dans public/models, sans extension. */
  model: string;
  /**
   * Facteur de taille appliqué au modèle.
   *
   * Les modèles Cobblemon sont à l'échelle de Minecraft, où un Rayquaza fait
   * seize blocs de long. Sur un terrain de trente-quatre unités, il en
   * couvrait la moitié. C'est une donnée de l'espèce, pas un correctif
   * d'affichage : la hauteur de sa barre de vie et sa silhouette au sol en
   * dépendent toutes les deux.
   */
  echelle?: number;
  /**
   * Hauteur **rendue**, pour poser la barre de vie au-dessus.
   *
   * Mesurée sur le .glb puis multipliée par `echelle` : c'est la hauteur que
   * le joueur voit, pas celle du fichier. La distinction n'existait pas tant
   * qu'aucune espèce n'était mise à l'échelle ; depuis Rayquaza et les
   * légendaires, stocker la hauteur brute plaçait leur barre de vie à trois
   * fois leur taille au-dessus d'eux.
   */
  height: number;
}

/** Instance possédée par un joueur. */
/**
 * Experience necessaire pour quitter ce niveau.
 *
 * Courbe volontairement douce, et **recalibree** quand l evolution est passee
 * du cote de l experience. L ancienne (40 x n^1.45) demandait 13 456 XP pour
 * atteindre le niveau 16, soit une cinquantaine de manches pour la premiere
 * evolution d un starter, et plus de quatre cents pour la seconde : a ce
 * rythme, personne n aurait jamais vu un Dracaufeu.
 *
 * Mesure avec la courbe actuelle, a 250 XP par manche : niveau 16 en une
 * dizaine de manches, niveau 36 en une soixantaine. Les bonbons raccourcissent
 * les deux.
 */
export function xpRequise(niveau: number): number {
  return Math.round(14 * Math.pow(niveau, 1.2));
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
  level: number;
  /** Experience accumulee au niveau courant. */
  xp: number;
  /** 1 a 6. Monte par fusion de doublons, la 6e par ressource de raid. */
  stars: number;
  /** Obtenu a la sixieme etoile. */
  shiny: boolean;
  /**
   * Potentiel, en pourcentage par stat.
   *
   * L'equivalent des IV : deux exemplaires de la meme espece n'ont pas la
   * meme feuille, ce qui donne une raison de regarder un doublon avant de le
   * sacrifier. Tire a l'obtention, jamais modifiable.
   */
  potentiel: BaseStats;
  /** Marque de favori : remonte l'exemplaire en tete des listes. */
  favori: boolean;
  /** Auto-attaque : ce que le Pokémon lance en boucle sur le terrain. */
  auto: Move;
  /**
   * Grosse attaque, tirée parmi celles du ou des types de l'espèce.
   *
   * Elle reste verrouillée jusqu'au palier 3, qui ne s'achète qu'en manche :
   * la voir sur la fiche sans pouvoir s'en servir est justement ce qui donne
   * envie de monter les paliers.
   */
  ultime: Move;
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
  /** Marque de favori : remonte l'arme en tete de l'arsenal. */
  favori: boolean;
  /** Palier d'amélioration, de 0 à 15. */
  niveau: number;
  /** Stat innée, tirée à l'obtention et jamais modifiable. */
  innee: WeaponStat | null;
  /** Jusqu'à quatre sub-stats, révélées aux paliers +3, +6, +9 et +12. */
  subStats: WeaponStat[];
}

/**
 * Stats qu'une ligne d'arme peut porter.
 *
 * L'union vit ici, avec le reste du schéma de sauvegarde, et non dans le
 * module de règles : c'est elle qui décide de ce qu'un fichier de sauvegarde
 * peut contenir, donc elle appartient au schéma. Les règles l'importent.
 */
export type WeaponStatKind =
  | 'degats_plats'
  | 'degats_pct'
  | 'cadence'
  | 'portee'
  | 'zone'
  | 'cristaux';

/** Une ligne de stat d'arme : son type, sa valeur cumulée, ses rolls. */
export interface WeaponStat {
  kind: WeaponStatKind;
  valeur: number;
  /** Nombre de rolls encaissés, pour l'afficher comme Summoners War. */
  rolls: number;
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
  /**
   * Niveaux tenus **sans perdre un seul point de vie**.
   *
   * C'est ce qui ouvre la récolte automatique : refaire à la main un niveau
   * qu'on a déjà tenu parfaitement n'apprend plus rien au joueur et ne lui
   * demande plus rien. Le critère est volontairement strict — une victoire
   * avec neuf vies sur dix ne suffit pas. Un niveau « maîtrisé » doit l'être.
   */
  perfectLevels: string[];
  /** Expérience du dresseur lui-même, cumulée sur toutes les manches. */
  dresseurXp: number;
}

/**
 * Expérience nécessaire pour quitter ce niveau de dresseur.
 *
 * Plus raide que celle des Pokémon : le niveau de dresseur ne débloque rien
 * en soi, il mesure le temps passé. Il doit donc monter assez lentement pour
 * rester un repère, pas assez vite pour devenir un objectif.
 */
export function xpDresseurRequise(niveau: number): number {
  return Math.round(300 * Math.pow(niveau, 1.35));
}

/** Niveau du dresseur et avancée dans le palier courant, à partir du cumul. */
export function niveauDresseur(xpTotal: number): {
  niveau: number;
  xp: number;
  requis: number;
} {
  let niveau = 1;
  let reste = Math.max(0, Math.round(xpTotal));
  for (;;) {
    const requis = xpDresseurRequise(niveau);
    if (reste < requis || niveau > 200) return { niveau, xp: reste, requis };
    reste -= requis;
    niveau += 1;
  }
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
  /**
   * Master Balls.
   *
   * La seconde monnaie du jeu, et volontairement la plus maigre : elle ne
   * tombe que dans les raids, à taux faible, et n'ouvre qu'une chose — le
   * portail des légendaires. Une monnaie qui sert à plusieurs choses devient
   * un budget à répartir ; celle-ci est une décision unique : invoquer, ou
   * attendre d'en avoir assez pour retenter.
   */
  balls: number;
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
    balls: 0,
    inventory: [],
    progression: {
      storyLevel: 1,
      raidUnlocked: false,
      tutorialDone: false,
      clearedLevels: [],
      perfectLevels: [],
      dresseurXp: 0,
    },
    updatedAt: Date.now(),
  };
}
