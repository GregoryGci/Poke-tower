/**
 * Pokémon posé : cherche une cible dans sa portée et frappe.
 *
 * La portée est propre à l'espèce, modifiée par les traits. Le placement est
 * libre sur le terrain, seule la route est interdite — c'est le `PlacementRules`
 * du module de jeu qui tranche, pas cette classe.
 *
 * Deux attaques, deux emplois :
 *
 *  - l'**auto-attaque** tourne en boucle et fait le travail de fond ;
 *  - l'**ultime**, débloqué au palier 3, frappe beaucoup plus fort mais met
 *    plusieurs secondes à revenir. La tour le lance dès qu'il est prêt, et
 *    retombe sur son auto-attaque le reste du temps.
 *
 * Les **paliers** s'achètent en manche, en Poképièces. Ils font évoluer le
 * Pokémon — l'exemplaire possédé n'est jamais modifié, seule la tour change
 * de forme le temps de la partie.
 */

import { Object3D } from 'three';
import type { Move, OwnedPokemon, PokemonType, Species } from '@/data/types';
import { RARITY_MULTIPLIER, STYLES, type StyleProfil } from '@/data/types';
import { statsEffectives } from '@/data/stats';
import { CADENCE_ULTIME, PALIER_MAX, multiplicateurPalier } from '@/data/paliers';
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

/**
 * Ce qu'une tour décide sur un tick.
 *
 * Trois issues seulement, et elles sont exclusives : rien, le début d'une
 * incantation, ou le tir. L'attaque employée voyage avec la décision — le jeu
 * doit savoir si c'est l'ultime qui partait, pour en afficher l'aperçu à la
 * bonne taille et créditer le bon type de dégâts.
 */
export type ActionTour =
  | { kind: 'rien' }
  | { kind: 'cast'; cible: Enemy; duree: number; move: Move; ultime: boolean }
  | { kind: 'tir'; cible: Enemy; move: Move; degats: number; ultime: boolean };

const RIEN: ActionTour = { kind: 'rien' };

/** Une attaque, une fois passée par les stats, les traits et le style. */
interface AttaquePrete {
  move: Move;
  degats: number;
  cooldown: number;
  cast: number;
  timer: number;
}

export class Tower {
  object: Object3D | null = null;
  /** Cercle de portée, affiché à la sélection. */
  rangeIndicator: Object3D | null = null;

  x = 0;
  z = 0;
  /** Forme courante : elle change quand un palier est acheté. */
  species: Species;
  /** Palier de manche, de 1 à PALIER_MAX. Jamais sauvegardé. */
  palier = 1;
  range = 0;
  /** Profil de frappe, lu par le jeu pour appliquer les degats. */
  style: StyleProfil;

  private auto!: AttaquePrete;
  private ultime!: AttaquePrete;
  /** Incantation en cours, et l'attaque qu'elle prépare. */
  private castRestant = 0;
  private castEnCours: AttaquePrete | null = null;
  target: Enemy | null = null;

  constructor(
    readonly owned: OwnedPokemon,
    species: Species
  ) {
    this.species = species;
    this.style = STYLES[species.style];
    this.recalculer();
  }

  /* ---------- Dérivés ---------- */

  /**
   * Recompose tout ce qui dépend de la forme et du palier.
   *
   * Appelée à la construction et à chaque palier acheté. Les recharges en
   * cours sont préservées : monter un palier ne doit pas offrir un tir
   * gratuit, ni repousser celui qui était presque prêt.
   */
  private recalculer(): void {
    const restantAuto = this.auto?.timer ?? 0;
    const restantUltime = this.ultime?.timer ?? 0;

    this.style = STYLES[this.species.style];
    this.range = this.species.range * (1 + this.traitBonus('range'));

    this.auto = this.preparer(this.owned.auto, 1);
    this.auto.timer = restantAuto;
    this.ultime = this.preparer(this.owned.ultime, CADENCE_ULTIME[this.species.rarity]);
    this.ultime.timer = restantUltime;
  }

  /**
   * Met une attaque en état de servir.
   *
   * Les stats employées sont celles de la **forme courante** : un Grolem
   * frappe avec le socle de Grolem, pendant que le potentiel, le niveau, les
   * étoiles et les sub-stats continuent de venir de l'exemplaire possédé.
   */
  private preparer(move: Move, cadence: number): AttaquePrete {
    const rarity = RARITY_MULTIPLIER[this.species.rarity];
    const stats = statsEffectives(this.owned, this.species.id);
    const puissance = move.category === 'special' ? stats.atkSpe : stats.atk;
    const affinite = puissance / STAT_REFERENCE;

    const degats =
      move.power *
      FACTEUR_DEGATS *
      affinite *
      rarity *
      this.style.degats *
      (1 + this.traitBonus('stat')) *
      multiplicateurPalier(this.palier);

    const reduction = 1 - Math.min(0.6, this.traitBonus('cooldown'));
    const cooldown = move.cooldown * this.style.cadence * reduction * cadence;
    // `move.cast ?? 0` et non `move.cast` nu : une attaque sauvegardée avant
    // l'arrivée de ce champ donnait `undefined`, donc `NaN` après
    // multiplication. Et comme `NaN <= 0` est faux, l'unité entrait en
    // incantation sans jamais en sortir — plus un seul tir. La sauvegarde est
    // désormais rebranchée sur le catalogue, mais une valeur absente, d'où
    // qu'elle vienne, ne doit plus pouvoir figer un tir.
    const castBrut = (move.cast ?? 0) * this.style.cadence * reduction;

    return {
      move,
      degats: Number.isFinite(degats) ? degats : 0,
      cooldown: Number.isFinite(cooldown) ? Math.max(0.05, cooldown) : 1,
      cast: Number.isFinite(castBrut) ? Math.max(0, castBrut) : 0,
      timer: 0,
    };
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

  /* ---------- Paliers ---------- */

  /** Vrai quand l'ultime est utilisable : il ne l'est qu'au dernier palier. */
  get ultimeDebloque(): boolean {
    return this.palier >= PALIER_MAX;
  }

  /**
   * Monte d'un palier.
   *
   * L'espèce ne change pas : évoluer se mérite à l'expérience, et c'est
   * définitif (voir data/evolution.ts). Le palier rapporte de la puissance
   * pour la manche en cours, et l'ultime au dernier cran.
   */
  monterPalier(): boolean {
    if (this.palier >= PALIER_MAX) return false;
    this.palier += 1;
    this.recalculer();
    return true;
  }

  /* ---------- Lecture pour l'interface ---------- */

  /** Attaque affichée sur la fiche : l'ultime quand il est débloqué. */
  get move(): Move {
    return this.ultimeDebloque ? this.ultime.move : this.auto.move;
  }

  get moveAuto(): Move {
    return this.auto.move;
  }

  get moveUltime(): Move {
    return this.ultime.move;
  }

  /** Dégâts de l'auto-attaque, tous multiplicateurs appliqués. */
  get damage(): number {
    return this.auto.degats;
  }

  get degatsUltime(): number {
    return this.ultime.degats;
  }

  get cooldown(): number {
    return this.auto.cooldown;
  }

  get cooldownUltime(): number {
    return this.ultime.cooldown;
  }

  get cast(): number {
    return this.auto.cast;
  }

  /** Vrai pendant l'incantation : l'unité est engagée, pas encore à l'oeuvre. */
  get enIncantation(): boolean {
    return this.castRestant > 0;
  }

  /** Secondes restantes avant l'ultime, ou null s'il n'est pas débloqué. */
  get rechargeUltime(): number | null {
    return this.ultimeDebloque ? Math.max(0, this.ultime.timer) : null;
  }

  /** Secondes restantes avant le prochain tir, incantation comprise. */
  get recharge(): number {
    return Math.max(0, this.castRestant > 0 ? this.castRestant : this.auto.timer);
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
      const duree = this.castEnCours?.cast ?? 0;
      return duree <= 0 ? 0 : Math.min(1, Math.max(0, this.castRestant / duree));
    }
    const cd = this.auto.cooldown;
    return cd <= 0 ? 0 : Math.min(1, Math.max(0, this.auto.timer / cd));
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

  /* ---------- Simulation ---------- */

  /**
   * Fait avancer l'unité d'un tick.
   *
   * La recharge ne part qu'au tir, jamais au début de l'incantation : sinon
   * le cast serait gratuit passé le premier coup, et une grosse attaque
   * n'aurait aucun coût en cadence.
   */
  update(dt: number, enemies: SpatialGrid<Enemy>): ActionTour {
    this.auto.timer -= dt;
    this.ultime.timer -= dt;

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
      this.castEnCours = null;
    }
    if (!this.target) {
      this.target = enemies.nearest(this.x, this.z, this.range, (e) => e.active);
    }
    if (!this.target) return RIEN;

    if (this.castRestant > 0) {
      this.castRestant -= dt;
      if (this.castRestant > 0) return RIEN;
      const attaque = this.castEnCours;
      this.castRestant = 0;
      this.castEnCours = null;
      if (!attaque) return RIEN;
      return this.tirer(attaque);
    }

    // L'ultime passe devant dès qu'il est prêt : c'est ce qui fait qu'un
    // palier 3 se voit. Le reste du temps, l'auto-attaque tourne.
    const attaque = this.prochaineAttaque();
    if (!attaque) return RIEN;

    // Le test porte sur « strictement positif » plutôt que sur « <= 0 » :
    // ainsi une valeur non comparable numériquement tombe du bon côté et
    // l'unité tire, au lieu de rester bloquée en incantation.
    if (!(attaque.cast > 0)) return this.tirer(attaque);

    this.castRestant = attaque.cast;
    this.castEnCours = attaque;
    return {
      kind: 'cast',
      cible: this.target,
      duree: attaque.cast,
      move: attaque.move,
      ultime: attaque === this.ultime,
    };
  }

  private prochaineAttaque(): AttaquePrete | null {
    if (this.ultimeDebloque && this.ultime.timer <= 0) return this.ultime;
    if (this.auto.timer <= 0) return this.auto;
    return null;
  }

  private tirer(attaque: AttaquePrete): ActionTour {
    attaque.timer = attaque.cooldown;
    return {
      kind: 'tir',
      cible: this.target!,
      move: attaque.move,
      degats: attaque.degats,
      ultime: attaque === this.ultime,
    };
  }

  /**
   * Type de l'attaque qui partira au prochain tir.
   *
   * Sert à annoncer l'efficacité avant qu'elle ne s'applique : c'est ce qui
   * permet au joueur de comprendre pourquoi son Salamèche ne fait rien contre
   * un Racaillou, sans attendre de lire un chiffre de dégâts.
   */
  get typeEnJeu(): PokemonType {
    return this.ultimeDebloque && this.ultime.timer <= 0
      ? this.ultime.move.type
      : this.auto.move.type;
  }

  private outOfRange(enemy: Enemy): boolean {
    const dx = enemy.x - this.x;
    const dz = enemy.z - this.z;
    return dx * dx + dz * dz > this.range * this.range;
  }
}
