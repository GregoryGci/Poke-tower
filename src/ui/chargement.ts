/**
 * L'écran d'attente.
 *
 * Il est **déjà dans le document** quand ce module se charge : `index.html`
 * l'écrit en clair, avec son style en ligne. C'est volontaire et c'est tout
 * l'intérêt — un écran d'attente écrit dans un module ne s'affiche qu'une fois
 * le module téléchargé, exécuté, et la feuille de style appliquée, c'est-à-dire
 * précisément après l'attente qu'il est censé couvrir.
 *
 * Deux attentes à couvrir, mesurées avant d'écrire une ligne :
 *
 *  - le **démarrage** : une seconde et demie de page blanche en local, et
 *    bien davantage en ligne — le paquet pèse 38 Mo, dont 32 de modèles ;
 *  - l'**entrée en manche**, dont la durée dépend entièrement de ce qui est
 *    déjà en mémoire. Mesuré sur le paquet construit : 34 ms quand les modèles
 *    de l'équipe viennent d'être chargés par la vitrine des starters, mais
 *    plusieurs secondes pour un lieu dont le bestiaire est inconnu. Les quinze
 *    secondes que j'avais relevées étaient un artefact du serveur de
 *    développement, qui va chercher chaque module séparément.
 *
 * Le même bloc sert aux deux : il n'est jamais détruit, seulement montré et
 * caché. Le recréer à chaque manche rejouerait son animation d'entrée et
 * ferait clignoter l'écran entre deux parties.
 */

const voile = document.getElementById('demarrage');
const texte = document.getElementById('demarrage-texte');

let minuterieRetrait: number | null = null;
let minuterieApparition: number | null = null;

/**
 * Retard avant d'afficher, en millisecondes.
 *
 * Un chargement de trente-quatre millisecondes n'a pas besoin d'être annoncé :
 * l'écran d'attente n'y ferait qu'un clignotement, c'est-à-dire exactement le
 * défaut qu'il est censé corriger. En dessous de ce seuil, le joueur ne voit
 * rien du tout — et c'est le bon comportement, parce qu'il n'a rien attendu.
 */
const SEUIL_APPARITION = 250;

/**
 * Montre l'écran d'attente.
 *
 * `libelle` dit **ce qu'on attend** : « Chargement… » ne renseigne personne,
 * « Bourg Palette — préparation du terrain » dit au joueur sur quoi le jeu
 * travaille.
 *
 * L'affichage est **retardé** d'un quart de seconde, sauf si `immediat` est
 * vrai. Un chargement plus court que ça ne doit rien montrer du tout : mesuré
 * à 34 ms sur le paquet construit quand les modèles sont déjà en mémoire,
 * l'écran n'y ferait qu'un clignotement.
 */
export function montrerChargement(libelle: string, immediat = false): void {
  if (!voile) return;
  if (minuterieRetrait !== null) {
    clearTimeout(minuterieRetrait);
    minuterieRetrait = null;
  }
  if (texte) texte.textContent = libelle;

  const afficher = (): void => {
    minuterieApparition = null;
    voile.hidden = false;
    voile.classList.remove('parti');
  };

  if (immediat) {
    afficher();
    return;
  }
  if (minuterieApparition === null) {
    minuterieApparition = window.setTimeout(afficher, SEUIL_APPARITION);
  }
}

/**
 * Retire l'écran d'attente.
 *
 * Le fondu dure trois dixièmes de seconde ; on ne cache réellement le bloc
 * qu'après, sans quoi il resterait par-dessus le jeu, invisible mais capable
 * d'avaler les clics.
 */
export function cacherChargement(): void {
  // Une apparition encore en attente est simplement annulee : le chargement
  // s est termine avant le seuil, il n y a donc rien a montrer.
  if (minuterieApparition !== null) {
    clearTimeout(minuterieApparition);
    minuterieApparition = null;
  }
  if (!voile || voile.hidden) return;
  voile.classList.add('parti');
  minuterieRetrait = window.setTimeout(() => {
    voile.hidden = true;
    minuterieRetrait = null;
  }, 320);
}
