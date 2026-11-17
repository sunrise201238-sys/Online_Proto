import '../tools/maps/arena_files.mjs';   // (the modelled maps' data from their files, before any arena is asked for)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, getArena, groundHeightAt, TICK_RATE_MS, TICK_DT, GROUND_BASE_Y } from '../src/sim/index.js';

// A LANDING HOLDS NOTHING (b1105jh; user 2026-11-17, shown what the landing plant did: "Remove this feature."). From 2026-10-22
// a body that landed on a thing's lid at another level than the floor it left was planted there — its momentum dropped, the
// stick it still held ignored until the stick was let go or 600 ms passed (this file was plant.test.js). Now a landing is a
// landing whatever the body lands on: the momentum it came with carries on and the stick is read at once. The ground of the
// rule's own tests: the Warehouse's north-west stack (a crate top at 3.19 m) and the 2.5 m container south of it, its roof
// 2.5 m deep — a sprint-jump from the crate with the stick held crosses that roof and goes off its far side, as it did before
// the rule; the stick let go as the feet come down keeps the body on it.
const CX = 5, CZ = 8;   // (Warehouse: model metres to units)
const U = (xm, zm) => [(xm - CX) * 4, (zm - CZ) * 4];
const ticks = (ms) => Math.round(ms / TICK_RATE_MS);
const ROOF = 10, onRoof = (s) => Math.abs(s.feet - ROOF) < 0.05 && Math.abs(s.floor - ROOF) < 0.05 && !s.air;
function run(startM, dir, { sprint = true, jumpAt = 300, releaseAfterLanding = Infinity, ms = 3000 } = {}) {
  const a = getArena('warehouse'); const [X, Z] = U(...startM);
  let top = 0; for (const o of a.obstacles) if (o.topBuffer != null && X >= o.minX && X <= o.maxX && Z >= o.minZ && Z <= o.maxZ && o.maxY > top && o.maxY < 40) top = o.maxY;
  const m = createMatchState({ mapKey: 'warehouse', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
  const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
  p2.pos.x = X + dir[0] * 300; p2.pos.z = Z + dir[1] * 300; p1.pos.x = X; p1.pos.z = Z; p1.pos.y = GROUND_BASE_Y + top; p1.boost = 250;
  const trace = []; let now = 1000, landedAt = null;
  for (let t = 0; t <= ms; t += TICK_RATE_MS) {
    const held = landedAt == null || t < landedAt + releaseAfterLanding;
    const inp = emptyInput(); inp.moveX = held ? dir[0] : 0; inp.moveZ = held ? dir[1] : 0; inp.boost = held && sprint; inp.jump = t >= jumpAt && t < jumpAt + 2 * TICK_RATE_MS;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT, []); now += TICK_RATE_MS;
    const feet = p1.pos.y - GROUND_BASE_Y;
    const s = { t, x: p1.pos.x, z: p1.pos.z, feet, floor: groundHeightAt(p1.pos.x, p1.pos.z, a.surfaces, feet), air: p1.airborne, momentum: Math.hypot(p1.momentumVX || 0, p1.momentumVZ || 0) };
    if (landedAt == null && onRoof(s)) landedAt = t;
    trace.push(s);
  }
  return { trace, top, fighter: p1, at: trace.findIndex((s) => s.t === landedAt) };
}
const CRATE = [-7.2, 7.9], SOUTH = [0, 1];   // (the crate's top is 3.19 m; the container's roof, 2.5 m, lies at z 10.4..12.9)

test('a sprint-jump from the crate down onto the container, the stick held: nothing holds the body — it runs on and off the roof', () => {
  const { trace, top, at } = run(CRATE, SOUTH);
  assert.ok(Math.abs(top - 12.76) < 0.1, 'the crate top is 3.19 m: ' + top);
  assert.ok(at > 0, 'never landed on the roof');
  assert.ok(trace[at].momentum > 1, 'the landing dropped the momentum: ' + trace[at].momentum.toFixed(2));
  const moved = trace[Math.min(trace.length - 1, at + ticks(300))].z - trace[at].z;
  assert.ok(moved > 6, 'held after the landing: moved ' + moved.toFixed(1) + ' u in 0.3 s');
  let off = at; while (off < trace.length && onRoof(trace[off])) off += 1;
  assert.ok(off < trace.length && trace[off].t - trace[at].t < 400, 'still on the roof 0.4 s after the landing, the stick held');
});

test('the stick let go as the feet come down: the body stays on the roof', () => {
  const { trace, at } = run(CRATE, SOUTH, { releaseAfterLanding: 0 });
  assert.ok(at > 0, 'never landed on the roof');
  const last = trace[trace.length - 1]; assert.ok(onRoof(last), `ended at feet ${(last.feet / 4).toFixed(2)} m, floor ${(last.floor / 4).toFixed(2)} m`);
});

test('walking off the crate onto the container, the stick held: nothing holds the body either', () => {
  const { trace, at } = run(CRATE, SOUTH, { jumpAt: Infinity, sprint: false });
  assert.ok(at > 0, 'never reached the roof');
  const moved = trace[Math.min(trace.length - 1, at + ticks(300))].z - trace[at].z;
  assert.ok(moved > 2.5, 'held after the step down: moved ' + moved.toFixed(1) + ' u in 0.3 s');
});

test('the fighter carries no plant: its two flags are gone, the floor it stands on stays', () => {
  const { fighter } = run(CRATE, SOUTH, { ms: 800 });
  assert.equal('plantUntil' in fighter, false);
  assert.equal('landedOnLid' in fighter, false);
  assert.equal(typeof fighter.floorY, 'number');
});
