/**
 * Règles de pose.
 *
 * Le brief demande une liberté totale de placement, sauf sur la route. On ne
 * pose donc pas sur une grille : on valide une position continue, ce qui rend
 * le placement beaucoup plus souple qu'un système de cases — au prix d'un test
 * de chevauchement entre unités.
 */

import type { EnemyPath } from '@/world/path';
import type { Tower } from '@/entities/tower';

export interface PlacementRules {
  /** Demi-côté du terrain jouable. */
  bounds: number;
  /** Distance minimale au centre de la route. */
  pathClearance: number;
  /** Distance minimale entre deux Pokémon posés. */
  spacing: number;
}

export type PlacementRejection = 'hors_terrain' | 'sur_la_route' | 'trop_proche';

export type PlacementCheck =
  | { ok: true }
  | { ok: false; reason: PlacementRejection };

export function canPlace(
  x: number,
  z: number,
  path: EnemyPath,
  towers: readonly Tower[],
  rules: PlacementRules
): PlacementCheck {
  if (Math.abs(x) > rules.bounds || Math.abs(z) > rules.bounds) {
    return { ok: false, reason: 'hors_terrain' };
  }
  if (path.distanceTo(x, z) < rules.pathClearance) {
    return { ok: false, reason: 'sur_la_route' };
  }
  for (const tower of towers) {
    const dx = tower.x - x;
    const dz = tower.z - z;
    if (dx * dx + dz * dz < rules.spacing * rules.spacing) {
      return { ok: false, reason: 'trop_proche' };
    }
  }
  return { ok: true };
}

export const REJECTION_LABELS: Record<PlacementRejection, string> = {
  hors_terrain: 'En dehors du terrain',
  sur_la_route: 'Trop près de la route',
  trop_proche: 'Trop près d’un autre Pokémon',
};
