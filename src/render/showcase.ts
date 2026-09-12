/**
 * Vitrine des starters.
 *
 * Scène de présentation autonome, qui emprunte le renderer du jeu mais garde
 * sa propre caméra et son propre éclairage : fond clair, lumière douce, aucune
 * ombre dure. Le sujet doit ressortir sur du blanc, pas être posé dans un
 * décor de niveau.
 *
 * La mallette est modélisée en primitives plutôt qu'importée : trois alvéoles
 * et un couvercle suffisent à raconter la scène, et cela évite un asset de
 * plus à convertir.
 */

import {
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type AnimationClip,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { instantiate } from '@/core/assets';
import { getSpecies } from '@/data/content';

/** Écartement des trois emplacements, en unités monde. */
const ESPACEMENT = 2.4;

interface Presentation {
  speciesId: string;
  support: Group;
  modele: Object3D;
  mixer: AnimationMixer | null;
  socle: Mesh;
  /** Décalage d'animation, pour que les trois ne respirent pas ensemble. */
  phase: number;
  /** Avancement de l'entrée en scène, de 0 à 1. */
  entree: number;
  /** Retard avant que ce sujet n'entre, en secondes. */
  retard: number;
}

function choisirClip(clips: readonly AnimationClip[], ...noms: string[]): AnimationClip | null {
  for (const nom of noms) {
    const trouve = clips.find((clip) => clip.name.endsWith(nom) && clip.duration > 0);
    if (trouve) return trouve;
  }
  return null;
}

function creerMallette(): Group {
  const mallette = new Group();

  const bois = new MeshStandardMaterial({ color: '#c9a87c', roughness: 0.7, metalness: 0 });
  const doublure = new MeshStandardMaterial({ color: '#f1ece2', roughness: 1 });
  const feutre = new MeshStandardMaterial({ color: '#2f6b52', roughness: 1 });

  const largeur = ESPACEMENT * 2 + 2.6;

  const plateau = new Mesh(new BoxGeometry(largeur, 0.3, 2.8), bois);
  plateau.position.y = -0.15;
  plateau.receiveShadow = true;
  mallette.add(plateau);

  // Doublure affleurante : elle sépare le bois du sujet et capte la lumière.
  const interieur = new Mesh(new BoxGeometry(largeur - 0.34, 0.06, 2.46), doublure);
  interieur.position.y = 0.015;
  interieur.receiveShadow = true;
  mallette.add(interieur);

  // Rebord arrière, bas : il suggère la valise ouverte sans occuper le fond.
  const rebord = new Mesh(new BoxGeometry(largeur, 0.7, 0.2), bois);
  rebord.position.set(0, 0.22, -1.42);
  rebord.rotation.x = -0.16;
  mallette.add(rebord);

  for (let i = -1; i <= 1; i++) {
    const alveole = new Mesh(new CylinderGeometry(0.72, 0.72, 0.08, 32), feutre);
    alveole.position.set(i * ESPACEMENT, 0.06, 0);
    alveole.receiveShadow = true;
    mallette.add(alveole);
  }

  return mallette;
}

export interface Showcase {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Met en avant l'espèce choisie ; `null` remet tout le monde en ligne. */
  mettreEnAvant(speciesId: string | null): void;
  /** Remplace les trois sujets présentés. */
  charger(speciesIds: readonly string[]): Promise<void>;
  update(dt: number): void;
  resize(largeur: number, hauteur: number): void;
  dispose(): void;
}

export async function createShowcase(renderer: WebGLRenderer): Promise<Showcase> {
  const scene = new Scene();
  scene.background = new Color('#e9efd9');

  const camera = new PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 2.7, 7.6);
  camera.lookAt(0, 0.45, 0);

  scene.add(new AmbientLight(0xffffff, 0.78));

  const cle = new DirectionalLight(0xfff7ec, 1.7);
  cle.position.set(-4, 7, 6);
  cle.castShadow = true;
  cle.shadow.mapSize.set(1024, 1024);
  cle.shadow.bias = -0.001;
  cle.shadow.camera.left = -7;
  cle.shadow.camera.right = 7;
  cle.shadow.camera.top = 6;
  cle.shadow.camera.bottom = -3;
  scene.add(cle);

  const appoint = new DirectionalLight(0xe8f0ff, 0.55);
  appoint.position.set(5, 3, 4);
  scene.add(appoint);

  const mallette = creerMallette();
  scene.add(mallette);

  const presentations: Presentation[] = [];
  let choisi: string | null = null;
  let temps = 0;

  const materiauSocle = () =>
    new MeshStandardMaterial({ color: '#0e7a57', roughness: 0.6, transparent: true, opacity: 0 });

  async function charger(speciesIds: readonly string[]): Promise<void> {
    for (const presentation of presentations) {
      scene.remove(presentation.support);
    }
    presentations.length = 0;
    choisi = null;

    const trois = speciesIds.slice(0, 3);
    const charges = await Promise.all(trois.map((id) => instantiate(getSpecies(id).model)));

    charges.forEach(({ object, clips }, index) => {
      const support = new Group();
      support.position.x = (index - 1) * ESPACEMENT;

      // Les modèles Bedrock regardent vers -Z : un demi-tour les met face caméra.
      object.rotation.y = Math.PI;
      support.add(object);

      const socle = new Mesh(new CircleGeometry(0.95, 40), materiauSocle());
      socle.rotation.x = -Math.PI / 2;
      socle.position.y = 0.09;
      support.add(socle);

      const repos = choisirClip(clips, 'ground_idle', 'battle_idle', 'blink');
      let mixer: AnimationMixer | null = null;
      if (repos) {
        mixer = new AnimationMixer(object);
        mixer.clipAction(repos).play();
        mixer.setTime(Math.random() * repos.duration);
      }

      // Les trois arrivent l'un apres l'autre : une apparition simultanee se
      // lit comme un changement d'image, pas comme une valise qui s'ouvre.
      support.scale.setScalar(0.01);
      scene.add(support);
      presentations.push({
        speciesId: trois[index]!,
        support,
        modele: object,
        mixer,
        socle,
        phase: index * 1.9,
        entree: 0,
        retard: index * 0.12,
      });
    });
  }

  function mettreEnAvant(speciesId: string | null): void {
    choisi = speciesId;
  }

  const cible = new Vector3();

  /** Sortie douce puis arrivee franche : le mouvement part vite et s'installe. */
  const adoucir = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  /** Rebond leger a l'arrivee, pour que l'entree ait du poids. */
  const rebondir = (t: number): number => {
    const x = Math.min(1, Math.max(0, t));
    return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
  };

  function update(dt: number): void {
    temps += dt;
    for (const presentation of presentations) {
      presentation.mixer?.update(dt);

      // Entree en scene, une seule fois.
      if (presentation.entree < 1) {
        if (presentation.retard > 0) {
          presentation.retard -= dt;
        } else {
          presentation.entree = Math.min(1, presentation.entree + dt * 2.4);
        }
      }

      const actif = presentation.speciesId === choisi;

      // Le sujet retenu s'avance, se redresse et s'allume ; les autres
      // reculent légèrement pour lui laisser la vedette.
      const monte = adoucir(presentation.entree);
      cible.set(
        presentation.support.position.x,
        (actif ? 0.14 : 0) + (1 - monte) * 1.1,
        actif ? 1 : 0
      );
      // Amorti constant quelle que soit la cadence d'affichage.
      const suivi = 1 - Math.pow(0.0008, dt);
      presentation.support.position.lerp(cible, suivi);

      const echelleVoulue = (actif ? 1.14 : 0.96) * rebondir(presentation.entree);
      const echelle = presentation.support.scale.x;
      presentation.support.scale.setScalar(echelle + (echelleVoulue - echelle) * suivi);

      // Sans animation de repos, une respiration discrète évite la statue.
      if (!presentation.mixer) {
        const souffle = Math.sin(temps * 1.6 + presentation.phase) * 0.02;
        presentation.modele.scale.set(1 - souffle * 0.5, 1 + souffle, 1 - souffle * 0.5);
      }

      // Le sujet choisi cesse de se balancer et se tourne face au joueur.
      const balancement = Math.sin(temps * 0.5 + presentation.phase) * (actif ? 0.06 : 0.22);
      presentation.modele.rotation.y = Math.PI + balancement;

      const materiau = presentation.socle.material as MeshStandardMaterial;
      // Le socle bat doucement sous le sujet retenu.
      const pulsation = actif ? 0.2 + Math.sin(temps * 2.6) * 0.06 : 0;
      materiau.opacity += (pulsation - materiau.opacity) * suivi;
      presentation.socle.scale.setScalar(actif ? 1.05 + Math.sin(temps * 2.6) * 0.04 : 1);
    }
  }

  function resize(largeur: number, hauteur: number): void {
    camera.aspect = largeur / Math.max(1, hauteur);
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    mettreEnAvant,
    charger,
    update,
    resize,
    dispose(): void {
      renderer.shadowMap.needsUpdate = true;
      scene.clear();
    },
  };
}

