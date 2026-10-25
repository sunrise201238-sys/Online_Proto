import { pathToFileURL } from 'node:url';
const [root, mod, ...maps] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const N = await import(pathToFileURL(mod).href);
for (const map of maps) { try { const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
  const t0 = Date.now(); const g = N.buildNavGrid(arena.obstacles, surfaces); const dt = Date.now() - t0; let w = 0; for (let i = 0; i < g.walk.length; i += 1) if (g.walk[i]) w += 1; console.log(`${map}\t${w}\t${dt}`); } catch (e) { console.log(`${map}\tERR ${String(e).slice(0, 60)}`); } }
