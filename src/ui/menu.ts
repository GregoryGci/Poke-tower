/**
 * Menu principal.
 *
 * Quatre destinations, une seule mise en avant : jouer. Les autres restent
 * visibles même quand elles ne sont pas encore ouvertes — le joueur doit voir
 * où mène sa progression, pas découvrir des sections au compte-gouttes.
 *
 * L'écran se résout sur la destination choisie et se retire lui-même.
 */

import { getSpecies } from '@/data/content';
import type { PlayerAccount } from '@/data/types';

export type Destination = 'histoire' | 'equipe' | 'invocation' | 'raid';

interface Carte {
  id: Destination;
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
    etiquette: 'Mode principal',
    titre: 'Défendre la tour',
    description:
      'Trois vagues à contenir. Pose tes Pokémon le long de la route, déplace ton dresseur, et récolte les cristaux de ceux qui tombent.',
    principale: true,
    pied: (compte) => `Niveau ${compte.progression.storyLevel}`,
  },
  {
    id: 'equipe',
    etiquette: 'Collection',
    titre: 'Mon équipe',
    description: 'Attaques, traits et sub-stats de chaque Pokémon.',
    pied: (compte) => `${compte.roster.length} Pokémon`,
    // L'écran de détail reste à écrire : mieux vaut l'annoncer que renvoyer
    // le joueur au menu sans explication.
    verrou: () => 'Bientôt',
  },
  {
    id: 'invocation',
    etiquette: 'Gacha',
    titre: 'Invocation',
    description: 'Dépense tes cristaux pour agrandir ton équipe.',
    pied: (compte) => `${compte.crystals} cristaux`,
    verrou: (compte) => (compte.crystals >= 10 ? null : 'Dès 10 cristaux'),
  },
  {
    id: 'raid',
    etiquette: 'Coopération',
    titre: 'Raids à deux',
    description: 'Affronte des vagues renforcées avec un ami.',
    verrou: (compte) => (compte.progression.raidUnlocked ? null : 'Bientôt'),
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

function solde(etiquette: string, valeur: string): HTMLDivElement {
  const bloc = elem('div', 'mesure');
  bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
  return bloc;
}

/** Affiche le menu et attend une destination ouverte. */
export function ouvrirMenu(compte: PlayerAccount): Promise<Destination> {
  const racine = elem('div', 'menu');

  /* ---- En-tête ---- */

  const titre = elem('div');
  const starter = compte.starterId ? getSpecies(compte.starterId).name : null;
  titre.append(
    elem('p', 'etiquette', 'Poke Tower'),
    elem('h1', 'titre titre-xl', starter ? `Prêt, ${starter} t’attend` : 'Prêt à défendre')
  );

  const soldes = elem('div', 'menu-solde');
  soldes.append(
    solde('Cristaux', String(compte.crystals)),
    solde('Équipe', String(compte.roster.length)),
    solde('Niveau', String(compte.progression.storyLevel))
  );

  const haut = elem('div', 'menu-haut');
  haut.append(titre, soldes);

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

      const haut = elem('div');
      haut.append(
        elem('p', 'etiquette', carte.etiquette),
        elem('h2', 'destination-titre', carte.titre)
      );

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

    const bas = elem('div', 'menu-bas');
    bas.append(
      elem('span', undefined, 'Projet personnel non commercial — modèles Cobblemon, CC BY-NC 3.0.'),
      elem('span', undefined, starter ? `Partenaire de départ : ${starter}` : '')
    );

    racine.append(haut, grille, bas);
    document.body.appendChild(racine);
  });
}
