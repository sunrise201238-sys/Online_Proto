import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getArena, hasGeneratedData, registerGeneratedData, dropGeneratedData, generatedDataFile, FILE_DATA_MAPS } from '../src/sim/index.js';

// A MAP'S FILE DATA LET GO AGAIN (b1105im; the client's ONE MAP IN HAND, main.js): the client holds one modelled map at a time and lets
// another's data go with its model (dropGeneratedData). A map let go asks to be read again, and read again it builds the arena it built
// before; a map whose data came with the bundle can never be read again, so it is never let go.
const PUBLIC = fileURLToPath(new URL('../../client/public/', import.meta.url));
const shape = (a) => [a.obstacles.length, a.surfaces.length, (a.ladders ?? []).length, (a.pads ?? []).length, JSON.stringify(a.obstacles[0]), JSON.stringify(a.obstacles[a.obstacles.length - 1]), JSON.stringify(a.spawns)];

test("every file map's data is let go and read again: the arena built anew is the one built before", () => {
  for (const k of FILE_DATA_MAPS) {
    const before = getArena(k); const was = shape(before);
    assert.equal(dropGeneratedData(k), true, k);
    assert.equal(hasGeneratedData(k), false, k);
    assert.throws(() => getArena(k), /not loaded/, k);
    assert.equal(dropGeneratedData(k), false, `${k}: nothing left to let go`);
    registerGeneratedData(k, JSON.parse(readFileSync(PUBLIC + generatedDataFile(k), 'utf8')));
    const again = getArena(k);
    assert.notEqual(again, before, `${k}: a new arena, built from the data read again`);
    assert.deepEqual(shape(again), was, k);
  }
});

test('a map whose data is not a file is never let go', () => {
  for (const k of ['arena1', 'arena2', 'station', 'backrooms']) {
    assert.equal(FILE_DATA_MAPS.includes(k), false, k);
    const a = getArena(k);
    assert.equal(dropGeneratedData(k), false, k);
    assert.equal(getArena(k), a, k);
  }
});
