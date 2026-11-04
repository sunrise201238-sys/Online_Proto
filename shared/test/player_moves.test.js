// The player moves by the bot's rules (user 2026-11-04, "make player unit aligned with BOT"), on the sim's applyInput (the offline
// updatePlayer the same): a sprint's end walks on at the walk speed — no 180 ms walk at 4.55 after it — and a jump banks 0.7 of the
// velocity the tick began with, a sprint's carried part included, as a bot's jump does (the brain jumps before its dispatch).
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, applyInput, emptyInput, getArena } from '../src/sim/index.js';

function run(inputs) {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, a = getArena('arena1'); let now = 2000; const speeds = [];
  for (const inp of inputs) { now += 16; f.boost = 250; applyInput(m, f, { ...emptyInput(), moveX: 1, moveZ: 0, ...inp }, now, a.obstacles, a.surfaces); speeds.push(Math.hypot(f.vel.x, f.vel.z)); }
  return { f, speeds };
}

test('after a sprint the player walks on at the walk speed, its momentum on top — no slowed walk', () => {
  const { f, speeds } = run([{ boost: true }, { boost: true }, { boost: true }, {}, {}, {}, {}, {}, {}]);
  const walk = f.unit.walkSpeed ?? C.WALK_SPEED;
  for (const s of speeds.slice(3)) assert.ok(s >= walk, `walking ${s.toFixed(2)} (walk ${walk})`);
});

test('a jump out of a sprint banks 0.7 of the sprint\'s whole speed, as a bot\'s jump does', () => {
  const { f, speeds } = run([{ boost: true }, { boost: true }, { boost: true }, { boost: true, jump: true }]);
  const sprint = f.unit.sprintSpeed ?? C.BOOST_MOVE_SPEED, full = speeds[2];
  assert.equal(f.action, 'jump');
  assert.ok(Math.abs(speeds[3] - (sprint + 0.7 * full)) < 1e-6, `launch ${speeds[3].toFixed(2)} = ${sprint} + 0.7 x ${full.toFixed(2)}`);
});
