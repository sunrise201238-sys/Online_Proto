import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SIM from '../src/sim/index.js';
import {
  createMatchState, respawnFighterNext, getArena, mateSpawnFor,
  unitOverlapsObstacle, groundHeightAt, GROUND_BASE_Y
} from '../src/sim/index.js';

// A map's spawn places (Town: the user's six, 2026-10-18; Dust, Backrooms, Warehouse: the user's ten, 2026-10-22). Until b1105mj a
// Trio respawn on a scene map picked among them (spawn.js: a place no living enemy saw, and for team 1's unit offline the place
// nearest an enemy). Since b1105mj (user 2026-11-28: "make scene maps use fixed spawn spots mechanics, just like concept maps do"
// and "use existing initial spawn spots. Other alternate spawn spots are not deleted; just not being used") a respawn comes on at
// its slot's own start on every map; the other places stay in the data, and the checks of them below stay with them.
const ROSTERS = { p1: ['unit1', 'unit2', 'unit4'], p2: ['unit4', 'unit1', 'unit2'], p3: ['unit2', 'unit4', 'unit1'], p4: ['unit1', 'unit4', 'unit2'] };
const placesOf = (a) => [a.spawns.p1, a.spawns.p2, ...a.spawns.more];
const put = (f, p) => { f.pos.x = p.x; f.pos.y = p.y; f.pos.z = p.z; };
const SCENE = ['town', 'neon', 'compound', 'dust', 'warehouse', 'hospital', 'spacecraft', 'backrooms', 'backrooms_anomaly', 'district'];
const CONCEPT = ['arena1', 'arena2', 'factory', 'factory2', 'square', 'lobby', 'station', 'flashpoint', 'airport'];   // (with the ten scene maps: the game's nineteen arenas)

for (const [key, count] of [['town', 6], ['dust', 10], ['backrooms', 10], ['backrooms_anomaly', 10], ['warehouse', 10]]) {
  test(`${key}: ${count} spawn places, each on clear floor at its own height`, () => {
    const a = getArena(key); const ps = a.spawns.more ? placesOf(a) : [a.spawns.p1, a.spawns.p2];
    assert.equal(ps.length, count);
    for (const p of ps) {
      assert.ok(!unitOverlapsObstacle(p.x, p.y, p.z, a.obstacles), `place (${p.x}, ${p.z}) is inside a box`);
      assert.ok(Math.abs(groundHeightAt(p.x, p.z, a.surfaces, p.y - GROUND_BASE_Y) - (p.y - GROUND_BASE_Y)) < 0.01, `place (${p.x}, ${p.z}) is not on its floor`);
    }
  });
}

test('Town 2v2 start: each pair on its terrace, nobody inside a box', () => {
  const town = getArena('town');
  const m = createMatchState({ mapKey: 'town', mode: '2v2', startTime: 1000 });
  for (const f of Object.values(m.fighters)) assert.ok(!unitOverlapsObstacle(f.pos.x, f.pos.y, f.pos.z, town.obstacles), `${f.id} starts inside a box`);
  assert.equal(m.fighters.p1.pos.y, m.fighters.p3.pos.y);
  assert.equal(m.fighters.p2.pos.y, m.fighters.p4.pos.y);
});

// THE FIXED START (b1105mj): the next roster unit of a slot comes on where the slot started — its team's home, or beside it for a 2v2 mate —
// whoever stands where, on the scene maps as on the concept maps.
test('a Trio respawn comes on at its slot\'s own start on every map, the scene maps as the concept maps', () => {
  for (const key of [...SCENE, ...CONCEPT]) {
    const a = getArena(key);
    const m = createMatchState({ mapKey: key, mode: '2v2', rosters: ROSTERS, startTime: 1000 }); m.now = 1000;
    const start = Object.fromEntries(['p1', 'p2', 'p3', 'p4'].map((id) => [id, { x: m.fighters[id].pos.x, y: m.fighters[id].pos.y, z: m.fighters[id].pos.z }]));
    // the starts: the homes, and the mates beside them by the game's rule
    assert.deepEqual({ x: start.p1.x, z: start.p1.z }, { x: a.spawns.p1.x, z: a.spawns.p1.z }, `${key}: p1 at team 1's home`);
    assert.deepEqual({ x: start.p2.x, z: start.p2.z }, { x: a.spawns.p2.x, z: a.spawns.p2.z }, `${key}: p2 at team 2's home`);
    assert.deepEqual(start.p3, mateSpawnFor(key, { ...a.spawns.p1, y: a.spawns.p1.y ?? GROUND_BASE_Y }), `${key}: p3 beside team 1's home`);
    assert.deepEqual(start.p4, mateSpawnFor(key, { ...a.spawns.p2, y: a.spawns.p2.y ?? GROUND_BASE_Y }), `${key}: p4 beside team 2's home`);
    // everyone walks off, an enemy stands on each start, and each slot's unit falls: its next unit comes on at the slot's start all the same
    for (const [id, foe] of [['p1', 'p2'], ['p3', 'p4'], ['p2', 'p1'], ['p4', 'p3']]) {
      for (const f of Object.values(m.fighters)) put(f, { x: f.pos.x + 30, y: f.pos.y, z: f.pos.z - 20 });
      put(m.fighters[foe], start[id]); m.fighters[id].hp = 0;
      const fresh = respawnFighterNext(m, id);
      assert.ok(fresh && fresh.hp > 0, `${key} ${id}: no respawn`);
      assert.deepEqual({ x: fresh.pos.x, y: fresh.pos.y, z: fresh.pos.z }, start[id], `${key} ${id}: not at its own start`);
      assert.deepEqual(m.spawnPoints[id], start[id]); assert.equal(fresh.invulnerableUntil, m.now + 3000);
    }
  }
});

test('the roster through: a slot\'s second and third units both come on at the one start, and nothing after the third', () => {
  const m = createMatchState({ mapKey: 'dust', mode: '1v1', rosters: ROSTERS, startTime: 1000 }); m.now = 1000;
  const start = { ...m.spawnPoints.p1 };
  for (const unit of ['unit2', 'unit4']) { put(m.fighters.p1, { x: 0, y: m.fighters.p1.pos.y, z: 100 }); m.fighters.p1.hp = 0; const fresh = respawnFighterNext(m, 'p1'); assert.equal(fresh.unit.id, unit); assert.deepEqual({ x: fresh.pos.x, y: fresh.pos.y, z: fresh.pos.z }, start); }
  m.fighters.p1.hp = 0; assert.equal(respawnFighterNext(m, 'p1'), null);
});

test('the scene maps keep their other places in the data, and nothing picks among them', () => {
  const more = { town: 4, neon: 3, compound: 8, dust: 8, warehouse: 8, hospital: 8, spacecraft: 8, backrooms: 8, backrooms_anomaly: 8, district: 7 };
  for (const key of SCENE) assert.equal(getArena(key).spawns.more.length, more[key], `${key}: its other places`);
  for (const key of CONCEPT) assert.equal(getArena(key).spawns.more, undefined, `${key}: a concept map names none`);
  assert.equal(SIM.pickRespawnSpawn, undefined); assert.equal(SIM.pickRespawnNearEnemy, undefined);
});

// District's homes swapped (user 2026-11-02, "swap the initial spawn spot for Team1 and Team2"): team 1 starts at the ring road's
// south-east corner, team 2 at the north-west — the server's match (createMatchState) and the offline client (the same arena row,
// getArenaSpawns) alike; each 2v2 mate beside its own home; the respawn pool the same nine places.
test('District: team 1 starts at the ring road\'s south-east corner, team 2 at the north-west (swapped 2026-11-02)', () => {
  const sp = getArena('district').spawns;
  assert.deepEqual([sp.p1.x, sp.p1.z, sp.p2.x, sp.p2.z], [351, 202, -353, -510]);
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit2', p3UnitKey: 'unit4', p4UnitKey: 'unit5', mode: '2v2' });
  const F = m.fighters, d = (f, p) => Math.hypot(f.pos.x - p.x, f.pos.z - p.z);
  assert.equal(F.p1.team, 'A'); assert.equal(F.p2.team, 'B');
  assert.ok(d(F.p1, { x: 351, z: 202 }) < 1e-9, 'team 1 at the south-east corner'); assert.ok(d(F.p2, { x: -353, z: -510 }) < 1e-9, 'team 2 at the north-west');
  assert.ok(F.p3.team === 'A' && d(F.p3, F.p1.pos) <= 20, 'team 1\'s mate beside its home'); assert.ok(F.p4.team === 'B' && d(F.p4, F.p2.pos) <= 20, 'team 2\'s mate beside its home');
  const pool = [sp.p1, sp.p2, ...sp.more].map((p) => `${p.x},${p.z}`).sort();
  assert.deepEqual(pool, ['-1,-510', '-1,202', '-105,318', '-353,-154', '-353,-510', '-353,202', '351,-154', '351,-510', '351,202'].sort(), 'the nine places unchanged');
});

// TEAM 1'S HOME (b1105mj, user 2026-11-28: "For all scene maps, figure out which existing initial spawn sites is more favorable, make the
// more favorable spots for team1"): on each scene map p1 is the home that won the more bot matches played from both homes in turn, a
// respawn at its slot's own start (Duel and Trio, 1v1 and 2v2; the README's entry has the counts). Dust's, Warehouse's and the two
// Backrooms' homes changed hands for it at that build; the other six stayed — Town's, District's and Neon's as the user's own swaps had
// left them. The server's match and the offline client read the one row (createMatchState, getArenaSpawns).
test('the scene maps\' homes: team 1 at the home measured the stronger (b1105mj)', () => {
  const HOMES = {   // [team 1's x, z, team 2's x, z]
    town: [168, 22, -208, 10], neon: [191.9, -115.3, -83.2, 47.2], compound: [-80, -247, -107, 220], dust: [27, 228, 49, -65],
    warehouse: [58, -102, -58, 102], hospital: [66, -133, -97, 166], spacecraft: [198, -10, -200, -2], backrooms: [84, 68, -88, -92],
    backrooms_anomaly: [84, 68, -88, -92], district: [351, 202, -353, -510]
  };
  assert.deepEqual(Object.keys(HOMES).sort(), [...SCENE].sort());
  for (const key of SCENE) {
    const sp = getArena(key).spawns; assert.deepEqual([sp.p1.x, sp.p1.z, sp.p2.x, sp.p2.z], HOMES[key], `${key}: its homes`);
    const m = createMatchState({ mapKey: key, p1UnitKey: 'unit1', p2UnitKey: 'unit2', p3UnitKey: 'unit4', p4UnitKey: 'unit5', mode: '2v2' }); const F = m.fighters;
    assert.deepEqual([F.p1.team, F.p3.team, F.p2.team, F.p4.team], ['A', 'A', 'B', 'B']);
    assert.deepEqual([F.p1.pos.x, F.p1.pos.z, F.p2.pos.x, F.p2.pos.z], HOMES[key], `${key}: the teams' starts`);
    const d = (f, g) => Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z);
    assert.ok(d(F.p3, F.p1) < d(F.p3, F.p2) && d(F.p4, F.p2) < d(F.p4, F.p1), `${key}: each mate on its own home's side`);
    // (and the mates stand on clear floor at their homes' new owners' sides — the places the other team's mates stood on before)
    const a = getArena(key);
    for (const id of ['p3', 'p4']) assert.ok(!unitOverlapsObstacle(F[id].pos.x, F[id].pos.y, F[id].pos.z, a.obstacles), `${key} ${id}: inside a box`);
  }
});
