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
 * deux divergeaient, la sauvegarde était écrite sous une clé et relue sous
 * une autre — on repartait donc de zéro au rechargement suivant, alors même
 * que les données étaient bien là.
 */

const CLE_IDENTITE = 'poke-tower:account-id';

function cleCompte(id: string): string {
  return `poke-tower:account:${id}`;
}

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
 * Appelée dès qu'une session authentifiée est ouverte, **avant** toute
 * lecture : c'est sous ce nom que tout sera écrit ensuite.
 *
 * La sauvegarde existante est **déplacée**, pas supprimée. C'est le cas qui
 * compte : un joueur qui a déjà une partie en local et qui branche Supabase
 * pour la première fois. La jeter reviendrait à le faire repartir de zéro au
 * moment précis où il croit mettre sa progression à l'abri.
 */
export function adopterIdentite(uid: string, ancien: string): void {
  if (!uid || uid === ancien) return;
  try {
    localStorage.setItem(CLE_IDENTITE, uid);

    const depuis = localStorage.getItem(cleCompte(ancien));
    if (!depuis) return;

    // On n'écrase jamais une sauvegarde déjà rangée sous la nouvelle clé :
    // elle vient du serveur, donc elle est au moins aussi à jour.
    if (!localStorage.getItem(cleCompte(uid))) {
      const compte = JSON.parse(depuis) as { id?: string };
      compte.id = uid;
      localStorage.setItem(cleCompte(uid), JSON.stringify(compte));
    }
    localStorage.removeItem(cleCompte(ancien));
  } catch {
    // Sans stockage, il n'y a rien à faire converger.
  }
}
