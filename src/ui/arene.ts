/**
 * Choix du champion.
 *
 * L'écran montre **les six Pokémon de chaque champion, à l'avance**. Ce n'est
 * pas une coquetterie : c'est la mécanique du mode. Ailleurs, une vague mêle
 * cinq espèces tirées d'un bestiaire et le joueur ne peut rien préparer ; ici
 * il sait exactement ce qui vient, et composer son équipe contre ces six-là
 * est le vrai geste de l'Arène.
 *
 * Les affinités sont donc affichées telles que le jeu les calcule — ce à quoi
 * l'équipe du champion est faible, ce qu'elle encaisse — et pas laissées à la
 * culture Pokémon du joueur. Un joueur qui connaît la table par coeur n'y
 * perd rien ; celui qui ne la connaît pas peut quand même jouer.
 */

import { CHAMPIONS, championOuvert, typesDuChampion, type Champion } from '@/data/arene';
import { analyseAffinites } from '@/data/affinites';
import { getSpecies } from '@/data/content';
import { pastillePokemon } from './pastille';
import type { PlayerAccount } from '@/data/types';

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

/** Affiche les champions et rend celui choisi, ou null si le joueur repart. */
export function ouvrirArene(compte: PlayerAccount): Promise<Champion | null> {
  const faits = compte.progression.clearedLevels.length;
  const vaincus = new Set(compte.progression.championsVaincus ?? []);
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Six vagues, aucun répit'),
    elem('h1', 'titre titre-xl', 'Arène')
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'arene-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const note = elem(
    'p',
    'affinites-vide',
    'Le champion envoie son équipe un par un, sans laisser souffler. Une seule vie : un de ses Pokémon qui atteint ta base met fin au défi. Tu connais les six d’avance — compose contre eux.'
  );

  const liste = elem('div', 'raids-liste');

  return new Promise<Champion | null>((resolve) => {
    const partir = (choix: Champion | null): void => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(choix);
      }, 220);
    };

    for (const champion of CHAMPIONS) {
      const ouvert = championOuvert(champion, faits);
      const carte = elem('div', 'raid-carte');
      carte.dataset['ouvert'] = String(ouvert);

      const tete = elem('div', 'raid-tete');
      const nom = elem('div');
      nom.append(
        elem('h2', 'destination-titre', champion.nom),
        elem('span', 'etiquette', champion.lieu)
      );
      const insigne = elem(
        'span',
        'badge',
        ouvert ? (vaincus.has(champion.id) ? 'Badge obtenu' : 'Défi ouvert') : `${champion.requis} lieux requis`
      );
      if (vaincus.has(champion.id)) insigne.dataset['gagne'] = 'true';
      tete.append(nom, insigne);
      carte.appendChild(tete);

      /* ---- Son équipe, dans l'ordre d'entrée ---- */

      const equipe = elem('div', 'arene-equipe');
      champion.equipe.forEach((speciesId, rang) => {
        const espece = getSpecies(speciesId);
        const membre = elem('div', 'arene-membre');
        // L'as se signale : c'est le sixième, et il arrive plus gros et plus
        // solide que les cinq autres.
        if (rang === champion.equipe.length - 1) membre.dataset['as'] = 'true';
        membre.append(pastillePokemon(speciesId));

        const texte = elem('div');
        texte.append(elem('b', undefined, espece.name));
        const types = elem('div', 'types');
        for (const type of espece.types) {
          const puce = elem('span', 'type', type);
          puce.dataset['type'] = type;
          types.appendChild(puce);
        }
        texte.appendChild(types);
        membre.appendChild(texte);
        equipe.appendChild(membre);
      });
      carte.appendChild(equipe);

      /* ---- Ce qui marche contre lui ---- */

      const analyse = analyseAffinites(typesDuChampion(champion));
      const conseil = elem('div', 'arene-conseil');
      const ligne = (etiquette: string, types: readonly string[]): void => {
        if (types.length === 0) return;
        const bloc = elem('div', 'raid-drop');
        const puces = elem('div', 'types');
        for (const type of types) {
          const puce = elem('span', 'type', type);
          puce.dataset['type'] = type;
          puces.appendChild(puce);
        }
        bloc.append(elem('span', 'etiquette', etiquette), puces);
        conseil.appendChild(bloc);
      };
      ligne('Frappe avec', analyse.faiblesses);
      ligne('Évite', analyse.resistances);
      carte.appendChild(conseil);

      const defier = elem('button', 'bouton bouton-primaire');
      defier.type = 'button';
      defier.id = `arene-${champion.id}`;
      defier.disabled = !ouvert;
      defier.textContent = ouvert ? `Défier ${champion.nom}` : 'Verrouillé';
      defier.addEventListener('click', () => {
        if (!ouvert) return;
        partir(champion);
      });
      carte.appendChild(defier);

      liste.appendChild(carte);
    }

    retour.addEventListener('click', () => partir(null));

    racine.append(haut, note, liste);
    document.body.appendChild(racine);
  });
}
