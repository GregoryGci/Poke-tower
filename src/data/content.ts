/**
 * Contenu de départ : espèces, attaques et traits.
 *
 * Les stats reprennent les vraies valeurs du Pokédex et les movepools ne
 * contiennent que des attaques réellement apprenables, comme demandé au brief.
 * Les hauteurs sont mesurées sur les modèles convertis, pas estimées.
 *
 * Deux choses se lisent ici et nulle part ailleurs :
 *
 *  - la **rareté**, qui appartient à l'espèce. C'est elle qui décide du socle
 *    de stats et de la puissance des attaques ; un exemplaire n'a plus la
 *    sienne ;
 *  - les **lignées d'évolution**, dont les paliers s'achètent en manche. Les
 *    stades évolués sont construits à partir de leur base : ils en héritent le
 *    style, la portée et le movepool, et ne déclarent que ce qui leur est
 *    propre.
 */

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
 * monter au palier 3. Ultralaser est neutre et n'appartient à personne.
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
 * Espèces de base : celles dont le .glb existe.
 *
 * La rareté suit le total de stats du Pokédex, avec une exception assumée :
 * les six starters sont tous légendaires, au même rang. Les répartir sur deux
 * paliers aurait rendu le choix de départ inéquitable alors que c'est le seul
 * choix du jeu qu'on ne peut pas refaire.
 *
 * Le palier prismatique reste vide : il est réservé aux vrais légendaires du
 * Pokédex, dont les modèles ne sont pas convertis. Le gacha en tient compte.
 */
const BASES: Record<string, Species> = {
  // --- Starters (légendaires : total de stats ~310, et lignées complètes)
  bulbasaur: {
    id: 'bulbasaur', dexNumber: 1, name: 'Bulbizarre', types: ['plante', 'poison'],
    baseStats: stats(45, 49, 49, 65, 65, 45), rarity: 'legendaire',
    range: 7.5, style: 'ligne', movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'dard_venin'],
    evolution: 'ivysaur', model: 'bulbasaur', height: 0.93,
  },
  charmander: {
    id: 'charmander', dexNumber: 4, name: 'Salamèche', types: ['feu'],
    baseStats: stats(39, 52, 43, 60, 50, 65), rarity: 'legendaire',
    range: 5.2, style: 'zone', movepool: ['griffe', 'flammeche', 'morsure', 'vive_attaque'],
    evolution: 'charmeleon', model: 'charmander', height: 1.31,
  },
  squirtle: {
    id: 'squirtle', dexNumber: 7, name: 'Carapuce', types: ['eau'],
    baseStats: stats(44, 48, 65, 50, 64, 43), rarity: 'legendaire',
    range: 8.5, style: 'unique', movepool: ['charge', 'pistolet_a_o', 'morsure', 'ecras_face'],
    evolution: 'wartortle', model: 'squirtle', height: 1.19,
  },
  treecko: {
    id: 'treecko', dexNumber: 252, name: 'Arcko', types: ['plante'],
    baseStats: stats(40, 45, 35, 65, 55, 70), rarity: 'legendaire',
    range: 6.4, style: 'unique', movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'vive_attaque'],
    evolution: 'grovyle', model: 'treecko', height: 1.53,
  },
  torchic: {
    id: 'torchic', dexNumber: 255, name: 'Poussifeu', types: ['feu'],
    baseStats: stats(45, 60, 40, 70, 50, 45), rarity: 'legendaire',
    range: 5, style: 'zone', movepool: ['griffe', 'flammeche', 'vive_attaque', 'ecras_face'],
    evolution: 'combusken', model: 'torchic', height: 1.51,
  },
  mudkip: {
    id: 'mudkip', dexNumber: 258, name: 'Gobou', types: ['eau'],
    baseStats: stats(50, 70, 50, 50, 50, 40), rarity: 'legendaire',
    range: 3, style: 'cac', movepool: ['charge', 'pistolet_a_o', 'morsure'],
    evolution: 'marshtomp', model: 'mudkip', height: 1.36,
  },

  // --- Épiques : les gros cogneurs sauvages
  geodude: {
    id: 'geodude', dexNumber: 74, name: 'Racaillou', types: ['roche', 'sol'],
    baseStats: stats(40, 80, 100, 30, 30, 20), rarity: 'epique',
    range: 4.8, style: 'zone', movepool: ['charge', 'jet_pierres', 'eclate_roc', 'ecras_face'],
    evolution: 'graveler', model: 'geodude', height: 0.5,
  },
  machop: {
    id: 'machop', dexNumber: 66, name: 'Machoc', types: ['combat'],
    baseStats: stats(70, 80, 50, 35, 35, 35), rarity: 'epique',
    range: 2.8, style: 'cac', movepool: ['eclate_roc', 'balayage', 'ecras_face', 'charge'],
    evolution: 'machoke', model: 'machop', height: 1.47,
  },

  // --- Rares : la faune ordinaire des routes
  zigzagoon: {
    id: 'zigzagoon', dexNumber: 263, name: 'Zigzaton', types: ['normal'],
    baseStats: stats(38, 30, 41, 30, 41, 60), rarity: 'rare',
    range: 3.4, style: 'cac', movepool: ['charge', 'morsure', 'vive_attaque'],
    evolution: 'linoone', model: 'zigzagoon', height: 0.7,
  },
  pidgey: {
    id: 'pidgey', dexNumber: 16, name: 'Roucool', types: ['normal', 'vol'],
    baseStats: stats(40, 45, 40, 35, 35, 56), rarity: 'rare',
    range: 9, style: 'unique', movepool: ['charge', 'tornade', 'vive_attaque'],
    evolution: 'pidgeotto', model: 'pidgey', height: 0.89,
  },
  rattata: {
    id: 'rattata', dexNumber: 19, name: 'Rattata', types: ['normal'],
    baseStats: stats(30, 56, 35, 25, 35, 72), rarity: 'rare',
    range: 3, style: 'cac', movepool: ['charge', 'morsure', 'vive_attaque'],
    evolution: 'raticate', model: 'rattata', height: 0.81,
  },

  // --- Normaux : les premières rencontres
  weedle: {
    id: 'weedle', dexNumber: 13, name: 'Aspicot', types: ['insecte', 'poison'],
    baseStats: stats(40, 35, 30, 20, 20, 50), rarity: 'normal',
    range: 6.8, style: 'ligne', movepool: ['piqure', 'dard_venin'],
    evolution: 'kakuna', model: 'weedle', height: 0.73,
  },
  caterpie: {
    id: 'caterpie', dexNumber: 10, name: 'Chenipan', types: ['insecte'],
    baseStats: stats(45, 30, 35, 20, 20, 45), rarity: 'normal',
    range: 4.2, style: 'zone', movepool: ['charge', 'piqure'],
    evolution: 'metapod', model: 'caterpie', height: 0.62,
  },
  wurmple: {
    id: 'wurmple', dexNumber: 265, name: 'Chenipotte', types: ['insecte'],
    baseStats: stats(45, 45, 35, 20, 30, 20), rarity: 'normal',
    range: 4.6, style: 'zone', movepool: ['charge', 'piqure', 'dard_venin'],
    evolution: 'silcoon', model: 'wurmple', height: 0.6,
  },
  poochyena: {
    id: 'poochyena', dexNumber: 261, name: 'Medhyèna', types: ['tenebres'],
    baseStats: stats(35, 55, 35, 30, 30, 35), rarity: 'normal',
    range: 3.2, style: 'cac', movepool: ['charge', 'morsure'],
    evolution: 'mightyena', model: 'poochyena', height: 1.29,
  },
};

/**
 * Un stade évolué.
 *
 * Il ne déclare que ce qui lui est propre — nom, numéro, types, stats du
 * Pokédex, et le rapport de taille par rapport à la base. Le style de frappe,
 * la portée, le movepool, la rareté et le modèle viennent de sa lignée : un
 * Grolem reste un lanceur de zone, avec un peu plus d'allonge.
 */
interface StadeEvolue {
  id: string;
  dexNumber: number;
  name: string;
  types?: [PokemonType] | [PokemonType, PokemonType];
  baseStats: BaseStats;
  /** Multiplicateur de taille, appliqué à la hauteur de la base. */
  taille: number;
  /** Stade suivant, s'il y en a un. */
  evolution?: string;
}

/**
 * Les lignées, dans l'ordre des stades.
 *
 * Trois espèces n'ont qu'une évolution (Rattata, Zigzaton, Medhyèna) : leur
 * palier 3 ne change donc pas de forme. Il débloque quand même l'ultime et
 * le gain de stats — sinon le dernier palier serait un piège pour ces trois.
 */
const LIGNEES: Record<string, StadeEvolue[]> = {
  bulbasaur: [
    { id: 'ivysaur', dexNumber: 2, name: 'Herbizarre', baseStats: stats(60, 62, 63, 80, 80, 60), taille: 1.25, evolution: 'venusaur' },
    { id: 'venusaur', dexNumber: 3, name: 'Florizarre', baseStats: stats(80, 82, 83, 100, 100, 80), taille: 1.7 },
  ],
  charmander: [
    { id: 'charmeleon', dexNumber: 5, name: 'Reptincel', baseStats: stats(58, 64, 58, 80, 65, 80), taille: 1.25, evolution: 'charizard' },
    { id: 'charizard', dexNumber: 6, name: 'Dracaufeu', types: ['feu', 'vol'], baseStats: stats(78, 84, 78, 109, 85, 100), taille: 1.6 },
  ],
  squirtle: [
    { id: 'wartortle', dexNumber: 8, name: 'Carabaffe', baseStats: stats(59, 63, 80, 65, 80, 58), taille: 1.25, evolution: 'blastoise' },
    { id: 'blastoise', dexNumber: 9, name: 'Tortank', baseStats: stats(79, 83, 100, 85, 105, 78), taille: 1.65 },
  ],
  treecko: [
    { id: 'grovyle', dexNumber: 253, name: 'Massko', baseStats: stats(50, 65, 45, 85, 65, 95), taille: 1.2, evolution: 'sceptile' },
    { id: 'sceptile', dexNumber: 254, name: 'Jungko', baseStats: stats(70, 85, 65, 105, 85, 120), taille: 1.5 },
  ],
  torchic: [
    { id: 'combusken', dexNumber: 256, name: 'Galifeu', types: ['feu', 'combat'], baseStats: stats(60, 85, 60, 85, 60, 55), taille: 1.25, evolution: 'blaziken' },
    { id: 'blaziken', dexNumber: 257, name: 'Braségali', types: ['feu', 'combat'], baseStats: stats(80, 120, 70, 110, 70, 80), taille: 1.55 },
  ],
  mudkip: [
    { id: 'marshtomp', dexNumber: 259, name: 'Flobio', types: ['eau', 'sol'], baseStats: stats(70, 85, 70, 60, 70, 50), taille: 1.3, evolution: 'swampert' },
    { id: 'swampert', dexNumber: 260, name: 'Laggron', types: ['eau', 'sol'], baseStats: stats(100, 110, 90, 85, 90, 60), taille: 1.65 },
  ],
  geodude: [
    { id: 'graveler', dexNumber: 75, name: 'Gravalanch', baseStats: stats(55, 95, 115, 45, 45, 35), taille: 1.4, evolution: 'golem' },
    { id: 'golem', dexNumber: 76, name: 'Grolem', baseStats: stats(80, 120, 130, 55, 65, 45), taille: 2.1 },
  ],
  machop: [
    { id: 'machoke', dexNumber: 67, name: 'Machopeur', baseStats: stats(80, 100, 70, 50, 60, 45), taille: 1.2, evolution: 'machamp' },
    { id: 'machamp', dexNumber: 68, name: 'Mackogneur', baseStats: stats(90, 130, 80, 65, 85, 55), taille: 1.35 },
  ],
  pidgey: [
    { id: 'pidgeotto', dexNumber: 17, name: 'Roucoups', baseStats: stats(63, 60, 55, 50, 50, 71), taille: 1.35, evolution: 'pidgeot' },
    { id: 'pidgeot', dexNumber: 18, name: 'Roucarnage', baseStats: stats(83, 80, 75, 70, 70, 101), taille: 1.7 },
  ],
  weedle: [
    { id: 'kakuna', dexNumber: 14, name: 'Coconfort', baseStats: stats(45, 25, 50, 25, 25, 35), taille: 1.15, evolution: 'beedrill' },
    { id: 'beedrill', dexNumber: 15, name: 'Dardargnan', baseStats: stats(65, 90, 40, 45, 80, 75), taille: 1.5 },
  ],
  caterpie: [
    { id: 'metapod', dexNumber: 11, name: 'Chrysacier', baseStats: stats(50, 20, 55, 25, 25, 30), taille: 1.15, evolution: 'butterfree' },
    { id: 'butterfree', dexNumber: 12, name: 'Papilusion', types: ['insecte', 'vol'], baseStats: stats(60, 45, 50, 90, 80, 70), taille: 1.7 },
  ],
  wurmple: [
    { id: 'silcoon', dexNumber: 266, name: 'Armulys', baseStats: stats(50, 35, 55, 25, 25, 15), taille: 1.1, evolution: 'beautifly' },
    { id: 'beautifly', dexNumber: 267, name: 'Charmillon', types: ['insecte', 'vol'], baseStats: stats(60, 70, 50, 100, 50, 65), taille: 1.6 },
  ],
  rattata: [
    { id: 'raticate', dexNumber: 20, name: 'Rattatac', baseStats: stats(55, 81, 60, 50, 70, 97), taille: 1.4 },
  ],
  zigzagoon: [
    { id: 'linoone', dexNumber: 264, name: 'Linéon', baseStats: stats(78, 70, 61, 50, 61, 100), taille: 1.6 },
  ],
  poochyena: [
    { id: 'mightyena', dexNumber: 262, name: 'Grahyèna', baseStats: stats(70, 90, 70, 60, 60, 70), taille: 1.35 },
  ],
};

/**
 * `model` référence un .glb de public/models, produit par
 * `npm run convert` depuis les assets Cobblemon.
 * `height` est mesurée sur le modèle converti, en blocs.
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
        // Un stade évolué garde la rareté de sa lignée : monter un palier en
        // manche ne doit pas changer ce que vaut l'exemplaire possédé.
        rarity: base.rarity,
        // Un peu plus d'allonge par stade, sans changer de rôle : une évolution
        // qui se mettrait à tirer de loin demanderait de la replacer.
        range: Math.round(base.range * (1 + 0.08 * (rang + 1)) * 10) / 10,
        style: base.style,
        movepool: base.movepool,
        evolution: stade.evolution ?? null,
        // Le .glb est celui de la base : les modèles des évolutions ne sont
        // pas convertis. La silhouette est donc juste mise à l'échelle.
        model: base.model,
        modeleProvisoire: true,
        height: Math.round(base.height * stade.taille * 100) / 100,
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

export const STARTER_CASES: StarterCase[] = [
  { id: 'kanto', region: 'Kanto', starters: ['bulbasaur', 'charmander', 'squirtle'] },
  { id: 'hoenn', region: 'Hoenn', starters: ['treecko', 'torchic', 'mudkip'] },
];

/** Starters de la valise ouverte par défaut. */
export const STARTER_IDS = STARTER_CASES[1]!.starters;

/** Espèces utilisées comme ennemis dans les vagues. */
export const ENEMY_IDS = ['rattata', 'pidgey', 'caterpie', 'weedle', 'zigzagoon', 'poochyena', 'wurmple', 'geodude', 'machop'] as const;

/**
 * Espèces qu'un joueur peut réellement posséder.
 *
 * Les stades évolués en sont exclus : on ne les obtient qu'en montant un
 * palier en manche, jamais au gacha. Les invoquer directement viderait les
 * paliers de leur intérêt.
 */
export const ESPECES_OBTENABLES = Object.keys(BASES);

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
