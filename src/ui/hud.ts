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
import type { GameStatus } from '@/game/game';
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
}

export class Hud {
  private readonly racine = elem('div', 'hud');
  private readonly unites = elem('div', 'unites');
  private readonly message = elem('div', 'hud-message');
  private readonly retour: HTMLButtonElement;

  private readonly vagueNumero = elem('strong');
  private readonly vagueTotal = elem('span');
  private readonly vagueJauge = elem('i');

  private readonly restants = mesure('Sur le terrain');
  private readonly vies = mesure('Vies');
  private readonly places = mesure('Posés');
  private readonly cristaux = mesure('Cristaux');
  private readonly appels = mesure('Draw calls');

  private selection: string | null = null;
  private terrainPlein = false;
  private roster: readonly OwnedPokemon[] = [];

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
    gauche.append(vague, elem('div', 'separateur'), this.restants.bloc);


    const droite = elem('div', 'panneau');
    droite.append(
      this.cristaux.bloc,
      elem('div', 'separateur'),
      this.places.bloc,
      elem('div', 'separateur'),
      this.vies.bloc,
      elem('div', 'separateur'),
      this.appels.bloc
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

    this.racine.append(haut, this.message, bas);
    parent.append(this.racine, retour);
    this.retour = retour;
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

      const pastille = elem('span', 'pastille', species.name.slice(0, 1));
      pastille.dataset['type'] = species.types[0];

      const texte = elem('span', 'unite-texte');
      texte.append(
        elem('span', 'unite-nom', species.name),
        elem('span', 'unite-detail', `${owned.moves[0].name} · portée ${species.range.toFixed(1)}`)
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
    this.cristaux.valeur.textContent = String(status.crystals);
    this.appels.valeur.textContent = String(status.drawCalls);

    // Le compteur ne s'alarme qu'une fois la tour reellement menacee.
    this.vies.bloc.classList.toggle('alerte', status.lives <= 3);

    if (status.message) {
      this.message.textContent = status.message;
      this.message.dataset['visible'] = 'true';
    } else {
      this.message.dataset['visible'] = 'false';
    }
  }

  dispose(): void {
    this.racine.remove();
    this.retour.remove();
  }
}
