// The nav grid at given model points, and paths to them. usage: node navprobe.mjs <tree> <map> "sx,sz[,sfloorM]" ... -- "tx,tz[,tfloorM]" ...   (model metres; cz 1.34)
import { pathToFileURL } from 'node:url';
const [root, map, ...rest] = process.argv.slice(2); const sep = rest.indexOf('--'); const starts = rest.slice(0, sep), targets = rest.slice(sep + 1);
const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const N = await import(SIM + 'navgrid.js');
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = N.buildNavGrid(arena.obstacles, surfaces); const { cols, rows, n, layers, minX, minZ, cell, walk, floor } = g;
console.log(`grid ${cols}x${rows}x${layers} cell ${cell} u; keys: ${Object.keys(g).join(' ')}`);
const toA = (s) => { const [mx, mz, fm] = s.split(',').map(Number); return { x: mx * 4, z: (mz - 1.34) * 4, f: Number.isFinite(fm) ? fm * 4 : null, label: s }; };
const cellOf = (x, z) => [Math.floor((x - minX) / cell), Math.floor((z - minZ) / cell)];
const describe = (p) => { const [c, r] = cellOf(p.x, p.z); const out = []; for (let l = 0; l < layers; l += 1) { const i = l * n + r * cols + c; out.push(`L${l}: walk=${walk[i]} floor=${Number.isFinite(floor[i]) ? (floor[i] / 4).toFixed(2) + ' m' : floor[i]}`); } return `cell (${c},${r}) ` + out.join(' | '); };
for (const t of [...starts, ...targets].map(toA)) console.log(`${t.label}: ${describe(t)}`);
for (const s of starts.map(toA)) for (const t of targets.map(toA)) {
  for (const [sf, tf, tag] of [[s.f, t.f, 'floors given'], [null, null, 'no floors']]) { const path = N.findPathOnGrid(g, s.x, s.z, t.x, t.z, sf, tf, arena.obstacles); console.log(`  ${s.label} -> ${t.label} (${tag}): ${path ? path.length + ' nodes, last ' + JSON.stringify(path[path.length - 1]) : 'NO PATH'}`); } }
// a plan of the cells with a walkable layer near a floor height, around a point
const plan = (cx, cz, half, fM) => { const [c0, r0] = cellOf(cx * 4, (cz - 1.34) * 4); const hc = Math.ceil(half * 4 / cell); console.log(`plan around (${cx}, ${cz}) ±${half} m at ${fM} m (# walkable within 0.75 m of it, = a layer there but not walkable, . other); x → east, rows ↓ south (z up)`);
  for (let r = r0 - hc; r <= r0 + hc; r += 1) { let row = ''; for (let c = c0 - hc; c <= c0 + hc; c += 1) { let ch = '.'; for (let l = 0; l < layers; l += 1) { const i = l * n + r * cols + c; if (Number.isFinite(floor[i]) && Math.abs(floor[i] - fM * 4) <= 3) ch = walk[i] ? '#' : (ch === '#' ? '#' : '='); } row += ch; } console.log(`${((minZ + (r + 0.5) * cell) / 4 + 1.34).toFixed(2).padStart(7)} ${row}`); }
  console.log(`        x from ${((minX + (c0 - hc) * cell) / 4).toFixed(2)} to ${((minX + (c0 + hc + 1) * cell) / 4).toFixed(2)}, one char = ${cell / 4} m`); };
plan(-25.6, 12.92, 5, 6.91); plan(-25.6, 0, 6, 6.91);
