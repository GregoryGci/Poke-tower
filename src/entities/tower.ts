/**
 * Pokémon posé : cherche une cible dans sa portée et tire.
 *
 * La portée est propre à l'espèce, modifiée par les traits. Le placement est
 * libre sur le terrain, seule la route est interdite — c'est le `PlacementRules`
 * du module de jeu qui tranche, pas cette classe.
 */

import { Object3D } from 'three';
import type { OwnedPokemon, Species } from '@/data/types';
import { RARITY_MULTIPLIER } from '@/data/types';
import type { Enemy } from './enemy';
import type { SpatialGrid } from '@/world/spatial';

export class Tower {
  object: Object3D | null = null;
  /** Cercle de portée, affiché à la sélection. */
  rangeIndicator: Object3D | null = null;

  x = 0;
  z = 0;
  range: number;
  damage: number;
  cooldown: number;
  private timer = 0;
  target: Enemy | null = null;

  constructor(
    readonly owned: OwnedPokemon,
    readonly species: Species
  ) {
    const rarity = RARITY_MULTIPLIER[owned.rarity];
    this.range = species.range * (1 + this.traitBonus('range'));
    // Une seule des quatre attaques pour l'instant : la rotation du movepool
    // arrive avec le système d'attaques complet (phase 2).
    const move = owned.moves[0];
    this.damage = move.power * 0.1 * rarity * (1 + this.traitBonus('stat'));
    this.cooldown = move.cooldown * (1 - Math.min(0.6, this.traitBonus('cooldown')));
  }

  private traitBonus(kind: 'stat' | 'range' | 'cooldown'): number {
    let total = 0;
    for (const trait of this.owned.traits) {
      if (trait.effect.kind === kind && 'percent' in trait.effect) {
        total += trait.effect.percent / 100;
      }
    }
    return total;
  }

  place(x: number, z: number): void {
    this.x = x;
    this.z = z;
    if (this.object) this.object.position.set(x, 0, z);
    if (this.rangeIndicator) {
      this.rangeIndicator.position.set(x, 0.03, z);
      this.rangeIndicator.scale.setScalar(this.range);
    }
  }

  /** Retourne l'ennemi à tirer dessus, ou null. */
  update(dt: number, enemies: SpatialGrid<Enemy>): Enemy | null {
    this.timer -= dt;

    // On garde la cible tant qu'elle est vivante et à portée : sans ça, la tour
    // change de cible à chaque tick et ne tue jamais rien.
    if (this.target && (this.target.state === 'mort' || this.outOfRange(this.target))) {
      this.target = null;
    }
    if (!this.target) {
      this.target = enemies.nearest(this.x, this.z, this.range, (e) => e.state !== 'mort' && e.state !== 'arrive');
    }
    if (this.timer > 0 || !this.target) return null;

    this.timer = this.cooldown;
    return this.target;
  }

  private outOfRange(enemy: Enemy): boolean {
    const dx = enemy.x - this.x;
    const dz = enemy.z - this.z;
    return dx * dx + dz * dz > this.range * this.range;
  }
}
