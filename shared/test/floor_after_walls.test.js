import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateHorizontal, integrateVertical, resolveUnitObstacleCollisions, GROUND_BASE_Y } from '../src/sim/index.js';

// A body walking into the wall at a floor's edge stays on the floor: the walls push it back before the floor is read
// (b1022x). Read first, the floor under the spot inside the wall was none, and the body sank a hair every tick.
test('a body held at a wall by a floor edge stays on the floor', () => {
  const surfaces = [{ minX: 0, maxX: 20, minZ: 0, maxZ: 10, maxTop: 5, type: 'flat', top: 5, heightAt: () => 5 }];
  const obstacles = [{ minX: 0, maxX: 20, minZ: 10, maxZ: 14, minY: 0, maxY: 12, topBuffer: 0.8 }];   // (a higher piece beyond the edge, no floor on it a step away)
  const f = { pos: { x: 10, y: GROUND_BASE_Y + 5, z: 9.3 }, vel: { x: 0, y: 0, z: 20 }, airborne: false, grounded: true, jumpVelocity: 0 };
  for (let t = 0; t < 60; t += 1) {
    const prev = { x: f.pos.x, y: f.pos.y, z: f.pos.z };
    integrateHorizontal(f, 1 / 60);
    resolveUnitObstacleCollisions(f, prev, obstacles);
    f.vel.z = 20;   // (the push zeroes the velocity; the input keeps walking into the wall)
    integrateVertical(f, surfaces, 1 / 60);
  }
  assert.equal(f.airborne, false);
  assert.ok(Math.abs(f.pos.y - (GROUND_BASE_Y + 5)) < 1e-9, `feet ${f.pos.y - GROUND_BASE_Y}`);
  assert.ok(f.pos.z < 10, `held at the wall: z ${f.pos.z}`);
});
