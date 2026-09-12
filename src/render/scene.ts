/**
 * Scène, caméra et lumières.
 *
 * La caméra ne tourne jamais — c'est un choix du brief, et il nous arrange :
 * une seule direction de vue veut dire une seule shadow map à cadrer, un tri
 * de profondeur stable, et aucun angle sous lequel le décor se troue.
 *
 * Elle recule et avance en revanche. Sans cela le cadrage montrait à peine la
 * moitié du terrain, et le dresseur sortait de l'écran dès qu'on le déplaçait
 * vers un bord.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

/** Angle de plongée, en degrés. 50° donne le rendu « Clash Royale » demandé. */
const PITCH = 50;
/**
 * Cap initial, en degrés.
 *
 * Il n'est plus constant : le joueur peut tourner la vue, parce qu'un décor
 * ou un relief finit toujours par masquer un coin de la carte sous un seul
 * angle. Seule la plongée reste fixe — c'est elle qui porte le rendu
 * « Clash Royale » et le cadrage d'une seule shadow map.
 */
const YAW_DEFAUT = 35;
/** Pas de rotation, en degrés, pour un appui ou un cran de bouton. */
const PAS_ROTATION = 15;

/** Distance au point visé, en unités monde. */
const DISTANCE_MIN = 26;
const DISTANCE_MAX = 76;
/** Par défaut, le terrain entier tient dans le cadre. */
const DISTANCE_DEFAUT = 58;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Recadre la vue autour d'un point du terrain, sans amorti. */
  focus(target: Vector3): void;
  /** Repeint le fond et le brouillard aux couleurs du monde courant. */
  appliquerCiel(couleur: string): void;
  /**
   * Suit une cible en douceur, tant que la camera n'a pas ete liberee.
   * A appeler a chaque image.
   */
  suivre(cible: Vector3, dt: number): void;
  /** Rend la main au joueur : la camera cesse de suivre et se deplace au glisser. */
  libererSuivi(): void;
  /** Recolle la camera a sa cible. */
  reprendreSuivi(): void;
  readonly suit: boolean;
  /** Recule (positif) ou rapproche (négatif) la caméra. */
  zoom(delta: number): void;
  /** Fait tourner la vue autour du point visé, en degrés. */
  pivoter(degres: number): void;
  /** Remet le cap d'origine. */
  reinitialiserCap(): void;
  /** Cap courant, en degrés. */
  readonly cap: number;
  /** Distance courante, pour l'afficher ou la sauvegarder. */
  readonly distance: number;
  resize(): void;
  dispose(): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#f7f8f6');
  scene.fog = new Fog('#f7f8f6', DISTANCE_MAX * 1.2, DISTANCE_MAX * 2.6);

  const camera = new PerspectiveCamera(32, 1, 1, DISTANCE_MAX * 4);

  let distance = DISTANCE_DEFAUT;
  let yaw = YAW_DEFAUT;
  let suit = true;
  const focusPoint = new Vector3(0, 0, 0);
  const voulu = new Vector3(0, 0, 0);

  /**
   * Direction caméra -> cible, indépendante de la distance.
   *
   * Recalculée à chaque changement de cap plutôt que figée : c'est elle qui
   * place la caméra, donc la garder constante annulait la rotation.
   */
  const direction = new Vector3();
  const recalculerDirection = (): void => {
    const pitch = (PITCH * Math.PI) / 180;
    const rad = (yaw * Math.PI) / 180;
    direction
      .set(Math.sin(rad) * Math.cos(pitch), Math.sin(pitch), Math.cos(rad) * Math.cos(pitch))
      .normalize();
  };
  recalculerDirection();

  const appliquer = (): void => {
    camera.position.copy(focusPoint).addScaledVector(direction, distance);
    camera.lookAt(focusPoint);
  };

  function focus(target: Vector3): void {
    focusPoint.copy(target);
    appliquer();
  }

  function appliquerCiel(couleur: string): void {
    // Le fond et le brouillard doivent rester identiques : un brouillard d'une
    // autre teinte que le fond dessine un halo autour du terrain.
    (scene.background as Color).set(couleur);
    (scene.fog as Fog).color.set(couleur);
  }

  /**
   * Suivi amorti.
   *
   * La camera rattrape sa cible d'autant plus vite qu'elle en est loin, avec
   * un facteur recalcule a partir du temps ecoule : le rendu ne depend donc
   * pas de la cadence d'affichage.
   */
  function suivre(cible: Vector3, dt: number): void {
    if (!suit) return;
    voulu.copy(cible);
    focusPoint.lerp(voulu, 1 - Math.pow(0.0015, Math.min(dt, 0.1)));
    appliquer();
  }

  function libererSuivi(): void {
    suit = false;
  }

  function reprendreSuivi(): void {
    suit = true;
  }

  function pivoter(degres: number): void {
    yaw = (yaw + degres) % 360;
    recalculerDirection();
    appliquer();
  }

  function reinitialiserCap(): void {
    yaw = YAW_DEFAUT;
    recalculerDirection();
    appliquer();
  }

  /** Deplacement libre : le glisser fait glisser le terrain sous la camera. */
  function deplacer(dxEcran: number, dyEcran: number): void {
    // Le plan du sol vu par la camera : on projette le geste souris sur les
    // deux axes de l'ecran ramenes au sol, au cap courant. Utiliser le cap
    // d'origine ferait glisser le terrain de travers des qu'on a tourne.
    const facteur = distance * 0.0016;
    const rad = (yaw * Math.PI) / 180;
    const droiteX = Math.cos(rad);
    const droiteZ = -Math.sin(rad);
    const avantX = Math.sin(rad);
    const avantZ = Math.cos(rad);
    focusPoint.x -= (dxEcran * droiteX + dyEcran * avantX) * facteur;
    focusPoint.z -= (dxEcran * droiteZ + dyEcran * avantZ) * facteur;
    appliquer();
  }

  // Glisser a la souris : seulement quand le suivi a ete lache.
  let glisse = false;
  let dernierX = 0;
  let dernierY = 0;

  const onPointerDown = (event: PointerEvent): void => {
    if (suit || event.button !== 0) return;
    glisse = true;
    dernierX = event.clientX;
    dernierY = event.clientY;
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!glisse) return;
    deplacer(event.clientX - dernierX, event.clientY - dernierY);
    dernierX = event.clientX;
    dernierY = event.clientY;
  };
  const onPointerUp = (): void => {
    glisse = false;
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  function zoom(delta: number): void {
    distance = Math.min(DISTANCE_MAX, Math.max(DISTANCE_MIN, distance + delta));
    appliquer();
  }

  appliquer();

  scene.add(new AmbientLight(0xffffff, 0.55));

  const sun = new DirectionalLight(0xfff4e6, 2.1);
  sun.position.set(-16, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  // Le terrain tient dans un carré connu : on colle le frustum d'ombre dessus
  // pour ne pas gâcher la résolution de la shadow map.
  const shadowSpan = 24;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  scene.add(sun);
  scene.add(sun.target);

  const bounce = new DirectionalLight(0xdce8ff, 0.4);
  bounce.position.set(14, 9, -10);
  scene.add(bounce);

  // La molette recule ou rapproche ; le geste est attendu sur une carte.
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    zoom(Math.sign(event.deltaY) * 4);
  };
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  // A et E tournent la vue, R la remet d'aplomb. Le clavier plutot que le
  // clic droit : celui-ci annule deja une pose en cours.
  const onKey = (event: KeyboardEvent): void => {
    if (event.code === 'KeyA') pivoter(-PAS_ROTATION);
    else if (event.code === 'KeyE') pivoter(PAS_ROTATION);
    else if (event.code === 'KeyR') reinitialiserCap();
  };
  window.addEventListener('keydown', onKey);

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    renderer,
    scene,
    camera,
    focus,
    appliquerCiel,
    suivre,
    libererSuivi,
    reprendreSuivi,
    get suit(): boolean {
      return suit;
    },
    zoom,
    pivoter,
    reinitialiserCap,
    get cap(): number {
      return yaw;
    },
    get distance(): number {
      return distance;
    },
    resize,
    dispose(): void {
      observer.disconnect();
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
