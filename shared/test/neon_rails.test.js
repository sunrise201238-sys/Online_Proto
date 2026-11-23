// Neon's low rails (b1105ko; shared/tools/maps/neon_rails.mjs; user 2026-11-23, of a way to make a fight on the scaffold's platforms last, with a picture of Town's low
// railing: "how about the mini fences used in town?", "can you make these mini fences passable for bullets? both in town and neon.", "can the mini fences be mounted on
// the scaffolding slopes?", "edges already have scaffolding walls mounted do not need extra mini fences.", then with the places read off the game: "mini fence around here
// as well. (The slope inside the catwalk does not need mini fence.)", "mini fence at these three edges as well.", "No need mini fences at this one platform top."),
// against the installed data, on the server's sim: the rails are there and each stands on a floor's open edge; a walk, a sprint and a dodge are held at one and a jump
// clears it; the one rail no jump clears, with the route grid's reason for it; rounds and a bot's sight pass; and where the user asked for none there is none. A reading
// of Neon's data made again from the model has no rail: the tool is run after neon_ways_up.mjs, and these fail until it has been. (What the rails do to a fight — how
// often a bot comes off a platform — was measured, not tested: the main README, b1105ko.)
import '../tools/maps/arena_files.mjs';
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
  assert.equal(slope.length, 145, 'the boxes of the ramps\' legs');
  assert.ok(Math.abs(flat.reduce((s, o) => s + long(o), 0) - 172.5) < 0.1 && Math.abs(slope.reduce((s, o) => s + long(o), 0) - 37.1) < 0.1, `172.5 m on the flat and 37.1 m along the ramps: ${flat.reduce((s, o) => s + long(o), 0).toFixed(1)} and ${slope.reduce((s, o) => s + long(o), 0).toFixed(1)}`);
  for (const o of rails) assert.ok(Math.abs(Math.min(o.maxX - o.minX, o.maxZ - o.minZ) - 0.24) < 1e-6, 'a rail is 6 cm through');
  // a flat run: from 0.25 m over its floor to 0.75 m over it, the floor on one side of it and a drop of 2.4 m or more on the other (read 0.3 m off the rail, at three places along it;
  // a deck and the frame tops in it lie within 0.25 m of each other)
  for (const o of flat) {
    assert.ok(Math.abs(o.maxY - o.minY - 2) < 1e-6, 'a flat run holds from 0.25 m to 0.75 m over its floor');
    const alongX = o.maxX - o.minX > o.maxZ - o.minZ, cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2, h = o.minY - 1;
    for (const t of [0.15, 0.5, 0.85]) {
      const px = alongX ? o.minX + (o.maxX - o.minX) * t : cx, pz = alongX ? cz : o.minZ + (o.maxZ - o.minZ) * t;
      const [p, q] = [-1, 1].map((n) => groundHeightAt(px + (alongX ? 0 : n * 1.2), pz + (alongX ? n * 1.2 : 0), a.surfaces, h + 2));
      assert.ok((Math.abs(p - h) <= 1 && q <= h - 9.6) || (Math.abs(q - h) <= 1 && p <= h - 9.6), `the run at model (${MX(px).toFixed(2)}, ${MZ(pz).toFixed(2)}), floor ${(h / 4).toFixed(2)} m, stands on an open edge: ${(p / 4).toFixed(2)} m on one side, ${(q / 4).toFixed(2)} m on the other`);
    }
  }
  assert.equal(rails.filter((o) => o.topBuffer === 12).length, 1, 'one rail that no jump clears');
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

// THE STRIP'S SOUTH RAIL IS NOT HOPPED. It is 1.5 m between the bridge's end and the north way's platform, where a bot that comes out of the bridge walked off to the
// decks 12.6 m below (the user's case of b1105kl: neon_ways.test.js, a bot in the bridge and its target under the strip). A rail a jump clears is a lip to the route
// grid: the drop over it stays in the grid, a route's last step is walked and never jumped (nbrain.js truncateAtFiringPoint — the bots' own rule, on every map, not
// touched), so the bot stood held at the rail: that test failed, and a scan of 438 runs from the bridge to the decks went from 20 that never arrive to 44. With a hold
// no jump clears the rail is a wall to the grid, there is no drop over it, and the bot goes round (23 of 438).
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
