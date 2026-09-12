/**
 * La pastille : l'identité visuelle d'un Pokémon ou d'une arme en vignette.
 *
 * Elle portait une lettre sur un fond coloré par type. Ça se lisait, mais ça
 * ne ressemblait à rien — sur une carte d'invocation, le sujet de la carte
 * n'était nulle part.
 *
 * Elle montre maintenant le vrai sujet : le portrait rendu depuis le modèle
 * 3D pour un Pokémon, un sprite dessiné au pixel pour une arme.
 *
 * **La lettre reste, et c'est important** : le portrait arrive de façon
 * asynchrone — il faut charger un .glb et faire un rendu — alors que la
 * vignette doit s'afficher tout de suite. La lettre est donc posée d'abord et
 * remplacée quand l'image est prête. Si le rendu échoue, elle reste : une
 * vignette dégradée vaut mieux qu'un trou.
 */

import { getSpecies } from '@/data/content';
import { portrait } from '@/render/portraits';
import { spriteArme } from './weapon-sprites';

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
 * Pastille d'un Pokémon.
 *
 * `classes` permet d'ajouter un modificateur de taille — les cartes de
 * révélation veulent un grand portrait, la barre d'unités une petite vignette.
 */
export function pastillePokemon(speciesId: string, classes = ''): HTMLSpanElement {
  const species = getSpecies(speciesId);
  const pastille = elem('span', `pastille${classes ? ' ' + classes : ''}`, species.name.slice(0, 1));
  pastille.dataset['type'] = species.types[0];

  void portrait(speciesId)
    .then((url) => {
      const image = elem('img', 'pastille-portrait');
      image.src = url;
      image.alt = species.name;
      // `decoding` et la largeur explicite évitent que la vignette saute de
      // taille au moment où l'image se pose.
      image.decoding = 'async';
      pastille.textContent = '';
      pastille.appendChild(image);
      pastille.dataset['portrait'] = 'true';
    })
    .catch(() => {
      // La lettre reste en place : voir l'en-tête du module.
    });

  return pastille;
}

/** Pastille d'une arme : le sprite, ou le symbole par défaut s'il manque. */
export function pastilleArme(weaponId: string, classes = ''): HTMLSpanElement {
  const pastille = elem('span', `pastille pastille-arme${classes ? ' ' + classes : ''}`);
  const sprite = spriteArme(weaponId);
  if (sprite) {
    const image = elem('img', 'pastille-portrait');
    image.src = sprite;
    image.alt = '';
    pastille.appendChild(image);
    pastille.dataset['portrait'] = 'true';
  } else {
    pastille.textContent = '✦';
  }
  return pastille;
}
