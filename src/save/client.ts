/**
 * Le client Supabase, partagé.
 *
 * Un seul pour toute l'application, et c'est important : la sauvegarde et la
 * coopération doivent parler avec **la même session**. Deux clients, c'est
 * deux sessions anonymes, donc deux identités — le joueur qui rejoint un
 * salon ne serait pas celui qui possède la sauvegarde.
 *
 * Le module rend `null` quand les variables d'environnement manquent : le jeu
 * doit rester jouable sans Supabase, hors ligne et sans coopération.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export function clientSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = import.meta.env['VITE_SUPABASE_URL'];
  const cle = import.meta.env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !cle) {
    client = null;
    return client;
  }

  client = createClient(url, cle, {
    auth: {
      // La session est persistée : au rechargement on retrouve le même uid,
      // donc le même compte.
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      // Dix instantanés par seconde côté hôte, plus les intentions : la limite
      // par défaut de Realtime est bien en dessous de ce qu'il nous faut.
      params: { eventsPerSecond: 40 },
    },
  });
  return client;
}
