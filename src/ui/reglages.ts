/**
 * Réglages.
 *
 * Deux choses : le rappel des commandes, et le son. Les commandes vivaient en
 * bloc permanent sur le menu, ce qui coûtait un tiers de l'écran à une
 * information qu'on lit une fois ; derrière un rouage, elles restent
 * consultables sans encombrer. Le volume les rejoint parce que c'est le seul
 * réglage du jeu, et qu'un écran de réglages sans volume n'en est pas un.
 *
 * La liste est écrite à la main et **doit** suivre `core/input.ts` et
 * `render/scene.ts`. C'est le défaut assumé de la solution : un aide-mémoire
 * dérivé automatiquement demanderait que chaque touche porte son libellé, ce
 * qui alourdirait le code de jeu pour un écran qu'on ouvre rarement.
 */

import { estMuet, reglerMuet, reglerVolume, volumeAudio } from '@/audio/moteur';
import { sonClic } from '@/audio/sons';

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

  /* ---- Le son ---- */

  const bloc = elem('div', 'reglages-groupe');
  bloc.appendChild(elem('p', 'etiquette', 'Son'));

  const ligneMuet = elem('div', 'reglages-ligne');
  const boutonMuet = elem('button', 'bouton-discret');
  boutonMuet.type = 'button';
  boutonMuet.id = 'reglages-muet';
  const majMuet = (): void => {
    boutonMuet.textContent = estMuet() ? 'Réactiver le son' : 'Couper le son';
    curseur.disabled = estMuet();
  };
  boutonMuet.addEventListener('click', () => {
    reglerMuet(!estMuet());
    majMuet();
    // Un retour sonore au moment où on réactive : sans lui, on ne sait pas si
    // le bouton a agi ou si le son était déjà coupé plus bas.
    if (!estMuet()) sonClic();
  });
  ligneMuet.append(boutonMuet, elem('span', 'reglages-quoi', 'Coupe tout, bruitages compris'));

  const ligneVolume = elem('div', 'reglages-ligne');
  const curseur = elem('input', 'reglages-curseur');
  curseur.type = 'range';
  curseur.id = 'reglages-volume';
  curseur.min = '0';
  curseur.max = '100';
  curseur.step = '5';
  curseur.value = String(Math.round(volumeAudio() * 100));
  const valeur = elem('span', 'reglages-quoi', `${curseur.value} %`);
  curseur.addEventListener('input', () => {
    reglerVolume(Number(curseur.value) / 100);
    valeur.textContent = `${curseur.value} %`;
  });
  // Le son d'essai part au relâchement et pas à chaque pas : en glissant, on
  // déclencherait vingt bips par seconde.
  curseur.addEventListener('change', () => sonClic());
  ligneVolume.append(curseur, valeur);

  bloc.append(ligneVolume, ligneMuet);
  panneau.appendChild(bloc);
  majMuet();

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
