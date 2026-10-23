import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, applyHitStun, UNIT_DATA, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot } from '../src/sim/ai.js';   // (the brain is the host's call; tickMatch alone moves the body)

// Kurumi's shield (user 2026-10-23): 150 HP from her unit data, and `stunImmune` — the one hit-stun routine leaves her
// unslowed; a unit without the flag takes the stun, the heavier stun winning as before.
test('a unit flagged stunImmune is never slowed by a hit', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const k = m.fighters.p1; assert.ok(k.unit.stunImmune);
  assert.equal(applyHitStun(k, k.unit, 100, 0.25, 1000), false);
  assert.equal(k.hitStunUntil, 0, 'stun written on an immune unit');
});

test('a unit without the flag takes the stun, and a heavier one replaces a running one', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit15', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const y = m.fighters.p1; assert.ok(!y.unit.stunImmune);
  assert.equal(applyHitStun(y, y.unit, 50, 0.5, 1000), true); assert.equal(y.hitStunUntil, 1050); assert.equal(y.hitStunScale, 0.5);
  assert.equal(applyHitStun(y, y.unit, 50, 0.85, 1010), false, 'a lighter stun does not replace a running one');
  assert.equal(applyHitStun(y, y.unit, 100, 0.25, 1010), true, 'a heavier stun replaces it'); assert.equal(y.hitStunUntil, 1110);
});

test('Kurumi spawns with the 150 HP her data names; the others with 100', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit17', p2UnitKey: 'unit4', startTime: 1000, mode: '1v1' });
  assert.equal(m.fighters.p1.hp, 150); assert.equal(m.fighters.p2.hp, 100); assert.equal(UNIT_DATA.unit17.hp, 150);
});

test('a stun-immune bot still knows it was hit: the hit evade arms off the hit itself', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit17', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, bot = m.fighters.p2; p1.invulnerableUntil = 0; bot.invulnerableUntil = 0; p1.hp = 1e9; bot.hp = 1e9;
  p1.pos.x = bot.pos.x + 30; p1.pos.z = bot.pos.z; let now = 1000;
  for (let t = 0; t < 60; t += 1) { tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS; }
  assert.ok(!(now < (bot.botHitEvadeUntil ?? 0)), 'evading before any hit');
  applyHitStun(bot, bot.unit, 100, 0.25, now); assert.equal(bot.hitStunUntil, 0, 'stunned although immune'); assert.equal(bot.lastHitAt, now);
  tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS;
  assert.ok(now < (bot.botHitEvadeUntil ?? 0), 'the hit evade did not arm on an immune bot');
  assert.equal(bot.botState, 'defense', 'Defense did not follow the hit: ' + bot.botState);
});
