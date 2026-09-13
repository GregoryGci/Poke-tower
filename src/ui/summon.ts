/**
 * Écran d'invocation.
 *
 * Trois portails, une seule grammaire : on choisit le portail, puis un tirage
 * simple ou un ×10. Les taux restent affichés en permanence — le joueur doit
 * pouvoir vérifier ce qu'il achète avant de dépenser, pas après.
 *
 * L'écran modifie le compte — c'est le seul de l'interface à le faire — donc
 * il reçoit le gestionnaire et non une copie des données.
 */

import {
  COUT_BALL,
  COUT_INVOCATION,
  COUT_MULTIPLE,
  LIBELLE_RARETE,
  tauxServis,
  TIRAGE_MULTIPLE,
  invoquer,
  invoquerLegendaire,
  invoquerArme,
  invoquerArmesMultiple,
  invoquerMultiple,
  invoquerMultipleOffert,
} from '@/data/gacha';
import { ESPECES_LEGENDAIRES, especesDeRarete, getSpecies, rareteDe } from '@/data/content';
import { pastilleArme, pastillePokemon } from './pastille';
import { WEAPONS, getWeapon, libelleStyle } from '@/data/weapons';
import { cascader, revelation, revelationEnChaine, type EntreeChaine } from './reveal';
import { illustrationPortail } from './illustrations';
import { alerterInfo } from './evolution-annonce';
import type { AccountManager } from '@/save';
import type { OwnedPokemon, OwnedWeapon, Rarity } from '@/data/types';

type Portail = 'pokemon' | 'arme' | 'legendaire';

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

/**
 * Ce que le portail peut donner, en clair.
 *
 * Un taux sans la liste des espèces ne dit rien : savoir qu'il y a 2,5 % de
 * prismatique n'apprend pas *lesquels*, et c'est la seule question qu'on se
 * pose avant de dépenser. La liste vit derrière un bouton plutôt qu'à
 * l'écran en permanence — on la consulte une fois, on tire vingt fois.
 */
function ouvrirContenu(portail: Portail): Promise<void> {
  const voile = elem('div', 'voile-reglages');
  const panneau = elem('div', 'reglages');

  const haut = elem('div', 'equipe-haut');
  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Contenu du portail'),
    elem('h2', 'titre titre-m', portail === 'arme' ? 'Arsenal' : 'Ce que tu peux obtenir')
  );
  const fermer = elem('button', 'bouton-discret', 'Fermer');
  fermer.type = 'button';
  fermer.id = 'contenu-fermer';
  haut.append(titre, fermer);
  panneau.appendChild(haut);

  /** Une section par rareté, du plus rare au plus commun : on lit le haut. */
  const section = (rarete: Rarity, noms: readonly string[], part: number | null): void => {
    if (noms.length === 0) return;
    const bloc = elem('div', 'contenu-groupe');
    const entete = elem('div', 'contenu-entete');
    entete.append(badgeRarete(rarete));
    if (part !== null) {
      entete.appendChild(elem('code', undefined, `${(part * 100).toFixed(1)} %`));
    }
    bloc.appendChild(entete);

    const liste = elem('div', 'legendes-noms');
    for (const nom of noms) liste.appendChild(elem('span', 'legende-puce', nom));
    bloc.appendChild(liste);
    panneau.appendChild(bloc);
  };

  const ordre: Rarity[] = ['prismatique', 'legendaire', 'epique', 'rare', 'normal'];

  if (portail === 'legendaire') {
    panneau.appendChild(
      elem(
        'p',
        'affinites-vide',
        `${ESPECES_LEGENDAIRES.length} légendes, toutes au même taux : une Master Ball ne peut pas être un mauvais tirage.`
      )
    );
    section(
      'prismatique',
      ESPECES_LEGENDAIRES.map((id) => getSpecies(id).name),
      null
    );
  } else if (portail === 'arme') {
    const servis = tauxServis('arme');
    for (const rarete of ordre) {
      section(
        rarete,
        Object.values(WEAPONS).filter((arme) => arme.rarity === rarete).map((arme) => arme.name),
        servis[rarete]
      );
    }
  } else {
    const servis = tauxServis();
    for (const rarete of ordre) {
      section(
        rarete,
        especesDeRarete(rarete).map((id) => getSpecies(id).name),
        servis[rarete]
      );
    }
  }

  voile.appendChild(panneau);
  document.body.appendChild(voile);
  fermer.focus();

  return new Promise<void>((resolve) => {
    const partir = (): void => {
      window.removeEventListener('keydown', surTouche);
      voile.remove();
      resolve();
    };
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') partir();
    };
    window.addEventListener('keydown', surTouche);
    fermer.addEventListener('click', partir);
    voile.addEventListener('click', (evenement) => {
      if (evenement.target === voile) partir();
    });
  });
}

/** Un lot de cartes, pour la révélation d'un ×10. */
function grille(cartes: readonly HTMLElement[]): HTMLDivElement {
  const bloc = elem('div', 'revelation-grille');
  for (const carte of cartes) bloc.appendChild(carte);
  // Les dix cartes tombent l'une après l'autre : apparues ensemble, l'oeil ne
  // sait pas où regarder et l'aura de la seule carte rare se noie dans le lot.
  cascader(cartes);
  return bloc;
}

/**
 * Le ×10 offert, juste après le tutoriel.
 *
 * Main forcée, et assumée : on explique, on tire, on ne demande rien. Un
 * joueur qui sort de sa première manche a un Pokémon et dix cristaux — s'il
 * doit décider lui-même d'aller au portail, il n'ira pas, faute de savoir ce
 * qu'il y trouverait. Après ce lot, il a une équipe et il a vu l'écran.
 *
 * Ça ne passe pas par `ouvrirInvocation` : il n'y a ici ni portail à choisir,
 * ni prix, ni bouton à presser. Les deux écrans n'ont en commun que la
 * révélation, qui est justement le morceau partagé.
 */
export async function invocationOfferte(account: AccountManager): Promise<void> {
  const compte = account.account;

  await alerterInfo(
    'Le portail s’ouvre',
    'Un dresseur ne défend pas une tour tout seul.',
    [
      'Les cristaux gagnés en manche s’échangent contre des Pokémon, au portail.',
      'Voici dix invocations offertes pour te lancer — un Pokémon rare au moins t’attend.',
    ]
  );

  const lot = invoquerMultipleOffert();
  compte.roster.push(...lot);
  // L'équipe se remplit toute seule : demander de composer six slots à
  // quelqu'un qui vient d'obtenir dix Pokémon d'un coup, c'est lui demander
  // de trier avant d'avoir joué.
  for (const membre of lot) {
    if (compte.team.length >= 6) break;
    compte.team.push(membre.id);
  }
  compte.progression.invocationOfferteFaite = true;
  account.touch();

  const entrees: EntreeChaine[] = lot.map((membre) => ({
    rarete: rareteDe(membre),
    carte: carteResultat(membre),
    copie: carteResultat(membre),
  }));
  await revelationEnChaine(entrees, (copies) => grille(copies), 'Rejoindre le menu');
  await account.flush();
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

  // Un carrousel plutôt que trois onglets : les bannières sont des panoramas
  // 2:1, et trois panoramas côte à côte ne tiennent nulle part. On en montre
  // un, en grand, et on passe au suivant — la bannière devient l'écran, ce
  // qu'un onglet de vingt pixels de haut ne pouvait pas être.
  const PORTAILS: Portail[] = ['pokemon', 'arme', 'legendaire'];
  const NOM_PORTAIL: Record<Portail, string> = {
    pokemon: 'Portail Pokémon',
    arme: 'Arsenal',
    legendaire: 'Légendes',
  };
  const GLYPHE_PORTAIL: Record<Portail, string> = {
    pokemon: '?',
    arme: '✦',
    legendaire: '◉',
  };

  const carrousel = elem('div', 'carrousel');

  const precedent = elem('button', 'carrousel-fleche', '‹');
  precedent.type = 'button';
  precedent.id = 'portail-precedent';
  precedent.setAttribute('aria-label', 'Portail précédent');
  const suivant = elem('button', 'carrousel-fleche', '›');
  suivant.type = 'button';
  suivant.id = 'portail-suivant';
  suivant.setAttribute('aria-label', 'Portail suivant');

  const scene = elem('div', 'invocation-scene');
  const banniere = elem('img', 'portail-banniere');
  banniere.alt = '';
  banniere.decoding = 'async';
  const capsule = elem('div', 'capsule', '?');
  const nomPortail = elem('h2', 'carrousel-nom');
  const consigne = elem('p', 'sous-titre');
  scene.append(banniere, capsule, nomPortail, consigne);

  // Un fichier annoncé mais absent ne doit pas laisser un cadre vide : on
  // repasse à la capsule, qui a toujours quelque chose à montrer.
  banniere.addEventListener('error', () => {
    banniere.hidden = true;
    capsule.hidden = false;
  });

  const pastilles = elem('div', 'carrousel-points');
  const points = PORTAILS.map((cible) => {
    const point = elem('button', 'carrousel-point');
    point.type = 'button';
    point.id = `portail-${cible}`;
    point.setAttribute('aria-label', NOM_PORTAIL[cible]);
    point.addEventListener('click', () => {
      portail = cible;
      majEtat();
    });
    pastilles.appendChild(point);
    return { cible, point };
  });

  carrousel.append(precedent, scene, suivant);

  const glisser = (pas: number): void => {
    const index = PORTAILS.indexOf(portail);
    portail = PORTAILS[(index + pas + PORTAILS.length) % PORTAILS.length]!;
    majEtat();
  };
  precedent.addEventListener('click', () => glisser(-1));
  suivant.addEventListener('click', () => glisser(1));

  /* ---- Ce que le portail contient ---- */

  const voirContenu = elem('button', 'bouton-discret', 'Voir les Pokémon du portail');
  voirContenu.type = 'button';
  voirContenu.id = 'portail-contenu';
  voirContenu.addEventListener('click', () => void ouvrirContenu(portail));

  // Les taux affichés sont ceux qui sortent vraiment de la machine, pas la
  // table d'intention : un palier sans aucune espèce afficherait sinon un
  // pourcentage qu'aucun tirage ne peut honorer. Les paliers à zéro
  // disparaissent — annoncer « 0,0 % » n'apprend rien.
  const taux = elem('div', 'taux');
  const majTaux = (): void => {
    taux.replaceChildren();
    const genre = portail === 'arme' ? 'arme' : 'pokemon';
    for (const [rarete, part] of Object.entries(tauxServis(genre)) as Array<[Rarity, number]>) {
      if (part <= 0) continue;
      const ligne = elem('div', 'taux-ligne');
      ligne.append(
        elem('span', 'etiquette', LIBELLE_RARETE[rarete]),
        // Deux décimales : à 0,5 %, un arrondi au dixième afficherait « 0,5 »
        // et « 0,0 » selon le palier, ce qui se lit comme « impossible ».
        elem('b', undefined, `${(part * 100).toFixed(part < 0.01 ? 2 : 1)} %`)
      );
      taux.appendChild(ligne);
    }
  };

  const boutonUn = elem('button', 'bouton bouton-primaire');
  boutonUn.type = 'button';
  boutonUn.id = 'invoquer';
  const boutonDix = elem('button', 'bouton');
  boutonDix.type = 'button';
  boutonDix.id = 'invoquer-dix';

  const boutons = elem('div', 'invocation-boutons');
  boutons.append(boutonUn, boutonDix);

  /**
   * Ce que le portail des légendes contient, en clair.
   *
   * Sept espèces, toutes prismatiques : le hasard ne porte que sur laquelle.
   * L'afficher évite la seule déception possible — croire qu'on peut tomber
   * sur un mauvais tirage.
   */
  const listeLegendes = elem('div', 'legendes');
  listeLegendes.appendChild(
    elem('p', 'etiquette', `${ESPECES_LEGENDAIRES.length} légendes, toutes au même taux`)
  );
  const noms = elem('div', 'legendes-noms');
  for (const id of ESPECES_LEGENDAIRES) {
    const espece = getSpecies(id);
    const puce = elem('span', 'legende-puce', espece.name);
    puce.dataset['type'] = espece.types[0];
    noms.appendChild(puce);
  }
  listeLegendes.appendChild(noms);

  const pied = elem('div', 'invocation-pied');
  pied.append(taux, listeLegendes, boutons);

  function majEtat(): void {
    for (const { cible, point } of points) {
      point.setAttribute('aria-selected', String(portail === cible));
      point.dataset['actif'] = String(portail === cible);
    }
    nomPortail.textContent = NOM_PORTAIL[portail];
    voirContenu.textContent =
      portail === 'arme' ? 'Voir les armes du portail' : 'Voir les Pokémon du portail';
    racine.dataset['portail'] = portail;
    majTaux();

    const dessin = illustrationPortail(portail);
    banniere.hidden = !dessin;
    capsule.hidden = Boolean(dessin);
    capsule.textContent = GLYPHE_PORTAIL[portail];
    if (dessin && !banniere.src.endsWith(dessin)) banniere.src = dessin;

    // Le portail des légendes n'a pas de tirage multiple : une Ball ne se
    // dépense pas par dix, et un bouton désactivé en permanence n'apprendrait
    // rien de plus qu'un bouton absent.
    boutonDix.hidden = portail === 'legendaire';
    taux.hidden = portail === 'legendaire';
    // La liste des légendes a déménagé derrière « voir le contenu » : elle
    // occupait un quart de l'écran en permanence pour un portail qu'on ouvre
    // une fois par Master Ball.
    listeLegendes.hidden = true;

    if (portail === 'legendaire') {
      consigne.textContent = `Un légendaire pour ${COUT_BALL} Master Ball.`;
      const balls = compte.balls ?? 0;
      boutonUn.disabled = occupe || balls < COUT_BALL;
      boutonUn.textContent =
        balls >= COUT_BALL
          ? `Invoquer — ${COUT_BALL} ◉`
          : 'Aucune Master Ball — elles tombent en raid';
      return;
    }

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

  /** Rappel du solde sous le portail, après un tirage. */
  const rappelSolde = (): void => {
    scene.innerHTML = '';
    const reste =
      portail === 'legendaire'
        ? `Il te reste ${compte.balls ?? 0} Master Ball${(compte.balls ?? 0) > 1 ? 's' : ''}.`
        : `Il te reste ${compte.crystals} cristaux.`;
    // La bannière est réinjectée avec le reste : `innerHTML = ''` détache
    // tout, et la reconstruire perdrait l'image déjà chargée.
    scene.append(banniere, capsule, consigne, elem('p', 'sous-titre', reste));
  };

  const tirer = async (multiple: boolean): Promise<void> => {
    // Le portail des légendes se paie dans une autre monnaie : il sort donc
    // du chemin commun avant même de calculer un coût en cristaux.
    if (portail === 'legendaire') {
      if (occupe || (compte.balls ?? 0) < COUT_BALL) return;
      occupe = true;
      compte.balls -= COUT_BALL;
      majEtat();

      const legende = invoquerLegendaire();
      compte.roster.push(legende);
      account.touch();
      await revelation('prismatique', carteResultat(legende));

      occupe = false;
      rappelSolde();
      majEtat();
      return;
    }

    const cout = multiple ? COUT_MULTIPLE : COUT_INVOCATION;
    if (occupe || compte.crystals < cout) return;
    occupe = true;
    compte.crystals -= cout;
    majEtat();

    // Un tirage produit une rareté et **deux** cartes identiques : la chaîne
    // en montre une à la fois, le récapitulatif les montre toutes. Un même
    // nœud ne pouvant pas être à deux endroits, on le construit deux fois.
    let entrees: EntreeChaine[];

    if (portail === 'pokemon') {
      const lot = multiple ? invoquerMultiple() : [invoquer()];
      compte.roster.push(...lot);
      entrees = lot.map((membre) => ({
        rarete: rareteDe(membre),
        carte: carteResultat(membre),
        copie: carteResultat(membre),
      }));
    } else {
      const lot = multiple ? invoquerArmesMultiple() : [invoquerArme()];
      compte.weapons.push(...lot);
      // Le dresseur équipe sa première arme sans avoir à y penser.
      if (!compte.equippedWeaponId) compte.equippedWeaponId = lot[0]!.id;
      entrees = lot.map((arme) => ({
        rarete: arme.rarity,
        carte: carteArme(arme),
        copie: carteArme(arme),
      }));
    }

    account.touch();
    if (multiple) {
      await revelationEnChaine(entrees, (copies) => grille(copies));
    } else {
      await revelation(entrees[0]!.rarete, entrees[0]!.carte);
    }

    occupe = false;
    rappelSolde();
    majEtat();
  };

  boutonUn.addEventListener('click', () => void tirer(false));
  boutonDix.addEventListener('click', () => void tirer(true));
  majEtat();

  racine.append(haut, carrousel, pastilles, voirContenu, pied);
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
