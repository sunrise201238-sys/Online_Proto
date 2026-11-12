// THE PLAIN BRAIN'S EQUIVALENCE TEST (owner 2026-10-17, the plain-brain rework: "one place, one
// structure, patchless", behaviour unchanged until the price goes in): the Health Point brain in
// ai.js must play tick for tick what the frozen reference plays (its frozen copies, *_<tag>_ref.js, made by
// shared/tools/freeze_refs.py — first the host as frozen at b1018a, the dead code gone, the brain itself untouched). Two matches are set up alike, every
// random draw comes from the same seeded stream on each side, and after every tick both fighters'
// whole state must agree to the last digit. Any change of logic — an extra random draw, a condition
// read a tick earlier, a knob renamed — breaks it.
// Re-frozen at b1026h: the route and firing searches run in slices of 3,000 pops a tick where the host sets no deadline
// (nbrain.js BOT_SEARCH_POPS_PER_TICK, user 2026-10-29), so a route of more than one slice arrives later, by design.
// Re-frozen at b1026k with the Sudden Death brain's references (THE SLIDE, sdbrain_equiv.test.js): the plain brain is
// unchanged, and its six matches played equal to the b1026h references before the freeze.
// Re-frozen at b1021z (freeze_refs.py): the modelled map's rules alter play by design — the bounded wall field, the
// step height, the one jump threshold, the walk rule — so the ai_b1018a_ref / sdbrain_b1017h_ref pair went with them.
// Re-frozen at b1101j (2026-11-01): Defense's commits by trigger went to 1,500 ms (user, "change these three to 1,500 ms (keep
// their categories)" — a hit, a hit under the locked sniper's charge, the sprint on after the anti-glint dodge), play altered by
// design. The frozen brains read the map's boost scale as the live one does, so the matches play at the scale in play: each
// map's own, 1 on every map here (5 while every map took it, part of 2026-11-01; at b1101i they were set to 1 by hand: the
// b1026k references predated the scale).
// Re-frozen at b1101k (2026-11-01): Defense stays across the line every tick — a hit, a hit under the locked sniper's charge and
// the anti-glint dodge's follow-through circle their enemy instead of running straight (user, "all staying vertical"); the
// sustained-fire re-align with its pull toward the band went with it. Play altered by design.
// Re-frozen at b1102o (2026-11-03): Defense's cover is the Sudden Death brain's silhouette test from the locked target's muzzle
// (sdbrain.js silhouetteSeenFrom, both brains), and a hit while tucked or peeking breaks it for the rest of that Defense (user:
// "the BOT just stood there and take consist damages"); the seven matches played equal to the b1101k references before the
// change. Play altered by design.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot as tickNew } from '../src/sim/ai.js';
// Re-frozen at b1104b (2026-11-04): the escape sprint latch — Defense, the Hide stance and the cover move run the gauge down
// to the 8 floor, then walk until it is back over 50 (user: "I want to make it this way. Can you do it in an integrated style?");
// the seven matches played equal to the b1102o references before the change.
// Re-frozen at b1104c (2026-11-04): Defense's four commits 1,000 ms (user: "Change these four from 1500ms to 1000ms.");
// the seven matches played equal to the b1104b references before the change.
// Re-frozen at b1104e (2026-11-04): a stunned bot's sprint banks its momentum at the stun's move-scale, as a player's (user:
// "Fix it then"); the seven matches played equal to the b1104c references before the change.
// Re-frozen at b1104g (2026-11-04): a bot's jump goes off at the speed it moves at that tick, as a player's (user: "make BOT
// aligned with player unit"); the seven matches played equal to the b1104e references before the change.
// Re-frozen at b1105b (2026-11-05): the bots take the ladders (ladder.js; navgrid.js THE LADDERS — the plain brain's route and firing
// searches ask for the ladder links, its Maze follower sets the ladder's goal and heads for the grab point; the goal is cleared
// at the top of every brain tick without a standing order); none of the seven maps has a ladder, and the seven matches played
// equal to the b1104g references before the change.
// Re-frozen at b1105br (2026-11-07): a bot whose target is an enemy shotgun fights on a band centred on 110, a longer band of its own
// kept, a shotgun bot keeping its own (nbrain.js BOT_SHOTGUN_ENGAGE_RANGE; user: "change the engage range to 110, if the engage range is
// already longer than 110, then ignore this rule", PT first, then "implement in 9.5"); play altered by design. Against the b1105b
// references one of the two matches with a shotgun in them parted (station unit2 vs unit4); the other (arena1 unit1 vs unit2) and the
// five without one played equal.
// Re-frozen at b1105bt (2026-11-07): a unit under a move order runs its four Defense commits 300 ms (nbrain.js BOT_DEFENSE_CMD_MOVE_MS; user:
// "change these 4 durations from 1sec to 0.3sec for that assigned unit"); none of the seven matches carries an order, and they played equal to the
// b1105br references after the change.
// Re-frozen at b1105ge (PT 2026-11-11, here 2026-11-12 with build b1105gf): the route cut stands each of its samples on the floor the route
// walks there, not on the topmost surface over it (nbrain.js WHERE A SAMPLE STANDS; user, of a bot under Compound's stair building: "When
// player unit is at the position, BOT got stuck beneath it."); play altered by design wherever a route passes under a deck, a roof or a
// bridge. Against the b1105bt references the Streets match (arena2 unit3 vs unit1) parted at 7.63 s — the sniper's route runs under the
// bridge, where the old reading stood a sample on the deck (8) and saw the enemy the street under it could not — and the six others
// played equal. The case itself is route_cut_floor.test.js.
import { tickBot as tickOld } from './ai_b1105ge_ref.js';

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
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

// Health Point mode, the full roster's shapes: a rifle, an auto, a shotgun, a sniper, a machine gun.
const SCENARIOS = [
  { mapKey: 'arena1', p1: 'unit1', p2: 'unit2', seed: 101, ticks: 4000 },
  { mapKey: 'factory', p1: 'unit4', p2: 'unit10', seed: 102, ticks: 4000 },
  { mapKey: 'airport', p1: 'unit5', p2: 'unit7', seed: 103, ticks: 4000 },
  { mapKey: 'station', p1: 'unit2', p2: 'unit4', seed: 104, ticks: 4000 },
  { mapKey: 'lobby', p1: 'unit9', p2: 'unit1', seed: 105, ticks: 4000 },
  { mapKey: 'flashpoint', p1: 'unit10', p2: 'unit5', seed: 106, ticks: 4000 },
  { mapKey: 'arena2', p1: 'unit3', p2: 'unit1', seed: 107, ticks: 4000 },   // (the sniper, since 2026-11-01: its charges drive the anti-glint dodge and the sniper-charge commit)
];

for (const sc of SCENARIOS) {
  test(`the plain brain equals the frozen brain: ${sc.mapKey} ${sc.p1} vs ${sc.p2} seed ${sc.seed}`, () => {
    const make = () => createMatchState({ mapKey: sc.mapKey, p1UnitKey: sc.p1, p2UnitKey: sc.p2, startTime: 1000 });
    const mA = make(), mB = make();
    const rA = mulberry32(sc.seed), rB = mulberry32(sc.seed);
    const realRandom = Math.random;
    let now = 1000, ran = 0, rounds = 0;
    const lastFire = { p1: mB.fighters.p1.lastFireAt, p2: mB.fighters.p2.lastFireAt };
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
        for (const id of ['p1', 'p2']) if (mB.fighters[id].lastFireAt !== lastFire[id]) { rounds += 1; lastFire[id] = mB.fighters[id].lastFireAt; }
        ran = i + 1;
        if (mA.fighters.p1.hp <= 0 || mA.fighters.p2.hp <= 0) break;
      }
    } finally {
      Math.random = realRandom;
    }
    assert.ok(ran > 100, `too short a run to mean anything: ${ran} ticks`);
    assert.ok(rounds > 0, 'the plain brain never fired');
  });
}
