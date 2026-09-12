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
/** Rotation autour de l'axe vertical : décale la vue pour éviter le plein axe. */
const YAW = 35;

/** Distance au point visé, en unités monde. */
const DISTANCE_MIN = 26;
const DISTANCE_MAX = 76;
/** Par défaut, le terrain entier tient dans le cadre. */
const DISTANCE_DEFAUT = 58;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Recadre la vue autour d'un point du terrain. */
  focus(target: Vector3): void;
  /** Recule (positif) ou rapproche (négatif) la caméra. */
  zoom(delta: number): void;
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
  const focusPoint = new Vector3(0, 0, 0);

  /** Direction caméra -> cible, indépendante de la distance. */
  const direction = (() => {
    const pitch = (PITCH * Math.PI) / 180;
    const yaw = (YAW * Math.PI) / 180;
    return new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
  })();

  const appliquer = (): void => {
    camera.position.copy(focusPoint).addScaledVector(direction, distance);
    camera.lookAt(focusPoint);
  };

  function focus(target: Vector3): void {
    focusPoint.copy(target);
    appliquer();
  }

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
    zoom,
    get distance(): number {
      return distance;
    },
    resize,
    dispose(): void {
      observer.disconnect();
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
