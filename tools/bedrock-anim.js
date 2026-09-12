/**
 * bedrock-anim.js — conversion des animations Bedrock en pistes glTF.
 *
 * Trois formes cohabitent dans les fichiers Cobblemon :
 *
 *   1. une valeur constante          "rotation": [20, 0, 0]
 *   2. des keyframes                 "rotation": { "0.0": [...], "1.5": [...] }
 *   3. une formule Molang            "rotation": ["math.sin(query.anim_time*90)*3", 0, 0]
 *
 * Les deux premières se traduisent directement. La troisième est évaluée puis
 * échantillonnée : c'est ce qui débloque `ground_idle` et `ground_walk`, écrits
 * exclusivement en formules et donc absents de toute conversion naïve.
 *
 * Une animation en formules n'a souvent pas de durée déclarée — elle est censée
 * tourner indéfiniment. On retrouve donc sa période en cherchant le plus petit
 * décalage temporel qui laisse toutes ses courbes inchangées.
 */

'use strict';

const fs = require('fs');
const { compile } = require('./molang');

/** Fréquence d'analyse pour la détection de période. */
const PROBE_HZ = 200;
/** Durée analysée, en secondes. Au-delà, on considère qu'il n'y a pas de boucle. */
const PROBE_SPAN = 12;
/** Périodes candidates, en secondes. */
const PERIOD_MIN = 0.2;
const PERIOD_MAX = 6;
const PERIOD_STEP = 0.05;
/** Densité des keyframes produites. */
const OUTPUT_FPS = 24;
/** Durée de repli quand aucune période n'est détectée. */
const FALLBACK_DURATION = 2;

/**
 * Contexte d'évaluation à un instant donné.
 *
 * `ground_speed` est la requête qui décide de l'amplitude des animations de
 * marche : à zéro, une démarche correcte ne bouge pas. On l'impose donc pour
 * les clips de déplacement, sinon on obtiendrait une piste plate.
 */
function makeContext(time, groundSpeed) {
  return {
    'query.anim_time': time,
    'query.life_time': time,
    'query.time_since_last_vibration_detection': time,
    'query.ground_speed': groundSpeed,
    'query.modified_distance_moved': time * groundSpeed,
    'query.modified_move_speed': groundSpeed,
    'query.walk_distance': time * groundSpeed,
    'query.is_on_ground': 1,
    'query.is_in_water': 0,
    'query.is_sleeping': 0,
    'query.health': 1,
    'query.max_health': 1,
    'query.yaw_speed': 0,
    'query.body_x_rotation': 0,
    'query.body_y_rotation': 0,
    'query.target_x_rotation': 0,
    'query.target_y_rotation': 0,
  };
}

function guessGroundSpeed(animationName) {
  const name = animationName.toLowerCase();
  if (name.includes('run') || name.includes('sprint')) return 1.4;
  if (name.includes('walk') || name.includes('swim') || name.includes('fly')) return 0.9;
  return 0;
}

/** Extrait la valeur brute d'une keyframe, qui peut être enveloppée. */
function unwrap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.post ?? value.pre ?? value.vector ?? value;
  }
  return value;
}

/** Normalise une valeur en triplet, chaque composante nombre ou expression. */
function toTriple(value) {
  const raw = unwrap(value);
  if (typeof raw === 'number' || typeof raw === 'string') return [raw, raw, raw];
  if (Array.isArray(raw)) return [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0];
  return [0, 0, 0];
}

function hasExpression(track) {
  if (typeof track === 'string') return true;
  if (Array.isArray(track)) return track.some((v) => typeof v === 'string');
  if (track && typeof track === 'object') {
    return Object.values(track).some((v) => hasExpression(unwrap(v)));
  }
  return false;
}

/**
 * Construit un échantillonneur : une fonction (time, context) -> [x, y, z].
 * Les keyframes sont interpolées linéairement, comme le fait Minecraft par défaut.
 */
function makeSampler(track) {
  if (typeof track === 'number' || typeof track === 'string' || Array.isArray(track)) {
    const parts = toTriple(track).map((v) => compile(v));
    return (_time, context) => parts.map((fn) => fn(context));
  }

  const times = Object.keys(track)
    .map(parseFloat)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length === 0) return () => [0, 0, 0];

  const frames = times.map((t) => ({
    time: t,
    parts: toTriple(track[String(t)] ?? track[t.toFixed(1)] ?? track[t]).map((v) => compile(v)),
  }));

  return (time, context) => {
    if (time <= frames[0].time) return frames[0].parts.map((fn) => fn(context));
    const last = frames[frames.length - 1];
    if (time >= last.time) return last.parts.map((fn) => fn(context));
    let i = 1;
    while (i < frames.length - 1 && frames[i].time < time) i++;
    const a = frames[i - 1];
    const b = frames[i];
    const span = b.time - a.time;
    const t = span > 0 ? (time - a.time) / span : 0;
    const va = a.parts.map((fn) => fn(context));
    const vb = b.parts.map((fn) => fn(context));
    return [0, 1, 2].map((k) => va[k] + (vb[k] - va[k]) * t);
  };
}

/**
 * Cherche la plus petite période qui laisse toutes les courbes identiques.
 * Retourne null si aucune n'est trouvée dans la plage explorée.
 */
function detectPeriod(samplers, groundSpeed) {
  const count = Math.floor(PROBE_SPAN * PROBE_HZ);
  // Une série par composante de chaque piste.
  const series = [];
  for (const sampler of samplers) {
    const rows = [[], [], []];
    for (let i = 0; i < count; i++) {
      const time = i / PROBE_HZ;
      const value = sampler(time, makeContext(time, groundSpeed));
      rows[0].push(value[0]);
      rows[1].push(value[1]);
      rows[2].push(value[2]);
    }
    for (const row of rows) {
      const min = Math.min(...row);
      const max = Math.max(...row);
      // Une composante constante n'impose aucune période.
      if (max - min > 1e-6) series.push({ row, tolerance: Math.max((max - min) * 0.02, 1e-4) });
    }
  }

  if (series.length === 0) return null;

  const compareCount = Math.floor(4 * PROBE_HZ);
  for (let period = PERIOD_MIN; period <= PERIOD_MAX + 1e-9; period += PERIOD_STEP) {
    const shift = Math.round(period * PROBE_HZ);
    if (shift <= 0) continue;
    let matches = true;
    for (const { row, tolerance } of series) {
      for (let i = 0; i < compareCount; i += 3) {
        if (Math.abs(row[i] - row[i + shift]) > tolerance) { matches = false; break; }
      }
      if (!matches) break;
    }
    if (matches) return Math.round(period * 1000) / 1000;
  }
  return null;
}

/**
 * Convertit un fichier .animation.json.
 *
 * @param {string} file chemin du fichier
 * @param {object} model { byName: Map<string,number>, restLocal: [{t,q}], unit, quatFromBedrock, quatMultiply }
 * @returns {{ animations: Array, sampled: number, unknownBones: string[] }}
 */
function convertAnimations(file, model) {
  if (!fs.existsSync(file)) return { animations: [], sampled: 0, unknownBones: [], broken: [] };

  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { byName, restLocal, unit, quatFromBedrock, quatMultiply } = model;
  const animations = [];
  const unknownBones = [];
  const broken = [];
  let sampled = 0;

  for (const [name, anim] of Object.entries(doc.animations || {})) {
    const groundSpeed = guessGroundSpeed(name);
    const channels = [];

    // Pistes retenues, avec leur échantillonneur.
    const entries = [];
    for (const [boneName, tracks] of Object.entries(anim.bones || {})) {
      const boneIndex = byName.get(boneName);
      if (boneIndex === undefined) {
        unknownBones.push(`${name} → ${boneName}`);
        continue;
      }
      for (const [kind, track] of Object.entries(tracks)) {
        if (!['rotation', 'position', 'scale'].includes(kind)) continue;
        let sampler;
        try {
          sampler = makeSampler(track);
        } catch (error) {
          // Certaines expressions sont tronquées dans les assets d'origine
          // (« math.sin(...)* » sans opérande). On perd la piste, pas le modèle.
          broken.push(`${name} → ${boneName}.${kind} : ${error.message}`);
          continue;
        }
        entries.push({
          boneIndex,
          kind,
          dynamic: hasExpression(track),
          sampler,
          keyTimes: track && typeof track === 'object' && !Array.isArray(track)
            ? Object.keys(track).map(parseFloat).filter(Number.isFinite).sort((a, b) => a - b)
            : null,
        });
      }
    }

    if (entries.length === 0) continue;

    const dynamic = entries.filter((e) => e.dynamic);
    let duration = anim.animation_length;
    if (!duration && dynamic.length) {
      duration = detectPeriod(dynamic.map((e) => e.sampler), groundSpeed);
    }
    if (!duration) {
      // Reste les poses constantes : deux keyframes identiques suffisent.
      const keyed = entries.flatMap((e) => e.keyTimes ?? []);
      duration = keyed.length ? Math.max(...keyed) || FALLBACK_DURATION : FALLBACK_DURATION;
    }

    for (const entry of entries) {
      const times = [];
      if (entry.dynamic) {
        const steps = Math.max(2, Math.round(duration * OUTPUT_FPS));
        for (let i = 0; i <= steps; i++) times.push((i / steps) * duration);
        sampled++;
      } else if (entry.keyTimes && entry.keyTimes.length >= 2) {
        times.push(...entry.keyTimes);
      } else {
        times.push(0, duration);
      }

      const values = [];
      const rest = restLocal[entry.boneIndex];
      for (const time of times) {
        const raw = entry.sampler(time, makeContext(time, groundSpeed));
        if (entry.kind === 'rotation') {
          // Bedrock ajoute la rotation d'animation à la pose de repos de l'os.
          values.push(...quatMultiply(rest.q, quatFromBedrock(raw)));
        } else if (entry.kind === 'position') {
          values.push(
            rest.t[0] + raw[0] * unit,
            rest.t[1] + raw[1] * unit,
            rest.t[2] + raw[2] * unit
          );
        } else {
          values.push(raw[0], raw[1], raw[2]);
        }
      }

      channels.push({
        node: entry.boneIndex,
        path: entry.kind === 'rotation' ? 'rotation' : entry.kind === 'position' ? 'translation' : 'scale',
        times,
        values,
      });
    }

    if (channels.length) animations.push({ name, duration, channels });
  }

  return { animations, sampled, unknownBones, broken };
}

module.exports = { convertAnimations, detectPeriod, makeSampler, makeContext };
