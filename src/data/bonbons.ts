/**
 * Bonbons d'expérience.
 *
 * L'expérience venait uniquement des manches, et seulement pour les six
 * Pokémon emmenés : un exemplaire gardé de côté ne progressait jamais, donc
 * n'évoluait jamais. Depuis que l'évolution est la récompense de
 * l'expérience, c'était devenu un cul-de-sac — on ne pouvait faire évoluer
 * que ce qu'on jouait déjà.
 *
 * Les bonbons débloquent ça : ils tombent en fin de manche et se donnent à
 * n'importe quel membre du roster, y compris à celui qui n'a jamais combattu.
 *
 * Ils vivent dans l'inventaire du compte, qui existait déjà et ne servait
 * jusqu'ici qu'au fragment stellaire des raids.
 */

import { ajouterXp, type OwnedPokemon, type PlayerAccount, type Species } from './types';
import { evoluerSiPossible } from './evolution';

export interface ModeleBonbon {
  id: string;
  name: string;
  /** Expérience donnée par unité. */
  xp: number;
  /** Poids relatif dans les drops de fin de manche. */
  poids: number;
}

/**
 * Trois tailles, et l'écart entre elles est volontairement large.
 *
 * Un petit bonbon est une monnaie d'appoint qu'on dépense sans réfléchir ; un
 * gros est une décision — il vaut plusieurs manches, et le donner à un
 * Pokémon veut dire ne pas le donner à un autre.
 */
export const BONBONS: ModeleBonbon[] = [
  { id: 'bonbon-petit', name: 'Bonbon', xp: 90, poids: 6 },
  { id: 'bonbon-gros', name: 'Super Bonbon', xp: 320, poids: 3 },
  { id: 'bonbon-max', name: 'Méga Bonbon', xp: 1000, poids: 1 },
];

export function getBonbon(id: string): ModeleBonbon | null {
  return BONBONS.find((bonbon) => bonbon.id === id) ?? null;
}

/** Bonbons réellement en stock, avec leur modèle. */
export function bonbonsDisponibles(
  compte: PlayerAccount
): Array<{ item: { id: string; quantity: number }; modele: ModeleBonbon }> {
  const out: Array<{ item: { id: string; quantity: number }; modele: ModeleBonbon }> = [];
  for (const modele of BONBONS) {
    const item = compte.inventory.find((candidat) => candidat.id === modele.id);
    if (item && item.quantity > 0) out.push({ item, modele });
  }
  return out;
}

/** Ajoute des bonbons à l'inventaire, en fusionnant avec la pile existante. */
export function ajouterBonbons(compte: PlayerAccount, id: string, quantite: number): void {
  const modele = getBonbon(id);
  if (!modele || quantite <= 0) return;
  const item = compte.inventory.find((candidat) => candidat.id === id);
  if (item) {
    item.quantity += quantite;
    return;
  }
  compte.inventory.push({ id, name: modele.name, rarity: 'normal', quantity: quantite });
}

export interface GainBonbon {
  ok: boolean;
  /** Niveaux pris. */
  niveaux: number;
  /** Formes traversées, s'il y a eu évolution. */
  evolutions: Species[];
}

/**
 * Donne un bonbon à un Pokémon.
 *
 * Atomique : soit le bonbon part de l'inventaire et l'expérience est
 * appliquée, soit rien ne bouge. L'évolution est déclenchée dans la foulée —
 * c'est le même geste pour le joueur, ça doit être la même opération.
 */
export function donnerBonbon(
  compte: PlayerAccount,
  owned: OwnedPokemon,
  bonbonId: string
): GainBonbon {
  const modele = getBonbon(bonbonId);
  const item = compte.inventory.find((candidat) => candidat.id === bonbonId);
  if (!modele || !item || item.quantity < 1) return { ok: false, niveaux: 0, evolutions: [] };

  item.quantity -= 1;
  if (item.quantity <= 0) {
    compte.inventory = compte.inventory.filter((candidat) => candidat !== item);
  }

  const niveaux = ajouterXp(owned, modele.xp);
  return { ok: true, niveaux, evolutions: evoluerSiPossible(owned) };
}

/**
 * Tire les bonbons rapportés par une manche.
 *
 * Le tirage est pondéré et dépend du rang du niveau : les premiers lieux
 * donnent surtout des petits bonbons, les derniers en donnent de gros. Sans
 * ça, farmer le niveau 1 serait le meilleur moyen de monter une équipe.
 */
export function bonbonsDeManche(
  rangNiveau: number,
  victoire: boolean,
  rng: () => number = Math.random
): Array<{ id: string; quantite: number }> {
  if (!victoire) return [];

  // Un à trois bonbons selon l'avancée, jamais zéro sur une victoire : une
  // manche gagnée doit toujours rapporter quelque chose de visible.
  const nombre = 1 + Math.floor(Math.min(2, rangNiveau / 14));
  const tirages = new Map<string, number>();

  for (let i = 0; i < nombre; i++) {
    // Le poids des gros bonbons monte avec le rang ; celui des petits reste
    // constant. Un lieu tardif ne cesse donc pas d'en donner, il en donne
    // simplement de meilleurs par-dessus.
    const pondere = BONBONS.map((bonbon) => ({
      bonbon,
      poids: bonbon.poids * (bonbon.xp > 100 ? 1 + rangNiveau / 20 : 1),
    }));
    const total = pondere.reduce((somme, entree) => somme + entree.poids, 0);
    let seuil = rng() * total;
    for (const entree of pondere) {
      seuil -= entree.poids;
      if (seuil <= 0) {
        tirages.set(entree.bonbon.id, (tirages.get(entree.bonbon.id) ?? 0) + 1);
        break;
      }
    }
  }

  return [...tirages.entries()].map(([id, quantite]) => ({ id, quantite }));
}
