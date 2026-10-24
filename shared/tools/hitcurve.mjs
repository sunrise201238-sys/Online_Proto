// The README's hit-rate measurement, rebuilt (the 0.8.4 script was never committed): a walking full-magazine spray on the
// shared sim, Plain Field, 200 runs per series. The shooter strafes sideways at her walk speed, reversing every 400 ms, and
// holds the trigger through one magazine (tap-fired for the shotguns and snipers) while obeying the bot fire gate; the
// target — a real unit, the 3.2-wide hit capsule — ping-pongs on a ±35° arc at the shooter's lock range, at three speeds
// (standing, the shooter's walk speed, that + 11.76). Shots aim at the target's current position, as the game does. A round
// is scored from the sim's own events: a projectile's 'despawn' with reason 'hit' is a hit; a shotgun blast scores its
// 'hit' events' damage ÷ (pellet damage × 8); Kei's beam scores any damage in its life. usage: node shared/tools/hitcurve.mjs <tree root> <out.json> [runs]   (then shared/tools/hitcurve_png.py draws the chart; both kept in the tree since 2026-10-24 — the 0.8.4 script was never committed)
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const [root, out, runsArg] = process.argv.slice(2); const RUNS = Number(runsArg ?? 200);
const S = await import(pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/index.js').href);
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, GROUND_BASE_Y, botMayFire, botNoteShot } = S;
const UNITS = ['unit1', 'unit9', 'unit14', 'unit4', 'unit13', 'unit15', 'unit17', 'unit2', 'unit11', 'unit18', 'unit12', 'unit5', 'unit10', 'unit7', 'unit3', 'unit6'];
const SPRINT = 11.76, ARC = 35 * Math.PI / 180;

function run(unitKey, targetSpeed) {
  const u = UNIT_DATA[unitKey]; const R = u.lockRange; const mag = u.magCapacity ?? 5; const pellets = u.spreadCount ?? 1;
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: unitKey, p2UnitKey: 'unit1', startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = 0; p1.pos.z = 0; p1.pos.y = GROUND_BASE_Y; p2.pos.y = GROUND_BASE_Y; p2.hp = 1e9; p1.targetId = 'p2'; p2.targetId = 'p1';
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0;   // (no spawn immunity: the first rounds count)
  // the arc is centred where the shooter starts (the target moves on its own, not with the shooter's strafe); the phase of the arc and of the strafe are random per run
  const C = { x: p1.pos.x, z: p1.pos.z }; let now = 1000, theta = (Math.random() * 2 - 1) * ARC, dir = Math.random() < 0.5 ? 1 : -1, strafe = Math.random() < 0.5 ? 1 : -1, lastFlip = now - Math.random() * 400; const omega = R > 0 ? targetSpeed / R : 0;
  const rounds = [];            // per round: pellets or hits landed (0..pellets)
  const projRound = new Map();  // projectile id -> round index
  let fired = 0, done = false, settleUntil = Infinity, lastRoundAt = 1000, inFlight = 0;
  for (let tick = 0; tick < 4000; tick += 1) {
    now += TICK_RATE_MS;
    // the target on its arc around the shooter
    theta += dir * omega * TICK_DT; if (theta > ARC) { theta = ARC; dir = -1; } else if (theta < -ARC) { theta = -ARC; dir = 1; }
    p2.pos.x = C.x + R * Math.cos(theta); p2.pos.z = C.z + R * Math.sin(theta); p2.pos.y = GROUND_BASE_Y; p2.vel.x = 0; p2.vel.z = 0; p2.vel.y = 0; p2.grounded = true; p2.hp = Math.max(p2.hp, 1e8);
    // the shooter: strafing across the line to the target, the trigger held on the gate until the magazine is out
    const inp = emptyInput(); if (now - lastFlip >= 400) { strafe = -strafe; lastFlip = now; }
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z, d = Math.hypot(dx, dz) || 1; inp.moveX = (-dz / d) * strafe; inp.moveZ = (dx / d) * strafe;
    if (!done && fired < mag && p1.ammo > 0 && botMayFire(u, p1, Math.hypot(dx, dz), '1v1')) { inp.shootHold = true; inp.shootTap = true; }
    const hpBefore = p2.hp, ammoBefore = p1.ammo;
    tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT);
    if (p1.ammo < ammoBefore) { fired += 1; rounds.push(0); botNoteShot(p1); lastRoundAt = now; }   // a new round: the magazine went down
    for (const p of m.projectiles) if (p.ownerId === 'p1' && !projRound.has(p.id)) projRound.set(p.id, rounds.length - 1);   // its projectile(s): the newest round's
    let pelletDamage = 0;
    for (const ev of m.events) {
      if (ev.type === 'despawn' && projRound.has(ev.id)) { const r = projRound.get(ev.id); projRound.delete(ev.id); if (ev.reason === 'hit' && pellets === 1) rounds[r] += 1; }
      else if (ev.type === 'hit' && ev.ownerId === 'p1' && pellets > 1) pelletDamage += ev.damage;
    }
    if (pellets > 1 && pelletDamage > 0 && rounds.length) rounds[rounds.length - 1] += Math.min(pellets, Math.round(pelletDamage / u.damage));   // (one blast in the air at a time)
    if (u.beam && hpBefore - p2.hp > 0 && rounds.length) rounds[rounds.length - 1] = 1;   // (Kei: the beam's damage, once per round)
    inFlight = projRound.size;
    if (fired >= mag && !done) { done = true; settleUntil = now + 2500; }
    if (done && now >= settleUntil && inFlight === 0) break;
    if (!done && now - lastRoundAt > 20000) break;   // (a gun that will not fire: give up)
  }
  return rounds.map((h) => Math.min(1, h / pellets));
}
const result = {};
for (const key of UNITS) {
  const u = UNIT_DATA[key]; const walk = u.walkSpeed ?? 16; const mag = u.magCapacity ?? 5; const series = {};
  for (const [name, v] of [['still', 0], ['walk', walk], ['sprint', walk + SPRINT]]) {
    const acc = new Array(mag).fill(0), cnt = new Array(mag).fill(0);
    for (let r = 0; r < RUNS; r += 1) { const h = run(key, v); for (let i = 0; i < Math.min(mag, h.length); i += 1) { acc[i] += h[i]; cnt[i] += 1; } }
    const curve = acc.map((a, i) => (cnt[i] ? a / cnt[i] : null));
    const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const third = Math.max(1, Math.floor(mag / 3));
    series[name] = { curve, mean: mean(curve), first: mean(curve.slice(0, third)), last: mean(curve.slice(mag - third)), runs: cnt[0] };
  }
  result[key] = { name: u.char ?? key, lock: u.lockRange, walk, mag, series };
  const f = (s) => `${Math.round(s.mean * 100)}% (${Math.round(s.first * 100)}→${Math.round(s.last * 100)})`;
  console.log(`${key.padEnd(7)} @${u.lockRange} · ${mag} rds  still ${f(series.still)}  walk ${f(series.walk)}  sprint ${f(series.sprint)}`);
}
writeFileSync(out, JSON.stringify(result)); console.log('wrote', out);
