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
// THE RAILS (b1105kh; user 2026-11-22, told that a bot backing off a target on the tower top went down the north way's upper ramp and hopped
// off its side, and that rails there kept it up: "加欄杆可以解決 Implement in PT and 9.9"). The scaffold's own fence panel (Node_214_214 and
// its mesh: 4 m long, 0.59 m through its feet, 2.69 m tall) stands along both sides of the north way's upper ramp, leant with the ramp, its
// posts upright (glb_place.mjs bakes it: a `rise`), and goes on level along the platform's two sides as far as the platform hangs over the air
// south of the strip (1.32 m: the panel's first piece, cut — a `clip`). Where the platform lies on the strip its sides are open: a body steps
// off it onto the strip. In the data a level rail is one box, the panel's own depth and height; a leant one four boxes in steps, each the
// panel's height over the ramp at the step's middle (0.55 m off at a step's ends). The ramp's floor and the platform's, between the rails, end
// at the rails' inner faces: the bots' rule that hops a pursuing bot off a deck asks for free air 0.75 m beyond the deck's edge, and that
// place is within a body's radius of the rail's outer face — so the hop is not tried, where a rail on a floor's edge would only be jumped at.
// b1105ki: the same on the south way's slope, both sides, a leant panel a ramp piece (user 2026-11-22, standing on it at model x 15.62,
// z 39.82, feet 17.20 m: "Also, can you add guarding gates on this slope as well?"): three panels a side, nine boxes in steps a side, the
// slope's floor between the rails' inner faces. The second scaffold's top platform under its foot and the walkway over its top stay open.
// THE LITTLE RAMP IN THE BRIDGE (b1105ki; user 2026-11-22, shown the last east window from inside — the sill 1.57 m over the bridge's floor,
// a jump for a player and no way out for a bot: "Add a little slope connecting the catwalk floor and the platform so the BOT knows to walk
// onto it."). The scaffold's ramp piece again, made small — 2.1 m long, the window's passage wide (2.26 m), 1.57 m high: 36.7 degrees, under
// the 37.7 of the south way's ramps, which a body walks down without leaving the floor — stands on the bridge's floor against the wall under
// the window and rises east to the sill (model x 5.96..8.06, z 55.49..57.75; pad D's ring ends 0.79 m west of its foot). In the data one
// sloped floor, and under it three boxes in steps, each as high as the slope at its low end: a body on the bridge's floor is held at the
// ramp's sides where the ramp stands over a step's height, and steps onto it where it does not.
// THE BRIDGE'S FLOOR UNDER THE WINDOW. Inside the last east window the bridge's floor (20.24 m) ended a quarter metre short of the wall
// the sill stands on: a slit no body's centre comes into, but the route grid's walk test stands in it (walkFloorTo), found the street 20 m
// under it, and so joined the sill to the street's node below and not to the bridge's floor: the bots' route up the south way ended on the
// sill. The floor is carried to the wall along the window (model x 7.81..8.06, z 55.49..57.87, on the slab's own box), and the grid has the
// drop from the sill into the bridge.
// THE UNSEEN SLOPE AT THE BRIDGE'S NORTH STEP (b1105kj; user 2026-11-22, standing in the bridge against the step up to the strip at its north
// end — model x 4.83, z 24.91, feet 20.29 m, looking north: "add an invisible small slope at this gap edge so units can walk right onto the
// higher ground here."). The strip's top is 0.95 m over the bridge's floor there (21.24 m over 20.29 m), over a step's height (0.65 m): a body
// walking north was held at the step's face and jumped it, and one walking south walked off it into the air. A sloped floor lies against the
// step now, from wall to wall (model x 0.81..8.06) and 1.25 m long (z 24.62..25.87: 37.3 degrees, between the little ramp's 36.7 and the south
// way's 37.7) — in the data alone. Nothing is added to the model: a unit on it stands over the floor the picture shows, half a metre over it
// half way up. No box under it: its two sides are the bridge's walls, and what lies under it is the bridge's own floor.
// THE BRIDGE'S FLOOR CARRIED TO ITS SIDE WALLS (b1105kl; user 2026-11-22, shown a bot that stood at the bridge's west wall, under its northmost
// window, for as long as its target stood on the scaffold's deck below: "investigate and fix without touching universal rule. pt and 9.9").
// The bridge's floor in the data ended a quarter metre short of the inner face of each side wall (model x 1.06 for the west wall's 0.81,
// 7.81 for the east wall's 8.06), though the slab runs on under the walls. The route grid's walk test looks at floors alone: sent from a
// node by a wall to the node a cell beyond it, it walked off the floor's edge, fell, and landed on whatever lies under the wall — the
// scaffolds' decks, the roofs, the street — and the wall's sill being a lip that a jump hops, the grid made a drop there: 42 of them, from
// the bridge's floor over its sills, at the windows of both sides. A bot whose route took one did not get down it. Two things of the bots'
// own are why, on every map and not touched here: a route cut at the first place with sight of the target loses the mark that tells the
// follower to hop, when the cut falls on the drop's landing (nbrain.js truncateAtFiringPoint) — the bot walked at the wall under the sill
// and stood; and a hop that did go up set the bot on the sill, over the drop's landing in the plan and so past it, and the route's next
// point, back under the bridge, turned it round into the bridge again. With its target on the decks under and beside the bridge, a bot in
// the bridge never came to sight of it in 156 runs of 450. The floor is carried on now as far as the walk test goes, and only where no
// body's centre comes at a height to stand on it:
//   EAST, where the grid's next node lies on the wall's inner face: across the gap alone, from the floor's edge to that face (model x
//     7.81..8.06), from the unseen slope's foot to the south end of the sill's floor (z 25.87..57.87) — the strip b1105kg laid under the
//     last window, grown north. A wall holds a body 0.29 m off its face, so no centre is in the gap below the sill's reach.
//   WEST, where the grid's next node lies under the wall's OUTER face: across the gap and under the wall (x 0.06..1.06), as far along as the
//     sill's own floor lies over the wall (z 25.12..57.87). A body over that stretch at the sill's height stands on the sill's floor, and
//     a lower one is outside the wall.
//   A HAIR of it (2.5 cm, x 0.06..0.81) on the grid's one line across the west wall's north end (z 24.87), where the wall's top has no
//     sill floor: the foot of the corner pillar and the tower's top keep a body's centre 2.5 cm south of the hair at every height under
//     the pillar foot's reach, and over that height the hair is 1.3 m under its feet.
// The walk test stays on the bridge's floor there, and the grid has none of those drops. A window is a player's way out and no bot's now;
// a bot leaves the bridge by the unseen slope, the little ramp or the transporter.
// (The PT site's b1105kk carried the floor under the whole of both walls, end to end. At the walls' ends, where a wall's top has no sill
// floor, that was a floor a body could come down onto inside the wall: one that walked north off the west sill's end stood in the wall at
// the bridge's floor's height, where it had fallen outside onto the deck before, and 1,014 of 34,000 random walks about the walls ended
// elsewhere than before. With the floors as they are here all 34,000, and 144,448 set walks, go tick for tick as on the data before.)
// usage: node neon_ways_up.mjs spec <out spec.json>                         the copies, for glb_place.mjs <in.glb> <out.glb> echo_01_242 <spec.json>
//        node neon_ways_up.mjs data <in neon_data.json> <out neon_data.json>   the stub's boxes out, the ways' boxes and floors in
// A run of `data` on its own output changes nothing, and one on an earlier build's data (b1105kg: the ways without rails; b1105kh: the north
// way's rails; b1105ki: both ways' rails and the little ramp; b1105kj: the unseen slope too; the PT site's b1105kk: the bridge's floor under the whole of both walls) takes out the floors that build wrote and
// this one writes otherwise, and puts in these and what that build had not. The route grid file is built again after it (navgrid_build.mjs).
import fs from 'node:fs';
const GROUND = 4.2927, SCALE = 4, CX = -12.44, CZ = 40.37;   // (the client's GLB_MAPS line for Neon: arena = (model - c) * scale, heights over the road's top)
// the kit's pieces as the model has them: metres, heights over the street
const RAMP = { from: ['Node_222_222', 'Node_223_223'], x: [-6.443, -2.436], z: [21.840, 25.840], h: [8.549, 12.556], low: 8.629, high: 12.585 };   // (rises toward -x, from the walkway's top to the platform's)
const PLAT = { from: ['Node_228_228', 'Node_229_229'], x: [-10.313, -6.313], z: [21.840, 25.840], h: [12.387, 12.585] };
const WALK = { from: ['Node_204_204', 'Node_205_205'], x: [-2.446, 1.554], z: [29.574, 33.574], h: [8.431, 8.629] };
const RAIL = { from: ['Node_214_214', 'Node_215_215'], x: [0.963, 1.553], z: [21.839, 25.841], h: [8.545, 11.240], deck: 8.629 };   // (the fence panel on the first scaffold's deck: a frame and its mesh, standing 8 cm in the deck's top)
const RUN = RAMP.x[1] - RAMP.x[0], WIDE = RAMP.z[1] - RAMP.z[0], THICK = PLAT.h[1] - PLAT.h[0];
const DEPTH = RAIL.x[1] - RAIL.x[0], SINK = RAIL.deck - RAIL.h[0], RAILH = RAIL.h[1] - RAIL.deck;   // (a rail's depth through its feet; how far its foot stands in the floor; its height over that floor)
const UNDER = RAMP.low - RAMP.h[0], SHORT = RAMP.high - RAMP.h[1];   // (a ramp's frame begins 8 cm under the floor it leaves and ends 3 cm under the one it reaches)
const spec = [], laterSpec = [], planes = [], slabs = [], floors = [], rails = [], blocks = [], gone = { planes: [], floors: [] };   // (`laterSpec`: the copies of the builds after b1105kg, in their order — the rails, the little ramp in the bridge — written after the ways' so that a model with the earlier ones takes the new as it is; `blocks`: boxes under a ramp; `gone`: floors an earlier build wrote whole and the rails narrow)
// a ramp: `dir` the way it rises ('+z' or '-z'), x0 its west side, zLow its low end, from the floor at `low` to the floor at `high`
const ramp = (suffix, dir, x0, zLow, low, high) => { const sy = (high - low + UNDER - SHORT) / (RAMP.h[1] - RAMP.h[0]); const px = RAMP.x[1], pz = RAMP.z[0];
  spec.push({ from: RAMP.from, suffix, pivot: [px, RAMP.h[0] + GROUND, pz], scale: [1, +sy.toFixed(6), 1], turn: dir === '+z' ? 90 : -90, move: [+(dir === '+z' ? x0 - px : x0 + WIDE - px).toFixed(4), +(low - UNDER - RAMP.h[0]).toFixed(4), +(zLow - pz).toFixed(4)] });
  return { x0, x1: x0 + WIDE, zLow, zHigh: dir === '+z' ? zLow + RUN : zLow - RUN, low, high }; };
// a ramp that rises to the east (the piece turned half round), of any length and width: from the floor at `low` at x0 to the floor at `high` at x1, between z0 and z1
const rampEast = (list, suffix, x0, x1, z0, z1, low, high) => { const sy = (high - low + UNDER - SHORT) / (RAMP.h[1] - RAMP.h[0]); const px = RAMP.x[1], pz = RAMP.z[0];
  list.push({ from: RAMP.from, suffix, pivot: [px, RAMP.h[0] + GROUND, pz], scale: [+((x1 - x0) / RUN).toFixed(6), +sy.toFixed(6), +((z1 - z0) / WIDE).toFixed(6)], turn: 180, move: [+(x0 - px).toFixed(4), +(low - UNDER - RAMP.h[0]).toFixed(4), +(z1 - pz).toFixed(4)] });
  return { x0, x1, z0, z1, low, high, east: true }; };
// a leant rail on a ramp that runs along z: the fence panel's north end at zN, its length `run`, its foot in the ramp's floor, which is at hN there and rises g a metre to the south (g under zero: falls)
const leantRail = (suffix, x0, zN, run, hN, g) => laterSpec.push({ from: RAIL.from, suffix, pivot: [RAIL.x[0], RAIL.h[0] + GROUND, RAIL.z[0]], scale: [1, 1, +(run / (RAIL.z[1] - RAIL.z[0])).toFixed(6)], turn: 0, rise: [0, +g.toFixed(6)],
  move: [+(x0 - RAIL.x[0]).toFixed(4), +(hN - SINK - RAIL.h[0]).toFixed(4), +(zN - RAIL.z[0]).toFixed(4)] });
// a level piece: its north-west corner (x0, z0), its top, and its size along x and z if not the piece's own
const level = (piece, suffix, x0, z0, top, sx = 1, sz = 1) => { spec.push({ from: piece.from, suffix, pivot: [piece.x[0], piece.h[1] + GROUND, piece.z[0]], scale: [+sx.toFixed(6), 1, +sz.toFixed(6)], turn: 0, move: [+(x0 - piece.x[0]).toFixed(4), +(top - piece.h[1]).toFixed(4), +(z0 - piece.z[0]).toFixed(4)] });
  return { x0, x1: x0 + (piece.x[1] - piece.x[0]) * sx, z0, z1: z0 + (piece.z[1] - piece.z[0]) * sz, top }; };
const slope = (name, a, b = a, list = planes) => list.push({ name, x0: a.x0, x1: a.x1, zLow: a.zLow, zHigh: b.zHigh, low: a.low, high: b.high });
// a landing or a walkway: its box, and a floor on its top unless the floor is given apart (`floor: false`)
const slab = (name, ps, floor = true) => { const s = { name, x0: Math.min(...ps.map((p) => p.x0)), x1: Math.max(...ps.map((p) => p.x1)), z0: Math.min(...ps.map((p) => p.z0)), z1: Math.max(...ps.map((p) => p.z1)), top: ps[0].top }; slabs.push(s); if (floor) floors.push(s); return s; };
// ---- THE NORTH WAY
{ const H0 = PLAT.h[1], HB = 21.24 + 0.005 + THICK, HM = (H0 + HB) / 2;   // (the platform's top; the piece lying on the strip, whose top is at 21.24 m; the landing half way)
  const xw = PLAT.x[0], xe = PLAT.x[1], zs = PLAT.z[1];   // (the platform's west and east sides and its south edge)
  const r1 = ramp('_wayn1', '+z', xw, zs, H0, HM);
  const l1 = level(PLAT, '_wayn2', xw, r1.zHigh - 0.13, HM), l2 = level(PLAT, '_wayn3', xe, r1.zHigh - 0.13, HM);   // (a piece laps a ramp's top by 13 cm, as the top platform does its own)
  const r2 = ramp('_wayn4', '-z', xe, l2.z0, HM, HB);
  const p1 = level(PLAT, '_wayn5', xe, r2.zHigh + 0.13 - 3.0, HB, 1, 0.75);
  // the rails on the upper ramp's two sides and on the platform's as far as it hangs over the air, south of the strip's own south face
  const STRIP_S = 24.39, STEPS = 4, inner = { x0: r2.x0 + DEPTH, x1: r2.x1 - DEPTH };
  for (const [side, x0] of [['e', r2.x1 - DEPTH], ['w', r2.x0]]) { const pivot = [RAIL.x[0], RAIL.h[0] + GROUND, RAIL.z[0]], dx = +(x0 - RAIL.x[0]).toFixed(4), dy = +(HB - SINK - RAIL.h[0]).toFixed(4);
    leantRail(`_wayn6${side}`, x0, r2.zHigh, RUN, HB, -(HB - HM) / RUN);   // (leant: its north end at the ramp's top)
    laterSpec.push({ from: RAIL.from, suffix: `_wayn7${side}`, pivot, scale: [1, 1, 1], turn: 0, move: [dx, dy, +(STRIP_S - RAIL.z[0]).toFixed(4)], clip: { axis: 'z', from: RAIL.z[0] - 0.01, to: +(RAIL.z[0] + r2.zHigh - STRIP_S).toFixed(4) } });   // (level: the panel from its end post, cut where the leant one begins)
    rails.push({ name: `the north way, the ${side === 'e' ? 'east' : 'west'} rail on the platform`, x0, x1: x0 + DEPTH, z0: STRIP_S, z1: r2.zHigh, y0: HB, y1: HB + RAILH });
    for (let i = 0; i < STEPS; i += 1) { const mid = HB - (HB - HM) * (i + 0.5) / STEPS; rails.push({ name: `the north way, the ${side === 'e' ? 'east' : 'west'} rail on the upper ramp, step ${i + 1}`, x0, x1: x0 + DEPTH, z0: r2.zHigh + RUN * i / STEPS, z1: r2.zHigh + RUN * (i + 1) / STEPS, y0: mid, y1: mid + RAILH }); } }
  slope('the north way, the ramp up to the south', r1); slope('the north way, the ramp back up to the north, between its rails', { ...r2, ...inner }); slab('the north way, the landing', [l1, l2]);
  slab('the north way, the platform on the strip', [p1], false); floors.push({ name: 'the platform where it lies on the strip', x0: p1.x0, x1: p1.x1, z0: p1.z0, z1: STRIP_S, top: HB }, { name: 'the platform between its rails', ...inner, z0: STRIP_S, z1: p1.z1, top: HB });
  slope('earlier: the upper ramp, its whole width', r2, r2, gone.planes); gone.floors.push({ ...p1, top: HB }); }
// ---- THE SOUTH WAY
{ const H0 = PLAT.h[1], HW = 21.88, step = (HW - H0) / 3;   // (the second scaffold's platform top, as the first's; the window's sill)
  const x0 = 13.433, zs = 33.850;   // (that platform's west side and its south edge: Node_228_228_copy)
  const r1 = ramp('_ways1', '+z', x0, zs, H0, H0 + step), r2 = ramp('_ways2', '+z', x0, r1.zHigh, H0 + step, H0 + 2 * step), r3 = ramp('_ways3', '+z', x0, r2.zHigh, H0 + 2 * step, HW);
  const zEnd = 57.750;   // (the tower's corner begins at z 57.82)
  const w1 = level(WALK, '_ways4', x0, zEnd - 12, HW), w2 = level(WALK, '_ways5', x0, zEnd - 8, HW), w3 = level(WALK, '_ways6', x0, zEnd - 4, HW);
  const xb = 8.780;   // (the bridge's side at the sill, 2 cm in)
  const w4 = level(WALK, '_ways7', xb, zEnd - 4, HW, (x0 - xb) / (WALK.x[1] - WALK.x[0]), 1);
  // the rails on the slope's two sides (b1105ki): a leant panel a ramp piece, nine boxes in steps a side; the slope's floor between them
  const g = step / RUN, SSTEPS = 9, sInner = { x0: x0 + DEPTH, x1: x0 + WIDE - DEPTH };
  for (const [side, rx] of [['e', x0 + WIDE - DEPTH], ['w', x0]]) { [r1, r2, r3].forEach((r, i) => leantRail(`_ways9${side}${i + 1}`, rx, r.zLow, RUN, r.low, g));
    for (let i = 0; i < SSTEPS; i += 1) { const za = zs + 3 * RUN * i / SSTEPS, zb = zs + 3 * RUN * (i + 1) / SSTEPS, mid = H0 + (HW - H0) * (i + 0.5) / SSTEPS; rails.push({ name: `the south way, the ${side === 'e' ? 'east' : 'west'} rail on the slope, step ${i + 1}`, x0: rx, x1: rx + DEPTH, z0: za, z1: zb, y0: mid, y1: mid + RAILH }); } }
  slope('the south way, the three ramps, between their rails', { ...r1, ...sInner }, r3); slab('the south way, the walkway', [w1, w2, w3]); slab('the south way, the piece at the window', [w4]);
  slope('earlier: the three ramps, their whole width', r1, r3, gone.planes);
  // the little ramp in the bridge, from its floor up to the sill of that window: as wide as the passage through the window onto the piece (the opening's north side to the piece's south edge)
  const FLOOR = 20.235, SILL = 21.80, WALL = 8.06, LONG = 2.1, STEPS = 4;   // (the bridge's floor and the sill's as the data has them; the wall's face under the sill; the ramp's length)
  const up = rampEast(laterSpec, '_ways8', WALL - LONG, WALL, 55.49, zEnd, FLOOR, SILL); planes.push({ name: 'the south way, the little ramp in the bridge', ...up });
  for (let i = 1; i < STEPS; i += 1) blocks.push({ name: `under the little ramp, step ${i}`, x0: up.x0 + LONG * i / STEPS, x1: up.x0 + LONG * (i + 1) / STEPS, z0: up.z0, z1: up.z1, y0: FLOOR, y1: FLOOR + (SILL - FLOOR) * i / STEPS }); }
// ---- THE UNSEEN SLOPE AT THE BRIDGE'S NORTH STEP (b1105kj): a floor in the data alone, no copy in the model
const STEP = { strip: 21.2375, floor: 20.285, face: 24.62, x: [0.81, 8.06], long: 1.25 };   // (the strip's top and the bridge's floor at its north end, as the data has them; the step's face; the bridge's two walls' inner faces; the slope's length)
planes.push({ name: 'the unseen slope at the bridge\'s north step', x0: STEP.x[0], x1: STEP.x[1], zLow: STEP.face + STEP.long, zHigh: STEP.face, low: STEP.floor, high: STEP.strip });
// ---- THE BRIDGE'S FLOOR CARRIED TO ITS SIDE WALLS (b1105kl): three floors in the data alone, in the arena's units, as the bridge's own floors are written: [x0, x1, z0, z1]
const BRIDGE = { top: 80.94, sill: 87.21,   // (the slab's top; the sills' tops)
  strips: [['east, the gap from the floor\'s edge to the wall\'s inner face', 81, 82, -58, 70], ['west, the gap and under the wall, where the sill\'s floor lies over it', 50, 54, -61, 70], ['west, the hair on the grid\'s line across the wall\'s north end', 50, 53, -62.05, -61.95]],
  floors: [[54, 64, -62, 75], [64, 81, -62, -44], [64, 81, -44, 34], [64, 81, 34, 75]], walls: [[50, 53, -63, 72], [82, 85, -64, -44], [82, 85, -44, 34], [82, 85, 34, 72]],   // (the bridge's four floors at that height, whose edges the strips meet; the walls, each with its sill's top at 87.21)
  sills: [[49.32, 53, -61, 70], [82, 85, -61, -44], [82, 85, -44, 34], [82, 85, 34, 70]],   // (the sills' own floors: the west one lies over the whole of the west strip's stretch under the wall)
  keepers: [[49, 53, -63.52, -63, 85.01, 87.72], [21, 82, -76, -63, 70.01, 84.95]],   // (the corner pillar's foot and the tower's top, boxes [x0, x1, z0, z1, y0, y1]: they hold a body's centre at z -61.85 or south of it, off the hair)
  earlier: [[81, 82, 60.48, 70], [50, 54, -63, 75], [81, 84, -63, 75]] };   // (b1105kg to b1105kj: the gap under the last east window alone, from model z 55.49; the PT site's b1105kk: under the whole of both walls)
const [mode, a, b] = process.argv.slice(2);
if (mode === 'spec') { if (!a) throw new Error('usage: neon_ways_up.mjs spec <out spec.json>'); fs.writeFileSync(a, JSON.stringify([...spec, ...laterSpec], null, 1)); console.log(`${spec.length + laterSpec.length} copies written to ${a}`);
  for (const p of planes) console.log(p.east ? `  ${p.name}: z ${p.z0.toFixed(3)}..${p.z1.toFixed(3)} x ${p.x0.toFixed(3)} (${p.low.toFixed(3)} m) to ${p.x1.toFixed(3)} (${p.high.toFixed(3)} m), ${(Math.atan((p.high - p.low) / (p.x1 - p.x0)) * 180 / Math.PI).toFixed(1)} degrees`
    : `  ${p.name}: x ${p.x0.toFixed(3)}..${p.x1.toFixed(3)} z ${p.zLow.toFixed(3)} (${p.low.toFixed(3)} m) to ${p.zHigh.toFixed(3)} (${p.high.toFixed(3)} m), ${(Math.atan((p.high - p.low) / Math.abs(p.zHigh - p.zLow)) * 180 / Math.PI).toFixed(1)} degrees`);
  for (const s of slabs) console.log(`  ${s.name}: x ${s.x0.toFixed(3)}..${s.x1.toFixed(3)} z ${s.z0.toFixed(3)}..${s.z1.toFixed(3)} top ${s.top.toFixed(3)} m`);
  for (const r of [...rails, ...blocks]) console.log(`  ${r.name}: x ${r.x0.toFixed(3)}..${r.x1.toFixed(3)} z ${r.z0.toFixed(3)}..${r.z1.toFixed(3)} from ${r.y0.toFixed(3)} to ${r.y1.toFixed(3)} m`);
  for (const [name, x0, x1, z0, z1] of BRIDGE.strips) console.log(`  the bridge's floor carried on — ${name}: x ${(x0 / SCALE + CX).toFixed(3)}..${(x1 / SCALE + CX).toFixed(3)} z ${(z0 / SCALE + CZ).toFixed(3)}..${(z1 / SCALE + CZ).toFixed(3)} at ${(BRIDGE.top / SCALE).toFixed(3)} m`);
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
  // the ways: a sloped floor a ramp or a row of ramps, a box and its floor a landing or a walkway, a box or a staircase of boxes a rail
  const planeOf = (p) => { if (p.east) return { minX: ax(p.x0), maxX: ax(p.x1), minZ: az(p.z0), maxZ: az(p.z1), maxTop: ay(p.high), type: 'plane', y0: ay(p.low), gx: Math.round((p.high - p.low) / (p.x1 - p.x0) * 1e6) / 1e6, gz: 0, ramp: 1 };
    const zMin = Math.min(p.zLow, p.zHigh), zMax = Math.max(p.zLow, p.zHigh); const g = (p.high - p.low) / (zMax - zMin) * (p.zHigh > p.zLow ? 1 : -1);
    return { minX: ax(p.x0), maxX: ax(p.x1), minZ: az(zMin), maxZ: az(zMax), maxTop: ay(p.high), type: 'plane', y0: ay(p.zHigh > p.zLow ? p.low : p.high), gx: 0, gz: Math.round(g * 1e6) / 1e6, ramp: 1 }; };
  const floorOf = (s) => ({ minX: ax(s.x0), maxX: ax(s.x1), minZ: az(s.z0), maxZ: az(s.z1), maxTop: ay(s.top), type: 'flat', top: ay(s.top) });
  // the bridge's floor carried to the wall under the last east window (arena units, as the two floors it joins are written)
  { const bridge = D.surfaces.filter((q) => q.type === 'flat' && q.minX === 64 && q.maxX === 81 && q.minZ === 34 && q.maxZ === 75 && q.top === 80.94), sill = D.surfaces.filter((q) => q.type === 'flat' && q.minX === 82 && q.maxX === 85 && q.minZ === 34 && q.maxZ === 70 && q.top === 87.21);
    if (bridge.length !== 1 || sill.length !== 1) throw new Error(`the bridge's floor and the sill's at the last east window: ${bridge.length} and ${sill.length} found`); }
  // the step the unseen slope lies against: the strip's floor ends at its face, the bridge's floor (two rectangles side by side) begins a quarter metre south of it, the two walls stand at its ends
  { const strip = D.surfaces.filter((q) => q.type === 'flat' && q.maxZ === az(STEP.face) && q.top === ay(STEP.strip) && q.minX <= ax(STEP.x[0]) && q.maxX === ax(STEP.x[1])), floor = D.surfaces.filter((q) => q.type === 'flat' && q.minZ === az(STEP.face + 0.25) && q.top === ay(STEP.floor) && q.maxZ >= az(STEP.face + STEP.long));
    const walls = D.obstacles.filter((o) => (o.maxX === ax(STEP.x[0]) || o.minX === ax(STEP.x[1])) && o.minZ <= az(STEP.face) && o.maxZ >= az(STEP.face + STEP.long) && o.minY <= ay(STEP.floor) && o.maxY >= ay(STEP.strip));
    if (strip.length !== 1 || floor.length !== 2 || floor[0].maxX !== floor[1].minX || walls.length !== 2) throw new Error(`the step at the bridge's north end: ${strip.length} floors of the strip, ${floor.length} of the bridge and ${walls.length} walls found`); }
  // the bridge's floors, side walls and sills, and the two boxes that keep a body off the hair, as the strips expect them: each found once
  { const flat = (top) => ([x0, x1, z0, z1]) => D.surfaces.filter((q) => q.type === 'flat' && q.minX === x0 && q.maxX === x1 && q.minZ === z0 && q.maxZ === z1 && q.top === top).length;
    const nf = BRIDGE.floors.map(flat(BRIDGE.top)), ns = BRIDGE.sills.map(flat(BRIDGE.sill)), nw = BRIDGE.walls.map(([x0, x1, z0, z1]) => D.obstacles.filter((o) => o.minX === x0 && o.maxX === x1 && o.minZ === z0 && o.maxZ === z1 && o.maxY === BRIDGE.sill).length);
    const nk = BRIDGE.keepers.map(([x0, x1, z0, z1, y0, y1]) => D.obstacles.filter((o) => o.minX === x0 && o.maxX === x1 && o.minZ === z0 && o.maxZ === z1 && o.minY === y0 && o.maxY === y1).length);
    if ([...nf, ...ns, ...nw, ...nk].some((n) => n !== 1)) throw new Error(`the bridge's floors, sills, side walls and the hair's two keepers: found ${nf.join(', ')} of the four floors, ${ns.join(', ')} of the four sills, ${nw.join(', ')} of the four walls and ${nk.join(', ')} of the two keepers`); }
  const boxes = [...slabs.map((s) => ({ minX: ax(s.x0), maxX: ax(s.x1), minZ: az(s.z0), maxZ: az(s.z1), minY: ay(s.top - THICK), maxY: ay(s.top), topBuffer: 0.8 })),
    ...rails.map((r) => ({ minX: ax(r.x0), maxX: ax(r.x1), minZ: az(r.z0), maxZ: az(r.z1), minY: ay(r.y0), maxY: ay(r.y1) })),   // (a rail is a wall: no floor on its top, no buffer)
    ...blocks.map((r) => ({ minX: ax(r.x0), maxX: ax(r.x1), minZ: az(r.z0), maxZ: az(r.z1), minY: ay(r.y0), maxY: ay(r.y1), topBuffer: 0.8 }))];   // (under a ramp: the ramp's own floor is over it)
  const stripOf = ([x0, x1, z0, z1]) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxTop: BRIDGE.top, type: 'flat', top: BRIDGE.top });
  const strips = BRIDGE.strips.map(([, ...r]) => stripOf(r)), oldStrips = BRIDGE.earlier.map(stripOf);   // (the earlier builds' strips come out: each lies inside one of these, or is the PT site's b1105kk)
  const surfs = [...planes.map(planeOf), ...floors.map(floorOf), ...strips];
  // what is here of them already comes out and all of it goes in at the lists' ends, in this order — so a run on a fresh reading, one on an earlier build's data (the floors
  // that build wrote and this one writes otherwise come out) and one on this tool's own output all write the same file
  const take = (list, e) => { const i = list.findIndex((q) => same(q, e)); if (i < 0) return 0; list.splice(i, 1); return 1; };
  let hadB = 0, hadF = 0, outOld = 0; for (const e of boxes) hadB += take(D.obstacles, e); for (const e of surfs) hadF += take(D.surfaces, e); for (const e of [...gone.planes.map(planeOf), ...gone.floors.map(floorOf), ...oldStrips]) outOld += take(D.surfaces, e);
  D.obstacles.push(...boxes); D.surfaces.push(...surfs);
  fs.writeFileSync(b, JSON.stringify(D));
  console.log(`the stub: ${outB} boxes and ${outF} floors out; earlier builds' floors written otherwise now: ${outOld} out; the ways: ${boxes.length} boxes (${rails.length} of them the rails', ${blocks.length} under the little ramp) and ${surfs.length} floors (${planes.length} of them sloped, one of those the unseen slope at the bridge's north step; ${strips.length} the bridge's floor carried to its side walls), ${hadB} and ${hadF} of them there already: ${D.obstacles.length} boxes, ${D.surfaces.length} floors`);
} else throw new Error('usage: neon_ways_up.mjs spec <out spec.json> | data <in neon_data.json> <out neon_data.json>');
