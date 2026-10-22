// A container mesh opened at both ends: the triangles lying entirely within `band` metres of either end of the mesh's
// long axis (local space — the door end's furniture, the plain end's panel, the corner posts of both) are dropped, so the
// thing is a tunnel a body walks through; its material is made double-sided, so the walls and the roof are seen from
// inside (a closed prop has no inner faces). The mesh is edited in place, so every node sharing it opens — the Warehouse's
// six marked containers are three meshes, each on a container and its 180° copy (user 2026-10-22, the plan's red lines,
// "C: both ends"). Only the index buffer is new; positions, normals and uvs stay as they are.
// usage: node glb_open_ends.mjs <in.glb> <out.glb> <meshId,meshId,...> [band=0.35]
import { writeFileSync } from 'node:fs';
import { readGlb, accessor } from './glb_read.mjs';
const [inF, outF, ids, bandS] = process.argv.slice(2); const band = Number(bandS ?? 0.35);
const g = readGlb(inF); const json = g.json; const added = [];
const appendView = (bytes, target) => { const pad = (4 - (bytes.length % 4)) % 4; const byteOffset = g.bl + added.reduce((a, b) => a + b.length, 0); added.push(Buffer.concat([bytes, Buffer.alloc(pad)])); json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target }); return json.bufferViews.length - 1; };
for (const mi of ids.split(',').map(Number)) {
  const mesh = json.meshes[mi]; const users = json.nodes.filter((n) => n.mesh === mi).map((n) => n.name);
  for (const pr of mesh.primitives) {
    const P = accessor(g, pr.attributes.POSITION); const I = pr.indices != null ? accessor(g, pr.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    const ext = hi.map((h, k) => h - lo[k]); const L = ext.indexOf(Math.max(...ext));
    const keep = []; let dropped = 0;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I.map ? [I[t], I[t + 1], I[t + 2]] : null; const c = a.map((j) => P[j * 3 + L]); const cMin = Math.min(...c), cMax = Math.max(...c);
      const atMin = cMax <= lo[L] + band, atMax = cMin >= hi[L] - band;
      if (atMin || atMax) { dropped += 1; continue; }
      keep.push(a[0], a[1], a[2]);
    }
    const arr = new Uint32Array(keep); const bv = appendView(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 34963);
    json.accessors.push({ bufferView: bv, componentType: 5125, count: arr.length, type: 'SCALAR' }); pr.indices = json.accessors.length - 1;
    if (pr.material != null) json.materials[pr.material].doubleSided = true;
    console.log(`mesh ${mi} (${users.join(', ')}): long axis ${'xyz'[L]} ${lo[L].toFixed(2)}..${hi[L].toFixed(2)}, ${dropped} triangles dropped at the ends, ${keep.length / 3} kept; material ${pr.material} double-sided`);
  }
}
const binAll = Buffer.concat([g.bin, ...added]); json.buffers[0].byteLength = binAll.length;
let jsonBytes = Buffer.from(JSON.stringify(json)); const jp = (4 - (jsonBytes.length % 4)) % 4; if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + binAll.length, 8);
const ch1 = Buffer.alloc(8); ch1.writeUInt32LE(jsonBytes.length, 0); ch1.write('JSON', 4); const ch2 = Buffer.alloc(8); ch2.writeUInt32LE(binAll.length, 0); ch2.write('BIN\0', 4);
writeFileSync(outF, Buffer.concat([header, ch1, jsonBytes, ch2, binAll])); console.log(`-> ${outF}`);
