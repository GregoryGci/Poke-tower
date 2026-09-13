/**
 * Identifiant du compte.
 *
 * Il vit dans son propre module parce que **deux couches en ont besoin** : la
 * fabrique de magasins, au démarrage, et la synchronisation, qui doit pouvoir
 * l'adopter quand le serveur en impose un autre. Le laisser dans `index.ts`
 * aurait créé un cycle d'imports avec `sync.ts`.
 *
 * Le point délicat, et la raison d'être de `adopterIdentite` : hors ligne,
 * l'identifiant est un UUID tiré dans le navigateur ; en ligne, c'est l'`uid`
 * d'authentification, et c'est lui qui fait foi côté serveur. Tant que les
 * deux divergeaient, la sauvegarde rapatriée du serveur était rangée sous la
 * clé de l'uid alors que le démarrage suivant cherchait celle de l'UUID
 * local. Résultat : on reprenait sa partie en ligne, puis on la perdait à la
 * première coupure. Les deux doivent donc converger dès la première session
 * authentifiée.
 */

const CLE_IDENTITE = 'poke-tower:account-id';

/** Identifiant local du joueur, créé au premier lancement. */
export function resolveAccountId(): string {
  try {
    const existant = localStorage.getItem(CLE_IDENTITE);
    if (existant) return existant;
    const id = crypto.randomUUID();
    localStorage.setItem(CLE_IDENTITE, id);
    return id;
  } catch {
    // Stockage bloqué : le jeu tourne, la partie ne survivra pas à la fermeture.
    return crypto.randomUUID();
  }
}

/**
 * Fait de l'identifiant serveur le seul identifiant du compte.
 *
 * Appelée dès qu'une session authentifiée est ouverte. L'ancienne clé locale
 * est supprimée : la laisser ferait traîner une sauvegarde orpheline que rien
 * ne relirait jamais, et qui referait surface le jour où l'identité changerait.
 */
export function adopterIdentite(uid: string, ancien: string): void {
  if (!uid || uid === ancien) return;
  try {
    localStorage.setItem(CLE_IDENTITE, uid);
    localStorage.removeItem(`poke-tower:account:${ancien}`);
  } catch {
    // Sans stockage, il n'y a rien à faire converger.
  }
}
