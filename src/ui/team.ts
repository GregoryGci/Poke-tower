/**
 * Écran d'équipe.
 *
 * On y compose l'équipe emmenée en manche — six au plus, comme le nombre de
 * Pokémon posables sur le terrain — et on y dépense les cristaux. Le reste de
 * la collection vit dans son propre écran : mêler l'inventaire complet à la
 * sélection noyait le geste de choisir.
 *
 * Tout ce qu'un Pokémon possède tient sur une page : ses quatre attaques,
 * ses deux traits, ses quatre sub-stats. C'est là que le joueur ira vérifier
 * ce qu'un reroll lui a donné, donc rien n'est caché derrière un onglet.
 *
 * C'est aussi là que se dépensent les cristaux : relancer les attaques, les
 * traits, ou monter une sub-stat d'un palier. Les règles et les coûts vivent
 * dans data/upgrades, l'écran ne fait qu'appeler et réafficher.
 */

import { evolutionParNiveau, getSpecies, lignee, rareteDe } from '@/data/content';
import { prochaineEvolution } from '@/data/evolution';
import { analyseAffinites } from '@/data/affinites';
import { bonbonsDisponibles, donnerBonbon } from '@/data/bonbons';
import { employerPierre, pierresUtiles } from '@/data/pierres';
import { EQUIPE_MAX, basculerEquipe, dansEquipe } from '@/data/team';
import { TRIS_POKEMON, detailStat, notePotentiel } from '@/data/stats';
import { PALIER_MAX } from '@/data/paliers';
import { alerterEvolution } from './evolution-annonce';
import { boutonFavori, selecteurTri, trier } from './tri';
import { pastillePokemon } from './pastille';
import {
  ETOILES_MAX,
  ETOILES_MAX_FUSION,
  SUBSTAT_MAX_STACK,
  doublonsRequis,
  multiplicateurEtoiles,
  type OwnedPokemon,
  type PlayerAccount,
  type StatType,
} from '@/data/types';
import type { AccountManager } from '@/save';
import {
  doublonsDisponibles,
  fusionner,
  COUT_REROLL_AUTO,
  COUT_REROLL_ULTIME,
  COUT_REROLL_TRAIT_UNITE,
  COUT_REROLL_TRAITS,
  coutProchainPalier,
  monterSubStat,
  rerollAuto,
  rerollUltime,
  rerollTrait,
  rerollTraits,
} from '@/data/upgrades';

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

/** Rangée d'étoiles. La sixième se distingue : elle vient des raids. */
function rangeeEtoiles(etoiles: number, shiny: boolean, classe = 'etoiles'): HTMLDivElement {
  const rangee = elem('div', classe);
  for (let i = 1; i <= ETOILES_MAX; i++) {
    const etoile = elem('span', 'etoile', '★');
    etoile.dataset['pleine'] = String(i <= etoiles);
    if (i === ETOILES_MAX && shiny) etoile.dataset['shiny'] = 'true';
    rangee.appendChild(etoile);
  }
  return rangee;
}

function bloc(titre: string, contenu: HTMLElement, action?: HTMLElement): HTMLDivElement {
  const section = elem('div', 'bloc');
  const tete = elem('div', 'bloc-tete');
  tete.append(elem('p', 'etiquette', titre));
  if (action) tete.appendChild(action);
  section.append(tete, contenu);
  return section;
}

function boutonCout(libelle: string, cout: number, solde: number): HTMLButtonElement {
  const bouton = elem('button', 'bouton-cout', `${libelle} — ${cout} cristaux`);
  bouton.type = 'button';
  bouton.disabled = solde < cout;
  return bouton;
}

/**
 * Rend le détail d'un Pokémon.
 *
 * Le panneau est reconstruit après chaque dépense plutôt que modifié en
 * place : c'est l'assurance que ce qui s'affiche est bien l'état du compte,
 * jamais une vue qui aurait dérivé.
 */
function remplirDetail(
  panneau: HTMLElement,
  owned: OwnedPokemon,
  compte: PlayerAccount,
  surChangement: () => void
): void {
  const species = getSpecies(owned.speciesId);
  panneau.innerHTML = '';

  const tete = elem('div', 'detail-tete');
  const identite = elem('div');
  identite.append(
    elem('p', 'etiquette', `N°${String(species.dexNumber).padStart(3, '0')} · niveau ${owned.level}`),
    elem('h2', 'titre titre-m', species.name)
  );
  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }
  identite.appendChild(types);

  const cote = elem('div', 'detail-cote');
  // La rareté est celle de l'espèce : tous les Aspicot sont normaux, et
  // c'est justement ce qu'on veut pouvoir lire d'un coup d'oeil.
  const rareteEspece = rareteDe(owned);
  const rarete = elem('span', 'rarete', rareteEspece);
  rarete.dataset['rarete'] = rareteEspece;
  // La note de potentiel resume la part de hasard du tirage : c'est ce qu'on
  // regarde avant de sacrifier un doublon.
  cote.append(rarete, elem('span', 'note-potentiel', `Potentiel ${notePotentiel(owned)} %`));
  tete.append(identite, cote);

  // --- Attaques
  //
  // Deux lignes, deux emplois : l'auto-attaque tourne en boucle sur le
  // terrain, l'ultime ne sort qu'au palier 3 — un palier qui s'achète en
  // manche, en Poképièces. Il est affiché verrouillé plutôt que caché :
  // c'est lui qui donne envie de monter les paliers.
  const attaques = elem('div', 'grille-paires');

  const ligneAttaque = (
    move: typeof owned.auto,
    etiquette: string,
    cout: number,
    id: string,
    relancer: () => void,
    verrouille: boolean
  ): void => {
    const ligne = elem('div', 'paire');
    ligne.dataset['verrouille'] = String(verrouille);

    const gauche = elem('div');
    gauche.append(elem('span', 'attaque-role', etiquette), elem('b', undefined, move.name));
    const puce = elem('span', 'type', move.type);
    puce.dataset['type'] = move.type;
    puce.style.marginLeft = '8px';
    gauche.appendChild(puce);

    const droite = elem('div', 'paire-droite');
    droite.appendChild(
      elem(
        'code',
        undefined,
        `${move.power} · ${move.cooldown}s` + (move.cast > 0 ? ` · cast ${move.cast}s` : '')
      )
    );

    const bouton = elem('button', 'bouton-cout', `↻ ${cout}`);
    bouton.type = 'button';
    bouton.id = id;
    bouton.title = `Relancer — ${cout} cristaux`;
    bouton.disabled = compte.crystals < cout;
    bouton.addEventListener('click', relancer);
    droite.appendChild(bouton);

    ligne.append(gauche, droite);
    attaques.appendChild(ligne);
  };

  ligneAttaque(
    owned.auto,
    'Auto',
    COUT_REROLL_AUTO,
    'reroll-auto',
    () => {
      if (rerollAuto(compte, owned).ok) surChangement();
    },
    false
  );
  ligneAttaque(
    owned.ultime,
    `Ultime · palier ${PALIER_MAX}`,
    COUT_REROLL_ULTIME,
    'reroll-ultime',
    () => {
      if (rerollUltime(compte, owned).ok) surChangement();
    },
    true
  );

  // --- Traits
  const traits = elem('div', 'grille-paires');
  owned.traits.forEach((trait, index) => {
    const effet = trait.effect;
    const description =
      effet.kind === 'onKill'
        ? `+${effet.crystals} cristal par K.O.`
        : effet.kind === 'range'
          ? `portée +${effet.percent} %`
          : effet.kind === 'cooldown'
            ? `recharge −${effet.percent} %`
            : `${NOM_STAT[effet.stat]} +${effet.percent} %`;
    const ligne = elem('div', 'paire');
    const gauche = elem('div');
    gauche.append(elem('b', undefined, trait.name));
    const badge = elem('span', 'rarete', trait.rarity);
    badge.dataset['rarete'] = trait.rarity;
    badge.style.marginLeft = '8px';
    gauche.appendChild(badge);

    const droite = elem('div', 'paire-droite');
    droite.appendChild(elem('code', undefined, description));

    const relancer = elem('button', 'bouton-cout', `↻ ${COUT_REROLL_TRAIT_UNITE}`);
    relancer.type = 'button';
    relancer.id = `reroll-trait-${index}`;
    relancer.title = `Relancer ce trait — ${COUT_REROLL_TRAIT_UNITE} cristaux`;
    relancer.disabled = compte.crystals < COUT_REROLL_TRAIT_UNITE;
    relancer.addEventListener('click', () => {
      if (rerollTrait(compte, owned, index).ok) surChangement();
    });
    droite.appendChild(relancer);

    ligne.append(gauche, droite);
    traits.appendChild(ligne);
  });

  // --- Sub-stats
  const subs = elem('div', 'grille-paires');
  owned.subStats.forEach((sub, index) => {
    const cout = coutProchainPalier(sub.stack);
    const ligne = elem('button', 'paire achetable');
    ligne.type = 'button';
    ligne.id = `substat-${index}`;
    ligne.disabled = cout === null || compte.crystals < cout;
    ligne.title = cout === null ? 'Palier maximum atteint' : `Palier suivant : ${cout} cristaux`;

    const paliers = elem('div', 'paliers');
    for (let i = 0; i < SUBSTAT_MAX_STACK; i++) {
      const palier = elem('span', 'palier');
      palier.dataset['plein'] = String(i < sub.stack);
      paliers.appendChild(palier);
    }

    const gauche = elem('div');
    gauche.append(elem('b', undefined, NOM_STAT[sub.statType]));
    const cote = elem('code', undefined, cout === null ? 'max' : `+1 · ${cout}`);
    cote.style.marginLeft = '8px';
    gauche.appendChild(cote);

    ligne.append(gauche, paliers);
    ligne.addEventListener('click', () => {
      if (monterSubStat(compte, owned, index).ok) surChangement();
    });
    subs.appendChild(ligne);
  });

  // --- Stats reelles
  //
  // Le Pokedex brut ne bougeait ni au niveau, ni au palier de sub-stat, ni a
  // l'etoile : la fiche donnait donc l'impression qu'investir ne servait a
  // rien. Chaque ligne montre maintenant la valeur utilisee, le socle, et
  // d'ou vient l'ecart.
  const base = elem('div', 'grille-paires');
  for (const stat of Object.keys(species.baseStats) as StatType[]) {
    const detail = detailStat(owned, stat);
    const ligne = elem('div', 'paire');

    const gauche = elem('div');
    gauche.append(elem('b', undefined, NOM_STAT[stat]));
    const socle = elem('span', 'stat-socle', `socle ${detail.base}`);
    gauche.appendChild(socle);

    const droite = elem('div', 'paire-droite');
    droite.appendChild(elem('code', undefined, detail.valeur.toFixed(1)));
    const parts: string[] = [];
    if (detail.potentiel > 0) parts.push(`potentiel +${detail.potentiel.toFixed(1)} %`);
    if (detail.etoiles > 0) parts.push(`étoiles +${Math.round(detail.etoiles)} %`);
    if (detail.niveau > 0) parts.push(`niveau +${Math.round(detail.niveau)} %`);
    if (detail.subStats > 0) parts.push(`sub-stats +${Math.round(detail.subStats)} %`);
    if (parts.length) {
      const note = elem('span', 'stat-detail', parts.join(' · '));
      droite.appendChild(note);
    }

    ligne.append(gauche, droite);
    base.appendChild(ligne);
  }

  // --- Étoiles
  const requis = doublonsRequis(owned.stars);
  const dispos = doublonsDisponibles(compte, owned).length;
  const fusion = elem('div', 'fusion');
  const texteFusion = elem('div', 'fusion-texte');

  if (owned.stars >= ETOILES_MAX) {
    texteFusion.append(
      elem('span', 'fusion-titre', 'Sixième étoile atteinte'),
      elem('span', 'fusion-detail', `Stats de base ×${multiplicateurEtoiles(owned.stars).toFixed(2)}`)
    );
    fusion.append(texteFusion, elem('span', 'badge-shiny', 'Shiny'));
  } else if (owned.stars >= ETOILES_MAX_FUSION) {
    texteFusion.append(
      elem('span', 'fusion-titre', 'Sixième étoile'),
      elem('span', 'fusion-detail', 'Demande un fragment stellaire, rapporté des raids.')
    );
    const bouton = elem('button', 'bouton-cout', 'Fragment requis');
    bouton.type = 'button';
    bouton.id = 'fusionner';
    bouton.disabled = true;
    fusion.append(texteFusion, bouton);
  } else {
    texteFusion.append(
      elem('span', 'fusion-titre', `Passer à ${owned.stars + 1} étoiles`),
      elem(
        'span',
        'fusion-detail',
        `${requis} doublon${requis && requis > 1 ? 's' : ''} de ${species.name} — tu en as ${dispos}. Stats ×${multiplicateurEtoiles(owned.stars + 1).toFixed(2)}.`
      )
    );
    const bouton = elem('button', 'bouton-cout', 'Fusionner');
    bouton.type = 'button';
    bouton.id = 'fusionner';
    bouton.disabled = requis === null || dispos < requis;
    bouton.addEventListener('click', () => {
      if (fusionner(compte, owned).ok) surChangement();
    });
    fusion.append(texteFusion, bouton);
  }

  const relancerTraits = boutonCout('Relancer', COUT_REROLL_TRAITS, compte.crystals);
  relancerTraits.id = 'reroll-traits';
  relancerTraits.addEventListener('click', () => {
    if (rerollTraits(compte, owned).ok) surChangement();
  });

  const solde = elem('span', 'solde-vivant');
  solde.append(document.createTextNode('Solde '), elem('b', undefined, String(compte.crystals)));

  // --- Lignée
  //
  // L'évolution vient de l'expérience et elle est définitive : la fiche
  // montre donc la lignée entière, le stade atteint, et le niveau qui ouvre
  // le suivant. Savoir qu'il reste quatre niveaux avant Dracaufeu est
  // exactement ce qui donne envie de dépenser un bonbon.
  const formes = lignee(owned.speciesId);
  const stadeCourant = formes.findIndex((forme) => forme.id === owned.speciesId);
  const blocLignee = elem('div', 'lignee');
  formes.forEach((forme, rang) => {
    const etape = elem('div', 'lignee-etape');
    etape.dataset['courant'] = String(rang === stadeCourant);
    etape.dataset['atteint'] = String(rang <= stadeCourant);

    const precedente = formes[rang - 1];
    etape.append(
      elem('span', 'etiquette', `N°${String(forme.dexNumber).padStart(3, '0')}`),
      elem('b', undefined, forme.name)
    );
    const parNiveau = precedente ? evolutionParNiveau(precedente) : null;
    if (parNiveau) {
      etape.appendChild(elem('span', 'lignee-niveau', `niveau ${parNiveau.niveau}`));
    }
    blocLignee.appendChild(etape);
  });

  const suite = prochaineEvolution(owned);
  const noteLignee = elem(
    'span',
    'bloc-note',
    suite
      ? suite.restant > 0
        ? `${suite.espece.name} dans ${suite.restant} niveau${suite.restant > 1 ? 'x' : ''}`
        : `Évolue en ${suite.espece.name} au prochain gain`
      : 'Lignée terminée'
  );

  // --- Bonbons
  //
  // L'expérience ne vient plus seulement des manches : les bonbons en
  // donnent d'un coup, et c'est le seul moyen de pousser un Pokémon qu'on
  // n'emmène pas au combat. Ils tombent en fin de manche.
  const bonbons = elem('div', 'bonbons');
  const disponibles = bonbonsDisponibles(compte);
  if (!disponibles.length) {
    bonbons.appendChild(
      elem('p', 'affinites-vide', 'Aucun bonbon. Il en tombe à la fin des manches.')
    );
  }
  for (const { item, modele } of disponibles) {
    const bouton = elem('button', 'bonbon');
    bouton.type = 'button';
    bouton.id = `bonbon-${modele.id}`;
    const gauche = elem('div');
    gauche.append(
      elem('b', undefined, modele.name),
      elem('span', 'lignee-niveau', ` +${modele.xp} XP`)
    );
    bouton.append(gauche, elem('span', 'bonbon-quantite', `×${item.quantity}`));
    bouton.addEventListener('click', () => {
      const gain = donnerBonbon(compte, owned, modele.id);
      if (!gain.ok) return;
      if (gain.evolutions.length) {
        // Une évolution est un événement : on le dit, plutôt que de laisser
        // le joueur découvrir que sa fiche a changé de nom.
        surChangement();
        alerterEvolution(gain.evolutions.map((e) => e.name));
        return;
      }
      surChangement();
    });
    bonbons.appendChild(bouton);
  }

  // --- Pierres
  //
  // N'apparaissent que pour les Pokémon qui en emploient une : proposer une
  // Pierre Eau sur un Machoc ne ferait que du bruit. Le choix est
  // irréversible — c'est le seul du jeu — donc chaque option annonce la forme
  // qu'elle donne avant qu'on clique.
  const voies = pierresUtiles(compte, owned);
  const blocPierres = voies.length ? elem('div', 'bonbons') : null;
  for (const voie of voies) {
    const bouton = elem('button', 'bonbon');
    bouton.type = 'button';
    bouton.id = `pierre-${voie.modele.id}`;
    bouton.disabled = voie.quantite < 1;
    bouton.title =
      voie.quantite < 1
        ? `${voie.modele.name} — il n’en tombe que dans les raids`
        : `Évoluer en ${voie.forme.name}. Irréversible.`;

    const gauche = elem('div');
    gauche.append(
      elem('span', 'raid-glyphe', voie.modele.glyphe),
      elem('b', undefined, voie.modele.name),
      elem('span', 'lignee-niveau', ` → ${voie.forme.name}`)
    );
    bouton.append(gauche, elem('span', 'bonbon-quantite', `×${voie.quantite}`));
    bouton.addEventListener('click', () => {
      const usage = employerPierre(compte, owned, voie.modele.id);
      if (!usage.ok || !usage.forme) return;
      surChangement();
      void alerterEvolution([usage.forme.name, ...usage.suite.map((e) => e.name)]);
    });
    blocPierres!.appendChild(bouton);
  }

  // --- Affinités
  //
  // La table des types décide de la moitié des dégâts du jeu : elle doit être
  // consultable sur la fiche, pas seulement subie sur le terrain.
  const affinites = elem('div', 'affinites');
  const faiblesses = analyseAffinites(species.types);
  const rangeeAffinite = (titre: string, types: readonly string[]): void => {
    const ligne = elem('div', 'affinites-ligne');
    ligne.appendChild(elem('span', 'etiquette', titre));
    if (!types.length) {
      ligne.appendChild(elem('span', 'affinites-vide', '—'));
    }
    for (const type of types) {
      const puce = elem('span', 'type', type);
      puce.dataset['type'] = type;
      ligne.appendChild(puce);
    }
    affinites.appendChild(ligne);
  };
  rangeeAffinite('Faible contre', faiblesses.faiblesses);
  rangeeAffinite('Résiste à', faiblesses.resistances);
  rangeeAffinite('Immunisé à', faiblesses.immunites);

  panneau.append(
    tete,
    bloc('Étoiles', fusion, rangeeEtoiles(owned.stars, owned.shiny)),
    bloc('Attaques', attaques, elem('span', 'bloc-note', 'L’ultime se débloque en manche')),
    bloc('Traits', traits, relancerTraits),
    bloc(`Sub-stats — ${SUBSTAT_MAX_STACK} paliers maximum`, subs, solde),
    bloc('Stats réelles', base),
    bloc('Affinités — ce qu’il encaisse', affinites),
    bloc('Lignée', blocLignee, noteLignee),
    bloc('Bonbons', bonbons)
  );
  if (blocPierres) {
    panneau.appendChild(
      bloc('Pierres — choix définitif', blocPierres, elem('span', 'bloc-note', 'Butin de raid'))
    );
  }
}

/** Affiche l'équipe et rend la main au retour. */
export function ouvrirEquipe(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  const compteurTitre = elem('h1', 'titre titre-xl');
  titre.append(elem('p', 'etiquette', 'Six Pokémon au plus'), compteurTitre);

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'equipe-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  // Le tri n'est pas sauvegarde : il repond a une question du moment, alors
  // que le favori est un choix qu'on veut retrouver.
  let triCourant = 'equipe';
  const barre = elem('div', 'barre-outils');

  const liste = elem('div', 'equipe-liste');
  const detail = elem('div', 'equipe-detail');
  const colonne = elem('div', 'equipe-colonne');
  colonne.append(barre, liste);

  const corps = elem('div', 'equipe-corps');
  corps.append(colonne, detail);

  let choisi = compte.roster[0] ?? null;

  const selectionner = (owned: OwnedPokemon): void => {
    choisi = owned;
    for (const vignette of liste.querySelectorAll('.equipe-vignette')) {
      vignette.setAttribute('aria-pressed', String(vignette.id === `equipe-${owned.id}`));
    }
    rafraichir();
  };

  const rafraichir = (): void => {
    if (choisi) remplirDetail(detail, choisi, compte, apresDepense);
  };

  // Toute dépense est sauvegardée : le joueur ne doit pas perdre un reroll
  // parce qu'il a fermé l'onglet juste après.
  const apresDepense = (): void => {
    account.touch();
    rafraichir();
  };

  /**
   * Reconstruit la liste.
   *
   * Les membres de l'équipe remontent en tête : c'est la composition qu'on
   * vient vérifier ici, pas l'ordre d'obtention.
   */
  const construireListe = (): void => {
    liste.innerHTML = '';
    compteurTitre.textContent = `Mon équipe — ${compte.team.length}/${EQUIPE_MAX}`;

    barre.innerHTML = '';
    barre.appendChild(
      selecteurTri(
        [{ id: 'equipe', libelle: 'Équipe d’abord', comparer: () => 0 }, ...TRIS_POKEMON],
        triCourant,
        (id) => {
          triCourant = id;
          construireListe();
        }
      )
    );

    // « Équipe d'abord » reste le tri par défaut : c'est la question que
    // l'écran pose, les autres critères servent à composer.
    const option = TRIS_POKEMON.find((tri) => tri.id === triCourant);
    const ordonne = trier(compte.roster, {
      id: triCourant,
      libelle: '',
      comparer: (a, b) => {
        if (option) return option.comparer(a, b);
        const da = dansEquipe(compte, a) ? 0 : 1;
        const db = dansEquipe(compte, b) ? 0 : 1;
        return da - db;
      },
    });

    for (const owned of ordonne) {
      const species = getSpecies(owned.speciesId);
      const engage = dansEquipe(compte, owned);

      const rangee = elem('div', 'equipe-rangee');
      rangee.dataset['engage'] = String(engage);

      const vignette = elem('button', 'equipe-vignette');
      vignette.type = 'button';
      vignette.id = `equipe-${owned.id}`;
      vignette.setAttribute('aria-pressed', String(choisi?.id === owned.id));

      const pastille = pastillePokemon(owned.speciesId);

      const texte = elem('span', 'unite-texte');
      texte.append(
        elem('span', 'unite-nom', species.name),
        elem('span', 'unite-detail', `${rareteDe(owned)} · niveau ${owned.level}`),
        rangeeEtoiles(owned.stars, owned.shiny, 'vignette-etoiles')
      );

      vignette.append(pastille, texte);
      vignette.appendChild(
        boutonFavori(
          owned.favori,
          () => {
            owned.favori = !owned.favori;
            account.touch();
            construireListe();
          },
          `favori-${owned.id}`
        )
      );
      vignette.addEventListener('click', () => selectionner(owned));

      const bascule = elem('button', 'equipe-bascule', engage ? '−' : '+');
      bascule.type = 'button';
      bascule.id = `bascule-${owned.id}`;
      bascule.title = engage
        ? 'Retirer de l’équipe'
        : compte.team.length >= EQUIPE_MAX
          ? 'Équipe complète'
          : 'Ajouter à l’équipe';
      bascule.setAttribute('aria-pressed', String(engage));
      bascule.disabled = !engage && compte.team.length >= EQUIPE_MAX;
      bascule.addEventListener('click', () => {
        if (!basculerEquipe(compte, owned)) return;
        account.touch();
        construireListe();
      });

      rangee.append(vignette, bascule);
      liste.appendChild(rangee);
    }
  };

  construireListe();
  if (choisi) rafraichir();
  else detail.appendChild(elem('p', 'sous-titre', 'Ton équipe est vide.'));

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
