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
  assert.equal(trace[19][1], 0.04);                 // 20th shot: 0.04, the cap not reached yet
  assert.equal(trace[29][1], 0.06);                 // 30th shot reaches it: the whole 0.06 cap is bloom on a 0 base (b1105fw; 0.04 on the 0.02 base, from the 20th, until then)
  assert.equal(trace[trace.length - 1][1], 0.06);   // and never exceeds it
  assert.equal(effectiveSpread(p1.unit, p1.bloom), 0.06);
  // stop firing: bloom holds until 200 ms after the LAST SHOT, then drops at 0.035/s
  const lastShot = p1.lastFireAt; const atStop = p1.bloom;
  const idle = () => { tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS; };
  while (now - lastShot < 200) { idle(); assert.equal(p1.bloom, atStop, 'no recovery before the 200 ms delay'); }
  while (now - lastShot < 1200) idle();
  const expected = Math.max(0, atStop - 0.035 * ((now - lastShot) - 200) / 1000);
  assert.ok(Math.abs(p1.bloom - expected) < 0.0006, `bloom ${p1.bloom} vs ${expected}`);
});

test('Fubuki Mini-14: recovers between its 336 ms shots (no delay) — fire-time cone 0, 0.043, 0.086, 0.129, 0.172, 0.214, then a 0.243 steady under the 0.30 cap', () => {
  const { m, p1 } = duel('unit10', 30);
  let now = 1000, last = p1.lastFireAt; const cones = [];
  for (let i = 0; i < 3000 / TICK_RATE_MS; i += 1) {
    // the tick recovers first, then fires: reproduce that order to read the fire-time cone
    const atFire = effectiveSpread(p1.unit, bloomAfterTime(p1.unit, p1.bloom, now - p1.lastFireAt, TICK_DT));
    tickMatch(m, { p1: hold(), p2: emptyInput() }, now, TICK_DT, ['p2']);
    if (p1.lastFireAt !== last) { cones.push(+atFire.toFixed(3)); last = p1.lastFireAt; }
    now += TICK_RATE_MS;
  }
  assert.deepEqual(cones.slice(0, 6), [0, 0.043, 0.086, 0.129, 0.172, 0.214]);   // from a 0 base (b1105fw; 0.02 until then): +0.10 per shot, -0.057 between shots; the 0.30 cap not reached yet
  for (const c of cones.slice(6)) assert.ok(Math.abs(c - 0.243) < 0.001, 'steady ' + c);   // 0.243 once the cap clips the post-shot bloom (0.30 - 0.057), as on the old base
});

// b1105fx (user 2026-11-11: "Currently, when unit fires while standing still, the bloom wouldn't take effect. Make bloom take
// effect in any firing condition"): until then a shooter that had stood on the ground under 1 u/s for 200 ms added no bloom
// per shot and recovered with no delay, even mid-burst. Now standing is firing like any other.
test('standing still blooms as walking does: every shot adds its bloom, and the recovery waits out the delay after the last shot', () => {
  const spray = (walk) => {
    const { m, p1 } = duel('unit1', 30);
    let now = 1000, last = p1.lastFireAt; const seq = [];
    const step = (input) => { tickMatch(m, { p1: input(), p2: emptyInput() }, now, TICK_DT, ['p2']); p1.ammo = Math.max(p1.ammo, 2);
      if (p1.lastFireAt !== last) { seq.push(p1.bloom); last = p1.lastFireAt; } now += TICK_RATE_MS; };
    for (let i = 0; i < 320 / TICK_RATE_MS; i += 1) step(() => emptyInput());   // stand past the old 200 ms dwell first
    last = p1.lastFireAt; seq.length = 0;
    for (let i = 0; i < 2000 / TICK_RATE_MS; i += 1) step(() => hold(walk));   // hold the trigger, standing or walking
    const atStop = p1.bloom, held = [];
    while (now + TICK_RATE_MS - p1.lastFireAt < 200) { step(() => emptyInput()); held.push(p1.bloom); }   // let go, stand: inside the delay
    for (let i = 0; i < 1000 / TICK_RATE_MS; i += 1) step(() => emptyInput());
    return { seq, atStop, held, after: p1.bloom };
  };
  const still = spray(false), walk = spray(true);
  assert.ok(still.seq.length >= 15, 'shots ' + still.seq.length);
  assert.deepEqual(still.seq, walk.seq, 'standing = walking, shot for shot');
  still.seq.forEach((b, i) => assert.ok(Math.abs(b - Math.min(0.06, (i + 1) * UNIT_DATA.unit1.bloomPerShot)) < 1e-9, `standing, shot ${i}: ${b}`));   // the M4's 0.002 a shot toward its 0.06
  assert.ok(still.held.length >= 3 && still.held.every((b) => b === still.atStop), 'standing still: nothing drains inside the 200 ms after the last shot');
  assert.ok(still.after < still.atStop, 'then it drains at the recovery rate: ' + still.after);
  assert.equal(still.after, walk.after, 'and as fast as after a walk');
});

// Sprint held with no direction (user 2026-11-03): the unit stays put at speed 0 but sprints (action 'dash', the gauge
// drains) — it was not standing still, so its shots bloomed. No way of sprinting adds more than one bloomPerShot a shot:
// in place, with a direction, pressed into a wall or sliding along one (a wall's push-out zeroes the velocity, which used
// to count a sprinter there as still too), every sprint blooms shot for shot like a walk across open ground. (Since
// b1105fx there is no standing-still rule at all, so every way of firing blooms alike; the test keeps the one-bloom-a-shot
// check.)
test('sprinting in place blooms like any moving shooter; a sprint with a direction, in the open or at a wall, blooms no more than an open walk', () => {
  // p1 on arena1, 30 u from p2: stands past the 200 ms dwell, then holds the trigger and this move for `ms`; the bloom
  // right after each shot. `z` puts it by the arena's -z boundary (about -120), p2 alongside at -100.
  const shotBlooms = (unitKey, { moveX = 0, moveZ = 0, sprint = false, z = null, ms = 1000 } = {}) => {
    const { m, p1, p2 } = duel(unitKey, 30);
    if (z !== null) { p1.pos.z = z; p2.pos.z = -100; }
    let now = 1000, last = p1.lastFireAt; const seq = [], acts = new Set();
    const input = () => { const i = hold(false); i.moveX = moveX; i.moveZ = moveZ; if (sprint) i.boost = true; return i; };
    const run = (t, inp, rec = true) => { for (let i = 0; i < t / TICK_RATE_MS; i += 1) {
      tickMatch(m, { p1: inp(), p2: emptyInput() }, now, TICK_DT, ['p2']);
      p1.ammo = Math.max(p1.ammo, 2); p1.boost = Math.max(p1.boost, 50);   // the trigger rule, not the reload nor an empty gauge
      if (rec) { acts.add(p1.action); if (p1.lastFireAt !== last) { seq.push(p1.bloom); last = p1.lastFireAt; } }
      now += TICK_RATE_MS; } };
    run(320, () => emptyInput(), false);
    last = p1.lastFireAt;
    const x0 = p1.pos.x, z0 = p1.pos.z;
    run(ms, input);
    return { seq, acts: [...acts], p1, run, moved: Math.hypot(p1.pos.x - x0, p1.pos.z - z0) };
  };
  const oneShotAtMost = (seq, unitKey, label) => seq.forEach((b, i) =>
    assert.ok(b - (i ? seq[i - 1] : 0) <= UNIT_DATA[unitKey].bloomPerShot + 1e-12, `${unitKey} ${label}: shot ${i} adds more than one bloomPerShot`));
  for (const unitKey of ['unit1', 'unit4', 'unit7']) {
    const walk = shotBlooms(unitKey, { moveZ: 1 });
    const inPlace = shotBlooms(unitKey, { sprint: true });
    const sprintDir = shotBlooms(unitKey, { moveZ: 1, sprint: true });
    assert.deepEqual(inPlace.acts, ['dash'], unitKey + ' sprinting in place every tick');
    assert.ok(inPlace.moved < 0.01, unitKey + ' in place: moved ' + inPlace.moved);
    assert.ok(inPlace.seq.length >= 3, unitKey + ' shots ' + inPlace.seq.length);
    assert.ok(inPlace.seq.at(-1) > 0, unitKey + ' sprinting in place blooms: ' + inPlace.seq.at(-1));
    assert.deepEqual(inPlace.seq, walk.seq, unitKey + ' in place = an open walk, shot for shot');
    assert.deepEqual(sprintDir.seq, walk.seq, unitKey + ' a sprint with a direction blooms no more than a walk');
    oneShotAtMost(sprintDir.seq, unitKey, 'sprint with a direction');
  }
  for (const unitKey of ['unit1', 'unit4']) {
    const walk = shotBlooms(unitKey, { moveZ: 1 });
    const into = shotBlooms(unitKey, { moveZ: -1, sprint: true, z: -116 });
    const slide = shotBlooms(unitKey, { moveX: 0.6, moveZ: -0.8, sprint: true, z: -116 });
    const beside = shotBlooms(unitKey, { sprint: true, z: -118.85 });
    assert.ok(into.moved < 4, unitKey + ' into the wall: stopped by it, moved ' + into.moved);
    assert.ok(slide.moved > 10, unitKey + ' along the wall: slid ' + slide.moved);
    for (const [label, r] of [['into the wall', into], ['along the wall', slide], ['in place by the wall', beside]]) {
      assert.deepEqual(r.seq, walk.seq, `${unitKey} sprint ${label} = an open walk, shot for shot`);
      oneShotAtMost(r.seq, unitKey, 'sprint ' + label);
    }
  }
  // Letting go of the sprint and standing, the trigger still held: every shot keeps adding its bloomPerShot (b1105fx; until
  // then, past the 200 ms dwell, a standing shooter's shots added nothing and its bloom drained mid-burst).
  const after = shotBlooms('unit1', { sprint: true });
  assert.ok(after.p1.bloom > 0, 'carried bloom ' + after.p1.bloom);
  const settled = after.p1.bloom, from = after.seq.length;
  after.run(720, () => hold(false));
  const tail = after.seq.slice(from);
  assert.ok(tail.length >= 5, 'shots standing after the sprint ' + tail.length);
  tail.forEach((b, i) => assert.ok(Math.abs(b - Math.min(0.06, (i ? tail[i - 1] : settled) + UNIT_DATA.unit1.bloomPerShot)) < 1e-9,
    'standing after the sprint: shot ' + i + ' adds its bloomPerShot (' + b + ')'));
});

test('b1105fw: every base spread 0 but Aris\'s 0.02 (user 2026-11-11); a recovered cone puts a round on the aim line, the cones still grow to their caps', () => {
  for (const [k, u] of Object.entries(UNIT_DATA)) assert.equal(u.spreadAngle, k === 'unit7' ? 0.02 : 0, k);
  assert.equal(effectiveSpread(UNIT_DATA.unit1, 0), 0);
  assert.equal(effectiveSpread(UNIT_DATA.unit1, 1), UNIT_DATA.unit1.bloomCap);
  assert.equal(effectiveSpread(UNIT_DATA.unit7, 0), 0.02);
});

test('sure-hit closed form and the bot gate', () => {
  assert.equal(sureHitDistance(0.02), 160);
  assert.equal(+sureHitDistance(0.06).toFixed(1), 53.3);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0, 159), true);
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0.06, 60), false);   // M4 at cap, its 0.06 all bloom on a 0 base (b1105fw): sure-hit 53
  assert.equal(withinSureHit(UNIT_DATA.unit1, 0, 1e6), true);      // a recovered cone of 0: every round on the aim line
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
    p2.boost = 0;                     // ...nor the travel sprint: since the 2026-09-29 latch the bot would sprint the teleporting pair into the -x boundary wall by ~4.4 s and lose its shot line
    now += TICK_RATE_MS;
  }
  const gaps = fireTimes.slice(1).map((t, i) => t - fireTimes[i]);
  return { fireTimes, gaps, coneAtFire };
}

test('Koyuki bot at 80 u: no gate line in either mode (owner 2026-09-25), so the spray never pauses for the cone', () => {
  for (const mode of ['1v1', '2v2']) {
    const { gaps, fireTimes } = botRun('unit12', 80, 8000, mode);
    assert.ok(fireTimes.length >= 40, mode + ' shots ' + fireTimes.length);
    assert.deepEqual(gaps.slice(0, 40), Array(40).fill(112), mode);                // with the 33% line this run paused after round 23 (cone 0.1105 at 80 u)
  }
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
  assert.equal(botGateDistance(UNIT_DATA.unit12, 0.12), Infinity);                   // Koyuki: ungated (botGateWidth 0)
  assert.ok(Math.abs(botGateDistance(UNIT_DATA.unit10, 0.06) - 53.3) < 0.1);      // M14: sure-hit itself
  assert.equal(UNIT_DATA.unit13.botSuppressBurst, 10);                            // P90 keeps the 10-round suppress override
  assert.equal(UNIT_DATA.unit1.botSuppressBurst, undefined);                      // the rifles stay on the 5-round default
  // suppress bursts start only past a unit's base line: on a 0 base (b1105fw) there is none, so a recovered SMG fires at any
  // range with no burst (an SMG's burst started past 8.84 / 0.03 = 295 u until then); Aris, the one unit left on 0.02, keeps
  // hers (3.2 / 0.02 = 160 u) and her one-round burst
  const bot = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(UNIT_DATA.unit4, bot, 400), true);
  assert.equal(bot.botSuppressRemaining, 0);
  const aris = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(UNIT_DATA.unit7, aris, 400), true);
  assert.equal(aris.botSuppressRemaining, 1);
});

test('M14 bot at its 135 lock range: every shot pushes the cone past the line, so it fires once per full recovery', () => {
  // (at the old 56-unit band since b1105fw's 0 base, a second round goes 336 ms after the first from a 0.043 cone, whose
  // sure-hit line, 74.6, is still past the target: two rounds, then the hold; from 100 on, one round per full recovery)
  const { gaps, coneAtFire } = botRun('unit10', 135, 3000);
  assert.ok(gaps.length >= 4, 'gaps ' + gaps.length);
  for (const g of gaps) assert.ok(g >= 576 && g <= 624, 'gap ' + g);   // 0.1 / 0.17 = 0.59 s
  for (const c of coneAtFire) assert.equal(c, 0);                       // and always from the base cone (0 since b1105fw, 0.02 until then)
});

test('auto on a recovery hold releases at once when the target closes in', () => {
  const u = UNIT_DATA.unit13, bot = { bloom: 0.10, botSuppressRemaining: 0, botHoldDist: 0 };   // Marina, cone 0.10 (all bloom on her 0 base since b1105fw) -> 33% line 88.4 (Koyuki carried this test until she lost her gate, 2026-09-25)
  assert.equal(botMayFire(u, bot, 95), false);            // outside: hold begins, line frozen at 88.4
  assert.ok(bot.botHoldDist > 88 && bot.botHoldDist < 89);
  bot.bloom = 0.09;                                       // line drifts out to 98.2 — a static target must NOT release the hold
  assert.equal(botMayFire(u, bot, 95), false);
  assert.equal(botMayFire(u, bot, 85), true);             // but a target that closed in past the frozen line does
  assert.equal(bot.botHoldDist, 0);
  const m14 = { bloom: 0.07, botSuppressRemaining: 0, botHoldDist: 0 };   // marksman rifles take the same hold (cone 0.07 -> sure-hit line 45.7)
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), false);
  assert.ok(m14.botHoldDist > 0);
  m14.bloom = 0.03;                                       // line back out past the target: still holding
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), false);
  m14.bloom = 0;
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 56), true);
});

test('botMayFire state machine', () => {
  const u = UNIT_DATA.unit1, bot = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(u, bot, 100), true);           // a recovered cone: 0 on the 0 base (b1105fw), its line at infinity
  bot.bloom = 0.06;                                       // cone 0.06 -> 33% line 147
  assert.equal(botMayFire(u, bot, 160), false);           // outside, bloom up: hold
  bot.bloom = 0;
  assert.equal(botMayFire(u, bot, 500), true);            // recovered: fires at any range, and with no base line to be past, no burst
  assert.equal(bot.botSuppressRemaining, 0);
  // the burst, on Aris's 0.02 base, the one left (her line 3.2 / 0.02 = 160; the M4's 8.84 / 0.02 = 442 carried this until b1105fw)
  const a = UNIT_DATA.unit7, ab = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(a, ab, 100), true);            // inside her base line
  assert.equal(botMayFire(a, ab, 500), true);            // outside it, recovered: her one-round burst starts
  assert.equal(ab.botSuppressRemaining, 1);
  ab.bloom = 0.01;
  assert.equal(botMayFire(a, ab, 500), true);            // committed burst runs on
  ab.botSuppressRemaining = 0;
  assert.equal(botMayFire(a, ab, 500), false);           // burst spent, cone up: hold
  const m14 = { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(UNIT_DATA.unit10, m14, 200), true);   // Fubuki, recovered on a 0 base: fires, no burst
  assert.equal(m14.botSuppressRemaining, 0);
  assert.equal(botMayFire(UNIT_DATA.unit2, { bloom: 0, botSuppressRemaining: 0, botHoldDist: 0 }, 999), true);   // shotgun never gated
});

test('bot gate — Hina rides the autos\' 33%-hit line (b1105fe, user 2026-11-10)', () => {
  const u = UNIT_DATA.unit5;
  assert.equal(u.botGateWidth, undefined);                                        // the default, as the ARs and SMGs
  assert.ok(Math.abs(botGateDistance(u, 0.2) - 8.84 / 0.2) < 1e-9);
  const capped = { bloom: u.bloomCap - u.spreadAngle, botSuppressRemaining: 0, botHoldDist: 0 };
  assert.equal(botMayFire(u, capped, 400, '2v2'), false);                          // far past her line with the cone up: she holds
  assert.ok(capped.botHoldDist > 0);
});

test('bot gate — Koyuki and Maki are ungated in both modes (owner 2026-09-25; Hina too until b1105fe); a 1v1-only width would still be honoured', () => {
  for (const k of ['unit12', 'unit21']) {
    const u = UNIT_DATA[k];
    assert.equal(u.botGateWidth, 0);
    assert.equal(u.botGateWidth1v1, undefined);
    for (const mode of ['1v1', '2v2', undefined]) {
      assert.equal(botGateDistance(u, u.bloomCap, mode), Infinity);
      const capped = { bloom: u.bloomCap - u.spreadAngle, botSuppressRemaining: 0, botHoldDist: 0 };
      assert.equal(botMayFire(u, capped, 400, mode), true);          // keeps firing at any range with the cone at its cap
      assert.equal(capped.botHoldDist, 0);                            // and never enters a hold
    }
  }
  // The per-mode override: a synthetic unit ungated in 1v1 only.
  const synth = { ...UNIT_DATA.unit1, botGateWidth1v1: 0 };
  assert.equal(botGateDistance(synth, 0.06, '1v1'), Infinity);
  assert.ok(Math.abs(botGateDistance(synth, 0.06, '2v2') - 8.84 / 0.06) < 1e-9);
  // The other autos and the marksman rifles ignore the mode.
  assert.equal(UNIT_DATA.unit1.botGateWidth1v1, undefined);
  assert.equal(botGateDistance(UNIT_DATA.unit1, 0.06, '1v1'), botGateDistance(UNIT_DATA.unit1, 0.06, '2v2'));
  assert.equal(botGateDistance(UNIT_DATA.unit10, 0.06, '1v1'), botGateDistance(UNIT_DATA.unit10, 0.06, '2v2'));
});
