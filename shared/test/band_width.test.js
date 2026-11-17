import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
// THE PLAIN BOTS' BAND (b1105jc; constants.js BOT_BAND_HALF_WIDTH; user 2026-11-17: "change the lockrange band in normal brain from
// +-7 to +-15. SD brain should be uneffected if i'm not misunderstood"). A plain bot keeps its target inside a band round its lock
// range: inside it the bot fights where it stands (Engage), nearer it backs off and farther it closes in (Pursue). Here: Plain
// Field, the assault rifle against a target that stands, the bot set down at a distance and read a sixth of a second on — its
// state, and which way the distance went.
// The distances are laid off the number itself (b1105jd; user: "i might want to change the normal brain lock range band to +-25 in
// the future. make sure it won't take long when i ask to implement that"): a new width changes one line here, the pin.
// The Sudden Death brain reads no band: that its play is as it was is the frozen references' to say (sdbrain_equiv.test.js, the
// note of b1105jc).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, BOT_BAND_HALF_WIDTH } from '../src/sim/index.js';

const W = BOT_BAND_HALF_WIDTH, LR = UNIT_DATA.unit1.lockRange;   // (the assault rifle: its band LR - W to LR + W)

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

test('the band\'s half-width is the number the user set', () => {
  assert.equal(BOT_BAND_HALF_WIDTH, 15, 'user 2026-11-17: "from +-7 to +-15" — a new width is a new number here, and in constants.js');
  assert.equal(LR, 110);
  assert.ok(W >= 4 && LR - W - 7 > 10, 'the distances below are laid off it: a band of some width, its lower edge well clear of the target');
});

test('the plain bot\'s band is its lock range and the half-width either side: inside it the bot fights, nearer it backs off, farther it closes in', () => {
  for (const d of [LR - W + 2, LR - W / 2, LR, LR + W / 2, LR + W - 2]) {
    const r = setDown(d);
    assert.equal(r.state, 'engage', `set down ${d} from its target, inside ${LR - W} to ${LR + W}, the bot fights where it stands (state ${r.state})`);
    assert.ok(r.d > LR - W && r.d < LR + W, `and stays inside the band: ${r.d.toFixed(1)}`);
  }
  const near = setDown(LR - W - 7);
  assert.equal(near.state, 'pursue', `set down ${LR - W - 7} from its target, nearer than ${LR - W}, the bot is not in Engage (state ${near.state})`);
  assert.ok(near.d > LR - W - 7 + 0.5, `it backs off: ${near.d.toFixed(1)}`);
  const far = setDown(LR + W + 7);
  assert.equal(far.state, 'pursue', `set down ${LR + W + 7} from its target, farther than ${LR + W}, the bot is not in Engage (state ${far.state})`);
  assert.ok(far.d < LR + W + 7 - 0.5, `it closes in: ${far.d.toFixed(1)}`);
});

test('the band\'s edges themselves are inside, a step beyond either is outside', () => {
  // (the first tick's reading: the bot is set down and the brain asked once, before the body has moved)
  assert.equal(setDown(LR - W, 1).state, 'engage'); assert.equal(setDown(LR + W, 1).state, 'engage');
  assert.equal(setDown(LR - W - 0.5, 1).state, 'pursue'); assert.equal(setDown(LR + W + 0.5, 1).state, 'pursue');
});
