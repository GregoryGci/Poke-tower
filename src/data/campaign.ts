/**
 * Campagne.
 *
 * Deux mondes de vingt niveaux. Le rythme est fixe et annoncé : mini-boss aux
 * niveaux 5 et 15, gros boss aux niveaux 10 et 20. Le joueur sait donc où il
 * va, ce qui lui permet de préparer plutôt que de subir — c'est la différence
 * entre une difficulté et un piège.
 *
 * Un monde n'est pas qu'une liste de niveaux : c'est aussi une palette et un
 * jeu de décors, parce que vingt manches sur le même fond se confondent. La
 * Route de la Prairie est claire et herbeuse ; le Mont Braise est sombre,
 * cendreux et minéral.
 *
 * Le niveau est identifié par une chaîne (`m1-07`) et non par son index : cet
 * identifiant sert de graine à la génération de la carte, donc il doit rester
 * stable même si l'on insère un monde plus tard.
 */

/** Niveaux par monde. */
export const NIVEAUX_PAR_MONDE = 20;

/** Rangs où se dressent les mini-boss. */
export const RANGS_MINI_BOSS = [5, 15] as const;
/** Rangs où se dressent les gros boss. */
export const RANGS_BOSS = [10, 20] as const;

export type SorteNiveau = 'normal' | 'mini_boss' | 'boss';

export interface Niveau {
  /** Identifiant stable, graine de la carte : `m1-07`. */
  id: string;
  mondeId: string;
  /** Rang dans le monde, de 1 à 20. */
  rang: number;
  /** Index global, de 1 à 40 : c'est lui que suit la progression. */
  index: number;
  sorte: SorteNiveau;
  nom: string;
}

/** Palette et mobilier d'un monde. */
export interface ThemeMonde {
  /** Herbe, ou cendre. */
  sol: string;
  /** Terre battue de la route. */
  route: string;
  /** Fond de scène et brouillard. */
  ciel: string;
  /** Masses de végétation, ou de roche. */
  feuillage: string;
  /** Troncs, ou basalte. */
  tronc: string;
  /** Cailloux et éclats. */
  pierre: string;
  /** Touche vive : fleurs, ou lave. */
  accent: string;
  /**
   * Toit de la tour à défendre.
   *
   * Distinct de l'accent : peindre le toit avec la couleur des fleurs donnait
   * une tour jaune en Prairie et orange au Mont Braise, alors que c'est le
   * seul repère qui doit rester reconnaissable d'un monde à l'autre.
   */
  toit: string;
  /**
   * Mobilier tiré au sort pour peupler la carte.
   *
   * Les formes sont construites en primitives dans world/decor, pas importées :
   * un arbre est un tronc et deux boules, et cela suffit à la direction
   * artistique visée.
   */
  mobilier: Array<'arbre' | 'buisson' | 'rocher' | 'souche' | 'fleurs' | 'cristal' | 'colonne' | 'flaque'>;
  /**
   * Densité de décor.
   *
   * Elle fixe le pas de la grille de candidats : 0,17 donne un pas de 2,4
   * unités, soit un terrain meublé sans que les éléments se touchent. Plus bas,
   * la carte paraissait vide alors qu'elle était peuplée.
   */
  densite: number;
}

export interface Monde {
  id: string;
  nom: string;
  sousTitre: string;
  theme: ThemeMonde;
  /** Espèces qui composent les vagues de ce monde. */
  bestiaire: string[];
  /** Espèce du mini-boss, et celle du boss. */
  miniBoss: string;
  boss: string;
  /** Multiplicateur de points de vie appliqué à tout le monde. */
  durete: number;
}

export const MONDES: Monde[] = [
  {
    id: 'm1',
    nom: 'Route de la Prairie',
    sousTitre: 'Vingt manches pour apprendre à tenir une route.',
    theme: {
      sol: '#d7e6cd',
      route: '#c6a878',
      ciel: '#f7f8f6',
      feuillage: '#4f9a5f',
      tronc: '#8a6440',
      pierre: '#b8bdb2',
      accent: '#e8d24a',
      toit: '#b4432f',
      mobilier: ['arbre', 'buisson', 'rocher', 'souche', 'fleurs'],
      densite: 0.17,
    },
    bestiaire: ['rattata', 'weedle', 'zigzagoon', 'caterpie', 'wurmple'],
    miniBoss: 'poochyena',
    boss: 'machop',
    durete: 1,
  },
  {
    id: 'm2',
    nom: 'Mont Braise',
    sousTitre: 'La cendre étouffe les pas : ils arrivent plus vite qu’on ne croit.',
    theme: {
      sol: '#b8ada6',
      route: '#7d6a60',
      ciel: '#efe7e2',
      feuillage: '#6b5a55',
      tronc: '#4a3f3c',
      pierre: '#8d8079',
      accent: '#d4562c',
      toit: '#8f2f22',
      mobilier: ['rocher', 'colonne', 'cristal', 'flaque', 'souche'],
      densite: 0.19,
    },
    bestiaire: ['poochyena', 'geodude', 'rattata', 'zigzagoon', 'machop'],
    miniBoss: 'geodude',
    boss: 'machop',
    durete: 2.4,
  },
];

export function sorteDuRang(rang: number): SorteNiveau {
  if ((RANGS_BOSS as readonly number[]).includes(rang)) return 'boss';
  if ((RANGS_MINI_BOSS as readonly number[]).includes(rang)) return 'mini_boss';
  return 'normal';
}

const NOM_SORTE: Record<SorteNiveau, string> = {
  normal: 'Manche',
  mini_boss: 'Mini-boss',
  boss: 'Boss',
};

/** Tous les niveaux, dans l'ordre. */
export const NIVEAUX: Niveau[] = MONDES.flatMap((monde, indexMonde) =>
  Array.from({ length: NIVEAUX_PAR_MONDE }, (_, i) => {
    const rang = i + 1;
    const sorte = sorteDuRang(rang);
    return {
      id: `${monde.id}-${String(rang).padStart(2, '0')}`,
      mondeId: monde.id,
      rang,
      index: indexMonde * NIVEAUX_PAR_MONDE + rang,
      sorte,
      nom: `${NOM_SORTE[sorte]} ${rang}`,
    };
  })
);

export function getMonde(mondeId: string): Monde {
  const monde = MONDES.find((candidat) => candidat.id === mondeId);
  if (!monde) throw new Error(`Monde inconnu : ${mondeId}`);
  return monde;
}

/** Le niveau d'index global donné, borné au dernier existant. */
export function niveauParIndex(index: number): Niveau {
  const borne = Math.min(Math.max(1, index), NIVEAUX.length);
  const niveau = NIVEAUX[borne - 1];
  if (!niveau) throw new Error(`Niveau introuvable : ${index}`);
  return niveau;
}

export function getNiveau(id: string): Niveau {
  const niveau = NIVEAUX.find((candidat) => candidat.id === id);
  if (!niveau) throw new Error(`Niveau inconnu : ${id}`);
  return niveau;
}

/** Niveaux d'un monde. */
export function niveauxDuMonde(mondeId: string): Niveau[] {
  return NIVEAUX.filter((niveau) => niveau.mondeId === mondeId);
}

/** Le monde est-il ouvert ? Le second demande d'avoir fini le premier. */
export function mondeOuvert(mondeId: string, indexAtteint: number): boolean {
  const rang = MONDES.findIndex((monde) => monde.id === mondeId);
  return rang <= 0 || indexAtteint > rang * NIVEAUX_PAR_MONDE;
}
