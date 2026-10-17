// THE BOT'S TICK — one brain for both hosts and both modes (owner
// 2026-10-17, step 5 of the plain-brain rework: "one brain, two prices").
// The brain is the Sudden Death brain (sdbrain.js): one rule in four parts,
// priced in life. In Sudden Death a hit is a life; in Health Point mode a
// hit is damage / HP of one — the price's unit, and nothing else, changes
// with the mode, and no flag says which mode it is: HP is 1 or it is not.
// This module is what the brain needs around it in every mode, and what
// the two hosts share: the charge lock and the beam channel, the anti-glint
// dodge (the 50/50 game, kept), the step's lerp, the grounded muzzle, the
// arena reads the brain takes as given, the velocity dispatch of its order,
// and the trigger. The server's tickBot (ai.js) and the offline client's
// updateEnemy (main.js) each build a host and call nbBrainTick once a tick.
//
// THE HOST — what this tick reads and does through it:
//   now, me          the clock; the unit's state object (its bot* scratch,
//                    boost, hp, ammo, reload, fire clocks, momentum, action)
//   pos, vel         the body centre {x, y, z} and the velocity it writes
//   grounded, unit   the body's ground contact; the unit's data
//   opp, enemies     views of the target and of every live enemy: {id, pos,
//                    vel, hp, unit, lastFireAt, bloom, invulnerableUntil,
//                    chargeStartAt, chargingAtMe}; opp is one of enemies
//   cmd              the command entry {hide, move, lockTargetId} or null —
//                    a Hide or a Move order standing is the brain's hold
//   obstacles, surfaces, grid   the arena and its nav grid
//   muzzleUp         the muzzle above the body centre (the one eye)
//   tickMs           the host's tick length (the trigger's poll)
//   charging         the unit holds a sniper charge (stands still)
//   sd               the brain's knobs (BOT_SD, or a per-unit override)
//   wall             physics' note of the face the body was pushed out of
//   clear(p0, p1)    can a round fly p0 -> p1 (the projectile rules)
//   startStep(dx, dz), tickStep(), startJump(), fire()   the body's actions
//   inheritMomentum(k), searchSlot(), deadline(), tape
// Returns 'locked' (charge or beam: standing), 'stepping' (the dodge's lerp
// owns the body this tick) or 'ran'.

import { between } from './math.js';
import { segmentHitsObstacle, groundHeightAt, sightHitsSurface } from './physics.js';
import { GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS } from './constants.js';
import { sdBrainTick } from './sdbrain.js';

// Anti-sniper humanization: the bot rolls its reaction PER CHARGE — a
// defensive mixed strategy against the sniper's own 50/50 snap/hold coin
// flip. The slow roll is charger-aware:
//   ANTI-ARU (bullet snipers): 50% react at 400 ms (i-frames ~400-712 cover
//       every floor snap at any range; a full hold at ~1040 sails in after)
//       / 50% react at 800 ms (snaps land first and cancel the pending
//       dodge; i-frames ~800-1100 sit exactly on the full hold's impact).
//       Equilibrium vs the 50/50 shooter = 50% dodged.
//   ANTI-KEI (beam snipers, unit.beam): 50% react at 400 ms (covers the
//       instant quick beam) / 50% react at 900 ms — the dodge starts just
//       ahead of the sweep channel's aimed opening (~1000), i-frames
//       ~900-1200 blanket it, then the follow-up sprint outruns the ~10°/s
//       steer at normal fighting ranges. An 800 ms roll would be dead
//       weight vs Kei (quick beam pre-empts it, sweep outlives it).
//   BOT_GLINT_REACT_MS          — fast roll when the sniper IS the lock target
//   BOT_GLINT_REACT_UNLOCKED_MS — fast roll for any OTHER enemy (separable)
//   BOT_GLINT_RUN_MS            — after the dodge's step the body keeps
//       running the dodge's line this long: the follow-through the roll buys
//       (the brain pauses for it, as it does for the step)
const BOT_GLINT_REACT_MS = 400;
const BOT_GLINT_REACT_UNLOCKED_MS = 400;
const BOT_GLINT_REACT_SLOW_MS = 800;        // anti-Aru slow roll
const BOT_GLINT_REACT_SLOW_BEAM_MS = 900;   // anti-Kei slow roll
const BOT_GLINT_REACT_FAST_CHANCE = 0.5;
const BOT_GLINT_RUN_MS = 520;
// Obstacle repulsion: the brain blends it into every leg (sdbrain avoid).
const BOT_OBSTACLE_AVOID_RADIUS = 7;
// How long after a jump the bot keeps driving toward the ledge so the arc
// lands where it was aimed. Covers the longest arc (~0.85 s airborne).
const BOT_AIR_STEER_MS = 900;
// LoS-aware 2v2 targeting (the hosts' target picks): an enemy with no line
// of sight reads this many units FARTHER than it really is, so a visible
// enemy wins the lock unless the blocked one is drastically closer; the
// margin keeps the current lock unless a rival clearly beats it.
export const BOT_TARGET_BLOCKED_PENALTY = 50;
export const BOT_TARGET_SWITCH_MARGIN = 6;

// Repulsion vector from blocking obstacles within `radius`. Skips obstacles
// the bot is over or under (same skip math as resolveUnitObstacleCollisions).
// JUMPABLE `noProjectile` fences (height <= 4.8 — station / flashpoint
// 4-high platform edges) are skipped so a route can walk the bot up to them.
// UNJUMPABLE ones (square's 14-high fountain colonnade, streets' tall
// under-bridge blockers) DO repel: they block movement like any wall.
function computeBotAvoidance(px, py, pz, obstacles, radius) {
  let rx = 0, rz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    // (py > o.maxY: a bot already ABOVE the fence top — e.g. crossing the
    // streets bridge deck over its 6-high under-deck end walls — passes over
    // it freely and must not be shoved sideways.)
    if (o.noProjectile && ((o.maxY - o.minY) <= 4.8 || py > o.maxY)) continue;
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
// `surfaces` adds the deck/ramp masses (see sightHitsSurface) — optional so
// exotic callers without surface data stay safe. The hosts' target picks and
// the hide-order tests judge "seen" by it.
export function botHasLineOfSight(p0, p1, obstacles, surfaces) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    // Invisible unit-fences normally don't block sight (bullets pass), but
    // bars flagged blocksBotSight DO: a see-through wall the bot cannot walk
    // through defeats every routing trigger (Streets under-slope bars).
    if (o.noProjectile && !o.blocksBotSight) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  if (surfaces) {
    for (let i = 0; i < surfaces.length; i++) {
      if (sightHitsSurface(p0, p1, surfaces[i])) return false;
    }
  }
  return true;
}

export function nbBrainTick(host) {
  const { now, me, pos, vel, grounded, unit, opp, enemies, obstacles, surfaces, grid, muzzleUp, sd } = host;

  // Sniper-charge lock: stand still until the charge resolves.
  if (host.charging) {
    vel.x = 0;
    vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return 'locked';
  }
  // Locked while channeling a charged sweep (beam tracks target in tickChargedBeams).
  if (me.chargedBeamUntil > now) {
    vel.x = 0;
    vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return 'locked';
  }

  // Which enemies have a sniper charge on this unit (the glint the unit sees).
  const chargers = enemies.filter((f) => f.chargingAtMe);

  const dx = opp.pos.x - pos.x;
  const dz = opp.pos.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dist > 1e-6 ? dx / dist : 1;
  const dirZ = dist > 1e-6 ? dz / dist : 0;
  const sideX = -dirZ;
  const sideZ = dirX;

  // --- Anti-sniper glint response: dodge a fixed reaction delay after a
  // glint AIMED AT ME appears — from ANY enemy, locked or not (humans see
  // off-lock glints on the edge indicator too; no LoS check, matching the
  // locked case). The earliest-started active charge wins; one step per
  // charge, one schedule at a time — a charge that overlaps a pending/spent
  // dodge gets its own dodge only after the first charge resolves. The
  // schedule survives the glint vanishing so a late/full-charge shot is
  // still covered.
  let glintThreat = null;
  for (const f of chargers) {
    if (!glintThreat || f.chargeStartAt < glintThreat.chargeStartAt) glintThreat = f;
  }
  if (glintThreat) {
    const glintKey = `${glintThreat.id}:${glintThreat.chargeStartAt}`;
    if (me.botGlintKey !== glintKey && me.botGlintStepAt == null) {
      me.botGlintKey = glintKey;
      me.botGlintAttackerId = glintThreat.id;
      // Per-charge defensive roll: fast (snap-dodger) or slow (hold-dodger).
      // The slow value is charger-aware: anti-Kei (beam) waits for the sweep
      // channel's opening; anti-Aru (bullet) sits on the full hold's impact.
      const fastReact = glintThreat.id === opp.id
        ? BOT_GLINT_REACT_MS
        : BOT_GLINT_REACT_UNLOCKED_MS;
      const slowReact = glintThreat.unit?.beam
        ? BOT_GLINT_REACT_SLOW_BEAM_MS
        : BOT_GLINT_REACT_SLOW_MS;
      me.botGlintStepAt = now + (Math.random() < BOT_GLINT_REACT_FAST_CHANCE
        ? fastReact
        : slowReact);
    }
  } else if (me.botGlintStepAt == null) {
    me.botGlintKey = null;
  }
  // A fresh hit means the shot already landed — drop the now-pointless dodge.
  if (me.hitStunUntil > (me.botPrevHitStun ?? 0)) me.botGlintStepAt = null;
  me.botPrevHitStun = me.hitStunUntil;

  // The dodge comes due: one i-frame step, then the run along its line for
  // BOT_GLINT_RUN_MS (the guess/schedule is spent either way). SURVIVAL
  // EXEMPTION: gates at the raw step cost only — the host's step enforces
  // STEP_BOOST_COST underneath, human-identical — so even a suppressed bot
  // may spend its last savings to survive a sniper shot.
  if (me.botGlintStepAt != null && now >= me.botGlintStepAt) {
    me.botGlintStepAt = null;
    if (now > me.stepUntil) {
      // Direction: perpendicular to the ATTACKER's line of fire. A NON-locked
      // attacker gets a strict perpendicular. The locked attacker: continue
      // a dodge run already under way, else a random lateral vs the locked
      // target (== perpendicular to it).
      let sdx, sdz;
      const glintAtk = me.botGlintAttackerId ? (enemies.find((f) => f.id === me.botGlintAttackerId) ?? null) : null;
      if (glintAtk && glintAtk.id !== opp.id) {
        const adx = pos.x - glintAtk.pos.x;
        const adz = pos.z - glintAtk.pos.z;
        const ad = Math.sqrt(adx * adx + adz * adz) || 1;
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = (-adz / ad) * lat;
        sdz = (adx / ad) * lat;
      } else if (now < (me.botDodgeUntil ?? 0) && me.botDodgeDirX != null) {
        sdx = me.botDodgeDirX; sdz = me.botDodgeDirZ;
      } else {
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = sideX * lat; sdz = sideZ * lat;
      }
      if (host.startStep(sdx, sdz)) {
        me.botDodgeDirX = sdx; me.botDodgeDirZ = sdz;
        me.botDodgeUntil = me.stepUntil + BOT_GLINT_RUN_MS;
      }
    }
  }

  // Step lifecycle. Bots skip applyInput (where players' steps are ticked), so
  // the bot's own step must be advanced here: while mid-step the lerp owns
  // position/velocity/action; the first tick after it ends pays out the
  // queued momentum. THE BRAIN WATCHES THE DODGE: the step's lerp owns the
  // body, but the brain still sees (the eyes, the rounds in the air, the
  // clock) and the gun still fires — the velocity dispatch below stands down
  // for the step's duration.
  const stepping = now <= me.stepUntil;
  if (stepping) host.tickStep();
  else if (me.stepUntil > 0) host.tickStep();

  // GROUNDED MUZZLE: every line the unit tests from ITSELF is taken from the
  // muzzle it has with its feet down, never from the live body height — a
  // jump must not manufacture a firing line. Latch the last grounded height
  // and take the LOWER of it and the live one, so a drop off a ledge stays
  // honest too. The enemies' end stays live: a jumping human still counts.
  if (grounded && !me.airborne) me.botSightY = pos.y;
  const myShotY = Math.min(pos.y, me.botSightY ?? pos.y) + muzzleUp;

  const avoid = computeBotAvoidance(pos.x, pos.y, pos.z, obstacles, BOT_OBSTACLE_AVOID_RADIUS);
  const avoidMag = Math.hypot(avoid.rx, avoid.rz);
  const myFloorY = groundHeightAt(pos.x, pos.z, surfaces, pos.y - GROUND_BASE_Y);

  // ===== THE BRAIN (sdbrain.js) — or the dodge's run, which it pauses for =====
  const cmd = host.cmd ?? null;
  const hold = !!(cmd && (cmd.hide || cmd.move));   // (a Hide or a Move order stands: nothing is bought)
  let coverMove;
  if (now < (me.botDodgeUntil ?? 0)) {
    coverMove = { hold: false, hide: true, dash: true, mx: me.botDodgeDirX ?? sideX, mz: me.botDodgeDirZ ?? sideZ };
    me.botSDState = 'dodge';
  } else {
    coverMove = sdBrainTick({
      now, SD: sd, me, pos, unit, vel, grounded,
      wall: host.wall,   // (physics' note from the last tick: the face the body was pushed out of)
      opp, enemies, hold,
      obstacles, grid, clear: host.clear,
      eyeUp: muzzleUp, muzzleH: muzzleUp,
      dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag,
      groundHeightAt: (x, z, fallback) => groundHeightAt(x, z, surfaces, fallback),
      startStep: host.startStep,
      startJump: host.startJump,
      searchSlot: host.searchSlot,
      deadline: host.deadline,
      tape: host.tape ?? null
    });
  }

  // === Velocity dispatch — the brain's order into the body's velocity.
  // Mid-jump airborne ticks hold the launch aim so the arc lands where it
  // was committed; a sprint is funded to the brain's floor (dashFloor) and
  // never on an empty tank's recovery.
  const sprintBase = unit?.sprintSpeed ?? BOOST_MOVE_SPEED;
  const walkSpeed = unit?.walkSpeed ?? WALK_SPEED;
  const canSprint = me.boost >= sd.dashFloor && now >= me.emptyRecoverUntil;
  if (stepping) {
    // (the dodge's lerp owns the body this tick: no velocity, no action from the brain)
  } else if (coverMove.jump) {
    me.botAirSteerX = coverMove.jx;
    me.botAirSteerZ = coverMove.jz;
    me.botAirSteerUntil = now + BOT_AIR_STEER_MS;
    vel.x = coverMove.jx * sprintBase;
    vel.z = coverMove.jz * sprintBase;
    me.action = 'jump';
  } else if (me.airborne && (me.botAirSteerUntil ?? 0) > now) {
    const ax = me.botAirSteerX ?? coverMove.mx;
    const az = me.botAirSteerZ ?? coverMove.mz;
    vel.x = ax * sprintBase;
    vel.z = az * sprintBase;
    me.action = 'dash';
  } else if (coverMove.dash && canSprint) {
    vel.x = coverMove.mx * sprintBase;
    vel.z = coverMove.mz * sprintBase;
    host.inheritMomentum(MOMENTUM_STANDARD * 1.5);
    me.action = 'dash';
  } else {
    vel.x = coverMove.mx * walkSpeed;
    vel.z = coverMove.mz * walkSpeed;
    // Anti-freeze nudge — never on a HOLD (the brain's own standing still).
    if (!coverMove.hold && Math.abs(vel.x) + Math.abs(vel.z) < 0.08) {
      vel.x = sideX * 4.5;
      vel.z = sideZ * 4.5;
    }
    me.action = 'idle';
  }

  // --- THE TRIGGER: the brain's (me.botSDFire — the unit's own reaction done
  // and its silhouette in sight), the line clear at the grounded muzzle, and
  // the gun's own cadence while the trigger stays open; a sniper's release
  // on the 50/50 coin flip. The bot's OWN spawn immunity never holds fire
  // (every hit check is target-side); the TARGET's does.
  if (now >= me.nextFireAt) {
    const u = unit;
    if (u.magCapacity != null && me.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (me.reloadingUntil || now + u.reloadMs) - now);
      me.nextFireAt = now + wait;
    } else if (now < opp.invulnerableUntil) {
      // Wake at the immunity lapse or the regular poll, whichever comes first (the target can change).
      me.nextFireAt = Math.min(opp.invulnerableUntil, now + 220);
    } else if (!me.botSDFire) {
      // (hidden, or the unit's own reaction still running: no shot, polled every tick)
      me.nextFireAt = now + host.tickMs;
    } else if (!host.clear({ x: pos.x, y: myShotY, z: pos.z }, { x: opp.pos.x, y: opp.pos.y + muzzleUp, z: opp.pos.z })) {
      // No clear shot from the GROUNDED muzzle (see myShotY) — the fast poll: a line opens and closes within one sprint.
      me.nextFireAt = now + sd.firePollMs;
    } else if (u.sniperCharge) {
      const fired = host.fire();
      if (fired) {
        // Sniper release timing — a 50/50 coin flip for BOTH snipers:
        // Kei (beam): quick floor beam OR the full-charge sweep channel.
        // Aru: exact floor snap OR held to FULL charge. The hold lands after
        // a defender's spent dodge i-frames, the snap punishes non-dodgers.
        me.sniperChargeUntil = now + (Math.random() < 0.5
          ? SNIPER_CANCEL_MIN_CHARGE_MS
          : (u.chargeMs ?? 1000));
        me.nextFireAt = now + u.fireCooldownMs + between(400, 1200);
      } else me.nextFireAt = now + 220;
    } else {
      // THE EXPOSED DUMP: rounds at the gun's own cooldown while the trigger
      // stays open — until the line closes or the magazine empties.
      const firedAt = me.lastFireAt;
      host.fire();
      if (me.lastFireAt !== firedAt) me.botSDExposedShots = (me.botSDExposedShots ?? 0) + 1;   // (the report: rounds fired while exposed)
      me.nextFireAt = now + u.fireCooldownMs;
    }
  }
  return stepping ? 'stepping' : 'ran';
}
