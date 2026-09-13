/**
 * Le salon, et la partie qui en sort.
 *
 * Deux couches, volontairement séparées. `Salon` gère l'avant : qui est là,
 * qui est prêt, quel raid. `SessionCoop` gère le pendant : des instantanés
 * dans un sens, des intentions dans l'autre. Les mélanger reviendrait à
 * laisser la boucle de jeu s'occuper de « untel vient de changer d'avis », ce
 * qui n'a plus aucun intérêt une fois la vague lancée.
 *
 * Le salon ne tient **aucune liste d'autorité** : chacun annonce ce qu'il est
 * avec un « bonjour », et les autres le rangent dans leur tableau. La présence
 * de Realtime dit qui est connecté, le « bonjour » dit qui c'est. Un joueur
 * qui ferme son onglet disparaît donc tout seul, sans message d'adieu — ce qui
 * est la seule façon fiable de traiter une fermeture brutale.
 */

import type { Canal } from './canal';
import {
  VERSION_PROTOCOLE,
  type Instantane,
  type Intention,
  type Message,
  type Presence,
  type Role,
} from './protocole';

export interface EtatSalon {
  /** Tous les joueurs connus, soi-même compris. */
  joueurs: Presence[];
  /** Nombre de connectés vus par Realtime : sert à repérer un départ. */
  connectes: number;
}

export interface Depart {
  raidId: string;
  difficulte: string;
  graine: string;
}

export class Salon {
  private readonly presences = new Map<string, Presence>();
  private readonly observateurs = new Set<(etat: EtatSalon) => void>();
  private auDemarrage: ((depart: Depart) => void) | null = null;
  private connectes = 1;
  private readonly desabonnements: Array<() => void> = [];

  constructor(
    readonly canal: Canal,
    readonly role: Role,
    private moi: Presence
  ) {
    this.presences.set(moi.joueur, moi);

    this.desabonnements.push(
      canal.ecouter((message) => this.recevoir(message)),
      canal.surPresence((n) => {
        this.connectes = n;
        // Realtime a vu quelqu'un partir : on retire ceux qu'on ne compte
        // plus. On ne sait pas *lequel* — d'où le resalut, qui refait
        // converger les deux tableaux en un aller-retour.
        if (n < this.presences.size) this.purger(n);
        this.diffuser();
      })
    );

    // On se présente à l'arrivée. L'autre répondra par son propre bonjour.
    canal.envoyer({ type: 'bonjour', version: VERSION_PROTOCOLE, presence: moi });
  }

  get etat(): EtatSalon {
    return { joueurs: [...this.presences.values()], connectes: this.connectes };
  }

  /** Me met (ou non) en attente de départ, et le dit aux autres. */
  seDeclarerPret(pret: boolean): void {
    this.moi = { ...this.moi, pret };
    this.presences.set(this.moi.joueur, this.moi);
    this.canal.envoyer({ type: 'bonjour', version: VERSION_PROTOCOLE, presence: this.moi });
    this.diffuser();
  }

  /**
   * Vrai quand l'hôte peut lancer.
   *
   * L'hôte n'a pas à se déclarer prêt : c'est lui qui appuie sur le bouton,
   * le clic *est* sa déclaration. Lui demander en plus de cocher une case
   * serait un geste pour rien.
   */
  get toutLeMondeEstPret(): boolean {
    const joueurs = [...this.presences.values()];
    return joueurs.length >= 2 && joueurs.every((j) => j.pret || j.role === 'hote');
  }

  observer(fn: (etat: EtatSalon) => void): () => void {
    this.observateurs.add(fn);
    fn(this.etat);
    return () => this.observateurs.delete(fn);
  }

  surDemarrage(fn: (depart: Depart) => void): void {
    this.auDemarrage = fn;
  }

  /** Réservé à l'hôte : annonce le départ à tout le monde, soi compris. */
  lancer(raidId: string, difficulte: string): void {
    if (this.role !== 'hote') return;
    // La graine ne sert pas au terrain : celui-ci est déjà tiré de
    // l'identifiant du niveau, donc identique des deux côtés sans rien
    // s'échanger. Elle sert aux tirages d'ambiance.
    const graine = String(Date.now());
    this.canal.envoyer({ type: 'demarrer', raidId, difficulte, graine });
    this.auDemarrage?.({ raidId, difficulte, graine });
  }

  /** Transforme le salon en partie. Le salon cesse alors d'écouter. */
  enPartie(): SessionCoop {
    for (const off of this.desabonnements) off();
    this.desabonnements.length = 0;
    this.observateurs.clear();
    return new SessionCoop(this.canal, this.role, this.moi.joueur, this.etat.joueurs);
  }

  async quitter(): Promise<void> {
    for (const off of this.desabonnements) off();
    this.desabonnements.length = 0;
    await this.canal.quitter();
  }

  private recevoir(message: Message): void {
    if (message.type === 'bonjour') {
      // Un protocole différent, c'est une version différente du jeu : mieux
      // vaut l'ignorer que d'interpréter des champs qui ont changé de sens.
      if (message.version !== VERSION_PROTOCOLE) return;
      const connu = this.presences.has(message.presence.joueur);
      this.presences.set(message.presence.joueur, message.presence);
      // On ne resalue que les nouveaux venus : répondre à chaque changement
      // de statut ferait rebondir les deux clients sans fin.
      if (!connu) {
        this.canal.envoyer({ type: 'bonjour', version: VERSION_PROTOCOLE, presence: this.moi });
      }
      this.diffuser();
      return;
    }
    if (message.type === 'demarrer') {
      this.auDemarrage?.(message);
    }
  }

  /** Ramène le tableau à la taille que Realtime annonce. */
  private purger(cible: number): void {
    const autres = [...this.presences.keys()].filter((id) => id !== this.moi.joueur);
    while (this.presences.size > Math.max(1, cible) && autres.length > 0) {
      const victime = autres.pop();
      if (victime) this.presences.delete(victime);
    }
  }

  private diffuser(): void {
    const etat = this.etat;
    for (const fn of this.observateurs) fn(etat);
  }
}

/**
 * La partie en cours.
 *
 * Elle ne sait pas jouer : elle sait envoyer et recevoir. C'est la boucle de
 * manche qui décide, selon le rôle, s'il faut pousser un instantané ou en
 * appliquer un.
 */
export class SessionCoop {
  private readonly surInstantanes = new Set<(s: Instantane) => void>();
  private readonly surIntentions = new Set<(joueur: string, i: Intention) => void>();
  private readonly surFins = new Set<(issue: 'victoire' | 'defaite') => void>();
  private readonly off: () => void;

  constructor(
    readonly canal: Canal,
    readonly role: Role,
    readonly moi: string,
    readonly joueurs: readonly Presence[]
  ) {
    this.off = canal.ecouter((message) => {
      if (message.type === 'instantane') {
        for (const fn of this.surInstantanes) fn(message.data);
        return;
      }
      if (message.type === 'intention') {
        for (const fn of this.surIntentions) fn(message.joueur, message.data);
        return;
      }
      if (message.type === 'fin') {
        for (const fn of this.surFins) fn(message.issue);
      }
    });
  }

  get estHote(): boolean {
    return this.role === 'hote';
  }

  /** Nom affiché d'un joueur, pour le HUD. */
  nomDe(joueur: string): string {
    return this.joueurs.find((j) => j.joueur === joueur)?.nom ?? 'Dresseur';
  }

  /** Espèces que les autres joueurs amènent : à précharger avant la vague. */
  get especesDesAutres(): string[] {
    const especes = new Set<string>();
    for (const joueur of this.joueurs) {
      if (joueur.joueur === this.moi) continue;
      for (const espece of joueur.especes) especes.add(espece);
    }
    return [...especes];
  }

  publier(instantane: Instantane): void {
    this.canal.envoyer({ type: 'instantane', data: instantane });
  }

  demander(intention: Intention): void {
    this.canal.envoyer({ type: 'intention', joueur: this.moi, data: intention });
  }

  annoncerFin(issue: 'victoire' | 'defaite'): void {
    this.canal.envoyer({ type: 'fin', issue });
  }

  ecouterInstantanes(fn: (s: Instantane) => void): () => void {
    this.surInstantanes.add(fn);
    return () => this.surInstantanes.delete(fn);
  }

  ecouterIntentions(fn: (joueur: string, i: Intention) => void): () => void {
    this.surIntentions.add(fn);
    return () => this.surIntentions.delete(fn);
  }

  ecouterFin(fn: (issue: 'victoire' | 'defaite') => void): () => void {
    this.surFins.add(fn);
    return () => this.surFins.delete(fn);
  }

  async quitter(): Promise<void> {
    this.off();
    this.surInstantanes.clear();
    this.surIntentions.clear();
    this.surFins.clear();
    await this.canal.quitter();
  }
}
