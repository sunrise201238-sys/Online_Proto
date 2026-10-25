// Routes from the first home to every other spawn place, under two nav grid variants: node counts side by side.
import { pathToFileURL } from 'node:url';
const [root, modA, modB, ...maps] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js');
const NA = await import(pathToFileURL(modA).href), NB = await import(pathToFileURL(modB).href);
for (const map of maps) { const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
  const ga = NA.buildNavGrid(arena.obstacles, surfaces), gb = NB.buildNavGrid(arena.obstacles, surfaces); const sp = arena.spawns; const places = [sp.p2, ...(sp.more ?? [])]; const out = [];
  for (const p of places) { const f1 = (sp.p1.y ?? 2.45) - 2.45, f2 = (p.y ?? 2.45) - 2.45; const a = NA.findPathOnGrid(ga, sp.p1.x, sp.p1.z, p.x, p.z, f1, f2, arena.obstacles), b = NB.findPathOnGrid(gb, sp.p1.x, sp.p1.z, p.x, p.z, f1, f2, arena.obstacles); out.push(`${a ? a.length : '-'}/${b ? b.length : '-'}`); }
  console.log(`${map.padEnd(11)} ${out.join(' ')}`); }
