/**
 * Paliers de manche, achetés en Poképièces.
 *
 * C'est une économie **interne à la manche**, et c'est tout l'intérêt : les
 * pièces tombent des ennemis abattus, se dépensent sur les Pokémon déjà posés,
 * et disparaissent à la fin. Rien ne se reporte d'une manche à l'autre.
 *
 * Pourquoi séparer ça des cristaux : les cristaux sont de la progression
 * longue — on les met de côté, on les dépense au calme entre deux manches.
 * Les Poképièces sont une décision prise sous pression, pendant qu'une vague
 * arrive : monter un Pokémon maintenant, ou garder de quoi en monter un autre
 * plus tard. Mélanger les deux monnaies aurait fait de la manche une simple
 * boutique de plus.
 *
 * Monter un palier fait **évoluer** le Pokémon quand sa lignée le permet, et
 * le palier 3 débloque son ultime. La forme évoluée ne survit pas à la
 * manche : la fiche du Pokémon possédé n'est jamais touchée.
 */

import { getSpecies } from './content';
import type { Rarity, Species } from './types';

/** Un Pokémon posé démarre au palier 1 et peut monter jusque-là. */
export const PALIER_MAX = 3;

/**
 * Coût du passage au palier suivant, en Poképièces.
 *
 * Calibré sur le rendement d'une manche : à une pièce par K.O. et six par
 * vague tenue, les vagues d'ouverture financent un premier palier, et il faut
 * tenir la moitié du niveau pour en monter un au bout. Monter les six
 * Pokémon au palier 3 dans une seule manche est hors de portée — c'est
 * voulu, le choix de qui monter est la décision du mode.
 */
const COUTS: Record<number, number> = { 2: 16, 3: 40 };

/** Pièces rapportées par un ennemi abattu. */
export const PIECES_KO = 1;
/** Pièces rapportées par une vague entièrement contenue. */
export const PIECES_VAGUE = 6;
/** Pièces déjà en poche au lancement, pour ne pas commencer les mains vides. */
export const PIECES_DEPART = 8;

/** Coût du palier visé, ou null s'il n'y en a pas de suivant. */
export function coutPalier(palierCourant: number): number | null {
  if (palierCourant >= PALIER_MAX) return null;
  return COUTS[palierCourant + 1] ?? null;
}

/**
 * Gain de stats apporté par les paliers.
 *
 * Il s'ajoute à l'évolution au lieu de la remplacer : les trois espèces qui
 * n'ont qu'une seule évolution (Rattata, Zigzaton, Medhyèna) verraient sinon
 * leur dernier palier ne rien faire du tout côté puissance.
 */
export function multiplicateurPalier(palier: number): number {
  return 1 + 0.18 * (Math.max(1, Math.min(PALIER_MAX, palier)) - 1);
}

/**
 * Réduction de recharge de l'ultime selon la rareté.
 *
 * « Plus de cooldown que l'auto-attaque, et ça varie selon le Pokémon et sa
 * rareté » : la variation par Pokémon vient du type de son ultime et de son
 * style de frappe, celle-ci vient de la rareté. Un légendaire relance son
 * ultime presque deux fois plus souvent qu'un normal, à attaque identique.
 */
export const CADENCE_ULTIME: Record<Rarity, number> = {
  normal: 1,
  rare: 0.9,
  epique: 0.8,
  legendaire: 0.68,
  prismatique: 0.58,
};

/**
 * Espèce atteinte à un palier donné.
 *
 * Le palier 1 est la forme de base, et chaque palier suivant avance d'un
 * stade dans la lignée — tant qu'il y en a un.
 */
export function especeAuPalier(speciesId: string, palier: number): Species {
  let courante = getSpecies(speciesId);
  for (let rang = 1; rang < Math.max(1, palier); rang++) {
    if (!courante.evolution) break;
    courante = getSpecies(courante.evolution);
  }
  return courante;
}

/** Nom de la forme atteinte au palier suivant, ou null si la lignée s'arrête. */
export function prochaineForme(speciesId: string, palier: number): Species | null {
  if (palier >= PALIER_MAX) return null;
  const courante = especeAuPalier(speciesId, palier);
  return courante.evolution ? getSpecies(courante.evolution) : null;
}
