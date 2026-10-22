// Spots on a map's nav grid, read-only: for each point (model metres) the floor the grid walks there, or 'off grid', and the
// clear radius around it (the nearest cell no body walks, up to 3 m). usage: node spot_check.mjs <tree root> <json> <cxM> <czM> x,z x,z ...
import { readFileSync } from 'node:fs';
const [root, jsonFile, cxS, czS, ...rest] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS);
const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href; const { buildNavGrid } = await import(SIM + 'index.js');
const data = JSON.parse(readFileSync(jsonFile, 'utf8')); const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = buildNavGrid(data.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, floor } = g;
const at = (x, z) => { const c = Math.floor((x - minX) / cell), r = Math.floor((z - minZ) / cell); if (c < 0 || r < 0 || c >= cols || r >= rows) return null; let f = null; for (let l = 0; l < layers; l += 1) { const a = l * n + r * cols + c; if (walk[a] && (f == null || floor[a] > f)) f = floor[a]; } return f; };
for (const a of rest) { const [xm, zm] = a.split(',').map(Number); const x = (xm - CX) * 4, z = (zm - CZ) * 4; const f = at(x, z);
  if (f == null) { console.log(`(${xm}, ${zm}) -> units (${x.toFixed(0)}, ${z.toFixed(0)}): OFF GRID (no body walks there)`); continue; }
  let clear = 12; for (let r = cell; r <= 12 && r < clear; r += cell) { for (let dx = -r; dx <= r; dx += cell) for (let dz = -r; dz <= r; dz += cell) { if (Math.max(Math.abs(dx), Math.abs(dz)) < r) continue; const ff = at(x + dx, z + dz); if (ff == null || Math.abs(ff - f) > 2.6) { clear = Math.min(clear, r); } } }
  console.log(`(${xm}, ${zm}) -> units (${x.toFixed(0)}, ${z.toFixed(0)}): floor ${(f / 4).toFixed(2)} m, clear ${clear >= 12 ? '3+ m' : (clear / 4).toFixed(2) + ' m'}`); }
