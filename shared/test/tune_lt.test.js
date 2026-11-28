// b1105lt (user 2026-11-27, PT and 1.0.0, on the random pools' reading of b1105ls: "1. change iori cool down after shot from 1sec
// back to 0.75sec. 2. change Aris damage from 9 to 12. 3. change Fubuki damage from 10 to 12. 4. change Hina bloom per shot to
// 0.005. 5. change Hina bloom cap to 0.25."): Hina's cone, Fubuki's round, and what Iori's quicker beat leaves of a round's bloom.
// Iori's beat itself is in tune_lo.test.js and Aris's bolt in sim.test.js, where their old numbers were held.
// (b1105mi, user 2026-11-28, after four settings tried on PT: "Hina / Bloom per shot 0.008 / Cap 0.25 / recover 0.05 / PT and 1.0.0 (online and offline)." — her cone's test below holds
// those: 0.008 a round where b1105lt gave 0.005, the cap its 0.25, and 0.05 a second back where it came back 0.06.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, effectiveSpread, bloomAfterTime, botGateDistance, sureHitDistance } from '../src/sim/index.js';

const duel = (shooter, dist, targetHp = 1e9) => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: shooter, p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -dist / 2; p1.pos.z = 0; p2.pos.x = dist / 2; p2.pos.z = 0;
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; if (targetHp) p2.hp = targetHp; p1.targetId = 'p2';
  return { m, p1, p2 };
};
const fire = () => { const i = emptyInput(); i.shootHold = true; i.shootTap = true; return i; };
// a held trigger: the cone each round leaves from and when it leaves. The tick recovers first, then fires: the same order here reads the fire-time cone
const spray = (shooter, dist, rounds) => {
  const { m, p1 } = duel(shooter, dist);
  let now = 1000, last = p1.lastFireAt; const cones = [], at = [];
  for (let i = 0; i < 20000 / TICK_RATE_MS && cones.length < rounds; i += 1) {
    const before = effectiveSpread(p1.unit, bloomAfterTime(p1.unit, p1.bloom, now - p1.lastFireAt, TICK_DT));
    tickMatch(m, { p1: fire(), p2: emptyInput() }, now, TICK_DT, []);
    if (p1.lastFireAt !== last) { last = p1.lastFireAt; cones.push(before); at.push(now); }
    now += TICK_RATE_MS;
  }
  return { m, p1, cones, at, now };
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("Hina's cone opens by 0.008 a round up to 0.25: the 33rd round is the first from the cap, 1.54 s into the spray, and it is back at nothing 5.2 s after the last round", () => {
  const u = UNIT_DATA.unit5;
  assert.equal(u.bloomPerShot, 0.008);                                                       // b1105mi; 0.005 from b1105lt, 0.0045 from b1105lo, 0.003 before
  assert.equal(u.bloomCap, 0.25);                                                            // 0.16 from b1105fz
  assert.equal(u.spreadAngle, 0); assert.equal(u.bloomRecoverDelayMs, 200);                  // as they were
  assert.equal(u.bloomRecoverPerSec, 0.05);                                                  // b1105mi; 0.06 from b1105fz
  const { m, p1, cones, at, now: end } = spray('unit5', 20, 60);
  assert.equal(cones.length, 60);
  for (let n = 1; n <= 60; n += 1) assert.ok(near(cones[n - 1], Math.min(0.25, 0.008 * (n - 1))), `round ${n} left from ${cones[n - 1]}`);
  assert.ok(cones[31] < 0.25 - 1e-9 && near(cones[32], 0.25));                               // the 32nd still opening (0.248), the 33rd at the cap
  assert.equal(at[32] - at[0], 1536);                                                        // thirty-two 48 ms beats (the 51st round and 2400 ms at 0.005)
  // the lines at the cap: a sure hit inside 12.8 u, and a bot's 20% line at 45.7 u (20 and 71.4 at the 0.16 cap)
  assert.ok(near(sureHitDistance(u.bloomCap), 12.8));
  assert.ok(near(botGateDistance(u, u.bloomCap), 11.42 / 0.25));
  // the trigger let go at the cap: the cone waits out the 200 ms and is 0 again 5 s after that (4.17 s at 0.06 a second)
  let now = end, cleared = null; const last = p1.lastFireAt;
  for (let i = 0; i < 8000 / TICK_RATE_MS && cleared === null; i += 1) {
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, []);
    if (p1.bloom <= 1e-9) cleared = now - last;
    now += TICK_RATE_MS;
  }
  assert.ok(cleared !== null && Math.abs(cleared - (200 + 1000 * 0.25 / 0.05)) <= 2 * TICK_RATE_MS, 'cleared after ' + cleared + ' ms');
});

test("Fubuki's round takes 12 off a standing target: 9 hits to the kill, the 9th round 2.69 s after the first", () => {
  const u = UNIT_DATA.unit10;
  assert.equal(u.damage, 12);                                                                // 10 from PT b1105dd, 13 before
  assert.equal(Math.ceil(100 / u.damage), 9);
  assert.equal(u.fireCooldownMs > 320 && u.fireCooldownMs <= 336, true);                     // the 336 ms slot
  // a tap a slot, so every round leaves its 336 ms after the last; at 10 u every one of them lands (her widest cone, 0.30, is sure inside 10.7)
  const { m, p1, p2 } = duel('unit10', 10, 0);
  assert.equal(p2.hp, 100);
  let now = 1000, hp = p2.hp, last = p1.lastFireAt; const drops = [], at = [];
  for (let i = 0; i < 8000 / TICK_RATE_MS && p2.hp > 0; i += 1) {
    tickMatch(m, { p1: fire(), p2: emptyInput() }, now, TICK_DT, []);
    if (p1.lastFireAt !== last) { last = p1.lastFireAt; at.push(now); }
    if (p2.hp !== hp) { drops.push(hp - p2.hp); hp = p2.hp; }
    now += TICK_RATE_MS;
  }
  assert.equal(p2.hp, 0);
  assert.deepEqual(drops, [12, 12, 12, 12, 12, 12, 12, 12, 4]);
  assert.equal(at.length, 9);
  assert.equal(at[8] - at[0], 2688);                                                         // eight 336 ms slots (3024, the 10th round, at her 10)
});

test("Iori's 0.75 s beat leaves a part of every round's bloom: a held trigger's rounds leave from 0, 0.022, 0.044, 0.066, 0.089", () => {
  const u = UNIT_DATA.unit20;
  assert.equal(u.fireCooldownMs, 750); assert.equal(u.bloomPerShot, 0.15); assert.equal(u.bloomRecoverPerSec, 0.17); assert.equal(u.bloomRecoverDelayMs, 0);
  // a round's 0.15 takes 0.88 s to clear and the next one leaves 0.752 s after it: each leaves 0.0222 behind (0.15 less 0.17 x 0.752).
  // At the 1 s of b1105lo to b1105ls the whole of it cleared, as the 0.10 a round added before b1105lo did at 0.75 s.
  const { cones, at } = spray('unit20', 40, u.magCapacity);
  assert.equal(cones.length, 5);
  for (let n = 1; n < 5; n += 1) assert.equal(at[n] - at[n - 1], 752);
  const left = 0.15 - 0.17 * 0.752;
  for (let n = 0; n < 5; n += 1) assert.ok(near(cones[n], n * left, 1e-6), `round ${n + 1} left from ${cones[n]}`);
  assert.ok(sureHitDistance(cones[1]) > u.lockRange && sureHitDistance(cones[2]) < u.lockRange);   // the 2nd round still a sure hit at her whole 135 lock (144 u); the 3rd inside 72 u, the 4th 48, the 5th 36
  assert.ok(Math.abs(sureHitDistance(cones[4]) - 36.1) < 0.1);
});
