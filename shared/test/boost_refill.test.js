// THE GAUGE COMES BACK FASTER AND SOONER (b1105mc; user 2026-11-28: "回復 1.5 倍，等待從 0.5 秒減半成 0.25 秒。 PT and 1.0.0 (online and
// offline)." — the refill one and a half times, the wait before it halved from 0.5 s to 0.25 s). Every unit's gauge comes back 6.885 a tick
// (4.59 until then: 430 a second for 287), and the wait after any spending before it starts back is BOOST_REFILL_PAUSE_MS = 250 ms (500
// until then). The wait is one number: a sprint tick, a dodge, a jump, the sniper's cancel and a flyer's pop and climb all set
// refillPausedUntil = now + BOOST_REFILL_PAUSE_MS (the dodge, the jump, the pop and the climb named a bare 500 until b1105mc). These
// tests spend the gauge with real inputs through tickMatch and read when it starts back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createMatchState, tickMatch, emptyInput, UNIT_DATA,
  BOOST_REGEN_PER_TICK, BOOST_REFILL_PAUSE_MS, BOOST_CAP, BOOST_DASH_DRAIN_PER_TICK, BOOST_EMPTY_RECOVER_MS,
  STEP_BOOST_COST, STEP_DURATION_MS, STEP_COOLDOWN_MS, JUMP_BOOST_COST, SNIPER_CANCEL_BOOST_COST, TICK_RATE_MS, TICK_DT
} from '../src/sim/index.js';
import '../tools/maps/arena_files.mjs';

const START = 1000;
// the first tick at or past the wait: 250 ms on a 16 ms tick is the 16th tick after the spending (256 ms)
const WAIT_TICKS = Math.ceil(BOOST_REFILL_PAUSE_MS / TICK_RATE_MS);
// one fighter on a map with its enemy 80 units off in plain sight (a sniper needs one to shoot at)
function pair(unit, map = 'arena1') {
  const m = createMatchState({ mapKey: map, mode: '1v1', p1UnitKey: unit, p2UnitKey: 'unit1', startTime: START });
  const f = m.fighters.p1, o = m.fighters.p2;
  f.invulnerableUntil = 0; o.invulnerableUntil = 0; o.hp = 1e9;
  if (map === 'arena1') { f.pos.x = -60; f.pos.z = -60; o.pos.x = -60; o.pos.z = 20; }
  return { m, f };
}
// `ticks` ticks of `script(t, fighter, now)`; one row a tick: the clock, the gauge's change, the gauge, the wait still to run, the events
function fly(unit, ticks, script, map) {
  const { m, f } = pair(unit, map); let now = START; const rows = [];
  for (let t = 1; t <= ticks; t += 1) {
    now += TICK_RATE_MS; const before = f.boost; m.events.length = 0;
    tickMatch(m, { p1: script(t, f, now), p2: emptyInput() }, now, TICK_DT, []);
    rows.push({ t, now, d: f.boost - before, boost: f.boost, wait: f.refillPausedUntil - now, action: f.action, grounded: f.grounded, stepping: now <= f.stepUntil,
      events: m.events.map((e) => e.type) });
  }
  return { rows, f };
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the gauge comes back 6.885 a tick, one and a half times the 4.59 it was, after a wait of 250 ms where it waited 500', () => {
  assert.equal(BOOST_REGEN_PER_TICK, 6.885);
  assert.ok(near(BOOST_REGEN_PER_TICK, 4.59 * 1.5));
  assert.equal(BOOST_REFILL_PAUSE_MS, 250);
  assert.equal(BOOST_REFILL_PAUSE_MS, 500 / 2);
  assert.ok(near(BOOST_REGEN_PER_TICK / TICK_DT, 430.3125), 'a second of it: ' + BOOST_REGEN_PER_TICK / TICK_DT);
  assert.equal(Object.keys(UNIT_DATA).length, 21);
  for (const [key, u] of Object.entries(UNIT_DATA)) assert.equal(u.boostRegen, 6.885, key + ' names ' + u.boostRegen);
  // nothing else of the gauge moved
  assert.equal(BOOST_CAP, 250); assert.equal(BOOST_DASH_DRAIN_PER_TICK, 1.1); assert.equal(BOOST_EMPTY_RECOVER_MS, 100);
  assert.equal(STEP_BOOST_COST, 48); assert.equal(JUMP_BOOST_COST, 48); assert.equal(SNIPER_CANCEL_BOOST_COST, 24);
  for (const [key, u] of Object.entries(UNIT_DATA)) { assert.equal(u.boostCap ?? BOOST_CAP, 250, key); assert.equal(u.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK, 1.1, key); }
  assert.equal(WAIT_TICKS, 16);
});

test('every spending sets the one wait: a sprint tick, a dodge, a jump, a flyer\'s pop and climb, the sniper\'s cancel', () => {
  const spent = (rows) => rows.filter((r) => r.d < -1e-9);
  const allWait = (rows, what) => { for (const r of spent(rows)) assert.equal(r.wait, BOOST_REFILL_PAUSE_MS, `${what}, tick ${r.t}: the wait reads ${r.wait}`); };
  // a sprint of ten ticks
  const sprint = fly('unit1', 12, (t) => { const i = emptyInput(); if (t <= 10) { i.moveX = 1; i.boost = true; } return i; });
  assert.equal(spent(sprint.rows).length, 10); for (const r of spent(sprint.rows)) assert.ok(near(r.d, -BOOST_DASH_DRAIN_PER_TICK)); allWait(sprint.rows, 'the sprint');
  // a dodge
  const dodge = fly('unit1', 4, (t) => { const i = emptyInput(); if (t === 1) { i.stepTap = true; i.moveX = 1; } return i; });
  assert.equal(spent(dodge.rows).length, 1); assert.ok(near(dodge.rows[0].d, -STEP_BOOST_COST)); allWait(dodge.rows, 'the dodge');
  // a jump
  const jump = fly('unit1', 4, (t) => { const i = emptyInput(); if (t === 1) i.jump = true; return i; });
  assert.equal(spent(jump.rows).length, 1); assert.ok(near(jump.rows[0].d, -JUMP_BOOST_COST)); allWait(jump.rows, 'the jump');
  // Aris: a jump, a pop in the air, then a climb on the held button
  const pop = UNIT_DATA.unit7.airJumpBoostCost; assert.ok(UNIT_DATA.unit7.flight && pop > 0);
  const aris = fly('unit7', 62, (t) => { const i = emptyInput(); if (t === 1 || t === 30 || (t >= 40 && t <= 60)) i.jump = true; return i; });
  assert.ok(spent(aris.rows).some((r) => near(r.d, -pop) && !r.grounded), 'a pop in the air was paid');
  assert.ok(spent(aris.rows).filter((r) => near(r.d, -BOOST_DASH_DRAIN_PER_TICK) && !r.grounded).length >= 5, 'the climb was paid tick by tick');
  allWait(aris.rows, 'Aris in the air');
  // a sniper: the shot begun, the sprint key held — the cancel is paid on the tick the shot leaves
  const sniper = fly('unit3', 40, (t) => { const i = emptyInput(); if (t === 1) i.shootTap = true; if (t >= 5) i.boost = true; return i; });
  const cancel = sniper.rows.find((r) => r.events.includes('sniper-charge-cancel'));
  assert.ok(cancel, 'the charge was cancelled'); assert.ok(cancel.d <= -SNIPER_CANCEL_BOOST_COST + 1e-9, 'the cancel was paid: ' + cancel.d);
  allWait(sniper.rows, 'the sniper\'s cancel');
});

test('after a sprint to empty the gauge is still empty at 240 ms, comes back at 256, holds a dodge\'s cost at 352 and is full at 832', () => {
  let emptyAt = 0;
  const { rows } = fly('unit1', 320, (t, f) => { const i = emptyInput(); if (!emptyAt && f.boost > 0) { i.moveX = 1; i.boost = true; } else if (!emptyAt) emptyAt = t - 1; return i; });
  assert.ok(emptyAt > 0, 'the gauge ran out'); const at = (k) => rows[emptyAt - 1 + k];
  assert.equal(at(0).boost, 0); assert.equal(at(0).wait, BOOST_REFILL_PAUSE_MS, 'the last sprint tick set the wait');
  assert.equal(emptyAt, Math.ceil(BOOST_CAP / BOOST_DASH_DRAIN_PER_TICK), 'a full gauge is 228 ticks of sprint (3.65 s), as before');
  for (let k = 1; k < WAIT_TICKS; k += 1) assert.equal(at(k).boost, 0, `still empty ${k * TICK_RATE_MS} ms on`);
  assert.ok(near(at(WAIT_TICKS).boost, BOOST_REGEN_PER_TICK), `back at ${WAIT_TICKS * TICK_RATE_MS} ms: ${at(WAIT_TICKS).boost}`);
  const first = (pred) => { for (let k = 1; emptyAt - 1 + k < rows.length; k += 1) if (pred(at(k))) return k * TICK_RATE_MS; return -1; };
  assert.equal(first((r) => r.boost > 0), 256);
  assert.equal(first((r) => r.boost >= STEP_BOOST_COST), 352, 'a dodge is paid for again');
  assert.equal(first((r) => r.boost >= BOOST_CAP), 832, 'full again');
  // (with the 4.59 and the 500 ms it had: 512, 672 and 1376 ms)
});

test('a dodge: its cost starts back 256 ms after it began, in the dodge\'s last ticks, and a full gauge is full again 96 ms later', () => {
  const { rows } = fly('unit1', 80, (t) => { const i = emptyInput(); if (t === 1) { i.stepTap = true; i.moveX = 1; } return i; });
  assert.ok(near(rows[0].d, -STEP_BOOST_COST));
  for (let k = 1; k < WAIT_TICKS; k += 1) assert.ok(near(rows[k].d, 0), `no refill ${k * TICK_RATE_MS} ms in`);
  assert.ok(near(rows[WAIT_TICKS].d, BOOST_REGEN_PER_TICK), 'the first of it at 256 ms');
  assert.ok(BOOST_REFILL_PAUSE_MS < STEP_DURATION_MS && rows[WAIT_TICKS].stepping, 'the dodge still runs then: its 300 ms are longer than the wait');
  const fullAt = rows.findIndex((r, k) => k > 0 && r.boost >= BOOST_CAP);
  assert.equal(fullAt * TICK_RATE_MS, 352, 'full again 352 ms after the dodge began');
  // the dodge's own gate is its cooldown, far longer than either: the faster refill buys no extra dodge
  assert.ok(STEP_COOLDOWN_MS > 3 * 352);
});

test('a jump: the gauge waits for the ground as before, then comes back 6.885 a tick', () => {
  const { rows } = fly('unit1', 120, (t) => { const i = emptyInput(); if (t === 1) i.jump = true; return i; });
  assert.ok(near(rows[0].d, -JUMP_BOOST_COST));
  const back = rows.findIndex((r) => r.d > 1e-9); assert.ok(back > WAIT_TICKS, 'the air is longer than the wait');
  for (let k = 1; k < back; k += 1) assert.ok(near(rows[k].d, 0));
  assert.ok(rows[back].grounded && !rows[back - 2].grounded, 'the refill began with the landing');
  assert.ok(near(rows[back].d, BOOST_REGEN_PER_TICK));
});

test('the sprint key held on an empty gauge: the gauge never comes back, and 30 s of it cover less ground than a plain walk', () => {
  const { m, f } = pair('unit1'); let now = START, dir = 1, dist = 0, emptied = false, rose = 0; const walk = f.unit.walkSpeed;
  const N = Math.round(30000 / TICK_RATE_MS);
  for (let t = 0; t < N; t += 1) {
    now += TICK_RATE_MS; if (f.pos.x > 95) dir = -1; else if (f.pos.x < -95) dir = 1;
    const i = emptyInput(); i.moveX = dir; i.boost = true; const px = f.pos.x, pz = f.pos.z, before = f.boost; m.events.length = 0;
    tickMatch(m, { p1: i, p2: emptyInput() }, now, TICK_DT, []);
    dist += Math.hypot(f.pos.x - px, f.pos.z - pz);
    if (emptied && f.boost > before) rose += 1; if (f.boost <= 0) emptied = true;
  }
  assert.ok(emptied); assert.equal(rose, 0, 'the gauge rose while the key was held');
  assert.equal(f.boost, 0);
  assert.ok(dist / 30 < walk, `held: ${(dist / 30).toFixed(1)} u/s, a walk: ${walk}`);
});

test('a map\'s boost scale: the refill is five times 6.885 on District, and the wait is the same 250 ms', () => {
  const { rows, f } = fly('unit1', 60, (t) => { const i = emptyInput(); if (t <= 40) { i.moveX = 1; i.boost = true; } return i; }, 'district');
  assert.equal(f.boostScale, 5);
  const spent = rows.filter((r) => r.d < -1e-9); assert.equal(spent.length, 40); for (const r of spent) assert.equal(r.wait, BOOST_REFILL_PAUSE_MS);
  for (let k = 41; k < 40 + WAIT_TICKS; k += 1) assert.ok(near(rows[k - 1].d, 0), 'no refill at tick ' + k);
  assert.ok(near(rows[40 + WAIT_TICKS - 1].d, 5 * BOOST_REGEN_PER_TICK), 'the first refill tick: ' + rows[40 + WAIT_TICKS - 1].d);
});

test('the client\'s own offline game names the same refill and the same wait as the sim', (t) => {
  const file = new URL('../../client/src/main.js', import.meta.url);
  if (!fs.existsSync(file)) { t.skip('no client beside the sim'); return; }
  const src = fs.readFileSync(file, 'utf8');
  assert.equal(Number(src.match(/^const BOOST_REGEN_PER_TICK = ([0-9.]+);/m)?.[1]), BOOST_REGEN_PER_TICK);
  assert.equal(Number(src.match(/^const BOOST_REFILL_PAUSE_MS = ([0-9.]+);/m)?.[1]), BOOST_REFILL_PAUSE_MS);
  const regens = [...src.matchAll(/^    boostRegen: ([0-9.]+),/gm)].map((x) => Number(x[1]));
  assert.equal(regens.length, Object.keys(UNIT_DATA).length); for (const r of regens) assert.equal(r, BOOST_REGEN_PER_TICK);
  // every spending in the offline game sets the named wait, none a number of its own
  assert.equal([...src.matchAll(/refillPausedUntil = now \+ BOOST_REFILL_PAUSE_MS;/g)].length, 10);
  assert.equal([...src.matchAll(/refillPausedUntil = [^;\n]*\+ *[0-9]/g)].length, 0);
});
