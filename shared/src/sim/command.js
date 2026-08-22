// COMMAND MODE order layer (phase 3 R2) — the server-authoritative port of
// the offline diorama command system (client/src/main.js "COMMAND MODE"
// section; DIORAMA_PLAN.md phase 2/2.1 records the owner's rules).
//
// A command-driven fighter is bot-driven (tickBot) with two standing-order
// overrides layered on top:
//   FORCE LOCK  — commandTargetIdOf() overrides the bot target pick until
//                 either party dies.
//   MOVE ORDER  — tickCommandDriver() re-steers the legs AFTER tickBot each
//                 tick: pathfind to the point, DASH there in latched
//                 segments (arm at CMD_TRAVEL_DASH_ARM, spend down to the
//                 CMD_TRAVEL_BOOST_FLOOR reserve, walk until re-armed),
//                 then hold an Engage-style orbit on the CMD_RADIUS ring
//                 for CMD_ANCHOR_MS before autonomy resumes.
// Combat reflexes always win their frames (commandReflexActive) — the
// route resumes after them, exactly like offline.
//
// Storage: matchState.commands[slot] — a side-table, NEVER on the fighter:
// fighter objects are serialized into every snapshot (the _navPaths
// precedent, ai.js), and command state must not leak to the enemy team.
//
// Call order contract (the server loop):
//   me.targetId = commandTargetIdOf(...) ?? pickBotTargetId(...) ?? old
//   tickBot(matchState, slot, now)
//   tickCommandDriver(matchState, slot, now)   // this module
//   ...then tickMatch with the slot listed in botIds — its bot branch runs
//   applyMomentum (pays out the dash momentum) and tickBoost (drains on
//   action==='dash', regens otherwise). The driver only ever writes
//   vel.x/vel.z and action; vertical physics and boost bookkeeping stay
//   with the sim.

import {
  CMD_TRAVEL_BOOST_FLOOR,
  CMD_TRAVEL_DASH_ARM,
  CMD_TRAVEL_JUMP_BANK,
  CMD_ANCHOR_MS,
  CMD_RADIUS,
  CMD_ORDER_SNAP_TOLERANCE,
  CMD_ARRIVE_DIST,
  CMD_REPLAN_MS,
  CMD_ANCHOR_LEASH,
  MANDATED_JUMP_MIN_BOOST,
  BOOST_CAP,
  BOOST_DASH_DRAIN_PER_TICK,
  BOOST_MOVE_SPEED,
  WALK_SPEED,
  MOMENTUM_STANDARD,
  GROUND_BASE_Y
} from './constants.js';
import { getArena } from './arena.js';
import { groundHeightAt } from './physics.js';
import { findPathOnGrid, smoothPath } from './navgrid.js';
import { navGridFor } from './ai.js';
import { inheritMomentum } from './movement.js';
import { tryStartJump } from './actions.js';

function commandsFor(matchState, slot) {
  if (matchState.commands == null) matchState.commands = {};
  let cmd = matchState.commands[slot];
  if (!cmd) cmd = matchState.commands[slot] = { move: null, lockTargetId: null, orbitFlip: false };
  return cmd;
}

export function getCommands(matchState, slot) {
  return matchState.commands?.[slot] ?? null;
}

export function clearCommands(matchState, slot) {
  const cmd = matchState.commands?.[slot];
  if (!cmd) return;
  cmd.move = null;
  cmd.lockTargetId = null;
}

// Validate + store a move order. Mirrors the offline computeOrderPath
// strictness: the shared pathfinder clamps ANY goal into the grid and snaps
// up to 3 cells onto walkable — right for bot self-routing, wrong for
// orders, so routes whose real endpoint isn't essentially the ordered spot
// are REJECTED (that's what makes "Area is not available" fire, and what
// keeps a unit from shoving a wall toward an unreachable raw target).
export function setMoveOrder(matchState, slot, tx, tz, targetFloorY = 0) {
  const f = matchState.fighters[slot];
  if (!f || f.hp <= 0) return false;
  if (!Number.isFinite(tx) || !Number.isFinite(tz) || !Number.isFinite(targetFloorY)) return false;
  const path = computeCommandPath(matchState, f, tx, tz, targetFloorY);
  if (!path) return false;
  const cmd = commandsFor(matchState, slot);
  cmd.move = {
    x: tx, z: tz, y: targetFloorY,
    path, idx: 0,
    phase: 'travel',
    anchorUntil: 0,
    orbitSign: (cmd.orbitFlip = !cmd.orbitFlip) ? 1 : -1,
    dashArmed: false,
    replanAt: 0,        // set on the driver's first tick (no clock here)
    reflexHeld: false   // reflex owned a frame -> replan at reflex exit
  };
  return true;
}

// Order-strict pathfind from the fighter's CURRENT position to the ordered
// point — used by setMoveOrder and by every in-travel replan, so a refresh
// can never accept a route the original order would have rejected.
function computeCommandPath(matchState, f, tx, tz, targetFloorY) {
  const arena = getArena(matchState.mapKey);
  if (!arena) return null;
  const grid = navGridFor(arena);
  const myFloorY = groundHeightAt(f.pos.x, f.pos.z, arena.surfaces, f.pos.y - GROUND_BASE_Y);
  let path = findPathOnGrid(grid, f.pos.x, f.pos.z, tx, tz, myFloorY, targetFloorY, arena.obstacles);
  if (!path || path.length < 2) return null;
  const end = path[path.length - 1];
  if (Math.hypot(end.x - tx, end.z - tz) > CMD_ORDER_SNAP_TOLERANCE) return null;
  if (Math.abs((end.y ?? 0) - targetFloorY) > 2) return null;
  if (path.length > 2) path = smoothPath(grid, path, arena.obstacles);
  return path;
}

// Set (targetSlot) or clear (null) a force lock. Rejects dead parties and
// teammates. Toggle semantics live at the message layer, not here.
export function setForceLock(matchState, slot, targetSlot) {
  const f = matchState.fighters[slot];
  if (!f || f.hp <= 0) return false;
  const cmd = commandsFor(matchState, slot);
  if (targetSlot == null) {
    cmd.lockTargetId = null;
    return true;
  }
  const t = matchState.fighters[targetSlot];
  if (!t || t.hp <= 0 || t.team === f.team) return false;
  cmd.lockTargetId = targetSlot;
  return true;
}

// Target override above the bot picker. Locks dissolve when either party
// dies (offline dioramaCommandTick parity).
export function commandTargetIdOf(matchState, slot) {
  const cmd = matchState.commands?.[slot];
  if (!cmd?.lockTargetId) return null;
  const me = matchState.fighters[slot];
  if (!me || me.hp <= 0) {
    cmd.lockTargetId = null;
    cmd.move = null;
    return null;
  }
  const t = matchState.fighters[cmd.lockTargetId];
  if (!t || t.hp <= 0) {
    cmd.lockTargetId = null;
    return null;
  }
  return cmd.lockTargetId;
}

// Reflex layers that own the fighter's frame — the move order yields and
// resumes after (offline botReflexActive parity, plus the online-only
// charge/beam locks which hard-zero velocity in the sim).
function commandReflexActive(f, now) {
  return f.botState === 'defense'
    || f.botCoverPath != null
    || f.botCoverHoldAnchor != null
    || now <= (f.stepUntil ?? 0)
    || now < (f.hitStunUntil ?? 0)
    || f.sniperChargeTargetId != null
    || now < (f.chargedBeamUntil ?? 0)
    || f.botGlintStepAt != null
    || (f.airborne && now < (f.botAirSteerUntil ?? 0));
}

// Post-bot movement override for a standing move order. Writes vel.x/vel.z
// and action only; tickMatch's bot branch then applies momentum and boost.
export function tickCommandDriver(matchState, slot, now) {
  const cmd = matchState.commands?.[slot];
  const mv = cmd?.move;
  if (!mv) return;
  const f = matchState.fighters[slot];
  if (!f || f.hp <= 0) { cmd.move = null; cmd.lockTargetId = null; return; }
  if (commandReflexActive(f, now)) {
    // Remember the yield so travel replans the moment the reflex releases
    // the frame — the reflex (Defense escape, cover reload) may have moved
    // the unit far off the frozen route.
    mv.reflexHeld = true;
    return;
  }

  if (mv.phase === 'travel') {
    const distC = Math.hypot(mv.x - f.pos.x, mv.z - f.pos.z);
    if (distC < CMD_ARRIVE_DIST) {
      mv.phase = 'anchor';
      // First arrival starts the window; a leash-return re-arrival resumes
      // the REMAINING window (anchor time is wall-clock total, not reset).
      if (!mv.anchorUntil) mv.anchorUntil = now + CMD_ANCHOR_MS;
      mv.wallTicks = 0;
      mv.lastAX = null;
      return;
    }
    const grounded = f.grounded && !f.airborne;
    // PATHFINDER-GUIDED TRAVEL (owner 2026-08-22): the route is never
    // followed stale — refresh it from the current position at reflex exit
    // and on the CMD_REPLAN_MS cadence (grounded only; a mid-jump replan
    // would re-route from the wrong floor). A refresh that fails the order
    // validation keeps the old path and retries next period.
    if (grounded) {
      if (mv.replanAt === 0) mv.replanAt = now + CMD_REPLAN_MS;
      if (mv.reflexHeld || now >= mv.replanAt) {
        mv.reflexHeld = false;
        mv.replanAt = now + CMD_REPLAN_MS;
        const fresh = computeCommandPath(matchState, f, mv.x, mv.z, mv.y);
        if (fresh) { mv.path = fresh; mv.idx = 0; }
      }
    }
    let wp = mv.path[mv.idx];
    while (wp && mv.idx < mv.path.length - 1
      && Math.hypot(wp.x - f.pos.x, wp.z - f.pos.z) < 3) {
      mv.idx += 1;
      wp = mv.path[mv.idx];
    }
    const gx = wp ? wp.x : mv.x;
    const gz = wp ? wp.z : mv.z;
    const dx = gx - f.pos.x;
    const dz = gz - f.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const arena = getArena(matchState.mapKey);
    const myFloorY = groundHeightAt(f.pos.x, f.pos.z, arena.surfaces, f.pos.y - GROUND_BASE_Y);
    // ROUTE JUMP (owner 2026-08-22): the upcoming waypoint sits on a ledge
    // above the current floor — the path crossed a jump-link. Vault toward
    // it once close enough, funded at the MANDATED tier (60; the player's
    // order is a mandate, like Defense's survival hop — never the 250
    // discretionary reserve, which the 50<->125 dash-latch cycle can't
    // reach). tryStartJump paces retries via the bot 1.5 s cooldown floor.
    const wpY = wp ? (wp.y ?? 0) : mv.y;
    if (grounded && wpY - myFloorY > 1.7 && l < 7
      && f.boost >= MANDATED_JUMP_MIN_BOOST) {
      tryStartJump(f, now);
    }
    if (f.airborne || !f.grounded) {
      // Mid-air (route jump or a ledge walk-off): TRAVEL keeps the stick
      // (owner 2026-08-22) — steer the arc toward the waypoint so the hop
      // lands on the ledge instead of drifting toward the combat target.
      // Momentum is left alone (the jump's inherited carry is the arc), and
      // no dash is billed in the air.
      const speed = f.unit.walkSpeed ?? WALK_SPEED;
      f.vel.x = (dx / l) * speed;
      f.vel.z = (dz / l) * speed;
      f.action = 'idle';
      return;
    }
    // JUMP BANK: while a route jump lies ahead on the remaining path, the
    // dash floor rises to CMD_TRAVEL_JUMP_BANK so a dash segment can never
    // deliver the unit to the ledge unable to afford the hop (the maze
    // walk-and-bank rule, sized for the command economy).
    let jumpAhead = false;
    for (let k = mv.idx; k < mv.path.length; k += 1) {
      if (((mv.path[k].y ?? 0) - myFloorY) > 1.7) { jumpAhead = true; break; }
    }
    const floor = jumpAhead ? CMD_TRAVEL_JUMP_BANK : CMD_TRAVEL_BOOST_FLOOR;
    // Latched dash segments. The drop check is PREDICTIVE (boost must
    // survive this tick's drain without crossing the floor) because the
    // drain lands later in tickBoost — the reserve is never spent, matching
    // the offline clamp-at-floor exactly to within one drain tick.
    const drain = f.unit.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK;
    const armAt = Math.min(CMD_TRAVEL_DASH_ARM, f.unit.boostCap ?? BOOST_CAP);
    if (mv.dashArmed) {
      if (f.boost < floor + drain || now < (f.emptyRecoverUntil ?? 0)) {
        mv.dashArmed = false;
      }
    } else if (f.boost >= armAt && now >= (f.emptyRecoverUntil ?? 0)) {
      mv.dashArmed = true;
    }
    if (mv.dashArmed) {
      // The bot's own dash recipe: sprint base + momentum inherit; the
      // sim's applyMomentum stacks it into the real dash speed, and
      // action='dash' makes tickBoost bill the drain.
      const sprint = f.unit.sprintSpeed ?? BOOST_MOVE_SPEED;
      f.vel.x = (dx / l) * sprint;
      f.vel.z = (dz / l) * sprint;
      inheritMomentum(f, MOMENTUM_STANDARD * 1.5);
      f.action = 'dash';
    } else {
      const speed = f.unit.walkSpeed ?? WALK_SPEED;
      f.vel.x = (dx / l) * speed;
      f.vel.z = (dz / l) * speed;
      f.action = 'idle';
      // Discard the bot's stale momentum along with its velocity plan —
      // tickBot may have just inherited a sprint-toward-target impulse this
      // very tick, and tickMatch's applyMomentum runs AFTER this driver
      // (offline erased it implicitly by overwriting vel post-momentum).
      f.momentumVX = 0;
      f.momentumVZ = 0;
    }
  } else {
    if (now >= mv.anchorUntil) { cmd.move = null; return; }
    // Engage-style orbit ANCHORED ON THE CIRCLE: tangent around the order
    // point at CMD_RADIUS with a spring back onto the ring. Facing/aim
    // stays with the bot (offline parity).
    const R = CMD_RADIUS;
    let rx = f.pos.x - mv.x;
    let rz = f.pos.z - mv.z;
    const d = Math.hypot(rx, rz);
    // LEASH RETURN (owner 2026-08-22): displaced beyond the leash (Defense
    // escape and the like) -> go back as a fresh TRAVEL leg, pathfinder
    // -guided like any trip, instead of letting the spring shove the unit
    // into whatever wall lies between. Attempts pace on the replan cadence
    // (immediately at reflex exit); a failed path keeps orbiting and
    // retries. anchorUntil is preserved — arrival resumes the remainder.
    if (d > CMD_ANCHOR_LEASH) {
      if (mv.reflexHeld || now >= (mv.replanAt ?? 0)) {
        mv.reflexHeld = false;
        mv.replanAt = now + CMD_REPLAN_MS;
        const fresh = computeCommandPath(matchState, f, mv.x, mv.z, mv.y);
        if (fresh) {
          mv.path = fresh;
          mv.idx = 0;
          mv.phase = 'travel';
          mv.wallTicks = 0;
          mv.lastAX = null;
          return;
        }
      }
    } else if (mv.reflexHeld) {
      // Reflex ended still inside the leash: resume the orbit; reset the
      // wall tracker so the reflex's stationary frames don't read as a
      // wall press.
      mv.reflexHeld = false;
      mv.wallTicks = 0;
      mv.lastAX = null;
    }
    // WALL FLIP (owner 2026-08-22 — Engage's wedge reverse, ported to the
    // anchor orbit): two consecutive driver ticks commanding the orbit yet
    // moving almost nothing = pressed into a wall (the ring straddles a
    // fence — the Airport rim glass case). Flip the orbit sign: the unit
    // turns around and patrols the REACHABLE arc, bouncing off each wall
    // contact instead of grinding it.
    if (mv.lastAX != null) {
      const moved = Math.hypot(f.pos.x - mv.lastAX, f.pos.z - mv.lastAZ);
      if (moved < 0.07) {
        mv.wallTicks = (mv.wallTicks ?? 0) + 1;
        if (mv.wallTicks >= 2) {
          mv.wallTicks = 0;
          mv.orbitSign = -mv.orbitSign;
        }
      } else {
        mv.wallTicks = 0;
      }
    }
    mv.lastAX = f.pos.x;
    mv.lastAZ = f.pos.z;
    if (d < 0.1) { rx = 1; rz = 0; } else { rx /= d; rz /= d; }
    const pull = Math.max(-1, Math.min(1, (R - d) * 0.25));
    const tx2 = -rz * mv.orbitSign + rx * pull;
    const tz2 = rx * mv.orbitSign + rz * pull;
    const l = Math.hypot(tx2, tz2) || 1;
    const speed = (f.unit.walkSpeed ?? WALK_SPEED) * 0.85;
    f.vel.x = (tx2 / l) * speed;
    f.vel.z = (tz2 / l) * speed;
    f.action = 'idle';
    // Same stale-momentum discard as the walk branch: without it the bot's
    // per-tick sprint impulse toward its own target drags the orbit off the
    // ring (~4 u/s of permanent bias in testing).
    f.momentumVX = 0;
    f.momentumVZ = 0;
  }
}
