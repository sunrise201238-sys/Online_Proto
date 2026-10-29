// Things cut out of a merged model: every triangle whose three corners lie inside one of the boxes (world units) is dropped
// — a thing in a merged mesh has no node of its own, so it goes by its place. Only the index buffers are new; positions,
// normals and uvs stay. usage: node glb_delete_boxes.mjs <in.glb> <out.glb> "x0,x1,z0,z1,y0,y1;..."
import { writeFileSync } from 'node:fs';
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [inF, outF, spec] = process.argv.slice(2); const boxes = spec.split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(',').map(Number));
const g = readGlb(inF); const json = g.json; const W = worlds(json); const added = []; const perBox = boxes.map(() => 0);
const appendView = (bytes, target) => { const pad = (4 - (bytes.length % 4)) % 4; const byteOffset = g.bl + added.reduce((a, b) => a + b.length, 0); added.push(Buffer.concat([bytes, Buffer.alloc(pad)])); json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target }); return json.bufferViews.length - 1; };
const users = new Map(); for (const n of json.nodes) if (n.mesh != null) users.set(n.mesh, (users.get(n.mesh) ?? 0) + 1);
for (let ni = 0; ni < json.nodes.length; ni += 1) { const n = json.nodes[ni]; if (n.mesh == null) continue; if (users.get(n.mesh) > 1) console.log(`mesh ${n.mesh} is shared by ${users.get(n.mesh)} nodes: the cut applies to all of them`);
  for (const pr of json.meshes[n.mesh].primitives) { const P = accessor(g, pr.attributes.POSITION); const I = pr.indices != null ? accessor(g, pr.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i); const keep = []; let dropped = 0;
    const inside = (v, B) => v[0] >= B[0] && v[0] <= B[1] && v[2] >= B[2] && v[2] <= B[3] && v[1] >= B[4] && v[1] <= B[5];
    for (let t = 0; t + 2 < I.length; t += 3) { const a = [I[t], I[t + 1], I[t + 2]]; const T = a.map((j) => apply(W[ni], P[j * 3], P[j * 3 + 1], P[j * 3 + 2])); let hit = -1;
      for (let b = 0; b < boxes.length && hit < 0; b += 1) if (T.every((v) => inside(v, boxes[b]))) hit = b;
      if (hit >= 0) { dropped += 1; perBox[hit] += 1; continue; } keep.push(a[0], a[1], a[2]); }
    if (!dropped) continue; const arr = new Uint32Array(keep); const bv = appendView(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 34963); json.accessors.push({ bufferView: bv, componentType: 5125, count: arr.length, type: 'SCALAR' }); pr.indices = json.accessors.length - 1;
    console.log(`node ${ni} "${n.name}": ${dropped} triangles dropped, ${keep.length / 3} kept`); } }
boxes.forEach((B, i) => console.log(`box ${B.join(',')}: ${perBox[i]} triangles`));
const binAll = Buffer.concat([g.bin, ...added]); json.buffers[0].byteLength = binAll.length;
let jsonBytes = Buffer.from(JSON.stringify(json)); const jp = (4 - (jsonBytes.length % 4)) % 4; if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + binAll.length, 8);
const ch1 = Buffer.alloc(8); ch1.writeUInt32LE(jsonBytes.length, 0); ch1.write('JSON', 4); const ch2 = Buffer.alloc(8); ch2.writeUInt32LE(binAll.length, 0); ch2.write('BIN\0', 4);
writeFileSync(outF, Buffer.concat([header, ch1, jsonBytes, ch2, binAll])); console.log(`-> ${outF} ${(Buffer.concat([header, ch1, jsonBytes, ch2, binAll]).length / 1e6).toFixed(1)} MB`);
