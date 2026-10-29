// A map json's spawns set to given points (units), each with the floor height the nav grid walks there; a point off the walked grid is refused.
// `--bounds hx,hz` adds the arena's boundary walls (MAP_BOUNDARY) as the game does, so the grid covers the street out to the red edge
// (without them the grid ends at the last modelled thing, and a point on the open street beyond it was refused, 2026-10-22).
// usage: node spawn_set.mjs <tree root> <json> x1,z1 x2,z2 [more...] [--random] [--bounds hx,hz]
import { readFileSync, writeFileSync } from 'node:fs';
const [root, jsonFile, ...rest] = process.argv.slice(2); const random = rest.includes('--random'); const bi = rest.indexOf('--bounds'); const bounds = bi >= 0 ? rest[bi + 1].split(',').map(Number) : null;
const pts = rest.filter((a, i) => a !== '--random' && a !== '--bounds' && i !== bi + 1).map((a) => a.split(',').map(Number));
const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href; const { buildNavGrid, groundHeightAt } = await import(SIM + 'index.js');
const data = JSON.parse(readFileSync(jsonFile, 'utf8')); const surfaces = (data.surfaces ?? []).map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const walls = bounds ? [{ minX: -bounds[0] - 4, maxX: -bounds[0], minZ: -bounds[1], maxZ: bounds[1] }, { minX: bounds[0], maxX: bounds[0] + 4, minZ: -bounds[1], maxZ: bounds[1] }, { minX: -bounds[0], maxX: bounds[0], minZ: -bounds[1] - 4, maxZ: -bounds[1] }, { minX: -bounds[0], maxX: bounds[0], minZ: bounds[1], maxZ: bounds[1] + 4 }].map((b) => ({ ...b, minY: 0, maxY: 40 })) : [];
const g = buildNavGrid([...data.obstacles, ...walls], surfaces); const { cols, rows, minX, minZ, cell, cellStart, floor } = g;
const at = (x, z) => { const c = Math.floor((x - minX) / cell), r = Math.floor((z - minZ) / cell); if (c < 0 || r < 0 || c >= cols || r >= rows) return null; let f = null; const i = r * cols + c; for (let a = cellStart[i], e = cellStart[i + 1]; a < e; a += 1) if (f == null || floor[a] > f) f = floor[a]; return f; };   // (the cell's nodes: the grid's list form)
const places = pts.map(([x, z]) => { const y = at(x, z); if (y == null) { console.error(`(${x}, ${z}) is off the walked grid`); process.exit(1); } const g = groundHeightAt(x, z, surfaces, y); console.log(`  (${x}, ${z}) floor ${g.toFixed(2)} u`); return { x, z, y: Math.round(g * 100) / 100 }; });   // (the sim's own ground at the point, not the grid cell's: a sloped floor differs by centimetres, and the spawn test wants the exact floor)
data.spawns = { p1: places[0], p2: places[1] }; if (places.length > 2) data.spawns.more = places.slice(2); if (random) data.spawns.pick = 'random';
writeFileSync(jsonFile, JSON.stringify(data)); console.log('spawns set:', JSON.stringify(data.spawns));
