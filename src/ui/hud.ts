/**
 * Interface de manche.
 *
 * Trois zones seulement : l'état de la vague en haut, les messages au centre,
 * les unités posables en bas. Le terrain doit rester lisible — tout est donc
 * translucide, posé sur les bords, et rien ne s'affiche au milieu de l'écran
 * en dehors d'un message passager.
 *
 * Le HUD ne connaît pas le jeu : il reçoit un état et rend un choix.
 */

import { getSpecies } from '@/data/content';
import { classeAffinite, libelleAffinite } from '@/data/affinites';
import { pastillePokemon } from './pastille';
import type { GameStatus, SelectionTour, SurvolTour } from '@/game/game';
import type { OwnedPokemon } from '@/data/types';
import { ecrire, type Typewriter } from './typewriter';

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

function mesure(etiquette: string): { bloc: HTMLDivElement; valeur: HTMLElement } {
  const bloc = elem('div', 'mesure');
  const valeur = elem('b', undefined, '0');
  bloc.append(elem('span', 'etiquette', etiquette), valeur);
  return { bloc, valeur };
}

export interface HudOptions {
  /** Appelée quand le joueur choisit — ou déselectionne — une unité. */
  onSelection(owned: OwnedPokemon | null): void;
  /** Appelée quand le joueur veut revenir au menu. */
  onQuit(): void;
  /** Appelée quand le joueur déclenche la première vague. */
  onStart(): void;
  /** Appelée quand le joueur change la vitesse de simulation. */
  onSpeed(multiplicateur: number): void;
  /** Appelée quand le joueur achète un palier sur le Pokémon sélectionné. */
  onPalier(): void;
  /** Appelée quand le joueur referme le panneau de paliers. */
  onFermerSelection(): void;
}

export class Hud {
  private readonly racine = elem('div', 'hud');
  private readonly unites = elem('div', 'unites');
  private readonly message = elem('div', 'hud-message');
  private readonly retour: HTMLButtonElement;
  private readonly controles = elem('div', 'hud-controles');
  private readonly lancer: HTMLButtonElement;
  private readonly vitesse = elem('div', 'vitesse');
  private phaseAffichee = '';
  private messageAffiche: string | null = null;
  private machine: Typewriter | null = null;

  private readonly vagueNumero = elem('strong');
  private readonly vagueTotal = elem('span');
  private readonly vagueJauge = elem('i');

  private readonly restants = mesure('Sur le terrain');
  private readonly vies = mesure('Vies');
  private readonly places = mesure('Posés');
  private readonly cristaux = mesure('Cristaux');
  private readonly pieces = mesure('Poképièces');
  private readonly appels = mesure('Draw calls');

  private selection: string | null = null;
  private terrainPlein = false;
  private roster: readonly OwnedPokemon[] = [];

  /**
   * Infobulle de survol.
   *
   * Elle est construite une fois et seulement remplie ensuite : reconstruire
   * son contenu a chaque image la ferait clignoter, et ce contenu change
   * soixante fois par seconde a cause de la recharge.
   */
  private readonly infobulle = elem('div', 'infobulle');
  private readonly bulleNom = elem('span', 'infobulle-nom');
  private readonly bulleStyle = elem('span', 'infobulle-style');
  private readonly bulleAttaque = elem('span', 'infobulle-attaque');
  private readonly bulleType = elem('span', 'type');
  private readonly bulleDegats = elem('b');
  private readonly bullePortee = elem('b');
  private readonly bulleEtat = elem('span', 'infobulle-etat');
  private readonly bulleRecharge = elem('i');
  private readonly bulleRechargeTexte = elem('span', 'infobulle-chiffre');
  private readonly bulleUltime = elem('span', 'infobulle-ultime');
  private readonly bulleBilan = elem('span', 'infobulle-bilan');
  private bulleSujet: string | null = null;

  /**
   * Panneau de paliers.
   *
   * Il s'ouvre au clic sur un Pokémon déjà posé et ne pose qu'une question :
   * monter celui-là maintenant, ou garder ses pièces. Reconstruit à chaque
   * changement d'état plutôt qu'à chaque image — son contenu ne bouge que
   * quand la caisse passe le coût, pas soixante fois par seconde.
   */
  private readonly panneauPalier = elem('div', 'palier-panneau');
  private readonly palierTitre = elem('h3', 'palier-nom');
  private readonly palierCrans = elem('div', 'palier-crans');
  private readonly palierSuite = elem('p', 'palier-suite');
  private readonly palierUltime = elem('p', 'palier-ultime');
  private readonly palierBouton: HTMLButtonElement;
  private palierEtat = '';

  private readonly parent: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly options: HudOptions
  ) {
    /* ---- Haut : progression et compteurs ---- */

    const vague = elem('div', 'vague');
    const tete = elem('div', 'vague-tete');
    tete.append(this.vagueNumero, this.vagueTotal);
    const jauge = elem('div', 'jauge');
    jauge.appendChild(this.vagueJauge);
    vague.append(tete, jauge);

    const gauche = elem('div', 'panneau');
    gauche.append(
      vague,
      elem('div', 'separateur'),
      this.restants.bloc,
      elem('div', 'separateur'),
      this.appels.bloc
    );


    const droite = elem('div', 'panneau');
    droite.append(
      this.cristaux.bloc,
      elem('div', 'separateur'),
      this.pieces.bloc,
      elem('div', 'separateur'),
      this.places.bloc,
      elem('div', 'separateur'),
      this.vies.bloc
    );

    const haut = elem('div', 'hud-haut');
    haut.append(gauche, droite);

    const retour = elem('button', 'hud-retour', 'Quitter la manche');
    retour.type = 'button';
    retour.id = 'quitter-manche';
    retour.addEventListener('click', () => options.onQuit());

    /* ---- Bas : unités posables ---- */

    const bas = elem('div', 'hud-bas');
    bas.appendChild(this.unites);

    this.lancer = elem('button', 'bouton-lancer', 'Lancer la run');
    this.lancer.type = 'button';
    this.lancer.id = 'lancer-run';
    this.lancer.addEventListener('click', () => options.onStart());

    for (const multiplicateur of [1, 2, 3]) {
      const cran = elem('button', undefined, '×' + multiplicateur);
      cran.type = 'button';
      cran.id = 'vitesse-' + multiplicateur;
      cran.setAttribute('aria-pressed', String(multiplicateur === 1));
      cran.addEventListener('click', () => {
        options.onSpeed(multiplicateur);
        for (const autre of this.vitesse.querySelectorAll('button')) {
          autre.setAttribute('aria-pressed', String(autre === cran));
        }
      });
      this.vitesse.appendChild(cran);
    }

    this.controles.appendChild(this.lancer);

    this.construireInfobulle();
    this.palierBouton = this.construirePanneauPalier();

    this.racine.append(haut, this.message, bas);
    parent.append(this.racine, retour, this.controles, this.infobulle, this.panneauPalier);
    this.parent = parent;
    this.retour = retour;
  }

  /**
   * Monte le panneau une fois pour toutes.
   *
   * Le bouton est retourné plutôt que stocké dans la méthode : il est créé
   * ici mais lu partout ailleurs, et TypeScript doit voir qu'il est toujours
   * affecté avant d'être utilisé.
   */
  private construirePanneauPalier(): HTMLButtonElement {
    const fermer = elem('button', 'palier-fermer', '×');
    fermer.type = 'button';
    fermer.id = 'palier-fermer';
    fermer.title = 'Fermer';
    fermer.addEventListener('click', () => this.options.onFermerSelection());

    const tete = elem('div', 'palier-tete');
    tete.append(this.palierTitre, fermer);

    const bouton = elem('button', 'palier-monter');
    bouton.type = 'button';
    bouton.id = 'monter-palier';
    bouton.addEventListener('click', () => this.options.onPalier());

    this.panneauPalier.append(tete, this.palierCrans, this.palierSuite, this.palierUltime, bouton);
    this.panneauPalier.dataset['visible'] = 'false';
    return bouton;
  }

  /**
   * Met le panneau en phase avec la sélection.
   *
   * Rien n'est réécrit tant que l'état utile n'a pas changé : le panneau est
   * consulté pendant qu'une vague avance, et le faire clignoter à chaque
   * image le rendrait illisible.
   */
  private afficherPalier(selection: SelectionTour | null, pieces: number): void {
    if (!selection) {
      this.panneauPalier.dataset['visible'] = 'false';
      this.palierEtat = '';
      return;
    }

    const etat = [
      selection.ownedId,
      selection.palier,
      selection.cout,
      selection.abordable,
      pieces >= (selection.cout ?? 0),
    ].join('|');
    this.panneauPalier.dataset['visible'] = 'true';
    if (etat === this.palierEtat) return;
    this.palierEtat = etat;

    this.palierTitre.textContent = selection.nom;

    this.palierCrans.innerHTML = '';
    for (let i = 1; i <= selection.palierMax; i++) {
      const cran = elem('span', 'palier-cran');
      cran.dataset['plein'] = String(i <= selection.palier);
      this.palierCrans.appendChild(cran);
    }

    if (selection.cout === null) {
      this.palierSuite.textContent = 'Palier maximum atteint.';
      this.palierBouton.textContent = 'Au maximum';
      this.palierBouton.disabled = true;
    } else {
      // Le palier est une montée en puissance pour la manche en cours, pas
      // une évolution : celle-ci se gagne à l'expérience et ne s'achète pas.
      this.palierSuite.textContent = `+30 % de stats, et l’ultime au palier ${selection.palierMax}.`;
      this.palierBouton.textContent = `Monter au palier ${selection.palier + 1} — ${selection.cout} ◈`;
      this.palierBouton.disabled = !selection.abordable;
    }

    this.palierUltime.textContent = selection.ultimeDebloque
      ? `${selection.ultime} débloqué`
      : `${selection.ultime} — palier ${selection.palierMax}`;
    this.palierUltime.dataset['debloque'] = String(selection.ultimeDebloque);

  }

  private construireInfobulle(): void {
    const tete = elem('div', 'infobulle-tete');
    tete.append(this.bulleNom, this.bulleStyle);

    const attaque = elem('div', 'infobulle-ligne');
    attaque.append(this.bulleAttaque, this.bulleType);

    const chiffres = elem('div', 'infobulle-chiffres');
    const degats = elem('div', 'infobulle-chiffre');
    degats.append(document.createTextNode('Dégâts '), this.bulleDegats);
    const portee = elem('div', 'infobulle-chiffre');
    portee.append(document.createTextNode('Portée '), this.bullePortee);
    chiffres.append(degats, portee);

    // La jauge se vide en avancant vers le tir : elle se lit comme un compte a
    // rebours, sans avoir a comparer deux chiffres.
    const jauge = elem('div', 'jauge infobulle-jauge');
    jauge.appendChild(this.bulleRecharge);

    const pied = elem('div', 'infobulle-pied');
    pied.append(this.bulleEtat, this.bulleRechargeTexte);

    this.infobulle.append(tete, attaque, chiffres, jauge, pied, this.bulleUltime, this.bulleBilan);
    this.infobulle.dataset['visible'] = 'false';
  }

  /**
   * Place et remplit l'infobulle, ou la cache.
   *
   * Appelee a chaque image depuis la boucle de rendu : la recharge n'aurait
   * aucun interet si elle ne bougeait pas.
   */
  afficherSurvol(survol: SurvolTour | null): void {
    if (!survol) {
      this.infobulle.dataset['visible'] = 'false';
      this.bulleSujet = null;
      return;
    }

    // Ce qui ne depend pas du temps ne se reecrit qu'au changement de sujet.
    if (survol.ownedId !== this.bulleSujet) {
      this.bulleSujet = survol.ownedId;
      this.bulleNom.textContent = survol.nom;
      this.bulleStyle.textContent = survol.style;
      this.bulleAttaque.textContent = survol.attaque;
      this.bulleType.textContent = survol.typeAttaque;
      this.bulleType.dataset['type'] = survol.typeAttaque;
      this.bulleDegats.textContent = survol.degats.toFixed(1);
      this.bullePortee.textContent = survol.portee.toFixed(1);
      this.bulleStyle.textContent = `${survol.style} · palier ${survol.palier}/${survol.palierMax}`;
    }

    // L'ultime bouge avec le palier, qui s'achète en cours de manche : il est
    // donc relu à chaque image, contrairement au reste de l'en-tête.
    this.bulleUltime.textContent = survol.ultimeDebloque
      ? `${survol.ultime} · ${(survol.rechargeUltime ?? 0) > 0.05 ? (survol.rechargeUltime ?? 0).toFixed(1) + 's' : 'prêt'}`
      : `${survol.ultime} — verrouillé jusqu’au palier ${survol.palierMax}`;
    this.bulleUltime.dataset['debloque'] = String(survol.ultimeDebloque);

    this.bulleRecharge.style.width = ((1 - survol.rechargePart) * 100).toFixed(0) + '%';
    // Trois messages pour trois situations, jamais deux à la fois : c'est ce
    // qui fait que la bulle répond à « pourquoi il ne tire pas ? ».
    this.bulleRechargeTexte.textContent = survol.enIncantation
      ? 'Incantation ' + survol.recharge.toFixed(1) + 's / ' + survol.cast.toFixed(1) + 's'
      : survol.recharge > 0.02
        ? 'Recharge ' + survol.recharge.toFixed(1) + 's / ' + survol.cooldown.toFixed(1) + 's'
        : 'Prêt · ' + survol.cooldown.toFixed(1) + 's par tir';
    // L'efficacité prime sur « cible en vue » : quand une attaque ne passe
    // pas, c'est presque toujours le type, et c'est la réponse que le joueur
    // cherche.
    const efficacite = survol.affinite === null ? null : libelleAffinite(survol.affinite);
    this.bulleEtat.textContent = survol.enIncantation
      ? 'Incantation'
      : efficacite
        ? efficacite
        : survol.enAction
          ? 'Cible en vue'
          : 'Aucune cible';
    this.bulleEtat.dataset['affinite'] =
      survol.affinite === null ? 'neutre' : classeAffinite(survol.affinite);
    this.bulleEtat.dataset['actif'] = String(survol.enAction);
    this.bulleEtat.dataset['cast'] = String(survol.enIncantation);
    this.bulleBilan.textContent =
      Math.round(survol.degatsInfliges) + ' dégâts cumulés · ' + survol.kills + ' K.O.';

    const rect = this.parent.getBoundingClientRect();
    const x = (survol.ndcX * 0.5 + 0.5) * rect.width;
    const y = (1 - (survol.ndcY * 0.5 + 0.5)) * rect.height;
    // On garde la bulle dans le cadre : un survol au bord de l'ecran la
    // poussait hors du viewport.
    const largeur = this.infobulle.offsetWidth || 220;
    const hauteur = this.infobulle.offsetHeight || 150;
    this.infobulle.style.left = Math.min(Math.max(8, x + 18), rect.width - largeur - 8) + 'px';
    this.infobulle.style.top = Math.min(Math.max(8, y - hauteur - 10), rect.height - hauteur - 8) + 'px';
    this.infobulle.dataset['visible'] = 'true';
  }

  /** Reconstruit la barre d'unités. À n'appeler que lorsque le roster change. */
  setRoster(roster: readonly OwnedPokemon[]): void {
    this.roster = roster;
    this.unites.innerHTML = '';

    for (const owned of roster) {
      const species = getSpecies(owned.speciesId);
      const bouton = elem('button', 'unite');
      bouton.type = 'button';
      bouton.id = `unite-${owned.id}`;
      bouton.setAttribute('aria-pressed', String(this.selection === owned.id));
      bouton.setAttribute('aria-disabled', String(this.terrainPlein));

      const pastille = pastillePokemon(owned.speciesId);

      const texte = elem('span', 'unite-texte');
      texte.append(
        elem('span', 'unite-nom', species.name),
        elem('span', 'unite-detail', `${owned.auto.name} · portée ${species.range.toFixed(1)}`)
      );

      bouton.append(pastille, texte);
      bouton.addEventListener('click', () => this.basculer(owned));
      this.unites.appendChild(bouton);
    }
  }

  private basculer(owned: OwnedPokemon): void {
    if (this.terrainPlein) return;
    this.selection = this.selection === owned.id ? null : owned.id;
    this.rafraichirSelection();
    this.options.onSelection(this.selection ? owned : null);
  }

  /** Remet la barre en phase après une pose, qui consomme la sélection. */
  clearSelection(): void {
    if (!this.selection) return;
    this.selection = null;
    this.rafraichirSelection();
  }

  private rafraichirDisponibilite(): void {
    for (const owned of this.roster) {
      const bouton = this.unites.querySelector(`#unite-${CSS.escape(owned.id)}`);
      bouton?.setAttribute('aria-disabled', String(this.terrainPlein));
    }
  }

  private rafraichirSelection(): void {
    for (const owned of this.roster) {
      const bouton = this.unites.querySelector(`#unite-${CSS.escape(owned.id)}`);
      bouton?.setAttribute('aria-pressed', String(this.selection === owned.id));
    }
  }

  update(status: GameStatus): void {
    this.vagueNumero.textContent = `Vague ${status.wave}`;
    this.vagueTotal.textContent = `sur ${status.totalWaves}`;
    const avancee = status.totalWaves > 0 ? (status.wave - 1) / status.totalWaves : 0;
    this.vagueJauge.style.width = `${Math.min(100, avancee * 100)}%`;

    this.restants.valeur.textContent = String(status.alive);
    this.vies.valeur.textContent = String(status.lives);

    // La barre reflète ce qui reste disponible, sans se reconstruire.
    const plein = status.slotsLibres <= 0;
    if (plein !== this.terrainPlein) {
      this.terrainPlein = plein;
      this.rafraichirDisponibilite();
    }
    this.places.valeur.textContent = status.placed + "/" + status.maxPoses;

    // Le bouton de lancement laisse la place au reglage de vitesse.
    if (status.phase !== this.phaseAffichee) {
      this.phaseAffichee = status.phase;
      this.controles.innerHTML = '';
      this.controles.appendChild(status.phase === 'preparation' ? this.lancer : this.vitesse);
    }
    this.cristaux.valeur.textContent = String(status.crystals);
    this.pieces.valeur.textContent = String(status.pokepieces);
    this.appels.valeur.textContent = String(status.drawCalls);
    this.afficherPalier(status.selection, status.pokepieces);

    // Le compteur ne s'alarme qu'une fois la tour reellement menacee.
    this.vies.bloc.classList.toggle('alerte', status.lives <= 3);

    // Le message ne se réécrit qu'au changement : sinon il repartirait de zéro
    // à chaque image.
    if (status.message !== this.messageAffiche) {
      this.messageAffiche = status.message;
      this.machine?.annuler();
      if (status.message) {
        this.machine = ecrire(this.message, status.message);
        this.message.dataset['visible'] = 'true';
      } else {
        this.message.dataset['visible'] = 'false';
      }
    }
  }

  dispose(): void {
    this.panneauPalier.remove();
    this.infobulle.remove();
    this.racine.remove();
    this.retour.remove();
    this.controles.remove();
  }
}
