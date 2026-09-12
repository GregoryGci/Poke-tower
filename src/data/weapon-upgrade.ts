/**
 * Amélioration des armes, sur le modèle des runes de Summoners War.
 *
 * La mécanique est reprise telle quelle parce que c'est elle qui fait durer
 * l'intérêt : l'arme obtenue n'est pas le résultat, c'est la matière première.
 *
 *  - une **stat principale** qui monte à chaque palier, toujours les dégâts ;
 *  - une **stat innée**, tirée à l'obtention et jamais modifiable ;
 *  - jusqu'à quatre **sub-stats**, dont le nombre de départ dépend de la
 *    rareté — c'est là le vrai cadeau d'un tirage prismatique, pas le nom de
 *    l'arme ;
 *  - une amélioration de +0 à +15, où les paliers **+3, +6, +9 et +12**
 *    révèlent une sub-stat de plus, ou renforcent une existante si les quatre
 *    emplacements sont pris ;
 *  - un **risque d'échec** au-delà de +6 : les cristaux sont perdus, le palier
 *    ne bouge pas.
 *
 * Ce qui n'est pas repris : les **sets** de runes. Le dresseur ne porte qu'une
 * arme, donc un bonus à deux ou quatre pièces ne voudrait rien dire.
 *
 * Les valeurs de sub-stats sont tirées dans une plage propre à la rareté :
 * une même sub-stat vaut plus sur une arme prismatique, exactement comme un
 * roll de rune 6★.
 */

import type {
  OwnedWeapon,
  PlayerAccount,
  Rarity,
  WeaponStat,
  WeaponStatKind,
} from './types';
import { getWeapon, type WeaponModel } from './weapons';

/** Palier d'amélioration maximal. */
export const NIVEAU_MAX = 15;

/** Paliers qui révèlent une sub-stat. */
export const PALIERS_SUBSTAT = [3, 6, 9, 12] as const;

/** Emplacements de sub-stats, quelle que soit la rareté. */
export const SUBSTATS_MAX = 4;

export type { WeaponStat, WeaponStatKind };

export const LIBELLE_STAT: Record<WeaponStatKind, string> = {
  degats_plats: 'Dégâts',
  degats_pct: 'Dégâts %',
  cadence: 'Cadence',
  portee: 'Portée',
  zone: 'Zone',
  cristaux: 'Cristaux',
};

/** Unité affichée après la valeur. */
export const UNITE_STAT: Record<WeaponStatKind, string> = {
  degats_plats: '',
  degats_pct: ' %',
  cadence: ' %',
  portee: ' %',
  zone: ' %',
  cristaux: ' %',
};

/**
 * Sub-stats de départ, par rareté.
 *
 * C'est la transposition directe du grade d'une rune : une arme normale part
 * nue et devra tout gagner aux paliers, une prismatique arrive avec ses
 * quatre lignes déjà ouvertes.
 */
const SUBSTATS_DE_DEPART: Record<Rarity, number> = {
  normal: 0,
  rare: 1,
  epique: 2,
  legendaire: 3,
  prismatique: 4,
};

/** Plage d'un roll, avant multiplicateur de rareté. */
const PLAGES: Record<WeaponStatKind, [number, number]> = {
  degats_plats: [2, 6],
  degats_pct: [3, 8],
  cadence: [3, 7],
  portee: [4, 10],
  zone: [5, 12],
  cristaux: [4, 10],
};

/** Un roll vaut plus cher sur une arme rare : c'est tout l'intérêt du tirage. */
const MULTIPLICATEUR_ROLL: Record<Rarity, number> = {
  normal: 1,
  rare: 1.2,
  epique: 1.45,
  legendaire: 1.75,
  prismatique: 2.1,
};

/** Gain de stat principale par palier, en part du socle de l'arme. */
const GAIN_PRINCIPAL_PAR_PALIER = 0.09;

const TOUTES: WeaponStatKind[] = [
  'degats_plats',
  'degats_pct',
  'cadence',
  'portee',
  'zone',
  'cristaux',
];

function tirer<T>(liste: readonly T[], rng: () => number): T {
  const choisi = liste[Math.floor(rng() * liste.length)];
  if (choisi === undefined) throw new Error('Tirage dans une liste vide');
  return choisi;
}

function rollValeur(kind: WeaponStatKind, rarete: Rarity, rng: () => number): number {
  const plage = PLAGES[kind];
  const brut = plage[0] + rng() * (plage[1] - plage[0]);
  const valeur = brut * MULTIPLICATEUR_ROLL[rarete];
  // Arrondi au dixième : des décimales à rallonge sur une fiche de stats se
  // lisent mal et ne changent rien au jeu.
  return Math.round(valeur * 10) / 10;
}

/**
 * Tire une sub-stat qui n'est pas déjà présente.
 *
 * Deux lignes du même type sur une même arme se cumuleraient sans se voir, et
 * le joueur croirait à un bug.
 */
function kindLibre(arme: OwnedWeapon, rng: () => number): WeaponStatKind | null {
  const pris = new Set<WeaponStatKind>(arme.subStats.map((sub) => sub.kind));
  if (arme.innee) pris.add(arme.innee.kind);
  const libres = TOUTES.filter((kind) => !pris.has(kind));
  return libres.length ? tirer(libres, rng) : null;
}

/** Prépare les stats d'une arme fraîchement obtenue. */
export function initialiserArme(arme: OwnedWeapon, rng: () => number = Math.random): OwnedWeapon {
  arme.niveau = 0;
  arme.subStats = [];

  // L'innée sort en premier pour ne pas être tirée deux fois.
  const kindInnee = tirer(TOUTES, rng);
  arme.innee = { kind: kindInnee, valeur: rollValeur(kindInnee, arme.rarity, rng), rolls: 1 };

  for (let i = 0; i < SUBSTATS_DE_DEPART[arme.rarity]; i++) {
    const kind = kindLibre(arme, rng);
    if (!kind) break;
    arme.subStats.push({ kind, valeur: rollValeur(kind, arme.rarity, rng), rolls: 1 });
  }
  return arme;
}

/** Coût du prochain palier, en cristaux. Null si l'arme est au maximum. */
export function coutAmelioration(arme: OwnedWeapon): number | null {
  if (arme.niveau >= NIVEAU_MAX) return null;
  const rang = ['normal', 'rare', 'epique', 'legendaire', 'prismatique'].indexOf(arme.rarity);
  // La courbe est volontairement raide sur la fin : les derniers paliers
  // doivent être un projet, pas une formalité.
  const base = 12 + arme.niveau * arme.niveau * 1.6 + arme.niveau * 5;
  return Math.round(base * (1 + rang * 0.22));
}

/**
 * Chance de réussite du prochain palier, de 0 à 1.
 *
 * Sans risque, un +15 n'est qu'une question de temps de jeu. Le palier reste
 * acquis en cas d'échec — on ne redescend jamais, seuls les cristaux brûlent.
 */
export function chanceReussite(arme: OwnedWeapon): number {
  if (arme.niveau < 6) return 1;
  const table = [0.85, 0.75, 0.65, 0.55, 0.45, 0.4, 0.35, 0.3, 0.28, 0.25];
  return table[arme.niveau - 6] ?? 0.25;
}

export type ResultatAmelioration =
  | { ok: false; raison: 'maximum' | 'cristaux' }
  | { ok: true; reussi: false }
  | { ok: true; reussi: true; nouvelle: WeaponStat | null; renforcee: WeaponStat | null };

/**
 * Tente un palier.
 *
 * Le tirage se fait ici et non dans l'interface : c'est la seule façon de
 * garantir qu'un affichage ne puisse pas contredire l'état du compte.
 */
export function ameliorer(
  compte: PlayerAccount,
  arme: OwnedWeapon,
  rng: () => number = Math.random
): ResultatAmelioration {
  const cout = coutAmelioration(arme);
  if (cout === null) return { ok: false, raison: 'maximum' };
  if (compte.crystals < cout) return { ok: false, raison: 'cristaux' };

  compte.crystals -= cout;

  if (rng() >= chanceReussite(arme)) return { ok: true, reussi: false };

  arme.niveau += 1;

  const palier = (PALIERS_SUBSTAT as readonly number[]).includes(arme.niveau);
  if (!palier) return { ok: true, reussi: true, nouvelle: null, renforcee: null };

  if (arme.subStats.length < SUBSTATS_MAX) {
    const kind = kindLibre(arme, rng);
    if (kind) {
      const sub: WeaponStat = { kind, valeur: rollValeur(kind, arme.rarity, rng), rolls: 1 };
      arme.subStats.push(sub);
      return { ok: true, reussi: true, nouvelle: sub, renforcee: null };
    }
  }

  // Les quatre lignes sont ouvertes : le palier renforce l'une d'elles.
  const sub = arme.subStats.length ? tirer(arme.subStats, rng) : null;
  if (sub) {
    sub.valeur = Math.round((sub.valeur + rollValeur(sub.kind, arme.rarity, rng)) * 10) / 10;
    sub.rolls += 1;
  }
  return { ok: true, reussi: true, nouvelle: null, renforcee: sub };
}

/** Coût d'une meule : relance la valeur d'une sub-stat, son type ne change pas. */
export const COUT_MEULE = 30;
/** Coût d'une gemme : relance le type ET la valeur d'une sub-stat. */
export const COUT_GEMME = 80;

export type ResultatRetaille = { ok: false; raison: 'cristaux' | 'introuvable' } | { ok: true };

/**
 * Meule : rejoue la valeur d'une sub-stat sans toucher à son type.
 *
 * Le nombre de rolls encaissés est conservé — une ligne renforcée trois fois
 * reste une ligne renforcée trois fois, on ne rejoue que le résultat.
 */
export function meuler(
  compte: PlayerAccount,
  arme: OwnedWeapon,
  index: number,
  rng: () => number = Math.random
): ResultatRetaille {
  const sub = arme.subStats[index];
  if (!sub) return { ok: false, raison: 'introuvable' };
  if (compte.crystals < COUT_MEULE) return { ok: false, raison: 'cristaux' };

  compte.crystals -= COUT_MEULE;
  let total = 0;
  for (let i = 0; i < sub.rolls; i++) total += rollValeur(sub.kind, arme.rarity, rng);
  sub.valeur = Math.round(total * 10) / 10;
  return { ok: true };
}

/** Gemme : remplace une sub-stat par une autre, valeur comprise. */
export function sertirGemme(
  compte: PlayerAccount,
  arme: OwnedWeapon,
  index: number,
  rng: () => number = Math.random
): ResultatRetaille {
  const sub = arme.subStats[index];
  if (!sub) return { ok: false, raison: 'introuvable' };
  if (compte.crystals < COUT_GEMME) return { ok: false, raison: 'cristaux' };

  // On libère la ligne avant de tirer, sinon son propre type serait exclu du
  // tirage et une gemme ne pourrait jamais rendre la même stat.
  const ancien = sub.kind;
  sub.kind = 'degats_plats';
  arme.subStats.splice(index, 1);
  const kind = kindLibre(arme, rng) ?? ancien;
  arme.subStats.splice(index, 0, sub);

  compte.crystals -= COUT_GEMME;
  sub.kind = kind;
  let total = 0;
  for (let i = 0; i < sub.rolls; i++) total += rollValeur(kind, arme.rarity, rng);
  sub.valeur = Math.round(total * 10) / 10;
  return { ok: true };
}

/** Ce que l'arme vaut réellement en jeu, une fois tout appliqué. */
export interface StatsArme {
  modele: WeaponModel;
  nom: string;
  damage: number;
  cooldown: number;
  cast: number;
  range: number;
  style: WeaponModel['style'];
  /** Multiplicateur de rayon et de couloir, pour les armes de zone. */
  zone: number;
  /** Bonus de cristaux par K.O., en part. */
  cristaux: number;
}

/** Somme d'une stat, innée et sub-stats confondues. */
function total(arme: OwnedWeapon, kind: WeaponStatKind): number {
  let somme = arme.innee?.kind === kind ? arme.innee.valeur : 0;
  for (const sub of arme.subStats) {
    if (sub.kind === kind) somme += sub.valeur;
  }
  return somme;
}

/**
 * Résout les stats d'une arme.
 *
 * Seul point de vérité : l'écran d'armes, l'infobulle et le jeu appellent
 * cette fonction, donc aucun des trois ne peut afficher ou appliquer un
 * chiffre que les deux autres ignoreraient.
 */
export function statsArme(arme: OwnedWeapon): StatsArme {
  const modele = getWeapon(arme.weaponId);

  const principal = modele.damage * (1 + arme.niveau * GAIN_PRINCIPAL_PAR_PALIER);
  const damage = (principal + total(arme, 'degats_plats')) * (1 + total(arme, 'degats_pct') / 100);

  // La cadence est bornée : sans plafond, quatre rolls de cadence sur une
  // prismatique divisaient la recharge par plus de deux.
  const cadence = Math.min(45, total(arme, 'cadence'));

  return {
    modele,
    nom: modele.name,
    damage,
    cooldown: modele.cooldown * (1 - cadence / 100),
    cast: modele.cast * (1 - cadence / 100),
    range: modele.range * (1 + total(arme, 'portee') / 100),
    style: modele.style,
    zone: 1 + total(arme, 'zone') / 100,
    cristaux: total(arme, 'cristaux') / 100,
  };
}

/** Toutes les lignes de stats d'une arme, innée d'abord. */
export function lignesStats(arme: OwnedWeapon): WeaponStat[] {
  return arme.innee ? [arme.innee, ...arme.subStats] : [...arme.subStats];
}
