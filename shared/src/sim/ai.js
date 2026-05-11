// Bot AI — pure-JS port of updateEnemy from main.js. Used by the headless
// test harness for bot-vs-bot soak testing. The actual online server only
// runs this if a player slot is unoccupied (e.g. spectator-only modes or
// "fight a bot" mode).
//
// Returns an InputFrame the tick orchestrator can apply via applyInput.

import { between } from './math.js';
import { attemptFire } from './actions.js';
import { MAX_HP, STEP_BOOST_COST } from './constants.js';

// --- Bot tactical-sprint tunables ---
// Hysteresis: bot only initiates a new sprint burst once boost has refilled
// to BOT_SPRINT_READY_BOOST. This prevents the stutter-step that happens when
// boost barely crosses 0 and is immediately spent again.
const BOT_SPRINT_READY_BOOST = STEP_BOOST_COST;            // 48
const BOT_SPRINT_MIN_BOOST = 8;
// Burst window — duration that vel is held in burst direction with action='dash'
// (so updateBoost / tickBoost drains the gauge during this window).
const BOT_SPRINT_BURST_MS = 280;
// Velocity magnitude during a burst — noticeably faster than the kiting walk
// (10.6) so the player can read it as a deliberate evade. Hit detection is
// unaffected since we don't change collision shapes.
const BOT_SPRINT_BURST_VEL = 17;
// How far ahead to look for projectiles that are heading toward us. Bot only
// burst-evades projectiles within this radius and approaching.
const BOT_THREAT_LOOKAHEAD = 14;

// Find the nearest projectile that targets `me`, is within range, and is
// heading toward `me`. Used to decide when to spend boost on an evade.
function findIncomingThreat(matchState, me, range) {
  const r2 = range * range;
  for (const p of matchState.projectiles) {
    if (p.targetId !== me.id) continue;
    const dxp = p.pos.x - me.pos.x;
    const dzp = p.pos.z - me.pos.z;
    if (dxp * dxp + dzp * dzp > r2) continue;
    // Heading toward us when the dot product of (toward-me vector) and
    // velocity is positive.
    const dot = (-dxp) * p.vel.x + (-dzp) * p.vel.z;
    if (dot <= 0) continue;
    return p;
  }
  return null;
}

// Match the InputFrame shape produced by the client: an idealized "what the
// player would press" set the orchestrator already knows how to consume.
function makeInput() {
  return {
    moveX: 0,
    moveZ: 0,
    boost: false,
    sprintLocked: false,
    jump: false,
    stepTap: false,
    shootTap: false,
    shootHold: false
  };
}

// Drives the bot's velocity directly (legacy-style — sets vel and fires
// through attemptFire). Mirrors updateEnemy. Pre-orchestrator callers should
// use this; it sidesteps the input-frame shape and operates closer to the
// original code path so feel matches.
export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
  const opponentId = botId === 'p1' ? 'p2' : 'p1';
  const opp = matchState.fighters[opponentId];
  if (!opp) return;

  // Sniper-charge lock: stand still until the charge resolves.
  if (me.sniperChargeTargetId) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }

  const dx = opp.pos.x - me.pos.x;
  const dz = opp.pos.z - me.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dist > 1e-6 ? dx / dist : 1;
  const dirZ = dist > 1e-6 ? dz / dist : 0;
  const sideX = -dirZ;
  const sideZ = dirX;

  if (Math.random() > 0.985) me.strafeSign *= -1;
  const retreat = dist < 11 ? -0.9 : dist > 19 ? 0.62 : 0.15;
  let mx = dirX * retreat + sideX * me.strafeSign * 1.05;
  let mz = dirZ * retreat + sideZ * me.strafeSign * 1.05;

  // --- Tactical sprint state machine ---
  // Default behaviour is to WALK along the kiting direction (no boost drain,
  // action='idle'), saving the gauge for actual tactical bursts.
  //
  // Hysteresis flag botSprintReady flips ON once boost has refilled to
  // BOT_SPRINT_READY_BOOST and OFF only when the gauge is fully drained — so
  // the bot won't engage a sprint until it has a meaningful chunk of boost,
  // and then commits to spending it rather than stutter-stepping every time
  // the gauge crosses 0.
  if (me.boost >= BOT_SPRINT_READY_BOOST) me.botSprintReady = true;
  if (me.boost <= 0) me.botSprintReady = false;

  let inBurst = (me.botSprintUntil ?? 0) > now;
  // End a burst early if boost ran dry mid-flight, so we drop back to walking
  // and start the regen cycle instead of sliding at full burst velocity with
  // an empty gauge.
  if (inBurst && me.boost <= 0) {
    me.botSprintUntil = 0;
    inBurst = false;
  }
  const canStartBurst = !inBurst
    && me.botSprintReady === true
    && me.boost >= BOT_SPRINT_MIN_BOOST
    && now > me.evadeCooldownUntil
    && now >= me.emptyRecoverUntil
    && now >= me.hitStunUntil;

  if (canStartBurst) {
    // Trigger 1: incoming projectile — evade perpendicular.
    const threat = findIncomingThreat(matchState, me, BOT_THREAT_LOOKAHEAD);
    if (threat) {
      // Pick the side that moves AWAY from the projectile's heading.
      const cross = threat.vel.x * sideZ - threat.vel.z * sideX;
      const evadeSign = cross >= 0 ? 1 : -1;
      me.botSprintDirX = sideX * evadeSign;
      me.botSprintDirZ = sideZ * evadeSign;
      me.botSprintUntil = now + BOT_SPRINT_BURST_MS;
      me.evadeCooldownUntil = now + 700;
      me.evadeHomingUntil = now + 240;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (dist < 8) {
      // Trigger 2: opponent too close — burst back to re-open kiting space.
      me.botSprintDirX = -dirX;
      me.botSprintDirZ = -dirZ;
      me.botSprintUntil = now + 240;
      me.evadeCooldownUntil = now + 600;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (me.hp < (me.unit?.hp ?? MAX_HP) * 0.4 && dist < 18 && Math.random() > 0.85) {
      // Trigger 3: low HP — kite further away ("go for cover" approximated as
      // increasing range; we don't have obstacle awareness for true cover).
      let bx = -dirX + sideX * me.strafeSign * 0.5;
      let bz = -dirZ + sideZ * me.strafeSign * 0.5;
      const blen = Math.sqrt(bx * bx + bz * bz) || 1;
      me.botSprintDirX = bx / blen;
      me.botSprintDirZ = bz / blen;
      me.botSprintUntil = now + 320;
      me.evadeCooldownUntil = now + 900;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    } else if (Math.random() > 0.985) {
      // Trigger 4: occasional unpredictable strafe burst (rare, adds variance
      // so the bot doesn't sit still between threats).
      const strafeSign = Math.random() > 0.5 ? 1 : -1;
      let bx = sideX * strafeSign + dirX * 0.25;
      let bz = sideZ * strafeSign + dirZ * 0.25;
      const blen = Math.sqrt(bx * bx + bz * bz) || 1;
      me.botSprintDirX = bx / blen;
      me.botSprintDirZ = bz / blen;
      me.botSprintUntil = now + 220;
      me.evadeCooldownUntil = now + 700;
      me.momentumVX = 0;
      me.momentumVZ = 0;
      inBurst = true;
    }
  }

  if (inBurst) {
    me.vel.x = (me.botSprintDirX ?? 0) * BOT_SPRINT_BURST_VEL;
    me.vel.z = (me.botSprintDirZ ?? 0) * BOT_SPRINT_BURST_VEL;
    me.action = 'dash';
  } else {
    // Walk pace — kiting direction, no boost drain.
    const moveScalar = now < me.hitStunUntil ? 0 : 10.6;
    me.vel.x = mx * moveScalar;
    me.vel.z = mz * moveScalar;
    if (Math.abs(me.vel.x) + Math.abs(me.vel.z) < 0.08) {
      me.vel.x = sideX * 4.5;
      me.vel.z = sideZ * 4.5;
    }
    me.action = 'idle';
  }

  if (dist > 14 && Math.random() > 0.9) me.evadeHomingUntil = now + 90;

  if (now >= me.nextFireAt) {
    const u = me.unit;
    if (u.magCapacity != null && me.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (me.reloadingUntil || now + u.reloadMs) - now);
      me.nextFireAt = now + wait;
      me.machineBurstRemaining = 0;
    } else if (u.sniperCharge) {
      const fired = attemptFire(matchState, me, opp, now);
      if (fired) me.nextFireAt = now + u.fireCooldownMs + between(400, 1200);
      else me.nextFireAt = now + 220;
      me.machineBurstRemaining = 0;
    } else {
      if (u.spreadCount === 1 && me.machineBurstRemaining <= 0) me.machineBurstRemaining = 5;
      const firedAt = me.lastFireAt;
      attemptFire(matchState, me, opp, now);
      const fired = me.lastFireAt !== firedAt;
      if (u.spreadCount === 1) {
        if (fired) me.machineBurstRemaining -= 1;
        // Intra-burst cadence ties to the unit's actual fireCooldownMs so
        // bumping firePerMinute on a character makes the bot fire faster
        // too, instead of being stuck at the old hardcoded 150 ms beat.
        // Inter-burst pause stays a tactical AI choice (1.3-2.4 s).
        me.nextFireAt = me.machineBurstRemaining > 0
          ? now + u.fireCooldownMs
          : now + between(1300, 2400);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        if (fired) me.nextFireAt = now + between(1500, 3000);
        else me.nextFireAt = now + 120;
      }
    }
  }
}
