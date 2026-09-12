/**
 * Terrain et tracé de la route.
 *
 * Tout est construit une fois au chargement du niveau : le sol, la route et
 * la grille de repères ne bougent jamais, donc rien ici n'entre dans la boucle.
 */

import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from 'three';
import type { EnemyPath } from './path';

export interface TerrainOptions {
  size: number;
  pathWidth: number;
}

/** Construit un ruban centré sur la polyligne, posé juste au-dessus du sol. */
function buildPathRibbon(path: EnemyPath, width: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const steps = Math.max(2, Math.ceil(path.length * 2));
  const point = new Vector2();
  const dir = new Vector2();

  for (let i = 0; i <= steps; i++) {
    const distance = (i / steps) * path.length;
    path.sample(distance, point);
    path.direction(distance, dir);
    // Normale dans le plan du sol.
    const nx = -dir.y;
    const nz = dir.x;
    const half = width / 2;
    positions.push(point.x + nx * half, 0, point.y + nz * half);
    positions.push(point.x - nx * half, 0, point.y - nz * half);
    const v = distance / 2;
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export interface Terrain {
  group: Group;
  /** Plan du sol, cible du raycast pour savoir où pointe la souris. */
  groundMesh: Mesh;
  dispose(): void;
}

export function createTerrain(path: EnemyPath, options: TerrainOptions): Terrain {
  const group = new Group();

  const groundGeometry = new PlaneGeometry(options.size, options.size);
  const groundMaterial = new MeshStandardMaterial({ color: '#dfe6dd', roughness: 0.95, metalness: 0 });
  const groundMesh = new Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const ribbon = new Mesh(
    buildPathRibbon(path, options.pathWidth),
    new MeshStandardMaterial({ color: '#c9b899', roughness: 1, metalness: 0 })
  );
  ribbon.position.y = 0.01;
  ribbon.receiveShadow = true;
  group.add(ribbon);

  // Repères visuels de départ et d'arrivée.
  const marker = (color: string, at: Vector2): Mesh => {
    const mesh = new Mesh(
      new CircleGeometry(options.pathWidth * 0.55, 24),
      new MeshStandardMaterial({ color, roughness: 0.8 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.02, at.y);
    return mesh;
  };
  group.add(marker('#7fb069', path.sample(0, new Vector2())));
  group.add(marker('#d16666', path.sample(path.length, new Vector2())));

  return {
    group,
    groundMesh,
    dispose(): void {
      group.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}
