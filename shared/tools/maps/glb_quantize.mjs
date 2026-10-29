// A served model's vertex positions stored as 16-bit integers (KHR_mesh_quantization, 2026-10-29): each node's primitives
// are quantized over the node's own box — its translation and scale carry the box, so the file needs no other change
// and the viewer's node transforms place the vertices as before (three.js reads the extension since r116; the client's
// hull and fade code reads positions through the mesh's world matrix, so it sees the same metres). A vertex is 8 bytes
// instead of 12 (three shorts and a pad: a vertex attribute's stride must be a multiple of 4), the finest step a
// 274 m map's 65,000 values allow is 4 mm. Indices stay as they are (16-bit already where the merge wrote them).
// usage: node glb_quantize.mjs <in.glb> <out.glb>
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF] = process.argv.slice(2);
if (!inF || !outF) { console.error('usage: node glb_quantize.mjs <in.glb> <out.glb>'); process.exit(2); }
const buf = readFileSync(inF); const jl = buf.readUInt32LE(12); const J = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bs = 20 + jl + 8; const BIN = buf.subarray(bs, bs + buf.readUInt32LE(20 + jl));
const view = (bv) => { const v = J.bufferViews[bv]; return BIN.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
const f32 = (acc) => { const a = J.accessors[acc]; const v = J.bufferViews[a.bufferView]; if (v.byteStride && v.byteStride !== 12) throw new Error('strided positions'); const b = view(a.bufferView); return new Float32Array(b.buffer, b.byteOffset + (a.byteOffset ?? 0), a.count * 3); };
// the new BIN: every old bufferView copied except the position ones, which are replaced by shorts
const parts = []; let total = 0; const pad4 = (n) => (n + 3) & ~3;
const put = (bytes) => { const off = total; parts.push(bytes); total += bytes.length; const p = pad4(total) - total; if (p) { parts.push(Buffer.alloc(p)); total += p; } return off; };
const newViews = []; const viewMap = new Map();   // old bufferView index -> new index (for non-position views)
const posViewOf = new Set(); for (const m of J.meshes) for (const p of m.primitives) posViewOf.add(J.accessors[p.attributes.POSITION].bufferView);
for (let i = 0; i < J.bufferViews.length; i += 1) { if (posViewOf.has(i)) continue; const v = J.bufferViews[i]; const off = put(Buffer.from(view(i))); viewMap.set(i, newViews.length); newViews.push({ ...v, buffer: 0, byteOffset: off }); }
let verts = 0, nodesQ = 0;
for (const node of J.nodes) {
  if (node.mesh == null) continue; const mesh = J.meshes[node.mesh];
  if (node.rotation || node.matrix || node.scale || node.translation) throw new Error(`node ${node.name} carries a transform; the merge bakes them`);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.primitives) { const P = f32(p.attributes.POSITION); for (let k = 0; k < P.length; k += 3) for (let c = 0; c < 3; c += 1) { if (P[k + c] < lo[c]) lo[c] = P[k + c]; if (P[k + c] > hi[c]) hi[c] = P[k + c]; } }
  const scale = [0, 1, 2].map((c) => Math.max((hi[c] - lo[c]) / 65534, 1e-6)); const mid = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
  node.translation = mid; node.scale = scale;   // (p = mid + q * scale, q in -32767..32767)
  for (const p of mesh.primitives) {
    const acc = J.accessors[p.attributes.POSITION]; const P = f32(p.attributes.POSITION); const Q = new Int16Array(acc.count * 4);   // (x y z pad)
    const qmin = [32767, 32767, 32767], qmax = [-32767, -32767, -32767];
    for (let k = 0; k < acc.count; k += 1) for (let c = 0; c < 3; c += 1) { const q = Math.max(-32767, Math.min(32767, Math.round((P[3 * k + c] - mid[c]) / scale[c]))); Q[4 * k + c] = q; if (q < qmin[c]) qmin[c] = q; if (q > qmax[c]) qmax[c] = q; }
    const off = put(Buffer.from(Q.buffer, Q.byteOffset, Q.byteLength));
    const nv = newViews.length; newViews.push({ buffer: 0, byteOffset: off, byteLength: Q.byteLength, byteStride: 8, target: 34962 });
    acc.bufferView = nv; acc.byteOffset = 0; acc.componentType = 5122; acc.normalized = false; acc.min = qmin; acc.max = qmax;
    verts += acc.count;
  }
  nodesQ += 1;
}
for (const a of J.accessors) { if (a.componentType === 5122 && a.type === 'VEC3') continue; if (a.bufferView != null) a.bufferView = viewMap.get(a.bufferView); }
for (const im of J.images ?? []) if (im.bufferView != null) im.bufferView = viewMap.get(im.bufferView);
J.bufferViews = newViews; J.buffers = [{ byteLength: total }];
J.extensionsUsed = [...new Set([...(J.extensionsUsed ?? []), 'KHR_mesh_quantization'])]; J.extensionsRequired = [...new Set([...(J.extensionsRequired ?? []), 'KHR_mesh_quantization'])];
const json = Buffer.from(JSON.stringify(J)); const jpad = (4 - (json.length % 4)) % 4; const bin = Buffer.concat(parts);
const out = Buffer.alloc(12 + 8 + json.length + jpad + 8 + bin.length);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(json.length + jpad, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20); out.fill(0x20, 20 + json.length, 20 + json.length + jpad);
let o = 20 + json.length + jpad; out.writeUInt32LE(bin.length, o); out.writeUInt32LE(0x004e4942, o + 4); bin.copy(out, o + 8);
writeFileSync(outF, out);
console.log(`${outF}: ${nodesQ} nodes, ${verts} vertices quantized; ${(buf.length / 1048576).toFixed(2)} -> ${(out.length / 1048576).toFixed(2)} MiB`);
