// A model of thousands of little parts (a Roblox map through Sketchfab: 27,000 nodes, one per brick) merged into things the
// game can draw and fade: parts whose boxes touch are one thing (a building and what stands against it), split where a
// thing grows past MAXD metres across (a whole block would fade as one); plates — the ground, the streets, long walls — are
// left as things of their own and glue nothing. Each thing becomes one node with one primitive per material, positions
// baked into world space, uvs kept only where the material has a picture, indices 16 or 32 bit as the count needs; the
// images carried over as they are. usage: node glb_merge_parts.mjs <in> <out> [maxD=40] [gap=0.05]
import { writeFileSync } from 'node:fs';
import { readGlb, accessor, worlds } from './glb_read.mjs';
const [inF, outF, maxDArg, gapArg] = process.argv.slice(2); const MAXD = Number(maxDArg ?? 40), GAP = Number(gapArg ?? 0.05);
const PLATE_SPAN = 60, PLATE_FLAT = 0.6, PLATE_AREA = 150;   // (a part longer than PLATE_SPAN, or flatter than PLATE_FLAT over PLATE_AREA m², is a plate)
const g = readGlb(inF); const J = g.json; const W = worlds(J);
const parts = [];   // { ni, box, prims: [{ mat, pos: Float32Array world, uv, idx }] }
J.nodes.forEach((n, ni) => { if (n.mesh === undefined) return; const w = W[ni]; const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; const prims = [];
  for (const p of J.meshes[n.mesh].primitives) { const src = accessor(g, p.attributes.POSITION); const nv = src.length / 3; const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i += 1) { const x = src[3*i], y = src[3*i+1], z = src[3*i+2]; const q = [w[0]*x + w[4]*y + w[8]*z + w[12], w[1]*x + w[5]*y + w[9]*z + w[13], w[2]*x + w[6]*y + w[10]*z + w[14]]; for (let k = 0; k < 3; k += 1) { pos[3*i+k] = q[k]; if (q[k] < box[k]) box[k] = q[k]; if (q[k] > box[k+3]) box[k+3] = q[k]; } }
    const uv = p.attributes.TEXCOORD_0 !== undefined ? accessor(g, p.attributes.TEXCOORD_0) : null; const idx = p.indices !== undefined ? accessor(g, p.indices) : null;
    prims.push({ mat: p.material ?? 0, pos, uv, idx }); }
  parts.push({ ni, box, prims }); });
const span = (b) => [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
const isPlate = (b) => { const [dx, dy, dz] = span(b); return dx > PLATE_SPAN || dz > PLATE_SPAN || (dy < PLATE_FLAT && dx * dz > PLATE_AREA); };
// union-find over the parts that glue, through a grid of GAP-expanded boxes
const parent = parts.map((_, i) => i); const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }; const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
const CELL = 8; const grid = new Map(); const glue = parts.map((p) => !isPlate(p.box));
const overlaps = (a, b) => a[0] - GAP <= b[3] && b[0] - GAP <= a[3] && a[1] - GAP <= b[4] && b[1] - GAP <= a[4] && a[2] - GAP <= b[5] && b[2] - GAP <= a[5];
parts.forEach((p, i) => { if (!glue[i]) return; const b = p.box; for (let cx = Math.floor((b[0] - GAP) / CELL); cx <= Math.floor((b[3] + GAP) / CELL); cx += 1) for (let cz = Math.floor((b[2] - GAP) / CELL); cz <= Math.floor((b[5] + GAP) / CELL); cz += 1) { const key = cx + ',' + cz; let list = grid.get(key); if (!list) { list = []; grid.set(key, list); } for (const k of list) if (overlaps(b, parts[k].box)) union(i, k); list.push(i); } });
const groups = new Map(); parts.forEach((p, i) => { const r = glue[i] ? find(i) : 'plate' + i; let l = groups.get(r); if (!l) { l = []; groups.set(r, l); } l.push(i); });
// a group wider than MAXD is cut at the median of its parts' centres along the wider axis, again and again
const things = []; const boxOf = (ids) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const i of ids) for (let k = 0; k < 3; k += 1) { if (parts[i].box[k] < b[k]) b[k] = parts[i].box[k]; if (parts[i].box[k+3] > b[k+3]) b[k+3] = parts[i].box[k+3]; } return b; };
const cut = (ids) => { const b = boxOf(ids); const [dx, , dz] = span(b); if ((dx <= MAXD && dz <= MAXD) || ids.length < 2) { things.push(ids); return; } const ax = dx >= dz ? 0 : 2;
  const c = (i) => (parts[i].box[ax] + parts[i].box[ax+3]) / 2; const sorted = [...ids].sort((p, q) => c(p) - c(q)); const h = sorted.length >> 1; cut(sorted.slice(0, h)); cut(sorted.slice(h)); };
for (const ids of groups.values()) cut(ids);
// one node per thing, one primitive per material; the BIN rebuilt
const chunks = []; let binLen = 0; const views = []; const accessors = []; const addView = (buf, target) => { const pad = (4 - (binLen % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); binLen += pad; } const v = { buffer: 0, byteOffset: binLen, byteLength: buf.byteLength }; if (target) v.target = target; chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)); binLen += buf.byteLength; views.push(v); return views.length - 1; };
const textured = new Set(); (J.materials ?? []).forEach((m, mi) => { if (m.pbrMetallicRoughness?.baseColorTexture || m.emissiveTexture) textured.add(mi); });
const meshes = []; const nodes = []; let outTris = 0, outVerts = 0;
things.forEach((ids, ti) => { const byMat = new Map(); for (const i of ids) for (const p of parts[i].prims) { let l = byMat.get(p.mat); if (!l) { l = []; byMat.set(p.mat, l); } l.push(p); }
  const prims = []; for (const [mat, list] of byMat) { const nv = list.reduce((s, p) => s + p.pos.length / 3, 0); const nt = list.reduce((s, p) => s + (p.idx ? p.idx.length : p.pos.length / 3), 0); const pos = new Float32Array(nv * 3); const uv = textured.has(mat) ? new Float32Array(nv * 2) : null; const idx = nv > 65535 ? new Uint32Array(nt) : new Uint16Array(nt); let v = 0, t = 0; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of list) { const pn = p.pos.length / 3; pos.set(p.pos, v * 3); if (uv) { if (p.uv) uv.set(p.uv.subarray(0, pn * 2), v * 2); } const n = p.idx ? p.idx.length : pn; for (let k = 0; k < n; k += 1) idx[t + k] = v + (p.idx ? p.idx[k] : k); t += n; v += pn; }
    for (let i = 0; i < nv; i += 1) for (let k = 0; k < 3; k += 1) { if (pos[3*i+k] < mn[k]) mn[k] = pos[3*i+k]; if (pos[3*i+k] > mx[k]) mx[k] = pos[3*i+k]; }
    const attributes = { POSITION: accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx }) - 1 };
    if (uv) attributes.TEXCOORD_0 = accessors.push({ bufferView: addView(uv, 34962), componentType: 5126, count: nv, type: 'VEC2' }) - 1;
    const indices = accessors.push({ bufferView: addView(idx, 34963), componentType: idx instanceof Uint32Array ? 5125 : 5123, count: nt, type: 'SCALAR' }) - 1;
    prims.push({ attributes, indices, material: mat, mode: 4 }); outTris += nt / 3; outVerts += nv; }
  meshes.push({ name: `Thing${ti}`, primitives: prims }); nodes.push({ name: `Thing${ti}`, mesh: meshes.length - 1 }); });
// the images, carried over
const images = (J.images ?? []).map((im) => { const bv = J.bufferViews[im.bufferView]; const data = g.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength); return { ...im, bufferView: addView(new Uint8Array(data)) }; });
const root = { name: 'Map', children: nodes.map((_, i) => i + 1) }; const out = { asset: { ...J.asset, generator: (J.asset?.generator ?? '') + ' + glb_merge_parts' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [root, ...nodes], meshes, materials: J.materials ?? [], textures: J.textures ?? [], images, samplers: J.samplers ?? [], accessors, bufferViews: views, buffers: [{ byteLength: binLen }] };
if (!out.textures.length) { delete out.textures; delete out.images; delete out.samplers; }
let js = Buffer.from(JSON.stringify(out)); const jp = (4 - (js.length % 4)) % 4; if (jp) js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]); const bin = Buffer.concat(chunks); const bp = (4 - (bin.length % 4)) % 4; const binOut = bp ? Buffer.concat([bin, Buffer.alloc(bp)]) : bin;
const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + js.length + binOut.length, 8); const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.write('JSON', 4); const c2 = Buffer.alloc(8); c2.writeUInt32LE(binOut.length, 0); c2.writeUInt32LE(0x004e4942, 4);
writeFileSync(outF, Buffer.concat([h, c1, js, c2, binOut]));
const plates = parts.filter((p) => isPlate(p.box)).length; const big = things.map((ids) => span(boxOf(ids))).filter(([dx, , dz]) => dx > MAXD || dz > MAXD).length;
console.log(`${outF}: ${parts.length} parts (${plates} plates) -> ${things.length} things, ${meshes.reduce((s, m) => s + m.primitives.length, 0)} primitives, ${outVerts} vertices, ${Math.round(outTris)} triangles, ${images.length} images; ${((28 + js.length + binOut.length) / 1048576).toFixed(2)} MiB; ${big} things wider than ${MAXD} m (plates)`);
