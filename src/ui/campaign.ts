/**
 * Choix du niveau.
 *
 * Quarante manches ne peuvent pas se jouer à l'aveugle depuis un bouton
 * « jouer » : le joueur doit voir où il en est, ce qui l'attend et ce qui lui
 * reste. La grille montre donc les vingt niveaux d'un monde d'un coup, avec
 * les boss marqués à leur place.
 *
 * Un niveau terminé reste rejouable. C'est volontaire : la campagne est aussi
 * la source de cristaux, et interdire de refaire un niveau facile obligerait à
 * farmer le plus dur — exactement l'inverse de ce qu'on veut.
 */

import {
  MONDES,
  NIVEAUX_PAR_MONDE,
  mondeOuvert,
  niveauxDuMonde,
  type Monde,
  type Niveau,
} from '@/data/campaign';
import type { PlayerAccount } from '@/data/types';
import { ecrire } from './typewriter';

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

const MARQUE: Record<Niveau['sorte'], string> = {
  normal: '',
  boss: '☠',
};

/**
 * Affiche la campagne et rend le niveau choisi, ou null si le joueur repart.
 */
export function ouvrirCampagne(compte: PlayerAccount): Promise<Niveau | null> {
  const atteint = compte.progression.storyLevel;
  const faits = new Set(compte.progression.clearedLevels);

  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  const compteur = elem('h1', 'titre titre-xl', 'Campagne');
  const sousEtiquette = elem('p', 'etiquette');
  titre.append(sousEtiquette, compteur);

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'campagne-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const onglets = elem('div', 'onglets');
  const grille = elem('div', 'campagne-grille');
  const pitch = elem('p', 'campagne-pitch');

  const corps = elem('div', 'campagne-corps');
  corps.append(onglets, pitch, grille);

  let mondeCourant: Monde = MONDES[0]!;

  return new Promise<Niveau | null>((resolve) => {
    const partir = (choix: Niveau | null): void => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(choix);
      }, 220);
    };

    const afficherMonde = (monde: Monde): void => {
      mondeCourant = monde;
      compteur.textContent = monde.nom;
      const faitsIci = niveauxDuMonde(monde.id).filter((n) => faits.has(n.id)).length;
      sousEtiquette.textContent = `Génération ${monde.generation} · ${faitsIci}/${NIVEAUX_PAR_MONDE} · ${faits.size} au total`;
      // La description s'écrit à la machine : c'est le seul texte de l'écran,
      // il peut se permettre d'être joué.
      ecrire(pitch, monde.sousTitre);

      for (const bouton of onglets.querySelectorAll('.onglet')) {
        bouton.setAttribute('aria-selected', String(bouton.id === `monde-${monde.id}`));
      }

      grille.innerHTML = '';
      for (const niveau of niveauxDuMonde(monde.id)) {
        const fait = faits.has(niveau.id);
        // Le prochain niveau est ouvert, jamais ceux d'après : sans cette
        // borne, un joueur curieux tomberait sur un boss du Mont Braise avec
        // son starter.
        const ouvert = niveau.index <= atteint;

        const case_ = elem('button', 'campagne-case');
        case_.type = 'button';
        case_.id = `niveau-${niveau.id}`;
        case_.dataset['sorte'] = niveau.sorte;
        case_.dataset['palier'] = String(niveau.palierBoss);
        case_.dataset['etat'] = ouvert ? (fait ? 'fait' : 'ouvert') : 'ferme';
        case_.disabled = !ouvert;
        case_.title = ouvert
          ? `${niveau.rang}. ${niveau.nom}${niveau.palierBoss ? ` · boss palier ${niveau.palierBoss}` : ''}${fait ? ' · terminé' : ''}`
          : 'Termine le niveau précédent';

        // Le lieu est le nom du niveau : c'est ce qui le rend memorable, alors
        // qu'un numero ne dit rien. Le rang reste, en petit, pour se reperer.
        case_.append(
          elem('span', 'campagne-rang', String(niveau.rang)),
          elem('span', 'campagne-lieu', ouvert ? niveau.nom : '???')
        );
        if (MARQUE[niveau.sorte]) {
          case_.appendChild(elem('span', 'campagne-marque', MARQUE[niveau.sorte]));
        }
        if (fait) case_.appendChild(elem('span', 'campagne-fait', '✓'));

        case_.addEventListener('click', () => partir(niveau));
        grille.appendChild(case_);
      }
    };

    for (const monde of MONDES) {
      const ouvert = mondeOuvert(monde.id, atteint);
      const onglet = elem('button', 'onglet', ouvert ? monde.nom : `${monde.nom} — verrouillé`);
      onglet.type = 'button';
      onglet.id = `monde-${monde.id}`;
      onglet.disabled = !ouvert;
      onglet.addEventListener('click', () => afficherMonde(monde));
      onglets.appendChild(onglet);
    }

    // On ouvre sur le monde où le joueur en est, pas sur le premier.
    const courant =
      MONDES.find((monde) => mondeOuvert(monde.id, atteint) && niveauxDuMonde(monde.id).some((n) => n.index >= atteint)) ??
      MONDES[0]!;
    afficherMonde(courant);
    void mondeCourant;

    retour.addEventListener('click', () => partir(null));

    racine.append(haut, corps);
    document.body.appendChild(racine);
  });
}
