// Per-tick orchestrator. The single function the server calls each tick to
// advance the match. Pure-JS, deterministic given inputs (modulo the few
// Math.random() calls in projectile spread / bot AI / enemy random nudges,
// which is fine because we're server-authoritative — clients just render
// the resulting snapshot).

import {
  BOOST_MOVE_SPEED,
  STEP_DISTANCE,
  STEP_DURATION_MS,
  STEP_BOOST_COST,
  JUMP_BOOST_COST,
  MOMENTUM_STANDARD,
  MAX_HP
} from './constants.js';
import { clamp, vec3Length2D } from './math.js';
import { getArena } from './arena.js';
import {
  resolveUnitObstacleCollisions
} from './physics.js';
import {
  tickBoost,
  applyMomentum,
  applyRepulsion,
  integrateFighter,
  dampHorizontal,
  faceTowards
} from './movement.js';
import { tickAmmo, attemptFire, tickSniperCharge, tickStep, tryStartStep, tryStartJump, startDash } from './actions.js';
import { tickProjectiles } from './projectiles.js';

// One input frame, sent client→server per tick. Defaults to no-op.
export function emptyInput() {
  return {
    moveX: 0,           // -1..1, world-space
    moveZ: 0,
    boost: false,       // sprint held this frame
    sprintLocked: false,
    jump: false,        // jump button pressed this frame
    stepTap: false,     // dodge tap this frame
    shootTap: false,    // shoot tap this frame
    shootHold: false    // shoot held continuously
  };
}

// Drive a fighter from a player input frame. Mirrors updatePlayer's body of
// work, refactored to be input-driven instead of reading the global `input`
// and `keyState` objects.
export function applyInput(matchState, fighter, input, now, obstacles, surfaces) {
  // Sniper charge lock — same gating as updatePlayer.
  if (fighter.sniperChargeTargetId) {
    fighter.vel.x = 0;
    fighter.vel.z = 0;
    fighter.momentumVX = 0;
    fighter.momentumVZ = 0;
    fighter.action = 'shoot';
    return;
  }

  const opp = matchState.fighters[fighter.id === 'p1' ? 'p2' : 'p1'];
  const moveMag = Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ);
  const hasDirInput = moveMag > 0.15;
  let sprintLocked = input.sprintLocked;
  if (!hasDirInput || input.jump || input.stepTap || fighter.boost <= 0) sprintLocked = false;
  const boostActive = input.boost || sprintLocked;

  const recoveringFromDash = now < fighter.dashRecoverUntil;
  const hasBoost = fighter.boost > 0;
  const emptyPenaltyActive = now < fighter.emptyRecoverUntil;
  const canDash = hasBoost && !emptyPenaltyActive;
  const useSprint = boostActive && canDash;
  const baseSpeed = useSprint ? BOOST_MOVE_SPEED : (recoveringFromDash ? 4.55 : 16);
  const speed = (!hasBoost || emptyPenaltyActive) ? Math.min(baseSpeed, 7.5) : baseSpeed;
  const hitStunned = now < fighter.hitStunUntil;
  const hitStunScale = hitStunned ? 0.25 : 1;
  const canInputMove = !emptyPenaltyActive;

  const inStep = now <= fighter.stepUntil;
  if (!inStep) {
    fighter.vel.x = canInputMove ? input.moveX * speed * hitStunScale : 0;
    fighter.vel.z = canInputMove ? input.moveZ * speed * hitStunScale : 0;
  }
  fighter.vulnerabilityMove = !boostActive && moveMag > 0.2;

  let action = 'idle';

  if (inStep) {
    tickStep(fighter, now, obstacles);
    action = 'step';
  } else if (fighter.stepUntil > 0) {
    // Step ended this frame — let tickStep handle the queued momentum.
    tickStep(fighter, now, obstacles);
  } else if (input.jump && canInputMove && tryStartJump(fighter, now)) {
    action = 'jump';
  } else if (boostActive && canInputMove) {
    startDash(fighter, now);
    action = 'dash';
  }

  if (input.stepTap && !inStep && canInputMove) {
    let dx = input.moveX;
    let dz = input.moveZ;
    if (Math.hypot(dx, dz) < 0.2) {
      dx = fighter.vel.x;
      dz = fighter.vel.z;
    }
    if (Math.hypot(dx, dz) < 0.2 && opp) {
      dx = fighter.pos.x - opp.pos.x;
      dz = fighter.pos.z - opp.pos.z;
    }
    if (tryStartStep(matchState, fighter, dx, dz, now, obstacles)) action = 'step';
  }

  if (input.shootTap && opp) {
    attemptFire(matchState, fighter, opp, now);
    if (action === 'idle') action = 'shoot';
  }

  // Continuous-fire MG: spreadCount===1 and not sniper.
  if (input.shootHold && opp && fighter.unit.spreadCount === 1 && !fighter.unit.sniperCharge) {
    const before = fighter.lastFireAt;
    attemptFire(matchState, fighter, opp, now);
    if (fighter.lastFireAt !== before && action === 'idle') action = 'shoot';
  }

  applyMomentum(fighter, { suspend: action === 'step' });
  tickBoost(fighter, now, action, surfaces);
  if (opp) faceTowards(fighter, opp);
}

// Update lock state on each fighter. Called once per tick after movement.
export function updateLocks(matchState) {
  const p1 = matchState.fighters.p1;
  const p2 = matchState.fighters.p2;
  if (!p1 || !p2) return;
  const dx = p1.pos.x - p2.pos.x;
  const dz = p1.pos.z - p2.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  p1.redLock = dist <= p1.unit.lockRange;
  p2.redLock = dist <= p2.unit.lockRange;
}

// THE function. One server tick.
//
//   matchState — mutable state object created by createMatchState
//   inputs     — { p1: InputFrame, p2: InputFrame } (use emptyInput() for absent players)
//   now        — server-authoritative time in ms (Date.now())
//   dt         — delta time in seconds (typically TICK_RATE_MS / 1000)
//
// Returns the same matchState (mutated) for chaining.
export function tickMatch(matchState, inputs, now, dt) {
  matchState.now = now;
  matchState.events = []; // events are per-tick

  const arena = getArena(matchState.mapKey);

  const p1 = matchState.fighters.p1;
  const p2 = matchState.fighters.p2;

  // 1. Per-fighter pre-tick (ammo, sniper charge timer).
  tickAmmo(p1, now);
  tickAmmo(p2, now);
  tickSniperCharge(matchState, p1, now, inputs.p1 ?? null);
  tickSniperCharge(matchState, p2, now, inputs.p2 ?? null);

  // 2. Apply player inputs / drive bots. Inputs are authoritative; if a
  //    slot is absent (e.g. only p1 connected, p2 is a bot), the caller
  //    should run tickBot for that fighter BEFORE calling tickMatch and
  //    pass emptyInput() here.
  applyInput(matchState, p1, inputs.p1 ?? emptyInput(), now, arena.obstacles, arena.surfaces);
  applyInput(matchState, p2, inputs.p2 ?? emptyInput(), now, arena.obstacles, arena.surfaces);

  // 3. Soft-collide repulsion between fighters.
  applyRepulsion(p1, p2, now);

  // 4. Integrate horizontal velocity + jump physics. Track prevPos for the
  //    collision-resolve step.
  const p1Prev = { x: p1.pos.x, y: p1.pos.y, z: p1.pos.z };
  const p2Prev = { x: p2.pos.x, y: p2.pos.y, z: p2.pos.z };
  integrateFighter(p1, arena.surfaces, dt);
  integrateFighter(p2, arena.surfaces, dt);

  // 5. Resolve obstacle penetrations.
  resolveUnitObstacleCollisions(p1, p1Prev, arena.obstacles);
  resolveUnitObstacleCollisions(p2, p2Prev, arena.obstacles);

  // 6. Tiny-velocity damping (replicates the offline build's "stops below
  //    0.14 vel" behavior).
  dampHorizontal(p1, dt);
  dampHorizontal(p2, dt);

  // 7. Lock state.
  updateLocks(matchState);

  // 8. Projectiles tick last so they react to the new fighter positions.
  tickProjectiles(matchState, dt, now, arena.obstacles, arena.surfaces);

  matchState.tick += 1;
  return matchState;
}
