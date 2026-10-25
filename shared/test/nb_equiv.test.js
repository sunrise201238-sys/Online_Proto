// THE PLAIN BRAIN'S EQUIVALENCE TEST (owner 2026-10-17, the plain-brain rework: "one place, one
// structure, patchless", behaviour unchanged until the price goes in): the Health Point brain in
// ai.js must play tick for tick what the frozen reference plays (ai_b1021z_ref.js, the host as frozen
// at b1018a — the dead code gone, the brain itself untouched). Two matches are set up alike, every
// random draw comes from the same seeded stream on each side, and after every tick both fighters'
// whole state must agree to the last digit. Any change of logic — an extra random draw, a condition
// read a tick earlier, a knob renamed — breaks it.
// Re-frozen at b1021z (freeze_refs.py): the modelled map's rules alter play by design — the bounded wall field, the
// step height, the one jump threshold, the walk rule — so the ai_b1018a_ref / sdbrain_b1017h_ref pair went with them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot as tickNew } from '../src/sim/ai.js';
import { tickBot as tickOld } from './ai_b1025c_ref.js';

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
