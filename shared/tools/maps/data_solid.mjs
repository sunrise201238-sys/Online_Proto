// A thing's boxes made solid: every box of the reading's data whose plan lies half or more inside a window (model metres,
// x0,x1,z0,z1) and whose top is over h metres (over the street, as the F4 line and the other data tools give heights) becomes a
// wall standing from the street — no topBuffer (the default 4: a body neither stands nor steps on it), its bottom brought down to
// the street (0) when it was higher, its plan as it was — and the floors and slopes lying half or more inside the window with
// their top over h go: no body stands on the thing, walks under it or through it, and a round stops at it. Made for Town's yellow
// tanker truck (user 2026-11-04, of the F4 view of its boxes: "Make the whole cboxes of this vehicle un-walkable for units.
// Currently bullets and unit can go through some of its cboxes. No need adjusting the shape of cboxes for this one."; then
// "Flags + bottoms"): its 110 boxes were the reading's thin slices, 105 of them with a floor on top a body stepped onto, and
// the tank's belly between the wheels started over a body's head height, so units walked under it and rounds flew under it.
// A run again over the output changes nothing. The transform: scale,cx,cz as the client's GLB_MAPS line has them
// (arena = (model - c) * scale), or `-` for the input's own `transform`.
// usage: node data_solid.mjs <in.json> <scale,cx,cz|-> <x0,x1,z0,z1> <h> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, tS, winS, hS, outF] = process.argv.slice(2);
if (!outF) { console.error('usage: node data_solid.mjs <in.json> <scale,cx,cz|-> <x0,x1,z0,z1> <h> <out.json>'); process.exit(2); }
const nums = (str, n, what) => { const t = String(str).split(',').map((x) => x.trim()); const v = t.map(Number);
  if (t.length !== n || t.some((x) => x === '') || v.some((x) => !Number.isFinite(x))) throw new Error(`${what}: ${n} number${n === 1 ? '' : 's'} — ${str}`); return v; };
const D = JSON.parse(readFileSync(inF, 'utf8'));
const T = tS === '-' ? D.transform : (([scale, cx, cz]) => ({ scale, cx, cz }))(nums(tS, 3, 'the transform scale,cx,cz'));
if (!T || ![T.scale, T.cx, T.cz].every(Number.isFinite)) throw new Error('the transform: scale,cx,cz (or - with a transform in the input)');
const s = T.scale; const [x0, x1, z0, z1] = nums(winS, 4, 'the window x0,x1,z0,z1'); const h = nums(hS, 1, 'h (metres)')[0] * s;
if (!(x1 > x0 && z1 > z0)) throw new Error('the window: x0 < x1 and z0 < z1');
const W = { minX: (x0 - T.cx) * s, maxX: (x1 - T.cx) * s, minZ: (z0 - T.cz) * s, maxZ: (z1 - T.cz) * s };
// the share of a plan inside the window (one rectangle: exact)
const share = (e) => { const w = e.maxX - e.minX, d = e.maxZ - e.minZ;
  if (!(w > 0 && d > 0)) { const x = (e.minX + e.maxX) / 2, z = (e.minZ + e.maxZ) / 2; return x >= W.minX && x <= W.maxX && z >= W.minZ && z <= W.maxZ ? 1 : 0; }
  return Math.max(0, Math.min(e.maxX, W.maxX) - Math.max(e.minX, W.minX)) * Math.max(0, Math.min(e.maxZ, W.maxZ) - Math.max(e.minZ, W.minZ)) / (w * d); };
const topOf = (e) => (e.type === 'plane' ? Math.max(e.y0, e.y0 + e.gx * (e.maxX - e.minX), e.y0 + e.gz * (e.maxZ - e.minZ), e.y0 + e.gx * (e.maxX - e.minX) + e.gz * (e.maxZ - e.minZ))
  : e.type === 'flat' ? (e.top ?? e.maxTop) : e.type ? (e.maxTop ?? e.top) : e.maxY);
const tally = { walls: 0, bottoms: 0, flat: 0, plane: 0 };
const obstacles = D.obstacles.map((o) => { if (!(share(o) >= 0.5 && o.maxY > h)) return o;
  const { topBuffer, ...rest } = o; if (topBuffer != null) tally.walls += 1; if (rest.minY > 0) { rest.minY = 0; tally.bottoms += 1; } return rest; });
const surfaces = D.surfaces.filter((e) => { if (!(share(e) >= 0.5 && topOf(e) > h)) return true; tally[e.type === 'plane' ? 'plane' : 'flat'] += 1; return false; });
const boxes = obstacles.filter((o) => share(o) >= 0.5 && o.maxY > h).length;
writeFileSync(outF, JSON.stringify({ ...D, obstacles, surfaces }));
console.log(`${boxes} boxes in the window: ${tally.walls} made walls, ${tally.bottoms} brought down to the street; out: ${tally.flat} floors, ${tally.plane} slopes -> ${obstacles.length} boxes, ${surfaces.length} surfaces, ${outF}`);
