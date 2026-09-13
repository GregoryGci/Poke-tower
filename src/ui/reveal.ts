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

/** Nombre de silhouettes distinctes dans le jeu de formes. */
const FORMES = 8;

/**
 * Retard entre deux cartes d'un tirage multiple, en millisecondes.
 *
 * Dix cartes qui apparaissent ensemble ne se lisent pas : l'oeil ne sait pas
 * où regarder et l'aura de la seule carte rare se noie dans le lot. En
 * cascade, chacune a son instant.
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

function elem<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Joue le defile puis rend la main.
 *
 * Le clic passe la sequence : une animation qu'on ne peut pas couper devient
 * une corvee des la dixieme invocation.
 */
export function defileOmbres(rarete: Rarity): Promise<() => void> {
  const duree = DUREE_DEFILE[rarete];

  const voile = elem('div', 'revelation');
  voile.dataset['rarete'] = rarete;

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

  piste.style.setProperty('--duree-defile', `${duree}ms`);
  voile.dataset['phase'] = 'defile';

  return new Promise<() => void>((resolve) => {
    let fini = false;

    const terminer = (): void => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      voile.removeEventListener('click', terminer);
      voile.dataset['phase'] = 'flash';
      // Le voile survit au flash : il sert de fond sombre a la carte revelee,
      // et c'est l'appelant qui decide quand le retirer.
      setTimeout(() => {
        voile.dataset['phase'] = 'revele';
        resolve(() => voile.remove());
      }, 220);
    };

    const minuteur = setTimeout(terminer, duree);
    voile.addEventListener('click', terminer);
  });
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
