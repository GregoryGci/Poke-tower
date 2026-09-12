/**
 * Création du dresseur.
 *
 * Premier écran du jeu, et le seul qui demande quelque chose au joueur avant
 * de lui montrer quoi que ce soit. Il est donc réduit au strict nécessaire :
 * une question, un champ, un bouton.
 *
 * La question s'écrit à la machine, comme les dialogues des premiers jeux —
 * c'est là que la convention doit être posée, puisque c'est la première
 * phrase que le joueur lit.
 */

import { ecrire } from './typewriter';

/** Longueur maximale d'un nom. Les boîtes de dialogue GBA s'arrêtaient là. */
const NOM_MAX = 12;
const NOM_DEFAUT = 'Dresseur';

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
 * Demande son nom au joueur.
 *
 * Un nom vide est accepté et remplacé par un nom par défaut : refuser de
 * continuer parce qu'un champ est vide, sur le premier écran du jeu, coûte
 * plus que ça ne rapporte.
 */
export function demanderNomDresseur(): Promise<string> {
  const racine = elem('div', 'modale');
  const carte = elem('div', 'modale-carte');

  const entete = elem('div');
  entete.append(
    elem('p', 'etiquette', 'Nouvelle partie'),
    elem('h1', 'titre titre-l', 'Bienvenue')
  );

  const dialogue = elem('p', 'modale-dialogue');

  const champ = elem('input', 'champ');
  champ.type = 'text';
  champ.id = 'nom-dresseur';
  champ.maxLength = NOM_MAX;
  champ.placeholder = NOM_DEFAUT;
  champ.autocomplete = 'off';
  champ.spellcheck = false;

  const aide = elem('p', 'sous-titre', `${NOM_MAX} caractères au plus.`);

  const valider = elem('button', 'bouton bouton-primaire', 'Commencer');
  valider.type = 'button';
  valider.id = 'valider-nom';

  carte.append(entete, dialogue, champ, aide, valider);
  racine.appendChild(carte);
  document.body.appendChild(racine);

  ecrire(dialogue, 'Alors, comment t’appelles-tu ?', () => champ.focus());

  return new Promise<string>((resolve) => {
    const partir = (): void => {
      const nom = champ.value.trim() || NOM_DEFAUT;
      racine.style.transition = 'opacity .2s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(nom);
      }, 200);
    };

    valider.addEventListener('click', partir);
    champ.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter') partir();
    });
  });
}
