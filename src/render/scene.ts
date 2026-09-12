/**
 * Scène, caméra et lumières.
 *
 * La plongée est fixe — c'est elle qui porte le rendu « Clash Royale » du
 * brief, et elle garantit une seule shadow map à cadrer et un tri de
 * profondeur stable. Le **cap**, lui, est libre : sous un seul angle, un
 * relief ou un morceau de décor finit toujours par masquer un coin de carte.
 *
 * Tout ce qui bouge la caméra passe par une **valeur voulue** et une valeur
 * courante qui la rattrape à chaque image. Rien ne saute :
 *
 *  - la rotation était appliquée d'un bloc, par cran, au rythme de
 *    répétition du clavier. Ça se voyait comme une saccade, et c'était bien
 *    une saccade ;
 *  - le zoom à la molette sautait de la même façon.
 *
 * L'amortissement est exponentiel et recalculé à partir du temps écoulé : le
 * résultat ne dépend donc pas de la cadence d'affichage.
 */

import { SEUIL_GLISSER, identifiantTouche } from '@/core/input';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  MathUtils,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

/** Angle de plongée, en degrés. 50° donne le rendu « Clash Royale » demandé. */
const PITCH = 50;
/** Cap initial, en degrés. */
const YAW_DEFAUT = 35;
/** Pas de rotation d'un appui bref, en degrés. */
const PAS_ROTATION = 20;
/**
 * Vitesse de rotation quand la touche reste enfoncée, en degrés par seconde.
 *
 * Un appui maintenu tourne donc en continu au lieu de répéter le pas au
 * rythme de l'auto-répétition du clavier — qui commence après un délai, puis
 * part d'un coup. C'était l'essentiel de la saccade.
 */
const VITESSE_ROTATION = 110;
/** Degrés de cap par pixel de glisser horizontal. */
const ROTATION_PAR_PIXEL = 0.32;
/** Unités de distance par pixel de glisser vertical. */
const ZOOM_PAR_PIXEL = 0.06;
/** Distance au point visé, en unités monde. */
const DISTANCE_MIN = 26;
const DISTANCE_MAX = 76;
/** Par défaut, le terrain entier tient dans le cadre. */
const DISTANCE_DEFAUT = 58;

/**
 * Constantes d'amorti, en part restante après une seconde.
 *
 * Plus le nombre est petit, plus la caméra colle à sa consigne. Le cap est
 * le plus vif des trois : une rotation qui traîne donne l'impression que la
 * commande n'a pas été prise.
 */
const AMORTI_CAP = 0.000004;
const AMORTI_DISTANCE = 0.00002;
const AMORTI_SUIVI = 0.0015;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Recadre la vue autour d'un point du terrain, sans amorti. */
  focus(target: Vector3): void;
  /** Repeint le fond et le brouillard aux couleurs du monde courant. */
  appliquerCiel(couleur: string): void;
  /**
   * Fait avancer cap, distance et rotation maintenue d'une image.
   *
   * À appeler une fois par image, avant `suivre`. C'est ici que tout
   * l'amortissement se joue.
   */
  avancer(dt: number): void;
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
  let distanceVoulue = DISTANCE_DEFAUT;
  let yaw = YAW_DEFAUT;
  let yawVoulu = YAW_DEFAUT;
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
  const appliquer = (): void => {
    const pitch = (PITCH * Math.PI) / 180;
    const rad = (yaw * Math.PI) / 180;
    direction
      .set(Math.sin(rad) * Math.cos(pitch), Math.sin(pitch), Math.cos(rad) * Math.cos(pitch))
      .normalize();
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

  /* ---------- Amortissement ---------- */

  /** Touches de rotation maintenues, pour tourner en continu. */
  const rotationTenue = { gauche: false, droite: false };

  function avancer(dt: number): void {
    const pas = Math.min(dt, 0.1);

    // Une touche maintenue pousse la consigne, elle ne déplace pas la caméra
    // elle-même : c'est l'amorti en dessous qui fait le mouvement, et les
    // deux sources — clavier et souris — se mélangent donc sans se battre.
    if (rotationTenue.gauche) yawVoulu -= VITESSE_ROTATION * pas;
    if (rotationTenue.droite) yawVoulu += VITESSE_ROTATION * pas;

    const facteurCap = 1 - Math.pow(AMORTI_CAP, pas);
    const facteurDistance = 1 - Math.pow(AMORTI_DISTANCE, pas);
    yaw += (yawVoulu - yaw) * facteurCap;
    distance += (distanceVoulue - distance) * facteurDistance;

    // On recale les deux ensemble une fois la consigne atteinte : laisser
    // l'écart tendre vers zéro indéfiniment ferait tourner le calcul pour
    // rien, et le cap dériverait par accumulation d'arrondis.
    if (Math.abs(yawVoulu - yaw) < 0.01) yaw = yawVoulu;
    if (Math.abs(distanceVoulue - distance) < 0.01) distance = distanceVoulue;

    appliquer();
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
    focusPoint.lerp(voulu, 1 - Math.pow(AMORTI_SUIVI, Math.min(dt, 0.1)));
    appliquer();
  }

  function libererSuivi(): void {
    suit = false;
  }

  function reprendreSuivi(): void {
    suit = true;
  }

  function pivoter(degres: number): void {
    yawVoulu += degres;
  }

  function reinitialiserCap(): void {
    // Le cap courant est d'abord ramené dans le tour de YAW_DEFAUT : sans
    // ça, revenir au cap d'origine après trois tours de molette ferait faire
    // trois tours complets à la caméra.
    const ecart = ((((yaw - YAW_DEFAUT) % 360) + 540) % 360) - 180;
    yaw = YAW_DEFAUT + ecart;
    yawVoulu = YAW_DEFAUT;
  }

  function zoom(delta: number): void {
    distanceVoulue = MathUtils.clamp(distanceVoulue + delta, DISTANCE_MIN, DISTANCE_MAX);
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

  /* ---------- Souris ---------- */

  /**
   * Glisser à la souris.
   *
   * Bouton gauche ou droit : le geste horizontal fait tourner la vue autour
   * du dresseur, le geste vertical rapproche ou éloigne. Le bouton du milieu
   * fait glisser le terrain et détache le suivi.
   *
   * Le seuil est là pour une raison précise : le clic gauche pose un Pokémon,
   * en sélectionne un, ou envoie le dresseur quelque part. Tant que la main
   * n'a pas franchi quelques pixels, le geste reste un clic et la caméra ne
   * bouge pas.
   */
  let bouton: number | null = null;
  let franchi = false;
  let dernierX = 0;
  let dernierY = 0;
  let departX = 0;
  let departY = 0;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    bouton = event.button;
    franchi = false;
    dernierX = departX = event.clientX;
    dernierY = departY = event.clientY;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (bouton === null) return;
    const dx = event.clientX - dernierX;
    const dy = event.clientY - dernierY;
    dernierX = event.clientX;
    dernierY = event.clientY;

    if (!franchi) {
      const parcouru = Math.hypot(event.clientX - departX, event.clientY - departY);
      if (parcouru < SEUIL_GLISSER) return;
      franchi = true;
    }

    if (bouton === 1) {
      // Le bouton du milieu fait glisser le terrain. Il détache le suivi de
      // lui-même : c'est le seul geste qui décolle la caméra du dresseur, et
      // devoir l'annoncer par une autre commande serait absurde.
      suit = false;
      deplacer(dx, dy);
      return;
    }

    // La consigne bouge, pas la caméra : le glisser passe donc par le même
    // amorti que les touches, et le mouvement reste lisse même si les
    // événements souris arrivent par paquets irréguliers.
    yawVoulu += dx * ROTATION_PAR_PIXEL;
    zoom(dy * ZOOM_PAR_PIXEL);
  };

  const onPointerUp = (): void => {
    bouton = null;
    franchi = false;
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

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

  // A et E tournent la vue, R la remet d'aplomb. Maintenir tourne en continu :
  // l'appui bref garde son pas, pour un ajustement précis au clavier.
  const onKey = (event: KeyboardEvent): void => {
    const touche = identifiantTouche(event);
    if (touche === 'a') {
      if (!event.repeat) pivoter(-PAS_ROTATION);
      rotationTenue.gauche = true;
    } else if (touche === 'e') {
      if (!event.repeat) pivoter(PAS_ROTATION);
      rotationTenue.droite = true;
    } else if (touche === 'r' && !event.repeat) {
      reinitialiserCap();
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const touche = identifiantTouche(event);
    if (touche === 'a') rotationTenue.gauche = false;
    if (touche === 'e') rotationTenue.droite = false;
  };
  // Une touche relâchée hors de la fenêtre ne produit pas de keyup : sans ce
  // filet, la caméra continuerait de tourner toute seule au retour.
  const onBlur = (): void => {
    rotationTenue.gauche = false;
    rotationTenue.droite = false;
    bouton = null;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

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
    avancer,
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
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
