/**
 * Barres de vie des ennemis.
 *
 * Une barre par mob, et il peut y en avoir plus de cent : un maillage par
 * ennemi coûterait plus cher en appels de rendu que les ennemis eux-mêmes.
 * Tout passe donc par deux `InstancedMesh` — le fond et le remplissage — soit
 * **deux appels de rendu quel que soit l'effectif**.
 *
 * Les barres sont des quads posés dans le plan de l'écran. Comme la caméra ne
 * change que de cap, l'orientation est calculée une fois par image et
 * partagée par toutes les instances.
 *
 * Le remplissage se rétrécit par la gauche : sa géométrie est décalée d'un
 * demi-quad pour que son origine soit son bord gauche. Un quad centré, mis à
 * l'échelle, se viderait par les deux côtés à la fois.
 */

import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Camera,
} from 'three';

/** Largeur d'une barre, en unités monde. */
const LARGEUR = 1.05;
/** Hauteur d'une barre. Volontairement fine : c'est un repère, pas un décor. */
const HAUTEUR = 0.11;
/** Épaisseur du liseré sombre autour du remplissage. */
const LISERE = 0.02;

/**
 * Rouge du début à la fin.
 *
 * La barre était verte à pleine vie et virait au rouge à l'agonie. C'était
 * une information de plus à lire alors que la longueur de la barre la donne
 * déjà, et surtout le vert se confondait avec le feuillage pendant qu'un
 * Pokémon vert passait dessous. Le rouge se détache de tous les décors du
 * jeu — herbe, cendre, pierre — et il dit ce qu'il faut : c'est un ennemi.
 *
 * Deux teintes tout de même, du sang au vermillon : sans le moindre écart la
 * barre paraît plate, et on ne distingue plus la jauge de son fond.
 */
const PLEINE = new Color('#e0362b');
const VIDE = new Color('#7d1410');

export interface OptionsBarres {
  capacite: number;
}

export class BarresVie {
  readonly fond: InstancedMesh;
  readonly jauge: InstancedMesh;

  private readonly matrice = new Matrix4();
  private readonly orientation = new Quaternion();
  private readonly position = new Vector3();
  private readonly echelle = new Vector3();
  private readonly teinte = new Color();
  private readonly decalage = new Vector3();
  private readonly capacite: number;
  private ecrites = 0;

  constructor(options: OptionsBarres) {
    this.capacite = options.capacite;
    const fondGeo = new PlaneGeometry(1, 1);
    const jaugeGeo = new PlaneGeometry(1, 1);
    // L'origine du remplissage passe sur son bord gauche.
    jaugeGeo.translate(0.5, 0, 0);

    this.fond = new InstancedMesh(
      fondGeo,
      new MeshBasicMaterial({ color: '#1e2a1c', transparent: true, opacity: 0.78 }),
      options.capacite
    );
    this.jauge = new InstancedMesh(
      jaugeGeo,
      new MeshBasicMaterial({ color: '#ffffff' }),
      options.capacite
    );

    for (const mesh of [this.fond, this.jauge]) {
      // La caméra est fixe en plongée et le terrain tient dans le champ : le
      // culling par instance ne rapporterait rien, comme pour les foules.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // Les barres se lisent par-dessus tout, y compris par-dessus un boss.
      mesh.renderOrder = 3;
      (mesh.material as MeshBasicMaterial).depthTest = false;
      mesh.count = 0;
    }
  }

  /** À appeler une fois par image, avant les ajouts. */
  begin(camera: Camera): void {
    this.ecrites = 0;
    // Toutes les barres partagent le cap de la caméra : une seule extraction.
    camera.getWorldQuaternion(this.orientation);
  }

  /**
   * Ajoute une barre au-dessus d'une unité.
   *
   * `part` est la fraction de vie restante, de 0 à 1. `largeur` permet
   * d'élargir la barre d'un boss, dont la silhouette écraserait une barre de
   * taille ordinaire.
   */
  add(x: number, y: number, z: number, part: number, largeur = 1): void {
    const index = this.ecrites;
    // Capacité atteinte : on laisse tomber les barres en trop plutôt que
    // d'écrire hors du tampon.
    if (index >= this.capacite) return;

    const l = LARGEUR * largeur;
    const borne = Math.max(0, Math.min(1, part));

    this.position.set(x, y, z);

    this.echelle.set(l + LISERE * 2, HAUTEUR + LISERE * 2, 1);
    this.matrice.compose(this.position, this.orientation, this.echelle);
    this.fond.setMatrixAt(index, this.matrice);

    // Le remplissage démarre au bord gauche du fond.
    this.position.x = x;
    this.echelle.set(l * borne, HAUTEUR, 1);
    this.matrice.compose(this.position, this.orientation, this.echelle);
    // Le décalage vers la gauche se fait dans le repère de la caméra, sinon la
    // barre glisserait de côté dès qu'on tourne la vue. Le vecteur est réutilisé :
    // en allouer un par unité ferait cent allocations par image.
    this.decalage.set(-l / 2, 0, 0).applyQuaternion(this.orientation);
    this.matrice.setPosition(x + this.decalage.x, y + this.decalage.y, z + this.decalage.z);
    this.jauge.setMatrixAt(index, this.matrice);

    this.teinte.copy(VIDE).lerp(PLEINE, borne);
    this.jauge.setColorAt(index, this.teinte);

    this.ecrites = index + 1;
  }

  end(): void {
    this.fond.count = this.ecrites;
    this.jauge.count = this.ecrites;
    this.fond.instanceMatrix.needsUpdate = true;
    this.jauge.instanceMatrix.needsUpdate = true;
    if (this.jauge.instanceColor) this.jauge.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.fond, this.jauge]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    }
  }
}
