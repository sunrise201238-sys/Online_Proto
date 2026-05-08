// Per-fighter action logic: ammo/reload tick, sniper charge, fire gating,
// step (dodge), jump, dash defense, evasion. Pure-JS port of tickAmmo,
// attemptFire, tickSniperCharge, clearIncomingHoming, triggerEnemyEvasion,
// triggerDashDefense, and the step/jump bookkeeping from updatePlayer in
// main.js.

import {
  STEP_DISTANCE,
  STEP_DURATION_MS,
  STEP_COOLDOWN_MS,
  STEP_BOOST_COST,
  STEP_HOMING_CUT_MS,
  JUMP_BOOST_COST,
  JUMP_INITIAL_VELOCITY,
  JUMP_HOVER_MS,
  JUMP_COOLDOWN_MS,
  ANTI_MELEE_WINDOW_MS,
  DASH_RECOVER_MS,
  MOMENTUM_STANDARD,
  GROUND_BASE_Y,
  SNIPER_CANCEL_BOOST_COST,
  BOOST_REFILL_PAUSE_MS
} from './constants.js';
import { spawnProjectiles } from './projectiles.js';
import { unitOverlapsObstacle } from './physics.js';
import { inheritMomentum } from './movement.js';

// Reload ticking. Mirrors tickAmmo.
export function tickAmmo(fighter, now) {
  const u = fighter.unit;
  if (u.magCapacity == null) return;
  if (fighter.ammo >= u.magCapacity) {
    fighter.reloadingUntil = 0;
    fighter.reloadTickStartAt = 0;
    return;
  }
  if (u.autoReload) {
    if (!fighter.reloadTickStartAt) fighter.reloadTickStartAt = now;
    while (now - fighter.reloadTickStartAt >= u.reloadMs && fighter.ammo < u.magCapacity) {
      fighter.ammo += 1;
      fighter.reloadTickStartAt += u.reloadMs;
    }
    if (fighter.ammo >= u.magCapacity) fighter.reloadTickStartAt = 0;
  } else if (fighter.ammo === 0) {
    if (!fighter.reloadingUntil) fighter.reloadingUntil = now + u.reloadMs;
    if (now >= fighter.reloadingUntil) {
      fighter.ammo = u.magCapacity;
      fighter.reloadingUntil = 0;
    }
  }
}

// Mirrors attemptFire. Returns true if a shot was fired or charge initiated.
export function attemptFire(matchState, owner, target, now) {
  const u = owner.unit;
  if (u.sniperCharge) {
    if (owner.airborne) return false;
    if (owner.sniperChargeTargetId) return false;
    if (u.magCapacity != null && owner.ammo <= 0) return false;
    if (now - owner.lastFireAt < u.fireCooldownMs) return false;
    const chargeMs = u.chargeMs ?? 500;
    owner.sniperChargeUntil = now + chargeMs;
    owner.sniperChargeTargetId = target.id;
    owner.vel.x = 0;
    owner.vel.z = 0;
    owner.momentumVX = 0;
    owner.momentumVZ = 0;
    matchState.events.push({ type: 'sniper-charge-start', ownerId: owner.id });
    return true;
  }
  return _spawnNonCharge(matchState, owner, target, now);
}

function _spawnNonCharge(matchState, owner, target, now) {
  const u = owner.unit;
  if (u.magCapacity != null && owner.ammo <= 0) return false;
  if (now - owner.lastFireAt < u.fireCooldownMs) return false;
  owner.lastFireAt = now;
  if (u.magCapacity != null) owner.ammo -= 1;
  spawnProjectiles(matchState, owner, target);
  return true;
}

// Mirrors tickSniperCharge. Resolves the snap shot once the charge timer
// elapses; emits a 'sniper-fired' event if the target became invalid mid-charge.
// `input` is the sniper's input frame this tick — when its boost is held with
// enough boost gauge, the forced-standing charge cancels and the projectile
// fires immediately at the cost of SNIPER_CANCEL_BOOST_COST.
export function tickSniperCharge(matchState, fighter, now, input = null) {
  if (!fighter.sniperChargeTargetId) return;

  const sprintHeld = !!(input && (input.boost || input.sprintLocked));
  const cancelled = sprintHeld
    && now < fighter.sniperChargeUntil
    && fighter.boost >= SNIPER_CANCEL_BOOST_COST;
  if (cancelled) {
    fighter.boost = Math.max(0, fighter.boost - SNIPER_CANCEL_BOOST_COST);
    fighter.refillPausedUntil = now + BOOST_REFILL_PAUSE_MS;
    fighter.sniperChargeUntil = now;
    matchState.events.push({ type: 'sniper-charge-cancel', ownerId: fighter.id });
  }

  if (now < fighter.sniperChargeUntil) {
    fighter.vel.x = 0;
    fighter.vel.z = 0;
    fighter.momentumVX = 0;
    fighter.momentumVZ = 0;
    return;
  }
  const targetId = fighter.sniperChargeTargetId;
  fighter.sniperChargeTargetId = null;
  fighter.sniperChargeUntil = 0;
  if (fighter.hp <= 0) return;
  const target = matchState.fighters[targetId];
  if (!target || target.hp <= 0) return;
  // Sniper fires using the same ammo/cooldown gates as a regular shot.
  fighter.lastFireAt = now;
  if (fighter.unit.magCapacity != null) fighter.ammo -= 1;
  spawnProjectiles(matchState, fighter, target);
  matchState.events.push({ type: 'sniper-charge-fire', ownerId: fighter.id });
}

// On step, cut homing on incoming projectiles and refresh the evade window.
export function clearIncomingHoming(matchState, fighter, now) {
  fighter.evadeHomingUntil = now + STEP_HOMING_CUT_MS;
  for (let i = 0; i < matchState.projectiles.length; i += 1) {
    const p = matchState.projectiles[i];
    if (p.targetId !== fighter.id) continue;
    p.homing = false;
    p.homingLost = true;
  }
}

export function triggerDashDefense(fighter, now) {
  fighter.dashRecoverUntil = now + DASH_RECOVER_MS;
}

// Try to start a step (dodge). Returns true if step started.
export function tryStartStep(matchState, fighter, dirX, dirZ, now, obstacles) {
  if (now < fighter.stepCooldownUntil) return false;
  if (fighter.boost < STEP_BOOST_COST) return false;

  let dx = dirX;
  let dz = dirZ;
  let len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.03) {
    // Fall back to current velocity, then arbitrary forward.
    dx = fighter.vel.x;
    dz = fighter.vel.z;
    len = Math.sqrt(dx * dx + dz * dz);
  }
  if (len < 0.03) {
    dx = 1; dz = 0; len = 1;
  }
  dx /= len; dz /= len;

  fighter.stepStartAt = now;
  fighter.stepUntil = now + STEP_DURATION_MS;
  fighter.stepCooldownUntil = now + STEP_COOLDOWN_MS;
  fighter.stepFromX = fighter.pos.x;
  fighter.stepFromZ = fighter.pos.z;
  fighter.stepToX = fighter.stepFromX + dx * STEP_DISTANCE;
  fighter.stepToZ = fighter.stepFromZ + dz * STEP_DISTANCE;
  fighter.queuedMomentumVX = fighter.momentumVX * 0.65 + fighter.vel.x * 0.35;
  fighter.queuedMomentumVZ = fighter.momentumVZ * 0.65 + fighter.vel.z * 0.35;
  fighter.momentumVX = 0;
  fighter.momentumVZ = 0;
  fighter.boost = Math.max(0, fighter.boost - STEP_BOOST_COST);
  fighter.refillPausedUntil = now + 500;
  clearIncomingHoming(matchState, fighter, now);
  return true;
}

// Each tick while a step is active, lerp the fighter along the step path.
// Returns true if step is still running, false if it ended this call.
export function tickStep(fighter, now, obstacles) {
  if (fighter.stepUntil <= 0 || now > fighter.stepUntil) {
    if (fighter.stepUntil > 0) {
      // Step just ended — apply queued momentum.
      fighter.stepUntil = 0;
      fighter.momentumVX += fighter.queuedMomentumVX;
      fighter.momentumVZ += fighter.queuedMomentumVZ;
      fighter.queuedMomentumVX = 0;
      fighter.queuedMomentumVZ = 0;
    }
    return false;
  }
  const span = Math.max(1, fighter.stepUntil - fighter.stepStartAt);
  const t = Math.max(0, Math.min(1, (now - fighter.stepStartAt) / span));
  const targetX = fighter.stepFromX + (fighter.stepToX - fighter.stepFromX) * t;
  const targetZ = fighter.stepFromZ + (fighter.stepToZ - fighter.stepFromZ) * t;
  if (unitOverlapsObstacle(targetX, fighter.pos.y, targetZ, obstacles)) {
    // Bonk — abort step here.
    fighter.stepUntil = now;
  } else {
    fighter.pos.x = targetX;
    fighter.pos.z = targetZ;
  }
  fighter.vel.x = 0;
  fighter.vel.z = 0;
  fighter.action = 'step';
  return true;
}

// Try to start a jump. Returns true if jump started.
export function tryStartJump(fighter, now) {
  if (now < fighter.jumpCooldownUntil) return false;
  if (fighter.boost < JUMP_BOOST_COST) return false;
  if (!fighter.grounded && fighter.pos.y > GROUND_BASE_Y + 0.15) return false;
  fighter.boost = Math.max(0, fighter.boost - JUMP_BOOST_COST);
  fighter.refillPausedUntil = now + 500;
  fighter.jumpVelocity = JUMP_INITIAL_VELOCITY;
  fighter.airborne = true;
  fighter.hoverUntil = now + JUMP_HOVER_MS;
  fighter.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
  inheritMomentum(fighter, 70);
  return true;
}

export function startDash(fighter, now) {
  fighter.antiMeleeUntil = now + ANTI_MELEE_WINDOW_MS;
  inheritMomentum(fighter, MOMENTUM_STANDARD * 1.5);
  triggerDashDefense(fighter, now);
}
