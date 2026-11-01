// Defense's commits by trigger (nbrain.js BOT_DEFENSE_*_MS; user 2026-11-01, "change these three to 1,500 ms (keep their
// categories)"): a hit commits 1,500 ms, a hit while the locked enemy's sniper charges commits 1,500 ms, and the anti-glint
// dodge's follow-through runs 1,500 ms past the step's end. One hit's whole Defense is the hit's 350 ms evade window — every tick
// of it re-arms the commit — and then the commit: about 1.85 s on open ground. And all three runs stay across the line the whole
// way (user 2026-11-01, "all staying vertical"): the bot circles the enemy at the distance it had, every step within a few degrees
// of the perpendicular, instead of a straight line that drifts 28-34 degrees off and some 14 u out. Plain Field, the bot 120 u
// from a still enemy.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { pickBotTargetId } from '../src/sim/ai.js';
import { reloadHolds } from '../src/sim/actions.js';

const withDrain = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (the PT site's switch, where the tree has one)

function duel() {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -60; p1.pos.z = 0; p2.pos.x = 60; p2.pos.z = 0; p1.hp = 1e9; p2.hp = 1e9; p1.botControlled = true; p1.targetId = 'p2';
  let now = 1000;
  const tick = (before) => { now += TICK_RATE_MS; before?.(now); tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); m.events.length = 0; return now; };
  for (let i = 0; i < 40; i += 1) tick();   // (settled into its pursuit)
  return { m, p1, p2, tick };
}

test('Defense commit: a hit commits 1,500 ms, and one hit\'s whole Defense is the 350 ms evade window and then the commit', () => withDrain(() => {
  const { p1, tick } = duel();
  let hitAt = null;
  tick((now) => { hitAt = now; p1.lastHitAt = now; });
  assert.equal(p1.botState, 'defense', 'the hit starts Defense');
  assert.equal(p1.botDefenseUntil - hitAt, 1500, 'the commit at the hit');
  let end = null;
  for (let i = 0; i < 300 && end == null; i += 1) { const now = tick(); if (p1.botState !== 'defense') end = now; }
  assert.ok(end != null, 'Defense ends');
  const ran = end - hitAt;
  assert.ok(ran >= 350 + 1500 - 2 * TICK_RATE_MS && ran <= 350 + 1500 + 2 * TICK_RATE_MS, `one hit's Defense ${ran} ms (the window, then the commit)`);
}));

test('Defense commit: a hit while the locked enemy\'s sniper charges at the bot commits 1,500 ms', () => withDrain(() => {
  const { p1, p2, tick } = duel();
  let hitAt = null;
  tick((now) => { hitAt = now; p2.sniperChargeTargetId = 'p1'; p2.sniperChargeUntil = now + 3000; p1.lastHitAt = now; });
  assert.equal(p1.botState, 'defense', 'the hit starts Defense');
  assert.equal(p1.botDefenseUntil - hitAt, 1500, 'the sniper-charge commit at the hit');
}));

test('Defense commit: the anti-glint dodge\'s follow-through runs 1,500 ms past the step\'s end', () => withDrain(() => {
  const { p1, p2, tick } = duel();
  let stepped = false;
  for (let i = 0; i < 200 && !stepped; i += 1) {
    const su = p1.stepUntil ?? 0;
    const now = tick((t) => { p2.sniperChargeTargetId = 'p1'; p2.sniperChargeUntil = 1000 + 3000 + 40 * TICK_RATE_MS; });
    if ((p1.stepUntil ?? 0) > su && p1.stepUntil > now) stepped = true;
  }
  assert.ok(stepped, 'the bot dodged the glint');
  assert.equal(p1.botState, 'defense', 'the dodge hands over to Defense');
  assert.equal(p1.botDefenseUntil - p1.stepUntil, 1500, 'the follow-through past the step');
}));

// The run's geometry: from its start (the hit, or the dodge's step end) to its end, every step's angle off the perpendicular of the
// line from the enemy (after the first two ticks, while the legs turn), and the distance to the enemy at the start and the end.
function runGeometry(kind) {
  const { p1, p2, tick } = duel();
  let from = null, stepEnd = null, d0 = null, d1 = null, worst = 0, n = 0, ended = false;
  for (let i = 0; i < 400 && !ended; i += 1) {
    const before = { x: p1.pos.x, z: p1.pos.z };
    const now = tick((t) => {
      const charging = kind !== 'hit' && (kind !== 'dodge' || stepEnd == null || t < stepEnd + 50);
      if (charging) { p2.sniperChargeTargetId = 'p1'; p2.sniperChargeUntil = 1000 + 3000 + 40 * TICK_RATE_MS; } else p2.sniperChargeTargetId = null;
      if (kind !== 'dodge' && from == null) { from = t; p1.lastHitAt = t; }
    });
    if (kind === 'dodge' && stepEnd == null && (p1.stepUntil ?? 0) > now) { stepEnd = p1.stepUntil; from = stepEnd; }
    if (from == null || now <= from) continue;
    if (p1.botState !== 'defense') { if (d0 != null) { d1 = Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z); ended = true; } continue; }
    if (d0 == null) d0 = Math.hypot(before.x - p2.pos.x, before.z - p2.pos.z);
    n += 1;
    const mvx = p1.pos.x - before.x, mvz = p1.pos.z - before.z, ml = Math.hypot(mvx, mvz);
    const lx = before.x - p2.pos.x, lz = before.z - p2.pos.z, ll = Math.hypot(lx, lz);
    if (n > 2 && ml > 0.05) worst = Math.max(worst, Math.asin(Math.min(1, Math.abs((mvx * lx + mvz * lz) / (ml * ll)))) * 180 / Math.PI);
  }
  return { ended, worst, d0, d1, n };
}

for (const [kind, label] of [['hit', 'one hit'], ['sniper', 'a hit under the locked sniper\'s charge'], ['dodge', 'the anti-glint dodge\'s follow-through']]) {
  test(`Defense stays across the line: ${label} — every step within 5 degrees of the perpendicular, the distance kept within 4 u`, () => withDrain(() => {
    const g = runGeometry(kind);
    assert.ok(g.ended && g.n > 60, `a whole run (${g.n} ticks)`);
    assert.ok(g.worst <= 5, `off the perpendicular at most ${g.worst.toFixed(1)} degrees`);
    assert.ok(Math.abs(g.d1 - g.d0) <= 4, `distance ${g.d0.toFixed(1)} -> ${g.d1.toFixed(1)} u`);
  }));
}

// Off the wall: after a wall slide the circling turns back across the line the way round that leaves the wall. Before that check,
// the run turned straight back into the wall the slide had left, and under fire (every hit re-arming the Defense the bail had
// ended) the bot stayed pinned there: in this seeded Airport duel, 3.4 s steering into the wall. The longest streak of Defense ticks
// steering into the wall the body was pushed off that tick (on the ground, past any step, out of cover, not held by a reload) stays
// under a second. Both bots, the server host's order: pick the target, tickBot, then tickMatch.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function longestIntoWall({ mapKey, units, seed, seconds }) {
  const real = Math.random; Math.random = mulberry32(seed);
  try {
    const m = createMatchState({ mapKey, p1UnitKey: units[0], p2UnitKey: units[1], startTime: 1000, mode: '1v1' });
    const ids = Object.keys(m.fighters);
    for (const id of ids) { m.fighters[id].hp = 1e9; m.fighters[id].botControlled = true; }
    const streak = {}, best = {};
    let now = 1000;
    for (let i = 0; i < seconds * 1000 / TICK_RATE_MS; i += 1) {
      now += TICK_RATE_MS;
      const was = Object.fromEntries(ids.map((id) => [id, m.fighters[id].botState]));
      for (const id of ids) { const me = m.fighters[id]; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); }
      tickMatch(m, Object.fromEntries(ids.map((id) => [id, emptyInput()])), now, TICK_DT, ids);
      for (const id of ids) {
        const f = m.fighters[id], wn = m.walls?.[id];
        const into = f.botState === 'defense' && was[id] === 'defense' && !f.botDefenseInCover && f.grounded && !f.airborne
          && now > (f.stepUntil ?? 0) && !!wn && f.botDefenseDirX != null && wn.x * f.botDefenseDirX + wn.z * f.botDefenseDirZ < -0.4
          && !reloadHolds(f.unit, f, now);
        streak[id] = into ? (streak[id] ?? 0) + 1 : 0;
        best[id] = Math.max(best[id] ?? 0, streak[id]);
      }
    }
    return Math.max(...ids.map((id) => best[id] ?? 0)) * TICK_RATE_MS;
  } finally { Math.random = real; }
}

test('Defense off the wall: after a wall slide no Defense run steers into the wall for a second (Airport, seeded duel)', () => withDrain(() => {
  const ms = longestIntoWall({ mapKey: 'airport', units: ['unit5', 'unit7'], seed: 1, seconds: 60 });
  assert.ok(ms < 1000, `the longest Defense streak steering into a wall: ${ms} ms`);
}));

// One life: the run circles its reference enemy only while that enemy lives the life it had when the reference was set. A respawn
// (a new spawn stamp) hands the run to the locked target — on the server, whose slot id outlives the death, as on the offline host,
// whose mech id need not. 2v2 on Plain Field: p1's Defense circles p4, not its locked target p2; then p4 respawns.
test('Defense reference is one life: a respawned reference enemy gives way to the locked target', () => withDrain(() => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1', startTime: 1000, mode: '2v2' });
  const { p1, p2, p3, p4 } = m.fighters;
  assert.ok(p1.team === p3.team && p2.team === p4.team && p1.team !== p2.team, 'p1 and p3 against p2 and p4');
  for (const f of [p1, p2, p3, p4]) { f.hp = 1e9; f.invulnerableUntil = 0; }
  p1.pos.x = 0; p1.pos.z = 0; p2.pos.x = 60; p2.pos.z = 0; p3.pos.x = -80; p3.pos.z = -80; p4.pos.x = 0; p4.pos.z = 60;
  p1.botControlled = true; p1.targetId = 'p2';
  let now = 1000;
  const tick = () => { now += TICK_RATE_MS; tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput(), p3: emptyInput(), p4: emptyInput() }, now, TICK_DT, ['p1']); };
  for (let i = 0; i < 5; i += 1) tick();
  const circleP4 = () => Object.assign(p1, { botState: 'defense', botStateEnteredAt: now, botDefenseUntil: now + 1500, botDefenseRefId: 'p4', botDefenseRefLife: p4.invulnerableUntil,
    botDefenseDirX: 1, botDefenseDirZ: 0, botDefenseDirAt: now, botDefenseFlips: 0, botDefenseInCover: false, botDefenseStuckMode: false });
  const across = (f) => { const lx = p1.pos.x - f.pos.x, lz = p1.pos.z - f.pos.z; return Math.abs(p1.botDefenseDirX * lx + p1.botDefenseDirZ * lz) / Math.hypot(lx, lz); };   // (|cos| to that enemy's line; 0 = straight across it)
  circleP4(); tick();
  assert.equal(p1.botState, 'defense');
  assert.ok(across(p4) < 0.1, `the same life: across p4's line (|cos| ${across(p4).toFixed(2)})`);
  circleP4(); p4.invulnerableUntil = now + 2000; tick();   // (p4 respawned: a new spawn stamp)
  assert.equal(p1.botState, 'defense');
  assert.ok(across(p2) < 0.1, `p4 respawned: across the locked target's line (|cos| ${across(p2).toFixed(2)})`);
}));
