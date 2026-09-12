/**
 * Pokémon posé : cherche une cible dans sa portée et tire.
 *
 * La portée est propre à l'espèce, modifiée par les traits. Le placement est
 * libre sur le terrain, seule la route est interdite — c'est le `PlacementRules`
 * du module de jeu qui tranche, pas cette classe.
 */

import { Object3D } from 'three';
import type { Move, OwnedPokemon, Species } from '@/data/types';
import { RARITY_MULTIPLIER, STYLES, multiplicateurEtoiles, type StyleProfil } from '@/data/types';
import type { Enemy } from './enemy';
import type { SpatialGrid } from '@/world/spatial';

/**
 * Convertit la puissance d'une attaque du Pokédex en dégâts par tir.
 *
 * Calibré par la mesure, une fois le ciblage réparé : à 0,3, un Pokémon abat
 * un Rattata en deux tirs. Une tour seule tient alors la vague d'ouverture
 * mais tombe sur la deuxième, en ayant récolté de quoi invoquer un renfort.
 * C'est la tension recherchée — élargir son équipe, pas rejouer la même.
 */
const FACTEUR_DEGATS = 0.3;

/**
 * Stat de reference.
 *
 * Les degats d'un Pokemon doivent dependre de ses vraies stats du Pokedex,
 * sinon deux especes portant la meme attaque frappent pareil et le roster
 * n'a aucun relief. Une stat de 50 laisse le calcul inchange.
 */
const STAT_REFERENCE = 50;

/** Retient l'attaque au meilleur rendement, en ignorant les attaques de statut. */
function choisirAttaque(owned: OwnedPokemon): Move {
  const offensives = owned.moves.filter((candidat) => candidat.power > 0);
  const pool = offensives.length ? offensives : owned.moves;
  return pool.reduce((meilleure, candidat) =>
    candidat.power / candidat.cooldown > meilleure.power / meilleure.cooldown ? candidat : meilleure
  );
}

export class Tower {
  object: Object3D | null = null;
  /** Cercle de portée, affiché à la sélection. */
  rangeIndicator: Object3D | null = null;

  x = 0;
  z = 0;
  range: number;
  damage: number;
  cooldown: number;
  /** Profil de frappe, lu par le jeu pour appliquer les degats. */
  readonly style: StyleProfil;
  /** Attaque retenue, pour la répartition par élément du bilan. */
  readonly move: Move;
  private timer = 0;
  target: Enemy | null = null;

  /** Secondes restantes avant le prochain tir. */
  get recharge(): number {
    return Math.max(0, this.timer);
  }

  /** Part de recharge restante, de 0 (prete a tirer) a 1 (vient de tirer). */
  get rechargePart(): number {
    return this.cooldown <= 0 ? 0 : Math.min(1, Math.max(0, this.timer / this.cooldown));
  }

  constructor(
    readonly owned: OwnedPokemon,
    readonly species: Species
  ) {
    const rarity = RARITY_MULTIPLIER[owned.rarity];
    this.range = species.range * (1 + this.traitBonus('range'));
    // On retient la plus efficace des quatre, pas la premiere : un tirage
    // pouvait placer une attaque de statut en tete, et l'unite ne faisait alors
    // aucun degat. La rotation complete du movepool viendra plus tard.
    const move = choisirAttaque(owned);
    this.move = move;
    const etoiles = multiplicateurEtoiles(owned.stars);
    this.style = STYLES[species.style];

    // Physique ou special : l'attaque puise dans la stat correspondante.
    const puissance =
      move.category === 'special' ? species.baseStats.atkSpe : species.baseStats.atk;
    const affinite = puissance / STAT_REFERENCE;

    this.damage =
      move.power * FACTEUR_DEGATS * affinite * rarity * etoiles * this.style.degats * (1 + this.traitBonus('stat'));
    this.cooldown =
      move.cooldown * this.style.cadence * (1 - Math.min(0.6, this.traitBonus('cooldown')));
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
    //
    // Le test porte sur `active` et non sur le seul état « mort » : une unité
    // en agonie ou déjà sortie du terrain reste un objet valide, à sa dernière
    // position. S'y accrocher revient à tirer indéfiniment sur un cadavre
    // pendant que les vivants défilent à côté.
    if (this.target && (!this.target.active || this.outOfRange(this.target))) {
      this.target = null;
    }
    if (!this.target) {
      this.target = enemies.nearest(this.x, this.z, this.range, (e) => e.active);
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
