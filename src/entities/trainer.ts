/**
 * Le dresseur.
 *
 * Il se déplace librement, traverse le terrain sans collision pour l'instant,
 * et reste dans les limites de la carte. Ses actions (objets, capture) sont
 * déclenchées par le module de jeu, pas ici.
 */

import { Object3D, Vector2 } from 'three';

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

  place(x: number, z: number): void {
    this.x = this.prevX = x;
    this.z = this.prevZ = z;
    this.object?.position.set(x, 0, z);
  }

  update(dt: number, input: Vector2): void {
    this.prevX = this.x;
    this.prevZ = this.z;
    // L'entrée est en repère écran ; la caméra étant fixe, une rotation
    // constante suffit à la ramener dans le repère du monde.
    this.velocity.copy(input).rotateAround(ORIGIN, -CAMERA_YAW);
    if (this.velocity.lengthSq() > 0) {
      this.x = clamp(this.x + this.velocity.x * this.speed * dt, this.bounds);
      this.z = clamp(this.z + this.velocity.y * this.speed * dt, this.bounds);
      if (this.object) {
        this.object.position.set(this.x, 0, this.z);
        this.object.rotation.y = Math.atan2(this.velocity.x, this.velocity.y);
      }
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
/** Doit rester aligné sur le YAW de la caméra dans render/scene.ts. */
const CAMERA_YAW = (35 * Math.PI) / 180;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
