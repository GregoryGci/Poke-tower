/**
 * Moteur audio.
 *
 * Deux sources, et le partage est délibéré :
 *
 *  - les **échantillons** viennent de Cobblemon — un cri par espèce, un
 *    impact par type. Ce sont les seuls sons qui doivent être reconnaissables
 *    en tant que tels : un Bulbizarre qu'on pose doit crier comme Bulbizarre.
 *  - les **bips** sont synthétisés à la volée. Cliquer, ouvrir un écran,
 *    monter un palier : ce sont des sons d'interface, et un carré filtré à
 *    l'enveloppe courte est exactement ce que faisait la Game Boy. Aller
 *    chercher un fichier pour chacun aurait ajouté du poids, des licences et
 *    une latence, pour un résultat moins fidèle à la direction artistique.
 *
 * Le contexte audio n'est **pas** créé au chargement. Les navigateurs le
 * suspendent tant que l'utilisateur n'a rien touché, et un contexte suspendu
 * avale silencieusement tout ce qu'on lui envoie : les premiers sons du jeu
 * seraient perdus sans que rien ne le signale. On l'ouvre au premier geste.
 */

const CLE_VOLUME = 'poke-tower:volume';
const CLE_MUET = 'poke-tower:muet';

let contexte: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let muet = false;

/** Échantillons déjà décodés. Un fichier n'est téléchargé qu'une fois. */
const mémoire = new Map<string, AudioBuffer | null>();
/** Téléchargements en cours, pour ne pas en lancer deux sur le même fichier. */
const enCours = new Map<string, Promise<AudioBuffer | null>>();

try {
  const v = localStorage.getItem(CLE_VOLUME);
  if (v !== null) volume = Math.min(1, Math.max(0, Number(v)));
  muet = localStorage.getItem(CLE_MUET) === '1';
} catch {
  // Stockage bloqué : on garde les valeurs par défaut, le son marche quand même.
}

/** Ouvre le contexte si besoin. Rend null quand l'audio n'est pas disponible. */
function reveiller(): AudioContext | null {
  if (contexte) {
    // Un contexte peut être re-suspendu par le navigateur, par exemple quand
    // l'onglet passe en arrière-plan. On le relance sans bruit.
    if (contexte.state === 'suspended') void contexte.resume();
    return contexte;
  }
  try {
    contexte = new AudioContext();
    master = contexte.createGain();
    master.gain.value = muet ? 0 : volume;
    master.connect(contexte.destination);
    return contexte;
  } catch {
    return null;
  }
}

/**
 * Branche l'ouverture du contexte sur le premier geste du joueur.
 *
 * `once` sur chacun des trois : le premier qui arrive ouvre le contexte, et
 * les trois écouteurs se retirent. Trois événements et pas un seul parce que
 * le jeu se joue à la souris, au clavier et au doigt.
 */
export function armerAudio(): void {
  const ouvrir = (): void => {
    reveiller();
    window.removeEventListener('pointerdown', ouvrir);
    window.removeEventListener('keydown', ouvrir);
    window.removeEventListener('touchstart', ouvrir);
  };
  window.addEventListener('pointerdown', ouvrir, { once: true });
  window.addEventListener('keydown', ouvrir, { once: true });
  window.addEventListener('touchstart', ouvrir, { once: true });
}

export function volumeAudio(): number {
  return volume;
}

export function estMuet(): boolean {
  return muet;
}

export function reglerVolume(valeur: number): void {
  volume = Math.min(1, Math.max(0, valeur));
  if (master) master.gain.value = muet ? 0 : volume;
  try {
    localStorage.setItem(CLE_VOLUME, String(volume));
  } catch {
    // Sans stockage, le réglage ne survit pas à la session. Tant pis.
  }
}

export function reglerMuet(valeur: boolean): void {
  muet = valeur;
  if (master) master.gain.value = muet ? 0 : volume;
  try {
    localStorage.setItem(CLE_MUET, muet ? '1' : '0');
  } catch {
    // idem
  }
}

/* ---------- Échantillons ---------- */

async function charger(url: string): Promise<AudioBuffer | null> {
  const connu = mémoire.get(url);
  if (connu !== undefined) return connu;

  const dejaEnRoute = enCours.get(url);
  if (dejaEnRoute) return dejaEnRoute;

  const ctx = reveiller();
  if (!ctx) return null;

  const promesse = (async () => {
    try {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(String(reponse.status));
      const brut = await reponse.arrayBuffer();
      const tampon = await ctx.decodeAudioData(brut);
      mémoire.set(url, tampon);
      return tampon;
    } catch {
      // Un son manquant ne doit jamais casser une manche. On mémorise
      // l'échec pour ne pas retélécharger le fichier à chaque tir.
      mémoire.set(url, null);
      return null;
    } finally {
      enCours.delete(url);
    }
  })();

  enCours.set(url, promesse);
  return promesse;
}

export interface OptionsEchantillon {
  /** Volume relatif, de 0 à 1. */
  gain?: number;
  /** Variation de hauteur, en demi-tons. Tirée au hasard dans ±écart. */
  variation?: number;
}

/**
 * Joue un échantillon.
 *
 * Ne rend rien et n'échoue jamais : un son est un ornement, et le jeu doit
 * tourner à l'identique sans lui.
 */
export function jouerEchantillon(url: string, options: OptionsEchantillon = {}): void {
  void (async () => {
    const tampon = await charger(url);
    const ctx = contexte;
    if (!tampon || !ctx || !master || muet) return;

    const source = ctx.createBufferSource();
    source.buffer = tampon;

    // Une variation de hauteur à chaque tir : sans elle, cent impacts
    // identiques en deux secondes s'entendent comme un bug de répétition.
    const ecart = options.variation ?? 0;
    if (ecart > 0) {
      const demiTons = (Math.random() * 2 - 1) * ecart;
      source.playbackRate.value = Math.pow(2, demiTons / 12);
    }

    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    source.connect(gain).connect(master);
    source.start();
  })();
}

/** Met un échantillon en cache avant d'en avoir besoin. */
export function prechargerEchantillon(url: string): void {
  void charger(url);
}

/* ---------- Synthèse ---------- */

export interface OptionsBip {
  /** Hauteur de départ, en hertz. */
  frequence: number;
  /** Hauteur d'arrivée. Égale à la précédente pour une note tenue. */
  vers?: number;
  /** Durée, en secondes. */
  duree?: number;
  gain?: number;
  forme?: OscillatorType;
  /** Retard avant le départ, pour enchaîner des notes. */
  retard?: number;
}

/**
 * Un bip.
 *
 * L'enveloppe est volontairement raide — attaque immédiate, extinction
 * exponentielle. C'est ce qui donne le grain d'une puce sonore : une
 * enveloppe douce sur une onde carrée sonne comme un synthétiseur bon marché,
 * pas comme une Game Boy.
 */
export function bip(options: OptionsBip): void {
  const ctx = reveiller();
  if (!ctx || !master || muet) return;

  const depart = ctx.currentTime + (options.retard ?? 0);
  const duree = options.duree ?? 0.08;

  const oscillateur = ctx.createOscillator();
  oscillateur.type = options.forme ?? 'square';
  oscillateur.frequency.setValueAtTime(options.frequence, depart);
  if (options.vers && options.vers !== options.frequence) {
    oscillateur.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.vers),
      depart + duree
    );
  }

  const gain = ctx.createGain();
  const sommet = options.gain ?? 0.18;
  gain.gain.setValueAtTime(sommet, depart);
  // `exponentialRamp` n'accepte pas zéro : on descend très bas, puis on coupe.
  gain.gain.exponentialRampToValueAtTime(0.0001, depart + duree);

  oscillateur.connect(gain).connect(master);
  oscillateur.start(depart);
  oscillateur.stop(depart + duree + 0.02);
}

/** Une suite de bips, jouée en arpège. */
export function arpege(
  frequences: readonly number[],
  options: Omit<OptionsBip, 'frequence'> & { pas?: number } = {}
): void {
  const pas = options.pas ?? 0.07;
  frequences.forEach((frequence, i) => {
    bip({ ...options, frequence, retard: (options.retard ?? 0) + i * pas });
  });
}

/** Bruit blanc filtré : ce qui ne se chante pas — souffle, choc sourd. */
export function souffle(duree = 0.12, gainCible = 0.12, coupure = 1200): void {
  const ctx = reveiller();
  if (!ctx || !master || muet) return;

  const echantillons = Math.floor(ctx.sampleRate * duree);
  const tampon = ctx.createBuffer(1, echantillons, ctx.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < echantillons; i++) donnees[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = tampon;

  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = coupure;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainCible, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duree);

  source.connect(filtre).connect(gain).connect(master);
  source.start();
}
