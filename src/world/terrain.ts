/**
 * Terrain et tracé de la route.
 *
 * Tout est construit une fois au chargement du niveau : le sol, la route et
 * la grille de repères ne bougent jamais, donc rien ici n'entre dans la boucle.
 */

import {
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from 'three';
import type { EnemyPath } from './path';
import type { ThemeMonde } from '@/data/campaign';
import { construirePortail } from './portail';
import { construireBase } from './base';

export interface TerrainOptions {
  size: number;
  pathWidth: number;
  /** Palette du monde : le sol, la route et la tour en dependent. */
  theme: ThemeMonde;
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

/**
 * Fleches posees le long du chemin.
 *
 * Rien n'indiquait par ou les ennemis arrivaient : le joueur devait lancer la
 * vague pour le decouvrir, donc placer a l'aveugle. Elles ne servent que
 * pendant la preparation et s'effacent au depart.
 */
function construireFleches(path: EnemyPath): Group {
  const fleches = new Group();
  const materiau = new MeshStandardMaterial({
    color: '#2f5fa8',
    emissive: '#16325e',
    transparent: true,
    opacity: 0.92,
  });

  // Une fleche tous les quatre metres environ, jamais collee aux extremites.
  const pas = 4.2;
  const point = new Vector2();
  const direction = new Vector2();

  for (let distance = pas * 0.6; distance < path.length - 0.5; distance += pas) {
    path.sample(distance, point);
    path.direction(distance, direction);

    const fleche = new Mesh(new ConeGeometry(0.42, 1.05, 3), materiau);
    // Le cone pointe vers +Y : couché par la rotation en X, sa pointe regarde
    // donc -Z, et non +Z. Une rotation de atan2(dx, dz) l'envoyait alors
    // exactement à l'opposé du sens de marche — les flèches montraient d'où
    // les ennemis venaient, pas où ils allaient. D'où les signes inversés.
    fleche.rotation.x = -Math.PI / 2;
    fleche.rotation.y = 0;
    const support = new Group();
    support.add(fleche);
    support.position.set(point.x, 0.06, point.y);
    support.rotation.y = Math.atan2(-direction.x, -direction.y);
    fleches.add(support);
  }

  return fleches;
}

export interface Terrain {
  group: Group;
  /** Repères de direction, visibles seulement avant le lancement. */
  fleches: Group;
  /** Plan du sol, cible du raycast pour savoir où pointe la souris. */
  groundMesh: Mesh;
  /**
   * Anime ce qui bouge dans le decor : le vortex du portail, le halo de la
   * base. Le reste du mobilier ne bouge jamais.
   */
  avancer(dt: number, vagueLancee: boolean): void;
  /** Part de vies restantes, de 1 a 0. La base s assombrit avec elle. */
  majVies(part: number): void;
  dispose(): void;
}

export function createTerrain(path: EnemyPath, options: TerrainOptions): Terrain {
  const group = new Group();

  const groundGeometry = new PlaneGeometry(options.size, options.size);
  // La couleur vient du monde : vingt manches sur le meme fond se confondent.
  const groundMaterial = new MeshStandardMaterial({
    color: options.theme.sol,
    roughness: 0.95,
    metalness: 0,
  });
  const groundMesh = new Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const ribbon = new Mesh(
    buildPathSurface(path, options.pathWidth),
    new MeshStandardMaterial({ color: options.theme.route, roughness: 1, metalness: 0 })
  );
  ribbon.position.y = 0.01;
  ribbon.receiveShadow = true;
  group.add(ribbon);

  // La base a defendre, a l'arrivee du chemin. Elle donne un but visible a la
  // manche : sans elle, le joueur protege une ligne abstraite.
  const arrivee = path.sample(path.length, new Vector2());
  const base = construireBase(options.theme);
  base.group.position.set(arrivee.x, 0, arrivee.y);
  // La facade regarde d ou viennent les ennemis. Sans ca, l embleme et les
  // fenetres pointaient vers -Z quel que soit le trace : sur la moitie des
  // cartes, on ne voyait de la base que son mur arriere.
  //
  // Les modeles du jeu regardent tous vers -Z. Pour que cet axe pointe vers le
  // vecteur V, il faut donc y = atan2(-Vx, -Vz).
  const avantArrivee = path.sample(Math.max(0, path.length - 2), new Vector2());
  base.group.rotation.y = Math.atan2(
    -(avantArrivee.x - arrivee.x),
    -(avantArrivee.y - arrivee.y)
  );
  group.add(base.group);

  const fleches = construireFleches(path);
  group.add(fleches);

  // Le portail remplace le disque vert du depart : il dit d ou sortent les
  // ennemis, et surtout pourquoi.
  const depart = path.sample(0, new Vector2());
  const portail = construirePortail(options.theme);
  portail.group.position.set(depart.x, 0, depart.y);
  // L arche regarde le long du chemin : les ennemis doivent en sortir de
  // face, pas de profil.
  const suivant = path.sample(Math.min(2, path.length), new Vector2());
  portail.group.rotation.y = Math.atan2(suivant.x - depart.x, suivant.y - depart.y);
  group.add(portail.group);


  return {
    group,
    fleches,
    groundMesh,
    avancer(dt: number, vagueLancee: boolean): void {
      portail.avancer(dt, vagueLancee);
      base.avancer(dt);
    },
    majVies(part: number): void {
      base.majVies(part);
    },
    dispose(): void {
      portail.dispose();
      base.dispose();
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
