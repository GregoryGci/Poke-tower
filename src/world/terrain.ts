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

/**
 * Trace la route.
 *
 * Un ruban continu paraît naturel, mais il se replie sur lui-même dès qu'un
 * virage est serré : aux angles droits, les deux bords se croisent et les
 * triangles se retournent, ce qui produit de grandes écharpes sombres à même
 * le sol. On pose donc un quad par segment, plus un disque à chaque jonction
 * pour arrondir l'angle. Aucun triangle ne peut alors s'inverser.
 */
function buildPathSurface(path: EnemyPath, width: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;

  const pushQuad = (ax: number, az: number, bx: number, bz: number): void => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    // Normale dans le plan du sol, propre à ce segment.
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const base = positions.length / 3;
    positions.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz);
    uvs.push(0, 0, 1, 0, 0, len / 2, 1, len / 2);
    // Sens anti-horaire vu de dessus : dans l'autre ordre les normales pointent
    // vers le sol et la route disparaît, éliminée par le culling.
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  const pushDisc = (cx: number, cz: number): void => {
    const segments = 16;
    const center = positions.length / 3;
    positions.push(cx, 0, cz);
    uvs.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(cx + Math.cos(angle) * half, 0, cz + Math.sin(angle) * half);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
      if (i > 0) indices.push(center, center + i + 1, center + i);
    }
  };

  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!;
    const b = path.points[i]!;
    pushQuad(a.x, a.z, b.x, b.z);
    // Un disque à chaque sommet intérieur comble l'encoche laissée par l'angle.
    if (i < path.points.length - 1) pushDisc(b.x, b.z);
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
  // Herbe franchement verte : l'ancien gris se confondait avec la route et
  // avec le fond, et le terrain paraissait délavé.
  const groundMaterial = new MeshStandardMaterial({ color: '#d7e6cd', roughness: 0.95, metalness: 0 });
  const groundMesh = new Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const ribbon = new Mesh(
    buildPathSurface(path, options.pathWidth),
    new MeshStandardMaterial({ color: '#c6a878', roughness: 1, metalness: 0 })
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
  group.add(marker('#0e7a57', path.sample(0, new Vector2())));
  group.add(marker('#b4432f', path.sample(path.length, new Vector2())));

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
