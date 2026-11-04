// The bots' body rules, one function for both hosts (ai.js botBodyRules; user 2026-11-04, "Implement option B"): the server's
// tickBot and the offline client's updateEnemy run it on whatever velocity the brain set, before the momentum is paid out.
// The hit-stun scales the brain's velocity and leaves the momentum, which the host's next step pays out unslowed (tickMatch
// online, applyMomentum offline): the offline client had slowed a sprinting bot's momentum too. The reload hold stands the
// unit: velocity and momentum gone, a sprint withdrawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { botBodyRules } from '../src/sim/ai.js';
import { applyMomentum } from '../src/sim/movement.js';

const sprinting = (now, extra = {}) => ({ vel: { x: 11.76, y: 0, z: 0 }, momentumVX: 17.6, momentumVZ: 0, momentumDecay: 0.9, hitStunUntil: 0, hitStunScale: 0.25, action: 'dash', ...extra });

test('bot body rules: the hit-stun slows the brain\'s velocity, and the momentum paid out after it is not slowed', () => {
  const now = 5000, me = sprinting(now, { hitStunUntil: now + 300 });
  botBodyRules(me.vel, me, {}, now);
  assert.equal(me.vel.x, 11.76 * 0.25, 'the brain\'s velocity at the move-scale');
  assert.equal(me.momentumVX, 17.6, 'the momentum untouched');
  assert.equal(me.action, 'dash', 'the sprint stands');
  applyMomentum(me);   // (the host's next step)
  assert.ok(Math.abs(me.vel.x - (11.76 * 0.25 + 17.6)) < 1e-9, `paid out on top: ${me.vel.x}`);
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
