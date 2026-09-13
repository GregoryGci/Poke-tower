/**
 * L'Arène.
 *
 * Six vagues d'affilée, une par Pokémon du champion, **sans le moindre
 * répit**. Là où la campagne laisse souffler entre deux vagues — le temps de
 * poser, de monter un palier, de respirer — l'Arène enchaîne. C'est la seule
 * différence de forme, et elle change tout : on ne peut pas attendre la vague
 * suivante pour acheter, il faut décider pendant que ça passe.
 *
 * Chaque vague est **un seul adversaire**, pas une piétaille. Il est gros, il
 * est lent, il encaisse. Ce n'est plus un problème de débit mais de dégâts
 * par seconde, et surtout de **types** : un champion Feu balaie une équipe
 * Plante, et la même équipe le balaie s'il est de Plante lui-même.
 *
 * C'est là que la table des affinités prend enfin son sens. Ailleurs, une
 * vague mélange cinq espèces et le joueur ne peut rien préparer ; ici, il
 * connaît les six adversaires d'avance — l'écran les affiche — et composer
 * son équipe *contre eux* est le vrai geste du mode.
 */

import { getSpecies } from './content';
import type { Niveau } from './campaign';
import type { PokemonType } from './types';

export interface Champion {
  id: string;
  nom: string;
  /** Là où il tient son arène. Sert au titre de l'écran. */
  lieu: string;
  /** Spécialité annoncée : c'est contre elle qu'on compose son équipe. */
  type: PokemonType;
  /**
   * Ses six Pokémon, dans l'ordre où ils entrent.
   *
   * Le dernier est son as : c'est celui qui porte sa spécialité au plus haut,
   * et l'ordre monte. Un champion qui ouvrirait sur son meilleur n'aurait
   * plus rien à opposer ensuite.
   */
  equipe: readonly string[];
  /** Monde dont l'arène emprunte le décor. */
  mondeId: string;
  /** Lieux de campagne terminés pour qu'il accepte le défi. */
  requis: number;
  /** Dureté de base, avant la montée interne des six vagues. */
  rang: number;
}

/**
 * Les champions.
 *
 * Chaque équipe est bâtie **avec les espèces dont le jeu a le modèle**, et
 * pas d'après les jeux d'origine : un champion dont deux Pokémon sur six
 * n'auraient pas de modèle serait un champion à trous. C'est ce qui explique
 * les lignées complètes — trois stades d'une famille, trois d'une autre : à
 * types égaux, ce sont les seules combinaisons de six que le catalogue
 * permet aujourd'hui.
 *
 * L'ordre de la liste est l'ordre de difficulté. Le dernier n'a pas de
 * spécialité de type : c'est le Maître, et sa force est justement qu'on ne
 * peut pas préparer une seule réponse.
 */
export const CHAMPIONS: Champion[] = [
  {
    id: 'insecte',
    nom: 'Hector',
    lieu: 'Bois Brumeux',
    type: 'insecte',
    equipe: ['caterpie', 'weedle', 'metapod', 'kakuna', 'butterfree', 'beedrill'],
    mondeId: 'kanto',
    requis: 4,
    rang: 8,
  },
  {
    id: 'normal',
    nom: 'Alix',
    lieu: 'Plaine du Relais',
    type: 'normal',
    equipe: ['zigzagoon', 'rattata', 'pidgey', 'linoone', 'raticate', 'pidgeot'],
    mondeId: 'kanto',
    requis: 8,
    rang: 11,
  },
  {
    id: 'plante',
    nom: 'Flora',
    lieu: 'Serre d’Émeraude',
    type: 'plante',
    equipe: ['bulbasaur', 'treecko', 'ivysaur', 'grovyle', 'sceptile', 'venusaur'],
    mondeId: 'kanto',
    requis: 12,
    rang: 14,
  },
  {
    id: 'eau',
    nom: 'Ondine',
    lieu: 'Bassin du Rivage',
    type: 'eau',
    equipe: ['squirtle', 'mudkip', 'wartortle', 'marshtomp', 'swampert', 'blastoise'],
    mondeId: 'johto',
    requis: 16,
    rang: 17,
  },
  {
    id: 'combat',
    nom: 'Rocky',
    lieu: 'Carrière du Pic',
    type: 'combat',
    equipe: ['machop', 'geodude', 'machoke', 'graveler', 'golem', 'machamp'],
    mondeId: 'johto',
    requis: 20,
    rang: 20,
  },
  {
    id: 'feu',
    nom: 'Braise',
    lieu: 'Forge du Volcan',
    type: 'feu',
    equipe: ['charmander', 'torchic', 'charmeleon', 'combusken', 'blaziken', 'charizard'],
    mondeId: 'johto',
    requis: 26,
    rang: 24,
  },
  {
    id: 'maitre',
    nom: 'Le Maître',
    lieu: 'Salle du Conseil',
    // Le Maître est déclaré « dragon » parce qu'il faut bien annoncer quelque
    // chose, mais son équipe mêle quatre types : c'est le seul champion
    // contre lequel on ne peut pas préparer une réponse unique.
    type: 'dragon',
    equipe: ['absol', 'metagross', 'tyranitar', 'latios', 'salamence', 'garchomp'],
    mondeId: 'johto',
    requis: 32,
    rang: 28,
  },
];

export function getChampion(id: string): Champion | null {
  return CHAMPIONS.find((champion) => champion.id === id) ?? null;
}

/** Un champion accepte le défi quand assez de lieux sont tombés. */
export function championOuvert(champion: Champion, lieuxFaits: number): boolean {
  return lieuxFaits >= champion.requis;
}

/** Les types de chaque Pokémon du champion, pour que le joueur puisse préparer. */
export function typesDuChampion(champion: Champion): PokemonType[] {
  const vus = new Set<PokemonType>();
  for (const id of champion.equipe) {
    for (const type of getSpecies(id).types) vus.add(type);
  }
  return [...vus];
}

/**
 * Présente une arène comme un niveau.
 *
 * Même mécanique que pour les raids : l'identifiant porte le champion, donc
 * la carte est la même d'un défi à l'autre contre le même adversaire. On
 * apprend son terrain en même temps que son équipe.
 */
export function niveauDeLArene(champion: Champion): Niveau {
  return {
    id: `arene-${champion.id}`,
    mondeId: champion.mondeId,
    rang: champion.rang,
    index: champion.rang,
    sorte: 'boss',
    nom: `Arène — ${champion.nom}`,
    palierBoss: 6,
  };
}
