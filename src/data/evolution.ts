/**
 * Évolution par l'expérience.
 *
 * Elle est **acquise et définitive**, comme dans les jeux d'origine : un
 * Pokémon qui atteint son niveau d'évolution change d'espèce pour de bon, et
 * sa fiche sauvegardée avec lui.
 *
 * C'est un changement de fond par rapport à la première version, où évoluer
 * était un achat en Poképièces valable le temps d'une manche. Le problème de
 * cette version-là n'était pas technique : une évolution qui disparaît à la
 * fin de la partie n'est pas une évolution, c'est un buff. Elle ne récompense
 * pas l'attachement à un exemplaire, qui est pourtant tout l'intérêt d'un jeu
 * où on collectionne.
 *
 * Les paliers de manche existent toujours et gardent leur rôle — de la
 * puissance achetée sous pression, et le déverrouillage de l'ultime — mais
 * ils ne touchent plus à l'espèce.
 */

import { getSpecies } from './content';
import type { OwnedPokemon, Species } from './types';

/**
 * Fait évoluer un exemplaire aussi loin que son niveau le permet.
 *
 * La boucle compte : un Pokémon qui gagne beaucoup de niveaux d'un coup —
 * une poignée de bonbons, une manche très rentable — doit franchir tous les
 * paliers qu'il a dépassés, pas seulement le premier. Un Chenipan nourri
 * jusqu'au niveau 12 sort Papilusion, pas Chrysacier.
 *
 * Renvoie la suite des formes traversées, dans l'ordre, ou un tableau vide si
 * rien n'a changé. L'appelant s'en sert pour l'annoncer.
 */
export function evoluerSiPossible(owned: OwnedPokemon): Species[] {
  const etapes: Species[] = [];

  for (;;) {
    const courante = getSpecies(owned.speciesId);
    const suite = courante.evolution;
    if (!suite || owned.level < suite.niveau) break;

    owned.speciesId = suite.into;
    etapes.push(getSpecies(suite.into));

    // Garde-fou : une lignée mal saisie qui bouclerait sur elle-même ferait
    // tourner le jeu à l'infini au moment d'un gain d'expérience.
    if (etapes.length > 8) break;
  }

  return etapes;
}

/**
 * Niveau auquel l'exemplaire évoluera, et vers quoi.
 *
 * Null quand la lignée est terminée. Sert à l'afficher sur la fiche : savoir
 * qu'il reste quatre niveaux avant Dracaufeu est ce qui donne envie de
 * dépenser un bonbon.
 */
export function prochaineEvolution(
  owned: OwnedPokemon
): { espece: Species; niveau: number; restant: number } | null {
  const suite = getSpecies(owned.speciesId).evolution;
  if (!suite) return null;
  return {
    espece: getSpecies(suite.into),
    niveau: suite.niveau,
    restant: Math.max(0, suite.niveau - owned.level),
  };
}
