/**
 * Première run : apprentissage par l'action.
 *
 * Aucune étape ne bloque le jeu et aucune ne demande de cliquer sur « suivant ».
 * Chaque consigne attend que le joueur fasse la chose, puis s'efface d'elle-même.
 * S'il la fait avant d'avoir lu, tant mieux : l'étape passe et on n'en parle
 * plus. Un lien discret permet de tout couper.
 *
 * Le tutoriel observe l'état du jeu, il ne le pilote jamais.
 */

import type { GameStatus } from '@/game/game';

export interface TutorialContext {
  status: GameStatus;
  /** Une unité est-elle sélectionnée dans la barre ? */
  selection: boolean;
}

interface Etape {
  titre: string;
  /** Corps de la consigne ; les touches sont balisées par des accolades. */
  corps: string;
  /** Vrai quand le joueur a fait ce qui était demandé. */
  accomplie(contexte: TutorialContext): boolean;
  /** Délai avant de passer à la suite, pour laisser voir le résultat. */
  pause?: number;
}

const ETAPES: Etape[] = [
  {
    titre: 'Choisis ton Pokémon',
    corps: 'Il attend en bas de l’écran. Clique dessus pour le prendre en main.',
    accomplie: (c) => c.selection || c.status.placed > 0,
  },
  {
    titre: 'Pose-le où tu veux',
    corps:
      'N’importe où sur l’herbe, mais jamais sur le chemin de terre. Le cercle montre sa portée — cadre bien la route.',
    accomplie: (c) => c.status.placed > 0,
    pause: 1.4,
  },
  {
    titre: 'Lance la vague quand tu es prêt',
    corps:
      'Rien ne bouge tant que tu n’as pas appuyé sur « Lancer la run ». Prends le temps de placer tes Pokémon — tu peux en poser six.',
    accomplie: (c) => c.status.phase === 'en_cours',
    pause: 1,
  },
  {
    titre: 'Prends ton dresseur en main',
    corps: '{ZQSD} ou les flèches pour te déplacer. Tu joues pendant que tes Pokémon défendent.',
    accomplie: (c) => c.status.trainerMoved,
    pause: 1,
  },
  {
    titre: 'Lance un appât',
    corps: '{Espace} détourne les ennemis proches de ta position. De quoi gagner de précieuses secondes.',
    accomplie: (c) => c.status.lures > 0,
    pause: 1.2,
  },
  {
    titre: 'Tiens la ligne',
    corps:
      'Chaque ennemi qui atteint le bout du chemin te coûte. Ceux que tu abats laissent des cristaux.',
    accomplie: (c) => c.status.leaked > 0 || c.status.crystals >= 3 || c.status.wave > 1,
  },
];

/** Remplace les {touches} par de vrais éléments clavier. */
function ecrireCorps(cible: HTMLElement, corps: string): void {
  cible.textContent = '';
  for (const morceau of corps.split(/(\{[^}]+\})/)) {
    if (!morceau) continue;
    if (morceau.startsWith('{') && morceau.endsWith('}')) {
      const touche = document.createElement('kbd');
      touche.textContent = morceau.slice(1, -1);
      cible.appendChild(touche);
    } else {
      cible.appendChild(document.createTextNode(morceau));
    }
  }
}

export class Tutorial {
  private readonly racine = document.createElement('div');
  private readonly compteur = document.createElement('div');
  private readonly titre = document.createElement('div');
  private readonly corps = document.createElement('div');

  private index = 0;
  private attente = 0;
  private fini = false;

  constructor(
    parent: HTMLElement,
    private readonly onFinished: () => void
  ) {
    this.racine.className = 'tuto';
    this.compteur.className = 'tuto-etape';
    this.titre.className = 'tuto-titre';
    this.corps.className = 'tuto-corps';

    const texte = document.createElement('div');
    texte.className = 'tuto-texte';
    texte.append(this.titre, this.corps);

    const passer = document.createElement('button');
    passer.type = 'button';
    passer.className = 'tuto-passer';
    passer.id = 'passer-tuto';
    passer.textContent = 'Passer';
    passer.addEventListener('click', () => this.terminer());

    this.racine.append(this.compteur, texte, passer);
    parent.appendChild(this.racine);
    this.afficher();
  }

  get termine(): boolean {
    return this.fini;
  }

  private afficher(): void {
    const etape = ETAPES[this.index];
    if (!etape) return;
    this.compteur.textContent = `${this.index + 1}/${ETAPES.length}`;
    this.titre.textContent = etape.titre;
    ecrireCorps(this.corps, etape.corps);
    // Relance l'animation d'entrée à chaque changement d'étape.
    this.racine.style.animation = 'none';
    void this.racine.offsetWidth;
    this.racine.style.animation = '';
  }

  update(dt: number, contexte: TutorialContext): void {
    if (this.fini) return;

    if (this.attente > 0) {
      this.attente -= dt;
      if (this.attente <= 0) this.avancer();
      return;
    }

    const etape = ETAPES[this.index];
    if (!etape) return;
    if (!etape.accomplie(contexte)) return;

    // Une pause laisse le joueur voir l'effet de ce qu'il vient de faire.
    if (etape.pause) {
      this.attente = etape.pause;
      return;
    }
    this.avancer();
  }

  private avancer(): void {
    this.index++;
    if (this.index >= ETAPES.length) {
      this.terminer();
      return;
    }
    this.afficher();
  }

  private terminer(): void {
    if (this.fini) return;
    this.fini = true;
    this.racine.dataset['sortie'] = 'true';
    setTimeout(() => this.racine.remove(), 260);
    this.onFinished();
  }

  dispose(): void {
    this.racine.remove();
  }
}
