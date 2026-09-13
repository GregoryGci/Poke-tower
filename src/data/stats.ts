/**
 * Stats réelles d'un Pokémon possédé.
 *
 * Les stats affichées étaient celles du Pokédex, brutes : monter un niveau,
 * un palier de sub-stat ou une étoile ne changeait donc rien à l'écran, et
 * pas grand-chose en jeu. Tout ce qui est investi passe désormais par ici, et
 * ce module est le **seul** endroit qui sait composer ces quatre sources :
 *
 *  - les stats de base de l'espèce ;
 *  - le **potentiel**, tiré à l'obtention : deux Salamèche n'ont pas la même
 *    feuille, ce qui donne une raison de regarder un doublon avant de le
 *    sacrifier ;
 *  - le niveau, qui rapporte peu mais sans fin ;
 *  - les étoiles et les sub-stats, qui sont les dépenses du joueur.
 *
 * La rareté et les traits n'y sont pas : ils s'appliquent au combat, sur
 * l'unité posée, et non à la fiche du Pokémon.
 */

import { getSpecies, rareteDe } from './content';
import {
  STAT_TYPES,
  SUBSTAT_MAX_STACK,
  multiplicateurEtoiles,
  type BaseStats,
  type OwnedPokemon,
  type Rarity,
  type StatType,
} from './types';

/** Gain de stat par niveau, en part. Modeste : il y a beaucoup de niveaux. */
export const CROISSANCE_NIVEAU = 0.015;

/** Gain par palier de sub-stat. Douze paliers valent donc +30 %. */
export const GAIN_PAR_PALIER = 0.025;

/**
 * Potentiel maximal par rareté, en pourcentage.
 *
 * C'est l'équivalent des IV : la part de hasard qui distingue deux
 * exemplaires de la même espèce. Le plafond monte avec la rareté, donc un
 * prismatique n'est pas seulement plus fort en moyenne — il peut aller plus
 * haut.
 */
export const POTENTIEL_MAX: Record<Rarity, number> = {
  normal: 8,
  rare: 14,
  epique: 20,
  legendaire: 28,
  unique: 32,
  prismatique: 36,
};

/** Tire le potentiel d'un exemplaire, stat par stat. */
export function rollPotentiel(rarity: Rarity, rng: () => number): BaseStats {
  const plafond = POTENTIEL_MAX[rarity];
  const out = {} as BaseStats;
  for (const stat of STAT_TYPES) {
    // Arrondi au dixième : une feuille de stats se lit, elle ne se calcule pas.
    out[stat] = Math.round(rng() * plafond * 10) / 10;
  }
  return out;
}

/** Potentiel de repli, pour une sauvegarde d'avant la mécanique. */
export function potentielNeutre(): BaseStats {
  const out = {} as BaseStats;
  for (const stat of STAT_TYPES) out[stat] = 0;
  return out;
}

/** Paliers de sub-stat investis sur une stat donnée. */
function paliers(owned: OwnedPokemon, stat: StatType): number {
  let total = 0;
  for (const sub of owned.subStats) {
    if (sub.statType === stat) total += Math.min(SUBSTAT_MAX_STACK, sub.stack);
  }
  return total;
}

/** Le détail d'une stat, pour l'afficher sans le recalculer dans l'interface. */
export interface DetailStat {
  stat: StatType;
  /** Valeur du Pokédex. */
  base: number;
  /** Valeur réellement utilisée. */
  valeur: number;
  /** Potentiel tiré à l'obtention, en pourcentage. */
  potentiel: number;
  /** Part apportée par les étoiles, en pourcentage. */
  etoiles: number;
  /** Part apportée par le niveau, en pourcentage. */
  niveau: number;
  /** Part apportée par les sub-stats, en pourcentage. */
  subStats: number;
}

/**
 * Compose une stat.
 *
 * Les quatre sources se multiplient plutôt que de s'additionner : un
 * investissement doit valoir d'autant plus que le Pokémon est déjà bon, sinon
 * monter un prismatique et monter un normal reviennent au même.
 */
export function detailStat(
  owned: OwnedPokemon,
  stat: StatType,
  /**
   * Espèce à considérer, quand elle diffère de celle de l'exemplaire.
   *
   * Les paliers de manche font évoluer un Pokémon posé sans toucher à sa
   * fiche : le socle de stats doit alors être celui de la forme atteinte,
   * pendant que tout le reste — potentiel, niveau, étoiles, sub-stats —
   * continue de venir de l'exemplaire possédé.
   */
  speciesId: string = owned.speciesId
): DetailStat {
  const base = getSpecies(speciesId).baseStats[stat];
  const potentiel = owned.potentiel?.[stat] ?? 0;
  const etoiles = (multiplicateurEtoiles(owned.stars) - 1) * 100;
  const niveau = CROISSANCE_NIVEAU * Math.max(0, owned.level - 1) * 100;
  const subStats = GAIN_PAR_PALIER * paliers(owned, stat) * 100;

  const valeur =
    base *
    (1 + potentiel / 100) *
    multiplicateurEtoiles(owned.stars) *
    (1 + niveau / 100) *
    (1 + subStats / 100);

  return { stat, base, valeur, potentiel, etoiles, niveau, subStats };
}

/** Toutes les stats réelles d'un exemplaire. */
export function statsEffectives(
  owned: OwnedPokemon,
  speciesId: string = owned.speciesId
): BaseStats {
  const out = {} as BaseStats;
  for (const stat of STAT_TYPES) out[stat] = detailStat(owned, stat, speciesId).valeur;
  return out;
}

/**
 * Critères de tri d'un roster.
 *
 * Ils vivent ici et non dans l'interface : « meilleur potentiel » est une
 * question de règles, pas d'affichage, et l'écran d'équipe comme la
 * collection doivent répondre pareil.
 */
export const TRIS_POKEMON: ReadonlyArray<{
  id: string;
  libelle: string;
  comparer(a: OwnedPokemon, b: OwnedPokemon): number;
}> = [
  {
    id: 'potentiel',
    libelle: 'Potentiel',
    comparer: (a, b) => notePotentiel(b) - notePotentiel(a),
  },
  {
    id: 'etoiles',
    libelle: 'Étoiles',
    comparer: (a, b) => b.stars - a.stars || b.level - a.level,
  },
  {
    id: 'niveau',
    libelle: 'Niveau',
    comparer: (a, b) => b.level - a.level || b.xp - a.xp,
  },
  {
    id: 'rarete',
    libelle: 'Rareté',
    comparer: (a, b) => POTENTIEL_MAX[rareteDe(b)] - POTENTIEL_MAX[rareteDe(a)],
  },
  {
    id: 'espece',
    libelle: 'Espèce',
    comparer: (a, b) =>
      getSpecies(a.speciesId).dexNumber - getSpecies(b.speciesId).dexNumber,
  },
];

/**
 * Note globale d'un exemplaire, de 0 à 100.
 *
 * Sert à trier et à comparer deux doublons d'un coup d'oeil. Elle ne mesure
 * que le potentiel tiré — pas ce qui a été investi, qui se rattrape toujours.
 */
export function notePotentiel(owned: OwnedPokemon): number {
  const plafond = POTENTIEL_MAX[rareteDe(owned)];
  if (plafond <= 0) return 0;
  let somme = 0;
  for (const stat of STAT_TYPES) somme += owned.potentiel?.[stat] ?? 0;
  return Math.round((somme / (plafond * STAT_TYPES.length)) * 100);
}
