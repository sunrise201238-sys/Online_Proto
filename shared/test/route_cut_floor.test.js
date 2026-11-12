// THE ROUTE CUT'S FLOOR (b1105ge; nbrain.js WHERE A SAMPLE STANDS; user 2026-11-11, Compound: "When player unit is at the
// position, BOT got stuck beneath it."): the plain brain cuts its walk route at the first sample that sees the enemy, and a
// sample stands on the floor the route walks there. Compound's stair building stands a deck and a walkway (27.64) over its
// ground floor, two flights between them. Read on the topmost surface, a ground-floor sample stood on the walkway and
// "saw" an enemy on the deck: the route was cut before the stairs, every later plan at its first sample, and the bot
// ended on the spot under the enemy, for good. Here the bot is p2, as offline (the player p1, standing on the deck): from
// its spawn, from the ground floor and from right under the enemy it climbs to the deck and sees it. The searches run in their per-tick slices and Math.random is seeded, so the
// runs repeat; the boost gauge is in play (PT's switch off), as the released trees run.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, botHasLineOfSight, BOT_LOS_EYE_HEIGHT } from '../src/sim/index.js';
import { tickBot, navGridFor, registerNavGridData } from '../src/sim/ai.js';
import { navDataFile } from '../src/sim/navgrid.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));
// The grid as the server hands it out (ai.js navGridFor: the shipped file when it is this map's).
function gridFor(mapKey) {
  const arena = getArena(mapKey);
  const file = PUBLIC + navDataFile(mapKey);
  if (existsSync(file)) registerNavGridData(arena, new Uint8Array(readFileSync(file)));
  return navGridFor(arena);
}
const withGauge = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };
const seeded = (seed, fn) => { const real = Math.random; let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; try { return fn(); } finally { Math.random = real; } };

// The reported place: the stair building's upper deck (arena x -46.2, z 63.7; feet 27.64), the ground floor open under it.
const DECK = { x: -46.2, z: 63.7, y: 27.64 };
const STARTS = [
  { name: 'its spawn', at: null, within: 16 },                                  // (8.5 s as built)
  { name: 'the ground floor, under the walkway', at: { x: -50, z: 107, y: 0 }, within: 8 },   // (2.4 s)
  { name: 'the spot right under the enemy', at: { x: -46.2, z: 64, y: 0 }, within: 10 },      // (3.8 s)
];

for (const st of STARTS) {
  test(`Compound: a bot from ${st.name} climbs the stairs to an enemy on the upper deck and sees it`, () => withGauge(() => seeded(12345, () => {
    gridFor('compound');
    const arena = getArena('compound');
    const m = createMatchState({ mapKey: 'compound', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
    const bot = m.fighters.p2, enemy = m.fighters.p1;
    const put = (f, at) => { f.pos.x = at.x; f.pos.z = at.z; f.pos.y = at.y + G; f.floorY = f.pos.y; f.vel.x = 0; f.vel.z = 0; f.grounded = true; f.airborne = false; };
    put(enemy, DECK); enemy.hp = 100000;   // (the enemy stands: the way up is the subject, not the fight)
    if (st.at) put(bot, st.at);
    for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
    assert.ok(Math.abs(groundHeightAt(DECK.x, DECK.z, arena.surfaces, DECK.y) - DECK.y) < 0.05, 'the deck is where the test stands the enemy');
    const feet = (f) => f.pos.y - G;
    const inputs = { p1: emptyInput(), p2: emptyInput() };
    const ticks = Math.round(25000 / MS);
    let now = 1000, upAt = null, sightAt = null, stacked = 0;
    for (let i = 0; i < ticks; i += 1) {
      now += MS; bot.targetId = 'p1'; tickBot(m, 'p2', now); tickMatch(m, inputs, now, DT, ['p2']);
      const t = (now - 1000) / 1000;
      const sight = botHasLineOfSight({ x: bot.pos.x, y: bot.pos.y + BOT_LOS_EYE_HEIGHT, z: bot.pos.z }, { x: enemy.pos.x, y: enemy.pos.y + BOT_LOS_EYE_HEIGHT, z: enemy.pos.z }, arena.obstacles, arena.surfaces);
      const levelsApart = Math.abs(feet(bot) - feet(enemy)) > 5;
      if (sight && sightAt == null) sightAt = t;
      if (!levelsApart && !bot.airborne && upAt == null) upAt = t;
      if (!sight && levelsApart && Math.hypot(bot.pos.x - enemy.pos.x, bot.pos.z - enemy.pos.z) < 8) stacked += 1;   // (under the enemy, a floor apart, blind: the report)
    }
    assert.ok(upAt != null && upAt <= st.within, `the bot stands on the deck's floor within ${st.within} s: ${upAt == null ? 'never in 25 s' : upAt.toFixed(1) + ' s'}`);
    assert.ok(sightAt != null && sightAt <= st.within, `and sees the enemy within ${st.within} s: ${sightAt == null ? 'never in 25 s' : sightAt.toFixed(1) + ' s'}`);
    assert.ok(stacked / ticks < 0.2, `it does not stay under the enemy: ${(stacked / ticks * 100).toFixed(0)}% of the run there, blind`);
  })));
}
