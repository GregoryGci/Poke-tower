/**
 * Invocation.
 *
 * Les taux vivent ici, isolés de l'interface : c'est le seul endroit à
 * relire pour ajuster l'économie du jeu, et le seul à tester.
 *
 * Le tirage se fait en deux temps — d'abord la rareté, ensuite l'espèce.
 * Sans cette séparation, une rareté deviendrait mécaniquement plus probable
 * à mesure qu'on ajoute des espèces au Pokédex.
 */

import { SPECIES } from './content';
import { createPokemon } from './roll';
import type { OwnedPokemon, Rarity } from './types';

/** Coût d'une invocation, en cristaux. */
export const COUT_INVOCATION = 10;

/** Taux par rareté. La somme doit valoir 1. */
export const TAUX: Record<Rarity, number> = {
  normal: 0.6,
  rare: 0.25,
  epique: 0.11,
  legendaire: 0.035,
  prismatique: 0.005,
};

export const LIBELLE_RARETE: Record<Rarity, string> = {
  normal: 'Normal',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
  prismatique: 'Prismatique',
};

/** Vérifie que la table reste cohérente — appelée par les tests. */
export function sommeDesTaux(): number {
  return Object.values(TAUX).reduce((total, taux) => total + taux, 0);
}

export function tirerRarete(rng: () => number = Math.random): Rarity {
  let seuil = rng();
  for (const [rarete, taux] of Object.entries(TAUX) as Array<[Rarity, number]>) {
    seuil -= taux;
    if (seuil <= 0) return rarete;
  }
  // Les arrondis flottants peuvent laisser un résidu : on retombe sur le
  // palier le plus commun plutôt que de renvoyer undefined.
  return 'normal';
}

/** Espèces qu'une invocation peut donner. */
export function especesInvocables(): string[] {
  return Object.keys(SPECIES);
}

export function invoquer(rng: () => number = Math.random): OwnedPokemon {
  const pool = especesInvocables();
  const speciesId = pool[Math.floor(rng() * pool.length)];
  if (!speciesId) throw new Error('Aucune espèce invocable');
  return createPokemon(speciesId, tirerRarete(rng), rng);
}
