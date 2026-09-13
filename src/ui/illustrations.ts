/**
 * Illustrations de portail.
 *
 * Un simple registre : identifiant de portail → fichier servi depuis
 * `public/`. Rien n'est dessiné ici, et c'est voulu — les illustrations sont
 * fournies, pas générées, et un module qui se contente de les nommer reste
 * juste quand on en ajoute une.
 *
 * Un portail sans illustration n'est pas une erreur : l'appelant retombe sur
 * son glyphe. Les deux coexisteront le temps que l'arsenal et les légendes
 * aient la leur.
 */

/**
 * Le format attendu : une bannière large, autour de 2:1.
 *
 * Ce n'est pas arbitraire — l'illustration du portail de base est un panorama
 * (1408 × 768) où les six Pokémon s'alignent de part et d'autre du vortex.
 * La recadrer en carré couperait la moitié du casting, qui est justement ce
 * que le portail promet. Les suivantes gagneront donc à garder ce cadrage.
 */
const ILLUSTRATIONS: Record<string, string> = {
  pokemon: 'illustrations/portail-pokemon.jpg',
};

/** Chemin de l'illustration d'un portail, ou null s'il n'en a pas encore. */
export function illustrationPortail(portail: string): string | null {
  return ILLUSTRATIONS[portail] ?? null;
}

/** Les portails illustrés — sert aux vérifications. */
export const PORTAILS_ILLUSTRES = Object.keys(ILLUSTRATIONS);
