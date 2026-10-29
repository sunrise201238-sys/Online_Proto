// Triangles left inside doorway openings (all corners inside the box). usage: node glb_leftovers.mjs <glb> "name:x0,x1,z0,z1,y0,y1;..."
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [file, spec] = process.argv.slice(2); const boxes = spec.split(';').map((s) => { const [name, b] = s.split(':'); return { name, b: b.split(',').map(Number), n: 0, nodes: new Set() }; });
const g = readGlb(file); const J = g.json; const W = worlds(J);
for (let ni = 0; ni < J.nodes.length; ni += 1) { const n = J.nodes[ni]; if (n.mesh == null) continue; const m = J.meshes[n.mesh];
  for (const p of m.primitives) { const pos = accessor(g, p.attributes.POSITION); const a = pos.array ?? pos; const idx = p.indices != null ? accessor(g, p.indices) : null; const ia = idx ? (idx.array ?? idx) : null; const nt = ia ? ia.length / 3 : a.length / 9; const V = (k) => apply(W[ni], a[k * 3], a[k * 3 + 1], a[k * 3 + 2]);
    for (let t = 0; t < nt; t += 1) { const T = [0, 1, 2].map((k) => V(ia ? ia[t * 3 + k] : t * 3 + k)); for (const bx of boxes) { const B = bx.b; if (T.every((v) => v[0] >= B[0] && v[0] <= B[1] && v[2] >= B[2] && v[2] <= B[3] && v[1] >= B[4] && v[1] <= B[5])) { bx.n += 1; bx.nodes.add(n.name); } } } } }
for (const bx of boxes) console.log(`${bx.name}: ${bx.n} triangles left (${[...bx.nodes].join(',') || '-'})`);
