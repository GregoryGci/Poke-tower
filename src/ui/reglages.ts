/**
 * Réglages.
 *
 * Pour l'instant, une seule chose à y mettre : les commandes. Elles vivaient
 * en bloc permanent sur le menu, ce qui coûtait un tiers de l'écran à une
 * information qu'on lit une fois. Derrière un rouage, elles restent
 * consultables sans encombrer.
 *
 * La liste est écrite à la main et **doit** suivre `core/input.ts` et
 * `render/scene.ts`. C'est le défaut assumé de la solution : un aide-mémoire
 * dérivé automatiquement demanderait que chaque touche porte son libellé, ce
 * qui alourdirait le code de jeu pour un écran qu'on ouvre rarement.
 */

interface Commande {
  touches: string[];
  quoi: string;
}

interface Groupe {
  titre: string;
  commandes: Commande[];
}

const GROUPES: Groupe[] = [
  {
    titre: 'Dresseur',
    commandes: [
      { touches: ['Z', 'Q', 'S', 'D'], quoi: 'Se déplacer, par rapport à ce que tu vois' },
      { touches: ['Clic gauche'], quoi: 'Aller au point cliqué' },
    ],
  },
  {
    titre: 'Caméra',
    commandes: [
      { touches: ['A', 'E'], quoi: 'Pivoter autour du dresseur' },
      { touches: ['Clic droit maintenu'], quoi: 'Pivoter à la souris' },
      { touches: ['Molette'], quoi: 'Rapprocher ou éloigner' },
      { touches: ['Clic milieu maintenu'], quoi: 'Faire glisser le terrain' },
      { touches: ['R'], quoi: 'Remettre la vue d’aplomb' },
      { touches: ['Espace'], quoi: 'Recoller la caméra au dresseur' },
    ],
  },
  {
    titre: 'Combat',
    commandes: [
      { touches: ['Clic gauche'], quoi: 'Poser le Pokémon choisi, ou ouvrir celui du terrain' },
      { touches: ['Clic droit'], quoi: 'Annuler la pose, ou refermer la fiche' },
    ],
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

/** Ouvre les réglages et rend la main à la fermeture. */
export function ouvrirReglages(): Promise<void> {
  const voile = elem('div', 'voile-reglages');
  const panneau = elem('div', 'reglages');

  const haut = elem('div', 'equipe-haut');
  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Commandes'),
    elem('h2', 'titre titre-m', 'Réglages')
  );
  const fermer = elem('button', 'bouton-discret', 'Fermer');
  fermer.type = 'button';
  fermer.id = 'reglages-fermer';
  haut.append(titre, fermer);
  panneau.appendChild(haut);

  for (const groupe of GROUPES) {
    const bloc = elem('div', 'reglages-groupe');
    bloc.appendChild(elem('p', 'etiquette', groupe.titre));
    for (const commande of groupe.commandes) {
      const ligne = elem('div', 'reglages-ligne');
      const touches = elem('div', 'reglages-touches');
      for (const touche of commande.touches) {
        touches.appendChild(elem('kbd', undefined, touche));
      }
      ligne.append(touches, elem('span', 'reglages-quoi', commande.quoi));
      bloc.appendChild(ligne);
    }
    panneau.appendChild(bloc);
  }

  voile.appendChild(panneau);
  document.body.appendChild(voile);
  fermer.focus();

  return new Promise<void>((resolve) => {
    const partir = (): void => {
      window.removeEventListener('keydown', surTouche);
      voile.style.transition = 'opacity .18s ease';
      voile.style.opacity = '0';
      setTimeout(() => {
        voile.remove();
        resolve();
      }, 180);
    };
    // Échap ferme : c'est le geste attendu d'une fenêtre posée par-dessus, et
    // l'oublier oblige à viser un bouton pour annuler un clic de curiosité.
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') partir();
    };
    window.addEventListener('keydown', surTouche);
    fermer.addEventListener('click', partir);
    voile.addEventListener('click', (evenement) => {
      if (evenement.target === voile) partir();
    });
  });
}
