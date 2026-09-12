/**
 * Orchestrateur d'une manche.
 *
 * Tient la simulation (vagues, ennemis, tours, projectiles) et son rendu.
 * Les visuels sont volontairement des primitives : cette étape valide
 * l'architecture et les perfs, pas la direction artistique. Les modèles
 * convertis se brancheront à la place des capsules sans toucher au reste.
 */

import {
  CapsuleGeometry,
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
} from 'three';
import { Pool } from '@/core/pool';
import type { InputState } from '@/core/input';
import { Enemy } from '@/entities/enemy';
import { Projectile } from '@/entities/projectile';
import { Tower } from '@/entities/tower';
import { Trainer } from '@/entities/trainer';
import { EnemyPath } from '@/world/path';
import { SpatialGrid } from '@/world/spatial';
import { createTerrain, type Terrain } from '@/world/terrain';
import { canPlace, REJECTION_LABELS, type PlacementRules } from './placement';
import { WaveRunner } from './waves';
import type { OwnedPokemon } from '@/data/types';
import { getSpecies } from '@/data/content';

const TERRAIN_SIZE = 34;
const PATH_WIDTH = 2.4;
/** Plafond d'ennemis simultanés : dimensionne les InstancedMesh une fois pour toutes. */
const MAX_ENEMIES = 256;
const MAX_PROJECTILES = 512;
/** Durée d'un appât, en ticks. */
const LURE_TICKS = 90;

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
  message: string | null;
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

  private readonly enemyMesh: InstancedMesh;
  private readonly projectileMesh: InstancedMesh;
  private readonly ghost: Mesh;
  private readonly ghostRange: Mesh;
  private readonly trainerMesh: Mesh;

  private readonly raycaster = new Raycaster();
  private readonly pointerWorld = new Vector3();
  private pointerValid = false;

  private leaked = 0;
  private crystals = 0;
  private message: string | null = null;
  private messageUntil = 0;
  private tick = 0;

  /** Pokémon choisi dans la barre, en attente de pose. */
  pendingPlacement: OwnedPokemon | null = null;

  private readonly tmpMatrix = new Matrix4();
  private readonly tmpVec = new Vector3();
  private readonly tmpVec2 = new Vector2();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState
  ) {
    this.terrain = createTerrain(LEVEL_PATH, { size: TERRAIN_SIZE, pathWidth: PATH_WIDTH });
    this.root.add(this.terrain.group);

    this.enemyMesh = new InstancedMesh(
      new CapsuleGeometry(0.32, 0.5, 4, 10),
      new MeshStandardMaterial({ color: new Color('#b4553f'), roughness: 0.7 }),
      MAX_ENEMIES
    );
    this.enemyMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.enemyMesh.castShadow = true;
    this.enemyMesh.frustumCulled = false;
    this.enemyMesh.count = 0;
    this.root.add(this.enemyMesh);

    this.projectileMesh = new InstancedMesh(
      new SphereGeometry(0.12, 8, 6),
      new MeshStandardMaterial({ color: new Color('#f2c14e'), emissive: new Color('#7a5a10') }),
      MAX_PROJECTILES
    );
    this.projectileMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.projectileMesh.frustumCulled = false;
    this.projectileMesh.count = 0;
    this.root.add(this.projectileMesh);

    this.ghost = new Mesh(
      new CapsuleGeometry(0.34, 0.6, 4, 10),
      new MeshStandardMaterial({ color: '#5aa86c', transparent: true, opacity: 0.55 })
    );
    this.ghost.visible = false;
    this.root.add(this.ghost);

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
      if (button === 0) this.tryPlace();
      if (button === 2) this.pendingPlacement = null;
    });
    this.input.onAction(() => this.throwLure());
  }

  get status(): GameStatus {
    return {
      wave: this.waves.currentWave,
      totalWaves: this.waves.totalWaves,
      alive: this.enemies.activeCount,
      leaked: this.leaked,
      crystals: this.crystals,
      placed: this.towers.length,
      message: this.message,
    };
  }

  /* ---------- Simulation ---------- */

  update(dt: number, tick: number): void {
    this.tick = tick;
    if (this.message && tick > this.messageUntil) this.message = null;

    this.trainer.update(dt, this.input.move);

    // La grille est reconstruite à chaque tick : tous les ennemis bougent, donc
    // la reconstruire coûte moins cher que de suivre chaque déplacement.
    this.enemyGrid.clear();
    this.enemies.forEach((enemy) => {
      if (enemy.state !== 'mort') this.enemyGrid.insert(enemy);
    });

    for (const event of this.waves.update(dt, this.countMarching())) {
      if (event.kind === 'spawn') this.spawnEnemy(event.request.hp, event.request.speed);
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

    this.updatePointer();
  }

  private countMarching(): number {
    let count = 0;
    this.enemies.forEach((enemy) => {
      if (enemy.state !== 'mort' && enemy.state !== 'arrive') count++;
    });
    return count;
  }

  private spawnEnemy(hp: number, speed: number): void {
    if (this.enemies.activeCount >= MAX_ENEMIES) return;
    // Décalage latéral aléatoire : une file indienne parfaite se voit trop.
    const offset = (Math.random() - 0.5) * (PATH_WIDTH - 0.8);
    this.enemies.acquire().spawn(LEVEL_PATH, hp, speed, offset);
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
    const species = getSpecies(pending.speciesId);
    const check = canPlace(this.pointerWorld.x, this.pointerWorld.z, LEVEL_PATH, this.towers, PLACEMENT_RULES);
    const color = check.ok ? '#5aa86c' : '#c25b4e';
    (this.ghost.material as MeshStandardMaterial).color.set(color);
    (this.ghostRange.material as MeshStandardMaterial).color.set(color);
    this.ghost.position.set(this.pointerWorld.x, 0.5, this.pointerWorld.z);
    this.ghost.visible = true;
    this.ghostRange.position.set(this.pointerWorld.x, 0.04, this.pointerWorld.z);
    this.ghostRange.scale.setScalar(species.range);
    this.ghostRange.visible = true;
  }

  private hideGhost(): void {
    this.ghost.visible = false;
    this.ghostRange.visible = false;
  }

  private tryPlace(): void {
    const pending = this.pendingPlacement;
    if (!pending || !this.pointerValid) return;

    const check = canPlace(this.pointerWorld.x, this.pointerWorld.z, LEVEL_PATH, this.towers, PLACEMENT_RULES);
    if (!check.ok) {
      this.notify(REJECTION_LABELS[check.reason]);
      return;
    }

    const species = getSpecies(pending.speciesId);
    const tower = new Tower(pending, species);

    const body = new Mesh(
      new CapsuleGeometry(0.34, 0.6, 4, 10),
      new MeshStandardMaterial({ color: '#4f8f5f', roughness: 0.6 })
    );
    body.castShadow = true;
    body.position.y = 0.62;

    const base = new Mesh(
      new CylinderGeometry(0.5, 0.55, 0.12, 16),
      new MeshStandardMaterial({ color: '#c9cfd6', roughness: 0.8 })
    );
    base.receiveShadow = true;
    base.position.y = 0.06;

    const holder = new Group();
    holder.add(base, body);
    tower.object = holder;
    tower.place(this.pointerWorld.x, this.pointerWorld.z);
    this.root.add(holder);
    this.towers.push(tower);

    this.pendingPlacement = null;
    this.notify(`${species.name} posé`);
  }

  /** Pose un appât sur le dresseur : les ennemis proches s'en détournent. */
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
    let index = 0;
    this.enemies.forEach((enemy) => {
      if (index >= MAX_ENEMIES || enemy.state === 'mort') return;
      enemy.renderAt(alpha, this.tmpVec2);
      this.tmpVec.set(this.tmpVec2.x, 0.55, this.tmpVec2.y);
      this.tmpQuat.setFromAxisAngle(UP, Math.atan2(enemy.x - enemy.prevX, enemy.z - enemy.prevZ));
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.enemyMesh.setMatrixAt(index++, this.tmpMatrix);
    });
    this.enemyMesh.count = index;
    this.enemyMesh.instanceMatrix.needsUpdate = true;

    let shotIndex = 0;
    this.projectiles.forEach((shot) => {
      if (shotIndex >= MAX_PROJECTILES) return;
      this.tmpVec.set(shot.x, 0.6, shot.z);
      this.tmpMatrix.compose(this.tmpVec, IDENTITY_QUAT, this.tmpScale);
      this.projectileMesh.setMatrixAt(shotIndex++, this.tmpMatrix);
    });
    this.projectileMesh.count = shotIndex;
    this.projectileMesh.instanceMatrix.needsUpdate = true;

    this.trainer.renderAt(alpha, this.tmpVec2);
    this.trainer.object?.position.set(this.tmpVec2.x, 0, this.tmpVec2.y);
    // Léger balancement : suffit à ce que le dresseur ne paraisse pas figé.
    this.trainerMesh.rotation.z = Math.sin(this.tick * 0.15) * 0.04;
  }

  dispose(): void {
    this.terrain.dispose();
    this.enemyMesh.dispose();
    this.projectileMesh.dispose();
    this.scene.remove(this.root);
  }
}
