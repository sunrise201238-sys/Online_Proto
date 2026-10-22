// The walkable nav points nearest each corner of a map's data (units), to choose spawns. usage: node nav_corners.mjs <tree root> <json>
import { readFileSync } from 'node:fs';
const [root, jsonFile] = process.argv.slice(2); const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href; const { buildNavGrid } = await import(SIM + 'index.js');
const data = JSON.parse(readFileSync(jsonFile, 'utf8')); const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = buildNavGrid(data.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, floor } = g; const pts = [];
for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) for (let l = 0; l < layers; l += 1) { const a = l * n + r * cols + c; if (walk[a]) { pts.push([minX + (c + 0.5) * cell, minZ + (r + 0.5) * cell, floor[a]]); break; } }
console.log(`${pts.length} walkable points, grid ${cols}x${rows} cell ${cell}, x ${minX}.. z ${minZ}..`);
const H = data.halfX, V = data.halfZ; for (const [cx, cz, name] of [[-H, -V, 'NW'], [H, -V, 'NE'], [-H, V, 'SW'], [H, V, 'SE']]) { let best = null, bd = Infinity; for (const p of pts) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d < bd) { bd = d; best = p; } } console.log(`${name}: (${best[0].toFixed(0)}, ${best[1].toFixed(0)}) floor ${best[2].toFixed(2)} u, ${(bd / 4).toFixed(1)} m from the corner`); }
