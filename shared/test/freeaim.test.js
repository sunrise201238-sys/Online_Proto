import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, applyInput, emptyInput, getArena, TICK_RATE_MS, TICK_DT, UNIT_DATA } from '../src/sim/index.js';

// FREE POV (user 2026-10-30): the player aims by a crosshair. The frame carries freeAim and the shot direction; the
// rounds fly it and hit whichever enemy they meet, the unit faces it, no red lock; lockNearest is the way back.
// Plain Field (arena1): four perimeter walls, the middle open — p1 at (-20, 0), p4 due +x of it, p2 off to the side.
function setup(unit = 'unit1') {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', p1UnitKey: unit, p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1', startTime: 1000 });
  const { p1, p2, p3, p4 } = m.fighters;
  p1.pos.x = -20; p1.pos.z = 0;
  p4.pos.x = 10; p4.pos.z = 0;      // 30 u due +x: under the crosshair
  p2.pos.x = 0; p2.pos.z = 30;      // the lock (p1.targetId = 'p2'), off the aim
  p3.pos.x = -20; p3.pos.z = -30;
  for (const f of [p1, p2, p3, p4]) f.invulnerableUntil = 0;
  m.shotSeed = 7;
  return m;
}
const arena = getArena('arena1');
const run = (m, frameOf, ms) => {
  let now = 1000;
  for (let i = 0; i < ms / TICK_RATE_MS; i += 1) {
    tickMatch(m, { p1: frameOf(i, now), p2: emptyInput(), p3: emptyInput(), p4: emptyInput() }, now, TICK_DT, []);
    now += TICK_RATE_MS;
  }
};
const aimPlusX = () => ({ ...emptyInput(), freeAim: true, aimYaw: Math.PI / 2, aimPitch: 0 });   // yaw = atan2(dx, dz): +x is π/2

test('free aim: the rounds fly the crosshair and hit the enemy under it, not the lock', () => {
  const m = setup();
  run(m, () => ({ ...aimPlusX(), shootTap: true, shootHold: true }), 1500);
  const { p1, p2, p4 } = m.fighters;
  assert.ok(p4.hp < UNIT_DATA.unit1.hp, 'the enemy under the crosshair was hit: hp ' + p4.hp);
  assert.equal(p2.hp, UNIT_DATA.unit1.hp, 'the lock target, off the aim, was never hit');
  assert.equal(p1.targetId, 'p2', 'the lock itself is kept');
  assert.equal(p1.freeAim, true);
  assert.equal(p1.redLock, false, 'no red lock in free pov');
  // facing (user 2026-10-30): the crosshair while firing — it fired all along, so +x — else the way it moves, held when still
  assert.ok(Math.abs(p1.yaw - Math.PI / 2) < 1e-9 && p1.facing === 1, 'firing, it faces the crosshair');
  run(m, () => ({ ...aimPlusX(), moveX: 0, moveZ: 1 }), 200);   // walk +z, trigger released
  assert.ok(Math.abs(p1.yaw - 0) < 1e-6 && p1.facing === 1, 'walking +z without firing it faces +z: yaw ' + p1.yaw);
  run(m, () => aimPlusX(), 200);   // stop
  assert.ok(Math.abs(p1.yaw - 0) < 1e-6, 'still again, it holds its heading');
  run(m, () => ({ ...aimPlusX(), moveX: 0, moveZ: 1, shootHold: true }), 200);   // walk +z firing: the crosshair wins
  assert.ok(Math.abs(p1.yaw - Math.PI / 2) < 1e-9, 'walking and firing, the crosshair wins: yaw ' + p1.yaw);
  for (const p of m.projectiles) { assert.equal(p.freeAim, true); assert.equal(p.homing, false); }
});

test('the classic aimed shot is unchanged: the lock is hit, the enemy beside the line is not', () => {
  const m = setup();
  run(m, () => ({ ...emptyInput(), shootTap: true, shootHold: true }), 1500);
  const { p1, p2, p4 } = m.fighters;
  assert.ok(p2.hp < UNIT_DATA.unit1.hp, 'the lock was hit: hp ' + p2.hp);
  assert.equal(p4.hp, UNIT_DATA.unit1.hp);
  assert.equal(p1.freeAim, false);
  assert.ok(Math.abs(p1.yaw - Math.atan2(20, 30)) < 1e-9, 'faces the lock');
});

test('leaving free pov: lockNearest locks the nearest living enemy', () => {
  const m = setup();
  const p1 = m.fighters.p1;
  applyInput(m, p1, aimPlusX(), 1000, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p2');
  applyInput(m, p1, { ...emptyInput(), lockNearest: true }, 1016, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p4', 'p4 at 30 u is nearer than p2 at 36 u');
  assert.equal(p1.freeAim, false);
  m.fighters.p4.hp = 0;
  applyInput(m, p1, { ...emptyInput(), lockNearest: true }, 1032, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p2', 'a dead enemy is never the nearest');
});

test('leaving free pov: lockTarget locks the enemy the client picked (the one nearest its crosshair); a dead or friendly one is refused', () => {
  const m = setup();
  const p1 = m.fighters.p1;
  assert.equal(p1.targetId, 'p2');
  applyInput(m, p1, { ...emptyInput(), lockTarget: 'p4' }, 1000, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p4', 'the named enemy');
  applyInput(m, p1, { ...emptyInput(), lockTarget: 'p3' }, 1016, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p4', 'a friend is refused');
  m.fighters.p2.hp = 0;
  applyInput(m, p1, { ...emptyInput(), lockTarget: 'p2' }, 1032, arena.obstacles, arena.surfaces);
  assert.equal(p1.targetId, 'p4', 'a dead enemy is refused');
});

test('the aim rides the fighter while it free-aims (3 decimals), and leaves it when it stops', () => {
  const m = setup();
  const p1 = m.fighters.p1;
  applyInput(m, p1, { ...aimPlusX(), aimPitch: 0.123456 }, 1000, arena.obstacles, arena.surfaces);
  assert.equal(p1.aimYaw, Math.round(Math.PI / 2 * 1000) / 1000);
  assert.equal(p1.aimPitch, 0.123);
  applyInput(m, p1, emptyInput(), 1016, arena.obstacles, arena.surfaces);
  assert.equal(p1.aimYaw, undefined, 'gone from the snapshot when not free-aiming');
  assert.equal(p1.aimPitch, undefined);
});

test('free aim sniper: the charge is marked with the enemy nearest the aim and the shot flies the crosshair', () => {
  const m = setup('unit3');
  const { p1, p2, p4 } = m.fighters;
  run(m, (i) => ({ ...aimPlusX(), shootTap: i === 0 }), 2500);
  assert.ok(p4.hp < UNIT_DATA.unit1.hp, 'the enemy under the crosshair took the sniper round: hp ' + p4.hp);
  assert.equal(p2.hp, UNIT_DATA.unit1.hp);
  assert.equal(p1.sniperChargeTargetId, null, 'the charge released');
});

test('free aim sniper: during the charge the fighter is flagged freeAim and marked on the aim-nearest enemy', () => {
  const m = setup('unit3');
  const p1 = m.fighters.p1;
  tickMatch(m, { p1: { ...aimPlusX(), shootTap: true }, p2: emptyInput(), p3: emptyInput(), p4: emptyInput() }, 1000, TICK_DT, []);
  assert.equal(p1.sniperChargeTargetId, 'p4', 'the intent target is the enemy nearest the aim, not the lock');
  assert.equal(p1.freeAim, true, 'the glint rule reads this: every enemy bot is warned');
});
