import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getArena, MAP_DATA } from '../src/sim/index.js';
import { buildNavGrid, serializeNavGrid, deserializeNavGrid, navDataSignature, navDataFile, NAV_ARRAYS } from '../src/sim/navgrid.js';

// THE GRID AS DATA (2026-10-25): a grid written out and read back is the built grid, field for field; a file built from
// other collision data is refused; and every grid file shipped in client/public/maps matches a fresh build of its map —
// so a map regenerated, or the grid builder changed, fails here until shared/tools/maps/navgrid_build.mjs is re-run.
const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));

function sameGrid(a, b) {
  for (const k of ['cols', 'rows', 'n', 'layers', 'minX', 'minZ', 'cell', 'N', 'jumpLinkCount', 'dropLinkCount', 'popCap']) assert.equal(b[k], a[k], k);
  // (the list form, navgrid.js compactNavGrid: the nodes' runs per cell, their floors, points and clearance, the walk and link adjacency — every array)
  for (const k of NAV_ARRAYS) {
    assert.equal(b[k].constructor, a[k].constructor, k + ' type'); assert.equal(b[k].length, a[k].length, k + ' length');
    for (let i = 0; i < a[k].length; i += 1) if (a[k][i] !== b[k][i]) assert.fail(`${k}[${i}]: ${a[k][i]} vs ${b[k][i]}`);
  }
  assert.equal(b.surfaces, a.surfaces, 'the surfaces reference');
}

test('a grid written out and read back is the built grid (Station: layers and jump links)', () => {
  const arena = getArena('station');
  const grid = buildNavGrid(arena.obstacles, arena.surfaces);
  const sig = navDataSignature(arena.obstacles, arena.surfaces);
  const bytes = serializeNavGrid(grid, sig);
  const back = deserializeNavGrid(bytes, arena.surfaces, sig);
  assert.ok(back, 'read back failed'); sameGrid(grid, back);
  assert.ok(grid.jumpLinkCount > 0, 'Station has jump links to carry');
});

test('a file built from other collision data is refused, and so is a file that is not a grid', () => {
  const arena = getArena('station'), other = getArena('factory');
  const grid = buildNavGrid(arena.obstacles, arena.surfaces);
  const bytes = serializeNavGrid(grid, navDataSignature(arena.obstacles, arena.surfaces));
  assert.equal(deserializeNavGrid(bytes, other.surfaces, navDataSignature(other.obstacles, other.surfaces)), null);
  assert.equal(deserializeNavGrid(new TextEncoder().encode('<!doctype html>'), arena.surfaces, 'x'), null);
  assert.notEqual(navDataSignature(arena.obstacles, arena.surfaces), navDataSignature(other.obstacles, other.surfaces));
});

const shipped = Object.keys(MAP_DATA).filter((k) => existsSync(path.join(PUBLIC, navDataFile(k))));
for (const mapKey of shipped) {
  test(`the shipped grid file of ${mapKey} is a fresh build of its map`, () => {
    const arena = getArena(mapKey);
    const sig = navDataSignature(arena.obstacles, arena.surfaces);
    const back = deserializeNavGrid(new Uint8Array(readFileSync(path.join(PUBLIC, navDataFile(mapKey)))), arena.surfaces, sig);
    assert.ok(back, `${navDataFile(mapKey)} was refused: built from other collision data — re-run shared/tools/maps/navgrid_build.mjs`);
    sameGrid(buildNavGrid(arena.obstacles, arena.surfaces), back);
  });
}
test('the grid files present are listed', () => { assert.ok(Array.isArray(shipped)); console.log('  grid files shipped:', shipped.join(', ') || '(none)'); });
