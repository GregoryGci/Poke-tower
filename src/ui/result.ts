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
import { ARME_OWNER, type GameStatus, type RapportManche } from '@/game/game';
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
  /** État d'avant la manche : c'est de là que part l'animation. */
  niveauAvant: number;
  xpAvant: number;
}

/** Durée de remplissage d'une barre d'expérience, en millisecondes. */
const DUREE_GAIN = 620;

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
    const niveauAvant = owned.level;
    const xpAvant = owned.xp;
    const niveauxPris = ajouterXp(owned, xp);
    gains.push({
      owned,
      degats: contribution.degats,
      kills: contribution.kills,
      xp,
      niveauxPris,
      niveauAvant,
      xpAvant,
    });
  }
  return gains;
}

/**
 * Ligne d'un Pokémon : identité, gain d'XP, barre de progression.
 *
 * La ligne est rendue dans son état d'avant la manche, et l'animation la
 * fait avancer jusqu'à l'état réel. Le gain est déjà acquis dans le compte à
 * ce moment-là : l'animation ne décide de rien, elle raconte.
 */
function ligneGain(gain: GainPokemon, retard: number): HTMLDivElement {
  const species = getSpecies(gain.owned.speciesId);
  const ligne = elem('div', 'gain');

  const pastille = elem('span', 'pastille', species.name.slice(0, 1));
  pastille.dataset['type'] = species.types[0];

  const valeurXp = elem('span', 'gain-xp', '+0 XP');
  const centre = elem('div', 'gain-centre');
  const tete = elem('div', 'gain-tete');
  tete.append(elem('span', 'gain-nom', species.name), valeurXp);

  const requisAvant = xpRequise(gain.niveauAvant);
  const jauge = elem('div', 'jauge');
  const remplissage = elem('i');
  remplissage.style.width = `${Math.min(100, (gain.xpAvant / requisAvant) * 100)}%`;
  jauge.appendChild(remplissage);

  const niveauTexte = elem('span', undefined, `Niveau ${gain.niveauAvant}`);
  const xpTexte = elem('span', undefined, `${gain.xpAvant} / ${requisAvant}`);
  const pied = elem('div', 'gain-pied');
  pied.append(niveauTexte, xpTexte);

  centre.append(tete, jauge, pied);
  ligne.append(pastille, centre);

  const badge =
    gain.niveauxPris > 0
      ? elem('span', 'badge-niveau', `Niveau +${gain.niveauxPris}`)
      : null;
  if (badge) {
    badge.dataset['visible'] = 'false';
    ligne.appendChild(badge);
  }

  animerGain(gain, { valeurXp, remplissage, niveauTexte, xpTexte, badge, retard });
  return ligne;
}

interface PiecesGain {
  valeurXp: HTMLElement;
  remplissage: HTMLElement;
  niveauTexte: HTMLElement;
  xpTexte: HTMLElement;
  badge: HTMLElement | null;
  /** Retard avant que cette barre ne démarre, en millisecondes. */
  retard: number;
}

/**
 * Fait monter la barre d'expérience.
 *
 * L'XP versée est interpolée, et les paliers franchis sont rejoués au
 * passage : la barre saute donc d’un cran chaque fois qu’un niveau tombe,
 * au lieu de glisser vers une valeur finale qui ne voudrait rien dire.
 *
 * L'état final est reposé tel quel à la fin, jamais calculé : c'est le
 * compte qui fait foi, pas l’interpolation.
 */
function animerGain(gain: GainPokemon, pieces: PiecesGain): void {
  const reduit =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const poser = (niveau: number, xp: number, gagne: number): void => {
    const requis = xpRequise(niveau);
    pieces.remplissage.style.width = `${Math.min(100, (xp / requis) * 100)}%`;
    pieces.niveauTexte.textContent = `Niveau ${niveau}`;
    pieces.xpTexte.textContent = `${Math.round(xp)} / ${requis}`;
    pieces.valeurXp.textContent = `+${Math.round(gagne)} XP`;
  };

  const conclure = (): void => {
    poser(gain.owned.level, gain.owned.xp, gain.xp);
    if (pieces.badge) pieces.badge.dataset['visible'] = 'true';
  };

  if (reduit || gain.xp <= 0) {
    conclure();
    return;
  }

  let debut = 0;
  const pas = (maintenant: number): void => {
    if (!debut) debut = maintenant;
    const ecoule = maintenant - debut - pieces.retard;
    if (ecoule < 0) {
      requestAnimationFrame(pas);
      return;
    }

    const avancee = Math.min(1, ecoule / DUREE_GAIN);
    // Sortie amortie : la barre ralentit en arrivant, ce qui laisse le temps
    // de lire le chiffre final.
    const verse = gain.xp * (1 - Math.pow(1 - avancee, 3));

    let niveau = gain.niveauAvant;
    let xp = gain.xpAvant + verse;
    for (;;) {
      const requis = xpRequise(niveau);
      if (xp < requis || niveau >= gain.niveauAvant + gain.niveauxPris) break;
      xp -= requis;
      niveau += 1;
    }
    poser(niveau, xp, verse);

    if (avancee >= 1) {
      conclure();
      return;
    }
    requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
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
    // Le dresseur figure au bilan comme les autres, mais ce n'est pas une espece.
    if (contribution.speciesId === ARME_OWNER) {
      parPokemon.appendChild(barre('Dresseur · arme', contribution.degats, `${Math.round(contribution.degats)}`));
      continue;
    }
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
    // Cascade : les barres partent l'une après l'autre, ce qui donne un ordre
    // de lecture au lieu de six barres qui montent ensemble.
    gains.forEach((gain, index) => vueEquipe.appendChild(ligneGain(gain, index * 130)));
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
