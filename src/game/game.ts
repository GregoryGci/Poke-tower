/**
 * Orchestrateur d'une manche.
 *
 * Deux régimes de rendu cohabitent, et c'est délibéré :
 *
 *  - les ennemis, nombreux et lointains, passent par une foule instanciée dont
 *    l'animation est lue dans une texture (voir render/vat.ts) : un appel de
 *    rendu par espèce, quel que soit le nombre d'unités ;
 *  - les Pokémon posés, peu nombreux et au premier plan, gardent un vrai
 *    squelette et un mixeur d'animation, ce qui permettra de réagir au combat.
 */

import {
  AnimationMixer,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type AnimationClip,
  type Object3D,
} from 'three';
import { Pool } from '@/core/pool';
import type { InputState } from '@/core/input';
import { instantiate, loadModel, preloadModels } from '@/core/assets';
import { Enemy } from '@/entities/enemy';
import { Projectile } from '@/entities/projectile';
import { Tower } from '@/entities/tower';
import { Trainer } from '@/entities/trainer';
import { EnemyPath } from '@/world/path';
import { SpatialGrid } from '@/world/spatial';
import { createTerrain, type Terrain } from '@/world/terrain';
import { bakeAnimations, Crowd, type BakedClip } from '@/render/vat';
import { canPlace, REJECTION_LABELS, type PlacementRules } from './placement';
import { WAVES, WaveRunner } from './waves';
import type { OwnedPokemon } from '@/data/types';
import { getSpecies } from '@/data/content';

const TERRAIN_SIZE = 34;
const PATH_WIDTH = 2.4;
const MAX_PROJECTILES = 512;
/** Capacité d'une foule, par espèce. */
const CROWD_CAPACITY = 128;
/** Durée d'un appât, en ticks. */
const LURE_TICKS = 90;

/**
 * Les modèles convertis regardent déjà dans le sens de `atan2(dx, dz)`.
 * Constante gardée pour pouvoir corriger une espèce mal orientée sans
 * toucher au code de rendu.
 */
const MODEL_FACING = 0;

const UP = new Vector3(0, 1, 0);
const IDENTITY_QUAT = new Quaternion();

const PLACEMENT_RULES: PlacementRules = {
  bounds: TERRAIN_SIZE / 2 - 1,
  pathClearance: PATH_WIDTH / 2 + 0.6,
  spacing: 1.6,
};

const LEVEL_PATH = new EnemyPath([
  { x: -15, z: -12 },
  { x: -5, z: -12 },
  { x: -5, z: 2 },
  { x: 6, z: 2 },
  { x: 6, z: -6 },
  { x: 15, z: -6 },
]);

export interface GameStatus {
  wave: number;
  totalWaves: number;
  alive: number;
  leaked: number;
  crystals: number;
  placed: number;
  drawCalls: number;
  message: string | null;
}

interface SpeciesCrowd {
  crowd: Crowd;
  walk: BakedClip | null;
  idle: BakedClip | null;
}

export class Game {
  readonly root = new Group();

  private readonly terrain: Terrain;
  private readonly waves = new WaveRunner();
  private readonly enemyGrid = new SpatialGrid<Enemy>(4);

  private readonly enemies = new Pool<Enemy>(() => new Enemy(), 64);
  private readonly projectiles = new Pool<Projectile>(() => new Projectile(), 128);
  private readonly towers: Tower[] = [];
  private readonly trainer = new Trainer();

  /** Une foule par espèce d'ennemi, construite au chargement. */
  private readonly crowds = new Map<string, SpeciesCrowd>();
  private readonly towerMixers: AnimationMixer[] = [];
  /** Tours sans clip de repos : animées à la main pour ne pas rester figées. */
  private readonly breathing: Array<{ object: Object3D; phase: number }> = [];

  private readonly projectileMesh: InstancedMesh;
  private readonly ghostRange: Mesh;
  private ghostModel: Object3D | null = null;
  private ghostSpeciesId: string | null = null;
  private readonly trainerMesh: Mesh;

  private readonly raycaster = new Raycaster();
  private readonly pointerWorld = new Vector3();
  private pointerValid = false;

  private leaked = 0;
  private crystals = 0;
  private message: string | null = null;
  private messageUntil = 0;
  private tick = 0;

  pendingPlacement: OwnedPokemon | null = null;

  private readonly tmpMatrix = new Matrix4();
  private readonly tmpVec = new Vector3();
  private readonly tmpVec2 = new Vector2();
  private readonly tmpScale = new Vector3(1, 1, 1);

  private constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState
  ) {
    this.terrain = createTerrain(LEVEL_PATH, { size: TERRAIN_SIZE, pathWidth: PATH_WIDTH });
    this.root.add(this.terrain.group);

    this.projectileMesh = new InstancedMesh(
      new SphereGeometry(0.12, 8, 6),
      new MeshStandardMaterial({ color: new Color('#f2c14e'), emissive: new Color('#7a5a10') }),
      MAX_PROJECTILES
    );
    this.projectileMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.projectileMesh.frustumCulled = false;
    this.projectileMesh.count = 0;
    this.root.add(this.projectileMesh);

    this.ghostRange = new Mesh(
      new RingGeometry(0.97, 1, 48),
      new MeshStandardMaterial({ color: '#5aa86c', transparent: true, opacity: 0.35 })
    );
    this.ghostRange.rotation.x = -Math.PI / 2;
    this.ghostRange.visible = false;
    this.root.add(this.ghostRange);

    this.trainerMesh = new Mesh(
      new ConeGeometry(0.34, 1.1, 12),
      new MeshStandardMaterial({ color: '#3f6fb5', roughness: 0.5 })
    );
    this.trainerMesh.castShadow = true;
    this.trainerMesh.position.y = 0.55;
    const trainerHolder = new Group();
    trainerHolder.add(this.trainerMesh);
    this.trainer.object = trainerHolder;
    this.trainer.bounds = PLACEMENT_RULES.bounds;
    this.trainer.place(-12, -8);
    this.root.add(trainerHolder);

    this.scene.add(this.root);

    this.input.onClick((button) => {
      if (button === 0) void this.tryPlace();
      if (button === 2) this.pendingPlacement = null;
    });
    this.input.onAction(() => this.throwLure());
  }

  /**
   * Charge et cuit les modèles avant la première image : une cuisson en cours
   * de partie se verrait comme un à-coup.
   */
  static async create(
    scene: Scene,
    camera: PerspectiveCamera,
    input: InputState,
    rosterSpeciesIds: readonly string[]
  ): Promise<Game> {
    const game = new Game(scene, camera, input);

    const enemySpecies = [...new Set(WAVES.flatMap((wave) => wave.batches.map((b) => b.speciesId)))];
    await preloadModels([...enemySpecies, ...rosterSpeciesIds].map((id) => getSpecies(id).model));

    for (const speciesId of enemySpecies) {
      const species = getSpecies(speciesId);
      try {
        const model = await loadModel(species.model);
        const baked = bakeAnimations(model.scene, model.clips);
        const crowd = new Crowd(baked, CROWD_CAPACITY);
        game.crowds.set(speciesId, {
          crowd,
          walk: crowd.resolveClip('ground_walk', 'ground_idle'),
          idle: crowd.resolveClip('ground_idle', 'ground_walk'),
        });
        game.root.add(crowd.mesh);
      } catch (error) {
        // Une espèce sans animation cuisible ne doit pas empêcher de jouer.
        console.warn(`Foule indisponible pour ${speciesId} :`, error);
      }
    }

    return game;
  }

  get status(): GameStatus {
    return {
      wave: this.waves.currentWave,
      totalWaves: this.waves.totalWaves,
      alive: this.enemies.activeCount,
      leaked: this.leaked,
      crystals: this.crystals,
      placed: this.towers.length,
      // Une foule par espèce visible, plus les projectiles et le décor.
      drawCalls: [...this.crowds.values()].filter((c) => c.crowd.mesh.count > 0).length
        + (this.projectileMesh.count > 0 ? 1 : 0)
        + this.towers.length,
      message: this.message,
    };
  }

  /* ---------- Simulation ---------- */

  update(dt: number, tick: number): void {
    this.tick = tick;
    if (this.message && tick > this.messageUntil) this.message = null;

    this.trainer.update(dt, this.input.move);

    this.enemyGrid.clear();
    this.enemies.forEach((enemy) => {
      if (enemy.state !== 'mort') this.enemyGrid.insert(enemy);
    });

    for (const event of this.waves.update(dt, this.countMarching())) {
      if (event.kind === 'spawn') {
        this.spawnEnemy(event.request.species.id, event.request.hp, event.request.speed);
      }
      if (event.kind === 'waveCleared') this.notify(`Vague ${event.index + 1} terminée`);
      if (event.kind === 'allCleared') this.notify('Toutes les vagues sont passées');
    }

    this.enemies.forEach((enemy) => {
      enemy.update(dt, tick);
      if (enemy.state === 'arrive') {
        this.leaked++;
        this.enemies.release(enemy);
      } else if (enemy.state === 'mort') {
        this.crystals += 1;
        this.enemies.release(enemy);
      }
    });

    for (const tower of this.towers) {
      const target = tower.update(dt, this.enemyGrid);
      if (!target || this.projectiles.activeCount >= MAX_PROJECTILES) continue;
      this.projectiles.acquire().launch(tower.x, tower.z, target, tower.damage, 14);
    }

    this.projectiles.forEach((shot) => {
      if (!shot.update(dt)) return;
      if (shot.target && shot.target.state !== 'mort') shot.target.damage(shot.damage);
      this.projectiles.release(shot);
    });

    for (const mixer of this.towerMixers) mixer.update(dt);
    for (const { crowd } of this.crowds.values()) crowd.advance(dt);

    this.updatePointer();
  }

  private countMarching(): number {
    let count = 0;
    this.enemies.forEach((enemy) => {
      if (enemy.state !== 'mort' && enemy.state !== 'arrive') count++;
    });
    return count;
  }

  private spawnEnemy(speciesId: string, hp: number, speed: number): void {
    const offset = (Math.random() - 0.5) * (PATH_WIDTH - 0.8);
    this.enemies.acquire().spawn(speciesId, LEVEL_PATH, hp, speed, offset);
  }

  /* ---------- Interaction ---------- */

  private updatePointer(): void {
    const pending = this.pendingPlacement;
    if (!this.input.pointerInside) {
      this.pointerValid = false;
      this.hideGhost();
      return;
    }

    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain.groundMesh, false)[0];
    this.pointerValid = Boolean(hit);
    if (!hit || !pending) {
      this.hideGhost();
      return;
    }

    this.pointerWorld.copy(hit.point);
    void this.ensureGhost(pending.speciesId);

    const species = getSpecies(pending.speciesId);
    const check = canPlace(this.pointerWorld.x, this.pointerWorld.z, LEVEL_PATH, this.towers, PLACEMENT_RULES);
    (this.ghostRange.material as MeshStandardMaterial).color.set(check.ok ? '#5aa86c' : '#c25b4e');
    this.ghostRange.position.set(this.pointerWorld.x, 0.04, this.pointerWorld.z);
    this.ghostRange.scale.setScalar(species.range);
    this.ghostRange.visible = true;

    if (this.ghostModel) {
      this.ghostModel.position.set(this.pointerWorld.x, 0, this.pointerWorld.z);
      this.ghostModel.rotation.y = MODEL_FACING;
      this.ghostModel.visible = true;
      this.ghostModel.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as MeshStandardMaterial;
        material.color.set(check.ok ? '#8fd6a0' : '#e09a92');
      });
    }
  }

  /** Le fantôme est le vrai modèle, translucide : le placement libre demande de voir l'encombrement réel. */
  private async ensureGhost(speciesId: string): Promise<void> {
    if (this.ghostSpeciesId === speciesId) return;
    this.ghostSpeciesId = speciesId;

    const previous = this.ghostModel;
    this.ghostModel = null;
    if (previous) this.root.remove(previous);

    const { object } = await instantiate(getSpecies(speciesId).model);
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const source = mesh.material as MeshStandardMaterial;
      const material = source.clone();
      material.transparent = true;
      material.opacity = 0.55;
      material.depthWrite = false;
      mesh.material = material;
      mesh.castShadow = false;
    });
    object.visible = false;
    // Une autre sélection a pu arriver pendant le chargement.
    if (this.ghostSpeciesId !== speciesId) return;
    this.ghostModel = object;
    this.root.add(object);
  }

  private hideGhost(): void {
    this.ghostRange.visible = false;
    if (this.ghostModel) this.ghostModel.visible = false;
  }

  private async tryPlace(): Promise<void> {
    const pending = this.pendingPlacement;
    if (!pending || !this.pointerValid) return;

    const check = canPlace(this.pointerWorld.x, this.pointerWorld.z, LEVEL_PATH, this.towers, PLACEMENT_RULES);
    if (!check.ok) {
      this.notify(REJECTION_LABELS[check.reason]);
      return;
    }

    const species = getSpecies(pending.speciesId);
    const x = this.pointerWorld.x;
    const z = this.pointerWorld.z;
    this.pendingPlacement = null;

    const tower = new Tower(pending, species);
    const holder = new Group();

    const base = new Mesh(
      new CylinderGeometry(0.5, 0.55, 0.1, 16),
      new MeshStandardMaterial({ color: '#c9cfd6', roughness: 0.8 })
    );
    base.receiveShadow = true;
    base.position.y = 0.05;
    holder.add(base);

    const { object, clips } = await instantiate(species.model);
    object.rotation.y = MODEL_FACING;
    holder.add(object);

    const idle = pickClip(clips, 'ground_idle', 'battle_idle', 'ground_walk');
    if (idle) {
      const mixer = new AnimationMixer(object);
      mixer.clipAction(idle).play();
      // Chaque unité démarre à un instant différent de son cycle.
      mixer.setTime(Math.random() * idle.duration);
      this.towerMixers.push(mixer);
    } else {
      // Aucune animation de repos dans l'espèce : on respire à la main.
      this.breathing.push({ object, phase: Math.random() * Math.PI * 2 });
      console.info(`${species.name} n'a pas d'animation de repos : respiration procédurale.`);
    }

    tower.object = holder;
    tower.place(x, z);
    this.root.add(holder);
    this.towers.push(tower);
    this.notify(`${species.name} posé`);
  }

  private throwLure(): void {
    const { x, z } = this.trainer;
    let attracted = 0;
    this.enemyGrid.queryRadius(x, z, 6, (enemy) => {
      if (enemy.state === 'mort') return;
      enemy.lure = { x, z, until: this.tick + LURE_TICKS };
      attracted++;
    });
    this.notify(attracted ? `Appât lancé — ${attracted} détournés` : 'Appât lancé dans le vide');
  }

  private notify(text: string): void {
    this.message = text;
    this.messageUntil = this.tick + 60;
  }

  /* ---------- Rendu ---------- */

  render(alpha: number): void {
    for (const { crowd } of this.crowds.values()) crowd.begin();

    this.enemies.forEach((enemy) => {
      if (enemy.state === 'mort') return;
      const entry = this.crowds.get(enemy.speciesId);
      if (!entry) return;
      enemy.renderAt(alpha, this.tmpVec2);
      const angle = Math.atan2(enemy.x - enemy.prevX, enemy.z - enemy.prevZ) + MODEL_FACING;
      const clip = enemy.state === 'marche' || enemy.state === 'attire' ? entry.walk : entry.idle;
      if (!clip) return;
      entry.crowd.add(this.tmpVec2.x, this.tmpVec2.y, angle, 1, clip, enemy.phase);
    });

    for (const { crowd } of this.crowds.values()) crowd.end();

    let shotIndex = 0;
    this.projectiles.forEach((shot) => {
      if (shotIndex >= MAX_PROJECTILES) return;
      this.tmpVec.set(shot.x, 0.6, shot.z);
      this.tmpMatrix.compose(this.tmpVec, IDENTITY_QUAT, this.tmpScale);
      this.projectileMesh.setMatrixAt(shotIndex++, this.tmpMatrix);
    });
    this.projectileMesh.count = shotIndex;
    this.projectileMesh.instanceMatrix.needsUpdate = true;

    for (const tower of this.towers) {
      if (!tower.object || !tower.target) continue;
      tower.object.rotation.y = Math.atan2(tower.target.x - tower.x, tower.target.z - tower.z) + MODEL_FACING;
    }

    // Respiration de secours : une légère compression verticale suffit à ce
    // qu'une unité sans clip ne paraisse pas gelée.
    const breath = (this.tick + alpha) * 0.12;
    for (const unit of this.breathing) {
      const amount = Math.sin(breath + unit.phase) * 0.03;
      unit.object.scale.set(1 - amount * 0.5, 1 + amount, 1 - amount * 0.5);
    }

    this.trainer.renderAt(alpha, this.tmpVec2);
    this.trainer.object?.position.set(this.tmpVec2.x, 0, this.tmpVec2.y);
    this.trainerMesh.rotation.z = Math.sin(this.tick * 0.15) * 0.04;
  }

  dispose(): void {
    this.terrain.dispose();
    this.projectileMesh.dispose();
    for (const { crowd } of this.crowds.values()) crowd.dispose();
    this.scene.remove(this.root);
  }
}

/**
 * Cherche un clip de repos par nom.
 *
 * On ne se rabat volontairement pas sur le premier clip venu : plusieurs
 * espèces n'embarquent que des émotes de visage, qui sont des poses fixes.
 * Les jouer donnerait un Pokémon parfaitement immobile.
 */
function pickClip(clips: readonly AnimationClip[], ...candidates: string[]): AnimationClip | null {
  for (const candidate of candidates) {
    const found = clips.find((clip) => clip.name.endsWith(candidate) && clip.duration > 0);
    if (found) return found;
  }
  return null;
}

/** Rotation appliquée aux modèles : exportée pour le reste du rendu. */
export { MODEL_FACING, UP };
