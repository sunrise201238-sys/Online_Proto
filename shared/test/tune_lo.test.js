// b1105lo (user 2026-11-27; PT's b1105lj to b1105ln, then "Apply these changes in 1.0.0. Online and offline."): the rounds'
// speed and the hit stun as they stand since, Iori's beat as b1105lt put it back, and what the speed is for — a sprint across the line of fire slips
// a straight round only past 120 u now (three ticks of flight at 2500 u/s; 53 u at the 1100 the automatic weapons flew until
// then). The bloom's side of the same build is in bloom.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, HIT_RADIUS_NORMAL } from '../src/sim/index.js';

const classOf = (u) => u.name.replace(/^Unit \d+ \/ /, '');
const duel = (shooter, dist, target = 'unit1') => {
  const m = createMatchState({ mapKey: 'arena1', p1UnitKey: shooter, p2UnitKey: target, startTime: 1000 });
  const p1 = m.fighters.p1, p2 = m.fighters.p2;
  p1.pos.x = -dist / 2; p1.pos.z = 0; p2.pos.x = dist / 2; p2.pos.z = 0;
  p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9; p1.targetId = 'p2';
  return { m, p1, p2 };
};
const fire = () => { const i = emptyInput(); i.shootHold = true; i.shootTap = true; return i; };

test('the rounds fly at 2500 for every automatic weapon and rifle and at 600 for the shotguns; the snipers keep theirs', () => {   // (the shotguns: 600 from b1105lo, 1000 in b1105lq to b1105lr, 600 again since b1105ls, user 2026-11-27: "change SG pellet speed to 600")
  const seen = {};
  for (const u of Object.values(UNIT_DATA)) (seen[classOf(u)] ??= new Set()).add(u.projectileSpeed);
  for (const c of ['Assault Rifle', 'Submachine Gun', 'Machine Gun', 'Rifle']) assert.deepEqual([...seen[c]], [2500], c);
  assert.deepEqual([...seen.Shotgun], [600]);
  assert.deepEqual([...seen['Sniper Rifle']].sort((a, b) => a - b), [2000, 4500]);   // Kei's (her beam is instant), Aru's and Hiyori's
});

test('a hit stun is half as deep and half as long as it was: 50 ms at 0.625 of the speed, the light ones 25 ms at 0.75 and 0.925', () => {
  const by = {};
  for (const u of Object.values(UNIT_DATA)) (by[`${u.stun.ms} ms @ ${u.stun.moveScale}`] ??= []).push(u.id);
  assert.equal(by['50 ms @ 0.625'].length, 16);                                              // 100 ms @ 0.25 until b1105lo
  assert.deepEqual(by['25 ms @ 0.75'], ['unit4', 'unit8', 'unit13', 'unit15']);              // 50 ms @ 0.5: Atsuko, Mika, Marina, Yuuka
  assert.deepEqual(by['25 ms @ 0.925'], ['unit5']);                                          // 50 ms @ 0.85: Hina
  // in play: Saori's rounds on a walking Saori — each new stun runs 50 ms from its hit, and the walk under it is 0.625 of the walk
  const { m, p1, p2 } = duel('unit1', 40);
  let now = 1000, until = p2.hitStunUntil; const lengths = [], slow = [], free = [];
  for (let i = 0; i < 3000 / TICK_RATE_MS; i += 1) {
    const walk = emptyInput(); walk.moveZ = 1;
    const z0 = p2.pos.z, stunned = now < p2.hitStunUntil;
    tickMatch(m, { p1: fire(), p2: walk }, now, TICK_DT, []);
    p1.ammo = Math.max(p1.ammo, 2);
    if (i > 30) (stunned ? slow : free).push((p2.pos.z - z0) / TICK_DT);
    if (p2.hitStunUntil !== until) { until = p2.hitStunUntil; lengths.push(until - now); }
    now += TICK_RATE_MS;
  }
  assert.ok(lengths.length >= 10, 'stuns ' + lengths.length);
  for (const l of lengths) assert.equal(l, 50);
  const mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  assert.ok(slow.length >= 10 && free.length >= 10, `${slow.length} stunned ticks, ${free.length} free`);
  assert.ok(Math.abs(mid(free) - UNIT_DATA.unit1.walkSpeed) < 0.01, 'walk ' + mid(free));
  assert.ok(Math.abs(mid(slow) - UNIT_DATA.unit1.walkSpeed * 0.625) < 0.01, 'stunned walk ' + mid(slow));
});

// One round from a recovered cone (Fubuki's: a 0 base, so it flies the aim line) at a unit sprinting square across that line.
// The round is aimed at where the sprinter is and takes d / 40 ticks, rounded up, to reach it; the sprinter moves 0.47 u a tick
// (29.4 u/s) and its hit capsule is 1.6 u wide to a side — so three ticks of flight hit and four miss: 120 u is the line.
const sprintShot = (dist) => {
  const { m, p1, p2 } = duel('unit10', dist);
  p2.pos.z = -60;                                    // the sprinter runs up to the line of fire from the side, at speed when it crosses
  let now = 1000, fired = false, hit = false, speed = 0;
  for (let i = 0; i < 4000 / TICK_RATE_MS && !(fired && m.projectiles.length === 0 && i > 400); i += 1) {
    const run = emptyInput(); run.moveZ = 1; run.boost = true; p2.boost = p2.unit.boostCap;
    const z0 = p2.pos.z;
    const shoot = !fired && p2.pos.z >= 0;
    const hp = p2.hp;
    tickMatch(m, { p1: shoot ? fire() : emptyInput(), p2: run }, now, TICK_DT, []);
    if (shoot && p1.lastFireAt === now) { fired = true; speed = (p2.pos.z - z0) / TICK_DT; }
    if (p2.hp < hp) hit = true;
    if (fired && m.projectiles.length === 0) break;
    now += TICK_RATE_MS;
  }
  return { fired, hit, speed };
};

test('a sprint across the line of fire no longer slips a straight round inside 120 u: hit at 100, slipped at 130', () => {
  assert.equal(UNIT_DATA.unit10.projectileSpeed * (3 * TICK_DT), 120);                       // three ticks of flight
  const near = sprintShot(100), far = sprintShot(130);
  assert.ok(near.fired && far.fired);
  assert.ok(near.speed > 29 && near.speed < 30, 'sprint ' + near.speed);                     // 29.4 u/s: 0.47 u a tick
  assert.ok(3 * near.speed * TICK_DT < HIT_RADIUS_NORMAL && 4 * near.speed * TICK_DT > HIT_RADIUS_NORMAL);
  assert.equal(near.hit, true);                                                              // (at the 1500 the rifles flew until b1105lo: five ticks to 100 u, a miss)
  assert.equal(far.hit, false);                                                              // the last 15 u of a rifle's 135 lock are still a sprint's
});

// (b1105lt, user 2026-11-27: "change iori cool down after shot from 1sec back to 0.75sec"; a second, 1008 ms a shot, in b1105lo to b1105ls)
test("Iori's beat: three quarters of a second between her shots", () => {
  assert.equal(UNIT_DATA.unit20.firePerMinute, 80);
  assert.equal(UNIT_DATA.unit20.fireCooldownMs, 750);                                        // 1000 in b1105lo to b1105ls
  const { m, p1 } = duel('unit20', 40);
  let now = 1000, last = p1.lastFireAt; const at = [];
  for (let i = 0; i < 4200 / TICK_RATE_MS; i += 1) {
    tickMatch(m, { p1: fire(), p2: emptyInput() }, now, TICK_DT, []);
    if (p1.lastFireAt !== last) { at.push(now); last = p1.lastFireAt; }
    now += TICK_RATE_MS;
  }
  assert.ok(at.length >= 4, 'shots ' + at.length);
  for (let i = 1; i < at.length; i += 1) assert.equal(at[i] - at[i - 1], 752);               // 47 ticks: the first tick 750 ms after the shot
});
