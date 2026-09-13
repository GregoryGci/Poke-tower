/**
 * Sauvegarde en ligne.
 *
 * Une ligne par compte, la sauvegarde entière dans une colonne JSONB — voir
 * `supabase/migrations/0001_comptes.sql` pour le schéma et les politiques.
 *
 * Trois choses valent d'être dites ici, parce qu'elles ont chacune été un
 * défaut de la première version :
 *
 *  - **l'identité**. L'identifiant de compte était un UUID tiré dans le
 *    navigateur. La clé anonyme partant dans le bundle, n'importe qui pouvait
 *    lire et écrire n'importe quelle ligne. On s'authentifie désormais — en
 *    anonyme, donc sans rien demander au joueur — et la clé primaire est
 *    l'`uid`, ce qui rend RLS opérant ;
 *
 *  - **la concurrence**. Deux onglets ouverts s'écrasaient en silence.
 *    L'écriture est conditionnée à la version lue : si la ligne a bougé, le
 *    serveur ne modifie rien et rend l'état réel. C'est l'appelant qui
 *    tranche, en connaissance de cause ;
 *
 *  - **la panne**. Une sauvegarde en ligne ne doit jamais empêcher de jouer.
 *    Ce module peut échouer à chaque appel ; c'est `sync.ts` qui garantit que
 *    le jeu continue, en écrivant toujours dans le navigateur d'abord.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlayerAccount } from '@/data/types';
import { migrate } from './local';
import { SaveError, type SaveStore } from './store';

/** Ce qu'une lecture rend : la sauvegarde, et la version qui l'accompagne. */
export interface CompteDistant {
  compte: PlayerAccount;
  version: number;
}

export class SupabaseStore implements SaveStore {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;

  /**
   * Version de la dernière ligne lue ou écrite.
   *
   * Zéro tant qu'on n'a rien lu : c'est ce qui dit au serveur « je crois que
   * cette ligne n'existe pas encore ».
   */
  private version = 0;

  /** Session en cours d'ouverture, pour ne pas s'authentifier deux fois. */
  private session: Promise<string> | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: {
        // La session est persistée par la bibliothèque : au rechargement, on
        // retrouve le même uid, donc le même compte.
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  /**
   * Ouvre une session anonyme, une seule fois.
   *
   * Anonyme et pas « par e-mail » : demander un compte avant de laisser jouer
   * ferait abandonner la moitié des gens au premier écran, et le jeu n'a
   * aucune raison de connaître une adresse. Supabase permet de rattacher plus
   * tard une identité à une session anonyme, sans perdre l'uid — donc sans
   * perdre la sauvegarde.
   */
  async identifiant(): Promise<string> {
    if (this.session) return this.session;

    this.session = (async () => {
      const { data } = await this.client.auth.getSession();
      if (data.session?.user.id) return data.session.user.id;

      const { data: cree, error } = await this.client.auth.signInAnonymously();
      if (error || !cree.session?.user.id) {
        throw new SaveError('Authentification Supabase impossible', error);
      }
      return cree.session.user.id;
    })();

    try {
      return await this.session;
    } catch (erreur) {
      // Une session ratée ne doit pas condamner les tentatives suivantes :
      // le réseau peut revenir.
      this.session = null;
      throw erreur;
    }
  }

  /**
   * Lit la sauvegarde du compte authentifié.
   *
   * L'identifiant passé est ignoré : c'est la session qui décide de quelle
   * ligne il s'agit, et c'est tout l'intérêt — un client ne peut pas demander
   * la ligne de quelqu'un d'autre.
   */
  async load(_accountId: string): Promise<PlayerAccount | null> {
    const uid = await this.identifiant();

    const { data, error } = await this.client
      .from('comptes')
      .select('payload, version')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw new SaveError('Lecture Supabase impossible', error);
    if (!data?.payload) {
      this.version = 0;
      return null;
    }

    this.version = Number(data.version) || 0;
    return migrate(data.payload as PlayerAccount);
  }

  /**
   * Écrit la sauvegarde, sans écraser une écriture concurrente.
   *
   * En cas de conflit, le serveur rend la ligne telle qu'elle est. On applique
   * alors la seule règle défendable sans fusionner deux rosters divergents :
   * **la sauvegarde la plus récente gagne**. Fusionner serait pire — deux
   * parties jouées en parallèle n'ont pas de réconciliation évidente, et en
   * inventer une ferait apparaître des Pokémon qu'on n'a pas obtenus.
   */
  async save(account: PlayerAccount): Promise<void> {
    const uid = await this.identifiant();
    // L'identifiant applicatif suit l'identité : sans ça, la ligne serait
    // rejetée par la politique d'insertion.
    account.id = uid;

    const { data, error } = await this.client.rpc('ecrire_compte', {
      p_payload: account,
      p_updated_at: new Date(account.updatedAt).toISOString(),
      p_version: this.version,
    });

    if (error) throw new SaveError('Écriture Supabase impossible', error);

    const ligne = (Array.isArray(data) ? data[0] : data) as
      | { version?: number; updated_at?: string; payload?: PlayerAccount }
      | null;
    if (!ligne) throw new SaveError('Écriture Supabase sans réponse');

    const versionServeur = Number(ligne.version) || 0;
    const horodatageServeur = Date.parse(ligne.updated_at ?? '') || 0;

    // La version a sauté de plus d'un cran, ou l'horodatage ne correspond pas
    // à ce qu'on vient d'envoyer : quelqu'un d'autre a écrit entre-temps.
    const conflit = horodatageServeur !== account.updatedAt;

    if (conflit && horodatageServeur > account.updatedAt) {
      // L'autre version est plus récente : on la garde et on se réaligne. Le
      // jeu relira au prochain démarrage plutôt que de muter l'état sous les
      // pieds du joueur en pleine manche.
      this.version = versionServeur;
      throw new SaveError(
        'Sauvegarde plus récente sur le serveur : la partie locale n’a pas été envoyée'
      );
    }

    this.version = versionServeur;
  }
}
