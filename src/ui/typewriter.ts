/**
 * Texte qui s'égrène, comme les boîtes de dialogue Pokémon.
 *
 * L'effet ne sert pas qu'à décorer : il donne au texte un rythme de lecture,
 * et c'est une des choses qui identifient immédiatement l'univers. Il est donc
 * appliqué partout où un texte apparaît — consignes, messages, bilans.
 *
 * Trois précautions qui font la différence entre un gadget et un vrai confort :
 * un clic termine l'animation d'un coup, le conteneur réserve sa place finale
 * pour que rien ne saute autour, et `prefers-reduced-motion` affiche tout
 * immédiatement.
 */

/** Caractères par seconde. Calé sur le débit des jeux d'origine. */
const VITESSE = 42;

const reduit = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Typewriter {
  /** Affiche tout le texte sans attendre. */
  terminer(): void;
  /** Arrête l'animation et libère la frame demandée. */
  annuler(): void;
  readonly fini: boolean;
}

/**
 * Écrit `texte` dans `cible`, caractère par caractère.
 * Retourne une poignée pour accélérer ou interrompre.
 */
export function ecrire(cible: HTMLElement, texte: string, onFini?: () => void): Typewriter {
  cible.textContent = '';
  cible.dataset['ecrit'] = 'true';

  // Un doublon transparent réserve la hauteur finale : sans lui, le bloc
  // grandit au fil des caractères et pousse tout ce qui l'entoure.
  const fantome = document.createElement('span');
  fantome.className = 'typewriter-fantome';
  fantome.textContent = texte;
  fantome.setAttribute('aria-hidden', 'true');

  const visible = document.createElement('span');
  visible.className = 'typewriter-visible';

  cible.append(fantome, visible);

  let index = 0;
  let frame = 0;
  let debut = 0;
  let fini = false;

  const conclure = (): void => {
    if (fini) return;
    fini = true;
    visible.textContent = texte;
    cible.dataset['ecrit'] = 'false';
    cancelAnimationFrame(frame);
    onFini?.();
  };

  if (reduit() || texte.length === 0) {
    conclure();
    return { terminer: conclure, annuler: conclure, get fini() { return fini; } };
  }

  const pas = (maintenant: number): void => {
    if (fini) return;
    if (!debut) debut = maintenant;
    const voulu = Math.floor(((maintenant - debut) / 1000) * VITESSE);
    if (voulu > index) {
      index = Math.min(texte.length, voulu);
      visible.textContent = texte.slice(0, index);
    }
    if (index >= texte.length) {
      conclure();
      return;
    }
    frame = requestAnimationFrame(pas);
  };
  frame = requestAnimationFrame(pas);

  return {
    terminer: conclure,
    annuler(): void {
      fini = true;
      cancelAnimationFrame(frame);
      cible.dataset['ecrit'] = 'false';
    },
    get fini() {
      return fini;
    },
  };
}
