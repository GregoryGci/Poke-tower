/**
 * Contrat de sauvegarde.
 *
 * Le jeu ne sait jamais où va sa sauvegarde. C'est ce qui permettra de passer
 * du navigateur à Supabase, puis d'ajouter les raids, sans toucher au gameplay.
 */

import type { PlayerAccount } from '@/data/types';

export interface SaveStore {
  readonly kind: 'local' | 'supabase';
  load(accountId: string): Promise<PlayerAccount | null>;
  save(account: PlayerAccount): Promise<void>;
}

/** Erreur de sauvegarde : jamais fatale, le jeu continue en mémoire. */
export class SaveError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'SaveError';
  }
}
