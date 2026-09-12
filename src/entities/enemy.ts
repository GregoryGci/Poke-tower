/**
 * Ennemi : avance le long du chemin jusqu'à la sortie.
 *
 * Sa position n'est pas simulée librement — elle se déduit d'une distance
 * parcourue. Cent ennemis, c'est donc cent additions par tick, et aucun
 * risque qu'un ennemi quitte la route.
 */

import { Vector2 } from 'three';
import type { EnemyPath } from '@/world/path';
import type { SpatialItem } from '@/world/spatial';
import type { Poolable } from '@/core/pool';

/**
 * 'mort' est l'instant du coup fatal ; 'ko' est l'agonie jouée à l'écran.
 * Les deux sont distincts pour que les cristaux ne soient comptés qu'une fois.
 */
export type EnemyState = 'marche' | 'attire' | 'mort' | 'ko' | 'arrive';

export class Enemy implements Poolable, SpatialItem {
  /** Espèce affichée : décide de la foule instanciée qui la rendra. */
  speciesId = '';
  /** Décalage d'animation, pour que la vague ne marche pas au pas cadencé. */
  phase = 0;
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
  /** Secondes restantes d'agonie avant de rendre l'unité au réservoir. */
  corpseTimer = 0;

  private readonly tmp = new Vector2();

  reset(): void {
    this.speciesId = '';
    this.phase = 0;
    this.path = null;
    this.x = this.z = this.prevX = this.prevZ = 0;
    this.distance = 0;
    this.speed = 2.2;
    this.hp = this.maxHp = 10;
    this.offset = 0;
    this.state = 'marche';
    this.lure = null;
    this.corpseTimer = 0;
  }

  spawn(speciesId: string, path: EnemyPath, hp: number, speed: number, offset: number): void {
    this.speciesId = speciesId;
    this.phase = Math.random() * 4;
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

  /** Vrai tant que l'unité participe au jeu : ni morte, ni sortie. */
  get active(): boolean {
    return this.state === 'marche' || this.state === 'attire';
  }

  update(dt: number, tick: number): void {
    if (!this.active || !this.path) return;
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


  /** Position lissée pour le rendu, entre deux ticks. */
  renderAt(alpha: number, out: Vector2): Vector2 {
    return out.set(
      this.prevX + (this.x - this.prevX) * alpha,
      this.prevZ + (this.z - this.prevZ) * alpha
    );
  }
}
