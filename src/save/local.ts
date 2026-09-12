import { CURRENT_SCHEMA_VERSION, type PlayerAccount } from '@/data/types';
import { SaveError, type SaveStore } from './store';

const KEY_PREFIX = 'poke-tower:account:';

/** Sauvegarde dans le navigateur. Toujours disponible, jamais partagée. */
export class LocalStore implements SaveStore {
  readonly kind = 'local' as const;

  async load(accountId: string): Promise<PlayerAccount | null> {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + accountId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PlayerAccount;
      return migrate(parsed);
    } catch (cause) {
      // Un stockage bloqué ou une sauvegarde corrompue ne doit pas empêcher de jouer.
      console.warn('Sauvegarde locale illisible, on repart à neuf.', cause);
      return null;
    }
  }

  async save(account: PlayerAccount): Promise<void> {
    try {
      localStorage.setItem(KEY_PREFIX + account.id, JSON.stringify(account));
    } catch (cause) {
      throw new SaveError('Impossible d’écrire la sauvegarde locale', cause);
    }
  }
}

/** Remonte une vieille sauvegarde au schéma courant. */
export function migrate(account: PlayerAccount): PlayerAccount {
  if (account.schemaVersion === CURRENT_SCHEMA_VERSION) return account;
  // Aucune migration à écrire pour l'instant : le schéma 1 est le premier.
  return { ...account, schemaVersion: CURRENT_SCHEMA_VERSION };
}
