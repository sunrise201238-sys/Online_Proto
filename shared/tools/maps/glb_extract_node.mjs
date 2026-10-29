// Triangles wholly inside given boxes moved out of the merged meshes into nodes of their own (one per source node, named
// <name>_<sourceNode>, a sibling of the source with its transform), so the client can treat them apart — the Animal
// Hospital's open door leaves, which the wall fade carved into torn shapes. Attributes are shared; only index buffers are new.
// usage: node glb_extract_node.mjs <in.glb> <out.glb> "x0,x1,z0,z1,y0,y1;..." <name>
import { writeFileSync } from 'node:fs';
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [inF, outF, spec, name] = process.argv.slice(2); const boxes = spec.split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(',').map(Number));
const g = readGlb(inF); const json = g.json; const W = worlds(json); const added = [];
const appendView = (bytes, target) => { const pad = (4 - (bytes.length % 4)) % 4; const byteOffset = g.bl + added.reduce((a, b) => a + b.length, 0); added.push(Buffer.concat([bytes, Buffer.alloc(pad)])); json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target }); return json.bufferViews.length - 1; };
const indexAccessor = (arr) => { const bv = appendView(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 34963); json.accessors.push({ bufferView: bv, componentType: 5125, count: arr.length, type: 'SCALAR' }); return json.accessors.length - 1; };
const parentOf = {}; json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { parentOf[c] = i; }));
const inside = (v, B) => v[0] >= B[0] && v[0] <= B[1] && v[2] >= B[2] && v[2] <= B[3] && v[1] >= B[4] && v[1] <= B[5];
const newNodes = []; const nodeCount = json.nodes.length;
for (let ni = 0; ni < nodeCount; ni += 1) { const n = json.nodes[ni]; if (n.mesh == null) continue; const prims = []; let taken = 0;
  for (const pr of json.meshes[n.mesh].primitives) { const P = accessor(g, pr.attributes.POSITION); const I = pr.indices != null ? accessor(g, pr.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i); const keep = [], out = [];
    for (let t = 0; t + 2 < I.length; t += 3) { const a = [I[t], I[t + 1], I[t + 2]]; const T = a.map((j) => apply(W[ni], P[j * 3], P[j * 3 + 1], P[j * 3 + 2])); if (boxes.some((B) => T.every((v) => inside(v, B)))) out.push(...a); else keep.push(...a); }
    if (!out.length) continue; taken += out.length / 3; pr.indices = indexAccessor(new Uint32Array(keep)); prims.push({ attributes: { ...pr.attributes }, indices: indexAccessor(new Uint32Array(out)), material: pr.material, mode: pr.mode }); }
  if (!prims.length) continue; json.meshes.push({ name: `${name}_${n.name}`, primitives: prims }); const nn = { name: `${name}_${n.name}`, mesh: json.meshes.length - 1 }; for (const k of ['translation', 'rotation', 'scale', 'matrix']) if (n[k]) nn[k] = n[k];
  json.nodes.push(nn); const idx = json.nodes.length - 1; const p = parentOf[ni]; if (p != null) json.nodes[p].children.push(idx); else json.scenes[0].nodes.push(idx); newNodes.push(`${nn.name} (${taken} triangles)`); }
console.log('new nodes:', newNodes.join(', '));
const binAll = Buffer.concat([g.bin, ...added]); json.buffers[0].byteLength = binAll.length; let jsonBytes = Buffer.from(JSON.stringify(json)); const jp = (4 - (jsonBytes.length % 4)) % 4; if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + binAll.length, 8); const ch1 = Buffer.alloc(8); ch1.writeUInt32LE(jsonBytes.length, 0); ch1.write('JSON', 4); const ch2 = Buffer.alloc(8); ch2.writeUInt32LE(binAll.length, 0); ch2.write('BIN\0', 4);
writeFileSync(outF, Buffer.concat([header, ch1, jsonBytes, ch2, binAll])); console.log(`-> ${outF}`);
