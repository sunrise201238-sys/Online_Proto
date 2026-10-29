// The things near given plan points: triangles above the ground within r units of each point, flood-joined by touching
// boxes, each cluster's extent. usage: node glb_clusters.mjs <glb> <r> <minY> x,z [x,z ...]
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [file, rS, minYS, ...pts] = process.argv.slice(2); const r = Number(rS), minY = Number(minYS); const g = readGlb(file); const J = g.json; const W = worlds(J);
const P = pts.map((s) => s.split(',').map(Number)); const near = P.map(() => []);
for (let ni = 0; ni < J.nodes.length; ni += 1) { const n = J.nodes[ni]; if (n.mesh == null) continue; const m = J.meshes[n.mesh];
  for (const p of m.primitives) { const pos = accessor(g, p.attributes.POSITION); const a = pos.array ?? pos; const idx = p.indices != null ? accessor(g, p.indices) : null; const ia = idx ? (idx.array ?? idx) : null; const nt = ia ? ia.length / 3 : a.length / 9; const V = (k) => apply(W[ni], a[k * 3], a[k * 3 + 1], a[k * 3 + 2]);
    for (let t = 0; t < nt; t += 1) { const T = [0, 1, 2].map((k) => V(ia ? ia[t * 3 + k] : t * 3 + k)); const b = [Math.min(T[0][0], T[1][0], T[2][0]), Math.min(T[0][1], T[1][1], T[2][1]), Math.min(T[0][2], T[1][2], T[2][2]), Math.max(T[0][0], T[1][0], T[2][0]), Math.max(T[0][1], T[1][1], T[2][1]), Math.max(T[0][2], T[1][2], T[2][2])];
      if (b[4] < minY) continue; const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2; for (let i = 0; i < P.length; i += 1) if (Math.hypot(cx - P[i][0], cz - P[i][1]) <= r) near[i].push({ b, ni, mat: J.materials[p.material]?.name }); } } }
const touch = (p, q) => p[0] <= q[3] + 0.3 && q[0] <= p[3] + 0.3 && p[1] <= q[4] + 0.3 && q[1] <= p[4] + 0.3 && p[2] <= q[5] + 0.3 && q[2] <= p[5] + 0.3;
for (let i = 0; i < P.length; i += 1) { const L = near[i]; const used = new Uint8Array(L.length); const cls = [];
  for (let s = 0; s < L.length; s += 1) { if (used[s]) continue; const cl = [s]; used[s] = 1; const b = [...L[s].b]; const mats = new Set([L[s].mat]); const nodes = new Set([L[s].ni]);
    for (let k = 0; k < cl.length; k += 1) for (let j = 0; j < L.length; j += 1) { if (used[j]) continue; if (touch(L[cl[k]].b, L[j].b)) { used[j] = 1; cl.push(j); mats.add(L[j].mat); nodes.add(L[j].ni); for (let c = 0; c < 3; c += 1) { if (L[j].b[c] < b[c]) b[c] = L[j].b[c]; if (L[j].b[c + 3] > b[c + 3]) b[c + 3] = L[j].b[c + 3]; } } }
    cls.push({ n: cl.length, b, mats: [...mats], nodes: [...nodes] }); }
  cls.sort((p, q) => q.n - p.n); const f = (v) => v.toFixed(1);
  console.log(`point (${P[i][0]}, ${P[i][1]}): ${L.length} triangles within ${r}, ${cls.length} clusters`); for (const c of cls.slice(0, 6)) console.log(`  tris ${c.n} box x ${f(c.b[0])}..${f(c.b[3])} y ${f(c.b[1])}..${f(c.b[4])} z ${f(c.b[2])}..${f(c.b[5])} nodes ${c.nodes.join(',')} mats ${c.mats.join(',')}`); }
