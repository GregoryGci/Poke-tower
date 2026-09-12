/**
 * Projectile recyclé.
 *
 * Il vise là où la cible se trouve au tir, pas là où elle sera : les tours
 * ratent donc les ennemis rapides, ce qui donne un sens à la vitesse.
 */

import { Object3D } from 'three';
import type { Poolable } from '@/core/pool';
import type { Enemy } from './enemy';
import type { PokemonType, StyleProfil } from '@/data/types';

export class Projectile implements Poolable {
  object: Object3D | null = null;
  x = 0;
  z = 0;
  targetX = 0;
  targetZ = 0;
  speed = 12;
  damage = 0;
  alive = false;
  /** Profil de frappe, pour savoir qui encaisser a l'impact. */
  style: StyleProfil | null = null;
  /** Point de depart, necessaire pour tracer le couloir d'un tir transperçant. */
  fromX = 0;
  fromZ = 0;
  /** Auteur du tir, pour lui imputer ses dégâts dans le bilan. */
  ownerId: string | null = null;
  /** Type de l'attaque, pour la répartition par élément. */
  moveType: PokemonType | null = null;
  /** Cible visée : sert à appliquer les dégâts si elle est encore là. */
  target: Enemy | null = null;

  reset(): void {
    this.object = null;
    this.x = this.z = this.targetX = this.targetZ = 0;
    this.speed = 12;
    this.damage = 0;
    this.alive = false;
    this.target = null;
    this.style = null;
    this.fromX = 0;
    this.fromZ = 0;
    this.ownerId = null;
    this.moveType = null;
  }

  launch(
    fromX: number,
    fromZ: number,
    target: Enemy,
    damage: number,
    speed: number,
    style: StyleProfil
  ): void {
    this.x = fromX;
    this.z = fromZ;
    this.fromX = fromX;
    this.fromZ = fromZ;
    this.style = style;
    this.target = target;
    this.targetX = target.x;
    this.targetZ = target.z;
    this.damage = damage;
    this.speed = speed;
    this.alive = true;
  }

  /**
   * Duree de vol estimee, en secondes.
   *
   * Un minimum est impose : un tir a bout portant durerait sinon une image,
   * et son apercu ne serait jamais vu.
   */
  get dureeVol(): number {
    const distance = Math.hypot(this.targetX - this.fromX, this.targetZ - this.fromZ);
    return this.speed > 0 ? Math.max(0.14, distance / this.speed) : 0.14;
  }

  /** Retourne true quand le projectile a touché ou expiré. */
  update(dt: number): boolean {
    if (!this.alive) return true;
    // Une cible encore vivante est repoursuivie : sinon le tir part dans le vide
    // dès que l'ennemi bouge un peu.
    if (this.target && this.target.state !== 'mort') {
      this.targetX = this.target.x;
      this.targetZ = this.target.z;
    }
    const dx = this.targetX - this.x;
    const dz = this.targetZ - this.z;
    const len = Math.hypot(dx, dz);
    const step = this.speed * dt;
    if (len <= step) {
      this.x = this.targetX;
      this.z = this.targetZ;
      this.alive = false;
      return true;
    }
    this.x += (dx / len) * step;
    this.z += (dz / len) * step;
    if (this.object) this.object.position.set(this.x, 0.6, this.z);
    return false;
  }
}
