import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, reloadHolds, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot } from '../src/sim/ai.js';   // (the sim's tickMatch moves a bot's body; the brain is the host's call, as the server makes it)

// The reload hold (user 2026-10-23, Kurumi's UMP45): a unit whose data says `reloadHolds` neither walks nor sprints while
// its magazine is being changed; a unit without the flag walks through its reload as before. The hold is the unit's
// reloadMs long and ends with the magazine refilled.
// (no pickable unit carries the flag since 2026-10-23 — Kurumi had it for an hour — so the tests set it on the fighter's own copy)
function emptied(unitKey, holds) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: unitKey, p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.unit = { ...p1.unit, reloadHolds: !!holds }; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p2.pos.x = p1.pos.x + 300; p2.pos.z = p1.pos.z; p1.ammo = 0;   // (the magazine just emptied: tickAmmo starts the reload)
  return { m, p1 };
}
const walk = (m, p1, ms, now) => { const x0 = p1.pos.x; for (let t = 0; t < ms; t += TICK_RATE_MS) { const inp = emptyInput(); inp.moveX = 1; inp.boost = true; tickMatch(m, { p1: inp, p2: emptyInput() }, now.t, TICK_DT, []); now.t += TICK_RATE_MS; } return p1.pos.x - x0; };

test('a unit flagged reloadHolds stands for its reload, then walks on with a full magazine', () => {
  const { m, p1 } = emptied('unit17', true); const now = { t: 1000 }; const reloadMs = p1.unit.reloadMs;
  assert.ok(p1.unit.reloadHolds, 'the flag is on');
  const during = walk(m, p1, reloadMs - 100, now);
  assert.ok(reloadHolds(p1.unit, p1, now.t), 'still reloading at the end of the window');
  assert.ok(Math.abs(during) < 0.5, `moved ${during.toFixed(2)} u while reloading`);
  const after = walk(m, p1, 600, now);
  assert.equal(p1.ammo, p1.unit.magCapacity, 'the magazine is full again');
  assert.ok(after > 4, `did not walk on after the reload: ${after.toFixed(2)} u in 0.6 s`);
});

test('a unit without the flag walks through its reload', () => {
  const { m, p1 } = emptied('unit15', false); const now = { t: 1000 };
  assert.ok(!p1.unit.reloadHolds);
  const during = walk(m, p1, 800, now);
  assert.ok(during > 4, `held without the flag: ${during.toFixed(2)} u in 0.8 s`);
});

test('the dodge stays open during a held reload', () => {
  const { m, p1 } = emptied('unit17', true); const now = { t: 1000 };
  const inp = emptyInput(); inp.moveX = 1; tickMatch(m, { p1: inp, p2: emptyInput() }, now.t, TICK_DT, []); now.t += TICK_RATE_MS;   // (the reload starts)
  const x0 = p1.pos.x; const tap = emptyInput(); tap.moveX = 1; tap.stepTap = true; tickMatch(m, { p1: tap, p2: emptyInput() }, now.t, TICK_DT, []); now.t += TICK_RATE_MS;
  for (let t = 0; t < 400; t += TICK_RATE_MS) { const i = emptyInput(); i.moveX = 1; tickMatch(m, { p1: i, p2: emptyInput() }, now.t, TICK_DT, []); now.t += TICK_RATE_MS; }
  assert.ok(reloadHolds(p1.unit, p1, now.t), 'still reloading');
  assert.ok(p1.pos.x - x0 > 6, `the dodge did not carry her: ${(p1.pos.x - x0).toFixed(2)} u`);
});

test('a bot flagged reloadHolds stands for its reload with no sprint on the books: no boost drained, no dash action', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit17', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, bot = m.fighters.p2; p1.invulnerableUntil = 0; bot.invulnerableUntil = 0; p1.hp = 1e9; bot.hp = 1e9; bot.unit = { ...bot.unit, reloadHolds: true };
  p1.pos.x = bot.pos.x + 120; p1.pos.z = bot.pos.z;   // (the target well outside the 40 u lock: the brain wants to close in at a sprint)
  bot.ammo = 0; const x0 = bot.pos.x, z0 = bot.pos.z, boost0 = bot.boost; let now = 1000;
  for (let t = 0; t < 1200; t += TICK_RATE_MS) { tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p2']); now += TICK_RATE_MS; }
  assert.ok(reloadHolds(bot.unit, bot, now), 'still reloading');
  assert.ok(Math.hypot(bot.pos.x - x0, bot.pos.z - z0) < 0.5, 'the bot moved while reloading');
  assert.notEqual(bot.action, 'dash', 'a dash left on the books while standing');
  assert.ok(bot.boost >= boost0 - 1, `boost drained while standing: ${boost0} -> ${bot.boost}`);
});
