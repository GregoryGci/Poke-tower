/**
 * Génération d'un niveau.
 *
 * Le tracé et le décor sont tirés d'une graine déduite de l'identifiant du
 * niveau : deux manches du même niveau donnent la même carte, deux niveaux
 * différents en donnent deux différentes. Aucune carte n'est donc stockée, et
 * quarante niveaux ne coûtent pas quarante fichiers.
 *
 * La route avance de façon **monotone** sur un axe et ne serpente que sur
 * l'autre. Ce n'est pas une facilité : c'est ce qui garantit qu'elle ne peut
 * jamais se recouper. Un tracé qui se croise produisait des triangles
 * retournés sur le ruban et des poses valides au milieu de la voie.
 */

import type { Monde, Niveau } from '@/data/campaign';
import { getMonde } from '@/data/campaign';
import type { PathPoint } from './path';

/** Un élément de décor, tel que le générateur le décide. */
export interface ElementDecor {
  kind: NonNullable<Monde['theme']['mobilier'][number]>;
  x: number;
  z: number;
  /** Échelle, autour de 1. */
  taille: number;
  /** Rotation autour de la verticale, en radians. */
  angle: number;
  /**
   * Rayon d'encombrement au sol.
   *
   * Sert aux règles de pose : on ne doit pas poser un Pokémon dans un arbre.
   * Les éléments plats — flaques, fleurs — ont un rayon nul et ne gênent rien.
   */
  rayon: number;
}

export interface CarteNiveau {
  points: PathPoint[];
  decor: ElementDecor[];
}

/**
 * Générateur congruentiel linéaire.
 *
 * `Math.random` ne se sème pas, et une carte qui change à chaque ouverture du
 * niveau empêcherait le joueur de préparer un placement d'une tentative à
 * l'autre.
 */
function generateur(graine: number): () => number {
  let etat = graine % 2147483647;
  if (etat <= 0) etat += 2147483646;
  return () => {
    etat = (etat * 16807) % 2147483647;
    return (etat - 1) / 2147483646;
  };
}

/** Graine stable déduite d'une chaîne. */
function graineDe(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Encombrement au sol par type de mobilier. Zéro pour ce qui est plat. */
const RAYONS: Record<ElementDecor['kind'], number> = {
  arbre: 1.1,
  buisson: 0.7,
  rocher: 0.8,
  souche: 0.55,
  fleurs: 0,
  cristal: 0.6,
  colonne: 0.9,
  flaque: 0,
};

/**
 * Trace la route.
 *
 * Un axe traverse le terrain de bord à bord sans jamais revenir en arrière ;
 * l'autre zigzague. On tire aussi le sens de traversée et l'axe, ce qui donne
 * quatre familles de tracés avant même de compter les longueurs.
 */
function tracer(rng: () => number, demiTerrain: number): PathPoint[] {
  const marge = 3.2;
  const libre = demiTerrain - marge;

  // Quatre coulées possibles : ouest→est, est→ouest, nord→sud, sud→nord.
  const axeX = rng() < 0.5;
  const sens = rng() < 0.5 ? 1 : -1;

  // Trois à cinq tronçons : moins, la route est droite ; plus, elle se tasse.
  const troncons = 3 + Math.floor(rng() * 3);
  const pasAvance = (demiTerrain * 2) / troncons;

  let travers = (rng() * 2 - 1) * libre * 0.7;
  const points: PathPoint[] = [];

  const poser = (avance: number, lateral: number): void => {
    const a = avance * sens;
    points.push(axeX ? { x: a, z: lateral } : { x: lateral, z: a });
  };

  poser(-demiTerrain, travers);

  for (let i = 1; i <= troncons; i++) {
    const avance = -demiTerrain + pasAvance * i;

    if (i < troncons) {
      // On avance, puis on décale : deux points par tronçon, donc des angles
      // droits — la silhouette des cartes de tower defense.
      poser(avance, travers);

      // Un décalage inférieur à trois unités donnerait un virage si serré que
      // les deux bords du ruban se toucheraient.
      const amplitude = libre * (0.35 + rng() * 0.55);
      let cible = travers + (rng() < 0.5 ? -1 : 1) * amplitude;
      if (Math.abs(cible) > libre) cible = travers - (cible - travers);
      if (Math.abs(cible - travers) < 3) cible = travers + (cible >= travers ? 3 : -3);
      travers = Math.max(-libre, Math.min(libre, cible));

      poser(avance, travers);
    } else {
      poser(demiTerrain, travers);
    }
  }

  return points;
}

/** Distance d'un point au tracé, en réutilisant la logique de segment. */
function distanceAuTrace(points: readonly PathPoint[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}

/**
 * Peuple la carte.
 *
 * Les candidats sont tirés sur une grille secouée plutôt qu'au hasard pur :
 * un tirage uniforme laisse des grappes et des vides, et le terrain paraît
 * mal rempli alors qu'il l'est.
 */
function peupler(
  rng: () => number,
  monde: Monde,
  points: readonly PathPoint[],
  demiTerrain: number,
  degagementRoute: number
): ElementDecor[] {
  const decor: ElementDecor[] = [];
  const mobilier = monde.theme.mobilier;
  if (!mobilier.length) return decor;

  // Un pas de grille déduit de la densité voulue : plus c'est dense, plus la
  // maille est fine.
  const pas = Math.max(1.8, 1 / Math.sqrt(monde.theme.densite));
  const depart = points[0]!;
  const arrivee = points[points.length - 1]!;

  for (let x = -demiTerrain + pas / 2; x < demiTerrain; x += pas) {
    for (let z = -demiTerrain + pas / 2; z < demiTerrain; z += pas) {
      // Une case sur deux environ reste vide : sinon la grille se devine.
      if (rng() > 0.62) continue;

      const px = x + (rng() - 0.5) * pas * 0.8;
      const pz = z + (rng() - 0.5) * pas * 0.8;
      if (Math.abs(px) > demiTerrain - 0.8 || Math.abs(pz) > demiTerrain - 0.8) continue;

      const kind = mobilier[Math.floor(rng() * mobilier.length)]!;
      // La taille est tirée AVANT le test de dégagement, et l'encombrement en
      // découle : tester avec le rayon de base laissait passer les éléments
      // grossis, qui mordaient alors la route d'un tiers de leur rayon.
      const taille = 0.75 + rng() * 0.6;
      const rayon = RAYONS[kind] * taille;

      // La route reste dégagée, et les deux extrémités aussi : on ne masque
      // ni l'entrée des ennemis ni la tour à défendre.
      if (distanceAuTrace(points, px, pz) < degagementRoute + rayon) continue;
      if (Math.hypot(px - depart.x, pz - depart.z) < 3.5) continue;
      if (Math.hypot(px - arrivee.x, pz - arrivee.z) < 4.5) continue;

      // Deux masses qui se traversent se lisent comme un seul bloc sale, et
      // deux arbres imbriqués sautent aux yeux. Les éléments plats — fleurs,
      // flaques — n'ont pas d'encombrement et peuvent se superposer.
      if (rayon > 0) {
        let empietement = false;
        for (const pose of decor) {
          if (pose.rayon <= 0) continue;
          if (Math.hypot(pose.x - px, pose.z - pz) < (pose.rayon + rayon) * 0.85) {
            empietement = true;
            break;
          }
        }
        if (empietement) continue;
      }

      decor.push({ kind, x: px, z: pz, taille, angle: rng() * Math.PI * 2, rayon });
    }
  }

  return decor;
}

/** Construit la carte d'un niveau. */
export function genererCarte(
  niveau: Niveau,
  demiTerrain: number,
  degagementRoute: number
): CarteNiveau {
  const monde = getMonde(niveau.mondeId);
  const rng = generateur(graineDe(niveau.id));
  const points = tracer(rng, demiTerrain);
  return { points, decor: peupler(rng, monde, points, demiTerrain, degagementRoute) };
}
