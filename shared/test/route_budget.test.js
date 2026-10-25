import test from 'node:test';
import assert from 'node:assert/strict';
import { getArena } from '../src/sim/index.js';
import { navGridFor } from '../src/sim/ai.js';
import { findPathOnGrid, findFiringPath } from '../src/sim/navgrid.js';
import { GROUND_BASE_Y, BOT_LOS_EYE_HEIGHT } from '../src/sim/constants.js';

// The route searches under a budget (2026-10-25): a search cut by its deadline parks in its job and goes on next call;
// the route it ends with is the route a single unbudgeted call finds. A deadline already in the past cuts at every
// 32-pop check, so a long route takes many calls — the hardest case. Without a job a cut is a miss, as before.
const sliced = (fn) => { const job = {}; let r, calls = 0; do { r = fn(job, performance.now() - 1); calls += 1; if (calls > 200000) throw new Error('never finished'); } while (r && r.pending); return { r, calls }; };

test('a walk route across Compound, cut every 32 pops and resumed, is the route found in one go', () => {
  const a = getArena('compound'); const grid = navGridFor(a); const s = a.spawns.p1, t = a.spawns.p2;
  const whole = findPathOnGrid(grid, s.x, s.z, t.x, t.z, null, null, a.obstacles);
  assert.ok(whole && whole.length > 2, 'no route across Compound');
  const { r, calls } = sliced((job, dl) => findPathOnGrid(grid, s.x, s.z, t.x, t.z, null, null, a.obstacles, { job, deadline: dl }));
  assert.ok(calls > 5, 'the search never parked: ' + calls + ' calls');
  assert.deepEqual(r, whole);
});

test('the firing-position search, cut and resumed, finds the spot it finds in one go', () => {
  let found = 0;
  for (const mapKey of ['factory', 'station', 'town', 'compound']) {
    const a = getArena(mapKey); const grid = navGridFor(a); const s = a.spawns.p1, t = a.spawns.p2;
    const eye = (t.y ?? GROUND_BASE_Y) + BOT_LOS_EYE_HEIGHT;
    const whole = findFiringPath(grid, s.x, s.z, null, t.x, t.z, eye, 33, 47, a.obstacles, null);
    const { r, calls } = sliced((job, dl) => findFiringPath(grid, s.x, s.z, null, t.x, t.z, eye, 33, 47, a.obstacles, null, { job, deadline: dl }));
    assert.deepEqual(r, whole, mapKey);
    if (whole && whole.length > 1) { found += 1; assert.ok(calls > 2, mapKey + ': the search never parked: ' + calls + ' calls'); }
  }
  assert.ok(found >= 2, 'a firing spot was found on only ' + found + ' maps');
});

test('without a job a cut is a miss, and a job is cleared when the search ends', () => {
  const a = getArena('compound'); const grid = navGridFor(a); const s = a.spawns.p1, t = a.spawns.p2;
  assert.equal(findPathOnGrid(grid, s.x, s.z, t.x, t.z, null, null, a.obstacles, { deadline: performance.now() - 1 }), null);
  const job = {};
  const { r } = sliced((j, dl) => findPathOnGrid(grid, s.x, s.z, t.x, t.z, null, null, a.obstacles, { job, deadline: dl }));
  assert.ok(r && r.length > 2); assert.equal(job.state, null);
});
