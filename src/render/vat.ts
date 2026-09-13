/**
 * Animation par texture (VAT) pour les foules d'ennemis.
 *
 * Un `SkinnedMesh` ne s'instancie pas : chaque unité animée porte son propre
 * squelette, recalculé sur le CPU et réenvoyé au GPU à chaque image. C'est ce
 * qui plafonne le rendu vers une trentaine d'unités — très loin des vagues de
 * plus de cent prévues au brief.
 *
 * On cuit donc les animations une fois pour toutes dans une texture : une
 * ligne par image, les matrices d'os rangées en largeur. Le vertex shader y
 * lit la pose et applique lui-même la déformation. Plus aucun squelette au
 * runtime, donc un seul appel de rendu pour toute l'espèce, quel que soit le
 * nombre d'unités.
 *
 * Cette approche ne marche que parce que la conversion Bedrock garantit une
 * seule influence par sommet : le shader lit une matrice, pas quatre.
 */

import {
  DoubleSide,
  AnimationClip,
  AnimationMixer,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  RGBAFormat,
  SkinnedMesh,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';

/** Images par seconde de la cuisson. Au-delà, le gain visuel ne se voit plus. */
const BAKE_FPS = 24;

export interface BakedClip {
  /** Première ligne de la texture pour ce clip. */
  startRow: number;
  frameCount: number;
  duration: number;
}

export interface BakedAnimation {
  texture: DataTexture;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  boneCount: number;
  clips: Map<string, BakedClip>;
  /** Hauteur de la texture, en images. */
  totalRows: number;
  dispose(): void;
}

function findSkinnedMesh(root: Object3D): SkinnedMesh {
  let found: SkinnedMesh | null = null;
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh;
  });
  if (!found) throw new Error('Aucun SkinnedMesh dans ce modèle : la cuisson VAT est impossible');
  return found;
}

/**
 * Cuit tous les clips d'un modèle dans une texture de matrices d'os.
 *
 * La matrice stockée est déjà le produit `matrixWorld * inverseBind` que
 * three.js tient dans `skeleton.boneMatrices` : elle s'applique directement
 * à la position du sommet, sans autre calcul.
 */
export function bakeAnimations(source: Object3D, clips: readonly AnimationClip[]): BakedAnimation {
  const skinned = findSkinnedMesh(source);
  const skeleton = skinned.skeleton;
  const boneCount = skeleton.bones.length;

  const usableClips = clips.filter((clip) => clip.duration > 0 && clip.tracks.length > 0);
  if (usableClips.length === 0) throw new Error('Aucun clip exploitable à cuire');

  const layout = new Map<string, BakedClip>();
  let totalRows = 0;
  for (const clip of usableClips) {
    const frameCount = Math.max(2, Math.round(clip.duration * BAKE_FPS));
    layout.set(clip.name, { startRow: totalRows, frameCount, duration: clip.duration });
    totalRows += frameCount;
  }

  // Une matrice 4x4 occupe quatre texels RGBA consécutifs.
  const width = boneCount * 4;
  const data = new Float32Array(width * totalRows * 4);

  const mixer = new AnimationMixer(source);
  for (const clip of usableClips) {
    const slot = layout.get(clip.name)!;
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();

    for (let frame = 0; frame < slot.frameCount; frame++) {
      // Le dernier échantillon retombe sur le premier : le clip boucle sans saut.
      const time = (frame / slot.frameCount) * slot.duration;
      mixer.setTime(time);
      source.updateMatrixWorld(true);
      skeleton.update();
      data.set(skeleton.boneMatrices, (slot.startRow + frame) * width * 4);
    }

    action.stop();
    mixer.uncacheClip(clip);
  }
  mixer.stopAllAction();

  const texture = new DataTexture(data, width, totalRows, RGBAFormat, FloatType);
  // Filtrage au plus proche : l'interpolation entre images est faite dans le
  // shader, sur les positions, pas sur les matrices — mélanger deux matrices
  // composante par composante déforme les rotations.
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const geometry = skinned.geometry.clone();
  // `skinWeight` ne sert plus : une seule influence, toujours à 1.
  geometry.deleteAttribute('skinWeight');

  const sourceMaterial = (Array.isArray(skinned.material) ? skinned.material[0] : skinned.material) as MeshStandardMaterial;
  const material = createVatMaterial(sourceMaterial, texture, width, totalRows);

  return {
    texture,
    geometry,
    material,
    boneCount,
    clips: layout,
    totalRows,
    dispose(): void {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Reprend le matériau du modèle et remplace la déformation par une lecture
 * dans la texture d'animation. Tout le reste de l'éclairage standard de
 * three.js est conservé.
 */
function createVatMaterial(
  source: MeshStandardMaterial,
  texture: Texture,
  width: number,
  height: number
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: source.map,
    color: source.color,
    roughness: source.roughness,
    metalness: source.metalness,
    alphaTest: source.alphaTest || 0.5,
    transparent: false,
    // Double face, comme pour les modeles poses : les ailes et les nageoires
    // sont des plans d une seule epaisseur, et la culture des faces arriere
    // les fait disparaitre de profil.
    side: DoubleSide,
  });

  material.userData['time'] = { value: 0 };

  material.onBeforeCompile = (shader) => {
    shader.uniforms['uBoneTexture'] = { value: texture };
    // Un Vector2, pas un tableau : three n'infère pas toujours le bon type
    // d'uniforme à partir d'un littéral.
    shader.uniforms['uBoneTextureSize'] = { value: new Vector2(width, height) };
    shader.uniforms['uTime'] = material.userData['time'];

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uBoneTexture;
        uniform vec2 uBoneTextureSize;
        uniform float uTime;
        attribute vec4 skinIndex;
        // x = première ligne du clip, y = nombre d'images, z = décalage temporel
        attribute vec3 aAnim;

        mat4 readBoneMatrix(float bone, float row) {
          float x = bone * 4.0;
          float v = (row + 0.5) / uBoneTextureSize.y;
          vec4 c0 = texture2D(uBoneTexture, vec2((x + 0.5) / uBoneTextureSize.x, v));
          vec4 c1 = texture2D(uBoneTexture, vec2((x + 1.5) / uBoneTextureSize.x, v));
          vec4 c2 = texture2D(uBoneTexture, vec2((x + 2.5) / uBoneTextureSize.x, v));
          vec4 c3 = texture2D(uBoneTexture, vec2((x + 3.5) / uBoneTextureSize.x, v));
          return mat4(c0, c1, c2, c3);
        }
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        float animFrame = mod((uTime + aAnim.z) * ${BAKE_FPS.toFixed(1)}, aAnim.y);
        float frameA = floor(animFrame);
        float frameB = mod(frameA + 1.0, aAnim.y);
        float blend = animFrame - frameA;

        mat4 boneA = readBoneMatrix(skinIndex.x, aAnim.x + frameA);
        mat4 boneB = readBoneMatrix(skinIndex.x, aAnim.x + frameB);

        // On interpole les positions transformées, pas les matrices : mélanger
        // deux matrices terme à terme écraserait les rotations.
        vec3 posA = (boneA * vec4(position, 1.0)).xyz;
        vec3 posB = (boneB * vec4(position, 1.0)).xyz;
        vec3 transformed = mix(posA, posB, blend);
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        float normalFrame = floor(mod((uTime + aAnim.z) * ${BAKE_FPS.toFixed(1)}, aAnim.y));
        mat4 normalBone = readBoneMatrix(skinIndex.x, aAnim.x + normalFrame);
        vec3 objectNormal = normalize(mat3(normalBone) * normal);
        `
      );
  };

  // Deux matériaux au shader différent ne doivent pas partager leur programme.
  material.customProgramCacheKey = () => `vat-${width}x${height}`;
  return material;
}

/**
 * Une foule : toutes les unités d'une même espèce, rendues en un appel.
 */
export class Crowd {
  readonly mesh: InstancedMesh;
  private readonly animAttribute: InstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly scaleVec = new Vector3();
  private time = 0;

  constructor(
    private readonly baked: BakedAnimation,
    readonly capacity: number
  ) {
    const geometry = baked.geometry.clone();
    const anim = new Float32Array(capacity * 3);
    this.animAttribute = new InstancedBufferAttribute(anim, 3);
    this.animAttribute.setUsage(35048 /* DynamicDrawUsage */);
    geometry.setAttribute('aAnim', this.animAttribute);

    this.mesh = new InstancedMesh(geometry, baked.material, capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // La caméra est fixe et le terrain tient dans le champ : le culling par
    // instance ne rapporterait rien et fait disparaître les unités animées.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Temps d'animation courant de la foule, en secondes. */
  get now(): number {
    return this.time;
  }

  /** Phase à donner à une instance pour que son clip démarre à cet instant. */
  phaseForStartNow(): number {
    return -this.time;
  }

  get clipNames(): string[] {
    return [...this.baked.clips.keys()];
  }

  /** Cherche le premier clip disponible parmi les noms proposés. */
  resolveClip(...candidates: string[]): BakedClip | null {
    for (const candidate of candidates) {
      for (const [name, clip] of this.baked.clips) {
        if (name.endsWith(candidate)) return clip;
      }
    }
    return null;
  }

  /** Premier clip disponible, quel qu'il soit : dernier recours. */
  anyClip(): BakedClip | null {
    return this.baked.clips.values().next().value ?? null;
  }

  advance(dt: number): void {
    this.time += dt;
    const uniform = this.baked.material.userData['time'] as { value: number };
    uniform.value = this.time;
  }

  /** Réinitialise le remplissage avant d'écrire les instances de l'image. */
  begin(): void {
    this.mesh.count = 0;
  }

  /**
   * Ajoute une unité. `phase` décale l'animation pour que les unités d'une
   * même vague ne marchent pas au pas cadencé.
   */
  add(x: number, z: number, angle: number, scale: number, clip: BakedClip, phase: number): void {
    const index = this.mesh.count;
    if (index >= this.capacity) return;
    this.matrix.makeRotationY(angle);
    this.matrix.scale(this.scaleVec.setScalar(scale));
    this.matrix.setPosition(x, 0, z);
    this.mesh.setMatrixAt(index, this.matrix);
    this.animAttribute.setXYZ(index, clip.startRow, clip.frameCount, phase);
    this.mesh.count = index + 1;
  }

  end(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.animAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Récupère le premier maillage rendu d'un modèle, skinné ou non. */
export function firstMesh(root: Object3D): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!found && (mesh.isMesh || (mesh as unknown as SkinnedMesh).isSkinnedMesh)) found = mesh;
  });
  return found;
}
