/**
 * Bilan de fin de manche.
 *
 * Structure empruntée aux fins de combat de Dofus : l'essentiel d'abord —
 * qui a combattu, ce qu'il a gagné, ce qui est tombé — et le détail chiffré
 * derrière un onglet, pour ceux qui veulent optimiser.
 *
 * Une seule modale pour les deux issues : ce qui change est le ton, pas la
 * structure. Le joueur ne doit pas avoir à réapprendre où regarder selon
 * qu'il a gagné ou perdu.
 */

import { getSpecies } from '@/data/content';
import { STYLES, ajouterXp, xpRequise, type OwnedPokemon, type PlayerAccount } from '@/data/types';
import type { GameStatus, RapportManche } from '@/game/game';
import { ecrire } from './typewriter';

/** Expérience versée par point de dégât infligé. */
const XP_PAR_DEGAT = 0.35;
/** Prime d'expérience pour une manche gagnée. */
const XP_VICTOIRE = 60;

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

interface GainPokemon {
  owned: OwnedPokemon;
  degats: number;
  kills: number;
  xp: number;
  niveauxPris: number;
}

/**
 * Attribue l'expérience de la manche.
 *
 * Elle suit les dégâts : un Pokémon qui n'a rien fait n'apprend rien, ce qui
 * récompense le placement plutôt que la simple présence.
 */
function distribuerXp(
  compte: PlayerAccount,
  rapport: RapportManche,
  victoire: boolean
): GainPokemon[] {
  const gains: GainPokemon[] = [];

  for (const contribution of rapport.parPokemon) {
    const owned = compte.roster.find((membre) => membre.id === contribution.ownedId);
    if (!owned) continue;
    const xp = Math.round(contribution.degats * XP_PAR_DEGAT + (victoire ? XP_VICTOIRE : 0));
    const niveauxPris = ajouterXp(owned, xp);
    gains.push({ owned, degats: contribution.degats, kills: contribution.kills, xp, niveauxPris });
  }
  return gains;
}

/** Ligne d'un Pokémon : identité, gain d'XP, barre de progression. */
function ligneGain(gain: GainPokemon): HTMLDivElement {
  const species = getSpecies(gain.owned.speciesId);
  const ligne = elem('div', 'gain');

  const pastille = elem('span', 'pastille', species.name.slice(0, 1));
  pastille.dataset['type'] = species.types[0];

  const centre = elem('div', 'gain-centre');
  const tete = elem('div', 'gain-tete');
  tete.append(
    elem('span', 'gain-nom', species.name),
    elem('span', 'gain-xp', `+${gain.xp} XP`)
  );

  const requis = xpRequise(gain.owned.level);
  const jauge = elem('div', 'jauge');
  const remplissage = elem('i');
  remplissage.style.width = `${Math.min(100, (gain.owned.xp / requis) * 100)}%`;
  jauge.appendChild(remplissage);

  const pied = elem('div', 'gain-pied');
  pied.append(
    elem('span', undefined, `Niveau ${gain.owned.level}`),
    elem('span', undefined, `${gain.owned.xp} / ${requis}`)
  );

  centre.append(tete, jauge, pied);
  ligne.append(pastille, centre);

  if (gain.niveauxPris > 0) {
    ligne.appendChild(elem('span', 'badge-niveau', `Niveau +${gain.niveauxPris}`));
  }
  return ligne;
}

/** Onglet chiffré : dégâts par Pokémon, puis par élément. */
function panneauDegats(rapport: RapportManche): HTMLDivElement {
  const panneau = elem('div', 'bilan-detail');

  if (rapport.degatsTotal <= 0) {
    panneau.appendChild(elem('p', 'bilan-sous', 'Aucun dégât infligé pendant cette manche.'));
    return panneau;
  }

  const barre = (libelle: string, valeur: number, appoint: string, teinte?: string): HTMLDivElement => {
    const ligne = elem('div', 'barre');
    const jauge = elem('div', 'jauge');
    const remplissage = elem('i');
    remplissage.style.width = `${(valeur / rapport.degatsTotal) * 100}%`;
    if (teinte) remplissage.style.background = teinte;
    jauge.appendChild(remplissage);
    ligne.append(elem('span', 'barre-nom', libelle), jauge, elem('b', undefined, appoint));
    return ligne;
  };

  const parPokemon = elem('div', 'bloc');
  parPokemon.appendChild(elem('p', 'etiquette', 'Dégâts par Pokémon'));
  for (const contribution of rapport.parPokemon) {
    const species = getSpecies(contribution.speciesId);
    parPokemon.appendChild(
      barre(
        `${species.name} · ${STYLES[species.style].libelle}`,
        contribution.degats,
        `${Math.round(contribution.degats)}`
      )
    );
  }

  const parType = elem('div', 'bloc');
  parType.appendChild(elem('p', 'etiquette', 'Dégâts par élément'));
  for (const entree of rapport.parType) {
    parType.appendChild(
      barre(entree.type, entree.degats, `${Math.round((entree.degats / rapport.degatsTotal) * 100)} %`)
    );
  }

  panneau.append(parPokemon, parType);
  return panneau;
}

/** Affiche le bilan et attend que le joueur reparte. */
export function afficherBilan(
  status: GameStatus,
  rapport: RapportManche,
  compte: PlayerAccount
): Promise<void> {
  const victoire = status.outcome === 'victoire';
  const gains = distribuerXp(compte, rapport, victoire);

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
    ? 'Aucune vague n’a franchi ta ligne.'
    : 'Dix ennemis ont atteint le bout du chemin.';

  const chiffres = elem('div', 'bilan-chiffres');
  chiffres.append(
    chiffre('Cristaux', String(status.crystals)),
    chiffre('Vagues', `${victoire ? status.totalWaves : Math.max(0, status.wave - 1)}/${status.totalWaves}`),
    chiffre('Vies', String(status.lives))
  );

  /* ---- Onglets ---- */

  const onglets = elem('div', 'onglets');
  const ongletEquipe = elem('button', 'onglet', 'Équipe');
  ongletEquipe.type = 'button';
  ongletEquipe.id = 'onglet-equipe';
  ongletEquipe.setAttribute('aria-selected', 'true');

  const ongletDegats = elem('button', 'onglet', '◱ Dégâts');
  ongletDegats.type = 'button';
  ongletDegats.id = 'onglet-degats';
  ongletDegats.setAttribute('aria-selected', 'false');
  ongletDegats.title = 'Détail chiffré de la manche';

  onglets.append(ongletEquipe, ongletDegats);

  const vueEquipe = elem('div', 'bilan-equipe');
  if (gains.length === 0) {
    vueEquipe.appendChild(elem('p', 'bilan-sous', 'Aucun Pokémon n’a combattu.'));
  } else {
    for (const gain of gains) vueEquipe.appendChild(ligneGain(gain));
  }

  // Butin : les cristaux sont toujours là, les objets viendront des raids.
  const butin = elem('div', 'butin');
  butin.append(elem('p', 'etiquette', 'Butin'));
  const lot = elem('div', 'butin-lot');
  lot.append(elem('span', 'butin-icone', '◆'), elem('span', undefined, `${status.crystals} cristaux`));
  butin.appendChild(lot);
  vueEquipe.appendChild(butin);

  const vueDegats = panneauDegats(rapport);
  vueDegats.hidden = true;

  const basculer = (versDegats: boolean): void => {
    ongletEquipe.setAttribute('aria-selected', String(!versDegats));
    ongletDegats.setAttribute('aria-selected', String(versDegats));
    vueEquipe.hidden = versDegats;
    vueDegats.hidden = !versDegats;
  };
  ongletEquipe.addEventListener('click', () => basculer(false));
  ongletDegats.addEventListener('click', () => basculer(true));

  const bouton = elem('button', 'bouton bouton-primaire', 'Retour au menu');
  bouton.type = 'button';
  bouton.id = 'bilan-retour';

  carte.append(entete, sous, chiffres, onglets, vueEquipe, vueDegats, bouton);
  racine.appendChild(carte);
  document.body.appendChild(racine);
  ecrire(sous, texteSous);
  bouton.focus();

  return new Promise<void>((resolve) => {
    bouton.addEventListener('click', () => {
      racine.style.transition = 'opacity .2s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve();
      }, 200);
    });
  });
}
