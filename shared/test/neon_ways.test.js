// Neon's two ways up to the skybridge (b1105kg; shared/tools/maps/neon_ways_up.mjs; user 2026-11-22: "Use existing objects as
// materials to extend the current scaffolding structure. So the unit can walk seamlessly to the top catwalk.", with the two
// ends of each way read off the game, and of a stub of a railing at the catwalk's joint: "remove this object physically and
// visually."), their rails and the little ramp in the bridge (b1105ki; "加欄杆可以解決", "Add a little slope connecting the
// catwalk floor and the platform so the BOT knows to walk onto it.", "can you add guarding gates on this slope as well?") and
// the unseen slope at the bridge's north step (b1105kj; "add an invisible small slope at this gap edge so units can walk right
// onto the higher ground here.") and the bridge's floor carried to its side walls (b1105kl; of a bot that stood held at a window of
// the bridge: "investigate and fix without touching universal rule."), against the installed data, on the server's sim: each way walked from the user's own start
// to the user's own end with the stick alone, no tick of it in the air; out of the bridge and back in by the little ramp the
// same, and up and down the unseen slope; one walk from the first scaffold's top over the bridge to the second's; a body
// walked at a rail is held at it; the route grid has no drop from the bridge's floor over a sill, a bot in the bridge comes
// to sight of a target on the decks below, and no body stands in a wall on the floors carried to the walls; where the stub stood, a body stands. A reading of Neon's data made again from the model has
// none of this: the tool is run after it, and these fail until it has been. (The routes over the ways are asked of the route
// grid in pads.test.js, and there a bot moved onto the tower top stays up there.)
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, unitOverlapsObstacle } from '../src/sim/index.js';
import { tickBot, navGridFor, botHasLineOfSight } from '../src/sim/ai.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS, R = C.FIGHTER_RADIUS / 4;
const AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4;   // (Neon: the model's metres to the arena's units — the client's GLB_MAPS line)
// A body set down at a place (model metres, the feet's height over the street) and walked from point to point, the stick
// straight at each: where it ends, and how many ticks of the walk it was in the air (`go`); or walked at a point for a time,
// whatever stands in the way (`push`).
function walker(start) {
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, e = m.fighters.p2;
  for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
  e.pos = { x: -200, y: G, z: 0 }; e.floorY = G;   // (the other body far off)
  f.pos = { x: AX(start[0]), y: start[2] * 4 + G, z: AZ(start[1]) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
  let now = 1000;
  const at = () => ({ x: f.pos.x / 4 - 12.44, z: f.pos.z / 4 + 40.37, feet: (f.pos.y - G) / 4 });
  const step = (tx, tz) => { const dx = AX(tx) - f.pos.x, dz = AZ(tz) - f.pos.z, d = Math.hypot(dx, dz) || 1; now += MS; tickMatch(m, { p1: { ...emptyInput(), moveX: dx / d, moveZ: dz / d } }, now, DT); return f.airborne ? 1 : 0; };
  const go = (points) => {
    let air = 0;
    for (const [tx, tz] of points) {
      for (let n = 0; ; n += 1) {
        if (Math.hypot(AX(tx) - f.pos.x, AZ(tz) - f.pos.z) < 1) break;
        assert.ok(n < 60 * 30, `the walk comes to (${tx}, ${tz}); it is at (${at().x.toFixed(2)}, ${at().z.toFixed(2)}) feet ${at().feet.toFixed(2)}`);
        air += step(tx, tz);
      }
    }
    return { ...at(), air };
  };
  const push = (tx, tz, ticks = 180) => { for (let n = 0; n < ticks; n += 1) step(tx, tz); return at(); };
  return { go, push, at };
}

test('the north way: from the first scaffold\'s top, up two ramps and a landing, onto the strip at the bridge\'s north end — walked, never in the air', () => {
  const w = walker([-7.92, 24.15, 12.585]);   // (the user's start: "x -7.92 z 24.15 feet 12.59 m")
  const landing = w.go([[-8.3, 31.7]]);
  assert.ok(Math.abs(landing.feet - 17.014) < 0.02 && landing.air === 0, `up the first ramp to the landing: feet ${landing.feet.toFixed(2)}, ${landing.air} ticks in the air`);
  const top = w.go([[-4.3, 31.7], [-4.3, 24.6], [-5.87, 23.57]]);   // (the user's end: "x -5.87 z 23.57 feet 21.24 m" — the way's platform lies on the strip there, 0.2 m thick)
  assert.ok(Math.abs(top.feet - 21.443) < 0.02 && top.air === 0, `up the second ramp, between its rails, to the platform on the strip: feet ${top.feet.toFixed(2)}, ${top.air} ticks in the air`);
  const strip = w.go([[-4.3, 22.0]]);
  assert.ok(Math.abs(strip.feet - 21.24) < 0.02, `and off the platform's north edge onto the strip itself: feet ${strip.feet.toFixed(2)}`);
});

test('the south way: from the second scaffold\'s top, up three ramps and along the walkway to the last east window\'s sill, and down the little ramp into the bridge — walked, never in the air', () => {
  const w = walker([16.01, 31.64, 12.585]);   // (the user's start: "x 16.01 z 31.64 feet 12.59 m")
  const walkway = w.go([[15.4, 32.6], [15.4, 47.2]]);
  assert.ok(Math.abs(walkway.feet - 21.88) < 0.02 && walkway.air === 0, `up the three ramps, between their rails, onto the walkway: feet ${walkway.feet.toFixed(2)}, ${walkway.air} ticks in the air`);
  const sill = w.go([[15.4, 55.75], [10.0, 55.75], [8.53, 57.10]]);   // (the user's end: "x 8.53 z 57.10 feet 21.80 m")
  assert.ok(Math.abs(sill.feet - 21.80) < 0.02 && sill.air === 0, `along the walkway and west onto the sill: feet ${sill.feet.toFixed(2)}, ${sill.air} ticks in the air`);
  const bridge = w.go([[5.0, 57.1]]);
  assert.ok(Math.abs(bridge.feet - 20.235) < 0.02 && bridge.air === 0, `and through the window down the little ramp onto the bridge's floor: feet ${bridge.feet.toFixed(2)}, ${bridge.air} ticks in the air`);
});

test('out of the bridge: from pad D up the little ramp, over the sill and onto the walkway — walked, never in the air (until b1105ki a jump of 1.57 m)', () => {
  const w = walker([4.07, 56.40, 20.235]);   // (pad D's own place on the bridge's floor)
  const sill = w.go([[5.6, 56.6], [8.4, 56.6]]);
  assert.ok(Math.abs(sill.feet - 21.80) < 0.02 && sill.air === 0, `up the little ramp onto the sill: feet ${sill.feet.toFixed(2)}, ${sill.air} ticks in the air`);
  const walkway = w.go([[10.5, 55.9], [15.4, 55.75]]);
  assert.ok(Math.abs(walkway.feet - 21.88) < 0.02 && walkway.air === 0, `and out onto the walkway: feet ${walkway.feet.toFixed(2)}, ${walkway.air} ticks in the air`);
  // a body on the bridge's floor walked at the little ramp's side: held where the ramp stands over a step's height, up onto it where it does not
  const high = walker([7.6, 54.6, 20.235]).push(7.6, 57.0);
  assert.ok(Math.abs(high.feet - 20.235) < 0.02 && high.z < 55.49 - R + 0.03, `at the ramp's high side it is held (z ${high.z.toFixed(2)}, feet ${high.feet.toFixed(2)})`);
  const low = walker([6.2, 54.6, 20.235]).go([[6.2, 56.6]]);
  assert.ok(low.feet > 20.3 && low.feet < 20.6, `at its low side it steps onto the ramp (feet ${low.feet.toFixed(2)})`);
});

test('the rails: a body walked at a side of the north way\'s upper ramp, of the platform where it hangs over the air, or of the south way\'s slope is held at the rail; where the platform lies on the strip it steps off', () => {
  // (a rail's inner face and a body's radius: the upper ramp's and the platform's rails at x -2.903 and -5.723, the south slope's at x 16.843 and 14.023)
  for (const [name, start, east, west] of [['the north way\'s upper ramp', [-4.3, 27.7, 19.243], -2.903, -5.723], ['the platform over the air', [-4.3, 25.0, 21.443], -2.903, -5.723], ['the south way\'s slope', [15.4, 40.0, 17.340], 16.843, 14.023]]) {
    const e = walker(start).push(start[0] + 6, start[1]), w = walker(start).push(start[0] - 6, start[1]);
    assert.ok(Math.abs(e.x - (east - R)) < 0.02 && Math.abs(e.feet - start[2]) < 0.03, `${name}, east: held at x ${e.x.toFixed(2)}, feet ${e.feet.toFixed(2)}`);
    assert.ok(Math.abs(w.x - (west + R)) < 0.02 && Math.abs(w.feet - start[2]) < 0.03, `${name}, west: held at x ${w.x.toFixed(2)}, feet ${w.feet.toFixed(2)}`);
  }
  const off = walker([-4.3, 23.6, 21.443]).go([[-0.6, 23.6]]);
  assert.ok(Math.abs(off.feet - 21.24) < 0.02, `off the platform's east side onto the strip, toward the bridge: feet ${off.feet.toFixed(2)}`);
});

test('the unseen slope at the bridge\'s north step: from the bridge\'s floor up onto the strip and back down — walked, never in the air (until b1105kj held at the step\'s face, 0.95 m high, and a fall off it)', () => {
  const FLOOR = 20.285, STRIP = 21.2375, FACE = 24.62, LONG = 1.25;   // (the bridge's floor at its north end and the strip's top, as the data has them; the step's face; the slope's length)
  for (const [name, x] of [['by the west wall', 1.2], ['where the user stood', 4.83], ['by the east wall', 7.7]]) {   // (the user: "x 4.83 z 24.91 feet 20.29 m", against the face)
    const w = walker([x, 28.0, FLOOR]);
    const up = w.go([[x, 22.5]]);
    assert.ok(Math.abs(up.feet - STRIP) < 0.02 && up.air === 0, `${name}, north onto the strip: feet ${up.feet.toFixed(2)} at z ${up.z.toFixed(2)}, ${up.air} ticks in the air`);
    const down = w.go([[x, 28.0]]);
    assert.ok(Math.abs(down.feet - FLOOR) < 0.02 && down.air === 0, `${name}, south onto the bridge's floor: feet ${down.feet.toFixed(2)} at z ${down.z.toFixed(2)}, ${down.air} ticks in the air`);
  }
  // on it a body stands on the slope itself — over the floor the picture shows, by as much as the slope has risen
  const mid = walker([4.83, 28.0, FLOOR]).go([[4.83, FACE + LONG / 2 - 0.2]]);
  assert.ok(mid.z > FACE && mid.z < FACE + LONG && Math.abs(mid.feet - (STRIP - (mid.z - FACE) * (STRIP - FLOOR) / LONG)) < 0.02 && mid.feet > FLOOR + 0.3, `half way up: feet ${mid.feet.toFixed(2)} at z ${mid.z.toFixed(2)}`);
});

test('one walk from the first scaffold\'s top to the second\'s and back, the stick alone, no jump: the north way, the strip, the unseen slope, the bridge, the little ramp, the south way', () => {
  // (a walk with no jump, not one with no tick in the air: the platform lies 0.2 m over the strip, the bridge's floor has three sills 0.27 m high across it, and down the north way a body leaves each ramp's top for 0.4 s)
  const there = [[-8.3, 31.7], [-4.3, 31.7], [-4.3, 23.6], [-2.0, 22.9], [3.0, 22.9], [3.0, 27.0], [3.0, 54.5], [5.6, 56.6], [8.4, 56.6], [10.5, 55.9], [15.4, 55.75], [15.4, 47.2], [15.4, 32.6], [16.01, 31.64]];   // (east along the strip at z 22.9: between the slanted panel's foot and the post at the bridge's north-west corner)
  const w = walker([-7.92, 24.15, 12.585]);
  const strip = w.go(there.slice(0, 5));
  assert.ok(Math.abs(strip.feet - 21.2375) < 0.02, `up the north way and east along the strip to the bridge's end: feet ${strip.feet.toFixed(2)}`);
  const bridge = w.go(there.slice(5, 8));
  assert.ok(Math.abs(bridge.feet - 20.235) < 0.02, `down the unseen slope and south through the bridge to the little ramp's foot: feet ${bridge.feet.toFixed(2)}`);
  const top = w.go(there.slice(8));
  assert.ok(Math.abs(top.feet - 12.585) < 0.02, `up the little ramp, out by the window and down the south way to the second scaffold's top: feet ${top.feet.toFixed(2)}`);
  const back = w.go([...there.slice(0, -1).reverse(), [-7.92, 24.15]]);
  assert.ok(Math.abs(back.feet - 12.585) < 0.02 && Math.hypot(back.x + 7.92, back.z - 24.15) < 0.3, `and the same way back to the first scaffold's top: (${back.x.toFixed(2)}, ${back.z.toFixed(2)}) feet ${back.feet.toFixed(2)}`);
});

// THE BRIDGE'S FLOOR CARRIED TO ITS SIDE WALLS (b1105kl). The floor in the data stopped a quarter metre short of each side wall; the
// route grid's walk test, which looks at floors alone, walked past its edge and fell to what lies under the wall, and — a sill
// being a lip a jump hops — the grid had 42 drops from the bridge's floor over its sills. A bot sent down one stood at the sill
// (the route's hop mark is lost where the route is cut at the drop's landing) or hopped onto it and turned back in (the landing
// is under the sill, reached in the plan from on top of it): the bots' own rules, on every map, and not touched. The floor is
// carried on as far as the walk test goes — across the gap to the east wall, across the gap and under the west wall where its
// sill's floor lies over it, a hair of it on the grid's one line across that wall's north end — the walk test stays on it, and
// the grid has no such drop.
test('the bridge\'s floor is carried to its side walls: the route grid has no link from the bridge\'s floor, or from a slope on it, down past a sill', () => {
  const grid = navGridFor(getArena('neon')); let nodes = 0; const down = [];
  for (let i = 0; i < grid.N; i += 1) {
    const x = grid.posX[i] / 4 - 12.44, z = grid.posZ[i] / 4 + 40.37, f = grid.floor[i] / 4;
    if (x < 0.8 || x > 8.1 || z < 24.6 || z > 59.2 || f < 20.2 || f > 21.3) continue;   // (inside the bridge: its floor and ribs, the unseen slope, the little ramp's lower part — not the sills, 21.80 m)
    nodes += 1;
    for (let k = grid.linkStart[i]; k < grid.linkStart[i + 1]; k += 1) { const j = grid.linkAdj[k]; if (grid.floor[j] < grid.floor[i] - 12) down.push(`(${x.toFixed(2)}, ${z.toFixed(2)} | ${f.toFixed(2)}) to (${(grid.posX[j] / 4 - 12.44).toFixed(2)}, ${(grid.posZ[j] / 4 + 40.37).toFixed(2)} | ${(grid.floor[j] / 4).toFixed(2)})`); }
  }
  assert.ok(nodes > 150, `the bridge's floor has its nodes (${nodes})`);
  assert.equal(down.length, 0, `links from the bridge's floor to a floor more than 3 m under it: ${down.slice(0, 4).join('; ')}`);
});

test('a bot in the bridge comes to sight of a target that stands on the decks below — beside the bridge, where the user\'s bot stood held at the west window, and under it', () => {
  const a = getArena('neon'); const EYE = C.BOT_LOS_EYE_HEIGHT;
  // (the bot's place in the bridge and its target's on the 8.63 m decks, model metres; each run was "never" in thirty seconds before b1105kl)
  for (const [name, B0, T0] of [['beside the bridge, under the strip (the user\'s case)', [4.5, 28.0, 20.285], [-2.0, 24.5, 8.63]], ['under the bridge', [4.5, 40.0, 20.235], [6.06, 33.87, 8.63]]]) {
    const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
    const p = m.fighters.p1, b = m.fighters.p2; for (const q of [p, b]) { q.hp = 1e9; q.invulnerableUntil = 0; }
    p.pos = { x: AX(T0[0]), y: T0[2] * 4 + G, z: AZ(T0[1]) }; p.floorY = p.pos.y; const p0 = { ...p.pos };
    b.pos = { x: AX(B0[0]), y: B0[2] * 4 + G, z: AZ(B0[1]) }; b.floorY = b.pos.y; b.botControlled = true; b.targetId = 'p1'; p.targetId = 'p2';
    let now = 1000, seen = null;
    for (let t = 0; t < 15000 / MS && seen == null; t += 1) {
      now += MS; m.tick = (m.tick ?? 0) + 1; tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
      p.pos.x = p0.x; p.pos.y = p0.y; p.pos.z = p0.z; p.vel.x = p.vel.y = p.vel.z = 0; p.airborne = false; p.grounded = true;   // (the target stands still)
      if (botHasLineOfSight({ x: b.pos.x, y: b.pos.y + EYE, z: b.pos.z }, { x: p.pos.x, y: p.pos.y + EYE, z: p.pos.z }, a.obstacles, a.surfaces)) seen = (now - 1000) / 1000;
    }
    assert.ok(seen != null, `${name}: no sight of the target in 15 s; the bot stands at (${(b.pos.x / 4 - 12.44).toFixed(1)}, ${(b.pos.z / 4 + 40.37).toFixed(1)}) feet ${((b.pos.y - G) / 4).toFixed(1)} m`);
  }
});

// And what those floors must not be: a floor a body comes down onto inside a wall. The PT site's b1105kk had them under the whole
// of both walls, end to end; at a wall's end, where its top has no sill floor, a body did — walked north off the west sill's end it
// stood in the wall at the bridge's floor's height, where it had fallen outside onto the scaffold's deck before. Here a body does
// there what it did before the floors were laid.
test('the floors carried to the walls are no floor for a body: one that walks north off the west sill\'s end falls outside onto the deck, and one let down onto a wall anywhere along it does not come to stand in the wall', () => {
  const off = walker([0.5, 25.5, 21.8025]).push(0.5, 10, 240);   // (the west sill's floor ends half a metre short of the corner pillar)
  assert.ok(Math.abs(off.feet - 8.64) < 0.03, `off the west sill's north end the body is down on the 8.64 m deck: (${off.x.toFixed(2)}, ${off.z.toFixed(2)}) feet ${off.feet.toFixed(2)}`);
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const f = m.fighters.p1, e = m.fighters.p2; const blank = JSON.stringify(f);
  let now = 1000; const inWall = [];
  for (const [x0, x1] of [[0.06, 0.81], [8.06, 8.81]]) for (const dx of [0.2, 0.375, 0.55]) for (let z = 24.45; z <= 58.45; z += 0.15) {
    const o = JSON.parse(blank); for (const k of Object.keys(f)) delete f[k]; Object.assign(f, o); for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; } e.pos = { x: -200, y: G, z: 0 }; e.floorY = G;
    f.pos = { x: AX(x0 + dx), y: 22.4 * 4 + G, z: AZ(z) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = true; f.grounded = false; f.floorY = G;
    for (let t = 0; t < 90; t += 1) { now += MS; tickMatch(m, { p1: emptyInput() }, now, DT); }
    const x = f.pos.x / 4 - 12.44, feet = (f.pos.y - G) / 4;
    if (x > x0 && x < x1 && Math.abs(feet - 20.235) < 0.3) inWall.push(`(${x.toFixed(2)}, ${(f.pos.z / 4 + 40.37).toFixed(2)}) feet ${feet.toFixed(2)}`);
  }
  assert.equal(inWall.length, 0, `bodies that came to stand in a wall at the bridge's floor's height: ${inWall.slice(0, 4).join('; ')}`);
});

test('the stub of a railing at the catwalk\'s joint is gone: a body stands where it stood', () => {
  const a = getArena('neon'); const x = AX(5.81), z = AZ(33.74);   // (its panel's box was model x 5.56..6.06, z 33.37..34.10, from 8.75 m to 11.25 m)
  const floor = groundHeightAt(x, z, a.surfaces, 8.64 * 4 + 0.5);
  assert.ok(Math.abs(floor / 4 - 8.64) < 0.02, `the walkway's floor there: ${(floor / 4).toFixed(2)} m`);
  assert.ok(!unitOverlapsObstacle(x, floor + G, z, a.obstacles), 'no box holds a body on it');
});
