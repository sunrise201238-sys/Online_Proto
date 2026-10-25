import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, attemptFire, tickMatch, emptyInput, UNIT_DATA, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot } from '../src/sim/ai.js';

// The blast's reach (user 2026-10-25, PT first): a gun carrying `pelletRange` loses its volley once the centre has flown
// that far from the muzzle, and a bot holding it does not fire at a target beyond it. A gun without the field is untouched.

function duel(p1UnitKey, p2UnitKey, apart) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey, p2UnitKey, startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  for (const f of [p1, p2]) { f.invulnerableUntil = 0; f.hp = 1e9; }
  p2.pos.x = p1.pos.x + apart; p2.pos.z = p1.pos.z; p2.pos.y = p1.pos.y;
  p1.targetId = 'p2'; p2.targetId = 'p1';
  return m;
}

// One shot from p1 at p2, then the match ticked until the round is gone: the flown distances seen while it lived, the
// despawn reason, and the ticks it took.
function flyOne(m, botIds = []) {
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000;
  assert.equal(attemptFire(m, m.fighters.p1, m.fighters.p2, now), true, 'no round left the gun');
  const round = m.projectiles.find((q) => q.ownerId === 'p1');
  assert.ok(round, 'no round in the list');
  const id = round.id;
  const sx = round.pos.x, sy = round.pos.y, sz = round.pos.z;
  let flown = 0, reason = null, ticks = 0;
  while (reason === null && ticks < 400) {
    now += TICK_RATE_MS; ticks += 1;
    tickMatch(m, inputs, now, TICK_DT, botIds);
    const p = m.projectiles.find((q) => q.id === id);
    if (p) flown = Math.hypot(p.pos.x - sx, p.pos.y - sy, p.pos.z - sz);
    const ev = m.events.find((e) => e.type === 'despawn' && e.id === id);
    if (ev) reason = ev.reason;
  }
  return { flown, reason, ticks };
}

test('a shotgun volley dies at pelletRange, not at the 2.2 s TTL', () => {
  const u = UNIT_DATA.unit2; assert.equal(u.spreadCount, 8); assert.equal(u.pelletRange, 100);
  const r = flyOne(duel('unit2', 'unit1', 400));
  assert.equal(r.reason, 'range', 'the volley ended on ' + r.reason);
  // (the last position seen alive is short of the line by at most one tick of flight)
  assert.ok(r.flown < u.pelletRange, 'alive past the reach: ' + r.flown.toFixed(1));
  assert.ok(r.flown >= u.pelletRange - u.projectileSpeed * TICK_DT * 1.5, 'died well short of the reach: ' + r.flown.toFixed(1));
  assert.ok(r.ticks <= Math.ceil(u.pelletRange / (u.projectileSpeed * TICK_DT)) + 2, 'took ' + r.ticks + ' ticks');
});

test('a gun without pelletRange flies as before: past 100 units, to the TTL or a hit', () => {
  assert.equal(UNIT_DATA.unit1.pelletRange, undefined);
  const r = flyOne(duel('unit1', 'unit2', 400));
  assert.notEqual(r.reason, 'range');
  // (Plain Field's boundary stops it at ~144 u; the point is that it passed the shotgun's 100 u line)
  assert.ok(r.flown > UNIT_DATA.unit2.pelletRange, 'a rifle round stopped at ' + r.flown.toFixed(1));
});

test('a shotgun bot holds fire on a target beyond pelletRange, and fires once it is within', () => {
  const m = duel('unit1', 'unit2', 150);          // p2, the bot, holds the shotgun; p1 stands 150 u away in the open
  const bot = m.fighters.p2, target = m.fighters.p1;
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  // (shots are read off the fighter's own counter: the brain fires inside tickBot, and tickMatch clears the event list)
  let now = 1000, minDist = Infinity;
  for (let t = 0; t < 90; t += 1) {
    now += TICK_RATE_MS;
    tickBot(m, 'p2', now); tickMatch(m, inputs, now, TICK_DT, ['p2']);
    const d = Math.hypot(target.pos.x - bot.pos.x, target.pos.y - bot.pos.y, target.pos.z - bot.pos.z); if (d < minDist) minDist = d;
  }
  assert.ok(minDist > bot.unit.pelletRange, 'the bot closed inside the reach during the hold test: ' + minDist.toFixed(1));
  assert.equal(bot.shotsFired, 0, 'the shotgun bot fired ' + bot.shotsFired + ' times at a target beyond its reach');
  // The target steps in to 60 u: the bot fires within a few seconds.
  target.pos.x = bot.pos.x + 60; target.pos.z = bot.pos.z;
  for (let t = 0; t < 300 && bot.shotsFired === 0; t += 1) {
    now += TICK_RATE_MS;
    tickBot(m, 'p2', now); tickMatch(m, inputs, now, TICK_DT, ['p2']);
  }
  assert.ok(bot.shotsFired > 0, 'the shotgun bot never fired at a target 60 u away');
});
