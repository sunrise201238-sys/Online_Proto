// A model's objects cloned in place, turned about the world's y axis and moved: every child of the named parent node but the
// skipped ones is copied (its node subtree copied, meshes and materials shared — the file grows by the nodes alone) as a new
// child of the same parent, so the fade by node (`fadeNodes`: an object is a child of the first node that branches) sees
// the copies as objects of their own; the copy's own matrix carries the turn, in the parent's space (L' = W⁻¹ R W L, W the
// parent's world matrix, R the turn: x' = tx − x, z' = tz − z for 180°). Yard = Warehouse and its copy turned 180° (2026-10-22).
// --only: those children alone, the rest left (Neon's scaffold: 44 of the 242 objects under echo_01_242, 2026-11-02).
// --mirror: x' = −x first, then the turn and the move (at 0°: x' = tx − x, z' = z + tz). A mirror is no node matrix the client
// or the collision tools read right — the determinant goes negative and the triangles' winding with it, faces inside out — so
// each copied mesh is BAKED instead: new vertices of its own (the positions and the normals carried through the original's
// world matrix, the mirror and the parent's inverse), each triangle's winding reversed, every copied node's matrix the
// identity; the texture coordinates and the materials shared. The file grows by the copies' vertices (Neon's scaffold, 5,980
// triangles: some 300 KB). Neon's scaffold copied mirrored onto the main road's south half, 2026-11-02.
// usage: node glb_clone.mjs <in.glb> <out.glb> <parentNodeName> <degreesAboutY> <tx> <tz> [--skip name,name] [--only name,name] [--mirror] [--suffix _copy]
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, parentName, degS, txS, tzS, ...rest] = process.argv.slice(2); const deg = Number(degS), TX = Number(txS), TZ = Number(tzS);
const arg = (k) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : null);
const skip = new Set((arg('--skip') ?? '').split(',').filter(Boolean)); const only = arg('--only') ? new Set(arg('--only').split(',').filter(Boolean)) : null;
const mirror = rest.includes('--mirror'); const suffix = arg('--suffix') ?? '_copy';
const buf = readFileSync(inF); const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const after = buf.slice(20 + jsonLen); const hasBin = after.length >= 8 && after.readUInt32LE(4) === 0x004E4942;   // (the chunks after the JSON: a GLB may have no BIN chunk, or others after it — written back as they were)
const binLen = hasBin ? after.readUInt32LE(0) : 0; let bin = Buffer.from(after.slice(8, 8 + binLen)); const tail = hasBin ? after.slice(8 + binLen) : after;
const nodes = json.nodes;
const local = (n) => { if (n.matrix) return n.matrix.slice(); const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const c = new Array(16).fill(0); for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + row] * b[col * 4 + k]; c[col * 4 + row] = s; } return c; };
const inv = (m, tiny = 1e-12) => { // (a general 4x4 inverse, column-major; refused under tiny, which the bake's normals set to 0 — an object's own scale may be a quantized mesh's 1e-5)
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (Math.abs(det) < tiny || det === 0) throw new Error('singular'); const d = 1 / det;
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d, (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d, (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d, (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d]; };
const parentOf = new Map(); nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const worldOf = (i) => { const chain = []; for (let k = i; k != null; k = parentOf.get(k)) chain.unshift(k); let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const k of chain) m = mul(m, local(nodes[k])); return m; };
const pi = nodes.findIndex((n) => n.name === parentName); if (pi < 0) throw new Error(`no node ${parentName}`);
const W = worldOf(pi);
const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
const R = mirror ? [-c, 0, s, 0, 0, 1, 0, 0, s, 0, c, 0, TX, 0, TZ, 1] : [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, TX, 0, TZ, 1];   // (a turn about y, then the move: for 180° x' = TX − x, z' = TZ − z; the mirror x' = −x before the turn)
const Winv = inv(W); const M = mul(Winv, mul(R, W));
// ---- the bake (--mirror): accessors read and new ones appended to the binary chunk
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }; const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const read = (ai) => { const a = json.accessors[ai]; if (a.sparse) throw new Error('sparse accessors: not handled'); const bv = json.bufferViews[a.bufferView]; const T = TYPES[a.componentType], n = COMPS[a.type];
  if (!hasBin || bv.buffer !== 0 || json.buffers[0].uri != null) throw new Error('the bake reads the GLB\'s own BIN chunk only');
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = bv.byteStride ?? n * T.BYTES_PER_ELEMENT; const out = new T(a.count * n); const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k += 1) for (let j = 0; j < n; j += 1) out[k * n + j] = dv[get](off + k * stride + j * T.BYTES_PER_ELEMENT, true);
  if (a.normalized) throw new Error('normalized accessors: not handled'); return out; };
let grew = false;   // (the binary chunk grown: written anew; else what followed the JSON as it was)
const addAccessor = (typed, componentType, type, target, extra = {}) => { grew = true;
  const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: typed.byteLength, target }); bin = Buffer.concat([bin, Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)]);
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / COMPS[type], type, ...extra }); return json.accessors.length - 1; };
let bakedTris = 0;
const bakeMesh = (mi, N) => {   // N: from the mesh's own space to the parent's; a negative determinant (the mirror) reverses each triangle
  const det = N[0] * (N[5] * N[10] - N[6] * N[9]) - N[4] * (N[1] * N[10] - N[2] * N[9]) + N[8] * (N[1] * N[6] - N[2] * N[5]);
  let nm = null;   // (the normals' matrix: the inverse's transpose, 3x3, column-major — made for a mesh with normals alone)
  const mesh = json.meshes[mi];
  const prims = mesh.primitives.map((p) => {
    if ((p.mode ?? 4) !== 4) throw new Error('triangles only'); if (p.targets) throw new Error('morph targets: not handled'); if (p.attributes.TANGENT != null) throw new Error('tangents: not handled (a mirror flips their handedness)');
    const pos = read(p.attributes.POSITION); const n = pos.length / 3; const P = new Float32Array(pos.length); const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < n; k += 1) { const x = pos[3 * k], y = pos[3 * k + 1], z = pos[3 * k + 2]; const v = [N[0] * x + N[4] * y + N[8] * z + N[12], N[1] * x + N[5] * y + N[9] * z + N[13], N[2] * x + N[6] * y + N[10] * z + N[14]];
      for (let j = 0; j < 3; j += 1) { P[3 * k + j] = v[j]; mn[j] = Math.min(mn[j], Math.fround(v[j])); mx[j] = Math.max(mx[j], Math.fround(v[j])); } }
    const attributes = { ...p.attributes, POSITION: addAccessor(P, 5126, 'VEC3', 34962, { min: mn, max: mx }) };
    if (p.attributes.NORMAL != null) { const nr = read(p.attributes.NORMAL); const Q = new Float32Array(nr.length);
      if (!nm) { const Ni = inv(N, 0); nm = [Ni[0], Ni[4], Ni[8], Ni[1], Ni[5], Ni[9], Ni[2], Ni[6], Ni[10]]; }
      for (let k = 0; k < n; k += 1) { const x = nr[3 * k], y = nr[3 * k + 1], z = nr[3 * k + 2]; let u = nm[0] * x + nm[3] * y + nm[6] * z, v = nm[1] * x + nm[4] * y + nm[7] * z, w = nm[2] * x + nm[5] * y + nm[8] * z; const l = Math.hypot(u, v, w) || 1; Q[3 * k] = u / l; Q[3 * k + 1] = v / l; Q[3 * k + 2] = w / l; }
      attributes.NORMAL = addAccessor(Q, 5126, 'VEC3', 34962); }
    const src = p.indices != null ? read(p.indices) : Uint32Array.from({ length: n }, (_, k) => k); const I = new Uint32Array(src.length);
    for (let t = 0; t + 2 < src.length; t += 3) { I[t] = src[t]; I[t + 1] = det < 0 ? src[t + 2] : src[t + 1]; I[t + 2] = det < 0 ? src[t + 1] : src[t + 2]; }
    bakedTris += I.length / 3;
    return { ...p, attributes, indices: addAccessor(I, 5125, 'SCALAR', 34963) }; });
  json.meshes.push({ ...mesh, name: (mesh.name ?? `mesh_${mi}`) + suffix, primitives: prims }); return json.meshes.length - 1; };
const copyTree = (i) => { const n = nodes[i]; const m = { ...n }; if (n.name) m.name = n.name + suffix; if (n.children) m.children = n.children.map(copyTree); nodes.push(m); return nodes.length - 1; };
const copyBaked = (i) => { const n = nodes[i]; const m = { ...n }; delete m.matrix; delete m.translation; delete m.rotation; delete m.scale; if (n.name) m.name = n.name + suffix;
  if (n.mesh != null) m.mesh = bakeMesh(n.mesh, mul(Winv, mul(R, worldOf(i))));   // (the copy's world matrix is the parent's, W: W·N = R·(the original's world))
  if (n.children) m.children = n.children.map(copyBaked); nodes.push(m); return nodes.length - 1; };
const kids = nodes[pi].children.slice(); let made = 0, skipped = 0;
for (const ci of kids) { const n = nodes[ci]; if (skip.has(n.name) || (only && !only.has(n.name))) { skipped += 1; continue; }
  if (mirror) { nodes[pi].children.push(copyBaked(ci)); made += 1; continue; }
  const ni = copyTree(ci); const m = nodes[ni]; delete m.translation; delete m.rotation; delete m.scale; m.matrix = mul(M, local(n)); nodes[pi].children.push(ni); made += 1; }
if (only && made !== only.size) throw new Error(`--only named ${only.size} children, ${made} found under ${parentName}`);
if (grew) { const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]); json.buffers[0].byteLength = bin.length; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
const chunks = grew ? Buffer.concat([binHead, bin, tail]) : after;   // (no bake: the file as before but its nodes)
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + chunks.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, chunks]));
const how = mirror ? `mirrored and moved (at 0°: x' = ${TX} − x, z' = z + ${TZ}; turned ${deg}°) — baked, ${bakedTris} triangles of their own` : `turned ${deg}° and moved to x' = ${TX} − x, z' = ${TZ} − z`;
console.log(`${made} objects copied under ${parentName} (${skipped} left), ${how}; nodes ${nodes.length}; ${outF} ${((20 + jb.length + chunks.length) / 1048576).toFixed(2)} MB`);
