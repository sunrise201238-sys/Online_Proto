// FROZEN at b1021z for the bots' equivalence tests (nb_equiv.test.js, sdbrain_equiv.test.js): a copy of
// shared/src/sim/ai.js with its imports pointed at the live sim and at the other frozen copies. Not edited by hand;
// re-frozen with the build whose play it must match (freeze_refs.py).
// THE BOT HOST, SERVER SIDE. The brain is shared/src/sim/nbrain.js (the
// Health Point brain, with the Sudden Death brain sdbrain.js inside it); this
// file finds the unit and its target, builds the host the brain reads and
// acts through, and keeps the server's own pieces: the nav-grid cache, the
// 2v2 target pick, the per-fighter Sudden Death overrides, the hit-stun
// slowdown after the brain's velocity.

import { attemptFire, tryStartJump, tryStartStep, tickStep } from '../src/sim/actions.js';
import { getArena } from '../src/sim/arena.js';
import { buildNavGrid } from '../src/sim/navgrid.js';
import { inheritMomentum } from '../src/sim/movement.js';
import { PROJECTILE_MUZZLE_Y_OFFSET, TICK_RATE_MS, BOT_LOS_EYE_HEIGHT } from '../src/sim/constants.js';
import { nbBrainTick, botHasLineOfSight, BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from './nbrain_b1021z_ref.js';
import { makeMuzzleClear, BOT_SD } from './sdbrain_b1021z_ref.js';
// The Sudden Death brain, its knobs and its risk models live in sdbrain.js
// (one module for the server and the client); re-exported here for the
// client's imports. The plain brain's sight rule is re-exported for the
// hide-order tests, which judge "hidden" by the bot's own rule.
export { BOT_SD, capsuleHitFrac, sdExposureRisk, sdOwnHitChance, sdOwnReach, sdRouteRisk } from './sdbrain_b1021z_ref.js';
export { botHasLineOfSight } from './nbrain_b1021z_ref.js';

// Nav grids are built once per arena object (the ARENAS entries are module
// singletons, so this is once per map per process) and shared by all bots
// and lobbies on that map.
const navGridCache = new WeakMap();
export function navGridFor(arena) {
  let grid = navGridCache.get(arena);
  if (!grid) {
    grid = buildNavGrid(arena.obstacles, arena.surfaces);
    navGridCache.set(arena, grid);
  }
  return grid;
}

// LoS-aware bot target pick (2v2). Score = real distance + a flat penalty
// when the enemy is out of line of sight — raw closest-distance locked the
// enemy sealed behind the Airport rim glass (unreachable without rounding
// the whole plateau) while the OTHER enemy shot freely. An enemy standing at
// an opening HAS LoS, so it still reads as genuinely close. Hysteresis: keep
// the current lock unless a rival beats it by a clear margin.
export function pickBotTargetId(matchState, fighter) {
  const enemies = Object.values(matchState.fighters)
    .filter((f) => f.team !== fighter.team && f.hp > 0);
  if (enemies.length === 0) return null;
  if (enemies.length === 1) return enemies[0].id;
  const obstacles = getArena(matchState.mapKey).obstacles;
  const sightSurfaces = getArena(matchState.mapKey).surfaces;
  let bestId = enemies[0].id;
  let bestScore = Infinity;
  let currentScore = null;
  for (const e of enemies) {
    const d = Math.hypot(e.pos.x - fighter.pos.x, e.pos.z - fighter.pos.z);
    const seen = botHasLineOfSight(
      { x: fighter.pos.x, y: fighter.pos.y + BOT_LOS_EYE_HEIGHT, z: fighter.pos.z },
      { x: e.pos.x, y: e.pos.y + BOT_LOS_EYE_HEIGHT, z: e.pos.z },
      obstacles, sightSurfaces
    );
    const score = d + (seen ? 0 : BOT_TARGET_BLOCKED_PENALTY);
    if (e.id === fighter.targetId) currentScore = score;
    if (score < bestScore) { bestScore = score; bestId = e.id; }
  }
  if (currentScore != null && currentScore <= bestScore + BOT_TARGET_SWITCH_MARGIN) {
    return fighter.targetId;
  }
  return bestId;
}

export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
  // Mark bot control for shared helpers that behave differently for bots
  // (tryStartJump floors zero-cooldown jumps at 1.5 s for bots so the perch
  // reflex can't bunny-hop Aris — bots play flight units grounded).
  me.botControlled = true;
  // Bot's opp is its current targetId. In 1v1 there's only ever one enemy so
  // this is equivalent to the old hardcoded pair lookup. In 2v2 the server
  // (or the caller) picks the closest live enemy via pickClosestEnemyId and
  // writes it onto me.targetId before this call.
  const target = me.targetId ? matchState.fighters[me.targetId] : null;
  if (!target || target.hp <= 0) return;
  const arena = getArena(matchState.mapKey);
  const obstacles = arena.obstacles;
  const surfaces = arena.surfaces;
  // The enemies as the brain sees them (one view each; the target is among them).
  const enemies = [];
  for (const f of Object.values(matchState.fighters)) {
    if (f.team !== me.team && f.hp > 0) {
      enemies.push({
        id: f.id, pos: f.pos, vel: f.vel, hp: f.hp, unit: f.unit,
        lastFireAt: f.lastFireAt, bloom: f.bloom, invulnerableUntil: f.invulnerableUntil,
        chargeStartAt: f.sniperChargeStartAt, chargingAtMe: f.sniperChargeTargetId === me.id
      });
    }
  }
  const opp = enemies.find((v) => v.id === target.id);
  nbBrainTick({
    now, me, pos: me.pos, vel: me.vel, grounded: me.grounded, unit: me.unit,
    opp, enemies,
    // the command side-table entry (matchState.commands[slot] — command.js
    // imports this module, so importing isHideOrdered back would close a cycle)
    cmd: matchState.commands?.[botId] ?? null,
    obstacles, surfaces, grid: navGridFor(arena),
    eyeUp: BOT_LOS_EYE_HEIGHT, muzzleUp: PROJECTILE_MUZZLE_Y_OFFSET,
    mode: matchState.mode, tickMs: TICK_RATE_MS,
    charging: !!me.sniperChargeTargetId,
    // Per-fighter overrides (me.botSDOpts) let the harness A/B two rule sets inside one match.
    sd: me.botSD ? (me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD) : null,
    wall: matchState.walls?.[me.id] ?? null,   // (tick.js stage 5)
    clear: makeMuzzleClear(obstacles, surfaces),
    startStep: (dx, dz) => tryStartStep(matchState, me, dx, dz, now, obstacles),
    tickStep: () => tickStep(me, now, obstacles),
    startJump: () => tryStartJump(me, now),
    fire: () => attemptFire(matchState, me, target, now),
    inheritMomentum: (k) => inheritMomentum(me, k),
    // Paths live on matchState._navPaths, NOT on the fighter: the fighter
    // object is serialized into every snapshot.
    navGet: () => (matchState._navPaths ? matchState._navPaths[botId] ?? null : null),
    navSet: (v) => {
      if (v) (matchState._navPaths ??= {})[botId] = v;
      else if (matchState._navPaths) delete matchState._navPaths[botId];
    },
    // (one route search per tick per match)
    searchSlot: () => { if (matchState.hideSearchTick === matchState.tick) return false; matchState.hideSearchTick = matchState.tick; return true; },
    // (the server's per-tick CPU budget — see findHiddenSpot; the sim sets none)
    deadline: () => matchState.searchDeadline ?? 0,
    tape: null
  });
  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing — the host's physics, applied to whatever velocity the brain set.
  if (now < me.hitStunUntil) {
    me.vel.x *= me.hitStunScale;
    me.vel.z *= me.hitStunScale;
  }
}
