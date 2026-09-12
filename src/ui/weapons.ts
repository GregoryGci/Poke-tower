/**
 * Écran des armes.
 *
 * Le râteau glissé dans l'écran d'équipe ne suffisait plus : une arme n'est
 * plus un objet à trois chiffres mais une rune, avec un palier, une innée et
 * quatre lignes à travailler. Elle a donc son écran.
 *
 * La fiche affiche tout, y compris les emplacements encore fermés et le palier
 * qui les ouvrira : c'est cette visibilité qui donne envie d'améliorer. Cacher
 * ce qu'on peut gagner transforme la mécanique en loterie aveugle.
 *
 * Les règles et les coûts vivent dans data/weapon-upgrade ; cet écran appelle
 * et réaffiche, il ne décide de rien.
 */

import { LIBELLE_RARETE } from '@/data/gacha';
import {
  COUT_GEMME,
  COUT_MEULE,
  LIBELLE_STAT,
  NIVEAU_MAX,
  PALIERS_SUBSTAT,
  SUBSTATS_MAX,
  UNITE_STAT,
  ameliorer,
  chanceReussite,
  coutAmelioration,
  meuler,
  sertirGemme,
  statsArme,
  TRIS_ARMES,
} from '@/data/weapon-upgrade';
import { boutonFavori, selecteurTri, trier } from './tri';
import type { OwnedWeapon, PlayerAccount, WeaponStat } from '@/data/types';
import type { AccountManager } from '@/save';
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

/** Une stat mise en forme : « Cadence +5,2 % ». */
function libelle(stat: WeaponStat): string {
  const valeur = Number.isInteger(stat.valeur) ? String(stat.valeur) : stat.valeur.toFixed(1);
  return `${LIBELLE_STAT[stat.kind]} +${valeur}${UNITE_STAT[stat.kind]}`;
}

function chiffre(etiquette: string, valeur: string): HTMLDivElement {
  const bloc = elem('div', 'arme-mesure');
  bloc.append(elem('span', 'etiquette', etiquette), elem('b', undefined, valeur));
  return bloc;
}

/** Une ligne de sub-stat, ouverte ou encore fermée. */
function ligneSubStat(
  stat: WeaponStat | null,
  index: number,
  compte: PlayerAccount,
  arme: OwnedWeapon,
  surChangement: () => void
): HTMLDivElement {
  const ligne = elem('div', 'arme-ligne');
  ligne.dataset['ouverte'] = String(stat !== null);

  if (!stat) {
    // Un emplacement fermé annonce son palier : le joueur sait ce qu'il achète
    // en montant, au lieu de le découvrir.
    const palier = PALIERS_SUBSTAT[index];
    ligne.append(
      elem('span', 'arme-ligne-nom', 'Emplacement fermé'),
      elem('span', 'arme-ligne-note', palier === undefined ? '' : `S’ouvre à +${palier}`)
    );
    return ligne;
  }

  const gauche = elem('div', 'arme-ligne-texte');
  gauche.append(elem('span', 'arme-ligne-nom', libelle(stat)));
  // Les rolls encaissés se lisent comme les points d'une rune : c'est ce qui
  // distingue une ligne chanceuse d'une ligne travaillée.
  if (stat.rolls > 1) {
    gauche.appendChild(elem('span', 'arme-ligne-note', `${stat.rolls} rolls`));
  }

  const actions = elem('div', 'arme-ligne-actions');

  const meule = elem('button', 'bouton-cout', `Meule — ${COUT_MEULE}`);
  meule.type = 'button';
  meule.id = `meule-${index}`;
  meule.title = 'Rejoue la valeur, sans changer la stat';
  meule.disabled = compte.crystals < COUT_MEULE;
  meule.addEventListener('click', () => {
    if (meuler(compte, arme, index).ok) surChangement();
  });

  const gemme = elem('button', 'bouton-cout', `Gemme — ${COUT_GEMME}`);
  gemme.type = 'button';
  gemme.id = `gemme-${index}`;
  gemme.title = 'Remplace la stat par une autre';
  gemme.disabled = compte.crystals < COUT_GEMME;
  gemme.addEventListener('click', () => {
    if (sertirGemme(compte, arme, index).ok) surChangement();
  });

  actions.append(meule, gemme);
  ligne.append(gauche, actions);
  return ligne;
}

/** Reconstruit la fiche de l'arme choisie. */
function remplirFiche(
  panneau: HTMLElement,
  arme: OwnedWeapon,
  compte: PlayerAccount,
  surChangement: () => void,
  surEquipement: () => void
): void {
  const stats = statsArme(arme);
  panneau.innerHTML = '';

  /* ---- Identité ---- */

  const tete = elem('div', 'detail-tete');
  const identite = elem('div');
  identite.append(
    elem('p', 'etiquette', stats.modele.description),
    elem('h2', 'titre titre-m', `${stats.nom} +${arme.niveau}`)
  );
  const badge = elem('span', 'rarete', LIBELLE_RARETE[arme.rarity]);
  badge.dataset['rarete'] = arme.rarity;
  tete.append(identite, badge);

  /* ---- Ce que l'arme fait réellement ---- */

  const mesures = elem('div', 'arme-mesures');
  mesures.append(
    chiffre('Dégâts', stats.damage.toFixed(1)),
    chiffre('Cadence', `${(1 / stats.cooldown).toFixed(2)}/s`),
    chiffre('Portée', stats.range.toFixed(1)),
    chiffre('Cast', stats.cast > 0 ? `${stats.cast.toFixed(2)}s` : '—')
  );

  const extras = elem('div', 'arme-mesures');
  extras.append(
    chiffre('Style', stats.modele.style === 'unique' ? 'Cible' : stats.modele.style),
    chiffre('Zone', `×${stats.zone.toFixed(2)}`),
    chiffre('Cristaux', `+${Math.round(stats.cristaux * 100)} %`)
  );

  /* ---- Stat principale et innée ---- */

  const principale = elem('div', 'arme-ligne');
  principale.dataset['ouverte'] = 'true';
  principale.dataset['role'] = 'principale';
  principale.append(
    elem('span', 'arme-ligne-nom', `Dégâts ${stats.damage.toFixed(1)}`),
    elem(
      'span',
      'arme-ligne-note',
      `socle ${stats.modele.damage} · +${arme.niveau} palier${arme.niveau > 1 ? 's' : ''}`
    )
  );

  const innee = elem('div', 'arme-ligne');
  innee.dataset['ouverte'] = 'true';
  innee.dataset['role'] = 'innee';
  innee.append(
    elem('span', 'arme-ligne-nom', arme.innee ? libelle(arme.innee) : 'Aucune innée'),
    elem('span', 'arme-ligne-note', 'Innée · non modifiable')
  );

  /* ---- Sub-stats ---- */

  const lignes = elem('div', 'arme-lignes');
  for (let i = 0; i < SUBSTATS_MAX; i++) {
    lignes.appendChild(ligneSubStat(arme.subStats[i] ?? null, i, compte, arme, surChangement));
  }

  /* ---- Amélioration ---- */

  const cout = coutAmelioration(arme);
  const chance = chanceReussite(arme);

  const amelioration = elem('div', 'arme-amelioration');
  const texte = elem('div', 'fusion-texte');
  const prochain = arme.niveau + 1;
  const ouvre = (PALIERS_SUBSTAT as readonly number[]).includes(prochain);
  texte.append(
    elem(
      'span',
      'fusion-titre',
      cout === null ? `Palier maximum · +${NIVEAU_MAX}` : `Passer à +${prochain}`
    ),
    elem(
      'span',
      'fusion-detail',
      cout === null
        ? 'Cette arme ne peut plus monter.'
        : `${Math.round(chance * 100)} % de réussite${
            ouvre
              ? arme.subStats.length < SUBSTATS_MAX
                ? ' · ouvre une sub-stat'
                : ' · renforce une sub-stat'
              : ''
          }${chance < 1 ? ' · les cristaux sont perdus en cas d’échec' : ''}`
    )
  );

  const bouton = elem('button', 'bouton bouton-primaire');
  bouton.type = 'button';
  bouton.id = 'ameliorer-arme';
  bouton.textContent = cout === null ? 'Au maximum' : `Améliorer — ${cout} ◆`;
  bouton.disabled = cout === null || compte.crystals < cout;

  const journal = elem('p', 'arme-journal');

  bouton.addEventListener('click', () => {
    const resultat = ameliorer(compte, arme);
    if (!resultat.ok) return;
    surChangement();
    // Le message est écrit après la reconstruction : la fiche est déjà à jour
    // quand le joueur lit ce qui vient de se passer.
    const nouveau = panneau.querySelector<HTMLElement>('.arme-journal');
    if (!nouveau) return;
    if (!resultat.reussi) {
      nouveau.dataset['issue'] = 'echec';
      ecrire(nouveau, 'Échec. Les cristaux sont perdus, le palier ne bouge pas.');
      return;
    }
    nouveau.dataset['issue'] = 'reussite';
    if (resultat.nouvelle) {
      ecrire(nouveau, `Nouvelle ligne : ${libelle(resultat.nouvelle)}.`);
    } else if (resultat.renforcee) {
      ecrire(nouveau, `Ligne renforcée : ${libelle(resultat.renforcee)}.`);
    } else {
      ecrire(nouveau, 'Palier gagné.');
    }
  });

  amelioration.append(texte, bouton);

  /* ---- Port de l'arme ---- */

  const portee = compte.equippedWeaponId === arme.id;
  const equiper = elem('button', portee ? 'bouton' : 'bouton bouton-primaire');
  equiper.type = 'button';
  equiper.id = 'equiper-arme';
  equiper.textContent = portee ? 'Portée par le dresseur' : 'Équiper';
  equiper.disabled = portee;
  equiper.addEventListener('click', () => {
    compte.equippedWeaponId = arme.id;
    surEquipement();
  });

  const bloc = (titre: string, contenu: HTMLElement): HTMLDivElement => {
    const section = elem('div', 'bloc');
    const enTete = elem('div', 'bloc-tete');
    enTete.append(elem('p', 'etiquette', titre));
    section.append(enTete, contenu);
    return section;
  };

  const socle = elem('div', 'arme-socle');
  socle.append(principale, innee);

  panneau.append(
    tete,
    bloc('En jeu', mesures),
    bloc('Comportement', extras),
    bloc('Stat principale et innée', socle),
    bloc(`Sub-stats — ${arme.subStats.length}/${SUBSTATS_MAX}`, lignes),
    bloc('Amélioration', amelioration),
    journal,
    equiper
  );
}

/** Affiche l'écran des armes et rend la main au retour. */
export function ouvrirArmes(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  const compteur = elem('h1', 'titre titre-xl');
  titre.append(elem('p', 'etiquette', 'Arsenal du dresseur'), compteur);

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'armes-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  // Le tri n'est pas sauvegarde ; le favori l'est. L'un explore, l'autre
  // ramene a ce qu'on travaille.
  let triCourant = 'portee';
  const barre = elem('div', 'barre-outils');

  const liste = elem('div', 'equipe-liste');
  const fiche = elem('div', 'equipe-detail');

  const colonne = elem('div', 'equipe-colonne');
  colonne.append(barre, liste);

  const corps = elem('div', 'equipe-corps');
  corps.append(colonne, fiche);

  let choisie: OwnedWeapon | null =
    compte.weapons.find((arme) => arme.id === compte.equippedWeaponId) ?? compte.weapons[0] ?? null;

  const rafraichirFiche = (): void => {
    if (!choisie) {
      fiche.innerHTML = '';
      fiche.appendChild(
        elem('p', 'sous-titre', 'Aucune arme. Le portail d’invocation en distribue.')
      );
      return;
    }
    remplirFiche(fiche, choisie, compte, apresDepense, apresEquipement);
  };

  // Toute dépense est sauvegardée : le joueur ne doit pas perdre un palier
  // parce qu'il a quitté l'écran juste après.
  const apresDepense = (): void => {
    account.touch();
    construireListe();
    rafraichirFiche();
  };

  const apresEquipement = (): void => {
    account.touch();
    construireListe();
    rafraichirFiche();
  };

  const selectionner = (arme: OwnedWeapon): void => {
    choisie = arme;
    construireListe();
    rafraichirFiche();
  };

  /**
   * Reconstruit la liste.
   *
   * L'arme portée remonte en tête, puis les paliers les plus hauts : c'est
   * l'ordre dans lequel on cherche, pas l'ordre d'obtention.
   */
  function construireListe(): void {
    liste.innerHTML = '';
    compteur.textContent = `Armes — ${compte.weapons.length} · ${compte.crystals} ◆`;

    barre.innerHTML = '';
    barre.appendChild(
      selecteurTri(
        [{ id: 'portee', libelle: 'Arme portée d’abord', comparer: () => 0 }, ...TRIS_ARMES],
        triCourant,
        (id) => {
          triCourant = id;
          construireListe();
        }
      )
    );

    const option = TRIS_ARMES.find((tri) => tri.id === triCourant);
    const ordonnees = trier(compte.weapons, {
      id: triCourant,
      libelle: '',
      comparer: (a, b) => {
        if (option) return option.comparer(a, b);
        const pa = a.id === compte.equippedWeaponId ? 0 : 1;
        const pb = b.id === compte.equippedWeaponId ? 0 : 1;
        return pa - pb || b.niveau - a.niveau;
      },
    });

    for (const arme of ordonnees) {
      const stats = statsArme(arme);
      const portee = arme.id === compte.equippedWeaponId;

      const rangee = elem('div', 'equipe-rangee');
      rangee.dataset['engage'] = String(portee);

      const vignette = elem('button', 'equipe-vignette');
      vignette.type = 'button';
      vignette.id = `arme-${arme.id}`;
      vignette.setAttribute('aria-pressed', String(choisie?.id === arme.id));

      const pastille = elem('span', 'pastille pastille-arme', `+${arme.niveau}`);

      const texte = elem('span', 'unite-texte');
      texte.append(
        elem('span', 'unite-nom', stats.nom),
        elem('span', 'unite-detail', `${LIBELLE_RARETE[arme.rarity]} · ${stats.damage.toFixed(1)} dégâts`),
        elem(
          'span',
          'unite-detail',
          `${arme.subStats.length}/${SUBSTATS_MAX} sub-stats`
        )
      );

      vignette.append(pastille, texte);
      vignette.appendChild(
        boutonFavori(
          arme.favori,
          () => {
            arme.favori = !arme.favori;
            account.touch();
            construireListe();
          },
          `favori-${arme.id}`
        )
      );
      vignette.addEventListener('click', () => selectionner(arme));
      rangee.appendChild(vignette);
      liste.appendChild(rangee);
    }
  }

  construireListe();
  rafraichirFiche();

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
