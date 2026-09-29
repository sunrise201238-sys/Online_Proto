import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT } from '../src/sim/index.js';

// Travel sprint latch (owner 2026-09-29): a Pursue leg arms only from a full
// tank (250) and runs down to 200, then the bot walks until the tank is full
// again. Before, both bounds sat at 250 — Pursue never sprinted and Maze let a
// single dash tick through every half second (the flickering sprint pose).
function pursueRun(ms) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
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
  return ticks;
}

function dashRuns(ticks) {
  const runs = []; let len = 0;
  for (const t of ticks) { if (t.dash) len += 1; else if (len) { runs.push(len); len = 0; } }
  if (len) runs.push(len);
  return runs;
}

test('travel sprint latch: a pursuing bot sprints in legs from 250 down to 200, then walks until full — no one-tick dashes', () => {
  const ticks = pursueRun(3000);
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
});
