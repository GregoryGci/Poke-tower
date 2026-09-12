/**
 * Écran d'équipe.
 *
 * Tout ce qu'un Pokémon possède tient sur une page : ses quatre attaques,
 * ses deux traits, ses quatre sub-stats. C'est là que le joueur ira vérifier
 * ce qu'un reroll lui a donné, donc rien n'est caché derrière un onglet.
 *
 * C'est aussi là que se dépensent les cristaux : relancer les attaques, les
 * traits, ou monter une sub-stat d'un palier. Les règles et les coûts vivent
 * dans data/upgrades, l'écran ne fait qu'appeler et réafficher.
 */

import { getSpecies } from '@/data/content';
import { SUBSTAT_MAX_STACK, type OwnedPokemon, type PlayerAccount, type StatType } from '@/data/types';
import type { AccountManager } from '@/save';
import {
  COUT_REROLL_ATTAQUES,
  COUT_REROLL_TRAITS,
  coutProchainPalier,
  monterSubStat,
  rerollAttaques,
  rerollTraits,
} from '@/data/upgrades';

const NOM_STAT: Record<StatType, string> = {
  pv: 'PV',
  atk: 'Attaque',
  def: 'Défense',
  atkSpe: 'Attaque Spé',
  defSpe: 'Défense Spé',
  vitesse: 'Vitesse',
};

function elem<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  texte?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (texte !== undefined) node.textContent = texte;
  return node;
}

function paire(gauche: string, droite: string): HTMLDivElement {
  const bloc = elem('div', 'paire');
  bloc.append(elem('b', undefined, gauche), elem('code', undefined, droite));
  return bloc;
}

function bloc(titre: string, contenu: HTMLElement, action?: HTMLElement): HTMLDivElement {
  const section = elem('div', 'bloc');
  const tete = elem('div', 'bloc-tete');
  tete.append(elem('p', 'etiquette', titre));
  if (action) tete.appendChild(action);
  section.append(tete, contenu);
  return section;
}

function boutonCout(libelle: string, cout: number, solde: number): HTMLButtonElement {
  const bouton = elem('button', 'bouton-cout', `${libelle} — ${cout} cristaux`);
  bouton.type = 'button';
  bouton.disabled = solde < cout;
  return bouton;
}

/**
 * Rend le détail d'un Pokémon.
 *
 * Le panneau est reconstruit après chaque dépense plutôt que modifié en
 * place : c'est l'assurance que ce qui s'affiche est bien l'état du compte,
 * jamais une vue qui aurait dérivé.
 */
function remplirDetail(
  panneau: HTMLElement,
  owned: OwnedPokemon,
  compte: PlayerAccount,
  surChangement: () => void
): void {
  const species = getSpecies(owned.speciesId);
  panneau.innerHTML = '';

  const tete = elem('div', 'detail-tete');
  const identite = elem('div');
  identite.append(
    elem('p', 'etiquette', `N°${String(species.dexNumber).padStart(3, '0')} · niveau ${owned.level}`),
    elem('h2', 'titre titre-m', species.name)
  );
  const types = elem('div', 'types');
  for (const type of species.types) {
    const puce = elem('span', 'type', type);
    puce.dataset['type'] = type;
    types.appendChild(puce);
  }
  identite.appendChild(types);

  const rarete = elem('span', 'rarete', owned.rarity);
  rarete.dataset['rarete'] = owned.rarity;
  tete.append(identite, rarete);

  // --- Attaques
  const attaques = elem('div', 'grille-paires');
  for (const move of owned.moves) {
    const ligne = elem('div', 'paire');
    const gauche = elem('div');
    gauche.append(elem('b', undefined, move.name));
    const puce = elem('span', 'type', move.type);
    puce.dataset['type'] = move.type;
    puce.style.marginLeft = '8px';
    gauche.appendChild(puce);
    ligne.append(
      gauche,
      elem('code', undefined, move.power > 0 ? `${move.power} · ${move.cooldown}s` : `statut · ${move.cooldown}s`)
    );
    attaques.appendChild(ligne);
  }

  // --- Traits
  const traits = elem('div', 'grille-paires');
  for (const trait of owned.traits) {
    const effet = trait.effect;
    const description =
      effet.kind === 'onKill'
        ? `+${effet.crystals} cristal par K.O.`
        : effet.kind === 'range'
          ? `portée +${effet.percent} %`
          : effet.kind === 'cooldown'
            ? `recharge −${effet.percent} %`
            : `${NOM_STAT[effet.stat]} +${effet.percent} %`;
    const ligne = elem('div', 'paire');
    const gauche = elem('div');
    gauche.append(elem('b', undefined, trait.name));
    const badge = elem('span', 'rarete', trait.rarity);
    badge.dataset['rarete'] = trait.rarity;
    badge.style.marginLeft = '8px';
    gauche.appendChild(badge);
    ligne.append(gauche, elem('code', undefined, description));
    traits.appendChild(ligne);
  }

  // --- Sub-stats
  const subs = elem('div', 'grille-paires');
  owned.subStats.forEach((sub, index) => {
    const cout = coutProchainPalier(sub.stack);
    const ligne = elem('button', 'paire achetable');
    ligne.type = 'button';
    ligne.id = `substat-${index}`;
    ligne.disabled = cout === null || compte.crystals < cout;
    ligne.title = cout === null ? 'Palier maximum atteint' : `Palier suivant : ${cout} cristaux`;

    const paliers = elem('div', 'paliers');
    for (let i = 0; i < SUBSTAT_MAX_STACK; i++) {
      const palier = elem('span', 'palier');
      palier.dataset['plein'] = String(i < sub.stack);
      paliers.appendChild(palier);
    }

    const gauche = elem('div');
    gauche.append(elem('b', undefined, NOM_STAT[sub.statType]));
    const cote = elem('code', undefined, cout === null ? 'max' : `+1 · ${cout}`);
    cote.style.marginLeft = '8px';
    gauche.appendChild(cote);

    ligne.append(gauche, paliers);
    ligne.addEventListener('click', () => {
      if (monterSubStat(compte, owned, index).ok) surChangement();
    });
    subs.appendChild(ligne);
  });

  // --- Stats de base
  const base = elem('div', 'grille-paires');
  for (const [stat, valeur] of Object.entries(species.baseStats)) {
    base.appendChild(paire(NOM_STAT[stat as StatType], String(valeur)));
  }

  const relancerAttaques = boutonCout('Relancer', COUT_REROLL_ATTAQUES, compte.crystals);
  relancerAttaques.id = 'reroll-attaques';
  relancerAttaques.addEventListener('click', () => {
    if (rerollAttaques(compte, owned).ok) surChangement();
  });

  const relancerTraits = boutonCout('Relancer', COUT_REROLL_TRAITS, compte.crystals);
  relancerTraits.id = 'reroll-traits';
  relancerTraits.addEventListener('click', () => {
    if (rerollTraits(compte, owned).ok) surChangement();
  });

  const solde = elem('span', 'solde-vivant');
  solde.append(document.createTextNode('Solde '), elem('b', undefined, String(compte.crystals)));

  panneau.append(
    tete,
    bloc('Attaques', attaques, relancerAttaques),
    bloc('Traits', traits, relancerTraits),
    bloc(`Sub-stats — ${SUBSTAT_MAX_STACK} paliers maximum`, subs, solde),
    bloc('Stats de base', base)
  );
}

/** Affiche l'équipe et rend la main au retour. */
export function ouvrirEquipe(account: AccountManager): Promise<void> {
  const compte = account.account;
  const racine = elem('div', 'ecran-equipe');

  const titre = elem('div');
  titre.append(
    elem('p', 'etiquette', 'Collection'),
    elem('h1', 'titre titre-xl', `Mon équipe — ${compte.roster.length}`)
  );

  const retour = elem('button', 'bouton-discret', 'Retour au menu');
  retour.type = 'button';
  retour.id = 'equipe-retour';

  const haut = elem('div', 'equipe-haut');
  haut.append(titre, retour);

  const liste = elem('div', 'equipe-liste');
  const detail = elem('div', 'equipe-detail');
  const corps = elem('div', 'equipe-corps');
  corps.append(liste, detail);

  let choisi = compte.roster[0] ?? null;

  const selectionner = (owned: OwnedPokemon): void => {
    choisi = owned;
    for (const vignette of liste.querySelectorAll('.equipe-vignette')) {
      vignette.setAttribute('aria-pressed', String(vignette.id === `equipe-${owned.id}`));
    }
    rafraichir();
  };

  const rafraichir = (): void => {
    if (choisi) remplirDetail(detail, choisi, compte, apresDepense);
  };

  // Toute dépense est sauvegardée : le joueur ne doit pas perdre un reroll
  // parce qu'il a fermé l'onglet juste après.
  const apresDepense = (): void => {
    account.touch();
    rafraichir();
  };

  for (const owned of compte.roster) {
    const species = getSpecies(owned.speciesId);
    const vignette = elem('button', 'equipe-vignette');
    vignette.type = 'button';
    vignette.id = `equipe-${owned.id}`;
    vignette.setAttribute('aria-pressed', String(choisi?.id === owned.id));

    const pastille = elem('span', 'pastille', species.name.slice(0, 1));
    pastille.dataset['type'] = species.types[0];

    const texte = elem('span', 'unite-texte');
    texte.append(
      elem('span', 'unite-nom', species.name),
      elem('span', 'unite-detail', `${owned.rarity} · niveau ${owned.level}`)
    );

    vignette.append(pastille, texte);
    vignette.addEventListener('click', () => selectionner(owned));
    liste.appendChild(vignette);
  }

  if (choisi) rafraichir();
  else detail.appendChild(elem('p', 'sous-titre', 'Ton équipe est vide.'));

  racine.append(haut, corps);
  document.body.appendChild(racine);

  return new Promise<void>((resolve) => {
    retour.addEventListener('click', () => {
      racine.style.transition = 'opacity .22s ease';
      racine.style.opacity = '0';
      setTimeout(() => {
        racine.remove();
        resolve();
      }, 220);
    });
  });
}
