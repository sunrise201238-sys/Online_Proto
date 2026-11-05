// Plain boxes added to a model (user 2026-11-05: "add a pure visual darker lines as door edges implying the entrance on both sides
// of the walls"): each entry a box in the model's metres with a flat colour, one new material per colour, one node per entry.
// usage: node glb_add_boxes.mjs <in.glb> <out.glb> '<[{"name":..,"min":[x,y,z],"max":[x,y,z],"color":[r,g,b]}, ...] json>'
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, outF, listJson] = process.argv.slice(2); const entries = JSON.parse(listJson);
const buf = readFileSync(inF); const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const after = buf.slice(20 + jsonLen); const binLen = after.readUInt32LE(0); if (after.readUInt32LE(4) !== 0x004E4942) throw new Error('no BIN chunk');
let bin = Buffer.from(after.slice(8, 8 + binLen)); const tail = after.slice(8 + binLen);
const COMPS = { SCALAR: 1, VEC3: 3 };
const addAccessor = (typed, componentType, type, target, extra = {}) => { const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: typed.byteLength, target }); bin = Buffer.concat([bin, Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)]);
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / COMPS[type], type, ...extra }); return json.accessors.length - 1; };
json.materials = json.materials ?? []; const materialOf = new Map();
const matFor = (color) => { const k = color.join(','); if (materialOf.has(k)) return materialOf.get(k); json.materials.push({ name: `Flat_${k}`, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }); materialOf.set(k, json.materials.length - 1); return json.materials.length - 1; };
const scene = json.scenes[json.scene ?? 0];
for (const e of entries) {
  const [x0, y0, z0] = e.min, [x1, y1, z1] = e.max;
  // six faces, four corners each, the normal out
  const faces = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]] ];
  const P = new Float32Array(24 * 3), N = new Float32Array(24 * 3), I = new Uint16Array(36);
  faces.forEach((f, k) => { for (let c = 0; c < 4; c += 1) { const v = k * 4 + c; P.set(f[c], v * 3); N.set(f[4], v * 3); } I.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6); });
  const attributes = { POSITION: addAccessor(P, 5126, 'VEC3', 34962, { min: [x0, y0, z0], max: [x1, y1, z1] }), NORMAL: addAccessor(N, 5126, 'VEC3', 34962) };
  json.meshes.push({ name: e.name, primitives: [{ attributes, indices: addAccessor(I, 5123, 'SCALAR', 34963), mode: 4, material: matFor(e.color) }] });
  json.nodes.push({ name: e.name, mesh: json.meshes.length - 1 }); scene.nodes.push(json.nodes.length - 1);
  console.log(`added ${e.name}: x ${x0}..${x1} y ${y0}..${y1} z ${z0}..${z1}`);
}
{ const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]); json.buffers[0].byteLength = bin.length; }
let text = JSON.stringify(json); while (Buffer.byteLength(text) % 4) text += ' '; const jb = Buffer.from(text, 'utf8');
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
const chunks = Buffer.concat([binHead, bin, tail]);
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + chunks.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
writeFileSync(outF, Buffer.concat([head, jb, chunks]));
console.log(`${outF}: ${((20 + jb.length + chunks.length) / 1048576).toFixed(2)} MB, nodes ${json.nodes.length}, materials ${json.materials.length}`);
