/**
 * Écran d'invocation.
 *
 * Une seule action, et les taux affichés en permanence : le joueur doit
 * pouvoir vérifier ce qu'il achète avant de dépenser, pas après.
 *
 * L'écran modifie le compte — c'est le seul de l'interface à le faire — donc
 * il reçoit le gestionnaire et non une copie des données.
 */

import { COUT_INVOCATION, LIBELLE_RARETE, TAUX, invoquer } from '@/data/gacha';
import { getSpecies } from '@/data/content';
import type { AccountManager } from '@/save';
import type { OwnedPokemon, Rarity } from '@/data/types';

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

function carteResultat(owned: OwnedPokemon): HTMLDivElement {
  const species = getSpecies(owned.speciesId);
  const carte = elem('div', 'resultat');

  const pastille = elem('span', 'pastille', species.name.slice(0, 1));
  pastille.dataset['type'] = species.types[0];

  const rarete = elem('span', 'rarete', LIBELLE_RARETE[owned.rarity]);
  rarete.dataset['rarete'] = owned.rarity;

  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }

  carte.append(
    pastille,
    rarete,
    elem('div', 'resultat-nom', species.name),
    types,
    elem('p', 'sous-titre', `${owned.moves[0].name} · ${owned.traits[0].name}`)
  );
  return carte;
}

export function ouvrirInvocation(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-invocation');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Gacha'),
    elem('h1', 'titre titre-xl', 'Invocation')
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'invocation-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const scene = elem('div', 'invocation-scene');
  const capsule = elem('div', 'capsule', '?');
  const consigne = elem('p', 'sous-titre', `Chaque invocation coûte ${COUT_INVOCATION} cristaux.`);
  scene.append(capsule, consigne);

  const taux = elem('div', 'taux');
  for (const [rarete, part] of Object.entries(TAUX) as Array<[Rarity, number]>) {
    const ligne = elem('div', 'taux-ligne');
    ligne.append(
      elem('span', 'etiquette', LIBELLE_RARETE[rarete]),
      elem('b', undefined, `${(part * 100).toFixed(1)} %`)
    );
    taux.appendChild(ligne);
  }

  const invoquerBouton = elem('button', 'bouton bouton-primaire');
  invoquerBouton.type = 'button';
  invoquerBouton.id = 'invoquer';

  const pied = elem('div', 'invocation-pied');
  pied.append(taux, invoquerBouton);

  const majBouton = (): void => {
    const possible = compte.crystals >= COUT_INVOCATION;
    invoquerBouton.disabled = !possible;
    invoquerBouton.textContent = possible
      ? `Invoquer — ${COUT_INVOCATION} cristaux`
      : `Il te manque ${COUT_INVOCATION - compte.crystals} cristaux`;
  };
  majBouton();

  invoquerBouton.addEventListener('click', () => {
    if (compte.crystals < COUT_INVOCATION) return;
    compte.crystals -= COUT_INVOCATION;

    const obtenu = invoquer();
    compte.roster.push(obtenu);
    account.touch();

    scene.innerHTML = '';
    scene.append(
      carteResultat(obtenu),
      elem('p', 'sous-titre', `Il te reste ${compte.crystals} cristaux.`)
    );
    majBouton();
  });

  racine.append(haut, scene, pied);
  document.body.appendChild(racine);

  return new Promise<void>((resolve) => {
    retour.addEventListener('click', () => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve();
      }, 220);
    });
  });
}
