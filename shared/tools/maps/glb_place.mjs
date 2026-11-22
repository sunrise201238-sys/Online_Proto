// A model's objects copied to new places, each copy with a size, a turn and a move of its own: a kit's pieces — a ramp, a
// platform, a walkway — put down again elsewhere to build on with what the model already has (Neon's scaffold carried up to
// the skybridge, user 2026-11-22: "Use existing objects as materials to extend the current scaffolding structure").
// glb_clone.mjs copies a set of objects by one turn and one move in the plan; here every copy has its own, and may be taller,
// shorter or longer than its original and stand at another height.
// usage: node glb_place.mjs <in.glb> <out.glb> <parentNodeName> <spec.json>
//   spec.json: a list of copies, each
//     { "from": ["Node_222_222", "Node_223_223"],   the parent's children to copy (their subtrees with them)
//       "suffix": "_way3a",                          added to every copied node's name
//       "pivot": [x, y, z], "scale": [sx, sy, sz],   the size, kept about the pivot, along the world's axes
//       "turn": degrees,                             then the turn about the pivot's upright (x' = cx + sz, z' = -sx + cz: 90
//                                                    carries -x to +z)
//       "move": [dx, dy, dz] }                       then the move — all in the world's metres, y the model's own height
// A copy is a new child of the same parent with the original's meshes and materials (the file grows by the nodes alone), so
// the client's fade by node sees it as an object of its own. Its matrix is A·L in the parent's space, A the copy's size, turn
// and move, L the original's own. glTF wants a node's matrix to be a move, a turn and a size and nothing else, and a size
// taken across a turned object would be a shear, so the tool refuses a copy whose axes do not come out square: turns of a
// quarter and sizes along the world's axes on objects that stand square to it always do.
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, parentName, specF] = process.argv.slice(2); if (!inF || !outF || !parentName || !specF) throw new Error('usage: glb_place.mjs <in.glb> <out.glb> <parentNodeName> <spec.json>');
const buf = readFileSync(inF); if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB');
const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8')); const after = buf.slice(20 + jsonLen);   // (the chunks after the JSON, written back as they were)
const spec = JSON.parse(readFileSync(specF, 'utf8')); const nodes = json.nodes;
const local = (n) => { if (n.matrix) return n.matrix.slice(); const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const c = new Array(16).fill(0); for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + row] * b[col * 4 + k]; c[col * 4 + row] = s; } return c; };
const inv = (m) => { const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (Math.abs(det) < 1e-12) throw new Error('a parent with no inverse'); const d = 1 / det;
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d, (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d, (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d]; };
const parentOf = new Map(); nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const worldOf = (i) => { const chain = []; for (let k = i; k != null; k = parentOf.get(k)) chain.unshift(k); let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const k of chain) m = mul(m, local(nodes[k])); return m; };
const pi = nodes.findIndex((n) => n.name === parentName); if (pi < 0) throw new Error(`no node ${parentName}`);
const W = worldOf(pi), Winv = inv(W); const kids = nodes[pi].children.slice(); const names = new Set(nodes.map((n) => n.name));
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
let made = 0; const lines = [];
for (const p of spec) { const [px, py, pz] = p.pivot ?? [0, 0, 0], [sx, sy, sz] = p.scale ?? [1, 1, 1], [dx, dy, dz] = p.move ?? [0, 0, 0]; const r = (p.turn ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  if (!(sx > 0 && sy > 0 && sz > 0)) throw new Error(`${p.suffix}: a size must be over zero (a mirror is glb_clone.mjs --mirror's)`);
  const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1], S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const A = mul(T(dx + px, dy + py, dz + pz), mul(R, mul(S, T(-px, -py, -pz)))); const M = mul(Winv, mul(A, W));
  const copyTree = (i) => { const n = nodes[i]; const m = { ...n }; if (n.name) { m.name = n.name + p.suffix; if (names.has(m.name)) throw new Error(`a node named ${m.name} is there already`); names.add(m.name); } if (n.children) m.children = n.children.map(copyTree); nodes.push(m); return nodes.length - 1; };
  for (const name of p.from) { const ci = kids.find((k) => nodes[k].name === name); if (ci == null) throw new Error(`${p.suffix}: no child ${name} under ${parentName}`);
    const L = local(nodes[ci]); const m = mul(M, L).map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
    // the copy's axes square to one another, or its matrix is no move, turn and size
    const col = (k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]; const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const len = (a) => Math.hypot(a[0], a[1], a[2]);
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(dot(col(a), col(b))) > 1e-6 * len(col(a)) * len(col(b))) throw new Error(`${name}${p.suffix}: its size is taken across its turn — the matrix would shear`);
    const ni = copyTree(ci); const n = nodes[ni]; delete n.translation; delete n.rotation; delete n.scale; n.matrix = m; nodes[pi].children.push(ni); made += 1; }
  lines.push(`  ${p.from.join(' + ')} as ${p.suffix}: size ${[sx, sy, sz].join(' x ')} about (${[px, py, pz].map((v) => +v.toFixed(3)).join(', ')}), turned ${p.turn ?? 0}, moved (${[dx, dy, dz].map((v) => +v.toFixed(3)).join(', ')})`); }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + after.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, after]));
console.log(`${made} objects copied under ${parentName} in ${spec.length} places; nodes ${nodes.length}; ${outF} ${((20 + jb.length + after.length) / 1048576).toFixed(2)} MB`); for (const l of lines) console.log(l);
