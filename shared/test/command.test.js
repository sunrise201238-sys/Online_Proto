// Fight/Hide stance order (owner 2026-09-26): the command side-table
// semantics, the hide behaviour in tickBot (hidden from every enemy, then a
// statue hold; Defense suppressed; clean resume on Fight) and the cost of
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
function streetsHideFixture() {
  const m = createMatchState({
    mapKey: 'arena2', mode: '2v2',
    p1UnitKey: 'unit1', p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1',
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

test('setStance: hide wipes move+lock, refuses move/lock while hidden, clearCommands resets it, dead unit refused', () => {
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
  assert.equal(setMoveOrder(m, 'p1', 0, 0, 0), false, 'move order refused while hidden');
  assert.equal(setForceLock(m, 'p1', 'p2'), false, 'force lock refused while hidden');
  assert.equal(getCommands(m, 'p1').move, null);
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

test('hide order (Streets 2v2): the bot ends hidden from BOTH enemy eyes within 10 s and then holds still for 1 s', () => {
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
  // Statue hold: no sway, no peeking, momentum cleared.
  let maxVel = 0;
  const holdPos = { x: m.fighters.p1.pos.x, z: m.fighters.p1.pos.z };
  for (let i = 0; i < 1000 / TICK_RATE_MS; i += 1) {
    step();
    const f = m.fighters.p1;
    maxVel = Math.max(maxVel, Math.hypot(f.vel.x, f.vel.z));
    assert.equal(f.botHideHold, true, 'hold flag stays up while hidden');
    assert.equal(f.action, 'idle');
    assert.ok(hiddenFromBoth(), 'stays hidden through the hold');
  }
  assert.ok(maxVel < 0.01, `|vel| during the hold: ${maxVel}`);
  assert.ok(Math.hypot(m.fighters.p1.pos.x - holdPos.x, m.fighters.p1.pos.z - holdPos.z) < 0.05, 'did not drift');
  assert.equal(m.fighters.p1.botHidePath, null, 'no route while holding');
  assert.ok(m.fighters.p1.stillSince > 0, 'the bloom stillness clock is running (pin-point return fire)');
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
  assert.ok(hiddenFromBoth(), 'precondition: hidden and holding');
  for (let i = 0; i < 20; i += 1) step();
  assert.equal(Math.hypot(m.fighters.p1.vel.x, m.fighters.p1.vel.z), 0);
  assert.equal(setStance(m, 'p1', false), true);
  let movingAtMs = null;
  const t0 = m.now;
  for (let i = 0; i < 2000 / TICK_RATE_MS; i += 1) {
    const now = step();
    if (Math.hypot(m.fighters.p1.vel.x, m.fighters.p1.vel.z) > 0.01) { movingAtMs = now - t0; break; }
  }
  assert.ok(movingAtMs != null, 'the unit stayed frozen after Fight');
  const f = m.fighters.p1;
  for (const k of ['botHidePath', 'botHidePathIdx', 'botHideGoal', 'botHideSearchAt', 'botHideFailedAt',
    'botHideHold', 'botHideDashArmed', 'botHideTier', 'botHideMoveAnchor']) {
    assert.equal(f[k], null, `${k} nulled on clear`);
  }
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
