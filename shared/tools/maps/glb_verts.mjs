// Distinct world vertex positions of a node inside a box (rounded to mm), with counts. usage: node glb_verts.mjs <glb> <node> x0 x1 y0 y1 z0 z1
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [file, name, ...b] = process.argv.slice(2); const [x0, x1, y0, y1, z0, z1] = b.map(Number); const g = readGlb(file); const W = worlds(g.json); const ni = g.json.nodes.findIndex((n) => n.name === name); const n = g.json.nodes[ni]; const seen = new Map();
for (const p of g.json.meshes[n.mesh].primitives) { const pos = accessor(g, p.attributes.POSITION); for (let i = 0; i < pos.length / 3; i += 1) { const q = apply(W[ni], pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); if (q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1 || q[2] < z0 || q[2] > z1) continue; const k = q.map((v) => v.toFixed(3)).join(' '); seen.set(k, (seen.get(k) ?? 0) + 1); } }
for (const [k, c] of [...seen].sort()) console.log(k, 'x' + c);
