// Defense's commits by trigger (nbrain.js BOT_DEFENSE_*_MS; user 2026-11-01, "change these three to 1,500 ms (keep their
// categories)"): a hit commits 1,500 ms, a hit while the locked enemy's sniper charges commits 1,500 ms, and the anti-glint
// dodge's follow-through runs 1,500 ms past the step's end. One hit's whole Defense is the hit's 350 ms evade window — every tick
// of it re-arms the commit — and then the commit: about 1.85 s on open ground. Plain Field, the bot 120 u from a still enemy.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';

const withDrain = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (the PT site's switch, where the tree has one)

function duel() {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -60; p1.pos.z = 0; p2.pos.x = 60; p2.pos.z = 0; p1.hp = 1e9; p2.hp = 1e9; p1.botControlled = true; p1.targetId = 'p2';
  let now = 1000;
  const tick = (before) => { now += TICK_RATE_MS; before?.(now); tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); m.events.length = 0; return now; };
  for (let i = 0; i < 40; i += 1) tick();   // (settled into its pursuit)
  return { m, p1, p2, tick };
}

test('Defense commit: a hit commits 1,500 ms, and one hit\'s whole Defense is the 350 ms evade window and then the commit', () => withDrain(() => {
  const { p1, tick } = duel();
  let hitAt = null;
  tick((now) => { hitAt = now; p1.lastHitAt = now; });
  assert.equal(p1.botState, 'defense', 'the hit starts Defense');
  assert.equal(p1.botDefenseUntil - hitAt, 1500, 'the commit at the hit');
  let end = null;
  for (let i = 0; i < 300 && end == null; i += 1) { const now = tick(); if (p1.botState !== 'defense') end = now; }
  assert.ok(end != null, 'Defense ends');
  const ran = end - hitAt;
  assert.ok(ran >= 350 + 1500 - 2 * TICK_RATE_MS && ran <= 350 + 1500 + 2 * TICK_RATE_MS, `one hit's Defense ${ran} ms (the window, then the commit)`);
}));

test('Defense commit: a hit while the locked enemy\'s sniper charges at the bot commits 1,500 ms', () => withDrain(() => {
  const { p1, p2, tick } = duel();
  let hitAt = null;
  tick((now) => { hitAt = now; p2.sniperChargeTargetId = 'p1'; p2.sniperChargeUntil = now + 3000; p1.lastHitAt = now; });
  assert.equal(p1.botState, 'defense', 'the hit starts Defense');
  assert.equal(p1.botDefenseUntil - hitAt, 1500, 'the sniper-charge commit at the hit');
}));

test('Defense commit: the anti-glint dodge\'s follow-through runs 1,500 ms past the step\'s end', () => withDrain(() => {
  const { p1, p2, tick } = duel();
  let stepped = false;
  for (let i = 0; i < 200 && !stepped; i += 1) {
    const su = p1.stepUntil ?? 0;
    const now = tick((t) => { p2.sniperChargeTargetId = 'p1'; p2.sniperChargeUntil = 1000 + 3000 + 40 * TICK_RATE_MS; });
    if ((p1.stepUntil ?? 0) > su && p1.stepUntil > now) stepped = true;
  }
  assert.ok(stepped, 'the bot dodged the glint');
  assert.equal(p1.botState, 'defense', 'the dodge hands over to Defense');
  assert.equal(p1.botDefenseUntil - p1.stepUntil, 1500, 'the follow-through past the step');
}));
