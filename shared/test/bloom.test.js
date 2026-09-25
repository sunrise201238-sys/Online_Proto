import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, BOT_GATE_WIDTH_AUTO,
  effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit, botGateDistance, botMayFire
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

test('sure-hit closed form and the bot gate', () => {
  assert.equal(sureHitDistance(0.02), 160);
  assert.equal(+sureHitDistance(0.06).toFixed(1), 53.3);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0, 159), true);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0.04, 60), false);   // M4 at cap: sure-hit 53
  assert.equal(withinSureHit(UNIT_DATA.unit2, 0, 999), true);       // shotgun: pattern, never gated
  assert.equal(withinSureHit(UNIT_DATA.unit3, 0, 999), true);       // sniper: never gated
});

// Bot harness: p2 is the bot, p1 the pinned target at `dist` units.
function botRun(botUnit, dist, ms, mode = '1v1') {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: botUnit, startTime: 1000, mode });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p2.pos.x = p1.pos.x + dist; p2.pos.z = p1.pos.z; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p2.botControlled = true;
  let now = 1000, last = p2.lastFireAt; const fireTimes = [], coneAtFire = [];
  for (let i = 0; i < ms / TICK_RATE_MS; i += 1) {
    p1.pos.x = p2.pos.x - dist; p1.pos.z = p2.pos.z; p1.vel.x = 0; p1.vel.z = 0;
    const cone = effectiveSpread(p2.unit, p2.bloom);
    tickBot(m, 'p2', now);
    tickMatch(m, { p1: emptyInput() }, now, TICK_DT, ['p2']);
    if (p2.lastFireAt !== last) { fireTimes.push(now); coneAtFire.push(cone); last = p2.lastFireAt; }
    p2.ammo = Math.max(p2.ammo, 2);   // measure the trigger rule, not the reload
    now += TICK_RATE_MS;
  }
  const gaps = fireTimes.slice(1).map((t, i) => t - fireTimes[i]);
  return { fireTimes, gaps, coneAtFire };
}

test('Koyuki bot at 80 u in 2v2 (33% line): a 23-round burst at full rate, then a full recovery, then the same burst again (no trickle)', () => {
  const { gaps, coneAtFire } = botRun('unit12', 80, 8000, '2v2');
  const firstPause = gaps.findIndex((g) => g >= 200);
  assert.equal(firstPause, 22, 'first pause after shot ' + (firstPause + 1));   // 33% line at 80 u = cone 0.1105: round 23 leaves at 0.108, round 24 would be 0.112
  for (const g of gaps.slice(0, firstPause)) assert.equal(g, 112);
  // full recovery: 200 ms delay + 0.092 / 0.03 = ~3270 ms, then the burst restarts at the base cone
  assert.ok(gaps[firstPause] >= 3264 && gaps[firstPause] <= 3400, 'recovery pause ' + gaps[firstPause]);
  assert.equal(coneAtFire[firstPause + 1], 0.02);
  for (const g of gaps.slice(firstPause + 1, firstPause + 5)) assert.equal(g, 112);
});

test('Koyuki bot at 80 u in 1v1: no gate line (owner 2026-09-25), so the same run never pauses for the cone', () => {
  const { gaps, fireTimes } = botRun('unit12', 80, 8000, '1v1');
  assert.ok(fireTimes.length >= 40, 'shots ' + fireTimes.length);
  assert.deepEqual(gaps.slice(0, 40), Array(40).fill(112));                       // straight through where the 2v2 run paused after round 23
});

test('evo3 bot at 100 u: the 33% line at its cap (110) is past the target, so the gate never trips and the old burst / rest rhythm runs', () => {
  const { gaps, fireTimes } = botRun('unit4', 100, 5000);
  assert.ok(fireTimes.length >= 40, 'shots ' + fireTimes.length);
  assert.deepEqual(gaps.slice(0, 29), Array(29).fill(64));                         // the whole 30-round fire cap at the 64 ms slot
  assert.ok(gaps[29] >= 780 && gaps[29] <= 1600, 'old-rhythm rest ' + gaps[29]);  // botFireCap reached: ~0.8-1.5 s rest (no gate hold)
  assert.deepEqual(gaps.slice(30, 39), Array(9).fill(64));                         // and the next burst
});

test('gate lines: autos 8.84 / cone (one round in three on a standing target), marksman rifles 3.2 / cone (sure-hit)', () => {
  assert.equal(BOT_GATE_WIDTH_AUTO, 8.84);
  assert.equal(UNIT_DATA.unit1.botGateWidth, undefined);                          // autos ride the default
  assert.equal(UNIT_DATA.unit10.botGateWidth, 3.2);
  assert.equal(UNIT_DATA.unit7.botGateWidth, 3.2);
  assert.ok(Math.abs(botGateDistance(UNIT_DATA.unit1, 0.06) - 147.3) < 0.1);       // M4 at cap: 2.76x its 53 sure-hit
  assert.ok(Math.abs(botGateDistance(UNIT_DATA.unit12, 0.12) - 73.7) < 0.1);      // RPK at cap: the near edge of its 73-87 band
  assert.ok(Math.abs(botGateDistance(UNIT_DATA.unit10, 0.06) - 53.3) < 0.1);      // M14: sure-hit itself
  assert.equal(UNIT_DATA.unit13.botSuppressBurst, 10);                            // P90 keeps the 10-round suppress override
  assert.equal(UNIT_DATA.unit1.botSuppressBurst, undefined);                      // the rifles stay on the 5-round default
  // suppress bursts for an SMG start only past its base line (8.84 / 0.03 = 295 u)
  const bot = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(UNIT_DATA.unit4, bot, 400), true);
  assert.equal(bot.botSuppressRemaining, 10);
});

test('M14 bot at its 56-unit band: every shot pushes the cone past the line, so it fires once per full recovery', () => {
  const { gaps, coneAtFire } = botRun('unit10', 56, 3000);
  assert.ok(gaps.length >= 4, 'gaps ' + gaps.length);
  for (const g of gaps) assert.ok(g >= 576 && g <= 624, 'gap ' + g);   // 0.1 / 0.17 = 0.59 s
  for (const c of coneAtFire) assert.equal(c, 0.02);                    // and always from the base cone
});

test('auto on a recovery hold releases at once when the target closes in', () => {
  const u = UNIT_DATA.unit12, bot = { bloom: 0.09, botSuppressRemaining: 0, botHoldDist: 0 };   // RPK, cone 0.11 -> 33% line 80.4
  assert.equal(botMayFire(u, bot, 85), false);            // outside: hold begins, line frozen at 80.4
  assert.ok(bot.botHoldDist > 80 && bot.botHoldDist < 81);
  bot.bloom = 0.08;                                       // line drifts out to 88 — a static target must NOT release the hold
  assert.equal(botMayFire(u, bot, 85), false);
  assert.equal(botMayFire(u, bot, 78), true);             // but a target that closed in past the frozen line does
  assert.equal(bot.botHoldDist, 0);
  const m14 = { bloom: 0.05, botSuppressRemaining: 0, botHoldDist: 0 };   // marksman rifles take the same hold
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), false);
  assert.ok(m14.botHoldDist > 0);
  m14.bloom = 0.03;                                       // line back out past the target: still holding
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), false);
  m14.bloom = 0;
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), true);
});

test('botMayFire state machine', () => {
  const u = UNIT_DATA.unit1, bot = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(u, bot, 100), true);           // inside the base line (8.84 / 0.02 = 442)
  bot.bloom = 0.04;                                       // cone 0.06 -> 33% line 147
  assert.equal(botMayFire(u, bot, 160), false);           // outside, bloom up: hold
  bot.bloom = 0;
  assert.equal(botMayFire(u, bot, 500), true);            // outside the base line, recovered: burst starts
  assert.equal(bot.botSuppressRemaining, 5);
  bot.bloom = 0.01;
  assert.equal(botMayFire(u, bot, 500), true);            // committed burst runs on
  bot.botSuppressRemaining = 0;
  assert.equal(botMayFire(u, bot, 500), false);           // burst spent, cone up: hold
  const m14 = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 200), true);
  assert.equal(m14.botSuppressRemaining, 1);
  assert.equal(botMayFire(UNIT_DATA.unit2, { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 }, 999), true);   // shotgun never gated
});

test('bot gate — Koyuki and Hina are ungated in 1v1, on the 33% line in 2v2 (owner 2026-09-25)', () => {
  for (const k of ['unit12', 'unit5']) {
    const u = UNIT_DATA[k];
    assert.equal(u.botGateWidth1v1, 0);
    assert.equal(botGateDistance(u, u.bloomCap, '1v1'), Infinity);                              // no line in 1v1 …
    assert.ok(Math.abs(botGateDistance(u, u.bloomCap, '2v2') - 8.84 / u.bloomCap) < 1e-9);       // … the autos' 33% line in 2v2
    assert.ok(Math.abs(botGateDistance(u, u.bloomCap) - 8.84 / u.bloomCap) < 1e-9);              // no mode given: the 2v2 / default width
    const capped = { bloom: u.bloomCap - u.spreadAngle, botSuppressRemaining: 0, botHoldDist: 0 };
    assert.equal(botMayFire(u, { ...capped }, 400, '1v1'), true);      // 1v1: keeps firing at any range with the cone at its cap
    const b2 = { ...capped };
    assert.equal(botMayFire(u, b2, 400, '2v2'), false);               // 2v2: outside the capped line, bloom up -> hold
    assert.ok(b2.botHoldDist > 0);
  }
  // The other autos and the marksman rifles ignore the mode.
  assert.equal(UNIT_DATA.unit1.botGateWidth1v1, undefined);
  assert.equal(botGateDistance(UNIT_DATA.unit1, 0.06, '1v1'), botGateDistance(UNIT_DATA.unit1, 0.06, '2v2'));
  assert.equal(botGateDistance(UNIT_DATA.unit10, 0.06, '1v1'), botGateDistance(UNIT_DATA.unit10, 0.06, '2v2'));
});
