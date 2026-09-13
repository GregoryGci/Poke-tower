import { MOVES, SPECIES, TRAITS } from '@/data/content';
import { rollAuto, rollTrait, rollUltime } from '@/data/roll';
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

/**
 * Forme d'un membre tel qu'il a pu être écrit par une version antérieure.
 *
 * On ne lit jamais une sauvegarde au travers du type courant : celui-ci
 * décrit ce que le jeu veut, pas ce que le disque contient. Les champs
 * disparus (les quatre attaques, la rareté de l'exemplaire) sont déclarés ici
 * pour pouvoir être récupérés sans mentir au compilateur.
 */
type MembreSauvegarde = Partial<OwnedPokemon> & {
  speciesId?: string;
  /** Ancien format : quatre attaques interchangeables. */
  moves?: Array<{ id?: string } | null>;
  /** Ancien format : la rareté vivait sur l'exemplaire. */
  rarity?: string;
};

/**
 * Retrouve une attaque du catalogue à partir de ce qui est sauvegardé.
 *
 * La sauvegarde stocke des **copies** des attaques, figées au moment du
 * tirage : tout champ ajouté au catalogue ensuite manque à jamais aux
 * Pokémon déjà possédés. L'ajout du temps d'incantation l'a démontré de la
 * pire façon — `cast` valait `undefined`, donc `NaN` après multiplication, et
 * comme `NaN <= 0` est faux, les Pokémon entraient en incantation sans
 * jamais en sortir : plus un seul tir.
 *
 * On ne conserve donc de la sauvegarde que **l'identifiant**, et tout le
 * reste vient du catalogue.
 */
function attaqueDuCatalogue(candidat: { id?: string } | null | undefined, sorte: Move['sorte']): Move | null {
  if (!candidat?.id) return null;
  const officielle = MOVES[candidat.id];
  return officielle && officielle.sorte === sorte ? officielle : null;
}

/**
 * Auto-attaque et ultime d'un membre.
 *
 * Les sauvegardes d'avant le passage à deux attaques portent un tableau de
 * quatre : on en récupère la première qui est une auto-attaque valide, et
 * l'ultime est tiré, puisqu'il n'en existait aucun. Une attaque retirée du
 * jeu est remplacée par un tirage plutôt que de laisser une case vide.
 */
function rebrancherAttaques(membre: MembreSauvegarde): { auto: Move; ultime: Move } {
  const speciesId = membre.speciesId ?? 'bulbasaur';

  let auto = attaqueDuCatalogue(membre.auto, 'auto');
  if (!auto) {
    for (const ancienne of membre.moves ?? []) {
      auto = attaqueDuCatalogue(ancienne, 'auto');
      if (auto) break;
    }
  }
  if (!auto) auto = rollAuto(speciesId, [], Math.random);

  const ultime = attaqueDuCatalogue(membre.ultime, 'ultime') ?? rollUltime(speciesId, [], Math.random);
  return { auto, ultime };
}

/** Même principe pour les traits : l'identifiant reste, l'effet vient du jeu. */
function rebrancherTraits(membre: MembreSauvegarde): [Trait, Trait] {
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

/**
 * Espèce sauvegardée, ou une espèce de repli.
 *
 * Un stade évolué est désormais parfaitement légitime dans un roster :
 * l'évolution vient de l'expérience et elle est définitive. La version
 * précédente le rétrogradait à sa forme de base — c'était juste tant que
 * l'évolution était un achat valable le temps d'une manche, et ça serait
 * devenu une perte de progression silencieuse.
 *
 * Seule une espèce inconnue du catalogue est remplacée.
 */
function especeDuRoster(speciesId: string | undefined): string {
  return speciesId && SPECIES[speciesId] ? speciesId : 'bulbasaur';
}

export function migrate(account: PlayerAccount): PlayerAccount {
  // Le tutoriel est arrivé après les premières sauvegardes : un compte qui
  // existe déjà a forcément dépassé ce stade.
  const progression = {
    ...account.progression,
    tutorialDone: account.progression?.tutorialDone ?? true,
    // Meme raison : un compte qui existait avant le x10 offert a deja passe
    // ce moment. Le lui rejouer lui donnerait dix Pokemon gratuits.
    invocationOfferteFaite: account.progression?.invocationOfferteFaite ?? true,
  };
  // Les etoiles sont arrivees apres les premieres sauvegardes : tout ce qui
  // existait deja part a une etoile, sans brillance.
  const roster = ((account.roster ?? []) as MembreSauvegarde[]).map((membre) => {
    const speciesId = especeDuRoster(membre.speciesId);
    const { auto, ultime } = rebrancherAttaques({ ...membre, speciesId });
    // La rareté de l'exemplaire est supprimée du schéma : elle appartient à
    // l'espèce. On la retire explicitement plutôt que de la laisser traîner —
    // un champ mort qu'on continue de sérialiser finit toujours par être relu.
    const { rarity: _rarity, moves: _moves, ...reste } = membre;
    void _rarity;
    void _moves;
    return {
      ...reste,
      id: membre.id ?? crypto.randomUUID(),
      speciesId,
      level: membre.level ?? 1,
      xp: membre.xp ?? 0,
      stars: membre.stars ?? 1,
      shiny: membre.shiny ?? false,
      // Potentiel nul plutot qu'un tirage : re-tirer a la lecture donnerait une
      // feuille de stats differente a chaque ouverture du jeu.
      potentiel: membre.potentiel ?? potentielNeutre(),
      favori: membre.favori ?? false,
      // Attaques et traits sont relus dans le catalogue : voir rebrancherAttaques.
      auto,
      ultime,
      traits: rebrancherTraits(membre),
      // Les emplacements d'objets sont arrives apres les premieres sauvegardes.
      items: membre.items ?? [null, null, null],
      subStats: membre.subStats ?? [
        { statType: 'pv', stack: 0 },
        { statType: 'atk', stack: 0 },
        { statType: 'def', stack: 0 },
        { statType: 'vitesse', stack: 0 },
      ],
    } as OwnedPokemon;
  });

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
    // La Master Ball est arrivée après les premières sauvegardes.
    balls: account.balls ?? 0,
    items: account.items ?? [],
    team: account.team ?? roster.slice(0, 6).map((membre) => membre.id),
    trainerName: account.trainerName ?? '',
  };

  if (account.schemaVersion === CURRENT_SCHEMA_VERSION) return complete;
  return { ...complete, schemaVersion: CURRENT_SCHEMA_VERSION };
}
