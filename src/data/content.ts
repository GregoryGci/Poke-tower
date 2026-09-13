/**
 * Contenu de départ : espèces, attaques et traits.
 *
 * Les stats reprennent les vraies valeurs du Pokédex et les movepools ne
 * contiennent que des attaques réellement apprenables, comme demandé au brief.
 * Les hauteurs sont **mesurées sur les modèles convertis**, jamais estimées.
 *
 * Trois choses se lisent ici et nulle part ailleurs :
 *
 *  - la **rareté**, qui appartient à l'espèce. C'est elle qui décide du socle
 *    de stats et de la puissance des attaques ; un exemplaire n'a plus la
 *    sienne ;
 *  - les **lignées d'évolution** et le **niveau** auquel chaque stade passe au
 *    suivant, repris des jeux d'origine ;
 *  - les stades évolués, qui ne déclarent que ce qui leur est propre — nom,
 *    numéro, types, stats, modèle, taille — et héritent du reste de leur base.
 *    Un Grolem reste un lanceur de zone, avec un peu plus d'allonge.
 */

import { estEvolutionNiveau } from './types';
import type { Move, Rarity, Species, Trait, BaseStats, PokemonType } from './types';

/**
 * Attaques de base.
 *
 * Ce sont les auto-attaques : le Pokémon en porte **une** et la lance en
 * boucle. Elles restent donc volontairement modestes — c'est l'ultime qui
 * fait les gros chiffres.
 *
 * Aucune attaque de statut ici : avec une seule attaque par Pokémon, en tirer
 * une qui ne fait pas de dégâts donnait une unité inerte, et le joueur ne
 * pouvait rien y comprendre.
 */
const AUTOS: Record<string, Omit<Move, 'sorte'>> = {
  charge: { id: 'charge', name: 'Charge', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 1, cast: 0.15 },
  griffe: { id: 'griffe', name: 'Griffe', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 0.9, cast: 0.12 },
  vive_attaque: { id: 'vive_attaque', name: 'Vive-Attaque', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 0.7, cast: 0 },
  ecras_face: { id: 'ecras_face', name: 'Écras’Face', type: 'normal', category: 'physique', power: 80, accuracy: 1, cooldown: 1.8, cast: 0.55 },
  morsure: { id: 'morsure', name: 'Morsure', type: 'tenebres', category: 'physique', power: 60, accuracy: 1, cooldown: 1.4, cast: 0.3 },
  fouet_lianes: { id: 'fouet_lianes', name: 'Fouet Lianes', type: 'plante', category: 'physique', power: 45, accuracy: 1, cooldown: 1.1, cast: 0.2 },
  tranch_herbe: { id: 'tranch_herbe', name: 'Tranch’Herbe', type: 'plante', category: 'special', power: 55, accuracy: 0.95, cooldown: 1.3, cast: 0.3 },
  flammeche: { id: 'flammeche', name: 'Flammèche', type: 'feu', category: 'special', power: 40, accuracy: 1, cooldown: 1, cast: 0.25 },
  pistolet_a_o: { id: 'pistolet_a_o', name: 'Pistolet à O', type: 'eau', category: 'special', power: 40, accuracy: 1, cooldown: 1, cast: 0.25 },
  piqure: { id: 'piqure', name: 'Piqûre', type: 'insecte', category: 'physique', power: 60, accuracy: 1, cooldown: 1.2, cast: 0.3 },
  dard_venin: { id: 'dard_venin', name: 'Dard-Venin', type: 'poison', category: 'physique', power: 15, accuracy: 1, cooldown: 0.6, cast: 0 },
  tornade: { id: 'tornade', name: 'Tornade', type: 'vol', category: 'special', power: 40, accuracy: 1, cooldown: 1, cast: 0.22 },
  eclate_roc: { id: 'eclate_roc', name: 'Éclate-Roc', type: 'combat', category: 'physique', power: 40, accuracy: 1, cooldown: 1.1, cast: 0.25 },
  jet_pierres: { id: 'jet_pierres', name: 'Jet-Pierres', type: 'roche', category: 'physique', power: 50, accuracy: 0.9, cooldown: 1.3, cast: 0.35 },
  balayage: { id: 'balayage', name: 'Balayage', type: 'combat', category: 'physique', power: 60, accuracy: 1, cooldown: 1.5, cast: 0.3 },
  draco_griffe: { id: 'draco_griffe', name: 'Draco-Griffe', type: 'dragon', category: 'physique', power: 80, accuracy: 1, cooldown: 1.6, cast: 0.4 },
  choc_mental: { id: 'choc_mental', name: 'Choc Mental', type: 'psy', category: 'special', power: 50, accuracy: 1, cooldown: 1.2, cast: 0.28 },
  eclair: { id: 'eclair', name: 'Éclair', type: 'electrik', category: 'special', power: 40, accuracy: 1, cooldown: 0.9, cast: 0.2 },
  vent_glace: { id: 'vent_glace', name: 'Vent Glace', type: 'glace', category: 'special', power: 55, accuracy: 0.95, cooldown: 1.3, cast: 0.3 },
};

/**
 * Grosses attaques, une par type.
 *
 * Le tirage d'un ultime se fait parmi celles du ou des types de l'espèce :
 * un Salamèche ne peut donc pas hériter d'Hydrocanon, et il n'y a jamais plus
 * de trois candidats — l'ultime reste lisible comme un choix, pas comme une
 * loterie à seize cases.
 *
 * Elles coûtent cher en cadence : trois à six secondes de recharge, et une
 * incantation longue. C'est ce temps de préparation qui les rend lisibles à
 * l'écran, l'aperçu au sol étant affiché pendant tout le cast.
 */
const ULTIMES: Record<string, Omit<Move, 'sorte'>> = {
  ultralaser: { id: 'ultralaser', name: 'Ultralaser', type: 'normal', category: 'special', power: 150, accuracy: 0.9, cooldown: 6.5, cast: 1.5 },
  lance_flammes: { id: 'lance_flammes', name: 'Lance-Flammes', type: 'feu', category: 'special', power: 90, accuracy: 1, cooldown: 4, cast: 0.9 },
  hydrocanon: { id: 'hydrocanon', name: 'Hydrocanon', type: 'eau', category: 'special', power: 110, accuracy: 0.8, cooldown: 5, cast: 1.2 },
  lame_feuille: { id: 'lame_feuille', name: 'Lame-Feuille', type: 'plante', category: 'physique', power: 90, accuracy: 1, cooldown: 4, cast: 0.8 },
  bomb_beurk: { id: 'bomb_beurk', name: 'Bomb-Beurk', type: 'poison', category: 'special', power: 90, accuracy: 1, cooldown: 4.2, cast: 0.95 },
  cru_ailes: { id: 'cru_ailes', name: 'Cru-Ailes', type: 'vol', category: 'physique', power: 90, accuracy: 0.95, cooldown: 3.8, cast: 0.7 },
  dard_nuee: { id: 'dard_nuee', name: 'Dard-Nuée', type: 'insecte', category: 'physique', power: 100, accuracy: 1, cooldown: 4.5, cast: 1 },
  eboulement: { id: 'eboulement', name: 'Éboulement', type: 'roche', category: 'physique', power: 75, accuracy: 0.9, cooldown: 3.6, cast: 0.8 },
  seisme: { id: 'seisme', name: 'Séisme', type: 'sol', category: 'physique', power: 100, accuracy: 1, cooldown: 5, cast: 1.1 },
  mitra_poing: { id: 'mitra_poing', name: 'Mitra-Poing', type: 'combat', category: 'physique', power: 100, accuracy: 1, cooldown: 4.4, cast: 0.9 },
  machouille: { id: 'machouille', name: 'Mâchouille', type: 'tenebres', category: 'physique', power: 80, accuracy: 1, cooldown: 3.6, cast: 0.7 },
  draco_meteor: { id: 'draco_meteor', name: 'Draco-Météore', type: 'dragon', category: 'special', power: 130, accuracy: 0.9, cooldown: 5.5, cast: 1.3 },
  psyko: { id: 'psyko', name: 'Psyko', type: 'psy', category: 'special', power: 90, accuracy: 1, cooldown: 4, cast: 0.9 },
  fatal_foudre: { id: 'fatal_foudre', name: 'Fatal-Foudre', type: 'electrik', category: 'special', power: 110, accuracy: 0.7, cooldown: 4.8, cast: 1.15 },
  blizzard: { id: 'blizzard', name: 'Blizzard', type: 'glace', category: 'special', power: 110, accuracy: 0.7, cooldown: 5, cast: 1.2 },
};

/** Le catalogue complet, chaque entrée portant son rôle. */
export const MOVES: Record<string, Move> = Object.fromEntries([
  ...Object.values(AUTOS).map((move) => [move.id, { ...move, sorte: 'auto' as const }]),
  ...Object.values(ULTIMES).map((move) => [move.id, { ...move, sorte: 'ultime' as const }]),
]);

/** Identifiants des auto-attaques, pour les tirages. */
export const AUTO_IDS = Object.keys(AUTOS);
/** Identifiants des ultimes, pour les tirages. */
export const ULTIME_IDS = Object.keys(ULTIMES);

/**
 * Ultime de repli.
 *
 * Une espèce dont aucun type n'a d'ultime déclaré doit quand même pouvoir
 * en porter un. Ultralaser est neutre et n'appartient à personne.
 */
export const ULTIME_UNIVERSEL = 'ultralaser';

export const TRAITS: Trait[] = [
  { id: 'vue_percante', name: 'Vue perçante', rarity: 'rare', effect: { kind: 'range', percent: 15 } },
  { id: 'reflexes', name: 'Réflexes', rarity: 'rare', effect: { kind: 'cooldown', percent: 12 } },
  { id: 'muscle', name: 'Musclé', rarity: 'normal', effect: { kind: 'stat', stat: 'atk', percent: 8 } },
  { id: 'carapace', name: 'Carapace', rarity: 'normal', effect: { kind: 'stat', stat: 'def', percent: 10 } },
  { id: 'vif', name: 'Vif', rarity: 'normal', effect: { kind: 'stat', stat: 'vitesse', percent: 10 } },
  { id: 'chasseur', name: 'Chasseur de primes', rarity: 'epique', effect: { kind: 'onKill', crystals: 1 } },
  { id: 'cadence', name: 'Cadence infernale', rarity: 'epique', effect: { kind: 'cooldown', percent: 25 } },
  { id: 'oeil_aigle', name: 'Œil d’aigle', rarity: 'legendaire', effect: { kind: 'range', percent: 30 } },
];

function stats(
  pv: number, atk: number, def: number, atkSpe: number, defSpe: number, vitesse: number
): BaseStats {
  return { pv, atk, def, atkSpe, defSpe, vitesse };
}

/**
 * Espèces de base : celles qu'on peut obtenir au portail.
 *
 * La rareté suit le total de stats du Pokédex, avec deux écarts assumés : les
 * six starters sont tous légendaires, au même rang — les répartir sur deux
 * paliers aurait rendu le choix de départ inéquitable alors que c'est le seul
 * choix du jeu qu'on ne peut pas refaire — et Rayquaza occupe seul le palier
 * prismatique.
 */
const BASES: Record<string, Species> = {
  // --- Starters (légendaires : total de stats ~310, et lignées complètes)
  bulbasaur: {
    id: 'bulbasaur', dexNumber: 1, name: 'Bulbizarre', types: ['plante', 'poison'],
    baseStats: stats(45, 49, 49, 65, 65, 45), rarity: 'legendaire',
    range: 7.5, style: 'ligne', movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'dard_venin'],
    evolutions: [{ into: 'ivysaur', niveau: 16 }], model: 'bulbasaur', height: 1.07,
  },
  charmander: {
    id: 'charmander', dexNumber: 4, name: 'Salamèche', types: ['feu'],
    baseStats: stats(39, 52, 43, 60, 50, 65), rarity: 'legendaire',
    range: 5.2, style: 'zone', movepool: ['griffe', 'flammeche', 'morsure', 'vive_attaque'],
    evolutions: [{ into: 'charmeleon', niveau: 16 }], model: 'charmander', height: 1.31,
  },
  squirtle: {
    id: 'squirtle', dexNumber: 7, name: 'Carapuce', types: ['eau'],
    baseStats: stats(44, 48, 65, 50, 64, 43), rarity: 'legendaire',
    range: 8.5, style: 'unique', movepool: ['charge', 'pistolet_a_o', 'morsure', 'ecras_face'],
    evolutions: [{ into: 'wartortle', niveau: 16 }], model: 'squirtle', height: 1.17,
  },
  treecko: {
    id: 'treecko', dexNumber: 252, name: 'Arcko', types: ['plante'],
    baseStats: stats(40, 45, 35, 65, 55, 70), rarity: 'legendaire',
    range: 6.4, style: 'unique', movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'vive_attaque'],
    evolutions: [{ into: 'grovyle', niveau: 16 }], model: 'treecko', height: 1.53,
  },
  torchic: {
    id: 'torchic', dexNumber: 255, name: 'Poussifeu', types: ['feu'],
    baseStats: stats(45, 60, 40, 70, 50, 45), rarity: 'legendaire',
    range: 5, style: 'zone', movepool: ['griffe', 'flammeche', 'vive_attaque', 'ecras_face'],
    evolutions: [{ into: 'combusken', niveau: 16 }], model: 'torchic', height: 1.45,
  },
  mudkip: {
    id: 'mudkip', dexNumber: 258, name: 'Gobou', types: ['eau'],
    baseStats: stats(50, 70, 50, 50, 50, 40), rarity: 'legendaire',
    range: 3, style: 'cac', movepool: ['charge', 'pistolet_a_o', 'morsure'],
    evolutions: [{ into: 'marshtomp', niveau: 16 }], model: 'mudkip', height: 1.41,
  },

  // --- Épiques : les gros cogneurs sauvages
  geodude: {
    id: 'geodude', dexNumber: 74, name: 'Racaillou', types: ['roche', 'sol'],
    baseStats: stats(40, 80, 100, 30, 30, 20), rarity: 'epique',
    range: 4.8, style: 'zone', movepool: ['charge', 'jet_pierres', 'eclate_roc', 'ecras_face'],
    evolutions: [{ into: 'graveler', niveau: 25 }], model: 'geodude', height: 0.55,
  },
  machop: {
    id: 'machop', dexNumber: 66, name: 'Machoc', types: ['combat'],
    baseStats: stats(70, 80, 50, 35, 35, 35), rarity: 'epique',
    range: 2.8, style: 'cac', movepool: ['eclate_roc', 'balayage', 'ecras_face', 'charge'],
    evolutions: [{ into: 'machoke', niveau: 28 }], model: 'machop', height: 1.47,
  },

  // --- Rares : la faune ordinaire des routes
  zigzagoon: {
    id: 'zigzagoon', dexNumber: 263, name: 'Zigzaton', types: ['normal'],
    baseStats: stats(38, 30, 41, 30, 41, 60), rarity: 'rare',
    range: 3.4, style: 'cac', movepool: ['charge', 'morsure', 'vive_attaque'],
    evolutions: [{ into: 'linoone', niveau: 20 }], model: 'zigzagoon', height: 0.71,
  },
  pidgey: {
    id: 'pidgey', dexNumber: 16, name: 'Roucool', types: ['normal', 'vol'],
    baseStats: stats(40, 45, 40, 35, 35, 56), rarity: 'rare',
    range: 9, style: 'unique', movepool: ['charge', 'tornade', 'vive_attaque'],
    evolutions: [{ into: 'pidgeotto', niveau: 18 }], model: 'pidgey', height: 0.89,
  },
  rattata: {
    id: 'rattata', dexNumber: 19, name: 'Rattata', types: ['normal'],
    baseStats: stats(30, 56, 35, 25, 35, 72), rarity: 'rare',
    range: 3, style: 'cac', movepool: ['charge', 'morsure', 'vive_attaque'],
    evolutions: [{ into: 'raticate', niveau: 20 }], model: 'rattata', height: 0.81,
  },

  // --- Normaux : les premières rencontres
  weedle: {
    id: 'weedle', dexNumber: 13, name: 'Aspicot', types: ['insecte', 'poison'],
    baseStats: stats(40, 35, 30, 20, 20, 50), rarity: 'normal',
    range: 6.8, style: 'ligne', movepool: ['piqure', 'dard_venin'],
    evolutions: [{ into: 'kakuna', niveau: 7 }], model: 'weedle', height: 1.22,
  },
  caterpie: {
    id: 'caterpie', dexNumber: 10, name: 'Chenipan', types: ['insecte'],
    baseStats: stats(45, 30, 35, 20, 20, 45), rarity: 'normal',
    range: 4.2, style: 'zone', movepool: ['charge', 'piqure'],
    evolutions: [{ into: 'metapod', niveau: 7 }], model: 'caterpie', height: 1.17,
  },
  wurmple: {
    id: 'wurmple', dexNumber: 265, name: 'Chenipotte', types: ['insecte'],
    baseStats: stats(45, 45, 35, 20, 30, 20), rarity: 'normal',
    range: 4.6, style: 'zone', movepool: ['charge', 'piqure', 'dard_venin'],
    evolutions: [{ into: 'silcoon', niveau: 7 }], model: 'wurmple', height: 0.6,
  },
  poochyena: {
    id: 'poochyena', dexNumber: 261, name: 'Medhyèna', types: ['tenebres'],
    baseStats: stats(35, 55, 35, 30, 30, 35), rarity: 'normal',
    range: 3.2, style: 'cac', movepool: ['charge', 'morsure'],
    evolutions: [{ into: 'mightyena', niveau: 18 }], model: 'poochyena', height: 1.29,
  },

  // --- Évoli : la lignée à pierres
  //
  // Il n'évolue à aucun niveau. Ses trois suites demandent chacune une
  // pierre, qui ne tombe que dans un raid dédié : c'est le seul Pokémon du
  // jeu dont on **choisit** la forme finale, et ce choix est irréversible.
  eevee: {
    id: 'eevee', dexNumber: 133, name: 'Évoli', types: ['normal'],
    baseStats: stats(55, 55, 50, 45, 65, 55), rarity: 'epique',
    range: 4.4, style: 'cac', movepool: ['charge', 'morsure', 'vive_attaque', 'ecras_face'],
    evolutions: [
      { into: 'vaporeon', pierre: 'pierre-eau' },
      { into: 'jolteon', pierre: 'pierre-foudre' },
      { into: 'flareon', pierre: 'pierre-feu' },
    ],
    model: 'eevee', height: 1.2,
  },
  vaporeon: {
    id: 'vaporeon', dexNumber: 134, name: 'Aquali', types: ['eau'],
    baseStats: stats(130, 65, 60, 110, 95, 65), rarity: 'epique',
    range: 8.6, style: 'unique', movepool: ['pistolet_a_o', 'charge', 'morsure'],
    evolutions: [], model: 'vaporeon', height: 1.79,
  },
  jolteon: {
    id: 'jolteon', dexNumber: 135, name: 'Voltali', types: ['electrik'],
    baseStats: stats(65, 65, 60, 110, 95, 130), rarity: 'epique',
    range: 7.8, style: 'ligne', movepool: ['charge', 'vive_attaque', 'morsure'],
    evolutions: [], model: 'jolteon', height: 1.43,
  },
  flareon: {
    id: 'flareon', dexNumber: 136, name: 'Pyroli', types: ['feu'],
    baseStats: stats(65, 130, 60, 95, 110, 65), rarity: 'epique',
    range: 5.4, style: 'zone', movepool: ['flammeche', 'morsure', 'griffe'],
    evolutions: [], model: 'flareon', height: 1.5,
  },

  // --- Prismatique : le premier Pokémon unique
  //
  // Rayquaza est un serpent : son modèle mesure seize unités de long pour une
  // et demie de haut. Posé tel quel, il couvrait la moitié du terrain — d'où
  // l'échelle, qui est une donnée de l'espèce et non un correctif d'affichage.
  rayquaza: {
    id: 'rayquaza', dexNumber: 384, name: 'Rayquaza', types: ['dragon', 'vol'],
    baseStats: stats(105, 150, 90, 150, 90, 95), rarity: 'prismatique',
    range: 11, style: 'ligne', movepool: ['draco_griffe', 'tornade', 'ecras_face'],
    evolutions: [], model: 'rayquaza', height: 0.6, echelle: 0.4,
  },
  mewtwo: {
    id: 'mewtwo', dexNumber: 150, name: 'Mewtwo', types: ['psy'],
    baseStats: stats(106, 110, 90, 154, 90, 130), rarity: 'prismatique',
    range: 10.5, style: 'unique', movepool: ['choc_mental', 'vive_attaque', 'ecras_face'],
    evolutions: [], model: 'mewtwo', height: 2.26, echelle: 0.75,
  },
  lugia: {
    id: 'lugia', dexNumber: 249, name: 'Lugia', types: ['psy', 'vol'],
    baseStats: stats(106, 90, 130, 90, 154, 110), rarity: 'prismatique',
    range: 12, style: 'ligne', movepool: ['choc_mental', 'tornade', 'charge'],
    evolutions: [], model: 'lugia', height: 2.34, echelle: 0.3,
  },
  'ho-oh': {
    id: 'ho-oh', dexNumber: 250, name: 'Ho-Oh', types: ['feu', 'vol'],
    baseStats: stats(106, 130, 90, 110, 154, 90), rarity: 'prismatique',
    range: 9.5, style: 'zone', movepool: ['flammeche', 'tornade', 'griffe'],
    evolutions: [], model: 'ho-oh', height: 1.31, echelle: 0.32,
  },
  articuno: {
    id: 'articuno', dexNumber: 144, name: 'Artikodin', types: ['glace', 'vol'],
    baseStats: stats(90, 85, 100, 95, 125, 85), rarity: 'prismatique',
    range: 9, style: 'zone', movepool: ['vent_glace', 'tornade', 'charge'],
    evolutions: [], model: 'articuno', height: 1.6, echelle: 0.32,
  },
  zapdos: {
    id: 'zapdos', dexNumber: 145, name: 'Électhor', types: ['electrik', 'vol'],
    baseStats: stats(90, 90, 85, 125, 90, 100), rarity: 'prismatique',
    range: 11.5, style: 'ligne', movepool: ['eclair', 'tornade', 'charge'],
    evolutions: [], model: 'zapdos', height: 1.17, echelle: 0.45,
  },
  moltres: {
    id: 'moltres', dexNumber: 146, name: 'Sulfura', types: ['feu', 'vol'],
    baseStats: stats(90, 100, 90, 125, 85, 90), rarity: 'prismatique',
    range: 9.5, style: 'zone', movepool: ['flammeche', 'tornade', 'griffe'],
    evolutions: [], model: 'moltres', height: 2.32, echelle: 0.28,
  },
  mew: {
    id: 'mew', dexNumber: 151, name: 'Mew', types: ['psy'],
    baseStats: stats(100, 100, 100, 100, 100, 100), rarity: 'prismatique',
    range: 9, style: 'unique', movepool: ['choc_mental', 'vive_attaque', 'charge'],
    evolutions: [], model: 'mew', height: 1.22, echelle: 0.8,
  },

  // --- Uniques : le sommet de ce qu'on peut viser en cristaux
  //
  // Cinq lignées dont seul le dernier stade existe ici : leurs pré-évolutions
  // ne sont pas converties, et les ajouter pour elles-mêmes aurait rempli le
  // portail de Minidraco sans intérêt. Ils s'obtiennent donc directement, à
  // 1,5 % — assez rare pour rester un événement, assez atteignable pour se
  // viser.
  dragonite: {
    id: 'dragonite', dexNumber: 149, name: 'Dracolosse', types: ['dragon', 'vol'],
    baseStats: stats(91, 134, 95, 100, 100, 80), rarity: 'unique',
    range: 7.5, style: 'cac', movepool: ['draco_griffe', 'tornade', 'ecras_face'],
    evolutions: [], model: 'dragonite', height: 2.73, echelle: 0.7,
  },
  tyranitar: {
    id: 'tyranitar', dexNumber: 248, name: 'Tyranocif', types: ['roche', 'tenebres'],
    baseStats: stats(100, 134, 110, 95, 100, 61), rarity: 'unique',
    range: 6.5, style: 'zone', movepool: ['jet_pierres', 'morsure', 'ecras_face'],
    evolutions: [], model: 'tyranitar', height: 2.63, echelle: 0.75,
  },
  salamence: {
    id: 'salamence', dexNumber: 373, name: 'Drattak', types: ['dragon', 'vol'],
    baseStats: stats(95, 135, 80, 110, 80, 100), rarity: 'unique',
    range: 8.5, style: 'ligne', movepool: ['draco_griffe', 'tornade', 'morsure'],
    evolutions: [], model: 'salamence', height: 1.85, echelle: 0.55,
  },
  metagross: {
    id: 'metagross', dexNumber: 376, name: 'Métalosse', types: ['acier', 'psy'],
    baseStats: stats(80, 135, 130, 95, 90, 70), rarity: 'unique',
    range: 5.5, style: 'cac', movepool: ['choc_mental', 'ecras_face', 'charge'],
    evolutions: [], model: 'metagross', height: 2.04, echelle: 0.75,
  },
  garchomp: {
    id: 'garchomp', dexNumber: 445, name: 'Carchacrok', types: ['dragon', 'sol'],
    baseStats: stats(108, 130, 95, 80, 85, 102), rarity: 'unique',
    range: 4.5, style: 'cac', movepool: ['draco_griffe', 'morsure', 'ecras_face'],
    evolutions: [], model: 'garchomp', height: 2.7, echelle: 0.8,
  },
};

/**
 * Un stade évolué.
 *
 * Il déclare ce qui lui est propre — nom, numéro, types, stats du Pokédex,
 * modèle, hauteur mesurée — et le **niveau** auquel le stade précédent y
 * passe. Le style de frappe, le movepool et la rareté viennent de sa lignée.
 */
interface StadeEvolue {
  id: string;
  dexNumber: number;
  name: string;
  types?: [PokemonType] | [PokemonType, PokemonType];
  baseStats: BaseStats;
  /**
   * Rareté propre, quand elle diffère de celle de la lignée.
   *
   * Un seul cas aujourd'hui : Dracaufeu. Il figure au portail des uniques, et
   * une espèce ne peut avoir qu'une rareté — c'est la règle du jeu. Le faire
   * monter d'un cran au dernier stade est plus juste que de dédoubler
   * l'espèce : évoluer un Salamèche jusqu'au bout rapporte alors exactement
   * ce que le portail vend.
   */
  rarity?: Rarity;
  /** Hauteur mesurée sur le .glb converti. */
  height: number;
  /** Niveau auquel la forme précédente évolue vers celle-ci. */
  niveau: number;
  /** Stade suivant, s'il y en a un. */
  evolution?: string;
}

/**
 * Les lignées, dans l'ordre des stades.
 *
 * Les niveaux sont ceux des jeux d'origine, à deux exceptions près :
 * Gravalanch → Grolem et Machopeur → Mackogneur s'obtiennent par échange, qui
 * n'existe pas ici. Un niveau élevé est la substitution la plus honnête — ça
 * reste le dernier palier de leur lignée, et ça se mérite.
 */
const LIGNEES: Record<string, StadeEvolue[]> = {
  bulbasaur: [
    { id: 'ivysaur', dexNumber: 2, name: 'Herbizarre', baseStats: stats(60, 62, 63, 80, 80, 60), height: 1.69, niveau: 16, evolution: 'venusaur' },
    { id: 'venusaur', dexNumber: 3, name: 'Florizarre', baseStats: stats(80, 82, 83, 100, 100, 80), height: 2.46, niveau: 32 },
  ],
  charmander: [
    { id: 'charmeleon', dexNumber: 5, name: 'Reptincel', baseStats: stats(58, 64, 58, 80, 65, 80), height: 1.8, niveau: 16, evolution: 'charizard' },
    { id: 'charizard', dexNumber: 6, name: 'Dracaufeu', types: ['feu', 'vol'], baseStats: stats(78, 84, 78, 109, 85, 100), height: 2.72, niveau: 36, rarity: 'unique' },
  ],
  squirtle: [
    { id: 'wartortle', dexNumber: 8, name: 'Carabaffe', baseStats: stats(59, 63, 80, 65, 80, 58), height: 1.86, niveau: 16, evolution: 'blastoise' },
    { id: 'blastoise', dexNumber: 9, name: 'Tortank', baseStats: stats(79, 83, 100, 85, 105, 78), height: 3.48, niveau: 36 },
  ],
  treecko: [
    { id: 'grovyle', dexNumber: 253, name: 'Massko', baseStats: stats(50, 65, 45, 85, 65, 95), height: 4.58, niveau: 16, evolution: 'sceptile' },
    { id: 'sceptile', dexNumber: 254, name: 'Jungko', baseStats: stats(70, 85, 65, 105, 85, 120), height: 2.72, niveau: 36 },
  ],
  torchic: [
    { id: 'combusken', dexNumber: 256, name: 'Galifeu', types: ['feu', 'combat'], baseStats: stats(60, 85, 60, 85, 60, 55), height: 2.19, niveau: 16, evolution: 'blaziken' },
    { id: 'blaziken', dexNumber: 257, name: 'Braségali', types: ['feu', 'combat'], baseStats: stats(80, 120, 70, 110, 70, 80), height: 4.2, niveau: 36 },
  ],
  mudkip: [
    { id: 'marshtomp', dexNumber: 259, name: 'Flobio', types: ['eau', 'sol'], baseStats: stats(70, 85, 70, 60, 70, 50), height: 1.87, niveau: 16, evolution: 'swampert' },
    { id: 'swampert', dexNumber: 260, name: 'Laggron', types: ['eau', 'sol'], baseStats: stats(100, 110, 90, 85, 90, 60), height: 2.83, niveau: 36 },
  ],
  geodude: [
    { id: 'graveler', dexNumber: 75, name: 'Gravalanch', baseStats: stats(55, 95, 115, 45, 45, 35), height: 1.21, niveau: 25, evolution: 'golem' },
    { id: 'golem', dexNumber: 76, name: 'Grolem', baseStats: stats(80, 120, 130, 55, 65, 45), height: 1.91, niveau: 40 },
  ],
  machop: [
    { id: 'machoke', dexNumber: 67, name: 'Machopeur', baseStats: stats(80, 100, 70, 50, 60, 45), height: 1.85, niveau: 28, evolution: 'machamp' },
    { id: 'machamp', dexNumber: 68, name: 'Mackogneur', baseStats: stats(90, 130, 80, 65, 85, 55), height: 1.96, niveau: 42 },
  ],
  pidgey: [
    { id: 'pidgeotto', dexNumber: 17, name: 'Roucoups', baseStats: stats(63, 60, 55, 50, 50, 71), height: 1.13, niveau: 18, evolution: 'pidgeot' },
    { id: 'pidgeot', dexNumber: 18, name: 'Roucarnage', baseStats: stats(83, 80, 75, 70, 70, 101), height: 2.02, niveau: 36 },
  ],
  weedle: [
    { id: 'kakuna', dexNumber: 14, name: 'Coconfort', baseStats: stats(45, 25, 50, 25, 25, 35), height: 1.06, niveau: 7, evolution: 'beedrill' },
    { id: 'beedrill', dexNumber: 15, name: 'Dardargnan', baseStats: stats(65, 90, 40, 45, 80, 75), height: 1.64, niveau: 10 },
  ],
  caterpie: [
    { id: 'metapod', dexNumber: 11, name: 'Chrysacier', baseStats: stats(50, 20, 55, 25, 25, 30), height: 1.12, niveau: 7, evolution: 'butterfree' },
    { id: 'butterfree', dexNumber: 12, name: 'Papilusion', types: ['insecte', 'vol'], baseStats: stats(60, 45, 50, 90, 80, 70), height: 1.94, niveau: 10 },
  ],
  wurmple: [
    { id: 'silcoon', dexNumber: 266, name: 'Armulys', baseStats: stats(50, 35, 55, 25, 25, 15), height: 1.3, niveau: 7, evolution: 'beautifly' },
    { id: 'beautifly', dexNumber: 267, name: 'Charmillon', types: ['insecte', 'vol'], baseStats: stats(60, 70, 50, 100, 50, 65), height: 1.91, niveau: 10 },
  ],
  rattata: [
    { id: 'raticate', dexNumber: 20, name: 'Rattatac', baseStats: stats(55, 81, 60, 50, 70, 97), height: 1.21, niveau: 20 },
  ],
  zigzagoon: [
    { id: 'linoone', dexNumber: 264, name: 'Linéon', baseStats: stats(78, 70, 61, 50, 61, 100), height: 1.2, niveau: 20 },
  ],
  poochyena: [
    { id: 'mightyena', dexNumber: 262, name: 'Grahyèna', baseStats: stats(70, 90, 70, 60, 60, 70), height: 1.97, niveau: 18 },
  ],
};

/**
 * `model` référence un .glb de public/models, produit par
 * `npm run convert` depuis les assets Cobblemon.
 */
export const SPECIES: Record<string, Species> = (() => {
  const out: Record<string, Species> = { ...BASES };

  for (const [baseId, stades] of Object.entries(LIGNEES)) {
    const base = BASES[baseId];
    if (!base) throw new Error(`Lignée sans base : ${baseId}`);
    stades.forEach((stade, rang) => {
      out[stade.id] = {
        id: stade.id,
        dexNumber: stade.dexNumber,
        name: stade.name,
        types: stade.types ?? base.types,
        baseStats: stade.baseStats,
        // Un stade évolué garde la rareté de sa lignée, sauf s'il en déclare
        // une : voir `StadeEvolue.rarity`.
        rarity: stade.rarity ?? base.rarity,
        // Un peu plus d'allonge par stade, sans changer de rôle : une évolution
        // qui se mettrait à tirer de loin demanderait de la replacer.
        range: Math.round(base.range * (1 + 0.08 * (rang + 1)) * 10) / 10,
        style: base.style,
        movepool: base.movepool,
        evolutions: stade.evolution
          ? [{ into: stade.evolution, niveau: stades[rang + 1]?.niveau ?? 99 }]
          : [],
        model: stade.id,
        height: stade.height,
      };
    });
  }

  return out;
})();

/**
 * Les valises du professeur.
 *
 * Une par région dont les trois starters sont convertis. Le joueur choisit
 * d'abord la valise, puis le Pokémon qu'elle contient.
 */
export interface StarterCase {
  id: string;
  region: string;
  /** Exactement trois espèces, dans l'ordre plante / feu / eau. */
  starters: [string, string, string];
}

/**
 * Une seule valise, et c'est un choix.
 *
 * Le premier ecran du jeu proposait deux regions, donc six starters et un
 * selecteur pour passer de l'une a l'autre. C'est deja une decision a prendre
 * avant d'avoir vu la moindre regle. Les trois de Kanto suffisent : ce sont
 * les plus reconnaissables, et trois options se comparent d'un coup d'oeil la
 * ou six demandent de naviguer.
 *
 * Les starters de Hoenn restent au catalogue et sortent au portail.
 */
export const STARTER_CASES: StarterCase[] = [
  { id: 'kanto', region: 'Kanto', starters: ['bulbasaur', 'charmander', 'squirtle'] },
];

/** Starters de la valise ouverte par défaut. */
export const STARTER_IDS = STARTER_CASES[0]!.starters;

/** Espèces utilisées comme ennemis dans les vagues. */
export const ENEMY_IDS = ['rattata', 'pidgey', 'caterpie', 'weedle', 'zigzagoon', 'poochyena', 'wurmple', 'geodude', 'machop'] as const;

/**
 * Espèces qu'une invocation peut donner.
 *
 * Les stades évolués en sont exclus : on ne les obtient qu'en faisant monter
 * un Pokémon de niveau. Les invoquer directement viderait la progression de
 * son intérêt.
 */
/**
 * Espèces obtenues autrement qu'au portail à cristaux.
 *
 * Deux familles :
 *
 *  - les trois évolutions d'Évoli, qui demandent une pierre. Les invoquer
 *    directement rendrait les pierres inutiles ;
 *  - les **prismatiques**, qui ne sortent qu'au portail à Balls. C'est toute
 *    la raison d'être de cette monnaie : les laisser aussi tomber à 2 % au
 *    portail ordinaire aurait vidé la Master Ball de son sens.
 */
const HORS_PORTAIL = new Set(['vaporeon', 'jolteon', 'flareon']);

export const ESPECES_OBTENABLES = [
  ...Object.keys(BASES).filter(
    (id) => !HORS_PORTAIL.has(id) && BASES[id]!.rarity !== 'prismatique'
  ),
  // Dracaufeu est le seul stade évolué qu'on peut aussi invoquer : il porte
  // la rareté « unique », et c'est à ce titre qu'il y entre. Les autres
  // évolutions restent hors portail, sans quoi la progression par
  // l'expérience n'aurait plus d'objet.
  'charizard',
];

/** Espèces du portail à Balls : les prismatiques, et elles seules. */
export const ESPECES_LEGENDAIRES = Object.keys(BASES).filter(
  (id) => BASES[id]!.rarity === 'prismatique'
);

export function getSpecies(id: string): Species {
  const species = SPECIES[id];
  if (!species) throw new Error(`Espèce inconnue : ${id}`);
  return species;
}

export function getMove(id: string): Move {
  const move = MOVES[id];
  if (!move) throw new Error(`Attaque inconnue : ${id}`);
  return move;
}

/**
 * Rareté d'un exemplaire, lue sur son espèce.
 *
 * Passer par cette fonction plutôt que par un champ recopié dans la
 * sauvegarde : c'est le même piège que les attaques figées à l'obtention —
 * un champ recopié ne suit pas le catalogue.
 */
export function rareteDe(owned: { speciesId: string }): Rarity {
  return getSpecies(owned.speciesId).rarity;
}

/** Espèces d'une rareté donnée, parmi celles qu'on peut obtenir. */
export function especesDeRarete(rarity: Rarity): string[] {
  return ESPECES_OBTENABLES.filter((id) => getSpecies(id).rarity === rarity);
}

/** L'évolution par niveau d'une espèce, s'il y en a une. */
export function evolutionParNiveau(species: Species): { into: string; niveau: number } | null {
  for (const evolution of species.evolutions) {
    if (estEvolutionNiveau(evolution)) return evolution;
  }
  return null;
}

/** Les évolutions par pierre d'une espèce. */
export function evolutionsParPierre(species: Species): Array<{ into: string; pierre: string }> {
  return species.evolutions.filter(
    (evolution): evolution is { into: string; pierre: string } => !estEvolutionNiveau(evolution)
  );
}

/**
 * La lignée d'une espèce, de sa base à son dernier stade.
 *
 * Elle suit les évolutions **par niveau** : c'est la chaîne linéaire, celle
 * qui arrive toute seule. Les embranchements à pierre sont listés à part —
 * les afficher en ligne obligerait à choisir laquelle des trois suites
 * d'Évoli est « la » lignée, ce qui n'a pas de sens.
 */
export function lignee(speciesId: string): Species[] {
  const base = baseDeLaLignee(speciesId);
  const suite: Species[] = [base];
  let courante = base;
  for (;;) {
    const etape = evolutionParNiveau(courante);
    if (!etape) break;
    courante = getSpecies(etape.into);
    suite.push(courante);
    if (suite.length > 8) break;
  }
  return suite;
}

/** Première forme de la lignée dont `speciesId` fait partie. */
export function baseDeLaLignee(speciesId: string): Species {
  for (const [baseId, stades] of Object.entries(LIGNEES)) {
    if (stades.some((stade) => stade.id === speciesId)) return getSpecies(baseId);
  }
  return getSpecies(speciesId);
}
