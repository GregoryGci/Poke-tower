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
  /**
   * Vide la file d'envoi et attend qu'elle soit partie.
   *
   * Optionnel : seul un magasin qui differe ses ecritures en a un. Il existe
   * pour la fermeture d'onglet — `save()` rend la main des que le navigateur
   * a ecrit, et sans ce point d'attente la derniere poussee serait tuee avec
   * la page.
   */
  pousserMaintenant?(): Promise<void>;
  /**
   * Identifiant que le serveur reconnaît, une fois la session ouverte.
   *
   * Optionnel : un magasin local n'a pas d'identité à imposer. Quand il y en
   * a une, c'est elle qui fait foi — le client ne choisit pas sous quel nom
   * sa ligne est enregistrée.
   */
  identifiant?(): Promise<string>;
}

/** Erreur de sauvegarde : jamais fatale, le jeu continue en mémoire. */
export class SaveError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'SaveError';
  }
}
