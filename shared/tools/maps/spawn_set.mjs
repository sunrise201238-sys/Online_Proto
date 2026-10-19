// A map json's spawns set to given points (units), each with the floor height the nav grid walks there; a point off the walked grid is refused.
// usage: node spawn_set.mjs <tree root> <json> x1,z1 x2,z2 [more...] [--random]
import { readFileSync, writeFileSync } from 'node:fs';
const [root, jsonFile, ...rest] = process.argv.slice(2); const random = rest.includes('--random'); const pts = rest.filter((a) => a !== '--random').map((a) => a.split(',').map(Number));
const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href; const { buildNavGrid } = await import(SIM + 'index.js');
const data = JSON.parse(readFileSync(jsonFile, 'utf8')); const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = buildNavGrid(data.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, floor } = g;
const at = (x, z) => { const c = Math.floor((x - minX) / cell), r = Math.floor((z - minZ) / cell); if (c < 0 || r < 0 || c >= cols || r >= rows) return null; let f = null; for (let l = 0; l < layers; l += 1) { const a = l * n + r * cols + c; if (walk[a] && (f == null || floor[a] > f)) f = floor[a]; } return f; };
const places = pts.map(([x, z]) => { const y = at(x, z); if (y == null) { console.error(`(${x}, ${z}) is off the walked grid`); process.exit(1); } console.log(`  (${x}, ${z}) floor ${y.toFixed(2)} u`); return { x, z, y: Math.round(y * 100) / 100 }; });
data.spawns = { p1: places[0], p2: places[1] }; if (places.length > 2) data.spawns.more = places.slice(2); if (random) data.spawns.pick = 'random';
writeFileSync(jsonFile, JSON.stringify(data)); console.log('spawns set:', JSON.stringify(data.spawns));
