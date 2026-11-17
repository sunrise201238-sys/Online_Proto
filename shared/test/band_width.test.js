import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
// THE BAND'S HALF-WIDTH (b1105jc; nbrain.js BOT_BAND_HALF_WIDTH; user 2026-11-17: "change the lockrange band in normal brain from
// +-7 to +-15. SD brain should be uneffected if i'm not misunderstood"). A plain bot keeps its target inside a band round its lock
// range: inside it the bot fights where it stands (Engage), nearer it backs off and farther it closes in (Pursue). Here: Plain
// Field, the assault rifle (lock range 110: the band 95 to 125, where it was 103 to 117) against a target that stands, the bot
// set down at a distance and read a sixth of a second on — its state, and which way the distance went.
// The Sudden Death brain reads no band: that its play is as it was is the frozen references' to say (sdbrain_equiv.test.js,
// the note of b1105jc).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA } from '../src/sim/index.js';

function setDown(d, ticks = 10) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -d / 2; p1.pos.z = 0; p2.pos.x = d / 2; p2.pos.z = 0;
  for (const f of [p1, p2]) { f.invulnerableUntil = 0; f.hp = 1e9; }
  p1.botControlled = true; p1.targetId = 'p2';
  let now = 1000;
  for (let i = 0; i < ticks; i += 1) { tickBot(m, 'p1', now); tickMatch(m, { p2: emptyInput() }, now, TICK_DT, ['p1']); now += TICK_RATE_MS; }
  return { state: p1.botState ?? 'pursue', d: Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z) };
}

test('the plain bot\'s band is its lock range and 15 either side: inside it the bot fights, nearer it backs off, farther it closes in', () => {
  assert.equal(UNIT_DATA.unit1.lockRange, 110);
  for (const d of [97, 104, 110, 116, 123]) {
    const r = setDown(d);
    assert.equal(r.state, 'engage', `set down ${d} from its target, inside 95 to 125, the bot fights where it stands (state ${r.state})`);
    assert.ok(r.d > 95 && r.d < 125, `and stays inside the band: ${r.d.toFixed(1)}`);
  }
  // (97 and 123 lay outside the band of 7 either side, 103 to 117: there the bot backed off, or closed in)
  const near = setDown(88);
  assert.equal(near.state, 'pursue', `set down 88 from its target, nearer than 95, the bot is not in Engage (state ${near.state})`);
  assert.ok(near.d > 88.5, `it backs off: ${near.d.toFixed(1)}`);
  const far = setDown(132);
  assert.equal(far.state, 'pursue', `set down 132 from its target, farther than 125, the bot is not in Engage (state ${far.state})`);
  assert.ok(far.d < 131.5, `it closes in: ${far.d.toFixed(1)}`);
});

test('the band\'s edges themselves: 95 and 125 are inside, a step beyond either is outside', () => {
  // (the first tick's reading: the bot is set down and the brain asked once, before the body has moved)
  assert.equal(setDown(95, 1).state, 'engage'); assert.equal(setDown(125, 1).state, 'engage');
  assert.equal(setDown(94.5, 1).state, 'pursue'); assert.equal(setDown(125.5, 1).state, 'pursue');
});
