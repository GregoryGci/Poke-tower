/**
 * Mobilier de terrain.
 *
 * Tout est bâti en primitives — un arbre est un tronc et deux boules — parce
 * que la direction artistique est faite de formes franches et de couleurs
 * plates : un modèle importé y serait plus lourd sans y paraître mieux.
 *
 * Chaque **pièce** de mobilier est rendue par un `InstancedMesh`, pas par un
 * maillage par élément. Soixante arbres coûtent donc autant que deux, ce qui
 * compte : le budget de rendu est déjà pris par les cent ennemis.
 *
 * Le décor ne bouge jamais. Il est écrit une fois à la construction et plus
 * jamais touché.
 */

import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { ThemeMonde } from '@/data/campaign';
import type { ElementDecor } from './level-gen';

/** Une pièce : sa géométrie, sa matière, et sa pose relative à l'élément. */
interface Piece {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /** Décalage vertical du centre de la pièce, avant mise à l'échelle. */
  y: number;
  /** Échelle propre à la pièce. */
  echelle: Vector3;
  /** Décalage horizontal, pour les pièces doublées comme les houppiers. */
  dx?: number;
  dz?: number;
  /** L'élément tourne-t-il avec l'angle tiré ? Les boules n'en ont pas besoin. */
  tourne?: boolean;
  ombre?: boolean;
}

const UP = new Vector3(0, 1, 0);

/**
 * Décrit chaque type de mobilier.
 *
 * Les géométries sont créées une fois par appel de `construireDecor` puis
 * partagées entre toutes les instances d'une même pièce.
 */
function recettes(theme: ThemeMonde): Record<ElementDecor['kind'], Piece[]> {
  const feuillage = new MeshStandardMaterial({ color: theme.feuillage, roughness: 0.9, flatShading: true });
  const tronc = new MeshStandardMaterial({ color: theme.tronc, roughness: 1, flatShading: true });
  const pierre = new MeshStandardMaterial({ color: theme.pierre, roughness: 0.95, flatShading: true });
  const accent = new MeshStandardMaterial({ color: theme.accent, roughness: 0.6, flatShading: true });

  // Le cristal et la flaque brillent un peu : ce sont les seules touches non
  // mates du décor, et elles marquent les points d'intérêt.
  const luisant = new MeshStandardMaterial({
    color: theme.accent,
    roughness: 0.25,
    metalness: 0.1,
    emissive: theme.accent,
    emissiveIntensity: 0.25,
    flatShading: true,
  });

  const boule = new IcosahedronGeometry(1, 0);
  const cylindre = new CylinderGeometry(0.22, 0.3, 1, 7);
  const caillou = new DodecahedronGeometry(1, 0);
  const octa = new OctahedronGeometry(1, 0);
  const dalle = new CircleGeometry(1, 14);
  const bloc = new BoxGeometry(1, 1, 1);
  const petitCone = new ConeGeometry(0.16, 0.5, 5);
  const disqueSouche = new CylinderGeometry(0.5, 0.6, 0.45, 8);

  return {
    // Deux houppiers décalés valent mieux qu'un : la silhouette cesse d'être
    // une boule posée sur un bâton.
    arbre: [
      { geometry: cylindre, material: tronc, y: 0.9, echelle: new Vector3(1, 1.8, 1), ombre: true },
      { geometry: boule, material: feuillage, y: 2.1, echelle: new Vector3(0.95, 0.8, 0.95), ombre: true },
      { geometry: boule, material: feuillage, y: 2.7, echelle: new Vector3(0.62, 0.55, 0.62), dx: 0.22, dz: -0.15, ombre: true },
    ],
    buisson: [
      { geometry: boule, material: feuillage, y: 0.42, echelle: new Vector3(0.7, 0.5, 0.7), ombre: true },
      { geometry: boule, material: feuillage, y: 0.62, echelle: new Vector3(0.42, 0.34, 0.42), dx: 0.3, ombre: true },
    ],
    rocher: [
      { geometry: caillou, material: pierre, y: 0.34, echelle: new Vector3(0.62, 0.44, 0.6), tourne: true, ombre: true },
      { geometry: caillou, material: pierre, y: 0.16, echelle: new Vector3(0.3, 0.22, 0.3), dx: 0.5, dz: 0.3, tourne: true },
    ],
    souche: [
      { geometry: disqueSouche, material: tronc, y: 0.22, echelle: new Vector3(1, 1, 1), tourne: true, ombre: true },
    ],
    fleurs: [
      { geometry: petitCone, material: accent, y: 0.25, echelle: new Vector3(1, 1, 1) },
      { geometry: petitCone, material: accent, y: 0.2, echelle: new Vector3(0.8, 0.8, 0.8), dx: 0.28, dz: 0.18 },
      { geometry: petitCone, material: accent, y: 0.2, echelle: new Vector3(0.8, 0.8, 0.8), dx: -0.22, dz: 0.26 },
    ],
    cristal: [
      { geometry: octa, material: luisant, y: 0.7, echelle: new Vector3(0.34, 0.85, 0.34), tourne: true, ombre: true },
      { geometry: octa, material: luisant, y: 0.4, echelle: new Vector3(0.2, 0.5, 0.2), dx: 0.35, dz: 0.2, tourne: true },
    ],
    colonne: [
      { geometry: bloc, material: pierre, y: 1, echelle: new Vector3(0.7, 2, 0.7), tourne: true, ombre: true },
      { geometry: bloc, material: pierre, y: 2.15, echelle: new Vector3(0.5, 0.3, 0.5), tourne: true, ombre: true },
    ],
    // Une flaque est plate : elle habille le sol sans jamais gêner une pose.
    // Un rayon d'une unité donnait des taches de deux mètres de large, qui se
    // lisaient comme des pastilles posées sur le sol plutôt que comme de la
    // lave affleurante.
    flaque: [{ geometry: dalle, material: luisant, y: 0.02, echelle: new Vector3(0.55, 0.55, 1) }],
  };
}

export interface Decor {
  group: Group;
  dispose(): void;
}

/**
 * Construit le décor d'une carte.
 *
 * Une passe de comptage précède l'écriture : un `InstancedMesh` veut son
 * effectif à la construction, et compter d'abord évite d'allouer pour le pire
 * cas à chaque pièce.
 */
export function construireDecor(elements: readonly ElementDecor[], theme: ThemeMonde): Decor {
  const group = new Group();
  const table = recettes(theme);

  const compte = new Map<string, number>();
  for (const element of elements) {
    for (let i = 0; i < (table[element.kind]?.length ?? 0); i++) {
      const cle = `${element.kind}:${i}`;
      compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
  }

  const meshes = new Map<string, { mesh: InstancedMesh; ecrits: number }>();
  for (const [cle, total] of compte) {
    const [kind, rang] = cle.split(':');
    const piece = table[kind as ElementDecor['kind']]?.[Number(rang)];
    if (!piece || total === 0) continue;
    const mesh = new InstancedMesh(piece.geometry, piece.material, total);
    mesh.castShadow = piece.ombre ?? false;
    mesh.receiveShadow = true;
    // La caméra est fixe et le terrain tient dans le champ : le culling par
    // instance ne rapporterait rien, comme pour les foules d'ennemis.
    mesh.frustumCulled = false;
    meshes.set(cle, { mesh, ecrits: 0 });
    group.add(mesh);
  }

  const matrice = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const echelle = new Vector3();

  for (const element of elements) {
    const pieces = table[element.kind] ?? [];
    pieces.forEach((piece, rang) => {
      const entree = meshes.get(`${element.kind}:${rang}`);
      if (!entree) return;

      const dx = (piece.dx ?? 0) * element.taille;
      const dz = (piece.dz ?? 0) * element.taille;
      // Le décalage des pièces doublées tourne avec l'élément, sinon tous les
      // houppiers secondaires pointeraient dans la même direction.
      const cos = Math.cos(element.angle);
      const sin = Math.sin(element.angle);

      position.set(
        element.x + dx * cos - dz * sin,
        piece.y * element.taille,
        element.z + dx * sin + dz * cos
      );
      rotation.setFromAxisAngle(UP, piece.tourne === false ? 0 : element.angle);
      echelle.copy(piece.echelle).multiplyScalar(element.taille);

      // Une flaque est un disque vertical par défaut : on la couche à plat.
      if (element.kind === 'flaque') {
        matrice.makeRotationX(-Math.PI / 2);
        matrice.scale(echelle);
        matrice.setPosition(position);
      } else {
        matrice.compose(position, rotation, echelle);
      }

      entree.mesh.setMatrixAt(entree.ecrits, matrice);
      entree.ecrits += 1;
    });
  }

  for (const { mesh } of meshes.values()) mesh.instanceMatrix.needsUpdate = true;

  return {
    group,
    dispose(): void {
      group.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh && !(child as InstancedMesh).isInstancedMesh) return;
        mesh.geometry.dispose();
        const matieres = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const matiere of matieres) matiere.dispose();
      });
    },
  };
}
