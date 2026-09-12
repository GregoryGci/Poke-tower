/**
 * Contenu de départ : espèces, attaques et traits.
 *
 * Les stats reprennent les vraies valeurs du Pokédex et les movepools ne
 * contiennent que des attaques réellement apprenables, comme demandé au brief.
 * Les hauteurs sont mesurées sur les modèles convertis, pas estimées.
 */

import type { Move, Species, Trait } from './types';

export const MOVES: Record<string, Move> = {
  charge: { id: 'charge', name: 'Charge', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 1 },
  griffe: { id: 'griffe', name: 'Griffe', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 0.9 },
  vive_attaque: { id: 'vive_attaque', name: 'Vive-Attaque', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 0.7 },
  ecras_face: { id: 'ecras_face', name: 'Écras’Face', type: 'normal', category: 'physique', power: 80, accuracy: 1, cooldown: 1.8 },
  morsure: { id: 'morsure', name: 'Morsure', type: 'tenebres', category: 'physique', power: 60, accuracy: 1, cooldown: 1.4 },
  fouet_lianes: { id: 'fouet_lianes', name: 'Fouet Lianes', type: 'plante', category: 'physique', power: 45, accuracy: 1, cooldown: 1.1 },
  tranch_herbe: { id: 'tranch_herbe', name: 'Tranch’Herbe', type: 'plante', category: 'special', power: 55, accuracy: 0.95, cooldown: 1.3 },
  flammeche: { id: 'flammeche', name: 'Flammèche', type: 'feu', category: 'special', power: 40, accuracy: 1, cooldown: 1 },
  pistolet_a_o: { id: 'pistolet_a_o', name: 'Pistolet à O', type: 'eau', category: 'special', power: 40, accuracy: 1, cooldown: 1 },
  piqure: { id: 'piqure', name: 'Piqûre', type: 'insecte', category: 'physique', power: 60, accuracy: 1, cooldown: 1.2 },
  dard_venin: { id: 'dard_venin', name: 'Dard-Venin', type: 'poison', category: 'physique', power: 15, accuracy: 1, cooldown: 0.6 },
  tornade: { id: 'tornade', name: 'Tornade', type: 'vol', category: 'special', power: 40, accuracy: 1, cooldown: 1 },
  jet_de_sable: { id: 'jet_de_sable', name: 'Jet de Sable', type: 'sol', category: 'statut', power: 0, accuracy: 1, cooldown: 2 },
  eclate_roc: { id: 'eclate_roc', name: 'Éclate-Roc', type: 'combat', category: 'physique', power: 40, accuracy: 1, cooldown: 1.1 },
  jet_pierres: { id: 'jet_pierres', name: 'Jet-Pierres', type: 'roche', category: 'physique', power: 50, accuracy: 0.9, cooldown: 1.3 },
  balayage: { id: 'balayage', name: 'Balayage', type: 'combat', category: 'physique', power: 60, accuracy: 1, cooldown: 1.5 },
};

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

/**
 * `model` référence un .glb de public/models, produit par
 * `npm run convert` depuis les assets Cobblemon.
 * `height` est mesurée sur le modèle converti, en blocs.
 */
export const SPECIES: Record<string, Species> = {
  // --- Starters
  bulbasaur: {
    id: 'bulbasaur', dexNumber: 1, name: 'Bulbizarre', types: ['plante', 'poison'],
    baseStats: { pv: 45, atk: 49, def: 49, atkSpe: 65, defSpe: 65, vitesse: 45 },
    range: 6, movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'dard_venin'],
    model: 'bulbasaur', height: 0.93,
  },
  charmander: {
    id: 'charmander', dexNumber: 4, name: 'Salamèche', types: ['feu'],
    baseStats: { pv: 39, atk: 52, def: 43, atkSpe: 60, defSpe: 50, vitesse: 65 },
    range: 5.5, movepool: ['griffe', 'flammeche', 'morsure', 'vive_attaque'],
    model: 'charmander', height: 1.31,
  },
  squirtle: {
    id: 'squirtle', dexNumber: 7, name: 'Carapuce', types: ['eau'],
    baseStats: { pv: 44, atk: 48, def: 65, atkSpe: 50, defSpe: 64, vitesse: 43 },
    range: 5.5, movepool: ['charge', 'pistolet_a_o', 'morsure', 'ecras_face'],
    model: 'squirtle', height: 1.19,
  },
  treecko: {
    id: 'treecko', dexNumber: 252, name: 'Arcko', types: ['plante'],
    baseStats: { pv: 40, atk: 45, def: 35, atkSpe: 65, defSpe: 55, vitesse: 70 },
    range: 6.5, movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'vive_attaque'],
    model: 'treecko', height: 1.53,
  },
  torchic: {
    id: 'torchic', dexNumber: 255, name: 'Poussifeu', types: ['feu'],
    baseStats: { pv: 45, atk: 60, def: 40, atkSpe: 70, defSpe: 50, vitesse: 45 },
    range: 5, movepool: ['griffe', 'flammeche', 'vive_attaque', 'ecras_face'],
    model: 'torchic', height: 1.51,
  },
  mudkip: {
    id: 'mudkip', dexNumber: 258, name: 'Gobou', types: ['eau'],
    baseStats: { pv: 50, atk: 70, def: 50, atkSpe: 50, defSpe: 50, vitesse: 40 },
    range: 5, movepool: ['charge', 'pistolet_a_o', 'morsure', 'jet_de_sable'],
    model: 'mudkip', height: 1.36,
  },

  // --- Espèces jouées comme ennemis
  rattata: {
    id: 'rattata', dexNumber: 19, name: 'Rattata', types: ['normal'],
    baseStats: { pv: 30, atk: 56, def: 35, atkSpe: 25, defSpe: 35, vitesse: 72 },
    range: 3, movepool: ['charge', 'morsure', 'vive_attaque'],
    model: 'rattata', height: 0.81,
  },
  pidgey: {
    id: 'pidgey', dexNumber: 16, name: 'Roucool', types: ['normal', 'vol'],
    baseStats: { pv: 40, atk: 45, def: 40, atkSpe: 35, defSpe: 35, vitesse: 56 },
    range: 5, movepool: ['charge', 'tornade', 'jet_de_sable'],
    model: 'pidgey', height: 0.89,
  },
  caterpie: {
    id: 'caterpie', dexNumber: 10, name: 'Chenipan', types: ['insecte'],
    baseStats: { pv: 45, atk: 30, def: 35, atkSpe: 20, defSpe: 20, vitesse: 45 },
    range: 2.5, movepool: ['charge', 'piqure'],
    model: 'caterpie', height: 0.62,
  },
  weedle: {
    id: 'weedle', dexNumber: 13, name: 'Aspicot', types: ['insecte', 'poison'],
    baseStats: { pv: 40, atk: 35, def: 30, atkSpe: 20, defSpe: 20, vitesse: 50 },
    range: 2.5, movepool: ['piqure', 'dard_venin'],
    model: 'weedle', height: 0.73,
  },
  zigzagoon: {
    id: 'zigzagoon', dexNumber: 263, name: 'Zigzaton', types: ['normal'],
    baseStats: { pv: 38, atk: 30, def: 41, atkSpe: 30, defSpe: 41, vitesse: 60 },
    range: 3, movepool: ['charge', 'morsure', 'jet_de_sable'],
    model: 'zigzagoon', height: 0.7,
  },
  poochyena: {
    id: 'poochyena', dexNumber: 261, name: 'Medhyèna', types: ['tenebres'],
    baseStats: { pv: 35, atk: 55, def: 35, atkSpe: 30, defSpe: 30, vitesse: 35 },
    range: 3, movepool: ['charge', 'morsure', 'jet_de_sable'],
    model: 'poochyena', height: 1.29,
  },
  wurmple: {
    id: 'wurmple', dexNumber: 265, name: 'Chenipotte', types: ['insecte'],
    baseStats: { pv: 45, atk: 45, def: 35, atkSpe: 20, defSpe: 30, vitesse: 20 },
    range: 2.5, movepool: ['charge', 'piqure', 'dard_venin'],
    model: 'wurmple', height: 0.6,
  },
  geodude: {
    id: 'geodude', dexNumber: 74, name: 'Racaillou', types: ['roche', 'sol'],
    baseStats: { pv: 40, atk: 80, def: 100, atkSpe: 30, defSpe: 30, vitesse: 20 },
    range: 4, movepool: ['charge', 'jet_pierres', 'eclate_roc', 'ecras_face'],
    model: 'geodude', height: 0.5,
  },
  machop: {
    id: 'machop', dexNumber: 66, name: 'Machoc', types: ['combat'],
    baseStats: { pv: 70, atk: 80, def: 50, atkSpe: 35, defSpe: 35, vitesse: 35 },
    range: 3.5, movepool: ['eclate_roc', 'balayage', 'ecras_face', 'charge'],
    model: 'machop', height: 1.47,
  },
};

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
