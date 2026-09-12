/**
 * Tirages aléatoires : attaques, traits, sub-stats.
 *
 * Isolé du reste pour que le gacha de la phase 3 réutilise exactement les
 * mêmes règles que le starter offert au début.
 *
 * Un Pokémon porte deux attaques et non quatre : son auto-attaque, tirée de
 * son movepool, et son ultime, tiré parmi les grosses attaques de son ou ses
 * types. Chacune se relance séparément — il n'y a plus de « tirage complet »,
 * qui n'avait de sens qu'avec quatre cases interchangeables.
 */

import {
  AUTO_IDS,
  ULTIME_UNIVERSEL,
  getMove,
  getSpecies,
  MOVES,
  TRAITS,
  rareteDe,
} from './content';
import { rollPotentiel } from './stats';
import {
  STAT_TYPES,
  type Move,
  type OwnedPokemon,
  type SubStat,
  type Trait,
} from './types';

/**
 * Auto-attaques que l'espèce peut recevoir, par rangs de légitimité.
 *
 * Trois rangs, et l'ordre est strict : on ne descend au suivant que si le
 * précédent est vide une fois les exclusions faites.
 *
 *  1. le movepool — ce que l'espèce apprend réellement ;
 *  2. les attaques de son ou ses types ;
 *  3. le reste du catalogue.
 *
 * Le second et le troisième rang existent parce que plusieurs espèces n'ont
 * que deux attaques au movepool : sans eux, relancer l'attaque d'un Aspicot
 * rendrait toujours la même. Mais ce sont des **filets**, pas des candidats
 * ordinaires — les mettre dans le même sac que le movepool faisait sortir
 * Flammèche sur un Bulbizarre une fois sur quinze, ce qui ne ressemble à
 * rien.
 */
function rangsAutos(speciesId: string): string[][] {
  const species = getSpecies(speciesId);
  const types = new Set<string>(species.types);
  const autres = AUTO_IDS.filter((id) => !species.movepool.includes(id));

  return [
    [...species.movepool],
    autres.filter((id) => types.has(MOVES[id]!.type)),
    autres.filter((id) => !types.has(MOVES[id]!.type)),
  ];
}

/**
 * Ultimes que l'espèce peut recevoir.
 *
 * Restreint à ses types, plus l'ultime universel : Salamèche ne peut pas
 * hériter d'Hydrocanon, et il n'y a jamais plus de trois candidats. L'ultime
 * se lit donc comme un choix entre deux ou trois options connues, pas comme
 * une loterie.
 */
export function candidatsUltimes(speciesId: string): string[] {
  const types = new Set<string>(getSpecies(speciesId).types);
  const parType = Object.values(MOVES)
    .filter((move) => move.sorte === 'ultime' && types.has(move.type))
    .map((move) => move.id);
  return parType.includes(ULTIME_UNIVERSEL) ? parType : [...parType, ULTIME_UNIVERSEL];
}

function tirerParmi(candidats: readonly string[], exclure: readonly string[], rng: () => number): string | null {
  const pris = new Set(exclure);
  const libres = candidats.filter((id) => !pris.has(id));
  const pool = libres.length ? libres : candidats;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

/**
 * Tire une auto-attaque, en évitant celle déjà portée.
 *
 * Le premier rang qui a encore quelque chose à offrir gagne : une espèce au
 * movepool fourni ne verra donc jamais d'attaque hors movepool, et une espèce
 * à deux attaques descend d'un rang plutôt que de rendre la même.
 */
export function rollAuto(speciesId: string, exclure: readonly string[], rng: () => number): Move {
  const pris = new Set(exclure);
  for (const rang of rangsAutos(speciesId)) {
    const libres = rang.filter((id) => !pris.has(id));
    if (!libres.length) continue;
    return getMove(libres[Math.floor(rng() * libres.length)]!);
  }
  // Le catalogue entier est exclu : impossible avec une seule attaque portée,
  // mais mieux vaut une attaque de plus qu'une exception.
  return getMove('charge');
}

/** Tire un ultime, en évitant celui déjà porté. */
export function rollUltime(speciesId: string, exclure: readonly string[], rng: () => number): Move {
  const choisi = tirerParmi(candidatsUltimes(speciesId), exclure, rng);
  return getMove(choisi ?? ULTIME_UNIVERSEL);
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

/**
 * Crée un exemplaire.
 *
 * La rareté n'est plus un paramètre : elle appartient à l'espèce. Le hasard
 * porte sur le potentiel, les attaques, les traits et les sub-stats — de quoi
 * distinguer deux Aspicot sans faire croire que l'un est légendaire.
 */
export function createPokemon(speciesId: string, rng: () => number = Math.random): OwnedPokemon {
  return {
    id: crypto.randomUUID(),
    speciesId,
    level: 1,
    xp: 0,
    stars: 1,
    shiny: false,
    potentiel: rollPotentiel(rareteDe({ speciesId }), rng),
    favori: false,
    auto: rollAuto(speciesId, [], rng),
    ultime: rollUltime(speciesId, [], rng),
    traits: rollTraits(rng),
    subStats: rollSubStats(rng),
  };
}
