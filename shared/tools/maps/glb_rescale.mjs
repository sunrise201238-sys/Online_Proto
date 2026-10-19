// A glb served at another size: a root node with the scale, over the scene's own roots (glTF node transforms are
// honoured by the client's loader and by the generator alike). usage: node glb_rescale.mjs <in.glb> <out.glb> <factor>
import { readFileSync, writeFileSync } from 'node:fs';
const [, , inFile, outFile, kS] = process.argv; const k = Number(kS);
const buf = readFileSync(inFile); const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12; const chunks = []; while (off < buf.length) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) }); off += 8 + len; }
const json = JSON.parse(new TextDecoder().decode(chunks[0].data)); const scene = json.scenes[json.scene ?? 0];
json.nodes.push({ name: `scaled_x${k}`, scale: [k, k, k], children: scene.nodes.slice() }); scene.nodes = [json.nodes.length - 1];
let jsonBytes = Buffer.from(JSON.stringify(json)); while (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.from(' ')]);
const parts = [];
for (const c of chunks) { const data = c.type === 0x4e4f534a ? jsonBytes : c.data; const pad = (4 - (data.length % 4)) % 4; const padded = pad ? Buffer.concat([data, Buffer.alloc(pad, c.type === 0x4e4f534a ? 0x20 : 0)]) : data; const h = Buffer.alloc(8); h.writeUInt32LE(padded.length, 0); h.writeUInt32LE(c.type, 4); parts.push(h, padded); }
const body = Buffer.concat(parts); const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + body.length, 8);
writeFileSync(outFile, Buffer.concat([head, body])); console.log(`${outFile}: scene scaled by ${k} (${json.nodes.length} nodes)`);
