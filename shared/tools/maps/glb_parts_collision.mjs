// Collision for a model built of parts — a Roblox map through Sketchfab, one node per brick — read part by part, not by
// the cell (glb_collision.mjs reads triangles into a plan of 0.25 m cells with one floor per cell, so a storey over a
// storey, a ramp under a ramp, cannot be: District's car park, stairwells and station; user 2026-10-29, "use simple c
// boxes in this map, simple geometries, no stacked small boxes mimicking the shape of small objects"). Each part is one
// box — its world-space bounds, however it is turned — and the box's top is a floor (a surface, so a body stands on it,
// and the box holds no body stepping onto it) where the top is wide enough for a body; a part with a sloped top (a
// Roblox wedge: a ramp, a flight) is one plane surface over its footprint and no box, so the slope is walked and the
// space under it is passed. Storeys stack: the sim's ground rule takes the highest surface within a step of the feet.
// Left out: what is smaller than MIN_SIZE every way (bolts, knobs), what lies more than BELOW metres under the street
// (the model's hidden plates, a minigame cellar), what stands outside the crop. usage:
//   SCALE=4 GROUND=0.55 node glb_parts_collision.mjs <glb (metres)> <key> <x0> <x1> <z0> <z1> <outDir>
//   env: SCALE (units per metre) GROUND (the street's y in the model) MIN_SIZE=0.3 LID_MIN=0.6 (a top at least this
//   wide and long is a floor) LID_AREA=20 (a top smaller than this many m² is a thing's lid, larger a floor) BELOW=7
//   EXCLUDE= (node name prefixes left out, comma-separated) PIECES=1 (each separable piece of a mesh a part; a piece that is
//   no brick — big, hollow, or sloped on top — is read face by face, THE SHAPES below) FACES= (node name prefixes read face by
//   face whatever they are: the ground) TRACE= (rectangles of the model's metres: every box made there is printed with its part)
// The json is the generator's shape — key, transform, halfX, halfZ, spawns (spawn_set.mjs fills them), obstacles,
// surfaces — so spawn_set.mjs and data_splice.py take it as they take the generator's.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readGlb, accessor, worlds } from './glb_read.mjs';
const [inF, key, X0, X1, Z0, Z1, outDir] = process.argv.slice(2); const x0 = Number(X0), x1 = Number(X1), z0 = Number(Z0), z1 = Number(Z1);
const SCALE = Number(process.env.SCALE ?? 4), GROUND = Number(process.env.GROUND ?? 0), MIN_SIZE = Number(process.env.MIN_SIZE ?? 0.3), LID_MIN = Number(process.env.LID_MIN ?? 0.6), LID_AREA = Number(process.env.LID_AREA ?? 20), BELOW = Number(process.env.BELOW ?? 7);
const EXCLUDE = (process.env.EXCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CUT = new Set((process.env.CUT ?? '').split(',').map((s) => s.trim()).filter(Boolean));   // (CUT: parts read cut into half-metre lengths along their long axis — a brick set diagonally, see readPart)
const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const halfX = ((x1 - x0) / 2) * SCALE, halfZ = ((z1 - z0) / 2) * SCALE;
const ax = (x) => Math.round((x - cx) * SCALE * 100) / 100, az = (z) => Math.round((z - cz) * SCALE * 100) / 100, ay = (y) => Math.round((y - GROUND) * SCALE * 100) / 100;
const g = readGlb(inF); const J = g.json; const W = worlds(J);
const STEP = 0.65;   // (the sim's SURFACE_STEP_HEIGHT, 2.6 units: a box no taller than this is stepped onto, so its top is a surface)
const STEPU = STEP * SCALE;
const MASS_AREA = Number(process.env.MASS_AREA ?? 200);   // (m²: a block of earth this big, a metre thick, topping at the street or under it, is its top alone)
const MAX_GRADE = Number(process.env.MAX_GRADE ?? 1.5);
const CEIL = Number(process.env.CEIL ?? Infinity);   // (metres over the street: a part or a face whose bottom lies over it is nothing — Town's roofs from 11 m up and the parapets at 22 m, where no body ever stands; the default keeps everything)   // (a sloped face steeper than this rise per metre is no ramp: the part is a box)
const obstacles = [], surfaces = []; const n = { parts: 0, out: 0, tiny: 0, below: 0, excluded: 0, boxes: 0, lids: 0, lowLids: 0, floors: 0, ramps: 0, steep: 0, sheets: 0, markings: 0, panes: 0, mass: 0, invisible: 0, faceFloors: 0, faceWalls: 0, faceSlopes: 0, flightPieces: 0, faceBlocks: 0, landings: 0, splitWalls: 0, shapes: 0, flights: 0, flightTreads: 0, above: 0, columnWalls: 0, roofs: 0, splits: 0, crowns: 0, rampWalls: 0, cut: 0 };
const fit = (pts) => { // y = a + b x + c z, least squares; returns [a, b, c, rms]
  let sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0; const m = pts.length; for (const [x, y, z] of pts) { sx += x; sz += z; sy += y; sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y; }
  const A = [[m, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], B = [sy, sxy, szy]; // solve 3x3 by Cramer
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-9) return null; const col = (k) => A.map((r, i) => r.map((v, j) => (j === k ? B[i] : v)));
  const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D; let e = 0; for (const [x, y, z] of pts) e += (a + b * x + c * z - y) ** 2; return [a, b, c, Math.sqrt(e / m)]; };
const alphaOf = (mi) => (J.materials?.[mi]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])[3];
// THE PARTS (2026-10-29, the third day; user: "remake the Town c-boxes, the same simplified procedure District has"): a part is a
// node's mesh — a Roblox brick — or, with PIECES=1, each separable piece of a mesh (its triangles joined by shared vertices):
// a model whose nodes are whole buildings (Town's Invasion Map, 52 meshes) still falls into bricks that way — a wall, a roof
// slab, a car's body, a window frame — 3,745 on Town. And FACES=<node name prefixes> reads the named nodes face by face —
// the ground: terraces, kerbs, steps and ramps as the model draws them (a flat face a floor, a standing face a thin wall,
// a sloped face a plane) — where one box over such a piece would bury a flight of steps in a block. EXCLUDE matches the
// node's name or its parent's (UFO_33/Object_14).
// TRACE="x0,x1,z0,z1;..." (the model's metres) prints every box and surface touching a rectangle as it is made, with the part and
// the reading that made it — the user points at a box with the inspector, the trace says where it came from
const TRACE = (process.env.TRACE ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(',').map(Number)); const cur = { name: '', branch: '', info: '' };
if (TRACE.length) for (const [arr, what] of [[obstacles, 'box'], [surfaces, 'surface']]) arr.push = function (...items) { for (const it of items) { const mx0 = it.minX / SCALE + cx, mx1 = it.maxX / SCALE + cx, mz0 = it.minZ / SCALE + cz, mz1 = it.maxZ / SCALE + cz; if (TRACE.some(([tx0, tx1, tz0, tz1]) => mx1 >= tx0 && mx0 <= tx1 && mz1 >= tz0 && mz0 <= tz1)) console.log(`trace ${what}[${this.length}] ${cur.branch} <- ${cur.name} ${cur.info}: x ${mx0.toFixed(2)}..${mx1.toFixed(2)} z ${mz0.toFixed(2)}..${mz1.toFixed(2)} ${what === 'box' ? `y ${(it.minY / SCALE + GROUND).toFixed(2)}..${(it.maxY / SCALE + GROUND).toFixed(2)}${it.topBuffer != null ? ' lidded' : ''}` : `${it.type} top ${(it.maxTop / SCALE + GROUND).toFixed(2)}${it.lid ? ' lid' : ''}`}`); } return Array.prototype.push.apply(this, items); };
const PIECES = process.env.PIECES === '1'; const WELD = Number(process.env.WELD ?? 0.002); const FACES = (process.env.FACES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const parentName = {}; J.nodes.forEach((nd, i) => (nd.children ?? []).forEach((c) => { parentName[c] = nd.name ?? ''; }));
function* partsOf() {
  for (let ni = 0; ni < J.nodes.length; ni += 1) { const node = J.nodes[ni]; if (node.mesh === undefined) continue; const own = node.name ?? ''; const name = parentName[ni] ? `${parentName[ni]}/${own}` : own;
    if (EXCLUDE.some((p) => own.startsWith(p) || name.startsWith(p))) { n.excluded += 1; continue; }
    const prims = J.meshes[node.mesh].primitives;
    // an invisible part — its material's alpha under 0.1: a sound region, a trigger, a 69 by 112 m box over half the city
    // (Speaker11) — collides with nothing
    if (prims.every((p) => alphaOf(p.material) < 0.1)) { n.parts += 1; n.invisible += 1; continue; }
    const w = W[ni]; const lists = [];
    for (const p of prims) { const pos = accessor(g, p.attributes.POSITION); const idx = p.indices !== undefined ? accessor(g, p.indices) : null; const nt = idx ? idx.length / 3 : pos.length / 9; const at = (t, k) => (idx ? idx[3 * t + k] : 3 * t + k);
      const P = (i) => { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; return [w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]]; };
      if (!PIECES) { const tris = []; for (let t = 0; t < nt; t += 1) tris.push([0, 1, 2].map((k) => P(at(t, k)))); lists.push(tris); continue; }
      const nv = pos.length / 3; const uf = new Int32Array(nv); for (let i = 0; i < nv; i += 1) uf[i] = i; const find = (i) => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; }; const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) uf[a] = b; };
      // (welded by position first: a mesh drawn face by face — each quad its own four vertices, as Town's are — shares no index
      //  between the faces of one box, and read by index alone fell into 56,000 single sheets; vertices within WELD metres are one)
      const seen = new Map(); for (let i = 0; i < nv; i += 1) { const k = `${Math.round(pos[3 * i] / WELD)},${Math.round(pos[3 * i + 1] / WELD)},${Math.round(pos[3 * i + 2] / WELD)}`; const j = seen.get(k); if (j === undefined) seen.set(k, i); else unite(i, j); }
      for (let t = 0; t < nt; t += 1) { unite(at(t, 0), at(t, 1)); unite(at(t, 0), at(t, 2)); }
      const groups = new Map(); for (let t = 0; t < nt; t += 1) { const r = find(at(t, 0)); let l = groups.get(r); if (!l) { l = []; groups.set(r, l); } l.push([0, 1, 2].map((k) => P(at(t, k)))); }
      for (const l of groups.values()) lists.push(l); }
    const faces = FACES.some((p) => own.startsWith(p) || name.startsWith(p));
    if (!PIECES) yield { name, tris: lists.flat(), faces }; else { let k = 0; for (const tris of lists) yield { name: `${name}#${k++}`, tris, faces }; } } }
// THE FACES of a piece — the ground's (FACES=, label 'faces'), a flight's ('flight') or a shape's ('shape', THE SHAPES below):
// its flat faces floors (over each triangle's box; the boxes of one height merged where they share an edge), its standing
// faces thin walls (4 cm, merged along one plane), its sloped faces planes — a terrace's top and its wall, a kerb's ramp, a
// garage's walls under its ceiling, a pitched roof. Slivers are left out; on a shape so is anything under 0.3 m (a sill, a
// trim), where the ground keeps a 0.1 m kerb. The ground alone gets a block under each raised floor (a terrace is solid
// earth, and without the block the grid put a room of nodes inside it); a shape's hollows are the model's own — a garage,
// a cellar, the inside of a house — and the grid prunes the sealed ones. A run of treads is one slope (THE FLIGHTS below).
const mergeRects = (rects, same) => { let changed = true; while (changed) { changed = false; for (let i = 0; i < rects.length && !changed; i += 1) for (let j = i + 1; j < rects.length; j += 1) { const a = rects[i], b = rects[j]; if (!same(a, b)) continue;
      const e = 0.015; const sameZ = Math.abs(a.minZ - b.minZ) < e && Math.abs(a.maxZ - b.maxZ) < e, sameX = Math.abs(a.minX - b.minX) < e && Math.abs(a.maxX - b.maxX) < e;
      const touchX = a.maxX >= b.minX - e && b.maxX >= a.minX - e, touchZ = a.maxZ >= b.minZ - e && b.maxZ >= a.minZ - e;
      if ((sameZ && touchX) || (sameX && touchZ) || (a.minX >= b.minX - e && a.maxX <= b.maxX + e && a.minZ >= b.minZ - e && a.maxZ <= b.maxZ + e) || (b.minX >= a.minX - e && b.maxX <= a.maxX + e && b.minZ >= a.minZ - e && b.maxZ <= a.maxZ + e)) {
        a.minX = Math.min(a.minX, b.minX); a.maxX = Math.max(a.maxX, b.maxX); a.minZ = Math.min(a.minZ, b.minZ); a.maxZ = Math.max(a.maxZ, b.maxZ); if (a.minY != null) { a.minY = Math.min(a.minY, b.minY); a.maxY = Math.max(a.maxY, b.maxY); } rects.splice(j, 1); changed = true; break; } } } return rects; };
const sameFoot = (p, q) => Math.abs(p.minX - q.minX) < 0.02 && Math.abs(p.maxX - q.maxX) < 0.02 && Math.abs(p.minZ - q.minZ) < 0.02 && Math.abs(p.maxZ - q.maxZ) < 0.02;
// (a standing or steep face whose top or foot runs along a slope — a kerb's side beside a ramp, a stair's cheek, a handrail —
//  is three heights at its corners, and its box would stand its full rise along its whole length: a 0.3 m kerb side read as a
//  2.2 m wall along the bank beside Town's west plot, a handrail a 1.5 m panel, user 2026-10-29. Such a face is cut into
//  half-metre lengths — the triangle clipped to each slab along its long axis (Sutherland-Hodgman) — each a box of the face's
//  own heights there. The two triangles of one quad give two boxes of one footprint per length; they merge into one.)
const cutAlong = (v, r, out) => { const along = (r.maxX - r.minX) >= (r.maxZ - r.minZ) ? 0 : 2; const lo = along === 0 ? r.minX : r.minZ, hi = along === 0 ? r.maxX : r.maxZ; const nseg = Math.ceil((hi - lo) / 0.5);
  for (let s = 0; s < nseg; s += 1) { const s0 = lo + (hi - lo) * s / nseg, s1 = lo + (hi - lo) * (s + 1) / nseg;
    let poly = v.map((q) => q.slice()); for (const [bound, keepBelow] of [[s0, false], [s1, true]]) { const o = []; for (let i = 0; i < poly.length; i += 1) { const a = poly[i], b = poly[(i + 1) % poly.length]; const ina = keepBelow ? a[along] <= bound : a[along] >= bound, inb = keepBelow ? b[along] <= bound : b[along] >= bound; if (ina) o.push(a); if (ina !== inb) { const tt = (bound - a[along]) / (b[along] - a[along]); o.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt]); } } poly = o; if (!poly.length) break; }
    if (poly.length < 3) continue; const ys = poly.map((q) => q[1]), xs = poly.map((q) => q[0]), zs = poly.map((q) => q[2]); const seg = { minX: Math.max(Math.min(...xs), x0), maxX: Math.min(Math.max(...xs), x1), minZ: Math.max(Math.min(...zs), z0), maxZ: Math.min(Math.max(...zs), z1), minY: Math.min(...ys), maxY: Math.max(...ys) };
    if (seg.maxY - seg.minY >= 0.05) out(seg); } };
// THE FLIGHTS (user 2026-10-29, "i don't need any stairs, make them slopes"): among a piece's floors, a tread is 0.15 to 0.7 m
// deep and 0.6 m or longer; the next tread lies a step up (0.1 to 0.5 m), touching along the depth and overlapping along the
// length. Two or more in a run are one plane from the first tread's foot — a rise under its top, the ground before it — to the
// top of the last, over the treads' footprint; the treads' floors go, and the risers across the run within its heights (the
// cheeks along it stay: a body walks up the slope, not into the stair's side). The landing beyond is a floor a few cm up.
const flightsOf = (floors, treadsOnly, walls) => { const out = [];   // (treadsOnly: level faces too narrow for floors — a 0.23 m tread — kept for the flights alone)
  const tread = (r) => { const dx = r.maxX - r.minX, dz = r.maxZ - r.minZ; const depth = Math.min(dx, dz), len = Math.max(dx, dz); return depth >= 0.15 && depth <= 0.7 && len >= 0.6 ? (dx < dz ? 'x' : 'z') : null; };   // (the axis the flight runs along)
  const follows = (p, q, axis) => { const [a0, a1, c0, c1] = axis === 'x' ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX']; const gap = Math.max(q[a0] - p[a1], p[a0] - q[a1]); const ov = Math.min(p[c1], q[c1]) - Math.max(p[c0], q[c0]); return gap <= 0.15 && gap >= -0.3 && ov >= 0.5 * Math.min(p[c1] - p[c0], q[c1] - q[c0]); };
  const cand = treadsOnly.filter((r) => tread(r)).sort((p, q) => p.top - q.top); const used = new Set();
  for (const first of cand) { if (used.has(first)) continue; const axis = tread(first); const chain = [first];
    for (;;) { const p = chain[chain.length - 1]; let next = null; for (const q of cand) { if (used.has(q) || chain.includes(q) || tread(q) !== axis) continue; const d = q.top - p.top; if (d < 0.12 || d > 0.5 || !follows(p, q, axis)) continue; if (!next || q.top < next.top) next = q; } if (!next) break; chain.push(next); }
    // (a flight rises 0.3 m at least: a deck's rim strips, 0.1 m apart, read as two treads, and the deck's floor went with them — Town's north deck, user 2026-10-29 "still falling")
    if (chain.length < 2 || chain[chain.length - 1].top - chain[0].top < 0.3) continue; for (const r of chain) used.add(r);
    const rise = chain[1].top - chain[0].top; const lo = chain[0].top - rise, hi = chain[chain.length - 1].top; const a0 = axis === 'x' ? 'minX' : 'minZ'; const up = chain[1][a0] > chain[0][a0];
    const R = { minX: Math.min(...chain.map((r) => r.minX)), maxX: Math.max(...chain.map((r) => r.maxX)), minZ: Math.min(...chain.map((r) => r.minZ)), maxZ: Math.max(...chain.map((r) => r.maxZ)) };
    out.push({ ...R, axis, up, lo, hi, treads: chain.length });
    for (let i = floors.length - 1; i >= 0; i -= 1) { const f = floors[i]; if (f.top >= lo - 0.05 && f.top <= hi + 0.05 && f.minX >= R.minX - 0.1 && f.maxX <= R.maxX + 0.1 && f.minZ >= R.minZ - 0.1 && f.maxZ <= R.maxZ + 0.1) floors.splice(i, 1); }   // (the floors INSIDE the flight's footprint go — its treads; a deck the flight merely touches stays, and the landing beyond, higher, stays)
    for (let i = walls.length - 1; i >= 0; i -= 1) { const w = walls[i]; const across = axis === 'x' ? w.maxX - w.minX < 0.1 : w.maxZ - w.minZ < 0.1; if (!across) continue; if (w.minX >= R.minX - 0.05 && w.maxX <= R.maxX + 0.05 && w.minZ >= R.minZ - 0.05 && w.maxZ <= R.maxZ + 0.05 && w.minY >= lo - 0.05 && w.maxY <= hi + 0.05) walls.splice(i, 1); } }
  return out; };
// THE RASTER of a big level face (2026-10-29): a triangle's box is not the triangle — a yard drawn in a few long triangles around
// its cellar ramp put floors over the ramp, and a body walked out over the pit on them (Town's housing plot). A level face of 2 m²
// or more is read by half-metre cells instead — the cells whose centres it covers, joined into runs along x and the runs of one
// extent into rectangles — so the floor is the face's own shape, to half a metre. Every level face goes through it now; a
// tread's box is kept beside it for the flights alone.
// (keepCell(px, pz, top): false drops a cell — a cell with no room over it. The test was on the rectangle's centre, and a whole
//  deck went where a box stood on one corner of it: Town's north deck, user 2026-10-29 "falling into pit")
const rasterFloors = (tris, keepCell = null) => { const out = []; const byLevel = new Map(); for (const t of tris) { const k = Math.round(t.top / 0.05); let l = byLevel.get(k); if (!l) { l = { top: t.top, tris: [] }; byLevel.set(k, l); } l.tris.push(t.v); if (t.top > l.top) l.top = t.top; }
  const C = 0.5;   // (quarter-metre cells doubled the floors — 1,915 rectangles, 909 blocks under them — and the bots' search p99 with them; half a metre, 0.25 m off at an edge, was 915)
  for (const { top, tris: lv } of byLevel.values()) { const covered = new Set(); let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity;
    for (const v of lv) { const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); const cx0 = Math.max(Math.floor(Math.min(...xs) / C), Math.floor(x0 / C)), cx1 = Math.min(Math.floor(Math.max(...xs) / C), Math.floor(x1 / C)), cz0 = Math.max(Math.floor(Math.min(...zs) / C), Math.floor(z0 / C)), cz1 = Math.min(Math.floor(Math.max(...zs) / C), Math.floor(z1 / C)); const [p, q, s] = v; const d = (q[2] - s[2]) * (p[0] - s[0]) + (s[0] - q[0]) * (p[2] - s[2]); if (Math.abs(d) < 1e-9) continue;
      for (let i = cx0; i <= cx1; i += 1) for (let k = cz0; k <= cz1; k += 1) { const px = (i + 0.5) * C, pz = (k + 0.5) * C; const l1 = ((q[2] - s[2]) * (px - s[0]) + (s[0] - q[0]) * (pz - s[2])) / d, l2 = ((s[2] - p[2]) * (px - s[0]) + (p[0] - s[0]) * (pz - s[2])) / d, l3 = 1 - l1 - l2; if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; if (keepCell && !keepCell(px, pz, top)) { if (process.env.FLOOR_DEBUG && cur.name.includes(process.env.FLOOR_DEBUG)) console.log(`    cell dropped ${cur.name} x ${px.toFixed(2)} z ${pz.toFixed(2)} top ${top.toFixed(2)} above ${faceAbove(px, pz, top).toFixed(2)}`); continue; } covered.add(i * 1000003 + k); if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k; } }
    if (!covered.size) continue; let prev = [];   // the runs of the row before, to grow down
    for (let k = k0; k <= k1; k += 1) { const runs = []; let start = null; for (let i = i0; i <= i1 + 1; i += 1) { const on = i <= i1 && covered.has(i * 1000003 + k); if (on && start === null) start = i; if (!on && start !== null) { runs.push({ i0: start, i1: i - 1, k0: k, k1: k }); start = null; } }
      const grown = []; for (const r of runs) { const up = prev.find((u) => u.i0 === r.i0 && u.i1 === r.i1 && u.k1 === k - 1); if (up) { up.k1 = k; grown.push(up); } else { out.push(r); grown.push(r); } } prev = grown; }
    for (const r of out) if (r.top === undefined) { r.minX = Math.max(r.i0 * C, x0); r.maxX = Math.min((r.i1 + 1) * C, x1); r.minZ = Math.max(r.k0 * C, z0); r.maxZ = Math.min((r.k1 + 1) * C, z1); r.top = top; r.raster = true; delete r.i0; delete r.i1; delete r.k0; delete r.k1; } }
  return out; };
// THE WALLS BY COLUMN (2026-10-29): the standing faces on one axis plane (x = c or z = c) are read together, by quarter-metre
// columns along the plane — each column's wall runs from the lowest to the highest point the faces reach in it, and columns of
// one height (within 0.1 m) join. So a facade drawn in triangles of every height is one wall where it is one, and OPEN where
// it is open — its door (a facade merged by its box shut Town's Building 06 at the doorstep) — and a kerb's side along a slope
// is a row of short walls of its own heights there, no cut needed. A face on no axis plane (a slanted wall) keeps its box, cut
// into lengths along its slope (cutAlong).
const wallsByColumn = (faces, minRise, minLen) => { const out = []; const C = 0.25;
  for (const [plane, list] of faces) { const alongAxis = plane[0] === 'x' ? 2 : 0; let lo = Infinity, hi = -Infinity; for (const v of list) for (const q of v) { if (q[alongAxis] < lo) lo = q[alongAxis]; if (q[alongAxis] > hi) hi = q[alongAxis]; }
    const crop0 = alongAxis === 0 ? x0 : z0, crop1 = alongAxis === 0 ? x1 : z1; lo = Math.max(lo, crop0); hi = Math.min(hi, crop1); if (hi - lo < 0.01) continue;
    const n0 = Math.floor(lo / C), n1 = Math.ceil(hi / C); const cols = [];
    for (let c = n0; c < n1; c += 1) { const s0 = Math.max(c * C, lo), s1 = Math.min((c + 1) * C, hi); if (s1 - s0 < 0.005) { cols.push(null); continue; } let y0 = Infinity, y1 = -Infinity;
      for (const v of list) { let poly = v.map((q) => q.slice()); for (const [bound, keepBelow] of [[s0, false], [s1, true]]) { const o = []; for (let i = 0; i < poly.length; i += 1) { const a = poly[i], b = poly[(i + 1) % poly.length]; const ina = keepBelow ? a[alongAxis] <= bound : a[alongAxis] >= bound, inb = keepBelow ? b[alongAxis] <= bound : b[alongAxis] >= bound; if (ina) o.push(a); if (ina !== inb) { const tt = (bound - a[alongAxis]) / (b[alongAxis] - a[alongAxis]); o.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt]); } } poly = o; if (!poly.length) break; }
        for (const q of poly) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } }
      cols.push(y1 - y0 >= 0.02 ? { s0, s1, y0, y1 } : null); }
    // (a run of one column — a wall whose top follows a roof's slope is a column at each height — is kept where a column of another
    //  height joins it on either side: it is a length of one wall; alone, a sliver. The shed by Town's Building 02 lost the walls
    //  under its sloped roof to the length rule, and a body walked in under the roof, 2026-10-29)
    const runs = []; let cur = null, curJoined = false; const flush = (joined) => { if (cur && cur.y1 - cur.y0 >= minRise && (cur.s1 - cur.s0 >= minLen || curJoined || joined)) runs.push(cur); cur = null; curJoined = false; };
    for (const c of cols) { if (!c) { flush(false); continue; } if (cur && Math.abs(c.y0 - cur.y0) < 0.1 && Math.abs(c.y1 - cur.y1) < 0.1) { cur.s1 = c.s1; cur.y0 = Math.min(cur.y0, c.y0); cur.y1 = Math.max(cur.y1, c.y1); } else { const hadPrev = cur != null; flush(true); cur = { ...c }; curJoined = hadPrev; } } flush(false);
    const at = Number(plane.slice(1));
    for (const r of runs) out.push(alongAxis === 2 ? { minX: at, maxX: at, minZ: r.s0, maxZ: r.s1, minY: r.y0, maxY: r.y1, plane, cut: false } : { minX: r.s0, maxX: r.s1, minZ: at, maxZ: at, minY: r.y0, maxY: r.y1, plane, cut: false }); }
  return out; };
const readFaces = (part, label = 'faces') => { const { tris } = part; cur.name = part.name; cur.branch = label; cur.info = `${tris.length} tris`; n.parts += 1;
  const ground = label === 'faces', minRise = ground ? 0.1 : 0.3, minLen = ground ? 0.1 : 0.3; const floors = [], walls = [], slopes = [], treadsOnly = [], bigLevel = []; const planeFaces = new Map();
  const wallOf = (rr, cut) => { const thinX = rr.maxX - rr.minX < 0.04, thinZ = rr.maxZ - rr.minZ < 0.04; walls.push({ ...rr, cut, plane: thinX ? `x${rr.minX.toFixed(2)}` : thinZ ? `z${rr.minZ.toFixed(2)}` : `d${rr.minX.toFixed(2)},${rr.minZ.toFixed(2)}` }); };
  const wallFaces = (v, r) => { const thinX = r.maxX - r.minX < 0.04, thinZ = r.maxZ - r.minZ < 0.04;
    if (thinX || thinZ) { const key = thinX ? `x${((r.minX + r.maxX) / 2).toFixed(2)}` : `z${((r.minZ + r.maxZ) / 2).toFixed(2)}`; let l = planeFaces.get(key); if (!l) { l = []; planeFaces.set(key, l); } l.push(v); return; }
    // (a face on no axis plane — a billboard set at 45 degrees, a fence along a bend — is cut into half-metre lengths whatever its
    //  heights: its one box was its whole footprint, a 6 by 5 m block in the air over the police station's yard, 2026-10-29)
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ, diagonal = Math.min(w, d) >= 0.3 && Math.max(w, d) >= 1;
    const hs = [...new Set(v.map((q) => Math.round(q[1] / 0.05)))]; if (!diagonal && (hs.length < 3 || Math.max(w, d) < 1)) wallOf(r, false); else { cutAlong(v, r, (seg) => wallOf(seg, true)); n.splitWalls += 1; } };
  for (const v of tris) { const cxT = (v[0][0] + v[1][0] + v[2][0]) / 3, czT = (v[0][2] + v[1][2] + v[2][2]) / 3; if (cxT < x0 || cxT > x1 || czT < z0 || czT > z1) { continue; }
    const xs = v.map((q) => q[0]), ys = v.map((q) => q[1]), zs = v.map((q) => q[2]); const r = { minX: Math.max(Math.min(...xs), x0), maxX: Math.min(Math.max(...xs), x1), minZ: Math.max(Math.min(...zs), z0), maxZ: Math.min(Math.max(...zs), z1), minY: Math.min(...ys), maxY: Math.max(...ys) };
    if (r.maxY < GROUND - BELOW || r.minY > GROUND + CEIL) continue;   // (a cellar's floor under the street is a floor — Town's housing plot has one 2 m down, its ramps lead to it; only what lies BELOW metres under is nothing)
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; const c = Math.abs(ny) / l;
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    // (a face is flat by its own rise, not by its normal: a bank falling 2.4 m over 8 m is within 18 degrees of level, and read
    //  as a floor at its top it was a cliff over the street — the plot stood apart from the road on Town, 2026-10-29)
    const rise = r.maxY - r.minY;
    // (a shape's floor is a body wide — a sill, a ledge is none: each was a node of the grid and a jump's end; the ground keeps its 0.3 m strips)
    if (rise < 0.08) { if (ny > 0) { bigLevel.push({ v, top: r.maxY }); if (Math.min(w, d) >= 0.15 && Math.min(w, d) <= 0.7 && Math.max(w, d) >= 0.6) treadsOnly.push({ ...r, top: r.maxY }); } }
    else if (c < 0.05) { if (rise >= minRise && Math.max(w, d) >= minLen) wallFaces(v, r); }
    else { const f = fit(v.map((q) => [q[0], q[1], q[2]])); if (!f) continue; const [a, b, cc] = f; const grade = Math.hypot(b, cc);
      if (grade > MAX_GRADE) { if (rise >= minRise && Math.max(w, d) >= minLen) wallFaces(v, r); continue; }   // (steeper than a ramp: a wall, cut along its slope like a standing face)
      if (Math.min(w, d) >= 0.3) slopes.push({ ...r, a, b, c: cc }); } }
  for (const w of wallsByColumn(planeFaces, minRise, minLen)) walls.push(w); n.columnWalls += planeFaces.size;
  // (every level face through the raster, the small with the big: a deck drawn in long thin triangles, each under a body's width, had
  //  no floor at all when each triangle was judged alone — a shape's floor is judged as the rectangle the cells make)
  // (no room over a cell means a SLAB over it — the cell and its four neighbours half a metre out all under something within 1.7 m:
  //  a foundation under a floor, the street under a plinth, the deck under a box. A sill, a beam, a railing's cap, a bench's edge
  //  over one cell alone is not room taken: the body walks under it, and with the floor gone there it fell — Town's west terrace
  //  under a 0.7 m ledge, user 2026-10-29 "still falling")
  const roomless = (px, pz, top) => [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dz]) => faceAbove(px + dx, pz + dz, top) - top < 1.7);
  // (the room test is for floors UNDER THE STREET alone — a foundation slab under a building, a plate under the town: a cellar's floor
  //  has a body's height over it, a slab has not. A floor over the street keeps its floor whatever hangs over it: the west terrace
  //  ran under a porch roof 1.3 m over it, the floor was taken, and the body walked under the roof and fell — user 2026-10-29)
  if (ground) { for (const r of rasterFloors(bigLevel, PIECES ? (px, pz, top) => top >= GROUND - 0.3 || !roomless(px, pz, top) : null)) floors.push(r); }
  else {
    // ONE ROOF, ONE FLOOR (user 2026-10-29, "how hard is it to make an un-fallable roof with simple cbox geometry"): a shape's level
    // faces that touch, within 0.3 m of each other in height, are ONE rectangle — the box around them all, at the highest of them.
    // Nothing cut out of it, nothing filtered within it: a body on it cannot fall through it. The price is a notch filled in (an
    // L-shaped deck is its whole box); a rectangle narrower than a body that touches no other (a sill, a shelf) goes, and so does
    // a rectangle with a slab over all of it (its centre and four corners under something within 1.7 m: a foundation).
    const rs = bigLevel.map(({ v, top }) => { const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); return { minX: Math.max(Math.min(...xs), x0), maxX: Math.min(Math.max(...xs), x1), minZ: Math.max(Math.min(...zs), z0), maxZ: Math.min(Math.max(...zs), z1), top }; });
    let changed = true; while (changed) { changed = false; for (let i = 0; i < rs.length && !changed; i += 1) for (let j = i + 1; j < rs.length; j += 1) { const a = rs[i], b = rs[j]; if (Math.abs(a.top - b.top) > 0.3 || a.maxX < b.minX - 0.1 || b.maxX < a.minX - 0.1 || a.maxZ < b.minZ - 0.1 || b.maxZ < a.minZ - 0.1) continue; a.minX = Math.min(a.minX, b.minX); a.maxX = Math.max(a.maxX, b.maxX); a.minZ = Math.min(a.minZ, b.minZ); a.maxZ = Math.max(a.maxZ, b.maxZ); a.top = Math.max(a.top, b.top); rs.splice(j, 1); changed = true; break; } }
    const wideEnough = (r) => Math.min(r.maxX - r.minX, r.maxZ - r.minZ) >= LID_MIN && (r.maxX - r.minX) * (r.maxZ - r.minZ) >= 1;
    for (const r of rs) { const pts = [[(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2], [r.minX + 0.1, r.minZ + 0.1], [r.maxX - 0.1, r.minZ + 0.1], [r.minX + 0.1, r.maxZ - 0.1], [r.maxX - 0.1, r.maxZ - 0.1]]; const sealed = PIECES && r.top < GROUND - 0.3 && pts.every(([px, pz]) => roomless(px, pz, r.top)); if (process.env.FLOOR_DEBUG && part.name.includes(process.env.FLOOR_DEBUG)) console.log(`    rect ${part.name} x ${r.minX.toFixed(2)}..${r.maxX.toFixed(2)} z ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)} top ${r.top.toFixed(2)} wide ${wideEnough(r)} sealed ${sealed} above ${pts.map(([px, pz]) => (faceAbove(px, pz, r.top) - r.top).toFixed(1)).join('/')}`); if (!wideEnough(r)) continue; if (sealed) { n.lowFloors += 1; continue; } floors.push(r); } }
  mergeRects(floors, (p, q) => Math.abs(p.top - q.top) < 0.02);
  // (one terrace, one height: floors that touch and lie within 5 mm of each other — the reading's own rounding — take the highest of them — a terrace read in
  //  rasters and boxes came out 9.46 here and 9.47 there, and two units of one 2v2 pair stood a hair apart)
  { let changed = true; while (changed) { changed = false; for (let i = 0; i < floors.length; i += 1) for (let j = i + 1; j < floors.length; j += 1) { const a = floors[i], b = floors[j]; if (a.top === b.top || Math.abs(a.top - b.top) >= 0.005) continue; if (a.maxX < b.minX - 0.03 || b.maxX < a.minX - 0.03 || a.maxZ < b.minZ - 0.03 || b.maxZ < a.minZ - 0.03) continue; const h = Math.max(a.top, b.top); a.top = h; b.top = h; changed = true; } } }
  // (walls of one plane merge where their heights match, or, both cut, over one footprint; the columns did the rest)
  mergeRects(walls, (p, q) => p.plane === q.plane && (p.cut || q.cut ? p.cut && q.cut && sameFoot(p, q) : Math.abs(p.minY - q.minY) < 0.05 && Math.abs(p.maxY - q.maxY) < 0.05));
  mergeRects(slopes, (p, q) => Math.abs(p.a - q.a) < 0.02 && Math.abs(p.b - q.b) < 0.005 && Math.abs(p.c - q.c) < 0.005); mergeRects(treadsOnly, (p, q) => Math.abs(p.top - q.top) < 0.02);
  // (on a shape, a cut length lying within an uncut wall of its plane — a facade drawn around its windows is triangles of three
  //  heights too, cut for nothing — is the wall's already and goes)
  if (!ground) for (let i = walls.length - 1; i >= 0; i -= 1) { const s = walls[i]; if (!s.cut) continue; if (walls.some((u) => u !== s && !u.cut && u.plane === s.plane && u.minX <= s.maxX + 0.02 && u.maxX >= s.minX - 0.02 && u.minZ <= s.maxZ + 0.02 && u.maxZ >= s.minZ - 0.02 && u.minY <= s.minY + 0.1 && u.maxY >= s.maxY - 0.1)) walls.splice(i, 1); }
  if (process.env.FLIGHT_DEBUG) { const tr = [...floors, ...treadsOnly].filter((r) => { const dx = r.maxX - r.minX, dz = r.maxZ - r.minZ; const dep = Math.min(dx, dz); return dep >= 0.15 && dep <= 0.7 && Math.max(dx, dz) >= 0.6; }); if (tr.length >= 3) console.log(`    treads? ${part.name}: ${tr.length} of ${floors.length} floors: ${tr.slice(0, 6).map((r) => `[x ${r.minX.toFixed(2)}..${r.maxX.toFixed(2)} z ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)} top ${r.top.toFixed(2)}]`).join(' ')}`); }
  // (a slope cuts the floor over it: a shape's one floor — the box around its level faces — lay over the plot's cellar ramps, and a
  //  body walked over the ramp on air instead of down it, user 2026-10-29. A floor topping between a slope's foot and its head, over
  //  the slope's footprint, loses that footprint and keeps its parts around it)
  if (!ground) for (const s of slopes) { const { a, b, c } = s; const hs = [[s.minX, s.minZ], [s.maxX, s.minZ], [s.minX, s.maxZ], [s.maxX, s.maxZ]].map(([x, z]) => a + b * x + c * z); const lo = Math.min(...hs), hi = Math.max(...hs); if (hi - lo < 0.3) continue;
    for (let i = floors.length - 1; i >= 0; i -= 1) { const f = floors[i]; if (f.top <= lo - 0.1 || f.top >= hi + 0.1 || f.maxX <= s.minX + 0.05 || f.minX >= s.maxX - 0.05 || f.maxZ <= s.minZ + 0.05 || f.minZ >= s.maxZ - 0.05) continue; floors.splice(i, 1);
      const ix0 = Math.max(f.minX, s.minX), ix1 = Math.min(f.maxX, s.maxX); for (const q of [{ ...f, maxX: s.minX }, { ...f, minX: s.maxX }, { ...f, minX: ix0, maxX: ix1, maxZ: s.minZ }, { ...f, minX: ix0, maxX: ix1, minZ: s.maxZ }]) if (q.maxX - q.minX >= 0.05 && q.maxZ - q.minZ >= 0.05) floors.push(q); } }
  const flights = flightsOf(floors, treadsOnly, walls);
  if (process.env.SHAPE_LOG && label === 'shape' && floors.length + walls.length + slopes.length > 10) console.log(`    shape ${part.name} (${tris.length} tris, ${cur.why}, ${(Math.max(...tris.flat().map((q) => q[0])) - Math.min(...tris.flat().map((q) => q[0]))).toFixed(1)}x${(Math.max(...tris.flat().map((q) => q[2])) - Math.min(...tris.flat().map((q) => q[2]))).toFixed(1)}x${(Math.max(...tris.flat().map((q) => q[1])) - Math.min(...tris.flat().map((q) => q[1]))).toFixed(1)} m at y ${Math.min(...tris.flat().map((q) => q[1])).toFixed(1)}): ${floors.length} floors, ${walls.length} walls (${walls.filter((w) => w.cut).length} cut), ${slopes.length} slopes`);
  // (a level face over the street is the top of solid ground — a terrace, a plot, a tread — so a block stands under it to the
  //  street, lidded: without it the space under a plot was open, and the grid put a room of nodes inside the earth)
  for (const r of floors) { surfaces.push({ minX: ax(r.minX - 0.02), maxX: ax(r.maxX + 0.02), minZ: az(r.minZ - 0.02), maxZ: az(r.maxZ + 0.02), maxTop: ay(r.top), type: 'flat', top: ay(r.top) }); n.faceFloors += 1;
    if (ground && r.top > GROUND + 0.3) { obstacles.push({ minX: ax(r.minX), maxX: ax(r.maxX), minZ: az(r.minZ), maxZ: az(r.maxZ), minY: ay(GROUND - 0.5), maxY: ay(r.top), topBuffer: 0.8 }); n.faceBlocks += 1; } }
  for (const r of walls) { let ox0 = r.minX, ox1 = r.maxX, oz0 = r.minZ, oz1 = r.maxZ; if (ox1 - ox0 < 0.04) { ox0 -= 0.02; ox1 += 0.02; } if (oz1 - oz0 < 0.04) { oz0 -= 0.02; oz1 += 0.02; } obstacles.push({ minX: ax(ox0), maxX: ax(ox1), minZ: az(oz0), maxZ: az(oz1), minY: ay(r.minY), maxY: ay(r.maxY) }); n.faceWalls += 1; }
  for (const r of slopes) { const { a, b, c } = r; const corners = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.maxZ]].map(([x, z]) => a + b * x + c * z); const hi = Math.min(Math.max(...corners), r.maxY);
    surfaces.push({ minX: ax(r.minX), maxX: ax(r.maxX), minZ: az(r.minZ), maxZ: az(r.maxZ), maxTop: ay(hi), type: 'plane', y0: ay(a + b * r.minX + c * r.minZ), gx: Math.round(b * 10000) / 10000, gz: Math.round(c * 10000) / 10000 }); n.faceSlopes += 1; }
  for (const F of flights) { const along = F.axis === 'x' ? F.maxX - F.minX : F.maxZ - F.minZ; const g = Math.round(((F.hi - F.lo) / along) * 10000) / 10000;
    surfaces.push({ minX: ax(F.minX), maxX: ax(F.maxX), minZ: az(F.minZ), maxZ: az(F.maxZ), maxTop: ay(F.hi), type: 'plane', y0: ay(F.up ? F.lo : F.hi), gx: F.axis === 'x' ? (F.up ? g : -g) : 0, gz: F.axis === 'z' ? (F.up ? g : -g) : 0 }); n.flights += 1; n.flightTreads += F.treads;
    if (process.env.STAIR_LOG) console.log(`    flight ${F.axis} x ${F.minX.toFixed(1)}..${F.maxX.toFixed(1)} z ${F.minZ.toFixed(1)}..${F.maxZ.toFixed(1)} ${F.lo.toFixed(2)}->${F.hi.toFixed(2)} m, ${F.treads} treads (${part.name})`); } };
// A FLIGHT in one piece (Town's stairs are welded to their buildings' meshes, not treads of their own): a piece whose level
// faces come at three or more heights a tread apart (0.1 to 0.5 m) is read face by face — treads floors, risers walls the
// lip pass lids — where one box over it would be a block the body cannot climb (the stair west of Town's small building).
const flightPiece = (tris) => { const lv = new Map();   // level (0.05 m) -> the union box of its level, up-facing faces
  for (const v of tris) { const ys = v.map((q) => q[1]); if (Math.max(...ys) - Math.min(...ys) >= 0.08) continue; const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const ny = uz * vx - ux * vz; if (ny <= 0) continue;
    const k = Math.round(ys[0] / 0.05) * 0.05; const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); const r = lv.get(k) ?? { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 }; r.minX = Math.min(r.minX, ...xs); r.maxX = Math.max(r.maxX, ...xs); r.minZ = Math.min(r.minZ, ...zs); r.maxZ = Math.max(r.maxZ, ...zs); lv.set(k, r); }
  const L = [...lv.entries()].filter(([, r]) => Math.min(r.maxX - r.minX, r.maxZ - r.minZ) >= 0.15).sort((a, b) => a[0] - b[0]); if (L.length < 3) return false;   // (the nosings between treads — 4 cm strips, level by their small rise — broke every run into pairs: a doorstep of six treads read as a block)
  // a tread: 0.15 to 0.7 m deep, 0.6 m or longer; the next tread a step up (0.1 to 0.5 m), touching along the depth and overlapping along the length
  const tread = (r) => { const dx = r.maxX - r.minX, dz = r.maxZ - r.minZ; const depth = Math.min(dx, dz), len = Math.max(dx, dz); return depth >= 0.15 && depth <= 0.7 && len >= 0.6 ? (dx < dz ? 'x' : 'z') : null; };
  const follows = (p, q, axis) => { const [a0, a1, c0, c1] = axis === 'x' ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX']; const gap = Math.max(q[a0] - p[a1], p[a0] - q[a1]); const ov = Math.min(p[c1], q[c1]) - Math.max(p[c0], q[c0]); return gap <= 0.15 && gap >= -0.3 && ov >= 0.5 * Math.min(p[c1] - p[c0], q[c1] - q[c0]); };
  let best = 1, run = 1; for (let i = 1; i < L.length; i += 1) { const [h0, p] = L[i - 1], [h1, q] = L[i]; const ax = tread(q); const ok = ax && tread(p) === ax && h1 - h0 >= 0.1 && h1 - h0 <= 0.5 && follows(p, q, ax); run = ok ? run + 1 : 1; if (run > best) best = run; } return best >= 3; };
const readPart = (part) => { const { name, tris } = part; if (PIECES && flightPiece(tris)) { n.flightPieces += 1; readFaces(part, 'flight'); return; } n.parts += 1; cur.name = name; cur.info = `${tris.length} tris`;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const sloped = []; let anySlope = false;
  const levels = new Map();   // (the part's level, up-facing faces by height: a ramp's landing)
  for (const v of tris) { for (const q of v) for (let k = 0; k < 3; k += 1) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
    { const ys = v.map((q) => q[1]); if (Math.max(...ys) - Math.min(...ys) < 0.08) { const ux = v[1][0] - v[0][0], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vz = v[2][2] - v[0][2]; if (uz * vx - ux * vz > 0) { const k = Math.round(ys[0] / 0.05) * 0.05; const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); const r = levels.get(k) ?? { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, top: Math.max(...ys) }; r.minX = Math.min(r.minX, ...xs); r.maxX = Math.max(r.maxX, ...xs); r.minZ = Math.min(r.minZ, ...zs); r.maxZ = Math.max(r.maxZ, ...zs); levels.set(k, r); } } }      const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; const c = Math.abs(ny / l);
      if (c > 0.05 && c < 0.95 && (!PIECES || ny > 0)) { anySlope = true; sloped.push({ c, v }); } }   // (with the pieces, an up-facing slope alone makes a ramp: a garage door's awning, its sloped underside read as a ramp's top, put a plane in the air and blocks under its landing to the cellar floor — Town's housing plot)
  if (mx[0] < x0 || mn[0] > x1 || mx[2] < z0 || mn[2] > z1) { n.out += 1; return; }
  if (mx[1] < GROUND - BELOW) { n.below += 1; return; }
  if (mn[1] > GROUND + CEIL) { n.above += 1; return; }
  const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2]; if (Math.max(dx, dy, dz) < MIN_SIZE) { n.tiny += 1; return; }
  const bx0 = Math.max(mn[0], x0), bx1 = Math.min(mx[0], x1), bz0 = Math.max(mn[2], z0), bz1 = Math.min(mx[2], z1);   // (clipped to the crop)
  // the ground's mass — a block of earth a metre or more thick, MASS_AREA m² or more, its top at or under the street — is its
  // top alone, a floor: the station and the cellars are built inside such blocks (in Roblox they do not collide), and a body
  // walking down a stair into one was thrown out of it
  if (dy >= 1 && dx * dz >= MASS_AREA && mx[1] <= GROUND + 0.1) { cur.branch = 'mass'; surfaces.push({ minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }); n.mass += 1; return; }
  const wide = Math.min(bx1 - bx0, bz1 - bz0) >= LID_MIN && (bx1 - bx0) * (bz1 - bz0) >= 1;
  // (a sheet lying under the street by more than a step — Town's 287 by 308 m base plate at 2 m under the road — is no floor: nothing stands on it, and read as one it was a second ground under the whole map)
  if (PIECES && dy < 0.1 && mx[1] < GROUND - 0.3 && dx * dz >= 2000) { n.markings += 1; return; }   // (the pieces alone, 2026-10-30: District's plate 0.33 m under its west pavements is a floor of the committed data, kept)   // (a PLATE: 2,000 m² and more. A cellar's own floor sheet under the street — District's, 1.4 m down — is a floor, user 2026-10-30; the rule without the size took 274 of them)
  // CUT (a map's own data, 2026-10-30): a part named in CUT= — a brick set diagonally in the room, whose one box is its whole bounding
  // square — is read in half-metre lengths along its footprint's long axis, each length the box of its faces clipped to it: a staircase
  // of small boxes along the diagonal. District's 1 m counter in front of a window, 0.55 m wide and 5 m long at 45 degrees, was a box
  // 3.8 by 3.6 m, and a body stopped two metres from the window (user: "this CB is blocking unit's way walking to the window").
  if (CUT.size && (CUT.has(name) || name.split('/').some((s) => CUT.has(s)))) { cur.branch = 'cut'; const alongX = dx >= dz; const lo = alongX ? bx0 : bz0, hi = alongX ? bx1 : bz1; const nseg = Math.max(1, Math.ceil((hi - lo) / 0.5)); let made = 0;
    for (let s = 0; s < nseg; s += 1) { const s0 = lo + (hi - lo) * s / nseg, s1 = lo + (hi - lo) * (s + 1) / nseg; const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }; const k = alongX ? 0 : 2;
      for (const v of tris) { let poly = v.map((q) => q.slice()); for (const [bound, keepBelow] of [[s0, false], [s1, true]]) { const o = []; for (let i = 0; i < poly.length; i += 1) { const a = poly[i], c = poly[(i + 1) % poly.length]; const ina = keepBelow ? a[k] <= bound : a[k] >= bound, inc = keepBelow ? c[k] <= bound : c[k] >= bound; if (ina) o.push(a); if (ina !== inc) { const tt = (bound - a[k]) / (c[k] - a[k]); o.push([a[0] + (c[0] - a[0]) * tt, a[1] + (c[1] - a[1]) * tt, a[2] + (c[2] - a[2]) * tt]); } } poly = o; if (!poly.length) break; }
        for (const q of poly) { if (q[0] < b.minX) b.minX = q[0]; if (q[0] > b.maxX) b.maxX = q[0]; if (q[1] < b.minY) b.minY = q[1]; if (q[1] > b.maxY) b.maxY = q[1]; if (q[2] < b.minZ) b.minZ = q[2]; if (q[2] > b.maxZ) b.maxZ = q[2]; } }
      if (b.minX === Infinity) continue; b.minX = Math.max(b.minX, x0); b.maxX = Math.min(b.maxX, x1); b.minZ = Math.max(b.minZ, z0); b.maxZ = Math.min(b.maxZ, z1); if (b.maxX - b.minX < 0.04 || b.maxZ - b.minZ < 0.04) continue;
      const box = { minX: ax(b.minX), maxX: ax(b.maxX), minZ: az(b.minZ), maxZ: az(b.maxZ), minY: ay(b.minY), maxY: ay(b.maxY) }; if (b.maxY - b.minY <= STEP) { box.topBuffer = 0.8; surfaces.push({ minX: ax(b.minX - 0.02), maxX: ax(b.maxX + 0.02), minZ: az(b.minZ - 0.02), maxZ: az(b.maxZ + 0.02), maxTop: ay(b.maxY), type: 'flat', top: ay(b.maxY), lid: 1 }); } obstacles.push(box); made += 1; }
    n.cut += made; return; }
  if (dy < 0.1) { if (wide) { cur.branch = 'sheet'; surfaces.push({ minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }); n.sheets += 1; } else n.markings += 1; return; }
  // THE PIECES' READING (2026-10-29, the fourth pass; user: "very simple geometry cboxes that MATCH THE VISUAL"): with PIECES=1 a
  // piece is measured first — its standing faces square at top and foot 1.5 m or taller (walls), its ceilings, how its footprint
  // grows with height, how much of it is level near the street, its slopes' directions — and read as ONE of:
  //   a shape, by its faces (readFaces 'shape'): hanging over a walk (a bay on posts), hollow with room (a garage, a porch),
  //     an open shell (an L of walls, a planter), thin and sloped on top (a stair's cheek, a handrail), or a plot — big, a third
  //     of its footprint level near the street: a yard with its cellar ramps and deck;
  //   a SPLIT piece: a box up to a height and faces over it — a roof on walls (the box to the eave, the roof's slopes as planes a
  //     body walks up from the eave: huts, houses, the annex of Building 02), or a widening (a crown over a trunk, an awning over a
  //     door, a lamp over its post: the box is the trunk, the crown one box in the air a body walks under);
  //   a wedge (one slope reaching the ground: its plane), a roof shape without walls (two to four slopes: a plane per side);
  //   else a box — a car, a crate, a bus, a flat-roofed building, a deck slab with its lid.
  // What went wrong before, each a fall or a walk-through on Town: every big piece by its faces (a hollow shell with any gap in
  // the model a door), a roof read as a ramp (a plane in the air), floors cut by rules (holes).
  if (PIECES) { const foot = dx * dz, thin = Math.min(dx, dz) <= 0.8; let hollow = false, uncovered = 0, excess = 0; const feet = []; let wallArea = 0, slopedArea = 0, roofArea = 0, allArea = 0, levelNearStreet = 0, eave = Infinity; const dirs = new Map();
    for (const v of tris) { const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; let nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny2, nz); if (l < 1e-9) continue; const area = l / 2; allArea += area; const c = Math.abs(ny2) / l; const ys = v.map((q) => q[1]); const yLo = Math.min(...ys), yHi = Math.max(...ys);
      if (c < 0.05) { feet.push([yLo, area]); if (yHi - yLo >= 1.5) wallArea += area; }
      else if (c < 0.95) { slopedArea += area; if (c >= 0.555) { roofArea += area; if (yLo < eave) eave = yLo; } if (ny2 < 0) { nx = -nx; nz = -nz; } const k = `${Math.round(nx / l * 5)},${Math.round(nz / l * 5)}`; dirs.set(k, (dirs.get(k) ?? 0) + area); }
      else if (yHi - yLo < 0.08) { if (ny2 < 0) { if (area >= 1.5 && yLo - mn[1] >= 1.8) hollow = true; } else if (Math.abs(yLo - GROUND) <= 1.0) levelNearStreet += area; } }
    feet.sort((a, b) => a[0] - b[0]); let acc = 0, massFoot = mn[1]; const fifth = feet.reduce((s, f) => s + f[1], 0) * 0.2; for (const [y, a] of feet) { acc += a; if (acc >= fifth) { massFoot = y; break; } } const hanging = feet.length > 0 && massFoot - mn[1] >= 1.8;
    if (!hollow && (thin || foot >= 4)) {   // (the piece's own top over its footprint, by quarter-metre cells: the cells no face covers, and the air under the box's lid over the covered ones)
      const cell = 0.25, cols = Math.max(1, Math.ceil(dx / cell)), rows = Math.max(1, Math.ceil(dz / cell)); let air = 0, none = 0;
      for (let i = 0; i < cols; i += 1) for (let k = 0; k < rows; k += 1) { const px = mn[0] + (i + 0.5) * dx / cols, pz = mn[2] + (k + 0.5) * dz / rows; let top = -Infinity;
        for (const v of tris) { const [p, q, s] = v; const d = (q[2] - s[2]) * (p[0] - s[0]) + (s[0] - q[0]) * (p[2] - s[2]); if (Math.abs(d) < 1e-9) continue; const l1 = ((q[2] - s[2]) * (px - s[0]) + (s[0] - q[0]) * (pz - s[2])) / d, l2 = ((s[2] - p[2]) * (px - s[0]) + (p[0] - s[0]) * (pz - s[2])) / d, l3 = 1 - l1 - l2; if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; const y = l1 * p[1] + l2 * q[1] + l3 * s[1]; if (y > top) top = y; }
        if (top === -Infinity) none += 1; else air += Math.max(0, mx[1] - top); }
      uncovered = none / (cols * rows); excess = cols * rows - none > 0 ? air / ((cols * rows - none) * dy) : 0; }
    const big = foot >= 30 && Math.min(dx, dz) >= 3, open = foot >= 4 && uncovered >= 0.3, plot = big && levelNearStreet >= 0.3 * foot, terrain = big && wallArea < 2;
    const why = hanging ? 'hanging' : hollow ? 'hollow' : open ? `open ${(uncovered * 100).toFixed(0)}%` : thin && excess > 0.3 ? `thin ${(excess * 100).toFixed(0)}%` : plot ? 'plot' : terrain ? 'terrain' : null;
    if (why) { n.shapes += 1; if (process.env.SHAPE_LOG) cur.why = why; readFaces(part, 'shape'); return; }
    // the split height: the eave of a roof on walls, or where the footprint grows two and a half times over the bands below it
    let h = null; if (wallArea >= 2 && eave < Infinity && eave - mn[1] >= 1.0 && mx[1] - eave >= 0.3 && roofArea >= 0.5 * foot) h = eave;
    { const band = 0.5, nb = Math.ceil(dy / band); const areas = []; for (let k = 0; k < nb; k += 1) { let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity; const lo = mn[1] + k * band, hi = lo + band; for (const v of tris) for (const q of v) { if (q[1] < lo || q[1] >= hi) continue; if (q[0] < ax0) ax0 = q[0]; if (q[0] > ax1) ax1 = q[0]; if (q[2] < az0) az0 = q[2]; if (q[2] > az1) az1 = q[2]; } areas.push(ax0 === Infinity ? 0 : (ax1 - ax0) * (az1 - az0)); }
      let below = 0; for (let k = 0; k < nb; k += 1) { const hk = mn[1] + k * band; if (k >= 3 && below > 0 && areas[k] >= 2.5 * below && mx[1] - hk >= 0.3) { if (h == null || hk < h) h = hk; break; } if (areas[k] > below) below = areas[k]; } }
    if (h != null) { const lowPts = []; for (const v of tris) for (const q of v) if (q[1] < h - 0.02) lowPts.push(q); let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity; for (const q of lowPts) { if (q[0] < lx0) lx0 = q[0]; if (q[0] > lx1) lx1 = q[0]; if (q[2] < lz0) lz0 = q[2]; if (q[2] > lz1) lz1 = q[2]; }
      lx0 = Math.max(lx0, x0); lx1 = Math.min(lx1, x1); lz0 = Math.max(lz0, z0); lz1 = Math.min(lz1, z1);
      if (lx1 - lx0 < 0.04) { lx0 -= 0.02; lx1 += 0.02; } if (lz1 - lz0 < 0.04) { lz0 -= 0.02; lz1 += 0.02; }
      cur.branch = 'split-box'; obstacles.push({ minX: ax(lx0), maxX: ax(lx1), minZ: az(lz0), maxZ: az(lz1), minY: ay(mn[1]), maxY: ay(h), topBuffer: 0.8 }); surfaces.push({ minX: ax(lx0 - 0.02), maxX: ax(lx1 + 0.02), minZ: az(lz0 - 0.02), maxZ: az(lz1 + 0.02), maxTop: ay(h), type: 'flat', top: ay(h), lid: 1 }); n.splits += 1;
      const upper = tris.filter((v) => Math.min(v[0][1], v[1][1], v[2][1]) >= h - 0.05); const uDirs = new Map(); let uSloped = 0;
      for (const v of upper) { const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; let nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny2, nz); if (l < 1e-9) continue; const c = Math.abs(ny2) / l; if (c <= 0.05 || c >= 0.95) continue; uSloped += l / 2; if (ny2 < 0) { nx = -nx; nz = -nz; } const k = `${Math.round(nx / l * 5)},${Math.round(nz / l * 5)}`; uDirs.set(k, (uDirs.get(k) ?? 0) + l / 2); }
      const uD = [...uDirs.values()].filter((a) => a >= 0.1 * uSloped).length;
      if (upper.length > 200 || uD >= 6) { let ux0 = Infinity, ux1 = -Infinity, uz0 = Infinity, uz1 = -Infinity, uy1 = -Infinity; for (const v of upper) for (const q of v) { if (q[0] < ux0) ux0 = q[0]; if (q[0] > ux1) ux1 = q[0]; if (q[2] < uz0) uz0 = q[2]; if (q[2] > uz1) uz1 = q[2]; if (q[1] > uy1) uy1 = q[1]; }
        ux0 = Math.max(ux0, x0); ux1 = Math.min(ux1, x1); uz0 = Math.max(uz0, z0); uz1 = Math.min(uz1, z1); if (ux1 > ux0 && uz1 > uz0) { cur.branch = 'split-crown'; obstacles.push({ minX: ax(ux0), maxX: ax(ux1), minZ: az(uz0), maxZ: az(uz1), minY: ay(h), maxY: ay(uy1), topBuffer: 0.8 }); surfaces.push({ minX: ax(ux0 - 0.02), maxX: ax(ux1 + 0.02), minZ: az(uz0 - 0.02), maxZ: az(uz1 + 0.02), maxTop: ay(uy1), type: 'flat', top: ay(uy1), lid: 1 }); n.crowns += 1; } }
      else if (upper.length) readFaces({ name: part.name, tris: upper }, 'roof');
      return; }
    // a wedge reaching the ground is a ramp (below); a roof shape without walls — two to four slopes, half the faces — is read by its faces
    // (a roof shape LIES ON ITS BOTTOM — its lowest slope within 0.3 m of the piece's foot: an A-frame, a roof piece set on its own walls' piece.
    //  A car's windscreen and rear window are two slopes over half its faces too, with the hood a metre up: read as a roof shape, the car
    //  was planes a body walked up — Town's red coupe by the north car park, 2026-10-29. A slope hanging in the air makes a box.)
    if (anySlope) { const D = [...dirs.values()].filter((a) => a >= 0.1 * slopedArea).length; if (D >= 2) { if (D <= 4 && slopedArea >= 0.5 * allArea && eave - mn[1] <= 0.3) { n.shapes += 1; if (process.env.SHAPE_LOG) cur.why = 'roof shape'; readFaces(part, 'shape'); return; } anySlope = false; } else if (eave - mn[1] > 0.3) anySlope = false; } }
  if (anySlope) { // a ramp: a wedge's one sloped face, or a box tilted to lie as a ramp (its top and bottom slope alike, its ends more) —
    // the flattest sloped faces are the top and the bottom; of a pair, the higher is the top; its plane is the surface
    const flat = Math.max(...sloped.map((t) => t.c)); const top = sloped.filter((t) => t.c > flat - 0.03); let pts = top.flatMap((t) => t.v);
    let f = pts ? fit(pts) : null;
    if (f && f[3] >= 0.05) { const [a, b, c] = f; pts = pts.filter(([x, y, z]) => y > a + b * x + c * z); f = fit(pts); }
    // The plane runs over the TOP FACE's own footprint, not the part's box (2026-10-29, the second day): a box tilted to lie as
    // a ramp has its top face short of the box's ends by half the box's thickness, and a plane over the box's footprint ran
    // on past both ends of the face — the 3.8 m thick body of District's B1→B2 escalator put a floor 1.3 m over the top
    // landing, the step rule lifted a body onto it and dropped it, the grid's walk from the landing arrived a storey too
    // high, no edge joined the lanes to the landing, and B2 and B3 were pruned as a sealed void (user: "pathfinder seems
    // to be unable to track the enemy through the deep slopes connecting B1 and B2"). And a face steeper than MAX_GRADE
    // (1.5: 56 degrees) is no ramp — a leaning panel, a slide's side — the part is a box like any other.
    if (f && f[3] < 0.05) { const [a, b, c] = f; const grade = Math.hypot(b, c);
      if (grade > MAX_GRADE) n.steep += 1;
      else { let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9; for (const [x, , z] of pts) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (z < fz0) fz0 = z; if (z > fz1) fz1 = z; }
        fx0 = Math.max(fx0, x0); fx1 = Math.min(fx1, x1); fz0 = Math.max(fz0, z0); fz1 = Math.min(fz1, z1);   // (clipped to the crop)
        const corners = [[fx0, fz0], [fx1, fz0], [fx0, fz1], [fx1, fz1]].map(([x, z]) => a + b * x + c * z); const hi = Math.min(Math.max(...corners), mx[1]), lo = Math.max(Math.min(...corners), mn[1]);
        // (a ROOF is no ramp (the pieces procedure): a slope whose low edge hangs over the piece's bottom by more than 0.3 m stands on
        //  walls — a hut, a porch, a pitched-roof house — and the piece is a box like any other, solid; read as a ramp it was a plane in
        //  the air with nothing under it, and a body walked into the annex of Town's Building 02 under its roof, user 2026-10-29
        //  "why can I just walk in?". A wedge, a kerb's ramp, a tilted slab touch the ground at their low end.)
        // (a ramp's foot is at the piece's own foot, within 0.3 m: a car's windscreen, its foot on the hood a metre over the wheels, read as a ramp
        //  put a plane in the air and a landing block under each level of the body — Town's coupe by the north car park, 2026-10-29. Such a piece is a box.)
        if (PIECES && lo - mn[1] > 0.3) n.steep += 1;   // (the pieces alone: a part read whole — District's tilted escalator body, 3.8 m thick — has its top face's foot that far over its bottom by its thickness, and is the ramp it was)
        else if (hi - lo > 0.05 && Math.min(fx1 - fx0, fz1 - fz0) >= LID_MIN) { cur.branch = 'ramp'; surfaces.push({ minX: ax(fx0), maxX: ax(fx1), minZ: az(fz0), maxZ: az(fz1), maxTop: ay(hi), type: 'plane', y0: ay(a + b * fx0 + c * fz0), gx: Math.round(b * 10000) / 10000, gz: Math.round(c * 10000) / 10000 }); n.ramps += 1;
          // (its landings: a ramp's level faces a body wide, each a floor with a lidded block under it — Town's stair to the small building's roof lands 0.85 m under the roof, a jump; without the landing the roof had no way up, 2026-10-29)
          // (the pieces alone: a part read whole — District's strip light along its cellar road, a slab beside it — has level faces that are no landing, and regenerated with the rule it got three 0.6 m blocks 217 m long along the road, 2026-10-30)
          if (PIECES) for (const r of levels.values()) { if (Math.min(r.maxX - r.minX, r.maxZ - r.minZ) < LID_MIN || (r.maxX - r.minX) * (r.maxZ - r.minZ) < 1 || r.top < lo + 0.3) continue; const lx0 = Math.max(r.minX, x0), lx1 = Math.min(r.maxX, x1), lz0 = Math.max(r.minZ, z0), lz1 = Math.min(r.maxZ, z1); cur.branch = 'landing'; surfaces.push({ minX: ax(lx0 - 0.02), maxX: ax(lx1 + 0.02), minZ: az(lz0 - 0.02), maxZ: az(lz1 + 0.02), maxTop: ay(r.top), type: 'flat', top: ay(r.top) }); obstacles.push({ minX: ax(lx0), maxX: ax(lx1), minZ: az(lz0), maxZ: az(lz1), minY: ay(mn[1]), maxY: ay(r.top), topBuffer: 0.8 }); n.landings += 1; }
          // (THE WALLS UNDER A RAMP (2026-10-29, user "why can I just walk in?"): a wedge with sides — the lean-to shed by Town's Building 02,
          //  its roof coming down to the terrace at the front, walls east, west and back — had its roof as the plane and nothing under
          //  it, and a body walked into the shed from the side under the plane. Its standing faces are walls now, by column, each
          //  column's wall up to the roof there, so a body on the roof is over them and a body beside the shed is held.)
          if (PIECES) { const standing = tris.filter((v) => { const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return false; const ys = v.map((q) => q[1]); return Math.abs(ny) / l < 0.05 && Math.max(...ys) - Math.min(...ys) >= 0.3; }); if (standing.length) { readFaces({ name, tris: standing }, 'ramp-walls'); n.rampWalls += 1; } }
          return; } } } }
  // a box, clipped to the crop. A sheet thinner than 10 cm lying flat (a road marking, a decal) is no box — a floor alone
  // where it is wide, nothing otherwise; a standing sheet thinner than 4 cm (a pane) gets 4 cm. The box's top is a
  // surface where the top is wide, and also where the box is no taller than a step (a kerb, a tread, a low wall: the
  // sim holds a body against any box without a lid, however low — a 2 cm marking read as a wall shut a road)
  let ox0 = bx0, ox1 = bx1, oz0 = bz0, oz1 = bz1; if (ox1 - ox0 < 0.04) { ox0 -= 0.02; ox1 += 0.02; n.panes += 1; } if (oz1 - oz0 < 0.04) { oz0 -= 0.02; oz1 += 0.02; n.panes += 1; }
  cur.branch = 'box'; const box = { minX: ax(ox0), maxX: ax(ox1), minZ: az(oz0), maxZ: az(oz1), minY: ay(mn[1]), maxY: ay(mx[1]) };
  if (wide || dy <= STEP) { box.topBuffer = 0.8; const s = { minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }; if (!wide) { s.lid = 1; n.lowLids += 1; } else if ((bx1 - bx0) * (bz1 - bz0) < LID_AREA) { s.lid = 1; n.lids += 1; } else n.floors += 1; surfaces.push(s); }
  obstacles.push(box); n.boxes += 1; };
// THE MODEL'S FACES, first (the pieces procedure): every triangle of every part kept, in 2 m buckets, so a floor can ask what lies
// over it — a floor with less than a body's height of air over it (1.9 m: a foundation slab under a building's ground floor, the
// street face under a plinth, a shelf under a table) is no floor: each was a room of the grid's nodes nobody stands in — Town's
// 100 by 64 m slab 1.6 m under the east half carried 4,800 of them.
const B = 2, buckets = new Map(); const bk = (i, k) => i * 100000 + k;
if (PIECES) for (const part of partsOf()) for (const v of part.tris) { const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); const ax0 = Math.min(...xs), ax1 = Math.max(...xs), az0 = Math.min(...zs), az1 = Math.max(...zs); if (ax1 < x0 || ax0 > x1 || az1 < z0 || az0 > z1) continue;
  const ux = v[1][0] - v[0][0], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vz = v[2][2] - v[0][2]; if (Math.abs(uz * vx - ux * vz) < 1e-7) continue;   // (a standing face covers no column)
  for (let i = Math.floor(ax0 / B); i <= Math.floor(ax1 / B); i += 1) for (let k = Math.floor(az0 / B); k <= Math.floor(az1 / B); k += 1) { const key = bk(i, k); let l = buckets.get(key); if (!l) { l = []; buckets.set(key, l); } l.push(v); } }
const faceAbove = (px, pz, y) => { let above = Infinity; const l = buckets.get(bk(Math.floor(px / B), Math.floor(pz / B))); if (!l) return above;
  for (const [p, q, s] of l) { const d = (q[2] - s[2]) * (p[0] - s[0]) + (s[0] - q[0]) * (p[2] - s[2]); const l1 = ((q[2] - s[2]) * (px - s[0]) + (s[0] - q[0]) * (pz - s[2])) / d, l2 = ((s[2] - p[2]) * (px - s[0]) + (p[0] - s[0]) * (pz - s[2])) / d, l3 = 1 - l1 - l2; if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; const h = l1 * p[1] + l2 * q[1] + l3 * s[1]; if (h > y + 0.1 && h < above) above = h; } return above; };
n.lowFloors = 0; n.parts = 0; n.excluded = 0; n.invisible = 0;   // (the first pass counted them too)
for (const part of partsOf()) { if (part.faces) readFaces(part); else readPart(part); }
if (PIECES) console.log(`pieces: the parts are the meshes' separable pieces; ${n.shapes} shapes (big, hollow or sloped on top) and the ${FACES.join(', ') || 'no'} nodes read face by face: ${n.faceFloors} floors, ${n.faceWalls} walls, ${n.faceSlopes} slopes, ${n.faceBlocks} blocks under the ground's raised floors, ${n.columnWalls} planes of standing faces read by columns, ${n.splitWalls} slanted faces cut into lengths, ${n.flights} flights of ${n.flightTreads} treads read as slopes, ${n.lowFloors} floors with no room over them left out; ${n.flightPieces} pieces read for their treads, ${n.landings} ramps' landings, ${n.splits} pieces split into a box and the faces over it (${n.crowns} with a crown box), ${n.rampWalls} ramps given the walls under them`);
// ---- one terrace, one height, across the parts: flat floors (not lids) that touch and lie within 5 mm of each other take the
// highest — the terrace at Town's west home is two ground pieces, 9.46 u here and 9.47 there, and the two units of a 2v2 pair stood a
// hair apart (the pass within a piece, readFaces, is not enough)
if (PIECES) { const flats = surfaces.filter((s) => s.type === 'flat' && !s.lid); let changed = true, rounds = 0; while (changed && rounds < 20) {   // (the pieces alone, 2026-10-30: District's data, read whole, keeps its floors' heights as committed — 22 of them would rise a centimetre or two) changed = false; rounds += 1;
  for (let i = 0; i < flats.length; i += 1) { const a = flats[i]; for (let j = i + 1; j < flats.length; j += 1) { const b = flats[j]; if (a.top === b.top || Math.abs(a.top - b.top) > 0.02) continue; if (a.maxX < b.minX - 0.12 || b.maxX < a.minX - 0.12 || a.maxZ < b.minZ - 0.12 || b.maxZ < a.minZ - 0.12) continue; const h = Math.max(a.top, b.top); a.top = h; a.maxTop = h; b.top = h; b.maxTop = h; changed = true; } } } }
// ---- RAMP (a map's own data): a flight of stacked treads read as one slope — RAMP="x0,x1,z0,z1,lowY,highY,axis;..." — the
// rectangle's boxes topping between lowY and highY go, their lids with them, and one plane rises from lowY at the low end
// to highY at the high end along the axis (+x, -x, +z or -z); the user's call on District's stair by the balcony, 2026-10-29.
// A GABLE (2026-10-30, user: "it's a two way slopes" — the glass skylight on Building 02's roof, Town): axis ^x or ^z — the
// rectangle's boxes go as above, and two planes rise from lowY at both ends to highY at the middle, a ridge across the axis;
// its two ENDS are walls (user 2026-10-30, "the sides are not blocked so the unit walks into the cboxes"): 4 cm boxes along
// each end by quarter-metre columns, each up to the roof's height there — the gable's triangle — so a body on the roof
// steps off its end (the lips pass lids a wall topping at a surface) and a body beside the end is held.
let ramped = 0, gableWalls = 0; cur.name = '(pass)'; cur.info = ''; cur.branch = 'RAMP';
for (const spec of (process.env.RAMP ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [rx0, rx1, rz0, rz1, lo, hi] = spec.slice(0, spec.lastIndexOf(',')).split(',').map(Number); const axis = spec.slice(spec.lastIndexOf(',') + 1).trim();
  const R = { x0: ax(rx0), x1: ax(rx1), z0: az(rz0), z1: az(rz1), lo: ay(lo), hi: ay(hi) }; const inside = (b) => b.minX >= R.x0 - 0.2 && b.maxX <= R.x1 + 0.2 && b.minZ >= R.z0 - 0.2 && b.maxZ <= R.z1 + 0.2;
  for (let i = obstacles.length - 1; i >= 0; i -= 1) { const o = obstacles[i]; if (inside(o) && o.maxY <= R.hi + 0.2 && o.minY >= R.lo - 0.2) { obstacles.splice(i, 1); ramped += 1; } }
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (inside(s) && s.maxTop <= R.hi + 0.2 && s.maxTop >= R.lo - 0.2) surfaces.splice(i, 1); }
  const rise = R.hi - R.lo; const X = axis.endsWith('x');
  if (axis.startsWith('^')) { const m = X ? (R.x0 + R.x1) / 2 : (R.z0 + R.z1) / 2; const g = Math.round((rise / (X ? m - R.x0 : m - R.z0)) * 10000) / 10000;
    surfaces.push({ minX: R.x0, maxX: X ? m : R.x1, minZ: R.z0, maxZ: X ? R.z1 : m, maxTop: R.hi, type: 'plane', y0: R.lo, gx: X ? g : 0, gz: X ? 0 : g });
    surfaces.push({ minX: X ? m : R.x0, maxX: R.x1, minZ: X ? R.z0 : m, maxZ: R.z1, maxTop: R.hi, type: 'plane', y0: R.hi, gx: X ? -g : 0, gz: X ? 0 : -g });
    const C = 0.25 * SCALE, tt = 0.02 * SCALE, half = X ? m - R.x0 : m - R.z0, r2 = (v) => Math.round(v * 100) / 100; const s0 = X ? R.x0 : R.z0, sEnd = X ? R.x1 : R.z1;
    for (let s = s0; s < sEnd - 1e-6; s += C) { const s1 = Math.min(s + C, sEnd); const top = R.lo + rise * (1 - Math.abs((s + s1) / 2 - m) / half); if (top - R.lo < 0.05) continue;
      for (const e of X ? [R.z0, R.z1] : [R.x0, R.x1]) { obstacles.push(X ? { minX: r2(s), maxX: r2(s1), minZ: r2(e - tt), maxZ: r2(e + tt), minY: R.lo, maxY: r2(top) } : { minX: r2(e - tt), maxX: r2(e + tt), minZ: r2(s), maxZ: r2(s1), minY: R.lo, maxY: r2(top) }); gableWalls += 1; } }
    continue; }
  const along = X ? R.x1 - R.x0 : R.z1 - R.z0; const g = Math.round((rise / along) * 10000) / 10000; const up = axis.startsWith('+');
  surfaces.push({ minX: R.x0, maxX: R.x1, minZ: R.z0, maxZ: R.z1, maxTop: R.hi, type: 'plane', y0: up ? R.lo : R.hi, gx: X ? (up ? g : -g) : 0, gz: !X ? (up ? g : -g) : 0 }); }
if (ramped || gableWalls) console.log(`ramp: ${ramped} boxes of treads replaced by the map's RAMP slopes${gableWalls ? `, ${gableWalls} walls along the gables' ends` : ''}`);
// ---- STAIRS read as slopes: a run of three or more boxes side by side along one axis — each no deeper than 1.6 m, their
// tops rising a tenth to a step (0.65 m) from one to the next, their sides within 10 cm of each other — is a flight of
// treads, and becomes one plane from the floor before the first tread to the top of the last; the treads' boxes and lids
// go. A surface lying just over the flight's top — within 1.5 m, the top of the block of earth a stair is cut down into,
// the base sheet — is cut away over the flight: the stair's opening (user 2026-10-29, "make stairs slope, make cboxes
// simple", the station's several entrances). Runs are read before the lip pass, so no tread is promoted first.
const cutOver = (x0, x1, z0, z1, yAbove, yBelow) => { let cut = 0; const clip = (s, minX, maxX, minZ, maxZ) => { if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return null; const c = { ...s, minX, maxX, minZ, maxZ }; if (s.type === 'plane') { c.y0 = Math.round((s.y0 + s.gx * (minX - s.minX) + s.gz * (minZ - s.minZ)) * 100) / 100; c.maxTop = Math.round(Math.min(s.maxTop, Math.max(...[[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].map(([x, z]) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ)))) * 100) / 100; } return c; };
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (s.maxTop <= yAbove || s.maxTop >= yBelow || s.maxX <= x0 || s.minX >= x1 || s.maxZ <= z0 || s.minZ >= z1) continue; surfaces.splice(i, 1); cut += 1;
    const ix0 = Math.max(s.minX, x0), ix1 = Math.min(s.maxX, x1); for (const c of [clip(s, s.minX, x0, s.minZ, s.maxZ), clip(s, x1, s.maxX, s.minZ, s.maxZ), clip(s, ix0, ix1, s.minZ, z0), clip(s, ix0, ix1, z1, s.maxZ)]) if (c) surfaces.push(c); } return cut; };
let flights = 0, treads = 0, openings = 0; const flightLog = []; cur.branch = 'stairs';
for (const axis of ['x', 'z']) { const a0 = axis === 'x' ? 'minX' : 'minZ', a1 = axis === 'x' ? 'maxX' : 'maxZ', c0 = axis === 'x' ? 'minZ' : 'minX', c1 = axis === 'x' ? 'maxZ' : 'maxX';
  const cand = obstacles.filter((o) => o[a1] - o[a0] <= 1.6 * SCALE && o[c1] - o[c0] >= 0.6 * SCALE && o.maxY - o.minY >= 0.1 * SCALE && !o.void);
  const groups = new Map(); for (const o of cand) { const k = Math.round(o[c0] / 0.4) + ',' + Math.round(o[c1] / 0.4); let l = groups.get(k); if (!l) { l = []; groups.set(k, l); } l.push(o); }
  for (const l of groups.values()) { if (l.length < 3) continue; l.sort((p, q) => p[a0] - q[a0]); let run = [l[0]], dir = 0;
    const flush = () => { if (run.length >= 3) { const tops = run.map((o) => o.maxY); const lowFirst = tops[0] < tops[tops.length - 1]; const hi = Math.max(tops[0], tops[tops.length - 1]), tLow = Math.min(tops[0], tops[tops.length - 1]);
        // the top tread stays a step (a body steps from it onto the landing, as it did); the plane runs over the other treads,
        // from the lowest tread's top at the far end up to the top tread's edge — the floor below the flight is a step down
        const hiTread = lowFirst ? run[run.length - 1] : run[0]; const rest = run.filter((o) => o !== hiTread); const full = { minX: Math.min(...run.map((o) => o.minX)), maxX: Math.max(...run.map((o) => o.maxX)), minZ: Math.min(...run.map((o) => o.minZ)), maxZ: Math.max(...run.map((o) => o.maxZ)) };
        const R = { minX: Math.min(...rest.map((o) => o.minX)), maxX: Math.max(...rest.map((o) => o.maxX)), minZ: Math.min(...rest.map((o) => o.minZ)), maxZ: Math.max(...rest.map((o) => o.maxZ)) }; const along = R[a1] - R[a0]; const g = Math.round(((hi - tLow) / along) * 10000) / 10000;
        for (const o of rest) { const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); } treads += rest.length;
        for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (s.lid && s.minX >= R.minX - 0.2 && s.maxX <= R.maxX + 0.2 && s.minZ >= R.minZ - 0.2 && s.maxZ <= R.maxZ + 0.2 && rest.some((o) => Math.abs(o.maxY - s.maxTop) < 0.1)) surfaces.splice(i, 1); }
        surfaces.push({ ...R, maxTop: hi, type: 'plane', y0: lowFirst ? tLow : hi, gx: axis === 'x' ? (lowFirst ? g : -g) : 0, gz: axis === 'z' ? (lowFirst ? g : -g) : 0 }); flights += 1;
        const cut = cutOver(full.minX, full.maxX, full.minZ, full.maxZ, hi + 0.2, hi + 1.5 * SCALE); if (cut) openings += 1;
        flightLog.push(`${axis} x ${(full.minX / SCALE + cx).toFixed(1)}..${(full.maxX / SCALE + cx).toFixed(1)} z ${(full.minZ / SCALE + cz).toFixed(1)}..${(full.maxZ / SCALE + cz).toFixed(1)} ${(tLow / SCALE + GROUND).toFixed(2)}->${(hi / SCALE + GROUND).toFixed(2)} m, ${run.length} treads, the top one kept${cut ? ', ' + cut + ' surfaces cut over it' : ''}`); } run = []; dir = 0; };
    for (let i = 1; i < l.length; i += 1) { const p = run.length ? run[run.length - 1] : null; const o = l[i]; if (!p) { run = [o]; continue; } const d = o.maxY - p.maxY; const ad = Math.abs(d); const ok = o[a0] - p[a1] <= 0.4 && o[a0] - p[a1] >= -0.2 && o[a0] > p[a0] + 0.2 && o.minY < p.maxY - 0.1 && ad >= 0.1 * SCALE && ad <= STEPU && (dir === 0 || Math.sign(d) === dir);   // (side by side, not stacked: the next starts past the last and does not sit on its top)
      if (ok) { run.push(o); dir = Math.sign(d); } else { flush(); run = [o]; } } flush(); } }
if (flights) console.log(`stairs: ${flights} flights of ${treads} treads read as slopes, ${openings} with a surface cut over their top (the opening)`);
if (process.env.STAIR_LOG) for (const s of flightLog) console.log('   ', s);
// ---- a wall whose top meets a floor is stepped onto, not held against: the sim holds a body against a lidless box until
// the body's centre is a metre over its top (physics.js, topBuffer 4), so a wall ending at a floor's level — a wall under
// the balcony it carries, a tunnel's wall topping 20 cm under the road, the second tread of a stair whose boxes all rise
// from one base — stood as an invisible lip across the floor (user 2026-10-29, three spots). A box with no lid whose top
// lies within a step under, or a metre over... no: within a step under or up to a metre under a surface touching its
// footprint gets the lid's buffer (0.8) and a lid; passes repeat, a tread's new lid lifting the next.
let promoted = 0; cur.branch = 'lip';
for (let pass = 0; pass < 40; pass += 1) { const cell = 16, grid = new Map(); const at = (i, k) => i + ',' + k;
  for (const s of surfaces) for (let i = Math.floor(s.minX / cell); i <= Math.floor(s.maxX / cell); i += 1) for (let k = Math.floor(s.minZ / cell); k <= Math.floor(s.maxZ / cell); k += 1) { let l = grid.get(at(i, k)); if (!l) { l = []; grid.set(at(i, k), l); } l.push(s); }
  let changed = 0; const m = 1.2;   // (0.3 m around the box)
  for (const o of obstacles) { if (o.topBuffer != null) continue; let hit = false;
    for (let i = Math.floor((o.minX - m) / cell); i <= Math.floor((o.maxX + m) / cell) && !hit; i += 1) for (let k = Math.floor((o.minZ - m) / cell); k <= Math.floor((o.maxZ + m) / cell) && !hit; k += 1) for (const s of grid.get(at(i, k)) ?? []) { if (s.maxX < o.minX - m || s.minX > o.maxX + m || s.maxZ < o.minZ - m || s.minZ > o.maxZ + m) continue;
        // (a plane's height AT the box, not its top: the ramp's high end lidded a rail segment at its foot; and a box narrower than
        //  0.3 m both ways — a rail, a bar — gets a lid only where it rises from the surface (its bottom within 0.1 m of it): a rail
        //  0.5 m over a stair's treads, lidded, was a surface the step rule stood a body on, and the body hopped over the rail)
        //  (both for the pieces alone, 2026-10-30: District's data, read whole, keeps its lids as committed — 40 walls topping at a sloped road's height would gain one)
        const h = s.type === 'plane' && PIECES ? s.y0 + s.gx * (Math.max(s.minX, Math.min((o.minX + o.maxX) / 2, s.maxX)) - s.minX) + s.gz * (Math.max(s.minZ, Math.min((o.minZ + o.maxZ) / 2, s.maxZ)) - s.minZ) : s.maxTop;
        const narrow = PIECES && Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < 1.2;
        if (h >= o.maxY - STEPU && h <= o.maxY + 4 && (!narrow || h >= o.minY - 0.4)) { hit = true; break; } }
    if (!hit) continue; o.topBuffer = 0.8; surfaces.push({ minX: o.minX - 0.08, maxX: o.maxX + 0.08, minZ: o.minZ - 0.08, maxZ: o.maxZ + 0.08, maxTop: o.maxY, type: 'flat', top: o.maxY, lid: 1 }); changed += 1; }
  promoted += changed; if (!changed) break; }
if (promoted) console.log(`lips: ${promoted} walls topping at a floor's level given a lid and the lid's buffer`);
// ---- HOLE (a map's own data): rectangles of the model's metres where every surface topping over a height is cut away —
// HOLE="x0,x1,z0,z1,above;..." — the opening of a stair cut down into a block of earth whose top is read as a floor
// (District's station stair: the block tops at 0.22 m over treads from 0.09 m down, and a body walked over the trench).
// A surface over the hole keeps its parts outside it, up to four; a plane keeps its slope, its corner height moved with it.
let holed = 0; cur.branch = 'HOLE';
for (const spec of (process.env.HOLE ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [hx0, hx1, hz0, hz1, above] = spec.split(',').map(Number); const H = { x0: ax(hx0), x1: ax(hx1), z0: az(hz0), z1: az(hz1), y: ay(above) };
  const clip = (s, minX, maxX, minZ, maxZ) => { if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return null; const c = { ...s, minX, maxX, minZ, maxZ }; if (s.type === 'plane') { c.y0 = Math.round((s.y0 + s.gx * (minX - s.minX) + s.gz * (minZ - s.minZ)) * 100) / 100; c.maxTop = Math.round(Math.min(s.maxTop, Math.max(...[[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].map(([x, z]) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ)))) * 100) / 100; } return c; };
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (s.maxTop <= H.y || s.maxX <= H.x0 || s.minX >= H.x1 || s.maxZ <= H.z0 || s.minZ >= H.z1) continue; surfaces.splice(i, 1); holed += 1;
    const ix0 = Math.max(s.minX, H.x0), ix1 = Math.min(s.maxX, H.x1); for (const c of [clip(s, s.minX, H.x0, s.minZ, s.maxZ), clip(s, H.x1, s.maxX, s.minZ, s.maxZ), clip(s, ix0, ix1, s.minZ, H.z0), clip(s, ix0, ix1, H.z1, s.maxZ)]) if (c) surfaces.push(c); } }
if (holed) console.log(`hole: ${holed} surfaces cut around the map's HOLE rectangles`);
// ---- VOID (a map's own data): rectangles of the model's metres where there is no world — the dark beside the station
// plaza, inside the crop because the plaza is — VOID="x0,x1,z0,z1;..." — each a wall 30 m tall, so a body never walks
// there on the sim's street-level nothing
let voids = 0; cur.branch = 'VOID';
for (const spec of (process.env.VOID ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [vx0, vx1, vz0, vz1] = spec.split(',').map(Number); obstacles.push({ minX: ax(vx0), maxX: ax(vx1), minZ: az(vz0), maxZ: az(vz1), minY: ay(GROUND - 30), maxY: ay(GROUND + 30) }); voids += 1; }
if (voids) console.log(`void: ${voids} walls of nothing from the map's VOID rectangles`);
// ---- TRIM (a map's own data): rectangles of the model's metres where every box topping over a height is cut back to the
// rectangle's edge — TRIM="x0,x1,z0,z1,above;..." — for a part read whole whose bounding box runs on past the thing it is:
// District's two handrail boards along the wide stair down to the underground, 18.5 m long and falling 9.8 m, were a box
// each 9.8 m tall over their whole length, and held the street east of the stair's parapet, where the boards run 6 to 8 m
// under the deck (user 2026-10-30, "blocking the way on the ground floor"). A box the rectangle spans across — its whole
// width in the other axis — loses the part inside the rectangle and keeps the rest; its lid is cut the same way. A box the
// rectangle only touches is left alone.
let trimmed = 0; cur.branch = 'TRIM';
for (const spec of (process.env.TRIM ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [tx0, tx1, tz0, tz1, above] = spec.split(',').map(Number); const T = { x0: ax(tx0), x1: ax(tx1), z0: az(tz0), z1: az(tz1), y: ay(above) };
  const cut = (list, eligible) => { for (let i = list.length - 1; i >= 0; i -= 1) { const b = list[i]; if (!eligible(b) || b.maxX <= T.x0 + 0.01 || b.minX >= T.x1 - 0.01 || b.maxZ <= T.z0 + 0.01 || b.minZ >= T.z1 - 0.01) continue;
      const spansZ = b.minZ >= T.z0 - 0.01 && b.maxZ <= T.z1 + 0.01, spansX = b.minX >= T.x0 - 0.01 && b.maxX <= T.x1 + 0.01; if (!spansZ && !spansX) continue;
      list.splice(i, 1); trimmed += 1; const parts = []; if (spansZ) { if (b.minX < T.x0) parts.push({ ...b, maxX: T.x0 }); if (b.maxX > T.x1) parts.push({ ...b, minX: T.x1 }); } else { if (b.minZ < T.z0) parts.push({ ...b, maxZ: T.z0 }); if (b.maxZ > T.z1) parts.push({ ...b, minZ: T.z1 }); }
      for (const q of parts) if (q.maxX - q.minX >= 0.05 && q.maxZ - q.minZ >= 0.05) list.push(q); } };
  cut(obstacles, (o) => o.maxY > T.y); cut(surfaces, (s) => s.lid && s.maxTop > T.y); }
if (trimmed) console.log(`trim: ${trimmed} boxes and lids cut back at the map's TRIM rectangles`);
if (n.cut) console.log(`cut: ${n.cut} boxes along the diagonals of the map's CUT parts`);
mkdirSync(outDir, { recursive: true });
const out = { key, transform: { scale: SCALE, cx, cz, ground: GROUND, exclude: EXCLUDE, ceil: null, parts: true, pieces: PIECES, faces: FACES, hole: process.env.HOLE ?? '', trim: process.env.TRIM ?? '', cut: [...CUT] }, halfX: Math.round(halfX * 10) / 10, halfZ: Math.round(halfZ * 10) / 10, spawns: {}, obstacles, surfaces };
writeFileSync(`${outDir}/${key}.json`, JSON.stringify(out));
console.log(`${key}: ${n.parts} parts — ${n.out} outside the crop, ${n.below} under the street, ${n.above} over the ceiling, ${n.tiny} tiny, ${n.markings} flat markings, ${n.mass} blocks of earth (their tops kept), ${n.invisible} invisible, ${n.excluded} excluded; ${obstacles.length} boxes (${n.lids} with a lid, ${n.lowLids} low ones with a lid, ${n.floors} with a floor on top, ${n.panes} sheets given 4 cm), ${surfaces.length} surfaces (${n.ramps} ramps, ${n.sheets} flat sheets); halfX ${out.halfX} halfZ ${out.halfZ}`);
