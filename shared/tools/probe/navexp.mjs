// A nav grid variant tried on a map: walkable area, build time, paths from the first home to given model points, a plan of one level.
// usage: node navexp.mjs <tree> <map> <navgrid module> x,z,floorM ...
import { pathToFileURL } from 'node:url';
const [root, map, mod, ...pts] = process.argv.slice(2);
const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const N = await import(pathToFileURL(mod).href);
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const t0 = Date.now(); const g = N.buildNavGrid(arena.obstacles, surfaces); const dt = Date.now() - t0; const { cols, n, layers, minX, minZ, cell, walk, floor } = g;
let w = 0; for (let i = 0; i < walk.length; i += 1) if (walk[i]) w += 1;
console.log(`${mod.split('/').pop()}: grid ${cols}x${g.rows}x${layers} cell ${cell}, ${w} walkable nodes (${(w * cell * cell / 16).toFixed(0)} m2), built in ${dt} ms`);
const p1 = arena.spawns.p1;
for (const a of pts) { const [mx, mz, fM] = a.split(',').map(Number); const x = mx * 4, z = (mz - 1.34) * 4; const t1 = Date.now(); const path = N.findPathOnGrid(g, p1.x, p1.z, x, z, 0, fM * 4, arena.obstacles); console.log(`  p1 -> (${mx}, ${mz}) at ${fM} m: ${path ? path.length + ' nodes' : 'NO PATH'} (${Date.now() - t1} ms)`); }
const plan = (cx, cz, half, fM) => { const c0 = Math.floor((cx * 4 - minX) / cell), r0 = Math.floor(((cz - 1.34) * 4 - minZ) / cell); const hc = Math.ceil(half * 4 / cell); console.log(`plan around (${cx}, ${cz}) ±${half} m at ${fM} m (# walkable, . not), ${cell / 4} m per char`);
  for (let r = r0 - hc; r <= r0 + hc; r += 1) { let row = ''; for (let c = c0 - hc; c <= c0 + hc; c += 1) { let ch = '.'; for (let l = 0; l < layers; l += 1) { const i = l * n + r * cols + c; if (walk[i] && Math.abs(floor[i] - fM * 4) <= 3) ch = '#'; } row += ch; } console.log(`${((minZ + (r + 0.5) * cell) / 4 + 1.34).toFixed(2).padStart(7)} ${row}`); } };
plan(-24, 8, 14, 6.91);
