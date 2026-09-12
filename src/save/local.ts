import { MOVES, TRAITS } from '@/data/content';
import { rollMove, rollTrait } from '@/data/roll';
import { potentielNeutre } from '@/data/stats';
import {
  CURRENT_SCHEMA_VERSION,
  type Move,
  type OwnedPokemon,
  type PlayerAccount,
  type Trait,
} from '@/data/types';
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
/**
 * Rebranche les attaques sur le catalogue courant.
 *
 * La sauvegarde stocke des **copies** des attaques, figées au moment du
 * tirage : tout champ ajouté au catalogue ensuite manque à jamais aux
 * Pokémon déjà possédés. L'ajout du temps d'incantation l'a démontré de la
 * pire façon — `cast` valait `undefined`, donc `NaN` après multiplication, et
 * comme `NaN <= 0` est faux, les Pokémon entraient en incantation sans
 * jamais en sortir : plus un seul tir.
 *
 * On ne conserve donc de la sauvegarde que **l'identifiant**, et le reste
 * vient du catalogue. Une attaque retirée du jeu est remplacée par un tirage
 * plutôt que de laisser une case vide.
 */
function rebrancherAttaques(membre: OwnedPokemon): [Move, Move, Move, Move] {
  const sorties: Move[] = [];
  for (const move of membre.moves ?? []) {
    const officielle = move && MOVES[move.id];
    if (officielle && !sorties.some((deja) => deja.id === officielle.id)) {
      sorties.push(officielle);
    }
  }
  while (sorties.length < 4) {
    sorties.push(
      rollMove(
        membre.speciesId,
        sorties.map((move) => move.id),
        Math.random
      )
    );
  }
  return [sorties[0]!, sorties[1]!, sorties[2]!, sorties[3]!];
}

/** Même principe pour les traits : l'identifiant reste, l'effet vient du jeu. */
function rebrancherTraits(membre: OwnedPokemon): [Trait, Trait] {
  const sorties: Trait[] = [];
  for (const trait of membre.traits ?? []) {
    const officiel = trait && TRAITS.find((candidat) => candidat.id === trait.id);
    if (officiel && !sorties.some((deja) => deja.id === officiel.id)) sorties.push(officiel);
  }
  while (sorties.length < 2) {
    sorties.push(rollTrait(sorties.map((trait) => trait.id), Math.random));
  }
  return [sorties[0]!, sorties[1]!];
}

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
    // Potentiel nul plutot qu'un tirage : re-tirer a la lecture donnerait une
    // feuille de stats differente a chaque ouverture du jeu.
    potentiel: membre.potentiel ?? potentielNeutre(),
    favori: membre.favori ?? false,
    // Attaques et traits sont relus dans le catalogue : voir rebrancherAttaques.
    moves: rebrancherAttaques(membre),
    traits: rebrancherTraits(membre),
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
      favori: arme.favori ?? false,
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
