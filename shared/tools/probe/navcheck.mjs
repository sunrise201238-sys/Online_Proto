// The nav grid of a spliced map: walkable cells, and a path from the first home to every other spawn place. usage: node navcheck.mjs <tree root> <map>
import { pathToFileURL } from 'node:url';
const [root, map] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href;
const A = await import(SIM + 'arena.js'); const N = await import(SIM + 'navgrid.js');
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const t0 = Date.now(); const g = N.buildNavGrid(arena.obstacles, surfaces); const dt = Date.now() - t0;
let walk = 0; for (let i = 0; i < g.walk.length; i += 1) if (g.walk[i]) walk += 1;
console.log(`${map}: ${arena.obstacles.length} boxes, ${arena.surfaces.length} floors; grid ${g.cols}x${g.rows}x${g.layers} cell ${g.cell}, ${walk} walkable cells (${(walk * g.cell * g.cell / 16).toFixed(0)} m2), built in ${dt} ms`);
const sp = arena.spawns; const places = [sp.p1, sp.p2, ...(sp.more ?? [])];
for (let i = 1; i < places.length; i += 1) { const p = places[i]; const path = N.findPathOnGrid(g, sp.p1.x, sp.p1.z, p.x, p.z, null, null, arena.obstacles); console.log(`  p1 (${sp.p1.x}, ${sp.p1.z}) -> (${p.x}, ${p.z}): ${path ? path.length + ' nodes' : 'NO PATH'}`); }
