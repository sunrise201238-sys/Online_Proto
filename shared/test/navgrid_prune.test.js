import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGrid, attachLadderLinks, navDataSignature } from '../src/sim/navgrid.js';

// THE WAYS IN (2026-11-05, user, District: "BOT does not know the area over this area, let them know"; the pit under the
// street with no node at all): a covered walk component — one touching no node with nothing overhead — stays in the grid
// when a two-way jump link or a ladder joins it to an open one; a drop alone opens nothing. And THE HEADROOM: a level
// with a floor less than a body's height (1.1 m) over it is no level.
// The yard: a 20 by 20 m street (the implicit floor at 0) inside four walls; a deck 5 m up over its east half, so what
// lies under the deck is covered; a solid shelf under the deck, its top `shelfTop` units up, that a body reaches from
// the street only by a jump (or a ladder).
const U = 4;   // units per metre
const wall = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ, minY: -8, maxY: 60 });
const flat = (minX, maxX, minZ, maxZ, top) => ({ minX, maxX, minZ, maxZ, top, maxTop: top, type: 'flat', heightAt: () => top });
const yard = (shelfTop, extra = {}) => {
  const obstacles = [wall(-44, -40, -44, 44), wall(40, 44, -44, 44), wall(-44, 44, -44, -40), wall(-44, 44, 40, 44)];
  const surfaces = [flat(0, 40, -40, 40, 20)];   // the deck, 5 m over the east half: everything under it is covered
  if (shelfTop != null) { obstacles.push({ minX: 4, maxX: 36, minZ: -20, maxZ: 20, minY: -4, maxY: shelfTop, topBuffer: 0.8, floorTop: true }); surfaces.push(flat(4, 36, -20, 20, shelfTop)); }
  if (extra.sheet) surfaces.push(extra.sheet);
  return { obstacles, surfaces };
};
const nodesAt = (grid, top) => { let n = 0; for (let i = 0; i < grid.N; i += 1) if (Math.abs(grid.floor[i] - top) < 0.1) n += 1; return n; };

test('a covered shelf a body can hop onto and off again stays in the grid', () => {
  const { obstacles, surfaces } = yard(4.0);   // a metre up: past the step (2.6), within the jump (4.8)
  const grid = buildNavGrid(obstacles, surfaces);
  assert.ok(nodesAt(grid, 4.0) >= 70, `the shelf's nodes: ${nodesAt(grid, 4.0)} of its 80 cells`);
  assert.ok(grid.jumpLinkCount > 0, 'and two-way links join it to the street');
});

test('a covered shelf a body can only fall onto is pruned: a drop alone opens nothing', () => {
  const { obstacles, surfaces } = yard(8.0);   // 2 m up: past the jump; a body on the deck (5 m) could drop onto it
  const grid = buildNavGrid(obstacles, surfaces);
  assert.equal(nodesAt(grid, 8.0), 0);
});

test('a ladder up to the covered shelf keeps it, linked both ways', () => {
  const { obstacles, surfaces } = yard(8.0);
  // the ladder on the shelf's west face (x 4): the climb from the street, the body facing +x (yaw pi/2: the normal points into the shelf), the exit on the shelf's top
  const L = { x: 4, z: 0, yaw: Math.PI / 2, w: 2, y0: 0, y1: 8.0, ex: 6, ez: 0, ey: 8.0, name: 'test shelf ladder' };
  const grid = attachLadderLinks(buildNavGrid(obstacles, surfaces, [L]), [L]);
  assert.ok(nodesAt(grid, 8.0) >= 70, `the shelf's nodes: ${nodesAt(grid, 8.0)} of its 80 cells`);
  assert.equal(grid.ladderLinks.length, 2);
  // and the rows are part of the data signature: a ladder added is a grid file to regenerate
  assert.notEqual(navDataSignature(obstacles, surfaces, []), navDataSignature(obstacles, surfaces, [L]));
  assert.equal(navDataSignature(obstacles, surfaces), navDataSignature(obstacles, surfaces, []));
});

test('the headroom: no level under a sheet less than a body high over it, a level under a higher one', () => {
  // a sheet with no box over the open street's west half (a thin slab the collision reader kept as its top alone)
  const low = buildNavGrid(...Object.values(yard(null, { sheet: flat(-36, -4, -36, 36, 3.6) })));    // 0.9 m up: inside the body
  const high = buildNavGrid(...Object.values(yard(null, { sheet: flat(-36, -4, -36, 36, 6.0) })));   // 1.5 m up: a body stands there
  const under = (g) => { let n = 0; for (let i = 0; i < g.N; i += 1) if (g.floor[i] < 0.1 && g.posX[i] > -36 && g.posX[i] < -4 && Math.abs(g.posZ[i]) < 36) n += 1; return n; };
  assert.equal(under(low), 0);
  assert.ok(under(high) > 100, `under the higher sheet: ${under(high)}`);
});
