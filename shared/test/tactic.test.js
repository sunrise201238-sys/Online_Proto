import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
// THE ALLY TACTIC (tactic.js; b1105gq): a classic player's call to a bot teammate — 'push' (FORWARD: the range band 30 nearer)
// or 'hide' (BACK OFF: the Hide stance), each for 40 s (b1105jm; 20 s from b1105io, 10 s before it — the times below are written off
// ALLY_TACTIC_MS, its value pinned once); the standing one taken back, or replaced by the other, at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, tickMatch, tickBot, tickCommandDriver, commandTargetIdOf, pickBotTargetId, emptyInput,
  setAllyTactic, setStance, clearCommands, getCommands, ensureCommands, tacticOf, tacticSettle, tacticEcho, setTactic,
  botHasLineOfSight, getArena,
  ALLY_TACTIC_MS, ALLY_TACTIC_PUSH, ALLY_TACTIC_KINDS, TICK_RATE_MS, TICK_DT, BOT_LOS_EYE_HEIGHT, GROUND_BASE_Y, UNIT_DATA
} from '../src/sim/index.js';

test('the call on the table: set, taken back, replaced, run out; an unknown kind and a dead unit refused; a wipe takes it', () => {
  assert.equal(ALLY_TACTIC_MS, 40000); assert.equal(ALLY_TACTIC_PUSH, 30); const D = ALLY_TACTIC_MS; assert.deepEqual(ALLY_TACTIC_KINDS, ['push', 'hide']);
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1', startTime: 1000 });
  const cmd = ensureCommands(m, 'p3');
  assert.equal(tacticOf(cmd, 1000), null); assert.equal(tacticSettle(cmd, 1000), false, 'nothing called: nothing changed');
  assert.equal(setAllyTactic(m, 'p3', 'push', 1000), true);
  assert.equal(tacticOf(cmd, 1000), 'push'); assert.equal(tacticOf(cmd, 1000 + D - 1), 'push'); assert.equal(tacticOf(cmd, 1000 + D), null, 'it stands 40 s to the tick');
  assert.equal(tacticOf(cmd, 11000), 'push', 'still standing where the 10 s of before b1105io ended');
  assert.equal(tacticOf(cmd, 21000), 'push', 'and where the 20 s of before b1105jm ended');
  assert.deepEqual(tacticEcho(cmd, 5000), { kind: 'push', until: 1000 + D }); assert.equal(tacticEcho(cmd, 1000 + D), null);
  assert.equal(tacticSettle(cmd, 1016), true, 'an order is a change, once'); assert.equal(tacticSettle(cmd, 1032), false);
  assert.equal(setAllyTactic(m, 'p3', 'hide', 3000), true, 'the other one replaces it at once');
  assert.equal(tacticOf(cmd, 3000), 'hide'); assert.equal(cmd.tactic.until, 3000 + D, 'and its 40 s run from then');
  assert.equal(cmd.hide, false, 'the stance flag of the commander and of the reload is not the tactic\'s to write');
  assert.equal(tacticSettle(cmd, 3016), true);
  assert.equal(setAllyTactic(m, 'p3', null, 4000), true, 'the take-back');
  assert.equal(tacticOf(cmd, 4000), null); assert.equal(tacticSettle(cmd, 4016), true); assert.equal(tacticSettle(cmd, 4032), false);
  assert.equal(setAllyTactic(m, 'p3', null, 4100), true, 'taking back nothing is no error'); assert.equal(tacticSettle(cmd, 4116), false, 'and no change');
  assert.equal(setAllyTactic(m, 'p3', 'charge', 5000), false, 'an unknown kind'); assert.equal(tacticOf(cmd, 5000), null);
  setAllyTactic(m, 'p3', 'push', 6000); tacticSettle(cmd, 6016);
  assert.equal(tacticSettle(cmd, 6000 + D - 1), false); assert.equal(tacticSettle(cmd, 6000 + D), true, 'running out is a change too'); assert.equal(cmd.tactic, null);
  setAllyTactic(m, 'p3', 'hide', 7000 + D); clearCommands(m, 'p3');
  assert.equal(tacticOf(cmd, 7001 + D), null, 'the wipe (death, respawn) takes the call with it');
  m.fighters.p3.hp = 0;
  assert.equal(setAllyTactic(m, 'p3', 'push', 8000 + D), false, 'a dead unit takes no call');
  assert.equal(setTactic(null, 'push', 0), false); assert.equal(tacticOf(null, 0), null); assert.equal(tacticSettle(null, 0), false); assert.equal(tacticEcho(null, 0), null);
});

// Plain Field, a bot (p1, the AR: lock range 110, its band the half-width of constants.js either side) against a target that
// stands: the distance it keeps — the band's middle, where Engage's pull holds it.
function fieldRun(script, ms) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -55; p1.pos.z = 0; p2.pos.x = 55; p2.pos.z = 0;   // 110 apart: inside the band
  for (const f of [p1, p2]) { f.invulnerableUntil = 0; f.hp = 1e9; }
  p1.botControlled = true; p1.targetId = 'p2';
  ensureCommands(m, 'p1');
  let now = 1000; const rows = [];
  for (let i = 0; i < ms / TICK_RATE_MS; i += 1) {
    script(m, now - 1000, now);
    tickBot(m, 'p1', now);
    tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']);
    rows.push({ t: now - 1000, d: Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z), locked: p1.redLock });
    now += TICK_RATE_MS;
  }
  return { m, rows };
}
const span = (rows, a, b) => { const v = rows.filter((r) => r.t >= a && r.t < b).map((r) => r.d); return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((s, x) => s + x, 0) / v.length }; };

test('FORWARD on Plain Field: the bot stands 30 nearer for the call\'s 40 s, inside its own lock, and is back at its band after', () => {
  assert.equal(UNIT_DATA.unit1.lockRange, 110);
  let called = false; const end = 3000 + ALLY_TACTIC_MS;   // (the call at 3 s of the run: it stands to `end`)
  const { rows } = fieldRun((m, t, now) => { if (!called && t >= 3000) { called = true; assert.equal(setAllyTactic(m, 'p1', 'push', now), true); } }, end + 9000);
  const before = span(rows, 1500, 3000), held = span(rows, 7000, end), after = span(rows, end + 5000, end + 9000);
  assert.ok(before.min > 100 && before.max < 120, `before the call the bot keeps its band: ${before.min.toFixed(1)} to ${before.max.toFixed(1)}`);
  assert.ok(held.min > 70 && held.max < 90, `under the call it keeps the pushed band's middle, 80: ${held.min.toFixed(1)} to ${held.max.toFixed(1)}`);
  assert.ok(rows.filter((r) => r.t >= 7000 && r.t < end).every((r) => r.locked), 'a pushed bot stands inside its lock: the lock range itself has not moved');
  assert.ok(after.min > 100 && after.max < 120, `the call over, it is back at its band: ${after.min.toFixed(1)} to ${after.max.toFixed(1)}`);
});

test('FORWARD taken back: the bot is back at its band without waiting the 40 s out; with no call nothing moves', () => {
  let step = 0;
  const { rows } = fieldRun((m, t, now) => {
    if (step === 0 && t >= 3000) { step = 1; setAllyTactic(m, 'p1', 'push', now); }
    if (step === 1 && t >= 7000) { step = 2; setAllyTactic(m, 'p1', null, now); }
  }, 13000);
  const held = span(rows, 6000, 7000), after = span(rows, 10500, 13000);
  assert.ok(held.max < 90, `under the call: ${held.max.toFixed(1)}`);
  assert.ok(after.min > 100 && after.max < 120, `3.5 s after the take-back it keeps its band again: ${after.min.toFixed(1)} to ${after.max.toFixed(1)}`);
  const plain = span(fieldRun(() => {}, 13000).rows, 1500, 13000);
  assert.ok(plain.min > 100 && plain.max < 120, `no call: ${plain.min.toFixed(1)} to ${plain.max.toFixed(1)}`);
});

// Streets 2v2, command.test.js's fixture: the bot (p1) in the open, both enemies standing with a clear line on it.
const eyeOf = (f) => ({ x: f.pos.x, y: f.pos.y + BOT_LOS_EYE_HEIGHT, z: f.pos.z });
const hiddenFrom = (arena, me, enemy) => !botHasLineOfSight(eyeOf(enemy), eyeOf(me), arena.obstacles, arena.surfaces);
function streets(p1Unit = 'unit1') {
  const m = createMatchState({ mapKey: 'arena2', mode: '2v2', p1UnitKey: p1Unit, p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1', startTime: 1000 });
  const place = (f, x, z) => { f.pos.x = x; f.pos.z = z; f.pos.y = GROUND_BASE_Y; };
  place(m.fighters.p1, -100, -75); place(m.fighters.p2, -60, -75); place(m.fighters.p4, -75, -85); place(m.fighters.p3, -126, -82);
  for (const f of Object.values(m.fighters)) { f.invulnerableUntil = 0; f.hp = 1e9; }
  const arena = getArena('arena2');
  const inputs = { p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput() };
  let now = 1000;
  const step = () => { now += TICK_RATE_MS; const me = m.fighters.p1; me.targetId = commandTargetIdOf(m, 'p1') ?? pickBotTargetId(m, me) ?? me.targetId; tickBot(m, 'p1', now); tickCommandDriver(m, 'p1', now); tickMatch(m, inputs, now, TICK_DT, ['p1']); return now; };
  const hidden = () => hiddenFrom(arena, m.fighters.p1, m.fighters.p2) && hiddenFrom(arena, m.fighters.p1, m.fighters.p4);
  return { m, step, hidden, now: () => now };
}

test('BACK OFF on Streets: the bot breaks both enemies\' lines within the call, holds its cover to the call\'s end, then fights on', () => {
  const { m, step, hidden, now } = streets();
  ensureCommands(m, 'p1');
  assert.equal(hidden(), false, 'fixture: both enemies see the bot at the start');
  const t0 = now();
  assert.equal(setAllyTactic(m, 'p1', 'hide', t0), true);
  let hiddenAt = null, seenAfter = 0, ticksAfter = 0;
  while (now() - t0 < ALLY_TACTIC_MS - TICK_RATE_MS) {
    step();
    if (hiddenAt == null) { if (hidden() && m.fighters.p1.botHideHold === true) hiddenAt = now() - t0; }
    else { ticksAfter += 1; if (!hidden()) seenAfter += 1; }
    assert.equal(getCommands(m, 'p1').hide, false, 'the entry\'s own hide flag stays the commander\'s');
  }
  assert.ok(hiddenAt != null && hiddenAt < 8000, `the bot never broke both lines of sight (${hiddenAt})`);
  assert.equal(seenAfter, 0, `seen on ${seenAfter} of ${ticksAfter} ticks after it hid`);
  // the call over: the stance is dropped and its scratch cleared on the first tick after, and the bot walks back into the fight
  for (let i = 0; i < 4; i += 1) step();
  assert.equal(m.fighters.p1.botHideHold, null, 'the hide scratch is cleared when the call ends');
  let out = false;
  for (let i = 0; i < 6000 / TICK_RATE_MS && !out; i += 1) { step(); out = !hidden(); }
  assert.ok(out, 'the bot never came out of its cover after the call');
});

test('BACK OFF and the commander\'s own stance do not undo each other: a call ending leaves a standing Hide order standing', () => {
  const { m, step, now } = streets();
  setStance(m, 'p1', true);
  setAllyTactic(m, 'p1', 'hide', now());
  for (let i = 0; i < (ALLY_TACTIC_MS + 500) / TICK_RATE_MS; i += 1) step();
  assert.equal(getCommands(m, 'p1').hide, true); assert.equal(getCommands(m, 'p1').tactic, null);
  assert.equal(m.fighters.p1.botHideHold, true, 'still in the stance, by the order');
});

test('a route under way is planned again on a call: the Maze\'s route record is new on the tick the band moved', () => {
  const m = createMatchState({ mapKey: 'compound', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  for (const f of [p1, p2]) { f.invulnerableUntil = 0; f.hp = 1e9; }
  p1.botControlled = true; p1.targetId = 'p2';
  ensureCommands(m, 'p1');
  let now = 1000;
  const step = () => { now += TICK_RATE_MS; tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); };
  for (let i = 0; i < 4000 / TICK_RATE_MS; i += 1) step();
  assert.equal(p1.botState, 'maze', 'fixture: across Compound the bot is on a route');
  const rec = m._navPaths?.p1;
  assert.ok(rec && rec.path.length > 1 && !rec.pending, 'fixture: its route has landed');
  step();
  assert.equal(m._navPaths.p1, rec, 'no call: the route stands');
  setAllyTactic(m, 'p1', 'push', now);
  step();
  const fresh = m._navPaths.p1;
  assert.notEqual(fresh, rec, 'the call starts the route afresh'); assert.equal(fresh.at, now);
  assert.ok(fresh.path.length > 1, 'the old route stands in until the new one lands');
  for (let i = 0; i < 3000 / TICK_RATE_MS && m._navPaths?.p1?.pending; i += 1) step();
  assert.equal(p1.botState, 'maze');
  const landed = m._navPaths.p1;
  setAllyTactic(m, 'p1', null, now);
  step();
  assert.notEqual(m._navPaths.p1, landed, 'and the take-back does, again');
});

// b1105iq: online a seat its player left in mid-match can be called to, and has no entry until the first call (a match-start
// bot has one from the start). The machine guns alone reload long enough for the bot's reload hide (5 s; 3 s is the least).
test('a call to a slot with no entry yet does not let the unit out of a reload hide under way, and the hide ends with the reload', () => {
  const run = (entryFromStart) => {
    const { m, step, now } = streets('unit5');
    const me = m.fighters.p1;
    if (entryFromStart) ensureCommands(m, 'p1');
    me.ammo = 0;   // the drum is out: the 5 s reload starts on the next tick, and the bot spends it in the stance
    for (let i = 0; i < 40 && !(me.botReloadHide === true && me.botHideHold != null); i += 1) step();
    assert.equal(me.botReloadHide, true, 'fixture: the reload hide is under way'); assert.ok(me.botHideHold != null, 'fixture: the bot is in the stance');
    assert.ok(me.reloadingUntil - now() > 3000, `fixture: most of the reload is ahead (${me.reloadingUntil - now()} ms)`);
    assert.equal(!!getCommands(m, 'p1'), entryFromStart, 'fixture: the entry is there only where it was made at the start');
    assert.equal(setAllyTactic(m, 'p1', 'push', now()), true);
    const c = getCommands(m, 'p1');
    assert.equal(c.hide, true, 'the hide under way is on the entry'); assert.equal(c.hideAuto, true, 'as the reload\'s own, to be released with it');
    let ticks = 0, out = 0;
    while (me.reloadingUntil > now() + TICK_RATE_MS) { step(); ticks += 1; if (me.botHideHold == null) out += 1; }
    assert.ok(ticks > 150, `fixture: the rest of the reload was ticked (${ticks})`);
    assert.equal(out, 0, `out of the stance on ${out} of ${ticks} ticks of the reload after the call`);
    for (let i = 0; i < 4; i += 1) step();   // the reload over: the hide is released, the call stands on
    assert.equal(me.botReloadHide, false); assert.equal(c.hide, false); assert.equal(c.hideAuto, false);
    assert.equal(me.botHideHold, null, 'out of the stance once the reload is over');
    assert.equal(tacticOf(c, now()), 'push', 'the call still stands');
  };
  run(true);    // a match-start bot: the entry is there from the start, the brain itself put the hide on it
  run(false);   // a seat left in mid-match: the call makes the entry
  // and with no reload hide under way a new entry carries none
  const { m, now } = streets('unit5');
  assert.equal(setAllyTactic(m, 'p1', 'push', now()), true);
  assert.equal(getCommands(m, 'p1').hide, false); assert.equal(getCommands(m, 'p1').hideAuto, false);
});
