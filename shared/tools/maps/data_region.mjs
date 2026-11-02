// A map's data with one rectangle read afresh and everything else kept as it was: the boxes and the floors of <with.json> inside
// the rectangle (model metres, x0,x1,z0,z1), those of <base.json> outside it; an entry across the rectangle's edge cut along it
// (a box or a flat floor into rectangles, a slope's y0 and maxTop read again for each piece). Both files the solid reading's
// output for the same map (the same transform and crop). Made for Neon's scaffold copy (user 2026-11-02): the solid reading of
// the model with the copy re-cut the boxes and floors of the ORIGINAL scaffold where the copy touches it — its boxes are grown
// largest-first over the whole map and the flood fills a gap a body cannot pass, so the two touch in the cells — and the
// original's walls opened a 14 cm slot at their bottom rail's top; the copy's rectangle alone is taken from that reading, the
// rest of the map is the reading it had. usage: node data_region.mjs <base.json> <with.json> <x0,x1,z0,z1> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [baseF, withF, rectS, outF] = process.argv.slice(2);
const base = JSON.parse(readFileSync(baseF, 'utf8')), wth = JSON.parse(readFileSync(withF, 'utf8'));
const T = base.transform, s = T.scale; if (JSON.stringify(T) !== JSON.stringify(wth.transform) || base.halfX !== wth.halfX || base.halfZ !== wth.halfZ) throw new Error('not the same map crop');
const [x0, x1, z0, z1] = rectS.split(',').map(Number); const du = (v) => Math.round(v * 1e6) / 1e6;   // (the data's own units, to a micrometre: cx −12.439999999999998 put 3.56 at 63.99999999999999, a sliver off a box ending at 64)
const R = { minX: du((x0 - T.cx) * s), maxX: du((x1 - T.cx) * s), minZ: du((z0 - T.cz) * s), maxZ: du((z1 - T.cz) * s) };
const piece = (e, minX, maxX, minZ, maxZ) => {   // e cut to the rectangle; a slope keeps its plane: y0 at the new corner, maxTop over the piece
  if (!(maxX > minX && maxZ > minZ)) return null; if (minX === e.minX && maxX === e.maxX && minZ === e.minZ && maxZ === e.maxZ) return e;
  const p = { ...e, minX, maxX, minZ, maxZ };
  if (e.type === 'plane') { const h = (x, z) => e.y0 + e.gx * (x - e.minX) + e.gz * (z - e.minZ); p.y0 = h(minX, minZ); p.maxTop = Math.max(h(minX, minZ), h(maxX, minZ), h(minX, maxZ), h(maxX, maxZ)); }
  return p; };
const inside = (e) => piece(e, Math.max(e.minX, R.minX), Math.min(e.maxX, R.maxX), Math.max(e.minZ, R.minZ), Math.min(e.maxZ, R.maxZ));
const outside = (e) => { if (e.maxX <= R.minX || e.minX >= R.maxX || e.maxZ <= R.minZ || e.minZ >= R.maxZ) return [e];   // (wholly outside: as it was)
  const ix0 = Math.max(e.minX, R.minX), ix1 = Math.min(e.maxX, R.maxX);
  return [piece(e, e.minX, R.minX, e.minZ, e.maxZ), piece(e, R.maxX, e.maxX, e.minZ, e.maxZ), piece(e, ix0, ix1, e.minZ, R.minZ), piece(e, ix0, ix1, R.maxZ, e.maxZ)].filter(Boolean); };
const out = { ...base, obstacles: [], surfaces: [] }; const n = { keptBase: 0, cutBase: 0, takenWith: 0, cutWith: 0 };
for (const k of ['obstacles', 'surfaces']) {
  for (const e of base[k]) { const ps = outside(e); if (ps.length === 1 && ps[0] === e) n.keptBase += 1; else n.cutBase += 1; out[k].push(...ps); }
  for (const e of wth[k]) { const p = inside(e); if (!p) continue; if (p === e) n.takenWith += 1; else n.cutWith += 1; out[k].push(p); } }
writeFileSync(outF, JSON.stringify(out));
console.log(`x ${x0}..${x1} z ${z0}..${z1} from ${withF}, the rest from ${baseF}: ${n.keptBase} entries kept as they were, ${n.cutBase} cut along the edge, ${n.takenWith} taken whole and ${n.cutWith} cut from the new reading -> ${out.obstacles.length} boxes, ${out.surfaces.length} floors, ${outF}`);
