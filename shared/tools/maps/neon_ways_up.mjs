// neon_ways_up.mjs — NEON, THE SCAFFOLDS CARRIED UP TO THE SKYBRIDGE (b1105kg; user 2026-11-22, with the collision view's mark on a
// stub of a railing, model x 5.56..6.06, z 33.37..34.10, #7208: "remove this object physically and visually.", then: "Use existing objects as
// materials to extend the current scaffolding structure. So the unit can walk seamlessly to the top catwalk.", with the two ends of each way —
// from model x -7.92, z 24.15, feet 12.59 m to x -5.87, z 23.57, feet 21.24 m, and from x 16.01, z 31.64, feet 12.59 m to x 8.53, z 57.10,
// feet 21.80 m — and: "Of course, with simple cboxes.").
// Each scaffold ends at a bare platform 12.59 m over the street; the skybridge's floor is at 20.24 m, the strip at its north end at 21.24 m, its
// window sills at 21.88 m (the floor the data has on them at 21.80 m), and a body got there by the transporters alone. Two ways go up now, each of the scaffold's own pieces copied
// (glb_place.mjs): the ramp to the top platform (Node_222_222 and its mesh, 4 m square, a rise of 3.96 m), that platform (Node_228_228) and a
// walkway piece (Node_204_204).
//   THE NORTH WAY  from the first scaffold's top platform to the strip at the bridge's north end, which stands straight over the platform's
//                  east edge, 8.65 m up: a stair of two flights side by side, south of the platform. A ramp up to the south (x -10.31..-6.31,
//                  z 25.84..29.85, to 17.01 m), a landing of two platforms (x -10.31..-2.31, z 29.72..33.72), a ramp back up to the north
//                  (x -6.31..-2.31, z 25.71..29.72, to 21.44 m) and a platform lying on the strip (x -6.31..-2.31, z 22.84..25.84: three
//                  quarters of a piece deep, so that it ends south of the slanted panel that leans over the strip's north side). The two
//                  ramps are 12% taller than the piece (47.9 degrees for 45).
//   THE SOUTH WAY  from the second scaffold's top platform to the bridge's last east window, 26 m south and 9.3 m up: three ramps in a row
//                  to the south (x 13.43..17.43, z 33.85..45.87, each 79% of the piece's height: 37.7 degrees), a walkway of three pieces at
//                  the sill's height (z 45.75..57.75, over the ramen sign, whose top is 2 m under it) and one piece west to the bridge's
//                  side at the window (x 8.78..13.43, 16% longer than the piece). It ends 7 cm short of the south tower's corner (z 57.82).
// The stub (Node_216_216_copy_stub and Node_217_217_copy_stub: b1105bk's 0.735 m piece of the scaffold's fence panel, set on the copied
// walkway's west edge at the catwalk's joint to close the band south of the catwalk) goes from the model by glb_drop_nodes.mjs, and its three
// boxes and two floors from the data here. The corner is open again: a body walking west along that band walks off to the 5.78 m deck below.
// SIMPLE BOXES (the user's word): each ramp or row of ramps is one sloped floor from the floor it leaves to the floor it reaches, over the
// pieces' whole length; each landing or walkway one box, 0.2 m thick, with a floor on its top. No box stands under a ramp: nothing a body
// stands on lies under one. The floors are plain floors, as the scaffold's own platforms' are (the client's wall fade leaves a floor alone).
// THE BRIDGE'S FLOOR UNDER THE WINDOW. Inside the last east window the bridge's floor (20.24 m) ended a quarter metre short of the wall
// the sill stands on: a slit no body's centre comes into, but the route grid's walk test stands in it (walkFloorTo), found the street 20 m
// under it, and so joined the sill to the street's node below and not to the bridge's floor: the bots' route up the south way ended on the
// sill. The floor is carried to the wall along the window (model x 7.81..8.06, z 55.49..57.87, on the slab's own box), and the grid has the
// drop from the sill into the bridge.
// usage: node neon_ways_up.mjs spec <out spec.json>                         the copies, for glb_place.mjs <in.glb> <out.glb> echo_01_242 <spec.json>
//        node neon_ways_up.mjs data <in neon_data.json> <out neon_data.json>   the stub's boxes out, the ways' boxes and floors in
// A run of `data` on its own output changes nothing. The route grid file is built again after it (navgrid_build.mjs).
import fs from 'node:fs';
const GROUND = 4.2927, SCALE = 4, CX = -12.44, CZ = 40.37;   // (the client's GLB_MAPS line for Neon: arena = (model - c) * scale, heights over the road's top)
// the kit's pieces as the model has them: metres, heights over the street
const RAMP = { from: ['Node_222_222', 'Node_223_223'], x: [-6.443, -2.436], z: [21.840, 25.840], h: [8.549, 12.556], low: 8.629, high: 12.585 };   // (rises toward -x, from the walkway's top to the platform's)
const PLAT = { from: ['Node_228_228', 'Node_229_229'], x: [-10.313, -6.313], z: [21.840, 25.840], h: [12.387, 12.585] };
const WALK = { from: ['Node_204_204', 'Node_205_205'], x: [-2.446, 1.554], z: [29.574, 33.574], h: [8.431, 8.629] };
const RUN = RAMP.x[1] - RAMP.x[0], WIDE = RAMP.z[1] - RAMP.z[0], THICK = PLAT.h[1] - PLAT.h[0];
const UNDER = RAMP.low - RAMP.h[0], SHORT = RAMP.high - RAMP.h[1];   // (a ramp's frame begins 8 cm under the floor it leaves and ends 3 cm under the one it reaches)
const spec = [], planes = [], slabs = [];
// a ramp: `dir` the way it rises ('+z' or '-z'), x0 its west side, zLow its low end, from the floor at `low` to the floor at `high`
const ramp = (suffix, dir, x0, zLow, low, high) => { const sy = (high - low + UNDER - SHORT) / (RAMP.h[1] - RAMP.h[0]); const px = RAMP.x[1], pz = RAMP.z[0];
  spec.push({ from: RAMP.from, suffix, pivot: [px, RAMP.h[0] + GROUND, pz], scale: [1, +sy.toFixed(6), 1], turn: dir === '+z' ? 90 : -90, move: [+(dir === '+z' ? x0 - px : x0 + WIDE - px).toFixed(4), +(low - UNDER - RAMP.h[0]).toFixed(4), +(zLow - pz).toFixed(4)] });
  return { x0, x1: x0 + WIDE, zLow, zHigh: dir === '+z' ? zLow + RUN : zLow - RUN, low, high }; };
// a level piece: its north-west corner (x0, z0), its top, and its size along x and z if not the piece's own
const level = (piece, suffix, x0, z0, top, sx = 1, sz = 1) => { spec.push({ from: piece.from, suffix, pivot: [piece.x[0], piece.h[1] + GROUND, piece.z[0]], scale: [+sx.toFixed(6), 1, +sz.toFixed(6)], turn: 0, move: [+(x0 - piece.x[0]).toFixed(4), +(top - piece.h[1]).toFixed(4), +(z0 - piece.z[0]).toFixed(4)] });
  return { x0, x1: x0 + (piece.x[1] - piece.x[0]) * sx, z0, z1: z0 + (piece.z[1] - piece.z[0]) * sz, top }; };
const slope = (name, a, b = a) => planes.push({ name, x0: a.x0, x1: a.x1, zLow: a.zLow, zHigh: b.zHigh, low: a.low, high: b.high });
const slab = (name, ...ps) => slabs.push({ name, x0: Math.min(...ps.map((p) => p.x0)), x1: Math.max(...ps.map((p) => p.x1)), z0: Math.min(...ps.map((p) => p.z0)), z1: Math.max(...ps.map((p) => p.z1)), top: ps[0].top });
// ---- THE NORTH WAY
{ const H0 = PLAT.h[1], HB = 21.24 + 0.005 + THICK, HM = (H0 + HB) / 2;   // (the platform's top; the piece lying on the strip, whose top is at 21.24 m; the landing half way)
  const xw = PLAT.x[0], xe = PLAT.x[1], zs = PLAT.z[1];   // (the platform's west and east sides and its south edge)
  const r1 = ramp('_wayn1', '+z', xw, zs, H0, HM);
  const l1 = level(PLAT, '_wayn2', xw, r1.zHigh - 0.13, HM), l2 = level(PLAT, '_wayn3', xe, r1.zHigh - 0.13, HM);   // (a piece laps a ramp's top by 13 cm, as the top platform does its own)
  const r2 = ramp('_wayn4', '-z', xe, l2.z0, HM, HB);
  const p1 = level(PLAT, '_wayn5', xe, r2.zHigh + 0.13 - 3.0, HB, 1, 0.75);
  slope('the north way, the ramp up to the south', r1); slope('the north way, the ramp back up to the north', r2); slab('the north way, the landing', l1, l2); slab('the north way, the platform on the strip', p1); }
// ---- THE SOUTH WAY
{ const H0 = PLAT.h[1], HW = 21.88, step = (HW - H0) / 3;   // (the second scaffold's platform top, as the first's; the window's sill)
  const x0 = 13.433, zs = 33.850;   // (that platform's west side and its south edge: Node_228_228_copy)
  const r1 = ramp('_ways1', '+z', x0, zs, H0, H0 + step), r2 = ramp('_ways2', '+z', x0, r1.zHigh, H0 + step, H0 + 2 * step), r3 = ramp('_ways3', '+z', x0, r2.zHigh, H0 + 2 * step, HW);
  const zEnd = 57.750;   // (the tower's corner begins at z 57.82)
  const w1 = level(WALK, '_ways4', x0, zEnd - 12, HW), w2 = level(WALK, '_ways5', x0, zEnd - 8, HW), w3 = level(WALK, '_ways6', x0, zEnd - 4, HW);
  const xb = 8.780;   // (the bridge's side at the sill, 2 cm in)
  const w4 = level(WALK, '_ways7', xb, zEnd - 4, HW, (x0 - xb) / (WALK.x[1] - WALK.x[0]), 1);
  slope('the south way, the three ramps', r1, r3); slab('the south way, the walkway', w1, w2, w3); slab('the south way, the piece at the window', w4); }
const [mode, a, b] = process.argv.slice(2);
if (mode === 'spec') { if (!a) throw new Error('usage: neon_ways_up.mjs spec <out spec.json>'); fs.writeFileSync(a, JSON.stringify(spec, null, 1)); console.log(`${spec.length} copies written to ${a}`);
  for (const p of planes) console.log(`  ${p.name}: x ${p.x0.toFixed(3)}..${p.x1.toFixed(3)} z ${p.zLow.toFixed(3)} (${p.low.toFixed(3)} m) to ${p.zHigh.toFixed(3)} (${p.high.toFixed(3)} m), ${(Math.atan((p.high - p.low) / Math.abs(p.zHigh - p.zLow)) * 180 / Math.PI).toFixed(1)} degrees`);
  for (const s of slabs) console.log(`  ${s.name}: x ${s.x0.toFixed(3)}..${s.x1.toFixed(3)} z ${s.z0.toFixed(3)}..${s.z1.toFixed(3)} top ${s.top.toFixed(3)} m`);
} else if (mode === 'data') { if (!a || !b) throw new Error('usage: neon_ways_up.mjs data <in neon_data.json> <out neon_data.json>');
  const text = fs.readFileSync(a, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
  const u = (v) => Math.round(v * 1000) / 1000; const ax = (x) => u((x - CX) * SCALE), az = (z) => u((z - CZ) * SCALE), ay = (h) => u(h * SCALE);
  const near = (p, q) => Math.abs(p - q) < 0.011; const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
  // the stub: its panel, its foot and its top rim, and the two floors on its top — found by what they are
  const STUB_BOXES = [[5.56, 6.06, 33.37, 34.10, 8.75, 11.25], [6.06, 6.31, 33.62, 34.10, 8.75, 9.00], [5.56, 6.06, 33.62, 34.10, 11.25, 11.32]], STUB_FLOORS = [[5.56, 6.06, 33.37, 34.10, 11.25], [5.56, 6.06, 33.62, 34.10, 11.32]];
  const isBox = (o, [x0, x1, z0, z1, h0, h1]) => near(o.minX, ax(x0)) && near(o.maxX, ax(x1)) && near(o.minZ, az(z0)) && near(o.maxZ, az(z1)) && Math.abs(o.minY - h0 * SCALE) < 0.05 && Math.abs(o.maxY - h1 * SCALE) < 0.05;
  const isFloor = (s, [x0, x1, z0, z1, h]) => s.type === 'flat' && near(s.minX, ax(x0)) && near(s.maxX, ax(x1)) && near(s.minZ, az(z0)) && near(s.maxZ, az(z1)) && Math.abs(s.top - h * SCALE) < 0.05;
  let outB = 0, outF = 0;
  for (const q of STUB_BOXES) { const hit = D.obstacles.filter((o) => isBox(o, q)); if (hit.length > 1) throw new Error('two boxes match a part of the stub'); if (hit.length) { D.obstacles.splice(D.obstacles.indexOf(hit[0]), 1); outB += 1; } }
  for (const q of STUB_FLOORS) { const hit = D.surfaces.filter((s) => isFloor(s, q)); if (hit.length > 1) throw new Error('two floors match a part of the stub'); if (hit.length) { D.surfaces.splice(D.surfaces.indexOf(hit[0]), 1); outF += 1; } }
  // the ways: a sloped floor a ramp or a row of ramps, a box and its floor a landing or a walkway
  let inB = 0, inF = 0, there = 0; const add = (list, e) => { if (list.some((q) => same(q, e))) { there += 1; return false; } list.push(e); return true; };
  for (const p of planes) { const zMin = Math.min(p.zLow, p.zHigh), zMax = Math.max(p.zLow, p.zHigh); const g = (p.high - p.low) / (zMax - zMin) * (p.zHigh > p.zLow ? 1 : -1);
    if (add(D.surfaces, { minX: ax(p.x0), maxX: ax(p.x1), minZ: az(zMin), maxZ: az(zMax), maxTop: ay(p.high), type: 'plane', y0: ay(p.zHigh > p.zLow ? p.low : p.high), gx: 0, gz: Math.round(g * 1e6) / 1e6, ramp: 1 })) inF += 1; }
  for (const s of slabs) { if (add(D.obstacles, { minX: ax(s.x0), maxX: ax(s.x1), minZ: az(s.z0), maxZ: az(s.z1), minY: ay(s.top - THICK), maxY: ay(s.top), topBuffer: 0.8 })) inB += 1;
    if (add(D.surfaces, { minX: ax(s.x0), maxX: ax(s.x1), minZ: az(s.z0), maxZ: az(s.z1), maxTop: ay(s.top), type: 'flat', top: ay(s.top) })) inF += 1; }
  // the bridge's floor carried to the wall under the last east window (arena units, as the two floors it joins are written)
  { const bridge = D.surfaces.filter((q) => q.type === 'flat' && q.minX === 64 && q.maxX === 81 && q.minZ === 34 && q.maxZ === 75 && q.top === 80.94), sill = D.surfaces.filter((q) => q.type === 'flat' && q.minX === 82 && q.maxX === 85 && q.minZ === 34 && q.maxZ === 70 && q.top === 87.21);
    if (bridge.length !== 1 || sill.length !== 1) throw new Error(`the bridge's floor and the sill's at the last east window: ${bridge.length} and ${sill.length} found`);
    if (add(D.surfaces, { minX: 81, maxX: 82, minZ: az(55.49), maxZ: 70, maxTop: 80.94, type: 'flat', top: 80.94 })) inF += 1; }
  fs.writeFileSync(b, JSON.stringify(D));
  console.log(`the stub: ${outB} boxes and ${outF} floors out; the ways: ${inB} boxes and ${inF} floors in (${planes.length} of them sloped), ${there} there already: ${D.obstacles.length} boxes, ${D.surfaces.length} floors`);
} else throw new Error('usage: neon_ways_up.mjs spec <out spec.json> | data <in neon_data.json> <out neon_data.json>');
