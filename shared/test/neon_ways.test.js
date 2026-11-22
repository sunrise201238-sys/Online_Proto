// Neon's two ways up to the skybridge (b1105kg; shared/tools/maps/neon_ways_up.mjs; user 2026-11-22: "Use existing objects as
// materials to extend the current scaffolding structure. So the unit can walk seamlessly to the top catwalk.", with the two
// ends of each way read off the game, and of a stub of a railing at the catwalk's joint: "remove this object physically and
// visually."), against the installed data, on the server's sim: each way walked from the user's own start to the user's own
// end with the stick alone, no tick of it in the air; where the stub stood, a body stands. A reading of Neon's data made again
// from the model has neither the ways' floors nor the bridge's floor under the window: the tool is run after it, and these
// fail until it has been. (The routes over the ways are asked of the route grid in pads.test.js.)
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, unitOverlapsObstacle } from '../src/sim/index.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4;   // (Neon: the model's metres to the arena's units — the client's GLB_MAPS line)
// A body set down at a place (model metres, the feet's height over the street) and walked from point to point, the stick
// straight at each: where it ends, and how many ticks of the walk it was in the air.
function walker(start) {
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, e = m.fighters.p2;
  for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
  e.pos = { x: -200, y: G, z: 0 }; e.floorY = G;   // (the other body far off)
  f.pos = { x: AX(start[0]), y: start[2] * 4 + G, z: AZ(start[1]) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
  let now = 1000;
  const at = () => ({ x: f.pos.x / 4 - 12.44, z: f.pos.z / 4 + 40.37, feet: (f.pos.y - G) / 4 });
  const go = (points) => {
    let air = 0;
    for (const [tx, tz] of points) {
      for (let n = 0; ; n += 1) {
        const dx = AX(tx) - f.pos.x, dz = AZ(tz) - f.pos.z, d = Math.hypot(dx, dz);
        if (d < 1) break;
        assert.ok(n < 60 * 30, `the walk comes to (${tx}, ${tz}); it is at (${at().x.toFixed(2)}, ${at().z.toFixed(2)}) feet ${at().feet.toFixed(2)}`);
        now += MS; tickMatch(m, { p1: { ...emptyInput(), moveX: dx / d, moveZ: dz / d } }, now, DT);
        if (f.airborne) air += 1;
      }
    }
    return { ...at(), air };
  };
  return { go, at };
}

test('the north way: from the first scaffold\'s top, up two ramps and a landing, onto the strip at the bridge\'s north end — walked, never in the air', () => {
  const w = walker([-7.92, 24.15, 12.585]);   // (the user's start: "x -7.92 z 24.15 feet 12.59 m")
  const landing = w.go([[-8.3, 31.7]]);
  assert.ok(Math.abs(landing.feet - 17.014) < 0.02 && landing.air === 0, `up the first ramp to the landing: feet ${landing.feet.toFixed(2)}, ${landing.air} ticks in the air`);
  const top = w.go([[-4.3, 31.7], [-4.3, 24.6], [-5.87, 23.57]]);   // (the user's end: "x -5.87 z 23.57 feet 21.24 m" — the way's platform lies on the strip there, 0.2 m thick)
  assert.ok(Math.abs(top.feet - 21.443) < 0.02 && top.air === 0, `up the second ramp to the platform on the strip: feet ${top.feet.toFixed(2)}, ${top.air} ticks in the air`);
  const strip = w.go([[-4.3, 22.0]]);
  assert.ok(Math.abs(strip.feet - 21.24) < 0.02, `and off the platform's north edge onto the strip itself: feet ${strip.feet.toFixed(2)}`);
});

test('the south way: from the second scaffold\'s top, up three ramps and along the walkway to the last east window\'s sill — walked, never in the air — and down into the bridge', () => {
  const w = walker([16.01, 31.64, 12.585]);   // (the user's start: "x 16.01 z 31.64 feet 12.59 m")
  const walkway = w.go([[15.4, 32.6], [15.4, 47.2]]);
  assert.ok(Math.abs(walkway.feet - 21.88) < 0.02 && walkway.air === 0, `up the three ramps onto the walkway: feet ${walkway.feet.toFixed(2)}, ${walkway.air} ticks in the air`);
  const sill = w.go([[15.4, 55.75], [10.0, 55.75], [8.53, 57.10]]);   // (the user's end: "x 8.53 z 57.10 feet 21.80 m")
  assert.ok(Math.abs(sill.feet - 21.80) < 0.02 && sill.air === 0, `along the walkway and west onto the sill: feet ${sill.feet.toFixed(2)}, ${sill.air} ticks in the air`);
  const bridge = w.go([[5.0, 57.1]]);
  assert.ok(Math.abs(bridge.feet - 20.235) < 0.02, `and through the window onto the bridge's floor: feet ${bridge.feet.toFixed(2)}`);
});

test('the stub of a railing at the catwalk\'s joint is gone: a body stands where it stood', () => {
  const a = getArena('neon'); const x = AX(5.81), z = AZ(33.74);   // (its panel's box was model x 5.56..6.06, z 33.37..34.10, from 8.75 m to 11.25 m)
  const floor = groundHeightAt(x, z, a.surfaces, 8.64 * 4 + 0.5);
  assert.ok(Math.abs(floor / 4 - 8.64) < 0.02, `the walkway's floor there: ${(floor / 4).toFixed(2)} m`);
  assert.ok(!unitOverlapsObstacle(x, floor + G, z, a.obstacles), 'no box holds a body on it');
});
