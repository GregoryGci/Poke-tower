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

/**
 * Rendement des récoltes successives d'un **même lieu**, dans la journée.
 *
 * Le vrai défaut n'était pas la vitesse ×3 : c'était qu'un lieu maîtrisé se
 * récoltait à l'infini au plein tarif. Cinquante clics sur le même niveau
 * rapportaient cinquante fois la même chose, ce qui en faisait mécaniquement
 * la meilleure stratégie du jeu — une stratégie qui consiste à ne pas jouer.
 *
 * Trois réponses étaient possibles, et le choix compte :
 *
 *  - une **énergie** qui se recharge : ça règle le problème, mais ça punit
 *    celui qui a envie de jouer deux heures d'affilée. C'est une mécanique de
 *    monétisation dans un jeu qui n'est pas monétisé ;
 *  - un **plafond dur** par jour : simple, mais il transforme le dernier clic
 *    autorisé en mur, et laisse le joueur devant un bouton mort ;
 *  - des **rendements décroissants**. Rien n'est jamais interdit, on peut
 *    toujours cliquer, mais la deuxième récolte du jour vaut 55 %, la
 *    troisième 30 %, et ça se stabilise à 10 %. Farmer le même lieu cesse
 *    d'être rentable **sans cesser d'être possible**, et la réponse naturelle
 *    devient d'aller récolter ailleurs — c'est-à-dire de faire tourner la
 *    campagne au lieu de marteler son premier niveau.
 *
 * Le dernier a été retenu. Le compteur est par lieu et par jour : douze lieux
 * maîtrisés donnent donc douze pleins tarifs quotidiens, ce qui récompense
 * d'avoir avancé plutôt que d'avoir cliqué.
 *
 * Mesuré : huit clics sur le même lieu rapportent 509 cristaux au lieu de
 * 1 672, soit 70 % de moins, pendant qu'un lieu voisin repart à 100 %.
 */
export const PALIERS_RECOLTE = [1, 0.55, 0.3, 0.18, 0.1] as const;

/** Le rendement de la n-ième récolte du jour, à partir de zéro. */
export function rendementRecolte(dejaFaites: number): number {
  const index = Math.min(dejaFaites, PALIERS_RECOLTE.length - 1);
  return PALIERS_RECOLTE[index] ?? PALIERS_RECOLTE[PALIERS_RECOLTE.length - 1]!;
}

/**
 * Le jour courant, en date locale.
 *
 * Locale et non UTC : le joueur vit dans son fuseau, et une remise à zéro à
 * une heure du matin serait incompréhensible. Le format suédois donne l'ISO —
 * c'est le raccourci habituel pour obtenir AAAA-MM-JJ sans assembler la
 * chaîne à la main.
 */
export function jourCourant(maintenant: Date = new Date()): string {
  return maintenant.toLocaleDateString('sv-SE');
}

/** Combien de fois ce lieu a déjà été récolté aujourd'hui. */
export function recoltesDuJour(compte: PlayerAccount, niveauId: string): number {
  const journal = compte.progression.recoltesDuJour;
  if (!journal || journal.jour !== jourCourant()) return 0;
  return journal.parLieu[niveauId] ?? 0;
}

/** Inscrit une récolte au journal du jour, en le remettant à zéro s'il a vieilli. */
function inscrireRecolte(compte: PlayerAccount, niveauId: string): void {
  const jour = jourCourant();
  const journal = compte.progression.recoltesDuJour;
  if (!journal || journal.jour !== jour) {
    compte.progression.recoltesDuJour = { jour, parLieu: { [niveauId]: 1 } };
    return;
  }
  journal.parLieu[niveauId] = (journal.parLieu[niveauId] ?? 0) + 1;
}

/** Cristaux et expérience que ce lieu rapporte, hors aléa et hors rendement. */
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
  /** Rendement appliqué, de 1 à 0,1 selon les récoltes déjà faites du jour. */
  rendement: number;
  /** Rang de cette récolte dans la journée, à partir de 1. */
  rang: number;
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
  const deja = recoltesDuJour(compte, niveau.id);
  const rendement = rendementRecolte(deja);
  const bareme = baremeDuNiveau(niveau);

  // Un cristal au minimum : une récolte qui ne rapporte littéralement rien se
  // lit comme un bouton cassé, pas comme un rendement qui s'épuise.
  const cristaux = Math.max(1, Math.round(bareme.cristaux * rendement));
  const xpParPokemon = Math.max(1, Math.round(bareme.xpParPokemon * rendement));

  compte.crystals += cristaux;

  const evolutions: Species[] = [];
  for (const membre of membresEquipe(compte)) {
    ajouterXp(membre, xpParPokemon);
    evolutions.push(...evoluerSiPossible(membre));
  }

  // Les bonbons suivent le même rendement, mais **en probabilité** : à 30 %,
  // une récolte sur trois en donne. Les rogner en quantité aurait donné des
  // lots de zéro bonbon, ce qui revient au même en moins lisible.
  const bonbons = rng() < rendement ? bonbonsDeManche(niveau.index, true, rng) : [];
  for (const drop of bonbons) ajouterBonbons(compte, drop.id, drop.quantite);

  const xpDresseur = Math.round(xpParPokemon * 0.5);
  compte.progression.dresseurXp = (compte.progression.dresseurXp ?? 0) + xpDresseur;

  inscrireRecolte(compte, niveau.id);

  return {
    cristaux,
    xpParPokemon,
    xpDresseur,
    bonbons,
    evolutions,
    rendement,
    rang: deja + 1,
  };
}

/**
 * Aperçu des gains, sans rien appliquer.
 *
 * Il tient compte des récoltes déjà faites : annoncer le plein tarif puis en
 * verser un dixième serait une tromperie, et c'est exactement le genre de
 * chose qui fait douter de tous les autres chiffres du jeu.
 */
export function apercuRecolte(
  compte: PlayerAccount,
  niveau: Niveau
): { cristaux: number; xpParPokemon: number; rendement: number; rang: number } {
  const deja = recoltesDuJour(compte, niveau.id);
  const rendement = rendementRecolte(deja);
  const bareme = baremeDuNiveau(niveau);
  return {
    cristaux: Math.max(1, Math.round(bareme.cristaux * rendement)),
    xpParPokemon: Math.max(1, Math.round(bareme.xpParPokemon * rendement)),
    rendement,
    rang: deja + 1,
  };
}
