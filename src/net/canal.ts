/**
 * Transport de la coopération, sur Supabase Realtime.
 *
 * Realtime en mode **broadcast** : un canal nommé par le code de salon, et
 * tout ce qui y est publié arrive aux autres abonnés. Aucune table, aucune
 * migration — le salon n'existe que le temps que les deux clients y sont
 * connectés, ce qui est exactement ce qu'on veut d'un salon.
 *
 * `self: false` sur la configuration du broadcast : sans ça, l'hôte recevrait
 * ses propres instantanés et les appliquerait par-dessus sa simulation, ce qui
 * la ferait bégayer d'une demi-seconde.
 *
 * Le canal ne sait rien du jeu. Il transporte des `Message` typés, point. La
 * logique de qui fait autorité vit dans `net/partie.ts`.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from './protocole';

/** Nom d'événement unique : tout passe par un seul, le type est dans le corps. */
const EVENEMENT = 'jeu';

export interface Canal {
  /** Code du salon, celui qu'on dicte à l'autre joueur. */
  readonly code: string;
  /** Identifiant du joueur local dans ce salon. */
  readonly joueur: string;
  envoyer(message: Message): void;
  /** S'abonne aux messages. Renvoie de quoi se désabonner. */
  ecouter(fn: (message: Message) => void): () => void;
  /** Nombre de participants actuellement connectés, soi-même compris. */
  readonly participants: number;
  /** Prévenu quand quelqu'un rejoint ou part. */
  surPresence(fn: (participants: number) => void): void;
  quitter(): Promise<void>;
}

/**
 * Ouvre un salon.
 *
 * La promesse n'est tenue qu'une fois l'abonnement confirmé : envoyer avant
 * que le canal soit `SUBSCRIBED` perd le message en silence, ce qui donnerait
 * un salon où le premier « bonjour » n'arrive jamais.
 */
export async function ouvrirCanal(
  client: SupabaseClient,
  code: string,
  joueur: string
): Promise<Canal> {
  const canal: RealtimeChannel = client.channel(`salon:${code}`, {
    config: {
      broadcast: { self: false },
      presence: { key: joueur },
    },
  });

  const ecouteurs = new Set<(message: Message) => void>();
  const ecouteursPresence = new Set<(participants: number) => void>();
  let participants = 0;

  canal.on('broadcast', { event: EVENEMENT }, ({ payload }) => {
    for (const fn of ecouteurs) fn(payload as Message);
  });

  const recompter = (): void => {
    participants = Object.keys(canal.presenceState()).length;
    for (const fn of ecouteursPresence) fn(participants);
  };
  canal.on('presence', { event: 'sync' }, recompter);
  canal.on('presence', { event: 'join' }, recompter);
  canal.on('presence', { event: 'leave' }, recompter);

  await new Promise<void>((resolve, reject) => {
    const minuterie = setTimeout(
      () => reject(new Error('Le salon n’a pas répondu')),
      10_000
    );
    canal.subscribe((statut, erreur) => {
      if (statut === 'SUBSCRIBED') {
        clearTimeout(minuterie);
        // La présence sert à savoir qui est là : sans elle, on ne saurait pas
        // que l'autre joueur a fermé son onglet.
        void canal.track({ joueur, depuis: Date.now() });
        resolve();
        return;
      }
      if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') {
        clearTimeout(minuterie);
        reject(erreur ?? new Error(`Salon indisponible (${statut})`));
      }
    });
  });

  return {
    code,
    joueur,
    envoyer(message) {
      void canal.send({ type: 'broadcast', event: EVENEMENT, payload: message });
    },
    ecouter(fn) {
      ecouteurs.add(fn);
      return () => ecouteurs.delete(fn);
    },
    get participants() {
      return participants;
    },
    surPresence(fn) {
      ecouteursPresence.add(fn);
    },
    async quitter() {
      ecouteurs.clear();
      ecouteursPresence.clear();
      await canal.unsubscribe();
    },
  };
}
