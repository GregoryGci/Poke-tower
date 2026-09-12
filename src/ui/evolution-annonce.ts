/**
 * Annonces modales.
 *
 * Deux usages, un seul cadre : l'évolution d'un Pokémon, et le résultat d'une
 * action qui n'a pas eu lieu à l'écran — une récolte automatique, le butin
 * d'un raid.
 *
 * Pourquoi modal et bloquant : une évolution est l'événement le plus rare et
 * le plus attendu de la progression. La laisser passer en changeant
 * silencieusement un nom sur une fiche serait gâcher la seule récompense que
 * le joueur attend vraiment. Les jeux d'origine arrêtent l'écran pour ça.
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

/** Affiche une annonce et rend la main quand le joueur la referme. */
export function alerterInfo(
  etiquette: string,
  titre: string,
  lignes: readonly string[] = []
): Promise<void> {
  const voile = elem('div', 'evolution-voile');
  const carte = elem('div', 'evolution-carte');

  carte.append(elem('p', 'etiquette', etiquette), elem('h2', 'titre titre-l', titre));
  for (const ligne of lignes) {
    carte.appendChild(elem('p', 'sous-titre', ligne));
  }

  const fermer = elem('button', 'bouton bouton-primaire', 'Continuer');
  fermer.type = 'button';
  fermer.id = 'annonce-continuer';
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

/**
 * Annonce une ou plusieurs évolutions enchaînées.
 *
 * Une chaîne se lit en entier : un Chenipan nourri d'un coup passe par
 * Chrysacier avant Papilusion, et sauter l'étape donnerait l'impression d'un
 * bug.
 */
export function alerterEvolution(formes: readonly string[]): Promise<void> {
  if (!formes.length) return Promise.resolve();
  return alerterInfo(
    formes.length > 1 ? 'Évolutions' : 'Évolution',
    formes[formes.length - 1]!,
    formes.length > 1 ? [formes.join(' → ')] : []
  );
}
