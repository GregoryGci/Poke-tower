import { emptyAccount, type PlayerAccount } from '@/data/types';
import { LocalStore } from './local';
import { SupabaseStore } from './supabase';
import { SyncStore } from './sync';
import type { SaveStore } from './store';

export type { SaveStore } from './store';
export { SaveError } from './store';

/**
 * Choisit la destination de sauvegarde.
 *
 * Sans clés Supabase dans l'environnement, on retombe sur le navigateur : le
 * jeu doit rester lançable par quelqu'un qui vient de cloner le dépôt.
 *
 * Avec les clés, on n'écrit jamais **que** en ligne : `SyncStore` enveloppe
 * le magasin distant et garde le navigateur comme source de vérité pendant
 * la session. Une coupure réseau ne doit jamais coûter une manche.
 */
export function createStore(): SaveStore {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY'];
  if (url && key) return new SyncStore(new SupabaseStore(url, key));
  console.info('Supabase non configuré : sauvegarde dans le navigateur.');
  return new LocalStore();
}

const ACCOUNT_ID_KEY = 'poke-tower:account-id';

/**
 * Identifiant local du joueur, créé au premier lancement.
 *
 * Il reste utile hors ligne : c'est la clé de la sauvegarde navigateur. En
 * ligne, c'est l'uid d'authentification qui fait foi — le magasin distant
 * ignore celui-ci, justement pour qu'un client ne puisse pas réclamer la
 * ligne d'un autre.
 */
export function resolveAccountId(): string {
  try {
    const existing = localStorage.getItem(ACCOUNT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(ACCOUNT_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Sauvegarde différée : le gameplay appelle `touch()` autant qu'il veut,
 * l'écriture réelle n'a lieu qu'une fois les modifications retombées.
 */
export class AccountManager {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: SaveStore,
    public account: PlayerAccount
  ) {}

  static async open(store: SaveStore, accountId: string): Promise<AccountManager> {
    let account: PlayerAccount | null = null;
    try {
      account = await store.load(accountId);
    } catch (error) {
      console.warn('Chargement du compte impossible, partie hors ligne.', error);
    }
    return new AccountManager(store, account ?? emptyAccount(accountId));
  }

  touch(delayMs = 1500): void {
    this.account.updatedAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.store.save(this.account);
      // Un magasin qui differe ses ecritures doit avoir fini avant qu'on
      // rende la main : `flush` est appele a la fermeture de l'onglet.
      await this.store.pousserMaintenant?.();
    } catch (error) {
      console.warn('Sauvegarde impossible, la progression reste en mémoire.', error);
    }
  }
}
