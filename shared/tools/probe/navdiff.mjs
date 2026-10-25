// The nodes a nav grid variant adds over the current grid: by floor height, how many have their centre point inside a box (a node in a wall), and a plan.
import { pathToFileURL } from 'node:url';
const [root, map, modA, modB, planAt] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const C = await import(SIM + 'constants.js');
const NA = await import(pathToFileURL(modA).href), NB = await import(pathToFileURL(modB).href);
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const ga = NA.buildNavGrid(arena.obstacles, surfaces), gb = NB.buildNavGrid(arena.obstacles, surfaces); const { cols, rows, n, minX, minZ, cell } = gb; const GB = C.GROUND_BASE_Y;
const inBox = (x, y, z) => arena.obstacles.some((o) => o.minX <= x && x <= o.maxX && o.minZ <= z && z <= o.maxZ && (o.minY ?? 0) < y + 2 && o.maxY > y - GB + 2.6);
const walkableAt = (g, i, h) => { for (let l = 0; l < g.layers; l += 1) { const k = l * g.n + i; if (g.walk[k] && Math.abs(g.floor[k] - h) <= 1) return true; } return false; };
const added = []; const byH = new Map(); let inWall = 0;
for (let i = 0; i < n; i += 1) for (let l = 0; l < gb.layers; l += 1) { const k = l * n + i; if (!gb.walk[k]) continue; const h = gb.floor[k]; if (walkableAt(ga, i, h)) continue;
  const x = minX + ((i % cols) + 0.5) * cell, z = minZ + (((i / cols) | 0) + 0.5) * cell; const wall = inBox(x, h + GB, z); if (wall) inWall += 1; added.push({ i, h, wall }); const hk = (Math.round(h / 2) * 2 / 4).toFixed(1); byH.set(hk, (byH.get(hk) ?? 0) + 1); }
console.log(`${map}: ${added.length} nodes added; by floor height (m): ${[...byH.entries()].sort((a, b) => a[0] - b[0]).map(([h, c]) => `${h}:${c}`).join(' ')}; centre inside a box: ${inWall}`);
if (planAt) { const H = Number(planAt) * 4; console.log(`plan of the level at ${planAt} m: # walkable in both, + added (centre clear), x added (centre in a box), . none`);
  const set = new Map(added.filter((a) => Math.abs(a.h - H) <= 2).map((a) => [a.i, a.wall]));
  for (let r = 0; r < rows; r += 1) { let row = ''; let any = false; for (let c = 0; c < cols; c += 1) { const i = r * cols + c; let ch = '.'; if (set.has(i)) { ch = set.get(i) ? 'x' : '+'; any = true; } else if (walkableAt(gb, i, H)) { ch = '#'; any = true; } row += ch; } if (any) console.log(`${((minZ + (r + 0.5) * cell) / 4).toFixed(1).padStart(7)} ${row}`); } }
