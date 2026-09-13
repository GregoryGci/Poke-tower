/**
 * Le sac.
 *
 * Tout ce qui n'est ni un Pokémon, ni une arme, ni une monnaie : les pierres,
 * les bonbons, et les objets à équiper.
 *
 * Deux moitiés, et la séparation n'est pas décorative. À gauche les
 * **consommables** : on les dépense, ils disparaissent, et la question qu'on
 * se pose est « sur qui ? ». À droite les **objets** : ils restent, ils se
 * portent, et la question est « qui les a ? ». Les mélanger dans une grille
 * unique obligerait à relire le type de chaque case avant de savoir ce qu'on
 * peut en faire.
 *
 * Les pierres et les bonbons vivaient jusqu'ici dans le bandeau de monnaies
 * du menu, où ils ne servaient à rien : on voyait qu'on en avait trois, sans
 * pouvoir les employer. Un stock qu'on ne peut pas dépenser depuis l'endroit
 * où on le lit n'est qu'un chiffre.
 */

import { BONBONS, bonbonsDisponibles, donnerBonbon } from '@/data/bonbons';
import { PIERRES, formeApresPierre, pierresDisponibles, employerPierre } from '@/data/pierres';
import {
  FAMILLES_ITEM,
  LIBELLE_ITEM_STAT,
  getFamille,
  valeurPrincipale,
  type OwnedItem,
} from '@/data/items';
import { LIBELLE_RARETE } from '@/data/gacha';
import { getSpecies } from '@/data/content';
import { pastillePokemon } from './pastille';
import { alerterEvolution, alerterInfo } from './evolution-annonce';
import type { AccountManager } from '@/save';
import type { OwnedPokemon } from '@/data/types';

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

/**
 * Demande sur quel Pokémon employer un consommable.
 *
 * `eligible` filtre le roster : une Pierre Eau n'a rien à faire sur un
 * Machoc, et la proposer quand même obligerait le joueur à connaître par
 * cœur les lignées d'évolution pour ne pas gâcher sa pierre.
 */
function choisirCible(
  roster: readonly OwnedPokemon[],
  titre: string,
  detail: (owned: OwnedPokemon) => string,
  eligible: (owned: OwnedPokemon) => boolean
): Promise<OwnedPokemon | null> {
  const voile = elem('div', 'voile-reglages');
  const panneau = elem('div', 'reglages');

  const haut = elem('div', 'equipe-haut');
  const bloc = elem('div');
  bloc.append(elem('p', 'etiquette', 'Sur qui ?'), elem('h2', 'titre titre-m', titre));
  const annuler = elem('button', 'bouton-discret', 'Annuler');
  annuler.type = 'button';
  annuler.id = 'cible-annuler';
  haut.append(bloc, annuler);
  panneau.appendChild(haut);

  const candidats = roster.filter(eligible);

  return new Promise<OwnedPokemon | null>((resolve) => {
    const partir = (choix: OwnedPokemon | null): void => {
      window.removeEventListener('keydown', surTouche);
      voile.remove();
      resolve(choix);
    };
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') partir(null);
    };

    if (candidats.length === 0) {
      panneau.appendChild(
        elem('p', 'affinites-vide', 'Aucun Pokémon de ta collection n’en tirerait quelque chose.')
      );
    }

    const liste = elem('div', 'sac-cibles');
    for (const owned of candidats) {
      const espece = getSpecies(owned.speciesId);
      const bouton = elem('button', 'sac-cible');
      bouton.type = 'button';
      bouton.id = `cible-${owned.id}`;
      const texte = elem('div');
      texte.append(
        elem('b', undefined, espece.name),
        elem('span', 'sac-cible-detail', detail(owned))
      );
      bouton.append(pastillePokemon(owned.speciesId), texte);
      bouton.addEventListener('click', () => partir(owned));
      liste.appendChild(bouton);
    }
    panneau.appendChild(liste);

    voile.appendChild(panneau);
    document.body.appendChild(voile);
    annuler.focus();

    window.addEventListener('keydown', surTouche);
    annuler.addEventListener('click', () => partir(null));
    voile.addEventListener('click', (evenement) => {
      if (evenement.target === voile) partir(null);
    });
  });
}

/** Une ligne d'objet équipable, avec son porteur s'il en a un. */
function ligneObjet(item: OwnedItem, porteur: OwnedPokemon | null): HTMLDivElement {
  const famille = getFamille(item.familleId);
  const ligne = elem('div', 'sac-objet');
  ligne.dataset['rarete'] = item.rarity;

  const tete = elem('div', 'sac-objet-tete');
  tete.append(
    elem('span', 'raid-glyphe', famille?.glyphe ?? '◇'),
    elem('b', undefined, famille?.nom ?? item.familleId)
  );
  const badge = elem('span', 'rarete', LIBELLE_RARETE[item.rarity]);
  badge.dataset['rarete'] = item.rarity;
  tete.appendChild(badge);
  ligne.appendChild(tete);

  ligne.appendChild(
    elem(
      'code',
      undefined,
      `${LIBELLE_ITEM_STAT[item.principale.kind]} +${valeurPrincipale(item)} %`
    )
  );

  const pied = elem('div', 'sac-objet-pied');
  pied.append(elem('span', 'etiquette', `Emplacement ${item.emplacement} · +${item.niveau}`));
  // Le porteur en clair : sans lui, on ne sait pas si vendre un objet
  // désarmerait un Pokémon de l'équipe.
  pied.appendChild(
    elem(
      'span',
      'sac-porteur',
      porteur ? `Porté par ${getSpecies(porteur.speciesId).name}` : 'Au sac'
    )
  );
  ligne.appendChild(pied);
  return ligne;
}

/** Ouvre le sac et rend la main à la fermeture. */
export function ouvrirSac(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Inventaire'),
    elem('h1', 'titre titre-xl', 'Sac')
  );
  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'sac-retour';
  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const corps = elem('div', 'sac-corps');
  racine.append(haut, corps);
  document.body.appendChild(racine);

  const redessiner = (): void => {
    corps.replaceChildren();

    /* ---- Consommables ---- */

    const gauche = elem('div', 'sac-colonne');
    gauche.appendChild(elem('p', 'etiquette', 'Consommables'));

    const pierres = pierresDisponibles(compte);
    const bonbons = bonbonsDisponibles(compte);

    if (pierres.length === 0 && bonbons.length === 0) {
      gauche.appendChild(
        elem(
          'p',
          'affinites-vide',
          'Rien à consommer. Les pierres tombent en raid ; les bonbons, à la fin de chaque manche.'
        )
      );
    }

    for (const { modele, quantite } of pierres) {
      const carte = elem('button', 'sac-consommable');
      carte.type = 'button';
      carte.id = `pierre-${modele.id}`;
      const texte = elem('div');
      texte.append(
        elem('b', undefined, modele.name),
        elem('span', 'sac-cible-detail', 'Déclenche une évolution qui n’attend pas le niveau.')
      );
      carte.append(
        elem('span', 'raid-glyphe', modele.glyphe),
        texte,
        elem('code', undefined, `×${quantite}`)
      );
      carte.addEventListener('click', () => {
        void (async () => {
          const cible = await choisirCible(
            compte.roster,
            modele.name,
            (owned) => {
              const forme = formeApresPierre(owned, modele.id);
              return forme ? `Deviendrait ${forme.name}` : '';
            },
            (owned) => formeApresPierre(owned, modele.id) !== null
          );
          if (!cible) return;
          const usage = employerPierre(compte, cible, modele.id);
          if (!usage.ok || !usage.forme) return;
          account.touch();
          await account.flush();
          await alerterEvolution([usage.forme.name, ...usage.suite.map((e) => e.name)]);
          redessiner();
        })();
      });
      gauche.appendChild(carte);
    }

    for (const { item, modele } of bonbons) {
      const carte = elem('button', 'sac-consommable');
      carte.type = 'button';
      carte.id = `bonbon-${modele.id}`;
      const texte = elem('div');
      texte.append(
        elem('b', undefined, modele.name),
        elem('span', 'sac-cible-detail', `+${modele.xp} XP`)
      );
      carte.append(
        elem('span', 'raid-glyphe', '🍬'),
        texte,
        elem('code', undefined, `×${item.quantity}`)
      );
      carte.addEventListener('click', () => {
        void (async () => {
          // Tout le roster est éligible : un bonbon profite à n'importe qui.
          const cible = await choisirCible(
            compte.roster,
            modele.name,
            (owned) => `Niveau ${owned.level}`,
            () => true
          );
          if (!cible) return;
          const gain = donnerBonbon(compte, cible, modele.id);
          if (!gain.ok) return;
          account.touch();
          await account.flush();
          const nom = getSpecies(cible.speciesId).name;
          if (gain.evolutions.length) {
            await alerterEvolution(gain.evolutions.map((espece) => espece.name));
          } else {
            await alerterInfo(
              modele.name,
              nom,
              gain.niveaux > 0
                ? [`+${modele.xp} XP`, `${gain.niveaux} niveau${gain.niveaux > 1 ? 'x' : ''} pris`]
                : [`+${modele.xp} XP`]
            );
          }
          redessiner();
        })();
      });
      gauche.appendChild(carte);
    }

    /* ---- Objets à équiper ---- */

    const droite = elem('div', 'sac-colonne');
    droite.appendChild(elem('p', 'etiquette', 'Objets'));

    const objets = compte.items ?? [];
    if (objets.length === 0) {
      droite.appendChild(
        elem(
          'p',
          'affinites-vide',
          'Aucun objet. Ils tombent à chaque raid gagné, et leur palier dépend du cran.'
        )
      );
    }

    // Qui porte quoi : on l'établit une fois pour tout le sac plutôt que de
    // parcourir le roster à chaque ligne.
    const porteurs = new Map<string, OwnedPokemon>();
    for (const membre of compte.roster) {
      for (const id of membre.items ?? []) {
        if (id) porteurs.set(id, membre);
      }
    }

    const tries = [...objets].sort((a, b) => a.familleId.localeCompare(b.familleId));
    for (const item of tries) {
      droite.appendChild(ligneObjet(item, porteurs.get(item.id) ?? null));
    }

    // Le rappel des sets : c'est la seule information qui ne se lit sur aucune
    // ligne prise isolément.
    const rappel = elem('div', 'sac-sets');
    rappel.appendChild(elem('p', 'etiquette', 'Sets'));
    for (const famille of FAMILLES_ITEM) {
      const possedes = objets.filter((item) => item.familleId === famille.id).length;
      const ligne = elem('div', 'raid-drop');
      ligne.append(
        elem('span', 'raid-glyphe', famille.glyphe),
        elem('span', undefined, `${famille.nom} — ${famille.description}`),
        elem('code', undefined, `${possedes}/${famille.pieces}`)
      );
      rappel.appendChild(ligne);
    }
    droite.appendChild(rappel);

    corps.append(gauche, droite);
  };

  redessiner();

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

/** Les modèles connus — sert aux vérifications. */
export const CONSOMMABLES = [...PIERRES.map((p) => p.id), ...BONBONS.map((b) => b.id)];
