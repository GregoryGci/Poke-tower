/**
 * Contenu de départ : espèces, attaques et traits.
 *
 * Volontairement réduit. Les stats suivent les vraies valeurs du Pokédex et
 * les movepools ne contiennent que des attaques réellement apprenables, comme
 * demandé au brief — c'est une base à étendre, pas une table définitive.
 */

import type { Move, Species, Trait } from './types';

export const MOVES: Record<string, Move> = {
  charge: { id: 'charge', name: 'Charge', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 1 },
  fouet_lianes: { id: 'fouet_lianes', name: 'Fouet Lianes', type: 'plante', category: 'physique', power: 45, accuracy: 1, cooldown: 1.1 },
  tranch_herbe: { id: 'tranch_herbe', name: "Tranch'Herbe", type: 'plante', category: 'special', power: 55, accuracy: 0.95, cooldown: 1.3 },
  flammeche: { id: 'flammeche', name: 'Flammèche', type: 'feu', category: 'special', power: 40, accuracy: 1, cooldown: 1 },
  pistolet_a_o: { id: 'pistolet_a_o', name: 'Pistolet à O', type: 'eau', category: 'special', power: 40, accuracy: 1, cooldown: 1 },
  griffe: { id: 'griffe', name: 'Griffe', type: 'normal', category: 'physique', power: 40, accuracy: 1, cooldown: 0.9 },
  morsure: { id: 'morsure', name: 'Morsure', type: 'tenebres', category: 'physique', power: 60, accuracy: 1, cooldown: 1.4 },
  piqure: { id: 'piqure', name: 'Piqûre', type: 'insecte', category: 'physique', power: 60, accuracy: 1, cooldown: 1.2 },
};

export const TRAITS: Trait[] = [
  { id: 'vue_percante', name: 'Vue perçante', rarity: 'rare', effect: { kind: 'range', percent: 15 } },
  { id: 'reflexes', name: 'Réflexes', rarity: 'rare', effect: { kind: 'cooldown', percent: 12 } },
  { id: 'muscle', name: 'Musclé', rarity: 'normal', effect: { kind: 'stat', stat: 'atk', percent: 8 } },
  { id: 'carapace', name: 'Carapace', rarity: 'normal', effect: { kind: 'stat', stat: 'def', percent: 10 } },
  { id: 'chasseur', name: 'Chasseur de primes', rarity: 'epique', effect: { kind: 'onKill', crystals: 1 } },
  { id: 'oeil_aigle', name: "Œil d'aigle", rarity: 'legendaire', effect: { kind: 'range', percent: 30 } },
];

/**
 * `model` référence un .glb dans public/models, produit par
 * `npm run convert` depuis les assets Cobblemon.
 */
export const SPECIES: Record<string, Species> = {
  treecko: {
    id: 'treecko', dexNumber: 252, name: 'Arcko', types: ['plante'],
    baseStats: { pv: 40, atk: 45, def: 35, atkSpe: 65, defSpe: 55, vitesse: 70 },
    range: 6, movepool: ['charge', 'fouet_lianes', 'tranch_herbe', 'griffe'],
    model: 'treecko', height: 1.5,
  },
  torchic: {
    id: 'torchic', dexNumber: 255, name: 'Poussifeu', types: ['feu'],
    baseStats: { pv: 45, atk: 60, def: 40, atkSpe: 70, defSpe: 50, vitesse: 45 },
    range: 5, movepool: ['charge', 'flammeche', 'griffe'],
    model: 'torchic', height: 1.3,
  },
  mudkip: {
    id: 'mudkip', dexNumber: 258, name: 'Gobou', types: ['eau'],
    baseStats: { pv: 50, atk: 70, def: 50, atkSpe: 50, defSpe: 50, vitesse: 40 },
    range: 5.5, movepool: ['charge', 'pistolet_a_o', 'morsure'],
    model: 'mudkip', height: 1.2,
  },
  // Espèces jouées comme ennemis dans la première vague.
  rattata: {
    id: 'rattata', dexNumber: 19, name: 'Rattata', types: ['normal'],
    baseStats: { pv: 30, atk: 56, def: 35, atkSpe: 25, defSpe: 35, vitesse: 72 },
    range: 3, movepool: ['charge', 'morsure'],
    model: 'rattata', height: 1,
  },
  weedle: {
    id: 'weedle', dexNumber: 13, name: 'Aspicot', types: ['insecte', 'poison'],
    baseStats: { pv: 40, atk: 35, def: 30, atkSpe: 20, defSpe: 20, vitesse: 50 },
    range: 2.5, movepool: ['piqure'],
    model: 'weedle', height: 0.9,
  },
  zigzagoon: {
    id: 'zigzagoon', dexNumber: 263, name: 'Zigzaton', types: ['normal'],
    baseStats: { pv: 38, atk: 30, def: 41, atkSpe: 30, defSpe: 41, vitesse: 60 },
    range: 3, movepool: ['charge', 'morsure'],
    model: 'zigzagoon', height: 1,
  },
};

/** Les trois starters proposés dans la valise d'ouverture. */
export const STARTER_IDS = ['treecko', 'torchic', 'mudkip'] as const;

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
