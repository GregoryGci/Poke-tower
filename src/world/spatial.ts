/**
 * Grille de hachage spatial.
 *
 * À chaque tick, chaque tour doit trouver sa cible. En parcourant tous les
 * ennemis, 20 tours contre 150 ennemis font 3 000 tests de distance par tick.
 * En rangeant les ennemis dans des cases, on ne teste que les cases couvertes
 * par la portée — une poignée d'unités au lieu de la vague entière.
 */

export interface SpatialItem {
  x: number;
  z: number;
}

export class SpatialGrid<T extends SpatialItem> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize = 4) {}

  private key(cx: number, cz: number): number {
    // Deux entiers signés empaquetés dans un seul nombre : évite de créer
    // une chaîne de caractères par requête.
    return ((cx + 512) << 10) | (cz + 512);
  }

  clear(): void {
    for (const list of this.cells.values()) list.length = 0;
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cz = Math.floor(item.z / this.cellSize);
    const key = this.key(cx, cz);
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push(item);
  }

  /** Appelle `fn` sur les candidats proches. Le test de distance exact reste à faire. */
  queryRadius(x: number, z: number, radius: number, fn: (item: T) => void): void {
    const min = Math.floor((x - radius) / this.cellSize);
    const max = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = min; cx <= max; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const item of list) fn(item);
      }
    }
  }

  /** Le plus proche dans le rayon, ou null. */
  nearest(x: number, z: number, radius: number, accept?: (item: T) => boolean): T | null {
    let best: T | null = null;
    let bestDist = radius * radius;
    this.queryRadius(x, z, radius, (item) => {
      if (accept && !accept(item)) return;
      const dx = item.x - x;
      const dz = item.z - z;
      const dist = dx * dx + dz * dz;
      if (dist <= bestDist) {
        bestDist = dist;
        best = item;
      }
    });
    return best;
  }
}
