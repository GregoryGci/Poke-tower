import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlayerAccount } from '@/data/types';
import { migrate } from './local';
import { SaveError, type SaveStore } from './store';

const TABLE = 'accounts';

/**
 * Sauvegarde en ligne.
 *
 * Une ligne par compte, la sauvegarde entière dans une colonne JSON. C'est
 * volontairement grossier : tant qu'un compte tient en quelques kilo-octets,
 * découper le roster en tables séparées coûterait plus qu'il ne rapporte.
 * Le jour où les raids demanderont des écritures concurrentes, la colonne
 * `updated_at` servira à détecter les conflits.
 */
export class SupabaseStore implements SaveStore {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  async load(accountId: string): Promise<PlayerAccount | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('payload')
      .eq('id', accountId)
      .maybeSingle();

    if (error) throw new SaveError('Lecture Supabase impossible', error);
    if (!data?.payload) return null;
    return migrate(data.payload as PlayerAccount);
  }

  async save(account: PlayerAccount): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .upsert({ id: account.id, payload: account, updated_at: new Date(account.updatedAt).toISOString() });
    if (error) throw new SaveError('Écriture Supabase impossible', error);
  }
}
