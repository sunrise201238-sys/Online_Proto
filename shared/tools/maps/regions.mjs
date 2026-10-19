// the walked regions of a map json: size, floor range, bounding box (metres). usage: node regions.mjs <root> <json> <cxM> <czM> [top=8]
import { readFileSync } from 'node:fs';
const [root, jsonFile, cxS, czS, topS] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS), TOP = Number(topS ?? 8); const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href;
const { buildNavGrid } = await import(SIM + 'index.js'); const data = JSON.parse(readFileSync(jsonFile, 'utf8'));
const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = buildNavGrid(data.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, edgeE, edgeS, floor } = g; const size = n * layers; const comp = new Int32Array(size).fill(-1); const regs = [];
for (let s = 0; s < size; s += 1) { if (!walk[s] || comp[s] >= 0) continue; const id = regs.length; const r = { id, count: 0, lo: Infinity, hi: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; const st = [s]; comp[s] = id; while (st.length) { const a = st.pop(); r.count += 1; const f = floor[a]; if (f < r.lo) r.lo = f; if (f > r.hi) r.hi = f; const i = a % n, c = i % cols, rr = (i - c) / cols; const x = minX + (c + 0.5) * cell, z = minZ + (rr + 0.5) * cell; if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (z < r.z0) r.z0 = z; if (z > r.z1) r.z1 = z;
    const nb = []; if (c + 1 < cols && edgeE[a]) nb.push(a + 1); if (c > 0 && edgeE[a - 1]) nb.push(a - 1); if (rr + 1 < rows && edgeS[a]) nb.push(a + cols); if (rr > 0 && edgeS[a - cols]) nb.push(a - cols); for (const b of nb) if (walk[b] && comp[b] < 0) { comp[b] = id; st.push(b); } } regs.push(r); }
regs.sort((a, b) => b.count - a.count); const M = (u, c) => (u / 4 + c).toFixed(0);
for (const r of regs.slice(0, TOP)) console.log(`${String(r.count).padStart(5)} nodes  floor ${(r.lo / 4).toFixed(1)}..${(r.hi / 4).toFixed(1)} m  x ${M(r.x0, CX)}..${M(r.x1, CX)} z ${M(r.z0, CZ)}..${M(r.z1, CZ)} m`);
console.log(`${regs.length} regions, ${regs.reduce((s, r) => s + r.count, 0)} nodes walkable`);
