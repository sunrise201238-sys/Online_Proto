// THE SEARCH KEPT WHILE PACING (b1105ja; sdbrain.js, the route search's key; user 2026-11-16, of the 2v2 Sudden Death bots that
// stood with no plan: "Do 乙"). A search that does not end inside its slice is parked and taken up at the unit's next tick while
// its key stays the same. The key carried the body's own square and THE WAIT paces, so a waiting unit's parked search was
// thrown away at every step and begun again, without end. Here: a 2v2 Sudden Death on Town as the trial ran it — the player's
// unit standing, its teammate down, the two enemy bots on the brain — 60 s of it, every search cut after the same few checks on
// any machine (a clock of the test's own: each reading of it is one step on). A waiting unit's parked search is never replaced
// by one of its own kind and stage for another square while the same wait stands, and a parked search that has lived across a
// step of the pacing goes on to its end. (Before the change this match threw 27 away and ended none.)
// (60 s since b1105le, 30 s until then: Town's two trucks as simple boxes numbered the grid's places anew, the match ran a little otherwise, and the one search
// that had ended inside the first 30 s no longer did. The long wait comes after the 45th second with either data, and some thirty searches end in it.)
import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatchState, tickMatch, emptyInput, getArena, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import { tickBot, pickBotTargetId, navGridFor, registerNavGridData } from '../src/sim/ai.js';
import { navDataFile } from '../src/sim/navgrid.js';
import * as C from '../src/sim/constants.js';

const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const kindAndStage = (key) => key.split('|').slice(0, 2).join('|');
// (the playtest tree's switch for a tank that never empties is off for the match — the gauge is half of what a route costs,
//  and the bots of a full tank never come to THE WAIT here; as ladder_bots.test.js withGauge)
const withGauge = (fn) => () => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };

test('a waiting unit keeps its parked search while it paces, and the search goes on to its end', withGauge(() => {
  const arena = getArena('town'); const file = PUBLIC + navDataFile('town');
  if (existsSync(file)) registerNavGridData(arena, new Uint8Array(readFileSync(file)));   // (the grid as the server hands it out, ladder_bots.test.js)
  navGridFor(arena);
  const ids = ['p1', 'p2', 'p3', 'p4'], bots = ['p2', 'p3', 'p4'];
  const m = createMatchState({ mapKey: 'town', mode: '2v2', p1UnitKey: 'unit17', p2UnitKey: 'unit22', p3UnitKey: 'unit7', p4UnitKey: 'unit15', startTime: 1000 });
  for (const id of ids) { const f = m.fighters[id]; f.botSD = id !== 'p1'; f.hp = id === 'p3' ? 0 : 1; }
  const inputs = Object.fromEntries(ids.map((id) => [id, emptyInput()]));
  // THE CLOCK: every reading is one step on, and a search's deadline is three and a half steps from where it is asked for —
  // the search is cut at its fourth 32-pop check, parked, and goes on at the unit's next tick: the same on any machine
  const realNow = performance.now, realRandom = Math.random; let clock = 0;
  Object.defineProperty(m, 'searchDeadline', { get: () => clock + 3.5, configurable: true });
  const was = {}; let parkedTicks = 0, thrown = 0, ended = 0, now = 1000;
  performance.now = () => (clock += 1); Math.random = mulberry32(1);
  try {
    for (let i = 0; i < 60000 / TICK_RATE_MS; i += 1) {
      now += TICK_RATE_MS;
      for (const id of bots) { const me = m.fighters[id]; if (me.hp <= 0) continue; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); }
      tickMatch(m, inputs, now, TICK_DT, bots);
      for (const id of bots) {
        const f = m.fighters[id]; if (f.hp <= 0) continue;
        const w = was[id] ?? (was[id] = {});
        const plan = f.botSDPlan ?? null, job = f.botSDSearchJob ?? null, square = `${Math.round(f.pos.x)},${Math.round(f.pos.z)}`;
        const waiting = !!plan && plan.kind === 'wait', parked = waiting && !!job && !!job.state;
        if (parked) parkedTicks += 1;
        // (thrown away: the same wait stands, and the parked search has given way to one of its own kind and stage for another square)
        const replaced = w.parked && waiting && w.plan === plan && !!job && job !== w.job && job.key !== w.job.key && kindAndStage(job.key) === kindAndStage(w.job.key);
        if (replaced) thrown += 1;
        else if (w.parked && w.stepped && job !== w.job) ended += 1;   // (a search that lived across a step of the pacing, over: found, refused or run out)
        if (parked && job === w.job) { if (square !== w.square) w.stepped = true; } else { w.square = square; w.stepped = false; }
        w.plan = plan; w.job = job; w.parked = parked;
      }
    }
  } finally { performance.now = realNow; Math.random = realRandom; }
  assert.ok(parkedTicks >= 10, `the match never held a waiting unit with a parked search (${parkedTicks} ticks): the scenario no longer reaches THE WAIT`);
  assert.equal(thrown, 0, `a waiting unit's parked search was thrown away for another square ${thrown} times`);
  assert.ok(ended >= 1, 'no parked search of a waiting unit lived across a step of its pacing and went on to its end');
}));
