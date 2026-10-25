// What the sim reads at a model point, from a generator json: the floor under a body set down at a height, and the boxes in its way there.
// usage: node sim_probe.mjs <tree> <json> <feetM> x,z ...   (x, z in the served model's metres; cz 1.34)
const [root, jf, feetM, ...pts] = process.argv.slice(2);
import { readFileSync } from 'node:fs';
const SIM = new URL(root.replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href; const { groundHeightAt } = await import(SIM + 'index.js');
const d = JSON.parse(readFileSync(jf, 'utf8')); const surfaces = d.surfaces.map((s) => ({ ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
for (const p of pts) { const [mx, mz] = p.split(',').map(Number); const x = mx * 4, z = (mz - 1.34) * 4; const feet = Number(feetM) * 4;
  const g = groundHeightAt(x, z, surfaces, feet); const inWay = d.obstacles.filter((o) => o.minX <= x && x <= o.maxX && o.minZ <= z && z <= o.maxZ && o.maxY > g + 2.6 && (o.minY ?? 0) < g + 9.8);
  console.log(`(${mx}, ${mz}) feet ${feetM} m -> floor ${(g / 4).toFixed(2)} m; boxes in the body's way there: ${inWay.length ? inWay.map((o) => `y ${((o.minY ?? 0) / 4).toFixed(2)}..${(o.maxY / 4).toFixed(2)}`).join(', ') : 'none'}`); }
