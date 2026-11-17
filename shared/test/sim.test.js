import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
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
  getArena,
  UNIT_DATA
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
  // (each fighter starts at its unit's HP — 150 until 2026-08-17, 100 since)
  assert.ok(m.fighters.p1.unit.hp > 0);
  assert.equal(m.fighters.p1.hp, m.fighters.p1.unit.hp);
  assert.equal(m.fighters.p2.hp, m.fighters.p2.unit.hp);
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

// THE MACHINE GUNS' BULLETS (b1105jg, user 2026-11-17: "Change Hina damage to 3.5. Change Maki damage to 4."): a held trigger
// on a target standing 48 u away, read hit by hit off the target's HP. Every hit takes the unit's own damage and the last one
// what is left, so the hits to a full-HP kill are 100 over the damage, rounded up: Hina's 29 (25 at her 4 until then), Maki's
// 25 (23 at her 4.5). Hits are counted, not rounds: a round of an open cone that misses changes nothing here.
test('the machine guns\' bullets — Hina\'s takes 3.5 and Maki\'s 4 off a standing target, 29 and 25 hits to the kill (b1105jg)', () => {
  for (const [key, damage, hits] of [['unit5', 3.5, 29], ['unit21', 4, 25]]) {
    assert.equal(UNIT_DATA[key].damage, damage, `${key}: the table's damage`);
    assert.equal(Math.ceil(100 / damage), hits);
    const m = createMatchState({ p1UnitKey: key, p2UnitKey: 'unit1', startTime: 1000 });
    let now = 1000, hp = m.fighters.p2.hp;
    const drops = [];
    assert.equal(hp, 100);
    for (let i = 0; i < 4000 && m.fighters.p2.hp > 0; i += 1) {
      now += TICK_RATE_MS;
      tickMatch(m, { p1: { ...emptyInput(), shootHold: true }, p2: emptyInput() }, now, TICK_DT);
      if (m.fighters.p2.hp !== hp) { drops.push(hp - m.fighters.p2.hp); hp = m.fighters.p2.hp; }
    }
    assert.equal(m.fighters.p2.hp, 0, `${key}: the target still stands at ${m.fighters.p2.hp}`);
    assert.equal(drops.length, hits, `${key}: ${drops.length} hits to the kill`);
    for (const d of drops.slice(0, -1)) assert.equal(d, damage, `${key}: a hit took ${d}`);
    assert.equal(drops[drops.length - 1], 100 - damage * (hits - 1), `${key}: the last hit took ${drops[drops.length - 1]}`);
  }
});

// ARIS'S BOLT (b1105jo, user 2026-11-17: "Change Aris damage from 12 to 9."): the same reading for unit7. Every hit takes 9 and
// the last one the 1 that eleven hits leave, so a full-HP kill takes 12 hits (9 at her 12 until then) and a full magazine of 8
// carries 72 (96). WHEN the bolts leave is the gun's own beat and no chance: ten in a row 336 ms apart — the magazine's 8 and
// the 2 rounds that come back while it empties (one every 1200 ms from the first shot) — then each bolt waits for its round, so
// the 11th leaves 3616 ms after the first and the 12th 4816 ms: 4.82 s to the kill with every bolt landing, 2.69 s (the 9th)
// until then. Hits are counted, not bolts: a bolt of her open cone that misses changes nothing in the count.
test('Aris\'s bolt takes 9 off a standing target, 12 hits to the kill; ten bolts in a row, then one a round (b1105jo)', () => {
  const u = UNIT_DATA.unit7;
  assert.equal(u.damage, 9, 'the table\'s damage');
  assert.equal(Math.ceil(100 / u.damage), 12);
  assert.equal(u.magCapacity * u.damage, 72, 'a full magazine');
  const m = createMatchState({ p1UnitKey: 'unit7', p2UnitKey: 'unit1', startTime: 1000 });
  let now = 1000, hp = m.fighters.p2.hp, lastFire = m.fighters.p1.lastFireAt;
  const drops = [], fires = [];
  assert.equal(hp, 100);
  for (let i = 0; i < 4000 && m.fighters.p2.hp > 0; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, { p1: { ...emptyInput(), shootHold: true }, p2: emptyInput() }, now, TICK_DT);
    if (m.fighters.p1.lastFireAt !== lastFire) { lastFire = m.fighters.p1.lastFireAt; fires.push(lastFire); }
    if (m.fighters.p2.hp !== hp) { drops.push(hp - m.fighters.p2.hp); hp = m.fighters.p2.hp; }
  }
  assert.equal(m.fighters.p2.hp, 0, `the target still stands at ${m.fighters.p2.hp}`);
  assert.equal(drops.length, 12, `${drops.length} hits to the kill`);
  for (const d of drops.slice(0, -1)) assert.equal(d, 9, `a hit took ${d}`);
  assert.equal(drops[drops.length - 1], 1, `the last hit took ${drops[drops.length - 1]}`);
  assert.ok(fires.length >= 12, `${fires.length} bolts left`);
  assert.deepEqual(fires.slice(0, 12).map((t) => t - fires[0]),
    [0, 336, 672, 1008, 1344, 1680, 2016, 2352, 2688, 3024, 3616, 4816], 'when the first twelve bolts leave');
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
  // Run forward until the charge resolves (chargeMs, 1000 for unit3): the
  // shot fires on that tick. (Checked on that tick — the round crosses the
  // 48 u to p2 within a few ticks and is gone from the list.)
  const chargeMs = m.fighters.p1.unit.chargeMs ?? 1000;
  for (let i = 0; i < Math.ceil((chargeMs + 100) / TICK_RATE_MS) && m.fighters.p1.sniperChargeTargetId; i += 1) {
    now += TICK_RATE_MS;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT);
  }
  assert.equal(m.fighters.p1.sniperChargeTargetId, null);
  assert.ok(now - 1000 >= chargeMs, `the charge resolved early: ${now - 1000} ms`);
  assert.equal(m.fighters.p1.ammo, beforeAmmo - 1);
  // (b1105gz: no spawn protection at the match's start, so the round — 72 u a tick — crosses the 48 u and lands on p2 in the
  //  tick it is fired; until then p2 was immune for the match's first 3 s and the round flew on, still in the list here)
  assert.ok(m.projectiles.length > 0 || m.fighters.p2.hp < m.fighters.p2.unit.hp, 'expected the sniper round to be fired after the charge: in the air, or landed on p2');
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
