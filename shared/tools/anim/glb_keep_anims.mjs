// glb_keep_anims.mjs <in.glb> <out.glb> <name,name,...> — A UNIT'S MODEL WITH ONLY THE ANIMATIONS THE GAME PLAYS (b1105im; user 2026-11-15, of a
// phone that ran out of memory starting a 2v2 Trio: "刪掉角色模型裡沒用到的動作"). A character file comes with every motion its source had — 24 to
// 57 of them: the cafe, the formation, the cut-ins, the victory poses — and three's GLTFLoader builds a clip, one track a channel, for every one
// of them whether the game asks for it or not: 4,500 to 8,300 tracks a file, half the file's bytes and most of what a unit holds of the page's
// memory. The game plays seven to nine (main.js UNIT_MODELS: each clip's `name`, or the `base` of a clip borrowed from another unit's file).
// The named animations are kept, in the file's own order; every other one goes, with the sample data only it pointed at. Nothing else is touched:
// the meshes, the skins, the nodes, the materials and the pictures are byte for byte what they were, and so is every sample of a kept animation
// (the BIN is rebuilt from the buffer views still referenced, each copied whole). A name the file does not have is an error. Prints what went.
// unit_anims.mjs beside this file runs it over every unit of a tree, the names read off the game's own table.
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out, namesArg] = process.argv.slice(2);
if (!inp || !out || !namesArg) { console.error('usage: node glb_keep_anims.mjs <in.glb> <out.glb> <name,name,...>'); process.exit(2); }
const keep = new Set(namesArg.split(',').map((s) => s.trim()).filter(Boolean));
const buf = readFileSync(inp); if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + inp);
const jl = buf.readUInt32LE(12); const J = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bl = buf.readUInt32LE(20 + jl); const BIN = buf.subarray(28 + jl, 28 + jl + bl);
if ((J.buffers ?? []).length !== 1 || J.buffers[0].uri) throw new Error('one embedded buffer expected');
// (what this repack does not follow: a primitive or a buffer view that keeps its data through an extension — Draco, meshopt)
for (const m of J.meshes ?? []) for (const p of m.primitives) if (p.extensions && Object.keys(p.extensions).length) throw new Error('a primitive with an extension: not handled');
for (const v of J.bufferViews ?? []) if (v.extensions && Object.keys(v.extensions).length) throw new Error('a buffer view with an extension: not handled');
const had = (J.animations ?? []).map((a) => a.name); const missing = [...keep].filter((n) => !had.includes(n));
if (missing.length) throw new Error(`${inp}: no animation named ${missing.join(', ')} (it has: ${had.join(', ')})`);
const anims = (J.animations ?? []).filter((a) => keep.has(a.name));
// the accessors still referenced: every mesh's (its morph targets' too), every skin's, the kept animations' — and nothing else names one
const usedAcc = new Set(); const use = (i) => { if (i != null) usedAcc.add(i); };
for (const m of J.meshes ?? []) for (const p of m.primitives) { for (const a of Object.values(p.attributes ?? {})) use(a); use(p.indices); for (const t of p.targets ?? []) for (const a of Object.values(t)) use(a); }
for (const s of J.skins ?? []) use(s.inverseBindMatrices);
for (const a of anims) for (const s of a.samplers) { use(s.input); use(s.output); }
for (const a of J.accessors ?? []) if (a.sparse) throw new Error('a sparse accessor: not handled');
// the buffer views still referenced: those accessors', and the pictures'
const usedView = new Set(); for (const i of usedAcc) { const v = J.accessors[i].bufferView; if (v != null) usedView.add(v); }
for (const im of J.images ?? []) if (im.bufferView != null) usedView.add(im.bufferView);
// the BIN again, each kept view copied whole at a 4-byte boundary
const viewMap = new Map(); const parts = []; let total = 0; const views = [];
(J.bufferViews ?? []).forEach((v, i) => { if (!usedView.has(i)) return; const padN = (4 - (total % 4)) % 4; if (padN) { parts.push(Buffer.alloc(padN)); total += padN; }
  const o = v.byteOffset ?? 0; parts.push(BIN.subarray(o, o + v.byteLength)); viewMap.set(i, views.length); views.push({ ...v, buffer: 0, byteOffset: total }); total += v.byteLength; });
const tail = (4 - (total % 4)) % 4; if (tail) { parts.push(Buffer.alloc(tail)); total += tail; }
const accMap = new Map(); const accessors = [];
(J.accessors ?? []).forEach((a, i) => { if (!usedAcc.has(i)) return; accMap.set(i, accessors.length); accessors.push(a.bufferView != null ? { ...a, bufferView: viewMap.get(a.bufferView) } : { ...a }); });
const am = (i) => (i == null ? i : accMap.get(i));
const N = { ...J, buffers: [{ byteLength: total }], bufferViews: views, accessors,
  meshes: (J.meshes ?? []).map((m) => ({ ...m, primitives: m.primitives.map((p) => ({ ...p, attributes: Object.fromEntries(Object.entries(p.attributes ?? {}).map(([k, a]) => [k, am(a)])), ...(p.indices != null ? { indices: am(p.indices) } : {}), ...(p.targets ? { targets: p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, a]) => [k, am(a)]))) } : {}) })) })),
  ...(J.skins ? { skins: J.skins.map((s) => (s.inverseBindMatrices != null ? { ...s, inverseBindMatrices: am(s.inverseBindMatrices) } : s)) } : {}),
  ...(J.images ? { images: J.images.map((im) => (im.bufferView != null ? { ...im, bufferView: viewMap.get(im.bufferView) } : im)) } : {}),
  animations: anims.map((a) => ({ ...a, samplers: a.samplers.map((s) => ({ ...s, input: am(s.input), output: am(s.output) })) })) };
if (!N.animations.length) delete N.animations;
let json = Buffer.from(JSON.stringify(N), 'utf8'); const jp = (4 - (json.length % 4)) % 4; if (jp) json = Buffer.concat([json, Buffer.alloc(jp, 0x20)]);
const bin = Buffer.concat(parts); const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(out, Buffer.concat([head, jh, json, bh, bin]));
const ch = (list) => list.reduce((s, a) => s + a.channels.length, 0);
console.log(JSON.stringify({ file: out.split('/').pop(), animations: [had.length, anims.length], channels: [ch(J.animations ?? []), ch(anims)], accessors: [(J.accessors ?? []).length, accessors.length], bytes: [buf.length, 12 + 8 + json.length + 8 + bin.length], kept: anims.map((a) => a.name), gone: had.filter((n) => !keep.has(n)).length }));
