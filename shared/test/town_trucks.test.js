// Town, the cement mixer and the fire truck as simple boxes (b1105le; shared/tools/maps/town_trucks.mjs; user 2026-11-25, with boxes of both picked on the page and
// Town's car as the example: "This two vehicles' cboxes are too complicated and have weird gaps not matching its visual. Simplified these two vehicle's cboxes. No
// need to be pixel accurate."), against the installed data, on the server's sim: each truck is its few boxes with lids, standing from the terrace, and nothing else
// of the reading is left in it; the tool run over the installed data writes the same file; the fire truck's ladder is one sloped floor a bot sees under; a body
// walked at a truck is held at its steps, close to its side, and no jump gets it onto the truck — the fire truck's bumper alone is a step; rounds stop at the trucks
// where the reading let them through and pass close by their sides. A reading of Town's data made again from the model has the two as cells: the tool is run after
// it, and these fail until it has been.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as C from '../src/sim/constants.js';
import { createMatchState, tickMatch, emptyInput, getArena, botHasLineOfSight } from '../src/sim/index.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS, TER = 2.37;   // (the terrace both stand on, metres over the street)
const MX = (u) => u / 4 - 0.5, MZ = (u) => u / 4 - 10, AX = (x) => (x + 0.5) * 4, AZ = (z) => (z + 10) * 4;
const DATA = fileURLToPath(new URL('../../client/public/maps/town_data.json', import.meta.url)), TOOL = fileURLToPath(new URL('../tools/maps/town_trucks.mjs', import.meta.url));
const D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
// (model metres, as the tool has them: a corner of the thing's least rectangle, its long side's direction, that rectangle, the body's plan in it u0, u1, v0, v1 — and
// the boxes it is, by their tops)
const THINGS = [
  { name: 'the cement mixer', at: [-38.35, -10.67], deg: 150, len: 7.62, wid: 3.01, plan: [0.75, 7.45, 0.32, 2.92], tops: { 5.9: 6, 4.9: 4, 5: 1 } },
  { name: 'the fire truck', at: [-62.18, -12.80], deg: 56, len: 8.86, wid: 3.84, plan: [0, 8.86, 0.40, 3.44], tops: { 5.1: 10, 3.2: 4, 6: 1 } } ];
for (const T of THINGS) { const c = Math.cos(T.deg * Math.PI / 180), s = Math.sin(T.deg * Math.PI / 180); T.c = c; T.s = s;
  T.pt = (u, v) => [T.at[0] + u * c - v * s, T.at[1] + u * s + v * c]; T.uv = (x, z) => [(x - T.at[0]) * c + (z - T.at[1]) * s, -(x - T.at[0]) * s + (z - T.at[1]) * c];
  T.has = (e, pad) => { const [u, v] = T.uv((MX(e.minX) + MX(e.maxX)) / 2, (MZ(e.minZ) + MZ(e.maxZ)) / 2); return u >= -pad && u <= T.len + pad && v >= -pad && v <= T.wid + pad; };
  // how far a place lies outside the body's plan (under 0: inside it by that much)
  T.off = (x, z) => { const [u, v] = T.uv(x, z); const [u0, u1, v0, v1] = T.plan; const d = Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1)); return d > 0 ? d : -Math.min(u - u0, u1 - u, v - v0, v1 - v); }; }
const LADDER = { minX: -263.84, maxX: -246.8, minZ: -1.52, maxZ: 2.76, win: [-66.5, -62.0, -10.8, -8.9] };   // (the sloped floor's plan, arena units; the window its cells lay in, model metres)
const topOf = (e) => (e.maxY ?? e.maxTop ?? e.top) / 4, over = (e) => topOf(e) > 2.75 && topOf(e) <= 6.2;   // (over the terrace's kerbs, up to the things' tops)

test('each truck is its few boxes with lids, standing from the terrace, and nothing else of the reading is left in it', () => {
  for (const T of THINGS) { const B = D.obstacles.filter((o) => T.has(o, 0.7) && over(o)), F = D.surfaces.filter((f) => T.has(f, 0.7) && over(f)); const tops = {};
    for (const o of B) { tops[topOf(o)] = (tops[topOf(o)] ?? 0) + 1; assert.ok(o.minY === TER * 4 && o.topBuffer === 0.8, `${T.name}: a box stands from the terrace as a box with a lid does`); }
    assert.deepEqual(tops, T.tops, `${T.name}: its boxes by their tops`);
    assert.equal(F.length, B.length, `${T.name}: a lid a box and no other floor`);
    for (const f of F) assert.ok(f.type === 'flat' && f.lid === 1 && B.some((o) => o.maxY === f.top && f.minX <= o.minX && f.maxX >= o.maxX && f.minZ <= o.minZ && f.maxZ >= o.maxZ), `${T.name}: a floor there is a box's lid`); }
});

test('the tool run over the installed data writes the same file', () => {
  const out = path.join(os.tmpdir(), `town_trucks_${process.pid}.json`);
  try { execFileSync(process.execPath, [TOOL, DATA, out], { stdio: 'pipe' }); assert.ok(fs.readFileSync(out).equals(fs.readFileSync(DATA)), 'the installed data is the tool\'s own output'); } finally { fs.rmSync(out, { force: true }); }
});

test('the fire truck\'s ladder is one sloped floor, a deck: none of its cells is left, and a bot sees under it as it saw under them', () => {
  const t = getArena('town'); const lad = t.surfaces.filter((f) => f.type === 'plane' && f.minX === LADDER.minX && f.maxX === LADDER.maxX && f.minZ === LADDER.minZ && f.maxZ === LADDER.maxZ);
  assert.equal(lad.length, 1, 'the ladder\'s floor'); const L = lad[0];
  assert.ok(L.deck === true && Math.abs(L.heightAt(L.minX, L.minZ) / 4 - 9.4) < 0.01 && Math.abs(L.heightAt(L.maxX, L.minZ) / 4 - 6) < 0.01, 'a deck, from 6.0 m over the turntable up to 9.4 m at the wall');
  const W = LADDER.win, own = (e) => MX(e.minX) >= W[0] && MX(e.maxX) <= W[1] && MZ(e.minZ) >= W[2] && MZ(e.maxZ) <= W[3] && topOf(e) > 5.75;
  assert.equal(D.obstacles.filter(own).length + D.surfaces.filter(own).length, 1, 'in the ladder\'s window, over the turntable: the one floor');
  // two places on the terrace either side of the ladder, between the truck's rear corner and the wall: the line runs under the ladder's upper half
  for (const x of [-66.2, -65.6]) { const a = { x: AX(x), y: TER * 4 + G, z: AZ(-7.6) }, b = { x: AX(x), y: TER * 4 + G, z: AZ(-12.2) };
    assert.ok(botHasLineOfSight(a, b, t.obstacles, t.surfaces), `x ${x}: seen under the ladder`);
    L.deck = false; let plain; try { plain = botHasLineOfSight(a, b, t.obstacles, t.surfaces); } finally { L.deck = true; }
    assert.ok(!plain, `x ${x}: the mark is what lets it — a plain slope is a mass down to the ground to the sight test`); }
});

// A body set on the terrace walks a way for four seconds, with a jump every 0.64 s if asked: where it ends, and the highest its feet came (model metres).
function walk(from, dir, jumps) {
  const m = createMatchState({ mapKey: 'town', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const f = m.fighters.p1, e = m.fighters.p2;
  for (const q of [f, e]) { q.hp = 1e9; q.invulnerableUntil = 1e15; }
  e.pos = { x: 300, y: G, z: 300 }; e.floorY = G; f.pos = { x: AX(from[0]), y: TER * 4 + G, z: AZ(from[1]) }; f.vel = { x: 0, y: 0, z: 0 }; f.airborne = false; f.grounded = true; f.floorY = f.pos.y;
  let now = 1000, top = -1e9;
  for (let n = 0; n < 250; n += 1) { const inp = { ...emptyInput(), moveX: dir[0], moveZ: dir[1] }; if (jumps && n >= 30 && (n - 30) % 40 === 0) inp.jump = true; now += MS; tickMatch(m, { p1: inp }, now, DT); top = Math.max(top, (f.pos.y - G) / 4); }
  return { x: MX(f.pos.x), z: MZ(f.pos.z), feet: (f.pos.y - G) / 4, top };
}

test('a body walked at a truck\'s side is held at its steps, close to the side, and no jump gets it onto the truck; the fire truck\'s bumper is a step and no more', () => {
  for (const T of THINGS) { const [u0, u1, v0, v1] = T.plan; const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; const across = [-T.s, T.c];   // (the way across the thing)
    for (const side of [-1, 1]) { const from = T.pt(um, vm + side * ((v1 - v0) / 2 + 4)), dir = [-side * across[0], -side * across[1]];
      const w = walk(from, dir, false), j = walk(from, dir, true);
      // (a body is 0.29 m thick and the steps keep within 0.32 m of the plan: its middle ends between the plan's side and 0.65 m off it)
      assert.ok(T.off(w.x, w.z) > 0 && T.off(w.x, w.z) < 0.65 && Math.abs(w.feet - TER) < 0.02, `${T.name}, a walk at its side: held ${T.off(w.x, w.z).toFixed(2)} m off the plan, feet ${w.feet.toFixed(2)}`);
      assert.ok(T.off(j.x, j.z) > 0 && Math.abs(j.feet - TER) < 0.02 && j.top < TER + 1.9, `${T.name}, jumps at its side: still on the terrace (${T.off(j.x, j.z).toFixed(2)} m off, feet ${j.feet.toFixed(2)}, highest ${j.top.toFixed(2)})`); } }
  const F = THINGS[1]; const from = F.pt(F.plan[1] + 4, (F.plan[2] + F.plan[3]) / 2), dir = [-F.c, -F.s];   // (at the fire truck's front, along it)
  const w = walk(from, dir, false), j = walk(from, dir, true);
  assert.ok(F.off(w.x, w.z) > 0 && F.off(w.x, w.z) < 0.65 && Math.abs(w.feet - TER) < 0.02, `a walk at the fire truck's front is held at the bumper: ${F.off(w.x, w.z).toFixed(2)} m off, feet ${w.feet.toFixed(2)}`);
  assert.ok(Math.abs(j.feet - 3.2) < 0.02 && j.top < 5.1 - 0.3, `jumps there end on the bumper, 0.83 m up, and come no nearer the roof: feet ${j.feet.toFixed(2)}, highest ${j.top.toFixed(2)}`);
});

// A unit pinned at a place holds the trigger on a unit pinned at another for three seconds: the damage done.
function shot(from, to) {
  const m = createMatchState({ mapKey: 'town', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); const a = m.fighters.p1, b = m.fighters.p2;
  for (const q of [a, b]) { q.hp = 1e9; q.invulnerableUntil = 0; }
  a.pos = { x: AX(from[0]), y: TER * 4 + G, z: AZ(from[1]) }; b.pos = { x: AX(to[0]), y: TER * 4 + G, z: AZ(to[1]) }; a.floorY = a.pos.y; b.floorY = b.pos.y; a.targetId = 'p2'; b.targetId = 'p1';
  const a0 = { ...a.pos }, b0 = { ...b.pos }, hp0 = b.hp; let now = 1000; const inp = { ...emptyInput(), shootHold: true };
  for (let k = 0; k < 3000 / MS; k += 1) {
    now += MS; m.tick = (m.tick ?? 0) + 1; tickMatch(m, { p1: inp, p2: emptyInput() }, now, DT, []);
    for (const [q, q0] of [[a, a0], [b, b0]]) { q.pos.x = q0.x; q.pos.y = q0.y; q.pos.z = q0.z; q.vel.x = q.vel.y = q.vel.z = 0; q.airborne = false; }
  }
  return Math.round(hp0 - b.hp);
}

test('rounds stop at the trucks where the reading let them through, and pass 0.8 m clear of their sides', () => {
  // (lines across a truck from 2.5 m off one side to 2.5 m off the other, by their place along it: with the reading the mixer's cab let 104, 104 and 80 through
  // in three seconds at these three, and the fire truck 76 at this one)
  for (const [T, places] of [[THINGS[0], [5.5, 6.0, 6.5]], [THINGS[1], [5.75]]]) { const [u0, u1, v0, v1] = T.plan;
    for (const u of places) assert.equal(shot(T.pt(u, v0 - 2.5), T.pt(u, v1 + 2.5)), 0, `${T.name}: a line across it ${u} m along`);
    for (const v of [v0 - 0.8, v1 + 0.8]) { const d = shot(T.pt(u0 - 2.5, v), T.pt(u1 + 2.5, v)); assert.ok(d > 50, `${T.name}: a line along its side, 0.8 m off, arrives (${d})`); } }
});
