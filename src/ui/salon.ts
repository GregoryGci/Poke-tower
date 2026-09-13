/**
 * Salon de coopération.
 *
 * Un code à six caractères, et rien d'autre. Pas de liste de parties
 * publiques, pas de recherche d'équipier : un raid à deux se joue avec
 * quelqu'un qu'on connaît, et un code se dicte au téléphone. L'alphabet évite
 * les caractères qu'on confond à l'oral — c'est là que se joue l'essentiel de
 * l'utilisabilité d'un salon.
 *
 * C'est l'**hôte** qui choisit le raid et le cran : c'est lui qui simule, donc
 * lui qui décide. L'invité voit la décision se mettre à jour chez lui et se
 * déclare prêt. Laisser les deux voter aurait demandé un arbitrage dont
 * personne n'a besoin à deux joueurs.
 */

import {
  DIFFICULTES,
  LIBELLE_DIFFICULTE,
  RAIDS,
  VIE_PAR_DIFFICULTE,
  raidOuvert,
  type Difficulte,
  type Raid,
} from '@/data/raids';
import { membresEquipe, normaliserEquipe } from '@/data/team';
import { clientSupabase } from '@/save/client';
import { ouvrirCanal } from '@/net/canal';
import { genererCode, normaliserCode, type Presence } from '@/net/protocole';
import { Salon, type Depart } from '@/net/partie';
import type { SessionCoop } from '@/net/partie';
import type { PlayerAccount } from '@/data/types';

export interface PartieCoop {
  session: SessionCoop;
  raid: Raid;
  difficulte: Difficulte;
}

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
 * Ouvre l'écran de coopération.
 *
 * Rend la partie négociée, ou null si le joueur repart. Le canal reste ouvert
 * dans le premier cas : c'est la manche qui le fermera.
 */
export function ouvrirSalon(compte: PlayerAccount): Promise<PartieCoop | null> {
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Un code, deux dresseurs'),
    elem('h1', 'titre titre-xl', 'Coopération')
  );

  const retour = elem('button', 'bouton-discret', 'Retour');
  retour.type = 'button';
  retour.id = 'salon-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const corps = elem('div', 'salon-corps');
  racine.append(haut, corps);
  document.body.appendChild(racine);

  return new Promise<PartieCoop | null>((resolve) => {
    let salon: Salon | null = null;
    let fermer: (() => void) | null = null;

    const partir = (resultat: PartieCoop | null): void => {
      fermer?.();
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve(resultat);
      }, 220);
    };

    retour.addEventListener('click', () => {
      // Quitter l'écran doit quitter le canal : un salon fantôme laisserait
      // l'autre joueur devant un équipier qui ne répond plus.
      void salon?.quitter();
      partir(null);
    });

    /* ---------- Accueil : créer ou rejoindre ---------- */

    const accueil = elem('div', 'salon-accueil');

    const creer = elem('button', 'bouton-primaire', 'Créer un salon');
    creer.type = 'button';
    creer.id = 'salon-creer';

    const saisie = elem('input', 'salon-code-saisie');
    saisie.id = 'salon-code-saisie';
    saisie.placeholder = 'Code du salon';
    saisie.maxLength = 8;
    saisie.autocapitalize = 'characters';
    saisie.spellcheck = false;

    const rejoindre = elem('button', 'bouton-discret', 'Rejoindre');
    rejoindre.type = 'button';
    rejoindre.id = 'salon-rejoindre';

    const erreur = elem('p', 'salon-erreur');
    erreur.id = 'salon-erreur';

    const ligneRejoindre = elem('div', 'salon-ligne');
    ligneRejoindre.append(saisie, rejoindre);
    accueil.append(creer, elem('span', 'salon-ou', 'ou'), ligneRejoindre, erreur);
    corps.appendChild(accueil);

    const dire = (texte: string): void => {
      erreur.textContent = texte;
    };

    const maPresence = (): Presence => {
      normaliserEquipe(compte);
      const equipe = membresEquipe(compte);
      return {
        joueur: compte.id,
        nom: compte.trainerName || 'Dresseur',
        // Le rôle est réécrit par l'appelant : la présence sert aussi à
        // s'annoncer, et on ne s'annonce pas avec le rôle de l'autre.
        role: 'invite',
        // L'hôte doit précharger les espèces de l'invité : sans elles, ses
        // Pokémon posés n'auraient aucun modèle à afficher.
        especes: [...new Set(equipe.map((membre) => membre.speciesId))],
        equipe,
        // Tous les objets, pas seulement les équipés : c'est l'autre bout qui
        // fait le tri, et il a besoin de la table complète pour le faire.
        objets: compte.items ?? [],
        pret: false,
      };
    };

    const entrer = async (code: string, hote: boolean): Promise<void> => {
      const client = clientSupabase();
      if (!client) {
        dire('La coopération demande une connexion. Vérifie ta configuration.');
        return;
      }
      creer.disabled = true;
      rejoindre.disabled = true;
      dire(hote ? 'Ouverture du salon…' : 'Connexion au salon…');
      try {
        // Une session anonyme suffit : on ne se sert de l'identité que pour
        // distinguer les deux joueurs dans le canal.
        await client.auth.getSession();
        const canal = await ouvrirCanal(client, code, compte.id);
        salon = new Salon(canal, hote ? 'hote' : 'invite', {
          ...maPresence(),
          role: hote ? 'hote' : 'invite',
        });
        accueil.remove();
        montrerSalon(salon, code, hote);
      } catch (error) {
        console.warn('Salon indisponible', error);
        dire('Salon injoignable. Réessaie dans un instant.');
        creer.disabled = false;
        rejoindre.disabled = false;
      }
    };

    creer.addEventListener('click', () => void entrer(genererCode(), true));
    rejoindre.addEventListener('click', () => {
      const code = normaliserCode(saisie.value);
      if (code.length < 4) {
        dire('Il manque des caractères au code.');
        return;
      }
      void entrer(code, false);
    });
    saisie.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter') rejoindre.click();
    });

    /* ---------- Le salon lui-même ---------- */

    function montrerSalon(salon: Salon, code: string, hote: boolean): void {
      const faits = compte.progression.clearedLevels.length;
      const ouverts = RAIDS.filter((raid) => raidOuvert(raid, faits));
      let raidChoisi: Raid | null = ouverts[0] ?? null;
      let difficulteChoisie: Difficulte = 'facile';
      let pret = false;

      const vue = elem('div', 'salon-vue');

      const enTete = elem('div', 'salon-code-bloc');
      enTete.append(
        elem('p', 'etiquette', 'Code à transmettre'),
        elem('strong', 'salon-code', code)
      );
      const copier = elem('button', 'bouton-discret', 'Copier');
      copier.type = 'button';
      copier.id = 'salon-copier';
      copier.addEventListener('click', () => {
        void navigator.clipboard?.writeText(code);
        copier.textContent = 'Copié';
        setTimeout(() => (copier.textContent = 'Copier'), 1400);
      });
      enTete.appendChild(copier);

      const joueurs = elem('div', 'salon-joueurs');
      joueurs.id = 'salon-joueurs';

      const choixRaid = elem('div', 'salon-choix');
      const listeRaids = elem('div', 'salon-raids');
      const listeCrans = elem('div', 'salon-crans');

      const action = elem('button', 'bouton-primaire');
      action.type = 'button';
      action.id = 'salon-action';

      const etatTexte = elem('p', 'affinites-vide');
      etatTexte.id = 'salon-etat';

      const redessiner = (): void => {
        const etat = salon.etat;
        joueurs.replaceChildren();
        for (const joueur of etat.joueurs) {
          const carte = elem('div', 'salon-joueur');
          carte.dataset['pret'] = String(joueur.pret || joueur.role === 'hote');
          carte.append(
            elem('strong', undefined, joueur.nom),
            elem('span', 'badge', joueur.role === 'hote' ? 'Hôte' : 'Invité'),
            elem(
              'span',
              'salon-joueur-etat',
              joueur.role === 'hote'
                ? 'Choisit le raid'
                : joueur.pret
                  ? 'Prêt'
                  : 'Se prépare'
            )
          );
          joueurs.appendChild(carte);
        }
        // Une place vide se montre : sans elle, un salon à un joueur ressemble
        // à un salon complet.
        if (etat.joueurs.length < 2) {
          const vide = elem('div', 'salon-joueur', 'En attente d’un dresseur…');
          vide.dataset['vide'] = 'true';
          joueurs.appendChild(vide);
        }

        if (hote) {
          action.textContent = 'Lancer le raid';
          action.disabled = !salon.toutLeMondeEstPret || !raidChoisi;
          etatTexte.textContent = raidChoisi
            ? `${raidChoisi.nom} — ${LIBELLE_DIFFICULTE[difficulteChoisie]}, PV ennemis ×${VIE_PAR_DIFFICULTE[difficulteChoisie]}`
            : 'Aucun raid ouvert : termine des lieux de campagne.';
        } else {
          action.textContent = pret ? 'Annuler' : 'Je suis prêt';
          action.disabled = etat.joueurs.length < 2;
          etatTexte.textContent =
            etat.joueurs.length < 2
              ? 'En attente de l’hôte…'
              : 'L’hôte choisit le raid et lance la partie.';
        }
      };

      if (hote) {
        choixRaid.append(elem('p', 'etiquette', 'Destination'), listeRaids);
        for (const raid of ouverts) {
          const bouton = elem('button', 'salon-raid');
          bouton.type = 'button';
          bouton.id = `salon-raid-${raid.id}`;
          bouton.append(elem('b', undefined, raid.nom));
          bouton.addEventListener('click', () => {
            raidChoisi = raid;
            for (const autre of listeRaids.children) {
              (autre as HTMLElement).dataset['actif'] = String(autre === bouton);
            }
            redessiner();
          });
          bouton.dataset['actif'] = String(raid === raidChoisi);
          listeRaids.appendChild(bouton);
        }

        choixRaid.append(elem('p', 'etiquette', 'Cran'), listeCrans);
        for (const difficulte of DIFFICULTES) {
          const bouton = elem('button', 'salon-raid');
          bouton.type = 'button';
          bouton.id = `salon-cran-${difficulte}`;
          bouton.append(elem('b', undefined, LIBELLE_DIFFICULTE[difficulte]));
          bouton.dataset['actif'] = String(difficulte === difficulteChoisie);
          bouton.addEventListener('click', () => {
            difficulteChoisie = difficulte;
            for (const autre of listeCrans.children) {
              (autre as HTMLElement).dataset['actif'] = String(autre === bouton);
            }
            redessiner();
          });
          listeCrans.appendChild(bouton);
        }
      }

      action.addEventListener('click', () => {
        if (hote) {
          if (!raidChoisi) return;
          salon.lancer(raidChoisi.id, difficulteChoisie);
          return;
        }
        pret = !pret;
        salon.seDeclarerPret(pret);
        redessiner();
      });

      const off = salon.observer(redessiner);
      fermer = off;

      salon.surDemarrage((depart: Depart) => {
        const raid = RAIDS.find((r) => r.id === depart.raidId);
        if (!raid) return;
        off();
        partir({
          session: salon.enPartie(),
          raid,
          difficulte: depart.difficulte as Difficulte,
        });
      });

      vue.append(enTete, joueurs, choixRaid, action, etatTexte);
      corps.appendChild(vue);
      redessiner();
    }
  });
}
