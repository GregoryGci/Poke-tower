/**
 * Raids.
 *
 * Un raid n'est pas un niveau de campagne plus dur : c'est une autre forme.
 * Là où une manche ordinaire enchaîne des vagues séparées par des pauses, un
 * raid est **une seule vague, très longue**, ponctuée de mini-boss et fermée
 * par un boss ultime. Il n'y a donc jamais de moment où le terrain se vide et
 * où l'on souffle : c'est ce qui en fait un siège, et ce qui rend les
 * Poképièces décisives — on ne peut pas attendre la vague suivante pour
 * monter un palier, il faut le faire pendant que ça passe.
 *
 * **Trois difficultés**, et elles ne changent que les points de vie. La
 * composition de la vague est identique : facile et difficile se jouent de la
 * même façon, avec la même préparation, et seule la solidité des ennemis
 * décide. C'est délibéré — une difficulté qui change aussi le bestiaire
 * demanderait de tout réapprendre à chaque cran, alors qu'on veut pouvoir
 * monter d'un cran quand on se sent prêt.
 *
 * Les raids sont pensés **pour être joués à plusieurs**. La coopération en
 * réseau n'existe pas encore : ils sont donc jouables seuls, ce qui est
 * beaucoup plus dur, et c'est assumé — la difficulté facile est calibrée pour
 * qu'un joueur seul puisse y entrer.
 */

import { getMonde, type Niveau } from './campaign';
import type { Rarity } from './types';

/** Les trois crans. */
export const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;
export type Difficulte = (typeof DIFFICULTES)[number];

export const LIBELLE_DIFFICULTE: Record<Difficulte, string> = {
  facile: 'Facile',
  normal: 'Normal',
  difficile: 'Difficile',
};

/**
 * Multiplicateur de points de vie par cran.
 *
 * Seule chose que la difficulté change. Le pas est large — presque le double
 * à chaque cran — parce qu'un cran qui ne se sent pas ne sert à rien : on doit
 * échouer une fois avant de revenir avec une meilleure équipe.
 */
export const VIE_PAR_DIFFICULTE: Record<Difficulte, number> = {
  facile: 1,
  normal: 1.9,
  difficile: 3.6,
};

/**
 * Ce que le raid fait tomber à la fin, selon la difficulté.
 *
 * Deux raretés par cran, et elles se chevauchent d'un palier : un raid normal
 * peut donner ce qu'un facile donnait de mieux. Sans ce recouvrement, monter
 * d'un cran rendrait le précédent immédiatement sans objet, alors qu'on veut
 * pouvoir farmer là où on gagne à coup sûr.
 */
export const BUTIN_PAR_DIFFICULTE: Record<Difficulte, readonly Rarity[]> = {
  facile: ['normal', 'rare'],
  normal: ['epique', 'legendaire'],
  difficile: ['legendaire', 'prismatique'],
};

/**
 * Chance de tirer la **meilleure** des deux raretés du cran.
 *
 * Le reste du temps c'est la moins bonne. À 25 %, un raid difficile donne un
 * prismatique une fois sur quatre : assez pour que le cran vaille le coup,
 * assez rare pour qu'un bon objet reste un événement.
 */
export const CHANCE_HAUTE = 0.25;

export interface DropPierre {
  pierreId: string;
  /** Probabilité par manche gagnée, de 0 à 1. */
  chance: number;
}

export interface Raid {
  id: string;
  nom: string;
  description: string;
  /** Monde dont le raid emprunte le décor et le bestiaire. */
  mondeId: string;
  /** Rang simulé : il décide de la dureté de base, avant difficulté. */
  rang: number;
  /** Niveaux de campagne terminés pour qu'il s'ouvre. */
  requis: number;
  /**
   * Famille d'objets que ce raid fait tomber, ou null.
   *
   * Un raid par famille : c'est ce qui permet de viser un set précis au lieu
   * de farmer au hasard en espérant tomber sur la bonne pièce.
   */
  familleItem: string | null;
  /** Pierres d'évolution, pour le raid qui en donne. */
  butin: DropPierre[];
  /** Probabilité qu'une Master Ball tombe, par manche gagnée. */
  chanceBall: number;
}

export const RAIDS: Raid[] = [
  {
    id: 'antre-crocs',
    nom: 'Antre des Crocs',
    description:
      'Une vague ininterrompue, trois mini-boss, un colosse au bout. On en ressort avec un Croc — le set qui frappe.',
    mondeId: 'kanto',
    rang: 14,
    requis: 8,
    familleItem: 'croc',
    butin: [],
    chanceBall: 0.05,
  },
  {
    id: 'faille-ecailles',
    nom: 'Faille des Écailles',
    description:
      'Même siège, autre butin : l’Écaille, pour ce qui doit tenir la ligne sans reculer.',
    mondeId: 'johto',
    rang: 16,
    requis: 14,
    familleItem: 'ecaille',
    butin: [],
    chanceBall: 0.05,
  },
  {
    id: 'nid-plumes',
    nom: 'Nid des Plumes',
    description:
      'Le plus long des trois. La Plume demande trois pièces pour s’activer, et c’est le seul set qui change la cadence.',
    mondeId: 'johto',
    rang: 18,
    requis: 20,
    familleItem: 'plume',
    butin: [],
    chanceBall: 0.05,
  },
  {
    id: 'grotte-pierres',
    nom: 'Grotte des Pierres',
    description:
      'Pas d’objet ici : c’est le seul endroit d’où sortent les pierres d’évolution, et elles sortent rarement.',
    mondeId: 'kanto',
    rang: 18,
    requis: 10,
    familleItem: null,
    butin: [
      { pierreId: 'pierre-eau', chance: 0.12 },
      { pierreId: 'pierre-foudre', chance: 0.12 },
      { pierreId: 'pierre-feu', chance: 0.12 },
    ],
    chanceBall: 0.07,
  },
];

/**
 * Un raid choisi, avec son cran.
 *
 * Les deux voyagent ensemble : la difficulte decide des points de vie ET du
 * palier du butin, donc les separer aurait ouvert la porte a un raid joue
 * facile qui rapporte un butin difficile.
 */
export interface ChoixRaidComplet {
  raid: Raid;
  difficulte: Difficulte;
}

export function getRaid(id: string): Raid | null {
  return RAIDS.find((raid) => raid.id === id) ?? null;
}

/** Un raid est ouvert quand assez de lieux de campagne sont tombés. */
export function raidOuvert(raid: Raid, lieuxFaits: number): boolean {
  return lieuxFaits >= raid.requis;
}

/**
 * Présente un raid comme un niveau.
 *
 * L'identifiant porte la difficulté : la carte est donc la même d'une
 * tentative à l'autre au même cran, mais change quand on monte. Refaire un
 * raid plus dur sur une carte déjà apprise en aurait fait une simple
 * formalité.
 */
export function niveauDuRaid(raid: Raid, difficulte: Difficulte): Niveau {
  // On vérifie le monde à la construction plutôt qu'en jeu : un raid qui
  // pointerait vers un monde inexistant doit échouer au chargement.
  getMonde(raid.mondeId);
  return {
    id: `raid-${raid.id}-${difficulte}`,
    mondeId: raid.mondeId,
    rang: raid.rang,
    index: raid.rang,
    sorte: 'boss',
    nom: `${raid.nom} — ${LIBELLE_DIFFICULTE[difficulte]}`,
    palierBoss: 4,
  };
}

/** Tire le butin en pierres d'un raid gagné. Chaque pierre est tirée à part. */
export function butinDuRaid(raid: Raid, rng: () => number = Math.random): string[] {
  return raid.butin.filter((drop) => rng() < drop.chance).map((drop) => drop.pierreId);
}

/** Vrai si le raid gagné fait tomber une Master Ball. Tirage indépendant. */
export function ballDuRaid(raid: Raid, rng: () => number = Math.random): boolean {
  return rng() < raid.chanceBall;
}

/**
 * Rareté de l'objet rapporté.
 *
 * Un raid à objets en donne **toujours** un : c'est sa récompense garantie,
 * et le hasard ne porte que sur sa qualité. Un raid qui peut ne rien donner
 * après une vague de trois minutes serait insupportable.
 */
export function rareteButin(difficulte: Difficulte, rng: () => number = Math.random): Rarity {
  const paliers = BUTIN_PAR_DIFFICULTE[difficulte];
  return rng() < CHANCE_HAUTE ? paliers[1]! : paliers[0]!;
}
