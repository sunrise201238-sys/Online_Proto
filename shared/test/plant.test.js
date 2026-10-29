import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, TICK_RATE_MS, TICK_DT, GROUND_BASE_Y, LAND_PLANT_MS } from '../src/sim/index.js';

// The landing plant (user 2026-10-22, "make the containers standable"): a body that lands on a thing's lid at another
// level than the floor it left is held where it landed — momentum dropped, the held stick ignored — until the stick is
// let go or LAND_PLANT_MS pass. The Warehouse's north-west stack (a crate top at 3.19 m) and the 2.5 m container south
// of it, 2.4 m deep: a sprint-jump from the crate onto the container with the stick held crossed the roof and fell off
// its far side (the user's clip).
const CX = 5, CZ = 8;   // (Warehouse: model metres to units)
const U = (xm, zm) => [(xm - CX) * 4, (zm - CZ) * 4];
const ticks = (ms) => Math.round(ms / TICK_RATE_MS);
function run(startM, dir, { sprint = true, jumpAt = 300, releaseAt = Infinity, ms = 3000 } = {}) {
  const a = getArena('warehouse'); const [X, Z] = U(...startM);
  let top = 0; for (const o of a.obstacles) if (o.topBuffer != null && X >= o.minX && X <= o.maxX && Z >= o.minZ && Z <= o.maxZ && o.maxY > top && o.maxY < 40) top = o.maxY;
  const m = createMatchState({ mapKey: 'warehouse', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p2.pos.x = X + dir[0] * 300; p2.pos.z = Z + dir[1] * 300; p1.pos.x = X; p1.pos.z = Z; p1.pos.y = GROUND_BASE_Y + top; p1.boost = 250;
  const trace = []; let now = 1000;
  for (let t = 0; t <= ms; t += TICK_RATE_MS) {
    const inp = emptyInput(); const held = t < releaseAt; inp.moveX = held ? dir[0] : 0; inp.moveZ = held ? dir[1] : 0; inp.boost = held && sprint; inp.jump = t >= jumpAt && t < jumpAt + 2 * TICK_RATE_MS;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT, []); now += TICK_RATE_MS;
    const feet = p1.pos.y - GROUND_BASE_Y; trace.push({ t, x: p1.pos.x, z: p1.pos.z, feet, floor: groundHeightAt(p1.pos.x, p1.pos.z, a.surfaces, feet), air: p1.airborne });
  }
  return { trace, top };
}
const CRATE = [-7.2, 7.9], SOUTH = [0, 1];   // (the crate's top is 3.19 m; the container's roof, 2.5 m, lies at z 10.4..12.9)
const ROOF = 10, onRoof = (s) => Math.abs(s.feet - ROOF) < 0.05 && Math.abs(s.floor - ROOF) < 0.05 && !s.air;
const landing = (trace) => trace.findIndex((s, i) => i > 0 && trace[i - 1].air && !s.air);

test('a sprint-jump from the crate down onto the container, the stick held: planted on the roof, then walks on', () => {
  const { trace, top } = run(CRATE, SOUTH);
  assert.ok(Math.abs(top - 12.76) < 0.1, 'the crate top is 3.19 m: ' + top);
  const i = trace.findIndex(onRoof); assert.ok(i > 0, 'never landed on the roof');
  const held = trace.slice(i, i + ticks(LAND_PLANT_MS) - 2);
  assert.ok(held.every(onRoof), 'left the roof within the plant');
  const zs = held.map((s) => s.z); assert.ok(Math.max(...zs) - Math.min(...zs) < 0.5, 'slid on the roof while planted: ' + (Math.max(...zs) - Math.min(...zs)).toFixed(2));
  const after = trace.slice(i + ticks(LAND_PLANT_MS + 400));
  assert.ok(after.some((s) => s.z > trace[i].z + 4), 'never walked on after the plant (the stick is still held)');
});

test('the stick let go while planted: the body stays on the roof', () => {
  const { trace } = run(CRATE, SOUTH, { releaseAt: 700 });   // (let go a tenth of a second after landing)
  assert.ok(trace.findIndex(onRoof) > 0, 'never landed on the roof');
  const last = trace[trace.length - 1]; assert.ok(onRoof(last), `ended at feet ${(last.feet / 4).toFixed(2)} m, floor ${(last.floor / 4).toFixed(2)} m`);
});

test('walking off the crate onto the container plants too: a thing\'s lid at another level', () => {
  const { trace } = run(CRATE, SOUTH, { jumpAt: Infinity, sprint: false });
  const i = trace.findIndex(onRoof); assert.ok(i > 0, 'never reached the roof');
  const held = trace.slice(i, i + ticks(LAND_PLANT_MS) - 2); assert.ok(held.every(onRoof), 'left the roof within the plant');
  assert.ok(Math.abs(held[held.length - 1].z - held[0].z) < 0.5, 'slid while planted');
});

test('a jump that lands on the street plants nothing: the body keeps running', () => {
  const { trace } = run([5, 2], [0, 1]);   // (open street, north of the yard)
  const i = landing(trace); assert.ok(i > 0, 'never landed');
  const a = trace[i], b = trace[Math.min(trace.length - 1, i + ticks(500))];
  assert.ok(b.z - a.z > 12, 'stopped after a street landing: moved ' + (b.z - a.z).toFixed(1) + ' u in half a second');
});

test('a hop along the same roof plants nothing: the level is unchanged', () => {
  // (the 7.5 m container at x -9.1..-1.7, z 10.4..12.9: a walking hop eastward along its roof, from its west end)
  const { trace } = run([-8.5, 11.6], [1, 0], { sprint: false, jumpAt: 200, ms: 2000 });
  const i = landing(trace); assert.ok(i > 0, 'never landed');
  assert.ok(onRoof(trace[i]), 'landed off the roof');
  const a = trace[i], b = trace[Math.min(trace.length - 1, i + ticks(300))];
  assert.ok(b.x - a.x > 3, 'held after a hop along the roof: moved ' + (b.x - a.x).toFixed(1) + ' u in 0.3 s');
});

test('stepping off a container onto the street plants nothing', () => {
  const { trace } = run([-8.5, 11.6], [0, 1], { sprint: false, jumpAt: Infinity, ms: 2000 });   // (walks south off the container's roof)
  const i = landing(trace); assert.ok(i > 0, 'never came down');
  assert.ok(Math.abs(trace[i].floor) < 0.05, 'did not land on the street: floor ' + trace[i].floor);
  const a = trace[i], b = trace[Math.min(trace.length - 1, i + ticks(300))];
  assert.ok(b.z - a.z > 3, 'held after stepping down to the street: moved ' + (b.z - a.z).toFixed(1) + ' u in 0.3 s');
});
