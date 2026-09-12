/**
 * Ennemi : avance le long du chemin jusqu'à la sortie.
 *
 * Sa position n'est pas simulée librement — elle se déduit d'une distance
 * parcourue. Cent ennemis, c'est donc cent additions par tick, et aucun
 * risque qu'un ennemi quitte la route.
 */

import { Object3D, Vector2 } from 'three';
import type { EnemyPath } from '@/world/path';
import type { SpatialItem } from '@/world/spatial';
import type { Poolable } from '@/core/pool';

export type EnemyState = 'marche' | 'attire' | 'mort' | 'arrive';

export class Enemy implements Poolable, SpatialItem {
  object: Object3D | null = null;
  path: EnemyPath | null = null;

  x = 0;
  z = 0;
  /** Position au tick précédent, pour interpoler au rendu. */
  prevX = 0;
  prevZ = 0;

  distance = 0;
  speed = 2.2;
  hp = 10;
  maxHp = 10;
  /** Décalage latéral, pour éviter la file indienne. */
  offset = 0;
  state: EnemyState = 'marche';
  /** Cible d'un appât lancé par le dresseur, s'il y en a un. */
  lure: { x: number; z: number; until: number } | null = null;

  private readonly tmp = new Vector2();

  reset(): void {
    this.object = null;
    this.path = null;
    this.x = this.z = this.prevX = this.prevZ = 0;
    this.distance = 0;
    this.speed = 2.2;
    this.hp = this.maxHp = 10;
    this.offset = 0;
    this.state = 'marche';
    this.lure = null;
  }

  spawn(path: EnemyPath, hp: number, speed: number, offset: number): void {
    this.path = path;
    this.hp = this.maxHp = hp;
    this.speed = speed;
    this.offset = offset;
    this.distance = 0;
    this.state = 'marche';
    this.syncPosition();
    this.prevX = this.x;
    this.prevZ = this.z;
  }

  /** Seuil de capture : en dessous, le dresseur peut tenter une capsule. */
  get capturable(): boolean {
    return this.state !== 'mort' && this.hp / this.maxHp <= 0.25;
  }

  damage(amount: number): boolean {
    if (this.state === 'mort') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'mort';
      return true;
    }
    return false;
  }

  update(dt: number, tick: number): void {
    if (this.state === 'mort' || this.state === 'arrive' || !this.path) return;
    this.prevX = this.x;
    this.prevZ = this.z;

    if (this.lure && tick < this.lure.until) {
      // Détourné : il marche vers l'appât sans perdre sa progression.
      const dx = this.lure.x - this.x;
      const dz = this.lure.z - this.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        const step = Math.min(this.speed * dt, len);
        this.x += (dx / len) * step;
        this.z += (dz / len) * step;
      }
      this.state = 'attire';
      this.applyToObject();
      return;
    }

    this.lure = null;
    this.state = 'marche';
    this.distance += this.speed * dt;
    if (this.distance >= this.path.length) {
      this.distance = this.path.length;
      this.state = 'arrive';
    }
    this.syncPosition();
    this.applyToObject();
  }

  private syncPosition(): void {
    if (!this.path) return;
    this.path.sample(this.distance, this.tmp);
    const px = this.tmp.x;
    const pz = this.tmp.y;
    this.path.direction(this.distance, this.tmp);
    this.x = px - this.tmp.y * this.offset;
    this.z = pz + this.tmp.x * this.offset;
  }

  private applyToObject(): void {
    if (!this.object) return;
    this.object.position.set(this.x, 0, this.z);
    const dx = this.x - this.prevX;
    const dz = this.z - this.prevZ;
    if (dx * dx + dz * dz > 1e-6) this.object.rotation.y = Math.atan2(dx, dz);
  }

  /** Position lissée pour le rendu, entre deux ticks. */
  renderAt(alpha: number, out: Vector2): Vector2 {
    return out.set(
      this.prevX + (this.x - this.prevX) * alpha,
      this.prevZ + (this.z - this.prevZ) * alpha
    );
  }
}
