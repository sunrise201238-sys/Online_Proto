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
  BEAM_MAX_LENGTH,
  KEI_CHARGED_DURATION_MS,
  KEI_CHARGED_RADIUS_MULT,
  KEI_BEAM_SWEEP_RATE,
  KEI_BEAM_AIM_DEADZONE
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
  const baseDirRaw = vec3Sub(target.pos, owner.pos);
  const baseDir = vec3Normalize(baseDirRaw);
  const isShotgun = u.spreadCount > 1;
  const centerIndex = isShotgun ? Math.floor(Math.random() * u.spreadCount) : 0;

  // Build cluster offsets (visual jitter so shotgun pellets don't all overlap).
  const shotgunOffsets = [];
  if (isShotgun) {
    const clusterRadius = 3.8;
    for (let i = 0; i < u.spreadCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * clusterRadius;
      shotgunOffsets.push({
        x: Math.cos(angle) * radius,
        y: (Math.random() - 0.5) * radius * 0.7,
        z: Math.sin(angle) * radius
      });
    }
  }

  // Spawn at chest height: 2.35 modelYOffset (lifts feet→torso) + 0.8 (offset
  // to muzzle, matches offline main.js:674 which adds 0.8 to root.position).
  const spawnOrigin = { x: owner.pos.x, y: owner.pos.y + 3.15, z: owner.pos.z };
  const spawned = [];
  let centerPellet = null;

  for (let i = 0; i < u.spreadCount; i += 1) {
    const isCenterPellet = isShotgun && i === centerIndex;
    const spreadScale = isShotgun ? (isCenterPellet ? 0.08 : 0.14) : 1;
    const yaw = (Math.random() - 0.5) * u.spreadAngle * spreadScale;
    const pitch = (Math.random() - 0.5) * u.spreadAngle * 0.35 * spreadScale;
    const dir = applyYawPitch(baseDir, yaw, pitch);

    const homing = owner.redLock && (!isShotgun || isCenterPellet);
    const projectile = createProjectile({
      id: nextProjectileId(),
      ownerId: owner.id,
      targetId: target.id,
      pos: spawnOrigin,
      vel: { x: dir.x * u.projectileSpeed, y: dir.y * u.projectileSpeed, z: dir.z * u.projectileSpeed },
      damage: u.damage,
      homing,
      isCenterPellet: isShotgun ? isCenterPellet : false,
      centerPelletId: null,
      clusterOffset: isShotgun ? shotgunOffsets[i] : null,
      ttl: PROJECTILE_TTL_S,
      hitStunMs: u.stun?.ms ?? PROJECTILE_HIT_STUN_MS,
      hitStunScale: u.stun?.moveScale ?? 0.25
    });
    if (isShotgun && isCenterPellet) {
      // Track total path length on the shotgun's center pellet so non-center
      // pellets can interpolate cluster spread (0 → full) over
      // SHOTGUN_CLUSTER_SPREAD_DISTANCE travel.
      projectile.distTraveled = 0;
    }
    if (isCenterPellet) centerPellet = projectile;
    spawned.push(projectile);
    matchState.projectiles.push(projectile);
  }

  // Wire shotgun pellets to follow the center pellet.
  if (isShotgun && centerPellet) {
    for (let i = 0; i < spawned.length; i += 1) {
      const p = spawned[i];
      if (!p.isCenterPellet) p.centerPelletId = centerPellet.id;
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
  // Rebuild the per-tick id→projectile map for the centerPelletId follow.
  const byId = new Map();
  for (let i = 0; i < projectiles.length; i += 1) byId.set(projectiles[i].id, projectiles[i]);

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const p = projectiles[i];
    p.ttl -= dt;
    if (p.ttl <= 0) {
      _despawn(matchState, projectiles, i, p, 'expire');
      continue;
    }

    // Follow center pellet (shotgun cluster). The cluster offset is scaled
    // by spreadFactor — pellets emerge bunched together at the muzzle and
    // grow to full clusterOffset over SHOTGUN_CLUSTER_SPREAD_DISTANCE world
    // units of travel. spreadFactor reads from the center pellet's
    // distTraveled, which is monotonically non-decreasing, so spread can
    // never shrink even if homing curves the center pellet.
    if (p.centerPelletId != null) {
      const center = byId.get(p.centerPelletId);
      if (!center || center.ttl <= 0) {
        p.centerPelletId = null;
      } else {
        const spreadFactor = Math.min(
          1,
          (center.distTraveled ?? 0) / SHOTGUN_CLUSTER_SPREAD_DISTANCE
        );
        p.vel = { x: center.vel.x, y: center.vel.y, z: center.vel.z };
        p.pos = {
          x: center.pos.x + (p.clusterOffset?.x ?? 0) * spreadFactor,
          y: center.pos.y + (p.clusterOffset?.y ?? 0) * spreadFactor,
          z: center.pos.z + (p.clusterOffset?.z ?? 0) * spreadFactor
        };
      }
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
    // Track total path length on shotgun center pellets so cluster spread
    // can interpolate based on actual distance flown (homing-aware).
    if (p.distTraveled !== undefined) {
      const ddx = p.pos.x - prevPos.x;
      const ddy = p.pos.y - prevPos.y;
      const ddz = p.pos.z - prevPos.z;
      p.distTraveled += Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    }

    // Hit geometry, computed BEFORE the wall/surface sweep so that sweep can be
    // clipped to the target's hit point. Without the clip, the swept wall test
    // spans the full per-frame step (~34 u at 2000 u/s) and despawns the round
    // on a wall *behind* the target — eating a shot that reaches the target
    // first (the close-range "phantom dodge"). Capsule volume matches the tall
    // billboard: free vertical travel within ±HIT_HALF_HEIGHT of the chest-
    // anchored center, then sphere falloff at hitRadius. Mirrors offline main.js.
    const hitRadius = HIT_RADIUS_NORMAL;
    const nearest = closestPointOnSegment(prevPos, p.pos, hitCenter);
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
// 照射ビーム (Kei). An instant hitscan laser: on fire a wide line appears from
// the muzzle along the aim, clipped to the first wall, and lives for durationMs.
// Each enemy takes the unit's damage ONCE during that window (re-hittable only
// by a new beam) — so a dodge avoids it only if the enemy is out of the line
// (or still i-framed) when the window ends. Emits a 'beam-fired' event the
// client renders; the array here is purely server-side for hit detection.
// ---------------------------------------------------------------------------
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
    for (const f of fighters) {
      if (f.hp <= 0 || f.id === b.ownerId) continue;
      if (b.hitIds.includes(f.id)) continue;
      if (b.team && f.team && b.team === f.team) continue;   // friendly fire off
      if (now < f.invulnerableUntil) continue;               // spawn protection
      if (now <= f.stepUntil) continue;                      // dodge i-frames
      if (beamPerpDistXZ(b, f.pos.x, f.pos.z) >= b.radius + HIT_RADIUS_NORMAL) continue;
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
  owner.chargedBeamHitIds = [];
}

function endChargedBeamShared(f, now) {
  f.chargedBeamUntil = 0;
  f.lastFireAt = now;           // cooldown resumes from here
  f.chargedBeamHitIds = [];
}

export function tickChargedBeams(matchState, inputs, botSet, now, dt, obstacles) {
  const fighters = Object.values(matchState.fighters);
  for (const f of fighters) {
    if (!(f.chargedBeamUntil > now)) continue;
    const u = f.unit;
    // --- Steer (point & sweep, capped rate) ---
    const curAngle = Math.atan2(f.chargedBeamDirZ, f.chargedBeamDirX);
    let targetAngle = curAngle;
    if (botSet && botSet.has(f.id)) {
      const tgt = matchState.fighters[f.targetId];
      if (tgt && tgt.hp > 0) {
        const ax = tgt.pos.x - f.pos.x;
        const az = tgt.pos.z - f.pos.z;
        if (ax * ax + az * az > 1e-4) targetAngle = Math.atan2(az, ax);
      }
    } else {
      const input = inputs[f.id];
      if (input && (input.boost || input.sprintLocked)) { endChargedBeamShared(f, now); continue; } // sprint cancels
      if (input && Math.hypot(input.moveX, input.moveZ) > KEI_BEAM_AIM_DEADZONE) {
        targetAngle = Math.atan2(input.moveZ, input.moveX);
      }
    }
    let delta = targetAngle - curAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxStep = KEI_BEAM_SWEEP_RATE * dt;
    const newAngle = curAngle + clamp(delta, -maxStep, maxStep);
    f.chargedBeamDirX = Math.cos(newAngle);
    f.chargedBeamDirZ = Math.sin(newAngle);
    // --- Geometry ---
    const origin = { x: f.pos.x, y: f.pos.y + 3.15, z: f.pos.z };
    const dir = { x: f.chargedBeamDirX, y: 0, z: f.chargedBeamDirZ };
    const length = raycastObstacleDistance(origin, dir, BEAM_MAX_LENGTH, obstacles || []);
    const radius = (u.beam?.radius ?? HIT_RADIUS_NORMAL) * KEI_CHARGED_RADIUS_MULT;
    const beam = { ox: origin.x, oz: origin.z, dx: f.chargedBeamDirX, dz: f.chargedBeamDirZ, length };
    // --- One hit per fighter ---
    if (!f.chargedBeamHitIds) f.chargedBeamHitIds = [];
    for (const t of fighters) {
      if (t.id === f.id || t.hp <= 0) continue;
      if (f.chargedBeamHitIds.includes(t.id)) continue;
      if (f.team && t.team && f.team === t.team) continue;
      if (now < t.invulnerableUntil || now <= t.stepUntil) continue;
      if (beamPerpDistXZ(beam, t.pos.x, t.pos.z) >= radius + HIT_RADIUS_NORMAL) continue;
      const damage = u.damage;
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
