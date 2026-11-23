// LOW RAILS IN A MODEL (b1105ko, 2026-11-23; neon_rails.mjs writes the pieces): each rail one node at the scene's top (an object of its own to the page's fade by node), one
// mesh of plain boxes (the posts, a level bar) and of sheared boxes (a bar that leans with a slope), all in one flat material named Rail_flat.
// usage: node glb_rails.mjs <in.glb> <out.glb> <pieces.json>
//   pieces.json: { color: [r, g, b] (linear, 0..1), pieces: [{ name: "Rail_…", boxes: [{ min: [x, y, z], max: [x, y, z] }], hexa: [[eight corners: the bottom four, then the top four]] }] }, model metres
// A model that has rails loses them first — their nodes, meshes, accessors, views and bytes, which are the file's last, where this tool wrote them — so a run on its own
// output writes the same file. It stops if the earlier rails are not the file's last things (another tool has written after them): glb_drop_nodes.mjs "prefix=Rail_" and
// glb_strip.mjs take them out then.
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, piecesF] = process.argv.slice(2); if (!piecesF) { console.error('usage: node glb_rails.mjs <in.glb> <out.glb> <pieces.json>'); process.exit(2); }
const { color, pieces } = JSON.parse(readFileSync(piecesF, 'utf8')); if (!Array.isArray(color) || color.length !== 3 || !Array.isArray(pieces)) throw new Error('pieces.json: { color: [r, g, b], pieces: [...] }');
if (pieces.some((p) => !/^Rail_\d/.test(p.name ?? ''))) throw new Error('a piece\'s name begins with Rail_ and a digit: the earlier rails are known by it');
const buf = readFileSync(inF); const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const after = buf.slice(20 + jsonLen); const binLen = after.readUInt32LE(0); if (after.readUInt32LE(4) !== 0x004E4942) throw new Error('no BIN chunk');
let bin = Buffer.from(after.slice(8, 8 + binLen)); const tail = after.slice(8 + binLen); const scene = json.scenes[json.scene ?? 0];
// THE EARLIER RAILS OUT: every list cut back to where they began
const old = json.nodes.map((n, i) => (/^Rail_\d/.test(n.name ?? '') ? i : -1)).filter((i) => i >= 0);
if (old.length) { const notLast = (what) => { throw new Error(`the earlier rails are not the file's last ${what}: take them out with glb_drop_nodes.mjs "prefix=Rail_" and glb_strip.mjs, then run this again`); };
  const n0 = old[0]; if (old.some((ni, k) => ni !== n0 + k) || n0 + old.length !== json.nodes.length || json.nodes.some((n) => (n.children ?? []).some((c) => c >= n0))) notLast('nodes');
  const ms = old.map((ni) => json.nodes[ni].mesh), m0 = Math.min(...ms); if (new Set(ms).size !== ms.length || m0 + ms.length !== json.meshes.length || json.nodes.slice(0, n0).some((n) => n.mesh >= m0)) notLast('meshes');
  const as = ms.flatMap((mi) => json.meshes[mi].primitives.flatMap((p) => [...Object.values(p.attributes), p.indices])), a0 = Math.min(...as);
  const usedBefore = new Set(json.meshes.slice(0, m0).flatMap((m) => m.primitives.flatMap((p) => [...Object.values(p.attributes), p.indices, ...(p.targets ?? []).flatMap((t) => Object.values(t))])));
  for (const sk of json.skins ?? []) usedBefore.add(sk.inverseBindMatrices); for (const an of json.animations ?? []) for (const sm of an.samplers ?? []) { usedBefore.add(sm.input); usedBefore.add(sm.output); }
  if (new Set(as).size !== as.length || a0 + as.length !== json.accessors.length || [...usedBefore].some((ai) => ai >= a0)) notLast('accessors');
  const vs = as.map((ai) => json.accessors[ai].bufferView), v0 = Math.min(...vs); const cut = json.bufferViews[v0].byteOffset;
  if (new Set(vs).size !== vs.length || v0 + vs.length !== json.bufferViews.length || json.accessors.slice(0, a0).some((a) => a.bufferView >= v0) || (json.images ?? []).some((im) => im.bufferView >= v0)
    || json.bufferViews.slice(0, v0).some((v) => (v.byteOffset ?? 0) + v.byteLength > cut) || json.bufferViews.slice(v0).some((v) => v.byteOffset < cut)) notLast('views');
  json.nodes.length = n0; json.meshes.length = m0; json.accessors.length = a0; json.bufferViews.length = v0; bin = bin.subarray(0, cut); scene.nodes = scene.nodes.filter((i) => i < n0); }
const COMPS = { SCALAR: 1, VEC3: 3 }; const chunks = [bin]; let size = bin.length;
const addAccessor = (typed, componentType, type, target, extra = {}) => { const pad = (4 - (size % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); size += pad; }
  json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: typed.byteLength, target }); chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)); size += typed.byteLength;
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / COMPS[type], type, ...extra }); return json.accessors.length - 1; };
json.materials = json.materials ?? []; let mi = json.materials.findIndex((m) => m.name === 'Rail_flat'); const mat = { name: 'Rail_flat', pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 1 } };
if (mi < 0) { json.materials.push(mat); mi = json.materials.length - 1; } else json.materials[mi] = mat;
let tris = 0;
for (const pc of pieces) { const hx = pc.hexa ?? []; const nb = pc.boxes.length + hx.length; const P = new Float32Array(nb * 72), N = new Float32Array(nb * 72), I = new Uint16Array(nb * 36); const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  // a box: six faces, four corners each, the normal out
  pc.boxes.forEach((b, bi) => { const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max; for (let k = 0; k < 3; k += 1) { mn[k] = Math.min(mn[k], b.min[k]); mx[k] = Math.max(mx[k], b.max[k]); }
    const faces = [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]]];
    faces.forEach((f, k) => { for (let c = 0; c < 4; c += 1) { const v = bi * 24 + k * 4 + c; P.set(f[c], v * 3); N.set(f[4], v * 3); } const o = bi * 24 + k * 4; I.set([o, o + 1, o + 2, o, o + 2, o + 3], bi * 36 + k * 6); }); });
  // a sheared box: eight corners, the bottom four then the top four, each face's normal from its own corners and turned away from the middle
  hx.forEach((v, hi) => { const bi = pc.boxes.length + hi; const cen = [0, 1, 2].map((k) => v.reduce((s, q) => s + q[k], 0) / 8); for (const q of v) for (let k = 0; k < 3; k += 1) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
    const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    quads.forEach((qd, k) => { let c4 = qd.map((j) => v[j]); const e1 = [0, 1, 2].map((j) => c4[1][j] - c4[0][j]), e2 = [0, 1, 2].map((j) => c4[3][j] - c4[0][j]); let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const ln = Math.hypot(...nrm) || 1; nrm = nrm.map((q) => q / ln);
      const fc = [0, 1, 2].map((j) => (c4[0][j] + c4[1][j] + c4[2][j] + c4[3][j]) / 4); if (nrm[0] * (fc[0] - cen[0]) + nrm[1] * (fc[1] - cen[1]) + nrm[2] * (fc[2] - cen[2]) < 0) { nrm = nrm.map((q) => -q); c4 = [c4[0], c4[3], c4[2], c4[1]]; }
      for (let c = 0; c < 4; c += 1) { const vi = bi * 24 + k * 4 + c; P.set(c4[c], vi * 3); N.set(nrm, vi * 3); } const o = bi * 24 + k * 4; I.set([o, o + 1, o + 2, o, o + 2, o + 3], bi * 36 + k * 6); }); });
  const f32 = (a) => a.map((v) => Math.fround(v)); const attributes = { POSITION: addAccessor(P, 5126, 'VEC3', 34962, { min: f32(mn), max: f32(mx) }), NORMAL: addAccessor(N, 5126, 'VEC3', 34962) };
  json.meshes.push({ name: pc.name, primitives: [{ attributes, indices: addAccessor(I, 5123, 'SCALAR', 34963), mode: 4, material: mi }] }); json.nodes.push({ name: pc.name, mesh: json.meshes.length - 1 }); scene.nodes.push(json.nodes.length - 1); tris += nb * 12; }
{ const pad = (4 - (size % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); size += pad; } bin = Buffer.concat(chunks); json.buffers[0].byteLength = bin.length; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4); const rest = Buffer.concat([binHead, bin, tail]);
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + rest.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, rest]));
console.log(`${outF}: ${old.length} earlier rails out, ${pieces.length} rails in (${tris} triangles); ${((20 + jb.length + rest.length) / 1048576).toFixed(2)} MB (was ${(buf.length / 1048576).toFixed(2)}), ${json.nodes.length} nodes, ${scene.nodes.length} at the scene's top`);
