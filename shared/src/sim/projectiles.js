// Projectile system — spawn, homing, sweep, hit detection. Pure-JS port of
// spawnProjectiles + updateProjectileSystem from main.js.

import {
  HOMING_MAX_DEG_PER_FRAME,
  HOMING_CLOSE_RANGE_CUTOFF,
  HOMING_SOFTEN_RANGE,
  HOMING_SOFTEN_DEG_PER_FRAME,
  HIT_RADIUS_NORMAL,
  HIT_HALF_HEIGHT,
  PROJECTILE_TTL_S,
  PROJECTILE_HIT_STUN_MS,
  SHOTGUN_CLUSTER_SPREAD_DISTANCE,
  SHOTGUN_PATTERN,
  BEAM_MAX_LENGTH,
  KEI_CHARGED_DURATION_MS,
  KEI_CHARGED_RADIUS_MULT,
  KEI_BEAM_SWEEP_RATE,
  KEI_BEAM_AIM_DEADZONE,
  KEI_BEAM_MAX_PITCH
} from './constants.js';
import {
  clamp,
  degToRad,
  wrapAngle,
  vec3Sub,
  vec3Length,
  vec3Length2D,
  vec3Dot,
  vec3Normalize,
  applyYawPitch,
  closestPointOnSegment
} from './math.js';
import { createProjectile, nextProjectileId } from './state.js';
import { segmentHitsObstacle, projectileHitsSurface, raycastObstacleDistance } from './physics.js';

// Spawn one or more projectiles for an attacker firing at a target. Pushes
// the new projectiles into matchState.projectiles and emits a 'fired' event.
//
// Returns the array of newly-spawned projectiles for callers that want to
// reference the center pellet (sniper / shotgun).
export function spawnProjectiles(matchState, owner, target) {
  const u = owner.unit;
  // Distance-tiered damage (Aru): tier locked at FIRE time so it always matches
  // what the shooter's laser sight showed — a target crossing a boundary while
  // the bullet flies doesn't change the number. Units without rangeDamage keep
  // their flat damage.
  let shotDamage = u.damage;
  if (u.rangeDamage) {
    const rdDist = Math.hypot(target.pos.x - owner.pos.x, target.pos.z - owner.pos.z);
    shotDamage = rdDist < u.rangeDamage.nearDist ? u.rangeDamage.near
      : rdDist < u.rangeDamage.midDist ? u.rangeDamage.mid : u.damage;
  }
  const baseDirRaw = vec3Sub(target.pos, owner.pos);
  const baseDir = vec3Normalize(baseDirRaw);
  const isShotgun = u.spreadCount > 1;

  // Spawn at chest height: 2.35 modelYOffset (lifts feet→torso) + 0.8 (offset
  // to muzzle, matches offline main.js:674 which adds 0.8 to root.position).
  const spawnOrigin = { x: owner.pos.x, y: owner.pos.y + 3.15, z: owner.pos.z };
  const spawned = [];

  if (isShotgun) {
    // VOLLEY STAMP: the whole shotgun blast is ONE flying object carrying the
    // fixed SHOTGUN_PATTERN (randomly rotated per shot). Pellet hitboxes and
    // visuals both derive from center + pattern × rotation × spread growth,
    // so they can never drift apart; pelletMask tracks which pellets are
    // still alive (individual wall/target deaths, exactly like before).
    // Replaces 8 independent projectiles — 8× fewer objects simulated,
    // serialized, transmitted, parsed, cloned, and rendered (the online
    // "one shotgun lags the match" report). Mirrors offline main.js.
    // Round jitter: sample a DISK (independent per-axis uniforms make a square).
    const jR = (u.spreadAngle * 0.08 / 2) * Math.sqrt(Math.random());
    const jT = Math.random() * Math.PI * 2;
    const yaw = jR * Math.cos(jT);
    const pitch = jR * Math.sin(jT);
    const dir = applyYawPitch(baseDir, yaw, pitch);
    const projectile = createProjectile({
      id: nextProjectileId(),
      ownerId: owner.id,
      targetId: target.id,
      pos: spawnOrigin,
      vel: { x: dir.x * u.projectileSpeed, y: dir.y * u.projectileSpeed, z: dir.z * u.projectileSpeed },
      damage: shotDamage,             // per PELLET, as before
      homing: owner.redLock,          // homing steers the volley as one; the
                                      // rigid pattern makes clumping impossible
      ttl: PROJECTILE_TTL_S,
      hitStunMs: u.stun?.ms ?? PROJECTILE_HIT_STUN_MS,
      hitStunScale: u.stun?.moveScale ?? 0.25
    });
    projectile.pelletMask = (1 << SHOTGUN_PATTERN.length) - 1;
    projectile.volleyRot = Math.random() * Math.PI * 2;
    projectile.spawnX = spawnOrigin.x;
    projectile.spawnY = spawnOrigin.y;
    projectile.spawnZ = spawnOrigin.z;
    spawned.push(projectile);
    matchState.projectiles.push(projectile);
  } else {
    // horizontalAngle: extra HORIZONTAL-only random scatter, active only when
    // the target is beyond horizontalTriggerRange at fire time (same
    // fire-time-distance convention as rangeDamage). Inside the trigger
    // range the gun keeps its plain spreadAngle accuracy. Mirrors offline.
    const haDist = Math.hypot(target.pos.x - owner.pos.x, target.pos.z - owner.pos.z);
    const ha = (u.horizontalAngle && haDist > (u.horizontalTriggerRange ?? 0)) ? u.horizontalAngle : 0;
    for (let i = 0; i < u.spreadCount; i += 1) {
      // SA is a truly ROUND cone: sample a disk (angle + sqrt-radius) —
      // independent per-axis uniforms would fill a SQUARE. HA then adds its
      // horizontal-only scatter on top.
      const saR = (u.spreadAngle / 2) * Math.sqrt(Math.random());
      const saT = Math.random() * Math.PI * 2;
      const yaw = saR * Math.cos(saT) + (Math.random() - 0.5) * ha;
      const pitch = saR * Math.sin(saT);
      const dir = applyYawPitch(baseDir, yaw, pitch);
      const projectile = createProjectile({
        id: nextProjectileId(),
        ownerId: owner.id,
        targetId: target.id,
        pos: spawnOrigin,
        vel: { x: dir.x * u.projectileSpeed, y: dir.y * u.projectileSpeed, z: dir.z * u.projectileSpeed },
        damage: shotDamage,
        homing: owner.redLock,
        ttl: PROJECTILE_TTL_S,
        hitStunMs: u.stun?.ms ?? PROJECTILE_HIT_STUN_MS,
        hitStunScale: u.stun?.moveScale ?? 0.25
      });
      if (u.beamBolt) {
        // Aris laser bolt: the hitbox is a thin beamBolt.length-long cylinder
        // that GROWS OUT of the muzzle — clipped to the distance flown from
        // the spawn point, so it never reaches behind the muzzle. The client
        // renders the matching cyan visual from the same unit entry. Mirrors
        // offline main.js.
        projectile.boltLen = u.beamBolt.length;
        projectile.boltRadius = u.beamBolt.radius;
        projectile.spawnX = spawnOrigin.x;
        projectile.spawnY = spawnOrigin.y;
        projectile.spawnZ = spawnOrigin.z;
      }
      spawned.push(projectile);
      matchState.projectiles.push(projectile);
    }
  }

  matchState.events.push({
    type: 'fired',
    ownerId: owner.id,
    weapon: u.id,
    redLock: owner.redLock,
    spawnIds: spawned.map((p) => p.id)
  });

  return spawned;
}

// Per-tick projectile update. Pure-JS port of updateProjectileSystem.
// Mutates matchState.projectiles and matchState.fighters[targetId].
export function tickProjectiles(matchState, dt, now, obstacles, surfaces, damageScaler = null) {
  const projectiles = matchState.projectiles;

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const p = projectiles[i];
    p.ttl -= dt;
    if (p.ttl <= 0) {
      _despawn(matchState, projectiles, i, p, 'expire');
      continue;
    }

    // Shotgun VOLLEY: one object, whole pattern — dedicated handler.
    if (p.pelletMask !== undefined) {
      _tickVolley(matchState, projectiles, i, p, dt, now, obstacles, surfaces, damageScaler);
      continue;
    }

    const target = matchState.fighters[p.targetId];
    if (!target) {
      // Target id no longer resolves (snap rebuild, swap, etc.) — give up.
      _despawn(matchState, projectiles, i, p, 'expire');
      continue;
    }
    // Target died mid-flight (or this is a bullet fired the same tick the
    // target died on a different bullet's hit). Don't despawn — keep the
    // bullet flying so the player sees it. Just disable homing; the dead
    // body's hit volume is also gated below so the bullet won't "hit" a
    // corpse.
    if (target.hp <= 0) {
      p.homing = false;
      p.homingLost = true;
    }

    // Chest-height anchor (matches projectile spawn at owner.pos.y + 3.15).
    // All target-distance logic — homing close-range cutoff, homing turn
    // direction, and final hit-sphere — measures from here, not from the
    // feet-level target.pos, so HOMING_CLOSE_RANGE_CUTOFF (2.6 m) and
    // HIT_RADIUS both keep their intended meaning after the spawn lift.
    const hitCenter = { x: target.pos.x, y: target.pos.y + 2.35, z: target.pos.z };

    const toTarget = vec3Sub(hitCenter, p.pos);
    if (vec3Length(toTarget) <= HOMING_CLOSE_RANGE_CUTOFF) {
      p.homing = false;
      p.homingLost = true;
    }
    if (!p.homingLost && vec3Dot(p.vel, toTarget) < 0) {
      p.homing = false;
      p.homingLost = true;
    }

    if (p.homing && !p.homingLost && now >= target.evadeHomingUntil) {
      const desiredAngle = Math.atan2(toTarget.z, toTarget.x);
      const currentAngle = Math.atan2(p.vel.z, p.vel.x);
      const distToTarget = vec3Length(toTarget);
      const turnDeg = distToTarget <= HOMING_SOFTEN_RANGE
        ? HOMING_SOFTEN_DEG_PER_FRAME
        : HOMING_MAX_DEG_PER_FRAME;
      const maxTurn = degToRad(turnDeg);
      const wrapped = wrapAngle(desiredAngle - currentAngle);
      const turn = clamp(wrapped, -maxTurn, maxTurn);
      const speed = vec3Length(p.vel);
      const nextAngle = currentAngle + turn;
      p.vel.x = Math.cos(nextAngle) * speed;
      p.vel.z = Math.sin(nextAngle) * speed;
    }

    const prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;

    // Hit geometry, computed BEFORE the wall/surface sweep so that sweep can be
    // clipped to the target's hit point. Without the clip, the swept wall test
    // spans the full per-frame step (~34 u at 2000 u/s) and despawns the round
    // on a wall *behind* the target — eating a shot that reaches the target
    // first (the close-range "phantom dodge"). Capsule volume matches the tall
    // billboard: free vertical travel within ±HIT_HALF_HEIGHT of the chest-
    // anchored center, then sphere falloff at hitRadius. Mirrors offline main.js.
    const hitRadius = HIT_RADIUS_NORMAL + (p.boltRadius || 0);
    // Laser bolts hit with their whole trailing body, not just the nose:
    // extend the swept segment backward by the body extended so far (grows
    // out of the muzzle — never reaches behind the spawn point).
    let segStart = prevPos;
    if (p.boltLen) {
      const spd = vec3Length(p.vel) || 1;
      const sdx = prevPos.x - p.spawnX;
      const sdy = prevPos.y - p.spawnY;
      const sdz = prevPos.z - p.spawnZ;
      const prevBody = Math.min(p.boltLen, Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz));
      segStart = {
        x: prevPos.x - (p.vel.x / spd) * prevBody,
        y: prevPos.y - (p.vel.y / spd) * prevBody,
        z: prevPos.z - (p.vel.z / spd) * prevBody
      };
    }
    const nearest = closestPointOnSegment(segStart, p.pos, hitCenter);
    const dx = nearest.x - hitCenter.x;
    const dy = Math.max(0, Math.abs(nearest.y - hitCenter.y) - HIT_HALF_HEIGHT);
    const dz = nearest.z - hitCenter.z;
    // Spawn protection / step (dodge) immunity / friendly-fire (2v2) / dead
    // target: the round passes through in each of these cases.
    const owner = matchState.fighters[p.ownerId];
    const sameTeam = owner?.team && target.team && owner.team === target.team;
    const botHit = target.hp > 0 && !sameTeam && now >= target.invulnerableUntil && now > target.stepUntil && dx * dx + dy * dy + dz * dz < hitRadius * hitRadius;
    // Clip the wall/surface sweep to the hit point when the target is hit this
    // frame, so obstacles beyond the target don't despawn the round first. When
    // the target isn't hit (or passes through), sweep the full step as before.
    const sweepEnd = botHit ? nearest : p.pos;

    // Swept obstacle hit (skip noProjectile-tagged obstacles).
    let killed = false;
    for (let j = 0; j < obstacles.length; j += 1) {
      const o = obstacles[j];
      if (o.noProjectile) continue;
      if (!segmentHitsObstacle(prevPos, sweepEnd, o)) continue;
      _despawn(matchState, projectiles, i, p, 'obstacle');
      killed = true;
      break;
    }
    if (killed) continue;

    if (projectileHitsSurface(prevPos, sweepEnd, surfaces)) {
      _despawn(matchState, projectiles, i, p, 'surface');
      continue;
    }

    // Apply the hit resolved above (botHit): closest-point distance from the
    // target's chest-anchored body to the round's traveled segment, gated for
    // pass-through cases. See the hit-geometry block above. Mirrors offline.
    if (botHit) {
      const damage = damageScaler ? damageScaler(p) : p.damage;
      target.hp = Math.max(0, target.hp - damage);
      // Per-weapon stun, lowest-move-scale-wins: apply when the target is free
      // OR the new stun is strictly heavier (lower move-scale), taking its own
      // duration even if shorter. Mirrors offline main.js.
      if (now >= target.hitStunUntil || p.hitStunScale < target.hitStunScale) {
        target.hitStunScale = p.hitStunScale;
        target.hitStunUntil = now + p.hitStunMs;
      }
      target.momentumVX = 0;
      target.momentumVZ = 0;
      target.vel.x = 0;
      target.vel.y = 0;
      target.vel.z = 0;
      matchState.events.push({
        type: 'hit',
        ownerId: p.ownerId,
        targetId: p.targetId,
        damage,
        targetHp: target.hp,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z }
      });
      _despawn(matchState, projectiles, i, p, 'hit');
    }
  }
}

function _despawn(matchState, projectiles, idx, p, reason) {
  projectiles.splice(idx, 1);
  matchState.events.push({ type: 'despawn', id: p.id, reason });
}

// ---------------------------------------------------------------------------
// Shotgun VOLLEY — one flying object per trigger pull carrying the whole
// SHOTGUN_PATTERN. Pellets exist only as pattern slots: pelletMask says which
// are alive; hitboxes AND visuals derive from the same formula below, so they
// can never drift apart. Per-pellet wall/target deaths are preserved exactly.
// ---------------------------------------------------------------------------

// Pattern-plane axes from the volley's CURRENT velocity: `right` is the
// horizontal perpendicular, `up` completes the frame (straight +Y for level
// flight). Under future homing the pattern keeps facing the flight direction,
// so the rigid formation can curve as one — clumping is geometrically
// impossible. Shared by the sim, the offline renderer, and the online mirror.
export function volleyAxes(vel) {
  const pl = Math.hypot(vel.x, vel.z) || 1;
  const rX = -vel.z / pl;
  const rZ = vel.x / pl;
  let uX = -rZ * vel.y;
  let uY = rZ * vel.x - rX * vel.z;
  let uZ = rX * vel.y;
  const ul = Math.hypot(uX, uY, uZ) || 1;
  return { rX, rZ, uX: uX / ul, uY: uY / ul, uZ: uZ / ul };
}

// World-space offset of pattern slot k: pattern point, rotated by the
// volley's per-shot rotation, laid onto the axes, scaled by spread growth.
export function volleyPelletOffset(k, axes, rot, factor) {
  const px = SHOTGUN_PATTERN[k][0];
  const py = SHOTGUN_PATTERN[k][1];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const rx2 = px * c - py * s;
  const ry2 = px * s + py * c;
  return {
    x: (axes.rX * rx2 + axes.uX * ry2) * factor,
    y: (axes.uY * ry2) * factor,
    z: (axes.rZ * rx2 + axes.uZ * ry2) * factor
  };
}

// Spread growth 0→1 over SHOTGUN_CLUSTER_SPREAD_DISTANCE units from the
// spawn point (straight-line — identical on sim and clients).
export function volleySpreadFactor(p) {
  const dx = p.pos.x - p.spawnX;
  const dy = p.pos.y - p.spawnY;
  const dz = p.pos.z - p.spawnZ;
  return Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / SHOTGUN_CLUSTER_SPREAD_DISTANCE);
}

function _tickVolley(matchState, projectiles, i, p, dt, now, obstacles, surfaces, damageScaler) {
  const target = matchState.fighters[p.targetId];
  if (!target) {
    _despawn(matchState, projectiles, i, p, 'expire');
    return;
  }
  if (target.hp <= 0) {
    p.homing = false;
    p.homingLost = true;
  }

  // Homing steers the VOLLEY (same rules/cutoffs as single projectiles);
  // the pattern rides along rigidly.
  const hitCenter = { x: target.pos.x, y: target.pos.y + 2.35, z: target.pos.z };
  const toTarget = vec3Sub(hitCenter, p.pos);
  if (vec3Length(toTarget) <= HOMING_CLOSE_RANGE_CUTOFF) {
    p.homing = false;
    p.homingLost = true;
  }
  if (!p.homingLost && vec3Dot(p.vel, toTarget) < 0) {
    p.homing = false;
    p.homingLost = true;
  }
  if (p.homing && !p.homingLost && now >= target.evadeHomingUntil) {
    const desiredAngle = Math.atan2(toTarget.z, toTarget.x);
    const currentAngle = Math.atan2(p.vel.z, p.vel.x);
    const distToTarget = vec3Length(toTarget);
    const turnDeg = distToTarget <= HOMING_SOFTEN_RANGE
      ? HOMING_SOFTEN_DEG_PER_FRAME
      : HOMING_MAX_DEG_PER_FRAME;
    const maxTurn = degToRad(turnDeg);
    const wrapped = wrapAngle(desiredAngle - currentAngle);
    const turn = clamp(wrapped, -maxTurn, maxTurn);
    const speed = vec3Length(p.vel);
    const nextAngle = currentAngle + turn;
    p.vel.x = Math.cos(nextAngle) * speed;
    p.vel.z = Math.sin(nextAngle) * speed;
  }

  const prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.pos.z += p.vel.z * dt;

  const factor = volleySpreadFactor(p);
  const axes = volleyAxes(p.vel);
  const owner = matchState.fighters[p.ownerId];
  const sameTeam = owner?.team && target.team && owner.team === target.team;
  const targetable = target.hp > 0 && !sameTeam
    && now >= target.invulnerableUntil && now > target.stepUntil;

  // Each alive pellet flies its own swept segment this tick: target-capsule
  // test first (clipping the wall sweep to the hit point, like the single-
  // projectile path), then walls, then surfaces. Deaths clear its mask bit.
  let pelletsHit = 0;
  for (let k = 0; k < SHOTGUN_PATTERN.length; k += 1) {
    if (!(p.pelletMask & (1 << k))) continue;
    const off = volleyPelletOffset(k, axes, p.volleyRot, factor);
    const a = { x: prevPos.x + off.x, y: prevPos.y + off.y, z: prevPos.z + off.z };
    const b = { x: p.pos.x + off.x, y: p.pos.y + off.y, z: p.pos.z + off.z };
    let hitThis = false;
    let sweepEnd = b;
    if (targetable) {
      const nearest = closestPointOnSegment(a, b, hitCenter);
      const hdx = nearest.x - hitCenter.x;
      const hdy = Math.max(0, Math.abs(nearest.y - hitCenter.y) - HIT_HALF_HEIGHT);
      const hdz = nearest.z - hitCenter.z;
      if (hdx * hdx + hdy * hdy + hdz * hdz < HIT_RADIUS_NORMAL * HIT_RADIUS_NORMAL) {
        hitThis = true;
        sweepEnd = nearest;
      }
    }
    let dead = false;
    for (let j = 0; j < obstacles.length; j += 1) {
      const o = obstacles[j];
      if (o.noProjectile) continue;
      if (!segmentHitsObstacle(a, sweepEnd, o)) continue;
      dead = true;
      hitThis = false;   // the wall was in front of the hit point
      break;
    }
    if (!dead && projectileHitsSurface(a, sweepEnd, surfaces)) {
      dead = true;
      hitThis = false;
    }
    if (hitThis) {
      pelletsHit += 1;
      dead = true;       // pellets despawn on hit, as before
    }
    if (dead) p.pelletMask &= ~(1 << k);
  }

  if (pelletsHit > 0) {
    const per = damageScaler ? damageScaler(p) : p.damage;
    const damage = per * pelletsHit;
    target.hp = Math.max(0, target.hp - damage);
    if (now >= target.hitStunUntil || p.hitStunScale < target.hitStunScale) {
      target.hitStunScale = p.hitStunScale;
      target.hitStunUntil = now + p.hitStunMs;
    }
    target.momentumVX = 0;
    target.momentumVZ = 0;
    target.vel.x = 0;
    target.vel.y = 0;
    target.vel.z = 0;
    matchState.events.push({
      type: 'hit',
      ownerId: p.ownerId,
      targetId: p.targetId,
      damage,
      targetHp: target.hp,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z }
    });
  }

  if (p.pelletMask === 0) _despawn(matchState, projectiles, i, p, 'obstacle');
}

// ---------------------------------------------------------------------------
// 照射ビーム (Kei). An instant hitscan laser: on fire a wide line appears from
// the muzzle along the aim, clipped to the first wall, and lives for durationMs.
// Each enemy takes the unit's damage ONCE during that window (re-hittable only
// by a new beam) — so a dodge avoids it only if the enemy is out of the line
// (or still i-framed) when the window ends. The beam lives in matchState.beams,
// which is shipped in the snapshot; the client draws it from there (state-driven)
// so a dropped snapshot can't lose the visual. A 'beam-fired' event is still
// emitted for telemetry/tests but the client no longer renders off it.
// ---------------------------------------------------------------------------
let _beamSeq = 0;
export function spawnBeam(matchState, owner, target, now, obstacles) {
  if (!matchState.beams) matchState.beams = []; // predicted states clone from a beam-less snapshot
  const u = owner.unit;
  const origin = { x: owner.pos.x, y: owner.pos.y + 3.15, z: owner.pos.z };
  // Level aim toward the target (feet→feet ⇒ dy = 0), same as the projectile.
  const dir = vec3Normalize(vec3Sub(target.pos, owner.pos));
  const length = raycastObstacleDistance(origin, dir, BEAM_MAX_LENGTH, obstacles || []);
  const radius = u.beam?.radius ?? HIT_RADIUS_NORMAL;
  const durationMs = u.beam?.durationMs ?? 500;
  matchState.beams.push({
    id: (_beamSeq = (_beamSeq + 1) >>> 0),   // monotonic; client draws each beam's mesh once
    ownerId: owner.id,
    team: owner.team,
    ox: origin.x, oy: origin.y, oz: origin.z,
    dx: dir.x, dy: dir.y, dz: dir.z,
    length, radius,
    expiresAt: now + durationMs,
    damage: u.damage,
    hitStunMs: u.stun?.ms ?? PROJECTILE_HIT_STUN_MS,
    hitStunScale: u.stun?.moveScale ?? 0.25,
    hitIds: []
  });
  matchState.events.push({
    type: 'beam-fired', ownerId: owner.id,
    ox: origin.x, oy: origin.y, oz: origin.z,
    dx: dir.x, dy: dir.y, dz: dir.z,
    length, radius, durationMs
  });
}

// Perpendicular distance (XZ) from a point to the beam's clamped segment. The
// beam is level so Y is ignored (the tall capsule always overlaps it on ground).
function beamPerpDistXZ(b, px, pz) {
  let t = (px - b.ox) * b.dx + (pz - b.oz) * b.dz;
  if (t < 0) t = 0; else if (t > b.length) t = b.length;
  const cx = b.ox + b.dx * t;
  const cz = b.oz + b.dz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Per-tick beam update: expire, then one-hit damage to any enemy in the line.
export function tickBeams(matchState, now, damageScaler = null) {
  const beams = matchState.beams;
  if (!beams || beams.length === 0) return;
  const fighters = Object.values(matchState.fighters);
  for (let i = beams.length - 1; i >= 0; i -= 1) {
    const b = beams[i];
    if (now >= b.expiresAt) { beams.splice(i, 1); continue; }
    // Real cylinder hit volume: the beam's drawn 3D line vs each enemy's capsule
    // (HIT_HALF_HEIGHT vertical free band + HIT_RADIUS_NORMAL radius — the same
    // body model projectiles use). Replaces the old height-agnostic XZ "wall".
    const bA = { x: b.ox, y: b.oy, z: b.oz };
    const bB = { x: b.ox + b.dx * b.length, y: b.oy + b.dy * b.length, z: b.oz + b.dz * b.length };
    const rrN = b.radius + HIT_RADIUS_NORMAL;
    for (const f of fighters) {
      if (f.hp <= 0 || f.id === b.ownerId) continue;
      if (b.hitIds.includes(f.id)) continue;
      if (b.team && f.team && b.team === f.team) continue;   // friendly fire off
      if (now < f.invulnerableUntil) continue;               // spawn protection
      if (now <= f.stepUntil) continue;                      // dodge i-frames
      const hc = { x: f.pos.x, y: f.pos.y + 2.35, z: f.pos.z };
      const near = closestPointOnSegment(bA, bB, hc);
      const vdy = Math.max(0, Math.abs(near.y - hc.y) - HIT_HALF_HEIGHT);
      const hdx = near.x - hc.x, hdz = near.z - hc.z;
      if (hdx * hdx + vdy * vdy + hdz * hdz >= rrN * rrN) continue;
      const damage = damageScaler ? damageScaler(b) : b.damage;
      f.hp = Math.max(0, f.hp - damage);
      if (now >= f.hitStunUntil || b.hitStunScale < f.hitStunScale) {
        f.hitStunScale = b.hitStunScale;
        f.hitStunUntil = now + b.hitStunMs;
      }
      f.momentumVX = 0; f.momentumVZ = 0;
      f.vel.x = 0; f.vel.y = 0; f.vel.z = 0;
      b.hitIds.push(f.id);
      matchState.events.push({
        type: 'hit', ownerId: b.ownerId, targetId: f.id, damage, targetHp: f.hp,
        pos: { x: f.pos.x, y: f.pos.y, z: f.pos.z }
      });
    }
    _deleteProjectilesInBeam(matchState, b, b.radius);   // #1: laser deletes projectiles it touches
  }
}

// Despawn any projectile whose position lies within the beam volume (XZ).
function _deleteProjectilesInBeam(matchState, b, radius) {
  for (let i = matchState.projectiles.length - 1; i >= 0; i -= 1) {
    const p = matchState.projectiles[i];
    if (beamPerpDistXZ(b, p.pos.x, p.pos.z) >= radius) continue;
    matchState.projectiles.splice(i, 1);
    matchState.events.push({ type: 'despawn', id: p.id, reason: 'beam' });
  }
}

// ---------------------------------------------------------------------------
// Kei full-charge SWEEP CHANNEL (照射ビーム) — server-authoritative. The owner is
// locked (applyInput/tickBot); the beam steers toward the aim and damages each
// fighter once over KEI_CHARGED_DURATION_MS, deleting projectiles it touches.
// State (chargedBeamUntil/DirX/DirZ) rides the fighter snapshot so the client
// renders it each frame. Mirrors offline updateChargedBeams.
// ---------------------------------------------------------------------------
export function startChargedBeam(matchState, owner, target, now) {
  // Ammo (and lastFireAt) are already paid by tickSniperCharge for every sniper
  // fire before this call, so we must NOT decrement ammo again here — doing so
  // double-spent ammo on the charged path online (the quick-beam and regular
  // sniper paths never decrement here either; they rely on tickSniperCharge).
  // Level aim toward the target (degenerate → due +X).
  let dx = target.pos.x - owner.pos.x;
  let dz = target.pos.z - owner.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) { dx = 1; dz = 0; } else { dx /= len; dz /= len; }
  owner.chargedBeamUntil = now + KEI_CHARGED_DURATION_MS;
  // Cooldown pauses during the channel and starts at its end: park lastFireAt at
  // the scheduled end so the charge-init gate blocks a re-charge until end +
  // cooldown even on the expiry frame (applyInput runs before tickChargedBeams).
  // endChargedBeamShared overwrites it with the real end on an early cancel.
  owner.lastFireAt = owner.chargedBeamUntil;
  owner.chargedBeamDirX = dx;
  owner.chargedBeamDirZ = dz;
  // Start the vertical aim pointed at the target's height (so the channel opens
  // on-target); the player can then sweep it up/down. Bots re-aim it each tick.
  owner.chargedBeamPitch = clamp(Math.atan2(target.pos.y - owner.pos.y, len), -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
  owner.chargedBeamHitIds = [];
}

function endChargedBeamShared(f, now) {
  f.chargedBeamUntil = 0;
  f.lastFireAt = now;           // cooldown resumes from here
  f.chargedBeamHitIds = [];
}

// Vertical aim (rise per unit of XZ travel) toward the nearest enemy, clamped.
// Mirrors the client's orientChargedBeamVisual so the charged-beam hit cylinder
// tilts the same way the beam is drawn.
function chargedBeamTanY(matchState, owner) {
  let best = null, bestD = Infinity;
  for (const e of Object.values(matchState.fighters)) {
    if (e.id === owner.id || e.hp <= 0) continue;
    if (owner.team && e.team && owner.team === e.team) continue;
    const ex = e.pos.x - owner.pos.x, ez = e.pos.z - owner.pos.z;
    const d = ex * ex + ez * ez;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return 0;
  const horiz = Math.sqrt(bestD);
  if (horiz < 1e-3) return 0;
  return clamp((best.pos.y - owner.pos.y) / horiz, -2, 2);
}

export function tickChargedBeams(matchState, inputs, botSet, now, dt, obstacles) {
  const fighters = Object.values(matchState.fighters);
  for (const f of fighters) {
    if (!(f.chargedBeamUntil > now)) continue;
    const u = f.unit;
    // --- Steer (capped rate). The bot auto-aims yaw+pitch at its target; the
    // player drives a twin-axis turret: aimX = horizontal sweep, aimY = pitch. ---
    const maxStep = KEI_BEAM_SWEEP_RATE * dt;
    const curAngle = Math.atan2(f.chargedBeamDirZ, f.chargedBeamDirX);
    if (botSet && botSet.has(f.id)) {
      let targetAngle = curAngle;
      const tgt = matchState.fighters[f.targetId];
      if (tgt && tgt.hp > 0) {
        const ax = tgt.pos.x - f.pos.x;
        const az = tgt.pos.z - f.pos.z;
        if (ax * ax + az * az > 1e-4) targetAngle = Math.atan2(az, ax);
      }
      let delta = targetAngle - curAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const newAngle = curAngle + clamp(delta, -maxStep, maxStep);
      f.chargedBeamDirX = Math.cos(newAngle);
      f.chargedBeamDirZ = Math.sin(newAngle);
      // Vertical: aim at the target's height (the bot's beam tracks elevation).
      f.chargedBeamPitch = clamp(Math.atan(chargedBeamTanY(matchState, f)), -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
    } else {
      const input = inputs[f.id];
      if (input && (input.boost || input.sprintLocked)) { endChargedBeamShared(f, now); continue; } // sprint cancels
      const aimX = input ? input.aimX : 0;
      const aimY = input ? input.aimY : 0;
      if (Math.abs(aimX) > KEI_BEAM_AIM_DEADZONE) {
        const newAngle = curAngle + aimX * maxStep;   // horizontal sweep
        f.chargedBeamDirX = Math.cos(newAngle);
        f.chargedBeamDirZ = Math.sin(newAngle);
      }
      if (Math.abs(aimY) > KEI_BEAM_AIM_DEADZONE) {     // vertical (pitch) sweep
        f.chargedBeamPitch = clamp(f.chargedBeamPitch - aimY * maxStep, -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
      }
    }
    // --- Geometry ---
    const origin = { x: f.pos.x, y: f.pos.y + 3.15, z: f.pos.z };
    const dir = { x: f.chargedBeamDirX, y: 0, z: f.chargedBeamDirZ };
    const length = raycastObstacleDistance(origin, dir, BEAM_MAX_LENGTH, obstacles || []);
    const radius = (u.beam?.radius ?? HIT_RADIUS_NORMAL) * KEI_CHARGED_RADIUS_MULT;
    const beam = { ox: origin.x, oz: origin.z, dx: f.chargedBeamDirX, dz: f.chargedBeamDirZ, length };
    // Real cylinder: tilt the hit line to the steered pitch (same as the drawn
    // beam) and test each enemy's capsule against it, not an XZ wall.
    const tanY = Math.tan(f.chargedBeamPitch);
    const cA = { x: origin.x, y: origin.y, z: origin.z };
    const cB = { x: origin.x + f.chargedBeamDirX * length, y: origin.y + tanY * length, z: origin.z + f.chargedBeamDirZ * length };
    const rrC = radius + HIT_RADIUS_NORMAL;
    // --- One hit per fighter ---
    if (!f.chargedBeamHitIds) f.chargedBeamHitIds = [];
    for (const t of fighters) {
      if (t.id === f.id || t.hp <= 0) continue;
      if (f.chargedBeamHitIds.includes(t.id)) continue;
      if (f.team && t.team && f.team === t.team) continue;
      if (now < t.invulnerableUntil || now <= t.stepUntil) continue;
      const hc = { x: t.pos.x, y: t.pos.y + 2.35, z: t.pos.z };
      const near = closestPointOnSegment(cA, cB, hc);
      const vdy = Math.max(0, Math.abs(near.y - hc.y) - HIT_HALF_HEIGHT);
      const hdx = near.x - hc.x, hdz = near.z - hc.z;
      if (hdx * hdx + vdy * vdy + hdz * hdz >= rrC * rrC) continue;
      // The charged sweep channel hits softer than the quick beam / normal shot.
      const damage = u.beam?.chargedDamage ?? u.damage;
      t.hp = Math.max(0, t.hp - damage);
      if (now >= t.hitStunUntil || (u.stun?.moveScale ?? 0.25) < t.hitStunScale) {
        t.hitStunScale = u.stun?.moveScale ?? 0.25;
        t.hitStunUntil = now + (u.stun?.ms ?? PROJECTILE_HIT_STUN_MS);
      }
      t.momentumVX = 0; t.momentumVZ = 0;
      t.vel.x = 0; t.vel.y = 0; t.vel.z = 0;
      f.chargedBeamHitIds.push(t.id);
      matchState.events.push({
        type: 'hit', ownerId: f.id, targetId: t.id, damage, targetHp: t.hp,
        pos: { x: t.pos.x, y: t.pos.y, z: t.pos.z }
      });
    }
    _deleteProjectilesInBeam(matchState, beam, radius);
  }
  // End expired channels (cooldown starts here).
  for (const f of fighters) {
    if (f.chargedBeamUntil > 0 && !(f.chargedBeamUntil > now)) endChargedBeamShared(f, now);
  }
}
