// A PIECE of a model's merged mesh copied to other places (user 2026-11-05: the little plaque on the pillar as a lintel over
// each hidden door, "so the player is hinted"): the triangles of the named node whose three corners lie in the window are
// baked — positions through the node's world matrix, then turned about y round the piece's centre and moved so the piece's
// bounds' min corner lands where asked — into a new mesh under a new root node per placement. Normals carried, texture
// coordinates and materials shared. usage:
//   node glb_piece_clone.mjs <in.glb> <out.glb> <nodeName> x0 x1 z0 z1 y0 y1 '<placements json>'
//   placements: [{ "name": "...", "deg": 0, "minX": .., "minY": .., "minZ": .. }, ...]  (the copy's bounds' min corner after the turn)
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, nodeName, ...rest] = process.argv.slice(2); const [x0, x1, z0, z1, y0, y1] = rest.slice(0, 6).map(Number); const placements = JSON.parse(rest[6]);
const buf = readFileSync(inF); const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const after = buf.slice(20 + jsonLen); const binLen = after.readUInt32LE(0); if (after.readUInt32LE(4) !== 0x004E4942) throw new Error('no BIN chunk');
let bin = Buffer.from(after.slice(8, 8 + binLen)); const tail = after.slice(8 + binLen);
const nodes = json.nodes;
const local = (n) => { if (n.matrix) return n.matrix.slice(); const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const c = new Array(16).fill(0); for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + row] * b[col * 4 + k]; c[col * 4 + row] = s; } return c; };
const parentOf = new Map(); nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const worldOf = (i) => { const chain = []; for (let k = i; k != null; k = parentOf.get(k)) chain.unshift(k); let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const k of chain) m = mul(m, local(nodes[k])); return m; };
// (several nodes, comma-separated: the plaque is a body and strips on one node and a backing plate on the pillar's)
const sources = nodeName.split(',').map((name) => { const ni = nodes.findIndex((n) => n.name === name); if (ni < 0) throw new Error(`no node ${name}`); return { W: worldOf(ni), mesh: json.meshes[nodes[ni].mesh] }; });
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }; const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const read = (ai) => { const a = json.accessors[ai]; const bv = json.bufferViews[a.bufferView]; const T = TYPES[a.componentType], n = COMPS[a.type]; const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = bv.byteStride ?? n * T.BYTES_PER_ELEMENT; const out = new T(a.count * n); const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType]; for (let k = 0; k < a.count; k += 1) for (let j = 0; j < n; j += 1) out[k * n + j] = dv[get](off + k * stride + j * T.BYTES_PER_ELEMENT, true); return out; };
const addAccessor = (typed, componentType, type, target, extra = {}) => { const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: typed.byteLength, target }); bin = Buffer.concat([bin, Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)]);
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / COMPS[type], type, ...extra }); return json.accessors.length - 1; };
const xf = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
// the piece: per primitive, the triangles inside the window, in world space
const piece = []; let tris = 0; const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
for (const { W, mesh } of sources) for (const p of mesh.primitives) {
  const pos = read(p.attributes.POSITION); const nrm = p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null; const uv = p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null;
  const idx = p.indices != null ? read(p.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, k) => k);
  const wp = []; for (let v = 0; v < pos.length / 3; v += 1) wp.push(xf(W, pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]));
  const keep = []; for (let t = 0; t + 2 < idx.length; t += 3) { const ok = [0, 1, 2].every((k) => { const q = wp[idx[t + k]]; return q[0] >= x0 && q[0] <= x1 && q[2] >= z0 && q[2] <= z1 && q[1] >= y0 && q[1] <= y1; }); if (ok) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  if (!keep.length) continue; tris += keep.length / 3;
  const map = new Map(), P = [], N = [], T = [], I = [];
  const Winv3 = null;
  for (const v of keep) { if (!map.has(v)) { map.set(v, P.length); P.push(wp[v]); if (nrm) { const q = xf(W, nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]); const o = xf(W, 0, 0, 0); const d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; const l = Math.hypot(...d) || 1; N.push(d.map((c) => c / l)); } if (uv) T.push([uv[2 * v], uv[2 * v + 1]]); } I.push(map.get(v)); }
  for (const q of P) { bb.x0 = Math.min(bb.x0, q[0]); bb.x1 = Math.max(bb.x1, q[0]); bb.y0 = Math.min(bb.y0, q[1]); bb.y1 = Math.max(bb.y1, q[1]); bb.z0 = Math.min(bb.z0, q[2]); bb.z1 = Math.max(bb.z1, q[2]); }
  piece.push({ p, P, N: nrm ? N : null, T: uv ? T : null, I });
}
if (!tris) throw new Error('no triangles of that node inside the window');
console.log(`piece: ${tris} triangles of ${nodeName}, bounds x ${bb.x0.toFixed(2)}..${bb.x1.toFixed(2)} y ${bb.y0.toFixed(2)}..${bb.y1.toFixed(2)} z ${bb.z0.toFixed(2)}..${bb.z1.toFixed(2)}`);
const scene = json.scenes[json.scene ?? 0];
for (const pl of placements) {
  const r = (pl.deg ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); const cxp = (bb.x0 + bb.x1) / 2, czp = (bb.z0 + bb.z1) / 2;
  const turn = (x, z) => [c * (x - cxp) + s * (z - czp) + cxp, -s * (x - cxp) + c * (z - czp) + czp];   // (about y through the piece's centre)
  // the turned piece's min corner, then the move that puts it at the asked place
  let tb = { x0: Infinity, y0: bb.y0, z0: Infinity }; for (const q of piece) for (const v of q.P) { const [x, z] = turn(v[0], v[2]); tb.x0 = Math.min(tb.x0, x); tb.z0 = Math.min(tb.z0, z); }
  const dx = pl.minX - tb.x0, dy = pl.minY - tb.y0, dz = pl.minZ - tb.z0;
  const prims = piece.map((q) => { const P = new Float32Array(q.P.length * 3); const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    q.P.forEach((v, k) => { const [x, z] = turn(v[0], v[2]); const o = [x + dx, v[1] + dy, z + dz]; for (let j = 0; j < 3; j += 1) { P[3 * k + j] = o[j]; mn[j] = Math.min(mn[j], Math.fround(o[j])); mx[j] = Math.max(mx[j], Math.fround(o[j])); } });
    const attributes = { POSITION: addAccessor(P, 5126, 'VEC3', 34962, { min: mn, max: mx }) };
    if (q.N) { const Nn = new Float32Array(q.N.length * 3); q.N.forEach((v, k) => { const nx = c * v[0] + s * v[2], nz = -s * v[0] + c * v[2]; Nn[3 * k] = nx; Nn[3 * k + 1] = v[1]; Nn[3 * k + 2] = nz; }); attributes.NORMAL = addAccessor(Nn, 5126, 'VEC3', 34962); }
    if (q.T) { const Tt = new Float32Array(q.T.length * 2); q.T.forEach((v, k) => { Tt[2 * k] = v[0]; Tt[2 * k + 1] = v[1]; }); attributes.TEXCOORD_0 = addAccessor(Tt, 5126, 'VEC2', 34962); }
    const I = new Uint32Array(q.I); return { attributes, indices: addAccessor(I, 5125, 'SCALAR', 34963), mode: 4, ...(q.p.material != null ? { material: q.p.material } : {}) }; });
  json.meshes.push({ name: pl.name, primitives: prims }); nodes.push({ name: pl.name, mesh: json.meshes.length - 1 }); scene.nodes.push(nodes.length - 1);
  console.log(`placed ${pl.name}: turned ${pl.deg ?? 0}°, min corner (${pl.minX}, ${pl.minY}, ${pl.minZ}); size x ${(tb.x0 === Infinity ? 0 : 0).toFixed(0)}`);
}
{ const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]); json.buffers[0].byteLength = bin.length; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
const chunks = Buffer.concat([binHead, bin, tail]);
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + chunks.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, chunks]));
console.log(`${outF}: ${((20 + jb.length + chunks.length) / 1048576).toFixed(2)} MB, nodes ${nodes.length}, meshes ${json.meshes.length}`);
