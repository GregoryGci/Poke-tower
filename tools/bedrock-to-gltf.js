/**
 * bedrock-to-gltf.js — convertit un modèle Minecraft Bedrock (Cobblemon) en GLB.
 *
 * Entrée  : <nom>.geo.json (+ <nom>.animation.json et <nom>.png optionnels)
 * Sortie  : un GLB contenant UN SEUL SkinnedMesh — 1 draw call — dont chaque cube
 *           est rattaché à son os par une influence unique, plus les animations
 *           keyframées converties.
 *
 * Usage : node bedrock-to-gltf.js <modele.geo.json> [sortie.glb]
 *         Les fichiers .animation.json et .png voisins sont repris automatiquement.
 */

const fs = require('fs');
const path = require('path');

const UNIT = 1 / 16;   // 16 unités Bedrock = 1 bloc
const DEG = Math.PI / 180;

/* ---------- Algèbre ---------- */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/**
 * Bedrock note ses rotations en degrés, sens horaire vu depuis l'axe positif —
 * l'inverse de la convention glTF sur X et Y. D'où les deux négations.
 * Ordre d'application : X, puis Y, puis Z.
 */
function quatFromBedrock([rx, ry, rz]) {
  const half = (d) => (d * DEG) / 2;
  const qx = [Math.sin(half(-rx)), 0, 0, Math.cos(half(-rx))];
  const qy = [0, Math.sin(half(-ry)), 0, Math.cos(half(-ry))];
  const qz = [0, 0, Math.sin(half(rz)), Math.cos(half(rz))];
  return quatMultiply(quatMultiply(qz, qy), qx);
}

function matrixFromTRS(t, q, s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) throw new Error('Matrice non inversible');
  det = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

const transformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

const transformDir = (m, v) => {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
};

/* ---------- Dépliage UV « box » de Minecraft ---------- */

/**
 * Une seule paire [u,v] décrit les six faces, posées selon ce gabarit :
 *
 *        +------+------+
 *        |  up  | down |            hauteur sz
 *  +-----+------+------+------+
 *  | est | nord | ouest| sud  |     hauteur sy
 *  +-----+------+------+------+
 *  u   u+sz  u+sz+sx  u+2sz+sx
 */
function boxUV(u, v, [sx, sy, sz], mirror) {
  const rects = {
    east:  [u, v + sz, sz, sy],
    north: [u + sz, v + sz, sx, sy],
    west:  [u + sz + sx, v + sz, sz, sy],
    south: [u + sz + sx + sz, v + sz, sx, sy],
    up:    [u + sz, v, sx, sz],
    down:  [u + sz + sx, v, sx, sz],
  };
  if (mirror) {
    const e = rects.east;
    rects.east = rects.west;
    rects.west = e;
  }
  return rects;
}

/* ---------- Construction des faces d'un cube ---------- */

// [normale, sommets dans l'ordre (coins du cube en 0/1 par axe), face UV]
const FACES = [
  { key: 'east',  n: [1, 0, 0],  corners: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]] },
  { key: 'west',  n: [-1, 0, 0], corners: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]] },
  { key: 'up',    n: [0, 1, 0],  corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { key: 'down',  n: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { key: 'south', n: [0, 0, 1],  corners: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]] },
  { key: 'north', n: [0, 0, -1], corners: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
];

/* ---------- Conversion ---------- */

function convert(geoFile, outputFile) {
  const geoDoc = JSON.parse(fs.readFileSync(geoFile, 'utf8'));
  const geo = geoDoc['minecraft:geometry']?.[0];
  if (!geo) throw new Error("Format inattendu : pas de bloc 'minecraft:geometry'");

  const texW = geo.description.texture_width || 64;
  const texH = geo.description.texture_height || 64;
  const bones = geo.bones || [];

  // --- Hiérarchie et matrices de repos
  const byName = new Map(bones.map((b, i) => [b.name, i]));
  const parentOf = bones.map((b) => (b.parent !== undefined ? byName.get(b.parent) : undefined));

  const restLocal = bones.map((b, i) => {
    const pivot = b.pivot || [0, 0, 0];
    const parentPivot = parentOf[i] !== undefined ? bones[parentOf[i]].pivot || [0, 0, 0] : [0, 0, 0];
    const t = [
      (pivot[0] - parentPivot[0]) * UNIT,
      (pivot[1] - parentPivot[1]) * UNIT,
      (pivot[2] - parentPivot[2]) * UNIT,
    ];
    return { t, q: quatFromBedrock(b.rotation || [0, 0, 0]) };
  });

  const world = new Array(bones.length);
  const computeWorld = (i) => {
    if (world[i]) return world[i];
    const local = matrixFromTRS(restLocal[i].t, restLocal[i].q);
    const p = parentOf[i];
    world[i] = p !== undefined ? multiply(computeWorld(p), local) : local;
    return world[i];
  };
  bones.forEach((_, i) => computeWorld(i));

  // --- Géométrie : chaque cube est cuit en espace monde au repos
  const positions = [], normals = [], uvs = [], jointIdx = [], weights = [], indices = [];
  let cubeCount = 0;

  for (let bi = 0; bi < bones.length; bi++) {
    const bone = bones[bi];
    const pivot = bone.pivot || [0, 0, 0];
    const boneWorld = world[bi];

    for (const cube of bone.cubes || []) {
      cubeCount++;
      const inflate = cube.inflate || 0;
      const origin = cube.origin;
      const size = cube.size;

      // Coins du cube, ramenés dans le repère local de l'os (pivot à l'origine).
      const lo = [0, 1, 2].map((a) => (origin[a] - inflate - pivot[a]) * UNIT);
      const hi = [0, 1, 2].map((a) => (origin[a] + size[a] + inflate - pivot[a]) * UNIT);

      // Rotation propre au cube, autour de son propre pivot.
      let cubeMatrix = IDENTITY;
      if (cube.rotation) {
        const cp = (cube.pivot || pivot).map((v, a) => (v - pivot[a]) * UNIT);
        const rot = matrixFromTRS([0, 0, 0], quatFromBedrock(cube.rotation));
        cubeMatrix = multiply(
          multiply(matrixFromTRS(cp, [0, 0, 0, 1]), rot),
          matrixFromTRS(cp.map((v) => -v), [0, 0, 0, 1])
        );
      }
      const full = multiply(boneWorld, cubeMatrix);

      const rects = boxUV(cube.uv[0], cube.uv[1], size, cube.mirror);

      for (const face of FACES) {
        const [ru, rv, rw, rh] = rects[face.key];
        const base = positions.length / 3;

        // Les faces haute et basse sont retournées verticalement dans le gabarit MC.
        const flipped = face.key === 'up' || face.key === 'down';
        const uvCorners = flipped
          ? [[0, 1], [1, 1], [1, 0], [0, 0]]
          : [[0, 0], [1, 0], [1, 1], [0, 1]];

        face.corners.forEach((corner, k) => {
          const p = transformPoint(full, [
            corner[0] ? hi[0] : lo[0],
            corner[1] ? hi[1] : lo[1],
            corner[2] ? hi[2] : lo[2],
          ]);
          positions.push(p[0], p[1], p[2]);
          const n = transformDir(full, face.n);
          normals.push(n[0], n[1], n[2]);
          uvs.push((ru + uvCorners[k][0] * rw) / texW, (rv + uvCorners[k][1] * rh) / texH);
          jointIdx.push(bi, 0, 0, 0);
          weights.push(1, 0, 0, 0);
        });

        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  if (!cubeCount) throw new Error('Aucun cube trouvé dans ce modèle');

  /* ---------- Animations ---------- */

  const animFile = geoFile.replace(/\.geo\.json$/i, '.animation.json');
  const animations = [];
  const warnings = [];
  let molangSkipped = 0;

  if (fs.existsSync(animFile)) {
    const doc = JSON.parse(fs.readFileSync(animFile, 'utf8'));
    for (const [fullName, anim] of Object.entries(doc.animations || {})) {
      const length = anim.animation_length || 1;
      const channels = [];

      for (const [boneName, tracks] of Object.entries(anim.bones || {})) {
        const bi = byName.get(boneName);
        if (bi === undefined) {
          warnings.push(`os inconnu dans « ${fullName} » : ${boneName}`);
          continue;
        }

        for (const [kind, raw] of Object.entries(tracks)) {
          if (!['rotation', 'position', 'scale'].includes(kind)) continue;

          // Une valeur peut être : constante, objet temps -> valeur, ou expression Molang.
          let keyframes;
          if (Array.isArray(raw) || typeof raw === 'number') {
            keyframes = { 0: raw, [length]: raw };
          } else if (raw && typeof raw === 'object') {
            keyframes = {};
            for (const [time, value] of Object.entries(raw)) {
              keyframes[time] = value?.post ?? value?.pre ?? value;
            }
          } else continue;

          const times = [], values = [];
          let skipped = false;

          for (const time of Object.keys(keyframes).sort((a, b) => parseFloat(a) - parseFloat(b))) {
            let v = keyframes[time];
            if (typeof v === 'number') v = [v, v, v];
            if (!Array.isArray(v) || v.some((x) => typeof x === 'string')) { skipped = true; break; }

            times.push(parseFloat(time));
            if (kind === 'rotation') {
              // Les rotations d'animation s'ajoutent à la pose de repos de l'os.
              values.push(...quatMultiply(restLocal[bi].q, quatFromBedrock(v)));
            } else if (kind === 'position') {
              values.push(
                restLocal[bi].t[0] + v[0] * UNIT,
                restLocal[bi].t[1] + v[1] * UNIT,
                restLocal[bi].t[2] + v[2] * UNIT
              );
            } else {
              values.push(v[0], v[1], v[2]);
            }
          }

          if (skipped) { molangSkipped++; continue; }
          if (times.length < 2) {
            times.push(times[0] + length);
            values.push(...values.slice(-(kind === 'rotation' ? 4 : 3)));
          }

          channels.push({
            node: bi,
            path: kind === 'rotation' ? 'rotation' : kind === 'position' ? 'translation' : 'scale',
            times,
            values,
          });
        }
      }

      if (channels.length) {
        animations.push({ name: fullName, channels, loop: anim.loop !== false });
      }
    }
  }

  /* ---------- Écriture du GLB ---------- */

  const chunks = [];
  let byteLength = 0;
  const pushView = (buf, target) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    const offset = byteLength;
    chunks.push(buf);
    byteLength += buf.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    return gltf.bufferViews.length - 1;
  };
  const f32 = (a) => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  const u16 = (a) => { const b = Buffer.alloc(a.length * 2); a.forEach((v, i) => b.writeUInt16LE(v, i * 2)); return b; };
  const u32 = (a) => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };
  const pushAccessor = (o) => { gltf.accessors.push(o); return gltf.accessors.length - 1; };

  const gltf = {
    asset: { version: '2.0', generator: 'bedrock-to-gltf' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    accessors: [],
    bufferViews: [],
  };

  // Un nœud par os, hiérarchie conservée.
  bones.forEach((b, i) => {
    gltf.nodes.push({
      name: b.name,
      translation: restLocal[i].t,
      rotation: restLocal[i].q,
      children: [],
    });
  });
  bones.forEach((_, i) => {
    if (parentOf[i] !== undefined) gltf.nodes[parentOf[i]].children.push(i);
    else gltf.scenes[0].nodes.push(i);
  });
  gltf.nodes.forEach((n) => { if (!n.children.length) delete n.children; });

  const vertexCount = positions.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++)
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i * 3 + c]);
      max[c] = Math.max(max[c], positions[i * 3 + c]);
    }

  const accPos = pushAccessor({ bufferView: pushView(f32(positions), 34962), componentType: 5126, type: 'VEC3', count: vertexCount, min, max });
  const accNrm = pushAccessor({ bufferView: pushView(f32(normals), 34962), componentType: 5126, type: 'VEC3', count: vertexCount });
  const accUv = pushAccessor({ bufferView: pushView(f32(uvs), 34962), componentType: 5126, type: 'VEC2', count: vertexCount });
  const accJnt = pushAccessor({ bufferView: pushView(u16(jointIdx), 34962), componentType: 5123, type: 'VEC4', count: vertexCount });
  const accWgt = pushAccessor({ bufferView: pushView(f32(weights), 34962), componentType: 5126, type: 'VEC4', count: vertexCount });
  const big = vertexCount > 65535;
  const accIdx = pushAccessor({
    bufferView: pushView(big ? u32(indices) : u16(indices), 34963),
    componentType: big ? 5125 : 5123, type: 'SCALAR', count: indices.length,
  });

  const ibm = [];
  bones.forEach((_, i) => ibm.push(...invert(world[i])));
  const accIbm = pushAccessor({ bufferView: pushView(f32(ibm)), componentType: 5126, type: 'MAT4', count: bones.length });

  // Texture : reprise du PNG voisin s'il existe.
  const pngFile = geoFile.replace(/\.geo\.json$/i, '.png');
  let materialIndex;
  if (fs.existsSync(pngFile)) {
    const view = pushView(fs.readFileSync(pngFile));
    gltf.images = [{ name: path.basename(pngFile, '.png'), mimeType: 'image/png', bufferView: view }];
    // NEAREST : sans ça, le pixel art devient une bouillie floue.
    gltf.samplers = [{ magFilter: 9728, minFilter: 9986, wrapS: 33071, wrapT: 33071 }];
    gltf.textures = [{ sampler: 0, source: 0 }];
    gltf.materials = [{
      name: 'pixel',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      alphaMode: 'MASK', alphaCutoff: 0.5, doubleSided: false,
    }];
    materialIndex = 0;
  } else {
    gltf.materials = [{ name: 'sans_texture', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 } }];
    materialIndex = 0;
    warnings.push(`texture absente : ${path.basename(pngFile)}`);
  }

  gltf.meshes = [{
    name: geo.description.identifier || 'model',
    primitives: [{
      attributes: { POSITION: accPos, NORMAL: accNrm, TEXCOORD_0: accUv, JOINTS_0: accJnt, WEIGHTS_0: accWgt },
      indices: accIdx, material: materialIndex,
    }],
  }];
  gltf.skins = [{ joints: bones.map((_, i) => i), inverseBindMatrices: accIbm }];
  gltf.nodes.push({ name: 'skin_mesh', mesh: 0, skin: 0 });
  gltf.scenes[0].nodes.push(gltf.nodes.length - 1);

  if (animations.length) {
    gltf.animations = animations.map((a) => {
      const samplers = [], channels = [];
      for (const ch of a.channels) {
        const tView = pushView(f32(ch.times));
        const tAcc = pushAccessor({
          bufferView: tView, componentType: 5126, type: 'SCALAR', count: ch.times.length,
          min: [Math.min(...ch.times)], max: [Math.max(...ch.times)],
        });
        const size = ch.path === 'rotation' ? 4 : 3;
        const vAcc = pushAccessor({
          bufferView: pushView(f32(ch.values)), componentType: 5126,
          type: ch.path === 'rotation' ? 'VEC4' : 'VEC3', count: ch.values.length / size,
        });
        samplers.push({ input: tAcc, output: vAcc, interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
      }
      return { name: a.name, samplers, channels };
    });
  }

  const bin = Buffer.concat(chunks, byteLength);
  gltf.buffers = [{ byteLength: bin.length }];

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
  const binPad = bin.length % 4 ? Buffer.alloc(4 - (bin.length % 4)) : Buffer.alloc(0);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length + binPad.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);

  fs.writeFileSync(outputFile, Buffer.concat([header, jh, jsonBuf, bh, bin, binPad]));

  return {
    bones: bones.length, cubes: cubeCount, vertexCount, triangles: indices.length / 3,
    animations: animations.length, molangSkipped, warnings,
    size: fs.statSync(outputFile).size, texture: fs.existsSync(pngFile) ? `${texW}×${texH}` : 'aucune',
    min, max,
  };
}

/* ---------- CLI ---------- */

const [, , input, outputArg] = process.argv;
if (!input) {
  console.error('Usage : node bedrock-to-gltf.js <modele.geo.json> [sortie.glb]');
  process.exit(1);
}
const output = outputArg || input.replace(/\.geo\.json$/i, '.glb');
const r = convert(input, output);
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);

console.log(`\n  ${path.basename(input)}  ->  ${path.basename(output)}\n`);
console.log(`  Os              ${fmt(r.bones)}`);
console.log(`  Cubes           ${fmt(r.cubes)}`);
console.log(`  Triangles       ${fmt(r.triangles)}   (${fmt(r.vertexCount)} sommets)`);
console.log(`  Draw calls      1`);
console.log(`  Animations      ${fmt(r.animations)}${r.molangSkipped ? `  (${r.molangSkipped} pistes Molang ignorées)` : ''}`);
console.log(`  Texture         ${r.texture}`);
console.log(`  Taille          ${(r.size / 1024).toFixed(0)} Ko`);
console.log(`  Emprise         [${r.min.map((v) => v.toFixed(2)).join(', ')}] .. [${r.max.map((v) => v.toFixed(2)).join(', ')}]`);
if (r.warnings.length) {
  console.log(`\n  Avertissements (${r.warnings.length}) :`);
  for (const w of r.warnings.slice(0, 8)) console.log(`    - ${w}`);
  if (r.warnings.length > 8) console.log(`    … et ${r.warnings.length - 8} autres`);
}
console.log('');
