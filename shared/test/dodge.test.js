// THE DODGE'S LENGTH, AND ITS WAY TRIED PIECE BY PIECE (b1105mb; user 2026-11-28: "Implement 1.5 times dodge distance without causing go
// through walls/objects issue. PT and 1.0.0. Make sure online games are not getting more lag."). The dodge is 13.8 long — 9.2 until then —
// in the same 300 ms. Its body is put along a line by the clock, and until b1105mb only the point it should be at NOW was tried against the
// walls: a step of the clock longer than a tick (the offline page's stalled frame, the server's late tick) could set it down beyond a wall.
// The way to that point is tried every STEP_SWEEP_MAX now (actions.js sweepStep). These tests fly real dodges through tickMatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, tickMatch, emptyInput, sweepStep, getArena, buildSnapshotFor, UNIT_DATA,
  STEP_DISTANCE, STEP_SWEEP_MAX, STEP_DURATION_MS, STEP_COOLDOWN_MS, STEP_BOOST_COST, TICK_RATE_MS, TICK_DT, FIGHTER_RADIUS, GROUND_BASE_Y, BOOST_MOVE_SPEED
} from '../src/sim/index.js';
import { unitOverlapsObstacle, walkSegmentBlocked, boxHoldsAt, groundHeightAt } from '../src/sim/physics.js';
import '../tools/maps/arena_files.mjs';

const START = 1000;
// one fighter on a map, standing where it is put; the other far off and out of the way
function lone(map, x, z, floor = 0) {
  const m = createMatchState({ mapKey: map, mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: START });
  const f = m.fighters.p1, o = m.fighters.p2;
  f.invulnerableUntil = 0; o.invulnerableUntil = 0; o.hp = 1e9; o.pos.x = x + 4000; o.pos.z = z + 4000;
  f.pos.x = x; f.pos.z = z; f.pos.y = floor + GROUND_BASE_Y; f.floorY = floor + GROUND_BASE_Y; f.airborne = false; f.grounded = true;
  return { m, f };
}
// a dodge towards (dx, dz), then `ticks` ticks; `stallAt`: the tick whose clock steps `stallMs` instead of a tick's 16 (as a stalled frame's does)
// Returns how far the body's height strayed from where it began (0 on flat ground).
function dodge(m, f, dx, dz, ticks = 40, stallAt = -1, stallMs = 0, from = START) {
  let now = from, strayed = 0; const y0 = f.pos.y;
  for (let t = 0; t < ticks; t += 1) {
    const long = t === stallAt; now += long ? stallMs : TICK_RATE_MS;
    const inp = emptyInput(); if (t === 0) { inp.stepTap = true; inp.moveX = dx; inp.moveZ = dz; }
    m.events.length = 0;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, long ? stallMs / 1000 : TICK_DT, []);
    strayed = Math.max(strayed, Math.abs(f.pos.y - y0));
  }
  return strayed;
}

test('the dodge is 13.8 long, one and a half times the 9.2 it was, and nothing else of it moved', () => {
  assert.equal(STEP_DISTANCE, 13.8);
  assert.ok(Math.abs(STEP_DISTANCE - 9.2 * 1.5) < 1e-9);
  assert.equal(STEP_DURATION_MS, 300); assert.equal(STEP_COOLDOWN_MS, 1175); assert.equal(STEP_BOOST_COST, 48);
  for (const [key, u] of Object.entries(UNIT_DATA)) assert.equal(u.stepDistance, undefined, `${key} names a length of its own`);
  const { m, f } = lone('arena1', 0, 0);
  const boost0 = f.boost; const x0 = f.pos.x;
  const inp = emptyInput(); inp.stepTap = true; inp.moveX = 1;
  tickMatch(m, { p1: inp, p2: emptyInput() }, START + TICK_RATE_MS, TICK_DT, []);
  assert.equal(f.stepUntil, START + TICK_RATE_MS + 300); assert.equal(f.stepCooldownUntil, START + TICK_RATE_MS + 1175);
  assert.equal(f.boost, boost0 - 48);
  assert.ok(Math.abs((f.stepToX - f.stepFromX) - 13.8) < 1e-9 && f.stepToZ === f.stepFromZ);
  // a tick of it: 13.8 u over 300 ms at 16 ms a tick — 46 u/s, past the sprint's steady 29.4
  let now = START + TICK_RATE_MS, last = f.pos.x, fastest = 0, ended = null;
  for (let t = 0; t < 30; t += 1) { now += TICK_RATE_MS; tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, []); fastest = Math.max(fastest, (f.pos.x - last) / TICK_DT); if (ended == null && f.stepUntil === 0) ended = last; last = f.pos.x; }
  assert.ok(Math.abs(fastest - 46) < 0.01, `it ran at ${fastest}`);
  assert.ok(fastest > BOOST_MOVE_SPEED * 2.5);
  // what it covers: the line's last point a tick falls on — 18 ticks of 16 ms in the 300, 0.96 of the length, as it was at 9.2 (8.83)
  assert.equal(f.stepUntil, 0);
  assert.ok(Math.abs((ended - f.stepFromX) - 13.8 * 288 / 300) < 1e-6, `the dodge itself covered ${ended - f.stepFromX}`);
  assert.ok(f.pos.x - x0 > 13.2 && f.pos.x - x0 <= 13.8 + 1e-9, `with the tick it began in, ${f.pos.x - x0}`);
});

test('on a steady clock a tick\'s piece of the dodge is one test against the walls, as it always was', () => {
  const piece = STEP_DISTANCE * TICK_RATE_MS / STEP_DURATION_MS;
  assert.ok(piece <= STEP_SWEEP_MAX, `a tick's piece is ${piece}`);
  let calls = 0; const free = () => { calls += 1; return false; }; const out = { x: 0, z: 0 };
  assert.equal(sweepStep(0, 0, piece, 0, 0, free, null, out), true); assert.equal(calls, 1); assert.deepEqual(out, { x: piece, z: 0 });
  calls = 0; sweepStep(0, 0, STEP_SWEEP_MAX + 0.01, 0, 0, free, null, out); assert.equal(calls, 2);
  calls = 0; sweepStep(0, 0, STEP_DISTANCE, 0, 0, free, null, out); assert.equal(calls, Math.ceil(STEP_DISTANCE / STEP_SWEEP_MAX)); assert.equal(out.x, STEP_DISTANCE);
  calls = 0; sweepStep(0, 0, 1e6, 0, 0, free, null, out); assert.equal(calls, 64, 'a way that is no dodge is not tried without end');
  // the one piece is tried on the very point the old rule tried: the same answer where the clock is steady
  const seen = []; sweepStep(3, 4, 3.5, 4.5, 7, (x, y, z, arg) => { seen.push([x, y, z, arg]); return true; }, 'the list', out);
  assert.deepEqual(seen, [[3.5, 7, 4.5, 'the list']]); assert.deepEqual(out, { x: 3, z: 4 });
});

test('sweepStep stops the body before a thin object anywhere along a long way', () => {
  const thin = [{ minX: 5, maxX: 5.2, minZ: -10, maxZ: 10, minY: 0, maxY: 20 }];   // 0.2 thick
  const out = { x: 0, z: 0 };
  for (const far of [2, 3.9, 6, 9.2, 13.8, 20.7, 40]) {
    const free = sweepStep(0, 0, far, 0, GROUND_BASE_Y, unitOverlapsObstacle, thin, out);
    if (far + FIGHTER_RADIUS <= 5) { assert.equal(free, true, `${far} is short of it`); assert.equal(out.x, far); continue; }
    assert.equal(free, false, `a way of ${far} was let through`);
    assert.ok(out.x + FIGHTER_RADIUS <= 5 + 1e-9, `the body stands in it at ${out.x}`);
    assert.ok(out.x + FIGHTER_RADIUS > 5 - STEP_SWEEP_MAX - 1e-9, `it stopped ${5 - FIGHTER_RADIUS - out.x} short`);
  }
  // from the other side, and askew
  assert.equal(sweepStep(12, 0, -3, 0, GROUND_BASE_Y, unitOverlapsObstacle, thin, out), false); assert.ok(out.x - FIGHTER_RADIUS >= 5.2 - 1e-9);
  assert.equal(sweepStep(0, -6, 12, 6, GROUND_BASE_Y, unitOverlapsObstacle, thin, out), false); assert.ok(out.x + FIGHTER_RADIUS <= 5 + 1e-9);
  // the old rule, the far point alone, would have set the body down beyond it
  assert.equal(unitOverlapsObstacle(13.8, GROUND_BASE_Y, 0, thin), false);
});

test('a dodge straight at a wall stops at the wall whatever the clock does', () => {
  // Plain Field's east wall stands from x 120 to 124
  let runs = 0, reached = 0;
  for (const stall of [0, 50, 110, 140, 170, 200, 230, 260, 280, 400, 900]) {
    for (let gap = 1.5; gap <= 9; gap += 0.5) for (let at = 1; at <= 12; at += 1) {
      const { m, f } = lone('arena1', 120 - FIGHTER_RADIUS - gap, 0);
      dodge(m, f, 1, 0, 40, stall ? at : -1, stall);
      runs += 1;
      assert.ok(f.pos.x <= 120 - FIGHTER_RADIUS + 1e-6, `a stall of ${stall} ms at tick ${at}, ${gap} from the wall: the body is at x ${f.pos.x}`);
      assert.ok(f.pos.x >= 120 - FIGHTER_RADIUS - gap - 1e-6);
      if (f.pos.x > 120 - FIGHTER_RADIUS - STEP_SWEEP_MAX - 1e-6) reached += 1;
    }
  }
  assert.equal(runs, 11 * 16 * 12);
  assert.ok(reached > runs / 2, `${reached} of ${runs} came up to the wall`);
});

test('on the maps a stalled dodge at a thin wall or object never sets the body down beyond it', () => {
  let trials = 0, stopped = 0;
  for (const map of ['factory', 'station', 'hospital', 'warehouse', 'town']) {
    const arena = getArena(map); const obs = arena.obstacles;
    // the thin things a standing body cannot pass: under a body's width one way, at least 3 the other, and holding a body on the street
    const thin = obs.filter((o) => Math.min(o.maxX - o.minX, o.maxZ - o.minZ) < 2 * FIGHTER_RADIUS && Math.max(o.maxX - o.minX, o.maxZ - o.minZ) >= 3 && boxHoldsAt(o, GROUND_BASE_Y) && o.minY <= 0.5);
    assert.ok(thin.length >= 5, `${map} has ${thin.length} thin things`);
    const stride = Math.max(1, Math.floor(thin.length / 40));
    for (let i = 0; i < thin.length; i += stride) {
      const o = thin[i]; const alongX = (o.maxX - o.minX) < (o.maxZ - o.minZ);   // thin along x: dodge along x
      const mid = alongX ? (o.minZ + o.maxZ) / 2 : (o.minX + o.maxX) / 2;
      for (const side of [-1, 1]) for (const gap of [1.5, 4, 7]) for (const [at, stall] of [[2, 200], [6, 260], [1, 600]]) {
        const face = alongX ? (side < 0 ? o.minX : o.maxX) : (side < 0 ? o.minZ : o.maxZ);
        const c = face + side * (FIGHTER_RADIUS + gap);
        const x = alongX ? c : mid, z = alongX ? mid : c;
        if (groundHeightAt(x, z, arena.surfaces, 0) !== 0) continue;   // (the street alone: a start on another floor is another case)
        if (unitOverlapsObstacle(x, GROUND_BASE_Y, z, obs)) continue;
        const { m, f } = lone(map, x, z);
        let now = START; for (let t = 0; t < 6; t += 1) { now += TICK_RATE_MS; tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, []); }
        if (f.airborne || Math.abs(f.pos.y - GROUND_BASE_Y) > 0.01 || Math.hypot(f.pos.x - x, f.pos.z - z) > 0.01) continue;   // (not a standing spot)
        const sx = f.pos.x, sz = f.pos.z;
        const strayed = dodge(m, f, alongX ? -side : 0, alongX ? 0 : -side, 40, at, stall, now);
        if (strayed > 0.5) continue;   // (it left the street on the way — steps, a kerb, a fall: another case)
        trials += 1;
        assert.equal(walkSegmentBlocked(sx, sz, f.pos.x, f.pos.z, GROUND_BASE_Y, obs), false, `${map}: from ${sx.toFixed(2)}, ${sz.toFixed(2)} the body went through to ${f.pos.x.toFixed(2)}, ${f.pos.z.toFixed(2)} (a stall of ${stall} ms at tick ${at})`);
        // (a body at rest against a face sits exactly a radius from it: only a deeper overlap is standing IN a box — physics.js REST_SLACK)
        assert.equal(unitOverlapsObstacle(f.pos.x, f.pos.y, f.pos.z, obs, FIGHTER_RADIUS - 0.05), false, `${map}: the body stands in something at ${f.pos.x.toFixed(2)}, ${f.pos.z.toFixed(2)}`);
        if (Math.hypot(f.pos.x - sx, f.pos.z - sz) < gap + 2 * FIGHTER_RADIUS) stopped += 1;
      }
    }
  }
  assert.ok(trials >= 600, `${trials} dodges were tried`);
  assert.ok(stopped >= trials * 0.9, `${stopped} of ${trials} stopped at the thing they were sent at`);
});

test('the piece by piece rule keeps nothing on the fighter: nothing more rides a snapshot', () => {
  // a dodge on a steady clock (one piece a tick, the old rule's own point) and a stalled one stopped at a wall (many pieces): the same fields
  const plain = lone('arena1', 0, 0); dodge(plain.m, plain.f, 1, 0, 40);
  const stalled = lone('arena1', 120 - FIGHTER_RADIUS - 4, 0); dodge(stalled.m, stalled.f, 1, 0, 40, 3, 230);
  assert.ok(stalled.f.pos.x <= 120 - FIGHTER_RADIUS + 1e-6);
  assert.deepEqual(Object.keys(stalled.f).sort(), Object.keys(plain.f).sort());
  const snap = (x) => Object.keys(buildSnapshotFor(x.m, 'A').fighters.p1).sort();
  assert.deepEqual(snap(stalled), snap(plain));
});
