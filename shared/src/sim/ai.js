// Bot AI — pure-JS port of updateEnemy from main.js. Used by the headless
// test harness for bot-vs-bot soak testing. The actual online server only
// runs this if a player slot is unoccupied (e.g. spectator-only modes or
// "fight a bot" mode).
//
// Returns an InputFrame the tick orchestrator can apply via applyInput.

import { between } from './math.js';
import { attemptFire } from './actions.js';

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

  // Bot respects its boost gauge — see updateEnemy in client/src/main.js for
  // the matching offline logic and rationale (without this gate the bot
  // effectively had infinite sprint).
  const sprintAvailable = me.boost > 0 && now >= me.emptyRecoverUntil;
  const baseMoveScalar = sprintAvailable ? 10.6 : 5.6;
  const moveScalar = now < me.hitStunUntil ? 0 : baseMoveScalar;
  me.vel.x = mx * moveScalar;
  me.vel.z = mz * moveScalar;
  if (Math.abs(me.vel.x) + Math.abs(me.vel.z) < 0.08) {
    const driftScalar = sprintAvailable ? 4.5 : 2.4;
    me.vel.x = sideX * driftScalar;
    me.vel.z = sideZ * driftScalar;
  }

  const idleAction = sprintAvailable ? 'dash' : 'idle';
  if (sprintAvailable && dist < 10 && me.boost > 18 && now > me.evadeCooldownUntil && Math.random() > 0.66) {
    const sign = Math.random() > 0.5 ? 1 : -1;
    me.vel.x += sideX * sign * 22;
    me.vel.z += sideZ * sign * 22;
    me.evadeHomingUntil = now + 240;
    me.evadeCooldownUntil = now + 520;
    me.action = 'dash';
  } else {
    me.action = idleAction;
    if (sprintAvailable && dist >= 10 && dist <= 20 && me.boost > 12 && Math.random() > 0.88) {
      const sign = Math.random() > 0.5 ? 1 : -1;
      me.vel.x += sideX * sign * 26;
      me.vel.z += sideZ * sign * 26;
      me.evadeHomingUntil = now + 280;
    }
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
        me.nextFireAt = me.machineBurstRemaining > 0 ? now + 150 : now + between(1300, 2400);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        if (fired) me.nextFireAt = now + between(1500, 3000);
        else me.nextFireAt = now + 120;
      }
    }
  }
}
