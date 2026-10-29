// A door swung open in a merged model: the triangles wholly inside a leaf's boxes are turned about a vertical hinge axis so
// the leaf's span (hinge -> latch, u) comes to lie along the open direction v; positions edited in place (world space, through
// the node's matrix and back), uvs untouched. usage: node glb_swing.mjs <in> <out> "name:x0,x1,z0,z1,y0,y1|x0,...:hx,hz:ux,uz:vx,vz;..."
// An empty box list ("name::hx,hz:...") turns every triangle of the nodes whose name starts with name instead — a door that is
// its own node already, turned back shut (the Hospital's D8, 2026-10-29).
import { writeFileSync } from 'node:fs';
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [inF, outF, spec] = process.argv.slice(2);
const doors = spec.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [name, boxes, h, u, v] = s.split(':'); const byName = !boxes; const [hx, hz] = h.split(',').map(Number); const [ux, uz] = u.split(',').map(Number); const [vx, vz] = v.split(',').map(Number);
  const th = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz); return { name, byName, boxes: boxes.split('|').map((b) => b.split(',').map(Number)), hx, hz, cos: Math.cos(th), sin: Math.sin(th), deg: th * 180 / Math.PI, n: 0, moved: new Set(), b: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] }; });
const g = readGlb(inF); const json = g.json; const W = worlds(json);
const inv = (m) => { // 4x4 column-major inverse (gl-matrix style)
  const a = m, o = new Array(16); const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) throw new Error('singular'); det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det; o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det; o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det; return o; };
// sanity: apply(W, p) must be the world point; check the matrix layout with apply itself on a basis
let shared = 0;
for (let ni = 0; ni < json.nodes.length; ni += 1) { const n = json.nodes[ni]; if (n.mesh == null) continue; const Wi = W[ni]; const Winv = inv(Wi);
  for (const pr of json.meshes[n.mesh].primitives) { const P = accessor(g, pr.attributes.POSITION); const arr = P.array ?? P; const acc = json.accessors[pr.attributes.POSITION], bvw = json.bufferViews[acc.bufferView]; const base = g.bin.byteOffset + (bvw.byteOffset || 0) + (acc.byteOffset || 0), stride = bvw.byteStride || 12; const writeBack = (id) => { const v = new Float32Array(g.bin.buffer, base + id * stride, 3); v[0] = arr[id * 3]; v[1] = arr[id * 3 + 1]; v[2] = arr[id * 3 + 2]; };   /* (the reader hands back a copy: the edit is written into the BIN itself) */ const I = pr.indices != null ? accessor(g, pr.indices) : null; const ia = I ? (I.array ?? I) : null; const nt = ia ? ia.length / 3 : arr.length / 9;
    const world = (k) => apply(Wi, arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]);
    const owner = new Map();   // vertex -> door that moves it
    for (let t = 0; t < nt; t += 1) { const ids = [0, 1, 2].map((k) => (ia ? ia[t * 3 + k] : t * 3 + k)); const T = ids.map(world);
      let hit = null; for (const d of doors) { if (d.byName ? (n.name ?? '').startsWith(d.name) : d.boxes.some((B) => T.every((v) => v[0] >= B[0] && v[0] <= B[1] && v[2] >= B[2] && v[2] <= B[3] && v[1] >= B[4] && v[1] <= B[5]))) { hit = d; break; } }
      for (const id of ids) { const o = owner.get(id); if (o === undefined) owner.set(id, hit); else if (o !== hit) { shared += 1; if (o === null) owner.set(id, hit); } }
      if (hit) hit.n += 1; }
    for (const [id, d] of owner) { if (!d || d.moved.has(ni + ':' + id)) continue; d.moved.add(ni + ':' + id); const p = world(id); const dx = p[0] - d.hx, dz = p[2] - d.hz; const nx = d.hx + dx * d.cos - dz * d.sin, nz = d.hz + dx * d.sin + dz * d.cos;
      const l = apply(Winv, nx, p[1], nz); arr[id * 3] = l[0]; arr[id * 3 + 1] = l[1]; arr[id * 3 + 2] = l[2]; writeBack(id); for (let k = 0; k < 3; k += 1) { const v = [nx, p[1], nz][k]; if (v < d.b[k]) d.b[k] = v; if (v > d.b[k + 3]) d.b[k + 3] = v; } } } }
for (const d of doors) console.log(`${d.name}: ${d.n} triangles, ${d.moved.size} vertices turned ${d.deg.toFixed(0)} deg about (${d.hx}, ${d.hz}) -> now x ${d.b[0].toFixed(2)}..${d.b[3].toFixed(2)} z ${d.b[2].toFixed(2)}..${d.b[5].toFixed(2)} y ${d.b[1].toFixed(2)}..${d.b[4].toFixed(2)}`);
console.log(`vertices shared between a turned and an untouched triangle: ${shared}`);
// write (positions edited in place inside g.bin)
const binAll = g.bin; json.buffers[0].byteLength = binAll.length; let jsonBytes = Buffer.from(JSON.stringify(json)); const jp = (4 - (jsonBytes.length % 4)) % 4; if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + binAll.length, 8); const ch1 = Buffer.alloc(8); ch1.writeUInt32LE(jsonBytes.length, 0); ch1.write('JSON', 4); const ch2 = Buffer.alloc(8); ch2.writeUInt32LE(binAll.length, 0); ch2.write('BIN\0', 4);
writeFileSync(outF, Buffer.concat([header, ch1, jsonBytes, ch2, binAll])); console.log(`-> ${outF}`);
