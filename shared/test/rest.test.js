// A body never rests in a box (rest_free, b1022e): dropped into a slot narrower than itself, the resolver puts it back
// where the tick began instead of leaving it wedged; a body already in a box when the tick began keeps the old pushes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUnitObstacleCollisions, unitOverlapsObstacle } from '../src/sim/physics.js';
import { FIGHTER_RADIUS, GROUND_BASE_Y } from '../src/sim/constants.js';

// two things a unit apart (a body is 2.3 wide), 1.1 m tall, passable over (low cover), and a wall of thin boxes behind
const slot = [
  { minX: -4, maxX: -0.5, minZ: -3, maxZ: 3, minY: 0, maxY: 4, topBuffer: 0.8 },
  { minX: 0.5, maxX: 1.5, minZ: -3, maxZ: 3, minY: 0, maxY: 4.4, topBuffer: 0.8 },
  { minX: 1.5, maxX: 2.5, minZ: -3, maxZ: 3, minY: 0, maxY: 100 },
  { minX: 2.5, maxX: 3.5, minZ: -4, maxZ: 2, minY: 0, maxY: 100 },
];
const body = (x, y, z) => ({ pos: { x, y: GROUND_BASE_Y + y, z }, vel: { x: 0, y: 0, z: 0 } });

test('a body coming down into a slot narrower than itself goes back to where the tick began', () => {
  const f = body(0, 2.2, 0);   // (its feet 2.2 over the floor: both things hold it now; a tick ago, at 2.8, the lower one did not)
  const prev = { x: 0, y: GROUND_BASE_Y + 2.8, z: 0 };
  assert.equal(unitOverlapsObstacle(prev.x, prev.y, prev.z, slot, FIGHTER_RADIUS - 0.05), false, 'where the tick began is clear');
  resolveUnitObstacleCollisions(f, prev, slot);
  assert.deepEqual(f.pos, prev, 'put back where the tick began');
  assert.equal(unitOverlapsObstacle(f.pos.x, f.pos.y, f.pos.z, slot, FIGHTER_RADIUS - 0.05), false, 'and so not in a box');
});

test('a body already in a box when the tick began keeps the pushes', () => {
  const f = body(0, 0, 0); const prev = { x: 0, y: GROUND_BASE_Y, z: 0 };
  resolveUnitObstacleCollisions(f, prev, slot);
  assert.notDeepEqual(f.pos, prev, 'moved by the pushes, not put back');
});

test('a body pushed clean off one face is not put back', () => {
  const f = body(-4 - FIGHTER_RADIUS + 0.2, 0, 0);   // (a step into the first thing's west face, from the open floor)
  const prev = { x: -4 - FIGHTER_RADIUS, y: GROUND_BASE_Y, z: 0 };
  resolveUnitObstacleCollisions(f, prev, slot);
  assert.ok(Math.abs(f.pos.x - (-4 - FIGHTER_RADIUS)) < 1e-9, 'stands a radius off the face');
});
