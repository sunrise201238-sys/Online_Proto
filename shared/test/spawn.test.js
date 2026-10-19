import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatchState, respawnFighterNext, pickRespawnSpawn, getArena, botHasLineOfSight,
  unitOverlapsObstacle, groundHeightAt, GROUND_BASE_Y, BOT_LOS_EYE_HEIGHT
} from '../src/sim/index.js';

// Town's spawn places (user 2026-10-18): the homes p1 (west terrace) and p2 (east terrace) and four more; a Trio
// respawn picks among them by sight (spawn.js). The sight rule here is the bots' own, the one the picker uses.
const ROSTERS = { p1: ['unit1', 'unit2', 'unit4'], p2: ['unit4', 'unit1', 'unit2'], p3: ['unit2', 'unit4', 'unit1'], p4: ['unit1', 'unit4', 'unit2'] };
const town = getArena('town');
const places = () => [town.spawns.p1, town.spawns.p2, ...town.spawns.more];
const eye = (p) => ({ x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z });
const sees = (a, b) => botHasLineOfSight(eye(a), eye(b), town.obstacles, town.surfaces);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const put = (f, p) => { f.pos.x = p.x; f.pos.y = p.y; f.pos.z = p.z; };
const at = (x, floor, z) => ({ x, y: GROUND_BASE_Y + floor, z });

test('Town: six spawn places, each on clear floor at its own height', () => {
  const ps = places();
  assert.equal(ps.length, 6);
  for (const p of ps) {
    assert.ok(!unitOverlapsObstacle(p.x, p.y, p.z, town.obstacles), `place (${p.x}, ${p.z}) is inside a box`);
    assert.ok(Math.abs(groundHeightAt(p.x, p.z, town.surfaces, p.y - GROUND_BASE_Y) - (p.y - GROUND_BASE_Y)) < 0.01, `place (${p.x}, ${p.z}) is not on its floor`);
  }
  // the 2v2 start: each pair on its terrace, nobody inside a box
  const m = createMatchState({ mapKey: 'town', mode: '2v2', startTime: 1000 });
  for (const f of Object.values(m.fighters)) assert.ok(!unitOverlapsObstacle(f.pos.x, f.pos.y, f.pos.z, town.obstacles), `${f.id} starts inside a box`);
  assert.equal(m.fighters.p1.pos.y, m.fighters.p3.pos.y);
  assert.equal(m.fighters.p2.pos.y, m.fighters.p4.pos.y);
});

test('Trio 1v1 respawn on Town: a place the enemy does not see, the farthest from it', () => {
  const m = createMatchState({ mapKey: 'town', mode: '1v1', rosters: ROSTERS, startTime: 1000 });
  const enemy = m.fighters.p2; put(enemy, at(116, 0, -78));   // the north street place: it sees the north-west terrace
  m.fighters.p1.hp = 0;
  const pick = pickRespawnSpawn('town', 'A', [enemy]);
  const fresh = respawnFighterNext(m, 'p1', pick);
  assert.deepEqual({ x: fresh.pos.x, y: fresh.pos.y, z: fresh.pos.z }, pick);
  assert.ok(!sees(pick, enemy.pos), 'spawned in the enemy\'s sight');
  for (const p of places()) if (!sees(p, enemy.pos)) assert.ok(dist(p, enemy.pos) <= dist(pick, enemy.pos) + 1e-9, `(${p.x}, ${p.z}) is unseen and farther`);
});

test('Trio 2v2 respawn on Town: a place the teammate sees, the nearest to it', () => {
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  const home = town.spawns.p2;   // the east home, on its terrace
  const mate = m.fighters.p3; put(mate, { x: home.x, y: home.y, z: home.z - 12 });   // 12 u from it on the same terrace
  put(m.fighters.p2, town.spawns.p1); put(m.fighters.p4, at(-104, 0, 118));
  m.fighters.p1.hp = 0;
  const pick = pickRespawnSpawn('town', 'A', ['p2', 'p3', 'p4'].map((id) => m.fighters[id]));
  assert.ok(sees(pick, mate.pos), 'the teammate cannot see the spawn');
  for (const p of places()) if (sees(p, mate.pos)) assert.ok(dist(p, mate.pos) >= dist(pick, mate.pos) - 1e-9, `(${p.x}, ${p.z}) is seen and nearer`);
  assert.deepEqual(pick, { x: home.x, y: home.y, z: home.z });
});

test('Trio 2v2 respawn on Town without a living teammate: the enemies\' rule', () => {
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  m.fighters.p3.hp = 0; m.fighters.p1.hp = 0;
  const e1 = m.fighters.p2, e2 = m.fighters.p4; put(e1, at(116, 0, -78)); put(e2, at(-104, 0, 118));
  const pick = pickRespawnSpawn('town', 'A', [e1, m.fighters.p3, e2]);
  assert.ok(!sees(pick, e1.pos) && !sees(pick, e2.pos), 'spawned in an enemy\'s sight');
  const near = (p) => Math.min(dist(p, e1.pos), dist(p, e2.pos));
  for (const p of places()) if (!sees(p, e1.pos) && !sees(p, e2.pos)) assert.ok(near(p) <= near(pick) + 1e-9, `(${p.x}, ${p.z}) is unseen and farther from the enemies`);
});

test('a living body on a place passes it over', () => {
  const m = createMatchState({ mapKey: 'town', mode: '2v2', rosters: ROSTERS, startTime: 1000 });
  const mate = m.fighters.p3; put(mate, town.spawns.p2);   // standing on the east home itself
  put(m.fighters.p2, town.spawns.p1); put(m.fighters.p4, at(-104, 0, 118));
  m.fighters.p1.hp = 0;
  const pick = pickRespawnSpawn('town', 'A', ['p2', 'p3', 'p4'].map((id) => m.fighters[id]));
  assert.ok(dist(pick, mate.pos) >= 8, 'spawned on top of the teammate');
});

test('a map without spawn places keeps the slot\'s own start', () => {
  const m = createMatchState({ mapKey: 'arena2', mode: '1v1', rosters: ROSTERS, startTime: 1000 });
  m.fighters.p1.hp = 0; put(m.fighters.p2, m.spawnPoints.p1);   // the enemy camps the start: still the start
  assert.equal(pickRespawnSpawn('arena2', 'A', [m.fighters.p2]), null);
  const fresh = respawnFighterNext(m, 'p1', pickRespawnSpawn('arena2', 'A', [m.fighters.p2]));
  assert.deepEqual({ x: fresh.pos.x, y: fresh.pos.y, z: fresh.pos.z }, m.spawnPoints.p1);
});

test('Space Station draws its respawn at random among the nine places (pick: random)', () => {
  const ss = getArena('S_Station');
  assert.equal(ss.spawns.pick, 'random');
  const all = [ss.spawns.p1, ss.spawns.p2, ...ss.spawns.more];
  assert.equal(all.length, 9);
  const m = createMatchState({ mapKey: 'S_Station', mode: '1v1', rosters: ROSTERS, startTime: 1000 });
  const enemy = m.fighters.p2; put(enemy, ss.spawns.more[0]);   // standing on the central junction: that place is passed over
  m.fighters.p1.hp = 0;
  const drawn = new Set();
  for (let i = 0; i < 400; i += 1) {
    const p = pickRespawnSpawn('S_Station', 'A', [enemy]);
    assert.ok(all.some((q) => q.x === p.x && q.z === p.z), 'not one of the places');
    assert.ok(dist(p, enemy.pos) >= 8, 'spawned on the enemy');
    drawn.add(`${p.x},${p.z}`);
  }
  assert.equal(drawn.size, 8, 'every free place drawn over 400 picks');
});
