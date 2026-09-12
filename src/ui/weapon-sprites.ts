/**
 * Sprites d'armes, dessinés au pixel dans le code.
 *
 * Pourquoi pas un pack tout fait : les six armes du jeu sont des armes à feu
 * modernes — Glock, Uzi, pompe, précision, lance-roquettes, railgun — alors
 * que les packs d'icônes libres qu'on trouve (OpenGameArt, itch.io) sont
 * massivement médiévaux-fantastiques. Il aurait fallu en piocher six dans
 * autant de packs, avec autant de styles, de licences et d'attributions
 * différentes, pour un total de six images.
 *
 * Six sprites, ça se dessine. Ils vivent donc ici, en clair, sous la même
 * licence que le reste du projet, et se relisent comme du texte : chaque ligne
 * est une rangée de pixels, chaque caractère une entrée de la palette.
 *
 * La palette est commune et volontairement courte — quatre gris, plus les
 * accents. C'est ce qui fait que les six armes ont l'air d'appartenir au même
 * jeu, alors que six images glanées ailleurs n'y arriveraient pas.
 */

/** Caractère → couleur. Le point est transparent. */
const PALETTE: Record<string, string> = {
  d: '#1b2028', // contour et ombre
  m: '#39424f', // corps
  l: '#5d6a7c', // arête éclairée
  h: '#9aa6b6', // reflet
  b: '#6b4a2c', // bois / crosse
  c: '#7fd4e8', // énergie
  r: '#c8452f', // ogive
  y: '#e0a93b', // laiton
};

/** Taille d'un pixel du sprite, dans l'image produite. */
const ECHELLE = 4;

/**
 * Les six armes.
 *
 * Toutes sur la même grille de 16 × 12 : elles se comparent donc à taille
 * égale dans l'arsenal, ce qui est exactement ce qu'on veut d'une liste où on
 * choisit. Une arme dessinée plus grande passerait pour plus forte.
 */
const SPRITES: Record<string, string[]> = {
  // Pistolet : glissière courte, crosse inclinée, pontet marqué.
  glock: [
    '................',
    '..ddddddddddd...',
    '..dhhhhhhhhhd...',
    '..dmmmmmmmmmd...',
    '..ddddddddddd...',
    '..dmmddddd......',
    '..dmmd...d......',
    '..dmmd..dd......',
    '...dmmd.........',
    '...dmmd.........',
    '...dmmmd........',
    '....ddd.........',
  ],
  // Pistolet-mitrailleur : boîtier trapu, chargeur droit sous la poignée.
  uzi: [
    '................',
    '.....ddddd......',
    '.....dhhhd......',
    '..dddmmmmmddddd.',
    '..dlllllllllllld',
    '..dmmmmmmmmmmmd.',
    '..ddddddddddddd.',
    '.....dmd........',
    '.....dmd........',
    '.....dmd........',
    '.....dmd........',
    '.....ddd........',
  ],
  // Fusil à pompe : canon long, pompe sous le canon, crosse pleine.
  pompe: [
    '................',
    '................',
    '.ddddddddddd....',
    '.dhhhhhhhhhd....',
    '.dmmmmmmmmmdddd.',
    '.dddddddddddmmd.',
    '...dmmmmd..dbbd.',
    '...dddddd..dbbd.',
    '.....dmd....dbd.',
    '.....ddd....dbd.',
    '............ddd.',
    '................',
  ],
  // Fusil de précision : lunette posée sur la boîte de culasse, canon fin.
  precision: [
    '................',
    '......ddddd.....',
    '......dhhhd.....',
    '......ddddd.....',
    'dddddddddddddd..',
    'dhhhhhhhhhhhhd..',
    'dmmmmmmmmmmmmdd.',
    'ddddddddddddmmd.',
    '.....dmd...dbbd.',
    '.....ddd...dbbd.',
    '...........dddd.',
    '................',
  ],
  // Lance-roquettes : tube épais, ogive rouge, poignée sous le tube.
  lance_roquettes: [
    '................',
    '................',
    '..ddddddddddddd.',
    '.drrrdhhhhhhhhd.',
    'drrrrdmmmmmmmmd.',
    '.drrrdmmmmmmmmd.',
    '..ddddddddddddd.',
    '......dmd.......',
    '......dmd.......',
    '.....dmmd.......',
    '.....ddd........',
    '................',
  ],
  // Railgun : rails jumelés, bobines d'énergie, canon ouvert vers l'avant.
  railgun: [
    '................',
    '..ddddddddddddd.',
    '.dccdddddddddddd',
    'dccdmmmdcccdmmmd',
    'dccdmmmdcccdmmmd',
    '.dccdddddddddddd',
    '..ddddddddddddd.',
    '.......dmd......',
    '......dmmd......',
    '......dmmd......',
    '.......ddd......',
    '................',
  ],
};

/** Sprites déjà peints, en data URL. */
const cache = new Map<string, string | null>();

/**
 * Sprite d'une arme, en data URL PNG, ou null si elle n'en a pas.
 *
 * Le rendu est synchrone — un canvas de 64 × 48 — donc la vignette n'a pas à
 * gérer d'attente, contrairement aux portraits de Pokémon qui demandent un
 * chargement de modèle.
 */
export function spriteArme(weaponId: string): string | null {
  if (cache.has(weaponId)) return cache.get(weaponId) ?? null;

  const grille = SPRITES[weaponId];
  if (!grille) {
    cache.set(weaponId, null);
    return null;
  }

  const largeur = Math.max(...grille.map((ligne) => ligne.length));
  const hauteur = grille.length;
  const canvas = document.createElement('canvas');
  canvas.width = largeur * ECHELLE;
  canvas.height = hauteur * ECHELLE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cache.set(weaponId, null);
    return null;
  }

  for (let y = 0; y < hauteur; y++) {
    const ligne = grille[y]!;
    for (let x = 0; x < ligne.length; x++) {
      const couleur = PALETTE[ligne[x]!];
      if (!couleur) continue;
      ctx.fillStyle = couleur;
      ctx.fillRect(x * ECHELLE, y * ECHELLE, ECHELLE, ECHELLE);
    }
  }

  const url = canvas.toDataURL('image/png');
  cache.set(weaponId, url);
  return url;
}

/** Identifiants des armes qui ont un sprite — sert aux vérifications. */
export const ARMES_DESSINEES = Object.keys(SPRITES);
