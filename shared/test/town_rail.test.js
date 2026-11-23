// Town's low railing lets rounds through (b1105ko; shared/tools/maps/town_rail_flag.mjs; user 2026-11-23, with a picture of the dark railing round the sunken lot in the
// middle of Town: "how about the mini fences used in town?", and of those and Neon's new ones: "can you make these mini fences passable for bullets? both in town and
// neon."), against the installed data, on the server's sim: the railing's boxes hold a body alone; a round from the high pavement onto the road in the lot arrives, where
// the bar stopped every one; a body walked at the railing is held as before, and a jump clears it as before. A reading of Town's data made again from the model has the
// railing as plain boxes: the tool is run after it, and these fail until it has been.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena } from '../src/sim/index.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
// the bar at the lot's west side, where the pavement is 2.4 m over the road: two thin boxes side by side, the bar's two faces (arena units)
const isWestBar = (o) => o.minZ === -30.31 && o.maxZ === 57 && o.minY === 13.42 && o.maxY === 14.26 && ((o.minX === -79.92 && o.maxX === -79.76) || (o.minX === -79.44 && o.maxX === -79.28));
const PAVEMENT = [-81.5, 20, 10.64], ROAD = [-73.5, 20, -0.19];   // (x, z, the feet's height: behind the bar on the high pavement, and on the road 6 units out from it)
// A unit pinned at a place holds the trigger on a unit pinned at another for six seconds: the damage done.
function shot(from, to) {
  const m = createMatchState({ mapKey: 'town', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const a = m.fighters.p1, b = m.fighters.p2;
  for (const q of [a, b]) { q.hp = 1e9; q.invulnerableUntil = 0; }
  a.pos = { x: from[0], y: from[2] + G, z: from[1] }; b.pos = { x: to[0], y: to[2] + G, z: to[1] }; a.floorY = a.pos.y; b.floorY = b.pos.y; a.targetId = 'p2'; b.targetId = 'p1';
  const a0 = { ...a.pos }, b0 = { ...b.pos }, hp0 = b.hp; let now = 1000; const inp = { ...emptyInput(), shootHold: true };
  for (let k = 0; k < 6000 / MS; k += 1) {
    now += MS; m.tick = (m.tick ?? 0) + 1; tickMatch(m, { p1: inp, p2: emptyInput() }, now, DT, []);
    for (const [q, q0] of [[a, a0], [b, b0]]) { q.pos.x = q0.x; q.pos.y = q0.y; q.pos.z = q0.z; q.vel.x = q.vel.y = q.vel.z = 0; q.airborne = false; }
  }
  return Math.round(hp0 - b.hp);
}

test('the railing\'s boxes hold a body alone: 98 of them given noProjectile, the bar at the lot\'s west side among them', () => {
  const t = getArena('town'); const flagged = t.obstacles.filter((o) => o.noProjectile === true);
  assert.equal(flagged.length, 106, 'Town\'s boxes that a round passes: the eight it had and the railing\'s 98');
  const bar = t.obstacles.filter(isWestBar);
  assert.ok(bar.length === 2 && bar.every((o) => o.noProjectile === true), `the west bar's two faces are found (${bar.length}) and a round passes them`);
});

test('a round from the high pavement onto the road in the lot passes the railing, and one from the road up to the pavement: the bar stopped every one', () => {
  const down = shot(PAVEMENT, ROAD), up = shot(ROAD, PAVEMENT);
  assert.ok(down > 100 && up > 100, `rounds arrive down (${down}) and up (${up})`);
  const bar = getArena('town').obstacles.filter(isWestBar); for (const o of bar) o.noProjectile = false;   // (the bar as it was, for the time of one reading)
  let was; try { was = [shot(PAVEMENT, ROAD), shot(ROAD, PAVEMENT)]; } finally { for (const o of bar) o.noProjectile = true; }
  assert.deepEqual(was, [0, 0], 'the line goes through the bar: as a plain box it stops them all, as it did');
});

test('a body walked or sprinted at the railing from the pavement is held at it, and a jump clears it: as before', () => {
  const run = (how, jumpAt = -1) => {
    const m = createMatchState({ mapKey: 'town', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const f = m.fighters.p1, e = m.fighters.p2;
    for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
    e.pos = { x: -300, y: G, z: -300 }; e.floorY = G; f.pos = { x: PAVEMENT[0], y: PAVEMENT[2] + G, z: PAVEMENT[1] }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
    let now = 1000;
    for (let n = 0; n < 150; n += 1) { const inp = { ...emptyInput(), moveX: 1, moveZ: 0 }; if (how === 'sprint') { inp.boost = true; inp.sprintLocked = true; } if (n === jumpAt) inp.jump = true; now += MS; tickMatch(m, { p1: inp }, now, DT); }
    return { x: f.pos.x, feet: f.pos.y - G };
  };
  for (const how of ['walk', 'sprint']) { const r = run(how); assert.ok(r.x < -79.92 && Math.abs(r.feet - PAVEMENT[2]) < 0.05, `a ${how} east from the pavement is held at the bar: x ${r.x.toFixed(2)}, feet ${r.feet.toFixed(2)}`); }
  const j = run('walk', 20); assert.ok(j.x > -79.28 && j.feet < PAVEMENT[2] - 4, `a jump is over it and down in the lot: x ${j.x.toFixed(2)}, feet ${j.feet.toFixed(2)}`);
});
