/**
 * Scène, caméra et lumières.
 *
 * La caméra ne tourne jamais : c'est un choix du brief, et il nous arrange.
 * Une seule direction de vue veut dire une seule shadow map à cadrer, un
 * tri de profondeur stable, et aucun angle sous lequel le décor se troue.
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
const DISTANCE = 26;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Recadre la vue autour d'un point du terrain. */
  focus(target: Vector3): void;
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
  scene.fog = new Fog('#f7f8f6', DISTANCE * 1.4, DISTANCE * 3);

  const camera = new PerspectiveCamera(32, 1, 1, DISTANCE * 4);

  const offset = (() => {
    const pitch = (PITCH * Math.PI) / 180;
    const yaw = (YAW * Math.PI) / 180;
    return new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).multiplyScalar(DISTANCE);
  })();

  const focusPoint = new Vector3();
  function focus(target: Vector3): void {
    focusPoint.copy(target);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }
  focus(new Vector3(0, 0, 0));

  scene.add(new AmbientLight(0xffffff, 0.55));

  const sun = new DirectionalLight(0xfff4e6, 2.1);
  sun.position.set(-12, 20, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  // Le terrain tient dans un carré connu : on colle le frustum d'ombre dessus
  // pour ne pas gâcher la résolution de la shadow map.
  const shadowSpan = 22;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  scene.add(sun);
  scene.add(sun.target);

  const bounce = new DirectionalLight(0xdce8ff, 0.4);
  bounce.position.set(10, 6, -8);
  scene.add(bounce);

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
    resize,
    dispose(): void {
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
