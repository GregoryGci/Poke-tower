/**
 * Collection.
 *
 * « Mon équipe » ne pouvait plus faire les deux : choisir six Pokémon et
 * inventorier tout ce qu'on possède sont deux gestes différents, et la liste
 * complète noyait le choix. La collection prend donc l'inventaire, l'équipe
 * garde la sélection.
 *
 * Le regroupement se fait par espèce, pas par exemplaire : ce que le joueur
 * cherche ici, c'est combien il a de Salamèche — le nombre de doublons décide
 * de sa prochaine fusion.
 */

import { SPECIES, getSpecies } from '@/data/content';
import { LIBELLE_RARETE } from '@/data/gacha';
import {
  ETOILES_MAX,
  multiplicateurEtoiles,
  type OwnedPokemon,
  type PlayerAccount,
  type StatType,
} from '@/data/types';
import { STYLES } from '@/data/types';

const NOM_STAT: Record<StatType, string> = {
  pv: 'PV',
  atk: 'Attaque',
  def: 'Défense',
  atkSpe: 'Attaque Spé',
  defSpe: 'Défense Spé',
  vitesse: 'Vitesse',
};

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

interface Entree {
  speciesId: string;
  /** Exemplaires possédés, du meilleur au moins bon. */
  copies: OwnedPokemon[];
}

/**
 * Trie les exemplaires du plus abouti au moins abouti.
 *
 * Les étoiles passent devant le niveau : elles coûtent des doublons, donc
 * elles représentent l'investissement, alors que le niveau revient tout seul.
 */
function classer(copies: readonly OwnedPokemon[]): OwnedPokemon[] {
  return [...copies].sort(
    (a, b) => b.stars - a.stars || b.level - a.level || b.xp - a.xp
  );
}

/** L'inventaire complet, espèces possédées d'abord. */
function inventaire(compte: PlayerAccount): Entree[] {
  const parEspece = new Map<string, OwnedPokemon[]>();
  for (const membre of compte.roster) {
    const liste = parEspece.get(membre.speciesId);
    if (liste) liste.push(membre);
    else parEspece.set(membre.speciesId, [membre]);
  }

  const entrees: Entree[] = [];
  // On parcourt le Pokédex et non le roster : l'ordre reste stable, et les
  // espèces jamais obtenues apparaissent en silhouette a leur place.
  for (const speciesId of Object.keys(SPECIES)) {
    entrees.push({ speciesId, copies: classer(parEspece.get(speciesId) ?? []) });
  }
  return entrees.sort((a, b) => {
    if ((a.copies.length > 0) !== (b.copies.length > 0)) return a.copies.length ? -1 : 1;
    return getSpecies(a.speciesId).dexNumber - getSpecies(b.speciesId).dexNumber;
  });
}

function paire(gauche: string, droite: string): HTMLDivElement {
  const bloc = elem('div', 'paire');
  bloc.append(elem('b', undefined, gauche), elem('code', undefined, droite));
  return bloc;
}

function bloc(titre: string, contenu: HTMLElement): HTMLDivElement {
  const section = elem('div', 'bloc');
  const tete = elem('div', 'bloc-tete');
  tete.append(elem('p', 'etiquette', titre));
  section.append(tete, contenu);
  return section;
}

function etoiles(nombre: number, shiny: boolean, classe = 'etoiles'): HTMLDivElement {
  const rangee = elem('div', classe);
  for (let i = 1; i <= ETOILES_MAX; i++) {
    const etoile = elem('span', 'etoile', '★');
    etoile.dataset['pleine'] = String(i <= nombre);
    if (i === ETOILES_MAX && shiny) etoile.dataset['shiny'] = 'true';
    rangee.appendChild(etoile);
  }
  return rangee;
}

/** Panneau de droite : la fiche d'une espèce, possédée ou non. */
function remplirFiche(panneau: HTMLElement, entree: Entree): void {
  const species = getSpecies(entree.speciesId);
  panneau.innerHTML = '';

  const tete = elem('div', 'detail-tete');
  const identite = elem('div');
  identite.append(
    elem('p', 'etiquette', `N°${String(species.dexNumber).padStart(3, '0')}`),
    elem('h2', 'titre titre-m', species.name)
  );
  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }
  identite.appendChild(types);

  const compteur = elem('span', 'rarete');
  compteur.dataset['rarete'] = entree.copies[0]?.rarity ?? 'normal';
  compteur.textContent = entree.copies.length
    ? `×${entree.copies.length}`
    : 'Jamais obtenu';
  tete.append(identite, compteur);
  panneau.appendChild(tete);

  // Fiche de combat : c'est ce qui décide où l'on pose le Pokémon.
  const combat = elem('div', 'grille-paires');
  const style = STYLES[species.style];
  combat.append(
    paire('Style', style.libelle),
    paire('Portée', species.range.toFixed(1)),
    paire('Catégorie', species.style === 'cac' ? 'Corps à corps' : 'À distance')
  );
  panneau.appendChild(bloc('Comportement', combat));

  const base = elem('div', 'grille-paires');
  for (const [stat, valeur] of Object.entries(species.baseStats)) {
    base.appendChild(paire(NOM_STAT[stat as StatType], String(valeur)));
  }
  panneau.appendChild(bloc('Stats de base', base));

  if (!entree.copies.length) {
    panneau.appendChild(
      elem('p', 'sous-titre', 'Aucun exemplaire. Tente ta chance à l’invocation.')
    );
    return;
  }

  const copies = elem('div', 'collection-copies');
  for (const copie of entree.copies) {
    const ligne = elem('div', 'collection-copie');
    const gauche = elem('div', 'collection-copie-texte');
    const badge = elem('span', 'rarete', LIBELLE_RARETE[copie.rarity]);
    badge.dataset['rarete'] = copie.rarity;
    gauche.append(
      badge,
      elem('span', 'unite-detail', `Niveau ${copie.level} · stats ×${multiplicateurEtoiles(copie.stars).toFixed(2)}`)
    );
    ligne.append(gauche, etoiles(copie.stars, copie.shiny, 'vignette-etoiles'));
    copies.appendChild(ligne);
  }
  panneau.appendChild(bloc(`Exemplaires — ${entree.copies.length}`, copies));
}

/** Affiche la collection et rend la main au retour. */
export function ouvrirCollection(compte: PlayerAccount): Promise<void> {
  const entrees = inventaire(compte);
  const possedees = entrees.filter((entree) => entree.copies.length > 0).length;

  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Pokédex'),
    elem('h1', 'titre titre-xl', `Collection — ${possedees}/${entrees.length}`)
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'collection-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const liste = elem('div', 'collection-grille');
  const fiche = elem('div', 'equipe-detail');
  const corps = elem('div', 'equipe-corps');
  corps.append(liste, fiche);

  let choisie = entrees[0];

  const selectionner = (entree: Entree): void => {
    choisie = entree;
    for (const vignette of liste.querySelectorAll('.collection-vignette')) {
      vignette.setAttribute('aria-pressed', String(vignette.id === `collection-${entree.speciesId}`));
    }
    remplirFiche(fiche, entree);
  };

  for (const entree of entrees) {
    const species = getSpecies(entree.speciesId);
    const possede = entree.copies.length > 0;

    const vignette = elem('button', 'collection-vignette');
    vignette.type = 'button';
    vignette.id = `collection-${entree.speciesId}`;
    vignette.dataset['possede'] = String(possede);
    vignette.setAttribute('aria-pressed', String(choisie?.speciesId === entree.speciesId));

    const pastille = elem('span', 'pastille', possede ? species.name.slice(0, 1) : '?');
    if (possede) pastille.dataset['type'] = species.types[0];

    vignette.append(pastille, elem('span', 'collection-nom', species.name));
    if (entree.copies.length > 1) {
      vignette.appendChild(elem('span', 'collection-compte', `×${entree.copies.length}`));
    }
    const meilleure = entree.copies[0];
    if (meilleure) vignette.appendChild(etoiles(meilleure.stars, meilleure.shiny, 'vignette-etoiles'));

    vignette.addEventListener('click', () => selectionner(entree));
    liste.appendChild(vignette);
  }

  if (choisie) remplirFiche(fiche, choisie);

  racine.append(haut, corps);
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
