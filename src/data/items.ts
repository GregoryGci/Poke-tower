/**
 * Objets équipables, sur le modèle des runes de Summoners War.
 *
 * Trois emplacements par Pokémon, et c'est le plafond qui donne sa forme au
 * système : avec trois pièces, équiper devient un arbitrage — on ne peut pas
 * tout porter, donc chaque pièce chasse une autre.
 *
 * La mécanique est celle des armes (`data/weapon-upgrade.ts`) : stat
 * principale, innée, sub-stats révélées aux paliers, +0 à +15. Elle est
 * reprise plutôt que réinventée pour une raison précise — le joueur a déjà
 * appris à lire ces chiffres sur son arme, et lui demander d'apprendre un
 * second vocabulaire pour la même idée n'apporterait rien.
 *
 * **Ce qui change, en revanche, ce sont les sets.** Je les avais délibérément
 * écartés pour les armes : on n'en porte qu'une, un set de deux pièces
 * n'aurait jamais pu s'activer. Avec trois emplacements ils redeviennent le
 * coeur du système, et c'est eux qui font qu'une équipe se compose au lieu de
 * s'empiler.
 */

import { STAT_TYPES, type OwnedPokemon, type Rarity, type StatType } from './types';

/** Emplacements d'objets sur un Pokémon. */
export const EMPLACEMENTS_ITEM = 3;

/** Palier maximum, comme pour les armes. */
export const ITEM_NIVEAU_MAX = 15;

/** Paliers qui révèlent une sub-stat. */
export const ITEM_PALIERS_SUBSTAT = [3, 6, 9, 12] as const;

/**
 * Ce qu'une ligne d'objet peut porter.
 *
 * Les six stats du Pokédex, plus la portée et la recharge : ce sont les deux
 * seules choses qu'un objet peut changer et qu'une stat ne couvre pas, et
 * elles décident du placement autant que de la puissance.
 */
export type ItemStatKind = StatType | 'portee' | 'recharge';

export const ITEM_STAT_KINDS: readonly ItemStatKind[] = [...STAT_TYPES, 'portee', 'recharge'];

export const LIBELLE_ITEM_STAT: Record<ItemStatKind, string> = {
  pv: 'PV',
  atk: 'Attaque',
  def: 'Défense',
  atkSpe: 'Attaque Spé',
  defSpe: 'Défense Spé',
  vitesse: 'Vitesse',
  portee: 'Portée',
  recharge: 'Recharge',
};

/** Une ligne de stat : son type, sa valeur cumulée, ses rolls. */
export interface ItemStat {
  kind: ItemStatKind;
  valeur: number;
  rolls: number;
}

/**
 * Les familles d'objets.
 *
 * Chacune a son raid, son identité de stats et son effet de set. Trois
 * familles pour trois emplacements n'est pas un hasard : on peut porter un
 * set complet de trois, ou deux plus une pièce d'ailleurs, et c'est
 * exactement l'arbitrage qu'on veut proposer.
 */
export interface FamilleItem {
  id: string;
  nom: string;
  /** Glyphe, faute de sprite dédié. */
  glyphe: string;
  /** Stats que la ligne principale peut tirer. */
  principales: readonly ItemStatKind[];
  /** Pièces nécessaires pour activer le set. */
  pieces: number;
  /** Ce que le set donne, une fois complet. */
  effet: { kind: ItemStatKind; percent: number };
  description: string;
}

export const FAMILLES_ITEM: FamilleItem[] = [
  {
    id: 'croc',
    nom: 'Croc',
    glyphe: '🦷',
    principales: ['atk', 'atkSpe', 'vitesse'],
    pieces: 2,
    effet: { kind: 'atk', percent: 20 },
    description: 'Deux pièces : +20 % d’Attaque. Pour ce qui doit tomber vite.',
  },
  {
    id: 'ecaille',
    nom: 'Écaille',
    glyphe: '🛡',
    principales: ['pv', 'def', 'defSpe'],
    pieces: 2,
    effet: { kind: 'pv', percent: 25 },
    description: 'Deux pièces : +25 % de PV. Pour ce qui doit tenir la ligne.',
  },
  {
    id: 'plume',
    nom: 'Plume',
    glyphe: '🪶',
    principales: ['portee', 'recharge', 'vitesse'],
    pieces: 3,
    effet: { kind: 'recharge', percent: 18 },
    description:
      'Trois pièces : −18 % de recharge. Le set le plus cher à réunir, et le seul qui change la cadence.',
  },
];

export function getFamille(id: string): FamilleItem | null {
  return FAMILLES_ITEM.find((famille) => famille.id === id) ?? null;
}

/** Un objet possédé. */
export interface OwnedItem {
  id: string;
  familleId: string;
  rarity: Rarity;
  /** Emplacement, de 1 à EMPLACEMENTS_ITEM. Fixé au tirage. */
  emplacement: number;
  favori: boolean;
  niveau: number;
  principale: ItemStat;
  innee: ItemStat | null;
  subStats: ItemStat[];
}

/**
 * Sub-stats déjà ouvertes à l'obtention, par rareté.
 *
 * Transposition directe du grade d'une rune : un objet normal part nu et
 * devra tout gagner aux paliers, un prismatique arrive avec ses quatre lignes.
 */
const SUBSTATS_DE_DEPART: Record<Rarity, number> = {
  normal: 0,
  rare: 1,
  epique: 2,
  legendaire: 3,
  prismatique: 4,
};

/** Un roll vaut plus cher sur un objet rare : c'est tout l'intérêt du tirage. */
const MULTIPLICATEUR_ROLL: Record<Rarity, number> = {
  normal: 1,
  rare: 1.2,
  epique: 1.45,
  legendaire: 1.75,
  prismatique: 2.1,
};

/** Plage d'un roll, avant multiplicateur de rareté. */
const PLAGES: Record<ItemStatKind, [number, number]> = {
  pv: [4, 10],
  atk: [3, 8],
  def: [3, 8],
  atkSpe: [3, 8],
  defSpe: [3, 8],
  vitesse: [3, 7],
  portee: [3, 7],
  recharge: [2, 5],
};

function tirerValeur(kind: ItemStatKind, rarity: Rarity, rng: () => number): number {
  const [bas, haut] = PLAGES[kind];
  const brut = bas + rng() * (haut - bas);
  return Math.round(brut * MULTIPLICATEUR_ROLL[rarity] * 10) / 10;
}

function tirerKind(
  candidats: readonly ItemStatKind[],
  exclure: readonly ItemStatKind[],
  rng: () => number
): ItemStatKind | null {
  const pris = new Set(exclure);
  const libres = candidats.filter((kind) => !pris.has(kind));
  const pool = libres.length ? libres : candidats;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

/**
 * Un objet neuf.
 *
 * La stat principale est tirée dans l'identité de la famille, l'innée et les
 * sub-stats dans tout le catalogue : c'est ce qui fait qu'un Croc reste un
 * Croc tout en pouvant surprendre.
 */
export function itemNeuf(
  familleId: string,
  rarity: Rarity,
  emplacement: number,
  rng: () => number = Math.random
): OwnedItem {
  const famille = getFamille(familleId);
  if (!famille) throw new Error(`Famille d'objet inconnue : ${familleId}`);

  const principaleKind = tirerKind(famille.principales, [], rng) ?? 'atk';
  const principale: ItemStat = {
    kind: principaleKind,
    valeur: tirerValeur(principaleKind, rarity, rng),
    rolls: 0,
  };

  const pris: ItemStatKind[] = [principaleKind];

  // L'innée n'apparaît qu'à partir de l'épique : c'est la première chose qui
  // distingue un bon objet d'un objet correct, et la donner à tous l'aurait
  // rendue invisible.
  let innee: ItemStat | null = null;
  if (rarity === 'epique' || rarity === 'legendaire' || rarity === 'prismatique') {
    const kind = tirerKind(ITEM_STAT_KINDS, pris, rng);
    if (kind) {
      innee = { kind, valeur: tirerValeur(kind, rarity, rng), rolls: 0 };
      pris.push(kind);
    }
  }

  const subStats: ItemStat[] = [];
  for (let i = 0; i < SUBSTATS_DE_DEPART[rarity]; i++) {
    const kind = tirerKind(ITEM_STAT_KINDS, pris, rng);
    if (!kind) break;
    subStats.push({ kind, valeur: tirerValeur(kind, rarity, rng), rolls: 0 });
    pris.push(kind);
  }

  return {
    id: crypto.randomUUID(),
    familleId,
    rarity,
    emplacement,
    favori: false,
    niveau: 0,
    principale,
    innee,
    subStats,
  };
}

/**
 * Tout ce qu'un jeu d'objets apporte à un Pokémon.
 *
 * Les pourcentages s'**additionnent** entre eux avant d'être appliqués, et
 * non l'un après l'autre : trois pièces à +10 % donnent +30 %, pas +33,1 %.
 * C'est ce qu'attend quelqu'un qui vient des runes, et ça évite qu'empiler
 * des petites lignes batte une grosse.
 */
export type BonusItems = Record<ItemStatKind, number>;

function bonusVide(): BonusItems {
  const out = {} as BonusItems;
  for (const kind of ITEM_STAT_KINDS) out[kind] = 0;
  return out;
}

/** La stat principale monte avec le palier : c'est ce qu'on paie en montant. */
export function valeurPrincipale(item: OwnedItem): number {
  return Math.round(item.principale.valeur * (1 + item.niveau * 0.12) * 10) / 10;
}

/**
 * Sets actifs sur un jeu d'objets.
 *
 * On compte les pièces par famille, et un set n'est actif que s'il atteint
 * son seuil. Renvoyé séparément du total pour pouvoir l'afficher : un bonus
 * de set qu'on ne voit pas ne pèse pas dans la décision d'équiper.
 */
export function setsActifs(items: readonly OwnedItem[]): FamilleItem[] {
  const parFamille = new Map<string, number>();
  for (const item of items) {
    parFamille.set(item.familleId, (parFamille.get(item.familleId) ?? 0) + 1);
  }
  return FAMILLES_ITEM.filter((famille) => (parFamille.get(famille.id) ?? 0) >= famille.pieces);
}

/** Somme des lignes d'objets, sets compris, en pourcentage par stat. */
export function bonusDesItems(items: readonly OwnedItem[]): BonusItems {
  const total = bonusVide();

  for (const item of items) {
    total[item.principale.kind] += valeurPrincipale(item);
    if (item.innee) total[item.innee.kind] += item.innee.valeur;
    for (const sub of item.subStats) total[sub.kind] += sub.valeur;
  }

  for (const famille of setsActifs(items)) {
    total[famille.effet.kind] += famille.effet.percent;
  }

  return total;
}

/** Les objets réellement équipés d'un Pokémon, dans l'ordre des emplacements. */
export function itemsEquipes(
  owned: OwnedPokemon,
  inventaire: readonly OwnedItem[]
): OwnedItem[] {
  const portes: OwnedItem[] = [];
  for (const id of owned.items ?? []) {
    if (!id) continue;
    const item = inventaire.find((candidat) => candidat.id === id);
    if (item) portes.push(item);
  }
  return portes;
}
