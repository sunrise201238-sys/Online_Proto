// THE EQUIVALENCE TEST (owner 2026-10-16, "patchless with the same
// behaviour"): the Sudden Death brain in sdbrain.js must play tick for tick
// what the frozen reference plays (its frozen copies, *_<tag>_ref.js, made by shared/tools/freeze_refs.py — first
// the brain as frozen at b1017h, one rule in four parts, the own reaction, the valve, inside the host as
// frozen at b1018a; the b1016o reference went with the b1017 rewrite,
// which alters play by design).
// Two matches are set up alike, every random draw comes from
// the same seeded stream on each side, and after every tick both fighters'
// whole state (position, body, boost, ammo and every botSD* scratch field)
// must agree to the last digit. Any change of logic — an extra random draw,
// a condition read a tick earlier, a knob renamed — breaks it.
// Re-frozen at b1021z (freeze_refs.py): the modelled map's rules alter play by design — the bounded wall field, the
// step height, the one jump threshold, the walk rule — so the ai_b1018a_ref / sdbrain_b1017h_ref pair went with them.
// Re-frozen at b1026h: the approach route's search runs in slices of 3,000 pops a tick (sdbrain.js sdApproachRoute, user
// 2026-10-29), so a route of more than one slice arrives a tick or more later than the whole search's did, by design.
// Re-frozen at b1026k: THE SLIDE (sdbrain.js, the route follower) — a leg that grazes the wall the body touches goes on
// along the wall instead of dropping the route (Town's stairs: a body on a baluster dropped and re-took the same route
// every tick to the end of the match), so play differs wherever a body brushed a wall on a route: factory, lobby and
// flashpoint of the six matches here.
// Re-frozen at b1101j (2026-11-01): Defense's commits by trigger went to 1,500 ms (user, "change these three to 1,500 ms (keep
// their categories)" — a hit, a hit under the locked sniper's charge, the sprint on after the anti-glint dodge), play altered by
// design. The frozen brains read the map's boost scale as the live one does, so the matches play at the scale in play: each
// map's own, 1 on every map here (5 while every map took it, part of 2026-11-01; at b1101i they were set to 1 by hand: the
// b1026k references predated the scale).
// Re-frozen at b1101k (2026-11-01): Defense stays across the line every tick — a hit, a hit under the locked sniper's charge and
// the anti-glint dodge's follow-through circle their enemy instead of running straight (user, "all staying vertical"); the
// sustained-fire re-align with its pull toward the band went with it. Play altered by design.
// Re-frozen at b1102o (2026-11-03) with the plain brain's references: the Sudden Death brain is unchanged — its silhouette test
// moved into silhouetteSeenFrom, which both brains now call — and its matches played equal to the b1101k references with that in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot as tickNew } from '../src/sim/ai.js';
// Re-frozen at b1104b (2026-11-04) with the plain brain's references: a Sudden Death match runs the plain brain's dispatch,
// whose escape sprint latch changed by design (nb_equiv.test.js); the seven matches played equal before the change.
// Re-frozen at b1104c (2026-11-04) with the plain brain's references: a Sudden Death match runs the plain brain's Defense,
// whose commits went to 1,000 ms by design (nb_equiv.test.js); the seven matches played equal before the change.
// Re-frozen at b1104e (2026-11-04) with the plain brain's references: a Sudden Death match runs the plain brain's dispatch,
// whose stunned sprint banks its momentum at the stun's move-scale by design (nb_equiv.test.js); equal before the change.
// Re-frozen at b1104g (2026-11-04) with the plain brain's references: a Sudden Death match runs the plain brain's dispatch,
// whose jump launch changed by design (nb_equiv.test.js); the seven matches played equal before the change.
// Re-frozen at b1105b (2026-11-05) with the plain brain's references (the bots on the ladders): the Sudden Death brain is
// unchanged — its searches do not ask for the ladder links — and its matches played equal to the b1104g references before the change.
// Re-frozen at b1105br (2026-11-07) with the plain brain's references (the band on an enemy shotgun, nb_equiv.test.js): the rule
// stands down in Sudden Death, and the seven matches played equal to the b1105b references after the change.
// Re-frozen at b1105bt (2026-11-07) with the plain brain's references (the ordered unit's short Defense, nb_equiv.test.js): it stands down
// in Sudden Death, and the seven matches played equal to the b1105br references after the change.
import { tickBot as tickOld } from './ai_b1105bt_ref.js';

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// A stable, sorted-key JSON of a fighter without its unit data (shared,
// constant) — typed arrays and Maps inside a parked search job are skipped.
const stable = (v, depth = 0) => {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
  if (depth > 12) return '…';
  if (ArrayBuffer.isView(v)) return `typed[${v.length}]`;
  if (v instanceof Map || v instanceof Set) return `${v.constructor.name}[${v.size}]`;
  if (Array.isArray(v)) return v.map((x) => stable(x, depth + 1));
  const o = {};
  for (const k of Object.keys(v).sort()) {
    if (k === 'unit' || k === 'unitKey') continue;
    if (typeof v[k] === 'function') continue;
    o[k] = stable(v[k], depth + 1);
  }
  return o;
};
const snap = (m) => JSON.stringify({ p1: stable(m.fighters.p1), p2: stable(m.fighters.p2), events: m.events.length, projectiles: m.projectiles?.length ?? 0 });
const firstDiff = (a, b) => {
  const A = JSON.parse(a), B = JSON.parse(b);
  for (const who of ['p1', 'p2']) {
    for (const k of new Set([...Object.keys(A[who]), ...Object.keys(B[who])])) {
      const x = JSON.stringify(A[who][k]), y = JSON.stringify(B[who][k]);
      if (x !== y) return `${who}.${k}: old=${x?.slice(0, 160)} new=${y?.slice(0, 160)}`;
    }
  }
  return `events/projectiles old=${A.events}/${A.projectiles} new=${B.events}/${B.projectiles}`;
};

const SCENARIOS = [
  { mapKey: 'arena1', p1: 'unit1', p2: 'unit2', hp: 1, seed: 11, ticks: 4000 },
  { mapKey: 'factory', p1: 'unit4', p2: 'unit5', hp: 150, seed: 22, ticks: 2500 },
  { mapKey: 'airport', p1: 'unit1', p2: 'unit7', hp: 1, seed: 33, ticks: 4000 },
  { mapKey: 'station', p1: 'unit2', p2: 'unit4', hp: 150, seed: 44, ticks: 2500 },
  { mapKey: 'lobby', p1: 'unit5', p2: 'unit1', hp: 1, seed: 55, ticks: 4000 },
  { mapKey: 'flashpoint', p1: 'unit7', p2: 'unit9', hp: 150, seed: 66, ticks: 2500 },
  { mapKey: 'arena2', p1: 'unit3', p2: 'unit1', hp: 1, seed: 77, ticks: 4000 },   // (a sniper against the SD brain, since 2026-11-01)
];

for (const sc of SCENARIOS) {
  test(`sdbrain equals the frozen brain: ${sc.mapKey} ${sc.p1} vs ${sc.p2} hp ${sc.hp} seed ${sc.seed}`, () => {
    const make = () => {
      const m = createMatchState({ mapKey: sc.mapKey, p1UnitKey: sc.p1, p2UnitKey: sc.p2, startTime: 1000 });
      for (const id of ['p1', 'p2']) { m.fighters[id].botSD = true; m.fighters[id].hp = sc.hp; }
      return m;
    };
    const mA = make(), mB = make();
    const rA = mulberry32(sc.seed), rB = mulberry32(sc.seed);
    const realRandom = Math.random;
    let now = 1000, ran = 0;
    try {
      for (let i = 0; i < sc.ticks; i += 1) {
        now += TICK_RATE_MS;
        Math.random = rA;
        tickOld(mA, 'p1', now); tickOld(mA, 'p2', now);
        tickMatch(mA, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p1', 'p2']);
        Math.random = rB;
        tickNew(mB, 'p1', now); tickNew(mB, 'p2', now);
        tickMatch(mB, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p1', 'p2']);
        const a = snap(mA), b = snap(mB);
        if (a !== b) assert.fail(`diverged at tick ${i} (${((now - 1000) / 1000).toFixed(2)} s): ${firstDiff(a, b)}`);
        ran = i + 1;
        if (mA.fighters.p1.hp <= 0 || mA.fighters.p2.hp <= 0) break;
      }
    } finally {
      Math.random = realRandom;
    }
    assert.ok(ran > 100, `too short a run to mean anything: ${ran} ticks`);
    // (the brain actually ran: a hop or a peek happened on at least one side)
    const acted = ['p1', 'p2'].some((id) => (mB.fighters[id].botSDSearches ?? 0) + (mB.fighters[id].botSDPeeks ?? 0) + (mB.fighters[id].botSDDodges ?? 0) > 0);
    assert.ok(acted, 'the SD brain never acted');
  });
}
