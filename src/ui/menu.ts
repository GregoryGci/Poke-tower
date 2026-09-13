/**
 * Menu principal.
 *
 * C'est le point fixe du jeu : on y revient après chaque manche, et c'est le
 * seul écran qu'on revoit des dizaines de fois.
 *
 * En haut, une bande étroite : le pseudo, la barre d'expérience du dresseur,
 * et les monnaies. Elle a remplacé une grande carte latérale qui portait en
 * plus le partenaire, la jauge de campagne et le rappel des commandes — trop
 * de choses, et surtout au mauvais endroit : les soldes s'y noyaient alors
 * qu'ils sont la première chose qu'on vient vérifier en rentrant d'une manche.
 *
 * En dessous, les destinations. Elles portaient chacune un glyphe, retiré
 * depuis : il répétait le titre sans rien préciser, et sur les cartes
 * illustrées il se disputait la place avec le bandeau. Les sections
 * verrouillées, elles, restent visibles — le joueur doit voir où mène sa
 * progression, pas découvrir des pans de jeu au compte-gouttes.
 *
 * L'écran se résout sur la destination choisie et se retire lui-même.
 */

import { getSpecies } from '@/data/content';
import { NIVEAUX, niveauParIndex, getMonde } from '@/data/campaign';
import { RAIDS, raidOuvert } from '@/data/raids';
import { CHAMPIONS, championOuvert } from '@/data/arene';
import { niveauDresseur } from '@/data/types';
import { pastillePokemon } from './pastille';
import { illustrationPortail } from './illustrations';
import { ouvrirReglages } from './reglages';
import type { PlayerAccount } from '@/data/types';

export type Destination =
  | 'arene'
  | 'histoire'
  | 'equipe'
  | 'collection'
  | 'armes'
  | 'invocation'
  | 'raid'
  | 'sac';

interface Carte {
  id: Destination;
  /** Glyphe de la destination. Une forme, pas une illustration. */
  glyphe: string;
  /** Identifiant d'illustration, quand la destination en a une. */
  illustration?: string;
  etiquette: string;
  titre: string;
  description: string;
  principale?: boolean;
  /**
   * Carte mise en avant, sous la principale.
   *
   * Une seule : c est ce qui lui donne sa valeur. L invocation la porte parce
   * que c'est la boucle du jeu — on joue pour des cristaux, on les dépense
   * ici, et une vignette parmi six ne le disait pas.
   */
  vedette?: boolean;
  /** Renvoie null si la destination est ouverte, sinon la raison du verrou. */
  verrou?(compte: PlayerAccount): string | null;
  pied?(compte: PlayerAccount): string;
}

const CARTES: Carte[] = [
  {
    id: 'histoire',
    glyphe: '⌖',
    etiquette: 'Mode principal',
    titre: 'Défendre la tour',
    description:
      'Kanto puis Johto, vingt lieux chacun, un boss tous les cinq. Chaque lieu a sa carte et son tracé.',
    principale: true,
    pied: (compte) => {
      const atteint = Math.min(compte.progression.storyLevel, NIVEAUX.length);
      const niveau = niveauParIndex(atteint);
      return `${getMonde(niveau.mondeId).nom} · ${niveau.nom}`;
    },
  },
  {
    id: 'equipe',
    glyphe: '⬢',
    etiquette: 'Composition',
    titre: 'Mon équipe',
    description:
      'Les six Pokémon que tu emmènes, leur auto-attaque, leur ultime, leurs traits et leurs sub-stats.',
    pied: (compte) => `${compte.team.length}/6 engagés`,
  },
  {
    id: 'invocation',
    glyphe: '◈',
    vedette: true,
    etiquette: 'Gacha',
    titre: 'Invocation',
    description: 'Dépense tes cristaux pour agrandir ton équipe.',
    pied: (compte) => `${compte.crystals} cristaux`,
  },
  {
    id: 'armes',
    glyphe: '✦',
    etiquette: 'Arsenal',
    titre: 'Armes',
    description:
      'Paliers, stat innée et sub-stats. C’est là que se travaille la puissance du dresseur.',
    pied: (compte) => {
      const portee = compte.weapons.find((arme) => arme.id === compte.equippedWeaponId);
      return portee ? `Équipée : +${portee.niveau}` : `${compte.weapons.length} en stock`;
    },
  },
  {
    id: 'collection',
    glyphe: '❑',
    etiquette: 'Pokédex',
    titre: 'Collection',
    description: 'Tout ce que tu possèdes : exemplaires, étoiles, lignées, stats de base.',
    pied: (compte) => {
      const especes = new Set(compte.roster.map((membre) => membre.speciesId)).size;
      return `${especes} espèce${especes > 1 ? 's' : ''}`;
    },
  },
  {
    id: 'sac',
    glyphe: '🎒',
    etiquette: 'Inventaire',
    titre: 'Sac',
    description:
      'Pierres d’évolution, bonbons d’expérience et objets à équiper. C’est ici qu’on les dépense.',
    pied: (compte) => {
      const consommables = compte.inventory.reduce((total, item) => total + item.quantity, 0);
      const objets = (compte.items ?? []).length;
      return `${consommables} consommable${consommables > 1 ? 's' : ''} · ${objets} objet${objets > 1 ? 's' : ''}`;
    },
  },
  {
    id: 'arene',
    glyphe: '⚔',
    etiquette: 'Compétitif',
    titre: 'Arène',
    description:
      'Six vagues d’affilée, une par Pokémon du champion — le sixième est son as. Aucun répit entre deux vagues.',
    verrou: (compte) => {
      const ouvert = CHAMPIONS.some((champion) =>
        championOuvert(champion, compte.progression.clearedLevels.length)
      );
      if (ouvert) return null;
      const prochain = Math.min(...CHAMPIONS.map((champion) => champion.requis));
      return `${prochain} lieux requis`;
    },
    pied: (compte) => {
      const battus = (compte.progression.championsVaincus ?? []).length;
      return `${battus}/${CHAMPIONS.length} badges`;
    },
  },
  {
    id: 'raid',
    glyphe: '◎',
    etiquette: 'Chasse',
    titre: 'Raids',
    description:
      'Des vagues renforcées, sans répit. Le seul endroit d’où tombent les pierres d’évolution.',
    verrou: (compte) => {
      const ouvert = RAIDS.some((raid) =>
        raidOuvert(raid, compte.progression.clearedLevels.length)
      );
      if (ouvert) return null;
      const prochain = Math.min(...RAIDS.map((raid) => raid.requis));
      return `${prochain} lieux requis`;
    },
    pied: (compte) =>
      `${RAIDS.filter((raid) => raidOuvert(raid, compte.progression.clearedLevels.length)).length}/${RAIDS.length} ouverts`,
  },
];

function elem<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  texte?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (texte !== undefined) node.textContent = texte;
  return node;
}

/**
 * Un solde du bandeau.
 *
 * `monnaie` colore le chiffre et lui donne son glyphe. Les objets — bonbons,
 * pierres — n'en portent pas : ce sont des stocks, pas des monnaies, et leur
 * donner la même couleur qu'un solde les ferait passer pour tel.
 */
function solde(etiquette: string, valeur: string, monnaie?: string): HTMLDivElement {
  const bloc = elem('div', 'mesure');
  if (monnaie) bloc.dataset['monnaie'] = monnaie;
  bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
  return bloc;
}

/** Affiche le menu et attend une destination ouverte. */
export function ouvrirMenu(compte: PlayerAccount): Promise<Destination> {
  const racine = elem('div', 'menu');
  const starter = compte.starterId ? getSpecies(compte.starterId).name : null;

  /* ---- Bande du dresseur : pseudo, expérience, monnaies ---- */

  const fiche = elem('header', 'menu-fiche');

  const identite = elem('div', 'fiche-identite');
  if (starter) identite.appendChild(pastillePokemon(compte.starterId!));
  const nom = elem('div');
  nom.append(
    elem('p', 'etiquette', 'Dresseur'),
    elem('h1', 'titre titre-m', compte.trainerName || 'Sans nom')
  );
  identite.appendChild(nom);

  // L'expérience du dresseur en jauge plutôt qu'en chiffres : c'est un
  // repère de temps passé, pas une valeur qu'on compare.
  const rang = niveauDresseur(compte.progression.dresseurXp ?? 0);
  const avancee = elem('div', 'fiche-avancee');
  const jauge = elem('div', 'jauge');
  const remplissage = elem('i');
  remplissage.style.width = `${rang.requis > 0 ? Math.min(100, (rang.xp / rang.requis) * 100) : 0}%`;
  jauge.appendChild(remplissage);
  avancee.append(
    elem('p', 'etiquette', `Niveau ${rang.niveau} — ${rang.xp} / ${rang.requis} XP`),
    jauge
  );

  // Les monnaies, toutes visibles d'un coup : c'est la première chose qu'on
  // regarde en rentrant d'une manche, et elles avaient disparu de cet écran.
  //
  // Deux monnaies, et deux seulement. Les pierres et les bonbons y figuraient
  // aussi : ce sont des stocks d'objets, pas des monnaies, et ils faisaient
  // grossir la bande d'une case à chaque nouvelle pierre ramassée. Ils ont
  // maintenant leur écran — le sac — où on peut les lire et s'en servir.
  //
  // La Master Ball reste affichée même à zéro, contrairement à avant : c'est
  // une monnaie qu'on cherche, et une case vide dit « il y en a une à
  // trouver » là où l'absence ne disait rien du tout.
  const soldes = elem('div', 'fiche-soldes');
  soldes.append(
    solde('Cristaux', String(compte.crystals), 'cristaux'),
    solde('Master Ball', String(compte.balls ?? 0), 'ball')
  );

  // Le rouage vit dans la bande du dresseur, à droite des monnaies : c'est le
  // seul endroit permanent de l'écran, donc le seul où on saura le retrouver.
  const reglages = elem('button', 'bouton-rouage');
  reglages.type = 'button';
  reglages.id = 'menu-reglages';
  reglages.title = 'Réglages et commandes';
  reglages.setAttribute('aria-label', 'Réglages et commandes');
  reglages.textContent = '⚙';
  reglages.addEventListener('click', () => void ouvrirReglages());

  fiche.append(identite, avancee, soldes, reglages);

  /* ---- Destinations ---- */

  const grille = elem('div', 'menu-grille');

  return new Promise<Destination>((resolve) => {
    const partir = (destination: Destination): void => {
      racine.style.transition = 'opacity .24s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(destination);
      }, 240);
    };

    for (const carte of CARTES) {
      const raison = carte.verrou?.(compte) ?? null;
      const bouton = elem(
        'button',
        `destination${carte.principale ? ' principale' : ''}${carte.vedette ? ' vedette' : ''}`
      );
      bouton.type = 'button';
      bouton.id = `menu-${carte.id}`;
      if (raison) bouton.setAttribute('aria-disabled', 'true');

      const haut = elem('div', 'destination-haut');
      const texte = elem('div');
      texte.append(
        elem('p', 'etiquette', carte.etiquette),
        elem('h2', 'destination-titre', carte.titre)
      );
      // Plus de glyphe : il doublait le titre sans rien ajouter, et sur les
      // cartes illustrées il entrait en concurrence avec le bandeau. Le
      // champ reste dans la table — il sert encore d'étiquette ailleurs.
      haut.append(texte);

      const pied = elem('div', 'destination-pied');
      if (raison) {
        pied.appendChild(elem('span', 'badge', raison));
      } else if (carte.pied) {
        pied.appendChild(elem('span', undefined, carte.pied(compte)));
      }

      const corps = elem('div');
      // L'illustration se pose en bandeau au-dessus du texte : sur une carte
      // de menu, un panorama recadré en vignette carrée ne montrerait qu'un
      // morceau de vortex.
      const dessin = carte.illustration ? illustrationPortail(carte.illustration) : null;
      if (dessin) {
        const image = elem('img', 'destination-bandeau');
        image.src = dessin;
        image.alt = '';
        image.decoding = 'async';
        corps.appendChild(image);
      }
      corps.append(elem('p', 'destination-desc', carte.description));

      bouton.append(haut, corps, pied);
      bouton.addEventListener('click', () => {
        if (raison) return;
        partir(carte.id);
      });
      grille.appendChild(bouton);
    }

    const corps = elem('div', 'menu-corps');
    corps.append(fiche, grille);

    const bas = elem('div', 'menu-bas');
    bas.appendChild(
      elem('span', undefined, 'Projet personnel non commercial — modèles Cobblemon, CC BY-NC 3.0.')
    );

    racine.append(corps, bas);
    document.body.appendChild(racine);
  });
}
