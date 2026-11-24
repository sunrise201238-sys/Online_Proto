// NEON'S LOW RAILS (b1105ko, 2026-11-23): low rails along the open edges of the scaffold complex's platforms and along the open sides of its ramps, in the data.
// The user, of a way to make a fight on the platforms last ("Currently the BOT does go on the platform to engage, but the defense sprint takes them down real quick.",
// "sometimes not only the defense sprint, but also the natural engaging orbiting takes BOT down.", "one thing i don't like about fences is that it blocks the bullets so the
// high ground advantage is kind of lost."), with a picture of Town's low railing: "how about the mini fences used in town?", "do it on PT", "can you make these mini fences
// passable for bullets? both in town and neon." Then, of the first forms on the PT site: "In Neion, can the mini fences be mounted on the scaffolding slopes?", "edges already
// have scaffolding walls mounted do not need extra mini fences.", "mini fence around here as well. (The slope inside the catwalk does not need mini fence.)", "mini fence at
// these three edges as well.", "No need mini fences at this one platform top.", "Then update Neon and Town to 9.9".
// And of two gaps in the walkway's rails, shown in pictures of the game, with six more places like them found for the answer: "Assess if there would be issue fencing them up.
// if no, implement in PT and 9.9" (b1105kp: the rules of the edge's wall and of the drop put right, short stretches kept, four joints and a run of its own — each below).
// And of three rails on ramps' sides that bodies were found to pass (told that they have their boxes as the others have, and what lets a body through): "要不要照「補齊框架地板」
// 做在 PT 和 9.9？ YES", and of the rail that ends above the foot of its ramp: "Implement, PT and 9.9" (b1105kq: the floors beside two legs, and a leg carried on — 5 and SLOPE_MORE below).
// And of the two pieces of the strip's south edge that no jump cleared — a low rail under a hold 3 m tall that is not seen — shown where they stand: "Can you use the higher
// version fence for these two spots then? I don't like invisible cbox here.", and of that fence on the PT site: "兩段改成高欄杆. make them unpassable for bullets, then update
// to 9.9"; of the one rail that a sprint off the deck above it still went over: "東側內斜坡那條的判定加高到約 1.2 公尺，外觀不變. Implement in PT and 9.9" (b1105ks: THE TALL
// FENCE below, and that leg's hold at 1.20 m for the one build).
// And of that leg, with one of its boxes picked on the page (#8246): "I believe this is the piece of mini fence which you raised its cbox height. Remove this piece of fence
// visually and physically. Then replace it with the higher version fence, the one that also blocks bullets. PT and 9.9" (b1105kt: TALL_LEGS below).
// And of two rails, each with a box of it picked on the page: "This mini fence is visually floating in the air. make sure it visually connects with the platform slope."
// (#8315: the west street ramp's south side) and "Remove this mini fence visually and physically." (#8236: the top of the west inner ramp's south frame) — "Implement
// these 2 changes in PT and 9.9" (b1105ku: the frame's boxes of that side are cut back to the frame one sees by neon_frame_edges.mjs, run before this tool, and the plan
// sets the rail on it; the two joints of it below; the run of its own that b1105kp wrote is gone). And the same day, of the 12.59 m top platform's north and east
// rails (#8213, #8222): "while you're at it, this particular corner's mini fences also floats a bit in visual. Make them visually connect with the platform." —
// "PT and 9.9" (FOOT_PLATES below).
// And of three more, each with a box picked (b1105kv, 2026-11-24): the two legs of the north way's ramp, #8375 and #8357 — "These two mini fences are slightly
// floating and there feet dangling in the air beneath the airborne slope." (ON_SLOPE below); the west street ramp's north leg, #8256 — "This mini fence is slightly
// floating outside in the air as well." (SLOPE_LINES below); and the 1.75 m run at the 8.64 m deck's corner, #8220 — "remove this mini fence physically and
// visually. PT and 9.9" (the SKIP below). "Fix in PT and 9.9."
// usage: node neon_rails.mjs <tree root> <in neon_data.json> <out neon_data.json> <out pieces.json>      (LIST=1: the plan is listed and nothing is written)
//        then for the model glb_place.mjs <in neon.glb> <out> echo_01_242 <pieces>_tall_spec.json (the tall fence's two panels; the spec is written beside the pieces) and
//        glb_rails.mjs <in> <out neon.glb> <pieces.json> (the low rails: the last thing written to the model), and navgrid_build.mjs <tree root> neon for the route grid.
// A RAIL stands ON the floor with its outer face on the edge's line: 6 cm through and 0.75 m tall (under the page's fade height of 0.8 m, so a rail never goes see-through).
// In the data it is a box that holds a body alone (noProjectile: rounds, beams and the bots' sight pass it; it is no cover), from 0.25 m over the floor to the rail's top,
// with a topBuffer of 2: a body is held while its feet are under 0.64 m over the floor (one on a ramp's side frame, 0.46 m up, too), so a walk, a sprint and a dodge are
// held and a jump clears it. In the model it is posts 6 cm square, no more than 2 m apart, under a bar 5 cm tall; a run is one object.
// Where the rails go is found, not listed: (1) the flat floors' open edges are read off the data without rails, (2) those rails are put in, and (3) the ramps' sides are
// TRIED on the sim with them in place. A rail of an earlier run is known by its flags and its thickness (no new key in the data; no box of the map without rails has a
// topBuffer of 2, 4.25 or 12) and is taken out first, so a run on its own output writes the same file. What is written is put at the end of the boxes; the file's other text is
// kept byte for byte. The floors of 5 are the one thing written with a key of their own (`railFloor`: the sim reads a floor's own keys alone), by which an earlier run's are
// known and taken out; they are put at the end of the floors.
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const [treeA, inF, outF, piecesF] = process.argv.slice(2); if (!piecesF) { console.error('usage: node neon_rails.mjs <tree root> <in neon_data.json> <out neon_data.json> <out pieces.json>'); process.exit(2); }
// the rail (metres): through, tall, the bar's height, a post's reach under the floor's top, the posts' greatest pitch; the model's height of the street; where the hold begins
// over the floor; the holds (BUFFER_MORE: the east inner ramp's north leg in b1105ks, held to 1.20 m; BUFFER_NO_HOP: the two rails that no jump cleared in b1105kn to
// b1105kq — the tall fence stands at all three now, and the two holds are known still, so that a run on such a build's data takes its rails out); the model's colour
// (linear: the scaffold's dark steel)
const T = 0.06, TALL = 0.75, BAR = 0.05, FOOT = 0.03, PITCH = 2.0, GROUND = 4.2927, HOLD_FROM = 0.25, BUFFER = 2, BUFFER_MORE = 4.25, BUFFER_NO_HOP = 12, COLOR = [0.051, 0.073, 0.077];
const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37, AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4; const r4 = (v) => Math.round(v * 1e4) / 1e4;   // (arena units and model metres)
const isRail = (o) => o.noProjectile === true && (o.topBuffer === BUFFER || o.topBuffer === BUFFER_MORE || o.topBuffer === BUFFER_NO_HOP) && Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < T * 4 + 1e-3;
// THE TALL FENCE (b1105ks; on the PT site b1105kr). Two pieces of the strip's south edge must not be jumped (NO_HOP below, with why). b1105kn to b1105kq had a low rail
// there under a hold 3 m tall: a thing not seen that stops a jump. The user, shown the two: "Can you use the higher version fence for these two spots then? I don't like
// invisible cbox here." So the scaffold's own fence panel stands at those two instead of a low rail, as it does along the north way's platform beside them
// (neon_ways_up.mjs: Node_214_214 and its mesh, 0.59 m through its feet, 2.61 m over the floor, its foot 8 cm in it): what holds a body there is what one sees. Each fills
// its opening from end to end — the strip's corner to the platform's west panel, the platform's east panel to the wall at the bridge's end. In the data a panel is one box
// of its own depth and height, and a WALL as the way's own panels are: no topBuffer (no jump clears it and the route grid has no drop over it — what the hold of 12 did)
// and no noProjectile (it stops a round, a beam and the bots' sight. The PT site's b1105kr let those pass, as the low rail there had; the user, of it: "make them
// unpassable for bullets"). A panel of an earlier run is known by its plan and its height, with that flag or without. Model metres: the opening along x, the panel's band
// along z, the floor; the panel copied (glb_place.mjs).
const PANEL = { from: ['Node_214_214', 'Node_215_215'], x0: 0.963, z0: 21.839, len: 4.002, base: 8.545, deck: 8.629, top: 11.240, depth: 0.59 };
const TALL_FENCE = [{ x0: -7.19, x1: -6.31, z0: 24.03, z1: 24.62, h: 21.24, suffix: '_tallsw', name: 'the strip\'s south-west corner' }, { x0: -2.31, x1: -0.19, z0: 24.03, z1: 24.62, h: 21.24, suffix: '_talls', name: 'the strip\'s south edge between the platform and the bridge' }];
const tallBox = (t) => ({ minX: r4(AX(t.x0)), maxX: r4(AX(t.x1)), minZ: r4(AZ(t.z0)), maxZ: r4(AZ(t.z1)), minY: r4(t.h * 4), maxY: r4((t.h + PANEL.top - PANEL.deck) * 4) });
// A LEG WHERE THE TALL FENCE STANDS (b1105kt). The east inner ramp's north side had a low rail as every ramp's side has; a sprint off the deck at the ramp's top went over
// it (22 of the bodies' scan, 12 m down to the street), and b1105ks gave its boxes a hold 0.45 m over the bar one sees. The user, with a box of it picked: "Remove this
// piece of fence visually and physically. Then replace it with the higher version fence, the one that also blocks bullets." So the scaffold's fence panel stands along
// that side now, leant with the ramp as the panels on the two ways' ramps are (neon_ways_up.mjs leantRail): the panel made the leg's length, its posts upright, its foot
// 8 cm in the ramp's floor line, its outer face on the frame's edge where the low rail's was — 2.61 m over the ramp's floor from the ramp's foot to the deck at its top.
// In the data it is a row of wall boxes in steps, the panel's depth through, each from the ramp's floor at the lower end of its step to the panel's height over the floor
// at the higher: no topBuffer and no noProjectile, as the panels above. The plan's leg on that line gets no low rail (the tool stops if the plan has no such leg, or has
// it elsewhere), and a flat run that runs into the panel's band ends at the panel's end. Model metres: the leg's axis, line and open side; from, to; the ramp's floor at
// those two (the tool stops if the data's sloped floor is not there).
const TALL_LEGS = [{ axis: 'x', c: 29.61, n: -1, from: 9.79, to: 13.30, f0: 8.807, f1: 12.327, suffix: '_talle', name: 'the east inner ramp\'s north side' }];
const tallLegBand = (t) => (t.n > 0 ? [t.c - PANEL.depth, t.c] : [t.c, t.c + PANEL.depth]);   // (across the leg: from its line in over the frame)
const tallLegBoxes = (t) => { const len = t.to - t.from, K = Math.max(1, Math.ceil(Math.max(len / 0.5, Math.abs(t.f1 - t.f0) / 0.25))), f = (a) => t.f0 + (t.f1 - t.f0) * (a - t.from) / len, [p0, p1] = tallLegBand(t); const out = [];
  for (let k = 0; k < K; k += 1) { const a0 = t.from + len * k / K, a1 = t.from + len * (k + 1) / K; const b = t.axis === 'x' ? { minX: AX(a0), maxX: AX(a1), minZ: AZ(p0), maxZ: AZ(p1) } : { minX: AX(p0), maxX: AX(p1), minZ: AZ(a0), maxZ: AZ(a1) };
    out.push({ minX: r4(b.minX), maxX: r4(b.maxX), minZ: r4(b.minZ), maxZ: r4(b.maxZ), minY: r4(Math.min(f(a0), f(a1)) * 4), maxY: r4((Math.max(f(a0), f(a1)) + PANEL.top - PANEL.deck) * 4) }); }
  return out; };
const TALL_BOXES = [...TALL_FENCE.map(tallBox), ...TALL_LEGS.flatMap(tallLegBoxes)];
const isTall = (o) => TALL_BOXES.some((b) => ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY'].every((k) => Math.abs(o[k] - b[k]) < 0.01));
const text = fs.readFileSync(inF, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
const before = D.obstacles.length; D.obstacles = D.obstacles.filter((o) => !isRail(o)); const taken = before - D.obstacles.length;
const withTall = D.obstacles.length; D.obstacles = D.obstacles.filter((o) => !isTall(o)); const tallTaken = withTall - D.obstacles.length;
const floorsBefore = D.surfaces.length; D.surfaces = D.surfaces.filter((q) => q.railFloor !== true); const floorsTaken = floorsBefore - D.surfaces.length;
const SIM = pathToFileURL(path.resolve(treeA) + '/shared/src/sim/').href; const A = await import(SIM + 'arena.js'); const C = await import(SIM + 'constants.js');
const { createMatchState, tickMatch, emptyInput, getArena } = await import(SIM + 'index.js'); const { navGridFor } = await import(SIM + 'ai.js'); const P = await import(SIM + 'physics.js');
const G = C.GROUND_BASE_Y, R = C.FIGHTER_RADIUS, STEP = C.SURFACE_STEP_HEIGHT, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const arenaNow = () => { A.registerGeneratedData('neon', JSON.parse(JSON.stringify(D))); return getArena('neon'); };   // (the sim reads a copy of the data as it stands: what it marks on a box stays out of the file)

// THE JOINTS (b1105kp; model metres: the run's axis and line, which of its ends, where the plan has that end, where it is carried to). Places where what a run or a leg
// should meet is not a floor's open edge or a ramp's side as the plan knows them. Each was found by walking, sprinting and dodging bodies off every place of the platforms,
// and is closed by carrying a rail on to what it should meet. The tool stops if a run or a leg it names is not in the plan with that end.
const FLAT_JOINTS = [
  ['x', 57.75, 'from', 8.84, 7.81, 'the walkway\'s south rail to the jamb of the bridge\'s last east window'],   // (the window's opening goes on 0.54 m south of the walkway's line, over the sill's end: a walk from the little slope or the sill went out there, 11.6 m down)
  ['x', 21.87, 'from', -8.63, -10.44, 'the first top platform\'s north rail to its west rail'],                     // (the plan rails the notch alone; west of it a lip 0.25 m deep runs to the corner, where a body squeezed past the west rail's end)
  ['z', 19.56, 'to', 40.32, 40.46, 'the deck\'s east rail to the east ramp\'s north leg'],                                 // (the plan ends it 5 cm short of the leg's line: the two meet in one post)
  ['z', -12.19, 'from', 40.68, 40.37, 'the 5.78 m deck\'s west rail to the west street ramp\'s south leg'],          // (b1105ku: that leg stands a quarter metre farther north now, on the frame one sees — neon_frame_edges.mjs)
];
// (b1105kp to b1105kt wrote A RUN OF ITS OWN here: 1.25 m of rail on the top of the west inner ramp's south frame, a strip half a metre wide in two steps beside the ramp,
// 2.45 and 2.56 m over the 5.78 m deck, where a walk up the strip went off it. The user, with its box picked: "Remove this mini fence visually and physically." It is gone
// — the plan has no run there, as no place of the route grid stands on those two steps — and a walk up that strip goes off its end again.)
const SLOPE_JOINTS = [
  ['z', -6.31, 'to', 28.89, 29.396, 'the north way\'s ramp, its east leg up to where it ended'],                              // (b1105lc: neon_fence_feet.mjs brings the tower stair's fence boxes down to the stair, and the lowest of the west ones, beside this ramp's top, then holds a body on the ramp from z 28.84 where it held from 29.35: the plan ended the leg half a metre sooner, where one sees no fence that low. The leg stays as long as it was.)
  ['x', 32.36, 'from', -15.25, -14.96, 'the west street ramp\'s north leg begins at its frame\'s end'],             // (b1105kv: as the south one — its first 0.29 m hung beside the frame's narrow end piece)
  ['x', 40.40, 'from', 20.21, 19.50, 'the east ramp\'s north leg up to the deck\'s east rail'],                    // (the frame's first steps, between the deck and the sloped floor: a walk from the deck went off their north side, 5 m down)   // (b1105ky: the leg's line is 40.39 for 40.37 — neon_frame_edges.mjs cuts that side's boxes 3 cm back, onto the beam — and the deck's east rail above is carried to the leg's inner face there, 40.46 for 40.43)
  ['x', 40.37, 'from', -15.50, -14.96, 'the west street ramp\'s south leg begins at its frame\'s end'],             // (b1105ku: west of x -14.96 the frame one sees is a narrow end piece 0.27 m farther in, and the rail's first half metre hung beside it)
];
// A LEG CARRIED ON (b1105kq; model metres: the leg's axis, line and open side; from where the plan ends it, to; the frame's floor at those two places; the floor the posts stand
// on): the leg beside the ramp east of the 8.6 m deck ended at x 15.13, where the frame beside the ramp is still 0.64 m over the 5.78 m deck — the trial runs a body straight
// out, and from there on such a body lands on the deck's strip and is held by the deck's rail half a metre on. A body that SPRINTS down along the leg comes round its end
// 0.9 m over the deck and is over the deck's rail (which holds feet under 0.64 m over the deck) before it is down: 16 sprints of the bodies' scan went to the street, 6.6 m.
// Carried on to the frame's end at x 16.06, 0.41 m over the deck, the leg lets the body go lower than the deck rail's hold. A leg of its own, as the frame's floor falls
// less steeply there than the leg's line and the posts stand on the deck. The tool stops if no leg of the plan ends where this one begins.
const SLOPE_MORE = [['x', 47.62, 1, 15.13, 16.06, 6.58, 6.19, 5.78, 'the leg beside the ramp east of the 8.6 m deck, to the frame\'s end']];
// 1. THE FLAT FLOORS' OPEN EDGES. Along every open edge of the flat floors of the scaffold complex that a unit stands on — a side of a floor's rectangle beyond which the
// ground drops 2.4 m or more, with no floor going on within a step's height across a gap, no wall there already and a floor at least 1.6 m deep behind it — a run of rail:
// its outer face on the floor's own edge line. Runs on one line are joined, a gap narrower than a body bridged, a run shorter than a body dropped unless it lies between
// things that hold a body.
function flatRuns(arena) {
  const REGION = [-14, 22, 16, 60], UP = 4.5, DROP = 2.4 * 4, NARROW_FLOOR = 6.4;   // (the scaffold complex in model metres; a raised floor; an open edge's drop, units)
  const g = navGridFor(arena);   // (the route grid of the data without rails, built here: about ten seconds)
  // the raised places a unit comes to: from the street by the grid's walk links and its jump and drop links
  let s0 = -1, best = 1e9; for (let i = 0; i < g.N; i += 1) { if (g.floor[i] / 4 > 1) continue; const d = Math.hypot(MX(g.posX[i]) - 0, MZ(g.posZ[i]) - 45); if (d < best) { best = d; s0 = i; } }
  const seen = new Uint8Array(g.N); const q = [s0]; seen[s0] = 1; for (let h = 0; h < q.length; h += 1) { const n = q[h]; for (let k = g.walkStart[n]; k < g.walkStart[n + 1]; k += 1) { const m = g.walkAdj[k]; if (!seen[m]) { seen[m] = 1; q.push(m); } } for (let k = g.linkStart[n]; k < g.linkStart[n + 1]; k += 1) { const m = g.linkAdj[k]; if (!seen[m]) { seen[m] = 1; q.push(m); } } }
  const inReg = (x, z) => MX(x) >= REGION[0] && MX(x) <= REGION[1] && MZ(z) >= REGION[2] && MZ(z) <= REGION[3];
  const nodes = q.filter((n) => g.floor[n] / 4 >= UP && inReg(g.posX[n], g.posZ[n])).map((n) => ({ x: g.posX[n], z: g.posZ[n], f: g.floor[n] }));
  const cellKey = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`; const nb = new Map(); for (const n of nodes) { const k = cellKey(n.x, n.z); if (!nb.has(k)) nb.set(k, []); nb.get(k).push(n); }
  const stoodNear = (x, z, h, nx, nz) => { for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) { const l = nb.get(`${Math.floor(x / 8) + i},${Math.floor(z / 8) + j}`); if (!l) continue; for (const n of l) { if (Math.abs(n.f - h) > 0.3) continue; const dx = n.x - x, dz = n.z - z; if (dx * dx + dz * dz > 36) continue; if (dx * nx + dz * nz < 0.5) return true; } } return false; };
  const flats = arena.surfaces.filter((s) => s.type === 'flat' && s.maxTop / 4 >= UP && s.maxX > AX(REGION[0]) && s.minX < AX(REGION[1]) && s.maxZ > AZ(REGION[2]) && s.minZ < AZ(REGION[3]));
  // AN EDGE WITH A WALL (user 2026-11-23, of the rails inside the scaffold's cage: "edges already have scaffolding walls mounted do not need extra mini fences"; and of a gap
  // in front of a pillar: "The first gap is against a wall, the unit could not fall by walking in the first place. so i'm all fine with it."): a body falls when its MIDDLE
  // passes the floor's edge, so the edge is walled where a box holds a body whose middle is at the edge (just past it: 0.05 units), or holds it before it gets there. That is
  // the whole test. (b1105kn to b1105ko also took for a wall any box that rises 1.2 m over the floor within 0.8 m beyond the edge — "a wall one sees". Where such a wall
  // stands more than a body's half-width off the edge, the body's middle passes the edge and it falls into the slot between them: the east end of that gap in front of the
  // pillar, a notch in the first top platform's north side. The user, shown them: "Assess if there would be issue fencing them up. if no, implement".)
  const walled = (x, z, h, nx, nz) => P.unitOverlapsObstacle(x - nx * 0.3, h + G, z - nz * 0.3, arena.obstacles, R) || P.unitOverlapsObstacle(x + nx * 0.05, h + G, z + nz * 0.05, arena.obstacles, R);
  // AN OPEN EDGE: 1 where the ground just beyond the edge lies 2.4 m or more lower; 2 where it does so only within a body's width beyond — what lies between is a thing too
  // narrow to keep a body up there: the top of the sign under the walkway's inner corner, 2.2 m under the walkway and 0.37 m wide (b1105ko had no rail for 1.9 m there, and
  // a walk, a sprint and a dodge went over the sign and down to the street), a strip of a frame 0.14 m wide. 0 where it is not open.
  const open = (x, z, h, nx, nz) => { if (!inReg(x, z) || !stoodNear(x, z, h, nx, nz)) return 0;
    const near = P.groundHeightAt(x + nx * 0.3, z + nz * 0.3, arena.surfaces, h) <= h - DROP;
    if (!near) { let far = false; for (const d of [0.8, 1.3, 1.8, 2.3]) { if (P.unitOverlapsObstacle(x + nx * d, h + G, z + nz * d, arena.obstacles, R)) break; if (P.groundHeightAt(x + nx * d, z + nz * d, arena.surfaces, h) <= h - DROP) { far = true; break; } } if (!far) return 0; }   // (beyond the edge: a drop of 2.4 m or more — the wider look only as far as nothing holds the body's middle)
    for (const d of [0.8, 1.3, 1.8]) if (P.groundHeightAt(x + nx * d, z + nz * d, arena.surfaces, h) >= h - STEP - 0.01) return 0;   // (a floor goes on across a gap: no rail across a way)
    if (walled(x, z, h, nx, nz)) return 0;
    for (let d = 0.4; d < NARROW_FLOOR; d += 0.4) if (P.groundHeightAt(x - nx * d, z - nz * d, arena.surfaces, h) < h - STEP - 0.01) return 0;   // (the floor itself ends within 1.6 m behind the edge: a beam's top, a ledge along a wall — no platform)
    return near ? 1 : 2; };
  const SAMPLE = 0.25, BODY = 2 * R; const raw = [];
  // A SHORT STRETCH BETWEEN THINGS THAT HOLD A BODY: on a platform's own floor (1.6 m or more both ways) a stretch shorter than a body is all that lies open between a
  // thing that holds a body and another, or the floor's corner — the strip's south edge between its west rail and the north way's fence, 0.57 m, where a bot walked off to
  // the top platform below (b1105ko dropped it as a sliver). It is carried a body's half-width on at each end that is held, to the thing itself.
  for (const s of flats) { const h = s.maxTop, platform = Math.min(s.maxX - s.minX, s.maxZ - s.minZ) >= NARROW_FLOOR;
    for (const side of [{ axis: 'x', c: s.minZ, n: -1, a: s.minX, b: s.maxX }, { axis: 'x', c: s.maxZ, n: 1, a: s.minX, b: s.maxX }, { axis: 'z', c: s.minX, n: -1, a: s.minZ, b: s.maxZ }, { axis: 'z', c: s.maxX, n: 1, a: s.minZ, b: s.maxZ }]) {
      const N = Math.max(1, Math.round((side.b - side.a) / SAMPLE)), st = (side.b - side.a) / N; let from = null, wide = false; const at = (t) => (side.axis === 'x' ? [t, side.c, 0, side.n] : [side.c, t, side.n, 0]);
      const held = (t) => { if (t < side.a - 1e-6 || t > side.b + 1e-6) return false; const [x, z, ux, uz] = at(t); return walled(x, z, h, ux, uz); };
      for (let i = 0; i <= N; i += 1) { const t = side.a + st * i; const [x, z, ux, uz] = at(t); const o = open(x, z, h, ux, uz);
        if (from != null && o && (o === 2) !== wide) { push(from, side.a + st * (i - 1), wide, false); from = null; }   // (a change of look ends a stretch: the near look's stretches are b1105ko's, number for number)
        if (o && from == null) { from = t; wide = o === 2; }
        if ((!o || i === N) && from != null) { push(from, o ? t : side.a + st * (i - 1), wide, true); from = null; } }
      function push(f0, t0, w, ends) { let f = f0, t = t0; if (ends && platform && !w && t - f < BODY) { if (held(f - st)) f = Math.max(side.a, f - R); if (held(t + st)) t = Math.min(side.b, t + R); }
        if (t > f || (w && t >= f)) raw.push({ h, axis: side.axis, c: side.c, n: side.n, from: f, to: t, wide: w }); } } }
  // THE PLATFORMS (model metres: x0, x1, z0, z1, h0, h1): the two scaffolds with their decks, top platforms and the north way's landing; the strip at the tower top's level; the
  // south way's walkway. Not the bridge's tube (its floor, its ends, its window sills, the little slopes in it), not a building's roof, not the landings of the ramps up from the street.
  // The strip and the walkway were left out of the first build on PT: a bot that comes up by a transporter goes down from those two by walking off their edge, and a route's last
  // step is walked, never jumped (nbrain.js truncateAtFiringPoint: the cut's own waypoint carries no jump), so a rail there holds it (b1105kl's scan of a bot in the bridge and a target on the decks below: 18 runs
  // never arrive of 450 before, 44 of 438 with rails on those two). The user, told so, on PT's b1105kn, standing on the walkway and at three edges of the strip: "mini fence around here as well. (The slope inside
  // the catwalk does not need mini fence.)", "mini fence at these three edges as well." — and of the cage's roof: "No need mini fences at this one platform top." (the SKIP below).
  const ZONES = [[-13.6, 20.8, 21.4, 49.0, 5.5, 19.5], [-13.6, 10, 15, 26, 20.9, 21.6], [8.9, 17.6, 45.8, 58.0, 21.7, 22.0]];
  const SKIP = [[-3.7, 2.8, 33.1, 39.6, 12.5, 13.1], [9.6, 11.5, 41.2, 41.6, 8.4, 8.9]];   // (the west cage's roof; and, b1105kv, the 1.75 m run at the 8.64 m deck's south-east corner, x 9.56..11.31 at z 41.37 (the box begins east of x 9.56, the line of the deck's east rail, which ends there as before) — the user, with its box picked: "remove this mini fence physically and visually.")
  // WHERE THE TALL FENCE STANDS (model metres, as SKIP): two pieces of the strip's south edge that must not be jumped. The plan finds them as runs like any other; marked
  // here, they get no low rail — THE TALL FENCE above stands there (b1105kn to b1105kq: a low rail with a hold too tall for a jump, of which the text below speaks).
  // The first, 1.5 m between the bridge's end and the north way's platform: it is where a bot that comes out of the bridge walked off to the decks 12.6 m below (the user's own
  // case of b1105kl: a target under the strip, the bot held in the bridge before); a rail a jump clears is a lip to the route grid, the drop over it stays in the grid, the bot's
  // route still ends with it and the bot stands held at the rail (neon_ways.test.js's case of it failed; a scan of 438 runs from the bridge to the decks below went from 20
  // never to 44). Given a hold too tall for a jump (BUFFER_NO_HOP above) the rail is a wall to the grid: no drop over it, and the bot goes round.
  // The second (b1105kp), 0.85 m at the strip's south-west corner, between its west rail and the north way's fence: the same. Left open (b1105ko) a bot walked off there to the
  // first top platform, and so did a body that walked, sprinted or dodged at it; closed with a rail a jump clears, the bot stood at it — the scan's 23 runs that never arrive
  // were 31, twelve of the new ones at this piece; closed with this hold they are 18, and no run is later by 2 s.
  // The two pieces of the map's rails a body cannot jump. The strip's west and east rails beside them are jumped as every other rail is.
  const NO_HOP = [[-2.2, -0.3, 24.3, 24.9, 21.0, 21.5], [-7.3, -6.2, 24.3, 24.9, 21.0, 21.5]];
  const inZone = (xm, zm, hm) => ZONES.some(([x0, x1, z0, z1, h0, h1]) => xm >= x0 && xm <= x1 && zm >= z0 && zm <= z1 && hm >= h0 && hm <= h1);
  const mid = (r) => r.axis === 'x' ? [MX((r.from + r.to) / 2), MZ(r.c)] : [MX(r.c), MZ((r.from + r.to) / 2)];
  let R0 = raw.filter((r) => { const [xm, zm] = mid(r); return (r.wide || r.to - r.from >= 2) && inZone(xm, zm, r.h / 4); });   // (a sliver under half a metre, a corner's leftover, is no edge of its own)
  // floor levels within 0.25 m of each other are one platform's (a deck and the frame tops in it); a platform has 12 m2 of floor or more (a ramp's steps have not)
  const zf = flats.filter((s) => inZone(MX((s.minX + s.maxX) / 2), MZ((s.minZ + s.maxZ) / 2), s.maxTop / 4)); const hs = [...new Set(zf.map((s) => +s.maxTop.toFixed(2)))].sort((a, b) => a - b);
  const clusterOf = new Map(); let cid = -1, prev = -1e9; for (const h of hs) { if (h - prev > 1.0) cid += 1; clusterOf.set(h, cid); prev = h; }
  const area = new Map(); for (const s of zf) { const c = clusterOf.get(+s.maxTop.toFixed(2)); area.set(c, (area.get(c) ?? 0) + (s.maxX - s.minX) * (s.maxZ - s.minZ) / 16); }
  const cl = (h) => clusterOf.get(+h.toFixed(2)); R0 = R0.filter((r) => cl(r.h) != null && area.get(cl(r.h)) >= 12);
  // runs of one platform's side whose lines lie within 0.6 m and whose ends are within 1.25 m: one rail, on the line that is farthest IN (so that it stands on floor all along)
  // — the line of the pieces found by the near look. A piece found by the wider look carries a run on where it lies on the run's own line (the walkway's inner corner, the
  // deck's east edge at the east ramp); on another line it lies behind a lip that the rail on the lip's own line guards, and alone it is no run
  const JOIN = 5.0, NEARLINE = 2.4; const groups = new Map(); for (const r of R0) { const k = `${cl(r.h)}|${r.axis}|${r.n}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  let merged = []; for (const l of groups.values()) { const par = l.map((_, i) => i); const find = (i) => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < l.length; i += 1) for (let j = i + 1; j < l.length; j += 1) { const a = l[i], b = l[j]; if (Math.abs(a.c - b.c) > NEARLINE) continue; const gap = Math.max(a.from, b.from) - Math.min(a.to, b.to); if (gap <= JOIN) par[find(i)] = find(j); }
    const comp = new Map(); l.forEach((r, i) => { const k = find(i); if (!comp.has(k)) comp.set(k, []); comp.get(k).push(r); });
    for (const all of comp.values()) { const n = all[0].n; const own = all.filter((r) => !r.wide); if (!own.length) continue;   // (a piece of the wider look carries a run on; alone it is no run)
      const c = ((big) => n > 0 ? Math.min(...big.map((r) => r.c)) : Math.max(...big.map((r) => r.c)))(own.some((r) => r.to - r.from >= 4) ? own.filter((r) => r.to - r.from >= 4) : own); const rs = all.filter((r) => !r.wide || Math.abs(r.c - c) < 0.01);
      merged.push({ h: Math.max(...own.map((r) => r.h)), axis: all[0].axis, n, c,   // (the line: the one farthest in among the pieces a metre long or more)
         from: Math.min(...rs.map((r) => r.from)), to: Math.max(...rs.map((r) => r.to)), parts: rs.length }); } }
  // a floor narrower than 1.6 m between two rails that face away from each other: no rail on either side there (a beam, a ledge: the rails would close it)
  const NARROW = 6.4; const cutOut = (r, a, b) => (b <= r.from || a >= r.to) ? [r] : [{ ...r, to: Math.min(r.to, a) }, { ...r, from: Math.max(r.from, b) }].filter((q) => q.to - q.from > 0.01);
  const strips = []; { let again = true; while (again) { again = false; outer: for (let i = 0; i < merged.length; i += 1) for (let j = 0; j < merged.length; j += 1) { const a = merged[i], b = merged[j]; if (i === j || a.axis !== b.axis || a.n !== 1 || b.n !== -1 || Math.abs(a.h - b.h) > 1.0) continue;
        const w = a.c - b.c; if (w <= 0 || w >= NARROW) continue; const lo = Math.max(a.from, b.from), hi = Math.min(a.to, b.to); if (hi - lo <= 0.01) continue;
        strips.push({ axis: a.axis, lo, hi, c0: b.c, c1: a.c, h: a.h }); merged = merged.filter((_, k) => k !== i && k !== j).concat(cutOut(a, lo, hi), cutOut(b, lo, hi)); again = true; break outer; } } }
  // (and the narrow floor's end: a rail across the end of a floor whose sides have none)
  merged = merged.filter((r) => !strips.some((t) => t.axis !== r.axis && Math.abs(t.h - r.h) <= 1.0 && r.c >= t.lo - 2.4 && r.c <= t.hi + 2.4 && r.from >= t.c0 - 0.5 && r.to <= t.c1 + 0.5));
  merged = merged.filter((r) => r.to - r.from >= BODY);
  // at a corner the two rails meet: an end within 0.6 m of a crossing rail's line is carried to it
  for (const r of merged) for (const o of merged) { if (o.axis === r.axis || Math.abs(o.h - r.h) > 1.0) continue; if (r.c < o.from - 2.4 || r.c > o.to + 2.4) continue;
    if (Math.abs(r.from - o.c) <= 2.4) r.from = o.c; if (Math.abs(r.to - o.c) <= 2.4) r.to = o.c; }
  // the skip boxes cut out
  const skip = SKIP; let runs = []; for (const r of merged) { let parts = [[r.from, r.to]];
    for (const [x0, x1, z0, z1, h0, h1] of skip) { if (r.h / 4 < h0 || r.h / 4 > h1) continue; const lo = r.axis === 'x' ? AX(x0) : AZ(z0), hi = r.axis === 'x' ? AX(x1) : AZ(z1), c0 = r.axis === 'x' ? AZ(z0) : AX(x0), c1 = r.axis === 'x' ? AZ(z1) : AX(x1); if (r.c < c0 || r.c > c1) continue;
      parts = parts.flatMap(([a, b]) => (hi <= a || lo >= b) ? [[a, b]] : [[a, Math.min(b, lo)], [Math.max(a, hi), b]].filter(([p, t]) => t - p > 0.01)); }
    for (const [a, b] of parts) runs.push({ ...r, from: a, to: b }); }
  // (a short run across the END of a narrow floor — the floor ends beyond both its ends — is no rail: a beam's end)
  const endsOpen = (r) => { const at = (t) => (r.axis === 'x' ? [t, r.c - r.n * 0.3] : [r.c - r.n * 0.3, t]); const gone = (t) => { const [x, z] = at(t); return P.groundHeightAt(x, z, arena.surfaces, r.h) < r.h - STEP - 0.01; }; return gone(r.from - 0.4) && gone(r.to + 0.4); };
  const noHop = (r) => { const [xm, zm] = mid(r), hm = r.h / 4; return NO_HOP.some(([x0, x1, z0, z1, h0, h1]) => xm >= x0 && xm <= x1 && zm >= z0 && zm <= z1 && hm >= h0 && hm <= h1); };
  runs = runs.filter((r) => r.to - r.from >= BODY && !(r.to - r.from < NARROW_FLOOR && endsOpen(r))).map((r) => ({ h: +r.h.toFixed(4), axis: r.axis, c: +r.c.toFixed(4), n: r.n, from: +r.from.toFixed(4), to: +r.to.toFixed(4), ...(noHop(r) ? { noHop: true } : {}) }));
  for (const [ax, c, end, at, to, why] of FLAT_JOINTS) { const hit = runs.filter((r) => r.axis === ax && Math.abs((ax === 'x' ? MZ(r.c) : MX(r.c)) - c) < 0.02 && Math.abs((ax === 'x' ? MX(r[end]) : MZ(r[end])) - at) < 0.08); if (hit.length !== 1) throw new Error(`the joint "${why}": ${hit.length} runs found with that end`); hit[0][end] = +(ax === 'x' ? AX(to) : AZ(to)).toFixed(4); }
  const len = runs.reduce((s, r) => s + (r.to - r.from) / 4, 0); const lv = new Map(); for (const r of runs) { const k = (r.h / 4).toFixed(2); lv.set(k, (lv.get(k) ?? 0) + (r.to - r.from) / 4); }
  console.log(`flat floors ${flats.length}, raised places a unit comes to ${nodes.length}: ${runs.length} runs, ${len.toFixed(1)} m; by floor height (m): ${[...lv.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v.toFixed(1)}`).join(', ')}`);
  return runs.map((r) => ({ h: +(r.h / 4).toFixed(3), axis: r.axis, c: +(r.axis === 'x' ? MZ(r.c) : MX(r.c)).toFixed(3), n: r.n, from: +(r.axis === 'x' ? MX(r.from) : MZ(r.from)).toFixed(3), to: +(r.axis === 'x' ? MX(r.to) : MZ(r.to)).toFixed(3), ...(r.noHop ? { noHop: true } : {}) }));   // (model metres from here on)
}

// 3. THE RAMPS' SIDES, BY TRIAL (user 2026-11-23: "can the mini fences be mounted on the scaffolding slopes?"). A ramp of the scaffold is a sloped floor with a frame beside
// it: strips a body walks on, kerbs that hold a body standing beside them and let one pass that comes off the higher ramp (a box holds a body only while its feet are 0.41 m
// or more under the box's top), and next to two ramps a deck's edge whose own rail a body flies over when it leaves the ramp 0.75 m or more above the deck. Reading that off
// the boxes went wrong twice, so the side is tried: at every quarter metre of a sloped floor's side a body is set on the floor inside and run outward, at a walk and at a
// sprint, with the flat rails in place. Where it comes to be 2.4 m or more lower within 3 m of the side, the side is open there and gets a rail: along the outer edge of
// whatever floor goes on beside the ramp at its level (the frame's strip), from the lower of the two floors to the rail's height over the higher. The two ways up to the
// bridge have tall rails of their own (neon_ways_up.mjs): a body is held there, and nothing comes out for them. So with the little slopes inside the bridge: they lie
// outside the trial's zone.
function slopeLegs(arena) {
  const SREG = [-22, 27, 16, 60], SZONE = [-21.5, 26.5, 21.4, 49.0, 1.0, 19.5], DROP = 9.6, SAMPLE = 1, BODY = 2 * R, INSIDE = 3, NEAR = 12;
  // a body run outward from a place: where it comes to stand, and where it last stood before it went down
  const run = (x, z, h, nx, nz, sprint) => { const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const p = m.fighters.p1; for (const q of Object.values(m.fighters)) { q.hp = 1e9; q.invulnerableUntil = 0; }
    p.pos = { x, y: h + G, z }; p.floorY = p.pos.y; let now = 1000, last = { x, z }, down = null;
    for (let t = 0; t < 84 && !down; t += 1) { now += MS; m.tick = (m.tick ?? 0) + 1; const inp = emptyInput(); inp.moveX = nx; inp.moveZ = nz; if (sprint) { inp.boost = true; inp.sprintLocked = true; } tickMatch(m, { p1: inp, p2: emptyInput() }, now, DT, []);
      const feet = p.pos.y - G; if (feet <= h - DROP) down = { ...last }; else if (!p.airborne) last = { x: p.pos.x, z: p.pos.z }; }   // (2.4 m under where it set out, in the air or on a floor: it went down; where it last stood is where)
    return down; };
  // (nine run-ups, 0.5 m to 2.5 m: a kerb beside a ramp holds or lets pass by how the body meets it — at one place a sprint from 1.1 m went over and from 0.75 m and 1.5 m did not)
  const tried = (x, z, h, nx, nz) => { for (const ins of [2, INSIDE, 4, 4.5, 5, 6, 7, 8, 10]) { const sx = x - nx * ins, sz = z - nz * ins; const hs = P.groundHeightAt(sx, sz, arena.surfaces, h + 0.5); if (Math.abs(hs - h) > 1.6 || P.unitOverlapsObstacle(sx, hs + G, sz, arena.obstacles, R)) continue;
      for (const sprint of [false, true]) { const d = run(sx, sz, hs, nx, nz, sprint); if (d && (d.x - x) * nx + (d.z - z) * nz <= NEAR) return true; } } return false; };
  // the outer edge of the floor that goes on beside the side at its level
  const strip = (x, z, h, nx, nz) => { let hc = h, dE = 0, lo = h, hi = h; for (let d = 0.1; d <= 4.0001; d += 0.1) { const gh = P.groundHeightAt(x + nx * d, z + nz * d, arena.surfaces, hc); if (gh < hc - STEP - 0.01) break; hc = gh; dE = d; lo = Math.min(lo, gh); hi = Math.max(hi, gh); } return { d: dE >= 3.95 ? 0 : dE + (dE > 0 ? 0.05 : 0), lo, hi }; };
  const planes = arena.surfaces.filter((s) => s.type === 'plane' && s.maxX > AX(SREG[0]) && s.minX < AX(SREG[1]) && s.maxZ > AZ(SREG[2]) && s.minZ < AZ(SREG[3]) && Math.min(s.maxX - s.minX, s.maxZ - s.minZ) >= 2);
  let sraw = []; let samples = 0, opens = 0;
  for (const s of planes) { const alongX = Math.abs(s.gx) >= Math.abs(s.gz); const rise = alongX ? Math.abs(s.gx) * (s.maxX - s.minX) : Math.abs(s.gz) * (s.maxZ - s.minZ); if (rise < 1.2) continue;
    if (Math.min(Math.abs(s.gx), Math.abs(s.gz)) * (alongX ? s.maxZ - s.minZ : s.maxX - s.minX) > 0.4) continue;
    const mx = MX((s.minX + s.maxX) / 2), mz = MZ((s.minZ + s.maxZ) / 2), mh = s.heightAt((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2) / 4; if (mx < SZONE[0] || mx > SZONE[1] || mz < SZONE[2] || mz > SZONE[3] || mh < 0.5 || mh > SZONE[5]) continue;
    for (const side of (alongX ? [{ axis: 'x', c: s.minZ, n: -1, a: s.minX, b: s.maxX }, { axis: 'x', c: s.maxZ, n: 1, a: s.minX, b: s.maxX }] : [{ axis: 'z', c: s.minX, n: -1, a: s.minZ, b: s.maxZ }, { axis: 'z', c: s.maxX, n: 1, a: s.minZ, b: s.maxZ }])) {
      const hAt = (t) => side.axis === 'x' ? s.heightAt(t, side.c) : s.heightAt(side.c, t); const N = Math.max(1, Math.round((side.b - side.a) / SAMPLE)); const res = [];
      for (let i = 0; i <= N; i += 1) { const t = side.a + (side.b - side.a) * i / N; const hr = hAt(t); const [x, z, nx, nz] = side.axis === 'x' ? [t, side.c, 0, side.n] : [side.c, t, side.n, 0]; samples += 1;
        // (a floor of the same slope goes on beside this one: the side is no side — the ramp's other part is tried on its own)
        const beside = arena.surfaces.some((q) => q !== s && q.type === 'plane' && x + nx * 0.2 >= q.minX && x + nx * 0.2 <= q.maxX && z + nz * 0.2 >= q.minZ && z + nz * 0.2 <= q.maxZ && Math.abs(q.heightAt(x + nx * 0.2, z + nz * 0.2) - hr) < 0.6 && Math.min(q.maxX - q.minX, q.maxZ - q.minZ) >= 2);
        if (beside || !tried(x, z, hr, nx, nz)) { res.push({ t, hr, no: true }); continue; } const e = strip(x, z, hr, nx, nz); opens += 1; res.push({ t, hr, d: e.d, lo: Math.min(e.lo, hr), hi: Math.max(e.hi, hr) }); }
      for (let i = 0; i < res.length; i += 1) { if (!res[i].no || i === 0 || res[i - 1].no) continue; let j = i; while (j < res.length && res[j].no) j += 1; if (j >= res.length) break;   // (a stretch narrower than a body between two open ones is open too)
        if (res[j].t - res[i - 1].t <= BODY) for (let k = i; k < j; k += 1) res[k] = { t: res[k].t, hr: res[k].hr, d: Math.min(res[i - 1].d, res[j].d), lo: res[k].hr + Math.min(res[i - 1].lo - res[i - 1].hr, res[j].lo - res[j].hr), hi: res[k].hr + Math.max(res[i - 1].hi - res[i - 1].hr, res[j].hi - res[j].hr) }; i = j; }
      let cur = null; const flush = () => { if (cur && cur.length > 1) { const ds = cur.map((p) => p.d).sort((a, b) => a - b), d = ds[ds.length >> 1]; /* (the line: the frame's outer edge as most of the side has it. On the ramp's own side line the frame's strip lay OUTSIDE the rail: a bot stepped onto it past the rail's end, went up its steps and off — 22 falls by the dodge in 1,120 lives at one ramp) */ const up = Math.max(...cur.map((p) => p.hi - p.hr)), dn = Math.min(...cur.map((p) => p.lo - p.hr)); const t0 = Math.max(side.a, cur[0].t - 1.2), t1 = Math.min(side.b, cur[cur.length - 1].t + 1.2); /* (0.3 m more at each end, as far as the sloped floor goes: a body that slides along a rail goes round its end) */
          sraw.push({ axis: side.axis, c: side.c + side.n * d, n: side.n, from: t0, to: t1, h0: hAt(t0) + up, h1: hAt(t1) + up, lo0: hAt(t0) + dn, lo1: hAt(t1) + dn, wid: alongX ? s.maxZ - s.minZ : s.maxX - s.minX }); } cur = null; };
      for (const e of res) { if (!e.no) { (cur ??= []).push(e); } else flush(); } flush(); } }
  // one frame edge found from two floors: the one found from the wider floor is kept
  sraw.sort((a, b) => b.wid - a.wid); { const kept = []; for (const r of sraw) { if (kept.some((k) => k.axis === r.axis && k.n === r.n && Math.abs(k.c - r.c) <= 0.8 && Math.min(k.to, r.to) - Math.max(k.from, r.from) > 0.5 * (r.to - r.from))) continue; kept.push(r); } sraw = kept; }
  // the pieces of one side that follow one another are one rail of several legs, made to meet; a rail shorter than a body is none
  { const by = new Map(); for (const r of sraw) { const k = `${r.axis}|${r.n}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r); } const keep = [];
    for (const l of by.values()) { l.sort((a, b) => a.c - b.c || a.from - b.from); const used = new Set();
      for (let i = 0; i < l.length; i += 1) { if (used.has(i)) continue; const chain = [l[i]]; used.add(i); let grown = true; while (grown) { grown = false; for (let j = 0; j < l.length; j += 1) { if (used.has(j)) continue; const last = chain[chain.length - 1], first = chain[0];
            if (Math.abs(l[j].c - last.c) <= 2.4 && Math.abs(l[j].from - last.to) <= 1.2) { chain.push(l[j]); used.add(j); grown = true; } else if (Math.abs(l[j].c - first.c) <= 2.4 && Math.abs(l[j].to - first.from) <= 1.2) { chain.unshift(l[j]); used.add(j); grown = true; } } }
        if (chain[chain.length - 1].to - chain[0].from < BODY) continue; const c = chain.reduce((b, r) => (r.to - r.from > b.to - b.from ? r : b)).c;   // (one line for the whole rail: its longest leg's)
        for (let k = 0; k + 1 < chain.length; k += 1) { const u = chain[k], v = chain[k + 1]; const m = (u.to + v.from) / 2; const at = (r, t, a, b) => r[a] + (r[b] - r[a]) * (t - r.from) / (r.to - r.from);
          const uh = at(u, m, 'h0', 'h1'), ul = at(u, m, 'lo0', 'lo1'), vh = at(v, m, 'h0', 'h1'), vl = at(v, m, 'lo0', 'lo1'); u.to = m; u.h1 = Math.max(uh, vh); u.lo1 = Math.min(ul, vl); v.from = m; v.h0 = Math.max(uh, vh); v.lo0 = Math.min(ul, vl); }
        for (const r of chain) keep.push({ ...r, c }); } } sraw = keep; }
  const slopes = sraw.map((r) => ({ axis: r.axis, c: +r.c.toFixed(4), n: r.n, from: +r.from.toFixed(4), to: +r.to.toFixed(4), h0: +r.h0.toFixed(4), h1: +r.h1.toFixed(4), lo0: +r.lo0.toFixed(4), lo1: +r.lo1.toFixed(4) }));
  for (const [ax, c, end, at, to, why] of SLOPE_JOINTS) { const hit = slopes.filter((r) => r.axis === ax && Math.abs((ax === 'x' ? MZ(r.c) : MX(r.c)) - c) < 0.02 && Math.abs((ax === 'x' ? MX(r[end]) : MZ(r[end])) - at) < 0.08); if (hit.length !== 1) throw new Error(`the joint "${why}": ${hit.length} legs found with that end`);
    const r = hit[0], t = ax === 'x' ? AX(to) : AZ(to), k = (t - r.from) / (r.to - r.from); const on = (a0, a1) => +(a0 + (a1 - a0) * k).toFixed(4);   // (the leg's own two lines carried on)
    if (end === 'from') { r.h0 = on(r.h0, r.h1); r.lo0 = on(r.lo0, r.lo1); r.from = +t.toFixed(4); } else { r.h1 = on(r.h0, r.h1); r.lo1 = on(r.lo0, r.lo1); r.to = +t.toFixed(4); } }
  console.log(`sloped floors tried ${planes.length}, places tried ${samples}, open ${opens}: ${slopes.length} slope legs, ${slopes.reduce((s, r) => s + (r.to - r.from) / 4, 0).toFixed(1)} m along the ground`);
  const mdl = (v, ax) => +(ax === 'x' ? MX(v) : MZ(v)).toFixed(3);
  return slopes.map((r) => ({ axis: r.axis, c: +(r.axis === 'x' ? MZ(r.c) : MX(r.c)).toFixed(3), n: r.n, from: mdl(r.from, r.axis), to: mdl(r.to, r.axis), h0: +(r.h0 / 4).toFixed(3), h1: +(r.h1 / 4).toFixed(3), lo0: +(r.lo0 / 4).toFixed(3), lo1: +(r.lo1 / 4).toFixed(3) }));
}

const pieces = []; let posts = 0; const planned = flatRuns(arenaNow());
// THE TALL FENCE into the data, and its two copies for the model: the plan's two runs that are not hopped are its two pieces — the tool stops if they are not; a low rail
// that crosses a panel's band ends at the panel's near face (the strip's west rail, at the corner panel's north face)
const inTall = (r, t) => { const xm = r.axis === 'x' ? (r.from + r.to) / 2 : r.c, zm = r.axis === 'x' ? r.c : (r.from + r.to) / 2; return Math.abs(r.h - t.h) < 0.3 && xm >= t.x0 - 0.05 && xm <= t.x1 + 0.05 && zm >= t.z0 - 0.05 && zm <= t.z1 + 0.05; };
for (const t of TALL_FENCE) if (planned.filter((r) => r.noHop && inTall(r, t)).length !== 1) throw new Error(`the tall fence at ${t.name}: the plan has no one run there that is not hopped`);
if (planned.filter((r) => r.noHop).length !== TALL_FENCE.length) throw new Error('a run that is not hopped has no tall fence');
const model = planned.filter((r) => !r.noHop);
for (const r of model) for (const t of TALL_FENCE) { if (Math.abs(r.h - t.h) > 0.3 || r.axis !== 'z' || r.c < t.x0 - 0.1 || r.c > t.x1 + 0.1) continue; if (r.to > t.z0 && r.from < t.z0) r.to = t.z0; }
for (const r of model) for (const t of TALL_LEGS) { const [p0, p1] = tallLegBand(t); if (r.axis !== t.axis || r.c < p0 - 0.05 || r.c > p1 + 0.05 || r.h < Math.min(t.f0, t.f1) - 1 || r.h > Math.max(t.f0, t.f1) + 1) continue;   // (the deck's north rail at the ramp's top: it began under the panel's end)
  if (r.from >= t.from && r.from < t.to && r.to > t.to) r.from = t.to; else if (r.to <= t.to && r.to > t.from && r.from < t.from) r.to = t.from; }
for (const t of TALL_FENCE) D.obstacles.push(tallBox(t));
const tallSpec = TALL_FENCE.map((t) => ({ from: PANEL.from, suffix: t.suffix, pivot: [PANEL.x0, +(PANEL.base + GROUND).toFixed(4), PANEL.z0], scale: [1, 1, 1], turn: 90,   // (a quarter turn: the panel's length from its end post goes east, its depth north of the pivot)
  move: [+(t.x0 - PANEL.x0).toFixed(4), +(t.h - (PANEL.deck - PANEL.base) - PANEL.base).toFixed(4), +(t.z1 - PANEL.z0).toFixed(4)], clip: { axis: 'z', from: +(PANEL.z0 - 0.01).toFixed(4), to: +(PANEL.z0 + t.x1 - t.x0).toFixed(4) } }));
// THE FOOT PLATES (b1105ku; model metres: the run's axis, line, open side and floor; the line in the frame the plate goes in to). A run stands on its floor's outer
// edge, and a floor of the solid reading goes up to a quarter metre beyond the frame one sees (neon_frame_edges.mjs). The 12.59 m top platform's frame is blocks with
// their outer face at z 29.85 and x 17.43, lengths between them 13 cm and 10 cm farther in, and a corner cut slantwise: its north rail hangs 17 to 31 cm beside the
// frame, its east rail 7 to 17 cm, the post at the corner beyond the corner. The user, with those two rails picked: "this particular corner's mini fences also
// floats a bit in visual. Make them visually connect with the platform." Set on the frame they would take the platform's north row out of the route grid and its
// hops off that side with it (neon_frame_edges.mjs: why), so the rails stay where they are and each is given a plate under its feet: a flat box in the rail's own
// steel and in the rail's own object, from the rail's outer face in to a line inside the frame's face all along, its top 1.5 cm under the floor's line (under the
// frame's own top, which is the floor's: inside the frame the plate is not seen) and 9.5 cm thick (the frame is 20). No thicker: the page takes an object of the
// model for a thing that fades when its top stands 0.8 m over the floor at its foot (main.js fadeNodes, fadeTall 3.2), and the floor at its foot is the highest
// one no more than 0.125 m over the object's bottom. A rail is 0.75 m over its floor and never fades; with a plate 16.5 cm thick its bottom was 0.18 m under the
// floor's line, the floor at its foot was the grating's 12 cm lower, and the two rails faded with the walls. Nothing is written to the data for a plate: the
// floor it shows is there already, and a body's middle comes no nearer the rail than its radius, which is over the frame.
const FOOT_PLATES = [['x', 29.62, -1, 12.59, 30.00, 'the 12.59 m top platform\'s north rail'], ['z', 17.56, 1, 12.59, 17.32, 'the 12.59 m top platform\'s east rail']];
const PLATE_UNDER = 0.015, PLATE_DEEP = 0.11; const plated = [];
// 2. THE FLAT RUNS into the data and the pieces: a run is one box; in the model its posts and its bar
for (const [i, r] of model.entries()) { const p0 = r.n > 0 ? r.c - T : r.c, p1 = r.n > 0 ? r.c : r.c + T;   // (the band across: on the floor's side of the line)
  const box = r.axis === 'x' ? { minX: AX(r.from), maxX: AX(r.to), minZ: AZ(p0), maxZ: AZ(p1) } : { minX: AX(p0), maxX: AX(p1), minZ: AZ(r.from), maxZ: AZ(r.to) };
  D.obstacles.push({ minX: r4(box.minX), maxX: r4(box.maxX), minZ: r4(box.minZ), maxZ: r4(box.maxZ), minY: r4((r.h + HOLD_FROM) * 4), maxY: r4((r.h + TALL) * 4), topBuffer: BUFFER, noProjectile: true });
  const y0 = r.h + GROUND - FOOT, y1 = r.h + GROUND + TALL; const boxes = []; const B = (a0, a1, ya, yb) => boxes.push(r.axis === 'x' ? { min: [a0, ya, p0], max: [a1, yb, p1] } : { min: [p0, ya, a0], max: [p1, yb, a1] });
  const N = Math.max(1, Math.ceil((r.to - r.from - T) / PITCH)); for (let k = 0; k <= N; k += 1) { const a = r.from + (r.to - r.from - T) * k / N; B(a, a + T, y0, y1 - BAR); posts += 1; }
  B(r.from, r.to, y1 - BAR, y1);
  for (const [ax, c, n, h, inn, why] of FOOT_PLATES) { if (ax !== r.axis || n !== r.n || Math.abs(r.c - c) > 0.02 || Math.abs(r.h - h) > 0.1) continue; if (plated.includes(why)) throw new Error(`the foot plate of ${why}: two runs of the plan on that line`);
    const q0 = Math.min(r.c, inn), q1 = Math.max(r.c, inn), ya = r.h + GROUND - PLATE_DEEP, yb = r.h + GROUND - PLATE_UNDER; boxes.push(r.axis === 'x' ? { min: [r.from, ya, q0], max: [r.to, yb, q1] } : { min: [q0, ya, r.from], max: [q1, yb, r.to] }); plated.push(why); r.plate = [q0, q1]; }
  pieces.push({ name: `Rail_${String(i + 1).padStart(2, '0')}_${r.h.toFixed(2).replace('.', 'm')}`, h: r.h, boxes: boxes.map((b) => ({ min: b.min.map(r4), max: b.max.map(r4) })) }); }
if (plated.length !== FOOT_PLATES.length) throw new Error(`the foot plates: ${plated.length} of ${FOOT_PLATES.length} found their run in the plan`);
// 4. THE SLOPES' LEGS: the rail follows the slope. In the data a leg is a row of short boxes, each no longer than 0.5 m and rising no more than 0.25 m, from 0.25 m over the
// frame's lowest floor at its ends to the rail's top over its highest (a body anywhere on the frame's strip is held; a jump clears it as on the flat). In the model a leg is
// one object: upright posts no more than 2 m apart and a bar that leans with the slope.
const modelSlopes = slopeLegs(arenaNow()); let sBoxes = 0, sPosts = 0;
for (const [ax, c, n, from, to, h0, h1, lo, why] of SLOPE_MORE) { if (modelSlopes.filter((r) => r.axis === ax && r.n === n && Math.abs(r.c - c) < 0.02 && Math.abs(r.to - from) < 0.08).length !== 1) throw new Error(`the leg carried on "${why}": no one leg of the plan ends where it begins`);
  modelSlopes.push({ axis: ax, c, n, from, to, h0, h1, lo0: lo, lo1: lo, more: true }); }
// (a leg where the tall fence stands: the plan's own leg, found here and marked; its boxes and its copy of the panel instead of a low rail's)
for (const t of TALL_LEGS) { const legs = modelSlopes.filter((r) => r.axis === t.axis && r.n === t.n && Math.abs(r.c - t.c) < 0.02); if (legs.length !== 1 || Math.abs(legs[0].from - t.from) > 0.02 || Math.abs(legs[0].to - t.to) > 0.02) throw new Error(`the tall fence along ${t.name}: the plan has no one leg on that line from ${t.from} to ${t.to} (it has ${legs.map((r) => `${r.from}..${r.to}`).join(', ') || 'none'})`);
  if (t.axis !== 'x') throw new Error(`the tall fence along ${t.name}: a ramp that runs along z has its form in neon_ways_up.mjs (leantRail)`);
  const arena = arenaNow(), zin = t.c - t.n * (PANEL.depth + 0.3); for (const a of [t.from + 0.3, (t.from + t.to) / 2, t.to - 0.3]) { const fl = t.f0 + (t.f1 - t.f0) * (a - t.from) / (t.to - t.from), g = P.groundHeightAt(AX(a), AZ(zin), arena.surfaces, (fl + 0.5) * 4) / 4;   // (0.3 m in from the ends: a landing lies over the ramp's first 2 cm)
    if (Math.abs(g - fl) > 0.02) throw new Error(`the tall fence along ${t.name}: the ramp's floor at x ${a.toFixed(2)} is at ${g.toFixed(3)} m, not ${fl.toFixed(3)}`); }
  legs[0].tall = t; for (const b of tallLegBoxes(t)) D.obstacles.push(b);
  tallSpec.push({ from: PANEL.from, suffix: t.suffix, pivot: [PANEL.x0, +(PANEL.base + GROUND).toFixed(4), PANEL.z0], scale: [1, 1, +((t.to - t.from) / PANEL.len).toFixed(6)], turn: 90, rise: [+((t.f1 - t.f0) / (t.to - t.from)).toFixed(6), 0],   // (the panel made the leg's length, turned a quarter — its length east from the pivot, its depth north of it — and leant along x)
    move: [+(t.from - PANEL.x0).toFixed(4), +(t.f0 - (PANEL.deck - PANEL.base) - PANEL.base).toFixed(4), +(tallLegBand(t)[1] - PANEL.z0).toFixed(4)] }); }
// A LEG'S LINE SET BY HAND (b1105kv; model metres: the legs' axis, the line the plan has, the open side, the line they are set on). The west street ramp's north legs:
// the frame's beam there is 0.59 m wide with its outer face at z 32.374, the plan's line is 32.358, and the rail's outer 1.6 cm hung outside the beam's face, its posts'
// feet with it, 0.3 m down the beam's side. Set 3 cm farther in the rail stands on the beam. neon_frame_edges.mjs cuts the frame's boxes of that side back to the
// same line (the plan's own line does not follow them there), so the rail stays on the boxes' outer face.
const SLOPE_LINES = [['x', 32.36, -1, 32.39, 'the west street ramp\'s north side']];
for (const [ax, c, n, to, why] of SLOPE_LINES) { const legs = modelSlopes.filter((r) => r.axis === ax && r.n === n && Math.abs(r.c - c) < 0.02); if (!legs.length) throw new Error(`the line of ${why}: the plan has no leg at ${c}`); for (const r of legs) { r.c = to; r.moved = c; } }
// A LEG ON THE SLOPE'S OWN FLOOR, WITH A FOOT STRIP (b1105kv; model metres: the leg's axis, line and open side; the line in the frame its strip goes in to). The north
// way's ramp is one sloped floor 4 m wide in the data, x -10.31..-6.31, and its frame's side tubes have their outer faces at x -10.18 and -6.45: the two legs hung
// 7 and 8 cm beside the tubes. And the east leg's lower floor in the plan is a floor 0.84 m under the ramp, so its posts went down that far beside the ramp, their
// feet in the air under it, and its boxes with them. The user: "These two mini fences are slightly floating and there feet dangling in the air beneath the airborne
// slope." For the legs named here the lower floor is the ramp's own (posts and boxes begin at it), and the model has a strip from the rail's outer face in to the
// tube, leant with the slope, as thick and as far under the floor's line as a foot plate. The legs are not set on the tubes: the ramp's floor would be 14 cm
// narrower on each side, the route grid's places on it with it, and the legs would stand off the line of the rails they meet at the ramp's top.
const ON_SLOPE = [['z', -10.31, -1, -10.14, 'the north way\'s ramp, its west side'], ['z', -6.31, 1, -6.48, 'the north way\'s ramp, its east side']]; const stripped = [];
// A LEG ON A BEAM, ITS LAST POST ON A FOOT PLATE (b1105la, after b1105kz; b1105lb; model metres: the leg's axis, line and open side; where on the beam the foot plate
// begins, and it runs to the leg's lower end; the beam's top, either as how far it lies under the leg's floor line or as its own line, two places along and their heights
// over the street; the beam's inner face, which the foot plate goes in to; how thick the plate is; a name). The east street ramp's two legs run on to x 22.33,
// and their side beams' tops end before that: from x 22.09 the beam's end is cut aslant, and where the last post stands (x 22.27..22.33) the top's edge is 8 to 17 cm away
// from the post. The posts went down to the leg's lower floor, and the last one had 1.5 m (south) and 1.2 m (north) of post with nothing under it. The user, with the two
// circled: "Their bottom legs are dangling around in the air. Trim the visual." b1105kz set that post back onto the beam and left the bar as long ("i don't like that.
// trim the visual."), and a bar cut at the post would have left 33 cm of the leg's boxes with no rail one sees ("and i hate the invisible cbox as well. so adjust the mini
// fence visual to match the cbox."). So the leg in the model is as long as its boxes, a post at each end as on every leg, and what the last post stands on is made for
// it: a foot plate on the beam's top, from where the whole top ends to the leg's end and from the leg's outer face in to the beam's inner face, leant with the slope,
// 1.5 cm over the beam's top and 9.5 cm thick. The last post's foot is in the plate; the posts on the beam end 30 cm inside it (they went through it, 2 cm out of its
// underside on the south side). THE MODEL ONLY: the leg's boxes are what they were.
// (b1105lb: the west street ramp, of which the east one is the copy. The user: "Give the same treatment to the other ground/slope entrance." Its legs end where the
// beam's whole top does, x -14.96, since b1105ku and b1105kv, so the last post stands on the top; but the beam is a wedge there, 2 to 4 cm thick under the post's outer
// corner, and the post went on down to the leg's lower floor: 10 to 25 cm of it out of the beam's underside. The same plate and the same feet; the plate is 3 cm
// thick there, 1.5 cm over the top and 1.5 cm in, since one of 9.5 cm came out of the wedge's underside as the post had. The beam's top is given by its own line
// there, x -14.96 at 2.97 m and x -13.00 at 4.93 m, cut from the model: the plan's floor line for that leg is 7 to 11 cm low at its lower end.)
const ON_BEAM = [['x', 40.39, -1, 22.00, 0.232, 40.67, 0.095, 'the east street ramp\'s north leg'], ['x', 48.38, 1, 22.00, 0.232, 48.10, 0.095, 'the east street ramp\'s south leg'],
  ['x', 32.39, -1, -14.63, [-14.96, 2.97, -13.00, 4.93], 32.67, 0.03, 'the west street ramp\'s north leg'], ['x', 40.37, 1, -14.63, [-14.96, 2.97, -13.00, 4.93], 40.09, 0.03, 'the west street ramp\'s south leg']]; const beamed = [];
const BEAM_IN = 0.30, BEAM_PLATE_OVER = 0.015, BEAM_PLATE_FOOT = 0.01;
for (const r of modelSlopes) { if (r.tall) continue; const on = ON_SLOPE.filter(([ax, c, n]) => ax === r.axis && n === r.n && Math.abs(r.c - c) < 0.02); if (on.length) { r.lo0 = r.h0; r.lo1 = r.h1; r.strip = on[0]; stripped.push(on[0][4]); }
  const p0 = r.n > 0 ? r.c - T : r.c, p1 = r.n > 0 ? r.c : r.c + T; const len = r.to - r.from; const hi = (a) => r.h0 + (r.h1 - r.h0) * (a - r.from) / len, lo = (a) => r.lo0 + (r.lo1 - r.lo0) * (a - r.from) / len;
  const K = Math.max(1, Math.ceil(Math.max(len / 0.5, Math.abs(r.h1 - r.h0) / 0.25)));
  for (let k = 0; k < K; k += 1) { const a0 = r.from + len * k / K, a1 = r.from + len * (k + 1) / K; const box = r.axis === 'x' ? { minX: AX(a0), maxX: AX(a1), minZ: AZ(p0), maxZ: AZ(p1) } : { minX: AX(p0), maxX: AX(p1), minZ: AZ(a0), maxZ: AZ(a1) };
    D.obstacles.push({ minX: r4(box.minX), maxX: r4(box.maxX), minZ: r4(box.minZ), maxZ: r4(box.maxZ), minY: r4((Math.min(lo(a0), lo(a1)) + HOLD_FROM) * 4), maxY: r4((Math.max(hi(a0), hi(a1)) + TALL) * 4), topBuffer: BUFFER, noProjectile: true }); sBoxes += 1; }
  const boxes = [], hexa = []; const pt = (a, y, p) => (r.axis === 'x' ? [a, y, p] : [p, y, a]);
  const beam = ON_BEAM.find(([ax, c, n, at]) => ax === r.axis && n === r.n && Math.abs(r.c - c) < 0.02 && r.from < at && r.to > at); let set = 0; const lowTo = r.h1 < r.h0;   // (the leg's lower end: its 'to' or its 'from')
  const bTop = !beam ? null : Array.isArray(beam[4]) ? (a) => beam[4][1] + (beam[4][3] - beam[4][1]) * (a - beam[4][0]) / (beam[4][2] - beam[4][0]) : (a) => hi(a) - beam[4];
  const N = Math.max(1, Math.ceil((len - T) / PITCH)); for (let k = 0; k <= N; k += 1) { const a = r.from + (len - T) * k / N; const off = !!beam && (lowTo ? a + T > beam[3] + 1e-9 : a < beam[3] - 1e-9); if (off) set += 1;
    const yb = beam ? Math.min(bTop(a), bTop(a + T)) - (off ? BEAM_PLATE_FOOT : BEAM_IN) + GROUND : Math.min(lo(a), lo(a + T)) + GROUND - FOOT, yt = Math.min(hi(a), hi(a + T)) + GROUND + TALL - BAR * 0.5;
    boxes.push(r.axis === 'x' ? { min: [a, yb, p0], max: [a + T, yt, p1] } : { min: [p0, yb, a], max: [p1, yt, a + T] }); sPosts += 1; }
  const yA = hi(r.from) + GROUND + TALL, yB = hi(r.to) + GROUND + TALL;   // (the bar: a box sheared along the slope — upright ends, the top and the bottom parallel to the slope)
  hexa.push([pt(r.from, yA - BAR, p0), pt(r.to, yB - BAR, p0), pt(r.to, yB - BAR, p1), pt(r.from, yA - BAR, p1), pt(r.from, yA, p0), pt(r.to, yB, p0), pt(r.to, yB, p1), pt(r.from, yA, p1)].map((v) => v.map(r4)));
  if (r.strip) { const q0 = Math.min(r.c, r.strip[3]), q1 = Math.max(r.c, r.strip[3]), fA = hi(r.from) + GROUND, fB = hi(r.to) + GROUND;
    hexa.push([pt(r.from, fA - PLATE_DEEP, q0), pt(r.to, fB - PLATE_DEEP, q0), pt(r.to, fB - PLATE_DEEP, q1), pt(r.from, fA - PLATE_DEEP, q1), pt(r.from, fA - PLATE_UNDER, q0), pt(r.to, fB - PLATE_UNDER, q0), pt(r.to, fB - PLATE_UNDER, q1), pt(r.from, fA - PLATE_UNDER, q1)].map((v) => v.map(r4))); }
  if (beam) { if (set !== 1) throw new Error(`"${beam[7]}": ${set} posts on the foot plate, 1 looked for`); beamed.push(beam[7]);   // (the foot plate: a box sheared along the slope as the bar is)
    const E = lowTo ? r.to : r.from, a0 = Math.min(beam[3], E), a1 = Math.max(beam[3], E), q0 = Math.min(r.c, beam[5]), q1 = Math.max(r.c, beam[5]), tA = bTop(a0) + GROUND + BEAM_PLATE_OVER, tB = bTop(a1) + GROUND + BEAM_PLATE_OVER, D = beam[6];
    hexa.push([pt(a0, tA - D, q0), pt(a1, tB - D, q0), pt(a1, tB - D, q1), pt(a0, tA - D, q1), pt(a0, tA, q0), pt(a1, tB, q0), pt(a1, tB, q1), pt(a0, tA, q1)].map((v) => v.map(r4))); }
  pieces.push({ name: `Rail_${String(pieces.length + 1).padStart(2, '0')}_slope`, h: Math.min(r.h0, r.h1), boxes: boxes.map((b) => ({ min: b.min.map(r4), max: b.max.map(r4) })), hexa }); }
if (stripped.length !== ON_SLOPE.length) throw new Error(`the legs on a slope's own floor: ${stripped.length} of ${ON_SLOPE.length} found in the plan`);
if (beamed.length !== ON_BEAM.length) throw new Error(`the legs with a foot plate on their beam: ${beamed.length} of ${ON_BEAM.length} found in the plan`);
// 5. THE FLOORS BESIDE A LEG (b1105kq). A rail on a ramp's side has its boxes as every rail has, and bodies went through two of them at a walk: 17 walks of the bodies' scan
// through the east inner ramp's north leg (9 to 12 m down to the street), 11 through the leg beside the ramp east of the 8.6 m deck. What let them through is the frame
// beside the rail, not the rail. The frame's pieces are boxes in steps, and a box is a floor to the sim when a floor lies on ANY of its top (arena.js markFloorTops): such
// a box lets a body come onto it — and where its top has no floor the body sinks into the box, is held there from inside, and is put out at the box's nearest face
// (physics.js resolveUnitObstacleCollisions). Beside a rail the nearest face is the one under the rail: the body is set down a radius beyond it, past a rail 6 cm through,
// and the rail's own push takes it the rest of the way out. (A hold too tall for a jump on the rail changes nothing of it; thicker boxes are passed face to face.)
// So beside the legs named here every such top is given its floor: within 0.9 m inside the leg and a body's half-width beyond its ends, over each place where a box that
// is no wall has its top under what the leg holds and no more than a metre under the leg's lower floor, nothing stands on that top, and no floor lies within a step over
// it or 7 cm under it. A body then stands there, held by the rail.
// (b1105kt: the east inner ramp's north leg was the other of the two. The tall fence stands there now, and its boxes cover the frame's strip: no body comes onto it.)
const FLOORED = [['x', 47.62, 1, 'the leg beside the ramp east of the 8.6 m deck']];   // (the leg's axis, line and open side, model metres)
const railFloors = []; { const arena = arenaNow(); const WIDE = 0.9 * 4, PAST = R, ST = 0.2;
  for (const [ax, c, n, why] of FLOORED) { const legs = modelSlopes.filter((r) => r.axis === ax && r.n === n && Math.abs(r.c - c) < 0.02); if (!legs.length) throw new Error(`the floors beside "${why}": no leg of the plan on that line`);
    const a0 = Math.min(...legs.map((r) => r.from)), a1 = Math.max(...legs.map((r) => r.to));   // (model metres along)
    const lineAt = (a, k0, k1) => { const t = Math.min(a1, Math.max(a0, a)); const r = legs.find((q) => t >= q.from - 1e-6 && t <= q.to + 1e-6); return r[k0] + (r[k1] - r[k0]) * (t - r.from) / (r.to - r.from); }; const hiAt = (a) => lineAt(a, 'h0', 'h1'), loAt = (a) => lineAt(a, 'lo0', 'lo1');
    const U = ax === 'x' ? AX : AZ, V = ax === 'x' ? AZ : AX, M = ax === 'x' ? MX : MZ; const u0 = U(a0) - PAST, u1 = U(a1) + PAST, vIn = V(n > 0 ? c - T : c + T), v0 = Math.min(vIn, vIn - n * WIDE), v1 = Math.max(vIn, vIn - n * WIDE);
    const rect = (o) => (ax === 'x' ? [o.minX, o.maxX, o.minZ, o.maxZ] : [o.minZ, o.maxZ, o.minX, o.maxX]);   // (a box along and across the leg)
    const near = arena.obstacles.filter((o) => !isRail(o) && Number.isFinite(o.minX) && (() => { const [ua, ub, va, vb] = rect(o); return ub > u0 && ua < u1 && vb > v0 && va < v1; })());
    const marks = new Map();
    for (let u = u0 + ST / 2; u < u1; u += ST) for (let v = v0 + ST / 2; v < v1; v += ST) { const x = ax === 'x' ? u : v, z = ax === 'x' ? v : u; const holds = (hiAt(M(u)) + TALL) * 4 + BUFFER - G;   // (the feet the leg holds here, units)
      for (const o of near) { if (o.topBuffer == null) continue; const [ua, ub, va, vb] = rect(o); if (u < ua || u > ub || v < va || v > vb) continue; const top = o.maxY; if (top > holds - 0.4 || top < (loAt(M(u)) - 1) * 4) continue;
        if (near.some((q) => q !== o && x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ && q.minY <= top + 0.1 && q.maxY > top + 0.3)) continue;   // (a thing stands on it here)
        if (P.groundHeightAt(x, z, arena.surfaces, top) >= top - 0.3) continue;   // (a floor at its top, or one a step over it)
        if (!marks.has(o)) marks.set(o, []); marks.get(o).push([u, v]); } }
    for (const [o, pts] of marks) { const [ua, ub, va, vb] = rect(o); const ra = Math.max(ua, u0, Math.min(...pts.map((p) => p[0])) - ST / 2), rb = Math.min(ub, u1, Math.max(...pts.map((p) => p[0])) + ST / 2), rc = Math.max(va, v0, Math.min(...pts.map((p) => p[1])) - ST / 2), rd = Math.min(vb, v1, Math.max(...pts.map((p) => p[1])) + ST / 2);
      railFloors.push({ why, s: ax === 'x' ? { minX: r4(ra), maxX: r4(rb), minZ: r4(rc), maxZ: r4(rd), maxTop: o.maxY, type: 'flat', top: o.maxY, railFloor: true } : { minX: r4(rc), maxX: r4(rd), minZ: r4(ra), maxZ: r4(rb), maxTop: o.maxY, type: 'flat', top: o.maxY, railFloor: true } }); } }
  railFloors.sort((a, b) => a.s.minX - b.s.minX || a.s.minZ - b.s.minZ || a.s.top - b.s.top || a.s.maxX - b.s.maxX || a.s.maxZ - b.s.maxZ);
  for (let i = railFloors.length - 1; i > 0; i -= 1) if (JSON.stringify(railFloors[i].s) === JSON.stringify(railFloors[i - 1].s)) railFloors.splice(i, 1);   // (two boxes with one top at one place: one floor)
  for (const f of railFloors) D.surfaces.push(f.s); }
if (!process.env.LIST) { fs.writeFileSync(outF, JSON.stringify(D)); fs.writeFileSync(piecesF, JSON.stringify({ color: COLOR, pieces })); fs.writeFileSync(piecesF.replace(/\.json$/, '') + '_tall_spec.json', JSON.stringify(tallSpec)); }   // (LIST=1: the plan alone)
const side = (r) => `at ${r.axis === 'x' ? 'z' : 'x'} ${r.c.toFixed(2)}, open to ${r.n > 0 ? '+' : '-'}${r.axis === 'x' ? 'z' : 'x'}`;   // (model metres)
const lowLegs = modelSlopes.filter((r) => !r.tall);
for (const r of model) console.log(`  flat, floor ${r.h.toFixed(2)} m: ${r.axis} ${r.from.toFixed(2)}..${r.to.toFixed(2)} ${side(r)}${r.plate ? ` (a foot plate under it, ${r.axis === 'x' ? 'z' : 'x'} ${r.plate[0].toFixed(2)}..${r.plate[1].toFixed(2)})` : ''}`);
for (const t of TALL_FENCE) console.log(`  the tall fence at ${t.name}: x ${t.x0.toFixed(2)}..${t.x1.toFixed(2)} z ${t.z0.toFixed(2)}..${t.z1.toFixed(2)}, from ${t.h.toFixed(2)} to ${(t.h + PANEL.top - PANEL.deck).toFixed(2)} m, a wall`);
for (const r of modelSlopes) console.log(`  slope: ${r.axis} ${r.from.toFixed(2)}..${r.to.toFixed(2)} ${side(r)}, the lower floor ${r.lo0.toFixed(2)}..${r.lo1.toFixed(2)} m, the higher ${r.h0.toFixed(2)}..${r.h1.toFixed(2)} m${r.more ? ' (a leg carried on)' : ''}${r.moved != null ? ` (set by hand: the plan had it at ${r.moved.toFixed(2)})` : ''}${r.strip ? ' (on the slope\'s own floor, with a foot strip)' : ''}${r.tall ? ` (the tall fence, leant: ${tallLegBoxes(r.tall).length} wall boxes over the ramp's floor at ${r.tall.f0.toFixed(2)}..${r.tall.f1.toFixed(2)} m)` : ''}`);
for (const f of railFloors) console.log(`  floor beside ${f.why}: x ${MX(f.s.minX).toFixed(2)}..${MX(f.s.maxX).toFixed(2)} z ${MZ(f.s.minZ).toFixed(2)}..${MZ(f.s.maxZ).toFixed(2)}, ${(f.s.top / 4).toFixed(2)} m`);
console.log(`${model.length} flat runs, ${model.reduce((s, r) => s + r.to - r.from, 0).toFixed(1)} m: ${model.length} boxes, ${posts} posts, ${model.length} bars and ${plated.length} foot plates; ${lowLegs.length} slope legs, ${lowLegs.reduce((s, r) => s + r.to - r.from, 0).toFixed(1)} m along the ground: ${sBoxes} boxes, ${sPosts} posts and ${lowLegs.length} leaning bars; the tall fence: ${TALL_FENCE.length} panels and ${TALL_LEGS.length} leant along a ramp's side (${TALL_BOXES.length} boxes)`);
console.log(`${railFloors.length} floors beside ${FLOORED.length} legs, ${railFloors.reduce((s, f) => s + (f.s.maxX - f.s.minX) * (f.s.maxZ - f.s.minZ) / 16, 0).toFixed(2)} m2`);
console.log(process.env.LIST ? `listed alone: nothing written (${taken} rails, ${tallTaken} boxes of the tall fence and ${floorsTaken} floors of an earlier run in the file read)` : `${outF}: ${taken} rails, ${tallTaken} boxes of the tall fence and ${floorsTaken} floors of an earlier run out, ${model.length + sBoxes} rails, ${TALL_BOXES.length} boxes of the tall fence and ${railFloors.length} floors in, ${D.obstacles.length} boxes, ${D.surfaces.length} floors; ${piecesF}: ${pieces.length} pieces for the model, and the panels' spec beside it`);
