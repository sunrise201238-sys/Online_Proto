// Neon's low rails (b1105ko; shared/tools/maps/neon_rails.mjs; user 2026-11-23, of a way to make a fight on the scaffold's platforms last, with a picture of Town's low
// railing: "how about the mini fences used in town?", "can you make these mini fences passable for bullets? both in town and neon.", "can the mini fences be mounted on
// the scaffolding slopes?", "edges already have scaffolding walls mounted do not need extra mini fences.", then with the places read off the game: "mini fence around here
// as well. (The slope inside the catwalk does not need mini fence.)", "mini fence at these three edges as well.", "No need mini fences at this one platform top."),
// against the installed data, on the server's sim: the rails are there and each stands on a floor's open edge; a walk, a sprint and a dodge are held at one and a jump
// clears it; the one rail no jump clears, with the route grid's reason for it; rounds and a bot's sight pass; and where the user asked for none there is none. A reading
// of Neon's data made again from the model has no rail: the tool is run after neon_ways_up.mjs, and these fail until it has been. (What the rails do to a fight — how
// often a bot comes off a platform — was measured, not tested: the main README, b1105ko.)
// And the gaps (b1105kp; user, with two pictures of gaps in the walkway's rails, told of six more places like them: "Assess if there would be issue fencing them up. if
// no, implement in PT and 9.9"): at each of the eight a walk, a sprint and a dodge went off the platform; none does now, and a jump still clears every rail but two.
// And the frame beside two rails (b1105kq; user, told that the rails on three ramps' sides have their boxes as the others have and that what lets a body through is the
// frame's own boxes beside them, tops with no floor: "要不要照「補齊框架地板」做在 PT 和 9.9？ YES"; and of the rail that ended above its ramp's foot: "Implement, PT and
// 9.9"): the walks and dodges that went through the two rails are held, and a sprint down along the carried-on rail comes to stand on the deck.
import '../tools/maps/arena_files.mjs';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt } from '../src/sim/index.js';
import { navGridFor, botHasLineOfSight } from '../src/sim/ai.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4, MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37;   // (Neon: the model's metres and the arena's units)
// a rail in the data: it holds a body alone, has one of the two holds a rail is given and is 6 cm through (neon_rails.mjs: no key of its own)
const isRail = (o) => o.noProjectile === true && (o.topBuffer === 2 || o.topBuffer === 12) && Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < 0.241;
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

test('the rails are in the data: 29 runs along the flat floors\' open edges and 15 legs along the ramps\' sides, 6 cm through, every one a box that holds a body alone', () => {
  const a = getArena('neon'); const rails = a.obstacles.filter(isRail); const flat = rails.filter((o) => long(o) > 0.55), slope = rails.filter((o) => long(o) <= 0.55);   // (a run is a body's width long or more; a leg is a row of boxes half a metre long or less)
  assert.equal(flat.length, 29, 'the flat floors\' runs, a box each');
  assert.equal(slope.length, 150, 'the boxes of the ramps\' legs');
  assert.ok(Math.abs(flat.reduce((s, o) => s + long(o), 0) - 181.6) < 0.1 && Math.abs(slope.reduce((s, o) => s + long(o), 0) - 38.7) < 0.1, `181.6 m on the flat and 38.7 m along the ramps: ${flat.reduce((s, o) => s + long(o), 0).toFixed(1)} and ${slope.reduce((s, o) => s + long(o), 0).toFixed(1)}`);
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
  assert.equal(rails.filter((o) => o.topBuffer === 12).length, 2, 'two rails that no jump clears');
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
test('the gaps are closed: at the walkway\'s inner corner and by its pillar (the user\'s two pictures), at the window\'s jamb, on the first top platform\'s north side, at the strip\'s south-west corner and at two ramp tops, a walk, a sprint and a dodge stay up, and a jump still clears the rail', () => {
  // (from, toward; hops: a jump clears this rail — every one but the strip's south-west piece, below)
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
    ['the top of the west inner ramp\'s frame', [-5.94, 35.87, 7.17], [-4.0, 40.67], false],   // (a jump from the ramp below comes down on the frame, not over its rail)
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
const heading = (from, deg) => [from[0] + 10 * Math.cos(deg * Math.PI / 180), from[1] + 10 * Math.sin(deg * Math.PI / 180)];   // (a point 10 m off at a heading, as the bodies' scan ran them)
test('the frame beside two rails has its floors: the walks and dodges that went through the east inner ramp\'s north rail and the rail beside the ramp east of the 8.6 m deck are held on the frame', () => {
  const D = JSON.parse(fs.readFileSync(new URL('../../client/public/maps/neon_data.json', import.meta.url), 'utf8')); const floors = D.surfaces.filter((q) => q.railFloor === true);
  assert.equal(floors.length, 19, 'the floors written beside the two legs');
  for (const q of floors) {   // (each lies on the top of a box that is no wall, within 0.9 m inside one of the two legs and a body's half-width beyond its ends)
    assert.ok(q.type === 'flat' && q.top === q.maxTop, 'a flat floor');
    assert.ok(D.obstacles.some((o) => o.topBuffer != null && o.maxY === q.top && o.minX <= q.minX + 0.011 && o.maxX >= q.maxX - 0.011 && o.minZ <= q.minZ + 0.011 && o.maxZ >= q.maxZ - 0.011), `the floor at model (${MX(q.minX).toFixed(2)}, ${MZ(q.minZ).toFixed(2)}), ${(q.top / 4).toFixed(2)} m, lies on a box's top`);
    const x0 = MX(q.minX), x1 = MX(q.maxX), z0 = MZ(q.minZ), z1 = MZ(q.maxZ);
    assert.ok((x0 >= 9.49 && x1 <= 13.40 && z0 >= 29.66 && z1 <= 30.58) || (x0 >= 10.52 && x1 <= 16.36 && z0 >= 46.65 && z1 <= 47.57), `the floor at model (${x0.toFixed(2)}..${x1.toFixed(2)}, ${z0.toFixed(2)}..${z1.toFixed(2)}) lies beside one of the two legs`);
  }
  // (from, the heading in degrees, how; the side of the rail the body must end on: north of z 29.9 is the street beyond the first, south of z 48.0 the street beyond the second's deck)
  const RUNS = [
    ['the east inner ramp, down it and north-west', [12.06, 30.87, 11.08], 225, 'walk'], ['the east inner ramp, down it and north-north-west', [11.06, 30.87, 10.08], 247, 'walk'],
    ['the east inner ramp, from its top', [13.06, 30.87, 12.09], 202, 'walk'], ['the east inner ramp, up it and north-east', [10.06, 30.87, 9.08], 315, 'walk'], ['the east inner ramp, up it and north-north-east', [11.06, 30.87, 10.08], 293, 'walk'],
    ['the east inner ramp, a dodge north-west', [12.06, 30.87, 11.08], 225, 'dodge'], ['the east inner ramp, a dodge north-north-west', [11.06, 30.87, 10.08], 247, 'dodge'],
    ['the ramp east of the 8.6 m deck, down it and south', [12.06, 44.87, 7.65], 68, 'walk'], ['the ramp east of the 8.6 m deck, across it', [14.06, 44.87, 6.70], 113, 'walk'], ['the ramp east of the 8.6 m deck, down it and south, lower', [13.06, 45.87, 7.17], 68, 'walk'],
    ['the ramp east of the 8.6 m deck, a dodge south-east', [11.06, 45.87, 8.12], 45, 'dodge'], ['the ramp east of the 8.6 m deck, south-east to the deck\'s edge', [12.06, 46.87, 7.65], 45, 'walk'],
  ];
  for (const [name, from, deg, how] of RUNS) { const r = ran(from, heading(from, deg), how);
    assert.ok(r.fall < 1.2 && (from[1] < 40 ? r.z > 29.9 : r.z < 48.0), `${name}, a ${how}: the body is held on the ramp's side (its greatest fall ${r.fall.toFixed(2)} m, it ends at (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m)`); }
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

// THE STRIP'S SOUTH RAIL IS NOT HOPPED. It is 1.5 m between the bridge's end and the north way's platform, where a bot that comes out of the bridge walked off to the
// decks 12.6 m below (the user's case of b1105kl: neon_ways.test.js, a bot in the bridge and its target under the strip). A rail a jump clears is a lip to the route
// grid: the drop over it stays in the grid, a route's last step is walked and never jumped (nbrain.js truncateAtFiringPoint — the bots' own rule, on every map, not
// touched), so the bot stood held at the rail: that test failed, and a scan of 438 runs from the bridge to the decks went from 20 that never arrive to 44. With a hold
// no jump clears the rail is a wall to the grid, there is no drop over it, and the bot goes round (23 of 438).
// The strip's south-west corner (b1105kp) is the same: left open, a bot walked off it; closed with a rail a jump clears, the bot stood at it (31 of 438); with this hold, 18.
test('the strip\'s south rail, from "x -1.35 z 24.14 feet 21.24 m": no walk, sprint, dodge or jump takes a body over it, and the route grid has no drop over it', () => {
  for (const [how, jumpAt] of [['walk', -1], ['sprint', -1], ['dodge', -1], ['walk', 8], ['walk', 14], ['walk', 20], ['walk', 26], ['sprint', 14]]) {
    const r = pushed([-1.35, 24.14, 21.24], [-1.35, 28], how, jumpAt);
    assert.ok(Math.abs(r.feet - r.floor) < 0.02 && r.z < 24.62, `a ${how}${jumpAt >= 0 ? ` with a jump at tick ${jumpAt}` : ''}: the body stands on the strip (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) feet ${r.feet.toFixed(2)} m`);
  }
  const g = navGridFor(getArena('neon')); let nodes = 0; const down = [];
  for (let i = 0; i < g.N; i += 1) {
    const x = MX(g.posX[i]), z = MZ(g.posZ[i]), f = g.floor[i] / 4; if (f < 21.0 || f > 21.6 || x < -2.6 || x > 0.2 || z < 22.4 || z > 24.7) continue;   // (the strip's floor behind the rail)
    nodes += 1;
    for (let k = g.linkStart[i]; k < g.linkStart[i + 1]; k += 1) { const j = g.linkAdj[k]; if (g.floor[j] < g.floor[i] - 12) down.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) to (${MX(g.posX[j]).toFixed(2)}, ${MZ(g.posZ[j]).toFixed(2)} | ${(g.floor[j] / 4).toFixed(2)})`); }
  }
  assert.ok(nodes >= 4, `the strip has its nodes behind the rail (${nodes})`);
  assert.equal(down.length, 0, `links from the strip behind its south rail to a floor more than 3 m under it: ${down.slice(0, 4).join('; ')}`);
});

test('the strip\'s south-west piece, between its west rail and the north way\'s fence: no walk, sprint, dodge or jump takes a body over it, the route grid has no link across it, and the west rail beside it is jumped', () => {
  for (const how of ['walk', 'sprint', 'dodge']) { const d = fell([-5.94, 23.12, 21.44], [-8.9, 26.1], how); assert.ok(d < 1, `a ${how} from the way's platform into the corner: the body stays on the strip (its greatest fall ${d.toFixed(2)} m)`); }
  // (southward at the piece, from the strip between the west rail and the platform: a jump early, in the air as it comes to the piece, and late, at the piece)
  for (const [how, jumpAt] of [['walk', 2], ['walk', 5], ['walk', 8], ['walk', 14], ['walk', 20], ['sprint', 2], ['sprint', 5], ['sprint', 14]]) {
    const d = fell([-6.72, 23.3, 21.24], [-6.72, 27.0], how, jumpAt);
    assert.ok(d < 1, `a ${how} south at the piece with a jump at tick ${jumpAt}: the body stays on the strip (its greatest fall ${d.toFixed(2)} m)`);
  }
  const g = navGridFor(getArena('neon')); const across = [];   // (a link from the strip whose straight line crosses the piece: model x -7.19..-6.34 at z 24.62)
  for (let i = 0; i < g.N; i += 1) {
    const x = MX(g.posX[i]), z = MZ(g.posZ[i]), f = g.floor[i] / 4; if (f < 21.0 || f > 21.6 || z > 24.62 || Math.hypot(x + 6.8, z - 24.0) > 3) continue;
    for (let k = g.linkStart[i]; k < g.linkStart[i + 1]; k += 1) { const j = g.linkAdj[k], x1 = MX(g.posX[j]), z1 = MZ(g.posZ[j]); if (z1 <= 24.62) continue; const xc = x + (x1 - x) * (24.62 - z) / (z1 - z); if (xc >= -7.19 && xc <= -6.34) across.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) to (${x1.toFixed(2)}, ${z1.toFixed(2)} | ${(g.floor[j] / 4).toFixed(2)})`); }
  }
  assert.equal(across.length, 0, `links from the strip across its south-west piece: ${across.join('; ')}`);
  const w = fell([-6.31, 23.33, 21.44], [-10, 23.6], 'walk', 20); assert.ok(w >= 2.4, `a jump at the west rail beside it goes over and down (${w.toFixed(2)} m)`);
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
