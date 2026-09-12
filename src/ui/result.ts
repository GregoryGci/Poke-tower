/**
 * Bilan de fin de manche.
 *
 * Un seul écran pour les deux issues : ce qui change est le ton, pas la
 * structure. Le joueur veut d'abord savoir ce qu'il emporte, d'où les
 * chiffres avant le bouton.
 */

import type { GameStatus } from '@/game/game';
import { ecrire } from './typewriter';

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

function chiffre(etiquette: string, valeur: string): HTMLDivElement {
  const bloc = elem('div', 'bilan-chiffre');
  bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
  return bloc;
}

/** Affiche le bilan et attend que le joueur reparte. */
export function afficherBilan(status: GameStatus): Promise<void> {
  const victoire = status.outcome === 'victoire';

  const racine = elem('div', 'bilan');
  racine.dataset['issue'] = status.outcome;

  const carte = elem('div', 'bilan-carte');

  const entete = elem('div');
  entete.append(
    elem('p', 'etiquette', victoire ? 'Manche tenue' : 'Tour submergée'),
    elem('h2', 'bilan-titre', victoire ? 'La route est nette' : 'Ils sont passés')
  );

  const sous = elem('p', 'bilan-sous');
  const texteSous = victoire
    ? 'Aucune vague n’a franchi ta ligne. Les cristaux récoltés t’attendent au menu.'
    : 'Dix ennemis ont atteint le bout du chemin. Replace tes Pokémon et retente la manche.';

  const chiffres = elem('div', 'bilan-chiffres');
  chiffres.append(
    chiffre('Cristaux', String(status.crystals)),
    chiffre('Vagues', `${victoire ? status.totalWaves : status.wave - 1}/${status.totalWaves}`),
    chiffre('Vies', String(status.lives))
  );

  const bouton = elem('button', 'bouton bouton-primaire', 'Retour au menu');
  bouton.type = 'button';
  bouton.id = 'bilan-retour';

  carte.append(entete, sous, chiffres, bouton);
  racine.appendChild(carte);
  document.body.appendChild(racine);
  ecrire(sous, texteSous);
  bouton.focus();

  return new Promise<void>((resolve) => {
    bouton.addEventListener('click', () => {
      racine.style.transition = 'opacity .24s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve();
      }, 240);
    });
  });
}
