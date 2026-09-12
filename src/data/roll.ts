/**
 * Tirages aléatoires : attaques, traits, sub-stats.
 *
 * Isolé du reste pour que le gacha de la phase 3 réutilise exactement les
 * mêmes règles que le starter offert au début.
 */

import { getMove, getSpecies, TRAITS } from './content';
import {
  STAT_TYPES,
  type Move,
  type OwnedPokemon,
  type Rarity,
  type SubStat,
  type Trait,
} from './types';

/** Quatre attaques distinctes tant que le movepool le permet. */
export function rollMoves(speciesId: string, rng: () => number): [Move, Move, Move, Move] {
  const pool = [...getSpecies(speciesId).movepool];
  const chosen: Move[] = [];
  while (chosen.length < 4) {
    if (pool.length === 0) {
      // Movepool plus court que 4 : on complète en répétant, plutôt que de
      // planter. Les vraies espèces en auront assez.
      chosen.push(chosen[chosen.length - 1] ?? getMove('charge'));
      continue;
    }
    const index = Math.floor(rng() * pool.length);
    chosen.push(getMove(pool.splice(index, 1)[0]!));
  }
  return [chosen[0]!, chosen[1]!, chosen[2]!, chosen[3]!];
}

export function rollTraits(rng: () => number): [Trait, Trait] {
  const pool = [...TRAITS];
  const first = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
  const second = pool[Math.floor(rng() * pool.length)]!;
  return [first, second];
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
    moves: rollMoves(speciesId, rng),
    traits: rollTraits(rng),
    subStats: rollSubStats(rng),
  };
}
