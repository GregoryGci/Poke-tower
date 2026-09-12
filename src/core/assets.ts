/**
 * Chargement et cache des modèles.
 *
 * Un GLB n'est téléchargé et analysé qu'une fois par espèce. Chaque unité
 * posée en reçoit un clone : la géométrie et les matériaux restent partagés,
 * seul le squelette est dupliqué.
 */

import { AnimationClip, Mesh, NearestFilter, Object3D, SkinnedMesh, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModel {
  scene: Object3D;
  clips: AnimationClip[];
}

export interface ModelInstance {
  object: Object3D;
  clips: AnimationClip[];
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedModel>>();

/** Les textures Cobblemon sont du pixel art : tout lissage les transforme en bouillie. */
function keepPixelsSharp(root: Object3D): void {
  const seen = new Set<Texture>();
  root.traverse((child) => {
    const mesh = child as Mesh | SkinnedMesh;
    if (!mesh.isMesh && !(mesh as SkinnedMesh).isSkinnedMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // La caméra est fixe et le terrain petit : le culling par objet coûte plus
    // qu'il ne rapporte, et il fait clignoter les unités animées.
    mesh.frustumCulled = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const map = (material as { map?: Texture | null }).map;
      if (!map || seen.has(map)) continue;
      seen.add(map);
      map.magFilter = NearestFilter;
      map.minFilter = NearestFilter;
      map.generateMipmaps = false;
      map.needsUpdate = true;
    }
  });
}

export function loadModel(name: string): Promise<LoadedModel> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader.loadAsync(`models/${name}.glb`).then((gltf) => {
      keepPixelsSharp(gltf.scene);
      return { scene: gltf.scene, clips: gltf.animations };
    });
    cache.set(name, pending);
  }
  return pending;
}

/** Précharge en parallèle : évite les à-coups au moment de poser une unité. */
export async function preloadModels(names: readonly string[]): Promise<void> {
  await Promise.all(names.map((name) => loadModel(name)));
}

export async function instantiate(name: string): Promise<ModelInstance> {
  const model = await loadModel(name);
  return { object: cloneSkinned(model.scene), clips: model.clips };
}
