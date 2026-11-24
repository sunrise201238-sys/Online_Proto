// Neon, the two stairs' side fences down to their stairs (b1105lc; shared/tools/maps/neon_fence_feet.mjs; user 2026-11-24, with boxes of the fences picked on the page:
// "Seal the tiny gap at the foot of these fences so the BOT won't try to aim through them from beneath. Don't make it too complicated."), against the installed data:
// every box of the four fences has its base at the stair's floor at the box's lower end or under it — no three-cornered hole between the fence's foot and the stair —
// its top is where the reading had it, and the bots' sight test finds a unit on the stair hidden from beside the fence's foot, where it was seen under the box before.
// (What it shut was counted, not tested: the main README, b1105lc.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerGeneratedData } from '../src/sim/arena.js';
import { getArena } from '../src/sim/index.js';
import { botHasLineOfSight } from '../src/sim/nbrain.js';

const D = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../client/public/maps/neon_data.json', import.meta.url)), 'utf8'));
const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37, AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4;
// (model metres: the fence's line, its run along z, its boxes, the stair's floor along z, the side the stair lies on)
const RUNS = [
  { name: 'the bridge stair\'s east fence', x: [16.84, 17.43], z: [33.85, 45.87], n: 9, floor: (z) => 12.59 + (z - 33.85) * 0.7731, inside: -1 },
  { name: 'the bridge stair\'s west fence', x: [13.43, 14.02], z: [33.85, 45.87], n: 9, floor: (z) => 12.59 + (z - 33.85) * 0.7731, inside: 1 },
  { name: 'the tower stair\'s east fence', x: [-2.90, -2.31], z: [25.71, 29.72], n: 4, floor: (z) => 21.44 - (z - 25.71) * 1.107, inside: -1 },
  { name: 'the tower stair\'s west fence', x: [-6.31, -5.72], z: [25.71, 29.72], n: 4, floor: (z) => 21.44 - (z - 25.71) * 1.107, inside: 1 } ];
const boxesOf = (R) => D.obstacles.filter((o) => !o.noProjectile && o.topBuffer == null && Math.abs(MX(o.minX) - R.x[0]) < 0.02 && Math.abs(MX(o.maxX) - R.x[1]) < 0.02 && MZ(o.minZ) > R.z[0] - 0.02 && MZ(o.maxZ) < R.z[1] + 0.02);

test('every box of the two stairs\' fences has its base at the stair\'s floor or under it, and its top where it was', () => {
  for (const R of RUNS) { const L = boxesOf(R); assert.equal(L.length, R.n, R.name);
    for (const o of L) { const lowest = Math.min(R.floor(MZ(o.minZ)), R.floor(MZ(o.maxZ))), highest = Math.max(R.floor(MZ(o.minZ)), R.floor(MZ(o.maxZ)));
      assert.ok(o.minY / 4 <= lowest + 0.01, `${R.name}: a box's base at ${(o.minY / 4).toFixed(2)} m, the stair at ${lowest.toFixed(2)} m at its lower end`);
      assert.ok(o.minY / 4 >= lowest - 0.02, `${R.name}: a box's base is no farther down than the stair at its lower end`);
      assert.ok(Math.abs(o.maxY / 4 - (lowest + highest) / 2 - 2.611) < 0.02, `${R.name}: a box's top, 2.61 m over the fence's foot at its middle`); } } });

test('the bots\' sight test does not pass under a box of the fences from beside its foot', () => {
  registerGeneratedData('neon', D); const arena = getArena('neon'); let lines = 0;
  for (const R of RUNS) for (const o of boxesOf(R)) { const down = R.floor(MZ(o.minZ)) < R.floor(MZ(o.maxZ)) ? 1 : -1;   // (toward the box's lower end: +1 at its smaller z)
    const zLow = down > 0 ? MZ(o.minZ) + 0.12 : MZ(o.maxZ) - 0.12; const f = R.floor(zLow);
    const inX = (R.inside > 0 ? R.x[1] : R.x[0]) + R.inside * 0.35, outX = (R.inside > 0 ? R.x[0] : R.x[1]) - R.inside * 0.05;
    // (a point a hand over the stair just inside the fence, and one at the fence's outer face under where the box's base was: half a step over the floor at this end)
    const a = { x: AX(inX), y: (f + 0.34) * 4, z: AZ(zLow) }, b = { x: AX(outX), y: (f + 0.22) * 4, z: AZ(zLow) };
    assert.equal(botHasLineOfSight(a, b, arena.obstacles, arena.surfaces), false, `${R.name}: sight under the box at z ${zLow.toFixed(2)}`); lines += 1; }
  assert.equal(lines, 26); });
