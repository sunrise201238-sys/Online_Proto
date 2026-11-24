// The bots' choice of a target among several enemies (ai.js pickBotTargetId; the offline client's picker reads the same two numbers): an enemy the bot has no line
// of sight to — a wall or an object between their eyes — counts BOT_TARGET_BLOCKED_PENALTY units farther than it is, the nearest by that count is the target, and the
// target is kept unless another beats it by more than BOT_TARGET_SWITCH_MARGIN. The count is 150 units, 37.5 m, since b1105kx (user 2026-11-24, told of the rule and
// its 50: "make the +50 to +150 instead. PT and 9.9 (online and offline)."); 50 until then.
// A field of its own: one wall, the bot at the middle, an enemy behind the wall and one in the open.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { registerGeneratedData } from '../src/sim/arena.js';
import { createMatchState, getArena } from '../src/sim/index.js';
import { pickBotTargetId, botHasLineOfSight } from '../src/sim/ai.js';
import { BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from '../src/sim/nbrain.js';

const G = C.GROUND_BASE_Y, EYE = C.BOT_LOS_EYE_HEIGHT;
registerGeneratedData('neon', { obstacles: [{ minX: 10, maxX: 12, minZ: -40, maxZ: 40, minY: 0, maxY: 60 }], surfaces: [] });   // (a wall 2 units through, 80 long and 15 m tall, 10 units east of the bot)
function field(behind, open, openAt = 'north') {   // (the bot at the middle; one enemy `behind` units east, past the wall; the other `open` units north or west, nothing between)
  const m = createMatchState({ mapKey: 'neon', mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const bot = m.fighters.p1;
  const foes = Object.values(m.fighters).filter((f) => f.team !== bot.team); assert.equal(foes.length, 2, 'two enemies');
  bot.pos = { x: 0, y: G, z: 0 }; foes[0].pos = { x: behind, y: G, z: 0 }; foes[1].pos = openAt === 'north' ? { x: 0, y: G, z: -open } : { x: -open, y: G, z: 0 };
  for (const f of Object.values(m.fighters)) if (f.team === bot.team && f !== bot) f.pos = { x: 0, y: G, z: 300 };   // (the mate out of the way)
  bot.targetId = null; return { m, bot, hidden: foes[0], seen: foes[1] };
}
const sees = (a, b) => { const A = getArena('neon'); return botHasLineOfSight({ x: a.pos.x, y: a.pos.y + EYE, z: a.pos.z }, { x: b.pos.x, y: b.pos.y + EYE, z: b.pos.z }, A.obstacles, A.surfaces); };

test('an enemy behind a wall counts 150 units farther: the bot takes the one it sees unless the hidden one is nearer by more than that', () => {
  assert.equal(BOT_TARGET_BLOCKED_PENALTY, 150, 'the count'); assert.equal(BOT_TARGET_SWITCH_MARGIN, 6, 'the margin');
  { const { m, bot, hidden, seen } = field(30, 120); assert.ok(!sees(bot, hidden) && sees(bot, seen), 'the wall hides the one and not the other');
    assert.equal(pickBotTargetId(m, bot), seen.id, 'hidden at 30 units, seen at 120: the seen one (30 + 150 is more than 120; with the count at 50 it was the hidden one)'); }
  { const { m, bot, seen } = field(30, 170); assert.equal(pickBotTargetId(m, bot), seen.id, 'hidden at 30, seen at 170: still the seen one (180 against 170)'); }
  { const { m, bot, hidden } = field(30, 200); assert.equal(pickBotTargetId(m, bot), hidden.id, 'hidden at 30, seen at 200: the hidden one, nearer by more than the count (180 against 200)'); }
});

test('the target is kept until another beats it by more than the margin, the hidden one\'s count in the reckoning', () => {
  { const { m, bot, hidden, seen } = field(30, 185); bot.targetId = seen.id; assert.equal(pickBotTargetId(m, bot), seen.id, 'on the seen one at 185, the hidden one counts 180: within the margin of 6, kept');
    bot.targetId = hidden.id; assert.equal(pickBotTargetId(m, bot), hidden.id, 'and on the hidden one it stays as well'); }
  { const { m, bot, hidden, seen } = field(30, 190); bot.targetId = seen.id; assert.equal(pickBotTargetId(m, bot), hidden.id, 'on the seen one at 190, the hidden one counts 180: beaten by 10, the bot changes'); }
  { const { m, bot, hidden, seen } = field(30, 170); bot.targetId = hidden.id; assert.equal(pickBotTargetId(m, bot), seen.id, 'on the hidden one (180), the seen one at 170: beaten by 10, the bot changes'); }
});
