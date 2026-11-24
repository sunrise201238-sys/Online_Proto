// Neon's low rails (b1105ko; shared/tools/maps/neon_rails.mjs; user 2026-11-23, of a way to make a fight on the scaffold's platforms last, with a picture of Town's low
// railing: "how about the mini fences used in town?", "can you make these mini fences passable for bullets? both in town and neon.", "can the mini fences be mounted on
// the scaffolding slopes?", "edges already have scaffolding walls mounted do not need extra mini fences.", then with the places read off the game: "mini fence around here
// as well. (The slope inside the catwalk does not need mini fence.)", "mini fence at these three edges as well.", "No need mini fences at this one platform top."),
// against the installed data, on the server's sim: the rails are there and each stands on a floor's open edge; a walk, a sprint and a dodge are held at one and a jump
// clears it; the two pieces of the strip's south edge that no jump may clear, with the route grid's reason for it; rounds and a bot's sight pass; and where the user asked for none there is none. A reading
// of Neon's data made again from the model has no rail: the tool is run after neon_ways_up.mjs, and these fail until it has been. (What the rails do to a fight — how
// often a bot comes off a platform — was measured, not tested: the main README, b1105ko.)
// And the gaps (b1105kp; user, with two pictures of gaps in the walkway's rails, told of six more places like them: "Assess if there would be issue fencing them up. if
// no, implement in PT and 9.9"): at each of the eight a walk, a sprint and a dodge went off the platform; none does now, and a jump still clears every rail but two.
// And the frame beside two rails (b1105kq; user, told that the rails on three ramps' sides have their boxes as the others have and that what lets a body through is the
// frame's own boxes beside them, tops with no floor: "要不要照「補齊框架地板」做在 PT 和 9.9？ YES"; and of the rail that ended above its ramp's foot: "Implement, PT and
// 9.9"): the walks and dodges that went through the two rails are held, and a sprint down along the carried-on rail comes to stand on the deck.
// And the tall fence, a taller hold and the bin (b1105ks; user, of the two pieces of the strip's south edge that no jump cleared, shown where the unseen hold stood: "Can
// you use the higher version fence for these two spots then? I don't like invisible cbox here.", then of that fence on the PT site: "兩段改成高欄杆. make them unpassable
// for bullets, then update to 9.9"; of the rail a sprint off the deck above went over: "東側內斜坡那條的判定加高到約 1.2 公尺，外觀不變. Implement in PT and 9.9"; of a bin
// on the pavement: "Also remove this garbage can stuff visually and physically.", "垃圾桶移除. To 9.9"): the two panels are walls to a body, to the route grid, to a round
// and to a bot's sight; the sprints are held and a jump still clears that rail; the bin's place is walked through.
// And the fence along a ramp (b1105kt; user, with a box of that rail picked on the page, #8246: "I believe this is the piece of mini fence which you raised its cbox
// height. Remove this piece of fence visually and physically. Then replace it with the higher version fence, the one that also blocks bullets. PT and 9.9"): the low
// rail of the east inner ramp's north side is gone and the tall fence stands there, leant with the ramp — a wall to a body, to a round and to a bot's sight.
// And a rail set on the frame one sees, and one taken away (b1105ku; user, with a box of each picked on the page — #8315, the west street ramp's south side: "This mini
// fence is visually floating in the air. make sure it visually connects with the platform slope."; #8236, the top of the west inner ramp's south frame: "Remove this
// mini fence visually and physically."): the frame's boxes of that ramp's south side end at the tube one sees and the rail stands on it, holding a walk, a sprint and a
// dodge as it did; the other rail is gone, and a walk up its strip goes off the strip's end. And of the 12.59 m top platform's north and east rails (#8213, #8222):
// "this particular corner's mini fences also floats a bit in visual. Make them visually connect with the platform." — those two stay where they stand, with the
// route grid's row of places at them, and are joined to the frame in the model alone.
import '../tools/maps/arena_files.mjs';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt } from '../src/sim/index.js';
import { navGridFor, botHasLineOfSight } from '../src/sim/ai.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4, MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37;   // (Neon: the model's metres and the arena's units)
// a rail in the data: it holds a body alone, has the hold a rail is given and is 6 cm through (neon_rails.mjs: no key of its own)
const isRail = (o) => o.noProjectile === true && o.topBuffer === 2 && Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < 0.241;
const long = (o) => Math.max(o.maxX - o.minX, o.maxZ - o.minZ) / 4;
// A body set down at a place (model metres; its feet on the floor there) and walked at a point for a time, whatever stands in the way: a walk, a sprint, a walk with a
// dodge in it, or a walk with a jump at a tick. Where it ends.
function pushed(start, at, how = 'walk', jumpAt = -1, ticks = 150) {
  const a = getArena('neon'); const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, e = m.fighters.p2; for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
  e.pos = { x: -200, y: G, z: 0 }; e.floorY = G;   // (the other body far off)
  const floor = groundHeightAt(AX(start[0]), AZ(start[1]), a.surfaces, start[2] * 4 + 2);
  f.pos = { x: AX(start[0]), y: floor + G, z: AZ(start[1]) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
  let now = 1000;
  for (let n = 0; n < ticks; n += 1) {
    const dx = AX(at[0]) - f.pos.x, dz = AZ(at[1]) - f.pos.z, d = Math.hypot(dx, dz) || 1; const inp = { ...emptyInput(), moveX: dx / d, moveZ: dz / d };
    if (how === 'sprint') { inp.boost = true; inp.sprintLocked = true; } if (how === 'dodge' && n === 5) inp.stepTap = true; if (n === jumpAt) inp.jump = true;
    now += MS; tickMatch(m, { p1: inp }, now, DT);
  }
  return { x: MX(f.pos.x), z: MZ(f.pos.z), feet: (f.pos.y - G) / 4, floor: floor / 4 };
}
// The same body, and the greatest single fall of its run: from where it left the ground to where it came down, in metres (0: it never left the ground).
function fell(start, at, how = 'walk', jumpAt = -1, ticks = 150) { return ran(start, at, how, jumpAt, ticks).fall; }
// (and where the run ends: the body's place and its feet, model metres)
function ran(start, at, how = 'walk', jumpAt = -1, ticks = 150) {
  const a = getArena('neon'); const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, e = m.fighters.p2; for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
  e.pos = { x: -200, y: G, z: 0 }; e.floorY = G;
  const floor = groundHeightAt(AX(start[0]), AZ(start[1]), a.surfaces, start[2] * 4 + 2);
  f.pos = { x: AX(start[0]), y: floor + G, z: AZ(start[1]) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
  const dx = AX(at[0]) - f.pos.x, dz = AZ(at[1]) - f.pos.z, d = Math.hypot(dx, dz) || 1; let now = 1000, left = null, last = floor, most = 0;   // (one heading for the whole run)
  for (let n = 0; n < ticks; n += 1) {
    const inp = { ...emptyInput(), moveX: dx / d, moveZ: dz / d }; if (how === 'sprint') { inp.boost = true; inp.sprintLocked = true; } if (how === 'dodge' && n === 5) inp.stepTap = true; if (n === jumpAt) inp.jump = true;
    now += MS; tickMatch(m, { p1: inp }, now, DT);
    const feet = f.pos.y - G; if (f.airborne) { if (left == null) left = last; } else { if (left != null) most = Math.max(most, left - feet); left = null; last = feet; }
  }
  return { fall: most / 4, x: MX(f.pos.x), z: MZ(f.pos.z), feet: (f.pos.y - G) / 4 };
}
// A unit pinned at a place (model metres, the feet's height) holds the trigger on a unit pinned at another for six seconds: the damage done.
function shot(from, to) {
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const a = m.fighters.p1, b = m.fighters.p2;
  for (const q of [a, b]) { q.hp = 1e9; q.invulnerableUntil = 0; }
  a.pos = { x: AX(from[0]), y: from[2] * 4 + G, z: AZ(from[1]) }; b.pos = { x: AX(to[0]), y: to[2] * 4 + G, z: AZ(to[1]) }; a.floorY = a.pos.y; b.floorY = b.pos.y; a.targetId = 'p2'; b.targetId = 'p1';
  const a0 = { ...a.pos }, b0 = { ...b.pos }, hp0 = b.hp; let now = 1000; const inp = { ...emptyInput(), shootHold: true };
  for (let k = 0; k < 6000 / MS; k += 1) {
    now += MS; m.tick = (m.tick ?? 0) + 1; tickMatch(m, { p1: inp, p2: emptyInput() }, now, DT, []);
    for (const [q, q0] of [[a, a0], [b, b0]]) { q.pos.x = q0.x; q.pos.y = q0.y; q.pos.z = q0.z; q.vel.x = q.vel.y = q.vel.z = 0; q.airborne = false; }
  }
  return Math.round(hp0 - b.hp);
}
// (what a thing would be if the rails stopped a round as a plain box does: the flag off for the time of one reading, then on again)
function withSolidRails(read) { const rails = getArena('neon').obstacles.filter(isRail); for (const o of rails) o.noProjectile = false; try { return read(); } finally { for (const o of rails) o.noProjectile = true; } }

test('the rails are in the data: 26 runs along the flat floors\' open edges and 14 legs along the ramps\' sides, 6 cm through, every one a box that holds a body alone', () => {
  const a = getArena('neon'); const rails = a.obstacles.filter(isRail); const flat = rails.filter((o) => long(o) > 0.55), slope = rails.filter((o) => long(o) <= 0.55);   // (a run is a body's width long or more; a leg is a row of boxes half a metre long or less)
  assert.equal(flat.length, 26, 'the flat floors\' runs, a box each');
  assert.equal(slope.length, 133, 'the boxes of the ramps\' legs');
  assert.ok(Math.abs(flat.reduce((s, o) => s + long(o), 0) - 177.2) < 0.1 && Math.abs(slope.reduce((s, o) => s + long(o), 0) - 34.9) < 0.1, `177.2 m on the flat and 34.9 m along the ramps: ${flat.reduce((s, o) => s + long(o), 0).toFixed(1)} and ${slope.reduce((s, o) => s + long(o), 0).toFixed(1)}`);
  for (const o of rails) assert.ok(Math.abs(Math.min(o.maxX - o.minX, o.maxZ - o.minZ) - 0.24) < 1e-6, 'a rail is 6 cm through');
  // a flat run: from 0.25 m over its floor to 0.75 m over it, the floor on one side of it (read 0.3 m off the rail; a deck and the frame tops in it lie within 0.25 m of each
  // other) and on the other a drop of 2.4 m or more within a body's width (read 0.3 m and 0.6 m off the rail: the sign's top under the walkway's inner corner lies between),
  // at three places along it
  for (const o of flat) {
    assert.ok(Math.abs(o.maxY - o.minY - 2) < 1e-6, 'a flat run holds from 0.25 m to 0.75 m over its floor');
    const alongX = o.maxX - o.minX > o.maxZ - o.minZ, cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2, h = o.minY - 1;
    for (const t of [0.15, 0.5, 0.85]) {
      const px = alongX ? o.minX + (o.maxX - o.minX) * t : cx, pz = alongX ? cz : o.minZ + (o.maxZ - o.minZ) * t;
      const at = (n, d) => groundHeightAt(px + (alongX ? 0 : n * d), pz + (alongX ? n * d : 0), a.surfaces, h + 2);
      const floor = (n) => Math.abs(at(n, 1.2) - h) <= 1, drop = (n) => [1.2, 2.4].some((d) => at(n, d) <= h - 9.6);
      assert.ok((floor(-1) && drop(1)) || (floor(1) && drop(-1)), `the run at model (${MX(px).toFixed(2)}, ${MZ(pz).toFixed(2)}), floor ${(h / 4).toFixed(2)} m, stands on an open edge: ${(at(-1, 1.2) / 4).toFixed(2)} m and ${(at(-1, 2.4) / 4).toFixed(2)} m on one side, ${(at(1, 1.2) / 4).toFixed(2)} m and ${(at(1, 2.4) / 4).toFixed(2)} m on the other`);
    }
  }
  assert.equal(a.obstacles.filter((o) => o.noProjectile === true && (o.topBuffer === 12 || o.topBuffer === 4.25)).length, 0, 'no rail with a hold of its own (b1105kn to b1105kq had two that no jump cleared, b1105ks a leg held to 1.20 m: the tall fence stands at all three)');
});

test('a walk, a sprint and a dodge are held at a rail and a jump clears it — on a deck, on the south way\'s walkway and at two edges of the strip, from the places the user read off the game', () => {
  // (from, toward; the edge's line in model metres and the side the floor lies on)
  const CASES = [
    ['the 5.78 m deck\'s south edge', [6, 46.8, 5.78], [6, 52], 'z', 48.12, -1],
    ['the walkway\'s east edge, from "x 15.03 z 54.21 feet 21.88 m"', [15.03, 54.21, 21.88], [20, 54.21], 'x', 17.43, -1],
    ['the walkway\'s north edge', [11, 55.2, 21.88], [11, 50], 'z', 53.75, 1],
    ['the strip\'s west edge, from "x -6.31 z 23.33 feet 21.44 m"', [-6.31, 23.33, 21.44], [-10, 23.6], 'x', -7.19, 1],
    ['the strip\'s east edge, from "x 7.60 z 22.95 feet 21.24 m"', [7.60, 22.95, 21.24], [11, 22.75], 'x', 8.06, -1],
  ];
  for (const [name, from, at, axis, line, side] of CASES) {
    for (const how of ['walk', 'sprint', 'dodge']) {
      const r = pushed(from, at, how);
      assert.ok(r.feet > r.floor - 0.3 && (r[axis] - line) * side > 0, `${name}, a ${how}: the body is held on the floor (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`);
    }
    const j = pushed(from, at, 'walk', 20);
    assert.ok(j.feet < j.floor - 2.4 && (j[axis] - line) * side < 0, `${name}, a jump: the body is over the rail and down (${j.x.toFixed(2)}, ${j.z.toFixed(2)}) feet ${j.feet.toFixed(2)} m`);
  }
});

// THE GAPS (b1105kp). b1105ko's rails had eight places where a body that walked, sprinted or dodged at the edge went down: two the user saw in the game (the walkway's inner
// corner; the east end of the gap in front of the pillar, where the wall draws back from the walkway) and six found by walking bodies off every place of the platforms.
// Why the plan had left each is in neon_rails.mjs: a wall it took for one that holds (the pillar's east end, the first top platform's notch), the sign's top it took for
// ground (the inner corner), a stretch it took for a sliver (the strip's south-west corner), and joints it has no rule for (the window's jamb, the east ramp's top, the top
// of the west inner ramp's frame). Before: each of these runs came down 2.4 m to 21.7 m lower.
// (b1105ku: the rail on the top of the west inner ramp's frame is gone by the user's word, and its case with it: the test of b1105ku, below.)
test('the gaps are closed: at the walkway\'s inner corner and by its pillar (the user\'s two pictures), at the window\'s jamb, on the first top platform\'s north side, at the strip\'s south-west corner and at the east ramp\'s top, a walk, a sprint and a dodge stay up, and a jump still clears the rail', () => {
  // (from, toward; hops: a jump clears this rail — at the strip's south-west corner the tall fence stands, below)
  const GAPS = [
    ['the walkway\'s inner corner, westward (the second picture)', [15.0, 52.8, 21.88], [9.0, 52.8], true],
    ['the walkway\'s inner corner, northward', [13.25, 55.5, 21.88], [13.25, 49.0], true],
    ['the walkway\'s inner corner, across it', [15.0, 55.5, 21.88], [11.5, 51.5], true],
    ['the east end of the gap in front of the pillar (the first picture)', [14.3, 56.0, 21.88], [14.3, 62.0], true],
    ['the last east window\'s jamb, from the sill', [8.4, 56.5, 21.80], [9.6, 60.1], true],
    ['the last east window\'s jamb, from the little slope', [7.06, 56.87, 21.05], [10.06, 59.87], true],
    ['the first top platform\'s notch', [-8.3, 23.4, 12.59], [-8.3, 18.0], true],
    ['the first top platform\'s north-west corner', [-8.94, 22.87, 12.59], [-12.0, 19.8], true],
    ['the strip\'s south-west corner', [-5.94, 23.12, 21.44], [-8.9, 26.1], false],
    ['the deck at the east ramp\'s top', [18.06, 40.87, 5.78], [21.8, 39.3], true],
  ];
  for (const [name, from, at, hops] of GAPS) {
    for (const how of ['walk', 'sprint', 'dodge']) { const d = fell(from, at, how); assert.ok(d < 1, `${name}, a ${how}: the body stays up (its greatest fall ${d.toFixed(2)} m)`); }
    if (hops) { const d = fell(from, at, 'walk', 20); assert.ok(d >= 2.4, `${name}, a jump: over the rail and down (${d.toFixed(2)} m)`); }
  }
  // (the east ramp's north leg carried up to the deck: a walk and a dodge off the frame's first step are held; a sprint slides down the frame along the leg and over it lower down,
  // as at every ramp's side — the rail is 0.75 m tall)
  for (const how of ['walk', 'dodge']) { const d = fell([19.6, 40.75, 5.02], [19.6, 36.0], how); assert.ok(d < 1, `the east ramp's frame by the deck, a ${how}: the body stays up (${d.toFixed(2)} m)`); }
});

// THE FRAME BESIDE TWO RAILS (b1105kq). A rail on a ramp's side has its boxes as every rail has, and bodies went through two of them at a walk: the east inner ramp's north
// leg (9 to 12 m down to the street beyond it) and the leg beside the ramp east of the 8.6 m deck. The frame beside the rail let them: its pieces are boxes in steps, a box is
// a floor to the sim when a floor lies on any of its top, and where its top had no floor a body that came onto it sank into the box and was put out at the box's nearest
// face — the one under the rail, a rail 6 cm through. neon_rails.mjs gives every such top beside those two legs its floor (19 floors, written with `railFloor`: the one key
// of its own that the tool writes, read here off the file — the sim keeps a floor's own keys alone). Before: each of these runs came down 2.9 m to 11.2 m lower.
// (b1105kt: the first of the two legs is the tall fence now, whose boxes cover the frame's strip — its eleven floors are gone with its rail, and its runs are held by
// the fence: the test of the fence, below.)
const heading = (from, deg) => [from[0] + 10 * Math.cos(deg * Math.PI / 180), from[1] + 10 * Math.sin(deg * Math.PI / 180)];   // (a point 10 m off at a heading, as the bodies' scan ran them)
test('the frame beside a rail has its floors: the walks and dodges that went through the rail beside the ramp east of the 8.6 m deck are held on the frame', () => {
  const D = JSON.parse(fs.readFileSync(new URL('../../client/public/maps/neon_data.json', import.meta.url), 'utf8')); const floors = D.surfaces.filter((q) => q.railFloor === true);
  assert.equal(floors.length, 8, 'the floors written beside the leg');
  for (const q of floors) {   // (each lies on the top of a box that is no wall, within 0.9 m inside the leg and a body's half-width beyond its ends)
    assert.ok(q.type === 'flat' && q.top === q.maxTop, 'a flat floor');
    assert.ok(D.obstacles.some((o) => o.topBuffer != null && o.maxY === q.top && o.minX <= q.minX + 0.011 && o.maxX >= q.maxX - 0.011 && o.minZ <= q.minZ + 0.011 && o.maxZ >= q.maxZ - 0.011), `the floor at model (${MX(q.minX).toFixed(2)}, ${MZ(q.minZ).toFixed(2)}), ${(q.top / 4).toFixed(2)} m, lies on a box's top`);
    const x0 = MX(q.minX), x1 = MX(q.maxX), z0 = MZ(q.minZ), z1 = MZ(q.maxZ);
    assert.ok(x0 >= 10.52 && x1 <= 16.36 && z0 >= 46.65 && z1 <= 47.57, `the floor at model (${x0.toFixed(2)}..${x1.toFixed(2)}, ${z0.toFixed(2)}..${z1.toFixed(2)}) lies beside the leg`);
  }
  // (from, the heading in degrees, how; the body must end north of z 48.0: south of it is the street beyond the leg's deck)
  const RUNS = [
    ['the ramp east of the 8.6 m deck, down it and south', [12.06, 44.87, 7.65], 68, 'walk'], ['the ramp east of the 8.6 m deck, across it', [14.06, 44.87, 6.70], 113, 'walk'], ['the ramp east of the 8.6 m deck, down it and south, lower', [13.06, 45.87, 7.17], 68, 'walk'],
    ['the ramp east of the 8.6 m deck, a dodge south-east', [11.06, 45.87, 8.12], 45, 'dodge'], ['the ramp east of the 8.6 m deck, south-east to the deck\'s edge', [12.06, 46.87, 7.65], 45, 'walk'],
  ];
  for (const [name, from, deg, how] of RUNS) { const r = ran(from, heading(from, deg), how);
    assert.ok(r.fall < 1.2 && r.z < 48.0, `${name}, a ${how}: the body is held on the ramp's side (its greatest fall ${r.fall.toFixed(2)} m, it ends at (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m)`); }
});

// THE LEG CARRIED ON (b1105kq). The leg beside the ramp east of the 8.6 m deck ended where the frame beside the ramp is still 0.64 m over the 5.78 m deck: a body that
// sprinted down along it came round its end 0.9 m over the deck and was over the deck's own rail, half a metre on, before it was down — 16 sprints of the bodies' scan
// went to the street, 6.6 m. Carried on to the frame's end the leg lets the body down onto the deck, where the deck's rail holds it. (A sprint off a platform over a rail
// that goes down with a ramp is over it still, at this ramp and at the others: the rail is 0.75 m tall.)
test('the leg beside the ramp east of the 8.6 m deck goes on to the frame\'s end, and a sprint down along it comes to stand on the 5.78 m deck behind the deck\'s rail', () => {
  const more = getArena('neon').obstacles.filter((o) => isRail(o) && MZ(o.minZ) > 47.55 && MZ(o.maxZ) < 47.63 && MX(o.minX) > 15.12 && MX(o.maxX) < 16.07);
  assert.ok(more.length >= 2 && Math.abs(more.reduce((s, o) => s + long(o), 0) - 0.93) < 0.02, `the leg's boxes from x 15.13 to 16.06: ${more.length}, ${more.reduce((s, o) => s + long(o), 0).toFixed(2)} m`);
  for (const [from, ticks] of [[[10.06, 44.87, 8.64], 90], [[9.06, 45.87, 8.64], 100], [[11.06, 43.87, 8.12], 80]]) { const r = ran(from, heading(from, 45), 'sprint', -1, ticks);
    assert.ok(r.fall < 1.2 && Math.abs(r.feet - 5.78) < 0.03 && r.x > 16.06 && r.z < 48.06, `a sprint south-east from (${from[0]}, ${from[1]}): on the deck behind its rail after ${ticks} ticks (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m, its greatest fall ${r.fall.toFixed(2)} m`); }
});

// THE TALL FENCE (b1105ks). Two pieces of the strip's south edge must not be jumped. The first, 2.1 m between the north way's platform and the wall at the bridge's end,
// is where a bot that comes out of the bridge walked off to the decks 12.6 m below (the user's case of b1105kl: neon_ways.test.js, a bot in the bridge and its target
// under the strip). A rail a jump clears is a lip to the route grid: the drop over it stays in the grid, a route's last step is walked and never jumped (nbrain.js
// truncateAtFiringPoint — the bots' own rule, on every map, not touched), so the bot stood held at the rail: that test failed, and a scan of 438 runs from the bridge to
// the decks went from 20 that never arrive to 44. The second, 0.9 m at the strip's south-west corner between its west rail and the platform's fence, is the same: left
// open, a bot walked off it; closed with a rail a jump clears, the bot stood at it (31 of 438).
// b1105kn to b1105kq closed both with a low rail under a hold 3 m tall, which is not seen; the user, shown the two: "I don't like invisible cbox here." Now the scaffold's
// own fence panel stands at each, 2.61 m tall, as along the platform beside them, and is a wall as those are: to a body, to the route grid, and — "make them unpassable
// for bullets" — to a round and a bot's sight.
const PANELS = [['the strip\'s south-west corner', -7.19, -6.31], ['the strip\'s south edge between the platform and the bridge', -2.31, -0.19]];   // (model x; each at z 24.03..24.62, from the strip's floor at 21.24 m to 23.85 m)
const panelBoxes = () => getArena('neon').obstacles.filter((o) => PANELS.some(([, x0, x1]) => Math.abs(MX(o.minX) - x0) < 0.01 && Math.abs(MX(o.maxX) - x1) < 0.01 && Math.abs(MZ(o.minZ) - 24.03) < 0.01 && Math.abs(MZ(o.maxZ) - 24.62) < 0.01));
// (what would be if the panels let a round pass, as the low rail that stood there did: the flag on for the time of one reading)
function withOpenPanels(read) { const ps = panelBoxes(); for (const o of ps) o.noProjectile = true; try { return read(); } finally { for (const o of ps) delete o.noProjectile; } }

test('the tall fence stands at the two pieces of the strip\'s south edge: a wall each with no low rail in its opening, and no walk, sprint, dodge or jump takes a body past it', () => {
  const a = getArena('neon'); const ps = panelBoxes(); assert.equal(ps.length, 2, 'the two panels');
  for (const o of ps) assert.ok(o.topBuffer == null && o.noProjectile == null && Math.abs(o.minY / 4 - 21.24) < 0.01 && Math.abs(o.maxY / 4 - 23.851) < 0.01, 'a panel is a wall from the strip\'s floor to 2.61 m over it');
  const rails = a.obstacles.filter(isRail); const onStrip = (o) => o.minY / 4 > 21 && o.minY / 4 < 22;
  for (const [name, x0, x1] of PANELS) assert.equal(rails.filter((o) => { const x = MX((o.minX + o.maxX) / 2), z = MZ((o.minZ + o.maxZ) / 2); return onStrip(o) && x > x0 && x < x1 && z > 24.0 && z < 24.7; }).length, 0, `no low rail at ${name}`);
  const west = rails.filter((o) => onStrip(o) && Math.abs(MX(o.minX) + 7.19) < 0.01 && MZ(o.minZ) < 24);
  assert.ok(west.length === 1 && Math.abs(MZ(west[0].maxZ) - 24.03) < 0.01, 'the strip\'s west rail ends at the corner panel\'s north face');
  // (southward at each panel; from the way's platform into the corner; slantwise at the south panel. The jumps: early, in the air as the body comes to the panel, and late, at
  // it. Into the corner a jump goes over the west rail beside the panel, as it may: no jump there.)
  const RUNS = [['the south-west panel, southward', [-6.72, 23.3, 21.24], [-6.72, 27.0], true], ['the south panel, southward at "x -1.35 z 24.14 feet 21.24 m"', [-1.35, 23.3, 21.24], [-1.35, 27.0], true],
    ['the south-west panel, from the way\'s platform into the corner', [-5.94, 23.12, 21.44], [-8.9, 26.1], false], ['the south panel, slantwise east', [-2.0, 23.2, 21.24], [0.5, 26.5], true]];
  for (const [name, from, at, jumps] of RUNS) for (const [how, jumpAt] of [['walk', -1], ['sprint', -1], ['dodge', -1], ...(jumps ? [['walk', 2], ['walk', 5], ['walk', 8], ['walk', 14], ['walk', 20], ['walk', 26], ['sprint', 2], ['sprint', 5], ['sprint', 14]] : [])]) {
    const r = ran(from, at, how, jumpAt);
    assert.ok(r.fall < 1 && r.z < 24.03 && r.feet > 21.2, `${name}, a ${how}${jumpAt >= 0 ? ` with a jump at tick ${jumpAt}` : ''}: the body stands on the strip north of the panel (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m, its greatest fall ${r.fall.toFixed(2)} m`);
  }
  const w = fell([-6.31, 23.33, 21.44], [-10, 23.6], 'walk', 20); assert.ok(w >= 2.4, `a jump at the west rail beside the corner panel goes over and down (${w.toFixed(2)} m)`);
});

test('the route grid has no way past a panel: no link from the strip crosses one, and none goes from the strip behind the south panel to a floor more than 3 m under it', () => {
  const g = navGridFor(getArena('neon')); let nodes = 0; const across = [], down = []; const crosses = (xc) => PANELS.some(([, x0, x1]) => xc >= x0 && xc <= x1);
  for (let i = 0; i < g.N; i += 1) {
    const x = MX(g.posX[i]), z = MZ(g.posZ[i]), f = g.floor[i] / 4; if (f < 21.0 || f > 21.6 || z > 24.62 || x < -7.6 || x > 0.4 || z < 22.3) continue;   // (the strip's floor behind the panels)
    nodes += 1;
    for (let k = g.linkStart[i]; k < g.linkStart[i + 1]; k += 1) { const j = g.linkAdj[k], x1 = MX(g.posX[j]), z1 = MZ(g.posZ[j]); const to = `(${x.toFixed(2)}, ${z.toFixed(2)}) to (${x1.toFixed(2)}, ${z1.toFixed(2)} | ${(g.floor[j] / 4).toFixed(2)})`;
      if (x >= -2.6 && x <= 0.2 && g.floor[j] < g.floor[i] - 12) down.push(to);
      if (z1 > 24.03 && crosses(x + (x1 - x) * (24.03 - z) / (z1 - z))) across.push(to); }   // (a link whose straight line crosses a panel's north face)
    for (let k = g.walkStart[i]; k < g.walkStart[i + 1]; k += 1) { const j = g.walkAdj[k]; if (MZ(g.posZ[j]) > 24.04 && crosses(MX(g.posX[j]))) across.push(`a walk from (${x.toFixed(2)}, ${z.toFixed(2)}) into a panel`); }
  }
  assert.ok(nodes >= 6, `the strip has its places behind the panels (${nodes})`);
  assert.equal(across.length, 0, `links from the strip across a panel: ${across.slice(0, 4).join('; ')}`);
  assert.equal(down.length, 0, `links from the strip behind its south panel to a floor more than 3 m under it: ${down.slice(0, 4).join('; ')}`);
});

test('a panel of the tall fence stops rounds both ways and a bot\'s sight: what the low rail that stood there let pass', () => {
  // (the shooter on the strip behind the panel, its target south of it and lower: the line between them goes through the panel alone, as the reading with the panels open shows)
  const a = getArena('neon'), EYE = C.BOT_LOS_EYE_HEIGHT; const eye = (p) => ({ x: AX(p[0]), y: p[2] * 4 + G + EYE, z: AZ(p[1]) });
  for (const [name, up, dn] of [['the south panel', [-1.25, 23.0, 21.24], [-1.25, 27.2, 19.6]], ['the south-west panel', [-6.75, 23.0, 21.24], [-6.75, 27.2, 19.6]]]) {
    assert.equal(shot(up, dn), 0, `${name}: no round arrives down through it`); assert.equal(shot(dn, up), 0, `${name}: none arrives up through it`);
    assert.ok(!botHasLineOfSight(eye(up), eye(dn), a.obstacles, a.surfaces), `${name}: a bot behind it does not see a target beyond it`);
    const open = withOpenPanels(() => [shot(up, dn), shot(dn, up), botHasLineOfSight(eye(up), eye(dn), a.obstacles, a.surfaces)]);
    assert.ok(open[0] > 100 && open[1] > 100 && open[2], `${name}: nothing else is in the line — were the panel open, rounds arrive (${open[0]} down, ${open[1]} up) and the bot sees (${open[2]})`);
  }
});

// THE TALL FENCE ALONG A RAMP (b1105kt). The east inner ramp's north side had a low rail as every ramp's side has. A sprint off the deck at the ramp's top was in the
// air over a floor that falls a metre in a metre and went over it — 22 sprints of the bodies' scan, 12.4 m down to the street — and b1105ks gave the rail's boxes a
// hold 0.45 m over the bar one sees. The user, with a box of it picked: "Remove this piece of fence visually and physically. Then replace it with the higher version
// fence, the one that also blocks bullets." The scaffold's fence panel stands along that side now, leant with the ramp from its foot to the deck at its top (model
// x 9.79..13.30, z 29.61..30.20), 2.61 m over the ramp's floor; in the data 15 wall boxes in steps. The deck's own low rail begins at its upper end.
// What it does not hold: a sprint with a jump slantwise DOWN the ramp. The fence goes down with the floor, the jump does not, and 2 m on the body is over the fence's
// lower part (as a jump is over every rail of a platform's edge). A jump straight at the fence, and a sprint without one, are held.
const rampFloor = (x) => 8.807 + 1.0028 * (x - 9.79);   // (the east inner ramp's floor over the street, model metres: it rises eastward)
const fenceBoxes = () => getArena('neon').obstacles.filter((o) => o.topBuffer == null && Math.abs(MZ(o.minZ) - 29.61) < 0.01 && Math.abs(MZ(o.maxZ) - 30.20) < 0.01 && MX(o.minX) > 9.78 && MX(o.maxX) < 13.31);
test('the tall fence stands along the east inner ramp\'s north side instead of its low rail: wall boxes in steps with the ramp, and no walk, sprint or dodge takes a body past it — from the ramp, off the deck above, or round its two ends', () => {
  const a = getArena('neon'); const fence = fenceBoxes();
  assert.equal(fence.length, 15, 'the fence\'s boxes');
  for (const o of fence) { const x = MX((o.minX + o.maxX) / 2);   // (each a wall from the ramp's floor at its step's lower end to the panel's 2.61 m over the floor at its higher)
    assert.ok(o.noProjectile == null && Math.abs(o.minY / 4 - rampFloor(MX(o.minX))) < 0.02 && Math.abs(o.maxY / 4 - rampFloor(MX(o.maxX)) - 2.611) < 0.02, `the box at x ${x.toFixed(2)} is a wall from ${(o.minY / 4).toFixed(2)} to ${(o.maxY / 4).toFixed(2)} m`); }
  assert.equal(a.obstacles.filter((o) => isRail(o) && Math.abs(MZ(o.minZ) - 29.61) < 0.02 && MX(o.minX) > 9.7 && MX(o.maxX) < 13.31).length, 0, 'no box of the low rail is left on that line');
  const deck = a.obstacles.filter((o) => isRail(o) && Math.abs(MZ(o.minZ) - 29.62) < 0.02 && (o.maxX - o.minX) / 4 > 1);   // (the rail along the deck's north edge, at the ramp's top)
  assert.ok(deck.length === 1 && Math.abs(MX(deck[0].minX) - 13.30) < 0.01, 'the deck\'s north rail begins at the fence\'s upper end');
  const down = (r) => r.feet < 5 || (r.z < 29.61 && r.x > 9.79 && r.x < 13.30);   // (at the street, or north of the fence's line)
  // from the ramp at the fence: five places along it, north and slantwise both ways; a jump straight at it too
  for (const x of [10.2, 10.9, 11.6, 12.3, 13.0]) for (const deg of [270, 240, 300]) for (const [how, jumpAt] of [['walk', -1], ['sprint', -1], ['dodge', -1], ...(deg === 270 ? [['walk', 3], ['walk', 10], ['sprint', 3]] : [])]) {
    const from = [x, 31.6, rampFloor(x)]; const r = ran(from, heading(from, deg), how, jumpAt);
    assert.ok(!down(r), `from the ramp at x ${x}, a ${how}${jumpAt >= 0 ? ` with a jump at tick ${jumpAt}` : ''} heading ${deg}: the body is held (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`); }
  // the scan's sprints north-west off the deck (six of its nineteen) and its walks and dodges on the ramp, which went through the low rail before b1105kq
  for (const from of [[14.06, 30.12, 12.59], [17.06, 30.87, 12.59], [13.06, 31.87, 12.09], [15.06, 32.87, 12.59], [16.06, 33.87, 12.6], [12.06, 30.87, 11.08]]) { const r = ran(from, heading(from, 225), 'sprint', -1, 130);
    assert.ok(!down(r) && r.feet > 8, `a sprint north-west from (${from[0]}, ${from[1]}): the body is held (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`); }
  for (const [from, deg, how] of [[[12.06, 30.87, 11.08], 225, 'walk'], [[11.06, 30.87, 10.08], 247, 'walk'], [[13.06, 30.87, 12.09], 202, 'walk'], [[10.06, 30.87, 9.08], 315, 'walk'], [[11.06, 30.87, 10.08], 293, 'walk'], [[12.06, 30.87, 11.08], 225, 'dodge'], [[11.06, 30.87, 10.08], 247, 'dodge']]) { const r = ran(from, heading(from, deg), how);
    assert.ok(!down(r) && r.fall < 1.2, `a ${how} from (${from[0]}, ${from[1]}) heading ${deg}: the body is held on the ramp (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m, its greatest fall ${r.fall.toFixed(2)} m`); }
  // its two ends: the deck's corner at its top, the landing and the ramp's foot at its bottom
  for (const from of [[13.6, 30.2, 12.59], [13.45, 30.6, 12.59], [13.8, 30.0, 12.59], [9.3, 30.9, 9.0], [9.6, 31.2, 9.0], [10.1, 31.0, 9.1]]) for (const deg of [225, 250, 270, 290, 315, 180]) for (const how of ['walk', 'sprint', 'dodge']) { const r = ran(from, heading(from, deg), how);
    assert.ok(!(r.fall >= 2.4 && r.feet < 5), `from (${from[0]}, ${from[1]}) at the fence's end, a ${how} heading ${deg}: the body does not come down to the street (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`); }
});

test('the fence along the ramp stops rounds both ways and a bot\'s sight, at its foot, its middle and its top', () => {
  // (the shooter on the ramp, its target north of the fence at the same height: the line goes through the fence alone, as the reading with its boxes open shows)
  const a = getArena('neon'), EYE = C.BOT_LOS_EYE_HEIGHT; const eye = (p) => ({ x: AX(p[0]), y: p[2] * 4 + G + EYE, z: AZ(p[1]) }); const fence = fenceBoxes();
  const open = (read) => { for (const o of fence) o.noProjectile = true; try { return read(); } finally { for (const o of fence) delete o.noProjectile; } };
  for (const [name, inn, out] of [['near its foot', [10.3, 31.4, rampFloor(10.3)], [10.3, 27.4, rampFloor(10.3) - 0.5]], ['at its middle', [11.5, 31.6, rampFloor(11.5)], [11.5, 27.6, rampFloor(11.5)]], ['near its top', [12.8, 31.4, rampFloor(12.8)], [12.8, 27.4, rampFloor(12.8) + 0.3]]]) {
    assert.equal(shot(inn, out), 0, `${name}: no round arrives out through the fence`); assert.equal(shot(out, inn), 0, `${name}: none arrives in through it`);
    assert.ok(!botHasLineOfSight(eye(inn), eye(out), a.obstacles, a.surfaces), `${name}: a bot on the ramp does not see a target beyond the fence`);
    const o = open(() => [shot(inn, out), shot(out, inn), botHasLineOfSight(eye(inn), eye(out), a.obstacles, a.surfaces)]);
    assert.ok(o[0] > 100 && o[1] > 100 && o[2], `${name}: nothing else is in the line — were the fence open, rounds arrive (${o[0]} out, ${o[1]} in) and the bot sees (${o[2]})`);
  }
});

// A RAIL ON THE FRAME ONE SEES, AND A RAIL TAKEN AWAY (b1105ku). The ramp from the west street up to the 5.78 m deck is 8 m wide in the model, its side tubes' outer edges
// at z 32.37 and z 40.37. The reading's boxes of the south side went a quarter metre beyond that tube, to z 40.62, where nothing of the model is, and the rail — set on
// the floors' outer edge — stood in the air beside the tube; its first half metre stood beyond the tube's own end. neon_frame_edges.mjs cuts those 33 boxes and 32 floors
// back to the tube (the rail must stay on the boxes' outer face: a body that sinks into a box is put out at its nearest face), and the rail's lower end is the tube's.
// And the 1.25 m of rail on the top of the west inner ramp's south frame, which b1105kp wrote where a walk up that strip went off its end, is gone: "Remove this mini
// fence visually and physically." A walk up the strip goes off its end again, 2.46 m down to the 5.78 m deck.
test('the west street ramp\'s south rail stands on the frame one sees and holds a body as before, and the rail on the top of the west inner ramp\'s frame is gone', () => {
  const a = getArena('neon'); const D = JSON.parse(fs.readFileSync(new URL('../../client/public/maps/neon_data.json', import.meta.url), 'utf8'));
  // the frame: no box that is no wall and no flat floor of that side goes beyond the tube's edge (the window and the heights are neon_frame_edges.mjs's)
  const beyond = (o, top) => MZ(o.maxZ) > 40.38 && MZ(o.minZ) < 40.37 && MX(o.minX) >= -15.6 && MX(o.maxX) <= -11.7 && top / 4 >= 2.0 && top / 4 <= 5.2;
  assert.equal(D.obstacles.filter((o) => o.topBuffer != null && o.noProjectile !== true && beyond(o, o.maxY)).length, 0, 'no box of the frame goes south of z 40.37');
  assert.equal(D.surfaces.filter((q) => q.type === 'flat' && beyond(q, q.maxTop)).length, 0, 'no floor of the frame goes south of z 40.37');
  // the rail: twelve boxes with their outer face on the tube's edge, from the tube's end to the ramp's top; none on the line it had; the deck's west rail comes up to it
  const legs = a.obstacles.filter((o) => isRail(o) && long(o) <= 0.55 && MX(o.minX) > -15.6 && MX(o.maxX) < -12.3 && MZ(o.minZ) > 40.2 && MZ(o.maxZ) < 40.7);
  assert.equal(legs.length, 12, 'the boxes of the south side\'s two legs');
  assert.ok(legs.every((o) => Math.abs(MZ(o.maxZ) - 40.37) < 0.01), `every one ends on the tube's edge, z 40.37: ${[...new Set(legs.map((o) => MZ(o.maxZ).toFixed(2)))].join(', ')}`);
  const x0 = Math.min(...legs.map((o) => MX(o.minX))), x1 = Math.max(...legs.map((o) => MX(o.maxX)));
  assert.ok(Math.abs(x0 + 14.96) < 0.01 && Math.abs(x1 + 12.38) < 0.01, `from the tube's end at x -14.96 to the ramp's top at x -12.38: ${x0.toFixed(2)}..${x1.toFixed(2)}`);
  const west = a.obstacles.filter((o) => isRail(o) && Math.abs(MX(o.minX) + 12.19) < 0.01 && (o.maxZ - o.minZ) / 4 > 7);   // (the rail along the deck's west edge)
  assert.ok(west.length === 1 && Math.abs(MZ(west[0].minZ) - 40.37) < 0.01, `the 5.78 m deck's west rail begins on the same line: ${west.map((o) => MZ(o.minZ).toFixed(2)).join(', ')}`);
  // a walk, a sprint and a dodge from the ramp at the rail are held on the frame's steps beside it (before the frame was cut back, with the rail set on the tube: out, 3 m down)
  const ramp = (x) => (x < -14.20 ? (x + 17.70) * 1.0019 : 3.5039 + (x + 14.20) * 1.0019);   // (the ramp's floor over the street, model metres)
  for (const x of [-14.7, -14.0, -13.3]) for (const deg of [90, 60]) for (const how of ['walk', 'sprint', 'dodge']) { const from = [x, 38.8, ramp(x)]; const r = ran(from, heading(from, deg), how);
    assert.ok(r.fall < 1 && r.z < 40.31 && r.feet > ramp(-14.96), `from the ramp at x ${x}, heading ${deg}°, a ${how}: held at the rail (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m, its greatest fall ${r.fall.toFixed(2)} m`); }
  // (and a jump clears it, as it clears every low rail)
  for (const x of [-14.5, -13.5]) { const from = [x, 38.8, ramp(x)]; const d = fell(from, heading(from, 90), 'walk', 20); assert.ok(d >= 2.4, `a jump from the ramp at x ${x}: over the rail and down (${d.toFixed(2)} m)`); }
  // the rail that is gone: no rail's box on the top of the west inner ramp's south frame, and a walk, a sprint and a dodge up that strip go off its end, down to the deck
  assert.equal(a.obstacles.filter((o) => isRail(o) && MX(o.minX) > -5.2 && MX(o.maxX) < -3.0 && MZ(o.minZ) > 39.2 && MZ(o.maxZ) < 40.0 && o.minY / 4 > 8).length, 0, 'no rail on the top of the west inner ramp\'s south frame');
  for (const how of ['walk', 'sprint', 'dodge']) { const r = ran([-5.94, 35.87, 7.17], [-4.0, 40.67], how);
    assert.ok(r.fall > 2.2 && r.fall < 2.7 && Math.abs(r.feet - 5.78) < 0.03, `a ${how} up the strip goes off its end and stands on the 5.78 m deck: its greatest fall ${r.fall.toFixed(2)} m, feet ${r.feet.toFixed(2)} m`); }
});

// THE 12.59 m TOP PLATFORM'S NORTH-EAST CORNER (b1105ku). Its north and east rails hang beside the frame one sees — the floors of the solid reading go on to z 29.62
// and x 17.56, the frame's blocks end at z 29.85 and x 17.43 — and the user asked that they join the platform. A line on the frame is z 29.995 and x 17.31; a rail
// there takes the platform's north row out of the route grid (a place stands at its cell's centre or a quarter cell beside it, that row's bodies stand at z 30.12,
// and a body fits there only while the rail's inner face is no farther in than 29.83) and its hops off that side with it. So the two rails are left where they stand
// and the model gives each a plate under its feet, in to the frame (neon_rails.mjs FOOT_PLATES: nothing of it is in the data). What must stay as it was:
test('the 12.59 m top platform keeps its north and east rails where they stood, and the route grid keeps the row of places beside the north one with its hops off that side', () => {
  const rails = getArena('neon').obstacles.filter(isRail);
  const north = rails.filter((o) => Math.abs(MZ(o.minZ) - 29.62) < 0.01 && Math.abs(MZ(o.maxZ) - 29.68) < 0.01 && Math.abs(MX(o.minX) - 13.30) < 0.01 && Math.abs(MX(o.maxX) - 17.56) < 0.01);
  const east = rails.filter((o) => Math.abs(MX(o.minX) - 17.50) < 0.01 && Math.abs(MX(o.maxX) - 17.56) < 0.01 && Math.abs(MZ(o.minZ) - 29.62) < 0.01 && Math.abs(MZ(o.maxZ) - 33.56) < 0.01);
  assert.ok(north.length === 1 && east.length === 1, `the north rail at z 29.62..29.68 from x 13.30 to 17.56 (${north.length}) and the east rail at x 17.50..17.56 from z 29.62 to 33.56 (${east.length})`);
  const g = navGridFor(getArena('neon')); const row = [];
  for (let i = 0; i < g.N; i += 1) { const x = MX(g.posX[i]), z = MZ(g.posZ[i]), f = g.floor[i] / 4; if (Math.abs(f - 12.59) > 0.05 || Math.abs(z - 30.12) > 0.01 || x < 13.5 || x > 17.5) continue;
    let hops = 0; for (let k = g.linkStart[i]; k < g.linkStart[i + 1]; k += 1) { const j = g.linkAdj[k]; if (MZ(g.posZ[j]) < 29.5 && g.floor[j] / 4 < 1) hops += 1; } row.push([x, hops]); }
  assert.equal(row.length, 4, `the places of the platform's north row, a quarter cell in from their cells' centres (z 30.12): ${row.map(([x]) => x.toFixed(2)).join(', ')}`);
  assert.ok(row.every(([, hops]) => hops >= 1), `each has its hop off the north side, down to the street: ${row.map(([x, h]) => `${x.toFixed(2)}: ${h}`).join(', ')}`);
});

// THE BIN IS OUT (b1105ks). A bin 1.2 m square and 2.75 m tall stood on the pavement by the north-east fence; the user, with a box of it picked on the page: "Also remove
// this garbage can stuff visually and physically.", "垃圾桶移除. To 9.9" (neon_bin_out.mjs: twelve boxes and eleven floors of the reading; in the model Object_275's part there).
test('the bin by the north-east fence is out of the data: no box and no floor of it, and a walk goes through where it stood', () => {
  const D = JSON.parse(fs.readFileSync(new URL('../../client/public/maps/neon_data.json', import.meta.url), 'utf8'));
  const inWin = (o) => { const x = MX((o.minX + o.maxX) / 2), z = MZ((o.minZ + o.maxZ) / 2); return x >= 24.30 && x <= 26.85 && z >= -0.30 && z <= 1.65; };   // (the bin's window, model metres: neon_bin_out.mjs)
  assert.equal(D.obstacles.filter((o) => o.topBuffer != null && o.noProjectile !== true && inWin(o) && o.maxY / 4 <= 2.76).length, 0, 'no box that is no wall in the bin\'s window');
  assert.equal(D.surfaces.filter((q) => q.type === 'flat' && inWin(q) && q.maxTop / 4 >= 0.4 && q.maxTop / 4 <= 2.76).length, 0, 'no floor over the pavement there');
  for (const [name, from, at] of [['west along the pavement', [27.4, 1.0, 0.15], [22.0, 1.0]], ['north-west', [27.0, 1.5, 0.15], [24.0, 0.2]]]) { const r = ran(from, at, 'walk', -1, 90);
    assert.ok(r.x < 24.3 && Math.abs(r.feet - 0.15) < 0.05, `a walk ${name} through the bin's place (x 24.35..26.16, z -0.22..1.59) is past it after 1.4 s: (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`); }
});

test('rounds pass a rail both ways, and a bot\'s sight passes it: what a plain box of the same size would stop', () => {
  // (the shooter stands on the floor behind the rail, its target below and near enough that the line between them goes through the rail's box)
  const deck = [6, 47.5, 5.777], street = [6, 52.32, 0.15];     // (the 5.78 m deck's south rail; the street 4.2 m out)
  const walk = [16.8, 54.21, 21.88], below = [23.43, 54.21, 9.68];   // (the walkway's east rail; the scaffold's deck 6 m out)
  for (const [name, up, dn] of [['the deck\'s south rail', deck, street], ['the walkway\'s east rail', walk, below]]) {
    const down = shot(up, dn), back = shot(dn, up);
    assert.ok(down > 100 && back > 100, `${name}: rounds arrive down (${down}) and up (${back})`);
    assert.equal(withSolidRails(() => shot(up, dn)), 0, `${name}: the line goes through the rail — a box that stops rounds there stops them all`);
  }
  const a = getArena('neon'), EYE = C.BOT_LOS_EYE_HEIGHT; const eye = (p) => ({ x: AX(p[0]), y: p[2] * 4 + G + EYE, z: AZ(p[1]) }); const far = [6, 54.12, 0.15];   // (6 m out: the eyes' line is over the deck's edge and through the rail)
  assert.ok(botHasLineOfSight(eye(deck), eye(far), a.obstacles, a.surfaces), 'a bot behind the rail sees a target on the street below');
  assert.ok(!withSolidRails(() => botHasLineOfSight(eye(deck), eye(far), a.obstacles, a.surfaces)), 'and would not through a plain box');
});

test('no rail where the user asked for none: the west cage\'s roof (a body walks off each of its sides), the cage\'s inside along its walls, the bridge and the little slope in it', () => {
  const rails = getArena('neon').obstacles.filter(isRail);
  const inside = ([x0, x1, z0, z1, h0, h1]) => rails.filter((o) => { const x = MX((o.minX + o.maxX) / 2), z = MZ((o.minZ + o.maxZ) / 2), h = o.minY / 4; return x >= x0 && x <= x1 && z >= z0 && z <= z1 && h >= h0 && h <= h1; }).length;
  assert.equal(inside([-3.5, 2.6, 33.5, 39.5, 8.3, 13.6]), 0, 'the cage, from its floor ("x 1.21 z 36.23 feet 8.64 m") to its roof ("x -0.73 z 37.32 feet 12.73 m")');
  assert.equal(inside([0.06, 8.06, 24.9, 59.1, 20.0, 23.0]), 0, 'the bridge, its floor and its sills');
  assert.equal(inside([5.4, 8.9, 55.3, 58.0, 20.0, 23.0]), 0, 'the little slope at the last east window');
  for (const [name, at] of [['west', [-8, 37.32]], ['east', [8, 37.32]], ['north', [-0.73, 30]], ['south', [-0.73, 44]]]) {
    const r = pushed([-0.73, 37.32, 12.73], at);
    assert.ok(r.feet < r.floor - 2.4, `off the roof's ${name} side a walk goes down: (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`);
  }
});
