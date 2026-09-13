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

import { RARITIES } from './types';
import { especesDeRarete, ESPECES_LEGENDAIRES, ESPECES_OBTENABLES, rareteDe } from './content';
import { createPokemon } from './roll';
import { armePourRarete } from './weapons';
import { initialiserArme } from './weapon-upgrade';
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

/**
 * Espèces qu'une invocation peut donner.
 *
 * Les stades évolués en sont absents : ils s'obtiennent en montant un palier
 * en manche, jamais au portail.
 */
export function especesInvocables(): string[] {
  return [...ESPECES_OBTENABLES];
}

/**
 * Rareté effectivement tirable.
 *
 * La rareté appartient désormais à l'espèce, et tous les paliers ne sont pas
 * peuplés — le prismatique est réservé aux vrais légendaires, dont aucun
 * modèle n'est converti. Un tirage prismatique redescend donc d'un cran
 * jusqu'à trouver un palier habité, au lieu de renvoyer un lot vide.
 */
function rareteServie(rng: () => number): Rarity {
  const voulue = tirerRarete(rng);
  const depart = RARITIES.indexOf(voulue);
  for (let i = depart; i >= 0; i--) {
    const candidate = RARITIES[i];
    if (candidate && especesDeRarete(candidate).length > 0) return candidate;
  }
  // Aucun palier peuplé : le catalogue est cassé, mieux vaut le dire.
  throw new Error('Aucune espèce invocable');
}

/**
 * Un tirage.
 *
 * Deux temps, et l'ordre compte : la rareté d'abord, l'espèce ensuite parmi
 * celles de cette rareté. Tirer l'espèce en premier rendrait les taux
 * dépendants du nombre d'espèces par palier — six starters légendaires
 * feraient alors sortir du légendaire quatre fois sur dix.
 */
export function invoquer(rng: () => number = Math.random): OwnedPokemon {
  const rarete = rareteServie(rng);
  const pool = especesDeRarete(rarete);
  const speciesId = pool[Math.floor(rng() * pool.length)];
  if (!speciesId) throw new Error('Aucune espèce invocable');
  return createPokemon(speciesId, rng);
}

/**
 * Coût d'une invocation légendaire, en Master Balls.
 *
 * Une seule, et c'est le point : la rareté est déjà dans la difficulté
 * d'obtenir la Ball, pas dans le prix affiché. Demander trois Balls par
 * tirage aurait simplement triplé l'attente sans rien ajouter à la décision.
 */
export const COUT_BALL = 1;

/**
 * Un tirage au portail des légendaires.
 *
 * Pas de table de raretés ici : toutes les espèces du portail sont
 * prismatiques, le hasard ne porte donc que sur **laquelle**. C'est
 * volontaire — on ne doit jamais repartir déçu d'une Master Ball.
 */
export function invoquerLegendaire(rng: () => number = Math.random): OwnedPokemon {
  const pool = ESPECES_LEGENDAIRES;
  const speciesId = pool[Math.floor(rng() * pool.length)];
  if (!speciesId) throw new Error('Aucun légendaire au catalogue');
  return createPokemon(speciesId, rng);
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

  if (lot.every((membre) => rareteDe(membre) === 'normal')) {
    // On remplace par une espèce rare tirée au hasard : promouvoir
    // l'exemplaire lui-même est devenu impossible, sa rareté étant celle de
    // son espèce.
    const rares = especesDeRarete('rare');
    const remplacant = rares[Math.floor(rng() * rares.length)];
    if (remplacant) lot[lot.length - 1] = createPokemon(remplacant, rng);
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
  return armeNeuve(modele.id, modele.rarity, rng);
}

/** Une arme prête à être portée : palier zéro, innée et sub-stats tirées. */
export function armeNeuve(
  weaponId: string,
  rarity: Rarity,
  rng: () => number = Math.random
): OwnedWeapon {
  return initialiserArme(
    { id: crypto.randomUUID(), weaponId, rarity, favori: false, niveau: 0, innee: null, subStats: [] },
    rng
  );
}

export function invoquerArmesMultiple(rng: () => number = Math.random): OwnedWeapon[] {
  const lot: OwnedWeapon[] = [];
  for (let i = 0; i < TIRAGE_MULTIPLE; i++) lot.push(invoquerArme(rng));
  if (lot.every((arme) => arme.rarity === 'normal')) {
    const modele = armePourRarete('rare', rng);
    lot[lot.length - 1] = armeNeuve(modele.id, modele.rarity, rng);
  }
  return lot;
}
