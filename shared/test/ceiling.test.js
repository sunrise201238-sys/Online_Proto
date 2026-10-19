import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, getArena, GROUND_BASE_Y } from '../src/sim/index.js';

// A body's feet never rise above the map's ceiling (movement.js integrateFighter): Space Station has one (1.3 m), Town none.
const jumpPeak = (mapKey) => {
  const m = createMatchState({ mapKey, startTime: 1000 });
  const p = m.fighters.p1; const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000, peak = 0;
  for (let t = 0; t < 40; t += 1) {
    now += TICK_RATE_MS; inputs.p1.jump = t === 0;
    tickMatch(m, inputs, now, TICK_DT, ['p2']);
    peak = Math.max(peak, p.pos.y - GROUND_BASE_Y);
  }
  return peak;
};

test('the map ceiling caps a jump on Space Station and leaves Town free', () => {
  const ceil = getArena('S_Station').ceil;
  assert.ok(ceil > 0 && ceil < 8, `Space Station carries a ceiling (${ceil})`);
  assert.equal(getArena('town').ceil, undefined);
  const station = jumpPeak('S_Station'), town = jumpPeak('town');
  assert.ok(station > 2, `still a jump on Space Station (${station.toFixed(2)})`);
  assert.ok(station <= ceil + 1e-6, `capped at the ceiling (${station.toFixed(2)} vs ${ceil})`);
  assert.ok(town > station + 0.2, `Town's jump is higher (${town.toFixed(2)} vs ${station.toFixed(2)})`);
});
