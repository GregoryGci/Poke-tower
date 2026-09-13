/**
 * Le catalogue des sons du jeu.
 *
 * Un nom par intention, jamais une fréquence dans le code appelant : quand on
 * décidera que poser un Pokémon sonne autrement, il y aura un seul endroit à
 * changer. C'est la même règle que pour les taux du gacha.
 *
 * La limitation de débit vit ici et pas dans le moteur, parce qu'elle dépend
 * du sens : cent impacts en deux secondes doivent être écrêtés, cent clics ne
 * le peuvent pas — un clic sans retour se lit comme un bouton mort.
 */

import { arpege, bip, jouerEchantillon, prechargerEchantillon, souffle } from './moteur';
import type { PokemonType, Rarity } from '@/data/types';

/**
 * Nos types vers ceux de Cobblemon.
 *
 * Le catalogue de sons est en anglais et n'a **pas** d'impact « normal » :
 * les dix-sept autres y sont, celui-là manque. On le rabat sur le combat, qui
 * est le choc le plus neutre du lot.
 */
const TYPE_COBBLEMON: Record<PokemonType, string> = {
  normal: 'fighting',
  feu: 'fire',
  eau: 'water',
  plante: 'grass',
  electrik: 'electric',
  glace: 'ice',
  combat: 'fighting',
  poison: 'poison',
  sol: 'ground',
  vol: 'flying',
  psy: 'psychic',
  insecte: 'bug',
  roche: 'rock',
  spectre: 'ghost',
  dragon: 'dragon',
  tenebres: 'dark',
  acier: 'steel',
  fee: 'fairy',
};

/** Trois variantes extraites par type. */
const VARIANTES_IMPACT = 3;

/**
 * Combien d'impacts par seconde, au maximum.
 *
 * Six Pokémon qui tirent sur cent ennemis produisent plusieurs dizaines de
 * touches par seconde. Toutes les jouer donne un grésillement continu où l'on
 * n'entend plus rien — ni les coups, ni le reste. Douze par seconde suffisent
 * à ce que l'oreille perçoive « ça tape fort » sans saturer.
 */
const IMPACTS_PAR_SECONDE = 12;
let creditImpacts = IMPACTS_PAR_SECONDE;
let dernierCredit = 0;

function impactAutorise(): boolean {
  const maintenant = performance.now();
  const ecoule = (maintenant - dernierCredit) / 1000;
  dernierCredit = maintenant;
  creditImpacts = Math.min(IMPACTS_PAR_SECONDE, creditImpacts + ecoule * IMPACTS_PAR_SECONDE);
  if (creditImpacts < 1) return false;
  creditImpacts -= 1;
  return true;
}

/** Un impact, de la couleur du type qui frappe. */
export function sonImpact(type: PokemonType): void {
  if (!impactAutorise()) return;
  const famille = TYPE_COBBLEMON[type] ?? 'fighting';
  const n = 1 + Math.floor(Math.random() * VARIANTES_IMPACT);
  jouerEchantillon(`sons/impacts/impact_generic_${famille}_${n}.ogg`, {
    gain: 0.32,
    variation: 2,
  });
}

/**
 * Le cri d'une espèce.
 *
 * Les légendaires n'en ont pas dans l'archive Cobblemon : l'appel est alors
 * sans effet, et c'est voulu — inventer un cri de synthèse pour Mewtwo
 * sonnerait faux à côté des vrais.
 */
export function sonCri(speciesId: string, gain = 0.5): void {
  jouerEchantillon(`sons/cris/${speciesId.replace('-', '_')}_cry.ogg`, { gain, variation: 1 });
}

/** Précharge le cri d'une espèce : à faire avant la manche, pas pendant. */
export function prechargerCri(speciesId: string): void {
  prechargerEchantillon(`sons/cris/${speciesId.replace('-', '_')}_cry.ogg`);
}

/* ---------- Interface ---------- */

export function sonClic(): void {
  bip({ frequence: 660, vers: 880, duree: 0.05, gain: 0.12 });
}

export function sonRetour(): void {
  bip({ frequence: 520, vers: 330, duree: 0.07, gain: 0.11 });
}

export function sonRefus(): void {
  bip({ frequence: 220, vers: 160, duree: 0.14, gain: 0.14, forme: 'sawtooth' });
}

export function sonOuverture(): void {
  arpege([523, 659, 784], { duree: 0.06, gain: 0.1, pas: 0.05 });
}

/* ---------- Manche ---------- */

/** Un Pokémon touche le sol : un choc sourd, puis son cri. */
export function sonPose(speciesId: string): void {
  souffle(0.14, 0.16, 900);
  setTimeout(() => sonCri(speciesId, 0.45), 120);
}

/** Le bond : une montee courte, rien de plus. */
export function sonSaut(): void {
  bip({ frequence: 440, vers: 760, duree: 0.09, gain: 0.1, forme: 'triangle' });
}

export function sonPalier(): void {
  arpege([523, 659, 784, 1046], { duree: 0.07, gain: 0.13, pas: 0.055 });
}

export function sonVagueLancee(): void {
  arpege([392, 330, 262], { duree: 0.12, gain: 0.14, forme: 'triangle', pas: 0.09 });
}

export function sonVagueTenue(): void {
  arpege([659, 784, 988], { duree: 0.09, gain: 0.13, pas: 0.06 });
}

/** Un ennemi passe : c'est une perte, ça doit se sentir. */
export function sonFuite(): void {
  bip({ frequence: 300, vers: 110, duree: 0.22, gain: 0.16, forme: 'sawtooth' });
}

export function sonVictoire(): void {
  arpege([523, 659, 784, 1046, 1318], { duree: 0.14, gain: 0.16, pas: 0.1 });
}

export function sonDefaite(): void {
  arpege([392, 330, 262, 196], { duree: 0.24, gain: 0.16, forme: 'triangle', pas: 0.16 });
}

/* ---------- Invocation ---------- */

/** Le défilé d'ombres : une montée qui ne se résout pas. */
export function sonDefile(): void {
  arpege([262, 330, 392, 523, 659], {
    duree: 0.1,
    gain: 0.1,
    forme: 'triangle',
    pas: 0.12,
  });
}

/**
 * La carte tombe. La rareté change la fanfare, et c'est tout le propos.
 *
 * Un commun reçoit une note, un prismatique un arpège qui monte sur deux
 * octaves. Sans cet écart, la mise en scène visuelle promettrait quelque
 * chose que l'oreille démentirait.
 */
export function sonRevelation(rarete: Rarity): void {
  if (rarete === 'normal') {
    bip({ frequence: 523, duree: 0.1, gain: 0.12 });
    return;
  }
  if (rarete === 'rare') {
    arpege([523, 784], { duree: 0.12, gain: 0.14, pas: 0.09 });
    return;
  }
  if (rarete === 'epique') {
    arpege([523, 659, 880], { duree: 0.14, gain: 0.15, pas: 0.09 });
    return;
  }
  if (rarete === 'legendaire') {
    souffle(0.3, 0.1, 2600);
    arpege([523, 659, 784, 1046, 1318], { duree: 0.18, gain: 0.17, pas: 0.11 });
    return;
  }
  // Prismatique : deux octaves, et un souffle dessous pour l'ampleur.
  souffle(0.5, 0.12, 3200);
  arpege([523, 659, 784, 1046, 1318, 1568, 2093], {
    duree: 0.2,
    gain: 0.18,
    pas: 0.1,
  });
}
