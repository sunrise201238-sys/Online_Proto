// THE AUDIT of a map's boxes against its model (2026-10-29; user: "keep the cbox geometry simple, but they gotta match the
// visuals"): every column of the model — CELL metres square — is read for the places a body could stand in it by the look of
// the model: an up-facing face with a body's height of air over it (1.9 m) before the next face, or the street where no face
// covers the column. A box that fills such a place — its bottom at or under the place (0.3 m over it at most), its top 1.5 m
// or more over it — stands where the model shows room: a garage shut by one box over it, a yard buried under a plot's box, a
// stair's cheek read a wall along its whole length. The boxes are listed by the room they fill, worst first; the user's
// inspector finds them by their index. usage:
//   SCALE=4 GROUND=-0.5 EXCLUDE=UFO,grass_tile node box_audit.mjs <glb> <data.json (the generator's, with transform)> [minArea m² (1)] [maxRows (40)]
//   env: CELL (0.5 m) CLEAR (1.9 m of air makes a place) FILL (0.25: the share of a box's columns filled before it is listed)
import { readFileSync } from 'node:fs';
import { readGlb, accessor, worlds } from './glb_read.mjs';
const [inF, dataF, minAreaArg, maxRowsArg] = process.argv.slice(2); const minArea = Number(minAreaArg ?? 1), maxRows = Number(maxRowsArg ?? 40);
const D = JSON.parse(readFileSync(dataF, 'utf8')); const T = D.transform; const SCALE = T?.scale ?? Number(process.env.SCALE ?? 4), GROUND = T?.ground ?? Number(process.env.GROUND ?? 0), cx = T?.cx ?? 0, cz = T?.cz ?? 0;
const EXCLUDE = (process.env.EXCLUDE ?? (T?.exclude ?? []).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const CELL = Number(process.env.CELL ?? 0.5), CLEAR = Number(process.env.CLEAR ?? 1.9), FILL = Number(process.env.FILL ?? 0.25); const CEIL = Number(process.env.CEIL ?? Infinity);   // (the generator's CEIL: places over it are no holes)
const halfX = D.halfX / SCALE, halfZ = D.halfZ / SCALE; const x0 = cx - halfX, x1 = cx + halfX, z0 = cz - halfZ, z1 = cz + halfZ;
const mX = (u) => u / SCALE + cx, mZ = (u) => u / SCALE + cz, mY = (u) => u / SCALE + GROUND;
// the model's triangles, in 2 m buckets
const g = readGlb(inF); const J = g.json; const W = worlds(J); const parentName = {}; J.nodes.forEach((nd, i) => (nd.children ?? []).forEach((c) => { parentName[c] = nd.name ?? ''; }));
const alphaOf = (mi) => (J.materials?.[mi]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])[3];
const B = 2; const buckets = new Map(); const bk = (i, k) => i * 100000 + k; let nTris = 0;
for (let ni = 0; ni < J.nodes.length; ni += 1) { const node = J.nodes[ni]; if (node.mesh === undefined) continue; const own = node.name ?? ''; const name = parentName[ni] ? `${parentName[ni]}/${own}` : own; if (EXCLUDE.some((p) => own.startsWith(p) || name.startsWith(p))) continue;
  const prims = J.meshes[node.mesh].primitives; if (prims.every((p) => alphaOf(p.material) < 0.1)) continue; const w = W[ni];
  for (const p of prims) { const pos = accessor(g, p.attributes.POSITION); const idx = p.indices !== undefined ? accessor(g, p.indices) : null; const nt = idx ? idx.length / 3 : pos.length / 9; const at = (t, k) => (idx ? idx[3 * t + k] : 3 * t + k);
    const P = (i) => { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; return [w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]]; };
    for (let t = 0; t < nt; t += 1) { const v = [0, 1, 2].map((k) => P(at(t, k))); const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]); const ax0 = Math.min(...xs), ax1 = Math.max(...xs), az0 = Math.min(...zs), az1 = Math.max(...zs); if (ax1 < x0 || ax0 > x1 || az1 < z0 || az0 > z1) continue;
      const ux = v[1][0] - v[0][0], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vz = v[2][2] - v[0][2]; const ny = uz * vx - ux * vz; if (Math.abs(ny) < 1e-7) continue;   // (a standing face covers no column)
      const tri = { v, up: ny > 0 }; nTris += 1;
      for (let i = Math.floor(ax0 / B); i <= Math.floor(ax1 / B); i += 1) for (let k = Math.floor(az0 / B); k <= Math.floor(az1 / B); k += 1) { const key = bk(i, k); let l = buckets.get(key); if (!l) { l = []; buckets.set(key, l); } l.push(tri); } } } }
// the places of each column
const cols = Math.ceil((x1 - x0) / CELL), rows = Math.ceil((z1 - z0) / CELL); const places = new Array(cols * rows);
const hitsAt = (px, pz) => { const out = []; const l = buckets.get(bk(Math.floor(px / B), Math.floor(pz / B))); if (!l) return out;
  for (const { v, up } of l) { const [p, q, s] = v; const d = (q[2] - s[2]) * (p[0] - s[0]) + (s[0] - q[0]) * (p[2] - s[2]); const l1 = ((q[2] - s[2]) * (px - s[0]) + (s[0] - q[0]) * (pz - s[2])) / d, l2 = ((s[2] - p[2]) * (px - s[0]) + (p[0] - s[0]) * (pz - s[2])) / d, l3 = 1 - l1 - l2; if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; out.push({ y: l1 * p[1] + l2 * q[1] + l3 * s[1], up }); }
  out.sort((a, b) => a.y - b.y); return out; };
let nPlaces = 0;
for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const px = x0 + (c + 0.5) * CELL, pz = z0 + (r + 0.5) * CELL; const hits = hitsAt(px, pz); const pl = [];
  if (!hits.length) pl.push(GROUND);
  for (let i = 0; i < hits.length; i += 1) { if (!hits[i].up) continue; const above = i + 1 < hits.length ? hits[i + 1].y : Infinity; if (above - hits[i].y >= CLEAR) pl.push(hits[i].y); }
  places[r * cols + c] = pl; nPlaces += pl.length; }
// the boxes against the places
const rowsOut = [];
D.obstacles.forEach((o, idx) => { const bx0 = mX(o.minX), bx1 = mX(o.maxX), bz0 = mZ(o.minZ), bz1 = mZ(o.maxZ), by0 = mY(o.minY), by1 = mY(o.maxY); if (by1 - by0 < 1.5) return;
  const c0 = Math.max(0, Math.floor((bx0 - x0) / CELL)), c1 = Math.min(cols - 1, Math.floor((bx1 - x0) / CELL)), r0 = Math.max(0, Math.floor((bz0 - z0) / CELL)), r1 = Math.min(rows - 1, Math.floor((bz1 - z0) / CELL));
  let total = 0, filled = 0, sample = null;
  for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { const px = x0 + (c + 0.5) * CELL, pz = z0 + (r + 0.5) * CELL; if (px < bx0 || px > bx1 || pz < bz0 || pz > bz1) continue; total += 1;
    for (const h of places[r * cols + c]) if (by0 <= h + 0.3 && by1 >= h + 1.5) { filled += 1; if (!sample) sample = { px, pz, h }; break; } }
  if (!total || filled / total < FILL || filled * CELL * CELL < minArea) return;
  rowsOut.push({ idx, bx0, bx1, bz0, bz1, by0, by1, total, filled, area: filled * CELL * CELL, sample }); });
rowsOut.sort((a, b) => b.area - a.area);
// THE OVERSHOOT (2026-10-29, user "MATCH THE VISUAL"): a box whose top stands over the model's own top — the highest face in the
// column — by more than 0.5 m over three tenths of its columns is a flat box over a sloped roof, a stair, a car's hood: the shape
// is wrong. Listed biggest first. THE MISSING WALLS: a standing face of the model 1 m or taller, between the street and CEIL, with
// no box of the data within 0.2 m of its middle at its mid-height — a wall a body walks through. Clustered by 2 m.
if (process.env.SHAPE !== '0') { const topAt = (px, pz) => { const h = hitsAt(px, pz); return h.length ? h[h.length - 1].y : -Infinity; }; const over = [];
  D.obstacles.forEach((o, idx) => { const bx0 = mX(o.minX), bx1 = mX(o.maxX), bz0 = mZ(o.minZ), bz1 = mZ(o.maxZ), by1 = mY(o.maxY); if (by1 > GROUND + CEIL || Math.min(bx1 - bx0, bz1 - bz0) < 0.3) return; let total = 0, high = 0, sum = 0;   // (a thin box is a standing face's: the model's standing faces cover no column, so the check has nothing to hold it to)
    const c0 = Math.max(0, Math.floor((bx0 - x0) / CELL)), c1 = Math.min(cols - 1, Math.floor((bx1 - x0) / CELL)), r0 = Math.max(0, Math.floor((bz0 - z0) / CELL)), r1 = Math.min(rows - 1, Math.floor((bz1 - z0) / CELL));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { const px = x0 + (c + 0.5) * CELL, pz = z0 + (r + 0.5) * CELL; if (px < bx0 || px > bx1 || pz < bz0 || pz > bz1) continue; total += 1; const t = topAt(px, pz); if (t === -Infinity) continue; if (by1 - t > 0.5) { high += 1; sum += by1 - t; } }
    if (total && high / total >= 0.3 && high * CELL * CELL >= minArea) over.push({ idx, bx0, bx1, bz0, bz1, by1, total, high, mean: sum / high }); });
  over.sort((p, q) => q.high - p.high);
  console.log(`overshoot: ${over.length} boxes stand over the model's top by 0.5 m or more on three tenths of their columns:`);
  for (const o of over.slice(0, maxRows)) console.log(`  #${o.idx}  x ${o.bx0.toFixed(2)}..${o.bx1.toFixed(2)} z ${o.bz0.toFixed(2)}..${o.bz1.toFixed(2)} top ${o.by1.toFixed(2)}  over the model by ${o.mean.toFixed(2)} m on ${o.high}/${o.total} columns`);
  if (over.length > maxRows) console.log(`  … ${over.length - maxRows} more`);
  // the missing walls: the model's standing faces, from the same nodes, against the boxes
  const wallHits = new Map(); let nWalls = 0, nMissing = 0;
  const boxesNear = (px, pz, y) => { const u = (px - cx) * SCALE, w = (pz - cz) * SCALE, m = 0.2 * SCALE; for (const o of D.obstacles) { if (u < o.minX - m || u > o.maxX + m || w < o.minZ - m || w > o.maxZ + m) continue; if (mY(o.minY) <= y + 0.1 && mY(o.maxY) >= y - 0.1) return true; } return false; };
  for (let ni = 0; ni < J.nodes.length; ni += 1) { const node = J.nodes[ni]; if (node.mesh === undefined) continue; const own = node.name ?? ''; const name = parentName[ni] ? `${parentName[ni]}/${own}` : own; if (EXCLUDE.some((p) => own.startsWith(p) || name.startsWith(p))) continue; const prims = J.meshes[node.mesh].primitives; if (prims.every((p) => alphaOf(p.material) < 0.1)) continue; const w = W[ni];
    for (const p of prims) { const pos = accessor(g, p.attributes.POSITION); const idx = p.indices !== undefined ? accessor(g, p.indices) : null; const nt = idx ? idx.length / 3 : pos.length / 9; const at = (t, k) => (idx ? idx[3 * t + k] : 3 * t + k);
      const P = (i) => { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; return [w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]]; };
      for (let t = 0; t < nt; t += 1) { const v = [0, 1, 2].map((k) => P(at(t, k))); const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9 || Math.abs(ny) / l >= 0.05) continue; const ys = v.map((q) => q[1]); const yLo = Math.min(...ys), yHi = Math.max(...ys); if (yHi - yLo < 1 || l / 2 < 0.5 || yLo > GROUND + CEIL || yHi < GROUND - 0.3) continue;
        const px = (v[0][0] + v[1][0] + v[2][0]) / 3, pz = (v[0][2] + v[1][2] + v[2][2]) / 3, py = (yLo + yHi) / 2; if (px < x0 || px > x1 || pz < z0 || pz > z1) continue; nWalls += 1; if (boxesNear(px, pz, py)) continue; nMissing += 1;
        const k = `${Math.floor(px / 2)},${Math.floor(pz / 2)}`; const cl = wallHits.get(k) ?? { n: 0, area: 0, px, pz, py, name: name.split('/')[0] }; cl.n += 1; cl.area += l / 2; wallHits.set(k, cl); } } }
  const walls = [...wallHits.values()].sort((p, q) => q.area - p.area);
  console.log(`missing walls: ${nMissing} of ${nWalls} standing faces (1 m tall, 0.5 m² or more) have no box within 0.2 m at their middle — ${walls.length} clusters of 2 m:`);
  for (const cl of walls.slice(0, maxRows)) console.log(`  ${cl.area.toFixed(1)} m² around x ${cl.px.toFixed(2)} z ${cl.pz.toFixed(2)} at ${cl.py.toFixed(2)} m (${cl.name})`);
  if (walls.length > maxRows) console.log(`  … ${walls.length - maxRows} more`); }
// THE HOLES (2026-10-29, user "still falling"): a place the model shows a body standing on — an up-facing face with room over it, at
// or over the street — with no surface of the data within 0.35 m of its height in that column, and no box filling the column there
// (that is the list above), is a hole: a body walking onto it drops to the street. Listed in 2 m clusters, biggest first, each with
// one column to stand on; HOLES=0 leaves the section out.
if (process.env.HOLES !== '0') { const clusters = new Map(); let nHoles = 0;
  const sAt = (px, pz) => { const u = (px - cx) * SCALE, w = (pz - cz) * SCALE; const out = []; for (const s of D.surfaces) { if (u < s.minX || u > s.maxX || w < s.minZ || w > s.maxZ) continue; out.push((s.type === 'plane' ? s.y0 + s.gx * (u - s.minX) + s.gz * (w - s.minZ) : s.top) / SCALE + GROUND); } return out; };
  const boxed = (px, pz, h) => { const u = (px - cx) * SCALE, w = (pz - cz) * SCALE; for (const o of D.obstacles) { if (u < o.minX || u > o.maxX || w < o.minZ || w > o.maxZ) continue; if (mY(o.minY) <= h + 0.3 && mY(o.maxY) >= h + 0.5) return true; } return false; };
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const px = x0 + (c + 0.5) * CELL, pz = z0 + (r + 0.5) * CELL; for (const h of places[r * cols + c]) { if (h < GROUND - 0.3 || h > GROUND + CEIL) continue; if (Math.abs(h - GROUND) <= 0.35) continue;   // (the street itself needs no surface; nothing over CEIL is read)
      if (sAt(px, pz).some((v) => Math.abs(v - h) <= 0.35)) continue; if (boxed(px, pz, h)) continue;
      // (a hole a body can reach: a column beside it, within a metre, has a floor of the data at that height — else it is a roof
      //  nobody stands on, and no fall)
      if (![[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dc, dr]) => sAt(px + dc * CELL, pz + dr * CELL).some((v) => Math.abs(v - h) <= 0.35))) continue; nHoles += 1; const k = `${Math.floor(px / 2)},${Math.floor(pz / 2)},${Math.round(h)}`; const cl = clusters.get(k) ?? { n: 0, px, pz, h }; cl.n += 1; clusters.set(k, cl); } }
  const list = [...clusters.values()].sort((p, q) => q.n - p.n);
  console.log(`holes: ${nHoles} columns of ${CELL} m where the model stands a body and the data has no floor — ${list.length} clusters of 2 m:`);
  for (const cl of list.slice(0, maxRows)) console.log(`  ${(cl.n * CELL * CELL).toFixed(2)} m² around x ${cl.px.toFixed(2)} z ${cl.pz.toFixed(2)} at ${cl.h.toFixed(2)} m`);
  if (list.length > maxRows) console.log(`  … ${list.length - maxRows} more`); }
console.log(`${nTris} covering triangles, ${cols}x${rows} columns of ${CELL} m, ${nPlaces} places a body could stand by the model; ${D.obstacles.length} boxes, ${rowsOut.length} fill a place over ${FILL * 100}% of their columns and ${minArea} m² or more:`);
for (const r of rowsOut.slice(0, maxRows)) console.log(`  #${r.idx}  x ${r.bx0.toFixed(2)}..${r.bx1.toFixed(2)} z ${r.bz0.toFixed(2)}..${r.bz1.toFixed(2)} y ${r.by0.toFixed(2)}..${r.by1.toFixed(2)}  fills ${r.area.toFixed(1)} m² (${r.filled}/${r.total} columns), e.g. at x ${r.sample.px.toFixed(2)} z ${r.sample.pz.toFixed(2)} a body stands at ${r.sample.h.toFixed(2)} m`);
if (rowsOut.length > maxRows) console.log(`  … ${rowsOut.length - maxRows} more`);
