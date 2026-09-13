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
 * En dessous, les destinations. Chacune porte un glyphe : en pixel art, une
 * forme se reconnaît plus vite qu'un titre, et la grille se parcourt d'un
 * coup d'oeil une fois qu'on la connaît. Les sections verrouillées restent
 * visibles — le joueur doit voir où mène sa progression, pas découvrir des
 * pans de jeu au compte-gouttes.
 *
 * L'écran se résout sur la destination choisie et se retire lui-même.
 */

import { getSpecies } from '@/data/content';
import { NIVEAUX, niveauParIndex, getMonde } from '@/data/campaign';
import { RAIDS, raidOuvert } from '@/data/raids';
import { pierresDisponibles } from '@/data/pierres';
import { bonbonsDisponibles } from '@/data/bonbons';
import { niveauDresseur } from '@/data/types';
import { pastillePokemon } from './pastille';
import type { PlayerAccount } from '@/data/types';

export type Destination =
  | 'arene'
  | 'histoire'
  | 'equipe'
  | 'collection'
  | 'armes'
  | 'invocation'
  | 'raid';

interface Carte {
  id: Destination;
  /** Glyphe de la destination. Une forme, pas une illustration. */
  glyphe: string;
  etiquette: string;
  titre: string;
  description: string;
  principale?: boolean;
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
    id: 'invocation',
    glyphe: '◈',
    etiquette: 'Gacha',
    titre: 'Invocation',
    description: 'Dépense tes cristaux pour agrandir ton équipe.',
    pied: (compte) => `${compte.crystals} cristaux`,
  },
  {
    id: 'arene',
    glyphe: '⚔',
    etiquette: 'Compétitif',
    titre: 'Arène',
    description:
      'Six vagues d’affilée, une par Pokémon du champion — le sixième est son ace. Pas de route, et aucun répit entre deux vagues.',
    verrou: () => 'À construire',
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
  const soldes = elem('div', 'fiche-soldes');
  soldes.append(solde('Cristaux', String(compte.crystals), 'cristaux'));
  // La Master Ball n'apparaît qu'une fois la première tombée : un solde à
  // zéro pour une monnaie qu'on ne sait pas encore obtenir n'est que du bruit.
  if ((compte.balls ?? 0) > 0) soldes.appendChild(solde('Master Ball', String(compte.balls), 'ball'));
  for (const { modele, quantite } of pierresDisponibles(compte)) {
    soldes.appendChild(solde(modele.name, String(quantite)));
  }
  const bonbons = bonbonsDisponibles(compte).reduce(
    (total, entree) => total + entree.item.quantity,
    0
  );
  if (bonbons > 0) soldes.appendChild(solde('Bonbons', String(bonbons)));

  fiche.append(identite, avancee, soldes);

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
      const bouton = elem('button', `destination${carte.principale ? ' principale' : ''}`);
      bouton.type = 'button';
      bouton.id = `menu-${carte.id}`;
      if (raison) bouton.setAttribute('aria-disabled', 'true');

      const haut = elem('div', 'destination-haut');
      const texte = elem('div');
      texte.append(
        elem('p', 'etiquette', carte.etiquette),
        elem('h2', 'destination-titre', carte.titre)
      );
      haut.append(texte, elem('span', 'destination-glyphe', carte.glyphe));

      const pied = elem('div', 'destination-pied');
      if (raison) {
        pied.appendChild(elem('span', 'badge', raison));
      } else if (carte.pied) {
        pied.appendChild(elem('span', undefined, carte.pied(compte)));
      }

      const corps = elem('div');
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
