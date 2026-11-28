import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, applyHitStun, UNIT_DATA, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot } from '../src/sim/ai.js';   // (the brain is the host's call; tickMatch alone moves the body)

// `stunImmune` (user 2026-10-23, for Kurumi): the one hit-stun routine leaves a unit that names it unslowed; a unit without the
// flag takes the stun, the heavier stun winning as before. No unit names it since b1105ma (user 2026-11-28: "Make kurumi immune
// to stun when the bullets hit the shield, but receive normal stun as others when directly hit." — her shield stops what it
// stops, shield.test.js, and a hit that reaches her stuns her as it stuns anyone); the field stays for any unit to carry.
test('a unit flagged stunImmune is never slowed by a hit; no unit is flagged since b1105ma', () => {
  for (const [key, u] of Object.entries(UNIT_DATA)) assert.ok(!u.stunImmune, key);
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const k = m.fighters.p1; k.unit = { ...k.unit, stunImmune: true };
  assert.equal(applyHitStun(k, k.unit, 100, 0.25, 1000), false);
  assert.equal(k.hitStunUntil, 0, 'stun written on an immune unit');
  assert.equal(k.lastHitAt, 1000, 'the hit itself is still stamped');
});

test('Kurumi takes the stun of a hit as any unit does (b1105ma)', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit15', startTime: 1000, mode: '1v1' });
  const k = m.fighters.p1, y = m.fighters.p2; assert.ok(!k.unit.stunImmune);
  assert.equal(applyHitStun(k, k.unit, 50, 0.625, 1000), true); assert.equal(applyHitStun(y, y.unit, 50, 0.625, 1000), true);
  assert.equal(k.hitStunUntil, 1050); assert.equal(k.hitStunScale, 0.625);
  assert.equal(k.hitStunUntil, y.hitStunUntil); assert.equal(k.hitStunScale, y.hitStunScale);
});

test('a unit without the flag takes the stun, and a heavier one replaces a running one', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit15', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const y = m.fighters.p1; assert.ok(!y.unit.stunImmune);
  assert.equal(applyHitStun(y, y.unit, 50, 0.5, 1000), true); assert.equal(y.hitStunUntil, 1050); assert.equal(y.hitStunScale, 0.5);
  assert.equal(applyHitStun(y, y.unit, 50, 0.85, 1010), false, 'a lighter stun does not replace a running one');
  assert.equal(applyHitStun(y, y.unit, 100, 0.25, 1010), true, 'a heavier stun replaces it'); assert.equal(y.hitStunUntil, 1110);
});

// (Kurumi's was 120 until b1105ly, user 2026-11-28: "Change Kurumi's health from 120 to 100" — with her shield; a unit whose data names another HP still spawns with it)
test('a fighter spawns with the HP its unit data names (100 for every unit since b1105ly)', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit4', startTime: 1000, mode: '1v1' });
  assert.equal(m.fighters.p1.hp, UNIT_DATA.unit17.hp); assert.equal(m.fighters.p2.hp, UNIT_DATA.unit4.hp); assert.equal(UNIT_DATA.unit17.hp, 100); assert.equal(UNIT_DATA.unit4.hp, 100);
  for (const [key, u] of Object.entries(UNIT_DATA)) assert.equal(u.hp ?? 100, 100, key);
  const saved = UNIT_DATA.unit17.hp; UNIT_DATA.unit17.hp = 130;
  try { assert.equal(createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit4', startTime: 1000, mode: '1v1' }).fighters.p1.hp, 130); } finally { UNIT_DATA.unit17.hp = saved; }
});

// (the bot here is made immune by hand since b1105ma: no unit's data names the flag, and the brain's reading of a hit must not need the stun)
test('a stun-immune bot still knows it was hit: the hit evade arms off the hit itself', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit17', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, bot = m.fighters.p2; p1.invulnerableUntil = 0; bot.invulnerableUntil = 0; p1.hp = 1e9; bot.hp = 1e9;
  bot.unit = { ...bot.unit, stunImmune: true };
  p1.pos.x = bot.pos.x + 30; p1.pos.z = bot.pos.z; let now = 1000;
  for (let t = 0; t < 60; t += 1) { tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS; }
  assert.ok(!(now < (bot.botHitEvadeUntil ?? 0)), 'evading before any hit');
  applyHitStun(bot, bot.unit, 100, 0.25, now); assert.equal(bot.hitStunUntil, 0, 'stunned although immune'); assert.equal(bot.lastHitAt, now);
  tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS;
  assert.ok(now < (bot.botHitEvadeUntil ?? 0), 'the hit evade did not arm on an immune bot');
  assert.equal(bot.botState, 'defense', 'Defense did not follow the hit: ' + bot.botState);
});
