/**
 * Récolte automatique d'un lieu déjà maîtrisé.
 *
 * Elle s'ouvre quand un lieu a été tenu **sans perdre un seul point de vie**.
 * Le critère est volontairement strict : une victoire à neuf vies sur dix ne
 * l'ouvre pas. Un niveau qu'on a tenu parfaitement n'a plus rien à apprendre
 * au joueur et ne lui demande plus rien — le refaire à la main est du temps
 * pris, pas du jeu. Tant qu'il reste le moindre risque, en revanche, la
 * manche doit se jouer.
 *
 * Les gains ne sont pas simulés mais **calculés** à partir du niveau : la
 * simulation d'une manche entière coûterait des secondes de calcul pour
 * retomber, à la variance près, sur ce que ce module donne directement. Ils
 * sont volontairement un peu inférieurs à une bonne manche jouée — assez pour
 * que farmer reste utile, pas assez pour que jouer devienne une punition.
 */

import { vaguesDuNiveau } from '@/game/waves';
import type { Niveau } from './campaign';
import { ajouterBonbons, bonbonsDeManche } from './bonbons';
import { evoluerSiPossible } from './evolution';
import { ajouterXp, type PlayerAccount, type Species } from './types';
import { membresEquipe } from './team';

/**
 * Part des gains d'une manche jouée.
 *
 * À 0,8, dix récoltes valent huit manches. L'écart paie l'attention qu'on ne
 * donne pas.
 */
const RENDEMENT = 0.8;

/** Cristaux et expérience que ce lieu rapporte, hors aléa. */
function baremeDuNiveau(niveau: Niveau): { cristaux: number; xpParPokemon: number } {
  const vagues = vaguesDuNiveau(niveau);
  // On compte les ennemis réellement prévus plutôt que d'estimer : c'est la
  // même source que la manche jouée, donc les deux ne peuvent pas diverger.
  const ennemis = vagues.reduce(
    (total, vague) => total + vague.batches.reduce((somme, lot) => somme + lot.count, 0),
    0
  );

  // Reprend les primes du jeu : 3 cristaux par K.O., 12 par vague, 30 à la
  // victoire.
  const cristaux = Math.round((ennemis * 3 + vagues.length * 12 + 30) * RENDEMENT);
  // L'expérience suit le rang : un lieu tardif nourrit plus qu'un premier.
  const xpParPokemon = Math.round((60 + niveau.index * 26) * RENDEMENT);
  return { cristaux, xpParPokemon };
}

export interface Recolte {
  cristaux: number;
  xpParPokemon: number;
  /** Expérience versée au dresseur lui-même. */
  xpDresseur: number;
  bonbons: Array<{ id: string; quantite: number }>;
  /** Formes atteintes si des Pokémon ont évolué en chemin. */
  evolutions: Species[];
}

/**
 * Applique la récolte au compte.
 *
 * L'équipe engagée en profite, comme dans une manche jouée : c'est elle qui
 * aurait combattu. Les évolutions déclenchées sont renvoyées pour être
 * annoncées — une évolution ne doit jamais passer inaperçue, même quand on
 * n'a pas joué.
 */
export function recolter(
  compte: PlayerAccount,
  niveau: Niveau,
  rng: () => number = Math.random
): Recolte {
  const { cristaux, xpParPokemon } = baremeDuNiveau(niveau);

  compte.crystals += cristaux;

  const evolutions: Species[] = [];
  for (const membre of membresEquipe(compte)) {
    ajouterXp(membre, xpParPokemon);
    evolutions.push(...evoluerSiPossible(membre));
  }

  const bonbons = bonbonsDeManche(niveau.index, true, rng);
  for (const drop of bonbons) ajouterBonbons(compte, drop.id, drop.quantite);

  const xpDresseur = Math.round(xpParPokemon * 0.5);
  compte.progression.dresseurXp = (compte.progression.dresseurXp ?? 0) + xpDresseur;

  return { cristaux, xpParPokemon, xpDresseur, bonbons, evolutions };
}

/** Aperçu des gains, sans rien appliquer. Sert à l'afficher avant de valider. */
export function apercuRecolte(niveau: Niveau): { cristaux: number; xpParPokemon: number } {
  return baremeDuNiveau(niveau);
}
