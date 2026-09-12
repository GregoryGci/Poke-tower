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
  LoopOnce,
  type AnimationAction,
  Color,
  CapsuleGeometry,
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
import { WAVES, WaveRunner, vaguesPourNiveau, vaguesTutoriel } from './waves';
import type { OwnedPokemon, PokemonType } from '@/data/types';
import { getSpecies } from '@/data/content';
import { getWeapon, type WeaponModel } from '@/data/weapons';
import { STYLES } from '@/data/types';

const TERRAIN_SIZE = 34;
const PATH_WIDTH = 2.4;
const MAX_PROJECTILES = 512;
/** Capacité d'une foule, par espèce. */
const CROWD_CAPACITY = 128;
/** Pokémon simultanément sur le terrain, doublons compris. */
const MAX_POSES = 6;
/** Identifiant reserve au dresseur dans le bilan de manche. */
export const ARME_OWNER = 'dresseur';
/**
 * Cristaux rapportes par un ennemi abattu.
 *
 * L'invocation coute dix cristaux : a un par tete, une manche en finançait
 * a peine deux. Le gacha doit pouvoir tourner souvent.
 */
const PRIME_KO = 3;
/** Prime versee a chaque vague entierement contenue. */
const PRIME_VAGUE = 12;
/** Prime supplementaire quand la manche est gagnee. */
const PRIME_VICTOIRE = 30;
/** Ennemis qu'on peut laisser passer avant de perdre la manche. */
const VIES = 10;

/**
 * Les modèles Bedrock sont sculptés face à -Z, alors que `atan2(dx, dz)`
 * oriente vers +Z. D'où ce demi-tour.
 *
 * Il ne doit être appliqué qu'à UN seul niveau de la hiérarchie : le porteur.
 * L'avoir aussi sur le modèle enfant le comptait deux fois, ce qui annulait
 * la correction sur les Pokémon posés pendant qu'elle restait juste sur les
 * ennemis — les deux paraissaient donc fautifs à tour de rôle.
 */
const MODEL_FACING = Math.PI;

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

/**
 * Phase de la manche.
 *
 * La preparation laisse poser en paix : les vagues n'avancent pas tant que le
 * joueur n'a pas lance lui-meme la run.
 */
export type Phase = 'preparation' | 'en_cours';

/** Issue de la manche. Tant qu'elle est en cours, rien ne se decide. */
export type Outcome = 'en_cours' | 'victoire' | 'defaite';

/** Ce qu'un Pokémon a accompli pendant la manche. */
export interface ContributionPokemon {
  ownedId: string;
  speciesId: string;
  degats: number;
  kills: number;
}

/** Bilan chiffré d'une manche, lu par l'écran de fin. */
export interface RapportManche {
  parPokemon: ContributionPokemon[];
  parType: Array<{ type: PokemonType; degats: number }>;
  degatsTotal: number;
}

export interface GameStatus {
  wave: number;
  totalWaves: number;
  alive: number;
  leaked: number;
  crystals: number;
  placed: number;
  drawCalls: number;
  /** Points de vie restants de la tour. */
  lives: number;
  outcome: Outcome;
  phase: Phase;
  /** Places restantes sur le terrain. */
  slotsLibres: number;
  maxPoses: number;
  /** Le joueur a-t-il déjà déplacé son dresseur ? */
  trainerMoved: boolean;
  message: string | null;
}

interface TowerVisual {
  object: Object3D;
  mixer: AnimationMixer | null;
  idle: AnimationAction | null;
  attack: AnimationAction | null;
  /** Avance de l'unité vers sa cible au moment du tir, de 1 à 0. */
  lunge: number;
  /** Phase de respiration, pour les espèces sans clip de repos. */
  phase: number;
  breathing: boolean;
}

interface SpeciesCrowd {
  crowd: Crowd;
  walk: BakedClip | null;
  idle: BakedClip | null;
  /** Agonie. Absente chez certaines espèces : l'unité disparaît alors sans mise en scène. */
  faint: BakedClip | null;
}

export class Game {
  readonly root = new Group();

  private readonly terrain: Terrain;
  private readonly waves: WaveRunner;
  private readonly enemyGrid = new SpatialGrid<Enemy>(4);

  private readonly enemies = new Pool<Enemy>(() => new Enemy(), 64);
  private readonly projectiles = new Pool<Projectile>(() => new Projectile(), 128);
  private readonly towers: Tower[] = [];
  private readonly trainer = new Trainer();
  /** Arme portee par le dresseur. Il tire seul sur ce qui passe a portee. */
  private arme: WeaponModel | null = null;
  private armeTimer = 0;

  /** Une foule par espèce d'ennemi, construite au chargement. */
  private readonly crowds = new Map<string, SpeciesCrowd>();
  /**
   * État d'animation d'un Pokémon posé.
   *
   * Toutes les espèces n'ont pas de clip de combat : Cobblemon n'en fournit
   * que pour une partie du Pokédex. On prévoit donc un repli gestuel, pour
   * qu'un tir se voie toujours.
   */
  private readonly towerVisuals: TowerVisual[] = [];

  private readonly projectileMesh: InstancedMesh;
  private readonly ghostRange: Mesh;
  private ghostModel: Object3D | null = null;
  private ghostSpeciesId: string | null = null;
  private readonly trainerMesh: Group;

  private readonly raycaster = new Raycaster();
  private readonly pointerWorld = new Vector3();
  private pointerValid = false;

  private phase: Phase = 'preparation';
  /** Dégâts et éliminations par Pokémon posé, pour le bilan de fin. */
  private readonly contributions = new Map<string, ContributionPokemon>();
  /** Dégâts cumulés par type d'attaque. */
  private readonly degatsParType = new Map<PokemonType, number>();
  private leaked = 0;
  private crystals = 0;
  private trainerMoved = false;
  private message: string | null = null;
  private messageUntil = 0;
  private tick = 0;

  pendingPlacement: OwnedPokemon | null = null;
  /** Prevenu quand le joueur saisit la camera au clic gauche. */
  onCameraLibre: (() => void) | null = null;

  private readonly tmpMatrix = new Matrix4();
  private readonly tmpVec = new Vector3();
  private readonly tmpVec2 = new Vector2();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpFocus = new Vector3();

  private constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
    niveau: number,
    tutoriel: boolean,
    armeId: string | null
  ) {
    this.arme = armeId ? getWeapon(armeId) : null;
    this.waves = new WaveRunner(tutoriel ? vaguesTutoriel() : vaguesPourNiveau(niveau));
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

    const trainerHolder = new Group();
    this.trainerMesh = construireDresseur();
    trainerHolder.add(this.trainerMesh);
    this.trainer.object = trainerHolder;
    this.trainer.bounds = PLACEMENT_RULES.bounds;
    this.trainer.place(-12, -8);
    this.root.add(trainerHolder);

    this.scene.add(this.root);

    this.input.onClick((button) => {
      if (button === 0) {
        // Sans Pokemon selectionne, le clic gauche sert a saisir la camera
        // plutot qu'a poser dans le vide.
        if (this.pendingPlacement) void this.tryPlace();
        else this.onCameraLibre?.();
      }
      if (button === 2) this.pendingPlacement = null;
    });
  }

  /**
   * Charge et cuit les modèles avant la première image : une cuisson en cours
   * de partie se verrait comme un à-coup.
   */
  static async create(
    scene: Scene,
    camera: PerspectiveCamera,
    input: InputState,
    rosterSpeciesIds: readonly string[],
    niveau = 1,
    tutoriel = false,
    armeId: string | null = null
  ): Promise<Game> {
    const game = new Game(scene, camera, input, niveau, tutoriel, armeId);

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
          walk: crowd.resolveClip('ground_walk', 'ground_idle') ?? crowd.anyClip(),
          idle: crowd.resolveClip('ground_idle', 'ground_walk') ?? crowd.anyClip(),
          faint: crowd.resolveClip('faint', 'recoil'),
        });
        game.root.add(crowd.mesh);
      } catch (error) {
        // Une espèce sans animation cuisible ne doit pas empêcher de jouer.
        console.warn(`Foule indisponible pour ${speciesId} :`, error);
      }
    }

    return game;
  }

  private get outcome(): Outcome {
    if (this.phase === 'preparation') return 'en_cours';
    if (this.leaked >= VIES) return 'defaite';
    // Victoire seulement une fois le terrain vide : une vague epuisee dont les
    // derniers ennemis marchent encore n'est pas gagnee.
    if (this.waves.done && this.enemies.activeCount === 0) return 'victoire';
    return 'en_cours';
  }

  get status(): GameStatus {
    return {
      wave: this.waves.currentWave,
      totalWaves: this.waves.totalWaves,
      alive: this.enemies.activeCount,
      leaked: this.leaked,
      crystals: this.crystals,
      placed: this.towers.length,
      lives: Math.max(0, VIES - this.leaked),
      slotsLibres: Math.max(0, MAX_POSES - this.towers.length),
      maxPoses: MAX_POSES,
      outcome: this.outcome,
      phase: this.phase,
      trainerMoved: this.trainerMoved,
      // Une foule par espèce visible, plus les projectiles et le décor.
      drawCalls: [...this.crowds.values()].filter((c) => c.crowd.mesh.count > 0).length
        + (this.projectileMesh.count > 0 ? 1 : 0)
        + this.towers.length,
      message: this.message,
    };
  }

  /* ---------- Simulation ---------- */

  /** Ouvre les hostilites. Sans effet si la manche a deja commence. */
  lancerRun(): void {
    if (this.phase !== 'preparation') return;
    this.phase = 'en_cours';
    // Les reperes de direction ont fait leur office.
    this.terrain.fleches.visible = false;
    this.notify('La vague arrive');
  }

  update(dt: number, tick: number): void {
    this.tick = tick;
    if (this.message && tick > this.messageUntil) this.message = null;

    this.trainer.update(dt, this.input.move);
    if (!this.trainerMoved && this.input.move.lengthSq() > 0.01) this.trainerMoved = true;

    this.enemyGrid.clear();
    this.enemies.forEach((enemy) => {
      if (enemy.active) this.enemyGrid.insert(enemy);
    });

    // En preparation, le temps de jeu est suspendu : ni vagues, ni tirs.
    const evenements = this.phase === 'en_cours' ? this.waves.update(dt, this.countMarching()) : [];
    for (const event of evenements) {
      if (event.kind === 'spawn') {
        this.spawnEnemy(event.request.species.id, event.request.hp, event.request.speed);
      }
      if (event.kind === 'waveCleared') {
        this.crystals += PRIME_VAGUE;
        this.notify(`Vague ${event.index + 1} tenue — +${PRIME_VAGUE} cristaux`);
      }
      if (event.kind === 'allCleared') {
        this.crystals += PRIME_VICTOIRE;
        this.notify(`Terrain tenu — +${PRIME_VICTOIRE} cristaux`);
      }
    }

    this.enemies.forEach((enemy) => {
      enemy.update(dt);

      if (enemy.state === 'arrive') {
        this.leaked++;
        this.enemies.release(enemy);
        return;
      }

      if (enemy.state === 'mort') {
        // Coup fatal : on encaisse la récompense une seule fois, puis on laisse
        // l'agonie se jouer avant de rendre l'unité au réservoir.
        this.crystals += PRIME_KO;
        const entry = this.crowds.get(enemy.speciesId);
        const faint = entry?.faint ?? null;
        if (faint && entry) {
          enemy.state = 'ko';
          enemy.corpseTimer = faint.duration;
          // La phase est recalée pour que l'agonie démarre à sa première image.
          enemy.phase = entry.crowd.phaseForStartNow();
        } else {
          this.enemies.release(enemy);
        }
        return;
      }

      if (enemy.state === 'ko') {
        enemy.corpseTimer -= dt;
        if (enemy.corpseTimer <= 0) this.enemies.release(enemy);
      }
    });

    for (let i = 0; i < this.towers.length; i++) {
      const tower = this.towers[i]!;
      const target = tower.update(dt, this.enemyGrid);
      if (!target || this.projectiles.activeCount >= MAX_PROJECTILES) continue;
      const tir = this.projectiles.acquire();
      tir.launch(tower.x, tower.z, target, tower.damage, 14, tower.style);
      tir.ownerId = tower.owned.id;
      tir.moveType = tower.move.type;
      this.playAttack(this.towerVisuals[i]);
    }

    this.tirerAvecArme(dt);

    this.projectiles.forEach((shot) => {
      if (!shot.update(dt)) return;
      this.appliquerImpact(shot);
      this.projectiles.release(shot);
    });

    for (const visual of this.towerVisuals) {
      visual.mixer?.update(dt);
      if (visual.lunge > 0) visual.lunge = Math.max(0, visual.lunge - dt * 3.5);
    }
    for (const { crowd } of this.crowds.values()) crowd.advance(dt);

    this.updatePointer();
  }

  /**
   * Distribue les degats d'un tir arrive a destination.
   *
   * Le style decide de qui encaisse : la cible seule, tout un couloir, ou
   * tout ce qui se trouve autour du point d'impact.
   */
  private appliquerImpact(shot: Projectile): void {
    const style = shot.style;
    if (!style) return;

    if (style.rayon > 0) {
      this.enemyGrid.queryRadius(shot.x, shot.z, style.rayon, (enemy) => {
        if (!enemy.active) return;
        const dx = enemy.x - shot.x;
        const dz = enemy.z - shot.z;
        if (dx * dx + dz * dz > style.rayon * style.rayon) return;
        const inflige = Math.min(shot.damage, enemy.hp);
        this.crediter(shot, inflige, enemy.damage(shot.damage));
      });
      return;
    }

    if (style.couloir > 0) {
      // Tout ce qui se trouve entre le tireur et le point d'impact est touche.
      const dx = shot.x - shot.fromX;
      const dz = shot.z - shot.fromZ;
      const longueur = Math.hypot(dx, dz);
      if (longueur < 1e-3) return;
      const ux = dx / longueur;
      const uz = dz / longueur;
      const milieuX = (shot.fromX + shot.x) / 2;
      const milieuZ = (shot.fromZ + shot.z) / 2;

      this.enemyGrid.queryRadius(milieuX, milieuZ, longueur / 2 + style.couloir, (enemy) => {
        if (!enemy.active) return;
        const rx = enemy.x - shot.fromX;
        const rz = enemy.z - shot.fromZ;
        const avance = rx * ux + rz * uz;
        if (avance < 0 || avance > longueur) return;
        const ecart = Math.abs(rx * -uz + rz * ux);
        if (ecart > style.couloir) return;
        const inflige = Math.min(shot.damage, enemy.hp);
        this.crediter(shot, inflige, enemy.damage(shot.damage));
      });
      return;
    }

    if (shot.target?.active) {
      const inflige = Math.min(shot.damage, shot.target.hp);
      this.crediter(shot, inflige, shot.target.damage(shot.damage));
    }
  }

  /** Position du dresseur, cible du suivi de camera. */
  get positionDresseur(): Vector3 {
    return this.tmpFocus.set(this.trainer.x, 0, this.trainer.z);
  }

  /** Rapport de manche, construit à la demande. */
  get rapport(): RapportManche {
    const parPokemon = [...this.contributions.values()].sort((a, b) => b.degats - a.degats);
    const parType = [...this.degatsParType.entries()]
      .map(([type, degats]) => ({ type, degats }))
      .sort((a, b) => b.degats - a.degats);
    return {
      parPokemon,
      parType,
      degatsTotal: parPokemon.reduce((total, c) => total + c.degats, 0),
    };
  }

  /**
   * Impute des dégâts à leur auteur.
   *
   * On ne crédite que ce qui a réellement été encaissé : le surplus infligé à
   * une cible déjà presque morte gonflerait le bilan sans rien changer au jeu.
   */
  private crediter(shot: Projectile, degats: number, tue: boolean): void {
    if (!shot.ownerId) return;
    let contribution = this.contributions.get(shot.ownerId);
    if (!contribution) {
      if (shot.ownerId === ARME_OWNER) {
        contribution = { ownedId: ARME_OWNER, speciesId: ARME_OWNER, degats: 0, kills: 0 };
      } else {
        const tour = this.towers.find((candidate) => candidate.owned.id === shot.ownerId);
        if (!tour) return;
        contribution = { ownedId: shot.ownerId, speciesId: tour.owned.speciesId, degats: 0, kills: 0 };
      }
      this.contributions.set(shot.ownerId, contribution);
    }
    contribution.degats += degats;
    if (tue) contribution.kills += 1;
    if (shot.moveType) {
      this.degatsParType.set(shot.moveType, (this.degatsParType.get(shot.moveType) ?? 0) + degats);
    }
  }

  /**
   * Le dresseur tire seul sur ce qui passe a portee.
   *
   * Viser a la souris obligerait a choisir entre se deplacer et tirer, alors
   * que son interet est justement d'etre la piece mobile du terrain.
   */
  private tirerAvecArme(dt: number): void {
    if (!this.arme || this.phase !== 'en_cours') return;
    this.armeTimer -= dt;
    if (this.armeTimer > 0) return;

    const cible = this.enemyGrid.nearest(
      this.trainer.x,
      this.trainer.z,
      this.arme.range,
      (enemy) => enemy.active
    );
    if (!cible) return;

    this.armeTimer = this.arme.cooldown;
    if (this.projectiles.activeCount >= MAX_PROJECTILES) return;

    const tir = this.projectiles.acquire();
    tir.launch(this.trainer.x, this.trainer.z, cible, this.arme.damage, 22, STYLES[this.arme.style]);
    tir.ownerId = ARME_OWNER;
    tir.moveType = null;
  }

  private countMarching(): number {
    let count = 0;
    this.enemies.forEach((enemy) => {
      if (enemy.active) count++;
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

    if (this.towers.length >= MAX_POSES) {
      this.notify(`Terrain plein — ${MAX_POSES} Pokémon au maximum`);
      return;
    }

    const check = canPlace(this.pointerWorld.x, this.pointerWorld.z, LEVEL_PATH, this.towers, PLACEMENT_RULES);
    if (!check.ok) {
      this.notify(REJECTION_LABELS[check.reason]);
      return;
    }

    const species = getSpecies(pending.speciesId);
    const x = this.pointerWorld.x;
    const z = this.pointerWorld.z;
    this.pendingPlacement = null;

    // La tour est enregistrée avant le chargement du modèle, qui est
    // asynchrone : sans cela deux clics rapides passeraient tous les deux et
    // dépasseraient la limite. Elle est positionnée dès maintenant pour que
    // les règles de pose la voient, et reçoit son visuel une fois chargé.
    const tower = new Tower(pending, species);
    tower.place(x, z);
    this.towers.push(tower);

    const holder = new Group();

    const base = new Mesh(
      new CylinderGeometry(0.5, 0.55, 0.1, 16),
      new MeshStandardMaterial({ color: '#c9cfd6', roughness: 0.8 })
    );
    base.receiveShadow = true;
    base.position.y = 0.05;
    holder.add(base);

    const { object, clips } = await instantiate(species.model);
    holder.add(object);

    const idleClip = pickClip(clips, 'ground_idle', 'battle_idle', 'ground_walk');
    const attackClip = pickClip(clips, 'physical', 'special', 'cry');

    const visual: TowerVisual = {
      object,
      mixer: null,
      idle: null,
      attack: null,
      lunge: 0,
      phase: Math.random() * Math.PI * 2,
      breathing: !idleClip,
    };

    if (idleClip || attackClip) {
      const mixer = new AnimationMixer(object);
      visual.mixer = mixer;
      if (idleClip) {
        visual.idle = mixer.clipAction(idleClip);
        visual.idle.play();
        // Chaque unité démarre à un instant différent de son cycle.
        mixer.setTime(Math.random() * idleClip.duration);
      }
      if (attackClip) {
        visual.attack = mixer.clipAction(attackClip);
        visual.attack.setLoop(LoopOnce, 1);
        visual.attack.clampWhenFinished = false;
        // Le repos reprend la main dès que le tir est joué.
        mixer.addEventListener('finished', (event) => {
          if ((event as unknown as { action: AnimationAction }).action === visual.attack) {
            visual.idle?.setEffectiveWeight(1);
          }
        });
      }
    }

    if (!idleClip) {
      console.info(`${species.name} : pas d'animation de repos, respiration procédurale.`);
    }
    if (!attackClip) {
      console.info(`${species.name} : pas d'animation d'attaque, repli gestuel.`);
    }

    this.towerVisuals.push(visual);

    holder.rotation.y = MODEL_FACING;
    tower.object = holder;
    tower.place(x, z);
    this.root.add(holder);
    this.notify(`${species.name} posé`);
  }

  /**
   * Joue le tir.
   *
   * Quand l'espèce a un clip d'attaque, il est lancé une fois par-dessus le
   * repos. Sinon l'unité se jette en avant : c'est rudimentaire, mais un tir
   * sans réaction visible se lit très mal, et Cobblemon ne fournit d'animation
   * de combat que pour une petite partie du Pokédex.
   */
  private playAttack(visual: TowerVisual | undefined): void {
    if (!visual) return;
    if (visual.attack) {
      // Le repos est mis en veille le temps du tir : laisser les deux clips
      // actifs les mélangerait à poids égal, et l'attaque perdrait la moitié
      // de son amplitude.
      visual.idle?.setEffectiveWeight(0);
      visual.attack.reset();
      visual.attack.setEffectiveWeight(1);
      visual.attack.play();
      return;
    }
    visual.lunge = 1;
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
      const clip = enemy.state === 'ko' ? entry.faint : enemy.active ? entry.walk : entry.idle;
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
    for (let i = 0; i < this.towerVisuals.length; i++) {
      const visual = this.towerVisuals[i]!;
      if (visual.breathing) {
        const amount = Math.sin(breath + visual.phase) * 0.03;
        visual.object.scale.set(1 - amount * 0.5, 1 + amount, 1 - amount * 0.5);
      }
      // Le repli gestuel : l'unité se jette en avant puis revient.
      if (visual.lunge > 0) {
        visual.object.position.z = Math.sin(visual.lunge * Math.PI) * 0.35;
      } else if (visual.object.position.z !== 0) {
        visual.object.position.z = 0;
      }
    }

    this.trainer.renderAt(alpha, this.tmpVec2);
    this.trainer.object?.position.set(this.tmpVec2.x, 0, this.tmpVec2.y);
    this.trainerMesh.rotation.z = Math.sin(this.tick * 0.15) * 0.035;
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
function construireDresseur(): Group {
  const dresseur = new Group();

  const veste = new MeshStandardMaterial({ color: '#2f5fa8', roughness: 0.62 });
  const peau = new MeshStandardMaterial({ color: '#e8c39a', roughness: 0.85 });
  const casquette = new MeshStandardMaterial({ color: '#c8452f', roughness: 0.6 });
  const jean = new MeshStandardMaterial({ color: '#3a4658', roughness: 0.8 });

  const jambes = new Mesh(new CylinderGeometry(0.19, 0.22, 0.42, 12), jean);
  jambes.position.y = 0.21;

  const corps = new Mesh(new CapsuleGeometry(0.21, 0.3, 4, 12), veste);
  corps.position.y = 0.67;

  const tete = new Mesh(new SphereGeometry(0.2, 16, 12), peau);
  tete.position.y = 1.05;

  const calotte = new Mesh(
    new SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    casquette
  );
  calotte.position.y = 1.06;

  // La visière pointe vers -Z, comme le regard des modèles convertis.
  const visiere = new Mesh(
    new CylinderGeometry(0.2, 0.2, 0.04, 14, 1, false, 0, Math.PI),
    casquette
  );
  visiere.position.set(0, 1.04, -0.11);

  const sac = new Mesh(new CapsuleGeometry(0.12, 0.14, 3, 8), casquette);
  sac.position.set(0, 0.68, 0.2);

  for (const piece of [jambes, corps, tete, calotte, visiere, sac]) {
    piece.castShadow = true;
    dresseur.add(piece);
  }
  return dresseur;
}

/**
 * Silhouette du dresseur — voir construireDresseur ci-dessus.
 *
 * En vue plongeante, ce qui identifie un personnage est sa tête et sa
 * casquette, pas son corps. La visière donne en prime une direction lisible
 * d'un coup d'œil, ce qu'un cône ne pouvait pas offrir.
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
