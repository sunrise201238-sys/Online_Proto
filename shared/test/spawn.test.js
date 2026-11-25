import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, respawnFighterNext, pickRespawnSpawn, pickRespawnNearEnemy, getArena, botHasLineOfSight,
  unitOverlapsObstacle, groundHeightAt, GROUND_BASE_Y
} from '../src/sim/index.js';

// A map's spawn places (Town: the user's six, 2026-10-18; Dust, Backrooms, Warehouse: the user's ten, 2026-10-22); a Trio
// respawn picks among them by the rule in spawn.js (user 2026-10-22): a place no living enemy sees, at random; none
// unseen, the farthest from the nearest enemy. Sight at a metre over the floor, the bots' own test. Teammates count for nothing.
const ROSTERS = { p1: ['unit1', 'unit2', 'unit4'], p2: ['unit4', 'unit1', 'unit2'], p3: ['unit2', 'unit4', 'unit1'], p4: ['unit1', 'unit4', 'unit2'] };
const EYE = 4;
const placesOf = (a) => [a.spawns.p1, a.spawns.p2, ...a.spawns.more];
const eye = (p) => ({ x: p.x, y: p.y + EYE, z: p.z });
const seesOn = (a) => (p, q) => botHasLineOfSight(eye(p), eye(q), a.obstacles, a.surfaces);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const put = (f, p) => { f.pos.x = p.x; f.pos.y = p.y; f.pos.z = p.z; };
const at = (x, floor, z) => ({ x, y: GROUND_BASE_Y + floor, z });
const same = (p, q) => p.x === q.x && p.z === q.z;

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

// (the rule, on each map the user set: with one enemy at its home, the places it does not see exist, and 200 draws land on
// those alone, every one of them drawn — no place is left unused, user 2026-10-22)
for (const key of ['town', 'dust', 'backrooms', 'warehouse']) {
  test(`${key}: a respawn is a place the enemy does not see, drawn at random among all such places`, () => {
    const a = getArena(key); const sees = seesOn(a);
    const m = createMatchState({ mapKey: key, mode: '1v1', rosters: ROSTERS, startTime: 1000 });
    const enemy = m.fighters.p2; put(enemy, a.spawns.p2);
    m.fighters.p1.hp = 0;
    const good = placesOf(a).filter((p) => !sees(p, enemy.pos) && dist(p, enemy.pos) >= 8);
    assert.ok(good.length >= 2, `only ${good.length} unseen places from the east home`);
    const drawn = new Set();
    for (let i = 0; i < 200; i += 1) {
      const pick = pickRespawnSpawn(key, 'A', [enemy]);
      assert.ok(good.some((q) => same(q, pick)), `(${pick.x}, ${pick.z}) is in the enemy's sight`);
      drawn.add(`${pick.x},${pick.z}`);
    }
    assert.equal(drawn.size, good.length, 'every unseen place drawn over 200 picks');
    const fresh = respawnFighterNext(m, 'p1', pickRespawnSpawn(key, 'A', [enemy]));
    assert.ok(good.some((q) => same(q, fresh.pos)), 'the fresh unit stands elsewhere');
  });
}

test('every place in sight: the farthest from the nearest enemy', () => {
  // (Backrooms, two enemies posted on places so that every other place is in sight of one of them, if such a posting exists)
  const a = getArena('backrooms'); const sees = seesOn(a); const ps = placesOf(a);
  const m = createMatchState({ mapKey: 'backrooms', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  m.fighters.p1.hp = 0; m.fighters.p3.hp = 0;
  const e1 = m.fighters.p2, e2 = m.fighters.p4;
  let posted = false;
  for (const i of ps.keys()) { for (const j of ps.keys()) {
    if (i === j) continue; put(e1, ps[i]); put(e2, ps[j]);
    if (ps.every((p) => Math.min(dist(p, e1.pos), dist(p, e2.pos)) < 8 || sees(p, e1.pos) || sees(p, e2.pos))) { posted = true; break; } }
    if (posted) break; }
  if (!posted) { assert.ok(true, 'no posting of two enemies sees the whole hall: an unseen place always remains here'); return; }
  const near = (p) => Math.min(dist(p, e1.pos), dist(p, e2.pos));
  const free = ps.filter((p) => near(p) >= 8); const pool = free.length ? free : ps;
  for (let i = 0; i < 20; i += 1) { const pick = pickRespawnSpawn('backrooms', 'A', [e1, m.fighters.p3, e2]); for (const p of pool) assert.ok(near(p) <= near(pick) + 1e-9, `(${p.x}, ${p.z}) is farther than the pick`); }
});

test('a living teammate counts for nothing: the pick is by the enemy alone', () => {
  const a = getArena('town'); const sees = seesOn(a);
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  const mate = m.fighters.p3; put(mate, at(116, 0, -78));   // the north street place
  const enemy = m.fighters.p2; put(enemy, a.spawns.p2); put(m.fighters.p4, a.spawns.p2); m.fighters.p4.hp = 0;
  m.fighters.p1.hp = 0;
  const good = placesOf(a).filter((p) => !sees(p, enemy.pos) && dist(p, enemy.pos) >= 8 && dist(p, mate.pos) >= 8);
  const drawn = new Set();
  for (let i = 0; i < 200; i += 1) { const pick = pickRespawnSpawn('town', 'A', [enemy, mate, m.fighters.p4]); assert.ok(good.some((q) => same(q, pick)), `(${pick.x}, ${pick.z}) is not an unseen place`); drawn.add(`${pick.x},${pick.z}`); }
  assert.equal(drawn.size, good.length, 'the places the teammate sees or does not see are drawn alike');
});

test('a living body on a place passes it over', () => {
  const a = getArena('town');
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  const mate = m.fighters.p3; put(mate, a.spawns.p1);   // standing on the west home itself
  put(m.fighters.p2, a.spawns.p2); put(m.fighters.p4, at(116, 0, -78));
  m.fighters.p1.hp = 0;
  for (let i = 0; i < 50; i += 1) { const pick = pickRespawnSpawn('town', 'A', ['p2', 'p3', 'p4'].map((id) => m.fighters[id])); assert.ok(dist(pick, mate.pos) >= 8, 'spawned on top of the teammate'); }
});

test('a map without spawn places keeps the slot\'s own start', () => {
  const m = createMatchState({ mapKey: 'arena2', mode: '1v1', rosters: ROSTERS, startTime: 1000 });
  m.fighters.p1.hp = 0; put(m.fighters.p2, m.spawnPoints.p1);   // the enemy camps the start: still the start
  assert.equal(pickRespawnSpawn('arena2', 'A', [m.fighters.p2]), null);
  const fresh = respawnFighterNext(m, 'p1', pickRespawnSpawn('arena2', 'A', [m.fighters.p2]));
  assert.deepEqual({ x: fresh.pos.x, y: fresh.pos.y, z: fresh.pos.z }, m.spawnPoints.p1);
});

test('Spacecraft draws its respawn at random among all its places (pick: random)', () => {
  const ss = getArena('spacecraft');
  assert.equal(ss.spawns.pick, 'random');
  const all = placesOf(ss);   // (the homes and the `more` places: ten at this writing; the count is the data's)
  assert.ok(all.length >= 3);
  const m = createMatchState({ mapKey: 'spacecraft', mode: '1v1', rosters: ROSTERS, startTime: 1000 });
  const enemy = m.fighters.p2; put(enemy, ss.spawns.more[0]);   // standing on the central junction: that place is passed over
  m.fighters.p1.hp = 0;
  const drawn = new Set();
  for (let i = 0; i < 400; i += 1) {
    const p = pickRespawnSpawn('spacecraft', 'A', [enemy]);
    assert.ok(all.some((q) => same(q, p)), 'not one of the places');
    assert.ok(dist(p, enemy.pos) >= 8, 'spawned on the enemy');
    drawn.add(`${p.x},${p.z}`);
  }
  assert.equal(drawn.size, all.length - 1, 'every free place drawn over 400 picks');
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

// THE PLACE BY THE FIGHT (b1105lf; user 2026-11-25, of the measured ways to favour the offline player's team by the place alone:
// "1. Apply option B. 2. Offline scene maps only. 3. Does not apply to team1 Sniper units."): pickRespawnNearEnemy, which the
// offline client asks for a fresh unit of team 1 on a scene map, a sniper excepted (main.js respawnSlotMech; the server never
// asks it) — of the map's places the free one nearest a living enemy, seen or not.
const SCENE_MAPS = ['town', 'district', 'neon', 'spacecraft', 'dust', 'warehouse', 'compound', 'hospital', 'backrooms', 'backrooms_anomaly'];
test('the place by the fight: on every scene map the free place nearest a living enemy, in its sight or out of it', () => {
  let inSight = 0, picks = 0;
  for (const key of SCENE_MAPS) { const a = getArena(key); const sees = seesOn(a); const ps = placesOf(a);
    const m = createMatchState({ mapKey: key, mode: '1v1', rosters: ROSTERS, startTime: 1000 }); m.fighters.p1.hp = 0; const e = m.fighters.p2;
    for (const q of ps) { put(e, { x: q.x + 12, y: q.y, z: q.z });   // (the enemy three metres beside a place: off it, so the place is free)
      const pick = pickRespawnNearEnemy(key, 'A', [e]); const free = ps.filter((p) => dist(p, e.pos) >= 8);
      assert.ok(free.some((p) => same(p, pick)), `${key}: the pick is one of the map's free places`);
      for (const p of free) assert.ok(dist(pick, e.pos) <= dist(p, e.pos) + 1e-9, `${key}: (${p.x}, ${p.z}) is nearer the enemy than the pick`);
      picks += 1; if (sees(pick, e.pos)) inSight += 1; } }
  // (the shared rule would give none of these while an unseen place remained: here the sight is not asked)
  assert.ok(picks >= 80 && inSight >= 20, `picks in the enemy's sight: ${inSight} of ${picks}`);
});

test('the place by the fight: a place a living body stands on is passed over, a fallen enemy counts for nothing, two enemies count by the nearer', () => {
  const a = getArena('town'); const ps = placesOf(a);
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 }); m.fighters.p1.hp = 0;
  const e1 = m.fighters.p2, e2 = m.fighters.p4, mate = m.fighters.p3; const others = [e1, mate, e2];
  const byNearest = (from, skip = []) => ps.filter((p) => !skip.some((q) => same(p, q))).sort((p, q) => dist(p, from) - dist(q, from));
  // an enemy standing on a place itself: that place is passed over, the next nearest to it is the pick
  put(e1, ps[2]); put(e2, ps[2]); e2.hp = 0; put(mate, ps[0]); const order = byNearest(e1.pos, [ps[2], ps[0]]);
  assert.ok(same(pickRespawnNearEnemy('town', 'A', others), order[0]), 'the enemy\'s own place and the mate\'s are passed over');
  // the mate standing on that next place: passed over too
  put(mate, order[0]); assert.ok(same(pickRespawnNearEnemy('town', 'A', others), byNearest(e1.pos, [ps[2], order[0]])[0]), 'a place the mate stands on is passed over');
  // the fallen enemy lies three metres from another place: it draws nothing
  put(mate, ps[0]); put(e2, { x: ps[5].x + 12, y: ps[5].y, z: ps[5].z }); assert.ok(same(pickRespawnNearEnemy('town', 'A', others), order[0]), 'a fallen enemy counts for nothing');
  // alive, it does: the place beside it is three metres from an enemy, nearer than any place is to the other
  e2.hp = 100; assert.ok(same(pickRespawnNearEnemy('town', 'A', others), ps[5]), 'two enemies: the place nearest either');
});

test('the place by the fight: null with no enemy alive and on a map without spawn places — the caller keeps the shared rule', () => {
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 }); m.fighters.p1.hp = 0; m.fighters.p2.hp = 0; m.fighters.p4.hp = 0;
  assert.equal(pickRespawnNearEnemy('town', 'A', [m.fighters.p2, m.fighters.p3, m.fighters.p4]), null);
  const c = createMatchState({ mapKey: 'arena2', mode: '1v1', rosters: ROSTERS, startTime: 1000 }); c.fighters.p1.hp = 0;
  assert.equal(pickRespawnNearEnemy('arena2', 'A', [c.fighters.p2]), null);
  assert.equal(pickRespawnNearEnemy('no_such_map', 'A', [c.fighters.p2]), null);
});
