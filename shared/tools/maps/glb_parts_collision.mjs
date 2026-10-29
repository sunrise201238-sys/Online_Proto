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
//   EXCLUDE= (node name prefixes left out, comma-separated)
// The json is the generator's shape — key, transform, halfX, halfZ, spawns (spawn_set.mjs fills them), obstacles,
// surfaces — so spawn_set.mjs and data_splice.py take it as they take the generator's.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readGlb, accessor, worlds } from './glb_read.mjs';
const [inF, key, X0, X1, Z0, Z1, outDir] = process.argv.slice(2); const x0 = Number(X0), x1 = Number(X1), z0 = Number(Z0), z1 = Number(Z1);
const SCALE = Number(process.env.SCALE ?? 4), GROUND = Number(process.env.GROUND ?? 0), MIN_SIZE = Number(process.env.MIN_SIZE ?? 0.3), LID_MIN = Number(process.env.LID_MIN ?? 0.6), LID_AREA = Number(process.env.LID_AREA ?? 20), BELOW = Number(process.env.BELOW ?? 7);
const EXCLUDE = (process.env.EXCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const halfX = ((x1 - x0) / 2) * SCALE, halfZ = ((z1 - z0) / 2) * SCALE;
const ax = (x) => Math.round((x - cx) * SCALE * 100) / 100, az = (z) => Math.round((z - cz) * SCALE * 100) / 100, ay = (y) => Math.round((y - GROUND) * SCALE * 100) / 100;
const g = readGlb(inF); const J = g.json; const W = worlds(J);
const STEP = 0.65;   // (the sim's SURFACE_STEP_HEIGHT, 2.6 units: a box no taller than this is stepped onto, so its top is a surface)
const STEPU = STEP * SCALE;
const MASS_AREA = Number(process.env.MASS_AREA ?? 200);   // (m²: a block of earth this big, a metre thick, topping at the street or under it, is its top alone)
const MAX_GRADE = Number(process.env.MAX_GRADE ?? 1.5);   // (a sloped face steeper than this rise per metre is no ramp: the part is a box)
const obstacles = [], surfaces = []; const n = { parts: 0, out: 0, tiny: 0, below: 0, excluded: 0, boxes: 0, lids: 0, lowLids: 0, floors: 0, ramps: 0, steep: 0, sheets: 0, markings: 0, panes: 0, mass: 0, invisible: 0 };
const fit = (pts) => { // y = a + b x + c z, least squares; returns [a, b, c, rms]
  let sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0; const m = pts.length; for (const [x, y, z] of pts) { sx += x; sz += z; sy += y; sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y; }
  const A = [[m, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], B = [sy, sxy, szy]; // solve 3x3 by Cramer
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-9) return null; const col = (k) => A.map((r, i) => r.map((v, j) => (j === k ? B[i] : v)));
  const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D; let e = 0; for (const [x, y, z] of pts) e += (a + b * x + c * z - y) ** 2; return [a, b, c, Math.sqrt(e / m)]; };
const alphaOf = (mi) => (J.materials?.[mi]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])[3];
J.nodes.forEach((node, ni) => { if (node.mesh === undefined) return; const name = node.name ?? ''; if (EXCLUDE.some((p) => name.startsWith(p))) { n.excluded += 1; return; } n.parts += 1;
  // an invisible part — its material's alpha under 0.1: a sound region, a trigger, a 69 by 112 m box over half the city
  // (Speaker11) — collides with nothing
  if (J.meshes[node.mesh].primitives.every((p) => alphaOf(p.material) < 0.1)) { n.invisible += 1; return; }
  const w = W[ni]; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const sloped = []; let anySlope = false;
  for (const p of J.meshes[node.mesh].primitives) { const pos = accessor(g, p.attributes.POSITION); const idx = p.indices !== undefined ? accessor(g, p.indices) : null; const nt = idx ? idx.length / 3 : pos.length / 9;
    const P = (i) => { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; return [w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]]; };
    for (let t = 0; t < nt; t += 1) { const v = [0, 1, 2].map((k) => P(idx ? idx[3 * t + k] : 3 * t + k)); for (const q of v) for (let k = 0; k < 3; k += 1) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
      const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; const c = Math.abs(ny / l);
      if (c > 0.05 && c < 0.95) { anySlope = true; sloped.push({ c, v }); } } }
  if (mx[0] < x0 || mn[0] > x1 || mx[2] < z0 || mn[2] > z1) { n.out += 1; return; }
  if (mx[1] < GROUND - BELOW) { n.below += 1; return; }
  const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2]; if (Math.max(dx, dy, dz) < MIN_SIZE) { n.tiny += 1; return; }
  const bx0 = Math.max(mn[0], x0), bx1 = Math.min(mx[0], x1), bz0 = Math.max(mn[2], z0), bz1 = Math.min(mx[2], z1);   // (clipped to the crop)
  // the ground's mass — a block of earth a metre or more thick, MASS_AREA m² or more, its top at or under the street — is its
  // top alone, a floor: the station and the cellars are built inside such blocks (in Roblox they do not collide), and a body
  // walking down a stair into one was thrown out of it
  if (dy >= 1 && dx * dz >= MASS_AREA && mx[1] <= GROUND + 0.1) { surfaces.push({ minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }); n.mass += 1; return; }
  if (anySlope) { // a ramp: a wedge's one sloped face, or a box tilted to lie as a ramp (its top and bottom slope alike, its ends more) —
    // the flattest sloped faces are the top and the bottom; of a pair, the higher is the top; its plane is the surface
    const flat = Math.max(...sloped.map((t) => t.c)); const top = sloped.filter((t) => t.c > flat - 0.03); let pts = top.flatMap((t) => t.v); let f = fit(pts);
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
        if (hi - lo > 0.05 && Math.min(fx1 - fx0, fz1 - fz0) >= LID_MIN) { surfaces.push({ minX: ax(fx0), maxX: ax(fx1), minZ: az(fz0), maxZ: az(fz1), maxTop: ay(hi), type: 'plane', y0: ay(a + b * fx0 + c * fz0), gx: Math.round(b * 10000) / 10000, gz: Math.round(c * 10000) / 10000 }); n.ramps += 1; return; } } } }
  // a box, clipped to the crop. A sheet thinner than 10 cm lying flat (a road marking, a decal) is no box — a floor alone
  // where it is wide, nothing otherwise; a standing sheet thinner than 4 cm (a pane) gets 4 cm. The box's top is a
  // surface where the top is wide, and also where the box is no taller than a step (a kerb, a tread, a low wall: the
  // sim holds a body against any box without a lid, however low — a 2 cm marking read as a wall shut a road)
  const wide = Math.min(bx1 - bx0, bz1 - bz0) >= LID_MIN && (bx1 - bx0) * (bz1 - bz0) >= 1;
  if (dy < 0.1) { if (wide) { surfaces.push({ minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }); n.sheets += 1; } else n.markings += 1; return; }
  let ox0 = bx0, ox1 = bx1, oz0 = bz0, oz1 = bz1; if (ox1 - ox0 < 0.04) { ox0 -= 0.02; ox1 += 0.02; n.panes += 1; } if (oz1 - oz0 < 0.04) { oz0 -= 0.02; oz1 += 0.02; n.panes += 1; }
  const box = { minX: ax(ox0), maxX: ax(ox1), minZ: az(oz0), maxZ: az(oz1), minY: ay(mn[1]), maxY: ay(mx[1]) };
  if (wide || dy <= STEP) { box.topBuffer = 0.8; const s = { minX: ax(bx0 - 0.02), maxX: ax(bx1 + 0.02), minZ: az(bz0 - 0.02), maxZ: az(bz1 + 0.02), maxTop: ay(mx[1]), type: 'flat', top: ay(mx[1]) }; if (!wide) { s.lid = 1; n.lowLids += 1; } else if ((bx1 - bx0) * (bz1 - bz0) < LID_AREA) { s.lid = 1; n.lids += 1; } else n.floors += 1; surfaces.push(s); }
  obstacles.push(box); n.boxes += 1; });
// ---- RAMP (a map's own data): a flight of stacked treads read as one slope — RAMP="x0,x1,z0,z1,lowY,highY,axis;..." — the
// rectangle's boxes topping between lowY and highY go, their lids with them, and one plane rises from lowY at the low end
// to highY at the high end along the axis (+x, -x, +z or -z); the user's call on District's stair by the balcony, 2026-10-29
let ramped = 0;
for (const spec of (process.env.RAMP ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [rx0, rx1, rz0, rz1, lo, hi] = spec.slice(0, spec.lastIndexOf(',')).split(',').map(Number); const axis = spec.slice(spec.lastIndexOf(',') + 1).trim();
  const R = { x0: ax(rx0), x1: ax(rx1), z0: az(rz0), z1: az(rz1), lo: ay(lo), hi: ay(hi) }; const inside = (b) => b.minX >= R.x0 - 0.2 && b.maxX <= R.x1 + 0.2 && b.minZ >= R.z0 - 0.2 && b.maxZ <= R.z1 + 0.2;
  for (let i = obstacles.length - 1; i >= 0; i -= 1) { const o = obstacles[i]; if (inside(o) && o.maxY <= R.hi + 0.2 && o.minY >= R.lo - 0.2) { obstacles.splice(i, 1); ramped += 1; } }
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (inside(s) && s.maxTop <= R.hi + 0.2 && s.maxTop >= R.lo - 0.2) surfaces.splice(i, 1); }
  const rise = R.hi - R.lo; const along = axis.endsWith('x') ? R.x1 - R.x0 : R.z1 - R.z0; const g = Math.round((rise / along) * 10000) / 10000; const up = axis.startsWith('+');
  surfaces.push({ minX: R.x0, maxX: R.x1, minZ: R.z0, maxZ: R.z1, maxTop: R.hi, type: 'plane', y0: up ? R.lo : R.hi, gx: axis.endsWith('x') ? (up ? g : -g) : 0, gz: axis.endsWith('z') ? (up ? g : -g) : 0 }); }
if (ramped) console.log(`ramp: ${ramped} boxes of treads replaced by the map's RAMP slopes`);
// ---- STAIRS read as slopes: a run of three or more boxes side by side along one axis — each no deeper than 1.6 m, their
// tops rising a tenth to a step (0.65 m) from one to the next, their sides within 10 cm of each other — is a flight of
// treads, and becomes one plane from the floor before the first tread to the top of the last; the treads' boxes and lids
// go. A surface lying just over the flight's top — within 1.5 m, the top of the block of earth a stair is cut down into,
// the base sheet — is cut away over the flight: the stair's opening (user 2026-10-29, "make stairs slope, make cboxes
// simple", the station's several entrances). Runs are read before the lip pass, so no tread is promoted first.
const cutOver = (x0, x1, z0, z1, yAbove, yBelow) => { let cut = 0; const clip = (s, minX, maxX, minZ, maxZ) => { if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return null; const c = { ...s, minX, maxX, minZ, maxZ }; if (s.type === 'plane') { c.y0 = Math.round((s.y0 + s.gx * (minX - s.minX) + s.gz * (minZ - s.minZ)) * 100) / 100; c.maxTop = Math.round(Math.min(s.maxTop, Math.max(...[[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].map(([x, z]) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ)))) * 100) / 100; } return c; };
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (s.maxTop <= yAbove || s.maxTop >= yBelow || s.maxX <= x0 || s.minX >= x1 || s.maxZ <= z0 || s.minZ >= z1) continue; surfaces.splice(i, 1); cut += 1;
    const ix0 = Math.max(s.minX, x0), ix1 = Math.min(s.maxX, x1); for (const c of [clip(s, s.minX, x0, s.minZ, s.maxZ), clip(s, x1, s.maxX, s.minZ, s.maxZ), clip(s, ix0, ix1, s.minZ, z0), clip(s, ix0, ix1, z1, s.maxZ)]) if (c) surfaces.push(c); } return cut; };
let flights = 0, treads = 0, openings = 0; const flightLog = [];
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
let promoted = 0;
for (let pass = 0; pass < 40; pass += 1) { const cell = 16, grid = new Map(); const at = (i, k) => i + ',' + k;
  for (const s of surfaces) for (let i = Math.floor(s.minX / cell); i <= Math.floor(s.maxX / cell); i += 1) for (let k = Math.floor(s.minZ / cell); k <= Math.floor(s.maxZ / cell); k += 1) { let l = grid.get(at(i, k)); if (!l) { l = []; grid.set(at(i, k), l); } l.push(s); }
  let changed = 0; const m = 1.2;   // (0.3 m around the box)
  for (const o of obstacles) { if (o.topBuffer != null) continue; let hit = false;
    for (let i = Math.floor((o.minX - m) / cell); i <= Math.floor((o.maxX + m) / cell) && !hit; i += 1) for (let k = Math.floor((o.minZ - m) / cell); k <= Math.floor((o.maxZ + m) / cell) && !hit; k += 1) for (const s of grid.get(at(i, k)) ?? []) { if (s.maxX < o.minX - m || s.minX > o.maxX + m || s.maxZ < o.minZ - m || s.minZ > o.maxZ + m) continue; if (s.maxTop >= o.maxY - STEPU && s.maxTop <= o.maxY + 4) { hit = true; break; } }
    if (!hit) continue; o.topBuffer = 0.8; surfaces.push({ minX: o.minX - 0.08, maxX: o.maxX + 0.08, minZ: o.minZ - 0.08, maxZ: o.maxZ + 0.08, maxTop: o.maxY, type: 'flat', top: o.maxY, lid: 1 }); changed += 1; }
  promoted += changed; if (!changed) break; }
if (promoted) console.log(`lips: ${promoted} walls topping at a floor's level given a lid and the lid's buffer`);
// ---- HOLE (a map's own data): rectangles of the model's metres where every surface topping over a height is cut away —
// HOLE="x0,x1,z0,z1,above;..." — the opening of a stair cut down into a block of earth whose top is read as a floor
// (District's station stair: the block tops at 0.22 m over treads from 0.09 m down, and a body walked over the trench).
// A surface over the hole keeps its parts outside it, up to four; a plane keeps its slope, its corner height moved with it.
let holed = 0;
for (const spec of (process.env.HOLE ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [hx0, hx1, hz0, hz1, above] = spec.split(',').map(Number); const H = { x0: ax(hx0), x1: ax(hx1), z0: az(hz0), z1: az(hz1), y: ay(above) };
  const clip = (s, minX, maxX, minZ, maxZ) => { if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return null; const c = { ...s, minX, maxX, minZ, maxZ }; if (s.type === 'plane') { c.y0 = Math.round((s.y0 + s.gx * (minX - s.minX) + s.gz * (minZ - s.minZ)) * 100) / 100; c.maxTop = Math.round(Math.min(s.maxTop, Math.max(...[[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].map(([x, z]) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ)))) * 100) / 100; } return c; };
  for (let i = surfaces.length - 1; i >= 0; i -= 1) { const s = surfaces[i]; if (s.maxTop <= H.y || s.maxX <= H.x0 || s.minX >= H.x1 || s.maxZ <= H.z0 || s.minZ >= H.z1) continue; surfaces.splice(i, 1); holed += 1;
    const ix0 = Math.max(s.minX, H.x0), ix1 = Math.min(s.maxX, H.x1); for (const c of [clip(s, s.minX, H.x0, s.minZ, s.maxZ), clip(s, H.x1, s.maxX, s.minZ, s.maxZ), clip(s, ix0, ix1, s.minZ, H.z0), clip(s, ix0, ix1, H.z1, s.maxZ)]) if (c) surfaces.push(c); } }
if (holed) console.log(`hole: ${holed} surfaces cut around the map's HOLE rectangles`);
// ---- VOID (a map's own data): rectangles of the model's metres where there is no world — the dark beside the station
// plaza, inside the crop because the plaza is — VOID="x0,x1,z0,z1;..." — each a wall 30 m tall, so a body never walks
// there on the sim's street-level nothing
let voids = 0;
for (const spec of (process.env.VOID ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [vx0, vx1, vz0, vz1] = spec.split(',').map(Number); obstacles.push({ minX: ax(vx0), maxX: ax(vx1), minZ: az(vz0), maxZ: az(vz1), minY: ay(GROUND - 30), maxY: ay(GROUND + 30) }); voids += 1; }
if (voids) console.log(`void: ${voids} walls of nothing from the map's VOID rectangles`);
mkdirSync(outDir, { recursive: true });
const out = { key, transform: { scale: SCALE, cx, cz, ground: GROUND, exclude: EXCLUDE, ceil: null, parts: true, hole: process.env.HOLE ?? '' }, halfX: Math.round(halfX * 10) / 10, halfZ: Math.round(halfZ * 10) / 10, spawns: {}, obstacles, surfaces };
writeFileSync(`${outDir}/${key}.json`, JSON.stringify(out));
console.log(`${key}: ${n.parts} parts — ${n.out} outside the crop, ${n.below} under the street, ${n.tiny} tiny, ${n.markings} flat markings, ${n.mass} blocks of earth (their tops kept), ${n.invisible} invisible, ${n.excluded} excluded; ${obstacles.length} boxes (${n.lids} with a lid, ${n.lowLids} low ones with a lid, ${n.floors} with a floor on top, ${n.panes} sheets given 4 cm), ${surfaces.length} surfaces (${n.ramps} ramps, ${n.sheets} flat sheets); halfX ${out.halfX} halfZ ${out.halfZ}`);
