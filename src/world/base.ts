/**
 * La base à défendre.
 *
 * Elle remplace une tour en trois cylindres empilés. Celle-ci disait « le
 * chemin s'arrête ici » ; elle ne disait pas qu'on défend **quelque chose**.
 * Un Centre Pokémon, lui, se reconnaît au premier coup d'oeil : toit rouge,
 * murs clairs, l'emblème rond au-dessus de la porte. C'est ce que le joueur
 * protège, et ça doit se lire avant d'avoir lu un seul chiffre.
 *
 * Elle **réagit aux pertes**, et c'est là son vrai rôle. À chaque ennemi
 * passé, le toit fonce et l'emblème s'éteint un peu. Le compteur de vies du
 * HUD donne déjà l'information ; la base la donne là où le joueur regarde,
 * c'est-à-dire sur le terrain.
 */

import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { ThemeMonde } from '@/data/campaign';

export interface BaseDefendue {
  group: Group;
  /** `part` va de 1 (intacte) à 0 (tombée). */
  majVies(part: number): void;
  avancer(dt: number): void;
  dispose(): void;
}

/** Teinte du toit quand tout va bien, et quand tout va mal. */
const TOIT_SAIN = new Color('#c8452f');
const TOIT_PERDU = new Color('#4a2420');

export function construireBase(theme: ThemeMonde): BaseDefendue {
  const group = new Group();
  const aJeter: Array<BufferGeometry | Material> = [];

  const mur = new MeshStandardMaterial({ color: '#f2efe4', roughness: 0.85 });
  const toit = new MeshStandardMaterial({ color: TOIT_SAIN.clone(), roughness: 0.7 });
  const pierre = new MeshStandardMaterial({ color: theme.pierre, roughness: 0.92 });
  const vitre = new MeshStandardMaterial({
    color: '#7fb6d9',
    roughness: 0.25,
    metalness: 0.1,
  });
  aJeter.push(mur, toit, pierre, vitre);

  /* ---- Le terre-plein ---- */

  const terrePleinGeo = new CylinderGeometry(3.4, 3.7, 0.35, 24);
  aJeter.push(terrePleinGeo);
  const terrePlein = new Mesh(terrePleinGeo, pierre);
  terrePlein.position.y = 0.17;
  terrePlein.receiveShadow = true;
  group.add(terrePlein);

  /* ---- Le corps de bâtiment ---- */

  const corpsGeo = new BoxGeometry(3.6, 1.9, 2.8);
  aJeter.push(corpsGeo);
  const corps = new Mesh(corpsGeo, mur);
  corps.position.y = 1.3;
  corps.castShadow = true;
  corps.receiveShadow = true;
  group.add(corps);

  // Le toit : un demi-cylindre couché. C'est la silhouette d'un Centre, et
  // elle se distingue d'un cube à toit plat même de très loin.
  const toitGeo = new CylinderGeometry(1.85, 1.85, 3.9, 16, 1, false, 0, Math.PI);
  aJeter.push(toitGeo);
  const toiture = new Mesh(toitGeo, toit);
  toiture.rotation.z = Math.PI / 2;
  toiture.rotation.y = Math.PI / 2;
  toiture.position.y = 2.25;
  toiture.castShadow = true;
  group.add(toiture);

  /* ---- L'emblème ---- */

  // Une Poké Ball vue de face : un disque clair, un anneau, un bouton. Trois
  // pièces plates plutôt qu'une sphère — de face, une sphère ne se lit pas
  // comme une Ball, elle se lit comme une boule.
  const embleme = new Group();
  const fondGeo = new CircleGeometry(0.62, 24);
  const fondMat = new MeshBasicMaterial({ color: '#fdfdf4', side: DoubleSide });
  aJeter.push(fondGeo, fondMat);
  const fond = new Mesh(fondGeo, fondMat);
  embleme.add(fond);

  const hautGeo = new CircleGeometry(0.62, 24, 0, Math.PI);
  const hautMat = new MeshBasicMaterial({ color: '#e0362b', side: DoubleSide });
  aJeter.push(hautGeo, hautMat);
  const haut = new Mesh(hautGeo, hautMat);
  haut.position.z = 0.002;
  embleme.add(haut);

  const ceintureGeo = new TorusGeometry(0.62, 0.06, 6, 24);
  const ceintureMat = new MeshBasicMaterial({ color: '#1e2a1c' });
  aJeter.push(ceintureGeo, ceintureMat);
  embleme.add(new Mesh(ceintureGeo, ceintureMat));

  const boutonGeo = new SphereGeometry(0.17, 12, 10);
  const boutonMat = new MeshBasicMaterial({ color: '#fdfdf4' });
  aJeter.push(boutonGeo, boutonMat);
  const bouton = new Mesh(boutonGeo, boutonMat);
  bouton.position.z = 0.06;
  embleme.add(bouton);

  // L'emblème regarde d'où viennent les ennemis, c'est-à-dire vers −Z comme
  // tout le reste des modèles du jeu.
  embleme.position.set(0, 1.75, -1.45);
  group.add(embleme);

  /* ---- Deux fenêtres, pour que la façade ne soit pas nue ---- */

  const fenetreGeo = new BoxGeometry(0.7, 0.55, 0.08);
  aJeter.push(fenetreGeo);
  for (const cote of [-1.15, 1.15]) {
    const fenetre = new Mesh(fenetreGeo, vitre);
    fenetre.position.set(cote, 1.1, -1.43);
    group.add(fenetre);
  }

  /* ---- Le halo de soin ---- */

  // Un disque au sol, sous le bâtiment. Il pulse doucement tant que la base
  // tient, et s'éteint avec elle : c'est le signe vital de la manche.
  const haloGeo = new CircleGeometry(3.1, 28);
  const haloMat = new MeshBasicMaterial({
    color: '#7de0a6',
    transparent: true,
    opacity: 0.3,
    side: DoubleSide,
    depthWrite: false,
  });
  aJeter.push(haloGeo, haloMat);
  const halo = new Mesh(haloGeo, haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.36;
  halo.renderOrder = 1;
  group.add(halo);

  let temps = 0;
  let part = 1;

  return {
    group,
    majVies(valeur) {
      part = Math.min(1, Math.max(0, valeur));
      // Le toit fonce à mesure que la base encaisse. Interpolation et non
      // palier : à dix vies, un changement par vie perdue serait invisible.
      (toit.color as Color).copy(TOIT_PERDU).lerp(TOIT_SAIN, part);
      haloMat.opacity = 0.06 + part * 0.26;
      hautMat.color.setHex(part > 0 ? 0xe0362b : 0x5d2a25);
    },
    avancer(dt) {
      temps += dt;
      // Plus la base souffre, plus le halo bat vite : une base à deux vies
      // doit se voir agitée, pas seulement plus pâle.
      const cadence = 1.6 + (1 - part) * 3.2;
      halo.scale.setScalar(1 + Math.sin(temps * cadence) * 0.05);
    },
    dispose() {
      for (const objet of aJeter) objet.dispose();
    },
  };
}
