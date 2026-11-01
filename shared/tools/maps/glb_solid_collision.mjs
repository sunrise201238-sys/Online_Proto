// THE SOLID READING (2026-10-31, the Neon map; user: "use simple geometries for collision boxes", then on the first
// readings "the red marked areas are not accurate enough; C-boxes are taking redundant spaces" — a duct's box holding the
// air inside its bend, a slanted sign's box standing over the sidewalk — "and note that there's a tunnel inside" — a
// building's box over the passage under it — and "for the angles/locations that units cannot reach, you can skip
// building the c-boxes there"). A part's box holds whatever air lies inside its bounds. This reading boxes the model's
// SOLID instead: the triangles are drawn into a grid of quarter-metre cells; a body (BODY_R cells each side of its
// centre, BODY_H metres tall) is flooded through the open air from the sky, everywhere it fits under the map's ceiling
// (Aris flies there); every cell no body can reach is solid — a sealed building's inside, a slot narrower than a body,
// the corner behind a duct. The solid is covered by boxes, each grown as large as the solid allows, the thickest parts of
// the solid first, a box the others already cover dropped — so a block is one box, a tunnel stays open, and the towers
// over the ceiling carry nothing.
// The floors: the slopes (flights read as one plane, ramps, pitched faces) and the ground's floors a step or less over the
// street (the road, the sidewalks, the lots' paving) come from glb_parts_collision.mjs (FLOORS=<its json>), kept where a
// flooded body's feet rest on them (a slope only where the model draws three quarters of it or more) — a ground slab under such
// a floor is no box, the floor carries a body and a body steps onto it from anywhere; every other floor is a box's own top
// where a body stands on it (half a metre wide or more, or narrower where it and the tops beside it at its height make a
// half-metre square — a strip of a roof turned on the street's grid), at the
// model's own height there (the level face's in the box's top cells, else the floor the generator read there), so a floor
// and its box are one thing. A box no taller than a step with no floor on it gets a lid: a body steps onto it, as onto a kerb.
// A box a floor lies over or at its top is stepped over, never a wall to the body standing on that floor. TRIM=1 trims the
// boxes to the parts each alone covers (the boxes grown through one block overlap, each as large as the solid allows; user
// 2026-11-01: "huge clustered cboxes"), MERGE=<m> also merges the big things' boxes within m — see the TRIM/MERGE pass below.
// usage: SCALE=4 GROUND=4.2927 CEIL=26 FLOORS=<parts json> node glb_solid_collision.mjs <glb (metres)> <key> <x0> <x1> <z0> <z1> <outDir>
//   env: VOXEL=0.25 (m) BODY_H=2 (m) BODY_R=1 (cells each side) CEIL (m over the street: the highest a body's feet go — the
//   map's MAP_BOUNDARY ceil) EXCLUDE= (node name prefixes left out) LID_MIN=0.5 (m: a box top this wide or more is a floor)
//   TRIM=1 (the boxes trimmed to their own cells, no merging) MERGE=<m> MERGE_V=0 MERGE_DEEP=2 (the big things' boxes merged,
//   m the air a merged box may take in from its sides, MERGE_V from its top and bottom, MERGE_DEEP the cells from any air a box
//   must hold to merge) PLANE_DEBUG=1 (<key>.planes.tsv: each slope's share drawn) PROBE_BOX="x,z,h" (each box over that point)
//   LOW="x0,x1,z0,z1,h;..." (rectangles where a body h metres tall fits: a space lower than a body, walked all the same)
//   CLEAR="x0,x1,z0,z1,y0,y1;..." (boxes where the model is not read) FILL="x0,x1,z0,z1,y0,y1;..." (boxes read as solid)
//   FLOORCUT="x0,x1,z0,z1,y0,y1;..." (generator floors with their top within y0..y1 lose their part inside the box)
import { readGlb, accessor, worlds } from './glb_read.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [file, key, x0s, x1s, z0s, z1s, outDir] = process.argv.slice(2);
const X0 = Number(x0s), X1 = Number(x1s), Z0 = Number(z0s), Z1 = Number(z1s);
if (!file || !key || !outDir || ![X0, X1, Z0, Z1].every(Number.isFinite)) { console.error('usage: SCALE=4 GROUND=<street y> CEIL=<m> FLOORS=<parts json> node glb_solid_collision.mjs <glb> <key> <x0> <x1> <z0> <z1> <outDir>'); process.exit(2); }
const SCALE = Number(process.env.SCALE ?? 4), GROUND = Number(process.env.GROUND ?? 0), CEIL = Number(process.env.CEIL ?? 26);
const V = Number(process.env.VOXEL ?? 0.25), BODY_H = Number(process.env.BODY_H ?? 2), R = Number(process.env.BODY_R ?? 1), LID_MIN = Number(process.env.LID_MIN ?? 0.5);
const STEP = 0.6;   // (m: under SURFACE_STEP_HEIGHT's 0.65 — what a body steps onto without a jump)
const EXCLUDE = (process.env.EXCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
mkdirSync(outDir, { recursive: true });
const t0 = performance.now(); const lap = (what) => console.log(`  ${what} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
// the grid: x and z over the crop; y from two cells under the street (the street's own face lies in the second) to the top of
// a body standing at the ceiling. Y0 sits 2 mm over a whole number of cells under the street, so the road's face, drawn at the
// street's height give or take a float, falls in the cell under the street and the cell over it is the street's air.
const NX = Math.ceil((X1 - X0) / V - 1e-6), NZ = Math.ceil((Z1 - Z0) / V - 1e-6);
const H = Math.round(BODY_H / V), KS = 2, KTOP = KS + Math.round(CEIL / V), NY = KTOP + H;
const Y0 = GROUND - KS * V + 0.002;
const N = NX * NY * NZ; const LAYER = NX * NZ; const at = (i, k, j) => (k * NZ + j) * NX + i;
console.log(`${key}: grid ${NX} x ${NY} x ${NZ} cells of ${V} m (${(N / 1e6).toFixed(1)} M); a body ${2 * R + 1} cells square, ${H} cells tall; feet from the street (cell ${KS}) to the ceiling ${CEIL} m (cell ${KTOP})`);
const cellOf = (v, o) => Math.ceil((v - o) / V - 1e-9) - 1;   // (the cell whose (lo, hi] holds v)

// ---- the model's triangles into the grid (a cell spans (lo, hi] on every axis: a face on a cell boundary is the lower cell's).
// A level face also leaves its height in the cells it crosses (fh: 0 none, else 1 + its height over the cell's foot in 254ths)
const g = readGlb(file); const J = g.json; const W = worlds(J);
const parentName = {}; J.nodes.forEach((nd, i) => (nd.children ?? []).forEach((c) => { parentName[c] = nd.name ?? ''; }));
const alphaOf = (mi) => { const m = J.materials?.[mi]; if (!m) return 1; if ((m.alphaMode ?? 'OPAQUE') === 'OPAQUE') return 1; return m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1; };
const surf = new Uint8Array(N); const fh = new Uint8Array(N);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function triBox(c, h, A, B, C) {   // triangle against box (Akenine-Möller's separating axes), the box as centre c and half sizes h
  const v0 = sub(A, c), v1 = sub(B, c), v2 = sub(C, c); const e0 = sub(v1, v0), e1 = sub(v2, v1), e2 = sub(v0, v2);
  const axisTest = (ax, ay, az) => { const p0 = ax * v0[0] + ay * v0[1] + az * v0[2], p1 = ax * v1[0] + ay * v1[1] + az * v1[2], p2 = ax * v2[0] + ay * v2[1] + az * v2[2]; const r = h[0] * Math.abs(ax) + h[1] * Math.abs(ay) + h[2] * Math.abs(az); return Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r; };
  for (const e of [e0, e1, e2]) { if (axisTest(0, -e[2], e[1]) || axisTest(e[2], 0, -e[0]) || axisTest(-e[1], e[0], 0)) return false; }
  for (let a = 0; a < 3; a += 1) { if (Math.min(v0[a], v1[a], v2[a]) > h[a] || Math.max(v0[a], v1[a], v2[a]) < -h[a]) return false; }
  const nx = e0[1] * e1[2] - e0[2] * e1[1], ny = e0[2] * e1[0] - e0[0] * e1[2], nz = e0[0] * e1[1] - e0[1] * e1[0];
  const d = nx * v0[0] + ny * v0[1] + nz * v0[2]; const r = h[0] * Math.abs(nx) + h[1] * Math.abs(ny) + h[2] * Math.abs(nz);
  return Math.abs(d) <= r;
}
const EPS = 1e-4; const HB = [(V - EPS) / 2, (V - EPS) / 2, (V - EPS) / 2];
let tris = 0, parts = 0, excluded = 0, invisible = 0;
for (let ni = 0; ni < J.nodes.length; ni += 1) {
  const node = J.nodes[ni]; if (node.mesh === undefined) continue; const own = node.name ?? ''; const name = parentName[ni] ? `${parentName[ni]}/${own}` : own;
  if (EXCLUDE.some((p) => own.startsWith(p) || name.startsWith(p))) { excluded += 1; continue; }
  parts += 1; const w = W[ni];
  for (const p of J.meshes[node.mesh].primitives) {
    if (alphaOf(p.material) < 0.1) { invisible += 1; continue; }
    const pos = accessor(g, p.attributes.POSITION); const idx = p.indices !== undefined ? accessor(g, p.indices) : null; const nt = idx ? idx.length / 3 : pos.length / 9;
    const P = (q) => { const x = pos[3 * q], y = pos[3 * q + 1], z = pos[3 * q + 2]; return [w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]]; };
    for (let t = 0; t < nt; t += 1) {
      const A = P(idx ? idx[3 * t] : 3 * t), B = P(idx ? idx[3 * t + 1] : 3 * t + 1), C = P(idx ? idx[3 * t + 2] : 3 * t + 2);
      const i0 = Math.max(0, cellOf(Math.min(A[0], B[0], C[0]), X0)), i1 = Math.min(NX - 1, cellOf(Math.max(A[0], B[0], C[0]), X0));
      const k0 = Math.max(0, cellOf(Math.min(A[1], B[1], C[1]), Y0)), k1 = Math.min(NY - 1, cellOf(Math.max(A[1], B[1], C[1]), Y0));
      const j0 = Math.max(0, cellOf(Math.min(A[2], B[2], C[2]), Z0)), j1 = Math.min(NZ - 1, cellOf(Math.max(A[2], B[2], C[2]), Z0));
      if (i0 > i1 || k0 > k1 || j0 > j1) continue; tris += 1;
      const e1 = sub(B, A), e2 = sub(C, A); const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const level = Math.abs(ny) > 0.95 * Math.hypot(nx, ny, nz); const ytop = Math.max(A[1], B[1], C[1]);
      for (let k = k0; k <= k1; k += 1) for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
        const id = at(i, k, j); if (surf[id] && !level) continue;
        const c = [X0 + (i + 0.5) * V + EPS / 2, Y0 + (k + 0.5) * V + EPS / 2, Z0 + (j + 0.5) * V + EPS / 2];
        if (!triBox(c, HB, A, B, C)) continue;
        surf[id] = 1;
        if (level) { const q = 1 + Math.round(Math.max(0, Math.min(1, (ytop - (Y0 + k * V)) / V)) * 254); if (q > fh[id]) fh[id] = q; }
      }
    }
  }
}
let nSurf = 0; for (let q = 0; q < N; q += 1) nSurf += surf[q];
lap(`${tris} triangles of ${parts} parts drawn (${excluded} excluded, ${invisible} invisible primitives): ${nSurf} cells hold the model`);
// ---- RAMP (a map's own data, as glb_parts_collision.mjs's): RAMP="x0,x1,z0,z1,lowY,highY,axis;..." in the model's metres — a
// stair or a ramp read as one slope, rising from lowY at the low end to highY at the high end along the axis (+x, -x, +z, -z).
// Before the flood the slope is drawn into the grid (the cell its plane crosses, in every column of the rectangle) and the
// cells within half a metre over it are cleared (the treads' noses, a mesh's frame), so a body is flooded up the slope as up a
// ramp; after it, the generator's floors topping inside the rectangle within the slope's heights go (the treads' lids, a flight's
// fragments) and the plane is a floor; the boxes under it end at it (user 2026-10-31, "use slope for stairs" — Neon's fire
// escapes and the scaffold's mesh ramps, which the generator read as strips and the solid as steps)
// ---- CLEAR (a map's own data): CLEAR="x0,x1,z0,z1,y0,y1;..." in the model's metres — boxes where the model is not read: a
// body walks through what the model draws there (Neon's south-east lobby, the V of a beam hanging into the hall's east arm 0.95 m
// over its floor, user 2026-10-31: "tunnel entrance blocked")
const CLEARS = [];
for (const spec of (process.env.CLEAR ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [cx0, cx1, cz0, cz1, cy0, cy1] = spec.split(',').map(Number); let n = 0; CLEARS.push({ cx0, cx1, cz0, cz1, cy0, cy1 });
  for (let k = Math.max(0, Math.ceil((cy0 - Y0) / V - 0.5)); k <= Math.min(NY - 1, Math.floor((cy1 - Y0) / V - 0.5)); k += 1) for (let j = Math.max(0, Math.ceil((cz0 - Z0) / V - 0.5)); j <= Math.min(NZ - 1, Math.floor((cz1 - Z0) / V - 0.5)); j += 1) for (let i = Math.max(0, Math.ceil((cx0 - X0) / V - 0.5)); i <= Math.min(NX - 1, Math.floor((cx1 - X0) / V - 0.5)); i += 1) { const id = at(i, k, j); if (surf[id]) { surf[id] = 0; fh[id] = 0; n += 1; } }
  lap(`CLEAR x ${cx0}..${cx1} z ${cz0}..${cz1} y ${cy0}..${cy1}: ${n} cells of the model not read`); }
// ---- FILL (a map's own data): FILL="x0,x1,z0,z1,y0,y1;..." in the model's metres — boxes read as solid whatever the model draws
// there: a shell's hollow a body got into, made one block (Neon's south-east podium over its lobby, user 2026-11-01: "unit will
// stuck in some kind of layer when jump in this tunnel ... keep it simple, no weird layers inside" — the lobby's ceiling and the
// shell's partitions and floors over it are CLEARed to 3.2 m, over a jump's reach, and the shell above FILLed to its roof)
const FILLS = [];
for (const spec of (process.env.FILL ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [cx0, cx1, cz0, cz1, cy0, cy1] = spec.split(',').map(Number); FILLS.push({ cx0, cx1, cz0, cz1, cy0, cy1 }); }
const RAMPS = (process.env.RAMP ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((spec) => { const parts = spec.split(','); const axis = parts.pop().trim(); const [x0, x1, z0, z1, lo, hi] = parts.map(Number); return { x0, x1, z0, z1, lo, hi, axis }; });
const rampH = (r, x, z) => { const t = r.axis === '+x' ? (x - r.x0) / (r.x1 - r.x0) : r.axis === '-x' ? (r.x1 - x) / (r.x1 - r.x0) : r.axis === '+z' ? (z - r.z0) / (r.z1 - r.z0) : (r.z1 - z) / (r.z1 - r.z0); return r.lo + Math.max(0, Math.min(1, t)) * (r.hi - r.lo); };
for (const r of RAMPS) { let laid = 0, cleared = 0;
  for (let j = Math.max(0, Math.ceil((r.z0 - Z0) / V - 0.5)); j <= Math.min(NZ - 1, Math.floor((r.z1 - Z0) / V - 0.5)); j += 1) for (let i = Math.max(0, Math.ceil((r.x0 - X0) / V - 0.5)); i <= Math.min(NX - 1, Math.floor((r.x1 - X0) / V - 0.5)); i += 1) {
    const h = rampH(r, X0 + (i + 0.5) * V, Z0 + (j + 0.5) * V); const kh = cellOf(h, Y0); if (kh < 0 || kh >= NY) continue;
    if (!surf[at(i, kh, j)]) { surf[at(i, kh, j)] = 1; laid += 1; }
    for (let k = kh + 1; k <= Math.min(NY - 1, cellOf(h + 0.5, Y0)); k += 1) { const id = at(i, k, j); if (surf[id]) { surf[id] = 0; fh[id] = 0; cleared += 1; } } }
  lap(`RAMP ${r.axis} x ${r.x0}..${r.x1} z ${r.z0}..${r.z1} ${r.lo}->${r.hi} m: ${laid} cells laid, ${cleared} cleared over it`); }
const fhOf = (id) => (fh[id] ? Y0 + Math.floor(id / LAYER) * V + ((fh[id] - 1) / 254) * V : null);

// ---- where a body's feet can be: every cell of its box free (BODY_R each side, the column's body height up from the feet; out
// of the grid is wall). LOW="x0,x1,z0,z1,h;..." (a map's own data, metres of the model): in those rectangles a body h metres
// tall counts as fitting — a space the model draws lower than a body, which the user wants walked all the same (Neon's south-
// east lobby, 1.57 m under its ceiling at 1 m a model unit; user 2026-10-31, "open it up, I'll adjust the unit scale later")
const colH = new Uint8Array(NX * NZ).fill(H); let lowCols = 0;
for (const spec of (process.env.LOW ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [lx0, lx1, lz0, lz1, lh] = spec.split(',').map(Number); const hl = Math.max(1, Math.round(lh / V));
  for (let j = Math.max(0, Math.floor((lz0 - Z0) / V)); j <= Math.min(NZ - 1, Math.floor((lz1 - Z0) / V)); j += 1) for (let i = Math.max(0, Math.floor((lx0 - X0) / V)); i <= Math.min(NX - 1, Math.floor((lx1 - X0) / V)); i += 1) { colH[j * NX + i] = Math.min(colH[j * NX + i], hl); lowCols += 1; } }
if (lowCols) lap(`${lowCols} columns where a lower body fits (LOW)`);
function bodyPlaces() {
  const cf = new Uint8Array(N);
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) { const hc = colH[j * NX + i]; let run = 0; for (let k = NY - 1; k >= 0; k -= 1) { const id = at(i, k, j); run = surf[id] ? 0 : run + 1; cf[id] = run >= hc ? 1 : 0; } }
  const tmp = new Uint8Array(Math.max(NX, NZ));
  for (let k = 0; k < NY; k += 1) for (let j = 0; j < NZ; j += 1) { const b = at(0, k, j); for (let i = 0; i < NX; i += 1) { let ok = 1; for (let d = -R; d <= R && ok; d += 1) { const ii = i + d; if (ii < 0 || ii >= NX || !cf[b + ii]) ok = 0; } tmp[i] = ok; } for (let i = 0; i < NX; i += 1) cf[b + i] = tmp[i]; }
  for (let k = 0; k < NY; k += 1) for (let i = 0; i < NX; i += 1) { for (let j = 0; j < NZ; j += 1) { let ok = 1; for (let d = -R; d <= R && ok; d += 1) { const jj = j + d; if (jj < 0 || jj >= NZ || !cf[at(i, k, jj)]) ok = 0; } tmp[j] = ok; } for (let j = 0; j < NZ; j += 1) cf[at(i, k, j)] = tmp[j]; }
  return cf;
}
// ---- the flood: from every place a body fits at the ceiling, through every place it fits, feet never over the ceiling
const flood = new Uint8Array(N);
function floodAll(cf) {
  flood.fill(0); const QN = 1 << 24; const Q = new Uint32Array(QN); let qh = 0, qt = 0, qn = 0;
  const push = (id) => { if (flood[id] || !cf[id]) return; flood[id] = 1; Q[qt] = id; qt = (qt + 1) & (QN - 1); qn += 1; if (qn >= QN) throw new Error('flood queue overflow'); };
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) push(at(i, KTOP, j));
  let nFlood = 0;
  while (qn > 0) { const id = Q[qh]; qh = (qh + 1) & (QN - 1); qn -= 1; nFlood += 1; const i = id % NX, r = (id - i) / NX, j = r % NZ, k = (r - j) / NZ;
    if (i > 0) push(id - 1); if (i < NX - 1) push(id + 1); if (j > 0) push(id - NX); if (j < NZ - 1) push(id + NX); if (k > 0) push(id - LAYER); if (k < KTOP) push(id + LAYER); }
  return nFlood;
}
lap(`${floodAll(bodyPlaces())} places a body's feet reach`);
// ---- THE VOID: a column with nothing of the model from half a metre under the street to a step over it has no ground — the
// sim's street (0) would carry a body there, over the model's nothing (the crop's corners beyond the ground's tiles). Every
// such column a body reaches at the street is walled to the top, as District's VOID rectangles are (VOID_DEBUG=1 maps them)
{ const kLo = 0, kHi = KS + Math.round(STEP / V); let walled = 0; const map = process.env.VOID_DEBUG ? [] : null;
  const isVoid = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) { let ground = false; for (let k = kLo; k <= kHi && !ground; k += 1) if (surf[at(i, k, j)]) ground = true; if (!ground) isVoid[j * NX + i] = 1; }
  // (a void column counts when a body's feet reach the street there or within a body's width of it)
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) { if (!isVoid[j * NX + i]) continue; let near = false;
    for (let dj = -R; dj <= R && !near; dj += 1) for (let di = -R; di <= R && !near; di += 1) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ && flood[at(ii, KS, jj)]) near = true; }
    if (!near) continue; walled += 1; for (let k = 0; k < NY; k += 1) surf[at(i, k, j)] = 1; }
  if (map) { for (let jm = 0; jm < NZ; jm += 4) { let row = ''; for (let im = 0; im < NX; im += 4) { let c = '.'; for (let j = jm; j < jm + 4; j += 1) for (let i = im; i < im + 4; i += 1) if (isVoid[j * NX + i]) c = c === 'W' ? c : 'v'; for (let j = jm; j < jm + 4; j += 1) for (let i = im; i < im + 4; i += 1) if (isVoid[j * NX + i] && surf[at(i, KS, j)] && surf[at(i, NY - 1, j)]) c = 'W'; row += c; } map.push(row); }
    writeFileSync(path.join(outDir, `${key}.void.txt`), `void map, 1 m a character, x ${X0}..${X1} left to right, z ${Z0}..${Z1} top to bottom: W walled (a body reached the street there), v void no body reaches\n${map.join('\n')}\n`); }
  lap(`${walled} void columns a body reached at the street walled to the top`);
  if (walled) lap(`${floodAll(bodyPlaces())} places a body's feet reach, the void walled`);
}
// ---- the air the bodies reach: every cell of a flooded body's box; the solid: from the street's air up, every cell no body reaches
const solid = new Uint8Array(N); let nSolid = 0;
{ const reach = new Uint8Array(N);
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) { const hc = colH[j * NX + i]; let last = -1e9; for (let k = 0; k < NY; k += 1) { const id = at(i, k, j); if (flood[id]) last = k; reach[id] = k - last < hc ? 1 : 0; } }
  const tmp = new Uint8Array(Math.max(NX, NZ));
  for (let k = 0; k < NY; k += 1) for (let j = 0; j < NZ; j += 1) { const b = at(0, k, j); for (let i = 0; i < NX; i += 1) { let any = 0; for (let d = -R; d <= R && !any; d += 1) { const ii = i + d; if (ii >= 0 && ii < NX && reach[b + ii]) any = 1; } tmp[i] = any; } for (let i = 0; i < NX; i += 1) reach[b + i] = tmp[i]; }
  for (let k = 0; k < NY; k += 1) for (let i = 0; i < NX; i += 1) { for (let j = 0; j < NZ; j += 1) { let any = 0; for (let d = -R; d <= R && !any; d += 1) { const jj = j + d; if (jj >= 0 && jj < NZ && reach[at(i, k, jj)]) any = 1; } tmp[j] = any; } for (let j = 0; j < NZ; j += 1) reach[at(i, k, j)] = tmp[j]; }
  for (let id = KS * LAYER; id < N; id += 1) if (!reach[id]) { solid[id] = 1; nSolid += 1; } }
for (const c of FILLS) { let n = 0;
  for (let k = Math.max(KS, Math.ceil((c.cy0 - Y0) / V - 0.5)); k <= Math.min(NY - 1, Math.floor((c.cy1 - Y0) / V - 0.5)); k += 1) for (let j = Math.max(0, Math.ceil((c.cz0 - Z0) / V - 0.5)); j <= Math.min(NZ - 1, Math.floor((c.cz1 - Z0) / V - 0.5)); j += 1) for (let i = Math.max(0, Math.ceil((c.cx0 - X0) / V - 0.5)); i <= Math.min(NX - 1, Math.floor((c.cx1 - X0) / V - 0.5)); i += 1) { const id = at(i, k, j); if (!solid[id]) { solid[id] = 1; nSolid += 1; n += 1; } flood[id] = 0; }
  lap(`FILL x ${c.cx0}..${c.cx1} z ${c.cz0}..${c.cz1} y ${c.cy0}..${c.cy1}: ${n} cells of air made solid`); }
lap(`${nSolid} solid cells over the street`);
// (PROBE="x,z;..." prints a column of cells, street up to 6 m over it: # the model, F a body's feet reached, . air reached, S solid)
for (const spec of (process.env.PROBE ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [px, pz] = spec.split(',').map(Number); const i = Math.floor((px - X0) / V), j = Math.floor((pz - Z0) / V); let row = '';
  for (let k = 0; k < Math.min(NY, KS + 26); k += 1) { const id = at(i, k, j); row += surf[id] ? '#' : flood[id] ? 'F' : solid[id] ? 'S' : '.'; }
  console.log(`  probe (${px}, ${pz}) col H ${colH[j * NX + i]}: cells from ${(Y0 - GROUND).toFixed(2)} m by ${V}: ${row}`); }

// ---- the generator's floors: kept where a flooded body's feet rest on them; the slopes and the ground's floors are used
const ax = (v) => (v - cx) * SCALE, ay = (v) => (v - GROUND) * SCALE, az = (v) => (v - cz) * SCALE;
const heightM = (s, xm, zm) => (s.type === 'plane' ? s.y0 + s.gx * (ax(xm) - s.minX) + s.gz * (az(zm) - s.minZ) : s.top) / SCALE + GROUND;
const colsOf = (s) => { const mx0 = s.minX / SCALE + cx, mx1 = s.maxX / SCALE + cx, mz0 = s.minZ / SCALE + cz, mz1 = s.maxZ / SCALE + cz;
  let ia = Math.ceil((mx0 - X0) / V - 0.5), ib = Math.floor((mx1 - X0) / V - 0.5), ja = Math.ceil((mz0 - Z0) / V - 0.5), jb = Math.floor((mz1 - Z0) / V - 0.5);
  if (ia > ib) ia = ib = Math.floor(((mx0 + mx1) / 2 - X0) / V); if (ja > jb) ja = jb = Math.floor(((mz0 + mz1) / 2 - Z0) / V);
  return [Math.max(0, ia), Math.min(NX - 1, ib), Math.max(0, ja), Math.min(NZ - 1, jb)]; };
const standsAt = (i, j, h) => { const kf = Math.ceil((h - Y0) / V - 1e-3); for (let k = Math.max(0, kf); k <= Math.min(KTOP, kf + 1); k += 1) if (flood[at(i, k, j)]) return true; return false; };
const kept = []; let genFloors = 0, unbacked = 0; const planeLog = process.env.PLANE_DEBUG ? ['x\tz\tw\td\ttop\tgrade\tbacked'] : null;   // (PLANE_DEBUG=1: every slope's share drawn, <key>.planes.tsv)
if (process.env.FLOORS) {
  const F = JSON.parse(readFileSync(process.env.FLOORS, 'utf8')); genFloors = F.surfaces.length;
  for (const s of F.surfaces) {
    // (a slope a body walks: no steeper than 45 degrees and half a metre wide or more — a flight, a ramp, a pitched roof; a
    //  brace's or a tower's chamfer's plane is no floor, the boxes under it are its solid)
    if (s.type === 'plane' && (Math.hypot(s.gx, s.gz) > 1 || Math.min(s.maxX - s.minX, s.maxZ - s.minZ) / SCALE < LID_MIN)) continue;
    const [ia, ib, ja, jb] = colsOf(s); let ok = false;
    // (a slope the model draws over three quarters of its rectangle or more: the model's face in the plane's own cell, nothing of
    //  it half a metre over — a chamfer along a container turned 45 degrees, a brace across a deck, read as a plane over their
    //  whole axis-aligned rectangle, stood 45-degree floors in the air over the sidewalk and through the cage; audit 2026-10-31.
    //  A slope left out is the solid's own stepped box tops)
    if (s.type === 'plane') { let backed = 0;
      for (let j = ja; j <= jb; j += 1) for (let i = ia; i <= ib; i += 1) { const kh = cellOf(heightM(s, X0 + (i + 0.5) * V, Z0 + (j + 0.5) * V), Y0); if (kh < 0 || kh + 2 >= NY) continue;
        if (surf[at(i, kh, j)] && !surf[at(i, kh + 2, j)]) backed += 1; }
      if (planeLog) planeLog.push(`${((s.minX + s.maxX) / 2 / SCALE + cx).toFixed(2)}\t${((s.minZ + s.maxZ) / 2 / SCALE + cz).toFixed(2)}\t${((s.maxX - s.minX) / SCALE).toFixed(2)}\t${((s.maxZ - s.minZ) / SCALE).toFixed(2)}\t${(s.maxTop / SCALE + GROUND).toFixed(2)}\t${Math.hypot(s.gx, s.gz).toFixed(2)}\t${(backed / ((ib - ia + 1) * (jb - ja + 1))).toFixed(2)}`);
      if (backed < 0.75 * (ib - ia + 1) * (jb - ja + 1)) { unbacked += 1; continue; } }
    for (let j = ja; j <= jb && !ok; j += 1) for (let i = ia; i <= ib && !ok; i += 1) if (standsAt(i, j, heightM(s, X0 + (i + 0.5) * V, Z0 + (j + 0.5) * V))) ok = true;
    if (ok) kept.push(s); } }
if (planeLog) writeFileSync(path.join(outDir, `${key}.planes.tsv`), `${planeLog.join('\n')}\n`);
// (the CLEARs: the generator's floors whose middle lies in a CLEAR box go — the model is not read there)
for (const c of CLEARS) for (let n = kept.length - 1; n >= 0; n -= 1) { const s = kept[n]; const mx = (s.minX + s.maxX) / 2 / SCALE + cx, mz = (s.minZ + s.maxZ) / 2 / SCALE + cz, top = s.maxTop / SCALE + GROUND;
  if (mx >= c.cx0 && mx <= c.cx1 && mz >= c.cz0 && mz <= c.cz1 && top >= c.cy0 && top <= c.cy1 + 0.3) kept.splice(n, 1); }
// (the RAMPs: the generator's floors whose middle lies in a ramp's rectangle and whose top lies within its heights go; the plane comes)
for (const r of RAMPS) {
  for (let n = kept.length - 1; n >= 0; n -= 1) { const s = kept[n]; const mx = (s.minX + s.maxX) / 2 / SCALE + cx, mz = (s.minZ + s.maxZ) / 2 / SCALE + cz, top = s.maxTop / SCALE + GROUND;
    if (mx >= r.x0 && mx <= r.x1 && mz >= r.z0 && mz <= r.z1 && top >= r.lo - 0.3 && top <= r.hi + 0.3) kept.splice(n, 1); }
  const g = (r.hi - r.lo) / ((r.axis === '+x' || r.axis === '-x') ? (r.x1 - r.x0) : (r.z1 - r.z0)); const y0 = ay(rampH(r, r.x0, r.z0));
  kept.push({ minX: Math.round(ax(r.x0) * 100) / 100, maxX: Math.round(ax(r.x1) * 100) / 100, minZ: Math.round(az(r.z0) * 100) / 100, maxZ: Math.round(az(r.z1) * 100) / 100, maxTop: Math.round(ay(r.hi) * 100) / 100, type: 'plane', y0: Math.round(y0 * 10000) / 10000, gx: r.axis === '+x' ? g : r.axis === '-x' ? -g : 0, gz: r.axis === '+z' ? g : r.axis === '-z' ? -g : 0, ramp: 1 });
}
// ---- FLOORCUT (a map's own data): FLOORCUT="x0,x1,z0,z1,y0,y1;..." in the model's metres — a generator floor whose top lies
// within y0..y1 loses its part inside the box; what reaches outside stays, as up to four rectangles (a slope keeps its gradient).
// The generator reads a plane over its whole rectangle when the model draws three quarters of it: Neon's south building's base
// plate, 0.48 m, so spread over the alley and the street north of the building's face, where a body walked a third of a metre
// over the street (user 2026-11-01, "feet 0.48 m" in the alley east of the south door)
for (const spec of (process.env.FLOORCUT ?? '').split(';').map((s) => s.trim()).filter(Boolean)) { const [cx0, cx1, cz0, cz1, cy0, cy1] = spec.split(',').map(Number); let cutN = 0, parts = 0;
  const x0 = ax(cx0), x1 = ax(cx1), z0 = az(cz0), z1 = az(cz1); const r100 = (v) => Math.round(v * 100) / 100;
  const hAt = (s, x, z) => s.type === 'plane' ? s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : s.top;
  for (let n = kept.length - 1; n >= 0; n -= 1) { const s = kept[n]; const top = s.maxTop / SCALE + GROUND; if (top < cy0 || top > cy1) continue;
    if (s.maxX <= x0 + 1e-6 || s.minX >= x1 - 1e-6 || s.maxZ <= z0 + 1e-6 || s.minZ >= z1 - 1e-6) continue;
    kept.splice(n, 1); cutN += 1; const pieces = [];
    if (s.minX < x0) pieces.push([s.minX, x0, s.minZ, s.maxZ]); if (s.maxX > x1) pieces.push([x1, s.maxX, s.minZ, s.maxZ]);
    const ix0 = Math.max(s.minX, x0), ix1 = Math.min(s.maxX, x1); if (s.minZ < z0) pieces.push([ix0, ix1, s.minZ, z0]); if (s.maxZ > z1) pieces.push([ix0, ix1, z1, s.maxZ]);
    for (const [px0, px1, pz0, pz1] of pieces) { if (px1 - px0 < SCALE * V || pz1 - pz0 < SCALE * V) continue;   // (a piece narrower than a cell goes)
      const p = { ...s, minX: r100(px0), maxX: r100(px1), minZ: r100(pz0), maxZ: r100(pz1) };
      if (s.type === 'plane') { p.y0 = Math.round(hAt(s, px0, pz0) * 10000) / 10000; p.maxTop = r100(Math.max(hAt(s, px0, pz0), hAt(s, px1, pz0), hAt(s, px0, pz1), hAt(s, px1, pz1))); }
      kept.push(p); parts += 1; } }
  lap(`FLOORCUT x ${cx0}..${cx1} z ${cz0}..${cz1} y ${cy0}..${cy1}: ${cutN} floors cut, ${parts} parts outside kept`);
}
// each kept floor tops the solid under it: the cell holding its face, if solid, carries its height (topH); over a slope the
// cells within half a metre over the plane — the treads' noses — are no solid, so the treads' boxes end under the slope
// (under a slope the cell carries the plane's LOWEST height over the cell, and a box with such a cell in its top layer ends at the
//  lowest of them: a box stretched along a flight topped at its highest point stood up to a metre proud of the slope in front of a
//  body climbing it — user 2026-10-31, "use slope for stairs", the first cut of the fire escapes)
const topH = new Map(); const slopeTop = new Map(); let carved = 0; const cut = new Uint8Array(N);   // (cut: the cells carved over the slopes)
for (const s of kept) { const [ia, ib, ja, jb] = colsOf(s);
  for (let j = ja; j <= jb; j += 1) for (let i = ia; i <= ib; i += 1) {
    const xc = X0 + (i + 0.5) * V, zc = Z0 + (j + 0.5) * V; const h = heightM(s, xc, zc); const kh = cellOf(h, Y0); if (kh < KS || kh >= NY) continue;
    if (s.type === 'plane') for (let k = kh + 1; k <= Math.min(NY - 1, kh + Math.ceil(0.5 / V)); k += 1) { const id = at(i, k, j); if (solid[id]) { solid[id] = 0; cut[id] = 1; carved += 1; } }
    const id = at(i, kh, j); if (!solid[id]) continue; topH.set(id, Math.max(topH.get(id) ?? -Infinity, h));
    if (s.type === 'plane') { const lo = Math.min(heightM(s, xc - V / 2, zc - V / 2), heightM(s, xc + V / 2, zc - V / 2), heightM(s, xc - V / 2, zc + V / 2), heightM(s, xc + V / 2, zc + V / 2)); slopeTop.set(id, Math.min(slopeTop.get(id) ?? Infinity, lo)); } } }
// a ground slab under a floor — a run of solid from the street up, its floor no more than a step over the street (the
// sidewalks, the lots' paving, a kerb) — is no box: the floor carries a body, and a body steps onto it from anywhere
let slabs = 0;
for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) { if (!solid[at(i, KS, j)]) continue; let kt = KS; while (kt + 1 < NY && solid[at(i, kt + 1, j)]) kt += 1;
  const h = topH.get(at(i, kt, j)); if (h == null || h - GROUND > STEP) continue; for (let k = KS; k <= kt; k += 1) solid[at(i, k, j)] = 0; slabs += 1; }
lap(`${kept.length} of ${genFloors} generator floors a body stands on (${unbacked} slopes the model does not draw left out); ${carved} cells over slopes carved; ${slabs} columns of ground slab left to their floors`);

// ---- the boxes. Each solid cell's depth (its chessboard distance to the nearest cell that is not solid, capped at 250);
// seeds taken deepest first, each grown into the largest box of four growth orders (each axis both ways, through cells other
// boxes cover too); then a box all of whose cells other boxes also cover is dropped, the last made first
const depth = new Uint8Array(N);
{ for (let id = KS * LAYER; id < N; id += 1) depth[id] = solid[id] ? 250 : 0;
  const nb = []; for (let dk = -1; dk <= 0; dk += 1) for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) { if (dk === 0 && (dj > 0 || (dj === 0 && di >= 0))) continue; nb.push([di, dj, dk]); }
  const scan = (dir) => { const ks = dir > 0 ? KS : NY - 1, ke = dir > 0 ? NY : KS - 1;
    for (let k = ks; k !== ke; k += dir) for (let j = dir > 0 ? 0 : NZ - 1; j !== (dir > 0 ? NZ : -1); j += dir) for (let i = dir > 0 ? 0 : NX - 1; i !== (dir > 0 ? NX : -1); i += dir) {
      const id = at(i, k, j); if (!depth[id]) continue; let m = depth[id];
      for (const [di, dj, dk] of nb) { const ii = i + dir * di, jj = j + dir * dj, kk = k + dir * dk; const d = (ii < 0 || ii >= NX || jj < 0 || jj >= NZ || kk < KS || kk >= NY) ? 250 : depth[at(ii, kk, jj)]; if (d + 1 < m) m = d + 1; }
      depth[id] = m; } };
  scan(1); scan(-1); }
// (no box holds both a slope's cell and the solid's top anywhere else: one over both ended at the slope's lowest point, so a lobby
//  hall's tiled floor past its entrance ramp lay a tenth of a metre under the tiles, the cage's mesh deck a third of a metre under
//  the mesh; audit 2026-10-31. The solid under them joins either)
const cellCls = new Uint8Array(N); for (let id = KS * LAYER; id < N; id += 1) if (solid[id] && !(id + LAYER < N && solid[id + LAYER])) cellCls[id] = 2;
for (const id of topH.keys()) if (solid[id]) cellCls[id] = 2; for (const id of slopeTop.keys()) if (solid[id]) cellCls[id] = 1;
let bc = 0, pend = 0;   // (the box's kind, 0 while it holds neither; a slab's kind while it is tried)
const okCell = (id) => { if (solid[id] !== 1) return false; const c = cellCls[id]; if (!c) return true; const want = bc || pend; if (!want) { pend = c; return true; } return c === want; };
const slab = (test) => { pend = 0; const ok = test(); if (ok && pend) bc = pend; pend = 0; return ok; };
function grow(i, k, j, order) {
  let i0 = i, i1 = i, j0 = j, j1 = j, k0 = k, k1 = k; bc = cellCls[at(i, k, j)];
  const colOk = (ii, jj) => { for (let kk = k0; kk <= k1; kk += 1) if (!okCell(at(ii, kk, jj))) return false; return true; };
  const xOk = (ii) => ii >= 0 && ii < NX && slab(() => { for (let jj = j0; jj <= j1; jj += 1) if (!colOk(ii, jj)) return false; return true; });
  const zOk = (jj) => jj >= 0 && jj < NZ && slab(() => { for (let ii = i0; ii <= i1; ii += 1) if (!colOk(ii, jj)) return false; return true; });
  const yOk = (kk) => kk >= KS && kk < NY && slab(() => { for (let jj = j0; jj <= j1; jj += 1) for (let ii = i0; ii <= i1; ii += 1) if (!okCell(at(ii, kk, jj))) return false; return true; });
  const gx = () => { while (xOk(i1 + 1)) i1 += 1; while (xOk(i0 - 1)) i0 -= 1; };
  const gz = () => { while (zOk(j1 + 1)) j1 += 1; while (zOk(j0 - 1)) j0 -= 1; };
  const gy = () => { while (yOk(k1 + 1)) k1 += 1; while (yOk(k0 - 1)) k0 -= 1; };
  for (const a of order) (a === 'x' ? gx : a === 'z' ? gz : gy)();
  return { i0, i1, j0, j1, k0, k1, vol: (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) };
}
const count = new Uint8Array(N); let boxes = [];
{ const hist = new Uint32Array(252); for (let id = KS * LAYER; id < N; id += 1) if (depth[id]) hist[depth[id]] += 1;
  const start = new Uint32Array(252); for (let d = 250, s = 0; d >= 1; d -= 1) { start[d] = s; s += hist[d]; }
  const order = new Uint32Array(nSolid + 1); const fill = start.slice(); for (let id = KS * LAYER; id < N; id += 1) if (depth[id]) order[fill[depth[id]]++] = id;
  for (let n = 0; n < order.length; n += 1) { const id = order[n]; if (!solid[id] || count[id]) continue;
    const i = id % NX, r = (id - i) / NX, j = r % NZ, k = (r - j) / NZ;
    let bx = null; for (const o of ['xzy', 'zxy', 'yxz', 'yzx']) { const c = grow(i, k, j, o); c.cls = bc; if (!bx || c.vol > bx.vol) bx = c; }
    for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (count[b + ii] < 255) count[b + ii] += 1; }
    boxes.push(bx); } }
const made = boxes.length;
// (a box all of whose cells other boxes also cover goes, the last made first; count: the boxes over each cell)
const dropCovered = () => { let dropped = 0;
  for (let n = boxes.length - 1; n >= 0; n -= 1) { const bx = boxes[n]; let spare = true;
    for (let kk = bx.k0; kk <= bx.k1 && spare; kk += 1) for (let jj = bx.j0; jj <= bx.j1 && spare; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (count[b + ii] < 2) { spare = false; break; } }
    if (!spare) continue; for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) count[b + ii] -= 1; }
    boxes[n] = null; dropped += 1; }
  boxes = boxes.filter(Boolean); return dropped; };
lap(`${made} boxes grown, ${dropCovered()} covered by the others and dropped: ${boxes.length}`);
// a box's top: the generator's floor read in its top cells (the highest), under a slope's cells the slope's lowest point over them,
// else the model's level face in all its top cells (the highest), else the cells' top; and under a slope's own boxes, the slope's
// lowest point over it (uMin: such a box is stepped over, like them — held against, the boxes under the fire escapes stopped a body
// at the flight's foot). how: 1 at a generator floor, 2 at a level face
const topOf = (b) => { let my1 = Y0 + (b.k1 + 1) * V, tH = -Infinity, fAll = true, fMax = -Infinity, sMin = Infinity, how = 0;
  for (let j = b.j0; j <= b.j1; j += 1) for (let i = b.i0; i <= b.i1; i += 1) { const id = at(i, b.k1, j); const h = topH.get(id); if (h != null && h > tH) tH = h; const sl = slopeTop.get(id); if (sl != null && sl < sMin) sMin = sl; const f = fhOf(id); if (f == null) fAll = false; else if (f > fMax) fMax = f; }
  if (sMin < Infinity) tH = sMin;
  if (tH > -Infinity) { my1 = tH; how = 1; } else if (fAll && fMax > -Infinity) { my1 = fMax; how = 2; }
  let uMin = Infinity; if (b.k1 + 1 < NY) for (let j = b.j0; j <= b.j1; j += 1) for (let i = b.i0; i <= b.i1; i += 1) { const up = at(i, b.k1 + 1, j); if (cellCls[up] === 1) uMin = Math.min(uMin, slopeTop.get(up)); }
  if (uMin < my1) my1 = uMin;
  return { my1, tH, sMin, uMin, how }; };

// ---- the boxes in arena units, and their floors. A box's top: the generator's floor read there (topH, the highest in its
// top cells), else the level face in all its top cells (the highest), else the cells' top. Lidded when a body stands on it
// (a flooded body's feet over it, the top LID_MIN wide or more: a floor of its own) or when it is no taller than a step
const r2 = (v) => Math.round(v * 100) / 100; const obstacles = []; const floors = []; let topped = 0, faced = 0, stood = 0, joined = 0, lowLids = 0, gone = 0, eased = 0;
const PROBE_BOX = process.env.PROBE_BOX ? process.env.PROBE_BOX.split(',').map(Number) : null;   // ("x,z,h" model metres: each box over the point near that height, and how its floor was read)
// (each box's top first, with the columns a body stands on over it; then the floors)
const tops = []; const standCols = new Map();
for (const b of boxes) {
  const mx0 = X0 + b.i0 * V, mx1 = X0 + (b.i1 + 1) * V, mz0 = Z0 + b.j0 * V, mz1 = Z0 + (b.j1 + 1) * V, my0 = Y0 + b.k0 * V;
  const { my1, tH, sMin, uMin, how } = topOf(b);
  if (how === 1) topped += 1; else if (how === 2) faced += 1;
  if (my1 <= my0 + 0.01) { gone += 1; b.gone = true; continue; }
  const cols = []; for (let j = b.j0; j <= b.j1; j += 1) for (let i = b.i0; i <= b.i1; i += 1) if (standsAt(i, j, my1)) { const c = j * NX + i; cols.push(c); const a = standCols.get(c); if (a) a.push(my1); else standCols.set(c, [my1]); }
  tops.push({ b, mx0, mx1, mz0, mz1, my0, my1, tH, sMin, uMin, cols });
}
// (a top narrower than a floor, or stood on over less than a floor's width, still carries one over the columns where it and the
//  tops beside it within 0.15 m make a floor's square: a roof's strip turned 40 degrees reads as rows of boxes a quarter metre
//  wide, none a floor alone, and with the slope over it left out a body fell through the strip to the street; review 2026-10-31.
//  Not under a slope, the slope is the floor there; a bar or a lip alone, or among tops of another height, makes no square)
const SQ = Math.max(1, Math.ceil(LID_MIN / V - 1e-6));
const stoodNear = (i, j, h) => { if (i < 0 || j < 0 || i >= NX || j >= NZ) return false; const a = standCols.get(j * NX + i); if (a) for (const v of a) if (Math.abs(v - h) <= 0.15 + 1e-6) return true; return false; };
const inSquare = (i, j, h) => { for (let a = i - SQ + 1; a <= i; a += 1) for (let c = j - SQ + 1; c <= j; c += 1) { let all = true;
  for (let jj = c; jj < c + SQ && all; jj += 1) for (let ii = a; ii < a + SQ; ii += 1) if (!stoodNear(ii, jj, h)) { all = false; break; }
  if (all) return true; } return false; };
for (const { b, mx0, mx1, mz0, mz1, my0, my1, tH, sMin, uMin, cols } of tops) {
  const o = { minX: r2(ax(mx0)), maxX: r2(ax(mx1)), minZ: r2(az(mz0)), maxZ: r2(az(mz1)), minY: r2(ay(my0)), maxY: r2(ay(my1)) };
  // (the floor over the columns a body stands on — their bounding rectangle, so a box under another box's side carries no floor
  //  inside the other)
  let lid = false; let fi0 = Infinity, fi1 = -Infinity, fj0 = Infinity, fj1 = -Infinity;
  const take = (c) => { const i = c % NX, j = (c - i) / NX; if (i < fi0) fi0 = i; if (i > fi1) fi1 = i; if (j < fj0) fj0 = j; if (j > fj1) fj1 = j; };
  if (Math.min(mx1 - mx0, mz1 - mz0) >= LID_MIN - 1e-6) { for (const c of cols) take(c);
    if (fi0 <= fi1 && (fi1 - fi0 + 1) * V >= LID_MIN - 1e-6 && (fj1 - fj0 + 1) * V >= LID_MIN - 1e-6) { lid = true; stood += 1; } }
  if (!lid && my1 - my0 <= STEP + 1e-6) { lid = true; lowLids += 1; fi0 = b.i0; fi1 = b.i1; fj0 = b.j0; fj1 = b.j1; }
  if (!lid && cols.length && sMin === Infinity && uMin === Infinity) { fi0 = Infinity; fi1 = -Infinity; fj0 = Infinity; fj1 = -Infinity;
    for (const c of cols) { const i = c % NX, j = (c - i) / NX; if (inSquare(i, j, my1)) take(c); }
    if (fi0 <= fi1) { lid = true; joined += 1; } }
  if (PROBE_BOX && mx0 <= PROBE_BOX[0] && mx1 >= PROBE_BOX[0] && mz0 <= PROBE_BOX[1] && mz1 >= PROBE_BOX[1] && my0 - GROUND <= PROBE_BOX[2] && my1 - GROUND + 0.3 >= PROBE_BOX[2]) console.log(`  probe box ${(my0 - GROUND).toFixed(2)}..${(my1 - GROUND).toFixed(2)} [x ${mx0.toFixed(2)}..${mx1.toFixed(2)} z ${mz0.toFixed(2)}..${mz1.toFixed(2)}] cells k ${b.k0}..${b.k1}, ${cols.length} stood columns${cols.length ? ` x ${(X0 + (Math.min(...cols.map((c) => c % NX))) * V).toFixed(2)}..${(X0 + (Math.max(...cols.map((c) => c % NX)) + 1) * V).toFixed(2)} z ${(Z0 + Math.min(...cols.map((c) => (c - c % NX) / NX)) * V).toFixed(2)}..${(Z0 + (Math.max(...cols.map((c) => (c - c % NX) / NX)) + 1) * V).toFixed(2)}` : ''}, lid ${lid}, cls ${b.cls}`);
  if (lid) { o.topBuffer = 0.8; floors.push({ minX: r2(ax(X0 + fi0 * V)), maxX: r2(ax(X0 + (fi1 + 1) * V)), minZ: r2(az(Z0 + fj0 * V)), maxZ: r2(az(Z0 + (fj1 + 1) * V)), maxTop: o.maxY, type: 'flat', top: o.maxY, ...(my1 - my0 <= STEP + 1e-6 && Math.min(mx1 - mx0, mz1 - mz0) < LID_MIN ? { lid: 1 } : {}) }); }
  // (a box under a slope's foot or a floor it does not carry itself, or one narrower than a floor — a bar, a lip: stepped over, not
  //  held against; the bar at the walkway ramp's foot, 0.37 m over the cage's roof, held a body at the ramp)
  else if (tH > -Infinity || uMin < Infinity || Math.min(mx1 - mx0, mz1 - mz0) < LID_MIN - 1e-6) o.topBuffer = 0.8;
  obstacles.push(o); b.obst = o;
}
// the generator's floors that stay: the slopes, and the ground's floors a step or less over the street
const genKept = kept.filter((s) => s.type === 'plane' || s.maxTop / SCALE <= STEP + 1e-6);
// (a wall a floor lies over at a height it holds a body standing there — the floor up to 0.39 m over its top, physics.js
//  boxHoldsAt: a body's centre GROUND_BASE_Y over its feet, a wall's topBuffer 4 — or at its top, 0.15 m under it at most, is
//  stepped over instead, as the boxes the generator's floors top are: with the slope over it left out, the boxes under the tower's
//  ledge were walls, and a body landing on the ledge was pushed off it; review 2026-10-31. A wall standing further over a floor
//  stays one: stepped over, a body's legs would sink into it)
{ const HOLD_OVER = 4 - 2.45, PASS_UNDER = -0.15 * SCALE; const lying = [...genKept, ...floors];
  const at2 = (s, x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ);
  for (const o of obstacles) { if (o.topBuffer != null) continue;
    for (const s of lying) { const x0 = Math.max(o.minX, s.minX), x1 = Math.min(o.maxX, s.maxX), z0 = Math.max(o.minZ, s.minZ), z1 = Math.min(o.maxZ, s.maxZ); if (x1 - x0 < 0.25 || z1 - z0 < 0.25) continue;
      let lo = s.top ?? s.maxTop, hi = lo; if (s.type === 'plane') { const hs = [at2(s, x0, z0), at2(s, x1, z0), at2(s, x0, z1), at2(s, x1, z1)]; lo = Math.min(...hs); hi = Math.max(...hs); }
      if (hi > o.maxY + PASS_UNDER && lo <= o.maxY + HOLD_OVER) { o.topBuffer = 0.8; eased += 1; break; } } } }
// ---- MERGE=<m> (m, 0: off): the big things' boxes merged, the floors read above kept as they are. The boxes grown through one
// block overlap — each as large as the solid allows, nine in ten of the solid's cells under two or more, their cells seventeen
// times the solid on Neon — and a bevel, a rounded wall, a roof's lips are stacks of quarter-metre steps (user 2026-11-01: "I'm
// concerning about those huge clustered cboxes; many of them could have been merged"). First each box is shrunk to the bounding box
// of the cells it alone covers, the smallest first, so the largest keep their reach and the others become the slabs around them.
// Then two boxes that touch become their bounding box when the air it takes in lies no deeper than m from its sides and no deeper
// than MERGE_V (a cell) from its top or bottom — a box thinner than that is read through its middle, so two kerbs never make a slab
// across the street between them, nor two walls a wall across the doorway between them — when it holds a cell MERGE_DEEP cells
// from any air (the thick of a wall, a block, a container: a lamp, a rail, a sign, a bin has none, and is left as it is — "keep
// the small items as they are"), when it holds no slope's cell together with a top's (the classes above), and when the tops of
// the boxes it took in lie within MERGE_V of its own (the higher of the two: a floor read on a part is never more than MERGE_V
// under the merged box's top, through any chain of merges). The slopes are left alone: a slope's own boxes and the boxes under
// them never shrink or merge, and no merged box takes in the air carved over a slope (merged over the fire escape's foot, a box
// held a body at the flight; the walkway's platform rose a third of a metre over its ramp's end). The largest boxes first, each
// merged with the touching neighbour adding the least air, again until none can. A merged or shrunk box carries its floors'
// stepping: a floor on it within the engine's floorTop window (0.3 units) gives it topBuffer 0.8 as a lid does; a floor further
// under its top (up to MERGE_V) a topBuffer smaller by that depth (a body passes a box once its centre is topBuffer over the top:
// the lowest floor on the box stays passable), so a body steps onto the floor as before; a part of a stepped-over
// box stays stepped over; no floor and no such part, a wall
const MERGE = Number(process.env.MERGE ?? 0), MERGE_V = Number(process.env.MERGE_V ?? 0), MERGE_DEEP = Number(process.env.MERGE_DEEP ?? 2), TRIM = process.env.TRIM === '1';
if (MERGE > 0 || TRIM) {
  const th = MERGE > 0 ? Math.round(MERGE / V) : 0, tv = Math.round(MERGE_V / V);   // (TRIM alone: th 0, a merge only where the merged box takes in no air)
  // the solid's cells, its deep cells and the cells carved over the slopes, counted in every box from the grid's corner: a box's
  // count is eight corner reads
  const PX = NX + 1, PZ = NZ + 1; const pAt = (i, k, j) => (k * PZ + j) * PX + i; const table = (is) => { const P = new Uint32Array(PX * PZ * (NY + 1));
    for (let k = 1; k <= NY; k += 1) for (let j = 1; j <= NZ; j += 1) { let row = 0; for (let i = 1; i <= NX; i += 1) { row += is(at(i - 1, k - 1, j - 1)); P[pAt(i, k, j)] = row + P[pAt(i, k - 1, j)] + P[pAt(i, k, j - 1)] - P[pAt(i, k - 1, j - 1)]; } } return P; };
  const PS = table((id) => solid[id]), PD = table((id) => (solid[id] && depth[id] >= MERGE_DEEP ? 1 : 0)), PC = table((id) => cut[id]);
  const sum = (P, i0, i1, j0, j1, k0, k1) => P[pAt(i1 + 1, k1 + 1, j1 + 1)] - P[pAt(i0, k1 + 1, j1 + 1)] - P[pAt(i1 + 1, k0, j1 + 1)] - P[pAt(i1 + 1, k1 + 1, j0)] + P[pAt(i0, k0, j1 + 1)] + P[pAt(i0, k1 + 1, j0)] + P[pAt(i1 + 1, k0, j0)] - P[pAt(i0, k0, j0)];
  const volOf = (b) => (b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1) * (b.k1 - b.k0 + 1);
  for (const t of tops) { const b = t.b; b.top = t.my1; b.low = t.my1; b.tb = b.obst.topBuffer ?? -1; b.frozen = b.cls === 1 || t.sMin < Infinity || t.uMin < Infinity; }
  let live = boxes.filter((b) => !b.gone); const frozen = live.filter((b) => b.frozen).length;
  const recount = () => { count.fill(0); for (const bx of live) for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (count[b + ii] < 255) count[b + ii] += 1; } };
  recount(); let shrunk = 0;
  for (const bx of [...live].sort((a, b) => a.vol - b.vol)) { if (bx.frozen) continue; let i0 = NX, i1 = -1, j0 = NZ, j1 = -1, k0 = NY, k1 = -1;
    for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (count[b + ii] === 1) { if (ii < i0) i0 = ii; if (ii > i1) i1 = ii; if (jj < j0) j0 = jj; if (jj > j1) j1 = jj; if (kk < k0) k0 = kk; if (kk > k1) k1 = kk; } }
    if (i1 < 0 || (i0 === bx.i0 && i1 === bx.i1 && j0 === bx.j0 && j1 === bx.j1 && k0 === bx.k0 && k1 === bx.k1)) continue;
    for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (ii < i0 || ii > i1 || jj < j0 || jj > j1 || kk < k0 || kk > k1) count[b + ii] -= 1; }
    const top = Math.min(bx.top, Y0 + (k1 + 1) * V); Object.assign(bx, { i0, i1, j0, j1, k0, k1, vol: (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1), top, low: top, changed: true }); shrunk += 1; }
  // the boxes by the 2 m squares they touch
  const G = 8; const cells = new Map(); const gk = (a, b, c) => (a * 1000 + b) * 1000 + c;
  const forCells = (b, f) => { for (let a = (b.i0 / G) | 0; a <= (b.i1 / G) | 0; a += 1) for (let c = (b.k0 / G) | 0; c <= (b.k1 / G) | 0; c += 1) for (let d = (b.j0 / G) | 0; d <= (b.j1 / G) | 0; d += 1) f(gk(a, c, d)); };
  const put = (n) => forCells(live[n], (key) => { let s = cells.get(key); if (!s) { s = new Set(); cells.set(key, s); } s.add(n); });
  const take = (n) => forCells(live[n], (key) => { const s = cells.get(key); if (s) s.delete(n); });
  const over = (b, f) => { const seen = new Set(); forCells(b, (key) => { const s = cells.get(key); if (s) for (const n of s) if (!seen.has(n)) { seen.add(n); f(n); } }); };
  const meets = (a, b) => a.i0 <= b.i1 && b.i0 <= a.i1 && a.j0 <= b.j1 && b.j0 <= a.j1 && a.k0 <= b.k1 && b.k0 <= a.k1;
  for (let n = 0; n < live.length; n += 1) put(n);
  let merges = 0; const order = live.map((b, n) => n).sort((a, b) => live[b].vol - live[a].vol);
  for (const n of order) { if (!live[n] || live[n].frozen) continue;
    for (;;) { const A = live[n]; let best = null, bestAir = Infinity;
      const reach = { i0: Math.max(0, A.i0 - 1), i1: Math.min(NX - 1, A.i1 + 1), j0: Math.max(0, A.j0 - 1), j1: Math.min(NZ - 1, A.j1 + 1), k0: Math.max(KS, A.k0 - 1), k1: Math.min(NY - 1, A.k1 + 1) };
      over(reach, (m) => { const B = live[m]; if (m === n || !B || B.frozen || !meets(reach, B)) return; if (A.cls && B.cls && A.cls !== B.cls) return;
        const top = Math.max(A.top, B.top); let low = Math.min(A.low, B.low); if (top - low > MERGE_V + 1e-6) return;
        const U = { i0: Math.min(A.i0, B.i0), i1: Math.max(A.i1, B.i1), j0: Math.min(A.j0, B.j0), j1: Math.max(A.j1, B.j1), k0: Math.min(A.k0, B.k0), k1: Math.max(A.k1, B.k1) };
        const vol = volOf(U); const air = vol - sum(PS, U.i0, U.i1, U.j0, U.j1, U.k0, U.k1); if (air >= bestAir) return;
        if (air && (!sum(PD, U.i0, U.i1, U.j0, U.j1, U.k0, U.k1) || sum(PC, U.i0, U.i1, U.j0, U.j1, U.k0, U.k1))) return;
        // (the core: the box less m each side, less MERGE_V top and bottom, never less than its middle cell; no air in it)
        const mi = (U.i0 + U.i1) >> 1, mj = (U.j0 + U.j1) >> 1, mk = (U.k0 + U.k1) >> 1;
        const c = { i0: Math.min(U.i0 + th, mi), i1: Math.max(U.i1 - th, mi), j0: Math.min(U.j0 + th, mj), j1: Math.max(U.j1 - th, mj), k0: Math.min(U.k0 + tv, mk), k1: Math.max(U.k1 - tv, mk) };
        if (sum(PS, c.i0, c.i1, c.j0, c.j1, c.k0, c.k1) < volOf(c)) return;
        let cls = A.cls || B.cls, ok = true; over(U, (q) => { const C = live[q]; if (!ok || !C || !meets(U, C)) return; if (C.frozen) { ok = false; return; }
          if (C.i0 >= U.i0 && C.i1 <= U.i1 && C.j0 >= U.j0 && C.j1 <= U.j1 && C.k0 >= U.k0 && C.k1 <= U.k1) { if (C.low < low) low = C.low; if (top - low > MERGE_V + 1e-6) { ok = false; return; } }
          if (!C.cls) return; if (!cls) cls = C.cls; else if (C.cls !== cls) ok = false; });
        if (!ok) return; best = { m, U, cls, vol, top, low }; bestAir = air; });
      if (!best) break;
      take(n); take(best.m); live[n] = { ...best.U, vol: best.vol, cls: best.cls, top: best.top, low: best.low, tb: Math.max(A.tb, live[best.m].tb), frozen: false, changed: true }; live[best.m] = null; put(n); merges += 1; } }
  live = live.filter(Boolean); recount(); let dropped = 0;
  for (let n = live.length - 1; n >= 0; n -= 1) { const bx = live[n]; if (bx.frozen) continue; let spare = true;
    for (let kk = bx.k0; kk <= bx.k1 && spare; kk += 1) for (let jj = bx.j0; jj <= bx.j1 && spare; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) if (count[b + ii] < 2) { spare = false; break; } }
    if (!spare) continue; for (let kk = bx.k0; kk <= bx.k1; kk += 1) for (let jj = bx.j0; jj <= bx.j1; jj += 1) { const b = at(0, kk, jj); for (let ii = bx.i0; ii <= bx.i1; ii += 1) count[b + ii] -= 1; }
    live[n] = null; dropped += 1; }
  live = live.filter(Boolean);
  // the obstacles again: a box left as it was keeps its own; a shrunk or merged box is read afresh, its stepping from the floors on it
  const HOLD_OVER = 4 - 2.45; const lying = [...genKept, ...floors]; const at2 = (s, x, z) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ);
  const floorOn = (o) => { let best = Infinity;
    for (const s of lying) { const x0 = Math.max(o.minX, s.minX), x1 = Math.min(o.maxX, s.maxX), z0 = Math.max(o.minZ, s.minZ), z1 = Math.min(o.maxZ, s.maxZ); if (x1 - x0 < 0.25 || z1 - z0 < 0.25) continue;
      let lo = s.top ?? s.maxTop, hi = lo; if (s.type === 'plane') { const hs = [at2(s, x0, z0), at2(s, x1, z0), at2(s, x0, z1), at2(s, x1, z1)]; lo = Math.min(...hs); hi = Math.max(...hs); }
      if (hi > o.maxY - MERGE_V * SCALE - 0.01 && lo <= o.maxY + HOLD_OVER && hi < best) best = hi; }
    return best; };
  let kept = 0, read = 0, air = 0; const merged = [];
  for (const bx of live) { air += volOf(bx) - sum(PS, bx.i0, bx.i1, bx.j0, bx.j1, bx.k0, bx.k1); if (!bx.changed && bx.obst) { merged.push(bx.obst); kept += 1; continue; }
    const o = { minX: r2(ax(X0 + bx.i0 * V)), maxX: r2(ax(X0 + (bx.i1 + 1) * V)), minZ: r2(az(Z0 + bx.j0 * V)), maxZ: r2(az(Z0 + (bx.j1 + 1) * V)), minY: r2(ay(Y0 + bx.k0 * V)), maxY: r2(ay(bx.top)) };
    // (its stepping: its parts' own (a lid's, a bar's, a slope's foot's: a part of a stepped-over box is stepped over), or from the floors on it)
    const f = floorOn(o); let tb = bx.tb; if (f < Infinity) tb = o.maxY - f <= 0.3 ? 0.8 : r2(0.8 - (o.maxY - f)); else if (Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < LID_MIN * SCALE - 1e-6) tb = Math.max(tb, 0.8); if (f < Infinity || tb >= 0) o.topBuffer = tb;
    merged.push(o); read += 1; }
  obstacles.length = 0; obstacles.push(...merged);
  lap(`${MERGE > 0 ? `MERGE ${MERGE} m (${MERGE_V} m up and down, a core ${MERGE_DEEP} cells deep` : 'TRIM (merges only without air'}; ${frozen} boxes at the slopes left alone): ${shrunk} boxes shrunk to their own cells, ${merges} merges, ${dropped} more covered and dropped: ${obstacles.length} boxes (${kept} as they were, ${read} read afresh), taking in ${(air * V * V * V).toFixed(0)} m3 of air`);
}
// (a flat floor inside another of its height and kind goes, the first of two alike stays: the boxes over one block, each as large
//  as the solid allows, overlap, and each carried its own floor — sixteen over the grey block's roof; the list keeps its order)
const surfaces = [...genKept, ...floors]; const spare = new Uint8Array(surfaces.length);
{ const groups = new Map(); surfaces.forEach((s, n) => { if (s.type !== 'flat') return; const g = `${s.top}|${s.lid ? 1 : 0}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); });
  const holds = (a, b) => a.minX <= b.minX && a.maxX >= b.maxX && a.minZ <= b.minZ && a.maxZ >= b.maxZ;
  for (const list of groups.values()) for (const n of list) for (const m of list) { if (m === n || spare[m]) continue; const a = surfaces[m], b = surfaces[n];
    if (holds(a, b) && (!holds(b, a) || m < n)) { spare[n] = 1; break; } } }
// (a floor wholly inside a FILL box, under its top, goes: the boxes beside the fill grew through it and carried their tops' floors
//  into the solid; one reaching outside stays, its part in the solid no place a body comes to)
for (const c of FILLS) surfaces.forEach((s, n) => { if (spare[n]) return; const top = s.maxTop / SCALE + GROUND;
  if (s.minX / SCALE + cx >= c.cx0 && s.maxX / SCALE + cx <= c.cx1 && s.minZ / SCALE + cz >= c.cz0 && s.maxZ / SCALE + cz <= c.cz1 && top >= c.cy0 && top < c.cy1 - V) spare[n] = 1; });
const outSurfaces = surfaces.filter((s, n) => !spare[n]);
lap(`${obstacles.length} boxes in the data (tops: ${topped} at a generator floor, ${faced} at the model's level face; ${gone} gone under their floor); floors: ${stood} box tops a body stands on, ${joined} narrower tops making a floor with their neighbours, ${lowLids} low lids; ${eased} walls under a floor stepped over; ${genKept.length} slopes and ground floors from the generator; ${surfaces.length - outSurfaces.length} floors inside another dropped`);
const out = { key, transform: { scale: SCALE, cx, cz, ground: GROUND, exclude: EXCLUDE, ceil: CEIL, solid: true, voxel: V, bodyH: BODY_H, bodyR: R, floors: process.env.FLOORS ? path.basename(process.env.FLOORS) : null }, halfX: Math.round(((X1 - X0) / 2) * SCALE * 10) / 10, halfZ: Math.round(((Z1 - Z0) / 2) * SCALE * 10) / 10, spawns: {}, obstacles, surfaces: outSurfaces };
mkdirSync(outDir, { recursive: true }); writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(out));
console.log(`${key}: ${obstacles.length} boxes, ${out.surfaces.length} surfaces; halfX ${out.halfX} halfZ ${out.halfZ} -> ${path.join(outDir, `${key}.json`)}`);
