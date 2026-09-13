/**
 * Le portail d'où sortent les ennemis.
 *
 * Il remplace un disque vert posé au sol. Ce disque disait où la vague
 * apparaît ; il ne disait pas *pourquoi*. Un Pokémon sauvage qui se
 * matérialise au milieu de l'herbe est une convention qu'on accepte, mais qui
 * ne raconte rien — alors qu'une faille qui tourne, elle, explique le siège.
 *
 * Tout est bâti en primitives, comme le reste du mobilier : la direction
 * artistique est faite de formes franches et de couleurs plates. Un modèle
 * importé serait plus lourd sans paraître mieux.
 *
 * Le vortex tourne, et c'est la seule chose animée du décor. Il s'accélère
 * quand la vague est lancée : le terrain lui-même annonce que ça commence.
 */

import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { ThemeMonde } from '@/data/campaign';

export interface Portail {
  group: Group;
  /** Fait tourner le vortex. `actif` accélère et intensifie. */
  avancer(dt: number, actif: boolean): void;
  dispose(): void;
}

/** Nombre de bras dans la spirale. Trois : assez pour tourner, pas pour scintiller. */
const BRAS = 3;

/** La teinte d une faille. Elle ne depend pas du monde : une faille est une faille. */
const VIOLET_FAILLE = '#7b3fd4';

export function construirePortail(theme: ThemeMonde): Portail {
  const group = new Group();
  const aJeter: Array<BufferGeometry | Material> = [];

  const pierre = new MeshStandardMaterial({ color: theme.pierre, roughness: 0.92 });
  const pierreSombre = new MeshStandardMaterial({ color: theme.tronc, roughness: 0.95 });
  aJeter.push(pierre, pierreSombre);

  /* ---- L'arche : deux montants et une clé de voûte ---- */

  const montant = new CylinderGeometry(0.38, 0.46, 3.2, 8);
  aJeter.push(montant);
  for (const cote of [-1, 1]) {
    const pilier = new Mesh(montant, pierre);
    pilier.position.set(cote * 1.75, 1.6, 0);
    pilier.castShadow = true;
    group.add(pilier);

    // Un chapiteau : sans lui les montants finissent en tuyau coupé net.
    const chapiteauGeo = new CylinderGeometry(0.56, 0.4, 0.34, 8);
    aJeter.push(chapiteauGeo);
    const chapiteau = new Mesh(chapiteauGeo, pierreSombre);
    chapiteau.position.set(cote * 1.75, 3.32, 0);
    chapiteau.castShadow = true;
    group.add(chapiteau);
  }

  // La voûte est un demi-tore. Un linteau droit aurait fait une porte de
  // grange ; c'est une arche qu'on veut, et l'arc se lit de loin.
  const arcGeo = new TorusGeometry(1.75, 0.4, 8, 22, Math.PI);
  aJeter.push(arcGeo);
  const arc = new Mesh(arcGeo, pierre);
  arc.position.y = 3.3;
  arc.castShadow = true;
  group.add(arc);

  const cleGeo = new ConeGeometry(0.5, 0.7, 8);
  aJeter.push(cleGeo);
  const cle = new Mesh(cleGeo, pierreSombre);
  cle.position.y = 5.35;
  cle.castShadow = true;
  group.add(cle);

  /* ---- Le socle, pour que l'arche ne flotte pas ---- */

  // Un socle bas et etroit. La premiere version faisait 2,8 d empattement sur
  // 0,3 de haut : elle mangeait la moitie de l image, et surtout sa face
  // superieure passait DEVANT le vortex, qui devenait invisible.
  const socleGeo = new CylinderGeometry(2.1, 2.35, 0.2, 20);
  aJeter.push(socleGeo);
  const socle = new Mesh(socleGeo, pierreSombre);
  socle.position.y = 0.1;
  socle.receiveShadow = true;
  group.add(socle);

  /* ---- Le vortex ---- */

  // Posé à plat dans l'ouverture et non debout : la caméra est en plongée, un
  // disque vertical se verrait par la tranche et disparaîtrait.
  const nappeGeo = new CircleGeometry(1.55, 28);
  // Le violet est celui du portail, pas celui du monde : `theme.accent` est
  // la couleur des fleurs ou de la lave, et une faille rose pâle au milieu
  // d'une prairie ne se lisait pas comme une faille. La teinte du monde
  // revient dans les bras, en dessous.
  const nappeMat = new MeshBasicMaterial({
    color: VIOLET_FAILLE,
    transparent: true,
    opacity: 0.62,
    side: DoubleSide,
    depthWrite: false,
  });
  aJeter.push(nappeGeo, nappeMat);
  const nappe = new Mesh(nappeGeo, nappeMat);
  nappe.rotation.x = -Math.PI / 2;
  // Au-dessus du socle, pas dedans.
  nappe.position.y = 0.24;
  nappe.renderOrder = 1;
  group.add(nappe);

  // Les bras : des anneaux partiels, chacun plus serré que le précédent. En
  // les faisant tourner à des vitesses différentes, on obtient une spirale
  // qui s'enroule sans qu'aucun maillage ne se déforme.
  const bras: Array<{ mesh: Mesh; vitesse: number }> = [];
  for (let i = 0; i < BRAS; i++) {
    const rayon = 1.35 - i * 0.32;
    const geo = new RingGeometry(rayon - 0.16, rayon, 24, 1, 0, Math.PI * 1.35);
    const mat = new MeshBasicMaterial({
      color: i === 1 ? theme.accent : VIOLET_FAILLE,
      transparent: true,
      opacity: 0.75 - i * 0.12,
      side: DoubleSide,
      depthWrite: false,
      // Additif : les bras qui se croisent s'éclaircissent au lieu de se
      // masquer, ce qui donne le coeur brillant d'une faille.
      blending: AdditiveBlending,
    });
    aJeter.push(geo, mat);
    const mesh = new Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.27 + i * 0.015;
    mesh.renderOrder = 2;
    // Alternance de sens : deux bras qui tournent du même côté à des vitesses
    // voisines battent lentement, ce qui se lit comme un bug d'animation.
    bras.push({ mesh, vitesse: (i % 2 === 0 ? 1 : -1) * (0.9 + i * 0.55) });
    group.add(mesh);
  }

  let temps = 0;

  return {
    group,
    avancer(dt, actif) {
      const facteur = actif ? 2.4 : 1;
      temps += dt * facteur;
      for (const { mesh, vitesse } of bras) {
        mesh.rotation.z += dt * vitesse * facteur;
      }
      // La nappe respire. L'amplitude est faible : un portail qui clignote
      // attire l'oeil en permanence alors qu'il n'a rien à dire entre deux
      // apparitions.
      const pulsation = 0.5 + Math.sin(temps * 2.2) * 0.08;
      nappeMat.opacity = actif ? pulsation + 0.18 : pulsation;
      nappe.scale.setScalar(1 + Math.sin(temps * 1.7) * 0.04);
    },
    dispose() {
      for (const objet of aJeter) objet.dispose();
    },
  };
}
