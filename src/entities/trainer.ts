/**
 * Le dresseur.
 *
 * Il se déplace librement, traverse le terrain sans collision pour l'instant,
 * et reste dans les limites de la carte. Ses actions (objets, capture) sont
 * déclenchées par le module de jeu, pas ici.
 *
 * Deux façons de le conduire, et le clavier a toujours la priorité : ZQSD le
 * pousse dans une direction, un clic gauche sur le terrain lui donne un point
 * à rejoindre. Reprendre le clavier annule la destination — sinon le dresseur
 * repartirait tout seul dès qu'on relâche la touche.
 */

import { Object3D, Vector2 } from 'three';

/** Distance en dessous de laquelle la destination est considérée atteinte. */
const ARRIVEE = 0.2;

export class Trainer {
  object: Object3D | null = null;
  x = 0;
  z = 0;
  prevX = 0;
  prevZ = 0;
  speed = 6;
  /** Demi-côté du terrain : le dresseur ne sort pas de la carte. */
  bounds = 15;

  private readonly velocity = new Vector2();

  /**
   * Hauteur au-dessus du sol, en unités. Zéro quand le dresseur touche terre.
   *
   * Le saut est **purement visuel** : il ne change ni la portée, ni la
   * collision, ni ce que le clic atteint. C'est délibéré — un saut qui
   * modifierait la pose ou le tir ouvrirait une deuxième physique à tenir,
   * pour un geste dont l'intérêt est d'être expressif.
   */
  hauteur = 0;
  private vitesseVerticale = 0;
  /** Point à rejoindre, posé au clic. Null quand le dresseur est à l'arrêt. */
  private destination: Vector2 | null = null;

  place(x: number, z: number): void {
    this.x = this.prevX = x;
    this.z = this.prevZ = z;
    this.destination = null;
    this.object?.position.set(x, 0, z);
  }

  /** Envoie le dresseur vers un point du terrain, en ligne droite. */
  allerVers(x: number, z: number): void {
    const cible = this.destination ?? new Vector2();
    cible.set(clamp(x, this.bounds), clamp(z, this.bounds));
    this.destination = cible;
  }

  /** Vrai tant que le dresseur quitte le sol. */
  get enLAir(): boolean {
    return this.hauteur > 0.001;
  }

  /**
   * Saute, si les pieds sont au sol.
   *
   * Pas de double saut : on ne relance l'impulsion que depuis le sol. Sans ce
   * garde-fou, maintenir la barre d'espace ferait monter le dresseur
   * indéfiniment.
   */
  sauter(): boolean {
    if (this.enLAir) return false;
    this.vitesseVerticale = IMPULSION;
    return true;
  }

  /** Vrai tant que le dresseur a un point à rejoindre. */
  get enRoute(): boolean {
    return this.destination !== null;
  }

  /** Point visé, pour en dessiner le repère. Null s'il n'y en a pas. */
  get cible(): Vector2 | null {
    return this.destination;
  }

  /**
   * Fait avancer le dresseur d'un tick.
   *
   * `capCamera` est le cap **courant** de la caméra, en radians. Il était
   * auparavant une constante alignée à la main sur le cap d'origine : depuis
   * que le joueur peut tourner la vue, ZQSD poussait donc dans une direction
   * qui n'avait plus rien à voir avec ce qu'il voyait à l'écran.
   */
  update(dt: number, input: Vector2, capCamera: number): void {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.avancerSaut(dt);

    if (input.lengthSq() > 0) {
      // Le clavier reprend la main : la destination posée au clic tombe.
      this.destination = null;
      // L'entrée est en repère écran ; on la ramène dans le repère du monde
      // en la tournant du cap de la caméra.
      this.velocity.copy(input).rotateAround(ORIGIN, -capCamera);
    } else if (this.destination) {
      const dx = this.destination.x - this.x;
      const dz = this.destination.y - this.z;
      const reste = Math.hypot(dx, dz);
      if (reste <= ARRIVEE) {
        this.destination = null;
        return;
      }
      // On ne dépasse jamais la cible : sans ce plafond, le dresseur
      // oscillerait autour d'elle dès que le pas de simulation devient plus
      // long que la distance restante.
      const pasPlein = this.speed * dt;
      const fraction = pasPlein > 0 ? Math.min(1, reste / pasPlein) : 0;
      this.velocity.set((dx / reste) * fraction, (dz / reste) * fraction);
    } else {
      return;
    }

    if (this.velocity.lengthSq() <= 0) return;
    this.x = clamp(this.x + this.velocity.x * this.speed * dt, this.bounds);
    this.z = clamp(this.z + this.velocity.y * this.speed * dt, this.bounds);
    if (this.object) {
      this.object.position.set(this.x, 0, this.z);
      this.object.rotation.y = Math.atan2(this.velocity.x, this.velocity.y);
    }
  }

  /**
   * Un pas de saut.
   *
   * Intégration d'Euler toute simple, et une gravité plus forte que la vraie :
   * à 9,81 le dresseur flotte, parce que l'échelle du terrain n'est pas celle
   * du monde réel. Ce qu'on cherche est un bond sec, pas une chute libre.
   */
  private avancerSaut(dt: number): void {
    if (!this.enLAir && this.vitesseVerticale <= 0) {
      this.vitesseVerticale = 0;
      this.hauteur = 0;
      return;
    }
    this.vitesseVerticale -= GRAVITE * dt;
    this.hauteur += this.vitesseVerticale * dt;
    if (this.hauteur <= 0) {
      this.hauteur = 0;
      this.vitesseVerticale = 0;
    }
  }

  renderAt(alpha: number, out: Vector2): Vector2 {
    return out.set(
      this.prevX + (this.x - this.prevX) * alpha,
      this.prevZ + (this.z - this.prevZ) * alpha
    );
  }
}

const ORIGIN = new Vector2(0, 0);

/**
 * Impulsion et gravité du saut.
 *
 * Réglées ensemble : à 7,2 d'impulsion pour 26 de gravité, le bond culmine à
 * un peu moins d'une unité et dure environ 0,55 s. Assez haut pour se voir en
 * vue plongeante, assez court pour qu'on puisse enchaîner sans attendre.
 */
const IMPULSION = 7.2;
const GRAVITE = 26;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
