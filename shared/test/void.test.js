import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, GROUND_BASE_Y, SURFACE_STEP_HEIGHT } from '../src/sim/index.js';
import { voidUnder } from '../src/sim/physics.js';

// THE VOID'S EDGE (user 2026-10-29, "the unit got transported above to ground floor from B3 at this spot"): District's
// bowling lanes, 26 m under the street, end behind the pins at z -37.3 m, and the pit beyond has no floor in the model.
// The ground rule's street (0) stood a body there — 26 m up, on the road. A grounded body walking off the lane is now
// held at its end like a wall holds it, and a body that jumps off lands on the lane's own level over the void.
const CX = -25.75, CZ = 35.45, G = 0.55;   // (District: model metres to units)
const U = (xm, zm) => [(xm - CX) * 4, (zm - CZ) * 4];
function run(startM, feetM, dir, { jumpAt = Infinity, ms = 1200 } = {}) {
  const [X, Z] = U(...startM);
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p1.pos.x = X; p1.pos.z = Z; p1.pos.y = GROUND_BASE_Y + (feetM - G) * 4; p1.floorY = p1.pos.y;
  const trace = []; let now = 1000;
  for (let t = 0; t <= ms; t += TICK_RATE_MS) {
    const inp = emptyInput(); inp.moveX = dir[0]; inp.moveZ = dir[1]; inp.jump = t >= jumpAt && t < jumpAt + 2 * TICK_RATE_MS;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT, []); now += TICK_RATE_MS;
    trace.push({ t, x: p1.pos.x / 4 + CX, z: p1.pos.z / 4 + CZ, feet: (p1.pos.y - GROUND_BASE_Y) / 4 + G, air: p1.airborne });
  }
  return trace;
}
const LANE_END = -37.33;   // (the lanes' north edge, model metres; the pins stand at z -39..-40.8)

test('a body walking off the bowling lane behind the pins is held at the lane\'s end, not lifted to the street', () => {
  const trace = run([50.8, -38.5], -25.41, [0, 1]);
  const lifted = trace.find((s) => s.feet > -20);
  assert.ok(!lifted, 'lifted toward the street at t ' + lifted?.t + ': feet ' + lifted?.feet.toFixed(2));
  const last = trace[trace.length - 1];
  assert.ok(last.z <= LANE_END + 0.05 && last.z >= LANE_END - 0.5, 'not held at the edge: z ' + last.z.toFixed(2));
  assert.ok(Math.abs(last.feet - (-25.41)) < 0.05, 'left the lane\'s level: feet ' + last.feet.toFixed(2));
});

test('a body that jumps off that edge lands on the lane\'s level over the void, not on the street', () => {
  const trace = run([50.8, -38.3], -25.41, [0, 1], { jumpAt: 100, ms: 2000 });
  assert.ok(trace.some((s) => s.air), 'never left the ground');
  const lifted = trace.find((s) => s.feet > -20);
  assert.ok(!lifted, 'lifted toward the street at t ' + lifted?.t + ': feet ' + lifted?.feet.toFixed(2));
  const last = trace[trace.length - 1];
  assert.ok(!last.air && Math.abs(last.feet - (-25.41)) < 0.05, 'did not land on the lane\'s level: feet ' + last.feet.toFixed(2) + (last.air ? ' (airborne)' : ''));
});

test('voidUnder: the street within a step of the feet is ground as ever; deeper with nothing beneath is a void', () => {
  assert.equal(voidUnder(0, 0, [], -SURFACE_STEP_HEIGHT + 0.01), false);
  assert.equal(voidUnder(0, 0, [], 3), false);
  assert.equal(voidUnder(0, 0, [], -SURFACE_STEP_HEIGHT - 0.01), true);
  const floor = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, type: 'flat', top: -100, maxTop: -100, heightAt: () => -100 };
  assert.equal(voidUnder(0, 0, [floor], -100), false, 'a floor under the feet');
  assert.equal(voidUnder(20, 0, [floor], -100), true, 'beside the floor, nothing beneath');
});
