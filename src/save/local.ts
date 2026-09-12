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
  // Le tutoriel est arrivé après les premières sauvegardes : un compte qui
  // existe déjà a forcément dépassé ce stade.
  const progression = {
    ...account.progression,
    tutorialDone: account.progression?.tutorialDone ?? true,
  };
  // Les etoiles sont arrivees apres les premieres sauvegardes : tout ce qui
  // existait deja part a une etoile, sans brillance.
  const roster = (account.roster ?? []).map((membre) => ({
    ...membre,
    xp: membre.xp ?? 0,
    stars: membre.stars ?? 1,
    shiny: membre.shiny ?? false,
  }));

  // Armes, equipe et nom sont arrives apres les premieres sauvegardes.
  const complete = {
    ...account,
    progression,
    roster,
    // Les armes d'avant la mecanique de runes n'avaient ni palier ni lignes
    // de stats : elles repartent nues plutot que d'etre jetees.
    weapons: (account.weapons ?? []).map((arme) => ({
      ...arme,
      niveau: arme.niveau ?? 0,
      innee: arme.innee ?? null,
      subStats: arme.subStats ?? [],
    })),
    equippedWeaponId: account.equippedWeaponId ?? null,
    team: account.team ?? roster.slice(0, 6).map((membre) => membre.id),
    trainerName: account.trainerName ?? '',
  };

  if (account.schemaVersion === CURRENT_SCHEMA_VERSION) return complete;
  return { ...complete, schemaVersion: CURRENT_SCHEMA_VERSION };
}
