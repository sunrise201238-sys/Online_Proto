// Projectile system — spawn, homing, sweep, hit detection. Pure-JS port of
// spawnProjectiles + updateProjectileSystem from main.js.

import {
  HOMING_MAX_DEG_PER_FRAME,
  HOMING_CLOSE_RANGE_CUTOFF,
  HOMING_SOFTEN_RANGE,
  HOMING_SOFTEN_DEG_PER_FRAME,
  HIT_RADIUS_NORMAL,
  HIT_RADIUS_VULNERABLE,
  HIT_VULNERABILITY_DAMAGE_BONUS,
  PROJECTILE_TTL_S,
  PROJECTILE_HIT_STUN_MS
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
import { segmentHitsObstacle, projectileHitsSurface } from './physics.js';

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

  const spawnOrigin = { x: owner.pos.x, y: owner.pos.y + 0.8, z: owner.pos.z };
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
      hitStunMs: PROJECTILE_HIT_STUN_MS
    });
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

    // Follow center pellet (shotgun cluster).
    if (p.centerPelletId != null) {
      const center = byId.get(p.centerPelletId);
      if (!center || center.ttl <= 0) {
        p.centerPelletId = null;
      } else {
        p.vel = { x: center.vel.x, y: center.vel.y, z: center.vel.z };
        p.pos = {
          x: center.pos.x + (p.clusterOffset?.x ?? 0),
          y: center.pos.y + (p.clusterOffset?.y ?? 0),
          z: center.pos.z + (p.clusterOffset?.z ?? 0)
        };
      }
    }

    const target = matchState.fighters[p.targetId];
    if (!target || target.hp <= 0) {
      _despawn(matchState, projectiles, i, p, 'expire');
      continue;
    }

    const toTarget = vec3Sub(target.pos, p.pos);
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

    // Swept obstacle hit (skip noProjectile-tagged obstacles).
    let killed = false;
    for (let j = 0; j < obstacles.length; j += 1) {
      const o = obstacles[j];
      if (o.noProjectile) continue;
      if (!segmentHitsObstacle(prevPos, p.pos, o)) continue;
      _despawn(matchState, projectiles, i, p, 'obstacle');
      killed = true;
      break;
    }
    if (killed) continue;

    if (projectileHitsSurface(prevPos, p.pos, surfaces)) {
      _despawn(matchState, projectiles, i, p, 'surface');
      continue;
    }

    // Hit detection — closest-point distance from target's body to the
    // projectile's traveled segment this frame.
    const hitRadius = target.vulnerabilityMove ? HIT_RADIUS_VULNERABLE : HIT_RADIUS_NORMAL;
    const nearest = closestPointOnSegment(prevPos, p.pos, target.pos);
    const dx = nearest.x - target.pos.x;
    const dy = nearest.y - target.pos.y;
    const dz = nearest.z - target.pos.z;
    if (dx * dx + dy * dy + dz * dz < hitRadius * hitRadius) {
      let damage = damageScaler ? damageScaler(p) : p.damage;
      if (target.vulnerabilityMove) damage *= HIT_VULNERABILITY_DAMAGE_BONUS;
      target.hp = Math.max(0, target.hp - damage);
      if (now >= target.hitStunUntil) target.hitStunUntil = now + p.hitStunMs;
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
