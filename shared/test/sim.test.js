import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState,
  buildSnapshot,
  tickMatch,
  tickBot,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  MAP_DATA,
  getArena
} from '../src/sim/index.js';

// Helper — assert no number in `obj` is NaN/±Infinity.
function assertFinite(obj, path = '') {
  if (obj == null) return;
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `${path} is not finite: ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) assertFinite(obj[i], `${path}[${i}]`);
    return;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key === 'unit') continue;          // contains nested numbers we trust
      if (typeof obj[key] === 'function') continue;
      assertFinite(obj[key], path ? `${path}.${key}` : key);
    }
  }
}


test('all online maps have arena collision data and spawns', () => {
  for (const mapKey of Object.keys(MAP_DATA)) {
    const arena = getArena(mapKey);
    assert.equal(arena.mapKey, mapKey);
    assert.ok(arena.obstacles.length > 0, `${mapKey} should have collision obstacles`);
    assert.ok(arena.spawns.p1 && arena.spawns.p2, `${mapKey} should have both player spawns`);
    assertFinite(arena.spawns, `${mapKey}.spawns`);
    const match = createMatchState({ mapKey, startTime: 1000 });
    assert.equal(match.mapKey, mapKey);
    assertFinite(match.fighters, `${mapKey}.fighters`);
    for (const surface of arena.surfaces) {
      assert.equal(typeof surface.heightAt, 'function', `${mapKey} surface should materialize heightAt`);
    }
  }
});

test('createMatchState produces valid initial state', () => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit2', startTime: 1000 });
  assert.equal(m.tick, 0);
  assert.equal(m.mapKey, 'arena1');
  assert.equal(m.fighters.p1.id, 'p1');
  assert.equal(m.fighters.p2.id, 'p2');
  assert.equal(m.fighters.p1.hp, 150);
  assert.equal(m.fighters.p2.hp, 150);
  assert.equal(m.projectiles.length, 0);
  assertFinite(m);
});

test('tickMatch advances tick counter and stays finite (no inputs)', () => {
  const m = createMatchState({ startTime: 1000 });
  let now = 1000;
  for (let i = 0; i < 100; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT);
  }
  assert.equal(m.tick, 100);
  assertFinite(m);
});

test('snapshot round-trips through JSON', () => {
  const m = createMatchState({ startTime: 1000 });
  const snap = buildSnapshot(m);
  const round = JSON.parse(JSON.stringify(snap));
  assert.equal(round.tick, snap.tick);
  assert.equal(round.fighters.p1.hp, snap.fighters.p1.hp);
  assert.equal(round.fighters.p2.hp, snap.fighters.p2.hp);
});

test('bot vs bot — 5000 ticks (~125s) without divergence', () => {
  const m = createMatchState({
    mapKey: 'arena1',
    p1UnitKey: 'unit1',  // MG
    p2UnitKey: 'unit3',  // Sniper
    startTime: 1000
  });
  let now = 1000;
  let totalEvents = { fired: 0, hit: 0, despawn: 0 };
  for (let i = 0; i < 5000; i += 1) {
    now += TICK_RATE_MS;
    tickBot(m, 'p1', now);
    tickBot(m, 'p2', now);
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT);
    for (const ev of m.events) {
      if (ev.type === 'fired') totalEvents.fired += 1;
      else if (ev.type === 'hit') totalEvents.hit += 1;
      else if (ev.type === 'despawn') totalEvents.despawn += 1;
    }
    assertFinite(m.fighters.p1.pos, `tick ${i} p1.pos`);
    assertFinite(m.fighters.p2.pos, `tick ${i} p2.pos`);
    if (m.fighters.p1.hp <= 0 || m.fighters.p2.hp <= 0) break;
  }
  // Sanity: at least one side fired something.
  assert.ok(totalEvents.fired > 0, 'no shots fired in 5000 ticks');
  // Sanity: HPs are valid.
  assert.ok(m.fighters.p1.hp >= 0 && m.fighters.p1.hp <= 150, `p1.hp out of range: ${m.fighters.p1.hp}`);
  assert.ok(m.fighters.p2.hp >= 0 && m.fighters.p2.hp <= 150, `p2.hp out of range: ${m.fighters.p2.hp}`);
});

test('mg burst — fighter shoots MG with shootHold input', () => {
  const m = createMatchState({ p1UnitKey: 'unit1', startTime: 1000 });
  let now = 1000;
  // Hold shoot for 1 second of game time.
  for (let i = 0; i < 40; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, {
      p1: { ...emptyInput(), shootHold: true },
      p2: emptyInput()
    }, now, TICK_DT);
  }
  // MG fires every 140ms; in 1000ms we expect ~7 shots.
  const fires = m.fighters.p1.unit.magCapacity - m.fighters.p1.ammo;
  assert.ok(fires >= 5 && fires <= 9, `expected ~7 MG fires in 1s, got ${fires}`);
});

test('sniper charge — initiates charge on shootTap', () => {
  const m = createMatchState({ p1UnitKey: 'unit3', startTime: 1000 });
  // Make p2 close enough to be in lock range (sniper lock = 120, default spawns are 48 apart).
  const beforeAmmo = m.fighters.p1.ammo;
  let now = 1000;
  // Single shoot tap.
  tickMatch(m, {
    p1: { ...emptyInput(), shootTap: true },
    p2: emptyInput()
  }, now, TICK_DT);
  // Sniper should have started charging — no projectile yet.
  assert.equal(m.projectiles.length, 0);
  assert.ok(m.fighters.p1.sniperChargeTargetId === 'p2', 'expected sniper charge to lock target');
  // Ammo only decrements when shot fires (not on charge start).
  assert.equal(m.fighters.p1.ammo, beforeAmmo);
  // Run forward 600ms — charge time is 500ms, so the shot should have fired.
  for (let i = 0; i < 24; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT);
  }
  assert.equal(m.fighters.p1.sniperChargeTargetId, null);
  assert.equal(m.fighters.p1.ammo, beforeAmmo - 1);
  assert.ok(m.projectiles.length > 0, 'expected sniper projectile to spawn after charge');
});

test('step (dodge) reduces incoming homing window', () => {
  const m = createMatchState({ p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  let now = 1000;
  // Move p1 close enough that lock acquires (default ~48 apart, mg lock 56).
  // Tap shoot from p1 at p2.
  tickMatch(m, {
    p1: { ...emptyInput(), shootTap: true },
    p2: emptyInput()
  }, now, TICK_DT);
  const projectileCount = m.projectiles.length;
  assert.ok(projectileCount > 0, 'expected MG shot to spawn');
  // Now p2 dodges.
  now += TICK_RATE_MS;
  tickMatch(m, {
    p1: emptyInput(),
    p2: { ...emptyInput(), stepTap: true, moveX: 1, moveZ: 0 }
  }, now, TICK_DT);
  // After step, all projectiles targeting p2 should have homing disabled.
  for (const p of m.projectiles) {
    if (p.targetId === 'p2') assert.equal(p.homing, false);
  }
});

test('boost regenerates while idle', () => {
  const m = createMatchState({ startTime: 1000 });
  // Drain boost by stepping.
  m.fighters.p1.boost = 50;
  let now = 1000;
  // Wait long enough for regen pause to elapse and refill to climb.
  for (let i = 0; i < 100; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT);
  }
  assert.ok(m.fighters.p1.boost > 50, `boost should regen when idle, got ${m.fighters.p1.boost}`);
});
