// A horizontal section of a model: every triangle crossing the plane y = h becomes a line (x, z) pair. usage: node glb_slice.mjs <glb> <h> <out.json>
import { readGlb, accessor, worlds, apply } from './glb_read.mjs'; import { writeFileSync } from 'node:fs';
const [file, hS, out] = process.argv.slice(2); const h = Number(hS); const g = readGlb(file); const J = g.json; const W = worlds(J); const segs = [];
for (let ni = 0; ni < J.nodes.length; ni += 1) { const n = J.nodes[ni]; if (n.mesh == null) continue; const m = J.meshes[n.mesh];
  for (const p of m.primitives) { const pos = accessor(g, p.attributes.POSITION); const a = pos.array ?? pos; const idx = p.indices != null ? accessor(g, p.indices) : null; const ia = idx ? (idx.array ?? idx) : null; const nt = ia ? ia.length / 3 : a.length / 9; const V = (k) => apply(W[ni], a[k * 3], a[k * 3 + 1], a[k * 3 + 2]);
    for (let t = 0; t < nt; t += 1) { const P = [0, 1, 2].map((k) => V(ia ? ia[t * 3 + k] : t * 3 + k)); const pts = [];
      for (let e = 0; e < 3; e += 1) { const A = P[e], B = P[(e + 1) % 3]; if ((A[1] - h) * (B[1] - h) < 0) { const s = (h - A[1]) / (B[1] - A[1]); pts.push([A[0] + s * (B[0] - A[0]), A[2] + s * (B[2] - A[2])]); } }
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]); } } }
writeFileSync(out, JSON.stringify(segs.map((s) => s.map((v) => Math.round(v * 100) / 100)))); console.log(`${segs.length} segments at y ${h}`);
