/**
 * Choix du raid et de sa difficulté.
 *
 * Deux décisions, dans cet ordre : où l'on va, puis à quel cran. La seconde
 * est la vraie — la composition de la vague ne change pas d'un cran à
 * l'autre, seuls les points de vie montent, et c'est donc là que se décide si
 * l'équipe tiendra.
 *
 * Les butins sont annoncés noir sur blanc, par difficulté. Un taux qu'on
 * découvre après quinze tentatives se lit comme une arnaque ; le même affiché
 * d'avance se lit comme un pari.
 */

import {
  BUTIN_PAR_DIFFICULTE,
  CHANCE_HAUTE,
  DIFFICULTES,
  LIBELLE_DIFFICULTE,
  RAIDS,
  VIE_PAR_DIFFICULTE,
  raidOuvert,
  type ChoixRaidComplet,
} from '@/data/raids';
import { getFamille } from '@/data/items';
import { getPierre } from '@/data/pierres';
import { LIBELLE_RARETE } from '@/data/gacha';
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

/** Ce qui sort de l'écran : un raid en solo, l'envie de jouer à deux, ou rien. */
export type SortieRaids = ChoixRaidComplet | 'coop' | null;

/** Affiche les raids et rend celui choisi, ou null si le joueur repart. */
export function ouvrirRaids(compte: PlayerAccount): Promise<SortieRaids> {
  const faits = compte.progression.clearedLevels.length;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Une seule vague, sans répit'),
    elem('h1', 'titre titre-xl', 'Raids')
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'raids-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const liste = elem('div', 'raids-liste');

  return new Promise<SortieRaids>((resolve) => {
    const partir = (choix: SortieRaids): void => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(choix);
      }, 220);
    };

    for (const raid of RAIDS) {
      const ouvert = raidOuvert(raid, faits);
      const carte = elem('div', 'raid-carte');
      carte.dataset['ouvert'] = String(ouvert);

      const tete = elem('div', 'raid-tete');
      tete.append(
        elem('h2', 'destination-titre', raid.nom),
        elem('span', 'badge', ouvert ? getMonde(raid.mondeId).nom : `${raid.requis} lieux requis`)
      );

      carte.append(tete, elem('p', 'destination-desc', raid.description));

      // Ce que le raid donne, indépendamment du cran : pierres, Master Ball.
      const famille = raid.familleItem ? getFamille(raid.familleItem) : null;
      if (famille) {
        const ligne = elem('div', 'raid-drop');
        ligne.append(
          elem('span', 'raid-glyphe', famille.glyphe),
          elem('span', undefined, `Un objet ${famille.nom} à chaque victoire`),
          elem('code', undefined, '100 %')
        );
        carte.appendChild(ligne);
      }
      for (const drop of raid.butin) {
        const modele = getPierre(drop.pierreId);
        if (!modele) continue;
        const ligne = elem('div', 'raid-drop');
        ligne.append(
          elem('span', 'raid-glyphe', modele.glyphe),
          elem('span', undefined, modele.name),
          elem('code', undefined, `${Math.round(drop.chance * 100)} %`)
        );
        carte.appendChild(ligne);
      }
      const ligneBall = elem('div', 'raid-drop');
      ligneBall.append(
        elem('span', 'raid-glyphe', '◉'),
        elem('span', undefined, 'Master Ball'),
        elem('code', undefined, `${Math.round(raid.chanceBall * 100)} %`)
      );
      carte.appendChild(ligneBall);

      /* ---- Les trois crans ---- */

      const crans = elem('div', 'raid-crans');
      for (const difficulte of DIFFICULTES) {
        const bouton = elem('button', 'raid-cran');
        bouton.type = 'button';
        bouton.id = `raid-${raid.id}-${difficulte}`;
        bouton.disabled = !ouvert;
        bouton.dataset['cran'] = difficulte;

        const paliers = BUTIN_PAR_DIFFICULTE[difficulte];
        // La rareté basse est la plus fréquente : on l'annonce en premier,
        // parce que c'est ce qu'on obtiendra le plus souvent.
        const butin = famille
          ? `${LIBELLE_RARETE[paliers[0]!]} · ${LIBELLE_RARETE[paliers[1]!]} à ${Math.round(CHANCE_HAUTE * 100)} %`
          : 'Pierres et Ball seulement';

        bouton.append(
          elem('b', undefined, LIBELLE_DIFFICULTE[difficulte]),
          elem('span', 'raid-vie', `PV ennemis ×${VIE_PAR_DIFFICULTE[difficulte]}`),
          elem('span', 'raid-butin-cran', butin)
        );
        bouton.addEventListener('click', () => {
          if (!ouvert) return;
          partir({ raid, difficulte });
        });
        crans.appendChild(bouton);
      }
      carte.appendChild(crans);

      liste.appendChild(carte);
    }

    // Les raids sont pensés pour être joués à plusieurs. La porte d'entrée est
    // ici, en haut, et non cachée derrière un cran de difficulté : c'est une
    // autre façon de jouer, pas une option du raid choisi.
    const coop = elem('button', 'bouton-primaire', 'Jouer à deux');
    coop.type = 'button';
    coop.id = 'raids-coop';
    coop.addEventListener('click', () => partir('coop'));

    const note = elem(
      'p',
      'affinites-vide',
      'Prévus pour être joués à plusieurs. En solo, « Facile » est le cran d’entrée.'
    );

    retour.addEventListener('click', () => partir(null));

    racine.append(haut, coop, note, liste);
    document.body.appendChild(racine);
  });
}
