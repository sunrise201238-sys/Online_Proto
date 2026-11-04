// The bots' body rules, one function for both hosts (ai.js botBodyRules; user 2026-11-04, "Implement option B"): the server's
// tickBot and the offline client's updateEnemy run it on whatever velocity the brain set, before the momentum is paid out.
// The hit-stun scales the brain's velocity and leaves the momentum to the host's payout (tickMatch online, applyMomentum
// offline): the brain banked a sprint's momentum at the stun's move-scale already (nbrain.js), so a stunned sprinting bot runs
// at the scale of its sprint, as a stunned sprinting player does (user 2026-11-04). The reload hold stands the unit: velocity
// and momentum gone, a sprint withdrawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { botBodyRules } from '../src/sim/ai.js';
import { applyMomentum } from '../src/sim/movement.js';
import '../tools/maps/arena_files.mjs';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, tickBot, applyInput, emptyInput, getArena, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';

const sprinting = (now, extra = {}) => ({ vel: { x: 11.76, y: 0, z: 0 }, momentumVX: 17.6, momentumVZ: 0, momentumDecay: 0.9, hitStunUntil: 0, hitStunScale: 0.25, action: 'dash', ...extra });

test('bot body rules: the hit-stun slows the brain\'s velocity and leaves the momentum — banked by the brain at the same scale — to the host\'s payout', () => {
  const now = 5000, banked = 11.76 * 1.5 * 0.25, me = sprinting(now, { hitStunUntil: now + 300, momentumVX: banked });   // (nbrain.js banks a stunned sprint's momentum at the scale)
  botBodyRules(me.vel, me, {}, now);
  assert.equal(me.vel.x, 11.76 * 0.25, 'the brain\'s velocity at the move-scale');
  assert.equal(me.momentumVX, banked, 'the momentum left as banked');
  assert.equal(me.action, 'dash', 'the sprint stands');
  applyMomentum(me);   // (the host's next step)
  assert.ok(Math.abs(me.vel.x - 0.25 * (11.76 + 11.76 * 1.5)) < 1e-9, `the whole sprint at the move-scale: ${me.vel.x}`);
});

test('bot body rules: no stun running, nothing changes', () => {
  const now = 5000, me = sprinting(now, { hitStunUntil: now });   // (the stun's last moment is past at its end)
  botBodyRules(me.vel, me, {}, now);
  assert.equal(me.vel.x, 11.76); assert.equal(me.momentumVX, 17.6); assert.equal(me.action, 'dash');
});

test('bot body rules: the reload hold stands the unit — velocity and momentum gone, the sprint withdrawn', () => {
  const now = 5000, me = sprinting(now, { reloadingUntil: now + 500, hitStunUntil: now + 300 });
  botBodyRules(me.vel, me, { reloadHolds: true }, now);
  assert.equal(me.vel.x, 0); assert.equal(me.vel.z, 0); assert.equal(me.momentumVX, 0); assert.equal(me.action, 'idle');
  const free = sprinting(now, { reloadingUntil: now + 500 });
  botBodyRules(free.vel, free, {}, now);   // (a unit without the field reloads on the move)
  assert.equal(free.vel.x, 11.76); assert.equal(free.action, 'dash');
});

// A stunned sprint, player and bot, on the server's sim (the offline hosts run the same orders: updatePlayer as applyInput,
// updateEnemy as tickBot + tickMatch): a hit's stun at 0.25 and its momentum cut, then the speed while the sprint goes on.
const withGauge = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = true; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (a full gauge throughout, where the tree has the switch)
function playerStunnedSprint() {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, a = getArena('arena1'); let now = 2000, free = null, stunned = null;
  for (let i = 0; i < 8; i += 1) {
    now += TICK_RATE_MS; f.boost = 250;
    if (i === 4) { free = Math.hypot(f.vel.x, f.vel.z); f.hitStunUntil = now + 300; f.hitStunScale = 0.25; f.momentumVX = 0; f.momentumVZ = 0; }
    applyInput(m, f, { ...emptyInput(), moveX: 1, moveZ: 0, boost: true }, now, a.obstacles, a.surfaces);
    if (i === 7) stunned = Math.hypot(f.vel.x, f.vel.z);
  }
  return { free, stunned };
}
function botStunnedSprint() {
  const m = createMatchState({ mapKey: 'arena1', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const me = m.fighters.p2, en = m.fighters.p1;
  me.hp = en.hp = 1e9; me.botControlled = true; me.targetId = 'p1'; en.pos.x = -100; en.pos.z = -90; me.pos.x = 95; me.pos.z = 85;
  let now = 1000, free = null, n = 0;
  for (let i = 0; i < 600; i += 1) {
    now += TICK_RATE_MS; me.boost = 250;
    tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, TICK_DT, ['p2']); m.events.length = 0;
    const sp = Math.hypot(me.vel.x, me.vel.z);
    if (free == null) { if (me.action === 'dash' && sp > 25 && i > 60) { free = sp; me.hitStunUntil = now + 300; me.hitStunScale = 0.25; me.momentumVX = 0; me.momentumVZ = 0; } continue; }
    if (me.action === 'dash' && (n += 1) === 3) return { free, stunned: sp };
  }
  return { free, stunned: null };
}

test('a stunned sprint: the bot runs at the move-scale of its sprint, as the player does', () => withGauge(() => {
  const p = playerStunnedSprint(), b = botStunnedSprint();
  assert.ok(p.free > 25 && b.free > 25, `both sprinting before the hit (player ${p.free?.toFixed(2)}, bot ${b.free?.toFixed(2)})`);
  assert.ok(b.stunned != null, 'the bot sprinted on under the stun');
  assert.ok(Math.abs(p.stunned - 0.25 * p.free) < 0.05, `player ${p.stunned.toFixed(2)} of ${p.free.toFixed(2)}`);
  assert.ok(Math.abs(b.stunned - 0.25 * b.free) < 0.05, `bot ${b.stunned.toFixed(2)} of ${b.free.toFixed(2)}`);
  assert.ok(Math.abs(b.stunned - p.stunned) < 0.05, `bot ${b.stunned.toFixed(2)} vs player ${p.stunned.toFixed(2)}`);
}));
