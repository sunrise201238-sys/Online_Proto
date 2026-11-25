// TOWN, THE CEMENT MIXER AND THE FIRE TRUCK AS SIMPLE BOXES (b1105le, 2026-11-25). The user, with boxes of both picked on the page (#5362, #5599, #5702 on the mixer;
// #5386, #5574 on the fire truck) and Town's car as the example (#7561, #7562: a body and a cabin, two boxes): "This two vehicles' cboxes are too complicated and have
// weird gaps not matching its visual. Simplified these two vehicle's cboxes. No need to be pixel accurate. No need looking for other spots."
// The reading had made of the two, ladder and all, 652 boxes, 740 floors and 85 slopes: quarter-metre cells for every mirror, step, rung and lamp, with holes
// between — rounds fired across the mixer's cab came through at four places of thirteen. Both stand
// turned on the west terrace (2.37 m over the street) — the mixer's long side 30 degrees off the map's x, the fire truck's 34 degrees off its z — so a thing's plan
// is a rectangle turned with it, and what goes in is that rectangle in upright slices across the map's nearer axis (Compound's farm trailer, b1102p: "use the same
// simple cbox logic" — boxes in steps along its turn): a slice is a box of the area the rectangle has in it, centred where it lies, 1.2 m wide at most along the
// thing's sides and 0.75 m at most through its two ends, where the rectangle's corners are, so the steps stand out of the thing's side or fall short of it by 0.3 m
// or so everywhere (the tool measures it and says). The parts of a thing lie along its long side, each with its top — the mixer's drum and cab; the fire truck's
// body and its front bumper — and where two meet inside a slice the slice's box is cut across in the share each has of it: the steps' outline is the whole plan's,
// with no seam in it. Two pieces are a box each: the mixer's chute behind the drum, narrower than the truck, and the fire truck's round turntable on its body.
// Each box stands from the terrace with a lid, as data_boxes.mjs makes them (it is run for the boxes; the reading's entries they stand for go out by its rule).
// The fire truck's ladder, 173 thin cells in steps from the turntable up to the wall, is one sloped floor a body walks as it walked the steps: nothing under it,
// as one sees, and a round that crosses it stops as it stopped at a cell.
// usage: node town_trucks.mjs <town_data.json in> <town_data.json out>      (run again on its own output: the same file)
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const [IN, OUT] = process.argv.slice(2); if (!IN || !OUT) { console.error('usage: node town_trucks.mjs <town_data.json in> <town_data.json out>'); process.exit(1); }
const SCALE = 4, CX = -0.5, CZ = -10, BASE = 2.37;   // (Town's GLB_MAPS line; the terrace under both, metres over the street)
const W_SIDE = 1.2, W_END = 0.75, SLIVER = 0.2, FIT = 0.4;   // (the widest slice along a thing's sides and through its ends; a part's share of a slice thinner than this joins its neighbour; no step may miss the plan by more)
// (model metres, cut from the model's Object_73: `at` a corner of the thing's least rectangle — mirrors and all — `deg` its long side's direction from +x toward +z,
// `len` and `wid` that rectangle's; along the long side u and across it v from that corner: `plan` the body's rectangle u0, u1, v0, v1; `parts` each up to its u
// with its top over the street; `lone` the pieces that are a box each, u0, u1, v0, v1 and the top)
const THINGS = [
  { name: 'the cement mixer', at: [-38.35, -10.67], deg: 150, len: 7.62, wid: 3.01, plan: [0.75, 7.45, 0.32, 2.92], parts: [['the drum', 5.25, 5.9], ['the cab', 7.45, 4.9]], lone: [['the chute', 0, 1.35, 0.78, 2.37, 5.0]] },
  { name: 'the fire truck', at: [-62.18, -12.80], deg: 56, len: 8.86, wid: 3.84, plan: [0, 8.86, 0.40, 3.44], parts: [['the body', 8.3, 5.1], ['the bumper', 8.86, 3.2]], lone: [['the turntable', 1.35, 3.15, 1.02, 2.82, 6.0]] } ];
const LADDER = { x: [-66.46, -62.20], z: [-10.38, -9.31], h: [9.40, 6.00], win: [-66.5, -62.0, -10.8, -8.9], over: 5.75 };   // (its run along x, its width, its height at the two ends; the window its cells lie in, and the height over which they are its own)
const r2 = (v) => Math.round(v * 100) / 100; const boxes = [];
// a turned rectangle between two cuts of an axis: the polygon there, and its area with its middle across
const clip = (P, k, lo, hi) => { let Q = P; for (const [lim, sgn] of [[lo, 1], [hi, -1]]) { const R = []; for (let i = 0; i < Q.length; i += 1) { const a = Q[i], b = Q[(i + 1) % Q.length]; const ia = sgn * (a[k] - lim) >= 0, ib = sgn * (b[k] - lim) >= 0; if (ia) R.push(a); if (ia !== ib) { const t = (lim - a[k]) / (b[k] - a[k]); R.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } Q = R; } return Q; };
const areaMid = (P, k) => { let A = 0, m = 0; for (let i = 0; i < P.length; i += 1) { const a = P[i], b = P[(i + 1) % P.length]; const c = a[0] * b[1] - b[0] * a[1]; A += c; m += (a[1 - k] + b[1 - k]) * c; } A /= 2; return Math.abs(A) < 1e-9 ? [0, 0] : [Math.abs(A), m / (6 * A)]; };
const turned = (T) => { const c = Math.cos(T.deg * Math.PI / 180), s = Math.sin(T.deg * Math.PI / 180); return { c, s, at: (u, v) => [T.at[0] + u * c - v * s, T.at[1] + u * s + v * c], uv: (x, z) => [(x - T.at[0]) * c + (z - T.at[1]) * s, -(x - T.at[0]) * s + (z - T.at[1]) * c] }; };
for (const T of THINGS) { const { c, s, at } = turned(T); const rect = (u0, u1, v0, v1) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]; const [pu0, pu1, pv0, pv1] = T.plan; const P = rect(pu0, pu1, pv0, pv1); const mine = [];
  const k = Math.abs(c) >= Math.abs(s) ? 0 : 1; const up = (k === 0 ? s : c) > 0;   // (the slices cross the axis the long side runs nearer; across a slice, whether a part further along the thing lies further along the other axis)
  // the cuts: at the rectangle's four corners, and between them — its two ends (corner to corner) in slices W_END wide at most, its sides between in slices W_SIDE wide at most
  const q = P.map((p) => p[k]).sort((a, b) => a - b); const cuts = [q[0]]; for (const [a, b, w] of [[q[0], q[1], W_END], [q[1], q[2], W_SIDE], [q[2], q[3], W_END]]) { if (b - a < 0.05) continue; const n = Math.ceil((b - a) / w - 1e-9); for (let i = 1; i <= n; i += 1) cuts.push(a + (b - a) * i / n); }
  const count = T.parts.map(() => 0);
  for (let i = 0; i + 1 < cuts.length; i += 1) { const lo = cuts[i], hi = cuts[i + 1]; const [A, mid] = areaMid(clip(P, k, lo, hi), k); if (A < 1e-6) continue; const w = A / (hi - lo);
    // the parts' shares of the slice, in their order across it; a share thinner than SLIVER joins the part beside it
    const share = T.parts.map(([, u1], j) => areaMid(clip(rect(j ? T.parts[j - 1][1] : pu0, u1, pv0, pv1), k, lo, hi), k)[0]); const sum = share.reduce((n, v) => n + v, 0); const wide = share.map((v) => w * v / sum);
    for (let j = 0; j < wide.length; j += 1) if (wide[j] > 0 && wide[j] < SLIVER) { let n = -1; for (let d = 1; d < wide.length && n < 0; d += 1) { if (wide[j - d] >= SLIVER) n = j - d; else if (wide[j + d] >= SLIVER) n = j + d; } if (n >= 0) { wide[n] += wide[j]; wide[j] = 0; } }
    const order = wide.map((v, j) => j).filter((j) => wide[j] > 0); if (!up) order.reverse(); let from = mid - w / 2;
    for (const j of order) { const to = from + wide[j]; const b = k === 0 ? [lo, hi, from, to] : [from, to, lo, hi]; mine.push([...b.map(r2), T.parts[j][2], BASE]); count[j] += 1; from = to; } }
  // the pieces that are a box each: the turned rectangle's area, upright, in the shape of its extent, about its middle
  for (const [, u0, u1, v0, v1, top] of T.lone) { const R = rect(u0, u1, v0, v1); const ex = [0, 1].map((a) => Math.max(...R.map((p) => p[a])) - Math.min(...R.map((p) => p[a]))); const f = Math.sqrt((u1 - u0) * (v1 - v0) / (ex[0] * ex[1])); const m = at((u0 + u1) / 2, (v0 + v1) / 2);
    mine.push([m[0] - ex[0] * f / 2, m[0] + ex[0] * f / 2, m[1] - ex[1] * f / 2, m[1] + ex[1] * f / 2].map(r2).concat([top, BASE])); }
  // how well the steps keep to the plan (a 2 cm grid over the thing): the furthest a box stands out of every rectangle, and the deepest place of a rectangle no box covers
  const rs = [T.plan, ...T.lone.map((l) => l.slice(1, 5))]; const { uv } = turned(T); let out = 0, short = 0;
  const x0 = Math.min(...mine.map((b) => b[0])) - 0.5, x1 = Math.max(...mine.map((b) => b[1])) + 0.5, z0 = Math.min(...mine.map((b) => b[2])) - 0.5, z1 = Math.max(...mine.map((b) => b[3])) + 0.5;
  for (let x = x0; x <= x1; x += 0.02) for (let z = z0; z <= z1; z += 0.02) { const [u, v] = uv(x, z); const inB = mine.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]); let far = 1e9, deep = -1;
    for (const [u0, u1, v0, v1] of rs) { const d = Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1)); if (d > 0) far = Math.min(far, d); else { far = 0; deep = Math.max(deep, Math.min(u - u0, u1 - u, v - v0, v1 - v)); } }
    if (inB && far > out) out = far; if (!inB && deep > short) short = deep; }
  console.log(`${T.name}: ${mine.length} boxes — ${T.parts.map((p, j) => `${p[0]} ${count[j]} to ${p[2]} m`).join(', ')}, ${T.lone.map((l) => `${l[0]} 1 to ${l[5]} m`).join(', ')}; a box stands out of the plan by ${out.toFixed(2)} m at most and falls short of it by ${short.toFixed(2)} m at most`);
  if (out > FIT || short > FIT) throw new Error(`${T.name}: the steps miss the plan by more than ${FIT} m`);
  boxes.push(...mine); }
const top = Math.max(...boxes.map((b) => b[4])); const tmp = OUT + '.boxes.tmp'; const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data_boxes.mjs');
console.log(execFileSync('node', [tool, IN, `${SCALE},${CX},${CZ}`, boxes.map((b) => b.join(',')).join(';'), '0.35', `2.75,${top + 0.1}`, tmp], { encoding: 'utf8' }).split('\n')[0]);
const D = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp); const MX = (u) => u / SCALE + CX, MZ = (u) => u / SCALE + CZ, AX = (x) => r2((x - CX) * SCALE), AZ = (z) => r2((z - CZ) * SCALE);
// What the boxes' rule leaves of the two: a piece that stands out past the steps by more than half its plan (a mirror, a step, a lamp), a slope whose plane reaches
// over the band at a far corner. Whatever of the reading has its middle inside a thing's least rectangle, 0.7 m around, and its top between the terrace's kerbs
// and the thing's own top, goes too: nothing of the terrace is that high there, and no other thing stands that near.
{ const mine = new Set([...D.obstacles.slice(-boxes.length), ...D.surfaces.slice(-boxes.length)]); const PAD = 0.7, LOW = 2.75, HIGH = top + 0.2;
  const inThing = (e) => THINGS.some((T) => { const [u, v] = turned(T).uv((MX(e.minX) + MX(e.maxX)) / 2, (MZ(e.minZ) + MZ(e.maxZ)) / 2); return u >= -PAD && u <= T.len + PAD && v >= -PAD && v <= T.wid + PAD; });
  const goes = (e, h) => !mine.has(e) && h / SCALE > LOW && h / SCALE <= HIGH && inThing(e);
  const nb0 = D.obstacles.length, ns0 = D.surfaces.length; D.obstacles = D.obstacles.filter((e) => !goes(e, e.maxY)); D.surfaces = D.surfaces.filter((e) => !goes(e, e.maxTop ?? e.top));
  console.log(`left by the boxes' rule and taken out: ${nb0 - D.obstacles.length} boxes, ${ns0 - D.surfaces.length} floors`); }
const L = LADDER; const own = (e, h) => MX(e.minX) >= L.win[0] && MX(e.maxX) <= L.win[1] && MZ(e.minZ) >= L.win[2] && MZ(e.maxZ) <= L.win[3] && h / SCALE > L.over;
const plane = { minX: AX(L.x[0]), maxX: AX(L.x[1]), minZ: AZ(L.z[0]), maxZ: AZ(L.z[1]), maxTop: r2(L.h[0] * SCALE), type: 'plane', y0: r2(L.h[0] * SCALE), gx: Math.round((L.h[1] - L.h[0]) / (L.x[1] - L.x[0]) * 1e4) / 1e4, gz: 0, deck: 1 };   // (deck: sight passes under it — physics.js sightHitsSurface — as it passed under the cells)
const isPlane = (e) => e.type === 'plane' && e.minX === plane.minX && e.maxX === plane.maxX && e.minZ === plane.minZ && e.maxZ === plane.maxZ;
const nb = D.obstacles.length, ns = D.surfaces.length; const was = D.surfaces.some(isPlane); D.obstacles = D.obstacles.filter((e) => !own(e, e.maxY)); D.surfaces = D.surfaces.filter((e) => !isPlane(e) && !own(e, e.maxTop ?? e.top));
console.log(`the fire truck's ladder: ${nb - D.obstacles.length} boxes and ${ns - D.surfaces.length - (was ? 1 : 0)} floors out, one sloped floor ${was ? 'kept' : 'in'}, ${L.h[1]} m at x ${L.x[1]} to ${L.h[0]} m at x ${L.x[0]}`); D.surfaces.push(plane);
fs.writeFileSync(OUT, JSON.stringify(D)); console.log(`${OUT}: ${boxes.length} boxes for the two; ${D.obstacles.length} boxes, ${D.surfaces.length} floors`);
