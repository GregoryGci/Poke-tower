/**
 * Tri et favoris des listes.
 *
 * Trois écrans listent des choses qu'on possède — l'équipe, la collection,
 * l'arsenal — et la même question s'y pose : retrouver un exemplaire précis
 * dans une liste qui ne cesse de grossir.
 *
 * Deux réponses, et elles se complètent. Le **favori** est un choix explicite
 * et permanent : ce qu'on a marqué reste en tête quel que soit le tri, parce
 * qu'un tri sert à explorer alors qu'un favori sert à revenir. Le **tri**, lui,
 * n'est pas sauvegardé : il répond à une question du moment.
 */

/** Une chose triable : un Pokémon possédé, ou une arme. */
export interface Favorisable {
  favori: boolean;
}

export interface OptionTri<T> {
  id: string;
  libelle: string;
  /** Comparateur, appliqué après le regroupement des favoris. */
  comparer(a: T, b: T): number;
}

/**
 * Trie une liste : favoris d'abord, puis le critère choisi.
 *
 * Le regroupement des favoris passe avant le comparateur et non après : un
 * favori relégué en bas par le tri courant serait invisible, et la marque
 * n'aurait plus d'objet.
 */
export function trier<T extends Favorisable>(
  liste: readonly T[],
  option: OptionTri<T> | undefined
): T[] {
  return [...liste].sort((a, b) => {
    if (a.favori !== b.favori) return a.favori ? -1 : 1;
    return option ? option.comparer(a, b) : 0;
  });
}

/**
 * Construit le sélecteur.
 *
 * Un `<select>` plutôt qu'une rangée de boutons : au-delà de trois critères,
 * les boutons mangent la largeur dont la liste a besoin.
 */
export function selecteurTri<T>(
  options: ReadonlyArray<OptionTri<T>>,
  courant: string,
  surChangement: (id: string) => void
): HTMLLabelElement {
  const etiquette = document.createElement('label');
  etiquette.className = 'tri';

  const texte = document.createElement('span');
  texte.className = 'etiquette';
  texte.textContent = 'Trier par';

  const champ = document.createElement('select');
  champ.className = 'tri-champ';
  champ.id = 'tri';
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.libelle;
    item.selected = option.id === courant;
    champ.appendChild(item);
  }
  champ.addEventListener('change', () => surChangement(champ.value));

  etiquette.append(texte, champ);
  return etiquette;
}

/**
 * Bouton de favori.
 *
 * L'étoile est pleine ou creuse, jamais absente : un bouton qui n'apparaît
 * qu'au survol se cherche.
 */
export function boutonFavori(
  actif: boolean,
  surClic: () => void,
  identifiant?: string
): HTMLButtonElement {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'favori';
  if (identifiant) bouton.id = identifiant;
  bouton.textContent = actif ? '★' : '☆';
  bouton.setAttribute('aria-pressed', String(actif));
  bouton.title = actif ? 'Retirer des favoris' : 'Mettre en favori';
  bouton.addEventListener('click', (evenement) => {
    // La vignette voisine est cliquable : sans cela, marquer un favori
    // sélectionnait aussi l'exemplaire.
    evenement.stopPropagation();
    surClic();
  });
  return bouton;
}
