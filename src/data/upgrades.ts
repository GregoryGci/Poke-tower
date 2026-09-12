/**
 * Dépenses de cristaux.
 *
 * Les coûts vivent ici avec les règles qui les appliquent : l'interface se
 * contente d'appeler et d'afficher le résultat, elle ne décide jamais si une
 * dépense est permise.
 *
 * Toutes les opérations sont atomiques — soit le compte est débité et l'effet
 * appliqué, soit rien ne bouge.
 */

import { rollMoves, rollTraits } from './roll';
import { SUBSTAT_MAX_STACK, type OwnedPokemon, type PlayerAccount } from './types';

export const COUT_REROLL_ATTAQUES = 5;
export const COUT_REROLL_TRAITS = 8;
/** Monter une sub-stat coûte de plus en plus cher à mesure qu'elle grimpe. */
export const COUT_SUBSTAT_BASE = 3;

/** Coût du prochain palier d'une sub-stat, ou null si elle est au maximum. */
export function coutProchainPalier(stack: number): number | null {
  if (stack >= SUBSTAT_MAX_STACK) return null;
  return COUT_SUBSTAT_BASE + Math.floor(stack / 3);
}

export type Depense =
  | { ok: true }
  | { ok: false; raison: 'cristaux' | 'maximum' };

function debiter(compte: PlayerAccount, cout: number): boolean {
  if (compte.crystals < cout) return false;
  compte.crystals -= cout;
  return true;
}

export function rerollAttaques(compte: PlayerAccount, owned: OwnedPokemon): Depense {
  if (!debiter(compte, COUT_REROLL_ATTAQUES)) return { ok: false, raison: 'cristaux' };
  owned.moves = rollMoves(owned.speciesId, Math.random);
  return { ok: true };
}

export function rerollTraits(compte: PlayerAccount, owned: OwnedPokemon): Depense {
  if (!debiter(compte, COUT_REROLL_TRAITS)) return { ok: false, raison: 'cristaux' };
  owned.traits = rollTraits(Math.random);
  return { ok: true };
}

export function monterSubStat(
  compte: PlayerAccount,
  owned: OwnedPokemon,
  index: number
): Depense {
  const sub = owned.subStats[index];
  if (!sub) return { ok: false, raison: 'maximum' };

  const cout = coutProchainPalier(sub.stack);
  if (cout === null) return { ok: false, raison: 'maximum' };
  if (!debiter(compte, cout)) return { ok: false, raison: 'cristaux' };

  sub.stack += 1;
  return { ok: true };
}
