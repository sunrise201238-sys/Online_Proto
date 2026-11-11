// The transporters (pads.js; b1105fk, user 2026-11-10): Neon's rows against the installed data — the gold pair A and B, and
// since b1105fo the silver pair C and D ("Add another pair of transport points as well. use silver instead of golden this
// time") — and the rule on the server's sim: a fresh press on a pad starts the charge, the held button keeps it, PAD_HOLD_MS
// moves the body onto the other pad's arrival point; let go and it is dropped; a body that jumped in holding the button is not
// caught; the latch after the move; no shot, dodge or jump while it runs; a second body's arrival beside the first; the route
// grid's links; the bot's goal; the snapshot.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import {
  createMatchState, tickMatch, emptyInput, getArena, getArenaPads, buildSnapshotFor, groundHeightAt, unitOverlapsObstacle,
  attemptFire, tryStartStep, padAt, padZone, PAD_HOLD_MS, PAD_CLEAR, getArenaSpawns, findPathOnGrid
} from '../src/sim/index.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
function match() {
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  for (const f of Object.values(m.fighters)) { f.hp = 1e9; f.invulnerableUntil = 0; }
  m.fighters.p2.pos = { x: -200, y: G, z: 0 }; m.fighters.p2.floorY = G;   // (the other body far off)
  return m;
}
function stand(f, P, dx = 0, dz = 0) { f.pos = { x: P.x + dx, y: P.y + G, z: P.z + dz }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = P.y + G; }
function run(m, frames, now0, n, bots = []) { let now = now0; for (let i = 0; i < n; i += 1) { now += MS; tickMatch(m, { p1: frames(i) }, now, DT, bots); } return now; }
const hold = (i) => ({ ...emptyInput(), jump: i === 0, jumpDown: true });

test('Neon has two pairs, gold and silver, each pad sending to its own pair; zones, arrival spots and floors clear of the boxes', () => {
  const a = getArena('neon'); const pads = getArenaPads('neon');
  assert.equal(pads.length, 4); assert.deepEqual(pads.map((P) => P.to), [1, 0, 3, 2], 'A and B, C and D');
  assert.deepEqual(pads.map((P) => P.color), ['gold', 'gold', 'silver', 'silver'], 'the first pair gold, the second silver');
  for (const P of pads) {
    const floor = groundHeightAt(P.x, P.z, a.surfaces, P.y + 0.1);
    assert.ok(Math.abs(floor - P.y) < 0.05, `${P.name}: the zone's floor ${floor.toFixed(2)} vs ${P.y.toFixed(2)}`);
    assert.ok(!unitOverlapsObstacle(P.x, P.y + G, P.z, a.obstacles), `${P.name}: the zone's middle stands clear`);
    for (const [dx, dz] of P.spots) {
      const x = P.ax + dx, z = P.az + dz; const f = groundHeightAt(x, z, a.surfaces, P.y + 0.1);
      assert.ok(Math.abs(f - P.y) < 0.05, `${P.name}: the spot (${dx},${dz}) floor ${f.toFixed(2)}`);
      assert.ok(!unitOverlapsObstacle(x, P.y + G, z, a.obstacles), `${P.name}: the spot (${dx},${dz}) stands clear`);
      assert.equal(padAt(pads, { x, y: P.y + G, z }), pads.indexOf(P), `${P.name}: the spot (${dx},${dz}) lies in its own zone`);
    }
  }
  // the floor circle is the zone (b1105fl, user: "Move the transporting circle and its detection on the floor"): its ring lies
  // whole on the pad's floor, clear of every wall; a sign is words on a wall, no zone of its own
  for (const P of pads) {
    assert.equal(P.dr, P.r, `${P.name}: the circle drawn is the zone`);
    for (let k = 0; k < 72; k += 1) {
      const t = (k * Math.PI) / 36, x = P.x + P.dr * Math.cos(t), z = P.z + P.dr * Math.sin(t);
      assert.ok(Math.abs(groundHeightAt(x, z, a.surfaces, P.y + 0.1) - P.y) < 0.05, `${P.name}: the ring at ${k * 5} degrees is on the floor`);
      assert.ok(!unitOverlapsObstacle(x, P.y + G, z, a.obstacles, 0.001), `${P.name}: the ring at ${k * 5} degrees is clear of the walls`);
    }
    if (P.sign) assert.equal(padAt(pads, { x: P.sign.x, y: P.y + G, z: P.sign.z }), -1, `${P.name}: the sign's foot is no zone`);
  }
  assert.ok(pads[0].sign && pads[0].sign.text === 'Hold Jump to Transport' && !pads[1].sign, 'A has the words on its wall, B none');
  assert.ok(!pads[2].sign && !pads[3].sign, 'the silver pair has no words');
  // the user's own standing places are in the zones (A: x -3.05 z 8.29 at 0.54 m; B: x -3.31 z 19.76 at 21.24 m; C: x 4.24
  // z 67.45 at 0.54 m; D: x 4.07 z 56.40 at 20.23 m)
  const at = (mx, mz, h) => ({ x: (mx + 12.44) * 4, y: h * 4 + G, z: (mz - 40.37) * 4 });
  assert.equal(padAt(pads, at(-3.05, 8.29, 0.5425)), 0); assert.equal(padAt(pads, at(-3.31, 19.76, 21.2375)), 1);
  assert.equal(padAt(pads, at(4.24, 67.45, 0.5425)), 2); assert.equal(padAt(pads, at(4.07, 56.40, 20.235)), 3);
  // the street under the tower top is no zone of B, nor the street under the bridge one of D (the floor's height counts)
  assert.equal(padAt(pads, at(-3.31, 19.76, 0.15)), -1); assert.equal(padAt(pads, at(4.07, 56.40, 0.15)), -1);
});

test('a fresh press on A, held: the body stands for PAD_HOLD_MS, then it is on B; held on, nothing more; let go and press: back on A', () => {
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1; stand(p, pads[0]);
  const x0 = p.pos.x, z0 = p.pos.z;
  let now = run(m, hold, 1000, Math.floor((PAD_HOLD_MS - 50) / MS));
  assert.equal(p.padCharge, 0, 'the charge runs'); assert.ok(Math.hypot(p.pos.x - x0, p.pos.z - z0) < 1e-6, 'the body stands'); assert.ok(!p.airborne, 'no jump');
  now = run(m, (i) => ({ ...emptyInput(), jumpDown: true }), now, 6);
  const B = pads[1];
  assert.ok(Math.hypot(p.pos.x - B.ax, p.pos.z - B.az) < 0.01, `on B (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`);
  assert.ok(Math.abs(p.pos.y - (B.y + G)) < 0.05, 'standing on B\'s floor'); assert.equal(p.padMoves, 1); assert.equal(p.padCharge, undefined);
  now = run(m, (i) => ({ ...emptyInput(), jumpDown: true, jump: true }), now, Math.ceil(2000 / MS));
  assert.ok(Math.hypot(p.pos.x - B.ax, p.pos.z - B.az) < 0.05, 'held on: still on B'); assert.equal(p.padMoves, 1); assert.ok(!p.airborne, 'and no jump of the held button');
  now = run(m, () => emptyInput(), now, 3);
  now = run(m, hold, now, Math.ceil((PAD_HOLD_MS + 40) / MS));
  assert.equal(p.padMoves, 2); assert.ok(Math.hypot(p.pos.x - pads[0].ax, p.pos.z - pads[0].az) < 0.01, 'back on A');
});

test('the silver pair the same: a fresh press on C, held, is on D after PAD_HOLD_MS; let go and press on D: back on C', () => {
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1; stand(p, pads[2]);
  let now = run(m, hold, 1000, Math.floor((PAD_HOLD_MS - 50) / MS));
  assert.equal(p.padCharge, 2, 'the charge runs on C'); assert.ok(!p.padMoves);
  now = run(m, (i) => ({ ...emptyInput(), jumpDown: true }), now, 6);
  const D = pads[3];
  assert.ok(Math.hypot(p.pos.x - D.ax, p.pos.z - D.az) < 0.01, 'on D'); assert.ok(Math.abs(p.pos.y - (D.y + G)) < 0.05, 'standing on the bridge\'s floor');
  assert.equal(p.padMoves, 1);
  now = run(m, () => emptyInput(), now, 3);
  now = run(m, hold, now, Math.ceil((PAD_HOLD_MS + 40) / MS));
  assert.equal(p.padMoves, 2); assert.ok(Math.hypot(p.pos.x - pads[2].ax, p.pos.z - pads[2].az) < 0.01, 'back on C');
  assert.ok(Math.abs(p.pos.y - (pads[2].y + G)) < 0.05, 'on the pavement');
});

test('let go before the second: the charge is dropped, the body where it was, no jump; a body that jumped in holding is not caught', () => {
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1; stand(p, pads[0]);
  let now = run(m, hold, 1000, Math.floor(500 / MS));
  assert.equal(p.padCharge, 0);
  now = run(m, () => emptyInput(), now, 2);
  assert.equal(p.padCharge, undefined); assert.ok(!p.padMoves, 'no move'); assert.ok(!p.airborne, 'no jump');
  // from outside the zone, the button held: the unit jumps as ever, lands in the zone holding — no charge
  const m2 = match(); const p2 = m2.fighters.p1; stand(p2, pads[0], 0, 1.8 * 4); p2.vel = { x: 0, y: 0, z: 0 };
  let t = run(m2, (i) => ({ ...emptyInput(), jump: i === 0, jumpDown: true, moveZ: i < 18 ? -1 : 0 }), 1000, 60);
  assert.ok(padZone(pads[0], p2.pos), 'it came into the zone'); assert.equal(p2.padCharge, undefined, 'not caught by the held button'); assert.ok(!p2.padMoves);
});

test('while the charge runs: no shot, no dodge, the stick does nothing; a hit does not stop it', () => {
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1; stand(p, pads[0]);
  const now = run(m, hold, 1000, 10);
  assert.equal(attemptFire(m, p, m.fighters.p2, now), false, 'no shot');
  assert.equal(tryStartStep(m, p, 1, 0, now, getArena('neon').obstacles), false, 'no dodge');
  const x0 = p.pos.x; run(m, (i) => ({ ...emptyInput(), jumpDown: true, moveX: 1, stepTap: true }), now, 5);
  assert.ok(Math.abs(p.pos.x - x0) < 1e-6, 'the stick does nothing'); assert.equal(p.padCharge, 0);
  p.hp -= 10; run(m, (i) => ({ ...emptyInput(), jumpDown: true }), now + 5 * MS, Math.ceil(PAD_HOLD_MS / MS));
  assert.equal(p.padMoves, 1, 'moved though hit');
});

test('a second body arriving: beside the first, PAD_CLEAR apart, on the floor and in the zone', () => {
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1, q = m.fighters.p2; stand(p, pads[0]);
  stand(q, { x: pads[1].ax, z: pads[1].az, y: pads[1].y });
  run(m, hold, 1000, Math.ceil((PAD_HOLD_MS + 40) / MS));
  assert.equal(p.padMoves, 1); const d = Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
  assert.ok(d >= PAD_CLEAR - 0.3, `apart ${d.toFixed(2)}`); assert.ok(padZone(pads[1], p.pos), 'in B\'s zone');
});

test('the route grid: a link each way per pad; every spawn reaches B and D up through A or C, and no other way', async () => {
  const { navGridFor } = await import('../src/sim/ai.js');
  const a = getArena('neon'); const pads = getArenaPads('neon'); const grid = navGridFor(a);
  const links = grid.ladderLinks.filter((l) => l.pad != null);
  assert.deepEqual(links.map((l) => l.pad).sort(), [0, 1, 2, 3], 'one link per pad');
  for (const l of links) assert.ok(Math.abs(l.y - pads[pads[l.pad].to].y) < 0.01, 'the link lands on the other pad\'s floor');
  const sp = getArenaSpawns('neon'); const spawns = Array.isArray(sp) ? sp : Object.values(sp).flat();
  assert.ok(spawns.length >= 2);
  const firstLegs = { 1: new Set(), 3: new Set() };
  for (const k of [1, 3]) {
    const T = pads[k];
    for (const s of spawns) {
      const f0 = groundHeightAt(s.x, s.z, a.surfaces, (s.y ?? 0) + 1);
      const path = findPathOnGrid(grid, s.x, s.z, T.x, T.z, f0, T.y, a.obstacles, { ladders: true });
      assert.ok(path, `spawn (${s.x.toFixed(0)}, ${s.z.toFixed(0)}) has a route to ${T.name}`);
      const leg = path.find((w) => w.pad != null);
      assert.ok(leg && (leg.pad === 0 || leg.pad === 2) && Math.abs(leg.y - pads[pads[leg.pad].to].y) < 0.01, 'up through A or C, arriving on its pair');
      firstLegs[k].add(leg.pad);
      assert.equal(findPathOnGrid(grid, s.x, s.z, T.x, T.z, f0, T.y, a.obstacles, {}), null, 'and no route without the links');
    }
  }
  assert.ok(firstLegs[1].has(0) && firstLegs[3].has(2), 'the gold pair carries routes to B, the silver pair routes to the bridge');
});

test('a bot whose target stands on B: it walks to A, charges a second, and fights on B', async () => {
  const { tickBot } = await import('../src/sim/ai.js');
  const m = match(); const pads = getArenaPads('neon'); const p = m.fighters.p1, b = m.fighters.p2;
  p.pos = { x: pads[1].x, y: pads[1].y + G, z: pads[1].z - 6 }; p.floorY = p.pos.y; p.invulnerableUntil = 1e15;
  b.pos = { x: pads[0].x + 8, y: pads[0].y + G, z: pads[0].z + 10 }; b.floorY = b.pos.y; b.botControlled = true; b.targetId = 'p1'; p.targetId = 'p2';
  let now = 1000, chargeAt = null, movedAt = null;
  for (let t = 0; t < 30000 / MS && !movedAt; t += 1) {
    now += MS; m.tick = (m.tick ?? 0) + 1; tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
    if (b.padCharge != null && chargeAt == null) chargeAt = now;
    if (b.padMoves) movedAt = now;
  }
  assert.ok(chargeAt && movedAt, 'it charged and moved'); assert.ok(movedAt - chargeAt >= PAD_HOLD_MS && movedAt - chargeAt < PAD_HOLD_MS + 3 * MS, `a second's charge (${movedAt - chargeAt} ms)`);
  assert.ok(Math.abs(b.pos.y - G - pads[1].y) < 0.05, 'on B');
  for (let t = 0; t < 3000 / MS; t += 1) { now += MS; m.tick += 1; tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); assert.equal(b.botPadGoal, undefined, 'no goal left on B'); }
});

test('a bot with the goal on D: charges, and is on C after PAD_HOLD_MS', () => {
  const m = match(); const pads = getArenaPads('neon'); const b = m.fighters.p2; b.botControlled = true; stand(b, pads[3]); b.botPadGoal = 3;
  let now = 1000; for (let i = 0; i < 10; i += 1) { now += MS; tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); }
  assert.equal(b.padCharge, 3);
  for (let i = 0; i < Math.ceil(PAD_HOLD_MS / MS); i += 1) { now += MS; tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); }
  assert.ok(Math.hypot(b.pos.x - pads[2].ax, b.pos.z - pads[2].az) < PAD_CLEAR, 'on C'); assert.ok(Math.abs(b.pos.y - G - pads[2].y) < 0.05, 'on the pavement');
  assert.equal(b.botPadGoal, undefined); assert.equal(b.padMoves, 1);
});

test('a bot with the goal in the zone: charges, stands, and is on the other pad after PAD_HOLD_MS; the snapshot carries the charge', () => {
  const m = match(); const pads = getArenaPads('neon'); const b = m.fighters.p2; b.botControlled = true; stand(b, pads[1]); b.botPadGoal = 1;
  let now = 1000; for (let i = 0; i < 10; i += 1) { now += MS; tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); }
  assert.equal(b.padCharge, 1); const snap = buildSnapshotFor(m, b.team); assert.equal(snap.fighters.p2.padCharge, 1, 'own team sees it');
  for (let i = 0; i < Math.ceil(PAD_HOLD_MS / MS); i += 1) { now += MS; tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); }
  assert.ok(Math.hypot(b.pos.x - pads[0].ax, b.pos.z - pads[0].az) < PAD_CLEAR, 'on A'); assert.equal(b.botPadGoal, undefined); assert.equal(b.padMoves, 1);
});
