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
 * plus tard.
 *
 * Les paliers **ne font plus évoluer** : l'évolution est passée du côté de
 * l'expérience, où elle est définitive (voir data/evolution.ts). Une évolution
 * qui s'effaçait à la fin de la manche n'en était pas une. Il reste donc ici
 * ce qui doit rester temporaire — un gain de stats, et le déverrouillage de
 * l'ultime.
 */

import type { Rarity } from './types';

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
 * Plus généreux depuis que le palier ne fait plus évoluer : c'est désormais
 * tout ce qu'il rapporte côté puissance, avec l'ultime.
 */
export function multiplicateurPalier(palier: number): number {
  return 1 + 0.3 * (Math.max(1, Math.min(PALIER_MAX, palier)) - 1);
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
