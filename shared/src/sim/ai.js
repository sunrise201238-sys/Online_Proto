// Bot AI — pure-JS port of updateEnemy from main.js. Used by the headless
// test harness for bot-vs-bot soak testing. The actual online server only
// runs this if a player slot is unoccupied (e.g. spectator-only modes or
// "fight a bot" mode).
//
// Designed to be agnostic to weapon stats and map layout:
//   - Range bands derive from the unit's lockRange (works for any weapon).
//   - Burst length derives from magCapacity (works for any future mag size).
//   - Obstacle avoidance, LoS firing, and elevation tactics (jumping onto
//     ledges for a high-ground advantage, dropping off them to reset kiting
//     distance) all work from the map's obstacle/surface lists, so re-tuning
//     a map's geometry is enough to re-tune the bot.

import { between } from './math.js';
import { attemptFire, tryStartJump } from './actions.js';
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle } from './physics.js';
import { getArena } from './arena.js';
import { MAX_HP, STEP_BOOST_COST, GROUND_BASE_Y } from './constants.js';

// --- Bot tactical-sprint tunables ---
// Hysteresis: bot only initiates a new sprint burst once boost has refilled
// to BOT_SPRINT_READY_BOOST. This prevents the stutter-step that happens when
// boost barely crosses 0 and is immediately spent again.
const BOT_SPRINT_READY_BOOST = STEP_BOOST_COST;            // 48
const BOT_SPRINT_MIN_BOOST = 8;
const BOT_SPRINT_BURST_MS = 280;
const BOT_SPRINT_BURST_VEL = 17;
const BOT_THREAT_LOOKAHEAD = 14;
const BOT_OBSTACLE_AVOID_RADIUS = 7;
const BOT_OBSTACLE_AVOID_WEIGHT = 1.8;
const BOT_STUCK_MOVED_EPSILON = 0.4;
const BOT_STUCK_TICKS_THRESHOLD = 8;
const BOT_STUCK_PIVOT_MS = 600;
const BOT_LOS_EYE_HEIGHT = 1.6;
const BOT_JUMP_HEIGHT_DIFF = 2.5;

// --- Elevation-kiting tunables ---
// A ledge whose lip rises more than the auto-step height (1.6) above the
// bot's floor can't be walked onto — it needs a jump. The upper bound is
// what a jump arc can actually clear (apex ≈ jumpVelocity² / 2·|gravity|,
// ≈ 5.6 with the default 30 jump velocity), kept conservative for margin.
const BOT_CLIMB_MIN_RISE = 1.7;
const BOT_CLIMB_MAX_RISE = 4.8;
// How far out the bot scans for a ledge to perch on, and how close it has to
// get to that ledge (or to a drop edge) before it commits the jump.
const BOT_PERCH_SEEK_RADIUS = 24;
const BOT_LEDGE_JUMP_REACH = 4.5;
// A floor more than this above base ground means "the bot is on high ground".
const BOT_HIGH_GROUND_MIN_Y = 1.7;
// How far past a surface edge to sample when testing whether stepping off it
// actually drops to lower ground (vs. running straight into a wall).
const BOT_DESCENT_PROBE = 3;
// Weight of the ledge-seek steering when blended into the kiting vector.
const BOT_ELEV_STEER_WEIGHT = 2.4;
// How long after an elevation jump the bot keeps driving toward the ledge so
// the arc lands where it was aimed instead of drifting off on the kiting
// vector. Covers the longest arc (a drop off high ground, ~0.85 s airborne).
const BOT_AIR_STEER_MS = 900;

// Repulsion vector from blocking obstacles within `radius`. Skips obstacles
// the bot is over or under (same skip math as resolveUnitObstacleCollisions),
// and skips `noProjectile`-flagged obstacles since those have a dedicated
// jump handler (e.g. station's platform-edge walls).
function computeBotAvoidance(px, py, pz, obstacles, radius) {
  let rx = 0, rz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    const topBuffer = o.topBuffer ?? 4;
    if (py < o.minY - 2 || py > o.maxY + topBuffer) continue;
    const nx = Math.max(o.minX, Math.min(px, o.maxX));
    const nz = Math.max(o.minZ, Math.min(pz, o.maxZ));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    const d = Math.sqrt(d2);
    if (d > 0.001) {
      const t = 1 - d / radius;
      const strength = t * t;
      rx += (dx / d) * strength;
      rz += (dz / d) * strength;
    } else {
      const dMinX = Math.abs(px - o.minX);
      const dMaxX = Math.abs(o.maxX - px);
      const dMinZ = Math.abs(pz - o.minZ);
      const dMaxZ = Math.abs(o.maxZ - pz);
      const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
      if (minD === dMinX) rx -= 1;
      else if (minD === dMaxX) rx += 1;
      else if (minD === dMinZ) rz -= 1;
      else rz += 1;
    }
  }
  return { rx, rz };
}

// Line-of-sight check using the same swept-AABB math projectiles use, so the
// bot only "sees" through gaps a bullet would actually pass through.
function botHasLineOfSight(p0, p1, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  return true;
}

// Universal burst size for continuous-fire weapons (spreadCount === 1): about
// half the mag per trigger pull, clamped so tiny or huge mags still feel
// right. Derives from magCapacity so re-tuning a weapon re-tunes the bot.
function botBurstSize(unit) {
  if (!unit.magCapacity || unit.magCapacity === Infinity) return 6;
  return Math.max(3, Math.min(20, Math.floor(unit.magCapacity / 2)));
}

// Find the nearest projectile that targets `me`, is within range, and is
// heading toward `me`. Used to decide when to spend boost on an evade.
function findIncomingThreat(matchState, me, range) {
  const r2 = range * range;
  for (const p of matchState.projectiles) {
    if (p.targetId !== me.id) continue;
    const dxp = p.pos.x - me.pos.x;
    const dzp = p.pos.z - me.pos.z;
    if (dxp * dxp + dzp * dzp > r2) continue;
    const dot = (-dxp) * p.vel.x + (-dzp) * p.vel.z;
    if (dot <= 0) continue;
    return p;
  }
  return null;
}

// Scan for the nearest walkable surface whose lip sits a jump-height above
// the bot's floor — a ledge it can hop onto for a high-ground kiting
// advantage. Skips ledges too tall to clear with a jump (those need a ramp)
// and ones level enough to just walk onto. Returns a unit vector toward the
// nearest reachable point on that ledge plus the horizontal distance to it,
// or null if nothing suitable is in range.
function findHighGroundPerch(px, pz, myFloorY, surfaces, searchRadius) {
  let best = null;
  let bestDist = searchRadius;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.maxTop - myFloorY < BOT_CLIMB_MIN_RISE) continue;
    const nx = Math.max(s.minX, Math.min(px, s.maxX));
    const nz = Math.max(s.minZ, Math.min(pz, s.maxZ));
    const rise = s.heightAt(nx, nz) - myFloorY;
    if (rise < BOT_CLIMB_MIN_RISE || rise > BOT_CLIMB_MAX_RISE) continue;
    const ddx = nx - px;
    const ddz = nz - pz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d >= bestDist) continue;
    bestDist = d;
    const inv = d > 1e-3 ? 1 / d : 0;
    best = { toX: ddx * inv, toZ: ddz * inv, dist: d };
  }
  return best;
}

// The bot is standing on a raised surface — find the edge it should run or
// jump off to drop back to lower ground. Prefers the edge most aligned with
// `away` (a direction, usually away from the opponent) and rejects edges
// that just lead into a wall or don't actually descend. Returns a unit
// vector toward that edge plus the distance to it, or null if the bot isn't
// on a droppable surface.
function findDescentDirection(px, pz, myFloorY, surfaces, obstacles, awayX, awayZ) {
  let host = null;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (px < s.minX || px > s.maxX || pz < s.minZ || pz > s.maxZ) continue;
    if (Math.abs(s.heightAt(px, pz) - myFloorY) > 1) continue;
    host = s;
    break;
  }
  if (!host) return null;
  const lowerY = myFloorY - BOT_CLIMB_MIN_RISE;
  const probeY = myFloorY + GROUND_BASE_Y;
  const edges = [
    { x: -1, z: 0, edgeDist: px - host.minX, probeX: host.minX - BOT_DESCENT_PROBE, probeZ: pz },
    { x: 1, z: 0, edgeDist: host.maxX - px, probeX: host.maxX + BOT_DESCENT_PROBE, probeZ: pz },
    { x: 0, z: -1, edgeDist: pz - host.minZ, probeX: px, probeZ: host.minZ - BOT_DESCENT_PROBE },
    { x: 0, z: 1, edgeDist: host.maxZ - pz, probeX: px, probeZ: host.maxZ + BOT_DESCENT_PROBE }
  ];
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (groundHeightAt(e.probeX, e.probeZ, surfaces, myFloorY + 50) > lowerY) continue;
    if (unitOverlapsObstacle(e.probeX, probeY, e.probeZ, obstacles)) continue;
    const score = (e.x * awayX + e.z * awayZ) - e.edgeDist * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = { toX: e.x, toZ: e.z, edgeDist: Math.max(0, e.edgeDist) };
    }
  }
  return best;
}

// Drives the bot's velocity directly (legacy-style — sets vel and fires
// through attemptFire). Mirrors updateEnemy.
export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
  const opponentId = botId === 'p1' ? 'p2' : 'p1';
  const opp = matchState.fighters[opponentId];
  if (!opp) return;

  // Sniper-charge lock: stand still until the charge resolves.
  if (me.sniperChargeTargetId) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }

  const arena = getArena(matchState.mapKey);
  const obstacles = arena.obstacles;
  const surfaces = arena.surfaces;

  const dx = opp.pos.x - me.pos.x;
  const dz = opp.pos.z - me.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dist > 1e-6 ? dx / dist : 1;
  const dirZ = dist > 1e-6 ? dz / dist : 0;
  const sideX = -dirZ;
  const sideZ = dirX;

  // Range bands derived from weapon lockRange — works for any weapon stats.
  const lockRange = me.unit?.lockRange ?? 50;
  const optimalRange = Math.max(8, lockRange * 0.7);
  const lowerRange = Math.max(6, optimalRange - 7);
  const upperRange = optimalRange + 7;

  if (Math.random() > 0.985) me.strafeSign *= -1;
  const retreat = dist < lowerRange ? -0.9 : dist > upperRange ? 0.62 : 0.15;
  let mx = dirX * retreat + sideX * me.strafeSign * 1.05;
  let mz = dirZ * retreat + sideZ * me.strafeSign * 1.05;

  // --- Obstacle avoidance ---
  const avoid = computeBotAvoidance(me.pos.x, me.pos.y, me.pos.z, obstacles, BOT_OBSTACLE_AVOID_RADIUS);
  mx += avoid.rx * BOT_OBSTACLE_AVOID_WEIGHT;
  mz += avoid.rz * BOT_OBSTACLE_AVOID_WEIGHT;
  const mlen = Math.sqrt(mx * mx + mz * mz);
  if (mlen > 1e-3) { mx /= mlen; mz /= mlen; }

  // --- Stuck detection ---
  const dxMoved = me.pos.x - (me.botLastX ?? me.pos.x);
  const dzMoved = me.pos.z - (me.botLastZ ?? me.pos.z);
  const actualMoved = Math.sqrt(dxMoved * dxMoved + dzMoved * dzMoved);
  const triedToMove = Math.abs(me.vel.x) + Math.abs(me.vel.z) > 1;
  if (triedToMove && actualMoved < BOT_STUCK_MOVED_EPSILON) {
    me.botStuckTicks = (me.botStuckTicks ?? 0) + 1;
  } else {
    me.botStuckTicks = 0;
  }
  me.botLastX = me.pos.x;
  me.botLastZ = me.pos.z;
  if ((me.botStuckTicks ?? 0) >= BOT_STUCK_TICKS_THRESHOLD && !((me.botStuckPivotUntil ?? 0) > now)) {
    me.botStuckPivotUntil = now + BOT_STUCK_PIVOT_MS;
    me.strafeSign *= -1;
    me.botStuckTicks = 0;
  }
  if ((me.botStuckPivotUntil ?? 0) > now) {
    mx = sideX * me.strafeSign;
    mz = sideZ * me.strafeSign;
  }

  // --- Tactical sprint state machine ---
  if (me.boost >= BOT_SPRINT_READY_BOOST) me.botSprintReady = true;
  if (me.boost <= 0) me.botSprintReady = false;

  let inBurst = (me.botSprintUntil ?? 0) > now;
  if (inBurst && me.boost <= 0) {
    me.botSprintUntil = 0;
    inBurst = false;
  }
  const canStartBurst = !inBurst
    && me.botSprintReady === true
    && me.boost >= BOT_SPRINT_MIN_BOOST
    && now > me.evadeCooldownUntil
    && now >= me.emptyRecoverUntil
    && now >= me.hitStunUntil;

  if (canStartBurst) {
    const threat = findIncomingThreat(matchState, me, BOT_THREAT_LOOKAHEAD);
    if (threat) {
      // Trigger 1: incoming projectile — evade perpendicular.
      const cross = threat.vel.x * sideZ - threat.vel.z * sideX;
      const evadeSign = cross >= 0 ? 1 : -1;
      me.botSprintDirX = sideX * evadeSign;
      me.botSprintDirZ = sideZ * evadeSign;
      me.botSprintUntil = now + BOT_SPRINT_BURST_MS;
      me.evadeCooldownUntil = now + 700;
      me.evadeHomingUntil = now + 240;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (dist < lowerRange) {
      // Trigger 2: opponent too close — burst back to re-open kiting space.
      me.botSprintDirX = -dirX;
      me.botSprintDirZ = -dirZ;
      me.botSprintUntil = now + 240;
      me.evadeCooldownUntil = now + 600;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (me.hp < (me.unit?.hp ?? MAX_HP) * 0.4 && dist < upperRange && Math.random() > 0.85) {
      // Trigger 3: low HP — kite further away.
      let bx = -dirX + sideX * me.strafeSign * 0.5;
      let bz = -dirZ + sideZ * me.strafeSign * 0.5;
      const blen = Math.sqrt(bx * bx + bz * bz) || 1;
      me.botSprintDirX = bx / blen;
      me.botSprintDirZ = bz / blen;
      me.botSprintUntil = now + 320;
      me.evadeCooldownUntil = now + 900;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (dist > upperRange + 6 && Math.random() > 0.94) {
      // Trigger 4: way out of range — sprint TOWARD opponent to close the
      // gap. Makes the bot spend boost offensively, not only defensively.
      me.botSprintDirX = dirX;
      me.botSprintDirZ = dirZ;
      me.botSprintUntil = now + 280;
      me.evadeCooldownUntil = now + 800;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (Math.random() > 0.985) {
      // Trigger 5: occasional unpredictable strafe burst for variance.
      const strafeSign = Math.random() > 0.5 ? 1 : -1;
      let bx = sideX * strafeSign + dirX * 0.25;
      let bz = sideZ * strafeSign + dirZ * 0.25;
      const blen = Math.sqrt(bx * bx + bz * bz) || 1;
      me.botSprintDirX = bx / blen;
      me.botSprintDirZ = bz / blen;
      me.botSprintUntil = now + 220;
      me.evadeCooldownUntil = now + 700;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    }
  }

  // --- Elevation tactics: use jumps and ledges to hold kiting distance.
  // Priority order, highest first:
  //   1. Opponent is on higher ground and in engage range — jump straight at
  //      them so the bot isn't stuck shooting a target it can't reach.
  //   2. Bot is perched but the opponent has closed inside the kiting band
  //      (or climbed up to the same level) — run/jump off the nearest ledge
  //      that opens distance, dropping back down to reset the gap.
  //   3. Bot is on low ground and engaged — climb a nearby ledge for the
  //      high-ground sightline and the vertical separation it buys.
  // Steering toward a ledge is blended into mx/mz; jumps are aimed via
  // jumpDirX/jumpDirZ (default: straight at the opponent, as before).
  const myFloorY = groundHeightAt(me.pos.x, me.pos.z, surfaces, me.pos.y - GROUND_BASE_Y);
  const oppFloorY = groundHeightAt(opp.pos.x, opp.pos.z, surfaces, opp.pos.y - GROUND_BASE_Y);
  const onHighGround = myFloorY > BOT_HIGH_GROUND_MIN_Y;
  const stuckPivoting = (me.botStuckPivotUntil ?? 0) > now;
  let jumpThisTick = false;
  let jumpDirX = dirX;
  let jumpDirZ = dirZ;

  if (me.grounded && !me.airborne && !inBurst && !stuckPivoting) {
    if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF && dist < 32 && Math.random() > 0.5) {
      // 1. Opponent above us — jump at them.
      if (tryStartJump(me, now)) jumpThisTick = true;
    } else if (
      onHighGround
      && dist < upperRange
      && (dist < lowerRange || oppFloorY > myFloorY - BOT_JUMP_HEIGHT_DIFF)
    ) {
      // 2. Pressured on high ground — bail off a ledge to re-open distance.
      const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, -dirX, -dirZ);
      if (exit) {
        mx += exit.toX * BOT_ELEV_STEER_WEIGHT;
        mz += exit.toZ * BOT_ELEV_STEER_WEIGHT;
        const l = Math.sqrt(mx * mx + mz * mz);
        if (l > 1e-3) { mx /= l; mz /= l; }
        if (exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.4) {
          jumpDirX = exit.toX;
          jumpDirZ = exit.toZ;
          if (tryStartJump(me, now)) jumpThisTick = true;
        }
      }
    } else if (!onHighGround && dist < upperRange && dist > lowerRange * 0.55) {
      // 3. On low ground — climb a ledge, unless the only one is back toward
      // the opponent (chasing it would just close the gap we want to keep).
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.toX * dirX + perch.toZ * dirZ < 0.45) {
        mx += perch.toX * BOT_ELEV_STEER_WEIGHT;
        mz += perch.toZ * BOT_ELEV_STEER_WEIGHT;
        const l = Math.sqrt(mx * mx + mz * mz);
        if (l > 1e-3) { mx /= l; mz /= l; }
        if (perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.4) {
          jumpDirX = perch.toX;
          jumpDirZ = perch.toZ;
          if (tryStartJump(me, now)) jumpThisTick = true;
        }
      }
    }
  }

  if (jumpThisTick) {
    // Remember the launch aim so the airborne ticks below keep driving the
    // bot toward the ledge instead of drifting off on the kiting vector.
    me.botAirSteerX = jumpDirX;
    me.botAirSteerZ = jumpDirZ;
    me.botAirSteerUntil = now + BOT_AIR_STEER_MS;
    me.vel.x = jumpDirX * BOT_SPRINT_BURST_VEL;
    me.vel.z = jumpDirZ * BOT_SPRINT_BURST_VEL;
    me.action = 'jump';
  } else if (inBurst) {
    me.vel.x = (me.botSprintDirX ?? 0) * BOT_SPRINT_BURST_VEL;
    me.vel.z = (me.botSprintDirZ ?? 0) * BOT_SPRINT_BURST_VEL;
    me.action = 'dash';
  } else {
    const moveScalar = now < me.hitStunUntil ? 0 : 10.6;
    // Mid elevation-jump: hold the launch heading so the arc lands on (or
    // clears) the ledge it was aimed at instead of drifting on the kiting vec.
    if (me.airborne && (me.botAirSteerUntil ?? 0) > now) {
      mx = me.botAirSteerX ?? mx;
      mz = me.botAirSteerZ ?? mz;
    }
    me.vel.x = mx * moveScalar;
    me.vel.z = mz * moveScalar;
    if (Math.abs(me.vel.x) + Math.abs(me.vel.z) < 0.08) {
      me.vel.x = sideX * 4.5;
      me.vel.z = sideZ * 4.5;
    }
    me.action = 'idle';
  }

  if (dist > 14 && Math.random() > 0.9) me.evadeHomingUntil = now + 90;

  // --- Firing: LoS-aware + universal burst sizing ---
  if (now >= me.nextFireAt) {
    const u = me.unit;
    if (u.magCapacity != null && me.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (me.reloadingUntil || now + u.reloadMs) - now);
      me.nextFireAt = now + wait;
      me.machineBurstRemaining = 0;
    } else if (!botHasLineOfSight(
      { x: me.pos.x, y: me.pos.y + BOT_LOS_EYE_HEIGHT, z: me.pos.z },
      { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
      obstacles
    )) {
      // No clear shot — hold fire and check again shortly.
      me.nextFireAt = now + 220;
      me.machineBurstRemaining = 0;
    } else if (u.sniperCharge) {
      const fired = attemptFire(matchState, me, opp, now);
      if (fired) me.nextFireAt = now + u.fireCooldownMs + between(400, 1200);
      else me.nextFireAt = now + 220;
      me.machineBurstRemaining = 0;
    } else {
      if (u.spreadCount === 1 && me.machineBurstRemaining <= 0) {
        me.machineBurstRemaining = botBurstSize(u);
      }
      const firedAt = me.lastFireAt;
      attemptFire(matchState, me, opp, now);
      const fired = me.lastFireAt !== firedAt;
      if (u.spreadCount === 1) {
        if (fired) me.machineBurstRemaining -= 1;
        me.nextFireAt = me.machineBurstRemaining > 0
          ? now + u.fireCooldownMs
          : now + between(800, 1500);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        if (fired) me.nextFireAt = now + between(1300, 2400);
        else me.nextFireAt = now + 120;
      }
    }
  }
}
