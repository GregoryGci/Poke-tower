/**
 * Pierres d'évolution.
 *
 * Certaines lignées n'évoluent à aucun niveau : Évoli est l'exemple canonique,
 * et le seul Pokémon du jeu dont on **choisit** la forme finale. Son choix est
 * irréversible, ce qui est exactement ce qui lui donne du poids — mais ça ne
 * marche que si la pierre est rare. Une pierre qu'on obtient en jouant
 * normalement transformerait le choix en formalité.
 *
 * Elles ne tombent donc que dans un raid dédié, à taux faible : voir
 * data/raids.ts. C'est le premier contenu du jeu qui a une raison d'exister
 * en dehors de la campagne.
 */

import { getSpecies, evolutionsParPierre } from './content';
import { evoluerSiPossible } from './evolution';
import type { OwnedPokemon, PlayerAccount, Rarity, Species } from './types';

export interface ModelePierre {
  id: string;
  name: string;
  rarity: Rarity;
  /** Glyphe affiché dans l'inventaire, faute de sprite dédié. */
  glyphe: string;
}

export const PIERRES: ModelePierre[] = [
  { id: 'pierre-eau', name: 'Pierre Eau', rarity: 'epique', glyphe: '💧' },
  { id: 'pierre-foudre', name: 'Pierre Foudre', rarity: 'epique', glyphe: '⚡' },
  { id: 'pierre-feu', name: 'Pierre Feu', rarity: 'epique', glyphe: '🔥' },
];

export function getPierre(id: string): ModelePierre | null {
  return PIERRES.find((pierre) => pierre.id === id) ?? null;
}

/** Quantité d'une pierre en stock. */
export function stockPierre(compte: PlayerAccount, id: string): number {
  return compte.inventory.find((item) => item.id === id)?.quantity ?? 0;
}

/** Ajoute des pierres à l'inventaire, en fusionnant avec la pile existante. */
export function ajouterPierres(compte: PlayerAccount, id: string, quantite: number): void {
  const modele = getPierre(id);
  if (!modele || quantite <= 0) return;
  const item = compte.inventory.find((candidat) => candidat.id === id);
  if (item) {
    item.quantity += quantite;
    return;
  }
  compte.inventory.push({ id, name: modele.name, rarity: modele.rarity, quantity: quantite });
}

/** Toutes les pierres en stock, avec leur modèle. */
export function pierresDisponibles(
  compte: PlayerAccount
): Array<{ modele: ModelePierre; quantite: number }> {
  return PIERRES.map((modele) => ({ modele, quantite: stockPierre(compte, modele.id) })).filter(
    (entree) => entree.quantite > 0
  );
}

/**
 * Ce qu'une pierre ferait à ce Pokémon.
 *
 * Renvoie la forme atteinte, ou null si la pierre ne lui sert à rien. Sert à
 * n'afficher que les pierres utiles sur une fiche : proposer une Pierre Eau
 * sur un Machoc ne ferait que du bruit.
 */
export function formeApresPierre(owned: OwnedPokemon, pierreId: string): Species | null {
  const espece = getSpecies(owned.speciesId);
  const voie = evolutionsParPierre(espece).find((evolution) => evolution.pierre === pierreId);
  return voie ? getSpecies(voie.into) : null;
}

/** Les pierres que ce Pokémon peut réellement employer, stock compris. */
export function pierresUtiles(
  compte: PlayerAccount,
  owned: OwnedPokemon
): Array<{ modele: ModelePierre; quantite: number; forme: Species }> {
  const out: Array<{ modele: ModelePierre; quantite: number; forme: Species }> = [];
  for (const evolution of evolutionsParPierre(getSpecies(owned.speciesId))) {
    const modele = getPierre(evolution.pierre);
    if (!modele) continue;
    out.push({
      modele,
      quantite: stockPierre(compte, modele.id),
      forme: getSpecies(evolution.into),
    });
  }
  return out;
}

export interface UsagePierre {
  ok: boolean;
  forme: Species | null;
  /** Évolutions par niveau déclenchées dans la foulée, s'il y en a. */
  suite: Species[];
}

/**
 * Emploie une pierre sur un Pokémon.
 *
 * Atomique, comme toutes les dépenses : soit la pierre part et la forme
 * change, soit rien ne bouge. Une évolution par niveau peut suivre
 * immédiatement — la nouvelle forme a son propre palier, et le Pokémon a
 * peut-être déjà le niveau qu'il faut.
 */
export function employerPierre(
  compte: PlayerAccount,
  owned: OwnedPokemon,
  pierreId: string
): UsagePierre {
  const forme = formeApresPierre(owned, pierreId);
  const item = compte.inventory.find((candidat) => candidat.id === pierreId);
  if (!forme || !item || item.quantity < 1) return { ok: false, forme: null, suite: [] };

  item.quantity -= 1;
  if (item.quantity <= 0) {
    compte.inventory = compte.inventory.filter((candidat) => candidat !== item);
  }

  owned.speciesId = forme.id;
  return { ok: true, forme, suite: evoluerSiPossible(owned) };
}
