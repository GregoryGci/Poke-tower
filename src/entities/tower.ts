/**
 * Pokémon posé : cherche une cible dans sa portée et tire.
 *
 * La portée est propre à l'espèce, modifiée par les traits. Le placement est
 * libre sur le terrain, seule la route est interdite — c'est le `PlacementRules`
 * du module de jeu qui tranche, pas cette classe.
 */

import { Object3D } from 'three';
import type { Move, OwnedPokemon, Species } from '@/data/types';
import { RARITY_MULTIPLIER, STYLES, type StyleProfil } from '@/data/types';
import { statsEffectives } from '@/data/stats';
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

/**
 * Ce qu'une tour décide sur un tick.
 *
 * Trois issues seulement, et elles sont exclusives : rien, le début d'une
 * incantation, ou le tir. Renvoyer un ennemi nu ne suffisait plus — le jeu
 * doit savoir distinguer « je me prépare » de « je frappe » pour afficher la
 * zone visée pendant la préparation.
 */
export type ActionTour =
  | { kind: 'rien' }
  | { kind: 'cast'; cible: Enemy; duree: number }
  | { kind: 'tir'; cible: Enemy };

const RIEN: ActionTour = { kind: 'rien' };

export class Tower {
  object: Object3D | null = null;
  /** Cercle de portée, affiché à la sélection. */
  rangeIndicator: Object3D | null = null;

  x = 0;
  z = 0;
  range: number;
  damage: number;
  cooldown: number;
  /** Temps d'incantation avant le tir, en secondes. */
  cast: number;
  /** Profil de frappe, lu par le jeu pour appliquer les degats. */
  readonly style: StyleProfil;
  /** Attaque retenue, pour la répartition par élément du bilan. */
  readonly move: Move;
  private timer = 0;
  /** Temps d'incantation restant. Zéro quand l'unité ne s'incante pas. */
  private castRestant = 0;
  target: Enemy | null = null;

  /** Vrai pendant l'incantation : l'unité est engagée, pas encore à l'oeuvre. */
  get enIncantation(): boolean {
    return this.castRestant > 0;
  }

  /** Secondes restantes avant le prochain tir, incantation comprise. */
  get recharge(): number {
    return Math.max(0, this.castRestant > 0 ? this.castRestant : this.timer);
  }

  /**
   * Part d'attente restante, de 0 (sur le point de frapper) à 1.
   *
   * La même jauge sert aux deux temps : pendant l'incantation elle se vide sur
   * la durée du cast, sinon sur celle de la recharge. Deux jauges distinctes
   * demanderaient au joueur de savoir laquelle regarder.
   */
  get rechargePart(): number {
    if (this.castRestant > 0) {
      return this.cast <= 0 ? 0 : Math.min(1, Math.max(0, this.castRestant / this.cast));
    }
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
    this.style = STYLES[species.style];

    // Physique ou special : l'attaque puise dans la stat correspondante.
    //
    // Ce sont les stats REELLES, pas celles du Pokedex : niveau, etoiles,
    // potentiel et paliers de sub-stats y sont deja. Les etoiles ne sont donc
    // plus appliquees ici — elles l'etaient deux fois dans le calcul
    // precedent une fois les stats centralisees.
    const stats = statsEffectives(owned);
    const puissance = move.category === 'special' ? stats.atkSpe : stats.atk;
    const affinite = puissance / STAT_REFERENCE;

    this.damage =
      move.power * FACTEUR_DEGATS * affinite * rarity * this.style.degats * (1 + this.traitBonus('stat'));
    this.cooldown =
      move.cooldown * this.style.cadence * (1 - Math.min(0.6, this.traitBonus('cooldown')));
    // L'incantation suit la cadence du style : le corps à corps, qui frappe
    // vite, se prépare vite. Les traits de recharge la raccourcissent aussi —
    // sinon « Cadence infernale » n'aurait plus d'effet sur les grosses
    // attaques, qui sont justement celles qui s'incantent.
    // `move.cast ?? 0` et non `move.cast` nu : une attaque sauvegardée avant
    // l'arrivée de ce champ donnait `undefined`, donc `NaN` après
    // multiplication. Et comme `NaN <= 0` est faux, l'unité entrait en
    // incantation sans jamais en sortir — plus un seul tir. La sauvegarde est
    // désormais rebranchée sur le catalogue, mais une valeur absente, d'où
    // qu'elle vienne, ne doit plus pouvoir figer un tir.
    const castBrut =
      (move.cast ?? 0) * this.style.cadence * (1 - Math.min(0.6, this.traitBonus('cooldown')));
    this.cast = Number.isFinite(castBrut) ? Math.max(0, castBrut) : 0;
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

  /**
   * Fait avancer l'unité d'un tick.
   *
   * La recharge ne part qu'au tir, jamais au début de l'incantation : sinon
   * le cast serait gratuit passé le premier coup, et une grosse attaque
   * n'aurait aucun coût en cadence.
   */
  update(dt: number, enemies: SpatialGrid<Enemy>): ActionTour {
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
      // Incantation interrompue : la cible visée n'est plus là. On ne reporte
      // pas le cast sur le voisin — viser quelqu'un d'autre demande de
      // recommencer, ce qui donne du prix à la survie des gros ennemis.
      this.castRestant = 0;
    }
    if (!this.target) {
      this.target = enemies.nearest(this.x, this.z, this.range, (e) => e.active);
    }
    if (!this.target) return RIEN;

    if (this.castRestant > 0) {
      this.castRestant -= dt;
      if (this.castRestant > 0) return RIEN;
      this.castRestant = 0;
      this.timer = this.cooldown;
      return { kind: 'tir', cible: this.target };
    }

    if (this.timer > 0) return RIEN;

    // Le test porte sur « strictement positif » plutot que sur « <= 0 » :
    // ainsi une valeur non numeriquement comparable tombe du bon cote et
    // l'unite tire, au lieu de rester bloquee en incantation.
    if (!(this.cast > 0)) {
      this.timer = this.cooldown;
      return { kind: 'tir', cible: this.target };
    }

    this.castRestant = this.cast;
    return { kind: 'cast', cible: this.target, duree: this.cast };
  }

  private outOfRange(enemy: Enemy): boolean {
    const dx = enemy.x - this.x;
    const dz = enemy.z - this.z;
    return dx * dx + dz * dz > this.range * this.range;
  }
}
