// Why a nav cell is or is not walkable at a floor. usage: node navprobe3.mjs <tree> <map> x,z,floorM ...  (model metres)
import { pathToFileURL } from 'node:url';
const [root, map, ...pts] = process.argv.slice(2);
const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const N = await import(SIM + 'navgrid.js'); const P = await import(SIM + 'physics.js'); const C = await import(SIM + 'constants.js');
const arena = A.getArena(map); const surfaces = arena.surfaces.map((s) => (s.heightAt ? s : { ...s, heightAt: s.type === 'plane' ? (x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : () => s.top }));
const g = N.buildNavGrid(arena.obstacles, surfaces); const { cols, n, layers, minX, minZ, cell, walk, floor } = g; const GB = C.GROUND_BASE_Y;
const mX = (x) => (x / 4).toFixed(2), mZ = (z) => (z / 4 + 1.34).toFixed(2);
for (const a of pts) { const [mx, mz, fM] = a.split(',').map(Number); const x = mx * 4, z = (mz - 1.34) * 4; const c = Math.floor((x - minX) / cell), r = Math.floor((z - minZ) / cell); const cx = minX + (c + 0.5) * cell, cz = minZ + (r + 0.5) * cell;
  const Ls = []; for (let l = 0; l < layers; l += 1) { const i = l * n + r * cols + c; Ls.push(`${(floor[i] / 4).toFixed(2)}${walk[i] ? '✓' : '✗'}`); }
  const covering = surfaces.filter((s) => cx >= s.minX && cx <= s.maxX && cz >= s.minZ && cz <= s.maxZ).map((s) => (s.heightAt(cx, cz) / 4).toFixed(2));
  const hits = arena.obstacles.filter((o) => P.unitOverlapsObstacle(cx, fM * 4 + GB, cz, [o])).map((o) => `[x ${mX(o.minX)}..${mX(o.maxX)} z ${mZ(o.minZ)}..${mZ(o.maxZ)} y ${((o.minY ?? 0) / 4).toFixed(2)}..${(o.maxY / 4).toFixed(2)}]`);
  console.log(`(${mx}, ${mz}) centre (${mX(cx)}, ${mZ(cz)}) layers ${Ls.join(' ')} | surfaces: ${covering.join(' ') || 'none'} | body at ${fM} m hits ${hits.length ? hits.join(' ') : 'nothing'}`); }
