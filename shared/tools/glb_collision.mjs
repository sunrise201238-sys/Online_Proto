// COLLISION FROM A GLB — ONE RULE: WHAT A BODY CAN STAND ON IS FLOOR; WHAT STANDS IN ITS WAY IS A BOX ON IT.
// The model's triangles (world space, metres) are rasterised into CELL-metre columns. A column knows the
// horizontal surfaces that cross its centre (the floors a body could stand on), the heights its steep faces
// span (the things that stand or hang there), and its highest point.
//   its FLOOR    the top of the lowest stack of surfaces (surfaces within SLAB of each other are one floor)
//                with HEADROOM of surface-free air above it; the next surface up is its roof — so a doorway,
//                a garage, an underpass are floor, their roof a CEILING box. Floors reach PIT_MAX below the
//                street: a sunken yard is a floor, the rims around it are its walls.
//   what STANDS  a steep face rising from the floor (a wall, a fence, a car's side): a box on that floor;
//   what HANGS   a steep face over the floor low enough to hit a body (a barrier arm, a beam): a box in the
//                air (a body hops it or ducks it; a round passes a thin one).
// From the street the floor is flooded over neighbours no more than a STEP (the sim's SURFACE_STEP_HEIGHT,
// 2.6 units = 0.65 m, the model's tallest kerb: a kerb is no obstacle) up or down, through columns a body passes
// (nothing standing taller than LOW_MAX, nothing hanging it can neither duck nor hop):
//   a SLOPE     a sloped stretch of floor, in any direction, one fitted plane: a plane surface, skirted where its
//               side stands more than a step above the floor beside it;
//   STAIRS      a stretch steeper than a slope (up to STAIR_MAX_DEG) is a plane too: a body climbs it smoothly;
//   a DECK      any other raised (or sunken) floor, each stretch of cells within SLAB of one another one region at
//               its own height: a flat surface, with a box beneath it so its side is a wall to a body more than a
//               step below (topBuffer 0.8); over a walked passage (a yard's edge overhanging the street) the box is
//               a slab down to the passage's roof;
//   a KERB      any step between two walked floors up to KERB_MAX (a kerb, a raised pavement's edge, a platform's):
//               climbed on the step itself — the high floor's first cell is a ramp from the low floor to the high,
//               and the high floor's body starts a cell further in; a body below is never lifted before the line;
//               solid ground beyond such a step (a flat floor GROUND_MIN wide, more than GROUND_MIN squared in area,
//               nothing under it but the street) is walked too — an object's top is hollow or narrower;
//   LOW COVER   a thing a body hops onto from what it can stand on beside it (the floor, or low cover it already
//               hopped onto: a car's bonnet, then its roof), no more than LOW_MAX above that and CHAIN_MAX above
//               the floor the hops started from: a box like a deck's (topBuffer 0.8) with a floor on top;
//   a WALL      anything else that stands — slim as a thing and no taller than a fence (FENCE_TALL) it is a FENCE
//               (a round passes, nothing stands on it); a slim thing taller than that is a wall even when
//               it is a single plane (a bus's side), and a slim run no taller than a fence that rises from under a
//               floor the same on both of its sides is a SEAM of the model's terrain tiles: nothing stands there;
//   the VOID    a column no floor of which a body reaches, with nothing standing in it (nothing there, or only the
//               model's hidden plates), is outside the model: narrower than GROUND_MIN it is a gap between the
//               model's tiles and takes the floor beside it; wider, it is no floor and a wall VOID_WALL tall — the
//               world's edge (the sim stands a body on the street wherever nothing covers the point, so the void
//               must be a wall for a body not to drop into nothing).
// Equal-height columns merge into rectangles; everything is written in game units (SCALE per metre, the crop
// centre at the origin, the street at y 0).
// usage: node glb_collision.mjs <file.glb> <key> <x0> <x1> <z0> <z1> <out dir>
//   env: SCALE=4 GROUND=-0.5 CELL=0.25 EXCLUDE=UFO_33 MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 CEIL=inf DUMP=1
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [, , file, key, ...rest] = process.argv;
const [x0c, x1c, z0c, z1c] = rest.slice(0, 4).map(Number); const outDir = rest[4];
const SCALE = Number(process.env.SCALE ?? 4), GROUND = Number(process.env.GROUND ?? -0.5), CELL = Number(process.env.CELL ?? 0.25);
const MARGIN = Number(process.env.MARGIN ?? 2), LOW_MAX = Number(process.env.LOW_MAX ?? 1.5), WALK_MAX = Number(process.env.WALK_MAX ?? 6), HEADROOM = Number(process.env.HEADROOM ?? 2);
const STEP = 2.6 / SCALE;         // SURFACE_STEP_HEIGHT (shared/src/sim/constants.js) in metres: a floor this much higher is stepped onto
const FLOOR_MIN = 0.125;          // a floor nearer the street than this is the street
const SLAB = 0.25;                // surfaces this close in a column are one floor (a slab on a road, a kerb's chamfer); farther apart they are two (a bench's seat over a pavement)
const DECK_Q = 0.25;              // merge classes (1 unit) for slab bottoms, beams, rims, passage floors and low-cover tops; what is written is the model's height (a deck its region's mean, a top its own)
const FENCE_MAX = 0.35;           // a thing no thicker than this is a fence, a railing, a post: rounds pass it, nothing stands on it
const CHAIN_MAX = 3;              // the most a body climbs by hopping part to part (a car, a truck's step), above the floor it started from
const OBJECT_MAX = 3;             // a thing wider than this both ways is ground (a plaza, a roof): stepped onto from a floor, never climbed from another thing
const PIT_MAX = Number(process.env.PIT_MAX ?? 3);   // (a map's own, env PIT_MAX: Dust's basin by the east wall goes 5 m under the street and is walked, 2026-10-22)                // a floor sloping down from the street is read this far below it
const UNDER_STREET = Number(process.env.UNDER_STREET ?? 0.12);   // (a map's own: Town 0.12, its plates lie just under the street; the Skeld 3, nothing of it lies under the street but space) the street's own band: a FLAT (or steep) face whose highest point lies more than this under the street datum is the model's hidden underside — the plates under the terraces and the plateau, the terrain tiles' bottoms — and is not read; a SLOPED face is a ramp going down (a garage's, 13 cm under the street at its top and 2 m under at its foot) and is read however deep; a road 10 cm under the street is read. Also the SEAM rule's band
const CEIL = Number(process.env.CEIL ?? Infinity);   // (a map's own, metres over the street: the Skeld 2.5, its walls' tops; none for Town) the map's ceiling: no face at or above it is read, and nothing's top at or above it is stood on — a ship's interior has a roof the model leaves open
const VOID_WALL = 25;             // a column with no surface and nothing standing, in a stretch of such columns GROUND_MIN or wider, is outside the model: a wall this tall (above a flight's ceiling), the world's edge
const DUCK = 4.45 / SCALE;        // a thing hanging this high over the floor is passed under: the body's collision window ends 2 units over its centre, 2.45 over its feet
const RAMP_MIN_DEG = 3, RAMP_MAX_DEG = 25, RAMP_TOL = 0.15, RAMP_MIN_CELLS = 6, RAMP_MIN_LEN = 3, RAMP_MIN_RISE = 0.15, SEG = 8;   // slopes: the grades that are planes (the model's roads and ramps stay under 15 degrees), the plane's tolerance, the least cells, the least length along the gradient (cells) and the least rise over it, skirt segments (cells)
const STAIR_MAX_DEG = 50;         // a stretch steeper than a slope, up to this, is a flight of steps: a plane too (the model's flights run 30–45 degrees; a body climbs a plane smoothly, treads would step it)
const KERB_MAX = 1.5;             // the tallest edge between two walked floors that is climbed on its own first cell (the model's raised pavements and platforms); taller is a wall
const GROUND_MIN = 1.5;           // a solid flat floor this wide across (and more than this squared in area) beyond a step is ground a body walks up onto — a raised pavement's bay, a platform; narrower is an object (a hedge, a planter), hollow is one too (a car's roof over its seats): hopped, never walked
const FENCE_TALL = 2.0;           // a slim thing taller than this over the floor beside it is a wall (a bus's side, a wall's plane), not a fence: rounds stop at it
const SEAM_TALL = 3.0;            // a slim run no taller than this, rising from under a floor the same on both of its sides, is a seam of the model's terrain tiles: nothing stands there (a building's wall plane is taller)
const FACE_MIN_DEG = 1, FACE_MIN_AREA = 3;   // the model's own sloped faces are read as ramps, their plane exact: at least this lean (a street's long gentle grade; flatter is a deck) and this area in m2 (a step's tread is less)
const CEIL_MIN = 2.5;             // a roof this far above a floor gets a box (lower: a jumping body would be shoved by it)
const BAND = 0.1, BANDS = 80;     // the heights vertical faces span, in 0.1 m bands up to 8 m
const EXCLUDE = new Set((process.env.EXCLUDE ?? 'UFO_33').split(',').filter(Boolean));
mkdirSync(outDir, { recursive: true });
// ---- GLB -> world triangles -> the columns
const buf = readFileSync(file); const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12; const chunks = []; while (off < buf.length) { const len = dv.getUint32(off, true); chunks.push(buf.subarray(off + 8, off + 8 + len)); off += 8 + len; }
const json = JSON.parse(new TextDecoder().decode(chunks[0])); const bin = chunks[1];
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const [T, sz] = COMP[a.componentType]; const n = NUM[a.type];
  const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = bv.byteStride ?? sz * n; const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k += 1) { const v = new T(bin.buffer, start + k * stride, n); for (let c = 0; c < n; c += 1) out[k * n + c] = v[c]; } return { data: out, n, count: a.count }; }
const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n) => { if (n.matrix) return n.matrix; const [tx, ty, tz] = n.translation ?? [0, 0, 0]; const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0, (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0, (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1]; };
const xf = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const X0 = x0c - MARGIN, X1 = x1c + MARGIN, Z0 = z0c - MARGIN, Z1 = z1c + MARGIN;
const nx = Math.ceil((X1 - X0) / CELL), nz = Math.ceil((Z1 - Z0) / CELL), N = nx * nz;
const topAll = new Float64Array(N).fill(-Infinity);   // the column's highest point (relative to the street, later)
const lowAll = new Float64Array(N).fill(Infinity);   // the lowest point a steep face reaches in the column (a terrain seam rises from under the street)
const bands = new Uint8Array(N * BANDS);               // vertical faces: which 0.1 m bands they span, per column
const inter = new Array(N);                            // horizontal surfaces crossing the cell centre: heights
const interUp = new Array(N);   // of those, the heights reached by a face that faces UP: a one-sided face seen only from below (a roof's underside, a lintel, a stair's soffit) is a ceiling, never a floor
const facePlanes = [];   // the model's own sloped faces (facing up, lean FACE_MIN_DEG..STAIR_MAX_DEG, FACE_MIN_AREA or more): the plane h = a + b x + c z over the street and the cells the face covers — read as ramps before any plane is fitted through cells
const facePlane = (a, b, c, lean, area) => { const nX = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), nY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); const B = -nX / nY, C = -nZ / nY; const fp = { a: a[1] - GROUND - B * a[0] - C * a[2], b: B, c: C, lean, area, cells: [] }; facePlanes.push(fp); return fp; };
const exMinX = new Float32Array(N).fill(Infinity), exMaxX = new Float32Array(N).fill(-Infinity), exMinZ = new Float32Array(N).fill(Infinity), exMaxZ = new Float32Array(N).fill(-Infinity);   // where the solid samples lie inside the cell
const extend = (j, px, pz) => { if (px < exMinX[j]) exMinX[j] = px; if (px > exMaxX[j]) exMaxX[j] = px; if (pz < exMinZ[j]) exMinZ[j] = pz; if (pz > exMaxZ[j]) exMaxZ[j] = pz; };
const cellOf = (px, pz) => { const i = Math.floor((px - X0) / CELL), k = Math.floor((pz - Z0) / CELL); return (i < 0 || k < 0 || i >= nx || k >= nz) ? -1 : k * nx + i; };
const markEdge = (px, pz, y) => { const j = cellOf(px, pz); if (j < 0) return; if (y > topAll[j]) topAll[j] = y; const b = Math.floor((y - GROUND) / BAND); if (b >= 0) bands[j * BANDS + Math.min(BANDS - 1, b)] = 1; if (y - GROUND >= STEP) extend(j, px, pz); };
const markInterior = (j, px, pz, y, up) => { if (y > topAll[j]) topAll[j] = y; const q = Math.round(y * 20) / 20; const l = inter[j] ?? (inter[j] = []); if (!l.includes(q)) l.push(q); if (up) { const u = interUp[j] ?? (interUp[j] = []); if (!u.includes(q)) u.push(q); } if (y - GROUND >= STEP) extend(j, px, pz); };
let triCount = 0, used = 0;
const walk = (ni, parent) => { const n = json.nodes[ni]; if (EXCLUDE.has(n.name)) return; const m = mul(parent, trs(n));
  if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) {
    const ds = !!json.materials?.[p.material]?.doubleSided; const pos = accessor(p.attributes.POSITION);   /* (a double-sided material is seen from both sides: the Skeld's, the Backrooms' and Dust's are all double-sided; Town's are not) */ const idx = p.indices != null ? accessor(p.indices).data : Float64Array.from({ length: pos.count }, (_, k) => k);
    const w = new Float64Array(pos.count * 3); for (let k = 0; k < pos.count; k += 1) { const v = xf(m, pos.data[k * 3], pos.data[k * 3 + 1], pos.data[k * 3 + 2]); w[k * 3] = v[0]; w[k * 3 + 1] = v[1]; w[k * 3 + 2] = v[2]; }
    for (let t = 0; t + 2 < idx.length; t += 3) {
      triCount += 1;
      const a = [w[idx[t] * 3], w[idx[t] * 3 + 1], w[idx[t] * 3 + 2]], b = [w[idx[t + 1] * 3], w[idx[t + 1] * 3 + 1], w[idx[t + 1] * 3 + 2]], c = [w[idx[t + 2] * 3], w[idx[t + 2] * 3 + 1], w[idx[t + 2] * 3 + 2]];
      const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]), minZ = Math.min(a[2], b[2], c[2]), maxZ = Math.max(a[2], b[2], c[2]);
      if (maxX < X0 || minX > X1 || maxZ < Z0 || minZ > Z1) continue;
      used += 1;
      const d = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
      const area2 = Math.abs(d), e1 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), e3 = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
      const s = (e1 + e2 + e3) / 2, area3 = Math.sqrt(Math.max(0, s * (s - e1) * (s - e2) * (s - e3)));
      const steep = area3 > 1e-9 && area2 / 2 < 0.5 * area3;   // the face leans more than 60 deg from flat: a wall, not a floor
      if (Math.max(a[1], b[1], c[1]) < GROUND - UNDER_STREET && (steep || area2 / 2 >= Math.cos(RAMP_MIN_DEG * Math.PI / 180) * area3)) continue;   // (under the street, a flat face is the model's hidden plate — the ground plane around the town's slab, the plate under the map, the tiles' bottoms — and a steep one its skirt; a sloped face is a ramp going down: read)
      if (Math.min(a[1], b[1], c[1]) >= GROUND + CEIL) continue;   // (at or above the map's ceiling nothing is read: a ship's wall tops are no floors)
      if (steep) { for (const [p, q] of [[a, b], [b, c], [c, a]]) { const len = Math.hypot(q[0] - p[0], q[2] - p[2]); const steps = Math.max(1, Math.ceil(len / (CELL / 2))); for (let u = 0; u <= steps; u += 1) { const f = u / steps; markEdge(p[0] + (q[0] - p[0]) * f, p[2] + (q[2] - p[2]) * f, p[1] + (q[1] - p[1]) * f); } }
        // a steep face spans, in each cell it covers, the heights it reaches there — not its whole height everywhere (a
        // face's top edge passing over an opening is no wall below it); its lowest sample is the column's
        // (sampled over its whole area, not its edges alone: a gate's leaf, one quad of 2 by 2 m, left the cells between its
        // edges reading floor and top rail only, and the gate read open — a body walked through the closed gate at the long
        // path's end, user 2026-10-22. A face's own area is wall wherever it is; an opening in a wall is outside its faces.)
        const cm = new Map(); const take = (x, z, y) => { const j = cellOf(x, z); if (j < 0) return; const e = cm.get(j); if (!e) cm.set(j, [y, y]); else { if (y < e[0]) e[0] = y; if (y > e[1]) e[1] = y; } };
        const n = Math.max(1, Math.ceil(Math.max(e1, e2, e3) / (CELL / 2)));
        for (let i = 0; i <= n; i += 1) for (let k = 0; k <= n - i; k += 1) { const u = i / n, v = k / n, ww = 1 - u - v; take(a[0] * ww + b[0] * u + c[0] * v, a[2] * ww + b[2] * u + c[2] * v, a[1] * ww + b[1] * u + c[1] * v); }
        for (const [j, [lo, hi]] of cm) { if (lo < lowAll[j]) lowAll[j] = lo; const b0 = Math.max(0, Math.floor((lo - GROUND) / BAND)), b1 = Math.min(BANDS - 1, Math.floor((hi - GROUND) / BAND)); for (let bb = b0; bb <= b1; bb += 1) bands[j * BANDS + bb] = 1; }
        continue; }
      if (Math.abs(d) < 1e-9) continue;
      // (the winding tells a one-sided face's side: a glTF front face runs counter-clockwise seen from its front, so d < 0 is a face that faces up; a double-sided material's face is seen from both sides)
      const up = ds || d < 0; const lean = Math.acos(Math.min(1, area2 / 2 / area3)) * 180 / Math.PI; const fp = (up && area3 >= FACE_MIN_AREA && lean >= FACE_MIN_DEG && lean <= STAIR_MAX_DEG) ? facePlane(a, b, c, lean, area3) : null;
      const i0 = Math.max(0, Math.floor((minX - X0) / CELL)), i1 = Math.min(nx - 1, Math.floor((maxX - X0) / CELL)), k0 = Math.max(0, Math.floor((minZ - Z0) / CELL)), k1 = Math.min(nz - 1, Math.floor((maxZ - Z0) / CELL));
      for (let i = i0; i <= i1; i += 1) for (let k = k0; k <= k1; k += 1) { const px = X0 + (i + 0.5) * CELL, pz = Z0 + (k + 0.5) * CELL;
        const l1 = ((b[0] - px) * (c[2] - pz) - (c[0] - px) * (b[2] - pz)) / d, l2 = ((c[0] - px) * (a[2] - pz) - (a[0] - px) * (c[2] - pz)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; const yy = l1 * a[1] + l2 * b[1] + l3 * c[1]; if (yy < GROUND + CEIL) { markInterior(k * nx + i, px, pz, yy, up); if (fp) fp.cells.push(k * nx + i); } }   // (a sample at or above the map's ceiling is no floor: a slope's top past a low roof)
    }
  }
  for (const c of n.children ?? []) walk(c, m); };
for (const r of json.scenes[json.scene ?? 0].nodes) walk(r, I());
// ---- each column's floors (relative to the street) and the roof over each
// A column may hold several FLOORS, lowest first: every stack of surfaces (surfaces within SLAB of each other
// are one floor: a slab on a road, a kerb's chamfer; a bench's seat over a pavement is not) with HEADROOM of surface-free air above it; the next
// surface up is that floor's roof. Things standing in that air (steep faces: walls, fences, posts, a car's
// side) do not take a floor away — they are read with it as what stands on it. Floors reach PIT_MAX below the
// street. Which of a column's floors a body walks is decided by the flood below: a road under a bridge and the
// bridge are two floors of one column; a plate under the town that no body can get down to is none.
// With each floor come the things over it below head height — steep faces and lone surfaces, pieces that touch
// one piece: what STANDS on the floor (its first piece starts within a STEP of the floor: a wall, a fence, a
// car — st, grown through every piece above it a body cannot fit under) and what HANGS over it in a body's way (its bottom under DUCK — the body's
// collision window ends 2 units over its centre, 2.45 over its feet): a bar or a seat a body hops (hg: no
// higher than LOW_MAX, and with a steep face in it — a lone horizontal plane is a ceiling, a slab over a crawl
// space) keeps the floor; a low ceiling means no floor at this stack.
const H = new Float64Array(N); const layersOf = new Array(N);   // per column: [{ top, st, hg, next }], lowest first, at most 4
for (let j = 0; j < N; j += 1) {
  H[j] = Number.isFinite(topAll[j]) ? Math.max(0, topAll[j] - GROUND) : 0;
  const l = inter[j]; if (!l) continue;   // nothing horizontal: the void (read below), or a wall when something stands
  l.sort((a, b) => a - b);
  let runs = null; const bandRuns = () => { if (runs) return runs; runs = []; let start = -1; for (let b = 0; b <= BANDS; b += 1) { const on = b < BANDS && bands[j * BANDS + b]; if (on && start < 0) start = b; if (!on && start >= 0) { runs.push([start * BAND, b * BAND]); start = -1; } } return runs; };
  const L = []; let a = 0;
  while (a < l.length && L.length < 4) {
    if (l[a] - GROUND < -PIT_MAX) { a += 1; continue; }
    let b = a, top = l[a] - GROUND;
    while (b + 1 < l.length && l[b + 1] - GROUND <= top + SLAB) { b += 1; top = l[b] - GROUND; }
    { const u = interUp[j]; let t = NaN; for (let c = a; c <= b; c += 1) if (u && u.includes(l[c])) t = l[c] - GROUND; if (Number.isNaN(t)) { a = b + 1; continue; } top = t; }   // (the stack's floor is its highest face that faces up; a stack of one-sided faces seen only from below — a roof's underside, a lintel, a stair's soffit — is a ceiling, no floor)
    if (top > WALK_MAX + 0.01) break;
    const ps = [];   // [lo, hi, steep]: steep 1 when a steep face is part of the piece
    for (const [lo, hi] of bandRuns()) if (hi > top + STEP && lo < top + HEADROOM) ps.push([lo, hi, 1]);
    for (let c = b + 1; c < l.length; c += 1) { const s = l[c] - GROUND; if (s >= top + HEADROOM) break; ps.push([s, s, 0]); }
    // (pieces that touch are one thing — a car's sides and its roof, a bench's legs and its seat; a gap of air
    // between them, however thin, is two things: a gate arm under an overpass's edge is hopped, the edge ignored)
    ps.sort((p, q) => p[0] - q[0]); const merged = []; for (const p of ps) { const m = merged[merged.length - 1]; if (m && p[0] <= m[1] + 0.05) { if (p[1] > m[1]) m[1] = p[1]; m[2] |= p[2]; } else merged.push([p[0], p[1], p[2]]); }
    let st = NaN, hg = null, over = top; const first = merged[0];
    // (what stands has a steep face in it; a lone plane within a STEP of the floor — a bench's seat, a bumper's top
    // seen from inside — is a floor of its own a step up, read below as the ceiling of this one)
    if (first && first[0] <= top + STEP && first[2]) { st = first[1];
      // (what stands grows through whatever is above it with less than a body's height of air between — a car's
      // sides and the roof over them, a bench under a table; air a body fits in ends the thing)
      for (let q = 1; q < merged.length && merged[q][0] - st < DUCK; q += 1) if (merged[q][1] > st) st = merged[q][1]; }
    else if (first && first[0] - top < DUCK) { if (first[2] && first[1] - top <= LOW_MAX) { hg = first; over = first[1]; } else { a = b + 1; continue; } }
    let next = Infinity; for (let c = b + 1; c < l.length; c += 1) { const s = l[c] - GROUND; if (s > over + STEP) { next = s; break; } }
    if (Number.isNaN(st) && next < top + HEADROOM) { a = b + 1; continue; }
    // (bot: the stack's lowest surface; under: the surface beneath the stack, if any — the flood below reads a floor
    // without HEADROOM over the surface beneath it as covering it: a windshield over a car's floor, a bonnet over the street)
    L.push({ top: Math.abs(top) < 0.03 ? 0 : top, st, hg, next, bot: l[a] - GROUND, under: a > 0 ? l[a - 1] - GROUND : NaN }); a = b + 1;
  }
  if (L.length) layersOf[j] = L;
}
// a floor a body passes: nothing standing on it taller than LOW_MAX (a hop clears less; what hangs over it is, by
// the reading above, always hopped or ducked)
const passableL = (L) => !(L.st - L.top > LOW_MAX);
// ---- THE FLOOR a body reaches: flooded from the street over steps, column by column and floor by floor.
// An object's part — a floor that is the top of what stands on the floor below it (a car's bumper, a hedge's
// top, a wall's coping) — is stepped onto from the ground, never from another part: a car is climbed by hops
// (the low-cover chain), not walked up part by part. The mark of a part carries to a floor it leads onto that
// covers what is beneath it without HEADROOM (a windshield over the car's floor), and ends at one that does not
// (the rim beside a pier's top: a slab over a passage, or a floor over nothing — the model's hidden plane under a
// terrace is not a floor it covers).
const reach = new Uint8Array(N), reachBits = new Uint8Array(N), onThing = new Uint8Array(N);
const isTop = (LL, lj) => lj > 0 && Math.abs(LL[lj].top - LL[lj - 1].st) <= 0.1;
const covering = (x) => !Number.isNaN(x.under) && x.bot - x.under < HEADROOM;
// (cappedTop: a standing thing's top the map's ceiling took — still a thing, a box to its own top, never stood on)
const BODY_CELLS = Math.ceil(1.15 / SCALE / CELL - 0.5); let narrowFloor = 0; const narrowTop = new Float64Array(N).fill(NaN);   // (the floor the narrow-floor rule took back from a column, the highest: the dead-floor rule reads it)
const parapet = new Uint8Array(N); let parapets = 0;   // (a raised strip narrower than GROUND_MIN with a drop beyond it: not floor, low cover without a top — the terrace's parapet)   // (the cells a body centred in a cell covers each way: its radius 1.15 units over the cell)
const floorH = new Float64Array(N).fill(NaN), ceilH = new Float64Array(N).fill(NaN), standTop = new Float64Array(N).fill(NaN), cappedTop = new Float64Array(N).fill(NaN); const hang = new Array(N).fill(null);
const slabUnder = new Float64Array(N).fill(NaN), passTop = new Float64Array(N).fill(NaN);   // a floor over a walked passage: the passage's roof (the slab's underside) and the passage's floor
{ const st = []; for (let j = 0; j < N; j += 1) { const L = layersOf[j]; if (!L) continue; for (let li = 0; li < L.length; li += 1) if (Math.abs(L[li].top) <= 0.1 && passableL(L[li])) { reachBits[j] |= 1 << li; st.push(j * 4 + li); } }
  const nearestTop = (j, h) => { const L = layersOf[j]; if (!L) return NaN; let f = NaN; for (const x of L) if (Number.isNaN(f) || Math.abs(x.top - h) < Math.abs(f - h)) f = x.top; return f; };
  const flood = () => { while (st.length) { const code = st.pop(); const j = (code / 4) | 0, li = code & 3; const f = layersOf[j][li].top; const i = j % nx, k = (j - i) / nx;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const jj = kk * nx + ii; const LL = layersOf[jj]; if (!LL) continue;
      const i2 = ii + di, k2 = kk + dk; const j2 = (i2 >= 0 && k2 >= 0 && i2 < nx && k2 < nz) ? k2 * nx + i2 : -1;
      for (let lj = 0; lj < LL.length; lj += 1) { const bit = 1 << lj; if (!passableL(LL[lj])) continue;
        const part = isTop(LL, lj); const fromPart = (onThing[j] >> li) & 1;
        if (part && fromPart) continue;   // (an object's part is not entered from another part)
        const mark = part || (fromPart && covering(LL[lj]));
        if (reachBits[jj] & bit) { if (mark || !((onThing[jj] >> lj) & 1)) continue; onThing[jj] &= ~bit; st.push(jj * 4 + lj); continue; }   // (reached before as a part, now from the ground: the ground reading wins)
        const t = LL[lj].top, rise = t - f; if (Math.abs(rise) > STEP) continue;
        // (a step onto a band narrower than the body is a wall to it: the rise over two cells stays within 0.5 m —
        // stairs and 45-degree slopes climb, steeper hillsides do not)
        const f2 = j2 >= 0 ? nearestTop(j2, t) : NaN; if (!Number.isNaN(f2) && f2 - f > 0.5) continue;
        reachBits[jj] |= bit; if (mark) onThing[jj] |= bit; st.push(jj * 4 + lj); } } } };
  flood();
  // GROUND BEYOND A STEP: a floor more than a STEP above a walked floor beside it (up to KERB_MAX) is walked all the
  // same when it is ground — solid to the street (nothing under it but the model's plate at street level) and a flat
  // floor GROUND_MIN wide across and more than GROUND_MIN squared in area (a raised pavement's bay, a platform); an object's
  // top (a car's bonnet, a truck's roof over its seats, a hedge, a planter) is hollow or narrower and stays an object,
  // hopped, never walked. The kerb rule below carries the body up such an edge on a ramp. Seeded and flooded until none is left.
  { const tried = new Uint8Array(N * 4); const solid = (x) => Number.isNaN(x.under) || x.under < FLOOR_MIN;
    const near = (jj, t) => { const LL = layersOf[jj]; if (!LL) return -1; for (let lj = 0; lj < LL.length; lj += 1) if (Math.abs(LL[lj].top - t) <= SLAB && passableL(LL[lj]) && solid(LL[lj]) && !(reachBits[jj] & (1 << lj))) return lj; return -1; };
    for (;;) { let seeded = false;
      for (let j = 0; j < N; j += 1) { if (!reachBits[j]) continue; const L = layersOf[j]; const i = j % nx, k = (j - i) / nx;
        for (let li = 0; li < L.length; li += 1) { if (!(reachBits[j] & (1 << li))) continue; const f = L[li].top;
          for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const jj = kk * nx + ii; const LL = layersOf[jj]; if (!LL) continue;
            for (let lj = 0; lj < LL.length; lj += 1) { const rise = LL[lj].top - f; if (rise <= STEP || rise > KERB_MAX || tried[jj * 4 + lj] || (reachBits[jj] & (1 << lj)) || !passableL(LL[lj]) || !solid(LL[lj])) continue;   // (up only: a drop onto a lower floor would take the flood through a doorway into a building's hidden interior plate)
              // the flat region this floor belongs to, over cells not yet walked
              const cells = []; const q = [jj * 4 + lj]; tried[jj * 4 + lj] = 1; let i0 = nx, i1 = -1, k0 = nz, k1 = -1;
              while (q.length) { const c = q.pop(); cells.push(c); const cj = (c / 4) | 0, cl = c & 3; const t = layersOf[cj][cl].top; const ci = cj % nx, ck = (cj - ci) / nx; if (ci < i0) i0 = ci; if (ci > i1) i1 = ci; if (ck < k0) k0 = ck; if (ck > k1) k1 = ck;
                for (const [ei, ek] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + ei, nk = ck + ek; if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue; const nj = nk * nx + ni; const nl = near(nj, t); if (nl < 0 || tried[nj * 4 + nl]) continue; tried[nj * 4 + nl] = 1; q.push(nj * 4 + nl); } }
              const w = (i1 - i0 + 1) * CELL, d = (k1 - k0 + 1) * CELL;
              if (Math.min(w, d) >= GROUND_MIN && cells.length * CELL * CELL > GROUND_MIN * GROUND_MIN) { for (const c of cells) { reachBits[(c / 4) | 0] |= 1 << (c & 3); st.push(c); } seeded = true; } } } } }
      if (!seeded) break; flood(); } }
  // NARROW FLOOR: a floor a body cannot stand on is not floor — a railing's top, a post's, a ledge a hand wide. The
  // flood climbs them by their bevels (a rise within a step, a cell at a time, under the two-cell limit) and read the
  // east terrace's railing as a floor a step up, laid a ramp onto it, and a body walked over the railing and off the
  // terrace. A body centred in a cell covers the cells around it (BODY_CELLS each way); a reached floor cell is stood
  // in when every cell of that block has a reached floor within a step of its height, and a reached floor cell no
  // stood-in cell covers is no floor: its reach is taken back, and what stands there is a thing again — the railing
  // slim, low and free-standing: a fence. The dead floor's twin (a slot narrower than a body is not floor either).
  const narrowPass = () => { const within = (jj, t) => { const LL = layersOf[jj]; if (!LL) return false; for (let lj = 0; lj < LL.length; lj += 1) if (((reachBits[jj] >> lj) & 1) && Math.abs(LL[lj].top - t) <= STEP) return true; return false; };
    for (let changed = true; changed;) { changed = false; const stood = new Uint8Array(N * 4);
      for (let j = 0; j < N; j += 1) { if (!reachBits[j]) continue; const i = j % nx, k = (j - i) / nx; const L = layersOf[j];
        for (let li = 0; li < L.length; li += 1) { if (!((reachBits[j] >> li) & 1)) continue; const t = L[li].top; let ok = 1;
          for (let dk = -BODY_CELLS; dk <= BODY_CELLS && ok; dk += 1) for (let di = -BODY_CELLS; di <= BODY_CELLS; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || !within(kk * nx + ii, t)) { ok = 0; break; } }
          stood[j * 4 + li] = ok; } }
      for (let j = 0; j < N; j += 1) { if (!reachBits[j]) continue; const i = j % nx, k = (j - i) / nx; const L = layersOf[j];
        for (let li = 0; li < L.length; li += 1) { if (!((reachBits[j] >> li) & 1) || stood[j * 4 + li]) continue; const t = L[li].top; let covered = 0;
          for (let dk = -BODY_CELLS; dk <= BODY_CELLS && !covered; dk += 1) for (let di = -BODY_CELLS; di <= BODY_CELLS && !covered; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const jj = kk * nx + ii; const LL = layersOf[jj]; if (!LL) continue;
            for (let lj = 0; lj < LL.length; lj += 1) if (stood[jj * 4 + lj] && Math.abs(LL[lj].top - t) <= STEP) { covered = 1; break; } }
          if (!covered) { reachBits[j] &= ~(1 << li); onThing[j] &= ~(1 << li); if (!(narrowTop[j] >= t)) narrowTop[j] = t; narrowFloor += 1; changed = true; } } } } };
  narrowPass();
  // PARAPET: a raised strip narrower than GROUND_MIN, standing a hop over a walked floor on one side and over a drop on
  // another. The flood reached the east terrace's parapet (a metre thick, 0.9 m up, a 3.5 m drop beyond) over its
  // corner block, and the kerb rule laid ramps onto it along its length: a body walked up and off the terrace. Read
  // cell by cell (a terrace's rim is L-shaped; no box around it is narrow): a reached floor cell is WIDE when every
  // cell within GROUND_MIN/2 of it has a reached floor within a step of its height; one no wide cell covers, with a
  // walked floor more than a step and no more than KERB_MAX under it within GROUND_MIN in one direction and a floor
  // more than KERB_MAX under it (or nothing) within GROUND_MIN in another, is a parapet: not floor (its reach taken
  // back), and low cover without a top — a body walking stops at it, a hop crosses it (the user's call: a low wall is
  // jumped, 2026-10-19), nothing stands on it. A planter a step up on every side stays what it was; a catwalk over
  // drops on both sides stays a floor.
  { const R = Math.ceil(GROUND_MIN / 2 / CELL), reachOut = Math.round(GROUND_MIN / CELL);
    const within = (jj, t) => { const LL = layersOf[jj]; if (!LL) return false; for (let lj = 0; lj < LL.length; lj += 1) if (((reachBits[jj] >> lj) & 1) && Math.abs(LL[lj].top - t) <= STEP) return true; return false; };
    const highest = (jj) => { const LL = layersOf[jj]; if (!LL) return NaN; let h = -Infinity; for (const x of LL) if (x.top > h) h = x.top; return h; };
    const walkedBelow = (jj, t) => { const LL = layersOf[jj]; if (!LL) return false; for (let lj = 0; lj < LL.length; lj += 1) if (((reachBits[jj] >> lj) & 1) && t - LL[lj].top > STEP && t - LL[lj].top <= KERB_MAX) return true; return false; };
    const wide = new Uint8Array(N * 4);
    for (let j = 0; j < N; j += 1) { if (!reachBits[j]) continue; const i = j % nx, k = (j - i) / nx; const L = layersOf[j];
      for (let li = 0; li < L.length; li += 1) { if (!((reachBits[j] >> li) & 1)) continue; const t = L[li].top; let ok = 1;
        for (let dk = -R; dk <= R && ok; dk += 1) for (let di = -R; di <= R; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || !within(kk * nx + ii, t)) { ok = 0; break; } }
        wide[j * 4 + li] = ok; } }
    const flagged = [];
    for (let j = 0; j < N; j += 1) { if (!reachBits[j]) continue; const i = j % nx, k = (j - i) / nx; const L = layersOf[j];
      for (let li = 0; li < L.length; li += 1) { if (!((reachBits[j] >> li) & 1) || wide[j * 4 + li]) continue; const t = L[li].top; let covered = 0;
        for (let dk = -R; dk <= R && !covered; dk += 1) for (let di = -R; di <= R && !covered; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const jj = kk * nx + ii; const LL = layersOf[jj]; if (!LL) continue;
          for (let lj = 0; lj < LL.length; lj += 1) if (wide[jj * 4 + lj] && Math.abs(LL[lj].top - t) <= STEP) { covered = 1; break; } }
        if (covered) continue;
        // (a parapet stands between the floor and the drop: the hop on one side, the drop on the side opposite — a roof's
        // strip with a landing a hop under it on one side and the ground beyond its end on another is the roof's edge
        // step, not a parapet; its top went, and a body crossing the roof fell into the house, user 2026-10-19)
        const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dk]) => { let low = Infinity, walked = false; for (let q = 1; q <= reachOut; q += 1) { const ii = i + di * q, kk = k + dk * q; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) break; const jj = kk * nx + ii; if (walkedBelow(jj, t)) walked = true; const h = highest(jj); if (Number.isNaN(h)) { low = -Infinity; break; } if (h < low) low = h; }
          return { hop: walked, drop: t - low > KERB_MAX }; });
        if ((sides[0].hop && sides[1].drop) || (sides[1].hop && sides[0].drop) || (sides[2].hop && sides[3].drop) || (sides[3].hop && sides[2].drop)) flagged.push(j * 4 + li); } }
    for (const c of flagged) { const j = (c / 4) | 0, li = c & 3; reachBits[j] &= ~(1 << li); onThing[j] &= ~(1 << li); parapet[j] = 1; } parapets = flagged.length; }
  narrowPass();   // (what the parapets left: their bevelled edges, a cell wide, covered by nothing now)
  // the column's floor: its lowest reached floor — unless that is a passage under another reached floor (HEADROOM
  // between its top and the next surface, the upper floor's underside): then the upper floor is the column's and
  // the passage stays walked beneath it (a yard's edge overhanging the street, a bridge), the floor's body a slab
  // reaching down only to the passage's roof. A floor that is a lone plane over its passage — its underside its own
  // surface — is the model's hidden interior (the plate under a raised yard): the floor stands on the ground, there
  // is no passage. A column no floor of which is reached keeps its lowest for the record.
  for (let j = 0; j < N; j += 1) { const L = layersOf[j]; if (!L) continue; let li = -1; for (let x = 0; x < L.length; x += 1) if (reachBits[j] & (1 << x)) { li = x; break; }
    if (li >= 0) { let up = -1;
      if (L[li].next >= L[li].top + HEADROOM) for (let x = li + 1; x < L.length; x += 1) if (reachBits[j] & (1 << x) && L[x].top >= L[li].next) { if (L[x].top - L[li].next > 0.01) { slabUnder[j] = L[li].next; passTop[j] = L[li].top; } up = x; break; }
      // (a CRAWL SPACE: a reached floor directly over this one with less than HEADROOM between them — a stair's treads
      // over the plate beneath them, a raised bed's top over its hidden plate — is where the body is; this one is none)
      if (up >= 0) li = up; else while (li + 1 < L.length && (reachBits[j] & (1 << (li + 1))) && L[li + 1].bot - L[li].top < HEADROOM) li += 1; }
    const F = li >= 0 ? L[li] : L[0]; floorH[j] = F.top; standTop[j] = F.st >= CEIL ? NaN : F.st; cappedTop[j] = F.st >= CEIL ? F.st : NaN; hang[j] = F.hg; if (F.next !== Infinity && F.next >= F.top + CEIL_MIN) ceilH[j] = F.next; if (li >= 0) reach[j] = 1; } }
// ---- LIDS: a pit filled and lidded by hand, a data field of the map: every cell of each rect is floor at the given height,
// the model's sunken floor and whatever stood in it below that height gone — the yard's body box fills the pit up to the
// lid ("find the pit, add a lid", user 2026-10-22). env LIDS="x0,z0,x1,z1,h;..." in model metres, h above the street.
const LIDS = (process.env.LIDS ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number)); let lidCells = 0;
for (const [lx0, lz0, lx1, lz1, lh] of LIDS) { const i0 = Math.max(0, Math.floor((lx0 - X0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((lx1 - X0) / CELL) - 1), k0 = Math.max(0, Math.floor((lz0 - Z0) / CELL)), k1 = Math.min(nz - 1, Math.ceil((lz1 - Z0) / CELL) - 1);
  for (let k = k0; k <= k1; k += 1) for (let i = i0; i <= i1; i += 1) { const j = k * nx + i; reach[j] = 1; floorH[j] = lh; if (!(standTop[j] > lh + STEP)) standTop[j] = NaN; if (!(cappedTop[j] > lh + STEP)) cappedTop[j] = NaN; hang[j] = null; slabUnder[j] = NaN; passTop[j] = NaN; ceilH[j] = NaN; narrowTop[j] = NaN; parapet[j] = 0; lidCells += 1; }
  console.log(`lid: x ${lx0}..${lx1} z ${lz0}..${lz1} at ${lh} m: ${(i1 - i0 + 1) * (k1 - k0 + 1)} cells`); }
// ---- the VOID: a column no floor of which a body reaches, with nothing standing in it — nothing there, or only the
// model's hidden plates under it — is outside the model's world (the ground around the town's slab, the margins, the
// world's end north of the terrace). Narrower than GROUND_MIN it is a gap between the model's tiles (a 25 cm slot
// across the terrace: the raster's point fell between two plates) and takes the floor beside it; wider it is no
// floor and a wall VOID_WALL tall, so a body at the world's edge meets a wall and does not drop into nothing (the
// sim stands a body on the street wherever no surface covers the point, so the void had to be a wall, not merely no
// floor). It used to be read as the street; and it was read before the flood, from the surfaces alone, which made
// the garage ramps — every surface of theirs below the street — a wall before a body could walk down them.
const voidWall = new Uint8Array(N); const voidGapCells = [];
{ const isVoid = (j) => !reach[j] && H[j] <= 0.1; const seen = new Uint8Array(N); const gaps = [];
  for (let j = 0; j < N; j += 1) { if (seen[j] || !isVoid(j)) continue; const cells = [j]; seen[j] = 1; let i0 = nx, i1 = -1, k0 = nz, k1 = -1;
    for (let p = 0; p < cells.length; p += 1) { const q = cells[p]; const i = q % nx, k = (q - i) / nx; if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const m = kk * nx + ii; if (seen[m] || !isVoid(m)) continue; seen[m] = 1; cells.push(m); } }
    if (Math.min(i1 - i0 + 1, k1 - k0 + 1) * CELL < GROUND_MIN) { gaps.push(...cells); continue; }
    // (a region wide by its box is not wide everywhere: an L-shaped or ragged void has slivers a cell wide hanging off
    // its body, and each became a 25 m wall — invisible pillars on Dust's yards and terraces (user 2026-10-22). The
    // wall is only where the void is a body wide: cells whose GROUND_MIN square is all void (the grid's outside counts
    // as void), and the cells within that square of them; the rest of the region is gaps.)
    { const R = Math.ceil(GROUND_MIN / 2 / CELL); const core = []; for (const q of cells) { const i = q % nx, k = (q - i) / nx; let ok = 1;
        for (let dk = -R; dk <= R && ok; dk += 1) for (let di = -R; di <= R; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; if (!isVoid(kk * nx + ii)) { ok = 0; break; } } if (ok) core.push(q); }
      const wide = new Uint8Array(N); for (const q of core) { const i = q % nx, k = (q - i) / nx; for (let dk = -R; dk <= R; dk += 1) for (let di = -R; di <= R; di += 1) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) wide[kk * nx + ii] = 1; } }
      for (const q of cells) if (wide[q]) voidWall[q] = 1; else gaps.push(q); } }
  // (a gap takes the floor of a walked column beside it; a gap cell beside gap cells only waits for them; one no floor ever reaches is void)
  let left = gaps; while (left.length) { const next = []; for (const q of left) { const i = q % nx, k = (q - i) / nx; let got = -1;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (reach[n]) { got = n; break; } }
      if (got >= 0) { reach[q] = 1; floorH[q] = floorH[got]; standTop[q] = NaN; hang[q] = null; ceilH[q] = ceilH[got]; } else next.push(q); } if (next.length === left.length) { voidGapCells.push(...next); break; } left = next; } }   // (a gap no floor reaches — a slot walled in by things — joins the tallest thing beside it below, not a 25 m void wall: those stood as invisible pillars, user 2026-10-22)
// ---- RAMPS: sloped stretches of the reached floor along one axis, each one plane
// A cell is sloped when the floor around it rises RAMP_MIN_DEG..RAMP_MAX_DEG mostly along x or along z; cells of
// one direction that touch are one stretch; a plane h = a + b s is fitted through the stretch (twice: cells off
// it by more than RAMP_TOL — a kerb, a bollard's foot — drop out) and the stretch is a ramp when it keeps
// RAMP_MIN_CELLS cells and RAMP_MIN_RISE of rise. kind: 0 none, 1 ramp.
const kind = new Uint8Array(N); const regionOf = new Int32Array(N).fill(-1); const regions = [];
{ const oct = new Int8Array(N).fill(-1); const steep = new Uint8Array(N);   // the gradient's direction (its greater axis and sign: four classes); 1 when the cell is stair-steep
  const fr = (i, k) => (i < 0 || k < 0 || i >= nx || k >= nz || !reach[k * nx + i]) ? NaN : floorH[k * nx + i];
  // (a cell's slope along an axis is the gentler of its two sides, and none when the two disagree in sign — a crest, a
  // trough: a cell beside a kerb takes its own surface's slope, not the kerb's. The centred difference straddled the
  // kerb: it tilted the road's edge row into the pavement's stretch, and the one plane fitted across the step stood
  // the body 0.12 m over the road and 0.12 m into the pavement, with the pavement's own cells dropped to flat decks)
  const slope = (lo, c, hi) => { const d1 = Number.isNaN(lo) ? NaN : (c - lo) / CELL, d2 = Number.isNaN(hi) ? NaN : (hi - c) / CELL; if (Number.isNaN(d1)) return Number.isNaN(d2) ? 0 : d2; if (Number.isNaN(d2)) return d1; if (d1 * d2 <= 0) return 0; return Math.abs(d1) <= Math.abs(d2) ? d1 : d2; };
  const tanMin = Math.tan(RAMP_MIN_DEG * Math.PI / 180), tanRamp = Math.tan(RAMP_MAX_DEG * Math.PI / 180), tanStair = Math.tan(STAIR_MAX_DEG * Math.PI / 180);
  for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) { const j = k * nx + i; if (!reach[j]) continue;
    const c = floorH[j]; const dx = slope(fr(i - 1, k), c, fr(i + 1, k)), dz = slope(fr(i, k - 1), c, fr(i, k + 1)); const g = Math.hypot(dx, dz); if (g < tanMin || g > tanStair) continue;
    oct[j] = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3); steep[j] = g > tanRamp ? 1 : 0; }   // (a diagonal stretch is one class too: its cells agree on the greater axis)
  // the model's own sloped faces first: a face's cells (reached, their floor on the face's plane within RAMP_TOL) are
  // one stretch with the face's own plane, the faces of one plane one stretch — a street's long gentle grade read from
  // the model, not fitted through 5 cm height classes (Dust's 2-degree path of 374 m2 was 25 deck bands and 545 boxes)
  { const byPlane = new Map(); for (const fp of facePlanes) { const key = `${Math.round(fp.b * 1e4)},${Math.round(fp.c * 1e4)},${Math.round(fp.a * 100)}`; const g = byPlane.get(key); if (g) { g.cells.push(...fp.cells); g.area += fp.area; } else byPlane.set(key, { a: fp.a, b: fp.b, c: fp.c, lean: fp.lean, area: fp.area, cells: fp.cells.slice() }); }
    for (const g of [...byPlane.values()].sort((p, q) => q.area - p.area)) { const cells = []; for (const q of new Set(g.cells)) { if (!reach[q] || regionOf[q] >= 0) continue; const h = g.a + g.b * (X0 + (q % nx + 0.5) * CELL) + g.c * (Z0 + (Math.floor(q / nx) + 0.5) * CELL); if (Math.abs(h - floorH[q]) <= RAMP_TOL) cells.push(q); }
      if (cells.length < RAMP_MIN_CELLS) continue; const id = regions.length; for (const q of cells) regionOf[q] = id; regions.push({ id, cells, stairs: g.lean > RAMP_MAX_DEG, face: g }); } }
  for (let j = 0; j < N; j += 1) { if (oct[j] < 0 || regionOf[j] >= 0) continue; const id = regions.length; const cells = []; const st = [j]; regionOf[j] = id;
    while (st.length) { const c = st.pop(); cells.push(c); const i = c % nx, k = (c - i) / nx; for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (oct[n] === oct[j] && steep[n] === steep[j] && regionOf[n] < 0) { regionOf[n] = id; st.push(n); } } }
    regions.push({ id, cells, stairs: steep[j] === 1 }); }
  const xm = (c) => X0 + (c % nx + 0.5) * CELL, zm = (c) => Z0 + (Math.floor(c / nx) + 0.5) * CELL;
  const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  for (const r of regions) {
    let cells = r.cells, a = 0, b = 0, c2 = 0;
    if (r.face) { a = r.face.a; b = r.face.b; c2 = r.face.c; }   // (the model's own face: its plane, its cells already on it)
    else for (let pass = 0; pass < 2 && cells.length >= RAMP_MIN_CELLS; pass += 1) {
      // least squares for h = a + b x + c z (the normal equations, Cramer's rule)
      let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
      for (const q of cells) { const x = xm(q), z = zm(q), h = floorH[q]; n += 1; sx += x; sz += z; sh += h; sxx += x * x; szz += z * z; sxz += x * z; sxh += x * h; szh += z * h; }
      const D = det3([n, sx, sz, sx, sxx, sxz, sz, sxz, szz]); if (Math.abs(D) < 1e-9) { cells = []; break; }
      a = det3([sh, sx, sz, sxh, sxx, sxz, szh, sxz, szz]) / D; b = det3([n, sh, sz, sx, sxh, sxz, sz, szh, szz]) / D; c2 = det3([n, sx, sh, sx, sxx, sxh, sz, sxz, szh]) / D;
      cells = cells.filter((q) => Math.abs(a + b * xm(q) + c2 * zm(q) - floorH[q]) <= RAMP_TOL); }
    const g = Math.hypot(b, c2); const ux = g > 0 ? b / g : 1, uz = g > 0 ? c2 / g : 0;
    let s0 = Infinity, s1 = -Infinity; for (const q of cells) { const s = xm(q) * ux + zm(q) * uz; if (s < s0) s0 = s; if (s > s1) s1 = s; }
    // (a stretch counts by what it does along its gradient — long enough, rising enough; a sloped edge two cells
    // deep is a step, however far it runs the other way)
    const kept = cells.length >= RAMP_MIN_CELLS && s1 - s0 >= (RAMP_MIN_LEN - 1) * CELL - 1e-9 && (r.stairs || g * (s1 - s0) >= RAMP_MIN_RISE);
    for (const q of r.cells) regionOf[q] = -1;
    if (!kept) { r.cells = []; continue; }
    r.a = a; r.b = b; r.c = c2; r.cells = cells; for (const q of cells) { regionOf[q] = r.id; kind[q] = 1; } }
}
// ---- DECKS: the walked floors that are not slopes or the street, each stretch of cells within half of FLOOR_MIN of
// its first cell one region, written at the region's own height (its mean): the model's terrace at 2.35–2.40 m is
// one floor at 2.37, not a patchwork of 0.25 m classes with a one-unit step between them (a body on a class stood up
// to 0.12 m off the model, and the false steps ran 464 m in Town). The tolerance is a floor's own: a 5 cm kerb
// between a road and its pavement is one floor, a 20 cm one is two with a ramp between (a region a whole SLAB wide
// swallowed a pavement's 0.25 m rim, and the body stood 0.24 m under it)
const deckReg = new Int32Array(N).fill(-1); const regH = [];
{ const st = [];
  for (let j = 0; j < N; j += 1) { if (deckReg[j] >= 0 || !reach[j] || kind[j] === 1 || Math.abs(floorH[j]) < FLOOR_MIN) continue;
    const id = regH.length; const seed = floorH[j]; let sum = 0, cnt = 0; deckReg[j] = id; st.push(j);
    while (st.length) { const q = st.pop(); sum += floorH[q]; cnt += 1; const i = q % nx, k = (q - i) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const m = kk * nx + ii;
        if (deckReg[m] >= 0 || !reach[m] || kind[m] === 1 || Math.abs(floorH[m]) < FLOOR_MIN || Math.abs(floorH[m] - seed) > FLOOR_MIN / 2) continue;
        deckReg[m] = id; st.push(m); } }
    regH.push(Math.round((sum / cnt) * 100) / 100); } }
// ---- KERBS: any step between two walked floors (a kerb, a raised pavement's edge, a platform's), up to KERB_MAX,
// is climbed on the step itself: the high floor's first cell at the line becomes a ramp from the low floor at the line
// to the high floor at the cell's far side (a 1.5 m edge: 80 degrees, climbed step by step — the body moves a fifth of
// a unit a tick and takes a STEP a tick), and the high floor's body starts a cell further in, so the body's edge meets
// it only with its feet within a STEP of the top. A body on the low floor is never lifted before the line (a ramp
// laid on the low floor stretched a walk beside a tall kerb through the air, for as far as the ramp ran); a body on
// the high floor sinks into it only within the one cell at its edge. kind: 2 — a kerb cell has no deck of its own,
// the ramp is its floor; noBody marks the cell behind it, a floor with no body beneath.
const qDeck = (v) => Math.round(v / DECK_Q) * DECK_Q;   // (a merge class, for a passage floor's height)
// a column's floor as written: a slope's plane, a deck's region height, else the street
const written = (j) => { if (kind[j] === 1) { const r = regions[regionOf[j]]; return r.a + r.b * (X0 + (j % nx + 0.5) * CELL) + r.c * (Z0 + (Math.floor(j / nx) + 0.5) * CELL); } return deckReg[j] >= 0 ? regH[deckReg[j]] : 0; };
const kerbKey = new Float64Array(N); const kerbInfo = new Map(); const noBody = new Uint8Array(N);
{ const q = (v) => Math.round(v / 0.05) + 200;
  for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) { const j = k * nx + i; if (!reach[j] || kind[j] !== 0) continue;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const li = i - di, lk = k - dk; if (li < 0 || lk < 0 || li >= nx || lk >= nz) continue; const n = lk * nx + li;
      // (the low side may be a slope's cell: the road's plane below a raised strip's edge)
      if (!reach[n] || kind[n] === 2) continue; const lo = written(n), hi = written(j); if (hi - lo < FLOOR_MIN || floorH[j] - floorH[n] > KERB_MAX) continue;
      const axis = di ? 'x' : 'z', dir = di + dk;
      // (one key per kerb line and pair of floors: the rectangles of a key span the line)
      const key = 1 + ((((axis === 'x' ? 0 : 1) * 2 + (dir > 0 ? 0 : 1)) * 2000 + q(lo)) * 2000 + q(hi)) * 4096 + (di ? i : k);
      if (!kerbInfo.has(key)) kerbInfo.set(key, { axis, dir, lo, hi });
      kind[j] = 2; kerbKey[j] = key;
      // (the cell behind: a walked flat floor at the high floor's level, of this region or the next — two regions a few
      // centimetres apart meet at a corner, and the second one's body held the body at the line all the same)
      const bi = i + di, bk = k + dk; if (bi >= 0 && bk >= 0 && bi < nx && bk < nz) { const b2 = bk * nx + bi; if (reach[b2] && kind[b2] === 0 && Math.abs(written(b2) - hi) <= FLOOR_MIN) noBody[b2] = 1; }
      break; } } }
// ---- what stands: a column a body does not walk through. Its top is the standing thing's on a reached floor,
// the column's highest point elsewhere (a car's roof, a building: no floor of theirs is reached).
// (a standing piece no higher than a walked floor beside it is that floor's edge — a kerb's face, a deck's side —
// not a thing: the deck's own body is its wall, and the kerb ramp needs the cell clear)
const thingTop = new Float64Array(N).fill(NaN);
for (let j = 0; j < N; j += 1) { if (reach[j]) { const top = Number.isNaN(standTop[j]) ? cappedTop[j] : standTop[j]; if (Number.isNaN(top)) continue; const i = j % nx, k = (j - i) / nx; let mf = floorH[j];
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (reach[n] && floorH[n] > mf) mf = floorH[n]; }
    if (top > mf + FLOOR_MIN) thingTop[j] = top; }
  // (an unwalked column: what stands on its floor, when something does — a post under a tree's crown is the post, not the
  // crown; else its highest point — a building's roof, an overhang that left it no floor)
  else if (voidWall[j]) thingTop[j] = VOID_WALL; else if (!Number.isNaN(standTop[j]) && standTop[j] - floorH[j] >= STEP) thingTop[j] = standTop[j]; else if (H[j] >= STEP) thingTop[j] = H[j]; else if (H[j] > 0.1) thingTop[j] = H[j]; }
for (const j of voidGapCells) { if (!Number.isNaN(thingTop[j])) continue; const i = j % nx, k = (j - i) / nx; let top = NaN; for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (!Number.isNaN(thingTop[n]) && thingTop[n] < VOID_WALL && (Number.isNaN(top) || thingTop[n] > top)) top = thingTop[n]; } if (!Number.isNaN(top)) thingTop[j] = top; }   // (an unwalked floor over the street, however low, is solid: the sim stands a body on the street wherever no surface covers the point, and a kerb strip no body reaches was walked through at street level into the ditch beyond it, Dust 2026-10-22)
// DEAD FLOOR: a slot a body cannot stand in is not floor. A body (its radius 1.15 units) centred in a cell covers the
// cells around it (BODY_CELLS each way); a cell is stood in when none of those holds a thing more than a step over the
// floor, and a floor cell no stood-in cell covers is dead — a slot between two parts of a machine, the strip behind a
// railing set against a wall. A dead cell joins the tallest thing beside it (the railing against the wall is the wall),
// so no body comes down into the slot from the air to be pushed from one thing into the other (b1022e). The same for
// a floor the narrow-floor rule took back with nothing standing on it — the ledge outside the south-east terrace's
// parapet, a cell wide between the parapet and the rim's drop, walked into from the terrace's corner: it stayed a thing
// at its own height, its box standing from the floor beside it (higher than its top), and a body walked onto it, fell
// into the slot and hung between the rim and the parapet (user 2026-10-19). Joined to the parapet, the slot is parapet.
let deadFloor = 0;
{ const floorOf = (j) => reach[j] ? floorH[j] : narrowTop[j];
  const isFloor = (j) => reach[j] ? Number.isNaN(thingTop[j]) : !Number.isNaN(narrowTop[j]) && thingTop[j] <= narrowTop[j] + FLOOR_MIN;   // (a reached floor cell; or a column whose floor the narrow-floor rule took back, nothing standing on it)
  const blocks = (j, n) => !Number.isNaN(thingTop[n]) && thingTop[n] - floorOf(j) > STEP;
  const stood = new Uint8Array(N);
  for (let j = 0; j < N; j += 1) { if (!reach[j] || !Number.isNaN(thingTop[j])) continue; const i = j % nx, k = (j - i) / nx; let ok = 1;
    for (let dk = -BODY_CELLS; dk <= BODY_CELLS && ok; dk += 1) for (let di = -BODY_CELLS; di <= BODY_CELLS; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; if (blocks(j, kk * nx + ii)) { ok = 0; break; } }
    stood[j] = ok; }
  const fill = [];
  for (let j = 0; j < N; j += 1) { if (!isFloor(j) || stood[j]) continue; const i = j % nx, k = (j - i) / nx; let covered = 0, top = -Infinity;
    for (let dk = -BODY_CELLS; dk <= BODY_CELLS; dk += 1) for (let di = -BODY_CELLS; di <= BODY_CELLS; di += 1) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (stood[n]) covered = 1; if (blocks(j, n) && thingTop[n] > top) top = thingTop[n]; }
    if (!covered && top > -Infinity) fill.push([j, top]); }
  for (const [j, top] of fill) thingTop[j] = top; deadFloor = fill.length; }
// LOW COVER: a thing a body hops onto from what it can stand on beside it — a reached floor, or low cover it
// already hopped onto (a car's bonnet, then its roof) — no more than LOW_MAX above that and no more than
// CHAIN_MAX above the floor the hops started from. Everything else that stands is a WALL. A thin thing (a
// fence, a post: no wider than FENCE_MAX in its cell) is hopped over, not stood on, so nothing hops from it.
const stand = new Float64Array(N).fill(NaN), base = new Float64Array(N).fill(NaN), lowTop = new Float64Array(N).fill(NaN), lowFrom = new Float64Array(N).fill(NaN);
// thick or thin is the thing's property, not one column's: touching columns of things are one thing, and a
// thing whose solid samples span no more than FENCE_MAX one way is thin. The floor a thing stands beside (the
// highest walked floor touching it) is the thing's too: what it is measured from
// (touching things are one thing here — a rail that meets a planter that meets a kiosk — so whether a written
// rectangle is a fence is decided below by the rectangle: slim, free-standing, no taller than a fence over the floor
// beside it; a seam of the model's terrain likewise by the rectangle's slimness)
const thinOf = new Uint8Array(N); const baseOf = new Float64Array(N).fill(NaN); let seams = 0;
{ const seen = new Uint8Array(N);
  for (let j = 0; j < N; j += 1) { if (seen[j] || Number.isNaN(thingTop[j])) continue; const cells = []; const st = [j]; seen[j] = 1; let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, base = NaN;
    while (st.length) { const q = st.pop(); cells.push(q); if (exMinX[q] < a) a = exMinX[q]; if (exMaxX[q] > b) b = exMaxX[q]; if (exMinZ[q] < c) c = exMinZ[q]; if (exMaxZ[q] > d) d = exMaxZ[q]; const i = q % nx, k = (q - i) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (!seen[n] && !Number.isNaN(thingTop[n])) { seen[n] = 1; st.push(n); } else if (reach[n] && Number.isNaN(thingTop[n]) && (Number.isNaN(base) || floorH[n] > base)) base = floorH[n]; } }
    const thin = !(a <= b && c <= d) || Math.min(b - a, d - c) <= FENCE_MAX; for (const q of cells) { if (thin) thinOf[q] = 1; baseOf[q] = base; } } }
const thick = (j) => !thinOf[j];
// wide or narrow is a thing's property too, read over the columns of one height (a car's roof, a building's):
// a thing wider than OBJECT_MAX both ways is ground, not an object — stepped onto from a floor beside it, never
// climbed from another thing (a ledge does not make a roof a floor)
const wideOf = new Uint8Array(N);
{ const seen = new Uint8Array(N); const cls = (q) => Math.round(thingTop[q] / 0.5);
  for (let j = 0; j < N; j += 1) { if (seen[j] || Number.isNaN(thingTop[j])) continue; const cells = []; const st = [j]; seen[j] = 1; let i0 = nx, i1 = -1, k0 = nz, k1 = -1;
    while (st.length) { const q = st.pop(); cells.push(q); const i = q % nx, k = (q - i) / nx; if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (!seen[n] && !Number.isNaN(thingTop[n]) && cls(n) === cls(j)) { seen[n] = 1; st.push(n); } } }
    if (Math.min(i1 - i0 + 1, k1 - k0 + 1) * CELL > OBJECT_MAX) for (const q of cells) wideOf[q] = 1; } }
for (let j = 0; j < N; j += 1) if (reach[j] && Number.isNaN(thingTop[j])) { stand[j] = floorH[j]; base[j] = floorH[j]; }
{ const order = []; for (let j = 0; j < N; j += 1) if (!Number.isNaN(thingTop[j])) order.push(j); order.sort((p, q) => thingTop[p] - thingTop[q]);
  let changed = true;
  while (changed) { changed = false;
    for (const j of order) { if (!Number.isNaN(lowTop[j]) || parapet[j]) continue; const top = thingTop[j]; const i = j % nx, k = (j - i) / nx; let lf = NaN, lb = NaN;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (Number.isNaN(stand[n])) continue;
        if (wideOf[j] && !Number.isNaN(thingTop[n])) continue;   // (a wide thing: from a floor only)
        if (Number.isNaN(lf) || stand[n] > lf) { lf = stand[n]; lb = base[n]; } }
      if (Number.isNaN(lf) || top - lf > LOW_MAX || top - lb > CHAIN_MAX || top >= CEIL) continue;   // (a top at the map's ceiling is stood on by nothing)
      lowTop[j] = top; lowFrom[j] = lf; if (thick(j)) { stand[j] = top; base[j] = lb; } changed = true; } } }
// a thin thing's height is its tallest part (a railing with its posts, a fence with its finials): nothing stands
// on it, so one top for the whole run and one box instead of a post, a rail, a post
{ const seen = new Uint8Array(N);
  for (let j = 0; j < N; j += 1) { if (seen[j] || Number.isNaN(lowTop[j]) || thick(j)) continue; const cells = []; const st = [j]; seen[j] = 1; let mh = lowTop[j];
    while (st.length) { const c = st.pop(); cells.push(c); if (lowTop[c] > mh) mh = lowTop[c]; const i = c % nx, k = (c - i) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (!seen[n] && !Number.isNaN(lowTop[n]) && !thick(n)) { seen[n] = 1; st.push(n); } } }
    for (const c of cells) { lowTop[c] = mh; thingTop[c] = mh; } } }
// ---- classes for merging: decks by region (written at the region's height), low tops in DECK_Q classes (written
// at the thing's own top), walls 2 m up to
// head height then 1 m to 7 m (the flight ceiling), one class above; beams by bottom and top; ceilings by
// bottom and top; rims by the two floors they stand between
const qTall = (h) => h <= 2 ? 2 : h <= 7 ? Math.ceil(h - 1e-9) : 8;
const deckH = new Float64Array(N), deckCode = new Float64Array(N), passDeck = new Float64Array(N), wallKey = new Float64Array(N), wallH = new Float64Array(N), beamKey = new Float64Array(N), ceilKey = new Float64Array(N), rimKey = new Float64Array(N), rimLo = new Float64Array(N).fill(NaN), guardSide = [0, 1, 2, 3].map(() => new Float64Array(N)), guardTop = new Float64Array(N).fill(NaN);
let floorCells = 0, wallCells = 0, ceilCells = 0;
for (let j = 0; j < N; j += 1) {
  // (a kerb cell has no deck: its ramp is its floor; the cell behind a kerb cell has its deck and no body beneath, so a
  // body climbing the ramp meets the deck's body only with its feet within a step of the top)
  if (reach[j]) { floorCells += 1; if (kind[j] === 0 && deckReg[j] >= 0) { deckH[j] = regH[deckReg[j]];
      // (a deck over a walked passage merges apart from the decks standing on the ground: its body is a slab, down to the passage's roof class)
      deckCode[j] = (deckReg[j] + 1) * 512 + (noBody[j] ? 256 : 0) + (Number.isNaN(slabUnder[j]) ? 0 : Math.max(1, Math.floor(slabUnder[j] / DECK_Q) + 1)); }
    if (!Number.isNaN(passTop[j]) && Math.abs(passTop[j]) >= FLOOR_MIN) passDeck[j] = qDeck(passTop[j]);   // (a passage floor off the street needs its own surface)
    if (!Number.isNaN(ceilH[j])) { ceilKey[j] = 3000 + Math.round(ceilH[j] / 0.5) * 64 + Math.min(63, Math.round(H[j])); ceilCells += 1; }
    if (hang[j] !== null) beamKey[j] = 5000 + Math.round(hang[j][0] / DECK_Q) * 64 + Math.min(63, Math.round(hang[j][1] / DECK_Q));
    // RIM: a reached floor that drops by more than a step into a lower reached floor below the street gets a body
    // from that floor up to the street level (a pit's wall); deck bodies cover what stands above the street
    const f = floorH[j]; const i = j % nx, k = (j - i) / nx; let lo = NaN;
    if (kind[j] !== 2) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const n = kk * nx + ii; if (reach[n] && floorH[n] < Math.min(f, 0) - STEP && (Number.isNaN(lo) || floorH[n] < lo)) lo = floorH[n]; }   // (a kerb ramp is the way up, not a rim)
    if (!Number.isNaN(lo)) { rimLo[j] = lo; rimKey[j] = 7000 + (Math.round(lo / DECK_Q) + 64) * 128 + (Math.round(Math.min(f, 0) / DECK_Q) + 64); }
    // GUARD (2026-10-22): a reached floor cell beside a drop of more than a STEP — to a lower floor, a thing's top, or
    // the street where nothing is reached — that no kerb ramp climbs back (a drop within KERB_MAX off a kerb ramp cell is
    // the kerb's own way down) gets a slim box on that edge, a step taller than the floor: a body walking the floor stops
    // at the edge instead of falling (Town's plaza slot and its ledge, Dust's channel beside the raised yard and its
    // ditch: bodies walking the rims fell in, user 2026-10-22). A round and an eye pass it; a jump clears it (the feet
    // rise above its hold). The box straddles the cell's edge a hand wide, so two guards a metre apart leave a body room.
    if (Number.isNaN(thingTop[j])) { const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; const standH = (n) => !Number.isNaN(thingTop[n]) ? thingTop[n] : reach[n] ? floorH[n] : 0;
      for (let q = 0; q < 4; q += 1) { const [di, dk] = dirs[q]; const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue; const d = f - standH(kk * nx + ii);
        if (d > KERB_MAX || (d > STEP && kind[j] !== 2)) { guardTop[j] = f + STEP + 0.1; guardSide[q][j] = 9000 + Math.min(999, Math.round(guardTop[j] / DECK_Q) + 64); } } } }
  // (low cover: DECK_Q classes when something can stand on it, 0.5 m when it is thin — nothing stands on a railing, so its height class is coarse.
  // STANDABLE: a thick thing no taller than WALK_MAX over the floor beside it — a kiosk, a garage, a truck, a tree's crown — is landed on from the
  // air and stood on: 0.5 m classes, a floor on top; taller is a building, and nothing stands on a building)
  // (a standable thing — landed on from the air, its top a floor — is one whose top is under the map's ceiling, as low cover is: a top at or over the ceiling is stood on by nothing, so the thing is a wall — no hop passes over it, no floor lies on it; it used to keep the deck's body (topBuffer 0.8), so a body at the top of its hop sailed over it and came down among the thing's parts)
  if (!Number.isNaN(thingTop[j])) { wallCells += 1; wallH[j] = thingTop[j]; wallKey[j] = parapet[j] ? 1700 + Math.ceil(thingTop[j] / 0.5 - 1e-9) : !Number.isNaN(lowTop[j]) ? (thick(j) ? 1000 + Math.ceil(thingTop[j] / DECK_Q - 1e-9) : 1500 + Math.ceil(thingTop[j] / 0.5 - 1e-9)) : (thick(j) && thingTop[j] - baseOf[j] <= WALK_MAX && thingTop[j] < CEIL) ? 2000 + Math.ceil(thingTop[j] / 0.5 - 1e-9) : voidWall[j] ? 9 : qTall(thingTop[j]); }   // (9: the void, its own class — it never merges with a building's)
}
function rects(vals) { const seen = new Uint8Array(N); const out = [];
  for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) { const j = k * nx + i; if (seen[j] || vals[j] === 0) continue; const v = vals[j];
    let w = 1; while (i + w < nx && !seen[j + w] && vals[j + w] === v) w += 1;
    let d = 1; outer: while (k + d < nz) { for (let c = 0; c < w; c += 1) { const jj = (k + d) * nx + i + c; if (seen[jj] || vals[jj] !== v) break outer; } d += 1; }
    for (let kk = 0; kk < d; kk += 1) for (let c = 0; c < w; c += 1) seen[(k + kk) * nx + i + c] = 1;
    out.push({ x0: X0 + i * CELL, x1: X0 + (i + w) * CELL, z0: Z0 + k * CELL, z1: Z0 + (k + d) * CELL, h: v, i, k, w, d }); }
  return out; }
const maxIn = (r, arr) => { let m = -Infinity; for (let kk = r.k; kk < r.k + r.d; kk += 1) for (let c = r.i; c < r.i + r.w; c += 1) { const v = arr[kk * nx + c]; if (v > m) m = v; } return m; };
const minIn = (r, arr) => { let m = Infinity; for (let kk = r.k; kk < r.k + r.d; kk += 1) for (let c = r.i; c < r.i + r.w; c += 1) { const v = arr[kk * nx + c]; if (v < m) m = v; } return m; };
// only what touches the crop is written: the margin around it is read (a building cut by the crop keeps its
// walls) but lies beyond the boundary, and the valley floor out there is no part of the arena
const inCrop = (r) => r.x1 > x0c - 0.5 && r.x0 < x1c + 0.5 && r.z1 > z0c - 0.5 && r.z0 < z1c + 0.5;
const walls = rects(wallKey).filter(inCrop), decks = rects(deckCode).filter(inCrop), passes = rects(passDeck).filter(inCrop), ceils = rects(ceilKey).filter(inCrop), beams = rects(beamKey).filter(inCrop), rims = rects(rimKey).filter(inCrop);
const rampId = new Float64Array(N); for (let j = 0; j < N; j += 1) if (kind[j] === 1) rampId[j] = regionOf[j] + 1; const rampRects = rects(rampId).filter(inCrop);
let tallOver = 0, tallOverMax = 0;   // (walls below the flight ceiling whose box stands more than 1 m above their lowest column, and the worst case)
// (a low or standable thing's own top: its class only merges — a body on it stands on the model's top, not up to 0.25 m over it)
// (the parapet that was never flooded: a thing's top a hop up, narrower than GROUND_MIN, with a floor more than KERB_MAX
// under it within GROUND_MIN beyond one of its sides, standing a hop (more than a step, no more than KERB_MAX) over the
// floor beside it — the south-east terrace's rim, a thick low thing the generator
// gave a top to, which a body hopped onto and walked off into the road 3 m below (user 2026-10-19). It carries no
// floor either: nothing perches over a drop. A planter in the square, floor a step down on every side, keeps its top.)
const parapetThing = (w) => { if (Math.min(w.w, w.d) * CELL >= GROUND_MIN) return false; const reachOut = Math.round(GROUND_MIN / CELL);
  // (each side, GROUND_MIN out: a walked floor a hop under the top (more than a step, no more than KERB_MAX) — the terrace it stands on;
  // a floor more than KERB_MAX under it — the road beyond; a column with no floor (the rim's own face) is looked past. The hop on
  // one side and the drop on the side opposite, as the cell rule reads it: a parapet stands between the floor and the drop)
  // (the drop is read from what stands beside the thing — a neighbouring thing's top, else the column's walked floor; a column with
  // neither is looked past. A roof's top is no layer of the raster (the floor under it is), so read from the layers the terrace under
  // a pavilion's roof made a drop of every side of a strip of that roof, and the strip lost its top: a body fell through, user 2026-10-19)
  const side = (i, k, di, dk, acc) => { let low = Infinity; for (let q = 1; q <= reachOut; q += 1) { const ii = i + di * q, kk = k + dk * q; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) break; const jj = kk * nx + ii;
      const top = !Number.isNaN(thingTop[jj]) ? thingTop[jj] : reach[jj] ? floorH[jj] : NaN; if (!Number.isNaN(top) && top < low) low = top;
      const LL = layersOf[jj]; if (!LL) continue; for (let lj = 0; lj < LL.length; lj += 1) { const t = LL[lj].top; if (((reachBits[jj] >> lj) & 1) && w.h - t > STEP && w.h - t <= KERB_MAX) acc.hop = true; } }
    if (w.h - low > KERB_MAX) acc.drop = true; };
  const N = { hop: false, drop: false }, S = { hop: false, drop: false }, W = { hop: false, drop: false }, E = { hop: false, drop: false };
  for (let ci = w.i; ci < w.i + w.w; ci += 1) { side(ci, w.k, 0, -1, N); side(ci, w.k + w.d - 1, 0, 1, S); }
  for (let kk = w.k; kk < w.k + w.d; kk += 1) { side(w.i, kk, -1, 0, W); side(w.i + w.w - 1, kk, 1, 0, E); }
  return (N.hop && S.drop) || (S.hop && N.drop) || (W.hop && E.drop) || (E.hop && W.drop); };
let thingParapets = 0;
for (const w of walls) { w.key = w.h; w.low = w.key >= 1000 && w.key < 2000; w.stand = w.key >= 2000; w.parapet = w.key >= 1700 && w.key < 2000;   // (a parapet: low cover without a top — a body stops, a hop crosses, nothing stands on it; the thing kind is read below, once the rectangle's height and base are known)
  if (w.low || w.stand) w.h = maxIn(w, wallH); else { w.h = Math.ceil(maxIn(w, wallH) * 2) / 2; const lo = minIn(w, wallH), over = w.h - lo; if (lo < 7) { if (over > 1) tallOver += 1; if (over > tallOverMax) tallOverMax = over; } }
  // (the highest walked floor beside the rectangle: what its height is measured from — a railing on a terrace is a railing)
  let bse = NaN, bseLo = NaN; for (let kk = w.k; kk < w.k + w.d; kk += 1) for (let ci = w.i; ci < w.i + w.w; ci += 1) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = ci + di, kq = kk + dk; if (ii < 0 || kq < 0 || ii >= nx || kq >= nz) continue; const n = kq * nx + ii; if (reach[n] && Number.isNaN(thingTop[n])) { if (Number.isNaN(bse) || floorH[n] > bse) bse = floorH[n]; if (Number.isNaN(bseLo) || floorH[n] < bseLo) bseLo = floorH[n]; } } w.base = Number.isNaN(bse) ? 0 : bse; w.baseLo = Number.isNaN(bseLo) ? 0 : bseLo;   // (and the lowest: the floor the thing stands from)
  // the box reaches only as far as the solid samples in its cells do (a face on a cell's edge is not a cell of wall) —
  // on the sides that face open cells. A side that meets another cell of a thing stays on the cell line, so the
  // rectangles of one thing abut: a car's roof and its door panels used to be trimmed each to its own samples, with
  // slits between them that a body on the roof fell into and stood inside the hull
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let kk = w.k; kk < w.k + w.d; kk += 1) for (let ci = w.i; ci < w.i + w.w; ci += 1) { const j = kk * nx + ci; if (exMinX[j] < a) a = exMinX[j]; if (exMaxX[j] > b) b = exMaxX[j]; if (exMinZ[j] < c) c = exMinZ[j]; if (exMaxZ[j] > d) d = exMaxZ[j]; }
  const open = (ci, kk) => ci < 0 || kk < 0 || ci >= nx || kk >= nz || Number.isNaN(thingTop[kk * nx + ci]);
  let oW = true, oE = true, oN = true, oS = true; for (let kk = w.k; kk < w.k + w.d; kk += 1) { if (!open(w.i - 1, kk)) oW = false; if (!open(w.i + w.w, kk)) oE = false; } for (let ci = w.i; ci < w.i + w.w; ci += 1) { if (!open(ci, w.k - 1)) oN = false; if (!open(ci, w.k + w.d)) oS = false; }
  if (a <= b && c <= d) { if (oW) w.x0 = Math.max(w.x0, a - 0.02); if (oE) w.x1 = Math.min(w.x1, b + 0.02); if (oN) w.z0 = Math.max(w.z0, c - 0.02); if (oS) w.z1 = Math.min(w.z1, d + 0.02); }
  // (free-standing and slim — open cells on both of its long sides — is what a fence is: a railing, a post; a slim face of a thick thing, a car's door panel, is not)
  w.free = (w.x1 - w.x0 <= FENCE_MAX && oW && oE) || (w.z1 - w.z0 <= FENCE_MAX && oN && oS); }
// ---- game units
const cx = (x0c + x1c) / 2, cz = (z0c + z1c) / 2; const U = (v) => Math.round(v * SCALE * 100) / 100;
const halfX = U((x1c - x0c) / 2), halfZ = U((z1c - z0c) / 2);
const box = (b, hh) => ({ minX: U(b.x0 - cx), maxX: U(b.x1 - cx), minZ: U(b.z0 - cz), maxZ: U(b.z1 - cz), minY: 0, maxY: U(hh) });
const thin = (b) => Math.min(b.x1 - b.x0, b.z1 - b.z0) <= FENCE_MAX;
const obstacles = [], surfaces = [], tags = []; const emit = (o, t) => { obstacles.push(o); tags.push(t); };   /* (tags: the rule behind each box, for the DUMP) */ let lowCover = 0, standable = 0, fences = 0, deckBodies = 0, slabs = 0, skirts = 0, voids = 0, planeBodies = 0, thinLids = 0;
// a thing's top as a floor: the lid, and the cells it covers (lidH), for the slim things read after the thick ones
const lidH = new Float64Array(N).fill(NaN); const thinTops = [];
const lid = (w, o) => { surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY, lid: 1 });   /* (lid: a thing's own top — a crate's, a container's — where every other flat surface is a floor a body walks: a deck, a passage, a slab, a roof. The client's fade keeps floors out of its things by this) */ for (let kk = w.k; kk < w.k + w.d; kk += 1) for (let ci = w.i; ci < w.i + w.w; ci += 1) lidH[kk * nx + ci] = w.h; };
// (a slim thing whose top lies within a step of a floor beside it — a reached floor, or a thick thing's lid — is that floor's
// seam: a roof's ridge, the step between two roof slopes, a quarter of a metre wide, carries the floor across at its own top.
// It used to carry none, as a railing's top carries none, and a body crossing a roof fell through it to the ground under the
// house (user 2026-10-19). A railing stands beside no floor at its height, and beside its own slim segments: still no top.)
const flush = (w) => { for (let kk = w.k; kk < w.k + w.d; kk += 1) for (let ci = w.i; ci < w.i + w.w; ci += 1) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = ci + di, kq = kk + dk;
      if (ii < 0 || kq < 0 || ii >= nx || kq >= nz || (ii >= w.i && ii < w.i + w.w && kq >= w.k && kq < w.k + w.d)) continue; const n = kq * nx + ii;
      if (reach[n] && Number.isNaN(thingTop[n]) && Math.abs(floorH[n] - w.h) <= STEP) return true; if (!Number.isNaN(lidH[n]) && Math.abs(lidH[n] - w.h) <= STEP) return true; }
  return false; };
for (const w of walls) {
  // a SEAM of the model's terrain tiles: a slim run no taller than SEAM_TALL that rises from under the floor beside it
  // and has that same floor on both of its sides (the tiles' edges meeting under a street): nothing stands there
  if (w.h <= SEAM_TALL && Math.max(w.w, w.d) >= 4 && thin(w)) { let lowMax = -Infinity, same = 0;
    for (let kk = w.k; kk < w.k + w.d; kk += 1) for (let ci = w.i; ci < w.i + w.w; ci += 1) { const j = kk * nx + ci; if (lowAll[j] - GROUND > lowMax) lowMax = lowAll[j] - GROUND; let nLo = Infinity, nHi = -Infinity, nCnt = 0;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = ci + di, kq = kk + dk; if (ii < 0 || kq < 0 || ii >= nx || kq >= nz) continue; const n = kq * nx + ii; if (reach[n] && Number.isNaN(thingTop[n])) { nCnt += 1; if (floorH[n] < nLo) nLo = floorH[n]; if (floorH[n] > nHi) nHi = floorH[n]; } }
      if (nCnt >= 2 && nHi - nLo <= FLOOR_MIN) same += 1; }
    if (lowMax < w.base - UNDER_STREET && same >= 0.7 * w.w * w.d) { seams += 1; continue; } }
  if (!w.parapet && (w.low || w.stand) && Math.min(w.w, w.d) * CELL > FENCE_MAX && parapetThing(w)) { w.parapet = true; thingParapets += 1; }   // (thick: a slim one carries no top anyway)
  // (the void's wall stands from the street whatever floor lies beside it: raised beside Dust's long path, it floated 4.5 m up and the nav grid found street under it, 2026-10-19)
  const o = box(w, w.h); if (w.key !== 9 && !Number.isNaN(w.baseLo) && w.baseLo !== 0 && w.h - w.baseLo > FLOOR_MIN) o.minY = U(w.baseLo);   // (beside a floor under the street the box goes down to that floor too: Dust's retaining wall by the basin was a slab floating over the yard beside it, user 2026-10-22) if (w.key === 9) voids += 1;   // (a thing on a raised floor stands from that floor: its box starts there, so its height is its own; one no higher than the lowest floor beside it stands on nothing walked — the rim of that floor, from the ground — never a box whose bottom is over its top)
  if (w.low) { o.topBuffer = 0.8; lowCover += 1; }   // low cover is a deck no step reaches: its body blocks a body below it, a hop lands on its top
  if (w.free && w.h - w.base <= FENCE_TALL && w.h < CEIL) { o.noProjectile = true; fences += 1; }   // (a slim thing reaching the map's ceiling is a wall: a ship's partition) a fence, a railing, a post — slim, free-standing, no taller than a fence over the floor beside it: a body stops, a round and an eye pass (a bus's side, a wall's plane are slim and taller: walls; a car's door panel is a slim face of a thick thing: it stops rounds and carries the car's floor)
  else if (w.stand) { o.topBuffer = 0.8; standable += 1; }   // a standable thing: landed on from the air, its top a floor
  emit(o, w.key === 9 ? 'void' : w.low ? 'low' : o.noProjectile ? 'fence' : w.stand ? 'stand' : 'wall');
  // (a floor on top of what is wide enough to stand on: a slim face of a thick thing — a car's door panel — stops rounds but carries none, so a bot does not perch on a railing's top)
  if ((w.low || w.stand) && !o.noProjectile && !w.parapet) { if (!thin(w)) lid(w, o); else thinTops.push([w, o]); } }
for (const [w, o] of thinTops) if (flush(w)) { lid(w, o); thinLids += 1; }   // (the slim things, once every thick thing's lid is known)
for (const d of decks) { const top = regH[(d.h >> 9) - 1], under = d.h & 255, bodyless = d.h & 256; const o = box(d, top); surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY });
  if (top >= STEP && !bodyless) { if (under) { o.minY = U((under - 1) * DECK_Q); slabs += 1; } emit({ ...o, topBuffer: 0.8 }, 'deck'); deckBodies += 1; } }   // (a sunken floor has no body: the rims of the floors around it are its walls; a slab's body stops at the passage's roof)
for (const p of passes) { const o = box(p, p.h); surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY }); }
for (const r of rims) { const o = box(r, 0); o.minY = U(minIn(r, rimLo)); o.maxY = U(Math.min(0, maxIn(r, floorH))); if (o.maxY > o.minY) emit({ ...o, topBuffer: 0.8 }, 'rim'); }
// (the drop's edge: a slim box straddling the cell's edge towards the drop, GUARD_T each way; the floor's own body gives none, holding no body on its top)
const GUARD_T = 0.05; let guardsN = 0, guardCells = 0;
for (let q = 0; q < 4; q += 1) for (const g of rects(guardSide[q]).filter(inCrop)) { const o = box(g, 0); o.minY = U(maxIn(g, floorH) - KERB_MAX); o.maxY = U(maxIn(g, guardTop));
  if (q === 0) { o.minX = U(g.x1 - cx - GUARD_T); o.maxX = U(g.x1 - cx + GUARD_T); } else if (q === 1) { o.minX = U(g.x0 - cx - GUARD_T); o.maxX = U(g.x0 - cx + GUARD_T); } else if (q === 2) { o.minZ = U(g.z1 - cz - GUARD_T); o.maxZ = U(g.z1 - cz + GUARD_T); } else { o.minZ = U(g.z0 - cz - GUARD_T); o.maxZ = U(g.z0 - cz + GUARD_T); }
  emit({ ...o, topBuffer: 0.8, noProjectile: true }, 'guard'); guardsN += 1; guardCells += g.w * g.d; }
// a hanging thing a body hops: a box from its bottom, a deck's body above (topBuffer 0.8) with a floor on top
// when it is thick (a table), none when thin (a bar, a gate arm: rounds pass it)
for (const bm of beams) { let lo = Infinity, hi = -Infinity; for (let kk = bm.k; kk < bm.k + bm.d; kk += 1) for (let c = bm.i; c < bm.i + bm.w; c += 1) { const h = hang[kk * nx + c]; if (h[0] < lo) lo = h[0]; if (h[1] > hi) hi = h[1]; }
  const hangTop = Math.round(hi / DECK_Q) * DECK_Q; const o = box(bm, hangTop); o.minY = U(Math.floor(lo / DECK_Q) * DECK_Q); if (hangTop < CEIL) o.topBuffer = 0.8; if (thin(bm)) o.noProjectile = true; if (o.maxY <= o.minY) o.maxY = o.minY + 1; emit(o, 'beam');
  if (hangTop < CEIL && !o.noProjectile) surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY }); }
// (a ceiling over a walked passage with the roof beside it a floor — a standable thing's top, or a deck's, within SLAB
// of its own top — is that roof's slab over the passage: its top the model's, not a metre class above it (the lip was
// an invisible wall to a body on the roof), a floor on it (the gap was a hole), hopped over like the roof; the body
// in the passage under it walks on. Town's south-edge garages: the roofs of their open ground floors, user 2026-10-19)
let roofSlabs = 0; const ceilMerge = new Float64Array(N);   // (the ceilings that are no roof: merged below by their height class alone)
for (const c of ceils) { const top = maxIn(c, H); let roof = false;
  for (let kk = c.k - 1; kk <= c.k + c.d && !roof; kk += 1) for (let ci = c.i - 1; ci <= c.i + c.w && !roof; ci += 1) { if (ci < 0 || kk < 0 || ci >= nx || kk >= nz || (ci >= c.i && ci < c.i + c.w && kk >= c.k && kk < c.k + c.d)) continue; const n = kk * nx + ci;
    const nTop = (wallKey[n] >= 1000 && wallKey[n] < 3000 && !parapet[n]) ? thingTop[n] : (deckH[n] > FLOOR_MIN ? deckH[n] : NaN); if (!Number.isNaN(nTop) && Math.abs(nTop - top) <= SLAB) roof = true; }
  const o = box(c, roof ? top : Math.ceil(top)); o.minY = U(Math.floor(minIn(c, ceilH) * 2) / 2); if (o.maxY <= o.minY) continue;
  if (!roof) { for (let kk = c.k; kk < c.k + c.d; kk += 1) for (let ci = c.i; ci < c.i + c.w; ci += 1) ceilMerge[kk * nx + ci] = 3000 + Math.round(ceilH[kk * nx + ci] / 0.5); continue; }
  o.topBuffer = 0.8; surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY }); roofSlabs += 1; emit(o, 'roof'); }
// (a ceiling nothing stands on merges by its own height class alone, its box up to the highest point over it: what rises
// above it — a chimney, a parapet, a railing on the roof — cut Dust's hall ceiling into 825 boxes, 2026-10-19)
for (const c of rects(ceilMerge).filter(inCrop)) { const o = box(c, Math.ceil(maxIn(c, H))); o.minY = U(Math.floor(minIn(c, ceilH) * 2) / 2); if (o.maxY <= o.minY) continue; emit(o, 'ceil'); }
// slopes: each rectangle of a stretch is one PLANE surface (y0 at its (minX, minZ) corner, gx and gz the rise per
// unit along x and z: the plane of the stretch), with a BODY beneath it — from the ground, or the roof of a walked
// passage under it, up to the plane's lowest corner — as a deck has: a slope used to be a surface in the air with
// its skirts the only solid under it, and a house's hip roof (a slope each way from the ridge, the model's house
// a hollow shell) let a body that walked under its eave from the ledge beside it fall into the house and hang there
// (user 2026-10-19); skirts where the floor beside the rectangle stands more than a step under the plane's edge
// (the plane read on the edge itself: read a cell beyond it, a steep eave lost its skirt), in SEG-cell lengths
// along each side
const plane = (b, hAt) => { const hs = [hAt(b.x0, b.z0), hAt(b.x1, b.z0), hAt(b.x0, b.z1), hAt(b.x1, b.z1)]; return { s: { minX: U(b.x0 - cx), maxX: U(b.x1 - cx), minZ: U(b.z0 - cz), maxZ: U(b.z1 - cz), maxTop: U(Math.max(...hs)), type: 'plane', y0: U(hAt(b.x0, b.z0)), gx: 0, gz: 0 }, lo: Math.min(...hs), hi: Math.max(...hs) }; };
const underOf = (b) => { let u = 0; for (let kk = b.k; kk < b.k + b.d; kk += 1) for (let ci = b.i; ci < b.i + b.w; ci += 1) { const s = slabUnder[kk * nx + ci]; if (s > u) u = s; } return u; };   // (the highest passage roof under the rectangle; NaN where there is none)
const planeBody = (b, lo) => { const o = box(b, lo); o.minY = U(underOf(b)); if (o.maxY - o.minY >= U(STEP)) { emit({ ...o, topBuffer: 0.8 }, 'plane'); planeBodies += 1; } };   // (as a deck's: a slope within a step of what is under it has nothing a body fits under)
for (const rr of rampRects) { const r = regions[rr.h - 1]; const hAt = (x, z) => r.a + r.b * x + r.c * z;
  const p = plane(rr, hAt); p.s.gx = Math.round(r.b * 1e4) / 1e4; p.s.gz = Math.round(r.c * 1e4) / 1e4; surfaces.push(p.s); planeBody(rr, p.lo);
  for (const side of ['x0', 'x1', 'z0', 'z1']) { const alongX = side[0] === 'z'; const len = alongX ? rr.w : rr.d;
    for (let q0 = 0; q0 < len; q0 += SEG) { const n = Math.min(SEG, len - q0); let need = false;
      for (let q = q0; q < q0 + n && !need; q += 1) { const i = alongX ? rr.i + q : (side === 'x0' ? rr.i - 1 : rr.i + rr.w), k = alongX ? (side === 'z0' ? rr.k - 1 : rr.k + rr.d) : rr.k + q;
        if (i < 0 || k < 0 || i >= nx || k >= nz) { need = true; break; } const j = k * nx + i; if (regionOf[j] === r.id) continue;
        // (a skirt where a walked floor lies more than a step under the plane's edge, or nothing solid at all; beside the void, a wall, a thing or a higher floor the box already there is the solid — a path's slanted edge along the void grew a skirt per cell row, 1,500 boxes in Dust, 2026-10-19)
        const here = alongX ? hAt(X0 + (i + 0.5) * CELL, side === 'z0' ? rr.z0 : rr.z1) : hAt(side === 'x0' ? rr.x0 : rr.x1, Z0 + (k + 0.5) * CELL); if (reach[j] ? floorH[j] < here - STEP : Number.isNaN(thingTop[j])) need = true; }
      if (!need) continue;
      const t = CELL; const bx = alongX ? { x0: rr.x0 + q0 * CELL, x1: rr.x0 + (q0 + n) * CELL, z0: side === 'z0' ? rr.z0 - t : rr.z1, z1: side === 'z0' ? rr.z0 : rr.z1 + t } : { x0: side === 'x0' ? rr.x0 - t : rr.x1, x1: side === 'x0' ? rr.x0 : rr.x1 + t, z0: rr.z0 + q0 * CELL, z1: rr.z0 + (q0 + n) * CELL };
      const e = plane(bx, hAt); const o = box(bx, e.hi); if (o.maxY <= 0) o.minY = U(e.lo - 0.5);   // (a sunken slope's skirt stands below the street)
      emit({ ...o, topBuffer: 0.8, noProjectile: true }, 'skirt'); skirts += 1; } } }
// kerb ramps: one plane per run of kerb cells with the same two floors, rising from the low floor's side
const kerbRects = rects(kerbKey).filter(inCrop); let kerbs = 0;
for (const kr of kerbRects) { const info = kerbInfo.get(kr.h); const depth = info.axis === 'x' ? kr.x1 - kr.x0 : kr.z1 - kr.z0; const g = info.dir * (info.hi - info.lo) / depth; const y0 = info.dir > 0 ? info.lo : info.hi;
  surfaces.push({ minX: U(kr.x0 - cx), maxX: U(kr.x1 - cx), minZ: U(kr.z0 - cz), maxZ: U(kr.z1 - cz), maxTop: U(info.hi), type: 'plane', y0: U(y0), gx: info.axis === 'x' ? Math.round(g * 1e4) / 1e4 : 0, gz: info.axis === 'z' ? Math.round(g * 1e4) / 1e4 : 0 }); kerbs += 1; planeBody(kr, info.lo); }   // (a ramp's body: up to the low floor — a ridge's kerb cells over a house's hollow, a strip's edge cell over nothing)
const stats = { key, crop_m: [x0c, x1c, z0c, z1c], kerbs, scale: SCALE, ground_m: GROUND, cell_m: CELL, triangles: triCount, trianglesInCrop: used, cells: N, floorCells, wallCells, ceilCells, narrowFloor, parapets, thingParapets, roofSlabs, deadFloor, voids, guards: guardsN, guardCells, lidCells, walls: walls.length, lowCover, standable, fences, seams, tallOver1m: tallOver, tallOverMaxM: Math.round(tallOverMax * 100) / 100, decks: decks.length, deckBodies, slabs, passageFloors: passes.length, rims: rims.length, beams: beams.length, ramps: rampRects.length, rampStretches: regions.filter((r) => r.cells.length && !r.stairs).length, stairs: regions.filter((r) => r.cells.length && r.stairs).length, skirts, planeBodies, thinLids, ceilings: ceils.length, obstacles: obstacles.length, surfaces: surfaces.length, halfX, halfZ };
writeFileSync(`${outDir}/${key}.json`, JSON.stringify({ key, transform: { scale: SCALE, cx, cz, ground: GROUND, exclude: [...EXCLUDE], ceil: Number.isFinite(CEIL) ? CEIL : null }, halfX, halfZ, spawns: null, obstacles, surfaces }));   // (ceil: the map's ceiling in metres, the sim's cap on a body's feet — null when the map has none)
writeFileSync(`${outDir}/${key}.stats.json`, JSON.stringify(stats, null, 1));
// ---- DUMP=1: every column's reading, for review scripts (metres, relative to the street)
if (process.env.DUMP) {
  const arr = (a) => Array.from(a, (v) => Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
  const minSurf = new Float64Array(N).fill(NaN), cand = new Float64Array(N).fill(NaN), surf2 = new Float64Array(N).fill(NaN), nSurf = new Uint8Array(N);
  for (let j = 0; j < N; j += 1) { const l = inter[j]; if (!l) continue; nSurf[j] = l.length; minSurf[j] = l[0] - GROUND;
    for (let a = 0; a < l.length; a += 1) if (l[a] - GROUND >= -PIT_MAX) { cand[j] = l[a] - GROUND; if (a + 1 < l.length) surf2[j] = l[a + 1] - GROUND; break; } }
  const bandRuns = new Array(N); for (let j = 0; j < N; j += 1) { let runs = null, start = -1; for (let b = 0; b <= BANDS; b += 1) { const on = b < BANDS && bands[j * BANDS + b]; if (on && start < 0) start = b; if (!on && start >= 0) { (runs ??= []).push([Math.round(start * BAND * 10) / 10, Math.round(b * BAND * 10) / 10]); start = -1; } } bandRuns[j] = runs; }
  writeFileSync(`${outDir}/${key}.cells.json`, JSON.stringify({ tags, nx, nz, X0, Z0, CELL, GROUND, SCALE, cx, cz, STEP, WALK_MAX, HEADROOM, LOW_MAX, floorH: arr(floorH), lowAll: arr(lowAll), reach: Array.from(reach), H: arr(H), kind: Array.from(kind), deckH: arr(deckH), wallH: arr(wallH), wallKey: Array.from(wallKey), ceilH: arr(ceilH), standTop: arr(standTop), hang, lowTop: arr(lowTop), lowFrom: arr(lowFrom), slabUnder: arr(slabUnder), passTop: arr(passTop), regionOf: Array.from(regionOf), minSurf: arr(minSurf), cand: arr(cand), surf2: arr(surf2), nSurf: Array.from(nSurf), bands: bandRuns, layers: layersOf.map((L) => L ? L.map((x) => [x.top, Number.isNaN(x.st) ? null : Math.round(x.st * 100) / 100, x.hg ? x.hg[0] : null, x.next === Infinity ? null : Math.round(x.next * 100) / 100]) : null), reachBits: Array.from(reachBits), surfs: inter.map((l) => l ? l.map((v) => Math.round((v - GROUND) * 100) / 100) : null) }));
}
// ---- overlay SVG (metres)
const wallColor = (hh) => hh <= LOW_MAX ? '#f2d16b' : hh <= 3 ? '#eb9a4e' : hh <= 8 ? '#d75a3a' : '#7a2a5a';
const deckColor = (hh) => hh < 0 ? '#7fb8c9' : hh < 0.5 ? '#cfe8c3' : hh < 1 ? '#9fd39a' : hh < 2 ? '#5fb86f' : '#2e8b57';
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0 - 3} ${Z0 - 3} ${X1 - X0 + 6} ${Z1 - Z0 + 6}" width="1300"><rect x="${X0 - 3}" y="${Z0 - 3}" width="${X1 - X0 + 6}" height="${Z1 - Z0 + 6}" fill="#2b2b2b"/>`;
for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) { const j = k * nx + i; const fill = wallKey[j] > 0 ? (wallKey[j] >= 2000 ? '#e0a040' : wallKey[j] >= 1000 ? '#f2d16b' : wallColor(wallH[j])) : kind[j] === 1 ? '#3b7dd8' : kind[j] === 2 ? '#8fc4ef' : beamKey[j] > 0 ? '#f08a24' : deckH[j] !== 0 ? deckColor(deckH[j]) : reach[j] ? (ceilKey[j] > 0 ? '#c9c2e8' : '#e4e0d6') : '#bdb7aa'; svg += `<rect x="${X0 + i * CELL}" y="${Z0 + k * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`; }
for (const b of walls) svg += `<rect x="${b.x0}" y="${b.z0}" width="${b.x1 - b.x0}" height="${b.z1 - b.z0}" fill="none" stroke="${b.low ? '#7a5a00' : '#102'}" stroke-width="0.1"/>`;
for (const b of rampRects) svg += `<rect x="${b.x0}" y="${b.z0}" width="${b.x1 - b.x0}" height="${b.z1 - b.z0}" fill="none" stroke="#0a2a6a" stroke-width="0.12"/>`;
svg += `<rect x="${x0c}" y="${z0c}" width="${x1c - x0c}" height="${z1c - z0c}" fill="none" stroke="#00e5ff" stroke-width="0.5" stroke-dasharray="2 1"/>`;
for (let gx = Math.ceil(X0 / 10) * 10; gx <= X1; gx += 10) svg += `<line x1="${gx}" y1="${Z0}" x2="${gx}" y2="${Z1}" stroke="#000" stroke-opacity="0.25" stroke-width="0.1"/><text x="${gx + 0.3}" y="${Z0 + 2}" font-size="2" fill="#fff">${gx}</text>`;
for (let gz = Math.ceil(Z0 / 10) * 10; gz <= Z1; gz += 10) svg += `<line x1="${X0}" y1="${gz}" x2="${X1}" y2="${gz}" stroke="#000" stroke-opacity="0.25" stroke-width="0.1"/><text x="${X0 + 0.3}" y="${gz - 0.3}" font-size="2" fill="#fff">${gz}</text>`;
svg += `<text x="${X0 - 2.5}" y="${Z0 - 1}" font-size="2.2" fill="#fff">${key}: ${obstacles.length} boxes (${lowCover} low cover yellow, ${walls.length - lowCover} walls, ${beams.length} beams orange, ${ceils.length} ceilings lilac), ${rampRects.length} ramps (blue), ${decks.length} raised or sunken floors (greens, teal) — metres, +x right, +z down</text></svg>`;
writeFileSync(`${outDir}/${key}.svg`, svg);
console.log(JSON.stringify(stats));
