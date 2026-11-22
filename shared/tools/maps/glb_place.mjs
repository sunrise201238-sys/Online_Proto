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
//       "rise": [gx, gz],                            then, if given, the heights raised by gx a metre along x and gz a metre
//                                                    along z from the pivot: a rail leant along a ramp, its posts still upright
//       "move": [dx, dy, dz],                        then the move — all in the world's metres, y the model's own height
//       "clip": { "axis": "z", "from": a, "to": b } } if given, only the part of the original between two of the world's planes
//                                                    (where it stands, before the copy's size, turn and move), its triangles cut
// A copy is a new child of the same parent, so the client's fade by node sees it as an object of its own.
// A PLAIN copy has the original's meshes and materials (the file grows by the nodes alone). Its matrix is A·L in the parent's
// space, A the copy's size, turn and move, L the original's own. glTF wants a node's matrix to be a move, a turn and a size and
// nothing else, and a size taken across a turned object would be a shear, so the tool refuses a copy whose axes do not come out
// square: turns of a quarter and sizes along the world's axes on objects that stand square to it always do.
// A copy with a `rise` or a `clip` is BAKED (b1105kh, Neon's rails; user 2026-11-22, of the bots that came off the north way's
// upper ramp: "加欄杆可以解決 Implement in PT and 9.9"): a rise is a shear, which no node matrix carries, and a clip cuts
// triangles. Its meshes are new ones with vertices of their own — the positions and the normals carried through the original's
// place in the world, the copy's size, turn, rise and move and the parent's inverse; the texture coordinates carried with them,
// at a cut read off the triangle's edge; the materials shared — written as plain triangle lists, and every copied node's matrix
// is the identity. The file grows by those vertices.
// A copy whose nodes are all under the parent already is left as it is, so a spec that has grown is run on the model that has
// the earlier copies, and a second run changes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, parentName, specF] = process.argv.slice(2); if (!inF || !outF || !parentName || !specF) throw new Error('usage: glb_place.mjs <in.glb> <out.glb> <parentNodeName> <spec.json>');
const buf = readFileSync(inF); if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB');
const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8')); const after = buf.slice(20 + jsonLen);   // (the chunks after the JSON, written back as they were unless a bake grows the binary one)
const hasBin = after.length >= 8 && after.readUInt32LE(4) === 0x004E4942; const binLen = hasBin ? after.readUInt32LE(0) : 0; let bin = Buffer.from(after.slice(8, 8 + binLen)); const tail = hasBin ? after.slice(8 + binLen) : after;
const spec = JSON.parse(readFileSync(specF, 'utf8')); const nodes = json.nodes;
const local = (n) => { if (n.matrix) return n.matrix.slice(); const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const c = new Array(16).fill(0); for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + row] * b[col * 4 + k]; c[col * 4 + row] = s; } return c; };
const inv = (m) => { const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (Math.abs(det) < 1e-12) throw new Error('a matrix with no inverse'); const d = 1 / det;
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d, (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d, (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d]; };
const parentOf = new Map(); nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const worldOf = (i) => { const chain = []; for (let k = i; k != null; k = parentOf.get(k)) chain.unshift(k); let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const k of chain) m = mul(m, local(nodes[k])); return m; };
const pi = nodes.findIndex((n) => n.name === parentName); if (pi < 0) throw new Error(`no node ${parentName}`);
const W = worldOf(pi), Winv = inv(W); const kids = nodes[pi].children.slice(); const names = new Set(nodes.map((n) => n.name));
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const at = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
// ---- the bake: accessors read from the binary chunk and new ones appended to it
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const read = (ai) => { const a = json.accessors[ai]; if (a.sparse || a.normalized) throw new Error('sparse or normalized accessors: not handled'); const bv = json.bufferViews[a.bufferView]; const Ty = TYPES[a.componentType], n = COMPS[a.type];
  if (!hasBin || bv.buffer !== 0 || json.buffers[0].uri != null) throw new Error('the bake reads the GLB\'s own BIN chunk only');
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = bv.byteStride ?? n * Ty.BYTES_PER_ELEMENT; const out = new Ty(a.count * n); const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k += 1) for (let j = 0; j < n; j += 1) out[k * n + j] = dv[get](off + k * stride + j * Ty.BYTES_PER_ELEMENT, true);
  return out; };
let grew = false, bakedTris = 0;
const addAccessor = (typed, type, extra = {}) => { grew = true; const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: typed.byteLength, target: 34962 }); bin = Buffer.concat([bin, Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)]);
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, count: typed.length / COMPS[type], type, ...extra }); return json.accessors.length - 1; };
// a mesh baked: `Wn` the original node's place in the world, `A` the copy's size, turn, rise and move there, `clip` the slab kept
const bakeMesh = (mi, Wn, A, clip, suffix) => { const mesh = json.meshes[mi]; const N = mul(Winv, mul(A, Wn)), toParent = mul(Winv, A);
  const Ni = inv(N); const nm = [Ni[0], Ni[4], Ni[8], Ni[1], Ni[5], Ni[9], Ni[2], Ni[6], Ni[10]];   // (the normals' matrix: the inverse's transpose)
  if (N[0] * (N[5] * N[10] - N[6] * N[9]) - N[4] * (N[1] * N[10] - N[2] * N[9]) + N[8] * (N[1] * N[6] - N[2] * N[5]) < 0) throw new Error('a copy turned inside out (a mirror is glb_clone.mjs --mirror\'s)');
  const ax = clip ? { x: 0, y: 1, z: 2 }[clip.axis] : -1; if (clip && ax == null) throw new Error('clip.axis: x, y or z');
  const prims = []; for (const p of mesh.primitives) { if ((p.mode ?? 4) !== 4) throw new Error('triangles only'); if (p.targets) throw new Error('morph targets: not handled');
    for (const k of Object.keys(p.attributes)) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(k)) throw new Error(`a baked copy carries positions, normals and one set of texture coordinates; this mesh has ${k}`);
    const pos = read(p.attributes.POSITION), nr = p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null, uv = p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null;
    const idx = p.indices != null ? read(p.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, k) => k);
    const corner = (k) => ({ p: at(Wn, pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]), n: nr ? [nr[3 * k], nr[3 * k + 1], nr[3 * k + 2]] : null, t: uv ? [uv[2 * k], uv[2 * k + 1]] : null });
    const mix = (a, b, f) => ({ p: a.p.map((v, j) => v + (b.p[j] - v) * f), n: a.n ? a.n.map((v, j) => v + (b.n[j] - v) * f) : null, t: a.t ? a.t.map((v, j) => v + (b.t[j] - v) * f) : null });
    const cut = (poly, sign, lim) => { const out = []; for (let k = 0; k < poly.length; k += 1) { const a = poly[k], b = poly[(k + 1) % poly.length]; const da = sign * (a.p[ax] - lim), db = sign * (b.p[ax] - lim);   // (kept: sign * (v - lim) >= 0)
        if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) out.push(mix(a, b, da / (da - db))); } return out; };
    const P = [], Q = [], U = [];
    for (let t = 0; t + 2 < idx.length; t += 3) { let poly = [corner(idx[t]), corner(idx[t + 1]), corner(idx[t + 2])];
      if (clip) { poly = cut(poly, 1, clip.from); if (poly.length >= 3) poly = cut(poly, -1, clip.to); if (poly.length < 3) continue; }
      for (let k = 1; k + 1 < poly.length; k += 1) for (const c of [poly[0], poly[k], poly[k + 1]]) { P.push(...at(toParent, c.p[0], c.p[1], c.p[2]));
        if (c.n) { const [x, y, z] = c.n; const u = nm[0] * x + nm[3] * y + nm[6] * z, v = nm[1] * x + nm[4] * y + nm[7] * z, w = nm[2] * x + nm[5] * y + nm[8] * z; const l = Math.hypot(u, v, w) || 1; Q.push(u / l, v / l, w / l); }
        if (c.t) U.push(c.t[0], c.t[1]); } }
    if (!P.length) continue; bakedTris += P.length / 9;
    const Pf = new Float32Array(P); const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < Pf.length; k += 1) { mn[k % 3] = Math.min(mn[k % 3], Pf[k]); mx[k % 3] = Math.max(mx[k % 3], Pf[k]); }
    const attributes = { POSITION: addAccessor(Pf, 'VEC3', { min: mn, max: mx }) }; if (nr) attributes.NORMAL = addAccessor(new Float32Array(Q), 'VEC3'); if (uv) attributes.TEXCOORD_0 = addAccessor(new Float32Array(U), 'VEC2');
    const q = { attributes, mode: 4 }; if (p.material != null) q.material = p.material; prims.push(q); }
  if (!prims.length) return null; json.meshes.push({ name: (mesh.name ?? `mesh_${mi}`) + suffix, primitives: prims }); return json.meshes.length - 1; };
let made = 0, left = 0; const lines = [];
for (const p of spec) { const [px, py, pz] = p.pivot ?? [0, 0, 0], [sx, sy, sz] = p.scale ?? [1, 1, 1], [dx, dy, dz] = p.move ?? [0, 0, 0], [gx, gz] = p.rise ?? [0, 0]; const r = (p.turn ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  if (!(sx > 0 && sy > 0 && sz > 0)) throw new Error(`${p.suffix}: a size must be over zero (a mirror is glb_clone.mjs --mirror's)`);
  const there = p.from.filter((name) => kids.some((k) => nodes[k].name === name + p.suffix)).length;
  if (there === p.from.length) { left += p.from.length; continue; } if (there) throw new Error(`${p.suffix}: ${there} of its ${p.from.length} objects are there already`);
  const baked = !!(p.rise || p.clip);
  const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1], S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1], H = [1, gx, 0, 0, 0, 1, 0, 0, 0, gz, 1, 0, 0, 0, 0, 1];
  const A = mul(T(dx + px, dy + py, dz + pz), mul(H, mul(R, mul(S, T(-px, -py, -pz))))); const M = mul(Winv, mul(A, W));
  const name = (n) => { const q = n.name + p.suffix; if (names.has(q)) throw new Error(`a node named ${q} is there already`); names.add(q); return q; };
  const copyTree = (i) => { const n = nodes[i]; const m = { ...n }; if (n.name) m.name = name(n); if (n.children) m.children = n.children.map(copyTree); nodes.push(m); return nodes.length - 1; };
  const copyBaked = (i) => { const n = nodes[i]; const m = { ...n }; delete m.matrix; delete m.translation; delete m.rotation; delete m.scale; delete m.mesh; if (n.name) m.name = name(n);
    if (n.mesh != null) { const mi = bakeMesh(n.mesh, worldOf(i), A, p.clip, p.suffix); if (mi != null) m.mesh = mi; }
    if (n.children) m.children = n.children.map(copyBaked); nodes.push(m); return nodes.length - 1; };
  for (const fromName of p.from) { const ci = kids.find((k) => nodes[k].name === fromName); if (ci == null) throw new Error(`${p.suffix}: no child ${fromName} under ${parentName}`);
    if (baked) { nodes[pi].children.push(copyBaked(ci)); made += 1; continue; }
    const L = local(nodes[ci]); const m = mul(M, L).map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
    // the copy's axes square to one another, or its matrix is no move, turn and size
    const col = (k) => [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]]; const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const len = (a) => Math.hypot(a[0], a[1], a[2]);
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(dot(col(a), col(b))) > 1e-6 * len(col(a)) * len(col(b))) throw new Error(`${fromName}${p.suffix}: its size is taken across its turn — the matrix would shear`);
    const ni = copyTree(ci); const n = nodes[ni]; delete n.translation; delete n.rotation; delete n.scale; n.matrix = m; nodes[pi].children.push(ni); made += 1; }
  lines.push(`  ${p.from.join(' + ')} as ${p.suffix}: size ${[sx, sy, sz].join(' x ')} about (${[px, py, pz].map((v) => +v.toFixed(3)).join(', ')}), turned ${p.turn ?? 0}${p.rise ? `, raised ${gx} and ${gz} a metre along x and z` : ''}, moved (${[dx, dy, dz].map((v) => +v.toFixed(3)).join(', ')})${p.clip ? `, the part at ${p.clip.axis} ${p.clip.from}..${p.clip.to}` : ''}${baked ? ' — baked' : ''}`); }
if (grew) { const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]); json.buffers[0].byteLength = bin.length; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
const chunks = grew ? Buffer.concat([binHead, bin, tail]) : after;   // (no bake: what followed the JSON as it was)
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + chunks.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, chunks]));
console.log(`${made} objects copied under ${parentName} in ${lines.length} places${left ? `, ${left} there already and left` : ''}${bakedTris ? `, ${bakedTris} triangles baked` : ''}; nodes ${nodes.length}; ${outF} ${((20 + jb.length + chunks.length) / 1048576).toFixed(2)} MB`); for (const l of lines) console.log(l);
