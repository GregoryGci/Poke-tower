/**
 * Tirages aléatoires : attaques, traits, sub-stats.
 *
 * Isolé du reste pour que le gacha de la phase 3 réutilise exactement les
 * mêmes règles que le starter offert au début.
 */

import { getMove, getSpecies, MOVES, TRAITS } from './content';
import { rollPotentiel } from './stats';
import {
  STAT_TYPES,
  type Move,
  type OwnedPokemon,
  type Rarity,
  type SubStat,
  type Trait,
} from './types';

/**
 * Attaques que l'espece peut recevoir, par ordre de legitimite.
 *
 * Sept des quinze especes ont un movepool plus court que quatre : le tirage
 * completait alors en **repetant la derniere attaque**, ce qui donnait des
 * doublons sur la moitie du Pokedex. On elargit donc plutot que de repeter —
 * d'abord le movepool, puis les attaques du ou des types de l'espece, et en
 * dernier recours n'importe quelle attaque.
 */
function candidatsAttaques(speciesId: string): string[] {
  const species = getSpecies(speciesId);
  const types = new Set<string>(species.types);

  const parType = Object.values(MOVES)
    .filter((move) => types.has(move.type) && !species.movepool.includes(move.id))
    .map((move) => move.id);

  const reste = Object.values(MOVES)
    .filter((move) => !types.has(move.type) && !species.movepool.includes(move.id))
    .map((move) => move.id);

  return [...species.movepool, ...parType, ...reste];
}

/**
 * Tire une attaque de plus, jamais deja presente.
 *
 * Sert au tirage complet comme au reroll d'une seule case : c'est la meme
 * regle, donc le meme code.
 */
export function rollMove(
  speciesId: string,
  exclure: readonly string[],
  rng: () => number
): Move {
  const pris = new Set(exclure);
  const candidats = candidatsAttaques(speciesId).filter((id) => !pris.has(id));
  // Seize attaques au catalogue et quatre cases : ce repli ne peut pas etre
  // atteint, mais il vaut mieux une attaque de plus qu'une exception.
  if (!candidats.length) return getMove('charge');
  return getMove(candidats[Math.floor(rng() * candidats.length)]!);
}

/** Quatre attaques, toujours distinctes. */
export function rollMoves(speciesId: string, rng: () => number): [Move, Move, Move, Move] {
  const chosen: Move[] = [];
  for (let i = 0; i < 4; i++) {
    chosen.push(rollMove(speciesId, chosen.map((move) => move.id), rng));
  }
  return [chosen[0]!, chosen[1]!, chosen[2]!, chosen[3]!];
}

/** Tire un trait, jamais deja present. */
export function rollTrait(exclure: readonly string[], rng: () => number): Trait {
  const pris = new Set(exclure);
  const candidats = TRAITS.filter((trait) => !pris.has(trait.id));
  const pool = candidats.length ? candidats : TRAITS;
  return pool[Math.floor(rng() * pool.length)]!;
}

export function rollTraits(rng: () => number): [Trait, Trait] {
  const premier = rollTrait([], rng);
  return [premier, rollTrait([premier.id], rng)];
}

export function rollSubStats(rng: () => number): [SubStat, SubStat, SubStat, SubStat] {
  const pool = [...STAT_TYPES];
  const out: SubStat[] = [];
  for (let i = 0; i < 4; i++) {
    const statType = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    out.push({ statType, stack: 0 });
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

export function createPokemon(
  speciesId: string,
  rarity: Rarity,
  rng: () => number = Math.random
): OwnedPokemon {
  return {
    id: crypto.randomUUID(),
    speciesId,
    rarity,
    level: 1,
    xp: 0,
    stars: 1,
    shiny: false,
    potentiel: rollPotentiel(rarity, rng),
    favori: false,
    moves: rollMoves(speciesId, rng),
    traits: rollTraits(rng),
    subStats: rollSubStats(rng),
  };
}
