/**
 * Écran d'invocation.
 *
 * Deux portails, une seule grammaire : on choisit le portail, puis un tirage
 * simple ou un ×10. Les taux restent affichés en permanence — le joueur doit
 * pouvoir vérifier ce qu'il achète avant de dépenser, pas après.
 *
 * L'écran modifie le compte — c'est le seul de l'interface à le faire — donc
 * il reçoit le gestionnaire et non une copie des données.
 */

import {
  COUT_INVOCATION,
  COUT_MULTIPLE,
  LIBELLE_RARETE,
  TAUX,
  TIRAGE_MULTIPLE,
  invoquer,
  invoquerArme,
  invoquerArmesMultiple,
  invoquerMultiple,
} from '@/data/gacha';
import { getSpecies, rareteDe } from '@/data/content';
import { pastilleArme, pastillePokemon } from './pastille';
import { getWeapon, libelleStyle } from '@/data/weapons';
import { rareteDominante, revelation } from './reveal';
import type { AccountManager } from '@/save';
import type { OwnedPokemon, OwnedWeapon, Rarity } from '@/data/types';

type Portail = 'pokemon' | 'arme';

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

function badgeRarete(rarete: Rarity): HTMLSpanElement {
  const badge = elem('span', 'rarete', LIBELLE_RARETE[rarete]);
  badge.dataset['rarete'] = rarete;
  return badge;
}

function carteResultat(owned: OwnedPokemon): HTMLDivElement {
  const species = getSpecies(owned.speciesId);
  const carte = elem('div', 'resultat');
  carte.dataset['rarete'] = rareteDe(owned);

  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }

  carte.append(
    // Le portrait est rendu depuis le modèle 3D : c'est littéralement le
    // Pokémon qu'on vient d'obtenir, pas un symbole qui le représente.
    pastillePokemon(owned.speciesId, 'pastille-carte'),
    badgeRarete(rareteDe(owned)),
    elem('div', 'resultat-nom', species.name),
    types,
    elem('p', 'sous-titre', `${owned.auto.name} · ${owned.ultime.name}`)
  );
  return carte;
}

function carteArme(arme: OwnedWeapon): HTMLDivElement {
  const modele = getWeapon(arme.weaponId);
  const carte = elem('div', 'resultat');
  carte.dataset['rarete'] = arme.rarity;

  const stats = elem('div', 'resultat-stats');
  const ligne = (etiquette: string, valeur: string): HTMLDivElement => {
    const bloc = elem('div', 'resultat-stat');
    bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
    return bloc;
  };
  stats.append(
    ligne('Dégâts', String(modele.damage)),
    ligne('Cadence', `${(1 / modele.cooldown).toFixed(1)}/s`),
    ligne('Portée', modele.range.toFixed(1))
  );

  carte.append(
    pastilleArme(arme.weaponId, 'pastille-carte'),
    badgeRarete(arme.rarity),
    elem('div', 'resultat-nom', modele.name),
    elem('p', 'sous-titre', libelleStyle(modele)),
    stats
  );
  return carte;
}

/** Un lot de cartes, pour la révélation d'un ×10. */
function grille(cartes: readonly HTMLElement[]): HTMLDivElement {
  const bloc = elem('div', 'revelation-grille');
  for (const carte of cartes) bloc.appendChild(carte);
  return bloc;
}

export function ouvrirInvocation(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-invocation');
  let portail: Portail = 'pokemon';
  /** Verrou : sans lui, un double-clic paie deux fois pendant l'animation. */
  let occupe = false;

  const titre = elem('div');
  titre.append(elem('p', 'etiquette', 'Gacha'), elem('h1', 'titre titre-xl', 'Invocation'));

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'invocation-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  /* ---- Choix du portail ---- */

  const onglets = elem('div', 'onglets');
  const ongletPoke = elem('button', 'onglet', 'Pokémon');
  ongletPoke.type = 'button';
  ongletPoke.id = 'portail-pokemon';
  const ongletArme = elem('button', 'onglet', '✦ Armes');
  ongletArme.type = 'button';
  ongletArme.id = 'portail-arme';
  onglets.append(ongletPoke, ongletArme);

  const scene = elem('div', 'invocation-scene');
  const capsule = elem('div', 'capsule', '?');
  const consigne = elem('p', 'sous-titre');
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

  const boutonUn = elem('button', 'bouton bouton-primaire');
  boutonUn.type = 'button';
  boutonUn.id = 'invoquer';
  const boutonDix = elem('button', 'bouton');
  boutonDix.type = 'button';
  boutonDix.id = 'invoquer-dix';

  const boutons = elem('div', 'invocation-boutons');
  boutons.append(boutonUn, boutonDix);

  const pied = elem('div', 'invocation-pied');
  pied.append(taux, boutons);

  const majEtat = (): void => {
    ongletPoke.setAttribute('aria-selected', String(portail === 'pokemon'));
    ongletArme.setAttribute('aria-selected', String(portail === 'arme'));
    capsule.textContent = portail === 'pokemon' ? '?' : '✦';
    consigne.textContent =
      portail === 'pokemon'
        ? `Un Pokémon pour ${COUT_INVOCATION} cristaux.`
        : `Une arme de dresseur pour ${COUT_INVOCATION} cristaux.`;

    boutonUn.disabled = occupe || compte.crystals < COUT_INVOCATION;
    boutonDix.disabled = occupe || compte.crystals < COUT_MULTIPLE;
    boutonUn.textContent =
      compte.crystals >= COUT_INVOCATION
        ? `Invoquer — ${COUT_INVOCATION} ◆`
        : `Il te manque ${COUT_INVOCATION - compte.crystals} ◆`;
    boutonDix.textContent = `Invoquer ×${TIRAGE_MULTIPLE} — ${COUT_MULTIPLE} ◆`;
    boutonDix.title =
      compte.crystals >= COUT_MULTIPLE
        ? `Au moins un ${LIBELLE_RARETE.rare} garanti`
        : `Il te manque ${COUT_MULTIPLE - compte.crystals} cristaux`;
  };

  /** Rappel du solde sous la capsule, après un tirage. */
  const rappelSolde = (): void => {
    scene.innerHTML = '';
    scene.append(
      capsule,
      consigne,
      elem('p', 'sous-titre', `Il te reste ${compte.crystals} cristaux.`)
    );
  };

  const tirer = async (multiple: boolean): Promise<void> => {
    const cout = multiple ? COUT_MULTIPLE : COUT_INVOCATION;
    if (occupe || compte.crystals < cout) return;
    occupe = true;
    compte.crystals -= cout;
    majEtat();

    let raretes: Rarity[];
    let contenu: HTMLElement;

    if (portail === 'pokemon') {
      const lot = multiple ? invoquerMultiple() : [invoquer()];
      compte.roster.push(...lot);
      raretes = lot.map((membre) => rareteDe(membre));
      contenu = multiple ? grille(lot.map(carteResultat)) : carteResultat(lot[0]!);
    } else {
      const lot = multiple ? invoquerArmesMultiple() : [invoquerArme()];
      compte.weapons.push(...lot);
      // Le dresseur équipe sa première arme sans avoir à y penser.
      if (!compte.equippedWeaponId) compte.equippedWeaponId = lot[0]!.id;
      raretes = lot.map((arme) => arme.rarity);
      contenu = multiple ? grille(lot.map(carteArme)) : carteArme(lot[0]!);
    }

    account.touch();
    await revelation(rareteDominante(raretes), contenu);

    occupe = false;
    rappelSolde();
    majEtat();
  };

  boutonUn.addEventListener('click', () => void tirer(false));
  boutonDix.addEventListener('click', () => void tirer(true));
  ongletPoke.addEventListener('click', () => {
    portail = 'pokemon';
    majEtat();
  });
  ongletArme.addEventListener('click', () => {
    portail = 'arme';
    majEtat();
  });

  majEtat();

  racine.append(haut, onglets, scene, pied);
  document.body.appendChild(racine);

  return new Promise<void>((resolve) => {
    retour.addEventListener('click', () => {
      if (occupe) return;
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve();
      }, 220);
    });
  });
}
