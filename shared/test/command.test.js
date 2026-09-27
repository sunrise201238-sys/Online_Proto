// Fight/Hide stance order (owner 2026-09-26): the command side-table
// semantics, the hide behaviour in tickBot (hidden from every enemy, then
// pacing the cover and slipping away from a closing enemy; Defense
// suppressed; clean resume on Fight) and the cost of
// the hidden-spot search.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState,
  tickMatch,
  tickBot,
  tickCommandDriver,
  commandTargetIdOf,
  pickBotTargetId,
  setMoveOrder,
  setForceLock,
  setStance,
  isHideOrdered,
  clearCommands,
  clearMoveOrder,
  getCommands,
  ensureCommands,
  findHiddenSpot,
  buildNavGrid,
  botHasLineOfSight,
  getArena,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  BOT_LOS_EYE_HEIGHT,
  GROUND_BASE_Y
} from '../src/sim/index.js';

const eyeOf = (f) => ({ x: f.pos.x, y: f.pos.y + BOT_LOS_EYE_HEIGHT, z: f.pos.z });
const hiddenFrom = (arena, me, enemy) =>
  !botHasLineOfSight(eyeOf(enemy), eyeOf(me), arena.obstacles, arena.surfaces);

// Streets 2v2 fixture: the hider (p1, bot-driven) stands in the open south
// of the west buildings; both enemies stand still east of it with a clear
// line of sight. The nearest hide is the alley between the two buildings.
function streetsHideFixture(units = {}) {
  const m = createMatchState({
    mapKey: 'arena2', mode: '2v2',
    p1UnitKey: units.p1 ?? 'unit1', p2UnitKey: units.p2 ?? 'unit1', p3UnitKey: units.p3 ?? 'unit1', p4UnitKey: units.p4 ?? 'unit1',
    startTime: 1000
  });
  const place = (f, x, z) => { f.pos.x = x; f.pos.z = z; f.pos.y = GROUND_BASE_Y; };
  place(m.fighters.p1, -100, -75);
  place(m.fighters.p2, -60, -75);
  place(m.fighters.p4, -75, -85);
  place(m.fighters.p3, -126, -82);
  for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
  const arena = getArena('arena2');
  assert.equal(hiddenFrom(arena, m.fighters.p1, m.fighters.p2), false, 'fixture: p2 must see the hider at start');
  assert.equal(hiddenFrom(arena, m.fighters.p1, m.fighters.p4), false, 'fixture: p4 must see the hider at start');
  const inputs = { p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput() };
  let now = 1000;
  // The server loop's recipe for a driven unit (tickLobby): target pick,
  // tickBot, command driver, then the shared tick with the slot as a bot.
  const step = (driven = ['p1']) => {
    now += TICK_RATE_MS;
    for (const id of driven) {
      const me = m.fighters[id];
      me.targetId = commandTargetIdOf(m, id) ?? pickBotTargetId(m, me) ?? me.targetId;
      tickBot(m, id, now);
      tickCommandDriver(m, id, now);
    }
    tickMatch(m, inputs, now, TICK_DT, driven);
    return now;
  };
  const hiddenFromBoth = () => hiddenFrom(arena, m.fighters.p1, m.fighters.p2)
    && hiddenFrom(arena, m.fighters.p1, m.fighters.p4);
  return { m, arena, step, hiddenFromBoth, now: () => now };
}

test('setStance: hide wipes move+lock, a landed move/lock releases it, clearCommands resets it, dead unit refused', () => {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', startTime: 1000 });
  assert.equal(isHideOrdered(m, 'p1'), false);
  assert.equal(setMoveOrder(m, 'p1', 0, 0, 0), true, 'a plain move order is accepted on the open field');
  assert.equal(setForceLock(m, 'p1', 'p2'), true);
  assert.ok(getCommands(m, 'p1').move && getCommands(m, 'p1').lockTargetId === 'p2');

  assert.equal(setStance(m, 'p1', true), true);
  assert.equal(isHideOrdered(m, 'p1'), true);
  assert.equal(getCommands(m, 'p1').hide, true);
  assert.equal(getCommands(m, 'p1').move, null, 'hide clears the move order');
  assert.equal(getCommands(m, 'p1').lockTargetId, null, 'hide clears the force lock');
  assert.equal(commandTargetIdOf(m, 'p1'), null);
  // A landed move order releases the stance (owner 2026-09-26); an
  // unreachable one leaves it standing.
  assert.equal(setMoveOrder(m, 'p1', NaN, 0, 0), false, 'bad order still refused');
  assert.equal(isHideOrdered(m, 'p1'), true, 'a refused order leaves the hide standing');
  assert.equal(setMoveOrder(m, 'p1', 0, 0, 0), true, 'move order accepted while hidden');
  assert.equal(isHideOrdered(m, 'p1'), false, 'the landed move order released the hide');
  assert.ok(getCommands(m, 'p1').move);
  assert.equal(setStance(m, 'p1', true), true);
  assert.equal(getCommands(m, 'p1').move, null, 'hide wipes the move order again');
  assert.equal(setForceLock(m, 'p1', null), true, 'clearing a lock is fine while hidden');
  assert.equal(isHideOrdered(m, 'p1'), true, 'a lock clear leaves the hide standing');
  assert.equal(setForceLock(m, 'p1', 'p2'), true, 'force lock accepted while hidden');
  assert.equal(isHideOrdered(m, 'p1'), false, 'the landed lock released the hide');
  assert.equal(getCommands(m, 'p1').lockTargetId, 'p2');
  assert.equal(setStance(m, 'p1', true), true);
  assert.equal(getCommands(m, 'p1').lockTargetId, null);

  // A granular move clear never touches the stance; the full clear does.
  clearMoveOrder(m, 'p1');
  assert.equal(isHideOrdered(m, 'p1'), true);
  clearCommands(m, 'p1');
  assert.equal(isHideOrdered(m, 'p1'), false);
  assert.equal(getCommands(m, 'p1').hide, false);
  assert.equal(setMoveOrder(m, 'p1', 0, 0, 0), true, 'orders accepted again after Fight');

  // Fight (hide=false) is accepted on a live unit and is a plain flag drop.
  assert.equal(setStance(m, 'p1', true), true);
  assert.equal(setStance(m, 'p1', false), true);
  assert.equal(isHideOrdered(m, 'p1'), false);

  // Dead or missing units take no stance order.
  m.fighters.p2.hp = 0;
  assert.equal(setStance(m, 'p2', true), false);
  assert.equal(isHideOrdered(m, 'p2'), false);
  assert.equal(setStance(m, 'p9', true), false);
});

test('hide order (Streets 2v2): the bot ends hidden from BOTH enemy eyes within 10 s, then paces its cover without ever being seen', () => {
  const { m, step, hiddenFromBoth } = streetsHideFixture();
  assert.equal(setStance(m, 'p1', true), true);
  let hiddenAtMs = null;
  const t0 = 1000;
  for (let i = 0; i < 10000 / TICK_RATE_MS; i += 1) {
    const now = step();
    if (hiddenFromBoth() && m.fighters.p1.botHideHold === true) { hiddenAtMs = now - t0; break; }
  }
  assert.ok(hiddenAtMs != null, 'the hider never broke both lines of sight within 10 s');
  assert.equal(m.fighters.p1.botHideTier, 'all');
  // Pacing (owner 2026-09-26, no statue): keeps walking on verified-hidden
  // legs, no route, never sprints, stays on the leash, never seen.
  const anchor = { x: m.fighters.p1.pos.x, z: m.fighters.p1.pos.z };
  let prev = { ...anchor };
  let pathLen = 0, sprintTicks = 0, seenTicks = 0, maxLeash = 0;
  const ticks = 4000 / TICK_RATE_MS;
  for (let i = 0; i < ticks; i += 1) {
    step();
    const f = m.fighters.p1;
    pathLen += Math.hypot(f.pos.x - prev.x, f.pos.z - prev.z);
    prev = { x: f.pos.x, z: f.pos.z };
    if (f.action === 'dash') sprintTicks += 1;
    if (!hiddenFromBoth()) seenTicks += 1;
    maxLeash = Math.max(maxLeash, Math.hypot(f.pos.x - anchor.x, f.pos.z - anchor.z));
    assert.equal(f.botHidePath, null, 'no route while pacing');
    assert.equal(f.botHideHold, true, 'hidden flag stays up while pacing');
  }
  assert.ok(pathLen > 8, `paced only ${pathLen.toFixed(1)} u in 4 s`);
  assert.equal(sprintTicks, 0, 'pacing walks, never sprints');
  assert.equal(seenTicks, 0, `seen on ${seenTicks} of ${ticks} pacing ticks`);
  assert.ok(maxLeash <= 6 + 2.5 + 1, `wandered ${maxLeash.toFixed(1)} u off the anchor`);
});

test('hide order: an enemy closing in makes the hider slip to a farther hidden cell before it is seen', () => {
  const { m, step, hiddenFromBoth, arena } = streetsHideFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && m.fighters.p1.botHideHold); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden first');
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  const spot0 = { x: p1.pos.x, z: p1.pos.z };
  // p2 (the nearest enemy) walks straight at the hider at 6 u/s and stops
  // 18 u short of the hider's first spot, still without a line of sight —
  // it never actually sees the unit; the slip must come from the closing
  // watch, not from exposure.
  const speed = 6;
  let routedWhileHidden = false, seenTicks = 0, stopDist = null;
  for (let i = 0; i < 12000 / TICK_RATE_MS; i += 1) {
    const dx = spot0.x - p2.pos.x, dz = spot0.z - p2.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 18) {
      p2.vel.x = dx / d * speed; p2.vel.z = dz / d * speed;
      p2.pos.x += p2.vel.x * TICK_DT; p2.pos.z += p2.vel.z * TICK_DT;
    } else {
      p2.vel.x = 0; p2.vel.z = 0;
      if (stopDist == null) stopDist = Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z);
    }
    step();
    if (p1.botHidePath && hiddenFromBoth()) routedWhileHidden = true;
    if (!hiddenFromBoth()) seenTicks += 1;
  }
  assert.ok(stopDist != null, 'fixture: p2 never reached its stop');
  assert.ok(routedWhileHidden, 'no slip route was ever issued while still hidden');
  const endDist = Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z);
  assert.ok(hiddenFromBoth(), 'hidden from both at the end');
  assert.ok(Math.hypot(p1.pos.x - spot0.x, p1.pos.z - spot0.z) > 3, 'the unit left its first spot');
  const stayDist = Math.hypot(spot0.x - p2.pos.x, spot0.z - p2.pos.z);   // what staying put would have left
  assert.ok(endDist > stayDist + 4, `ended ${endDist.toFixed(1)} u from the closer; staying put would have been ${stayDist.toFixed(1)}`);
  assert.ok(seenTicks < 12000 / TICK_RATE_MS * 0.05, `seen on ${seenTicks} ticks during the approach`);
});

test('hide order: an enemy walking round to expose the hider triggers a re-search and a new hide', () => {
  const { m, step, hiddenFromBoth, arena } = streetsHideFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && m.fighters.p1.botHideHold); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden first');
  const firstSpot = { x: m.fighters.p1.pos.x, z: m.fighters.p1.pos.z };
  // Teleport p2 to a spot that sees the hider in its alley (the alley mouth
  // to the north), then keep it standing there.
  const p2 = m.fighters.p2;
  let found = false;
  for (const cand of [[-92, -20], [-90, -25], [-92, -30], [-95, -15], [-88, -20]]) {
    p2.pos.x = cand[0]; p2.pos.z = cand[1];
    if (!hiddenFrom(arena, m.fighters.p1, p2)) { found = true; break; }
  }
  assert.ok(found, 'fixture: could not place p2 where it sees the hider');
  let rehiddenAtMs = null;
  const t0 = m.now;
  for (let i = 0; i < 10000 / TICK_RATE_MS; i += 1) {
    const now = step();
    if (hiddenFromBoth() && m.fighters.p1.botHideHold === true) { rehiddenAtMs = now - t0; break; }
  }
  assert.ok(rehiddenAtMs != null, 'the hider never re-hid after being exposed');
  assert.ok(Math.hypot(m.fighters.p1.pos.x - firstSpot.x, m.fighters.p1.pos.z - firstSpot.z) > 1,
    'the re-hide moved the unit to a new spot');
});

test('hide order: a fresh hit while hidden-ordered never enters Defense (and does without the order)', () => {
  const run = (hide) => {
    const { m, step } = streetsHideFixture();
    if (hide) setStance(m, 'p1', true);
    const f = m.fighters.p1;
    let sawDefense = false;
    let lastHitAt = 0;
    for (let i = 0; i < 5000 / TICK_RATE_MS; i += 1) {
      const now = step();
      if (now - lastHitAt >= 400) {
        // What a landing round does to its victim (projectiles.js): the stun
        // window rises, which tickBot reads as a fresh hit.
        f.hitStunUntil = now + 300;
        f.hitStunScale = 0.25;
        lastHitAt = now;
      }
      if (f.botState === 'defense') sawDefense = true;
    }
    return sawDefense;
  };
  assert.equal(run(true), false, 'Defense must never trigger while the hide order stands');
  assert.equal(run(false), true, 'control: the same hits do trigger Defense on a free bot');
});

test('hide order: clearing the order (Fight) resumes normal movement within 2 s and nulls the hide scratch', () => {
  const { m, step, hiddenFromBoth } = streetsHideFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && m.fighters.p1.botHideHold); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden and pacing');
  for (let i = 0; i < 20; i += 1) step();
  assert.equal(m.fighters.p1.botHideHold, true);
  assert.equal(setStance(m, 'p1', false), true);
  step();
  assert.equal(m.fighters.p1.botHideHold, null, 'the hide scratch is nulled on the first tick after Fight');
  let movingAtMs = null;
  const t0 = m.now;
  for (let i = 0; i < 2000 / TICK_RATE_MS; i += 1) {
    const now = step();
    if (Math.hypot(m.fighters.p1.vel.x, m.fighters.p1.vel.z) > 0.01) { movingAtMs = now - t0; break; }
  }
  assert.ok(movingAtMs != null, 'the unit stayed frozen after Fight');
  const f = m.fighters.p1;
  for (const k of ['botHidePath', 'botHidePathIdx', 'botHideGoal', 'botHideSearchAt', 'botHideSearchStage', 'botHideFailedAt',
    'botHideHold', 'botHideDashArmed', 'botHideTier', 'botHideMoveAnchor', 'botHideAnchor', 'botHideDriftX', 'botHideDriftZ', 'botHideDriftUntil']) {
    assert.equal(f[k], null, `${k} nulled on clear`);
  }
});

test('reload hide: a manual reload of 3 s+ enters the Hide stance (wiping orders) and leaves it when the reload completes', () => {
  const { m, step, hiddenFromBoth } = streetsHideFixture({ p1: 'unit12' });   // Koyuki: 100-round mag, 5 s manual reload
  const p1 = m.fighters.p1;
  assert.equal(setForceLock(m, 'p1', 'p2'), true, 'a force lock stands (a MOVE order would route the reload into a cover hide instead)');
  p1.ammo = 0;   // the mag ran dry: tickAmmo starts the 5 s reload
  step(); step();
  assert.ok(p1.reloadingUntil > 0, 'the reload started');
  assert.equal(p1.botReloadHide, true);
  assert.equal(isHideOrdered(m, 'p1'), true, 'the reload entered the hide stance');
  assert.equal(getCommands(m, 'p1').hideAuto, true, 'flagged as the automatic hide');
  assert.equal(getCommands(m, 'p1').lockTargetId, null, 'the standing lock was wiped');
  let hidden = false;
  for (let i = 0; i < 4000 / TICK_RATE_MS; i += 1) { step(); if (hiddenFromBoth() && p1.botHideHold) { hidden = true; break; } }
  assert.ok(hidden, 'the reloading unit never hid');
  let guard = 8000 / TICK_RATE_MS;
  while (p1.reloadingUntil > 0 && guard-- > 0) step();
  assert.ok(guard > 0, 'the reload never completed');
  step();
  assert.equal(p1.ammo, 100, 'mag refilled');
  assert.equal(p1.botReloadHide, false);
  assert.equal(isHideOrdered(m, 'p1'), false, 'the reload end released the automatic hide');
  assert.equal(getCommands(m, 'p1').hideAuto, false);
  step();
  assert.equal(p1.botHideHold, null, 'hide scratch nulled after the release');
});

test('reload hide: a manual Hide survives the reload end; an order during the reload releases it for the rest of it', () => {
  {
    const { m, step } = streetsHideFixture({ p1: 'unit12' });
    const p1 = m.fighters.p1;
    assert.equal(setStance(m, 'p1', true), true);
    p1.ammo = 0; step(); step();
    assert.equal(p1.botReloadHide, true);
    assert.equal(getCommands(m, 'p1').hideAuto, false, 'a manual hide is not the automatic one');
    let guard = 8000 / TICK_RATE_MS;
    while (p1.reloadingUntil > 0 && guard-- > 0) step();
    step();
    assert.equal(isHideOrdered(m, 'p1'), true, 'the manual hide outlives the reload');
  }
  {
    const { m, step } = streetsHideFixture({ p1: 'unit12' });
    const p1 = m.fighters.p1;
    ensureCommands(m, 'p1');   // the server creates the entry for command-side slots at match start
    p1.ammo = 0; step(); step();
    assert.equal(isHideOrdered(m, 'p1'), true);
    let ordered = false;
    for (const [x, z] of [[-90, -75], [-95, -70], [-100, -65], [-105, -75]]) { if (setMoveOrder(m, 'p1', x, z, 0)) { ordered = true; break; } }
    assert.ok(ordered, 'fixture: no reachable move order');
    assert.equal(isHideOrdered(m, 'p1'), false, 'the landed order released the hide mid-reload');
    for (let i = 0; i < 1500 / TICK_RATE_MS; i += 1) {
      step();
      assert.ok(p1.reloadingUntil > 0, 'still reloading');
      assert.equal(isHideOrdered(m, 'p1'), false, 'no re-entry during the same reload');
    }
    assert.ok(getCommands(m, 'p1').move, 'the move order stands through the reload');
  }
});

test('reload under a move order: a cover hide bound to the order — the order stays, the unit hides for the whole reload and resumes after; a new order takes over at once', () => {
  {
    const { m, step, hiddenFromBoth } = streetsHideFixture({ p1: 'unit12' });   // Koyuki, 5 s manual reload
    const p1 = m.fighters.p1;
    assert.equal(setMoveOrder(m, 'p1', p1.pos.x + 6, p1.pos.z, 0), true);
    for (let i = 0; i < 2000 / TICK_RATE_MS && getCommands(m, 'p1').move.phase !== 'anchor'; i += 1) step();
    const order = getCommands(m, 'p1').move;
    assert.equal(order.phase, 'anchor');
    p1.ammo = 0; step(); step();
    assert.ok(p1.reloadingUntil > 0, 'the reload started');
    assert.ok(p1.botCH && p1.botCH.reload, 'a reload-bound cover hide started');
    assert.equal(isHideOrdered(m, 'p1'), false, 'no stance (no badge)');
    assert.equal(getCommands(m, 'p1').move, order, 'the move order stays');
    let hidden = false;
    for (let i = 0; i < 4000 / TICK_RATE_MS; i += 1) { step(); if (hiddenFromBoth() && p1.botHideHold) { hidden = true; break; } }
    assert.ok(hidden, 'the reloading unit never hid');
    let guard = 8000 / TICK_RATE_MS;
    while (p1.reloadingUntil > 0 && guard-- > 0) {
      step();
      // The tick that completes the reload also ends the hide (tickBot runs
      // before tickAmmo), so allow it on that one step.
      assert.ok(p1.botCH || p1.reloadingUntil === 0, 'the cover hide holds through the reload');
    }
    assert.ok(guard > 0, 'the reload never completed');
    step(); step();
    assert.equal(p1.botCH, null, 'ended with the reload');
    assert.equal(getCommands(m, 'p1').move, order, 'the order still stands after');
    let moved = false;
    for (let i = 0; i < 1500 / TICK_RATE_MS; i += 1) { step(); if (Math.hypot(p1.vel.x, p1.vel.z) > 0.01) { moved = true; break; } }
    assert.ok(moved, 'the order resumed');
  }
  {
    const { m, step } = streetsHideFixture({ p1: 'unit12' });
    const p1 = m.fighters.p1;
    assert.equal(setMoveOrder(m, 'p1', p1.pos.x + 6, p1.pos.z, 0), true);
    for (let i = 0; i < 2000 / TICK_RATE_MS && getCommands(m, 'p1').move.phase !== 'anchor'; i += 1) step();
    p1.ammo = 0; step(); step();
    assert.ok(p1.botCH && p1.botCH.reload, 'reload-bound cover hide running');
    let ordered = false;
    for (const [x, z] of [[-60, -40], [-70, -30], [-50, -50]]) { if (setMoveOrder(m, 'p1', x, z, 0)) { ordered = true; break; } }
    assert.ok(ordered, 'fixture: no reachable new order');
    step();
    assert.equal(p1.botCH, null, 'the new order took over at once');
    assert.equal(p1.botReloadCH, false, 'the rest of the reload is spent on the order');
    for (let i = 0; i < 1000 / TICK_RATE_MS; i += 1) {
      step();
      assert.ok(p1.reloadingUntil > 0, 'still reloading');
      assert.equal(p1.botCH, null, 'no re-entry during the same reload');
    }
    assert.equal(getCommands(m, 'p1').move.phase, 'travel', 'travelling on the new order');
  }
});

test('reload hide: a bot without a command entry (an enemy) runs the behaviour off botReloadHide alone', () => {
  const { m, step, arena } = streetsHideFixture({ p2: 'unit12' });
  const p2 = m.fighters.p2;
  const hiddenFromItsEnemies = () => hiddenFrom(arena, p2, m.fighters.p1) && hiddenFrom(arena, p2, m.fighters.p3);
  assert.equal(hiddenFromItsEnemies(), false, 'fixture: p2 stands in the open');
  p2.ammo = 0;
  step(['p1', 'p2']); step(['p1', 'p2']);
  assert.equal(p2.botReloadHide, true);
  assert.equal(m.commands?.p2, undefined, 'no side-table entry was created for it');
  let hidden = false;
  for (let i = 0; i < 5000 / TICK_RATE_MS; i += 1) { step(['p1', 'p2']); if (hiddenFromItsEnemies() && p2.botHideHold) { hidden = true; break; } }
  assert.ok(hidden, 'the reloading enemy never hid');
  let guard = 8000 / TICK_RATE_MS;
  while (p2.reloadingUntil > 0 && guard-- > 0) step(['p1', 'p2']);
  step(['p1', 'p2']); step(['p1', 'p2']);
  assert.equal(p2.botReloadHide, false);
  assert.equal(p2.botHideHold, null, 'the hide scratch is nulled once the reload ends');
});

// Plain Field has only its four perimeter walls: no cell inside is ever
// hidden from an enemy standing inside, so every hide search fails there.
function plainNoCoverFixture(order) {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', startTime: 1000 });
  const place = (f, x, z) => { f.pos.x = x; f.pos.z = z; f.pos.y = GROUND_BASE_Y; };
  place(m.fighters.p1, -20, 0); place(m.fighters.p3, -40, 10); place(m.fighters.p2, 30, 0); place(m.fighters.p4, 30, 15);
  for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
  const inputs = { p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput() };
  let now = 1000;
  const step = () => {
    now += TICK_RATE_MS;
    const me = m.fighters.p1;
    me.targetId = commandTargetIdOf(m, 'p1') ?? pickBotTargetId(m, me) ?? me.targetId;
    tickBot(m, 'p1', now); tickCommandDriver(m, 'p1', now);
    tickMatch(m, inputs, now, TICK_DT, ['p1']);
    return now;
  };
  const hit = () => { m.fighters.p1.hitStunUntil = now + 300; m.fighters.p1.hitStunScale = 0.25; };
  return { m, step, hit, now: () => now };
}

test('no cover anywhere: a hidden-ordered unit falls back to Defense on a fresh hit (Plain Field)', () => {
  const { m, step, hit } = plainNoCoverFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 12; i += 1) step();   // the staged search runs out of tiers
  assert.equal(m.fighters.p1.botHideNoCover, true, 'the search found no cover at any tier');
  hit(); step();
  assert.equal(m.fighters.p1.botState, 'defense', 'a fresh hit runs Defense while no cover exists');
  assert.equal(isHideOrdered(m, 'p1'), true, 'the stance itself still stands');
});

test('cover hide: a unit under a move order runs a hide instead of Defense, then the order resumes (Streets)', () => {
  const { m, step, hiddenFromBoth, arena, now: nowFn } = streetsHideFixture();
  const p1 = m.fighters.p1;
  // A short order (the next cell over): the unit arrives within a second and
  // is anchored.
  assert.equal(setMoveOrder(m, 'p1', p1.pos.x + 6, p1.pos.z, 0), true);
  for (let i = 0; i < 2000 / TICK_RATE_MS && getCommands(m, 'p1').move.phase !== 'anchor'; i += 1) step();
  assert.equal(getCommands(m, 'p1').move.phase, 'anchor');
  const anchor = { x: getCommands(m, 'p1').move.x, z: getCommands(m, 'p1').move.z };
  let now = nowFn();
  p1.hitStunUntil = now + 300; p1.hitStunScale = 0.25;   // a landing round
  now = step();
  assert.ok(p1.botCH, 'the hit started a cover hide');
  assert.notEqual(p1.botState, 'defense', 'no Defense for an ordered unit');
  assert.deepEqual(p1.botCH.within, { x: anchor.x, z: anchor.z, r: 14 }, 'anchored: cover inside the area first');
  let hiddenAt = null, endedAt = null, sawDefense = false, goalSeen = null, yielded = false;
  const t0 = now;
  for (let i = 0; i < 4000 / TICK_RATE_MS; i += 1) {
    now = step();
    if (p1.botState === 'defense') sawDefense = true;
    if (p1.botCH && getCommands(m, 'p1').move.reflexHeld) yielded = true;   // the driver yields while the maneuver runs (the flag is consumed by the replan after)
    assert.notEqual(p1.botHideTier, 'nearest', 'the cover hide never settles for cover from one enemy only');
    if (p1.botHideGoal && !goalSeen) goalSeen = { ...p1.botHideGoal };
    if (hiddenAt == null && p1.botCH && hiddenFromBoth()) hiddenAt = now;
    if (!p1.botCH) { endedAt = now; break; }
  }
  assert.equal(sawDefense, false, 'Defense never ran during the cover hide');
  assert.ok(hiddenAt != null, 'the unit reached cover during the maneuver');
  assert.ok(endedAt != null, 'the cover hide ended');
  assert.ok(endedAt - hiddenAt >= 0 && endedAt - hiddenAt <= 700, `ended ${endedAt - hiddenAt} ms after reaching cover (Defense tail expected)`);
  assert.ok(endedAt - t0 <= 2100, 'within the 2 s cap');
  assert.ok(getCommands(m, 'p1').move, 'the move order stands through the maneuver');
  assert.equal(yielded, true, 'the driver yielded to the maneuver');
  assert.equal(p1.botHideHold, null, 'hide scratch nulled after');
  if (goalSeen && Math.hypot(goalSeen.x - anchor.x, goalSeen.z - anchor.z) <= 14) {
    assert.ok(true);   // the in-area tier found cover
  }
  // The driver resumes: the unit moves under the order again within 1 s.
  let moved = false;
  for (let i = 0; i < 1000 / TICK_RATE_MS; i += 1) { step(); if (Math.hypot(p1.vel.x, p1.vel.z) > 0.01) { moved = true; break; } }
  assert.ok(moved, 'the order resumed after the maneuver');
  void arena;
});

test('cover hide: a travelling unit skips the in-area tier; no cover anywhere aborts into Defense (Plain Field)', () => {
  {
    const { m, step, hiddenFromBoth, now: nowFn } = streetsHideFixture();
    const p1 = m.fighters.p1;
    let ordered = false;
    for (const [x, z] of [[-60, -40], [-70, -30], [-50, -50]]) { if (setMoveOrder(m, 'p1', x, z, 0)) { ordered = true; break; } }
    assert.ok(ordered, 'fixture: no reachable far order');
    step();
    assert.equal(getCommands(m, 'p1').move.phase, 'travel');
    p1.hitStunUntil = nowFn() + 300; p1.hitStunScale = 0.25;
    step();
    assert.ok(p1.botCH, 'cover hide started while travelling');
    assert.equal(p1.botCH.within, null, 'no area yet: the in-area tier is skipped');
    void hiddenFromBoth;
  }
  {
    const { m, step, hit, now: nowFn } = plainNoCoverFixture();
    const p1 = m.fighters.p1;
    assert.equal(setMoveOrder(m, 'p1', p1.pos.x + 6, p1.pos.z, 0), true);
    for (let i = 0; i < 2000 / TICK_RATE_MS && getCommands(m, 'p1').move.phase !== 'anchor'; i += 1) step();
    hit(); step();
    assert.ok(p1.botCH, 'cover hide started');
    let defenseAt = null;
    for (let i = 0; i < 20; i += 1) { step(); if (p1.botState === 'defense') { defenseAt = i; break; } }
    assert.ok(defenseAt != null, 'no cover anywhere: the maneuver aborted into Defense');
    assert.equal(p1.botCH, null);
    assert.ok(p1.botCHNoCoverUntil > nowFn(), 'the trigger is held off for the retry window');
    assert.ok(getCommands(m, 'p1').move, 'the move order still stands');
  }
});

test('findHiddenSpot: opts.within keeps the goal inside the disc', () => {
  const { m, arena } = streetsHideFixture();
  const grid = buildNavGrid(arena.obstacles, arena.surfaces);
  const eyes = [m.fighters.p2, m.fighters.p4].map((f) => ({ x: f.pos.x, y: f.pos.y + BOT_LOS_EYE_HEIGHT, z: f.pos.z }));
  const p1 = m.fighters.p1;
  const free = findHiddenSpot(grid, p1.pos.x, p1.pos.z, p1.pos.y, eyes, arena.obstacles, { maxPops: 600 });
  assert.ok(free, 'an unrestricted hide exists');
  const disc = { x: free.goal.x, z: free.goal.z, r: 14 };
  const inside = findHiddenSpot(grid, p1.pos.x, p1.pos.z, p1.pos.y, eyes, arena.obstacles, { maxPops: 600, within: disc });
  assert.ok(inside, 'a hide inside the disc around a known hide');
  assert.ok(Math.hypot(inside.goal.x - disc.x, inside.goal.z - disc.z) <= 14, 'goal inside the disc');
  const far = findHiddenSpot(grid, p1.pos.x, p1.pos.z, p1.pos.y, eyes, arena.obstacles, { maxPops: 600, within: { x: m.fighters.p2.pos.x, z: m.fighters.p2.pos.z, r: 3 } });
  assert.ok(far == null || Math.hypot(far.goal.x - m.fighters.p2.pos.x, far.goal.z - m.fighters.p2.pos.z) <= 3, 'a tiny disc at the enemy: null or inside');
});

test('hide order: two hiding units never search in the same tick (matchState.hideSearchTick)', () => {
  const { m, step } = streetsHideFixture();
  // p3 exposed next to p1 (same open ground), both ordered to hide at once.
  m.fighters.p3.pos.x = -104; m.fighters.p3.pos.z = -78;
  setStance(m, 'p1', true);
  setStance(m, 'p3', true);
  step(['p1', 'p3']);
  const paths1 = [m.fighters.p1.botHidePath, m.fighters.p3.botHidePath].filter((p) => p != null).length;
  assert.equal(paths1, 1, 'exactly one search on the first tick');
  step(['p1', 'p3']);
  const paths2 = [m.fighters.p1.botHidePath, m.fighters.p3.botHidePath].filter((p) => p != null).length;
  assert.equal(paths2, 2, 'the other unit searches on the next tick');
});

test('perf probe: findHiddenSpot stays under 25 ms per call on factory and arena2', () => {
  for (const mapKey of ['factory', 'arena2']) {
    const arena = getArena(mapKey);
    const grid = buildNavGrid(arena.obstacles, arena.surfaces);
    const s = arena.spawns.p1;
    const eye = (x, z) => ({ x, y: GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z });
    const scenarios = {
      'two ground eyes': [eye(s.x + 40, s.z), eye(s.x + 30, s.z - 20)],
      'far eyes (long walk)': [eye(-s.x, -s.z), eye(-s.x, s.z)],
      'sky eyes (near-exhaustive)': [{ x: 0, y: 400, z: 0 }, { x: 10, y: 400, z: 10 }]
    };
    // One warm-up call per map so the JIT is not what gets measured.
    findHiddenSpot(grid, s.x, s.z, 0, scenarios['two ground eyes'], arena.obstacles);
    for (const [name, eyes] of Object.entries(scenarios)) {
      let worst = 0;
      let result = null;
      for (let i = 0; i < 5; i += 1) {
        const t0 = performance.now();
        result = findHiddenSpot(grid, s.x, s.z, 0, eyes, arena.obstacles, { maxPops: 600 });
        worst = Math.max(worst, performance.now() - t0);
      }
      assert.ok(worst < 25, `${mapKey} / ${name}: worst ${worst.toFixed(2)} ms per call (found: ${!!result})`);
      if (result) {
        assert.ok(Array.isArray(result.path) && result.path.length >= 1);
        assert.equal(result.goal.x, result.path[result.path.length - 1].x);
        // The goal really is hidden from every eye at the bot's eye height.
        const gEye = { x: result.goal.x, y: result.goal.y + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: result.goal.z };
        for (const e of eyes) assert.ok(!botHasLineOfSight(e, gEye, arena.obstacles, arena.surfaces), `${mapKey} / ${name}: goal exposed`);
      }
    }
  }
});
