// Nodes dropped from a model, and the pictures with them: a doll the game does not want, the posters and billboards a
// Sketchfab map carries as little quads in front of its walls (user 2026-10-29, the Jujutsu Shenanigans map: "remove those
// images from the map", "remove this doll object"). usage: node glb_drop_nodes.mjs <in> <out> "names=Reimu1,Part499;images=23,26,40"
//   names=  node names (the name up to its first '_', or the whole name) — the node and its mesh go
//   prefix= name prefixes — every node whose name starts with one goes (Leaf: a map's 212 tree crowns)
//   images= image indices — every primitive whose material's base colour is one of these images goes; a node left with no
//           primitive goes with it
//   blank=  image indices whose materials keep their geometry but lose the picture: a plain grey takes the texture's place
//           (a picture tiled over a room's walls and floor as wallpaper — deleting it would delete the room)
//   materials= material names or indices — every primitive of such a material goes (District's 1,361 window panes, one
//           glass material: the windows are open, user 2026-10-29)
// What nothing references afterwards — meshes, materials, textures, images — is removed and the indices closed up, so the
// picture's bytes leave the file once glb_strip.mjs rebuilds the BIN. The scene tree keeps its other nodes as they are.
import { writeFileSync } from 'node:fs';
import { readGlb } from './glb_read.mjs';
const [inF, outF, spec] = process.argv.slice(2);
const opt = Object.fromEntries((spec ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [k, v] = s.split('='); return [k.trim(), v.split(',').map((x) => x.trim()).filter(Boolean)]; }));
const names = new Set(opt.names ?? []); const images = new Set((opt.images ?? []).map(Number)); const blank = new Set((opt.blank ?? []).map(Number));
const g = readGlb(inF); const J = g.json;
const imageOf = (mi) => { const t = J.materials?.[mi]?.pbrMetallicRoughness?.baseColorTexture?.index; return t === undefined ? null : J.textures[t].source; };
const dropMat = new Set(); for (const m of opt.materials ?? []) (J.materials ?? []).forEach((mat, mi) => { if (mat.name === m || String(mi) === m) dropMat.add(mi); });
const goes = (p) => images.has(imageOf(p.material)) || dropMat.has(p.material);
let blanked = 0; for (const m of J.materials ?? []) { const pbr = m.pbrMetallicRoughness; if (!pbr?.baseColorTexture || !blank.has(J.textures[pbr.baseColorTexture.index].source)) continue; delete pbr.baseColorTexture; pbr.baseColorFactor = [0.62, 0.62, 0.62, 1]; blanked += 1; }
const dropNode = new Set(); let prims = 0, tris = 0; const triCount = (p) => p.indices !== undefined ? J.accessors[p.indices].count / 3 : J.accessors[p.attributes.POSITION].count / 3;
const prefixes = opt.prefix ?? [];
J.nodes.forEach((n, ni) => { const nm = n.name ?? ''; if (names.has(nm) || names.has(nm.split('_')[0]) || prefixes.some((p) => nm.startsWith(p))) { dropNode.add(ni); return; }
  if (n.mesh === undefined) return; const m = J.meshes[n.mesh]; const keep = m.primitives.filter((p) => !goes(p));
  if (keep.length === m.primitives.length) return; for (const p of m.primitives) if (goes(p)) { prims += 1; tris += triCount(p); }
  if (!keep.length) dropNode.add(ni); else m.primitives = keep; });
// the dropped nodes leave their parents' child lists (their own children go with them)
const gone = new Set(dropNode); const walk = (ni) => { for (const c of J.nodes[ni].children ?? []) { gone.add(c); walk(c); } }; for (const ni of dropNode) walk(ni);
for (const n of J.nodes) if (n.children) n.children = n.children.filter((c) => !gone.has(c));
for (const s of J.scenes ?? []) s.nodes = s.nodes.filter((c) => !gone.has(c));
const nodeMap = new Map(); const nodes = []; J.nodes.forEach((n, ni) => { if (gone.has(ni)) return; nodeMap.set(ni, nodes.length); nodes.push(n); });
for (const n of nodes) if (n.children) n.children = n.children.map((c) => nodeMap.get(c));
for (const s of J.scenes ?? []) s.nodes = s.nodes.map((c) => nodeMap.get(c)); J.nodes = nodes;
// what nothing references: meshes, then materials, textures, images
const used = (list, refs) => { const map = new Map(); const out = []; for (const i of refs) if (!map.has(i)) { map.set(i, out.length); out.push(list[i]); } return [map, out]; };
const [meshMap, meshes] = used(J.meshes, J.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh)); for (const n of J.nodes) if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh); J.meshes = meshes;
const matRefs = []; for (const m of J.meshes) for (const p of m.primitives) if (p.material !== undefined) matRefs.push(p.material);
const [matMap, materials] = used(J.materials ?? [], matRefs); for (const m of J.meshes) for (const p of m.primitives) if (p.material !== undefined) p.material = matMap.get(p.material); J.materials = materials;
const texSlots = (m) => [m.pbrMetallicRoughness?.baseColorTexture, m.pbrMetallicRoughness?.metallicRoughnessTexture, m.normalTexture, m.occlusionTexture, m.emissiveTexture].filter(Boolean);
const [texMap, textures] = used(J.textures ?? [], J.materials.flatMap((m) => texSlots(m).map((t) => t.index))); for (const m of J.materials) for (const t of texSlots(m)) t.index = texMap.get(t.index); J.textures = textures;
const [imgMap, imagesLeft] = used(J.images ?? [], J.textures.map((t) => t.source)); for (const t of J.textures) t.source = imgMap.get(t.source); const imagesGone = (J.images ?? []).length - imagesLeft.length; J.images = imagesLeft;
let js = Buffer.from(JSON.stringify(J)); const pad = (4 - (js.length % 4)) % 4; if (pad) js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
const bin = g.bin; const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + js.length + bin.length, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.write('JSON', 4); const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
writeFileSync(outF, Buffer.concat([h, c1, js, c2, bin]));
console.log(`${outF}: ${gone.size} nodes dropped (${dropNode.size} named or emptied), ${prims} primitives (${Math.round(tris)} triangles) of the listed images, ${blanked} materials blanked, ${imagesGone} images, ${(g.json.materials ?? []).length - materials.length} materials gone; ${J.nodes.length} nodes, ${J.meshes.length} meshes, ${J.images.length} images left`);
