import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA,
  effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit
} from '../src/sim/index.js';

const hold = () => { const i = emptyInput(); i.shootHold = true; i.shootTap = true; return i; };
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

test('M14: recovers between its 336 ms shots (no delay) — fire-time cone 0.02, 0.063, 0.106, 0.143, then steady', () => {
  const { m, p1 } = duel('unit10', 30);
  let now = 1000, last = p1.lastFireAt; const cones = [];
  for (let i = 0; i < 3000 / TICK_RATE_MS; i += 1) {
    // the tick recovers first, then fires: reproduce that order to read the fire-time cone
    const atFire = effectiveSpread(p1.unit, bloomAfterTime(p1.unit, p1.bloom, now - p1.lastFireAt, TICK_DT));
    tickMatch(m, { p1: hold(), p2: emptyInput() }, now, TICK_DT, ['p2']);
    if (p1.lastFireAt !== last) { cones.push(+atFire.toFixed(3)); last = p1.lastFireAt; }
    now += TICK_RATE_MS;
  }
  assert.deepEqual(cones.slice(0, 4), [0.02, 0.063, 0.106, 0.143]);
  for (const c of cones.slice(4)) assert.ok(c > 0.14 && c <= 0.2, 'steady ' + c);
});

test('sure-hit closed form and the bot gate', () => {
  assert.equal(sureHitDistance(0.02), 160);
  assert.equal(+sureHitDistance(0.06).toFixed(1), 53.3);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0, 159), true);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0.04, 60), false);   // M4 at cap: sure-hit 53
  assert.equal(withinSureHit(UNIT_DATA.unit2, 0, 999), true);       // shotgun: pattern, never gated
  assert.equal(withinSureHit(UNIT_DATA.unit3, 0, 999), true);       // sniper: never gated
});

test('RPK bot at its 80-unit band: an opening burst at full rate, then it holds until the cone recovers', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit16', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p2.pos.x = p1.pos.x + 80; p2.pos.z = p1.pos.z; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p2.botControlled = true;
  let now = 1000, last = p2.lastFireAt; const fireTimes = [];
  for (let i = 0; i < 3000 / TICK_RATE_MS; i += 1) {
    p1.pos.x = p2.pos.x - 80; p1.pos.z = p2.pos.z;      // pin the target at exactly 80 units
    p1.vel.x = 0; p1.vel.z = 0;
    tickBot(m, 'p2', now);
    tickMatch(m, { p1: emptyInput() }, now, TICK_DT, ['p2']);
    if (p2.lastFireAt !== last) { fireTimes.push(now); last = p2.lastFireAt; assert.ok(sureHitDistance(effectiveSpread(p2.unit, p2.bloom) - p2.unit.bloomPerShot) >= 80 - 1e-6, 'fired outside sure-hit'); }
    now += TICK_RATE_MS;
  }
  const gaps = fireTimes.slice(1).map((t, i) => t - fireTimes[i]);
  assert.ok(fireTimes.length >= 8, 'shots ' + fireTimes.length);
  const firstPause = gaps.findIndex((g) => g >= 200);
  assert.ok(firstPause === 4 || firstPause === 5, 'first bloom pause after shot ' + (firstPause + 1));   // stop line SA 0.040 at 80 u
  for (const g of gaps.slice(0, firstPause)) assert.equal(g, 112);   // the opening burst runs at the mechanical slot
  assert.ok(Math.max(...gaps.slice(firstPause)) < 600, 'trickle resumes');
});
