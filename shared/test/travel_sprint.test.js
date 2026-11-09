import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';
import * as C from '../src/sim/constants.js';
// (b1105eg: every lockRange doubled, Saori's to 112. The test marked atBand56 below laid its pursuit for her old band at 56 —
// it reads the gauge and the route, not the band — so it runs with her lock range at 56, put back when it ends.)
const atBand56 = (fn) => () => { const u = C.UNIT_DATA.unit1, was = u.lockRange; u.lockRange = 56; try { return fn(); } finally { u.lockRange = was; } };

// Travel sprint latch (owner 2026-09-29): a Pursue leg arms only from a full
// tank (250) and runs down to 200, then the bot walks until the tank is full
// again. Before, both bounds sat at 250 — Pursue never sprinted and Maze let a
// single dash tick through every half second (the flickering sprint pose).
// Both bounds are times the map's boost scale — District and Compound 5, every other map 1 (constants.js): the latch is read
// at Plain Field's own 1 and at 5, set by hand on the same pursuit, 1,250 -> 1,000.
const withDrain = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };   // (the PT site's switch, where the tree has one)

function pursueRun(ms, k = null) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  if (k != null) for (const f of [p1, p2]) { f.boost = (f.boost / f.boostScale) * k; f.boostScale = k; }   // (a scale set by hand, the gauge full at it)
  p1.pos.x = -100; p1.pos.z = 0; p2.pos.x = 100; p2.pos.z = 0;   // 200 u apart on Plain Field: a long straight pursuit
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p1.botControlled = true; p1.targetId = 'p2';
  let now = 1000; const ticks = [];
  for (let i = 0; i < ms / TICK_RATE_MS; i += 1) {
    const boostBefore = p1.boost;
    tickBot(m, 'p1', now);
    tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']);   // p2 stands still
    ticks.push({ dash: p1.action === 'dash', boostBefore, boost: p1.boost, state: p1.botState ?? 'pursue', x: p1.pos.x });
    now += TICK_RATE_MS;
  }
  return { ticks, k: p1.boostScale };
}

function dashRuns(ticks) {
  const runs = []; let len = 0;
  for (const t of ticks) { if (t.dash) len += 1; else if (len) { runs.push(len); len = 0; } }
  if (len) runs.push(len);
  return runs;
}

test('travel sprint latch: a pursuing bot sprints in legs from 250 down to 200, then walks until full — no one-tick dashes', () => withDrain(() => {
  const { ticks, k } = pursueRun(3000);
  assert.equal(k, 1, 'Plain Field plays at the unit\'s own gauge');
  const pursue = ticks.filter((t) => t.state === 'pursue');
  assert.ok(pursue.length > 150, 'mostly pursue: ' + pursue.length);
  const runs = dashRuns(ticks);
  if (ticks[ticks.length - 1].dash) runs.pop();   // a leg cut off by the end of the window is not a short leg
  assert.ok(runs.length >= 2, 'at least two legs in 3 s: ' + JSON.stringify(runs));
  assert.ok(runs[0] >= 40 && runs[0] <= 50, 'first leg ~45 ticks (50 boost at 1.1/tick): ' + runs[0]);
  assert.ok(runs.every((r) => r >= 40), 'every leg is a real leg, none flickers: ' + JSON.stringify(runs));
  for (const t of ticks) if (t.dash) assert.ok(t.boostBefore >= 200 - 1e-9, 'a dash tick never starts under the 200 floor: ' + t.boostBefore);
  const firstWalk = ticks.findIndex((t, i) => i > 0 && !t.dash && ticks[i - 1].dash);
  assert.ok(ticks[firstWalk].boost >= 198.8 && ticks[firstWalk].boost <= 200.1, 'the leg ends at the floor: ' + ticks[firstWalk].boost);
  const rearm = ticks.findIndex((t, i) => i > firstWalk && t.dash);
  assert.ok(ticks[rearm].boostBefore >= 250 - 1e-9, 'the next leg arms only from a full tank: ' + ticks[rearm].boostBefore);
  assert.ok(ticks[ticks.length - 1].x > -100 + 40, 'and the bot actually closes distance: ' + ticks[ticks.length - 1].x.toFixed(1));
}));

test('travel sprint latch at five times the gauge (District\'s and Compound\'s scale, set by hand): legs from 1,250 down to 1,000, re-armed only from a full tank', atBand56(() => withDrain(() => {
  // (an 8 s window: the first leg is ~228 ticks, then a ~42-tick walk, then the second leg from the full tank, still in Pursue)
  const { ticks, k } = pursueRun(8000, 5);
  assert.equal(k, 5, 'the pursuit plays at five times the gauge');
  const runs = dashRuns(ticks);
  assert.ok(runs.length >= 2, 'at least two legs in 8 s: ' + JSON.stringify(runs));
  assert.ok(runs[0] >= 215 && runs[0] <= 240, 'first leg ~227 ticks (250 boost at 1.1/tick): ' + runs[0]);
  for (const t of ticks) if (t.dash) assert.ok(t.boostBefore >= 200 * k - 1e-9, 'a dash tick never starts under the 1,000 floor: ' + t.boostBefore);
  const firstWalk = ticks.findIndex((t, i) => i > 0 && !t.dash && ticks[i - 1].dash);
  assert.ok(ticks[firstWalk].boost >= 200 * k - 1.2 && ticks[firstWalk].boost <= 200 * k + 0.1, 'the leg ends at the floor: ' + ticks[firstWalk].boost);
  const rearm = ticks.findIndex((t, i) => i > firstWalk && t.dash);
  assert.ok(rearm > firstWalk, 'a second leg starts');
  assert.equal(ticks[rearm].state, 'pursue', 'the second leg is a Pursue leg');
  assert.ok(ticks[rearm].boostBefore >= 250 * k - 1e-9, 'the next leg arms only from a full tank: ' + ticks[rearm].boostBefore);
})));
