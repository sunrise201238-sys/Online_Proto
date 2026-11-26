import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, respawnFighterNext, applyInput, emptyInput, getArena } from '../src/sim/index.js';

// A human's lock when the locked enemy dies and its slot respawns at once (Trio, the server's order: the death and the
// refill in one tick): the lock moves to the other living enemy, not to the respawned unit (user 2026-10-25). With no
// other living enemy the lock keeps the slot, as it always did.
const rosters = { p1: ['unit1', 'unit1', 'unit1'], p2: ['unit2', 'unit2', 'unit2'], p3: ['unit4', 'unit4', 'unit4'], p4: ['unit5', 'unit5', 'unit5'] };
const killAndRespawn = (m, id) => { m.fighters[id].hp = 0; return respawnFighterNext(m, id, getArena(m.mapKey).spawns.p2); };

test('the locked enemy dies and respawns in the same tick: the lock moves to its living teammate', () => {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', rosters, startTime: 1000 });
  m.now = 1000;
  assert.equal(m.fighters.p1.targetId, 'p2');
  const fresh = killAndRespawn(m, 'p2');
  assert.ok(fresh && fresh.hp > 0, 'no respawn');
  assert.equal(m.fighters.p1.targetId, 'p4', 'the lock followed the slot to the fresh spawn');
  assert.equal(m.fighters.p3.targetId, 'p4', 'the teammate locked on p2 moved too');
  // and it stays there: a frame of input does not pull it back
  applyInput(m, m.fighters.p1, emptyInput(), 1016, getArena('arena1').obstacles, getArena('arena1').surfaces);
  assert.equal(m.fighters.p1.targetId, 'p4');
});

test('with no other living enemy the lock keeps the slot (Trio-1v1, or the teammate dead too)', () => {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', rosters, startTime: 1000 });
  m.now = 1000;
  m.fighters.p4.hp = 0;   // the other enemy is down
  killAndRespawn(m, 'p2');
  assert.equal(m.fighters.p1.targetId, 'p2', 'with nothing else to aim at the lock should keep the slot');
  const d = createMatchState({ mapKey: 'arena1', mode: '1v1', rosters: { p1: rosters.p1, p2: rosters.p2 }, startTime: 1000 });
  d.now = 1000;
  killAndRespawn(d, 'p2');
  assert.equal(d.fighters.p1.targetId, 'p2');
});

// THE FRESH UNIT'S LOCK (b1105lh; user 2026-11-26, "when player unit respawns, make their unit locks at nearer enemy" and, of the offline form of it,
// "online also"): the unit that comes on is locked on the living enemy nearest the place it comes on at — whichever enemy the fallen unit was locked
// on. (Until then it kept the old lock while that enemy lived.)
const setAt = (f, x, z) => { f.pos.x = x; f.pos.z = z; };
test('the respawned unit itself comes on locked on the living enemy nearest its place, whichever enemy the fallen unit was locked on', () => {
  for (const [locked, nearId, farId] of [['p1', 'p3', 'p1'], ['p3', 'p3', 'p1'], ['p1', 'p1', 'p3'], ['p3', 'p1', 'p3']]) {
    const m = createMatchState({ mapKey: 'arena1', mode: '2v2', rosters, startTime: 1000 }); m.now = 1000;
    const at = { x: 40, y: m.fighters.p2.pos.y, z: 10 };   // (the place the fresh unit comes on at)
    setAt(m.fighters[nearId], at.x - 12, at.z); setAt(m.fighters[farId], at.x - 160, at.z + 40);
    m.fighters.p2.targetId = locked; m.fighters.p2.hp = 0;
    const fresh = respawnFighterNext(m, 'p2', at);
    assert.equal(fresh.targetId, nearId, `the fallen unit was locked on ${locked}, the nearer enemy is ${nearId}`);
    // and a frame of input does not pull it back
    applyInput(m, fresh, emptyInput(), 1016, getArena('arena1').obstacles, getArena('arena1').surfaces);
    assert.equal(fresh.targetId, nearId);
  }
});

test('the respawned unit\'s lock: a fallen enemy is passed over, however near; with no enemy alive the old lock stays', () => {
  const m = createMatchState({ mapKey: 'arena1', mode: '2v2', rosters, startTime: 1000 }); m.now = 1000;
  const at = { x: 40, y: m.fighters.p2.pos.y, z: 10 };
  setAt(m.fighters.p3, at.x - 12, at.z); m.fighters.p3.hp = 0; setAt(m.fighters.p1, at.x - 160, at.z + 40);
  m.fighters.p2.targetId = 'p3'; m.fighters.p2.hp = 0;
  assert.equal(respawnFighterNext(m, 'p2', at).targetId, 'p1', 'the near enemy is down: the living one');
  m.fighters.p1.hp = 0; m.fighters.p2.targetId = 'p3'; m.fighters.p2.hp = 0;
  assert.equal(respawnFighterNext(m, 'p2', at).targetId, 'p3', 'nobody to lock: the lock it had');
});

test('the respawned unit\'s lock in a 1v1: the one enemy, as before', () => {
  const d = createMatchState({ mapKey: 'arena1', mode: '1v1', rosters: { p1: rosters.p1, p2: rosters.p2 }, startTime: 1000 }); d.now = 1000;
  assert.equal(killAndRespawn(d, 'p2').targetId, 'p1');
});
