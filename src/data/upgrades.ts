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
import {
  ETOILES_MAX,
  ETOILES_MAX_FUSION,
  SUBSTAT_MAX_STACK,
  doublonsRequis,
  type OwnedPokemon,
  type PlayerAccount,
} from './types';

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
  | { ok: false; raison: 'cristaux' | 'maximum' | 'doublons' | 'ressource' };

/** Ressource de raid qui ouvre la sixieme etoile. */
export const ITEM_ETOILE_6 = 'fragment-stellaire';

/**
 * Doublons disponibles pour une fusion.
 *
 * Meme espece, jamais le sujet lui-meme, et on sacrifie d'abord les moins
 * etoiles : consommer un 3 etoiles pour en monter un autre serait une perte
 * seche que le joueur ne verrait pas venir.
 */
export function doublonsDisponibles(compte: PlayerAccount, owned: OwnedPokemon): OwnedPokemon[] {
  return compte.roster
    .filter((autre) => autre.id !== owned.id && autre.speciesId === owned.speciesId)
    .sort((a, b) => a.stars - b.stars || a.level - b.level);
}

/**
 * Monte une etoile en sacrifiant des doublons.
 *
 * La sixieme ne s'obtient pas ainsi : elle demande la ressource rapportee des
 * raids, et rend le Pokemon brillant.
 */
export function fusionner(compte: PlayerAccount, owned: OwnedPokemon): Depense {
  if (owned.stars >= ETOILES_MAX) return { ok: false, raison: 'maximum' };

  if (owned.stars >= ETOILES_MAX_FUSION) {
    const fragment = compte.inventory.find((item) => item.id === ITEM_ETOILE_6);
    if (!fragment || fragment.quantity < 1) return { ok: false, raison: 'ressource' };
    fragment.quantity -= 1;
    owned.stars += 1;
    owned.shiny = true;
    return { ok: true };
  }

  const requis = doublonsRequis(owned.stars);
  if (requis === null) return { ok: false, raison: 'maximum' };

  const disponibles = doublonsDisponibles(compte, owned);
  if (disponibles.length < requis) return { ok: false, raison: 'doublons' };

  const sacrifies = new Set(disponibles.slice(0, requis).map((membre) => membre.id));
  compte.roster = compte.roster.filter((membre) => !sacrifies.has(membre.id));
  owned.stars += 1;
  return { ok: true };
}

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
