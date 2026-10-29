// Where a body can get to in the Node sim, and where it cannot get back from: a flood over a grid of cells, each state a
// cell and the floor the body stands on there (the sim's own step rule, walkFloorTo; its own body test,
// unitOverlapsObstacle), with walking edges (any drop) and jump edges (the body at its apex over the next cell, landing
// on whatever floor the step rule gives it there). A state the flood reaches but from which no path leads back to the
// start is a PIT. Model metres in and out.
// usage: node reach_fill.mjs <tree> <mapKey> <cxM> <czM> <startX,startZ[,feetM]> <x0> <x1> <z0> <z1> [cell=0.25] [jumpM=1.4]
const [tree, mapKey, cxS, czS, startS, x0S, x1S, z0S, z1S, cellS, jumpS] = process.argv.slice(2);
const cx = Number(cxS), cz = Number(czS), CELL = Number(cellS ?? 0.25), JUMP = Number(jumpS ?? 1.4) * 4;
await import(`${tree}/shared/tools/maps/arena_files.mjs`);   // (the modelled maps' data from their files, b1026k)
const P = await import(`${tree}/shared/src/sim/physics.js`); const A = await import(`${tree}/shared/src/sim/arena.js`);
const C = await import(`${tree}/shared/src/sim/constants.js`);
const a = A.getArena(mapKey); const S = a.surfaces, O = a.obstacles; const STEP = C.SURFACE_STEP_HEIGHT ?? P.SURFACE_STEP_HEIGHT ?? 2.6;
const U = (xm, zm) => [(xm - cx) * 4, (zm - cz) * 4]; const M = (xu, zu) => [xu / 4 + cx, zu / 4 + cz];
const [x0, x1, z0, z1] = [x0S, x1S, z0S, z1S].map(Number); const nx = Math.round((x1 - x0) / CELL), nz = Math.round((z1 - z0) / CELL);
const [sx, sz, sfeet] = startS === 'spawn' ? (() => { const p = (a.spawns?.p1 ?? a.spawns?.[0] ?? a.spawns); const q = Array.isArray(p) ? p[0] : p; const [mx, mz] = M(q.x, q.z); return [mx, mz, (q.y ?? 0) / 4]; })() : startS.split(',').map(Number); const feet0 = (sfeet ?? 0) * 4;
const GB = C.GROUND_BASE_Y;   // (the body's pos.y is the street's pos.y plus its floor; the box window reads pos.y)
const ovl = (xu, f, zu) => P.unitOverlapsObstacle(xu, GB + f, zu, O);
const cellOf = (xm, zm) => [Math.floor((xm - x0) / CELL), Math.floor((zm - z0) / CELL)];
const centre = (i, k) => U(x0 + (i + 0.5) * CELL, z0 + (k + 0.5) * CELL);
const key = (i, k, f) => `${i},${k},${Math.round(f * 20)}`;
const [si, sk] = cellOf(sx, sz); const [sxu, szu] = centre(si, sk);
const f0 = P.groundHeightAt(sxu, szu, S, feet0); if (ovl(sxu, f0, szu)) { console.log(`start (${sx}, ${sz}) at floor ${(f0 / 4).toFixed(2)} m is inside a box — pick another start`); process.exit(1); }
console.log(`start (${sx}, ${sz}) floor ${(f0 / 4).toFixed(2)} m; grid ${nx} x ${nz} cells of ${CELL} m; step ${(STEP / 4).toFixed(2)} m, jump ${(JUMP / 4).toFixed(2)} m`);
const seen = new Map();   // key -> {i,k,f}
const back = new Map();   // key -> Set of keys with an edge INTO this state
const queue = []; const push = (i, k, f, fromKey, how) => { if (i < 0 || k < 0 || i >= nx || k >= nz) return; const kk = key(i, k, f); if (!seen.has(kk)) { seen.set(kk, { i, k, f, how }); queue.push(kk); } if (fromKey) { let b = back.get(kk); if (!b) back.set(kk, (b = new Set())); b.add(fromKey); } };
push(si, sk, f0, null, 'start');
let head = 0; const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; const DIRS8 = [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]; const JUMP_REACH = Number(process.env.JUMP_REACH ?? 3); const JUMP_CELLS = Math.ceil(JUMP_REACH / CELL);
while (head < queue.length) {
  const kk = queue[head]; head += 1; const { i, k, f } = seen.get(kk); const [xu, zu] = centre(i, k);
  for (const [di, dk] of DIRS) { const ii = i + di, kkk = k + dk; if (ii < 0 || kkk < 0 || ii >= nx || kkk >= nz) continue; const [nxu, nzu] = centre(ii, kkk);
    // walking: the step rule along the way, any drop; the body clear of boxes where it lands
    const wf = P.walkFloorTo(xu, zu, f, nxu, nzu, S); const walkOK = !ovl(nxu, wf, nzu); if (walkOK) push(ii, kkk, wf, kk, wf < f - STEP ? 'drop' : 'walk');
  }
  // jumping: the body at its apex carried up to JUMP_REACH along each of eight directions (rise, hover, fall at sprint),
  // clear of boxes over every cell on the way (a guard, a fence, a low wall), landing on whatever the step rule from the
  // apex gives it at any cell along the way
  const apex = f + JUMP; if (!ovl(xu, apex, zu)) for (const [di, dk] of DIRS8) { for (let d = 1; d <= JUMP_CELLS; d += 1) { const ii = i + di * d, kkk = k + dk * d; if (ii < 0 || kkk < 0 || ii >= nx || kkk >= nz) break; if (Math.hypot(di, dk) * d * CELL > JUMP_REACH) break; const [nxu, nzu] = centre(ii, kkk);
    if (ovl(nxu, apex, nzu)) break; const jf = P.groundHeightAt(nxu, nzu, S, apex); if (!ovl(nxu, jf, nzu)) push(ii, kkk, jf, kk, jf < f - STEP ? 'jump-drop' : 'jump'); } }
}
// the way back: states from which the start is reached, over the reversed edges
const startKey = key(si, sk, f0); const ret = new Set([startKey]); const q2 = [startKey]; let h2 = 0;
while (h2 < q2.length) { const kk = q2[h2]; h2 += 1; for (const b of back.get(kk) ?? []) if (!ret.has(b)) { ret.add(b); q2.push(b); } }
// (a state reached at floor f returns if ANY state of its cell within a step of f returns — the body at that spot is the same body)
const byCell = new Map(); for (const [kk, s] of seen) { let L = byCell.get(s.i * nz + s.k); if (!L) byCell.set(s.i * nz + s.k, (L = [])); L.push({ ...s, kk, ret: ret.has(kk) }); }
// the ways in, per pit region: the states each pit state was entered from that are not pits themselves
const waysOf = (cells) => { const ins = new Map(); const set = new Set(cells.map((t) => t.kk)); for (const t of cells) for (const s of (pits.filter((p) => p.i === t.i && p.k === t.k))) for (const b of back.get(s.kk) ?? []) { const u = seen.get(b); if (pitMap.get(u.i * nz + u.k) !== undefined && !ret.has(b)) continue; const k2 = `${(x0 + (u.i + 0.5) * CELL).toFixed(2)},${(z0 + (u.k + 0.5) * CELL).toFixed(2)}@${(u.f / 4).toFixed(2)}->${(s.f / 4).toFixed(2)} ${s.how}`; ins.set(k2, (ins.get(k2) ?? 0) + 1); } return [...ins.entries()].sort((a, b) => b[1] - a[1]); };
const pits = []; for (const [c, L] of byCell) for (const s of L) { if (s.ret) continue; if (L.some((t) => t.ret && Math.abs(t.f - s.f) <= STEP)) continue; pits.push(s); }
console.log(`reached ${seen.size} states over ${byCell.size} cells; ${pits.length} pit states (no way back)`);
// pit regions: 4-connected pit cells within a step of one another
const pitMap = new Map(); for (const s of pits) { const c = s.i * nz + s.k; if (!pitMap.has(c) || pitMap.get(c).f > s.f) pitMap.set(c, s); }
const regSeen = new Set(); const regions = [];
for (const [c, s] of pitMap) { if (regSeen.has(c)) continue; const cells = []; const st = [c]; regSeen.add(c); let fmin = Infinity, fmax = -Infinity;
  while (st.length) { const q = st.pop(); const t = pitMap.get(q); cells.push(t); fmin = Math.min(fmin, t.f); fmax = Math.max(fmax, t.f); for (const [di, dk] of DIRS) { const n = (t.i + di) * nz + (t.k + dk); const u = pitMap.get(n); if (u && !regSeen.has(n) && Math.abs(u.f - t.f) <= STEP) { regSeen.add(n); st.push(n); } } }
  const xs = cells.map((t) => t.i), zs = cells.map((t) => t.k); const [mx0, mz0] = [x0 + Math.min(...xs) * CELL, z0 + Math.min(...zs) * CELL], [mx1, mz1] = [x0 + (Math.max(...xs) + 1) * CELL, z0 + (Math.max(...zs) + 1) * CELL];
  const hows = {}; for (const t of cells) hows[t.how] = (hows[t.how] ?? 0) + 1;
  regions.push({ cells: cells.length, x: [mx0, mx1], z: [mz0, mz1], floor: [fmin / 4, fmax / 4], hows, ways: waysOf(cells) }); }
regions.sort((p, q) => q.cells - p.cells);
if (process.env.REACHED_OUT) { const { writeFileSync } = await import('node:fs'); const rows = []; for (const [c, L] of byCell) { const i = Math.floor(c / nz), k = c % nz; rows.push([i, k, Math.round(Math.max(...L.map((t) => t.f)) * 100) / 100]); } writeFileSync(process.env.REACHED_OUT, JSON.stringify({ x0, z0, CELL, nx, nz, cells: rows, pits: pits.map((t) => [t.i, t.k, Math.round(t.f * 100) / 100]) })); }
for (const r of regions) console.log(`PIT ${r.cells} cells (${(r.cells * CELL * CELL).toFixed(1)} m2): x ${r.x[0].toFixed(2)}..${r.x[1].toFixed(2)} z ${r.z[0].toFixed(2)}..${r.z[1].toFixed(2)} floor ${r.floor[0].toFixed(2)}..${r.floor[1].toFixed(2)} m, entered by ${JSON.stringify(r.hows)}\n     ways in (${r.ways.length}): ${r.ways.slice(0, 8).map(([k, n]) => k + ' x' + n).join(' | ')}`);
// charts: the highest floor reached per cell (0.5 m bands, '.' unreached), and the pits ('P' at the pit's floor band)
const stride = Math.max(1, Math.round(0.5 / CELL)); const band = (f) => { const b = Math.floor(f / 4 / 0.5 + 1e-6); return b < 0 ? '-' : b > 9 ? String.fromCharCode(87 + b) : String(b); };
const row = (k, fn) => { let s = ''; for (let i = 0; i < nx; i += stride) s += fn(i, k); return s; };
console.log(`--- reached (highest floor, 0.5 m bands), z down from ${z0}, x right from ${x0}, ${stride * CELL} m per char`);
for (let k = 0; k < nz; k += stride) console.log(`z ${String((z0 + k * CELL).toFixed(1)).padStart(6)} ${row(k, (i, kk) => { const L = byCell.get(i * nz + kk); if (!L) return '.'; const p = L.find((t) => pitMap.get(i * nz + kk) === t); return p ? 'P' : band(Math.max(...L.map((t) => t.f))); })}`);
