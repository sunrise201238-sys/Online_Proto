// The bots on the ladders (b1105b; ladder.js, navgrid.js THE LADDERS, nbrain.js THE LADDER'S GOAL, command.js; user 2026-11-05,
// "I want BOT climb the whole ladder once they decide to climb it"): the links on the grids of Compound and District, the routes
// that take a ladder and the searches that never do, the plain brain's climb up District's T1 after its route to an enemy on the
// roof, the command layer's order up a ladder on both maps, the way without one, and a bot walking through a foot zone with no
// goal, which never mounts.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../src/sim/constants.js';
import {
  createMatchState, tickMatch, emptyInput, getArena, findPathOnGrid, findHiddenSpot, groundHeightAt,
  setMoveOrder, tickCommandDriver, getCommands, ladderFootZone, ladderTopZone, ladderGrabPoint, ladderNormal, ladderExitAt, ladderOffsetAt, BOT_LOS_EYE_HEIGHT
} from '../src/sim/index.js';
import { tickBot, navGridFor, registerNavGridData } from '../src/sim/ai.js';
import { navDataFile, LADDER_LINK_REACH } from '../src/sim/navgrid.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));
// The grid as the server hands it out (ai.js navGridFor: the shipped file when it is this map's, the ladders' links attached).
function gridFor(mapKey) {
  const arena = getArena(mapKey);
  const file = PUBLIC + navDataFile(mapKey);
  if (existsSync(file)) registerNavGridData(arena, new Uint8Array(readFileSync(file)));
  return navGridFor(arena);
}
const withGauge = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };
const ladderWps = (p) => (p ?? []).filter((w) => w.ladder != null);
const feetY = (f) => f.pos.y - G;

// District's T1 (the west tower's north face): the street under it, and the roof's middle.
const T1 = { foot: { x: -111.4, z: -57.4 }, roof: { x: -75.4, z: -1.4, y: 178.68 } };
// Compound's C1: the hall floor by it, and the catwalk's exit.
const C1 = { hall: { x: -85.7, z: -42.4 }, exit: { x: -82.7, z: -58.4, y: 27.64 } };

test('every ladder is a link both ways between the node at its grab point and the node at its exit; a wall is linked along its run, up only', () => {
  for (const mapKey of ['compound', 'district']) {
    const arena = getArena(mapKey), grid = gridFor(mapKey);
    const ladders = arena.ladders.filter((L) => !L.span), walls = arena.ladders.filter((L) => L.span);
    const wallLinks = grid.ladderLinks.filter((l) => arena.ladders[l.ladder].span);
    assert.equal(grid.ladderLinks.length - wallLinks.length, 2 * ladders.length, `${mapKey}: two links per ladder`);
    walls.forEach((L) => {
      const k = arena.ladders.indexOf(L); const links = wallLinks.filter((l) => l.ladder === k); const n = ladderNormal(L);
      assert.ok(links.length >= (L.w > 100 ? 20 : 2), `${L.name}: linked along its run (${links.length})`);
      for (const l of links) {
        assert.equal(l.climb, 1, `${L.name}: up only`);
        assert.ok(ladderFootZone(L, { x: l.mx, y: L.y0 + G, z: l.mz }), `${L.name}: the mount point in the foot zone`);
        const s = ladderOffsetAt(L, { x: l.mx, z: l.mz }); const e = ladderExitAt(L, s);
        assert.ok(Math.hypot(l.x - e.x, l.z - e.z) < 1e-6 && l.y === L.ey, `${L.name}: the landing is the exit straight behind the mount point`);
        assert.ok(Math.abs(grid.floor[l.from] - L.y0) <= 2 && Math.abs(grid.floor[l.to] - L.ey) <= 2, `${L.name}: the nodes on the floors`);
        assert.ok(Math.abs((l.mx - L.x) * n.x + (l.mz - L.z) * n.z + 1) < 1e-6, `${L.name}: the mount point a metre in front of the line`);
      }
    });
    arena.ladders.forEach((L, k) => {
      if (L.span) return;
      const up = grid.ladderLinks.find((l) => l.ladder === k && l.climb > 0), down = grid.ladderLinks.find((l) => l.ladder === k && l.climb < 0);
      assert.ok(up && down, `${L.name}: both ways`);
      assert.equal(up.from, down.to); assert.equal(up.to, down.from);
      const grab = ladderGrabPoint(L);
      assert.ok(Math.abs(grid.floor[up.from] - L.y0) <= 2, `${L.name}: the foot node on the foot's floor`);
      assert.ok(Math.hypot(grid.posX[up.from] - grab.x, grid.posZ[up.from] - grab.z) <= LADDER_LINK_REACH, `${L.name}: the foot node by the grab point`);
      assert.ok(Math.abs(grid.floor[up.to] - L.ey) <= 2, `${L.name}: the exit node on the exit's floor`);
      assert.ok(Math.hypot(grid.posX[up.to] - L.ex, grid.posZ[up.to] - L.ez) <= LADDER_LINK_REACH, `${L.name}: the exit node by the exit`);
      // (the points the waypoints name are inside the zones the mount reads)
      assert.ok(ladderFootZone(L, { x: up.mx, y: L.y0 + G, z: up.mz }), `${L.name}: the grab point is in the foot zone`);
      assert.ok(ladderTopZone(L, { x: down.mx, y: L.ey + G, z: down.mz }), `${L.name}: the exit is in the top zone`);
      assert.deepEqual([up.x, up.z, up.y], [L.ex, L.ez, L.ey], `${L.name}: the up link lands on the exit`);
      assert.deepEqual([down.x, down.z, down.y], [L.x, L.z, L.y0], `${L.name}: the down link lands at the foot of the line`);
      // (the cost is the climb in cells: a tall District ladder ~48, the short ones and Compound's ~8)
      assert.ok(up.cost > 5 && up.cost < 60 && up.cost === down.cost, `${L.name}: cost ${up.cost}`);
    });
  }
});

test('a route asked for ladders climbs T1 to the roof and comes down by the drop; unasked, it takes the stairs', () => {
  const arena = getArena('district'), grid = gridFor('district');
  const up = findPathOnGrid(grid, T1.foot.x, T1.foot.z, T1.roof.x, T1.roof.z, 0, T1.roof.y, arena.obstacles, { ladders: true });
  assert.ok(up && up.length > 2, 'a route up');
  const lw = ladderWps(up);
  assert.equal(lw.length, 1, 'one ladder on the way up');
  const i = up.indexOf(lw[0]);
  assert.equal(lw[0].ladder, 0); assert.equal(lw[0].climb, 1); assert.equal(lw[0].jump, false);
  assert.ok(up[i - 1].y < 2, 'the waypoint before it is on the street');
  assert.ok(Math.hypot(up[i - 1].x - lw[0].mx, up[i - 1].z - lw[0].mz) < 8, 'and by the grab point');
  assert.ok(Math.abs(lw[0].y - T1.roof.y) < 0.5, 'the landing is on the roof');
  for (let k = i + 1; k < up.length; k += 1) assert.ok(Math.abs(up[k].y - T1.roof.y) < 1, 'the rest of the route walks the roof');
  // (the stairs exist: unasked, no ladder is in the route)
  const stairs = findPathOnGrid(grid, T1.foot.x, T1.foot.z, T1.roof.x, T1.roof.z, 0, T1.roof.y, arena.obstacles);
  assert.ok(stairs && stairs.length > up.length, 'the way without a ladder is the longer one');
  assert.equal(ladderWps(stairs).length, 0);
  // (down: the drop link off the roof wins over the climb down — user: "有邊可跳就跳下，沒有才爬下")
  const down = findPathOnGrid(grid, T1.roof.x, T1.roof.z, T1.foot.x, T1.foot.z, T1.roof.y, 0, arena.obstacles, { ladders: true });
  assert.ok(down && down.some((w) => w.jump), 'a drop on the way down');
  assert.equal(ladderWps(down).length, 0, 'no climb down where the edge can be jumped');
  // (the hide-spot search never climbs: an enemy on the roof, the hider on the street — the spot found is on the street)
  const eyes = [{ x: T1.roof.x, y: T1.roof.y + G + BOT_LOS_EYE_HEIGHT, z: T1.roof.z }];
  const hid = findHiddenSpot(grid, T1.foot.x, T1.foot.z, 0, eyes, arena.obstacles, { maxPops: 20000 });
  if (hid) { assert.equal(ladderWps(hid.path).length, 0); assert.ok((hid.path[hid.path.length - 1].y ?? 0) < 2, 'the hide stays on the street'); }
});

test('Compound: the hall to the catwalk by C1, the hatch dropped on the way back; the short District ladders link the bridge roof', () => {
  const arena = getArena('compound'), grid = gridFor('compound');
  const up = findPathOnGrid(grid, C1.hall.x, C1.hall.z, C1.exit.x, C1.exit.z, 0, C1.exit.y, arena.obstacles, { ladders: true });
  const lw = ladderWps(up);
  assert.equal(lw.length, 1); assert.equal(lw[0].climb, 1); assert.equal(up[up.length - 1], lw[0], 'the exit is the landing');
  const stairs = findPathOnGrid(grid, C1.hall.x, C1.hall.z, C1.exit.x, C1.exit.z, 0, C1.exit.y, arena.obstacles);
  assert.ok(stairs && stairs.length > up.length && ladderWps(stairs).length === 0, 'the stairs are the long way round');
  const down = findPathOnGrid(grid, C1.exit.x, C1.exit.z, C1.hall.x, C1.hall.z, C1.exit.y, 0, arena.obstacles, { ladders: true });
  assert.ok(down && down.some((w) => w.jump) && ladderWps(down).length === 0, 'down through the hatch is a drop');
  const d = getArena('district'), dg = gridFor('district');
  const S1 = d.ladders[8];
  const s = findPathOnGrid(dg, S1.x + 6, S1.z, S1.ex - 6, S1.ez, S1.y0, S1.ey, d.obstacles, { ladders: true });
  const sw = ladderWps(s);
  assert.equal(sw.length, 1); assert.equal(sw[0].ladder, 8); assert.equal(sw[0].climb, 1);
});

// THE WALLS (b1105j): a route from the track bed onto the platform climbs the platform wall where it stands; a bot on the bed
// with its enemy up on the platform climbs it and walks on; the way down is the drop off the edge, never a climb.
const BED = { x: (30.5 + 25.75) * 4, z: (100 - 35.45) * 4, y: -11.42 * 4 }, PLATFORM = { x: (23 + 25.75) * 4, z: (100 - 35.45) * 4, y: -9.30 * 4 };   // (the platform at x 23: the floor runs x 19..27 here, a pillar's bay west of it)
test('the platform wall: a route from the track bed climbs it where it stands; the way down is the drop', () => {
  const arena = getArena('district'), grid = gridFor('district');
  const W1 = arena.ladders.findIndex((L) => L.span && /platform/.test(L.name)); assert.ok(W1 >= 0);
  const up = findPathOnGrid(grid, BED.x, BED.z, PLATFORM.x, PLATFORM.z, BED.y, PLATFORM.y, arena.obstacles, { ladders: true });
  assert.ok(up && up.length > 1, 'a route up');
  const lw = ladderWps(up); assert.equal(lw.length, 1); assert.equal(lw[0].ladder, W1); assert.equal(lw[0].climb, 1);
  assert.ok(Math.abs(lw[0].z - BED.z) < 40, `the climb is near where the bot stands, not at the wall's middle (z ${(lw[0].z / 4 + 35.45).toFixed(1)} m)`);
  const plain = findPathOnGrid(grid, BED.x, BED.z, PLATFORM.x, PLATFORM.z, BED.y, PLATFORM.y, arena.obstacles);
  assert.ok(!plain || plain.length > up.length, 'without the wall the way is longer, or none');
  const down = findPathOnGrid(grid, PLATFORM.x, PLATFORM.z, BED.x, BED.z, PLATFORM.y, BED.y, arena.obstacles, { ladders: true });
  assert.ok(down && down.some((w) => w.jump) && ladderWps(down).length === 0, 'down is the drop off the edge');
});
test('a bot on the track bed with its enemy on the platform climbs the wall and stands on the platform', () => withGauge(() => {
  gridFor('district');
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2; const put = (f, at) => { f.pos.x = at.x; f.pos.z = at.z; f.pos.y = at.y + G; f.floorY = f.pos.y; f.vel.x = 0; f.vel.z = 0; f.grounded = true; f.airborne = false; };
  put(p1, BED); put(p2, { x: PLATFORM.x - 12, z: PLATFORM.z, y: PLATFORM.y }); p2.hp = 100000;
  for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
  const arena = getArena('district'); const W1 = arena.ladders.findIndex((L) => L.span && /platform/.test(L.name));
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000, mounted = null, released = null;
  for (let i = 0; i < 60 * 30; i += 1) {
    now += MS; p1.targetId = 'p2'; tickBot(m, 'p1', now); tickMatch(m, inputs, now, DT, ['p1']);
    if (p1.ladder != null && mounted == null) mounted = { ladder: p1.ladder, s: p1.ladderS, z: p1.pos.z };
    if (mounted && p1.ladder == null && released == null) { released = { y: feetY(p1), x: p1.pos.x, airborne: p1.airborne }; break; }
  }
  assert.ok(mounted && mounted.ladder === W1, `the bot mounted the platform wall: ${JSON.stringify(mounted)}`);
  assert.ok(released && !released.airborne && Math.abs(released.y - PLATFORM.y) < 0.5 && released.x < 28.33 * 4 - 25.75 * 4 + 1e-6 + 300, `released standing on the platform: ${JSON.stringify(released)}`);
}));

// A match on District with p1 driven as the server drives a bot (tickBot, then the sim's bot branch), p2 a still human.
function districtMatch(p1At, p2At) {
  gridFor('district');
  const m = createMatchState({ mapKey: 'district', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const put = (f, at) => { f.pos.x = at.x; f.pos.z = at.z; f.pos.y = (at.y ?? 0) + G; f.floorY = f.pos.y; f.vel.x = 0; f.vel.z = 0; };
  put(m.fighters.p1, p1At); put(m.fighters.p2, p2At);
  for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
  return m;
}

test('the plain brain routes to an enemy on the roof, climbs T1 the whole way and walks on from the landing', () => withGauge(() => {
  const m = districtMatch(T1.foot, T1.roof);
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p2.hp = 100000;   // (the enemy stands: the climb is the subject, not the fight)
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000, mountedAt = null, released = null, topAt = null, climbTicks = 0, letGo = false;
  for (let i = 0; i < 60 * 40; i += 1) {
    now += MS;
    p1.targetId = 'p2';
    tickBot(m, 'p1', now);
    tickMatch(m, inputs, now, DT, ['p1']);
    if (p1.ladder != null) {
      climbTicks += 1;
      if (mountedAt == null) { mountedAt = now; assert.equal(p1.ladder, 0, 'T1'); assert.equal(p1.ladderDir, 1, 'up'); }
      assert.equal(p1.action, 'climb');
    } else if (mountedAt != null && released == null) {
      released = { x: p1.pos.x, z: p1.pos.z, y: feetY(p1), airborne: p1.airborne };
      if (feetY(p1) < 100) letGo = true;
    }
    if (released && feetY(p1) > 170 && Math.hypot(p1.pos.x - T1.roof.x, p1.pos.z - T1.roof.z) < 30) { topAt = now; break; }
  }
  assert.ok(mountedAt != null, 'the bot mounted T1');
  assert.ok(released && !letGo && !released.airborne, `released standing on the roof: ${JSON.stringify(released)}`);
  assert.ok(Math.abs(released.y - T1.roof.y) < 0.5, `the landing is the roof: ${released.y}`);
  const L = getArena('district').ladders[0];
  const expect = (L.y1 - L.y0) / C.LADDER_CLIMB_SPEED / DT;
  assert.ok(climbTicks > expect * 0.9 && climbTicks < expect * 1.3, `the whole ladder: ${climbTicks} ticks on it, the climb alone ${expect.toFixed(0)}`);
  assert.ok(topAt != null, 'and walked on toward the enemy across the roof');
}));

test('an order to the roof climbs T1 and anchors there; an order for the way without a ladder takes the stairs', () => withGauge(() => {
  const m = districtMatch(T1.foot, { x: T1.foot.x + 40, z: T1.foot.z - 20 });
  m.fighters.p2.hp = 0;   // (no enemy: the order alone moves the unit)
  const p1 = m.fighters.p1;
  assert.equal(setMoveOrder(m, 'p1', T1.roof.x, T1.roof.z, T1.roof.y), true, 'the roof is reachable');
  const mv = getCommands(m, 'p1').move;
  assert.equal(mv.noLadder, false);
  assert.equal(ladderWps(mv.path).length, 1, 'the order climbs');
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000, mounted = false, anchoredAt = null;
  for (let i = 0; i < 60 * 40; i += 1) {
    now += MS;
    tickBot(m, 'p1', now);
    tickCommandDriver(m, 'p1', now);
    tickMatch(m, inputs, now, DT, ['p1']);
    if (p1.ladder != null) { mounted = true; assert.equal(p1.botLadderGoal, 1); }
    assert.ok(!p1.airborne || p1.pos.y < T1.roof.y, 'no jump on the roof');
    const cur = getCommands(m, 'p1').move;
    if (cur && cur.phase === 'anchor') { anchoredAt = now; break; }
  }
  assert.ok(mounted, 'the unit climbed');
  assert.ok(anchoredAt != null && Math.abs(feetY(p1) - T1.roof.y) < 1 && Math.hypot(p1.pos.x - T1.roof.x, p1.pos.z - T1.roof.z) < 12, `anchored on the roof: ${feetY(p1).toFixed(1)}`);
  assert.equal(p1.botLadderGoal, undefined, 'no goal left standing');
  // The way without a ladder.
  const m2 = districtMatch(T1.foot, { x: T1.foot.x + 40, z: T1.foot.z - 20 });
  assert.equal(setMoveOrder(m2, 'p1', T1.roof.x, T1.roof.z, T1.roof.y, { noLadder: true }), true, 'the stairs reach the roof too');
  const mv2 = getCommands(m2, 'p1').move;
  assert.equal(mv2.noLadder, true);
  assert.equal(ladderWps(mv2.path).length, 0, 'no ladder in it');
  assert.ok(mv2.path.length > mv.path.length, 'the longer way');
}));

test('Compound: an order onto the catwalk climbs C1 and stands on the exit', () => withGauge(() => {
  gridFor('compound');
  const m = createMatchState({ mapKey: 'compound', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1;
  p1.pos.x = C1.hall.x; p1.pos.z = C1.hall.z; p1.pos.y = G; p1.floorY = G;
  m.fighters.p2.hp = 0;
  for (const f of Object.values(m.fighters)) f.invulnerableUntil = 0;
  assert.equal(setMoveOrder(m, 'p1', C1.exit.x, C1.exit.z, C1.exit.y), true);
  assert.equal(ladderWps(getCommands(m, 'p1').move.path).length, 1);
  const inputs = { p1: emptyInput(), p2: emptyInput() };
  let now = 1000, mounted = false, done = null;
  for (let i = 0; i < 60 * 20; i += 1) {
    now += MS;
    tickBot(m, 'p1', now); tickCommandDriver(m, 'p1', now); tickMatch(m, inputs, now, DT, ['p1']);
    if (p1.ladder != null) mounted = true;
    const cur = getCommands(m, 'p1').move;
    if (cur && cur.phase === 'anchor') { done = now; break; }
  }
  assert.ok(mounted, 'climbed C1');
  assert.ok(done != null && Math.abs(feetY(p1) - C1.exit.y) < 1, `anchored on the catwalk: ${feetY(p1).toFixed(2)}`);
}));

test('a bot in a foot zone with no ladder on its way never mounts, and an order owns the goal over the brain', () => withGauge(() => {
  const L = getArena('district').ladders[0], grab = ladderGrabPoint(L);
  // (a) In the zone, its enemy in sight down the street: the brain's travel has no ladder in it — no goal, no mount.
  {
    const m = districtMatch({ x: grab.x, z: grab.z }, { x: grab.x, z: grab.z - 60 });
    const p1 = m.fighters.p1;
    const inputs = { p1: emptyInput(), p2: emptyInput() };
    let now = 1000, inZone = 0;
    for (let i = 0; i < 60 * 3; i += 1) {
      now += MS; p1.targetId = 'p2';
      tickBot(m, 'p1', now); tickMatch(m, inputs, now, DT, ['p1']);
      assert.equal(p1.ladder, undefined, 'never on the ladder');
      assert.equal(p1.botLadderGoal, undefined, 'no goal');
      if (ladderFootZone(L, p1.pos)) inZone += 1;
    }
    assert.ok(inZone > 0, `in the zone a while (${inZone} ticks)`);
  }
  // (b) The enemy on the roof — the brain's route would climb — but a move order stands, along the street: the driver owns
  //     the goal (cleared every tick it has no ladder leg), and the unit walks its order past the foot without mounting.
  {
    const m = districtMatch({ x: grab.x, z: grab.z }, T1.roof);
    const p1 = m.fighters.p1;
    m.fighters.p2.hp = 100000;
    assert.equal(setMoveOrder(m, 'p1', grab.x + 40, grab.z - 6, 0), true);
    assert.equal(ladderWps(getCommands(m, 'p1').move.path).length, 0);
    const inputs = { p1: emptyInput(), p2: emptyInput() };
    let now = 1000, arrived = false;
    for (let i = 0; i < 60 * 12; i += 1) {
      now += MS; p1.targetId = 'p2';
      tickBot(m, 'p1', now); tickCommandDriver(m, 'p1', now); tickMatch(m, inputs, now, DT, ['p1']);
      assert.equal(p1.ladder, undefined, 'never on the ladder under the order');
      assert.equal(p1.botLadderGoal, undefined, 'the driver cleared the goal');
      const cur = getCommands(m, 'p1').move;
      if (cur && cur.phase === 'anchor') { arrived = true; break; }
    }
    assert.ok(arrived, 'the order was walked');
  }
}));
