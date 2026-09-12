/**
 * Équipe emmenée en manche.
 *
 * Six emplacements, parce que six est déjà le nombre de Pokémon posables sur
 * le terrain : une équipe plus large n'ouvrirait aucun choix supplémentaire,
 * elle repousserait seulement le choix au milieu de la manche.
 *
 * L'équipe est stockée comme une liste d'identifiants et non d'objets : c'est
 * le roster qui fait foi, et un identifiant orphelin — un Pokémon fusionné,
 * par exemple — se nettoie tout seul à la lecture.
 */

import type { OwnedPokemon, PlayerAccount } from './types';

/** Nombre d'emplacements. Aligné sur la limite de poses du terrain. */
export const EQUIPE_MAX = 6;

/** Les membres réellement présents dans le roster, dans l'ordre choisi. */
export function membresEquipe(compte: PlayerAccount): OwnedPokemon[] {
  const membres: OwnedPokemon[] = [];
  for (const id of compte.team) {
    const owned = compte.roster.find((membre) => membre.id === id);
    if (owned) membres.push(owned);
  }
  return membres.slice(0, EQUIPE_MAX);
}

export function dansEquipe(compte: PlayerAccount, owned: OwnedPokemon): boolean {
  return compte.team.includes(owned.id);
}

/**
 * Ajoute ou retire un Pokémon de l'équipe.
 *
 * Renvoie `false` quand rien n'a bougé — équipe pleine, ou dernier membre
 * qu'on essaie de retirer. Partir en manche sans personne serait une défaite
 * garantie, donc on refuse plutôt que de laisser faire.
 */
export function basculerEquipe(compte: PlayerAccount, owned: OwnedPokemon): boolean {
  const index = compte.team.indexOf(owned.id);

  if (index >= 0) {
    if (compte.team.length <= 1) return false;
    compte.team.splice(index, 1);
    return true;
  }

  if (compte.team.length >= EQUIPE_MAX) return false;
  compte.team.push(owned.id);
  return true;
}

/**
 * Remet l'équipe d'aplomb.
 *
 * Appelée avant de partir en manche : elle écarte les identifiants qui ne
 * correspondent plus à rien et garantit qu'au moins un Pokémon part au
 * combat, même si la sauvegarde est arrivée bancale.
 */
export function normaliserEquipe(compte: PlayerAccount): void {
  const connus = new Set(compte.roster.map((membre) => membre.id));
  compte.team = compte.team.filter((id) => connus.has(id)).slice(0, EQUIPE_MAX);

  if (compte.team.length === 0) {
    compte.team = compte.roster.slice(0, EQUIPE_MAX).map((membre) => membre.id);
  }
}
