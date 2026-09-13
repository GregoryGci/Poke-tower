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
  CircleGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
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
import { genererCarte, type ElementDecor } from '@/world/level-gen';
import { construireDecor, type Decor } from '@/world/decor';
import { bakeAnimations, Crowd, type BakedClip } from '@/render/vat';
import { BarresVie } from '@/render/health-bars';
import { canPlace, REJECTION_LABELS, type Obstacle, type PlacementRules } from './placement';
import type { Instantane, Intention, TourRepliquee } from '@/net/protocole';
import {
  sonFuite,
  sonImpact,
  sonPalier,
  sonPose,
  sonVagueLancee,
  sonVagueTenue,
} from '@/audio/sons';
import {
  WAVES,
  WaveRunner,
  especesDuNiveau,
  vaguesDeRaid,
  vaguesDuNiveau,
  vaguesTutoriel,
} from './waves';
import { getMonde, niveauParIndex, type Niveau } from '@/data/campaign';
import type { OwnedPokemon, PokemonType } from '@/data/types';
import { getSpecies } from '@/data/content';
import { PALIER_MAX, PIECES_DEPART, PIECES_KO, PIECES_VAGUE, coutPalier } from '@/data/paliers';
import { affinite } from '@/data/affinites';
import { itemsEquipes, type OwnedItem } from '@/data/items';
import { statsArme, type StatsArme } from '@/data/weapon-upgrade';
import type { OwnedWeapon } from '@/data/types';
import { STYLES } from '@/data/types';

const TERRAIN_SIZE = 34;
const PATH_WIDTH = 2.4;
const MAX_PROJECTILES = 512;
/** Apercus d'attaque affiches simultanement. */
const MAX_APERCUS = 24;
/**
 * Rayon de saisie du survol, en unites monde.
 *
 * Genereux a dessein : viser un modele de deux unites de haut depuis une
 * camera plongeante est plus dur qu'il n'y parait, et rater le survol donne
 * l'impression que la fonction ne marche pas.
 */
const RAYON_SURVOL = 1.3;
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
 * Grossissement de l'aperçu quand c'est l'ultime qui part.
 *
 * L'aperçu est la seule chose qui annonce un gros coup avant qu'il tombe : à
 * taille égale avec celui de l'auto-attaque, rien ne distinguait les deux et
 * le palier 3 ne se voyait pas sur le terrain.
 */
const APERCU_ULTIME = 1.55;

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

/**
 * Trace de repli.
 *
 * Il ne sert qu'au tutoriel, dont la carte doit rester la meme a chaque
 * tentative et rester simple : un tracé généré, même propre, distrairait de
 * ce qu'il y a à comprendre.
 */
const TUTORIAL_PATH = new EnemyPath([
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
  /** Monnaie interne à la manche, dépensée sur les paliers. */
  pokepieces: number;
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
  /** Pokémon posé actuellement sélectionné, pour le panneau de paliers. */
  selection: SelectionTour | null;
  message: string | null;
}

/**
 * Ce que le joueur lit et décide sur un Pokémon déjà posé.
 *
 * Le panneau répond à une seule question : est-ce que je monte celui-là
 * maintenant, ou est-ce que je garde mes pièces ? Tout ce qui n'y répond pas
 * reste dans l'infobulle de survol.
 */
export interface SelectionTour {
  ownedId: string;
  nom: string;
  palier: number;
  palierMax: number;
  /** Coût du palier suivant en Poképièces, ou null au maximum. */
  cout: number | null;
  /** Assez de pièces en caisse pour l'acheter. */
  abordable: boolean;
  /** Nom de l'ultime, et s'il est déjà utilisable. */
  ultime: string;
  ultimeDebloque: boolean;
}

/**
 * Ce que le joueur lit en survolant un Pokemon pose.
 *
 * Le survol repond a une question precise : pourquoi celui-la ne tire pas ?
 * On donne donc l'attaque retenue, les degats reels — pas la puissance du
 * Pokedex — et l'etat de la recharge, qui est presque toujours la reponse.
 */
export interface SurvolTour {
  ownedId: string;
  nom: string;
  attaque: string;
  typeAttaque: PokemonType;
  style: string;
  /** Degats par tir, tous multiplicateurs appliques. */
  degats: number;
  cooldown: number;
  /** Temps d'incantation de l'attaque retenue, en secondes. */
  cast: number;
  recharge: number;
  /** Part d'attente restante, de 0 a 1 : incantation ou recharge. */
  rechargePart: number;
  /** Vrai si l'unite est en train de s'incanter. */
  enIncantation: boolean;
  portee: number;
  /** Vrai si l'unite tient une cible a portee. */
  enAction: boolean;
  /**
   * Efficacité de l'attaque contre la cible tenue, ou null sans cible.
   *
   * C'est la réponse à « pourquoi il ne fait rien ? » quand la recharge n'est
   * pas en cause : le type.
   */
  affinite: number | null;
  degatsInfliges: number;
  kills: number;
  /** Palier de manche, et le maximum atteignable. */
  palier: number;
  palierMax: number;
  /** Ultime porté, et sa recharge quand il est débloqué. */
  ultime: string;
  ultimeDebloque: boolean;
  rechargeUltime: number | null;
  /** Position du sujet en coordonnees ecran normalisees, de -1 a 1. */
  ndcX: number;
  ndcY: number;
}

/** Un apercu d'attaque : une forme rouge posee au sol, le temps d'un tir. */
interface Apercu {
  mesh: Mesh;
  restant: number;
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

/* ---------- Répliques : ce que l'invité affiche sans le simuler ---------- */

/**
 * Un ennemi vu par l'invité.
 *
 * Deux positions : celle affichée, et celle qu'a annoncée le dernier
 * instantané. L'affichée rattrape l'annoncée en douceur. Les instantanés
 * arrivent à dix par seconde et le rendu tourne à soixante : coller
 * directement la position reçue donnerait une marche saccadée à dix images
 * par seconde, alors que le mouvement est parfaitement régulier.
 */
interface EnnemiDistant {
  espece: string;
  x: number;
  z: number;
  cibleX: number;
  cibleZ: number;
  vie: number;
  echelle: number;
  angle: number;
  boss: boolean;
  phase: number;
  /** Vrai tant que le dernier instantané l'a mentionné. */
  vu: boolean;
}

interface TourDistante {
  holder: Group;
  espece: string;
  palier: number;
  joueur: string;
}

interface DresseurDistant {
  mesh: Group;
  x: number;
  z: number;
  cibleX: number;
  cibleZ: number;
}

export class Game {
  readonly root = new Group();

  private readonly terrain: Terrain;
  private readonly decor: Decor | null;
  /** Trace du niveau : genere, ou celui du tutoriel. */
  private readonly path: EnemyPath;
  /** Encombrements du terrain, pour les regles de pose. */
  private readonly obstacles: readonly Obstacle[];
  /** Niveau joue, pour l'afficher et pour le bilan. */
  readonly niveau: Niveau;
  private readonly waves: WaveRunner;
  private readonly enemyGrid = new SpatialGrid<Enemy>(4);

  private readonly enemies = new Pool<Enemy>(() => new Enemy(), 64);
  private readonly projectiles = new Pool<Projectile>(() => new Projectile(), 128);
  private readonly towers: Tower[] = [];
  private readonly trainer = new Trainer();
  /** Arme portee par le dresseur. Il tire seul sur ce qui passe a portee. */
  private arme: StatsArme | null = null;
  private armeTimer = 0;
  /** Temps de visée restant avant le tir du dresseur. */
  private armeCast = 0;

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

  /**
   * Barres de vie de tous les ennemis.
   *
   * Deux appels de rendu pour cent unites : sans instanciation, elles
   * couteraient plus cher que les ennemis qu'elles surmontent.
   */
  private readonly barresVie = new BarresVie({ capacite: 256 });
  private readonly projectileMesh: InstancedMesh;
  private readonly ghostRange: Mesh;
  /** Anneau posé au sol là où le dresseur se rend. */
  private readonly repereDestination: Mesh;
  private ghostModel: Object3D | null = null;
  private ghostSpeciesId: string | null = null;
  private readonly trainerMesh: Group;

  private readonly raycaster = new Raycaster();
  private readonly pointerWorld = new Vector3();
  private pointerValid = false;
  /** Pokemon pose sous le curseur, quand aucun placement n'est en cours. */
  private survolTour: Tower | null = null;

  /**
   * Apercus d'attaque.
   *
   * Trois formes suffisent a dire ce qui va etre touche : un disque pour la
   * zone et le corps a corps, un couloir pour ce qui transperce, un trait
   * pour la cible unique. Volontairement sans effet : c'est une lecture de
   * portee, pas une animation de sort.
   */
  private readonly apercus: Apercu[] = [];
  private readonly apercusGroup = new Group();

  private phase: Phase = 'preparation';
  /** Dégâts et éliminations par Pokémon posé, pour le bilan de fin. */
  private readonly contributions = new Map<string, ContributionPokemon>();
  /** Dégâts cumulés par type d'attaque. */
  private readonly degatsParType = new Map<PokemonType, number>();
  private leaked = 0;
  private crystals = 0;
  /**
   * Poképièces en caisse.
   *
   * Elles ne sortent jamais de la manche : rien ne les écrit dans le compte,
   * et l'objet Game est détruit à la fin. C'est exactement ce qu'on attend
   * d'une monnaie de partie.
   */
  private pokepieces = PIECES_DEPART;
  /** Pokémon posé sélectionné, cible des achats de palier. */
  private tourSelectionnee: Tower | null = null;
  private trainerMoved = false;
  private message: string | null = null;
  private messageUntil = 0;
  private tick = 0;

  pendingPlacement: OwnedPokemon | null = null;

  /* ---------- Coopération ---------- */

  /**
   * Rôle de ce client.
   *
   * `solo` est le cas ordinaire et ne traverse aucun chemin réseau. `hote`
   * simule et publie ; `invite` ne simule rien du tout, il affiche ce qu'on
   * lui envoie et demande le reste.
   */
  reseau: 'solo' | 'hote' | 'invite' = 'solo';

  /** Où partent les intentions de l'invité. Posé par la boucle de manche. */
  envoyerIntention: ((intention: Intention) => void) | null = null;

  /** Identifiant du joueur local dans la partie en réseau. */
  joueurLocal = 'moi';

  /**
   * Nombre total de Pokémon posables sur le terrain.
   *
   * Variable et non constante : à deux, chacun garde ses six places. Un
   * plafond partagé transformerait la coopération en course à la pose.
   */
  maxPoses = MAX_POSES;

  /** Équipes des autres joueurs, figées à l'entrée en partie. */
  private readonly equipesDistantes = new Map<string, readonly OwnedPokemon[]>();
  private readonly objetsDistants = new Map<string, readonly OwnedItem[]>();
  /** À qui appartient chaque tour posée. Vide en solo. */
  private readonly proprietaires = new Map<string, string>();

  /** Ce que l'hôte a envoyé en dernier, côté invité. */
  private readonly ennemisDistants = new Map<number, EnnemiDistant>();
  private readonly toursDistantes = new Map<string, TourDistante>();
  private readonly dresseursDistants = new Map<string, DresseurDistant>();
  private etatDistant: Instantane | null = null;
  private selectionDistante: string | null = null;
  private prochainIdEnnemi = 1;
  private horlogeDresseur = 0;
  private derniereImageDecor = performance.now();
  /**
   * Inventaire d'objets du compte, pour équiper les Pokémon posés.
   *
   * Le jeu ne connaît pas le compte : on lui passe la liste, ce qui garde la
   * manche indépendante de la couche de sauvegarde.
   */
  inventaireItems: readonly OwnedItem[] = [];

  private readonly tmpMatrix = new Matrix4();
  private readonly tmpVec = new Vector3();
  private readonly tmpVec2 = new Vector2();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpFocus = new Vector3();

  private constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
    niveau: Niveau,
    tutoriel: boolean,
    arme: OwnedWeapon | null,
    /**
     * Multiplicateur de points de vie d'un raid, ou null pour une manche
     * ordinaire. C'est lui qui distingue les deux formes de vague : une
     * campagne enchaîne des vagues séparées, un raid n'en a qu'une.
     */
    vieRaid: number | null
  ) {
    this.arme = arme ? statsArme(arme) : null;
    this.niveau = niveau;
    this.waves = new WaveRunner(
      tutoriel
        ? vaguesTutoriel()
        : vieRaid !== null
          ? vaguesDeRaid(niveau, vieRaid)
          : vaguesDuNiveau(niveau)
    );

    // La carte est tiree de l'identifiant du niveau : deux tentatives du meme
    // niveau donnent la meme carte, ce qui permet de preparer un placement.
    const theme = getMonde(niveau.mondeId).theme;
    if (tutoriel) {
      this.path = TUTORIAL_PATH;
      this.obstacles = [];
      this.decor = null;
    } else {
      const carte = genererCarte(niveau, PLACEMENT_RULES.bounds, PLACEMENT_RULES.pathClearance);
      this.path = new EnemyPath(carte.points);
      this.obstacles = carte.decor.map((element: ElementDecor) => ({
        x: element.x,
        z: element.z,
        rayon: element.rayon,
      }));
      this.decor = construireDecor(carte.decor, theme);
    }
    this.terrain = createTerrain(this.path, {
      size: TERRAIN_SIZE,
      pathWidth: PATH_WIDTH,
      theme,
    });
    if (this.decor) this.root.add(this.decor.group);
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

    // Repère de destination : sans lui, un clic manqué sur le terrain ne
    // donne aucun retour, et on ne sait pas si le jeu a entendu.
    this.repereDestination = new Mesh(
      new RingGeometry(0.34, 0.5, 24),
      new MeshBasicMaterial({ color: '#2f5fa8', transparent: true, opacity: 0.7, depthWrite: false })
    );
    this.repereDestination.rotation.x = -Math.PI / 2;
    this.repereDestination.renderOrder = 2;
    this.repereDestination.visible = false;
    this.root.add(this.repereDestination);

    this.construireApercus();
    this.root.add(this.apercusGroup);
    this.root.add(this.barresVie.fond, this.barresVie.jauge);

    const trainerHolder = new Group();
    this.trainerMesh = construireDresseur();
    trainerHolder.add(this.trainerMesh);
    this.trainer.object = trainerHolder;
    this.trainer.bounds = PLACEMENT_RULES.bounds;
    this.trainer.place(-12, -8);
    this.root.add(trainerHolder);

    this.scene.add(this.root);

    // Le clic gauche fait trois choses, dans cet ordre : il pose le Pokémon
    // en attente, il ouvre celui qui est sous le curseur, ou — à défaut — il
    // envoie le dresseur là où on a cliqué. L'ordre compte : poser et
    // sélectionner sont des gestes visés, se déplacer est ce qui reste.
    this.input.onClick((button) => {
      if (button === 0) {
        if (this.pendingPlacement) {
          void this.tryPlace();
        } else if (this.survolTour) {
          this.tourSelectionnee = this.survolTour;
        } else if (this.reseau === 'invite' && this.tourDistanteSous()) {
          // Chez l'invité le terrain est vide d'objets de jeu : la saisie
          // porte sur les répliques, seules choses qui existent chez lui.
          this.selectionDistante = this.tourDistanteSous();
        } else if (this.pointerValid) {
          this.tourSelectionnee = null;
          this.selectionDistante = null;
          this.trainer.allerVers(this.pointerWorld.x, this.pointerWorld.z);
        }
      }
      if (button === 2) {
        // Le clic droit annule : une pose en cours, sinon le panneau ouvert.
        // Il sert aussi à tourner la vue, mais seul un vrai glisser le fait.
        this.pendingPlacement = null;
        this.tourSelectionnee = null;
        this.selectionDistante = null;
      }
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
    niveau: Niveau | number = 1,
    tutoriel = false,
    arme: OwnedWeapon | null = null,
    vieRaid: number | null = null
  ): Promise<Game> {
    // Un numero suffit a designer un niveau : les appels anciens continuent
    // donc de marcher, et le tutoriel n'a pas a connaitre la campagne.
    const cible = typeof niveau === 'number' ? niveauParIndex(niveau) : niveau;
    const game = new Game(scene, camera, input, cible, tutoriel, arme, vieRaid);

    const enemySpecies = tutoriel
      ? [...new Set(WAVES.flatMap((wave) => wave.batches.map((b) => b.speciesId)))]
      : especesDuNiveau(cible);
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
    // L'invité ne simule rien : ses compteurs sont ceux de l'hôte. Les
    // recalculer localement donnerait un HUD qui contredit ce qu'on voit.
    const distant = this.reseau === 'invite' ? this.etatDistant : null;
    if (distant) {
      const miennes = distant.tours.filter((tour) => tour.j === this.joueurLocal).length;
      return {
        wave: distant.vague,
        totalWaves: distant.vagues,
        alive: distant.ennemis.length,
        leaked: VIES - distant.vies,
        crystals: distant.cristaux,
        pokepieces: distant.pieces,
        placed: distant.tours.length,
        lives: distant.vies,
        slotsLibres: Math.max(0, MAX_POSES - miennes),
        maxPoses: MAX_POSES,
        outcome: distant.issue,
        phase: distant.phase,
        trainerMoved: this.trainerMoved,
        selection: this.selection,
        drawCalls: [...this.crowds.values()].filter((c) => c.crowd.mesh.count > 0).length,
        message: this.message,
      };
    }
    return {
      wave: this.waves.currentWave,
      totalWaves: this.waves.totalWaves,
      alive: this.enemies.activeCount,
      leaked: this.leaked,
      crystals: this.crystals,
      pokepieces: this.pokepieces,
      placed: this.towers.length,
      lives: Math.max(0, VIES - this.leaked),
      slotsLibres: Math.max(0, this.maxPoses - this.towers.length),
      maxPoses: this.maxPoses,
      outcome: this.outcome,
      phase: this.phase,
      trainerMoved: this.trainerMoved,
      selection: this.selection,
      // Une foule par espèce visible, plus les projectiles et le décor.
      drawCalls: [...this.crowds.values()].filter((c) => c.crowd.mesh.count > 0).length
        + (this.projectileMesh.count > 0 ? 1 : 0)
        + this.towers.length,
      message: this.message,
    };
  }

  /* ---------- Simulation ---------- */

  /** Referme le panneau de paliers. */
  deselectionner(): void {
    this.tourSelectionnee = null;
  }

  /** Ouvre les hostilites. Sans effet si la manche a deja commence. */
  lancerRun(): void {
    // L'invité n'ouvre pas les hostilités : il le demande. Rien ne bouge chez
    // lui tant que l'hôte n'a pas tranché — sinon il verrait la vague partir
    // alors qu'elle n'est pas partie.
    if (this.reseau === 'invite') {
      this.envoyerIntention?.({ kind: 'lancer' });
      return;
    }
    if (this.phase !== 'preparation') return;
    this.phase = 'en_cours';
    sonVagueLancee();
    // Les reperes de direction ont fait leur office.
    this.terrain.fleches.visible = false;
    this.notify('La vague arrive');
  }

  update(dt: number, tick: number): void {
    this.tick = tick;
    if (this.message && tick > this.messageUntil) this.message = null;

    if (this.reseau === 'invite') {
      this.avancerReplique(dt);
      return;
    }

    // Le dresseur se déplace par rapport à ce que le joueur voit, donc par
    // rapport au cap **courant** de la caméra. On le relit sur la caméra
    // elle-même plutôt que de le recopier : une constante alignée à la main
    // sur le cap d'origine poussait dans la mauvaise direction dès la
    // première rotation.
    this.camera.getWorldDirection(this.tmpVec);
    this.trainer.update(dt, this.input.move, Math.atan2(-this.tmpVec.x, -this.tmpVec.z));
    if (!this.trainerMoved && this.input.move.lengthSq() > 0.01) this.trainerMoved = true;

    this.enemyGrid.clear();
    this.enemies.forEach((enemy) => {
      if (enemy.active) this.enemyGrid.insert(enemy);
    });

    // En preparation, le temps de jeu est suspendu : ni vagues, ni tirs.
    const evenements = this.phase === 'en_cours' ? this.waves.update(dt, this.countMarching()) : [];
    for (const event of evenements) {
      if (event.kind === 'spawn') {
        this.spawnEnemy(
          event.request.species.id,
          event.request.hp,
          event.request.speed,
          event.request.scale,
          event.request.boss
        );
      }
      if (event.kind === 'waveCleared') {
        sonVagueTenue();
        this.crystals += PRIME_VAGUE;
        this.pokepieces += PIECES_VAGUE;
        this.notify(
          `Vague ${event.index + 1} tenue — +${PRIME_VAGUE} cristaux, +${PIECES_VAGUE} Poképièces`
        );
      }
      if (event.kind === 'allCleared') {
        this.crystals += PRIME_VICTOIRE;
        this.notify(`Terrain tenu — +${PRIME_VICTOIRE} cristaux`);
      }
    }

    this.enemies.forEach((enemy) => {
      enemy.update(dt);

      if (enemy.state === 'arrive') {
        sonFuite();
        this.leaked++;
        this.enemies.release(enemy);
        return;
      }

      if (enemy.state === 'mort') {
        // Coup fatal : on encaisse la récompense une seule fois, puis on laisse
        // l'agonie se jouer avant de rendre l'unité au réservoir.
        // La sub-stat « Cristaux » de l'arme portee majore chaque K.O.
        this.crystals += Math.round(PRIME_KO * (1 + (this.arme?.cristaux ?? 0)));
        this.pokepieces += PIECES_KO;
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
      const action = tower.update(dt, this.enemyGrid);

      // L'incantation n'envoie rien : elle annonce. La zone visée s'affiche
      // pendant toute sa durée, ce qui laisse le temps de la lire.
      if (action.kind === 'cast') {
        this.montrerApercu(tower, action.cible, action.duree, action.ultime);
        continue;
      }
      if (action.kind === 'rien') continue;
      if (this.projectiles.activeCount >= MAX_PROJECTILES) continue;

      const tir = this.projectiles.acquire();
      tir.launch(tower.x, tower.z, action.cible, action.degats, 14, tower.style);
      tir.ownerId = tower.owned.id;
      tir.moveType = action.move.type;
      this.montrerApercu(tower, action.cible, tir.dureeVol, action.ultime);
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
    this.avancerApercus(dt);

    this.updatePointer();
  }

  /**
   * Distribue les degats d'un tir arrive a destination.
   *
   * Le style decide de qui encaisse : la cible seule, tout un couloir, ou
   * tout ce qui se trouve autour du point d'impact.
   */
  /**
   * Dégâts réellement encaissés par un ennemi.
   *
   * C'est l'unique endroit où la table des types s'applique. La mettre ici
   * plutôt qu'au moment du tir n'est pas un détail : une attaque de zone
   * touche plusieurs espèces d'un coup, et chacune doit encaisser selon ses
   * propres faiblesses. Calculée au départ, elle aurait figé le multiplicateur
   * de la première cible pour tout le groupe.
   */
  private degatsSur(shot: Projectile, enemy: Enemy): number {
    if (!shot.moveType) return shot.damage;
    return shot.damage * affinite(shot.moveType, getSpecies(enemy.speciesId).types);
  }

  private appliquerImpact(shot: Projectile): void {
    const style = shot.style;
    if (!style) return;

    // Un impact par **tir**, pas par ennemi touché : une attaque de zone qui
    // en prend douze ne doit pas jouer douze fois le même choc. La couleur du
    // son suit le type de l'attaque, comme la table des affinités.
    if (shot.moveType) sonImpact(shot.moveType);

    if (style.rayon > 0) {
      this.enemyGrid.queryRadius(shot.x, shot.z, style.rayon, (enemy) => {
        if (!enemy.active) return;
        const dx = enemy.x - shot.x;
        const dz = enemy.z - shot.z;
        if (dx * dx + dz * dz > style.rayon * style.rayon) return;
        const degats = this.degatsSur(shot, enemy);
        const inflige = Math.min(degats, enemy.hp);
        this.crediter(shot, inflige, enemy.damage(degats));
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
        const degats = this.degatsSur(shot, enemy);
        const inflige = Math.min(degats, enemy.hp);
        this.crediter(shot, inflige, enemy.damage(degats));
      });
      return;
    }

    if (shot.target?.active) {
      const degats = this.degatsSur(shot, shot.target);
      const inflige = Math.min(degats, shot.target.hp);
      this.crediter(shot, inflige, shot.target.damage(degats));
    }
  }

  /**
   * Vrai si le joueur a bouge son dresseur a ce tick.
   *
   * Sert a recoller la camera : lacher le suivi pour regarder ailleurs est
   * utile, mais devoir appuyer sur une touche pour le reprendre alors qu'on
   * vient de se deplacer ne l'est pas.
   */
  get dresseurEnMouvement(): boolean {
    return this.input.move.lengthSq() > 0.01 || this.trainer.enRoute;
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

    const cible = this.enemyGrid.nearest(
      this.trainer.x,
      this.trainer.z,
      this.arme.range,
      (enemy) => enemy.active
    );
    // Plus personne à portée : la visée en cours est abandonnée, comme pour
    // les Pokémon.
    if (!cible) {
      this.armeCast = 0;
      return;
    }

    if (this.armeCast > 0) {
      this.armeCast -= dt;
      if (this.armeCast > 0) return;
      this.armeCast = 0;
      this.armeTimer = this.arme.cooldown;
    } else {
      if (this.armeTimer > 0) return;
      if (this.arme.cast > 0) {
        this.armeCast = this.arme.cast;
        return;
      }
      this.armeTimer = this.arme.cooldown;
    }

    if (this.projectiles.activeCount >= MAX_PROJECTILES) return;

    const tir = this.projectiles.acquire();
    // Le profil de style est copie puis elargi : une arme de zone dont les
    // sub-stats ont monte doit toucher plus large, pas seulement plus fort.
    const profil = { ...STYLES[this.arme.style] };
    profil.rayon *= this.arme.zone;
    profil.couloir *= this.arme.zone;
    tir.launch(this.trainer.x, this.trainer.z, cible, this.arme.damage, 22, profil);
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

  private spawnEnemy(
    speciesId: string,
    hp: number,
    speed: number,
    scale = 1,
    boss = false
  ): void {
    // Un boss marche au milieu de la voie : le decalage lateral le ferait
    // deborder sur l'herbe, ou l'enfoncer dans le decor.
    const offset = boss ? 0 : (Math.random() - 0.5) * (PATH_WIDTH - 0.8);
    const ennemi = this.enemies.acquire();
    ennemi.spawn(speciesId, this.path, hp, speed, offset, scale, boss);
    ennemi.idReseau = this.prochainIdEnnemi++;
  }

  /* ---------- Apercu des attaques ---------- */

  /**
   * Prepare les formes une fois pour toutes.
   *
   * Un apercu apparait a chaque tir, soit plusieurs fois par seconde : creer
   * la geometrie au moment du tir ferait un a-coup visible a chaque fois.
   */
  private construireApercus(): void {
    const matiere = new MeshBasicMaterial({
      color: 0xd0342c,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const plan = new PlaneGeometry(1, 1);

    for (let i = 0; i < MAX_APERCUS; i++) {
      // Un plan unitaire couvre les trois formes : le couloir et le trait sont
      // des rectangles, le disque est obtenu par une geometrie a part.
      const mesh = new Mesh(i % 2 === 0 ? plan : new CircleGeometry(1, 28), matiere);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.apercusGroup.add(mesh);
      this.apercus.push({ mesh, restant: 0 });
    }
  }

  /** Un apercu libre, de la forme voulue. Null si le budget est plein. */
  private prendreApercu(disque: boolean): Apercu | null {
    for (const apercu of this.apercus) {
      if (apercu.restant > 0) continue;
      const estDisque = (apercu.mesh.geometry as { type?: string }).type === 'CircleGeometry';
      if (estDisque === disque) return apercu;
    }
    return null;
  }

  /**
   * Dessine ce que le tir va toucher.
   *
   * L'apercu vit le temps du vol du projectile : il montre donc la zone avant
   * l'impact, ce qui est exactement l'information utile — ou ca va tomber.
   */
  private montrerApercu(tower: Tower, cible: Enemy, duree: number, ultime = false): void {
    const style = tower.style;
    // Une duree invalide reserverait la forme pour toujours.
    if (!Number.isFinite(duree) || duree <= 0) return;
    const ampleur = ultime ? APERCU_ULTIME : 1;

    if (style.rayon > 0) {
      const apercu = this.prendreApercu(true);
      if (!apercu) return;
      apercu.mesh.position.set(cible.x, 0.05, cible.z);
      apercu.mesh.scale.setScalar(style.rayon * ampleur);
      apercu.mesh.rotation.z = 0;
      apercu.restant = duree;
      apercu.mesh.visible = true;
      return;
    }

    // Corps a corps : pas de projectile qui parte loin, c'est la portee elle
    // meme qui est la zone d'effet.
    if (tower.species.style === 'cac') {
      const apercu = this.prendreApercu(true);
      if (!apercu) return;
      apercu.mesh.position.set(tower.x, 0.05, tower.z);
      apercu.mesh.scale.setScalar(tower.range);
      apercu.restant = duree;
      apercu.mesh.visible = true;
      return;
    }

    const apercu = this.prendreApercu(false);
    if (!apercu) return;

    const dx = cible.x - tower.x;
    const dz = cible.z - tower.z;
    const longueur = Math.hypot(dx, dz);
    if (longueur < 1e-3) return;

    // Le plan est couche par la rotation en X, et c'est la rotation en Z qui
    // lui donne son cap. Avec l'ordre d'Euler par defaut, Z s'applique dans le
    // repere du quad avant le couchage : l'axe long (0,1,0) devient donc
    // (-sin z, 0, -cos z), d'ou l'angle ci-dessous. Mesure plutot que deduite —
    // la version evidente, -atan2(dx, dz), tombait a cote hors des axes.
    const largeur = (style.couloir > 0 ? style.couloir * 2 : 0.14) * ampleur;
    apercu.mesh.scale.set(largeur, longueur, 1);
    apercu.mesh.position.set(tower.x + dx / 2, 0.05, tower.z + dz / 2);
    apercu.mesh.rotation.z = Math.atan2(-dx, -dz);
    apercu.restant = duree;
    apercu.mesh.visible = true;
  }

  private avancerApercus(dt: number): void {
    for (const apercu of this.apercus) {
      // Une duree non finie n'expirait jamais et gardait la forme reservee :
      // le budget d'apercus se vidait, et un seul Pokemon paraissait alors
      // afficher sa zone. On la traite comme expiree.
      if (!Number.isFinite(apercu.restant)) {
        apercu.restant = 0;
        apercu.mesh.visible = false;
        continue;
      }
      if (apercu.restant <= 0) continue;
      apercu.restant -= dt;
      if (apercu.restant <= 0) apercu.mesh.visible = false;
    }
  }

  /* ---------- Interaction ---------- */

  private updatePointer(): void {
    const pending = this.pendingPlacement;
    if (!this.input.pointerInside) {
      this.pointerValid = false;
      // Le survol doit tomber avec le curseur : sans cette remise a zero,
      // l'infobulle restait accrochee au dernier Pokemon survole des que la
      // souris passait sur le HUD.
      this.survolTour = null;
      this.hideGhost();
      return;
    }

    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain.groundMesh, false)[0];
    this.pointerValid = Boolean(hit);

    // Le survol se lit sur la projection au sol et non sur les maillages : les
    // modeles n'ont pas tous la meme silhouette, et une saisie au sol donne un
    // comportement identique d'une espece a l'autre.
    this.survolTour = hit && !pending ? this.tourSous(hit.point.x, hit.point.z) : null;

    if (!hit || !pending) {
      this.hideGhost();
      return;
    }

    this.pointerWorld.copy(hit.point);
    void this.ensureGhost(pending.speciesId);

    const species = getSpecies(pending.speciesId);
    const check = canPlace(
      this.pointerWorld.x,
      this.pointerWorld.z,
      this.path,
      this.towers,
      PLACEMENT_RULES,
      this.obstacles
    );
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

  /* ---------- Paliers de manche ---------- */

  /**
   * Fiche du Pokémon posé sélectionné, ou null.
   *
   * Elle se recalcule à chaque lecture plutôt que d'être mise en cache : le
   * coût du palier ne bouge pas, mais le fait qu'il soit abordable change à
   * chaque ennemi abattu, et un panneau qui ne suivrait pas la caisse serait
   * pire que pas de panneau du tout.
   */
  get selection(): SelectionTour | null {
    if (this.reseau === 'invite') return this.selectionRepliquee();

    const tour = this.tourSelectionnee;
    // Une tour retirée du terrain ne doit pas garder le panneau ouvert.
    if (!tour || !this.towers.includes(tour)) return null;

    const cout = coutPalier(tour.palier);
    return {
      ownedId: tour.owned.id,
      nom: tour.species.name,
      palier: tour.palier,
      palierMax: PALIER_MAX,
      cout,
      abordable: cout !== null && this.pokepieces >= cout,
      ultime: tour.moveUltime.name,
      ultimeDebloque: tour.ultimeDebloque,
    };
  }

  /**
   * Achète un palier sur le Pokémon sélectionné.
   *
   * Atomique : soit les pièces partent et la forme change, soit rien ne
   * bouge. C'est la même règle que pour les cristaux, et pour la même raison
   * — une dépense à moitié appliquée est impossible à expliquer au joueur.
   */
  monterPalierSelection(): boolean {
    if (this.reseau === 'invite') {
      const cible = this.selectionDistante;
      if (cible) this.envoyerIntention?.({ kind: 'palier', tourId: cible });
      return cible !== null;
    }
    const tour = this.tourSelectionnee;
    if (!tour || !this.towers.includes(tour)) return false;

    const cout = coutPalier(tour.palier);
    if (cout === null) {
      this.notify('Palier maximum atteint');
      return false;
    }
    if (this.pokepieces < cout) {
      this.notify(`Il manque ${cout - this.pokepieces} Poképièces`);
      return false;
    }

    if (!tour.monterPalier()) return false;
    this.pokepieces -= cout;
    sonPalier();

    this.notify(
      tour.ultimeDebloque
        ? `${tour.species.name} débloque ${tour.moveUltime.name}`
        : `${tour.species.name} passe au palier ${tour.palier}`
    );
    return true;
  }

  /** Le Pokemon pose le plus proche du point donne, dans le rayon de saisie. */
  /** Les objets réellement portés par un membre, dans l'ordre des emplacements. */
  private itemsDe(owned: OwnedPokemon): OwnedItem[] {
    return itemsEquipes(owned, this.inventaireItems);
  }

  private tourSous(x: number, z: number): Tower | null {
    let meilleure: Tower | null = null;
    let meilleurEcart = RAYON_SURVOL * RAYON_SURVOL;
    for (const tower of this.towers) {
      const dx = tower.x - x;
      const dz = tower.z - z;
      const ecart = dx * dx + dz * dz;
      if (ecart <= meilleurEcart) {
        meilleurEcart = ecart;
        meilleure = tower;
      }
    }
    return meilleure;
  }

  /**
   * Fiche du Pokemon survole, ou null.
   *
   * Les degats infliges sont pris dans les contributions de la manche : c'est
   * la meme source que le bilan de fin, donc les deux chiffres ne peuvent pas
   * se contredire.
   */
  get survol(): SurvolTour | null {
    const tower = this.survolTour;
    if (!tower) return null;

    const contribution = this.contributions.get(tower.owned.id);
    this.tmpVec.set(tower.x, tower.species.height * 0.9, tower.z).project(this.camera);

    return {
      ownedId: tower.owned.id,
      nom: tower.species.name,
      attaque: tower.moveAuto.name,
      typeAttaque: tower.moveAuto.type,
      style: tower.style.libelle,
      degats: tower.damage,
      cooldown: tower.cooldown,
      cast: tower.cast,
      recharge: tower.recharge,
      rechargePart: tower.rechargePart,
      enIncantation: tower.enIncantation,
      portee: tower.range,
      enAction: tower.target !== null,
      affinite: tower.target
        ? affinite(tower.typeEnJeu, getSpecies(tower.target.speciesId).types)
        : null,
      degatsInfliges: contribution?.degats ?? 0,
      kills: contribution?.kills ?? 0,
      palier: tower.palier,
      palierMax: PALIER_MAX,
      ultime: tower.moveUltime.name,
      ultimeDebloque: tower.ultimeDebloque,
      rechargeUltime: tower.rechargeUltime,
      ndcX: this.tmpVec.x,
      ndcY: this.tmpVec.y,
    };
  }

  /** Le fantôme est le vrai modèle, translucide : le placement libre demande de voir l'encombrement réel. */
  private async ensureGhost(speciesId: string): Promise<void> {
    if (this.ghostSpeciesId === speciesId) return;
    this.ghostSpeciesId = speciesId;

    const previous = this.ghostModel;
    this.ghostModel = null;
    if (previous) this.root.remove(previous);

    const espece = getSpecies(speciesId);
    const { object } = await instantiate(espece.model);
    if (espece.echelle) object.scale.setScalar(espece.echelle);
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

    // Le plafond est personnel : on compte ses propres poses, pas celles du
    // terrain. En solo les deux comptes sont le même.
    const miennes =
      this.reseau === 'solo'
        ? this.towers.length
        : this.towers.filter((tour) => this.proprietaireDe(tour) === this.joueurLocal).length;
    if (miennes >= MAX_POSES) {
      this.notify(`Terrain plein — ${MAX_POSES} Pokémon au maximum`);
      return;
    }

    // L'invité ne pose pas : il demande. Seul l'hôte connaît l'état réel du
    // terrain — y compris ce que l'autre joueur vient d'y poser et qui n'est
    // pas encore arrivé ici.
    if (this.reseau === 'invite') {
      this.envoyerIntention?.({
        kind: 'poser',
        ownedId: pending.id,
        x: this.pointerWorld.x,
        z: this.pointerWorld.z,
      });
      this.pendingPlacement = null;
      return;
    }

    const x = this.pointerWorld.x;
    const z = this.pointerWorld.z;
    this.pendingPlacement = null;
    await this.poser(pending, x, z, this.joueurLocal, this.itemsDe(pending));
  }

  /**
   * Pose un Pokémon sur le terrain, d'où qu'en vienne la demande.
   *
   * Le clic local et l'intention reçue d'un équipier passent tous les deux par
   * ici, et c'est le but : les règles de pose sont vérifiées à un seul
   * endroit. Si un jour la route change de forme, aucun des deux chemins ne
   * pourra l'ignorer.
   */
  private async poser(
    pending: OwnedPokemon,
    x: number,
    z: number,
    joueur: string,
    items: readonly OwnedItem[]
  ): Promise<void> {
    const check = canPlace(x, z, this.path, this.towers, PLACEMENT_RULES, this.obstacles);
    if (!check.ok) {
      this.notify(REJECTION_LABELS[check.reason]);
      return;
    }

    const species = getSpecies(pending.speciesId);
    this.proprietaires.set(pending.id, joueur);

    // La tour est enregistrée avant le chargement du modèle, qui est
    // asynchrone : sans cela deux clics rapides passeraient tous les deux et
    // dépasseraient la limite. Elle est positionnée dès maintenant pour que
    // les règles de pose la voient, et reçoit son visuel une fois chargé.
    // Les objets viennent du compte, pas du Pokémon : celui-ci n'en porte
    // que les identifiants.
    const tower = new Tower(pending, species, items);
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
    // Les modèles Cobblemon sont à l'échelle de Minecraft : Rayquaza y fait
    // seize blocs de long. Sans ça, il couvrirait la moitié du terrain.
    if (species.echelle) object.scale.setScalar(species.echelle);
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
    sonPose(species.id);
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

  /* ---------- Coopération : publier, recevoir, répliquer ---------- */

  /**
   * Enregistre l'équipe d'un joueur.
   *
   * Figée à l'entrée en partie, et c'est volontaire : quand l'hôte applique
   * l'intention « je pose celui-là », il lit les stats d'ici, pas celles que
   * l'invité lui enverrait au moment de la pose. Un client modifié ne peut donc
   * pas s'offrir un Pokémon gonflé en cours de manche.
   */
  enregistrerEquipe(
    joueur: string,
    equipe: readonly OwnedPokemon[],
    objets: readonly OwnedItem[] = []
  ): void {
    this.equipesDistantes.set(joueur, equipe);
    this.objetsDistants.set(joueur, objets);
  }

  /** À qui appartient une tour. En solo, tout est au joueur local. */
  private proprietaireDe(tour: Tower): string {
    return this.proprietaires.get(tour.owned.id) ?? this.joueurLocal;
  }

  /**
   * L'état du terrain, tel qu'il part sur le réseau.
   *
   * Les coordonnées sont arrondies au dixième. Un Pokémon fait deux unités de
   * large : un dixième d'unité est invisible, et les décimales complètes
   * triplaient le poids de l'instantané pour rien.
   */
  instantane(): Instantane {
    const ennemis: Instantane['ennemis'] = [];
    this.enemies.forEach((enemy) => {
      if (enemy.state === 'mort') return;
      ennemis.push({
        i: enemy.idReseau,
        e: enemy.speciesId,
        x: Math.round(enemy.x * 10) / 10,
        z: Math.round(enemy.z * 10) / 10,
        v: enemy.maxHp > 0 ? Math.round((enemy.hp / enemy.maxHp) * 100) / 100 : 0,
        s: enemy.scale,
        a: Math.round((Math.atan2(enemy.x - enemy.prevX, enemy.z - enemy.prevZ)) * 100) / 100,
        b: enemy.boss,
      });
    });

    const dresseurs: Instantane['dresseurs'] = [
      {
        j: this.joueurLocal,
        x: Math.round(this.trainer.x * 10) / 10,
        z: Math.round(this.trainer.z * 10) / 10,
      },
    ];
    for (const [joueur, dresseur] of this.dresseursDistants) {
      dresseurs.push({
        j: joueur,
        x: Math.round(dresseur.cibleX * 10) / 10,
        z: Math.round(dresseur.cibleZ * 10) / 10,
      });
    }

    const etat = this.status;
    return {
      t: this.tick,
      ennemis,
      tours: this.towers.map((tour) => ({
        i: tour.owned.id,
        e: tour.species.id,
        x: Math.round(tour.x * 10) / 10,
        z: Math.round(tour.z * 10) / 10,
        p: tour.palier,
        j: this.proprietaireDe(tour),
      })),
      dresseurs,
      vies: etat.lives,
      vague: etat.wave,
      vagues: etat.totalWaves,
      pieces: etat.pokepieces,
      cristaux: etat.crystals,
      issue: etat.outcome,
      phase: etat.phase,
    };
  }

  /**
   * Applique ce qu'un équipier demande. Réservé à l'hôte.
   *
   * Rien n'est pris pour argent comptant : la pose repasse par les règles,
   * le palier par la caisse. C'est tout l'intérêt d'échanger des intentions
   * plutôt que des résultats.
   */
  appliquerIntention(joueur: string, intention: Intention): void {
    if (this.reseau !== 'hote') return;

    if (intention.kind === 'dresseur') {
      // Le dresseur d'un équipier n'est pas simulé : on prend sa position
      // telle qu'il l'annonce. Elle ne donne aucun avantage — il ne tire pas.
      this.dresseurDistant(joueur).cibleX = intention.x;
      this.dresseurDistant(joueur).cibleZ = intention.z;
      return;
    }

    if (intention.kind === 'lancer') {
      this.lancerRun();
      return;
    }

    if (intention.kind === 'palier') {
      const tour = this.towers.find((t) => t.owned.id === intention.tourId);
      if (!tour) return;
      const cout = coutPalier(tour.palier);
      // La caisse est commune : c'est ce qui fait de la coopération autre
      // chose que deux parties côte à côte.
      if (cout === null || this.pokepieces < cout) return;
      if (!tour.monterPalier()) return;
      this.pokepieces -= cout;
      this.notify(`${tour.species.name} passe au palier ${tour.palier}`);
      return;
    }

    const equipe = this.equipesDistantes.get(joueur);
    const owned = equipe?.find((membre) => membre.id === intention.ownedId);
    if (!owned) return;
    // Le plafond personnel vaut aussi pour l'équipier.
    const siennes = this.towers.filter((tour) => this.proprietaireDe(tour) === joueur).length;
    if (siennes >= MAX_POSES) return;
    if (this.towers.some((tour) => tour.owned.id === owned.id)) return;
    void this.poser(
      owned,
      intention.x,
      intention.z,
      joueur,
      itemsEquipes(owned, this.objetsDistants.get(joueur) ?? [])
    );
  }

  /** Le dresseur d'un équipier, créé à sa première apparition. */
  private dresseurDistant(joueur: string): DresseurDistant {
    const connu = this.dresseursDistants.get(joueur);
    if (connu) return connu;

    const mesh = construireDresseur();
    // Une casquette d'une autre couleur : à deux, savoir lequel est soi doit
    // se lire d'un coup d'œil, sans étiquette flottante.
    mesh.traverse((enfant) => {
      const piece = enfant as Mesh;
      if (!piece.isMesh) return;
      const source = piece.material as MeshStandardMaterial;
      if (source.color.getHex() === 0xc8452f) {
        const teinte = source.clone();
        teinte.color.set('#7a4fb5');
        piece.material = teinte;
      }
    });
    const dresseur: DresseurDistant = { mesh, x: 0, z: 0, cibleX: 0, cibleZ: 0 };
    this.root.add(mesh);
    this.dresseursDistants.set(joueur, dresseur);
    return dresseur;
  }

  /**
   * Range un instantané reçu. Réservé à l'invité.
   *
   * On ne recrée rien : les ennemis déjà connus gardent leur objet et voient
   * leur cible bouger. Remplacer la table à chaque instantané ferait repartir
   * chaque Pokémon de sa nouvelle position, et la marche deviendrait une
   * succession de bonds.
   */
  appliquerInstantane(instantane: Instantane): void {
    if (this.reseau !== 'invite') return;
    // Un instantané doublé par un plus récent n'a plus rien à dire.
    if (this.etatDistant && instantane.t < this.etatDistant.t) return;
    this.etatDistant = instantane;

    for (const ennemi of this.ennemisDistants.values()) ennemi.vu = false;

    for (const recu of instantane.ennemis) {
      const connu = this.ennemisDistants.get(recu.i);
      if (connu) {
        connu.cibleX = recu.x;
        connu.cibleZ = recu.z;
        connu.vie = recu.v;
        connu.angle = recu.a;
        connu.vu = true;
        continue;
      }
      this.ennemisDistants.set(recu.i, {
        espece: recu.e,
        x: recu.x,
        z: recu.z,
        cibleX: recu.x,
        cibleZ: recu.z,
        vie: recu.v,
        echelle: recu.s,
        angle: recu.a,
        boss: recu.b,
        phase: Math.random() * 10,
        vu: true,
      });
    }
    for (const [id, ennemi] of this.ennemisDistants) {
      if (!ennemi.vu) this.ennemisDistants.delete(id);
    }

    /* Les tours : on ne crée le visuel qu'une fois, à la première apparition. */
    const vues = new Set<string>();
    for (const tour of instantane.tours) {
      vues.add(tour.i);
      const connue = this.toursDistantes.get(tour.i);
      if (connue) {
        connue.palier = tour.p;
        // Un palier change l'espèce quand il déclenche une évolution : le
        // visuel doit alors être refait.
        if (connue.espece !== tour.e) {
          this.root.remove(connue.holder);
          this.toursDistantes.delete(tour.i);
          void this.construireTourDistante(tour);
        }
        continue;
      }
      void this.construireTourDistante(tour);
    }
    for (const [id, tour] of this.toursDistantes) {
      if (vues.has(id)) continue;
      this.root.remove(tour.holder);
      this.toursDistantes.delete(id);
    }
    if (this.selectionDistante && !vues.has(this.selectionDistante)) {
      this.selectionDistante = null;
    }

    /* Les dresseurs, le sien excepté : celui-là, il le bouge lui-même. */
    for (const recu of instantane.dresseurs) {
      if (recu.j === this.joueurLocal) continue;
      const dresseur = this.dresseurDistant(recu.j);
      dresseur.cibleX = recu.x;
      dresseur.cibleZ = recu.z;
    }
  }

  private async construireTourDistante(tour: TourRepliquee): Promise<void> {
    // La place est réservée avant le chargement : deux instantanés rapprochés
    // construiraient sinon deux fois le même Pokémon.
    if (this.toursDistantes.has(tour.i)) return;
    const holder = new Group();
    holder.position.set(tour.x, 0, tour.z);
    holder.rotation.y = MODEL_FACING;
    this.toursDistantes.set(tour.i, {
      holder,
      espece: tour.e,
      palier: tour.p,
      joueur: tour.j,
    });
    this.root.add(holder);

    const base = new Mesh(
      new CylinderGeometry(0.5, 0.55, 0.1, 16),
      new MeshStandardMaterial({ color: '#c9cfd6', roughness: 0.8 })
    );
    base.position.y = 0.05;
    holder.add(base);

    try {
      const espece = getSpecies(tour.e);
      const { object } = await instantiate(espece.model);
      if (espece.echelle) object.scale.setScalar(espece.echelle);
      holder.add(object);
    } catch (error) {
      // Un modèle manquant ne doit pas vider le terrain : le socle reste,
      // et l'on sait au moins qu'il y a quelqu'un là.
      console.warn(`Modèle indisponible pour ${tour.e} :`, error);
    }
  }

  /**
   * Un pas de réplique : personne ne simule, tout rattrape.
   *
   * Le lissage est exponentiel et non linéaire : une cible qui bouge dix fois
   * par seconde et un rendu à soixante images donneraient, avec une vitesse
   * fixe, un mouvement qui accélère puis attend. Là, chaque image comble une
   * fraction constante de l'écart, et l'arrivée est douce.
   */
  private avancerReplique(dt: number): void {
    this.camera.getWorldDirection(this.tmpVec);
    this.trainer.update(dt, this.input.move, Math.atan2(-this.tmpVec.x, -this.tmpVec.z));
    if (!this.trainerMoved && this.input.move.lengthSq() > 0.01) this.trainerMoved = true;

    // Sa position part à la même cadence que les instantanés : plus souvent
    // serait du trafic pour un déplacement que personne ne mesure au dixième.
    this.horlogeDresseur += dt;
    if (this.horlogeDresseur >= 0.1) {
      this.horlogeDresseur = 0;
      this.envoyerIntention?.({
        kind: 'dresseur',
        x: Math.round(this.trainer.x * 10) / 10,
        z: Math.round(this.trainer.z * 10) / 10,
      });
    }

    // L'invité vise, lui aussi. Sans cette ligne son curseur restait à
    // l'origine : il ne pouvait ni poser, ni cliquer pour se déplacer, ni
    // sélectionner un Pokémon — le mode se regardait au lieu de se jouer.
    this.updatePointer();

    const rattrapage = Math.min(1, dt * 12);
    for (const ennemi of this.ennemisDistants.values()) {
      ennemi.x += (ennemi.cibleX - ennemi.x) * rattrapage;
      ennemi.z += (ennemi.cibleZ - ennemi.z) * rattrapage;
      ennemi.phase += dt;
    }
    for (const dresseur of this.dresseursDistants.values()) {
      dresseur.x += (dresseur.cibleX - dresseur.x) * rattrapage;
      dresseur.z += (dresseur.cibleZ - dresseur.z) * rattrapage;
      dresseur.mesh.position.set(dresseur.x, 0, dresseur.z);
    }
  }

  /** Fiche du Pokémon posé sélectionné, côté invité. */
  private selectionRepliquee(): SelectionTour | null {
    const id = this.selectionDistante;
    if (!id) return null;
    const tour = this.toursDistantes.get(id);
    if (!tour) return null;

    const owned = this.annuaire(id);
    const cout = coutPalier(tour.palier);
    return {
      ownedId: id,
      nom: getSpecies(tour.espece).name,
      palier: tour.palier,
      palierMax: PALIER_MAX,
      cout,
      abordable: cout !== null && (this.etatDistant?.pieces ?? 0) >= cout,
      // Sans la fiche du Pokémon — un équipier qu'on ne connaît pas — on
      // n'invente pas un nom d'attaque : un tiret se lit comme « inconnu »,
      // un faux nom se lit comme une information.
      ultime: owned?.ultime.name ?? '—',
      ultimeDebloque: tour.palier >= PALIER_MAX,
    };
  }

  /** Retrouve un Pokémon posé parmi les équipes connues. */
  private annuaire(ownedId: string): OwnedPokemon | null {
    for (const equipe of this.equipesDistantes.values()) {
      const trouve = equipe.find((membre) => membre.id === ownedId);
      if (trouve) return trouve;
    }
    return null;
  }

  /** La tour répliquée sous le curseur, ou null. */
  private tourDistanteSous(): string | null {
    if (!this.pointerValid) return null;
    let meilleure: string | null = null;
    let meilleurEcart = RAYON_SURVOL * RAYON_SURVOL;
    for (const [id, tour] of this.toursDistantes) {
      const dx = tour.holder.position.x - this.pointerWorld.x;
      const dz = tour.holder.position.z - this.pointerWorld.z;
      const ecart = dx * dx + dz * dz;
      if (ecart <= meilleurEcart) {
        meilleurEcart = ecart;
        meilleure = id;
      }
    }
    return meilleure;
  }

  /** Dessine ce qui vient du réseau. Sans effet en solo. */
  private rendreRepliques(): void {
    for (const ennemi of this.ennemisDistants.values()) {
      const entry = this.crowds.get(ennemi.espece);
      if (!entry) continue;
      const clip = entry.walk ?? entry.idle;
      if (!clip) continue;
      entry.crowd.add(ennemi.x, ennemi.z, ennemi.angle + MODEL_FACING, ennemi.echelle, clip, ennemi.phase);
      const hauteur = getSpecies(ennemi.espece).height * ennemi.echelle + 0.45;
      this.barresVie.add(ennemi.x, hauteur, ennemi.z, ennemi.vie, ennemi.boss ? 2.2 : 1);
    }
  }

  /* ---------- Rendu ---------- */

  render(alpha: number): void {
    const maintenant = performance.now();
    const dtDecor = Math.min(0.1, (maintenant - this.derniereImageDecor) / 1000);
    this.derniereImageDecor = maintenant;
    this.terrain.avancer(dtDecor, this.phase === 'en_cours');
    this.terrain.majVies(Math.max(0, VIES - this.leaked) / VIES);

    for (const { crowd } of this.crowds.values()) crowd.begin();
    this.barresVie.begin(this.camera);

    this.enemies.forEach((enemy) => {
      if (enemy.state === 'mort') return;
      const entry = this.crowds.get(enemy.speciesId);
      if (!entry) return;
      enemy.renderAt(alpha, this.tmpVec2);
      const angle = Math.atan2(enemy.x - enemy.prevX, enemy.z - enemy.prevZ) + MODEL_FACING;
      const clip = enemy.state === 'ko' ? entry.faint : enemy.active ? entry.walk : entry.idle;
      if (!clip) return;
      entry.crowd.add(this.tmpVec2.x, this.tmpVec2.y, angle, enemy.scale, clip, enemy.phase);

      // Une barre au-dessus de chaque vivant. Pas sur les agonisants : leur
      // barre resterait a zero le temps de la chute, ce qui se lit comme un
      // ennemi encore debout.
      if (!enemy.active) return;
      const hauteur = getSpecies(enemy.speciesId).height * enemy.scale + 0.45;
      this.barresVie.add(
        this.tmpVec2.x,
        hauteur,
        this.tmpVec2.y,
        enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0,
        // Un boss recoit une barre plus large : la barre ordinaire disparait
        // au-dessus d'une silhouette deux fois plus grosse.
        enemy.boss ? 2.2 : 1
      );
    });

    // Les répliques passent par les mêmes foules que les ennemis simulés :
    // elles doivent donc être ajoutées entre le begin et le end.
    if (this.reseau === 'invite') this.rendreRepliques();

    for (const { crowd } of this.crowds.values()) crowd.end();
    this.barresVie.end();

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

    const cible = this.trainer.cible;
    if (cible) {
      this.repereDestination.position.set(cible.x, 0.05, cible.y);
      // L'anneau pulse doucement : un cercle fixe au sol se confond avec le
      // décor, celui-ci se retrouve du coin de l'oeil.
      this.repereDestination.scale.setScalar(1 + Math.sin(this.tick * 0.25) * 0.12);
      this.repereDestination.visible = true;
    } else {
      this.repereDestination.visible = false;
    }

    this.trainer.renderAt(alpha, this.tmpVec2);
    this.trainer.object?.position.set(this.tmpVec2.x, 0, this.tmpVec2.y);
    this.trainerMesh.rotation.z = Math.sin(this.tick * 0.15) * 0.035;
  }

  dispose(): void {
    for (const tour of this.toursDistantes.values()) this.root.remove(tour.holder);
    for (const dresseur of this.dresseursDistants.values()) this.root.remove(dresseur.mesh);
    this.toursDistantes.clear();
    this.dresseursDistants.clear();
    this.ennemisDistants.clear();
    this.terrain.dispose();
    this.decor?.dispose();
    this.barresVie.dispose();
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
