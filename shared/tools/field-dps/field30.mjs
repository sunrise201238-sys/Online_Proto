// field30.mjs <tree root> <out.json> [runs] — every unit's damage over 30 s of fighting on the open field, reloads included,
// on the shared sim (the hit-rate harness's field: shared/tools/hitcurve.mjs — the shooter strafing at her walk speed, the
// target a real unit on a ±35° arc round her). Per unit: at her own lock range against a standing, a walking and a sprinting
// target, with the trigger simply held (a player who holds fire) and on the bots' fire gate (disciplined bursts); and at 40,
// a close fight, against a walking target with the trigger held. Reported: damage a second over the 30 s, and the time to the
// first 100 damage (the middle run).
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const [root, out, runsArg] = process.argv.slice(2); const RUNS = Number(runsArg ?? 30);
const S = await import(pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/index.js').href);
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, GROUND_BASE_Y, botMayFire, botNoteShot } = S;
const UNITS = ['unit1', 'unit9', 'unit14', 'unit22', 'unit4', 'unit13', 'unit15', 'unit17', 'unit2', 'unit11', 'unit18', 'unit12', 'unit5', 'unit21', 'unit10', 'unit7', 'unit20', 'unit3', 'unit6', 'unit19'];
{ const A = await import(pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/arena.js').href); A.getArena('arena1').obstacles.length = 0; }
const SPRINT = 11.76, ARC = 35 * Math.PI / 180, SECS = 30;
function run(unitKey, R, targetSpeed, gated) {
  const u = UNIT_DATA[unitKey];
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: unitKey, p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = 0; p1.pos.z = 0; p1.pos.y = GROUND_BASE_Y; p2.pos.y = GROUND_BASE_Y; p2.hp = 1e9; p1.targetId = 'p2'; p2.targetId = 'p1';
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0;
  const C = { x: 0, z: 0 }; let now = 1000, theta = (Math.random() * 2 - 1) * ARC, dir = Math.random() < 0.5 ? 1 : -1, strafe = Math.random() < 0.5 ? 1 : -1, lastFlip = now - Math.random() * 400; const omega = R > 0 ? targetSpeed / R : 0;
  let dmg = 0, t100 = null, shots = 0; const seen = new Set();
  for (let tick = 0; tick < Math.round(SECS * 1000 / TICK_RATE_MS); tick += 1) {
    now += TICK_RATE_MS;
    theta += dir * omega * TICK_DT; if (theta > ARC) { theta = ARC; dir = -1; } else if (theta < -ARC) { theta = -ARC; dir = 1; }
    p2.pos.x = C.x + R * Math.cos(theta); p2.pos.z = C.z + R * Math.sin(theta); p2.pos.y = GROUND_BASE_Y; p2.vel.x = 0; p2.vel.z = 0; p2.vel.y = 0; p2.grounded = true; p2.hp = Math.max(p2.hp, 1e8);
    // the shooter keeps to her place: strafing across the line, drawn back to the middle so the range holds
    const inp = emptyInput(); if (now - lastFlip >= 400) { strafe = -strafe; lastFlip = now; }
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z, d = Math.hypot(dx, dz) || 1; inp.moveX = (-dz / d) * strafe; inp.moveZ = (dx / d) * strafe;
    if (p1.ammo > 0 && (!gated || botMayFire(u, p1, d, '1v1'))) { inp.shootHold = true; inp.shootTap = true; }
    const hpBefore = p2.hp, ammoBefore = p1.ammo;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT);
    let newProj = false; for (const p of m.projectiles) if (p.ownerId === 'p1' && !seen.has(p.id)) { seen.add(p.id); newProj = true; }
    if (p1.ammo < ammoBefore || (u.autoReload && newProj)) { shots += 1; botNoteShot(p1); }
    dmg += Math.max(0, hpBefore - p2.hp);
    if (t100 == null && dmg >= 100) t100 = (now - 1000) / 1000;
  }
  return { dmg, t100, shots };
}
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length >= xs.length / 2 ? v[Math.floor(v.length / 2)] : null; };
const result = {};
for (const key of UNITS) {
  const u = UNIT_DATA[key]; const walk = u.walkSpeed ?? 16; const row = { name: u.char ?? key, lock: u.lockRange, walk };
  const series = (R, v, gated) => { const rs = []; for (let i = 0; i < RUNS; i += 1) rs.push(run(key, R, v, gated)); return { dps: +(rs.reduce((a, r) => a + r.dmg, 0) / rs.length / SECS).toFixed(1), t100: med(rs.map((r) => r.t100)), shots: Math.round(rs.reduce((a, r) => a + r.shots, 0) / rs.length) }; };
  for (const [name, v] of [['still', 0], ['walk', walk], ['sprint', walk + SPRINT]]) { row[`held_${name}`] = series(u.lockRange, v, false); row[`gate_${name}`] = series(u.lockRange, v, true); }
  row.close_walk = series(40, walk, false);
  result[key] = row;
  const f = (s) => `${String(s.dps).padStart(5)}/s ${s.t100 == null ? '  —  ' : s.t100.toFixed(1).padStart(4) + 's'}`;
  console.log(`${(u.char ?? key).padEnd(8)} @${String(u.lockRange).padEnd(3)} held: still ${f(row.held_still)} walk ${f(row.held_walk)} sprint ${f(row.held_sprint)} | gate: still ${f(row.gate_still)} walk ${f(row.gate_walk)} sprint ${f(row.gate_sprint)} | @40 walk ${f(row.close_walk)}`);
}
writeFileSync(out, JSON.stringify(result)); console.log('wrote', out);
