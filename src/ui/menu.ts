/**
 * Menu principal.
 *
 * C'est le point fixe du jeu : on y revient après chaque manche, et c'est le
 * seul écran qu'on revoit des dizaines de fois. Il est donc organisé autour
 * de deux choses et pas plus — **où on en est**, et **où on va**.
 *
 * À gauche, la carte du dresseur : le nom, le partenaire, les soldes, et
 * l'avancée de campagne sous forme de jauge. Ces chiffres étaient auparavant
 * alignés dans un bandeau au-dessus des destinations, où ils se lisaient comme
 * une barre d'outils alors que ce sont eux qu'on vient vérifier.
 *
 * À droite, les destinations. Chacune porte un glyphe : en pixel art, une
 * forme se reconnaît plus vite qu'un titre, et la grille se parcourt d'un
 * coup d'oeil une fois qu'on la connaît. Les sections verrouillées restent
 * visibles — le joueur doit voir où mène sa progression, pas découvrir des
 * pans de jeu au compte-gouttes.
 *
 * L'écran se résout sur la destination choisie et se retire lui-même.
 */

import { getSpecies } from '@/data/content';
import { NIVEAUX, niveauParIndex, getMonde } from '@/data/campaign';
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
      'Ton équipe affronte celle d’un autre dresseur, sans route ni vagues. Posé pour ne pas perdre l’idée : rien n’est encore jouable.',
    verrou: () => 'À construire',
  },
  {
    id: 'raid',
    glyphe: '◎',
    etiquette: 'Coopération',
    titre: 'Raids à deux',
    description: 'Affronte des vagues renforcées avec un ami.',
    verrou: (compte) => (compte.progression.raidUnlocked ? null : 'Bientôt'),
  },
];

/**
 * Rappel des commandes.
 *
 * Il vit dans le menu et non dans la manche : pendant une vague, personne ne
 * lit un pavé d'aide, et le tutoriel ne passe qu'une fois. C'est le seul
 * endroit où on peut revenir vérifier une touche au calme.
 */
const COMMANDES: Array<[string, string]> = [
  ['ZQSD', 'Déplacer le dresseur'],
  ['Clic', 'Aller là-bas, ou ouvrir un Pokémon posé'],
  ['A / E', 'Tourner la vue autour de soi'],
  ['Glisser', 'Tourner et zoomer'],
  ['R', 'Remettre la vue d’aplomb'],
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

function solde(etiquette: string, valeur: string): HTMLDivElement {
  const bloc = elem('div', 'mesure');
  bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
  return bloc;
}

/** Affiche le menu et attend une destination ouverte. */
export function ouvrirMenu(compte: PlayerAccount): Promise<Destination> {
  const racine = elem('div', 'menu');
  const starter = compte.starterId ? getSpecies(compte.starterId).name : null;

  /* ---- Carte du dresseur ---- */

  const fiche = elem('aside', 'menu-fiche');

  const identite = elem('div', 'fiche-identite');
  identite.append(
    elem('p', 'etiquette', 'Dresseur'),
    elem('h1', 'titre titre-l', compte.trainerName || 'Sans nom')
  );
  if (starter) {
    const pastille = elem('span', 'pastille', starter.slice(0, 1));
    pastille.dataset['type'] = getSpecies(compte.starterId!).types[0];
    const partenaire = elem('div', 'fiche-partenaire');
    partenaire.append(pastille, elem('span', undefined, `Partenaire : ${starter}`));
    identite.appendChild(partenaire);
  }

  const soldes = elem('div', 'fiche-soldes');
  soldes.append(
    solde('Cristaux', String(compte.crystals)),
    solde('Équipe', `${compte.team.length}/6`),
    solde('Collection', String(compte.roster.length))
  );

  // La campagne en jauge plutôt qu'en fraction : « 7/40 » demande de faire la
  // division soi-même pour savoir où on en est.
  const faits = compte.progression.clearedLevels.length;
  const avancee = elem('div', 'fiche-avancee');
  const jauge = elem('div', 'jauge');
  const remplissage = elem('i');
  remplissage.style.width = `${NIVEAUX.length ? (faits / NIVEAUX.length) * 100 : 0}%`;
  jauge.appendChild(remplissage);
  avancee.append(
    elem('p', 'etiquette', `Campagne — ${faits}/${NIVEAUX.length} lieux`),
    jauge
  );

  const commandes = elem('div', 'fiche-commandes');
  commandes.appendChild(elem('p', 'etiquette', 'Commandes'));
  for (const [touche, role] of COMMANDES) {
    const ligne = elem('div', 'commande');
    ligne.append(elem('kbd', undefined, touche), elem('span', undefined, role));
    commandes.appendChild(ligne);
  }

  fiche.append(identite, soldes, avancee, commandes);

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
