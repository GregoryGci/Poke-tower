/**
 * Campagne.
 *
 * Deux mondes de vingt niveaux, nommés d'après les régions du Pokédex dans
 * l'ordre des générations — Kanto d'abord, puis Johto — et chaque niveau
 * d'après un lieu de cette région. Un numéro ne dit rien ; « Mont Sélénite »
 * dit où l'on est, et c'est ce qui fait qu'on se souvient d'un niveau.
 *
 * Le rythme est fixe et annoncé : **un boss tous les cinq niveaux**, de plus
 * en plus coriace. Le joueur sait donc où il va, ce qui lui permet de
 * préparer plutôt que de subir — c'est la différence entre une difficulté et
 * un piège.
 *
 * Un monde n'est pas qu'une liste de niveaux : c'est aussi une palette et un
 * jeu de décors, parce que vingt manches sur le même fond se confondent.
 *
 * Le niveau est identifié par une chaîne (`kanto-07`) et non par son index :
 * cet identifiant sert de graine à la génération de la carte, donc il doit
 * rester stable même si l'on insère une région plus tard.
 */

/** Niveaux par monde. */
export const NIVEAUX_PAR_MONDE = 20;

/** Tous les cinq rangs se dresse un boss. */
export const PAS_BOSS = 5;

/**
 * Sorte d'un niveau.
 *
 * Un seul type de boss, mais quatre paliers par région : le rendez-vous
 * revient tous les cinq niveaux, et c'est sa dureté qui monte. Distinguer
 * « mini-boss » et « boss » n'avait plus de sens dès lors que chaque palier
 * est plus dur que le précédent.
 */
export type SorteNiveau = 'normal' | 'boss';

export interface Niveau {
  /** Identifiant stable, graine de la carte : `kanto-07`. */
  id: string;
  mondeId: string;
  /** Rang dans le monde, de 1 à 20. */
  rang: number;
  /** Index global, de 1 à 40 : c'est lui que suit la progression. */
  index: number;
  sorte: SorteNiveau;
  /** Nom du lieu. */
  nom: string;
  /**
   * Palier de boss, de 1 à 4, ou 0 pour un niveau ordinaire.
   *
   * C'est lui qui décide de la dureté : le quatrième d'une région doit être un
   * mur, le premier une leçon.
   */
  palierBoss: number;
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
   * une tour jaune à Kanto et orange à Johto, alors que c'est le seul repère
   * qui doit rester reconnaissable d'un monde à l'autre.
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
  /** Nom de la région. */
  nom: string;
  /** Génération dont la région est issue. */
  generation: number;
  sousTitre: string;
  theme: ThemeMonde;
  /** Espèces qui composent les vagues de ce monde. */
  bestiaire: string[];
  /** Espèce du boss, du premier palier au quatrième. */
  boss: [string, string, string, string];
  /** Multiplicateur de points de vie appliqué à tout le monde. */
  durete: number;
  /**
   * Lieux de la région, un par niveau.
   *
   * Exactement vingt : c'est vérifié au chargement plutôt qu'espéré, parce
   * qu'un lieu manquant laisserait un niveau sans nom.
   */
  lieux: string[];
}

export const MONDES: Monde[] = [
  {
    id: 'kanto',
    nom: 'Kanto',
    generation: 1,
    sousTitre: 'De Bourg Palette au Plateau Indigo. Vingt lieux pour apprendre à tenir une ligne.',
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
    bestiaire: ['rattata', 'weedle', 'caterpie', 'pidgey', 'zigzagoon'],
    boss: ['pidgey', 'geodude', 'poochyena', 'machop'],
    durete: 1,
    lieux: [
      'Bourg Palette',
      'Route 1',
      'Jadielle',
      'Forêt de Jade',
      'Argenta',
      'Mont Sélénite',
      'Azuria',
      'Pont Pépite',
      'Carmin sur Mer',
      'Chenal 5',
      'Lavanville',
      'Tour Pokémon',
      'Parmanie',
      'Safrania',
      'Sylphe SARL',
      'Cramois’Île',
      'Manoir Pokémon',
      'Îles Écume',
      'Route Victoire',
      'Plateau Indigo',
    ],
  },
  {
    id: 'johto',
    nom: 'Johto',
    generation: 2,
    sousTitre: 'Les cendres du Mont Argenté. Ils arrivent plus vite qu’on ne croit.',
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
    boss: ['geodude', 'machop', 'geodude', 'machop'],
    durete: 2.4,
    lieux: [
      'Bourg Geon',
      'Ville Griotte',
      'Bois aux Chênes',
      'Écorcia',
      'Puits Gobe-Mouche',
      'Mauville',
      'Phare de Mauville',
      'Route Souterraine',
      'Doublonville',
      'Route 37',
      'Rosalia',
      'Tour Chétiflor',
      'Irisia',
      'Antre Noir',
      'Acajou',
      'Lac de Rage',
      'Ébènelle',
      'Route Victoire',
      'Mont Argenté',
      'Sommet Argenté',
    ],
  },
];

export function sorteDuRang(rang: number): SorteNiveau {
  return rang % PAS_BOSS === 0 ? 'boss' : 'normal';
}

/** Palier de boss d'un rang : 1 au rang 5, 4 au rang 20. Zéro sinon. */
export function palierBossDuRang(rang: number): number {
  return rang % PAS_BOSS === 0 ? rang / PAS_BOSS : 0;
}

/** Tous les niveaux, dans l'ordre. */
export const NIVEAUX: Niveau[] = MONDES.flatMap((monde, indexMonde) => {
  // Un lieu manquant laisserait un niveau sans nom : on le voit au chargement
  // plutôt qu'en jeu.
  if (monde.lieux.length !== NIVEAUX_PAR_MONDE) {
    throw new Error(
      `${monde.nom} : ${monde.lieux.length} lieux pour ${NIVEAUX_PAR_MONDE} niveaux`
    );
  }

  return monde.lieux.map((lieu, i) => {
    const rang = i + 1;
    return {
      id: `${monde.id}-${String(rang).padStart(2, '0')}`,
      mondeId: monde.id,
      rang,
      index: indexMonde * NIVEAUX_PAR_MONDE + rang,
      sorte: sorteDuRang(rang),
      nom: lieu,
      palierBoss: palierBossDuRang(rang),
    };
  });
});

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
