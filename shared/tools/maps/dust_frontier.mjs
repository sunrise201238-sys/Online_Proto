// Where the walked regions nearly meet: pairs of walk nodes of two regions within R metres horizontally, grouped into spots, with the floor heights on either side and the boxes standing between.
import { readFileSync } from 'node:fs';
const [root, jsonFile] = process.argv.slice(2); const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href;
const { buildNavGrid } = await import(SIM + 'index.js'); const data = JSON.parse(readFileSync(jsonFile, 'utf8'));
const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = buildNavGrid(data.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, edgeE, edgeS, floor } = g; const size = n * layers; const comp = new Int32Array(size).fill(-1); const sizes = [];
for (let s = 0; s < size; s += 1) { if (!walk[s] || comp[s] >= 0) continue; const id = sizes.length; let count = 0; const st = [s]; comp[s] = id; while (st.length) { const a = st.pop(); count += 1; const i = a % n, c = i % cols, r = (i - c) / cols; const nb = []; if (c + 1 < cols && edgeE[a]) nb.push(a + 1); if (c > 0 && edgeE[a - 1]) nb.push(a - 1); if (r + 1 < rows && edgeS[a]) nb.push(a + cols); if (r > 0 && edgeS[a - cols]) nb.push(a - cols); for (const b of nb) if (walk[b] && comp[b] < 0) { comp[b] = id; st.push(b); } } sizes.push(count); }
const rank = sizes.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const letter = new Map(); rank.forEach(([v, i], k) => letter.set(i, k < 26 ? String.fromCharCode(65 + k) : '*'));
const pos = (a) => { const i = a % n, c = i % cols, r = (i - c) / cols; return [minX + (c + 0.5) * cell, minZ + (r + 0.5) * cell]; };
const R = 3;   // cells
const spots = new Map();   // "A-C" -> list of [x,z,fa,fc]
for (let a = 0; a < size; a += 1) { if (!walk[a]) continue; const la = letter.get(comp[a]); if (la === '*') continue; const i = a % n, c = i % cols, r = (i - c) / cols;
  for (let l = 0; l < layers; l += 1) for (let dr = -R; dr <= R; dr += 1) for (let dc = -R; dc <= R; dc += 1) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; const b = l * n + rr * cols + cc; if (!walk[b] || comp[b] === comp[a]) continue; const lb = letter.get(comp[b]); if (lb === '*' || la > lb) continue;
    const key = la + '-' + lb; if (!spots.has(key)) spots.set(key, []); const [x, z] = pos(a); spots.get(key).push([x, z, floor[a], floor[b]]); } }
const M = (u, c) => (u / 4 + c).toFixed(1);
for (const [key, list] of [...spots.entries()].sort((a, b) => b[1].length - a[1].length)) {
  // cluster the points (grid of 8 u)
  const cl = new Map(); for (const p of list) { const k = Math.floor(p[0] / 16) + ',' + Math.floor(p[1] / 16); if (!cl.has(k)) cl.set(k, []); cl.get(k).push(p); }
  const top = [...cl.values()].sort((a, b) => b.length - a.length).slice(0, 6);
  console.log(`${key}: ${list.length} near pairs, ${cl.size} spots; the biggest:`);
  for (const c of top) { const mx = c.reduce((s, p) => s + p[0], 0) / c.length, mz = c.reduce((s, p) => s + p[1], 0) / c.length; const fa = c.reduce((s, p) => s + p[2], 0) / c.length, fb = c.reduce((s, p) => s + p[3], 0) / c.length;
    const between = data.obstacles.filter((o) => o.maxX > mx - 8 && o.minX < mx + 8 && o.maxZ > mz - 8 && o.minZ < mz + 8 && o.maxY > Math.min(fa, fb) + 2);
    const tall = between.filter((o) => o.maxY - Math.max(fa, fb) > 6); 
    console.log(`  at x ${M(mx, 49.8)} z ${M(mz, -32)} m (${c.length} pairs): ${key[0]} floor ${(fa / 4).toFixed(1)} m, ${key[2]} floor ${(fb / 4).toFixed(1)} m; ${between.length} boxes within 2 m, ${tall.length} taller than a hop over the higher floor` + (tall.length ? ': ' + tall.slice(0, 4).map((o) => `[x ${M(o.minX, 49.8)}..${M(o.maxX, 49.8)} z ${M(o.minZ, -32)}..${M(o.maxZ, -32)} y ${(o.minY / 4).toFixed(1)}..${(o.maxY / 4).toFixed(1)}]`).join(' ') : '')); }
}
