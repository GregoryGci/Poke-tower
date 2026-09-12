/**
 * Écran de choix du premier partenaire.
 *
 * Le joueur ouvre une valise de professeur — une par région — et choisit l'un
 * des trois Pokémon qu'elle contient. Les sujets sont rendus en 3D derrière
 * l'interface ; les cartes ne font que nommer et chiffrer ce qui est déjà
 * visible à l'écran.
 *
 * L'écran se résout sur l'identifiant d'espèce retenu, et rend la main.
 */

import { STARTER_CASES, getSpecies } from '@/data/content';
import type { Species, StatType } from '@/data/types';
import type { Showcase } from '@/render/showcase';

/** Valeur haute du Pokédex pour une stat de base, pour tracer les jauges. */
const STAT_MAX = 110;

const NOM_STAT: Record<StatType, string> = {
  pv: 'PV',
  atk: 'Attaque',
  def: 'Défense',
  atkSpe: 'Atq. Spé',
  defSpe: 'Déf. Spé',
  vitesse: 'Vitesse',
};

/** Les trois stats qui parlent le plus dans un tower defense. */
const STATS_MONTREES: StatType[] = ['atk', 'def', 'vitesse'];

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

function carteStarter(species: Species): HTMLButtonElement {
  const carte = elem('button', 'carte');
  carte.type = 'button';
  carte.id = `starter-${species.id}`;
  carte.setAttribute('aria-pressed', 'false');

  const tete = elem('div', 'carte-tete');
  tete.append(
    elem('span', 'carte-nom', species.name),
    elem('span', 'carte-dex', `N°${String(species.dexNumber).padStart(3, '0')}`)
  );

  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }

  const stats = elem('div', 'stats');
  for (const stat of STATS_MONTREES) {
    const ligne = elem('div', 'stat');
    const jauge = elem('div', 'jauge');
    const remplissage = elem('i');
    const valeur = species.baseStats[stat];
    remplissage.style.width = `${Math.min(100, (valeur / STAT_MAX) * 100)}%`;
    jauge.appendChild(remplissage);
    ligne.append(elem('span', undefined, NOM_STAT[stat]), jauge, elem('b', undefined, String(valeur)));
    stats.appendChild(ligne);
  }

  // Portée : c'est la donnée qui décide du placement, elle mérite sa ligne.
  const portee = elem('div', 'stat');
  const jaugePortee = elem('div', 'jauge');
  const remplissagePortee = elem('i');
  remplissagePortee.style.width = `${Math.min(100, (species.range / 8) * 100)}%`;
  jaugePortee.appendChild(remplissagePortee);
  portee.append(
    elem('span', undefined, 'Portée'),
    jaugePortee,
    elem('b', undefined, species.range.toFixed(1))
  );
  stats.appendChild(portee);

  carte.append(tete, types, stats);
  return carte;
}

export interface StarterChoice {
  speciesId: string;
  caseId: string;
}

/**
 * Affiche l'écran et attend le choix du joueur.
 * Le nœud DOM est retiré avant que la promesse ne se résolve.
 */
export function demanderStarter(showcase: Showcase): Promise<StarterChoice> {
  const racine = elem('div', 'ecran-starter');

  /* ---- Haut : titre et choix de la valise ---- */

  const haut = elem('div', 'starter-haut');
  const intro = elem('div');
  intro.append(
    elem('p', 'etiquette', 'Premier partenaire'),
    elem('h1', 'titre titre-xl', 'Choisis celui qui ouvrira la marche'),
    elem(
      'p',
      'sous-titre',
      'Il défendra ta première tour. Les autres se débloqueront par invocation — celui-ci est offert.'
    )
  );

  const selecteur = elem('div', 'selecteur');
  selecteur.setAttribute('role', 'tablist');
  selecteur.setAttribute('aria-label', 'Valise du professeur');

  // Le selecteur de valise ne s'affiche que s'il y a plusieurs regions.
  // Avec une seule, un onglet unique n'est pas un choix : c'est un bouton qui
  // ne fait rien, sur le premier ecran du jeu.
  haut.appendChild(intro);
  if (STARTER_CASES.length > 1) haut.appendChild(selecteur);

  /* ---- Bas : cartes et validation ---- */

  const bas = elem('div', 'starter-bas');
  const cartes = elem('div', 'cartes');

  const valide = elem('div', 'starter-valide');
  const rappel = elem('p', 'starter-rappel');
  const bouton = elem('button', 'bouton bouton-primaire', 'Commencer');
  bouton.type = 'button';
  bouton.id = 'valider-starter';
  bouton.disabled = true;
  valide.append(rappel, bouton);

  bas.append(cartes, valide);
  racine.append(haut, elem('div'), bas);
  document.body.appendChild(racine);

  /* ---- État ---- */

  let valise = STARTER_CASES[0]!;
  let choisi: string | null = null;

  function majRappel(): void {
    if (!choisi) {
      rappel.textContent = 'Sélectionne un Pokémon pour continuer.';
      return;
    }
    const species = getSpecies(choisi);
    rappel.innerHTML = '';
    rappel.append(
      document.createTextNode('Tu pars avec '),
      elem('b', undefined, species.name),
      document.createTextNode(`, de ${valise.region}.`)
    );
  }

  function choisir(speciesId: string): void {
    choisi = speciesId;
    showcase.mettreEnAvant(speciesId);
    bouton.disabled = false;
    for (const carte of cartes.querySelectorAll('.carte')) {
      carte.setAttribute('aria-pressed', String(carte.id === `starter-${speciesId}`));
    }
    majRappel();
  }

  function peuplerCartes(): void {
    cartes.innerHTML = '';
    for (const speciesId of valise.starters) {
      const species = getSpecies(speciesId);
      const carte = carteStarter(species);
      carte.addEventListener('click', () => choisir(speciesId));
      cartes.appendChild(carte);
    }
  }

  async function ouvrirValise(id: string): Promise<void> {
    const cible = STARTER_CASES.find((v) => v.id === id);
    if (!cible || cible.id === valise.id) return;
    valise = cible;
    choisi = null;
    bouton.disabled = true;
    majRappel();
    peuplerCartes();
    for (const onglet of selecteur.querySelectorAll('button')) {
      onglet.setAttribute('aria-selected', String(onglet.dataset['case'] === id));
    }
    await showcase.charger(valise.starters);
  }

  for (const cas of STARTER_CASES) {
    const onglet = elem('button', undefined, cas.region);
    onglet.type = 'button';
    onglet.dataset['case'] = cas.id;
    onglet.setAttribute('role', 'tab');
    onglet.setAttribute('aria-selected', String(cas.id === valise.id));
    onglet.addEventListener('click', () => void ouvrirValise(cas.id));
    selecteur.appendChild(onglet);
  }

  peuplerCartes();
  majRappel();

  return new Promise<StarterChoice>((resolve) => {
    bouton.addEventListener('click', () => {
      if (!choisi) return;
      const resultat = { speciesId: choisi, caseId: valise.id };
      // On laisse l'écran s'effacer avant de rendre la main, sinon la bascule
      // vers le terrain est brutale.
      racine.style.transition = 'opacity .28s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(resultat);
      }, 280);
    });
  });
}
