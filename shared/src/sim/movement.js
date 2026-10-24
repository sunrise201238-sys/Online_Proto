import { DEV_SIM } from './constants.js';   // (the dev tools: the boost never drains while the switch is on)
// Boost gauge, momentum, jump physics, integration. Pure-JS port of the
// pieces of updateBoost / updatePlayer / updateTransforms in main.js that
// don't involve input or rendering.

import {
  BOOST_CAP,
  BOOST_MOVE_SPEED,
  BOOST_DASH_DRAIN_PER_TICK,
  BOOST_REGEN_PER_TICK,
  BOOST_REFILL_PAUSE_MS,
  BOOST_EMPTY_RECOVER_MS,
  GRAVITY_Y,
  MOMENTUM_STANDARD,
  REPULSION_RANGE,
  REPULSION_FORCE,
  REPULSION_DECAY_MS,
  GROUND_BASE_Y,
  LAND_PLANT_LEVEL
} from './constants.js';
import { getGroundLevelY, groundSurfaceAt } from './physics.js';
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
  // Per-unit drain / regen / cap with global-default fallbacks. Lets a
  // character spec independently tune its boost economy.
  const drain = fighter.unit?.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK;
  const regen = fighter.unit?.boostRegen ?? BOOST_REGEN_PER_TICK;
  const cap = fighter.unit?.boostCap ?? BOOST_CAP;
  if (DEV_SIM.infiniteBoost) fighter.boost = cap;   // (the dev tools' switch: the gauge refilled every tick, whatever the tick spent)
  else if (consume) {
    fighter.boost = Math.max(0, fighter.boost - drain);
    fighter.refillPausedUntil = now + BOOST_REFILL_PAUSE_MS;
  } else if (grounded && now >= fighter.refillPausedUntil) {
    fighter.boost = Math.min(cap, fighter.boost + regen);
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
export function integrateFighter(fighter, surfaces, dt, ceil = Infinity) {
  integrateHorizontal(fighter, dt);
  integrateVertical(fighter, surfaces, dt, ceil);
}
// The two halves, for the tick to run the walls' push-out between them: the floor is read where the body stands once
// the walls have pushed it back, not where it tried to go (a body walking into the wall at a roof's edge found no
// floor under that spot, fell a hair each tick while the wall held it at the edge, and sank through the roof; the
// offline client has always read it in this order, b1022x).
export function integrateHorizontal(fighter, dt) {
  // Horizontal — straight Euler integration.
  fighter.pos.x += fighter.vel.x * dt;
  fighter.pos.z += fighter.vel.z * dt;
}
export function integrateVertical(fighter, surfaces, dt, ceil = Infinity) {
  // Vertical — explicit jump arc. Cannon was being used purely as a y
  // integrator with -80.19 gravity in the offline build; we replicate that
  // behavior here without it.
  const groundY = getGroundLevelY(fighter, surfaces);

  if (fighter.airborne) {
    if (fighter.flightClimb) {
      // FLIGHT (Aris): pop-then-climb — gravity erodes the jump impulse
      // down to the sprint-speed sustained climb and the thruster holds it
      // there, never below. Mirrors offline updateTransforms.
      fighter.jumpVelocity = Math.max(
        fighter.unit?.sprintSpeed ?? BOOST_MOVE_SPEED,
        fighter.jumpVelocity + GRAVITY_Y * dt
      );
    } else if (fighter.flightLevel) {
      // FLIGHT (Aris): level flight — air-sprint / air-dodge hold altitude.
      fighter.jumpVelocity = 0;
    } else {
      fighter.jumpVelocity += GRAVITY_Y * dt;
    }
    fighter.pos.y += fighter.jumpVelocity * dt;
    // The map's ceiling (a modelled map's `ceil`, units over the street): a body's feet never rise above it — the jump
    // stops there, Aris's climb holds there — so nothing lands on or crosses a wall taller than the ceiling (b1022b).
    if (fighter.pos.y > GROUND_BASE_Y + ceil) { fighter.pos.y = GROUND_BASE_Y + ceil; if (fighter.jumpVelocity > 0) fighter.jumpVelocity = 0; }
    if (fighter.pos.y <= groundY && fighter.jumpVelocity <= 0) {
      fighter.pos.y = groundY;
      fighter.vel.y = 0;
      fighter.airborne = false;
      fighter.jumpVelocity = 0;
      // The landing plant (LAND_PLANT_MS): landed on a thing's lid — a crate's, a container's, a roof — at another level
      // than the floor it left (up onto it, or down onto it from a taller thing; a hop along the same roof is no landing
      // on anything new): the momentum is dropped here and the input (applyInput, the client's updatePlayer) holds the body.
      const lid = groundSurfaceAt(fighter.pos.x, fighter.pos.z, surfaces, groundY - GROUND_BASE_Y);
      if (lid?.lid && Math.abs(groundY - (fighter.floorY ?? groundY)) > LAND_PLANT_LEVEL) { fighter.landedOnLid = true; fighter.momentumVX = 0; fighter.momentumVZ = 0; }
    }
  } else if (fighter.pos.y > groundY + 0.6) {
    fighter.airborne = true;
    fighter.jumpVelocity = 0;
  } else {
    fighter.pos.y = groundY;
    fighter.vel.y = 0;
  }
  if (!fighter.airborne) fighter.floorY = groundY;   // (the floor it stands on: what the next landing is measured against)
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
