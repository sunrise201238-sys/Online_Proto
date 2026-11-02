// A map's data with one rectangle read afresh and everything else kept as it was: the boxes and the floors of <with.json> inside
// the rectangle (model metres, x0,x1,z0,z1), those of <base.json> outside it; an entry across the rectangle's edge cut along it
// (a box or a flat floor into rectangles, a slope's y0 and maxTop read again for each piece). Both files the solid reading's
// output for the same map (the same transform and crop). Made for Neon's scaffold copy (user 2026-11-02): the solid reading of
// the model with the copy re-cut the boxes and floors of the ORIGINAL scaffold where the copy touches it — its boxes are grown
// largest-first over the whole map and the flood fills a gap a body cannot pass, so the two touch in the cells — and the
// original's walls opened a 14 cm slot at their bottom rail's top; the copy's rectangle alone is taken from that reading, the
// rest of the map is the reading it had.
// An optional height band, h0,h1 (metres over the street), makes the rectangle a box: a box entry is cut at the band's floor and
// ceiling too, and a floor is the new reading's when its height is in the band, the old one's otherwise (a slope across the band's
// edge is refused). Neon's scaffold edits (user 2026-11-02, the catwalk between the two walkways at 8.6 m): the new reading had
// re-cut the wall under the catwalk's end, 8 m below it, so the catwalk's rectangle is taken from 7.5 m up only.
// `none` for <with.json> empties the rectangle: nothing taken, the old reading's boxes and floors in it cut away (Neon's sign over
// the green container, user 2026-11-02: "these few cboxes should be as high as the container").
// usage: node data_region.mjs <base.json> <with.json|none> <x0,x1,z0,z1[,h0,h1]> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [baseF, withF, rectS, outF] = process.argv.slice(2);
const base = JSON.parse(readFileSync(baseF, 'utf8')), wth = withF === 'none' ? { ...base, obstacles: [], surfaces: [] } : JSON.parse(readFileSync(withF, 'utf8'));
const T = base.transform, s = T.scale; if (JSON.stringify(T) !== JSON.stringify(wth.transform) || base.halfX !== wth.halfX || base.halfZ !== wth.halfZ) throw new Error('not the same map crop');
const nums = rectS.split(',').map(Number); if (!(nums.length === 4 || nums.length === 6) || nums.some((v) => !Number.isFinite(v))) throw new Error('the rectangle: x0,x1,z0,z1 or x0,x1,z0,z1,h0,h1');
const [x0, x1, z0, z1, h0, h1] = nums; const du = (v) => Math.round(v * 1e6) / 1e6;   // (the data's own units, to a micrometre: cx −12.439999999999998 put 3.56 at 63.99999999999999, a sliver off a box ending at 64)
const R = { minX: du((x0 - T.cx) * s), maxX: du((x1 - T.cx) * s), minZ: du((z0 - T.cz) * s), maxZ: du((z1 - T.cz) * s), minY: nums.length === 6 ? du(h0 * s) : -Infinity, maxY: nums.length === 6 ? du(h1 * s) : Infinity };
if (!(R.maxX > R.minX && R.maxZ > R.minZ && R.maxY > R.minY)) throw new Error('an empty rectangle');
// ---- the boxes: cut in x, z and y (a box of no height — the reading keeps some, a top to stand on — goes by its one height)
const overlapsXZ = (e) => !(e.maxX <= R.minX || e.minX >= R.maxX || e.maxZ <= R.minZ || e.minZ >= R.maxZ);
const yIn = (e) => (e.maxY > e.minY ? e.maxY > R.minY && e.minY < R.maxY : e.minY >= R.minY && e.minY < R.maxY);
const boxPiece = (e, minX, maxX, minZ, maxZ, minY, maxY) => { if (!(maxX > minX && maxZ > minZ && maxY >= minY)) return null;
  if (minX === e.minX && maxX === e.maxX && minZ === e.minZ && maxZ === e.maxZ && minY === e.minY && maxY === e.maxY) return e; return { ...e, minX, maxX, minZ, maxZ, minY, maxY }; };
const boxInside = (e) => { if (!yIn(e)) return null; const flat = !(e.maxY > e.minY);
  return boxPiece(e, Math.max(e.minX, R.minX), Math.min(e.maxX, R.maxX), Math.max(e.minZ, R.minZ), Math.min(e.maxZ, R.maxZ), flat ? e.minY : Math.max(e.minY, R.minY), flat ? e.maxY : Math.min(e.maxY, R.maxY)); };
const boxOutside = (e) => { if (!overlapsXZ(e) || !yIn(e)) return [e];   // (wholly outside: as it was)
  const ix0 = Math.max(e.minX, R.minX), ix1 = Math.min(e.maxX, R.maxX), iz0 = Math.max(e.minZ, R.minZ), iz1 = Math.min(e.maxZ, R.maxZ);
  return [boxPiece(e, e.minX, R.minX, e.minZ, e.maxZ, e.minY, e.maxY), boxPiece(e, R.maxX, e.maxX, e.minZ, e.maxZ, e.minY, e.maxY),
    boxPiece(e, ix0, ix1, e.minZ, R.minZ, e.minY, e.maxY), boxPiece(e, ix0, ix1, R.maxZ, e.maxZ, e.minY, e.maxY),
    R.minY > e.minY ? boxPiece(e, ix0, ix1, iz0, iz1, e.minY, R.minY) : null, e.maxY > R.maxY ? boxPiece(e, ix0, ix1, iz0, iz1, R.maxY, e.maxY) : null].filter(Boolean); };
// ---- the floors: cut in x and z; with a band, a floor goes with its height
const piece = (e, minX, maxX, minZ, maxZ) => {   // e cut to the rectangle; a slope keeps its plane: y0 at the new corner, maxTop over the piece
  if (!(maxX > minX && maxZ > minZ)) return null; if (minX === e.minX && maxX === e.maxX && minZ === e.minZ && maxZ === e.maxZ) return e;
  const p = { ...e, minX, maxX, minZ, maxZ };
  if (e.type === 'plane') { const h = (x, z) => e.y0 + e.gx * (x - e.minX) + e.gz * (z - e.minZ); p.y0 = h(minX, minZ); p.maxTop = Math.max(h(minX, minZ), h(maxX, minZ), h(minX, maxZ), h(maxX, maxZ)); }
  return p; };
const inBand = (e) => { if (!Number.isFinite(R.minY) && !Number.isFinite(R.maxY)) return true; if (!overlapsXZ(e)) return false;
  const p = piece(e, Math.max(e.minX, R.minX), Math.min(e.maxX, R.maxX), Math.max(e.minZ, R.minZ), Math.min(e.maxZ, R.maxZ));   // (the height over the rectangle alone)
  let lo, hi; if (e.type === 'plane') { const h = (x, z) => p.y0 + p.gx * (x - p.minX) + p.gz * (z - p.minZ); const c = [h(p.minX, p.minZ), h(p.maxX, p.minZ), h(p.minX, p.maxZ), h(p.maxX, p.maxZ)]; lo = du(Math.min(...c)); hi = du(Math.max(...c)); } else { lo = hi = e.top; }   // (a slope's corners to the micrometre, as the band's edges are: a corner exactly on an edge came out an ulp under it — 17.799999999999997 for 17.8 — and its slope was refused as across the edge; review 2026-11-02)
  const a = lo >= R.minY && lo < R.maxY, b = hi >= R.minY && hi < R.maxY;
  if (a !== b || (lo < R.minY && hi >= R.maxY)) throw new Error(`a slope across the height band's edge (${(lo / s).toFixed(2)}..${(hi / s).toFixed(2)} m)`); return a; };
const inside = (e) => (inBand(e) ? piece(e, Math.max(e.minX, R.minX), Math.min(e.maxX, R.maxX), Math.max(e.minZ, R.minZ), Math.min(e.maxZ, R.maxZ)) : null);
const outside = (e) => { if (!overlapsXZ(e) || !inBand(e)) return [e];   // (wholly outside: as it was)
  const ix0 = Math.max(e.minX, R.minX), ix1 = Math.min(e.maxX, R.maxX);
  return [piece(e, e.minX, R.minX, e.minZ, e.maxZ), piece(e, R.maxX, e.maxX, e.minZ, e.maxZ), piece(e, ix0, ix1, e.minZ, R.minZ), piece(e, ix0, ix1, R.maxZ, e.maxZ)].filter(Boolean); };
const out = { ...base, obstacles: [], surfaces: [] }; const n = { keptBase: 0, cutBase: 0, takenWith: 0, cutWith: 0 };
for (const [k, IN, OUT] of [['obstacles', boxInside, boxOutside], ['surfaces', inside, outside]]) {
  for (const e of base[k]) { const ps = OUT(e); if (ps.length === 1 && ps[0] === e) n.keptBase += 1; else n.cutBase += 1; out[k].push(...ps); }
  for (const e of wth[k]) { const p = IN(e); if (!p) continue; if (p === e) n.takenWith += 1; else n.cutWith += 1; out[k].push(p); } }
writeFileSync(outF, JSON.stringify(out));
console.log(`x ${x0}..${x1} z ${z0}..${z1}${nums.length === 6 ? ` h ${h0}..${h1}` : ''} from ${withF}, the rest from ${baseF}: ${n.keptBase} entries kept as they were, ${n.cutBase} cut along the edge, ${n.takenWith} taken whole and ${n.cutWith} cut from the new reading -> ${out.obstacles.length} boxes, ${out.surfaces.length} floors, ${outF}`);
