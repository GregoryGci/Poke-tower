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
import { armePourRarete } from './weapons';
import type { OwnedPokemon, OwnedWeapon, Rarity } from './types';

/** Coût d'une invocation, en cristaux. */
export const COUT_INVOCATION = 10;

/** Taux par rareté. La somme doit valoir 1. */
export const TAUX: Record<Rarity, number> = {
  normal: 0.4,
  rare: 0.3,
  epique: 0.2,
  legendaire: 0.08,
  prismatique: 0.02,
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

/** Nombre de tirages d'un tirage multiple. */
export const TIRAGE_MULTIPLE = 10;

/** Cout d'un tirage multiple. Dix tirages payes dix : pas de remise. */
export const COUT_MULTIPLE = COUT_INVOCATION * TIRAGE_MULTIPLE;

/**
 * Tirage multiple.
 *
 * Avec les taux actuels, un x10 entierement normal arrive une fois sur six —
 * assez souvent pour gacher la sequence de revelation, qui est le seul
 * interet du x10. On garantit donc un rare au minimum, en promouvant le
 * dernier tirage si rien n'est sorti.
 */
export function invoquerMultiple(rng: () => number = Math.random): OwnedPokemon[] {
  const lot: OwnedPokemon[] = [];
  for (let i = 0; i < TIRAGE_MULTIPLE; i++) lot.push(invoquer(rng));

  if (lot.every((membre) => membre.rarity === 'normal')) {
    const dernier = lot[lot.length - 1];
    if (dernier) lot[lot.length - 1] = createPokemon(dernier.speciesId, 'rare', rng);
  }
  return lot;
}

/**
 * Portail d'armes.
 *
 * Meme table de raretes que les Pokemon : le joueur a deja appris a lire ces
 * chiffres, en inventer d'autres ne ferait qu'ajouter a verifier.
 */
export function invoquerArme(rng: () => number = Math.random): OwnedWeapon {
  const modele = armePourRarete(tirerRarete(rng), rng);
  return { id: crypto.randomUUID(), weaponId: modele.id, rarity: modele.rarity };
}

export function invoquerArmesMultiple(rng: () => number = Math.random): OwnedWeapon[] {
  const lot: OwnedWeapon[] = [];
  for (let i = 0; i < TIRAGE_MULTIPLE; i++) lot.push(invoquerArme(rng));
  if (lot.every((arme) => arme.rarity === 'normal')) {
    const modele = armePourRarete('rare', rng);
    lot[lot.length - 1] = { id: crypto.randomUUID(), weaponId: modele.id, rarity: modele.rarity };
  }
  return lot;
}
