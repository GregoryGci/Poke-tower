/**
 * Sauvegarde hors ligne d'abord.
 *
 * Le principe tient en une phrase : **le navigateur est la source de vérité
 * pendant la session, le serveur en est le miroir.** Toute écriture va
 * d'abord dans `localStorage`, qui ne peut pas échouer pour cause de réseau,
 * puis est poussée vers Supabase. Si la poussée rate, elle est réessayée ;
 * si elle rate toujours, le joueur ne s'en aperçoit pas et ne perd rien.
 *
 * L'inverse — écrire en ligne et retomber sur le local en cas d'échec — était
 * tentant et aurait été faux : une manche gagnée pendant une coupure réseau
 * n'aurait été nulle part, et c'est précisément le moment où on tient le plus
 * à sa progression.
 *
 * Au **chargement**, en revanche, le serveur prime quand il a quelque chose
 * de plus récent : c'est ce qui permet de reprendre sur un autre appareil.
 * Le départage se fait sur `updatedAt`, l'horodatage applicatif — pas sur
 * l'ordre d'arrivée, qui ne dit rien de l'ancienneté d'une partie.
 */

import type { PlayerAccount } from '@/data/types';
import { adopterIdentite } from './identite';
import { LocalStore } from './local';
import type { SaveStore } from './store';

/** Délai avant une nouvelle tentative, en millisecondes. */
const ATTENTES_RETENTATIVE = [2_000, 8_000, 30_000];

export interface EtatSync {
  /** Vrai quand une écriture attend d'être poussée. */
  enAttente: boolean;
  /** Nombre d'échecs consécutifs. Zéro quand tout passe. */
  echecs: number;
  /** Dernière erreur rencontrée, pour l'afficher ou la journaliser. */
  derniereErreur: string | null;
}

export class SyncStore implements SaveStore {
  readonly kind = 'supabase' as const;

  private readonly local = new LocalStore();
  private enVol: Promise<void> | null = null;
  /** Dernière sauvegarde à pousser. Écrase la précédente si elle attend. */
  private enAttente: PlayerAccount | null = null;
  private echecs = 0;
  private derniereErreur: string | null = null;
  private minuterie: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly distant: SaveStore) {}

  get etat(): EtatSync {
    return {
      enAttente: this.enAttente !== null || this.enVol !== null,
      echecs: this.echecs,
      derniereErreur: this.derniereErreur,
    };
  }

  /**
   * Charge le compte, en gardant la plus récente des deux sauvegardes.
   *
   * Le local est lu en premier et sert de repli : une lecture distante peut
   * traîner ou échouer, et le jeu doit démarrer quand même.
   */
  async load(accountId: string): Promise<PlayerAccount | null> {
    // Le local est lu sous l'identifiant courant, AVANT toute adoption : c'est
    // sous celui-là que la session précédente a écrit.
    const local = await this.local.load(accountId).catch(() => null);

    let distant: PlayerAccount | null = null;
    let uid: string | null = null;
    try {
      distant = await this.distant.load(accountId);
      uid = (await this.distant.identifiant?.()) ?? null;
    } catch (erreur) {
      this.noter(erreur);
      console.warn('Lecture en ligne impossible, on reprend la partie locale.', erreur);
      return local;
    }

    // L'identité du serveur devient la seule : sans ça, la copie locale
    // retombe sous une clé que le prochain démarrage n'ira pas lire, et une
    // coupure après une reprise en ligne perdrait la partie.
    if (uid) adopterIdentite(uid, accountId);

    const gagnant =
      !distant || (local && (local.updatedAt ?? 0) >= (distant.updatedAt ?? 0)) ? local : distant;
    if (!gagnant) return null;

    // On réaligne l'identifiant applicatif puis on réécrit en local sous la
    // bonne clé, y compris quand c'est la partie locale qui gagne.
    if (uid) gagnant.id = uid;
    await this.local.save(gagnant).catch(() => undefined);
    return gagnant;
  }

  /**
   * Écrit localement puis pousse.
   *
   * La promesse rendue n'attend **pas** la poussée : le gameplay appelle ça
   * après chaque dépense, et le faire attendre le réseau ferait saccader
   * l'interface. La poussée vit sa vie et se réessaie toute seule.
   */
  async save(account: PlayerAccount): Promise<void> {
    await this.local.save(account);

    // On stocke une copie : le compte est muté en place par le jeu, et
    // envoyer la référence enverrait un état plus avancé que celui qu'on
    // croit pousser.
    this.enAttente = structuredClone(account);
    this.planifier(0);
  }

  /** Force l'envoi de ce qui attend, et attend qu'il soit parti. */
  async pousserMaintenant(): Promise<void> {
    if (this.minuterie) {
      clearTimeout(this.minuterie);
      this.minuterie = null;
    }
    await this.pousser();
  }

  private planifier(delai: number): void {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      void this.pousser();
    }, delai);
  }

  private async pousser(): Promise<void> {
    // Une seule poussée à la fois : deux écritures concurrentes se
    // marcheraient dessus et fausseraient la détection de conflit, qui
    // repose sur une version lue puis réécrite.
    if (this.enVol) return this.enVol;

    const aPousser = this.enAttente;
    if (!aPousser) return;

    this.enVol = (async () => {
      try {
        await this.distant.save(aPousser);
        this.echecs = 0;
        this.derniereErreur = null;
        // On ne vide la file que si rien de plus récent n'est arrivé pendant
        // l'envoi : sinon on perdrait la dernière modification.
        if (this.enAttente === aPousser) this.enAttente = null;
      } catch (erreur) {
        this.noter(erreur);
        const attente =
          ATTENTES_RETENTATIVE[Math.min(this.echecs - 1, ATTENTES_RETENTATIVE.length - 1)] ??
          30_000;
        console.warn(
          `Sauvegarde en ligne impossible (tentative ${this.echecs}), nouvelle tentative dans ${attente / 1000} s.`,
          erreur
        );
        this.planifier(attente);
      } finally {
        this.enVol = null;
      }
    })();

    return this.enVol;
  }

  private noter(erreur: unknown): void {
    this.echecs += 1;
    this.derniereErreur = erreur instanceof Error ? erreur.message : String(erreur);
  }
}
