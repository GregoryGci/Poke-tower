/**
 * Revelation d'une invocation.
 *
 * Reprise de l'ecran d'evolution de Diamant/Perle : le sujet devient une
 * ombre, des dizaines d'autres ombres defilent par-dessus de plus en plus
 * vite, l'ecran blanchit, et le resultat tombe.
 *
 * Le defile ne sert a rien mecaniquement — c'est exactement son role. Il
 * separe la depense du resultat par quelques secondes d'attente tenue, et
 * c'est cette attente qui fait la recompense. La rarete ne change donc pas
 * seulement un libelle : elle change la duree, la couleur et le fracas de la
 * revelation.
 *
 * Le tirage multiple se joue **une carte a la fois**. La grille de dix cartes
 * qui tombaient en cascade montrait tout en une seconde et demie : le seul
 * legendaire du lot arrivait en meme temps que neuf normaux, et son aura se
 * noyait dans le tas.
 *
 * Une invocation, puis dix revelations. Le defile d'ombres ouvre la sequence
 * **une fois** — on paie une fois, on ouvre une fois — et les cartes se
 * succedent ensuite sans ceremonie repetee. Le rythme suit la rarete : les
 * communes s'enchainent toutes seules, un legendaire ou un prismatique
 * attend qu'on le regarde et recoit son eclat.
 *
 * Faute de sprites 2D, les ombres sont des formes CSS tirees d'un petit jeu
 * de silhouettes. On ne cherche pas a reconnaitre l'espece dans l'ombre — on
 * cherche la sensation du defile.
 */

import type { Rarity } from '@/data/types';

/** Ordre croissant : sert a choisir la rarete qui pilote la mise en scene. */
const POIDS: Record<Rarity, number> = {
  normal: 0,
  rare: 1,
  epique: 2,
  legendaire: 3,
  prismatique: 4,
};

/** Duree du defile, en millisecondes. Plus c'est rare, plus on fait attendre. */
const DUREE_DEFILE: Record<Rarity, number> = {
  normal: 900,
  rare: 1200,
  epique: 1600,
  legendaire: 2200,
  prismatique: 2900,
};

/**
 * Temps d'affichage d'une carte avant de passer a la suivante, en chaine.
 *
 * `null` veut dire : on attend un clic. Reserve aux deux paliers du haut —
 * un legendaire qui disparait tout seul au bout d'une seconde donne
 * l'impression d'avoir rate quelque chose.
 */
const MAINTIEN: Record<Rarity, number | null> = {
  normal: 700,
  rare: 900,
  epique: 1300,
  legendaire: null,
  prismatique: null,
};

/** Nombre de silhouettes distinctes dans le jeu de formes. */
const FORMES = 8;

/**
 * Retard entre deux cartes d'un tirage multiple, en millisecondes.
 *
 * Sert encore au recapitulatif de fin de chaine, ou les dix cartes
 * reapparaissent ensemble : les faire tomber l'une apres l'autre donne un
 * mouvement au lieu d'un pave.
 */
export const RETARD_CASCADE = 90;

/**
 * Applique la cascade à une grille de cartes déjà construite.
 *
 * Le retard est posé en variable CSS plutôt qu'en animation inline : la
 * feuille de style décide **quelle** animation joue selon la rareté, le code
 * décide seulement quand elle part.
 */
export function cascader(cartes: Iterable<HTMLElement>): void {
  let rang = 0;
  for (const carte of cartes) {
    carte.style.setProperty('--retard', `${rang * RETARD_CASCADE}ms`);
    rang += 1;
  }
}

export function rareteDominante(raretes: readonly Rarity[]): Rarity {
  let meilleure: Rarity = 'normal';
  for (const rarete of raretes) {
    if (POIDS[rarete] > POIDS[meilleure]) meilleure = rarete;
  }
  return meilleure;
}

/** Vrai pour les deux paliers qui meritent leur propre mise en scene. */
function estUnEvenement(rarete: Rarity): boolean {
  return POIDS[rarete] >= POIDS.legendaire;
}

function elem<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Le voile noir, sa piste d'ombres et son flash. Un seul pour toute une chaine. */
function creerVoile(): HTMLDivElement {
  const voile = elem('div', 'revelation');

  const piste = elem('div', 'revelation-piste');
  // Deux fois assez d'ombres pour que la bande reste pleine a pleine vitesse.
  for (let i = 0; i < 28; i++) {
    const ombre = elem('i', 'ombre');
    ombre.dataset['forme'] = String(i % FORMES);
    piste.appendChild(ombre);
  }

  const flash = elem('div', 'revelation-flash');
  const indice = elem('p', 'revelation-indice');
  indice.textContent = 'Clique pour passer';

  voile.append(piste, flash, indice);
  document.body.appendChild(voile);
  return voile;
}

/**
 * Joue un defile dans un voile existant, et rend la main a la revelation.
 *
 * Le voile est reutilise d'un tirage a l'autre : le detruire et le recreer
 * ferait clignoter le fond noir entre deux cartes de la chaine, ce qui casse
 * exactement le rythme qu'on cherche a installer.
 */
async function jouerDefile(
  voile: HTMLElement,
  rarete: Rarity,
  duree: number
): Promise<void> {
  const piste = voile.querySelector<HTMLElement>('.revelation-piste');
  voile.dataset['rarete'] = rarete;
  piste?.style.setProperty('--duree-defile', `${duree}ms`);

  // Les animations CSS sont relancees en retirant puis reposant la phase :
  // sans ce passage par `attente`, la piste garderait l'etat final du tirage
  // precedent et ne defilerait plus du tout.
  voile.dataset['phase'] = 'attente';
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  voile.dataset['phase'] = 'defile';

  await new Promise<void>((resolve) => {
    let fini = false;
    const terminer = (): void => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      voile.removeEventListener('click', terminer);
      voile.dataset['phase'] = 'flash';
      setTimeout(() => {
        voile.dataset['phase'] = 'revele';
        resolve();
      }, 220);
    };
    const minuteur = setTimeout(terminer, duree);
    voile.addEventListener('click', terminer);
  });
}

/**
 * Joue le defile puis rend la main.
 *
 * Le clic passe la sequence : une animation qu'on ne peut pas couper devient
 * une corvee des la dixieme invocation.
 */
export async function defileOmbres(rarete: Rarity): Promise<() => void> {
  const voile = creerVoile();
  await jouerDefile(voile, rarete, DUREE_DEFILE[rarete]);
  return () => voile.remove();
}

/**
 * Enveloppe : defile, puis affiche le contenu fourni sur le voile, puis
 * attend un clic du joueur.
 */
export async function revelation(
  rarete: Rarity,
  contenu: HTMLElement,
  libelleSuite = 'Continuer'
): Promise<void> {
  const fermer = await defileOmbres(rarete);
  const voile = contenu.ownerDocument.querySelector<HTMLElement>('.revelation');
  if (!voile) return;

  const scene = elem('div', 'revelation-scene');
  const suite = elem('button', 'bouton bouton-primaire');
  suite.type = 'button';
  suite.textContent = libelleSuite;
  suite.id = 'revelation-suite';

  scene.append(contenu, suite);
  voile.appendChild(scene);
  suite.focus();

  await new Promise<void>((resolve) => {
    suite.addEventListener('click', () => {
      voile.style.transition = 'opacity .18s ease';
      voile.style.opacity = '0';
      setTimeout(() => {
        fermer();
        resolve();
      }, 180);
    });
  });
}

/** Un tirage a reveler : sa rarete pilote la mise en scene, sa carte l'affichage. */
export interface EntreeChaine {
  rarete: Rarity;
  carte: HTMLElement;
  /** La meme carte, pour le recapitulatif : un noeud ne peut pas etre a deux endroits. */
  copie: HTMLElement;
}

/**
 * Revele un lot, une carte a la fois, puis montre le lot entier.
 *
 * Deux facons d'avancer, et c'est le coeur du rythme : les paliers bas
 * defilent tout seuls, les deux hauts attendent un clic. Un bouton « Tout
 * passer » coupe court a la sequence entiere — au dixieme x10, la mise en
 * scene qu'on ne peut pas sauter devient une punition.
 */
export async function revelationEnChaine(
  entrees: readonly EntreeChaine[],
  recapitulatif: (copies: HTMLElement[]) => HTMLElement,
  libelleFin = 'Continuer'
): Promise<void> {
  const voile = creerVoile();
  let passerTout = false;

  /**
   * L'invocation : **une seule**, en ouverture, puis les cartes défilent.
   *
   * Un défilé d'ombres avant chacune des dix cartes, c'était dix fois la même
   * cérémonie pour un geste unique — on paie une fois, on ouvre une fois. Et
   * le défilé est volontairement neutre : lui donner la couleur et la durée du
   * meilleur tirage du lot annoncerait le résultat avant de l'avoir montré.
   * La surprise appartient aux cartes.
   */
  await jouerDefile(voile, 'epique', DUREE_DEFILE.epique);

  const passer = elem('button', 'bouton-discret revelation-passer');
  passer.type = 'button';
  passer.id = 'revelation-passer';
  passer.textContent = 'Tout passer';
  passer.addEventListener('click', (evenement) => {
    // Sans cet arret, le clic traverse jusqu'au voile et compte aussi comme
    // « passer ce defile-ci » : le bouton sauterait deux cartes.
    evenement.stopPropagation();
    passerTout = true;
  });
  voile.appendChild(passer);

  const compteur = elem('p', 'revelation-compteur');
  voile.appendChild(compteur);

  for (let i = 0; i < entrees.length && !passerTout; i++) {
    const entree = entrees[i]!;
    compteur.textContent = `${i + 1} / ${entrees.length}`;
    compteur.hidden = entrees.length < 2;

    // La rareté de la carte courante pilote l'aura du voile : c'est elle qui
    // colore le cadre pendant qu'on la regarde.
    voile.dataset['rarete'] = entree.rarete;
    voile.dataset['phase'] = 'revele';

    const scene = elem('div', 'revelation-scene');
    scene.appendChild(entree.carte);
    // Les deux paliers du haut recoivent leur propre marque : la feuille de
    // style s'en sert pour l'eclat et le halo, sans quoi un legendaire
    // arriverait exactement comme un Chenipan.
    if (estUnEvenement(entree.rarete)) scene.dataset['evenement'] = entree.rarete;
    voile.appendChild(scene);

    const maintien = MAINTIEN[entree.rarete];
    if (maintien === null) {
      const suite = elem('button', 'bouton bouton-primaire');
      suite.type = 'button';
      suite.id = 'revelation-suite';
      suite.textContent = i + 1 < entrees.length ? 'Suivant' : libelleFin;
      scene.appendChild(suite);
      suite.focus();
      await new Promise<void>((resolve) => {
        suite.addEventListener('click', () => resolve());
        passer.addEventListener('click', () => resolve(), { once: true });
      });
    } else {
      await attendre(maintien);
    }

    scene.remove();
  }

  passer.remove();
  compteur.remove();

  /* ---- Le lot entier, pour qu'on puisse le relire ---- */

  voile.dataset['rarete'] = rareteDominante(entrees.map((e) => e.rarete));
  voile.dataset['phase'] = 'revele';

  const scene = elem('div', 'revelation-scene');
  const grille = recapitulatif(entrees.map((entree) => entree.copie));
  const suite = elem('button', 'bouton bouton-primaire');
  suite.type = 'button';
  suite.id = 'revelation-suite';
  suite.textContent = libelleFin;
  scene.append(grille, suite);
  voile.appendChild(scene);
  suite.focus();

  await new Promise<void>((resolve) => {
    suite.addEventListener('click', () => {
      voile.style.transition = 'opacity .18s ease';
      voile.style.opacity = '0';
      setTimeout(() => {
        voile.remove();
        resolve();
      }, 180);
    });
  });
}
