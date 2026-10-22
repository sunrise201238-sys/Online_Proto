// A model's objects cloned in place, turned about the world's y axis and moved: every child of the named parent node but the
// skipped ones is copied (its node subtree copied, meshes and materials shared — the file grows by the nodes alone) as a new
// child of the same parent, so the fade by node (`fadeNodes`: an object is a child of the first node that branches) sees
// the copies as objects of their own; the copy's own matrix carries the turn, in the parent's space (L' = W⁻¹ R W L, W the
// parent's world matrix, R the turn: x' = tx − x, z' = tz − z for 180°). Yard = Warehouse and its copy turned 180° (2026-10-22).
// usage: node glb_clone.mjs <in.glb> <out.glb> <parentNodeName> <degreesAboutY> <tx> <tz> [--skip name,name] [--suffix _copy]
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, parentName, degS, txS, tzS, ...rest] = process.argv.slice(2); const deg = Number(degS), TX = Number(txS), TZ = Number(tzS);
const skip = new Set((rest[rest.indexOf('--skip') + 1] ?? '').split(',').filter(Boolean)); const suffix = rest.includes('--suffix') ? rest[rest.indexOf('--suffix') + 1] : '_copy';
const buf = readFileSync(inF); const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8')); const binChunk = buf.slice(20 + jsonLen);
const nodes = json.nodes;
const local = (n) => { if (n.matrix) return n.matrix.slice(); const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const c = new Array(16).fill(0); for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + row] * b[col * 4 + k]; c[col * 4 + row] = s; } return c; };
const inv = (m) => { // (a general 4x4 inverse, column-major)
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (Math.abs(det) < 1e-12) throw new Error('singular'); const d = 1 / det;
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d, (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d, (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d, (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d]; };
const parentOf = new Map(); nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const pi = nodes.findIndex((n) => n.name === parentName); if (pi < 0) throw new Error(`no node ${parentName}`);
let W = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const chain = []; for (let k = pi; k != null; k = parentOf.get(k)) chain.unshift(k); for (const k of chain) W = mul(W, local(nodes[k]));
const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, TX, 0, TZ, 1];   // (a turn about y, then the move: for 180° x' = TX − x, z' = TZ − z)
const Winv = inv(W); const M = mul(Winv, mul(R, W));
const copyTree = (i) => { const n = nodes[i]; const m = { ...n }; if (n.name) m.name = n.name + suffix; if (n.children) m.children = n.children.map(copyTree); nodes.push(m); return nodes.length - 1; };
const kids = nodes[pi].children.slice(); let made = 0, skipped = 0;
for (const ci of kids) { const n = nodes[ci]; if (skip.has(n.name)) { skipped += 1; continue; } const ni = copyTree(ci); const m = nodes[ni]; delete m.translation; delete m.rotation; delete m.scale; m.matrix = mul(M, local(n)); nodes[pi].children.push(ni); made += 1; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + binChunk.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, binChunk]));
console.log(`${made} objects copied under ${parentName} (${skipped} skipped), turned ${deg}° and moved to x' = ${TX} − x, z' = ${TZ} − z; nodes ${nodes.length}; ${outF} ${(20 + jb.length + binChunk.length) / 1048576 | 0} MB`);
