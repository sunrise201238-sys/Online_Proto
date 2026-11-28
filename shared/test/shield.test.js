// THE SHIELD (shared/src/sim/shield.js, b1105ly; user 2026-11-28: "Add a simple geometry cbox for kurumi's shield. Which would block bullets
// for her.", "Apply Kurumi's shield to 1.0.0 (online and offline)", "Oh and Kurumi's health as well"): what is shot at Kurumi and meets her
// shield's box before it meets her is stopped. The server takes the box's place from the motion her state says she is in and from her
// heading, as the client's model shows them: up in front of her while she fires or moves, down at her left while she stands, down while she
// reloads. These tests fly real rounds, pellets and beams at her through tickMatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, buildSnapshotFor, TICK_RATE_MS, TICK_DT, UNIT_DATA } from '../src/sim/index.js';
import { shieldFrameOf, shieldEntryT, shieldPosesOf } from '../src/sim/shield.js';
import { SHIELD_POSES } from '../src/sim/shield_poses.js';
import { bodyAt } from '../src/sim/history.js';

const START = 1000;
// p1 (the shooter) at -dist/2 on x, p2 (Kurumi unless told) at +dist/2, each locked on the other; exact lines (no cone); nobody dies
function duel(shooter = 'unit1', dist = 22, target = 'unit17') {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: shooter, p2UnitKey: target, startTime: START });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -dist / 2; p1.pos.z = 0; p2.pos.x = dist / 2; p2.pos.z = 0;
  for (const f of [p1, p2]) { f.invulnerableUntil = 0; f.unit = { ...f.unit, spreadAngle: 0, bloomCap: 0, bloomPerShot: 0 }; }
  p1.targetId = 'p2'; p2.targetId = 'p1';
  return { m, p1, p2 };
}
const fire = () => { const i = emptyInput(); i.shootHold = true; i.shootTap = true; return i; };
const idle = () => emptyInput();
// run `ticks` ticks; every tick both are kept alive and loaded unless told; the events gathered
function run(m, from, ticks, p1In, p2In, each = null) {
  let now = from; const events = [];
  for (let k = 0; k < ticks; k += 1) {
    now += TICK_RATE_MS;
    if (each) each(now, k);
    tickMatch(m, { p1: p1In(now, k), p2: p2In(now, k) }, now, TICK_DT, []);
    for (const e of m.events) events.push({ ...e, at: now });
  }
  return { now, events };
}
const count = (events, type, pred = () => true) => events.filter((e) => e.type === type && pred(e)).length;
// her magazine and both bodies kept as they are, so a long spray never ends in a reload or a death
const keep = (m, hp1 = 1e6) => () => { const { p1, p2 } = m.fighters; p1.hp = hp1; p1.ammo = p1.unit.magCapacity ?? Infinity; p2.ammo = p2.unit.magCapacity ?? Infinity; p1.reloadingUntil = 0; p2.reloadingUntil = 0; };

test('the data: Kurumi carries the shield and 100 health; her motions have their places', () => {
  const u = UNIT_DATA.unit17;
  assert.equal(u.hp, 100);                                           // 120 until b1105ly
  assert.equal(u.stunImmune, true);                                  // as it was
  assert.deepEqual(u.shield, { bone: 'bone_Shield_00', c: [0.0001, 0.0237, -0.0163], h: [0.2075, 0.3206, 0.0464] });
  const poses = shieldPosesOf(u);
  assert.ok(poses && poses === SHIELD_POSES.unit17);
  for (const k of ['stand', 'walk', 'sprint', 'shoot', 'sprintShoot', 'dodge', 'jump', 'reload', 'climb']) assert.ok(poses[k]?.frames?.length >= 1, `${k} has its place`);
  for (const k of ['dodge', 'jump', 'reload']) assert.ok(poses[k].dur > 0 && poses[k].frames.length > 2, `${k} is played once, frame by frame`);
  assert.equal(poses.reload.dur, u.reloadMs / 1000);                 // the reload's motion is fitted to the reload
  assert.ok(Math.abs(poses.half[0] * 2 - 2.27) < 0.01 && Math.abs(poses.half[1] * 2 - 3.51) < 0.01 && Math.abs(poses.half[2] * 2 - 0.51) < 0.01);   // the shield as she is drawn
  for (const key of Object.keys(UNIT_DATA)) if (key !== 'unit17') assert.equal(shieldPosesOf(UNIT_DATA[key]), null, `${key} has none`);
});

test('a unit without a shield is not tracked at all', () => {
  const { m } = duel('unit1', 22, 'unit1');
  run(m, START, 30, fire, idle, keep(m));
  assert.equal(m.shields, undefined);
});

test('while she fires at the shooter, the rounds shot at her from ahead are stopped: block events, no damage, no hit', () => {
  const { m, p2 } = duel();
  const warm = run(m, START, 40, idle, fire, keep(m));               // she opens fire and settles into her firing stance
  const hp0 = p2.hp;
  const { events } = run(m, warm.now, 150, fire, fire, keep(m));
  const fired = count(events, 'fired', (e) => e.ownerId === 'p1'), blocks = count(events, 'block', (e) => e.ownerId === 'p1' && e.targetId === 'p2');
  assert.ok(fired >= 15, `the shooter fired ${fired}`);
  assert.equal(count(events, 'hit', (e) => e.targetId === 'p2'), 0);
  assert.equal(p2.hp, hp0);
  assert.equal(blocks, count(events, 'despawn', (e) => e.reason === 'shield'));
  assert.ok(blocks >= fired - 2, `${blocks} of ${fired} stopped`);
  const d = events.find((e) => e.type === 'despawn' && e.reason === 'shield');
  assert.ok(d.pos && d.pos.x < p2.pos.x && d.pos.x > p2.pos.x - 3, `taken off at the box, in front of her (${d.pos.x} against her ${p2.pos.x})`);
  assert.deepEqual(Object.keys(events.find((e) => e.type === 'block')).sort(), ['at', 'ownerId', 'targetId', 'type']);   // (`at` is this test's own)
  assert.ok(count(events, 'hit', (e) => e.targetId === 'p1') > 0);   // her own rounds land as ever
});

test('standing still, her shield is down at her left: a round from dead ahead lands', () => {
  const { m, p2 } = duel();
  const warm = run(m, START, 40, idle, idle, keep(m));
  const hp0 = p2.hp;
  const { events } = run(m, warm.now, 100, fire, idle, keep(m));
  const fired = count(events, 'fired', (e) => e.ownerId === 'p1');
  assert.ok(fired >= 10);
  assert.equal(count(events, 'block'), 0);
  assert.equal(count(events, 'hit', (e) => e.targetId === 'p2'), fired);
  assert.ok(p2.hp < hp0);
  assert.equal(m.shields.p2.pose, 'stand');
});

test('walking at the shooter, her shield is up in front: the rounds are stopped', () => {
  const { m, p2 } = duel('unit1', 60);
  const walk = () => { const i = emptyInput(); i.moveX = -1; i.moveZ = 0; return i; };   // p1 stands at -x
  const warm = run(m, START, 40, idle, walk, keep(m));
  assert.equal(m.shields.p2.pose, 'walk');
  const hp0 = p2.hp;
  const { events } = run(m, warm.now, 100, fire, walk, keep(m));
  const fired = count(events, 'fired', (e) => e.ownerId === 'p1');
  assert.ok(fired >= 10);
  assert.equal(count(events, 'hit', (e) => e.targetId === 'p2'), 0);
  assert.equal(count(events, 'block'), fired);
  assert.equal(p2.hp, hp0);
});

test('reloading, her shield is down: the rounds land through most of it', () => {
  const { m, p2 } = duel();
  run(m, START, 40, idle, idle, keep(m));
  let now = START + 40 * TICK_RATE_MS;
  p2.ammo = 0; p2.reloadingUntil = now + p2.unit.reloadMs;           // a reload begun now
  const hold = () => { const { p1 } = m.fighters; p1.hp = 1e6; p1.ammo = p1.unit.magCapacity; p1.reloadingUntil = 0; };
  const first = run(m, now, 12, idle, idle, hold); now = first.now;   // the motion fades in
  assert.equal(m.shields.p2.pose, 'reload');
  const { events } = run(m, now, Math.floor(1500 / TICK_RATE_MS), fire, idle, hold);
  const fired = count(events, 'fired', (e) => e.ownerId === 'p1'), hits = count(events, 'hit', (e) => e.targetId === 'p2');
  assert.ok(fired >= 12);
  assert.ok(hits >= fired * 0.7, `${hits} of ${fired} landed`);
});

test('the box turns with her: stopped from ahead and not from behind while she fires; from her left alone while she stands', () => {
  const { m, p2 } = duel();
  const stops = (bearingDeg) => {   // a round flown level at her, 0.8 over the root, from 22 u at the bearing from her heading (+ = her left)
    const s = m.shields.p2, fr = shieldFrameOf(m, p2, p2); const a = s.yaw + bearingDeg * Math.PI / 180;
    const cy = p2.pos.y + 2.35 + 0.8;
    return shieldEntryT(fr, p2.pos.x + Math.sin(a) * 22, cy, p2.pos.z + Math.cos(a) * 22, p2.pos.x, cy, p2.pos.z) >= 0;
  };
  run(m, START, 60, idle, fire, keep(m));
  assert.equal(m.shields.p2.pose, 'shoot');
  assert.ok(Math.abs(Math.atan2(Math.sin(m.shields.p2.yaw - (-Math.PI / 2)), Math.cos(m.shields.p2.yaw - (-Math.PI / 2)))) < 0.02, 'she faces the unit she fires at (-x)');
  for (const b of [-30, -20, 0, 20, 40, 50]) assert.ok(stops(b), `firing: stopped from ${b}`);
  for (const b of [-60, -90, 180, 120, 90, 70]) assert.ok(!stops(b), `firing: not from ${b}`);
  run(m, START + 60 * TICK_RATE_MS, 60, idle, idle, keep(m));       // she stops; the stance comes back
  assert.equal(m.shields.p2.pose, 'stand');
  for (const b of [0, 30, -30, 180, -90, 110]) assert.ok(!stops(b), `standing: not from ${b}`);
  for (const b of [65, 70]) assert.ok(stops(b), `standing: stopped from ${b}`);
});

test('a dodge lets the round through her and through the shield alike: no hit, no block', () => {
  const { m, p2 } = duel();
  run(m, START, 40, idle, fire, keep(m));
  let now = START + 40 * TICK_RATE_MS;
  const hp0 = p2.hp;
  const { events } = run(m, now, 12, fire, fire, () => { keep(m)(); p2.stepUntil = now + 10000; });   // the dodge's moment held open
  assert.ok(count(events, 'fired', (e) => e.ownerId === 'p1') >= 1);
  assert.equal(count(events, 'block'), 0);
  assert.equal(count(events, 'hit', (e) => e.targetId === 'p2'), 0);
  assert.equal(p2.hp, hp0);
});

test("a shotgun's volley at her firing stance: the pellets that meet the box are stopped, the rest land", () => {
  const { m, p2 } = duel('unit2', 14);
  const warm = run(m, START, 40, idle, fire, keep(m));
  let landed = 0, volleys = 0, blocks = 0; let now = warm.now;
  for (let k = 0; k < 12; k += 1) {
    p2.hp = 1e6;
    const r = run(m, now, 40, (t, i) => (i === 0 ? fire() : idle()), fire, () => { keep(m)(); }); now = r.now;
    volleys += count(r.events, 'fired', (e) => e.ownerId === 'p1'); blocks += count(r.events, 'block', (e) => e.ownerId === 'p1');
    landed += r.events.filter((e) => e.type === 'hit' && e.targetId === 'p2').reduce((a, e) => a + e.damage, 0);
  }
  const per = UNIT_DATA.unit2.damage, all = volleys * per * UNIT_DATA.unit2.spreadCount;
  assert.ok(volleys >= 8, `${volleys} volleys`);
  assert.ok(blocks >= volleys * 0.8, `${blocks} block events for ${volleys} volleys`);
  assert.ok(landed < all * 0.9, `${landed} of ${all} landed`);        // some of every volley is stopped
});

test("the railgun's beams at her firing stance from ahead are stopped once, as they strike once", () => {
  for (const charged of [false, true]) {
    const { m, p1, p2 } = duel('unit6', 22);
    const warm = run(m, START, 40, idle, fire, keep(m)); let now = warm.now;
    const hp0 = p2.hp;
    // the charge: held to its end for the charged beam; cut short by the sprint key past the glint for the quick one
    const input = (t, k) => { const i = emptyInput(); if (k === 0) { i.shootTap = true; i.shootHold = true; } if (!charged && k >= 40) { i.boost = true; } return i; };
    const { events } = run(m, now, 220, input, fire, () => { keep(m)(); p1.boost = p1.unit.boostCap; });
    const blocks = count(events, 'block', (e) => e.ownerId === 'p1' && e.targetId === 'p2');
    assert.equal(count(events, 'hit', (e) => e.targetId === 'p2'), 0, charged ? 'the charged beam' : 'the quick beam');
    assert.equal(blocks, 1, `${charged ? 'the charged beam' : 'the quick beam'}: one block (${blocks})`);
    assert.equal(p2.hp, hp0);
  }
});

test("a lagged shooter's round meets the box the shooter saw", () => {
  const { m, p2 } = duel();
  const warm = run(m, START, 60, idle, fire, keep(m));               // she fires: the box is up
  let now = warm.now;
  const up = shieldFrameOf(m, p2, p2);
  const r = run(m, now, 8, idle, idle, keep(m)); now = r.now;        // she has stopped for 128 ms: the firing stance still holds (200 ms) ...
  run(m, now, 30, idle, idle, keep(m)); now += 30 * TICK_RATE_MS;    // ... and now she stands, the box down at her left
  const down = shieldFrameOf(m, p2, p2);
  assert.ok(Math.abs(down.cy - up.cy) > 0.2 || Math.abs(down.cz - up.cz) > 0.3, 'the box has moved');
  const past = bodyAt(m, p2, 5 * TICK_RATE_MS, now);
  assert.ok(past !== p2 && past.shield !== undefined);
  assert.equal(shieldFrameOf(m, p2, past), past.shield);             // the recorded body's own box
  assert.equal(shieldFrameOf(m, p2, p2), m.shields.p2.frame);        // the live body's is this tick's
});

test('nothing of it rides the snapshot', () => {
  const { m } = duel();
  run(m, START, 60, fire, fire, keep(m));
  assert.ok(m.shields.p2.frame);
  const snap = JSON.stringify(buildSnapshotFor(m, 'A')) + JSON.stringify(buildSnapshotFor(m, 'B'));
  for (const word of ['poseAt', 'motionHoldUntil', '"frame"', '"shields"', '"cur"']) assert.ok(!snap.includes(word), `${word} is not sent`);
  const f = m.fighters.p2; for (const k of ['shield', 'shieldYaw', 'pose', 'poseAt', 'frame']) assert.ok(!(k in f), `the fighter carries no ${k}`);
});
