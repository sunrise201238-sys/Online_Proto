// flat (and gentle) triangles whose centre lies in a box (metres): height, lean, and which way they face (the winding's normal, y sign). usage: node flat_faces.mjs <glb> x0 z0 x1 z1 [max]
import { readFileSync } from 'node:fs';
const [, , file, ...r] = process.argv; const [bx0, bz0, bx1, bz1] = r.map(Number); const max = Number(r[4] ?? 20);
const buf = readFileSync(file); const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12; const chunks = []; while (off < buf.length) { const len = dv.getUint32(off, true); chunks.push(buf.subarray(off + 8, off + 8 + len)); off += 8 + len; }
const json = JSON.parse(new TextDecoder().decode(chunks[0])); const bin = chunks[1];
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }; const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const [T, sz] = COMP[a.componentType]; const n = NUM[a.type]; const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = bv.byteStride ?? sz * n; const out = new Float64Array(a.count * n); for (let k = 0; k < a.count; k += 1) { const v = new T(bin.buffer, start + k * stride, n); for (let c = 0; c < n; c += 1) out[k * n + c] = v[c]; } return { data: out, n, count: a.count }; }
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) for (let k = 0; k < 4; k += 1) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
const trs = (n) => { if (n.matrix) return n.matrix; const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1]; const [x, y, z, w] = q; const m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]; for (let c = 0; c < 3; c += 1) for (let rr = 0; rr < 3; rr += 1) m[c * 4 + rr] *= s[c]; return m; };
const xf = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
let shown = 0, up = 0, down = 0, upArea = 0, downArea = 0;
const walk = (ni, parent, path) => { const n = json.nodes[ni]; const m = mul(parent, trs(n)); const name = path + '/' + (n.name ?? ni);
  if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) { const pos = accessor(p.attributes.POSITION); const idx = p.indices != null ? accessor(p.indices).data : Float64Array.from({ length: pos.count }, (_, k) => k);
    const w = []; for (let k = 0; k < pos.count; k += 1) w.push(xf(m, pos.data[k * 3], pos.data[k * 3 + 1], pos.data[k * 3 + 2]));
    for (let t = 0; t + 2 < idx.length; t += 3) { const a = w[idx[t]], b = w[idx[t + 1]], c = w[idx[t + 2]]; const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3; if (cx < bx0 || cx > bx1 || cz < bz0 || cz > bz1) continue;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const len = Math.hypot(...nrm); if (len < 1e-9) continue; const ny = nrm[1] / len; const lean = Math.acos(Math.min(1, Math.abs(ny))) * 180 / Math.PI; if (lean > 60) continue;
      if (ny > 0) { up += 1; upArea += len / 2; } else { down += 1; downArea += len / 2; }
      if (shown < max) { shown += 1; console.log(`${ny > 0 ? 'UP  ' : 'DOWN'} lean ${lean.toFixed(0).padStart(2)} y ${a[1].toFixed(2)} ${b[1].toFixed(2)} ${c[1].toFixed(2)}  ${name.slice(-28)} area ${(len / 2).toFixed(1)}`); } } }
  for (const ch of n.children ?? []) walk(ch, m, name); };
for (const rn of json.scenes[json.scene ?? 0].nodes) walk(rn, I(), '');
console.log(`flat faces in the box: ${up} facing up (${upArea.toFixed(0)} m2), ${down} facing down (${downArea.toFixed(0)} m2)`);
