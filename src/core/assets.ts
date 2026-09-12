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

/**
 * Applique la pose canonique du modèle avant toute animation.
 *
 * La pose de repos d'un modèle Cobblemon n'est pas une posture jouable : les
 * lianes de Bulbizarre y sont déployées à plat sur quatre blocs de large, et
 * rien dans `ground_idle` ne les replie. Le mod s'en sort parce que son code
 * place ces membres lui-même.
 *
 * On applique donc la première image du clip de présentation, qui lui couvre
 * tout le squelette. Les os que l'animation de repos pilote seront écrasés
 * juste après ; les autres — lianes, ailes repliées — gardent cette pose.
 */
function applyRestPose(root: Object3D, clips: readonly AnimationClip[]): void {
  const pose =
    clips.find((clip) => clip.name.endsWith('.render')) ??
    clips.find((clip) => clip.name.endsWith('.battle_idle'));
  if (!pose) return;

  for (const track of pose.tracks) {
    const separateur = track.name.lastIndexOf('.');
    if (separateur < 0) continue;
    const node = root.getObjectByName(track.name.slice(0, separateur));
    if (!node) continue;

    const v = track.values;
    switch (track.name.slice(separateur + 1)) {
      case 'quaternion':
        node.quaternion.set(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1);
        break;
      case 'position':
        node.position.set(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
        break;
      case 'scale':
        node.scale.set(v[0] ?? 1, v[1] ?? 1, v[2] ?? 1);
        break;
    }
  }
}

export async function instantiate(name: string): Promise<ModelInstance> {
  const model = await loadModel(name);
  const object = cloneSkinned(model.scene);
  applyRestPose(object, model.clips);
  return { object, clips: model.clips };
}
