/**
 * Portraits 2D des Pokémon.
 *
 * Les vignettes n'étaient qu'une pastille de couleur portant la première
 * lettre du nom : lisible, mais rien n'y ressemblait au Pokémon. Sur une carte
 * d'invocation, c'est pourtant le sujet.
 *
 * Le portrait est **rendu depuis le modèle 3D déjà converti**, une fois par
 * espèce, dans un renderer hors écran, puis gardé en cache sous forme de
 * data URL. C'est délibéré, et c'est le point important :
 *
 *  - aucun asset de plus à trouver, à convertir ou à distribuer. Les sprites
 *    2D officiels du Pokédex n'existent pas dans l'extraction Cobblemon — les
 *    PNG qu'elle contient sont les atlas UV des modèles, pas des portraits ;
 *  - aucune question de licence en plus : c'est le même asset, sous la même
 *    licence, vu sous un autre angle ;
 *  - le portrait ne peut pas mentir sur ce qu'on obtient, puisque c'est
 *    littéralement le modèle qui sera posé sur le terrain. Un sprite venu
 *    d'ailleurs aurait fini par diverger.
 *
 * Le cadrage est calculé sur la boîte englobante réelle : les silhouettes
 * vont de Racaillou, large et bas, à Arcko, haut et fin, et un cadrage fixe
 * en aurait coupé la moitié.
 */

import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { instantiate } from '@/core/assets';
import { getSpecies } from '@/data/content';

/** Côté du portrait, en pixels. */
const TAILLE = 192;

/**
 * Part de la hauteur du cadre occupée par le sujet.
 *
 * En dessous de 1, il reste une marge : un sujet qui touche les quatre bords
 * paraît à l'étroit, et la vignette perd sa silhouette — or c'est la
 * silhouette qu'on reconnaît d'un coup d'oeil.
 */
const REMPLISSAGE = 0.78;

/** Portraits déjà produits, par identifiant d'espèce. */
const cache = new Map<string, Promise<string>>();

interface Atelier {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  support: Group;
}

let atelier: Atelier | null = null;

/**
 * Monte l'atelier de rendu, une seule fois.
 *
 * Un contexte WebGL de plus, minuscule et réutilisé pour toutes les espèces.
 * En créer un par portrait épuiserait la limite du navigateur (une quinzaine
 * de contextes) dès la première collection un peu fournie.
 */
function ouvrirAtelier(): Atelier {
  if (atelier) return atelier;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(TAILLE, TAILLE, false);
  // Fond transparent : la carte garde sa propre couleur derrière le sujet, ce
  // qui laisse la rareté s'exprimer par le cadre.
  renderer.setClearAlpha(0);

  const scene = new Scene();

  // Éclairage de studio, pas de niveau : trois sources douces, aucune ombre
  // portée. Le sujet doit se lire, pas être mis en scène.
  scene.add(new AmbientLight(0xffffff, 0.9));
  const cle = new DirectionalLight(0xfff7ec, 1.5);
  cle.position.set(-3, 5, 6);
  scene.add(cle);
  const appoint = new DirectionalLight(0xdce8ff, 0.6);
  appoint.position.set(4, 2, 3);
  scene.add(appoint);

  const camera = new PerspectiveCamera(32, 1, 0.05, 100);
  const support = new Group();
  scene.add(support);

  atelier = { renderer, scene, camera, support };
  return atelier;
}

/**
 * Produit le portrait d'une espèce.
 *
 * Le résultat est une data URL PNG, mise en cache : la promesse elle-même est
 * stockée, pas seulement son résultat, pour que deux vignettes demandant la
 * même espèce en même temps ne déclenchent pas deux rendus.
 */
export function portrait(speciesId: string): Promise<string> {
  const deja = cache.get(speciesId);
  if (deja) return deja;

  const travail = produire(speciesId).catch((erreur) => {
    // Un portrait manquant ne doit jamais empêcher d'afficher une vignette :
    // l'appelant retombe sur la pastille à lettre.
    console.warn(`Portrait indisponible pour ${speciesId} :`, erreur);
    cache.delete(speciesId);
    throw erreur;
  });
  cache.set(speciesId, travail);
  return travail;
}

async function produire(speciesId: string): Promise<string> {
  const { renderer, scene, camera, support } = ouvrirAtelier();
  const { object } = await instantiate(getSpecies(speciesId).model);

  support.clear();
  // Les modèles Bedrock regardent vers -Z : un demi-tour les met face caméra.
  // Le léger quart supplémentaire donne une vue trois-quarts, qui montre le
  // volume là où une vue de face écrase tout sur un plan.
  object.rotation.y = Math.PI + 0.55;
  support.add(object);

  // On mesure APRÈS avoir tourné : la boîte englobante d'un sujet pivoté
  // n'est pas celle du même sujet de face, et cadrer sur la mauvaise couperait
  // les silhouettes les plus larges.
  support.updateMatrixWorld(true);
  const boite = new Box3().setFromObject(support);
  const centre = boite.getCenter(new Vector3());
  const etendue = boite.getSize(new Vector3());

  // On cadre sur la plus grande dimension visible : un sujet large et bas
  // (Racaillou) doit tenir en largeur, un sujet haut et fin (Arcko) en hauteur.
  const rayon = Math.max(etendue.x, etendue.y) / 2 || 0.5;
  const champ = (camera.fov * Math.PI) / 360;
  const distance = rayon / (Math.tan(champ) * REMPLISSAGE);

  // On se place à `distance` du **centre** du sujet, pas de sa face avant :
  // ajouter la profondeur entière du modèle reculait la caméra d'un tiers de
  // trop, et les sujets ne remplissaient plus que la moitié du cadre. Le plan
  // de coupe proche est assez petit pour que rien ne soit rogné devant.
  camera.position.set(centre.x, centre.y, centre.z + distance);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = recadrer(renderer.domElement);

  support.clear();
  return url;
}

/**
 * Marge conservée autour du sujet, en part de son plus grand côté.
 *
 * Assez pour que la silhouette respire, pas assez pour qu'elle flotte.
 */
const MARGE = 0.08;

/**
 * Recadre le rendu sur le sujet.
 *
 * Sans ça, chaque portrait garde les marges de son propre cadrage, et elles
 * s'ajoutent à celles de la vignette : sur une carte d'invocation de 88 px, le
 * Pokémon n'occupait plus que la moitié du carré, et un Roucool paraissait
 * deux fois plus petit qu'un Medhyèna alors que les deux tiennent la même
 * place dans une équipe.
 *
 * On mesure donc la boîte des pixels opaques et on réexporte dessus, dans un
 * carré : toutes les espèces remplissent alors leur image de la même façon,
 * quelle que soit leur silhouette.
 */
function recadrer(rendu: HTMLCanvasElement): string {
  const { width, height } = rendu;

  // Le canvas du renderer porte un contexte WebGL : lui demander un contexte
  // « 2d » renvoie null. On recopie donc le rendu dans un canvas 2D pour
  // pouvoir en lire les pixels — c'est ce que permet `preserveDrawingBuffer`,
  // activé à la création du renderer pour cette raison précise.
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const lecture = source.getContext('2d');
  if (!lecture) return rendu.toDataURL('image/png');
  lecture.drawImage(rendu, 0, 0);

  const pixels = lecture.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Seuil plutôt que zéro : le lissage laisse un halo à peine visible
      // tout autour, qui annulerait le recadrage.
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // Rendu entièrement vide : rien à recadrer, et mieux vaut rendre l'image
  // telle quelle que de diviser par zéro.
  if (maxX < 0) return rendu.toDataURL('image/png');

  const largeurSujet = maxX - minX + 1;
  const hauteurSujet = maxY - minY + 1;
  const cote = Math.max(largeurSujet, hauteurSujet) * (1 + MARGE * 2);

  const sortie = document.createElement('canvas');
  sortie.width = sortie.height = Math.round(cote);
  const ctx = sortie.getContext('2d');
  if (!ctx) return rendu.toDataURL('image/png');

  // Le sujet est centré dans le carré : une silhouette large et basse comme
  // Racaillou reste centrée plutôt que collée en haut.
  ctx.drawImage(
    source,
    minX,
    minY,
    largeurSujet,
    hauteurSujet,
    (sortie.width - largeurSujet) / 2,
    (sortie.height - hauteurSujet) / 2,
    largeurSujet,
    hauteurSujet
  );
  return sortie.toDataURL('image/png');
}

/** Vide le cache et rend le contexte WebGL. Utile aux tests, pas au jeu. */
export function fermerAtelier(): void {
  cache.clear();
  atelier?.renderer.dispose();
  atelier = null;
}
