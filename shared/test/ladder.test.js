// The ladders (ladder.js; user 2026-11-04/05): the records of Compound and District against the installed data, and the rule
// on the server's sim — the mount by the jump button at either end, the climb at LADDER_CLIMB_SPEED, the carry onto the exit,
// the hold, the let-go, the latch, the descent, no stun / shot / dodge on the ladder, death, the bot's goal, the snapshot.
import '../tools/maps/arena_files.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/sim/constants.js';
import {
  createMatchState, tickMatch, emptyInput, getArena, getArenaLadders, buildSnapshotFor,
  groundHeightAt, unitOverlapsObstacle, applyHitStun, attemptFire, tryStartStep, ladderNormal, ladderAt, ladderFootZone,
  LADDER_GRAB_FRONT, LADDER_GRAB_BACK, LADDER_GRAB_SIDE, LADDER_TOP_RADIUS, LADDER_APPROACH_FRONT, LADDER_PRESS_MS
} from '../src/sim/index.js';

const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS;
const withGauge = (fn) => { const sw = C.PT; const was = sw?.infiniteBoost; if (sw) sw.infiniteBoost = false; try { return fn(); } finally { if (sw) sw.infiniteBoost = was; } };

test('every ladder row stands on its floors: the foot, the exit, clear of the boxes; the lip above the exit; the zones apart', () => {
  for (const mapKey of ['compound', 'district']) {
    const a = getArena(mapKey); const ladders = getArenaLadders(mapKey);
    assert.ok(ladders.length > 0, `${mapKey} has ladders`);
    for (const L of ladders) {
      const foot = groundHeightAt(L.x, L.z, a.surfaces, L.y0 + 0.1);
      assert.ok(Math.abs(foot - L.y0) < 0.3, `${mapKey} ${L.name}: the foot's floor ${foot.toFixed(2)} vs y0 ${L.y0.toFixed(2)}`);
      assert.ok(!unitOverlapsObstacle(L.x, L.y0 + G, L.z, a.obstacles), `${mapKey} ${L.name}: the foot stands clear of the boxes`);
      const top = groundHeightAt(L.ex, L.ez, a.surfaces, L.ey + 0.1);
      assert.ok(Math.abs(top - L.ey) < 0.3, `${mapKey} ${L.name}: the exit's floor ${top.toFixed(2)} vs ey ${L.ey.toFixed(2)}`);
      assert.ok(!unitOverlapsObstacle(L.ex, L.ey + G, L.ez, a.obstacles), `${mapKey} ${L.name}: the exit stands clear of the boxes`);
      assert.ok(L.y1 >= L.ey - 1e-6, `${mapKey} ${L.name}: the lip at or over the exit`);
      assert.ok(L.y1 > L.y0 + 4, `${mapKey} ${L.name}: a climb of more than a metre`);
      // the column the body rides, clear of the boxes from the foot to the lip
      for (let feet = L.y0; feet <= L.y1; feet += 2) assert.ok(!unitOverlapsObstacle(L.x, feet + G, L.z, a.obstacles), `${mapKey} ${L.name}: the column clear at feet ${feet.toFixed(1)}`);
      // the exit is no foot zone of this ladder and the foot no top zone (the ends tell apart)
      const at = ladderAt(ladders, { x: L.ex, y: L.ey + G, z: L.ez }); assert.equal(at?.end, 'top', `${mapKey} ${L.name}: the exit mounts from the top`);
      const n = ladderNormal(L); const footAt = ladderAt(ladders, { x: L.x - n.x * 1.0, y: L.y0 + G, z: L.z - n.z * 1.0 }); assert.equal(footAt?.end, 'foot', `${mapKey} ${L.name}: in front of the line mounts from the foot`);
    }
  }
});

// A match on the map, p1 the human at a point, standing; p2 far off, idle.
function matchAt(mapKey, x, feet, z) {
  const m = createMatchState({ mapKey, mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1; f.pos.x = x; f.pos.z = z; f.pos.y = feet + G; f.grounded = true; f.airborne = false; f.floorY = f.pos.y; f.boost = 200;
  const o = m.fighters.p2; o.pos.x = x + 200; o.pos.z = z + 200; o.hp = 1e9; f.hp = 1e9;
  return { m, f };
}
const step = (m, now, inp) => { tickMatch(m, { p1: { ...emptyInput(), ...inp }, p2: emptyInput() }, now, DT); return now + MS; };
const toward = (L, k = 1) => { const n = ladderNormal(L); return { moveX: n.x * k, moveZ: n.z * k }; };

test('Compound: the jump at the foot mounts, the stick toward the wall climbs at the climb speed, the top carries the body onto the north catwalk', () => withGauge(() => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const { m, f } = matchAt('compound', L.x - n.x * 1.0, L.y0, L.z - n.z * 1.0);
  let now = 2000;
  now = step(m, now, {});                                        // standing (the gauge refills this tick: Compound's scale 5)
  assert.equal(f.ladder, undefined);
  const boost0 = f.boost;
  now = step(m, now, { jump: true });                            // the press: a mount, no jump
  assert.equal(f.ladder, 0); assert.equal(f.ladderLeg, 'enter'); assert.equal(f.airborne, false); assert.equal(f.action, 'climb');
  assert.equal(f.jumpVelocity, 0); assert.equal(f.boost, boost0, 'the mount costs no boost');
  let ticks = 0, maxY = f.pos.y;
  while (f.ladder != null && ticks < 400) { now = step(m, now, { ...toward(L), jump: ticks < 5 }); ticks += 1; maxY = Math.max(maxY, f.pos.y); if (f.ladder != null) assert.equal(f.action, 'climb'); }
  assert.ok(f.ladder == null, 'off the ladder at the top');
  assert.equal(f.grounded, true); assert.equal(f.airborne, false);
  assert.ok(Math.abs(f.pos.x - L.ex) < 1e-6 && Math.abs(f.pos.z - L.ez) < 1e-6 && Math.abs(f.pos.y - (L.ey + G)) < 1e-6, `stands on the exit (${f.pos.x.toFixed(2)}, ${(f.pos.y - G).toFixed(2)}, ${f.pos.z.toFixed(2)})`);
  assert.ok(Math.abs(maxY - (L.y1 + G)) < 1e-6, 'the feet reached the lip and no higher');
  // the time: the enter leg (1 unit), the climb (y1 - y0), the exit leg — each at LADDER_CLIMB_SPEED, a tick's rounding each
  const expect = (1.0 + (L.y1 - L.y0) + Math.hypot(L.ex - L.x, L.ez - L.z, L.ey - L.y1)) / (C.LADDER_CLIMB_SPEED * DT);
  assert.ok(Math.abs(ticks - expect) <= 3, `${ticks} ticks for ${expect.toFixed(1)} expected`);
  assert.equal(f.boost, boost0, 'no boost drained or refilled on the ladder');
  // on the catwalk: a step more stands there (the floor under the exit)
  now = step(m, now, {}); assert.equal(f.grounded, true); assert.ok(Math.abs(f.pos.y - (L.ey + G)) < 0.3);
}));

test('on the ladder the stick holds, sideways and neutral alike; the jump lets go and the body drops, no cost; the held button is spent', () => withGauge(() => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const { m, f } = matchAt('compound', L.x - n.x * 1.0, L.y0, L.z - n.z * 1.0);
  let now = 2000; now = step(m, now, { jump: true });
  for (let i = 0; i < 30; i += 1) now = step(m, now, { ...toward(L), jump: i < 20 });   // the mount's press held 20 ticks: nothing
  assert.equal(f.ladder, 0); assert.equal(f.ladderLeg, 'climb');
  const y = f.pos.y;
  for (let i = 0; i < 10; i += 1) now = step(m, now, {});                                   // neutral: holds
  assert.equal(f.pos.y, y);
  for (let i = 0; i < 10; i += 1) now = step(m, now, { moveX: -n.z, moveZ: n.x });          // sideways: holds, stays on
  assert.equal(f.pos.y, y); assert.equal(f.ladder, 0);
  for (let i = 0; i < 5; i += 1) now = step(m, now, toward(L, -1));                         // away: descends
  assert.ok(f.pos.y < y);
  const boost0 = f.boost, cd0 = f.jumpCooldownUntil, yOff = f.pos.y;
  now = step(m, now, { jump: true });                                                       // a new press: let go
  assert.equal(f.ladder, undefined); assert.equal(f.airborne, true); assert.equal(f.boost, boost0); assert.equal(f.jumpCooldownUntil, cd0);
  for (let i = 0; i < 60 && f.airborne; i += 1) now = step(m, now, { jump: true });         // held on: no jump out of the fall
  assert.equal(f.airborne, false); assert.ok(f.pos.y < yOff, 'dropped'); assert.ok(Math.abs(f.pos.y - G) < 0.3, 'landed on the hall floor');
  assert.equal(f.boost, boost0, 'the held button never jumped');
}));

test('from the exit the jump mounts at the top; the stick away from the wall descends; the foot stands the body', () => withGauge(() => {
  const L = getArenaLadders('compound')[0];
  const { m, f } = matchAt('compound', L.ex + 0.5, L.ey, L.ez);
  let now = 2000; now = step(m, now, { jump: true });
  assert.equal(f.ladder, 0); assert.equal(f.ladderDir, -1); assert.equal(f.ladderLeg, 'enter');
  let ticks = 0;
  while (f.ladder != null && ticks < 400) { now = step(m, now, toward(L, -1)); ticks += 1; }
  assert.ok(f.ladder == null && f.grounded, 'stands at the foot');
  assert.ok(Math.abs(f.pos.x - L.x) < 1e-6 && Math.abs(f.pos.z - L.z) < 1e-6 && Math.abs(f.pos.y - (L.y0 + G)) < 1e-6);
  const expect = (Math.hypot(L.x - L.ex - 0.5, L.z - L.ez, L.y1 - L.ey) + (L.y1 - L.y0)) / (C.LADDER_CLIMB_SPEED * DT);
  assert.ok(Math.abs(ticks - expect) <= 3, `${ticks} ticks for ${expect.toFixed(1)} expected`);
}));

test('a climber is hit but not stunned, fires nothing, dodges nothing; a stun running at the mount is dropped; death lets go', () => withGauge(() => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const { m, f } = matchAt('compound', L.x - n.x * 1.0, L.y0, L.z - n.z * 1.0);
  let now = 2000; f.hitStunUntil = now + 5000; f.hitStunScale = 0.25;
  now = step(m, now, { jump: true });
  assert.equal(f.hitStunUntil, 0, 'the mount drops the stun');
  for (let i = 0; i < 10; i += 1) now = step(m, now, toward(L));
  assert.equal(applyHitStun(f, f.unit, 300, 0.25, now), false); assert.equal(f.hitStunUntil, 0);
  assert.equal(attemptFire(m, f, m.fighters.p2, now), false);
  assert.equal(tryStartStep(m, f, 1, 0, now, getArena('compound').obstacles), false);
  const y = f.pos.y; now = step(m, now, { ...toward(L), shootTap: true, shootHold: true, stepTap: true, boost: true });
  assert.ok(f.pos.y > y && f.ladder === 0, 'climbs on, nothing fired or stepped');
  f.hp = 0; now = step(m, now, toward(L));
  assert.equal(f.ladder, undefined); assert.equal(f.airborne, true);
}));

test('a bot mounts only on its goal and rides to the other end whatever else; a bot in the zone with no goal stays put', () => withGauge(() => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const m = createMatchState({ mapKey: 'compound', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const b = m.fighters.p2, h = m.fighters.p1; b.botControlled = true; b.hp = h.hp = 1e9;
  b.pos.x = L.x - n.x * 1.0; b.pos.z = L.z - n.z * 1.0; b.pos.y = L.y0 + G; b.grounded = true; b.floorY = b.pos.y; b.boost = 200;
  h.pos.x = L.x + 200; h.pos.z = L.z + 200;
  let now = 2000; const bot = (inp = {}) => { tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); now += MS; };
  for (let i = 0; i < 20; i += 1) { b.vel.x = -n.x * 10; b.vel.z = -n.z * 10; bot(); }   // the brain's say: walking away; no goal
  assert.equal(b.ladder, undefined);
  b.pos.x = L.x - n.x * 1.0; b.pos.z = L.z - n.z * 1.0; b.botLadderGoal = 1;
  bot(); assert.equal(b.ladder, 0); assert.equal(b.ladderDir, 1);
  let ticks = 0; while (b.ladder != null && ticks < 400) { b.vel.x = -n.x * 10; b.vel.z = -n.z * 10; bot(); ticks += 1; }   // the brain's say ignored
  assert.ok(b.ladder == null && b.grounded && Math.abs(b.pos.x - L.ex) < 1e-6 && Math.abs(b.pos.z - L.ez) < 1e-6, 'the bot stands on the exit');
  assert.equal(b.botLadderGoal, undefined, 'the goal is spent');
}));

test('the snapshot carries the ladder fields while climbing and nothing of them off a ladder', () => withGauge(() => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const { m, f } = matchAt('compound', L.x - n.x * 1.0, L.y0, L.z - n.z * 1.0);
  let now = 2000; now = step(m, now, {});
  assert.ok(!JSON.stringify(buildSnapshotFor(m, f.team)).includes('"ladder'), 'nothing off a ladder');
  now = step(m, now, { jump: true });
  const s = JSON.stringify(buildSnapshotFor(m, null)); assert.ok(s.includes('"ladder":0') && s.includes('"ladderLeg":"enter"'), s.slice(0, 200));
}));

test('District: every ladder is climbed from its foot to its exit, and descended from its exit to its foot, by the rule', () => withGauge(() => {
  const ladders = getArenaLadders('district');
  for (const L of ladders) {
    const n = ladderNormal(L); const i = ladders.indexOf(L);
    { const { m, f } = matchAt('district', L.x - n.x * 1.2, L.y0, L.z - n.z * 1.2); let now = 2000;
      now = step(m, now, { jump: true }); assert.equal(f.ladder, i, `${L.name}: mounts at the foot`);
      let t = 0; while (f.ladder != null && t < 1200) { now = step(m, now, toward(L)); t += 1; }
      assert.ok(f.ladder == null && f.grounded && Math.abs(f.pos.y - (L.ey + G)) < 1e-6 && Math.abs(f.pos.x - L.ex) < 1e-6, `${L.name}: stands on the exit after ${t} ticks`);
      now = step(m, now, {}); assert.ok(Math.abs(f.pos.y - (L.ey + G)) < 0.3 && f.grounded, `${L.name}: the exit's floor holds (${(f.pos.y - G).toFixed(2)})`); }
    { const { m, f } = matchAt('district', L.ex, L.ey, L.ez); let now = 2000;
      now = step(m, now, { jump: true }); assert.equal(f.ladder, i, `${L.name}: mounts at the exit`); assert.equal(f.ladderDir, -1);
      let t = 0; while (f.ladder != null && t < 1200) { now = step(m, now, toward(L, -1)); t += 1; }
      assert.ok(f.ladder == null && f.grounded && Math.abs(f.pos.y - (L.y0 + G)) < 1e-6, `${L.name}: stands at the foot after ${t} ticks`);
      now = step(m, now, {}); assert.ok(Math.abs(f.pos.y - (L.y0 + G)) < 0.3 && f.grounded, `${L.name}: the foot's floor holds`); }
  }
}));

// THE RUSH (b1105g, user: "very hard to trigger ... I have to stop sprinting and direction input, then press jump at very precise
// spot"): a body run at the ladder is stopped by the wall behind the line, and the press there mounts; a press while running at
// the foot from under 2.5 m is kept and mounts the body as it arrives, no jump; a press farther out, or running past, jumps.
for (const [mapKey, idx] of [['compound', 0], ['district', 0]]) {
  test(`${mapKey}: pressed on the wall the press mounts; a press on the run at the ladder is kept and mounts on arrival; farther out it jumps`, () => withGauge(() => {
    const L = getArenaLadders(mapKey)[idx]; const n = ladderNormal(L);
    const inFront = (k) => ({ x: L.x - n.x * k, z: L.z - n.z * k });
    // (a) walked into the wall from the grab point: the body stops behind the line, inside the zone; the press mounts
    {
      const p = inFront(1); const { m, f } = matchAt(mapKey, p.x, L.y0, p.z); let now = 1000;
      for (let i = 0; i < 40; i += 1) now = step(m, now, toward(L));
      const d = (f.pos.x - L.x) * n.x + (f.pos.z - L.z) * n.z;
      assert.ok(d > 0.5 && d < LADDER_GRAB_BACK, `${mapKey}: the wall stops the body behind the line (d ${d.toFixed(2)})`);
      assert.ok(ladderFootZone(L, f.pos), 'and that is inside the zone');
      now = step(m, now, { ...toward(L), jump: true });
      assert.equal(f.ladder, idx, 'the press on the wall mounts');
    }
    // (b) a press on the run from 7 u out (1.75 m; the zone begins at 4 u): no jump, the run goes on, the mount on arrival
    for (const sprint of [false, true]) {
      const p = inFront(7); const { m, f } = matchAt(mapKey, p.x, L.y0, p.z); let now = 1000;
      now = step(m, now, { ...toward(L), boost: sprint, jump: true });
      assert.equal(f.airborne, false, 'no jump went off'); assert.equal(f.ladder, undefined, 'not mounted yet'); assert.ok(f.ladderArmUntil > now - MS, 'the press is kept');
      let mountedAt = null;
      for (let i = 0; i < 40 && mountedAt == null; i += 1) { now = step(m, now, { ...toward(L), boost: sprint }); assert.equal(f.airborne, false, 'still no jump'); if (f.ladder != null) mountedAt = now; }
      assert.ok(mountedAt != null && mountedAt - 1000 <= LADDER_PRESS_MS + MS, `${sprint ? 'sprinting' : 'walking'}: mounted on arrival (${mountedAt == null ? 'never' : `${mountedAt - 1000} ms`})`);
      assert.equal(f.ladderArmUntil, undefined, 'the kept press spent');
    }
    // (c) a press farther out than the approach (3.5 m): the jump as ever, no mount
    {
      const p = inFront(LADDER_APPROACH_FRONT + 4); const { m, f } = matchAt(mapKey, p.x, L.y0, p.z); let now = 1000;
      now = step(m, now, { ...toward(L), boost: true, jump: true });
      assert.equal(f.airborne, true, 'the jump went off'); assert.equal(f.ladderArmUntil, undefined, 'nothing kept');
    }
    // (d) a press running PAST the foot (along the wall, 1.5 m out): the jump as ever
    {
      const p = inFront(6); const { m, f } = matchAt(mapKey, p.x, L.y0, p.z); let now = 1000;
      now = step(m, now, { moveX: -n.z, moveZ: n.x, boost: true, jump: true });
      assert.equal(f.airborne, true, 'the jump went off'); assert.equal(f.ladderArmUntil, undefined, 'nothing kept');
    }
    // (e) a kept press not arriving (the run turns away): spent after LADDER_PRESS_MS, no mount later
    {
      const p = inFront(8); const { m, f } = matchAt(mapKey, p.x, L.y0, p.z); let now = 1000;
      now = step(m, now, { ...toward(L), jump: true }); assert.ok(f.ladderArmUntil != null);
      for (let i = 0; i < LADDER_PRESS_MS / MS + 2; i += 1) now = step(m, now, toward(L, -1));
      assert.equal(f.ladderArmUntil, undefined, 'the kept press ran out'); assert.equal(f.ladder, undefined);
    }
  }));
}

test('the zones: the foot zone is in front of the line and no deeper than a step off the floor; the top zone a metre round the exit', () => {
  const L = getArenaLadders('compound')[0]; const n = ladderNormal(L);
  const at = (x, feet, z) => ladderAt([L], { x, y: feet + G, z });
  assert.equal(at(L.x - n.x * (LADDER_GRAB_FRONT - 0.1), L.y0, L.z - n.z * (LADDER_GRAB_FRONT - 0.1))?.end, 'foot');
  assert.equal(at(L.x - n.x * (LADDER_GRAB_FRONT + 0.3), L.y0, L.z - n.z * (LADDER_GRAB_FRONT + 0.3)), null, 'too far out');
  assert.equal(at(L.x - n.x * 1 - n.z * (L.w / 2 + LADDER_GRAB_SIDE - 0.1), L.y0, L.z - n.z * 1 + n.x * (L.w / 2 + LADDER_GRAB_SIDE - 0.1))?.end, 'foot', 'half a metre beside the width still mounts');
  assert.equal(at(L.x - n.x * 1 - n.z * (L.w / 2 + LADDER_GRAB_SIDE + 0.2), L.y0, L.z - n.z * 1 + n.x * (L.w / 2 + LADDER_GRAB_SIDE + 0.2)), null, 'beside the ladder');
  assert.equal(at(L.x + n.x * (LADDER_GRAB_BACK - 0.1), L.y0, L.z + n.z * (LADDER_GRAB_BACK - 0.1))?.end, 'foot', 'behind the line, toward the wall');
  assert.equal(at(L.x - n.x * 1, L.y0 + C.SURFACE_STEP_HEIGHT + 0.5, L.z - n.z * 1), null, 'in the air');
  assert.equal(at(L.ex + LADDER_TOP_RADIUS - 0.1, L.ey, L.ez)?.end, 'top');
  assert.equal(at(L.ex + LADDER_TOP_RADIUS + 0.3, L.ey, L.ez), null);
});
