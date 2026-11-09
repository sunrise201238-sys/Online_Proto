// A map's boost scale (constants.js MAP_DATA boostScale, DEFAULT_BOOST_SCALE — 1 — where a map names none): District's gauge and
// refill five times, the bots' gates with them (user 2026-10-29), then Compound's (2026-10-30), and Blockade's from 2026-11-01 until
// 2026-11-03 (user: "remove the 5 times boost feature in Blockade": it plays at 1 again); every other
// map, scene and concept, plays at 1 (every map took 5 for part of 2026-11-01 and went back the same day, user: "keep current 5
// times boost ... for below map: Neon, Compound, District. Revert the boost amount and the BOT boost management gates to 1 time in
// other maps"). The fighter's gauge starts full at the scale, refills at the scale, keeps its scale through a Trio respawn; the
// plain brain's travel leg, the Sudden Death brain's tank valve and the commanded-travel latch read their levels at the scale (the
// Pursue latch's every bound at 5 is travel_sprint.test.js's).
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, tickBot, tickCommandDriver, setMoveOrder, getCommands, commandTargetIdOf, pickBotTargetId, emptyInput, respawnFighterNext, getArena, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
// (b1105eg: every lockRange doubled, Saori's to 112. The test marked atBand56 below laid its pursuit for her old band at 56 —
// it reads the gauge and the route, not the band — so it runs with her lock range at 56, put back when it ends.)
const atBand56 = (fn) => () => { const u = C.UNIT_DATA.unit1, was = u.lockRange; u.lockRange = 56; try { return fn(); } finally { u.lockRange = was; } };

const withDrain = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (the PT site's switch, where the tree has one)
const FIVE = ['compound', 'district'];   // (the maps that name 5 — Blockade's went on 2026-11-03)
const rescale = (f, k) => { f.boost = (f.boost / f.boostScale) * k; f.boostScale = k; };   // (a scale set by hand, the gauge with it)

test('boost scale: Compound and District five times, every other map at 1, Blockade among them since 2026-11-03 — every row of MAP_DATA, scene and concept, and a map with no row (the Shooting Range)', () => {
  assert.equal(C.DEFAULT_BOOST_SCALE, 1);
  for (const key of FIVE) assert.equal(C.MAP_DATA[key]?.boostScale, 5, `${key} names 5`);
  for (const key of Object.keys(C.MAP_DATA)) assert.equal(C.boostScaleOf(key), FIVE.includes(key) ? 5 : 1, key);
  assert.equal(C.boostScaleOf('range'), 1, 'the Shooting Range, the client\'s alone, has no row');
  const d = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit2', mode: '2v2' });
  for (const id of ['p1', 'p2', 'p3', 'p4']) { assert.equal(d.fighters[id].boostScale, 5, id); assert.equal(d.fighters[id].boost, 1250, id + ' boost'); }
  for (const [mapKey, k] of [['blockade', 1], ['compound', 5], ['town', 1], ['arena1', 1], ['station', 1]]) {
    const t = createMatchState({ mapKey, p1UnitKey: 'unit1', p2UnitKey: 'unit2' });
    for (const id of ['p1', 'p2']) { assert.equal(t.fighters[id].boostScale, k, `${mapKey} ${id}`); assert.equal(t.fighters[id].boost, 250 * k, `${mapKey} ${id} boost`); }
  }
});

test('boost scale: a Trio respawn keeps the dead unit\'s scale, the fresh unit\'s gauge full at it — 5 on Compound, 1 on Arena2', () => {
  const rosters = { p1: ['unit1', 'unit2', 'unit4'], p2: ['unit2', 'unit2', 'unit2'] };
  for (const [mapKey, k] of [['compound', 5], ['arena2', 1]]) {
    const m = createMatchState({ mapKey, mode: '1v1', rosters, startTime: 1000 });
    m.now = 1000; m.fighters.p1.hp = 0;
    const fresh = respawnFighterNext(m, 'p1', getArena(mapKey).spawns.p1);
    assert.ok(fresh, `${mapKey}: no respawn`);
    assert.equal(fresh.boostScale, k, mapKey); assert.equal(fresh.boost, 250 * k, `${mapKey} boost`);
  }
  // (a scale no map gives — the respawn carries the dead unit's own, it does not fall back to the map's or the default)
  const m = createMatchState({ mapKey: 'arena2', mode: '1v1', rosters, startTime: 1000 });
  m.now = 1000; m.fighters.p2.boostScale = 3; m.fighters.p2.hp = 0;
  const fresh2 = respawnFighterNext(m, 'p2', getArena('arena2').spawns.p2);
  assert.ok(fresh2, 'no second respawn');
  assert.equal(fresh2.boostScale, 3); assert.equal(fresh2.boost, 750);
});

test('boost scale: the Sudden Death brain\'s tank valve opens only at the full gauge at the scale — at 5 shut at 1,249, open at 1,250; at 1 at 249 and 250', () => withDrain(() => {
  const valve = (k) => { const m = createMatchState({ mapKey: 'factory', p1UnitKey: 'unit4', p2UnitKey: 'unit5', startTime: 1000, mode: '1v1' });
    for (const id of ['p1', 'p2']) { const f = m.fighters[id]; f.botSD = true; f.hp = 1; f.botControlled = true; f.invulnerableUntil = 0; rescale(f, k); }
    const p1 = m.fighters.p1; let now = 1000;
    for (let i = 0; i < 30; i += 1) { now += TICK_RATE_MS; tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); m.events.length = 0; }
    const at = (boost) => { p1.boost = boost; p1.botSDTankOpen = false; now += TICK_RATE_MS; tickBot(m, 'p1', now); return p1.botSDTankOpen; };
    return { k: p1.boostScale, under: at(250 * k - 1), full: at(250 * k) }; };
  const five = valve(5), one = valve(1);
  assert.equal(five.k, 5); assert.equal(five.under, false, 'shut a point under the full 1,250'); assert.equal(five.full, true, 'open at the full 1,250');
  assert.equal(one.k, 1); assert.equal(one.under, false, 'at scale 1 shut at 249'); assert.equal(one.full, true, 'at scale 1 open at 250');
}));

test('boost scale: commanded travel arms its dash at min(125, cap) times the scale and drops it under 50 times the scale plus a tick\'s drain', () => withDrain(() => {
  const latch = (k) => { const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
    const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.pos.x = -100; p1.pos.z = 0; p2.pos.x = 100; p2.pos.z = 60; p1.botControlled = true; p1.hp = 1e9; p2.hp = 1e9;
    for (const f of [p1, p2]) rescale(f, k);
    let now = 1000;
    assert.equal(setMoveOrder(m, 'p1', 100, -60, 0), true, 'the move order stands');
    for (let i = 0; i < 20; i += 1) { now += TICK_RATE_MS; p1.targetId = commandTargetIdOf(m, 'p1') ?? pickBotTargetId(m, p1) ?? p1.targetId; tickBot(m, 'p1', now); tickCommandDriver(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); m.events.length = 0; }
    const mv = getCommands(m, 'p1').move; assert.equal(mv.phase, 'travel', 'travelling');
    const at = (boost, armed) => { p1.boost = boost; mv.dashArmed = armed; p1.emptyRecoverUntil = 0; now += TICK_RATE_MS; tickCommandDriver(m, 'p1', now); return mv.dashArmed; };
    const arm = Math.min(C.CMD_TRAVEL_DASH_ARM, p1.unit.boostCap ?? C.BOOST_CAP) * k, floor = C.CMD_TRAVEL_BOOST_FLOOR * k, drain = p1.unit.boostDrain ?? C.BOOST_DASH_DRAIN_PER_TICK;
    return { k: p1.boostScale, arm, underArm: at(arm - 1, false), atArm: at(arm, false), overFloor: at(floor + drain + 0.5, true), underFloor: at(floor + drain - 0.5, true) }; };
  const five = latch(5), one = latch(1);
  assert.equal(five.k, 5); assert.equal(five.arm, 625, 'the arm at 5: 625');
  assert.equal(five.underArm, false, 'not armed at 624'); assert.equal(five.atArm, true, 'armed at 625');
  assert.equal(five.overFloor, true, 'still armed above 251.1'); assert.equal(five.underFloor, false, 'dropped under 251.1');
  assert.equal(one.k, 1); assert.equal(one.arm, 125);
  assert.equal(one.underArm, false); assert.equal(one.atArm, true); assert.equal(one.overFloor, true); assert.equal(one.underFloor, false);
}));

test('boost scale: the refill is five times a tick and the cap five times — District against Town, Town at 5 by hand alike', () => withDrain(() => {
  const run = (mapKey, k) => { const m = createMatchState({ mapKey, p1UnitKey: 'unit1', p2UnitKey: 'unit2', startTime: 1000 }); const f = m.fighters.p1; if (k != null) f.boostScale = k; f.boost = 0; f.refillPausedUntil = 0; f.grounded = true;
    tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, 1016, TICK_DT, []); const one = f.boost; for (let i = 0; i < 400; i += 1) tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, 1032 + i * TICK_RATE_MS, TICK_DT, []); return { one, full: f.boost }; };
  const t1 = run('town'), t5 = run('town', 5), d = run('district');
  assert.ok(Math.abs(d.one - 5 * t1.one) < 1e-9, `one tick: District ${d.one}, Town ${t1.one}`);
  assert.ok(t1.one > 4 && t1.one < 5, 'Town refills 4.59 a tick: ' + t1.one);
  assert.ok(Math.abs(t5.one - d.one) < 1e-9, `Town at 5 and District alike: ${t5.one}, ${d.one}`);
  assert.equal(d.full, 1250, 'District full'); assert.equal(t5.full, 1250, 'Town at 5 full'); assert.equal(t1.full, 250, 'Town full');
}));

test('boost scale: the plain brain\'s travel sprint leg runs the scaled reserve down to the scaled floor', atBand56(() => withDrain(() => {
  // (the travel sprint latch test's pursuit on Plain Field, the scale set by hand on the pursuer: a leg of 1250 -> 1000 at
  //  District's and Compound's 5, 250 -> 200 at Plain Field's own 1)
  const legs = (k) => { const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' }); const p1 = m.fighters.p1, p2 = m.fighters.p2;
    p1.pos.x = -100; p1.pos.z = 0; p2.pos.x = 100; p2.pos.z = 0; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9; p1.botControlled = true; p1.targetId = 'p2';
    p1.boostScale = k; p1.boost = 250 * k;
    let now = 1000; const runs = []; let len = 0;
    for (let i = 0; i < 600; i += 1) { tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); if (p1.action === 'dash') len += 1; else if (len) { runs.push(len); len = 0; } now += TICK_RATE_MS; }
    return runs; };
  const one = legs(1), five = legs(5);
  assert.ok(one.length >= 1 && one[0] >= 40 && one[0] <= 50, 'at scale 1 the first leg is ~45 ticks (50 boost at 1.1 a tick): ' + JSON.stringify(one));
  assert.ok(five.length >= 1 && five[0] >= 215 && five[0] <= 240, 'at scale 5 the first leg is ~227 ticks (250 boost): ' + JSON.stringify(five));
})));
