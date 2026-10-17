import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA,
  effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit
} from '../src/sim/index.js';

const hold = (walk = true) => { const i = emptyInput(); i.shootHold = true; i.shootTap = true; if (walk) i.moveZ = 1; return i; };   // walking: bloom applies
function duel(unitKey, dist) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: unitKey, p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = p2.pos.x + dist; p1.pos.z = p2.pos.z;
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p2.hp = 1e9; p1.hp = 1e9;
  return { m, p1, p2 };
}

test('horizontal spread is gone from every unit and bloom defaults are filled in', () => {
  for (const u of Object.values(UNIT_DATA)) {
    assert.equal(u.horizontalAngle, undefined, u.id);
    assert.equal(u.horizontalTriggerRange, undefined, u.id);
    assert.equal(typeof u.bloomPerShot, 'number', u.id);
    assert.ok(u.bloomCap >= u.spreadAngle, u.id);
  }
  assert.equal(UNIT_DATA.unit2.bloomPerShot, 0);                 // shotgun: no bloom
  assert.equal(effectiveSpread(UNIT_DATA.unit2, 0.5), UNIT_DATA.unit2.spreadAngle);
});

test('M4 hold-fire: +0.002 per shot, frozen inside the burst, capped at 0.06, recovers 200 ms after the last shot', () => {
  const { m, p1, p2 } = duel('unit1', 30);
  let now = 1000, shots = 0, last = p1.lastFireAt;
  const trace = [];
  for (let i = 0; i < 4000 / TICK_RATE_MS; i += 1) {
    tickMatch(m, { p1: hold(), p2: emptyInput() }, now, TICK_DT, ['p2']);
    if (p1.lastFireAt !== last) { shots += 1; last = p1.lastFireAt; trace.push([shots, +p1.bloom.toFixed(4)]); }
    p1.ammo = Math.max(p1.ammo, 2);
    now += TICK_RATE_MS;
  }
  assert.ok(shots >= 30, 'fired ' + shots);
  assert.equal(trace[0][1], 0.002);                 // after the 1st shot
  assert.equal(trace[9][1], 0.02);                  // after 10 shots, no recovery inside the burst (96 ms < 200 ms delay)
  assert.equal(trace[19][1], 0.04);                 // 20th shot reaches the cap (0.06 - 0.02)
  assert.equal(trace[trace.length - 1][1], 0.04);   // and never exceeds it
  assert.equal(effectiveSpread(p1.unit, p1.bloom), 0.06);
  // stop firing: bloom holds until 200 ms after the LAST SHOT, then drops at 0.035/s
  const lastShot = p1.lastFireAt; const atStop = p1.bloom;
  const idle = () => { tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS; };
  while (now - lastShot < 200) { idle(); assert.equal(p1.bloom, atStop, 'no recovery before the 200 ms delay'); }
  while (now - lastShot < 1200) idle();
  const expected = Math.max(0, atStop - 0.035 * ((now - lastShot) - 200) / 1000);
  assert.ok(Math.abs(p1.bloom - expected) < 0.0006, `bloom ${p1.bloom} vs ${expected}`);
});

test('Fubuki Mini-14: recovers between its 336 ms shots (no delay) — fire-time cone 0.02, 0.063, 0.106, 0.149, then climbs to a ~0.24 steady under the 0.30 cap', () => {
  const { m, p1 } = duel('unit10', 30);
  let now = 1000, last = p1.lastFireAt; const cones = [];
  for (let i = 0; i < 3000 / TICK_RATE_MS; i += 1) {
    // the tick recovers first, then fires: reproduce that order to read the fire-time cone
    const atFire = effectiveSpread(p1.unit, bloomAfterTime(p1.unit, p1.bloom, now - p1.lastFireAt, TICK_DT));
    tickMatch(m, { p1: hold(), p2: emptyInput() }, now, TICK_DT, ['p2']);
    if (p1.lastFireAt !== last) { cones.push(+atFire.toFixed(3)); last = p1.lastFireAt; }
    now += TICK_RATE_MS;
  }
  assert.deepEqual(cones.slice(0, 4), [0.02, 0.063, 0.106, 0.149]);   // +0.10 per shot, -0.057 between shots; the 0.30 cap is not reached yet
  for (const c of cones.slice(4)) assert.ok(c > 0.19 && c <= 0.3, 'steady ' + c);   // 0.192, 0.235, then ~0.243 once the cap clips the post-shot bloom
});

test('standing still: no bloom per shot, and recovery runs even mid-burst', () => {
  const { m, p1 } = duel('unit1', 30);
  let now = 1000;
  const run = (ms, input) => { for (let i = 0; i < ms / TICK_RATE_MS; i += 1) { tickMatch(m, { p1: input(), p2: emptyInput() }, now, TICK_DT, ['p2']); p1.ammo = Math.max(p1.ammo, 2); now += TICK_RATE_MS; } };
  run(320, () => emptyInput());                          // stand for the 200 ms dwell
  run(2000, () => hold(false));                          // hold fire without moving
  assert.equal(p1.bloom, 0, 'no bloom while standing still');
  run(1000, () => hold(true));                           // walk and fire: bloom builds
  const walked = p1.bloom; assert.ok(walked >= 0.018, 'walking bloom ' + walked);
  const atStop = now;
  run(192, () => hold(false));                           // stop but keep firing: inside the dwell shots still bloom
  assert.ok(p1.bloom >= walked, 'dwell keeps the old rule');
  run(400, () => hold(false));                           // past the dwell: recovery runs mid-burst, shots add nothing
  assert.ok(p1.bloom < walked, 'recovering while firing: ' + p1.bloom);
  run(1200, () => hold(false));
  assert.equal(p1.bloom, 0, 'fully recovered while still firing');
  void atStop;
});

test('sure-hit closed form', () => {
  assert.equal(sureHitDistance(0.02), 160);
  assert.equal(+sureHitDistance(0.06).toFixed(1), 53.3);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0, 159), true);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0.04, 60), false);   // M4 at cap: sure-hit 53
  assert.equal(withinSureHit(UNIT_DATA.unit2, 0, 999), true);       // shotgun: pattern, never gated
  assert.equal(withinSureHit(UNIT_DATA.unit3, 0, 999), true);       // sniper: never gated
});
