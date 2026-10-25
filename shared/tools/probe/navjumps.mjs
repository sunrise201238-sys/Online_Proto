// Jump links of a map's nav grid under a grid module: count, and the list with both ends' positions and floors.
import { pathToFileURL } from 'node:url';
const [root, map, mod, filt] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const N = await import(pathToFileURL(mod).href);
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: () => s.top ?? s.maxTop }));
const g = N.buildNavGrid(arena.obstacles, surfaces); const { cols, n, minX, minZ, cell, floor } = g;
const pos = (node) => g.posX ? [g.posX[node], g.posZ[node]] : [minX + ((node % n) % cols + 0.5) * cell, minZ + (((node % n) / cols | 0) + 0.5) * cell];
const links = []; for (const [a, list] of g.jumpAdj) for (const b of (list instanceof Map ? [...list.keys()] : list)) { const bb = typeof b === 'object' ? b.node ?? b.to ?? b[0] : b; if (a < bb) links.push([a, bb]); }
console.log(`${mod.split('/').pop()}: ${g.jumpLinkCount} jump links (${links.length} pairs); jumpAdj value sample: ${JSON.stringify([...g.jumpAdj.values()][0]).slice(0, 120)}`);
const [zlo, zhi] = filt ? filt.split(',').map(Number) : [-Infinity, Infinity];
const rows = links.map(([a, b]) => { const [ax, az] = pos(a), [bx, bz] = pos(b); return { ax, az, af: floor[a], bx, bz, bf: floor[b] }; }).filter((r) => Math.min(r.az, r.bz) < zhi && Math.max(r.az, r.bz) > zlo).sort((p, q) => p.ax - q.ax || p.az - q.az);
for (const r of rows) console.log(`  (${r.ax.toFixed(0)}, ${r.az.toFixed(0)}) ${r.af.toFixed(0)} <-> (${r.bx.toFixed(0)}, ${r.bz.toFixed(0)}) ${r.bf.toFixed(0)}`);
