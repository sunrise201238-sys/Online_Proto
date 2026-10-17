// Lag compensation (shared/src/sim/history.js): a human's round is aimed at and
// tested against the body its client had drawn — the server's world of viewAt —
// over its whole flight; bots, offline and older clients read the live body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, LAG_COMP_MAX_MS } from '../src/sim/index.js';
import { bodyAt } from '../src/sim/history.js';

const START = 1000;
function setup() {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: START });
  for (const f of Object.values(m.fighters)) {
    f.invulnerableUntil = 0;
    f.unit = { ...f.unit, spreadAngle: 0, bloomCap: 0 };   // an exact line: the round flies where it is aimed
  }
  return m;
}
// p2 walks across p1's line of fire; p1 stands. Returns the clock.
function across(m) {
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  const ax = p2.pos.x - p1.pos.x, az = p2.pos.z - p1.pos.z, len = Math.hypot(ax, az);
  const i = emptyInput(); i.moveX = -az / len; i.moveZ = ax / len;
  return i;
}
function tick(m, now, p1In, p2In, botIds = null) { tickMatch(m, { p1: p1In ?? emptyInput(), p2: p2In ?? emptyInput() }, now, TICK_DT, botIds); }

test('a human round is aimed at the body its client had drawn, and lands on it', () => {
  const m = setup();
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  let now = START;
  for (let k = 0; k < 40; k += 1) { now += TICK_RATE_MS; tick(m, now, null, across(m)); }
  const lag = 6 * TICK_RATE_MS;                     // 96 ms, under the cap; p2 walks about 1 u in it
  const fireAt = now + TICK_RATE_MS;
  const seen = bodyAt(m, p2, lag, fireAt);          // the body the shooter's screen showed
  const live = { ...p2.pos };                        // where p2 really is at the trigger
  assert.ok(Math.hypot(seen.pos.x - live.x, seen.pos.z - live.z) > 0.5, 'p2 has walked clear of its old spot');
  const fire = emptyInput(); fire.shootTap = true; fire.viewAt = fireAt - lag;
  now = fireAt; tick(m, now, fire, across(m));
  assert.ok(m.events.some((e) => e.type === 'fired' && e.ownerId === 'p1'), 'p1 fired');
  assert.equal(m.lagMs.p1, lag);
  const round = m.projectiles.find((p) => p.ownerId === 'p1');
  assert.ok(round, 'the round is in the air after its first tick');
  assert.equal(round.lagMs, lag);
  const aim = Math.atan2(round.vel.z, round.vel.x);
  const toSeen = Math.atan2(seen.pos.z - p1.pos.z, seen.pos.x - p1.pos.x);
  const toLive = Math.atan2(live.z - p1.pos.z, live.x - p1.pos.x);
  assert.ok(Math.abs(aim - toSeen) < 1e-6, `aimed at the body seen (${aim} vs ${toSeen})`);
  assert.ok(Math.abs(aim - toLive) > 0.01, 'not at the live body');
  let hit = null;
  for (let k = 0; k < 20 && !hit; k += 1) {
    now += TICK_RATE_MS; tick(m, now, null, across(m));
    hit = m.events.find((e) => e.type === 'hit' && e.targetId === 'p2');
  }
  assert.ok(hit, 'the round hit p2');
  const bodyThen = bodyAt(m, p2, lag, now);           // the body the shooter's screen shows at the moment of the hit
  assert.deepEqual(hit.pos, bodyThen.pos, 'the hit is on the body the shooter saw');
  assert.ok(Math.hypot(hit.pos.x - p2.pos.x, hit.pos.z - p2.pos.z) > 0.5, 'which is not where p2 stands now');
  assert.ok(p2.hp < m.fighters.p1.hp, 'the live p2 took the damage');
});

test('the lag is the frame\'s own, clamped, and a bot has none', () => {
  const m = setup();
  let now = START + TICK_RATE_MS;
  const far = emptyInput(); far.viewAt = now - 5000;
  tick(m, now, far, null);
  assert.equal(m.lagMs.p1, LAG_COMP_MAX_MS);
  assert.equal(m.lagMs.p2, 0);                       // no viewAt: the present
  now += TICK_RATE_MS;
  const future = emptyInput(); future.viewAt = now + 1000;
  const near = emptyInput(); near.viewAt = now - 48;
  tick(m, now, future, near);
  assert.equal(m.lagMs.p1, 0);
  assert.equal(m.lagMs.p2, 48);
  now += TICK_RATE_MS;
  tick(m, now, null, near, ['p2']);                  // p2 bot-driven: applyInput skipped, its lag is not written
  assert.equal(m.lagMs.p2, 48);
  assert.equal(bodyAt(m, m.fighters.p2, 0, now), m.fighters.p2, 'lag 0 is the live fighter');
});

test('a body\'s past is its own: a new fighter object starts a new record', () => {
  const m = setup();
  let now = START;
  for (let k = 0; k < 20; k += 1) { now += TICK_RATE_MS; tick(m, now, null, across(m)); }
  const old = m.fighters.p2;
  const oldPast = bodyAt(m, old, 160, now);
  assert.notEqual(oldPast, old);
  assert.ok(Math.hypot(oldPast.pos.x - old.pos.x, oldPast.pos.z - old.pos.z) > 1);
  const fresh = { ...old, pos: { ...old.pos } };     // what a Trio respawn does: a new object in the slot
  m.fighters.p2 = fresh;
  now += TICK_RATE_MS; tick(m, now, null, null);
  const body = bodyAt(m, fresh, 160, now);
  assert.deepEqual({ x: body.pos.x, z: body.pos.z }, { x: fresh.pos.x, z: fresh.pos.z }, 'no older body than its own first record');
});
