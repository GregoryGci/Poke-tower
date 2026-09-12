/**
 * Choix du raid.
 *
 * Un seul raid pour l'instant, et l'écran est volontairement minuscule : il
 * n'a qu'une chose à dire, ce que le raid fait tomber et à quel taux. Les
 * annoncer noir sur blanc est un choix — un taux de 12 % qu'on découvre après
 * quinze manches infructueuses se lit comme une arnaque, alors que le même
 * taux affiché d'avance se lit comme un pari.
 */

import { RAIDS, raidOuvert, type Raid } from '@/data/raids';
import { getPierre } from '@/data/pierres';
import { getMonde } from '@/data/campaign';
import type { PlayerAccount } from '@/data/types';

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

/** Affiche les raids et rend celui choisi, ou null si le joueur repart. */
export function ouvrirRaids(compte: PlayerAccount): Promise<Raid | null> {
  const faits = compte.progression.clearedLevels.length;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Chasse aux pierres'),
    elem('h1', 'titre titre-xl', 'Raids')
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'raids-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const liste = elem('div', 'raids-liste');

  return new Promise<Raid | null>((resolve) => {
    const partir = (raid: Raid | null): void => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(raid);
      }, 220);
    };

    for (const raid of RAIDS) {
      const ouvert = raidOuvert(raid, faits);
      const carte = elem('button', 'raid-carte');
      carte.type = 'button';
      carte.id = `raid-${raid.id}`;
      carte.disabled = !ouvert;
      carte.setAttribute('aria-disabled', String(!ouvert));

      const tete = elem('div', 'raid-tete');
      tete.append(
        elem('h2', 'destination-titre', raid.nom),
        elem('span', 'badge', ouvert ? getMonde(raid.mondeId).nom : `${raid.requis} lieux requis`)
      );

      const butin = elem('div', 'raid-butin');
      butin.appendChild(elem('p', 'etiquette', 'Butin possible, par manche gagnée'));
      for (const drop of raid.butin) {
        const modele = getPierre(drop.pierreId);
        if (!modele) continue;
        const ligne = elem('div', 'raid-drop');
        ligne.append(
          elem('span', 'raid-glyphe', modele.glyphe),
          elem('span', undefined, modele.name),
          elem('code', undefined, `${Math.round(drop.chance * 100)} %`)
        );
        butin.appendChild(ligne);
      }

      carte.append(tete, elem('p', 'destination-desc', raid.description), butin);
      carte.addEventListener('click', () => {
        if (!ouvert) return;
        partir(raid);
      });
      liste.appendChild(carte);
    }

    retour.addEventListener('click', () => partir(null));

    racine.append(haut, liste);
    document.body.appendChild(racine);
  });
}
