// A served copy of a model made smaller without touching what is seen: the NORMAL and TANGENT attributes dropped (three's
// GLTFLoader shades a primitive without normals flat, which a boxy map wears well), the indices stored as uint16 where a
// primitive has fewer than 65,536 vertices, and the BIN rebuilt with only what is referenced (the slimmed images kept as
// they are). usage: node glb_strip.mjs <in.glb> <out.glb> [--keep-normals]
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out, ...flags] = process.argv.slice(2); const keepNormals = flags.includes('--keep-normals');
const buf = readFileSync(inp); const jl = buf.readUInt32LE(12); const J = JSON.parse(buf.subarray(20, 20 + jl).toString());
const bl = buf.readUInt32LE(20 + jl); const BIN = buf.subarray(28 + jl, 28 + jl + bl);
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const chunks = []; let total = 0; const views = []; const accessors = [];
const pad = () => { while (total % 4) { chunks.push(Buffer.alloc(1)); total += 1; } };
const addView = (data, extra = {}) => { pad(); const v = { buffer: 0, byteOffset: total, byteLength: data.length, ...extra }; views.push(v); chunks.push(Buffer.from(data.buffer, data.byteOffset, data.length)); total += data.length; return views.length - 1; };
// read an accessor into a tightly packed typed array (de-interleaving)
const read = (ai) => { const a = J.accessors[ai]; const bv = J.bufferViews[a.bufferView]; const n = COMPS[a.type]; const sz = SIZE[a.componentType]; const stride = bv.byteStride || n * sz; const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const T = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType]; const outArr = new T(a.count * n);
  for (let i = 0; i < a.count; i += 1) { const off = base + i * stride; for (let c = 0; c < n; c += 1) outArr[i * n + c] = T === Float32Array ? BIN.readFloatLE(off + c * sz) : T === Uint32Array ? BIN.readUInt32LE(off + c * sz) : T === Uint16Array ? BIN.readUInt16LE(off + c * sz) : T === Int16Array ? BIN.readInt16LE(off + c * sz) : T === Uint8Array ? BIN.readUInt8(off + c * sz) : BIN.readInt8(off + c * sz); }
  return { a, arr: outArr, n }; };
const addAccessor = (arr, type, componentType, count, extra = {}) => { const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); const vi = addView(bytes, extra.target ? { target: extra.target } : {}); const acc = { bufferView: vi, componentType, count, type }; if (extra.minmax) { const n = COMPS[type]; const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < count; i += 1) for (let c = 0; c < n; c += 1) { const v = arr[i * n + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; } acc.min = mn; acc.max = mx; } accessors.push(acc); return accessors.length - 1; };
let verts = 0, tris = 0, dropped = 0, idx16 = 0;
const cache = new Map();
for (const m of J.meshes) for (const p of m.primitives) {
  const attrs = {};
  for (const [sem, ai] of Object.entries(p.attributes)) {
    if (sem === 'TANGENT' || (sem === 'NORMAL' && !keepNormals)) { dropped += 1; continue; }
    const key = 'a' + ai; if (!cache.has(key)) { const { a, arr } = read(ai); cache.set(key, addAccessor(arr, a.type, a.componentType, a.count, { target: 34962, minmax: sem === 'POSITION' })); if (sem === 'POSITION') verts += a.count; }
    attrs[sem] = cache.get(key);
  }
  p.attributes = attrs;
  if (p.indices != null) { const key = 'i' + p.indices; if (!cache.has(key)) { const { a, arr } = read(p.indices); const nv = J.accessors[p.attributes.POSITION ?? Object.values(attrs)[0]]?.count ?? 1e9; let maxI = 0; for (const v of arr) if (v > maxI) maxI = v; const small = maxI < 65536; if (small) idx16 += 1; const packed = small ? Uint16Array.from(arr) : Uint32Array.from(arr); cache.set(key, addAccessor(packed, 'SCALAR', small ? 5123 : 5125, a.count, { target: 34963 })); tris += a.count / 3; } p.indices = cache.get(key); }
}
// the images, carried over as they are
for (const im of J.images ?? []) { const bv = J.bufferViews[im.bufferView]; const data = BIN.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); im.bufferView = addView(new Uint8Array(data)); }
pad();
J.bufferViews = views; J.accessors = accessors; J.buffers = [{ byteLength: total }];
for (const m of J.materials ?? []) { delete m.normalTexture; }   // (no normals to perturb)
let js = Buffer.from(JSON.stringify(J)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
const bin = Buffer.concat(chunks); const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(out, Buffer.concat([header, jh, js, bh, bin]));
console.log(`${out}: ${(buf.length / 1048576).toFixed(2)} -> ${((12 + 16 + js.length + bin.length) / 1048576).toFixed(2)} MiB; ${verts} vertices, ${Math.round(tris)} triangles, ${dropped} attribute sets dropped, ${idx16} of ${J.meshes.reduce((n, m) => n + m.primitives.length, 0)} primitives on uint16 indices`);
