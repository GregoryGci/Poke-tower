/**
 * Annonce d'évolution.
 *
 * Une évolution est l'événement le plus rare et le plus attendu de la
 * progression : la laisser passer en changeant silencieusement un nom sur une
 * fiche serait gâcher la seule récompense que le joueur attend vraiment.
 *
 * L'annonce est volontairement modale et bloquante — elle interrompt, comme
 * dans les jeux d'origine, où l'écran s'arrête pour montrer la transformation.
 */

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

/** Affiche l'annonce et rend la main quand le joueur la referme. */
export function alerterEvolution(formes: readonly string[]): Promise<void> {
  if (!formes.length) return Promise.resolve();

  const voile = elem('div', 'evolution-voile');
  const carte = elem('div', 'evolution-carte');

  carte.append(
    elem('p', 'etiquette', formes.length > 1 ? 'Évolutions' : 'Évolution'),
    elem('h2', 'titre titre-l', formes[formes.length - 1]!)
  );

  // Une chaîne d'évolutions se lit en entier : un Chenipan nourri d'un coup
  // passe par Chrysacier avant Papilusion, et sauter l'étape donnerait
  // l'impression d'un bug.
  if (formes.length > 1) {
    carte.appendChild(elem('p', 'sous-titre', formes.join(' → ')));
  }

  const fermer = elem('button', 'bouton bouton-primaire', 'Continuer');
  fermer.type = 'button';
  fermer.id = 'evolution-continuer';
  carte.appendChild(fermer);

  voile.appendChild(carte);
  document.body.appendChild(voile);

  return new Promise<void>((resolve) => {
    fermer.addEventListener('click', () => {
      voile.remove();
      resolve();
    });
    fermer.focus();
  });
}
