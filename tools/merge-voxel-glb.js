/**
 * merge-voxel-glb.js — fusionne un modèle voxel animé par nœuds en un seul SkinnedMesh.
 *
 * Les modèles voxel (type Sketchfab) sont découpés en un maillage par bloc, animés
 * en déplaçant les nœuds de la hiérarchie. Résultat : autant de draw calls que de
 * maillages. Comme chaque bloc reste rigide, chaque nœud animé se convertit en un os
 * à influence unique — on peut donc tout fusionner sans rien changer au rendu.
 *
 * La hiérarchie des nœuds et les pistes d'animation sont recopiées telles quelles :
 * aucun retargeting, donc aucune dérive possible sur les animations.
 *
 * Usage : node merge-voxel-glb.js <entree.glb> [sortie.glb]
 */

const fs = require('fs');
const path = require('path');

/* ---------- Algèbre 4×4 (colonne-major, convention glTF) ---------- */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function fromTRS(t, r, s) {
  const [x, y, z, w] = r;
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
  const [
    a00, a01, a02, a03, a10, a11, a12, a13,
    a20, a21, a22, a23, a30, a31, a32, a33,
  ] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) throw new Error('Matrice non inversible (échelle nulle sur un nœud ?)');
  det = 1 / det;

  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det,
    (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det,
    (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det,
    (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det,
    (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det,
    (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det,
    (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det,
    (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det,
    (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

const transformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// Les normales suivent l'inverse transposée : sans ça, une échelle non uniforme les fausse.
function normalMatrix(m) {
  const i = invert(m);
  return [i[0], i[4], i[8], i[1], i[5], i[9], i[2], i[6], i[10]];
}

function transformNormal(n3, v) {
  const x = n3[0] * v[0] + n3[3] * v[1] + n3[6] * v[2];
  const y = n3[1] * v[0] + n3[4] * v[1] + n3[7] * v[2];
  const z = n3[2] * v[0] + n3[5] * v[1] + n3[8] * v[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/* ---------- Lecture GLB ---------- */

const COMPONENT = {
  5120: { size: 1, get: (b, o) => b.readInt8(o) },
  5121: { size: 1, get: (b, o) => b.readUInt8(o) },
  5122: { size: 2, get: (b, o) => b.readInt16LE(o) },
  5123: { size: 2, get: (b, o) => b.readUInt16LE(o) },
  5125: { size: 4, get: (b, o) => b.readUInt32LE(o) },
  5126: { size: 4, get: (b, o) => b.readFloatLE(o) },
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} n'est pas un GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let bin = Buffer.alloc(0);
  let p = 20 + jsonLen;
  while (p < buf.length) {
    const len = buf.readUInt32LE(p);
    const type = buf.readUInt32LE(p + 4);
    if (type === 0x004e4942) bin = buf.slice(p + 8, p + 8 + len);
    p += 8 + len;
  }
  return { json, bin };
}

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const comp = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  const out = [];
  if (acc.bufferView === undefined) {
    for (let i = 0; i < acc.count * n; i++) out.push(0);
    return out;
  }
  const bv = gltf.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || comp.size * n;
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) out.push(comp.get(bin, base + i * stride + c * comp.size));
  }
  return out;
}

/* ---------- Écriture : assembleur de buffer ---------- */

class BufferBuilder {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  align(to = 4) {
    const pad = (to - (this.length % to)) % to;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.length += pad;
    }
  }
  add(buffer) {
    this.align(4);
    const offset = this.length;
    this.chunks.push(buffer);
    this.length += buffer.length;
    return offset;
  }
  concat() {
    return Buffer.concat(this.chunks, this.length);
  }
}

/* ---------- Conversion ---------- */

function convert(inputFile, outputFile) {
  const { json: src, bin } = readGLB(inputFile);
  const nodes = src.nodes || [];

  // 1. Matrices monde au repos, par descente de la hiérarchie.
  const local = nodes.map((n) =>
    n.matrix
      ? n.matrix.slice()
      : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1])
  );
  const world = new Array(nodes.length).fill(null);
  const parentOf = {};
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parentOf[c] = i)));

  const roots = (src.scenes?.[src.scene ?? 0]?.nodes) || nodes.map((_, i) => i).filter((i) => parentOf[i] === undefined);
  const descend = (i, parentWorld) => {
    world[i] = multiply(parentWorld, local[i]);
    for (const c of nodes[i].children || []) descend(c, world[i]);
  };
  roots.forEach((r) => descend(r, IDENTITY));

  // 2. Os = nœuds réellement pilotés par une animation.
  const animatedNodes = new Set();
  for (const anim of src.animations || []) {
    for (const ch of anim.channels) if (ch.target.node !== undefined) animatedNodes.add(ch.target.node);
  }
  // Un maillage sans ancêtre animé reste statique : on lui donne la racine comme os.
  const staticRoot = roots[0];
  if (!animatedNodes.size) animatedNodes.add(staticRoot);

  const joints = [...animatedNodes].sort((a, b) => a - b);
  const jointSlot = new Map(joints.map((n, i) => [n, i]));

  const nearestJoint = (nodeIndex) => {
    let cur = nodeIndex;
    while (cur !== undefined) {
      if (jointSlot.has(cur)) return jointSlot.get(cur);
      cur = parentOf[cur];
    }
    if (!jointSlot.has(staticRoot)) {
      joints.push(staticRoot);
      jointSlot.set(staticRoot, joints.length - 1);
    }
    return jointSlot.get(staticRoot);
  };

  // 3. Fusion des géométries, cuites en espace monde au repos.
  const positions = [], normals = [], uvs = [], jointIdx = [], weights = [], indices = [];
  let vertexBase = 0;
  let sourceMeshCount = 0;
  const materialsSeen = new Set();

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.mesh === undefined) continue;
    const mesh = src.meshes[node.mesh];
    const slot = nearestJoint(ni);
    const m = world[ni];
    const nm = normalMatrix(m);

    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) {
        console.warn(`  ! primitive ignorée (mode ${prim.mode}, seuls les triangles sont gérés)`);
        continue;
      }
      sourceMeshCount++;
      if (prim.material !== undefined) materialsSeen.add(prim.material);

      const pos = readAccessor(src, bin, prim.attributes.POSITION);
      const count = pos.length / 3;
      const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(src, bin, prim.attributes.NORMAL) : null;
      const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(src, bin, prim.attributes.TEXCOORD_0) : null;

      for (let v = 0; v < count; v++) {
        const p = transformPoint(m, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
        positions.push(p[0], p[1], p[2]);
        const n = nrm
          ? transformNormal(nm, [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]])
          : [0, 1, 0];
        normals.push(n[0], n[1], n[2]);
        uvs.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0);
        jointIdx.push(slot, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }

      if (prim.indices !== undefined) {
        for (const i of readAccessor(src, bin, prim.indices)) indices.push(i + vertexBase);
      } else {
        for (let i = 0; i < count; i++) indices.push(i + vertexBase);
      }
      vertexBase += count;
    }
  }

  if (materialsSeen.size > 1) {
    console.warn(
      `  ! ${materialsSeen.size} matériaux distincts : la fusion n'en garde qu'un (${[...materialsSeen][0]}).\n` +
      `    Fusionne d'abord les textures en atlas, sinon l'aspect changera.`
    );
  }

  // 4. Nouveau document : hiérarchie et animations recopiées à l'identique.
  const out = {
    asset: { version: '2.0', generator: 'merge-voxel-glb' },
    scene: 0,
    scenes: JSON.parse(JSON.stringify(src.scenes || [{ nodes: roots }])),
    nodes: nodes.map((n) => {
      const copy = { ...n };
      delete copy.mesh; // la géométrie vit désormais dans le mesh fusionné
      delete copy.skin;
      return copy;
    }),
    materials: src.materials ? JSON.parse(JSON.stringify(src.materials)) : undefined,
    textures: src.textures ? JSON.parse(JSON.stringify(src.textures)) : undefined,
    samplers: src.samplers ? JSON.parse(JSON.stringify(src.samplers)) : undefined,
    accessors: [],
    bufferViews: [],
  };

  const bb = new BufferBuilder();
  const pushView = (buffer, target) => {
    const offset = bb.add(buffer);
    out.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, ...(target ? { target } : {}) });
    return out.bufferViews.length - 1;
  };
  const pushAccessor = (view, componentType, type, count, extra = {}) => {
    out.accessors.push({ bufferView: view, componentType, type, count, ...extra });
    return out.accessors.length - 1;
  };

  const f32 = (arr) => {
    const b = Buffer.alloc(arr.length * 4);
    arr.forEach((v, i) => b.writeFloatLE(v, i * 4));
    return b;
  };
  const u16 = (arr) => {
    const b = Buffer.alloc(arr.length * 2);
    arr.forEach((v, i) => b.writeUInt16LE(v, i * 2));
    return b;
  };
  const u32 = (arr) => {
    const b = Buffer.alloc(arr.length * 4);
    arr.forEach((v, i) => b.writeUInt32LE(v, i * 4));
    return b;
  };

  const vertexCount = positions.length / 3;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < vertexCount; i++) {
    for (let c = 0; c < 3; c++) {
      bounds.min[c] = Math.min(bounds.min[c], positions[i * 3 + c]);
      bounds.max[c] = Math.max(bounds.max[c], positions[i * 3 + c]);
    }
  }

  const accPos = pushAccessor(pushView(f32(positions), 34962), 5126, 'VEC3', vertexCount, { min: bounds.min, max: bounds.max });
  const accNrm = pushAccessor(pushView(f32(normals), 34962), 5126, 'VEC3', vertexCount);
  const accUv = pushAccessor(pushView(f32(uvs), 34962), 5126, 'VEC2', vertexCount);
  const accJoints = pushAccessor(pushView(u16(jointIdx), 34962), 5123, 'VEC4', vertexCount);
  const accWeights = pushAccessor(pushView(f32(weights), 34962), 5126, 'VEC4', vertexCount);

  const needs32 = vertexCount > 65535;
  const accIdx = pushAccessor(
    pushView(needs32 ? u32(indices) : u16(indices), 34963),
    needs32 ? 5125 : 5123,
    'SCALAR',
    indices.length
  );

  // Matrices de bind inverses : ramènent l'espace monde au repos dans l'espace de chaque os.
  const ibm = [];
  for (const j of joints) ibm.push(...invert(world[j]));
  const accIbm = pushAccessor(pushView(f32(ibm)), 5126, 'MAT4', joints.length);

  out.meshes = [
    {
      name: 'merged',
      primitives: [
        {
          attributes: { POSITION: accPos, NORMAL: accNrm, TEXCOORD_0: accUv, JOINTS_0: accJoints, WEIGHTS_0: accWeights },
          indices: accIdx,
          ...(materialsSeen.size ? { material: [...materialsSeen][0] } : {}),
        },
      ],
    },
  ];
  out.skins = [{ joints, inverseBindMatrices: accIbm }];

  // Le mesh fusionné vit à la racine, sans transformation : ses sommets sont déjà en espace monde.
  out.nodes.push({ name: 'merged_mesh', mesh: 0, skin: 0 });
  const mergedNodeIndex = out.nodes.length - 1;
  out.scenes[src.scene ?? 0].nodes = [...(out.scenes[src.scene ?? 0].nodes || roots), mergedNodeIndex];

  // Images : on recopie les octets, en conservant les URI externes telles quelles.
  if (src.images?.length) {
    out.images = src.images.map((im) => {
      if (im.bufferView === undefined) return { ...im };
      const bv = src.bufferViews[im.bufferView];
      const data = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      return { ...im, bufferView: pushView(Buffer.from(data)) };
    });
  }

  // Animations : chaque accesseur est recopié octet pour octet, les pistes ne bougent pas.
  if (src.animations?.length) {
    const copied = new Map();
    const copyAccessor = (index) => {
      if (copied.has(index)) return copied.get(index);
      const acc = src.accessors[index];
      const comp = COMPONENT[acc.componentType];
      const n = NUM_COMPONENTS[acc.type];
      const values = readAccessor(src, bin, index);
      const b = Buffer.alloc(acc.count * n * comp.size);
      for (let i = 0; i < values.length; i++) {
        const o = i * comp.size;
        if (acc.componentType === 5126) b.writeFloatLE(values[i], o);
        else if (acc.componentType === 5125) b.writeUInt32LE(values[i], o);
        else if (acc.componentType === 5123) b.writeUInt16LE(values[i], o);
        else if (acc.componentType === 5122) b.writeInt16LE(values[i], o);
        else if (acc.componentType === 5121) b.writeUInt8(values[i], o);
        else b.writeInt8(values[i], o);
      }
      const view = pushView(b);
      const newIndex = pushAccessor(view, acc.componentType, acc.type, acc.count, {
        ...(acc.min ? { min: acc.min } : {}),
        ...(acc.max ? { max: acc.max } : {}),
        ...(acc.normalized ? { normalized: true } : {}),
      });
      copied.set(index, newIndex);
      return newIndex;
    };

    out.animations = src.animations.map((anim) => ({
      name: anim.name,
      samplers: anim.samplers.map((s) => ({
        input: copyAccessor(s.input),
        output: copyAccessor(s.output),
        ...(s.interpolation ? { interpolation: s.interpolation } : {}),
      })),
      channels: anim.channels.map((c) => ({ sampler: c.sampler, target: { ...c.target } })),
    }));
  }

  const binBuffer = bb.concat();
  out.buffers = [{ byteLength: binBuffer.length }];
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];

  // Assemblage du conteneur GLB.
  let jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
  const binPad = binBuffer.length % 4 ? Buffer.alloc(4 - (binBuffer.length % 4)) : Buffer.alloc(0);
  const binTotal = binBuffer.length + binPad.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binTotal, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binTotal, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  fs.writeFileSync(outputFile, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuffer, binPad]));

  return {
    sourceMeshCount,
    vertexCount,
    triangles: indices.length / 3,
    joints: joints.length,
    animations: (out.animations || []).length,
    bounds,
    inputSize: fs.statSync(inputFile).size,
    outputSize: fs.statSync(outputFile).size,
  };
}

/* ---------- CLI ---------- */

const [, , input, outputArg] = process.argv;
if (!input) {
  console.error('Usage : node merge-voxel-glb.js <entree.glb> [sortie.glb]');
  process.exit(1);
}
const output = outputArg || input.replace(/\.glb$/i, '') + '.merged.glb';

const r = convert(input, output);
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);

console.log(`\n  ${path.basename(input)}  ->  ${path.basename(output)}\n`);
console.log(`  Draw calls      ${fmt(r.sourceMeshCount)}  ->  1`);
console.log(`  Sommets         ${fmt(r.vertexCount)}`);
console.log(`  Triangles       ${fmt(r.triangles)}`);
console.log(`  Os              ${fmt(r.joints)} (1 influence par sommet)`);
console.log(`  Animations      ${fmt(r.animations)} (recopiées sans modification)`);
console.log(`  Taille          ${(r.inputSize / 1024).toFixed(0)} Ko  ->  ${(r.outputSize / 1024).toFixed(0)} Ko`);
console.log(
  `  Emprise         [${r.bounds.min.map((v) => v.toFixed(2)).join(', ')}] .. [${r.bounds.max.map((v) => v.toFixed(2)).join(', ')}]\n`
);
