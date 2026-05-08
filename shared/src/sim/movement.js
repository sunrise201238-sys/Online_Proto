// Boost gauge, momentum, jump physics, integration. Pure-JS port of the
// pieces of updateBoost / updatePlayer / updateTransforms in main.js that
// don't involve input or rendering.

import {
  BOOST_CAP,
  BOOST_DASH_DRAIN_PER_TICK,
  BOOST_REGEN_PER_TICK,
  BOOST_REFILL_PAUSE_MS,
  BOOST_EMPTY_RECOVER_MS,
  GRAVITY_Y,
  MOMENTUM_STANDARD,
  REPULSION_RANGE,
  REPULSION_FORCE,
  REPULSION_DECAY_MS,
  GROUND_BASE_Y
} from './constants.js';
import { getGroundLevelY } from './physics.js';
import { vec3Length2D } from './math.js';

// Boost regen / drain. Mirrors updateBoost. The action string drives whether
// boost is consumed (dash) or regenerated.
export function tickBoost(fighter, now, action, surfaces = []) {
  const groundY = getGroundLevelY(fighter, surfaces) + 0.1;
  const grounded = fighter.grounded || fighter.pos.y <= groundY;

  if (now < fighter.overheatedUntil) {
    fighter.action = 'hard-landing';
    fighter.vel.x = 0;
    fighter.vel.z = 0;
    return;
  }

  fighter.action = action;
  const consume = action === 'dash';
  if (consume) {
    fighter.boost = Math.max(0, fighter.boost - BOOST_DASH_DRAIN_PER_TICK);
    fighter.refillPausedUntil = now + BOOST_REFILL_PAUSE_MS;
  } else if (grounded && now >= fighter.refillPausedUntil) {
    fighter.boost = Math.min(BOOST_CAP, fighter.boost + BOOST_REGEN_PER_TICK);
  }

  if (fighter.boost <= 0) {
    if (fighter.emptyRecoverUntil <= now) fighter.emptyRecoverUntil = now + BOOST_EMPTY_RECOVER_MS;
    fighter.overheatedUntil = now;
    fighter.action = 'idle';
  }
}

// Snapshot the velocity magnitude as future momentum (e.g. when initiating
// a dash, the dash's residual momentum is based on current velocity).
export function inheritMomentum(fighter, momentumValue = MOMENTUM_STANDARD) {
  const factor = momentumValue / MOMENTUM_STANDARD;
  fighter.momentumVX = fighter.vel.x * factor;
  fighter.momentumVZ = fighter.vel.z * factor;
}

// Add residual momentum on top of velocity, decay it. Mirrors applyMomentum.
export function applyMomentum(fighter, { suspend = false } = {}) {
  if (suspend) return;
  fighter.vel.x += fighter.momentumVX;
  fighter.vel.z += fighter.momentumVZ;
  fighter.momentumVX *= fighter.momentumDecay;
  fighter.momentumVZ *= fighter.momentumDecay;
  if (Math.abs(fighter.momentumVX) < 0.02) fighter.momentumVX = 0;
  if (Math.abs(fighter.momentumVZ) < 0.02) fighter.momentumVZ = 0;
}

// Soft push between two fighters when they're stacking. Mirrors applyRepulsion.
export function applyRepulsion(p1, p2, now) {
  const dx = p1.pos.x - p2.pos.x;
  const dz = p1.pos.z - p2.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist >= REPULSION_RANGE) return;
  const nx = dist > 1e-6 ? dx / dist : 1;
  const nz = dist > 1e-6 ? dz / dist : 0;
  const force = (REPULSION_RANGE - dist) * REPULSION_FORCE;
  p1.vel.x += nx * force * 0.04;
  p1.vel.z += nz * force * 0.04;
  p2.vel.x -= nx * force * 0.04;
  p2.vel.z -= nz * force * 0.04;
  p1.stackUntil = now + REPULSION_DECAY_MS;
  p2.stackUntil = now + REPULSION_DECAY_MS;
}

// Integrate horizontal velocity (vx, vz) and explicit vertical jump physics.
// Replaces world.step from cannon-es. Pure: only modifies fighter.pos and
// the airborne / jumpVelocity / grounded flags.
export function integrateFighter(fighter, surfaces, dt) {
  // Horizontal — straight Euler integration.
  fighter.pos.x += fighter.vel.x * dt;
  fighter.pos.z += fighter.vel.z * dt;

  // Vertical — explicit jump arc. Cannon was being used purely as a y
  // integrator with -80.19 gravity in the offline build; we replicate that
  // behavior here without it.
  const groundY = getGroundLevelY(fighter, surfaces);

  if (fighter.airborne) {
    fighter.jumpVelocity += GRAVITY_Y * dt;
    fighter.pos.y += fighter.jumpVelocity * dt;
    if (fighter.pos.y <= groundY && fighter.jumpVelocity <= 0) {
      fighter.pos.y = groundY;
      fighter.vel.y = 0;
      fighter.airborne = false;
      fighter.jumpVelocity = 0;
    }
  } else if (fighter.pos.y > groundY + 0.6) {
    fighter.airborne = true;
    fighter.jumpVelocity = 0;
  } else {
    fighter.pos.y = groundY;
    fighter.vel.y = 0;
  }
  fighter.grounded = !fighter.airborne;
}

// Decay tiny velocity remnants so fighters come to rest after input release.
// (cannon-es had linearDamping = 0.24 doing this; we approximate.)
export function dampHorizontal(fighter, dt) {
  // Drag factor per second; (1 - 0.24)^60 ≈ 1.5e-7 over 1s, but we want
  // something perceptible. Match the offline feel of "stops right away
  // when velocity is below 0.14" — used by the stuck-detector.
  if (Math.abs(fighter.vel.x) < 0.14) fighter.vel.x = 0;
  if (Math.abs(fighter.vel.z) < 0.14) fighter.vel.z = 0;
}

// Re-orient fighter facing toward another fighter (used for visual rotation
// in the offline build; we keep it on the sim side because some logic
// reads facing).
export function faceTowards(fighter, other) {
  const dx = other.pos.x - fighter.pos.x;
  const dz = other.pos.z - fighter.pos.z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return;
  fighter.facing = dx >= 0 ? 1 : -1;
  fighter.yaw = Math.atan2(dx, dz);
}
