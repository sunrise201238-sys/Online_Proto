// Door-shaped panels in a merged model: vertical triangles grouped by their plane (axis and coordinate, 0.1 apart) and by
// touching extents; a group whose width, height and thinness fit a door (in the model's units, per the given scale) is listed.
// usage: node glb_doors.mjs <glb> <unitsPerMetre> [minWm=0.7 maxWm=1.7 minHm=1.8 maxHm=2.5 maxThickM=0.3 maxBottomM=0.5]
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [file, upmS, ...rest] = process.argv.slice(2); const upm = Number(upmS); const [minW, maxW, minH, maxH, maxT, maxB] = [0.7, 1.7, 1.8, 2.5, 0.3, 0.5].map((d, i) => rest[i] != null ? Number(rest[i]) : d);
const g = readGlb(file); const J = g.json; const W = worlds(J); const groups = new Map();
for (let ni = 0; ni < J.nodes.length; ni += 1) { const n = J.nodes[ni]; if (n.mesh == null) continue; const m = J.meshes[n.mesh];
  for (const p of m.primitives) { const pos = accessor(g, p.attributes.POSITION); const a = pos.array ?? pos; const idx = p.indices != null ? accessor(g, p.indices) : null; const ia = idx ? (idx.array ?? idx) : null; const nt = ia ? ia.length / 3 : a.length / 9; const V = (k) => apply(W[ni], a[k * 3], a[k * 3 + 1], a[k * 3 + 2]);
    for (let t = 0; t < nt; t += 1) { const i0 = ia ? ia[t * 3] : t * 3, i1 = ia ? ia[t * 3 + 1] : t * 3 + 1, i2 = ia ? ia[t * 3 + 2] : t * 3 + 2; const A = V(i0), B = V(i1), C = V(i2);
      const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2]; const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const len = Math.hypot(nx, ny, nz); if (len < 1e-9) continue;
      let axis; if (Math.abs(nx) / len > 0.95) axis = 'x'; else if (Math.abs(nz) / len > 0.95) axis = 'z'; else continue; const coord = (A[axis === 'x' ? 0 : 2] + B[axis === 'x' ? 0 : 2] + C[axis === 'x' ? 0 : 2]) / 3; const key = `${ni}|${axis}|${Math.round(coord * 10) / 10}|${J.materials[p.material]?.name ?? p.material}`;
      let list = groups.get(key); if (!list) { list = []; groups.set(key, list); } list.push({ b: [Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1]), Math.min(A[2], B[2], C[2]), Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1]), Math.max(A[2], B[2], C[2])], area: len / 2 }); } } }
// within a plane: clusters of triangles whose boxes touch (within 0.2 units)
const found = []; const touch = (p, q) => p[0] <= q[3] + 0.2 && q[0] <= p[3] + 0.2 && p[1] <= q[4] + 0.2 && q[1] <= p[4] + 0.2 && p[2] <= q[5] + 0.2 && q[2] <= p[5] + 0.2;
for (const [key, list] of groups) { const [ni, axis, coord, mat] = key.split('|'); const used = new Uint8Array(list.length);
  for (let i = 0; i < list.length; i += 1) { if (used[i]) continue; const cl = [i]; used[i] = 1; const b = [...list[i].b]; let area = list[i].area;
    for (let k = 0; k < cl.length; k += 1) for (let j = 0; j < list.length; j += 1) { if (used[j]) continue; if (touch(list[cl[k]].b, list[j].b)) { used[j] = 1; cl.push(j); area += list[j].area; for (let c = 0; c < 3; c += 1) { if (list[j].b[c] < b[c]) b[c] = list[j].b[c]; if (list[j].b[c + 3] > b[c + 3]) b[c + 3] = list[j].b[c + 3]; } } }
    const w = (axis === 'x' ? b[5] - b[2] : b[3] - b[0]) / upm, h = (b[4] - b[1]) / upm, th = (axis === 'x' ? b[3] - b[0] : b[5] - b[2]) / upm, bottom = b[1] / upm;
    if (w >= minW && w <= maxW && h >= minH && h <= maxH && th <= maxT && bottom <= maxB && bottom >= -0.5) found.push({ ni, axis, coord: Number(coord), mat, tris: cl.length, w, h, th, bottom, b, fill: area / (w * h * upm * upm) }); } }
found.sort((p, q) => p.b[0] - q.b[0] || p.b[2] - q.b[2]);
console.log(`${found.length} door-shaped panels at ${upm} units per metre (w ${minW}..${maxW} m, h ${minH}..${maxH} m, thin <= ${maxT} m, bottom <= ${maxB} m):`);
for (const d of found) console.log(`  node ${d.ni} ${d.axis}@${d.coord} ${d.mat}: ${d.w.toFixed(2)} x ${d.h.toFixed(2)} m, tris ${d.tris}, fill ${d.fill.toFixed(2)}, box x ${d.b[0].toFixed(1)}..${d.b[3].toFixed(1)} y ${d.b[1].toFixed(1)}..${d.b[4].toFixed(1)} z ${d.b[2].toFixed(1)}..${d.b[5].toFixed(1)}`);
