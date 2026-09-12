/**
 * Table des types : faiblesses, résistances et immunités.
 *
 * C'est la mécanique qui distingue Pokémon de n'importe quel autre jeu de
 * collection, et elle manquait complètement : jusqu'ici, une attaque Feu
 * frappait un Pokémon Plante exactement comme un Pokémon Eau, et le seul
 * critère pour composer une équipe était la puissance brute.
 *
 * Avec elle, un roster large vaut mieux qu'un roster fort : le bon Pokémon
 * contre le bon ennemi double ses dégâts, le mauvais les divise par deux.
 * C'est aussi ce sur quoi repose l'Arène, dont les six vagues sont six
 * Pokémon d'un même dresseur.
 *
 * La table est saisie **par type attaquant**, et seulement là où il se passe
 * quelque chose : tout ce qui n'est pas listé vaut ×1. Écrire les 324 cases
 * aurait été illisible et impossible à relire.
 */

import type { PokemonType } from './types';

interface Affinite {
  /** Types contre lesquels l'attaque fait double. */
  fort?: PokemonType[];
  /** Types contre lesquels elle fait moitié. */
  faible?: PokemonType[];
  /** Types qu'elle ne touche pas du tout. */
  nul?: PokemonType[];
}

const TABLE: Record<PokemonType, Affinite> = {
  normal: { faible: ['roche', 'acier'], nul: ['spectre'] },
  feu: {
    fort: ['plante', 'glace', 'insecte', 'acier'],
    faible: ['feu', 'eau', 'roche', 'dragon'],
  },
  eau: { fort: ['feu', 'sol', 'roche'], faible: ['eau', 'plante', 'dragon'] },
  plante: {
    fort: ['eau', 'sol', 'roche'],
    faible: ['feu', 'plante', 'poison', 'vol', 'insecte', 'dragon', 'acier'],
  },
  electrik: { fort: ['eau', 'vol'], faible: ['electrik', 'plante', 'dragon'], nul: ['sol'] },
  glace: {
    fort: ['plante', 'sol', 'vol', 'dragon'],
    faible: ['feu', 'eau', 'glace', 'acier'],
  },
  combat: {
    fort: ['normal', 'glace', 'roche', 'tenebres', 'acier'],
    faible: ['poison', 'vol', 'psy', 'insecte', 'fee'],
    nul: ['spectre'],
  },
  poison: {
    fort: ['plante', 'fee'],
    faible: ['poison', 'sol', 'roche', 'spectre'],
    nul: ['acier'],
  },
  sol: {
    fort: ['feu', 'electrik', 'poison', 'roche', 'acier'],
    faible: ['plante', 'insecte'],
    nul: ['vol'],
  },
  vol: { fort: ['plante', 'combat', 'insecte'], faible: ['electrik', 'roche', 'acier'] },
  psy: { fort: ['combat', 'poison'], faible: ['psy', 'acier'], nul: ['tenebres'] },
  insecte: {
    fort: ['plante', 'psy', 'tenebres'],
    faible: ['feu', 'combat', 'poison', 'vol', 'spectre', 'acier', 'fee'],
  },
  roche: {
    fort: ['feu', 'glace', 'vol', 'insecte'],
    faible: ['combat', 'sol', 'acier'],
  },
  spectre: { fort: ['psy', 'spectre'], faible: ['tenebres'], nul: ['normal'] },
  dragon: { fort: ['dragon'], faible: ['acier'], nul: ['fee'] },
  tenebres: { fort: ['psy', 'spectre'], faible: ['combat', 'tenebres', 'fee'] },
  acier: { fort: ['glace', 'roche', 'fee'], faible: ['feu', 'eau', 'electrik', 'acier'] },
  fee: { fort: ['combat', 'dragon', 'tenebres'], faible: ['feu', 'poison', 'acier'] },
};

/**
 * Multiplicateur d'une attaque contre un ou deux types.
 *
 * Les deux types se **multiplient**, comme dans les jeux : une attaque Roche
 * contre un Papilusion (insecte/vol) fait ×4, ce qui est exactement la raison
 * pour laquelle on garde un lanceur de pierres dans son équipe.
 */
export function affinite(attaque: PokemonType, cibles: readonly PokemonType[]): number {
  const ligne = TABLE[attaque];
  let total = 1;
  for (const cible of cibles) {
    if (ligne.nul?.includes(cible)) return 0;
    if (ligne.fort?.includes(cible)) total *= 2;
    else if (ligne.faible?.includes(cible)) total *= 0.5;
  }
  return total;
}

/** Libellé d'un multiplicateur, pour l'afficher au joueur. */
export function libelleAffinite(multiplicateur: number): string | null {
  if (multiplicateur === 0) return 'Aucun effet';
  if (multiplicateur >= 4) return 'Super efficace ×4';
  if (multiplicateur > 1) return 'Super efficace ×2';
  if (multiplicateur <= 0.25) return 'Très peu efficace ×¼';
  if (multiplicateur < 1) return 'Peu efficace ×½';
  return null;
}

/**
 * Classe d'affinité, pour colorer un chiffre de dégâts.
 *
 * Trois valeurs seulement : le joueur doit savoir en un coup d'oeil si son
 * tir porte, pas lire un coefficient.
 */
export function classeAffinite(multiplicateur: number): 'fort' | 'faible' | 'neutre' {
  if (multiplicateur > 1) return 'fort';
  if (multiplicateur < 1) return 'faible';
  return 'neutre';
}

/**
 * Ce qu'une espèce encaisse, vu depuis sa fiche.
 *
 * C'est l'inverse de `affinite` : on regarde tous les types attaquants et on
 * garde ceux qui font quelque chose de particulier à cette combinaison. Le
 * joueur compose son équipe en lisant ça, pas en calculant.
 */
export function analyseAffinites(cibles: readonly PokemonType[]): {
  faiblesses: PokemonType[];
  resistances: PokemonType[];
  immunites: PokemonType[];
} {
  const faiblesses: PokemonType[] = [];
  const resistances: PokemonType[] = [];
  const immunites: PokemonType[] = [];

  for (const attaque of Object.keys(TABLE) as PokemonType[]) {
    const facteur = affinite(attaque, cibles);
    if (facteur === 0) immunites.push(attaque);
    else if (facteur > 1) faiblesses.push(attaque);
    else if (facteur < 1) resistances.push(attaque);
  }

  return { faiblesses, resistances, immunites };
}
