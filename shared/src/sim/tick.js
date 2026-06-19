// Per-tick orchestrator. The single function the server calls each tick to
// advance the match. Pure-JS, deterministic given inputs (modulo the few
// Math.random() calls in projectile spread / bot AI / enemy random nudges,
// which is fine because we're server-authoritative — clients just render
// the resulting snapshot).

import {
  BOOST_MOVE_SPEED,
  WALK_SPEED,
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
    shootHold: false,   // shoot held continuously
    targetSwitch: false // 2v2: cycle to next live enemy target this frame
  };
}

// Cycle a human-controlled fighter's targetId to the next live enemy.
// In 1v1 there's only one enemy — no-op. In 2v2 it flips between the two
// enemies. Called from applyInput when input.targetSwitch is set.
function cycleTargetId(matchState, fighter) {
  const enemies = Object.values(matchState.fighters).filter((f) => f.team !== fighter.team && f.hp > 0);
  if (enemies.length <= 1) return;
  const ids = enemies.map((f) => f.id);
  const idx = ids.indexOf(fighter.targetId);
  fighter.targetId = ids[((idx >= 0 ? idx : -1) + 1) % ids.length];
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

  // Honour a one-tick target switch before resolving opp so the very next
  // shot already lands on the new target.
  if (input.targetSwitch) cycleTargetId(matchState, fighter);
  const opp = matchState.fighters[fighter.targetId];
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
  // Per-unit movement speeds — fall back to the global defaults if a unit
  // omits the override. Keeps the simulation deterministic per fighter
  // and matches the client's offline computation in updatePlayer.
  const sprintSpeed = fighter.unit?.sprintSpeed ?? BOOST_MOVE_SPEED;
  const walkSpeed = fighter.unit?.walkSpeed ?? WALK_SPEED;
  const baseSpeed = useSprint ? sprintSpeed : (recoveringFromDash ? 4.55 : walkSpeed);
  const speed = (!hasBoost || emptyPenaltyActive) ? Math.min(baseSpeed, 7.5) : baseSpeed;
  const hitStunned = now < fighter.hitStunUntil;
  const hitStunScale = hitStunned ? fighter.hitStunScale : 1;
  const canInputMove = !emptyPenaltyActive;

  const inStep = now <= fighter.stepUntil;
  if (!inStep) {
    fighter.vel.x = canInputMove ? input.moveX * speed * hitStunScale : 0;
    fighter.vel.z = canInputMove ? input.moveZ * speed * hitStunScale : 0;
  }

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
// Each fighter's redLock is evaluated against its own current targetId, so
// 2v2 fighters with different targets get independent lock states.
export function updateLocks(matchState) {
  for (const f of Object.values(matchState.fighters)) {
    const tgt = f.targetId ? matchState.fighters[f.targetId] : null;
    if (!tgt) { f.redLock = false; continue; }
    const dx = f.pos.x - tgt.pos.x;
    const dz = f.pos.z - tgt.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    f.redLock = dist <= f.unit.lockRange;
  }
}

// THE function. One server tick.
//
//   matchState — mutable state object created by createMatchState
//   inputs     — { p1: InputFrame, p2: InputFrame, ... } keyed by fighter id.
//                Use emptyInput() (or omit) for absent players.
//   now        — server-authoritative time in ms (Date.now())
//   dt         — delta time in seconds (typically TICK_RATE_MS / 1000)
//   botIds     — optional Set or Array of fighter ids that are bot-controlled.
//                The caller MUST have run tickBot(matchState, id, now) for
//                each before this call. applyInput is then skipped for bots
//                (it would clobber the velocity tickBot just wrote).
//
// Returns the same matchState (mutated) for chaining.
export function tickMatch(matchState, inputs, now, dt, botIds = null) {
  const botSet = botIds instanceof Set ? botIds : new Set(botIds || []);
  matchState.now = now;
  matchState.events = []; // events are per-tick

  const arena = getArena(matchState.mapKey);
  const fighters = Object.values(matchState.fighters);

  // 1. Per-fighter pre-tick (ammo, sniper charge timer).
  for (const f of fighters) {
    tickAmmo(f, now);
    tickSniperCharge(matchState, f, now, inputs[f.id] ?? null);
  }

  // 2. Apply human inputs. Bot fighters skip applyInput (tickBot has already
  //    written their velocity/action for this tick), but they STILL need
  //    applyMomentum + tickBoost — the two end-of-applyInput calls that
  //    integrate momentum into velocity and run the boost gauge. Without
  //    these for bots:
  //      - sprint speed (11.76) is slower than walk (16) because the
  //        `inheritMomentum` write inside tickBot is never paid out — bots
  //        look like they're walking even when their state machine wants
  //        them sprinting.
  //      - boost never drains or regenerates, so bots have effectively
  //        infinite stamina, different from the offline updateEnemy path
  //        which runs updateBoost every tick.
  for (const f of fighters) {
    if (botSet.has(f.id)) {
      applyMomentum(f, { suspend: f.action === 'step' });
      tickBoost(f, now, f.action, arena.surfaces);
      continue;
    }
    applyInput(matchState, f, inputs[f.id] ?? emptyInput(), now, arena.obstacles, arena.surfaces);
  }

  // 3. Soft-collide repulsion across every fighter pair.
  for (let i = 0; i < fighters.length; i += 1) {
    for (let j = i + 1; j < fighters.length; j += 1) {
      applyRepulsion(fighters[i], fighters[j], now);
    }
  }

  // 4. Integrate horizontal velocity + jump physics. Track prevPos for the
  //    collision-resolve step.
  const prevPositions = fighters.map((f) => ({
    f,
    pos: { x: f.pos.x, y: f.pos.y, z: f.pos.z }
  }));
  for (const f of fighters) integrateFighter(f, arena.surfaces, dt);

  // 5. Resolve obstacle penetrations.
  for (const { f, pos } of prevPositions) {
    resolveUnitObstacleCollisions(f, pos, arena.obstacles);
  }

  // 6. Tiny-velocity damping (replicates the offline build's "stops below
  //    0.14 vel" behavior).
  for (const f of fighters) dampHorizontal(f, dt);

  // 7. Lock state.
  updateLocks(matchState);

  // 8. Projectiles tick last so they react to the new fighter positions.
  tickProjectiles(matchState, dt, now, arena.obstacles, arena.surfaces);

  matchState.tick += 1;
  return matchState;
}
