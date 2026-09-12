/**
 * Chemin des ennemis.
 *
 * La route est fixe et les tours se posent à côté, jamais dessus : un A* serait
 * du calcul gâché. Les ennemis suivent une polyligne, avec un décalage latéral
 * propre à chacun pour qu'ils ne marchent pas en file indienne parfaite.
 *
 * Les appâts du dresseur détournent un ennemi de sa progression sans la perdre :
 * il reprend le chemin là où il l'avait laissé.
 */

import { Vector2 } from 'three';

export interface PathPoint {
  x: number;
  z: number;
}

export class EnemyPath {
  readonly points: readonly PathPoint[];
  /** Distance cumulée à l'entrée de chaque segment. */
  private readonly cumulative: number[] = [];
  readonly length: number;

  constructor(points: readonly PathPoint[]) {
    if (points.length < 2) throw new Error('Un chemin demande au moins deux points');
    this.points = points;
    let total = 0;
    this.cumulative.push(0);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      total += Math.hypot(b.x - a.x, b.z - a.z);
      this.cumulative.push(total);
    }
    this.length = total;
  }

  /** Position à une distance donnée depuis le départ, écrite dans `out`. */
  sample(distance: number, out: Vector2): Vector2 {
    const d = Math.max(0, Math.min(distance, this.length));
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i]! < d) i++;
    const start = this.cumulative[i - 1]!;
    const end = this.cumulative[i]!;
    const a = this.points[i - 1]!;
    const b = this.points[i]!;
    const t = end > start ? (d - start) / (end - start) : 0;
    return out.set(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
  }

  /** Direction normalisée du chemin à cette distance. */
  direction(distance: number, out: Vector2): Vector2 {
    const ahead = Math.min(distance + 0.5, this.length);
    const behind = Math.max(ahead - 1, 0);
    const p1 = this.sample(behind, new Vector2());
    this.sample(ahead, out);
    out.sub(p1);
    if (out.lengthSq() < 1e-6) out.set(0, 1);
    return out.normalize();
  }

  /** Distance d'un point au chemin — sert à interdire les poses sur la route. */
  distanceTo(x: number, z: number): number {
    let best = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lenSq = abx * abx + abz * abz;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz));
    }
    return best;
  }
}
