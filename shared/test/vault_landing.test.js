// THE VAULT'S OWN LANDING, A WAYPOINT ON ANOTHER STOREY, and the arrival that waits to land (b1105li; navgrid.js, nbrain.js;
// user 2026-11-26, District: a bot that had followed up the east tower by its ladder "will get stuck tracking me after i run
// down a few floors"). The tower's storeys are 4.06 m apart, joined by ramps along the inner walls. By a ramp's upper end the
// storey above stands a jump's height over the tread, and the grid held fall links from the ramp's side to the floor under
// that storey: the follower vaults toward a link's waypoint, the vault came down ON the storey above, the waypoint was read
// as reached in the plan, and the route went on a storey too high — 90 s on the top storey, plan after plan. Four things:
//   - the builder makes a fall link only where the vault comes down on the lower node's floor (the highest floor at the
//     landing place within a jump's rise and a step of the take-off's floor is the landing's own);
//   - the follower does not pass a waypoint a storey off the body, and a body standing at one plans afresh — except on a
//     route that begins a storey off the body (planned from a floor the grid does not hold), read in the plan alone as before;
//   - a route's end is reached only by a body down at it: one stepping off a storey's edge to a last waypoint on the stairs
//     below had "arrived" in the air, dropped the route, and was steered back onto the storey it was leaving;
//   - the Pursue leg's hop down off high ground is not taken off an edge whose drop ends under the enemy's floor: on the
//     stairs a metre over its enemy the bot's one such edge was the window's, 33 m over the street, and out it went.
// The searches run in their per-tick slices and Math.random is seeded, so the runs repeat; the boost gauge is in play.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, MAP_DATA } from '../src/sim/index.js';
import { tickBot, pickBotTargetId, navGridFor, registerNavGridData } from '../src/sim/ai.js';
import { tryStartJump } from '../src/sim/actions.js';
import { navDataFile, deserializeNavGrid, navDataSignature, JUMP_APEX } from '../src/sim/navgrid.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));
function gridFor(mapKey) {   // (the grid as the server hands it out: the shipped file — ladder_bots.test.js)
  const arena = getArena(mapKey);
  const file = PUBLIC + navDataFile(mapKey);
  if (existsSync(file)) registerNavGridData(arena, new Uint8Array(readFileSync(file)));
  return navGridFor(arena);
}
const withGauge = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };
const seeded = (seed, fn) => { const real = Math.random; let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; try { return fn(); } finally { Math.random = real; } };
const put = (f, at) => { f.pos.x = at.x; f.pos.z = at.z; f.pos.y = at.y + G; f.floorY = f.pos.y; f.vel.x = 0; f.vel.y = 0; f.vel.z = 0; f.grounded = true; f.airborne = false; };

test('a jump lifts no unit\'s feet over JUMP_APEX, the rise the builder reads a vault by', () => {
  let most = 0;
  for (const key of Object.keys(C.UNIT_DATA)) {
    const m = createMatchState({ mapKey: 'arena1', p1UnitKey: key, p2UnitKey: key, startTime: 1000 });
    const f = m.fighters.p2; const floor0 = f.pos.y; let now = 1000, top = 0;
    for (let t = 0; t < 120; t += 1) {
      now += MS; f.vel.x = 0; f.vel.z = 0;
      if (t === 3) assert.ok(tryStartJump(f, now), `${key} jumps`);
      tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
      top = Math.max(top, f.pos.y - floor0);
    }
    assert.ok(top <= JUMP_APEX, `${key} rises ${top.toFixed(3)}, over JUMP_APEX ${JUMP_APEX}: the builder's reach is short`);
    most = Math.max(most, top);
  }
  assert.ok(JUMP_APEX - most < 0.1, `the highest jump is ${most.toFixed(3)}: JUMP_APEX ${JUMP_APEX} is more than a tenth over it`);
});

test('no fall link of a shipped grid lands under a floor the vault would come down on', () => {
  let maps = 0, falls = 0;
  for (const mapKey of Object.keys(MAP_DATA)) {
    const file = PUBLIC + navDataFile(mapKey);
    if (!existsSync(file)) continue;
    const arena = getArena(mapKey);
    const g = deserializeNavGrid(new Uint8Array(readFileSync(file)), arena.surfaces, navDataSignature(arena.obstacles, arena.surfaces, arena.ladders ?? []));
    assert.ok(g, `${mapKey}: the file reads`);
    maps += 1;
    for (let i = 0; i < g.N; i += 1) {
      for (let e = g.linkStart[i]; e < g.linkStart[i + 1]; e += 1) {
        const j = g.linkAdj[e];
        if (g.floor[i] - g.floor[j] <= 4.8) continue;   // (a jump link, or the fall's own way up)
        falls += 1;
        const on = groundHeightAt(g.posX[j], g.posZ[j], arena.surfaces, g.floor[i] + JUMP_APEX);
        if (Math.abs(on - g.floor[j]) > 0.05) assert.fail(`${mapKey}: the fall from (${g.posX[i].toFixed(1)}, ${g.posZ[i].toFixed(1)} | ${g.floor[i].toFixed(2)}) to (${g.posX[j].toFixed(1)}, ${g.posZ[j].toFixed(1)} | ${g.floor[j].toFixed(2)}) comes down on a floor at ${on.toFixed(2)}`);
      }
    }
  }
  assert.ok(maps >= 8 && falls > 10000, `${maps} maps and ${falls} fall links read`);
});

// District's east tower (arena units; feet over the ground). The reported places: the bot on the roof, where it came up by
// the ladder (model x -12.47, z 34.97, feet 44.67 m), its enemy five storeys down (x -15.12, z 35.65, feet 24.37 m).
const ROOF = { x: 53.1, z: -1.9, y: 178.68 };
const chase = (enemyAt, capS) => withGauge(() => seeded(12345, () => {
  gridFor('district');
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const bot = m.fighters.p2, enemy = m.fighters.p1;
  put(enemy, enemyAt); put(bot, ROOF);
  let now = 1000;
  for (let k = 0; k < (capS * 1000) / MS; k += 1) {
    now += MS; put(enemy, enemyAt); enemy.hp = 1e9; bot.hp = 1e9;
    bot.targetId = pickBotTargetId(m, bot) ?? bot.targetId;
    tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
    if (enemy.hp < 1e9) return (k * MS) / 1000;
  }
  return null;
}));

test('District: a bot on the east tower\'s roof comes down to an enemy five storeys under it and hits it', () => {
  const t = chase({ x: 42.5, z: 0.8, y: 97.48 }, 45);   // (15.5 s as built; never, in 90 s, before)
  assert.ok(t != null, 'no hit in 45 s: the bot did not come down the tower');
});

test('District: and to an enemy three storeys under the roof, whose route ends on the stairs under a storey\'s edge', () => {
  const t = chase({ x: 42.5, z: 0.8, y: 129.96 }, 35);   // (9.6 s as built; with the links gone but the arrival read in the air: never — to the stairwell's edge and back)
  assert.ok(t != null, 'no hit in 35 s: the bot did not leave the storey over its enemy');
});

// The stairs under the 36.55 m storey (the ramp at model x -11.6, z 41.4, feet 33.47 m), the enemy on the storey they come
// down to (32.49 m), in sight; the window is in the north wall, 2 m on. With the gauge full, as a match begins, the bot went
// out by it in 7 runs of 8 inside half a second.
test('District: on the tower\'s stairs a metre over its enemy, a bot does not hop out of the window', () => withGauge(() => {
  gridFor('district');
  const STAIR = { x: 56.6, z: 23.8, y: 133.88 }, enemyAt = { x: 42.5, z: 0.8, y: 129.96 };
  for (let seed = 1; seed <= 8; seed += 1) seeded(seed * 101, () => {
    const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
    const bot = m.fighters.p2, enemy = m.fighters.p1;
    put(enemy, enemyAt); put(bot, STAIR);
    let now = 1000, hit = false;
    for (let k = 0; k < 4000 / MS; k += 1) {
      now += MS; put(enemy, enemyAt); enemy.hp = 1e9; bot.hp = 1e9; bot.targetId = 'p1';
      tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
      if (enemy.hp < 1e9) hit = true;
      // (the tower's plan, model x -23.6..-6.4, z 25.4..43.4, in arena units; and no more than 3 m under its enemy)
      const inside = bot.pos.x > 8.6 && bot.pos.x < 77.4 && bot.pos.z > -40.2 && bot.pos.z < 31.8 && bot.pos.y - G > enemyAt.y - 12;
      assert.ok(inside, `seed ${seed}: the bot left the tower after ${((k * MS) / 1000).toFixed(1)} s by ${bot.botHopWhy ?? 'no hop'}, at (${bot.pos.x.toFixed(1)}, ${bot.pos.z.toFixed(1)} | ${(bot.pos.y - G).toFixed(1)})`);
    }
    assert.ok(hit, `seed ${seed}: and it hits its enemy from there`);
  });
}));

// The follower's rule on its own: a route record set by hand under a bot on the tower's roof, its enemy five storeys down
// and out of sight, the Maze leg following. The storey under the roof is 16.24 units down.
const followOnce = (pathOf, age) => withGauge(() => seeded(7, () => {
  gridFor('district');
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const bot = m.fighters.p2, enemy = m.fighters.p1;
  const enemyAt = { x: 42.5, z: 0.8, y: 97.48 };
  put(enemy, enemyAt); put(bot, ROOF);
  let now = 1000;
  // (the brain's own way into the Maze leg: sightless for two seconds)
  for (let k = 0; k < 4000 / MS && !(bot.botState === 'maze' && m._navPaths?.p2?.path?.length); k += 1) {
    now += MS; put(enemy, enemyAt); put(bot, ROOF); enemy.hp = 1e9; bot.hp = 1e9; bot.targetId = 'p1';
    tickBot(m, 'p2', now);
  }
  assert.equal(bot.botState, 'maze', 'the bot is on the Maze leg');
  put(bot, ROOF);
  const rec = { path: pathOf(ROOF), idx: 0, gx: enemy.pos.x, gz: enemy.pos.z, at: now - age, pending: false, fireJob: null, fireDone: true, walkJob: null, interim: false };
  m._navPaths.p2 = rec;
  now += MS; put(enemy, enemyAt); enemy.hp = 1e9; bot.hp = 1e9; bot.targetId = 'p1';
  tickBot(m, 'p2', now);
  return { rec, now: m._navPaths?.p2 ?? null };
}));
const UNDER = ROOF.y - 16.24;

test('the follower does not pass a waypoint a storey under the body, though it stands at it in the plan', () => {
  const { rec, now } = followOnce((r) => [{ x: r.x, z: r.z, y: r.y }, { x: r.x + 1, z: r.z, y: UNDER, jump: true }, { x: r.x + 9, z: r.z, y: UNDER }], 0);
  assert.equal(now, rec, 'a plan just made stands');
  assert.equal(rec.idx, 1, 'the first waypoint, on the body\'s floor, is passed; the one a storey under it is not');
  assert.ok(!rec.planOnly, 'and the route is not one read in the plan alone');
});

test('and a body that stands at such a waypoint, its plan a second old, plans afresh from where it stands', () => {
  const { rec, now } = followOnce((r) => [{ x: r.x, z: r.z, y: r.y }, { x: r.x + 1, z: r.z, y: UNDER, jump: true }, { x: r.x + 9, z: r.z, y: UNDER }], 2000);
  assert.ok(now && now !== rec, 'a fresh route record');
  assert.equal(rec.idx, 1, 'the old route was not walked on a storey too high');
});

test('a route whose first waypoint is a storey off the body — planned from a floor the grid does not hold — is read in the plan alone', () => {
  const { rec, now } = followOnce((r) => [{ x: r.x, z: r.z, y: UNDER }, { x: r.x + 8, z: r.z, y: UNDER }, { x: r.x + 16, z: r.z, y: UNDER }], 2000);
  assert.equal(now, rec, 'the route stands: no fresh plan');
  assert.equal(rec.planOnly, true, 'marked');
  assert.equal(rec.idx, 1, 'and its first waypoint is passed, as before the rule');
});
