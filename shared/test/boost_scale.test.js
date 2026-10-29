// A map's boost scale (constants.js MAP_DATA boostScale, user 2026-10-29: District's gauge and refill five times, the bots'
// gates with them): the fighter's gauge starts full at the scale, refills at the scale, and the plain brain's travel latch
// arms and releases at the scaled reserve and floor — on District five times Town's, on Town as ever.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';

const withDrain = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (the PT site's switch, where the tree has one)

test('boost scale: District starts every fighter at five times the gauge, Town at the gauge', () => {
  assert.equal(C.boostScaleOf('district'), 5); assert.equal(C.boostScaleOf('town'), 1); assert.equal(C.boostScaleOf('arena1'), 1);
  const d = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit2', mode: '2v2' });
  for (const id of ['p1', 'p2', 'p3', 'p4']) { assert.equal(d.fighters[id].boostScale, 5, id); assert.equal(d.fighters[id].boost, 1250, id + ' boost'); }
  const t = createMatchState({ mapKey: 'town', p1UnitKey: 'unit1', p2UnitKey: 'unit2' });
  assert.equal(t.fighters.p1.boostScale, 1); assert.equal(t.fighters.p1.boost, 250);
});

test('boost scale: the refill is five times a tick on District, the cap five times', () => withDrain(() => {
  const run = (mapKey) => { const m = createMatchState({ mapKey, p1UnitKey: 'unit1', p2UnitKey: 'unit2', startTime: 1000 }); const f = m.fighters.p1; f.boost = 0; f.refillPausedUntil = 0; f.grounded = true;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, 1016, TICK_DT, []); const one = f.boost; for (let i = 0; i < 400; i += 1) tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, 1032 + i * TICK_RATE_MS, TICK_DT, []); return { one, full: f.boost }; };
  const d = run('district'), t = run('town');
  assert.ok(Math.abs(d.one - 5 * t.one) < 1e-9, `one tick: District ${d.one}, Town ${t.one}`);
  assert.ok(t.one > 4 && t.one < 5, 'Town refills 4.59 a tick: ' + t.one);
  assert.equal(d.full, 1250, 'District full'); assert.equal(t.full, 250, 'Town full');
}));

test('boost scale: the plain brain\'s travel sprint leg runs the scaled reserve down to the scaled floor', () => withDrain(() => {
  // (the travel sprint latch test's pursuit on Plain Field, the scale set by hand on the pursuer: a leg of 1250 -> 1000 instead of 250 -> 200)
  const legs = (k) => { const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' }); const p1 = m.fighters.p1, p2 = m.fighters.p2;
    p1.pos.x = -100; p1.pos.z = 0; p2.pos.x = 100; p2.pos.z = 0; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9; p1.botControlled = true; p1.targetId = 'p2';
    p1.boostScale = k; p1.boost = 250 * k;
    let now = 1000; const runs = []; let len = 0;
    for (let i = 0; i < 600; i += 1) { tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); if (p1.action === 'dash') len += 1; else if (len) { runs.push(len); len = 0; } now += TICK_RATE_MS; }
    return runs; };
  const one = legs(1), five = legs(5);
  assert.ok(one.length >= 1 && one[0] >= 40 && one[0] <= 50, 'at scale 1 the first leg is ~45 ticks (50 boost at 1.1 a tick): ' + JSON.stringify(one));
  assert.ok(five.length >= 1 && five[0] >= 215 && five[0] <= 240, 'at scale 5 the first leg is ~227 ticks (250 boost): ' + JSON.stringify(five));
}));
