/**
 * Protocole de la coopération.
 *
 * Un raid à deux se joue avec **une seule simulation**, celle de l'hôte. Le
 * choix est délibéré : faire tourner la simulation des deux côtés et n'échanger
 * que les actions coûterait moins de trafic, mais la moindre divergence de
 * virgule flottante ferait diverger les deux parties — et avec cent mobs qui
 * se croisent, ça se voit en quelques secondes. Avec une seule simulation, il
 * n'y a rien à réconcilier.
 *
 * Le prix à payer est un flux d'état de l'hôte vers l'invité. On l'envoie à
 * dix images par seconde et non trente : l'invité interpole entre deux
 * instantanés, exactement comme le rendu interpole déjà entre deux pas de
 * simulation.
 *
 * **Mesuré**, pas estimé : un instantané de cent ennemis pèse 6,9 ko en JSON,
 * soit environ 69 ko/s à dix par seconde. J'avais tablé sur deux kilo-octets,
 * et c'était faux d'un facteur trois. D'où les noms de champs d'une lettre et
 * l'arrondi des coordonnées au dixième : un « 12.345678901234567 » coûte dix
 * caractères de plus qu'un « 12.3 » pour une précision que personne ne voit à
 * l'écran.
 *
 * Dans l'autre sens ne circulent que des **intentions** — « je veux poser
 * celui-là ici » — jamais des résultats. C'est l'hôte qui tranche, valide les
 * règles de pose et décide. Un invité ne peut donc pas se poser sur la route
 * ni s'offrir un palier qu'il n'a pas payé, même en trichant sur son client.
 */

/** Version du protocole. Deux clients qui ne la partagent pas se refusent. */
export const VERSION_PROTOCOLE = 1;

/** Ce qu'un joueur est dans une partie. */
export type Role = 'hote' | 'invite';

/* ---------- Hôte → invité ---------- */

/** Un ennemi, tel que l'invité a besoin de le dessiner. */
export interface EnnemiReplique {
  /** Identifiant stable tant que l'ennemi vit. */
  i: number;
  /** Espèce, pour choisir la foule instanciée. */
  e: string;
  x: number;
  z: number;
  /** Part de vie restante, de 0 à 1. */
  v: number;
  /** Échelle, pour les boss. */
  s: number;
  /** Cap, en radians. */
  a: number;
  /** Vrai pour un boss. */
  b: boolean;
}

/** Un Pokémon posé, vu par l'invité. */
export interface TourRepliquee {
  i: string;
  /** Espèce courante : elle ne change pas en manche, mais le palier si. */
  e: string;
  x: number;
  z: number;
  /** Palier, de 1 à 3. */
  p: number;
  /** Identifiant du joueur qui l'a posé. */
  j: string;
}

/** Le dresseur d'un joueur. */
export interface DresseurReplique {
  j: string;
  x: number;
  z: number;
}

export interface Instantane {
  /** Numéro de pas de simulation : sert à jeter un instantané en retard. */
  t: number;
  ennemis: EnnemiReplique[];
  tours: TourRepliquee[];
  dresseurs: DresseurReplique[];
  /** Vies restantes, vague, pièces : ce que le HUD affiche. */
  vies: number;
  vague: number;
  vagues: number;
  pieces: number;
  cristaux: number;
  /** Issue de la manche, quand elle est décidée. */
  issue: 'en_cours' | 'victoire' | 'defaite';
  phase: 'preparation' | 'en_cours';
}

/* ---------- Invité → hôte ---------- */

export type Intention =
  | { kind: 'poser'; ownedId: string; x: number; z: number }
  | { kind: 'palier'; tourId: string }
  | { kind: 'lancer' }
  | { kind: 'dresseur'; x: number; z: number };

/* ---------- Salon ---------- */

export interface Presence {
  joueur: string;
  nom: string;
  role: Role;
  /** Espèces de son équipe : l'hôte doit les précharger avant de lancer. */
  especes: string[];
  pret: boolean;
}

export type Message =
  | { type: 'bonjour'; version: number; presence: Presence }
  | { type: 'demarrer'; raidId: string; difficulte: string; graine: string }
  | { type: 'instantane'; data: Instantane }
  | { type: 'intention'; joueur: string; data: Intention }
  | { type: 'fin'; issue: 'victoire' | 'defaite' };

/**
 * Code de salon.
 *
 * Six caractères, sans les ambigus — pas de 0/O ni de 1/I/L. Il se dicte à
 * voix haute, ce qui est exactement son usage.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function genererCode(): string {
  let code = '';
  const tirages = new Uint32Array(6);
  crypto.getRandomValues(tirages);
  for (const tirage of tirages) code += ALPHABET[tirage % ALPHABET.length];
  return code;
}

/** Normalise ce que le joueur a tapé : majuscules, sans espaces. */
export function normaliserCode(saisi: string): string {
  return saisi.trim().toUpperCase().replace(/\s+/g, '');
}
