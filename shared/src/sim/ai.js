// Bot AI — pure-JS port of updateEnemy from main.js. Used by the headless
// test harness for bot-vs-bot soak testing. The actual online server only
// runs this if a player slot is unoccupied (e.g. spectator-only modes or
// "fight a bot" mode).
//
// Designed to be agnostic to weapon stats and map layout:
//   - Range bands derive from the unit's lockRange (works for any weapon).
//   - Burst length derives from magCapacity (works for any future mag size).
//   - Obstacle avoidance, LoS firing, and elevation tactics (jumping onto
//     ledges for a high-ground advantage, dropping off them to reset kiting
//     distance) all work from the map's obstacle/surface lists, so re-tuning
//     a map's geometry is enough to re-tune the bot.

import { between } from './math.js';
import { attemptFire, tryStartJump, tryStartStep, tickStep } from './actions.js';
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle, walkSegmentBlocked } from './physics.js';
import { getArena } from './arena.js';
import { buildNavGrid, findPathOnGrid, findFiringPath } from './navgrid.js';
import { inheritMomentum } from './movement.js';
import { MAX_HP, STEP_BOOST_COST, GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS } from './constants.js';

// --- Bot tactical-sprint tunables (mirrored in client/src/main.js) ---
const BOT_SPRINT_MIN_BOOST = 8;
// Strategic reserve: bots never VOLUNTARILY spend below this — one knob
// gating every travel decision (sprint dispatch, Pursue hysteresis, Maze
// cruise/jump funding, the anti-glint dodge). The sole exception is
// Defense: escaping live fire may burn down to BOT_SPRINT_MIN_BOOST.
// This is purely a bot DECISION threshold — the stamina MECHANICS
// (costs, drain, regen, caps, empty-recovery) stay identical to the
// human player's.
const BOT_BOOST_RESERVE = 250;   // 150 -> 250 (2026-08-01): reserve = full cap - travel sprints only from a topped-up tank
// Projectiles are near-hitscan (500-800 u/s), so a round in flight can't be
// reacted to — the bot reacts to the enemy *firing* instead. Treat the enemy
// as "shooting at me" for this long after their last shot, which covers the
// MG's fast cadence and bridges the gaps between rounds in a burst.
const BOT_FIRE_REACT_MS = 280;
// Cover-seek: how far to look for an obstacle to hide behind, how hard to
// steer toward it, and the largest obstacle footprint still treated as cover
// (anything bigger is an arena boundary wall, which can't be flanked — skip).
// A fresh hit forces an evade for this long (so taking damage always provokes a
// relocate, even if the shot landed at the edge of the fire window).
const BOT_HIT_EVADE_MS = 350;
// Anti-sniper humanization: the bot rolls its reaction PER CHARGE (mirrored
// in client/src/main.js) — a defensive mixed strategy against the sniper's
// own 50/50 snap/hold coin flip. The slow roll is charger-aware:
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
const BOT_GLINT_REACT_MS = 400;
const BOT_GLINT_REACT_UNLOCKED_MS = 400;
const BOT_GLINT_REACT_SLOW_MS = 800;        // anti-Aru slow roll
const BOT_GLINT_REACT_SLOW_BEAM_MS = 900;   // anti-Kei slow roll
const BOT_GLINT_REACT_FAST_CHANCE = 0.5;
// No clear line to the player for this long => enter "dire search": drop all
// range discipline and beeline to the player until a clear line is regained.
const BOT_DIRE_SEARCH_MS = 4000;
const BOT_OBSTACLE_AVOID_RADIUS = 7;
const BOT_OBSTACLE_AVOID_WEIGHT = 1.8;
const BOT_STUCK_MOVED_EPSILON = 0.4;
const BOT_STUCK_TICKS_THRESHOLD = 8;
const BOT_STUCK_PIVOT_MS = 1000;  // committed wall-follow window — long enough to run the length of a wall to its opening (was 600, too short to clear long walls)
// After a stuck event, remember the pinned spot for this long and bias
// movement away from it so the bot picks a different route around the wall
// instead of grinding into the same corner once the perpendicular pivot
// ends. Radius caps the influence so distant memories don't warp kiting.
const BOT_STUCK_MEMORY_MS = 3500;
const BOT_STUCK_MEMORY_RADIUS = 12;
const BOT_STUCK_MEMORY_WEIGHT = 0.7;  // below the ~0.85 pursuit pull, so it nudges the path angle without ever reversing pursuit (was 1.4 — strong enough to shove the bot away from the player and stall its search)
const BOT_LOS_EYE_HEIGHT = 1.6;
const BOT_JUMP_HEIGHT_DIFF = 2.5;
// LoS-aware 2v2 targeting: an enemy with no line of sight (sealed behind
// glass/walls) reads this many units FARTHER than it really is, so a visible
// enemy wins the lock unless the blocked one is drastically closer. The
// margin keeps the current lock unless a rival clearly beats it (no flicker).
const BOT_TARGET_BLOCKED_PENALTY = 50;
const BOT_TARGET_SWITCH_MARGIN = 6;

// Nav grids are built once per arena object (the ARENAS entries are module
// singletons, so this is once per map per process) and shared by all bots
// and lobbies on that map.
const navGridCache = new WeakMap();
function navGridFor(arena) {
  let grid = navGridCache.get(arena);
  if (!grid) {
    grid = buildNavGrid(arena.obstacles, arena.surfaces);
    navGridCache.set(arena, grid);
  }
  return grid;
}

// --- Elevation-kiting tunables ---
// A ledge whose lip rises more than the auto-step height (1.6) above the
// bot's floor can't be walked onto — it needs a jump. The upper bound is
// what a jump arc can actually clear (apex ≈ jumpVelocity² / 2·|gravity|,
// ≈ 5.6 with the default 30 jump velocity), kept conservative for margin.
const BOT_CLIMB_MIN_RISE = 1.7;
const BOT_CLIMB_MAX_RISE = 4.8;
// How far out the bot scans for a ledge to perch on, and how close it has to
// get to that ledge (or to a drop edge) before it commits the jump.
const BOT_PERCH_SEEK_RADIUS = 24;
const BOT_LEDGE_JUMP_REACH = 4.5;
// A floor more than this above base ground means "the bot is on high ground".
const BOT_HIGH_GROUND_MIN_Y = 1.7;
// How far past a surface edge to sample when testing whether stepping off it
// actually drops to lower ground (vs. running straight into a wall).
const BOT_DESCENT_PROBE = 3;
// Weight of the ledge-seek steering when blended into the kiting vector.
const BOT_ELEV_STEER_WEIGHT = 2.4;
// How long after an elevation jump the bot keeps driving toward the ledge so
// the arc lands where it was aimed instead of drifting off on the kiting
// vector. Covers the longest arc (a drop off high ground, ~0.85 s airborne).
const BOT_AIR_STEER_MS = 900;

// Repulsion vector from blocking obstacles within `radius`. Skips obstacles
// the bot is over or under (same skip math as resolveUnitObstacleCollisions).
// JUMPABLE `noProjectile` fences (height <= BOT_CLIMB_MAX_RISE — station /
// flashpoint 4-high platform edges) are skipped so the dedicated jump handler
// can walk the bot up to them. UNJUMPABLE ones (square's 14-high fountain
// colonnade, streets' tall under-bridge blockers) DO repel: they block
// movement like any wall but were invisible to this steering, so straight-
// line behaviors (Defense escapes, kiting, dodge follow-ups) pinned bots
// against them while enemies shot straight through (fixed 2026-08-05).
function computeBotAvoidance(px, py, pz, obstacles, radius) {
  let rx = 0, rz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    // (py > o.maxY: a bot already ABOVE the fence top — e.g. crossing the
    // streets bridge deck over its 6-high under-deck end walls — passes over
    // it freely and must not be shoved sideways.)
    if (o.noProjectile && ((o.maxY - o.minY) <= BOT_CLIMB_MAX_RISE || py > o.maxY)) continue;
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

// Soft repulsion away from a spot the bot got recently pinned at. Same
// quadratic falloff as the obstacle avoidance so it blends naturally with
// the existing kiting vector, and zero outside `radius` so old memories
// don't pull the bot toward weird headings on the far side of the map.
function computeStuckRepulsion(px, pz, memX, memZ, radius) {
  const dx = px - memX;
  const dz = pz - memZ;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return { rx: 0, rz: 0 };
  const d = Math.sqrt(d2);
  if (d < 0.001) return { rx: 0, rz: 0 };
  const t = 1 - d / radius;
  const strength = t * t;
  return { rx: (dx / d) * strength, rz: (dz / d) * strength };
}

// Line-of-sight check using the same swept-AABB math projectiles use, so the
// bot only "sees" through gaps a bullet would actually pass through.
function botHasLineOfSight(p0, p1, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  return true;
}

// Burst size for continuous-fire weapons (spreadCount === 1). Units with a
// botFireCap fire EXACTLY that many per trigger pull (bounded by remaining
// ammo — an empty mag ends the burst early into the reload); units without
// one keep the legacy rule: about half the mag, clamped so tiny or huge
// mags still feel right (2026-08-01: all listed autos carry explicit caps;
// the formula now only serves Fubuki/Aris and future unlisted guns).
function botBurstSize(unit) {
  if (unit.botFireCap) return unit.botFireCap;
  if (!unit.magCapacity || unit.magCapacity === Infinity) return 6;
  return Math.max(3, Math.min(20, Math.floor(unit.magCapacity / 2)));
}

// Scan for the nearest walkable surface whose lip sits a jump-height above
// the bot's floor — a ledge it can hop onto for a high-ground kiting
// advantage. Skips ledges too tall to clear with a jump (those need a ramp)
// and ones level enough to just walk onto. Returns a unit vector toward the
// nearest reachable point on that ledge plus the horizontal distance to it,
// or null if nothing suitable is in range.
function findHighGroundPerch(px, pz, myFloorY, surfaces, obstacles, searchRadius) {
  let best = null;
  let bestDist = searchRadius;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.maxTop - myFloorY < BOT_CLIMB_MIN_RISE) continue;
    const nx = Math.max(s.minX, Math.min(px, s.maxX));
    const nz = Math.max(s.minZ, Math.min(pz, s.maxZ));
    const rise = s.heightAt(nx, nz) - myFloorY;
    if (rise < BOT_CLIMB_MIN_RISE || rise > BOT_CLIMB_MAX_RISE) continue;
    // A wall standing ON the ledge lip (e.g. Airport's rim glass fences) means
    // a unit couldn't stand at this point — treat it like any wall and don't
    // steer/jump toward it. Same y-window semantics as unit collision; Station's
    // edge walls (maxY == platform top, topBuffer 0) pass unchanged. Mirrors
    // offline main.js.
    const lipY = myFloorY + rise + 2.45;
    let lipBlocked = false;
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      const tb = o.topBuffer ?? 4;
      if (lipY < o.minY - 2 || lipY > o.maxY + tb) continue;
      const ox = Math.max(o.minX, Math.min(nx, o.maxX));
      const oz = Math.max(o.minZ, Math.min(nz, o.maxZ));
      const bdx = nx - ox;
      const bdz = nz - oz;
      if (bdx * bdx + bdz * bdz < 1.15 * 1.15) { lipBlocked = true; break; }
    }
    if (lipBlocked) continue;
    const ddx = nx - px;
    const ddz = nz - pz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d >= bestDist) continue;
    bestDist = d;
    const inv = d > 1e-3 ? 1 / d : 0;
    best = { toX: ddx * inv, toZ: ddz * inv, dist: d };
  }
  return best;
}

// The bot is standing on a raised surface — find the edge it should run or
// jump off to drop back to lower ground. Prefers the edge most aligned with
// `away` (a direction, usually away from the opponent) and rejects edges
// that just lead into a wall or don't actually descend. Returns a unit
// vector toward that edge plus the distance to it, or null if the bot isn't
// on a droppable surface.
function findDescentDirection(px, pz, myFloorY, surfaces, obstacles, awayX, awayZ) {
  let host = null;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (px < s.minX || px > s.maxX || pz < s.minZ || pz > s.maxZ) continue;
    if (Math.abs(s.heightAt(px, pz) - myFloorY) > 1) continue;
    host = s;
    break;
  }
  if (!host) return null;
  const lowerY = myFloorY - BOT_CLIMB_MIN_RISE;
  const probeY = myFloorY + GROUND_BASE_Y;
  const edges = [
    { x: -1, z: 0, edgeDist: px - host.minX, probeX: host.minX - BOT_DESCENT_PROBE, probeZ: pz },
    { x: 1, z: 0, edgeDist: host.maxX - px, probeX: host.maxX + BOT_DESCENT_PROBE, probeZ: pz },
    { x: 0, z: -1, edgeDist: pz - host.minZ, probeX: px, probeZ: host.minZ - BOT_DESCENT_PROBE },
    { x: 0, z: 1, edgeDist: host.maxZ - pz, probeX: px, probeZ: host.maxZ + BOT_DESCENT_PROBE }
  ];
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (groundHeightAt(e.probeX, e.probeZ, surfaces, myFloorY + 50) > lowerY) continue;
    if (unitOverlapsObstacle(e.probeX, probeY, e.probeZ, obstacles)) continue;
    const score = (e.x * awayX + e.z * awayZ) - e.edgeDist * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = { toX: e.x, toZ: e.z, edgeDist: Math.max(0, e.edgeDist) };
    }
  }
  return best;
}

// Drives the bot's velocity directly (legacy-style — sets vel and fires
// through attemptFire). Mirrors updateEnemy.
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
  let bestId = enemies[0].id;
  let bestScore = Infinity;
  let currentScore = null;
  for (const e of enemies) {
    const d = Math.hypot(e.pos.x - fighter.pos.x, e.pos.z - fighter.pos.z);
    const seen = botHasLineOfSight(
      { x: fighter.pos.x, y: fighter.pos.y + BOT_LOS_EYE_HEIGHT, z: fighter.pos.z },
      { x: e.pos.x, y: e.pos.y + BOT_LOS_EYE_HEIGHT, z: e.pos.z },
      obstacles
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

// Bot jump funding: the shared tryStartJump gates at the raw jump cost
// (human mechanics — untouched); bots additionally respect the strategic
// reserve so a hop never leaves them without an emergency dodge. This also
// closes an old offline/online gap — offline botStartJump always carried a
// +BOT_SPRINT_MIN_BOOST margin that the online path lacked.
function botTryJump(me, now) {
  const funded = Math.max(BOT_BOOST_RESERVE, (me.unit?.jumpBoostCost ?? 48) + BOT_SPRINT_MIN_BOOST);
  if (me.boost < funded) return false;
  return tryStartJump(me, now);
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
  const opp = me.targetId ? matchState.fighters[me.targetId] : null;
  if (!opp || opp.hp <= 0) return;

  // Sniper-charge lock: stand still until the charge resolves.
  if (me.sniperChargeTargetId) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }
  // Locked while channeling a charged sweep (beam tracks target in tickChargedBeams).
  if (me.chargedBeamUntil > now) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }

  const arena = getArena(matchState.mapKey);
  const obstacles = arena.obstacles;
  const surfaces = arena.surfaces;

  const dx = opp.pos.x - me.pos.x;
  const dz = opp.pos.z - me.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dist > 1e-6 ? dx / dist : 1;
  const dirZ = dist > 1e-6 ? dz / dist : 0;
  const sideX = -dirZ;
  const sideZ = dirX;

  // --- Anti-sniper glint response (mirrors updateEnemy in main.js): dodge a
  // fixed reaction delay after a glint AIMED AT ME appears — from ANY enemy,
  // locked or not (humans see off-lock glints on the edge indicator too; no
  // LoS check, matching the locked case). The earliest-started active charge
  // wins; one step per charge, one schedule at a time — a charge that
  // overlaps a pending/spent dodge gets its own dodge only after the first
  // charge resolves. The schedule survives the glint vanishing so a
  // late/full-charge shot is still covered. `sniperCharging` (locked-target
  // charge) keeps driving the regular Defense durations below unchanged.
  const sniperCharging = opp.sniperChargeTargetId === me.id;
  let glintThreat = null;
  for (const f of Object.values(matchState.fighters)) {
    if (!f || f === me || f.hp <= 0) continue;
    if (f.sniperChargeTargetId !== me.id) continue;
    if (!glintThreat || f.sniperChargeStartAt < glintThreat.sniperChargeStartAt) glintThreat = f;
  }
  if (glintThreat) {
    const glintKey = `${glintThreat.id}:${glintThreat.sniperChargeStartAt}`;
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
  // (botPrevHitStun is only advanced by the threat block below, so the rising
  // edge is still visible here.)
  if (me.hitStunUntil > (me.botPrevHitStun ?? 0)) me.botGlintStepAt = null;

  // The dodge comes due: one i-frame step, then a 520 ms sprint in the same
  // direction (the guess/schedule is spent either way). SURVIVAL EXEMPTION
  // (like Defense): gates at the raw step cost only — tryStartStep enforces
  // STEP_BOOST_COST underneath, human-identical — so even a suppressed bot
  // may spend its last savings to survive a sniper shot.
  if (me.botGlintStepAt != null && now >= me.botGlintStepAt) {
    me.botGlintStepAt = null;
    if (now > me.stepUntil) {
      // Direction: perpendicular to the ATTACKER's line of fire. A NON-locked
      // attacker gets a strict perpendicular (overriding any active Defense
      // direction for this dodge+follow-up window — the Defense system itself
      // stays keyed to the locked target and re-arms afterwards if its
      // trigger is still live). The locked attacker keeps today's behavior:
      // continue a committed Defense escape line if one is active, else a
      // random lateral vs the locked target (== perpendicular to it).
      let sdx, sdz;
      const glintAtk = me.botGlintAttackerId ? matchState.fighters[me.botGlintAttackerId] : null;
      if (glintAtk && glintAtk !== opp && glintAtk.hp > 0) {
        const adx = me.pos.x - glintAtk.pos.x;
        const adz = me.pos.z - glintAtk.pos.z;
        const ad = Math.sqrt(adx * adx + adz * adz) || 1;
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = (-adz / ad) * lat;
        sdz = (adx / ad) * lat;
      } else if (me.botState === 'defense' && me.botDefenseDirX != null) {
        sdx = me.botDefenseDirX; sdz = me.botDefenseDirZ;
      } else {
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = sideX * lat; sdz = sideZ * lat;
      }
      if (tryStartStep(matchState, me, sdx, sdz, now, obstacles)) {
        // "Dodge + sprint": after the i-frame step ends, keep sprinting the
        // same way for 520 ms via a brief Defense commit (REPLACES any prior
        // Defense countdown by design — live triggers re-arm it afterwards).
        me.botState = 'defense';
        me.botStateEnteredAt = now;
        me.botDefenseDirX = sdx; me.botDefenseDirZ = sdz;
        me.botDefenseDirAt = now;
        me.botDefenseUntil = me.stepUntil + 520;
        me.botDefenseInCover = false;
        me.botDefenseCoverAt = 0;
        me.botDefensePeekDone = false;
        me.botDefenseStuckTicks = 0;
        me.botDefenseFlips = 0;
        me.botDefenseStuckMode = false;
      }
    }
  }

  // Step lifecycle. Bots skip applyInput (where players' steps are ticked), so
  // the bot's own step must be advanced here: while mid-step the lerp owns
  // position/velocity/action and the rest of the AI sits out the tick; the
  // first tick after it ends pays out the queued momentum.
  if (now <= me.stepUntil) {
    tickStep(me, now, obstacles);
    return;
  }
  if (me.stepUntil > 0) tickStep(me, now, obstacles);

  // Range band centers ON the lock range: sweet spot = lockRange exactly,
  // edges ±7. The bot hovers right at the red-lock boundary — drifting past
  // it briefly is fine, the Engage pull immediately corrects back. One
  // universal rule for every weapon: the shotgun's lockRange is tuned to 27
  // (pellet-cluster distance), which lands its band at 20–34 — the same
  // numbers its old dedicated special case hard-coded.
  const lockRange = me.unit?.lockRange ?? 50;
  const upperRange = lockRange + 7;
  const optimalRange = Math.max(10, lockRange);
  const lowerRange = Math.max(6, lockRange - 7);
  // === Behavior state machine: Defense > Maze > Engage > Pursue.
  // Each state has explicit time-bound exits — no latching. Replaces the
  // tangle of evadeActive / coverSeeking / escaping / inBurst / direSearch
  // flags with one botState whose transitions are recomputed every tick.

  // LoS + threats
  const playerHasLoS = botHasLineOfSight(
    { x: me.pos.x, y: me.pos.y + BOT_LOS_EYE_HEIGHT, z: me.pos.z },
    { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
    obstacles
  );
  // Would the player still be visible from (px, pz)? LoS-gates the range
  // discipline below: never retreat or drift outward past the edge of sight.
  const losFromPoint = (px, pz) => botHasLineOfSight(
    { x: px, y: me.pos.y + BOT_LOS_EYE_HEIGHT, z: pz },
    { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
    obstacles
  );
  // Are the next `len` units straight toward the player WALKABLE? Uses the
  // real movement rules (walkSegmentBlocked, topBuffer semantics) — the old
  // chest-height ray sailed clean over 2.4-high belts that physically stop
  // a unit, so the triggers/exits kept releasing the bot into low walls.
  const walkTowardClear = (len) => !walkSegmentBlocked(
    me.pos.x, me.pos.z,
    me.pos.x + dirX * len, me.pos.z + dirZ * len,
    me.pos.y, obstacles
  );
  if (me.hitStunUntil > (me.botPrevHitStun ?? 0)) me.botHitEvadeUntil = now + BOT_HIT_EVADE_MS;
  me.botPrevHitStun = me.hitStunUntil;
  // Defense (cover-sprint) triggers on a FRESH HIT only. The SNIPER GLINT no
  // longer triggers Defense — the bot's sole response to a glint is the
  // committed dodge scheduled above, so it ALWAYS dodges instead of sometimes
  // sprinting to cover. We also deliberately do NOT trigger on "player squeezed
  // the trigger". "Sprint when getting hit" is provided by hitEvading below.
  const hitEvading = now < (me.botHitEvadeUntil ?? 0);
  const underFire = hitEvading;
  const inBandDist = dist >= lowerRange && dist <= upperRange;

  // LoS clock (Reposition's 3 s timeout) + position-progress clock (Maze's 2 s
  // trigger). Progress is measured as real net displacement over a rolling
  // 500 ms window, not per-tick velocity, so the stun crawl can't false-trigger
  // Maze the way the old velocity-based stuck-detector did.
  if (playerHasLoS || me.botLastLoSAt == null) me.botLastLoSAt = now;
  const noLoSTime = now - me.botLastLoSAt;
  if (me.botProgressAnchorAt == null) {
    me.botProgressAnchorX = me.pos.x;
    me.botProgressAnchorZ = me.pos.z;
    me.botProgressAnchorAt = now;
    me.botLastProgressAt = now;
  }
  if (now - me.botProgressAnchorAt > 500) {
    const ddx = me.pos.x - me.botProgressAnchorX;
    const ddz = me.pos.z - me.botProgressAnchorZ;
    // Hit-stun overlapped this window → excused. Being slowed to a crawl by
    // landing bullets is suppression, not "stuck": sustained fire otherwise
    // starves this clock and drops the bot into spurious mid-fight Maze
    // episodes (the angled-backward-sprint sightings on Plain Field).
    // Under-fire wedges are Defense's job, on its own 2-tick trigger.
    if (Math.hypot(ddx, ddz) > 3 || me.hitStunUntil > me.botProgressAnchorAt) {
      me.botLastProgressAt = now;
    }
    me.botProgressAnchorX = me.pos.x;
    me.botProgressAnchorZ = me.pos.z;
    me.botProgressAnchorAt = now;
  }
  const noProgressTime = now - (me.botLastProgressAt ?? now);

  const avoid = computeBotAvoidance(me.pos.x, me.pos.y, me.pos.z, obstacles, BOT_OBSTACLE_AVOID_RADIUS);
  const avoidMag = Math.hypot(avoid.rx, avoid.rz);
  const obstacleNear = avoidMag > 0.3;

  const myFloorY = groundHeightAt(me.pos.x, me.pos.z, surfaces, me.pos.y - GROUND_BASE_Y);
  const oppFloorY = groundHeightAt(opp.pos.x, opp.pos.z, surfaces, opp.pos.y - GROUND_BASE_Y);
  const onHighGround = myFloorY > BOT_HIGH_GROUND_MIN_Y;

  // --- Stuck cut-in detection over a rolling 1.5 s window, two flavors:
  //   WEDGED   — barely any net movement AND barely any path traveled.
  //   SPINNING — plenty of path traveled but almost no net displacement
  //              (ping-ponging, orbit jams, wall grinding).
  // Either funnels into Maze (committed go-around) below — the old remedy
  // (a blind Defense strafe) is gone. Skips airborne and stun frames; a
  // window inflated by a charge-lock freeze (the AI early-returns while
  // charging, so the clock runs without samples) is discarded unevaluated.
  let stuckTriggered = false;
  let stuckFrozen = false;
  me.botPathLen = (me.botPathLen ?? 0)
    + Math.hypot(me.pos.x - (me.botPrevX ?? me.pos.x), me.pos.z - (me.botPrevZ ?? me.pos.z));
  me.botPrevX = me.pos.x;
  me.botPrevZ = me.pos.z;
  if (me.botStuckCheckAt == null) {
    me.botStuckCheckX = me.pos.x;
    me.botStuckCheckZ = me.pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  } else if (now - me.botStuckCheckAt >= 1000) {   // 1.5 s -> 1 s (2026-08-05 trim)
    const windowStale = now - me.botStuckCheckAt > 1700;
    const net = Math.hypot(me.pos.x - me.botStuckCheckX, me.pos.z - me.botStuckCheckZ);
    // Thresholds scaled 2/3 with the window (1.5 s -> 1 s) so the per-second
    // movement rates that count as wedged/spinning are unchanged.
    const wedged = net < 1.7 && me.botPathLen < 4;
    const spinning = me.botPathLen > 12 && net < 4;
    if (!windowStale
        && (wedged || spinning)
        && !me.airborne
        && now >= me.hitStunUntil
        && (me.botState ?? 'pursue') !== 'defense') {
      stuckTriggered = true;
      // TRUE STATUE: not merely slow — collision-pinned to a standstill
      // (the Airport ramp-top notch cancels velocity to exactly zero).
      // Only this flavor is allowed the escape back-out in the maze
      // re-commit; anything that still moves resolves via normal re-plans.
      stuckFrozen = net < 0.8;
    }
    me.botStuckCheckX = me.pos.x;
    me.botStuckCheckZ = me.pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  }

  // Commit (or re-commit) Maze's go-around heading: tangent to the nearest
  // obstacle, biased toward the player so the detour closes distance.
  // `escaping` = re-commit fired by the stuck alarm: when the probes can't
  // pick a side, REVERSE the current heading instead of leaning toward the
  // player — the player-lean is what walks the bot straight back into the
  // corner it just jammed in.
  const commitMazeDirection = (escaping = false, keepHand = false) => {
    let mxe = avoid.rx, mze = avoid.rz;
    const ml = Math.hypot(mxe, mze);
    me.botMazeHadWall = ml >= 0.1;
    if (ml < 0.1) {
      // OPEN GROUND: nothing to go around yet — head straight at the player.
      // (The old commit here was side*orbitSign = PERPENDICULAR to the player,
      // which combined with the toward-pull traced a stable ORBIT around the
      // target — the endless circling below the Airport plateau.) The moment
      // a wall interposes, the context check in the maze movement block
      // re-commits into wall-follow.
      mxe = dirX;
      mze = dirZ;
      if (escaping) { mxe = -mxe; mze = -mze; }
      me.botMazeHand = null;
    } else {
      const ux = mxe / ml, uz = mze / ml;
      let tx = -uz, tz = ux;
      // MULTI-DISTANCE probes: from 20/40/60 units along each tangent, how
      // soon would the player become visible? Picking the side that gains
      // sight SOONEST approximates the shorter way around a finite wall —
      // the old single-20 probe went blind past one cover-length, leaving
      // the tie to a fixed-rotation default (the "always turns right" bias).
      const probeDist = (px2, pz2) => {
        for (const pd of [20, 40, 60]) {
          if (losFromPoint(me.pos.x + px2 * pd, me.pos.z + pz2 * pd)) return pd;
        }
        return Infinity;
      };
      const dPlus = probeDist(tx, tz);
      const dMinus = probeDist(-tx, -tz);
      if (dPlus !== dMinus) {
        if (dMinus < dPlus) { tx = -tx; tz = -tz; }
      } else if (escaping) {
        // Probes tied while escaping a jam: reverse the committed heading.
        const proj = tx * (me.botMazeDirX ?? tx) + tz * (me.botMazeDirZ ?? tz);
        if (proj > 0) { tx = -tx; tz = -tz; }
      } else if (keepHand && me.botMazeHand != null) {
        // KEEP THE SAME WAY AROUND: preserve which hand the wall is on. Corner
        // re-commits keep circling the object, and 7 s refreshes along a long
        // wall hold their direction — instead of the toward-player tiebreak
        // re-aiming every refresh and pendulum-ing the bot under the player
        // (it never committed the full run to the Airport ramp gaps).
        if ((tz * ux - tx * uz) * me.botMazeHand < 0) { tx = -tx; tz = -tz; }
      } else if (tx * dirX + tz * dirZ < 0) {
        tx = -tx; tz = -tz;
      }
      // Record the chosen going-around hand (side of the wall vs travel).
      me.botMazeHand = (tz * ux - tx * uz) >= 0 ? 1 : -1;
      // WALL-FOLLOW: tangent-dominant with a slight standoff. The old blend
      // (away + 1.3*tangent = 61% away after normalizing) detached the bot
      // from the wall diagonally within a second, stranding it in open
      // ground where the old open-ground commit turned the march into an
      // orbit. Hugging the wall is the whole point of Maze.
      mxe = tx + ux * 0.25;
      mze = tz + uz * 0.25;
    }
    const ml2 = Math.hypot(mxe, mze) || 1;
    me.botMazeDirX = mxe / ml2;
    me.botMazeDirZ = mze / ml2;
    // Record whether LoS was blocked at (re)commit. The LoS-restored exit only
    // counts when it was — otherwise (stuck against a side pillar with LoS
    // already clear) Maze would exit on the first tick and never get to act.
    me.botMazeLosBlockedAtEntry = !playerHasLoS;
  };

  // OPENING SCAN — Maze's loop breaker. Wall-following a CLOSED loop (a
  // room's inside perimeter, a free-standing block) laps forever: corners
  // hand off cleanly, the stuck alarm sees real movement, and a blind-entry
  // Maze has no time cap. So every 7 s refresh scans rings of probe points
  // (8 directions × 25/50/75 units) for one that can SEE the player — a
  // doorway or opening — and commits straight at it. Ties on the same ring
  // break toward the player (no fixed-rotation bias). False if nothing sees.
  const mazeScanForOpening = () => {
    for (const sd of [25, 50, 75]) {
      let bx = 0, bz = 0, bestDot = -Infinity;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const sx2 = Math.cos(a), sz2 = Math.sin(a);
        const px3 = me.pos.x + sx2 * sd, pz3 = me.pos.z + sz2 * sd;
        // REACHABILITY at WALK height (+1.0, ALL obstacles): eye-height
        // testing had two holes — it skipped jump-only edges, and it passed
        // clean OVER the 3.7 plateau body, calling points on the far side
        // "reachable" through a wall the bot can't walk through.
        const r0 = { x: me.pos.x, y: me.pos.y + 1.0, z: me.pos.z };
        const r1 = { x: px3, y: me.pos.y + 1.0, z: pz3 };
        let reachable = true;
        for (const o of obstacles) {
          if (segmentHitsObstacle(r0, r1, o)) { reachable = false; break; }
        }
        if (!reachable) continue;
        if (!losFromPoint(px3, pz3)) continue;
        const dt = sx2 * dirX + sz2 * dirZ;
        if (dt > bestDot) { bestDot = dt; bx = sx2; bz = sz2; }
      }
      if (bestDot > -Infinity) {
        me.botMazeDirX = bx;
        me.botMazeDirZ = bz;
        // hadWall=true suppresses the open-ground context re-commit (the
        // wall being left behind would instantly re-grab the heading);
        // real wall contact en route is handled by the corner turn.
        me.botMazeHadWall = true;
        me.botMazeHand = null;
        me.botMazeLosBlockedAtEntry = !playerHasLoS;
        return true;
      }
    }
    return false;
  };

  // ELEVATION ROUTE — Maze's ramp-seeker. When the opening scan sees nothing
  // AND the target stands on a meaningfully different floor, same-floor
  // wall-following can never help (Airport plateau: the 12-high rim glass
  // blocks every between-floor sight line, and fence lips block the perch
  // hop — ramps are the only route). Commit toward a point a third of the
  // way INTO the nearest connecting ramp from MY end (foot when climbing,
  // crest when descending); riding it to the other level is what finally
  // opens sight, and the normal flow takes over from there.
  const mazeSeekElevationRoute = (allowClimb = false) => {
    const floorGap = oppFloorY - myFloorY;
    // CLIMB MODE: same floor, but the flat route is dead (allowClimb is
    // passed only then) — e.g. both on Airport ground with the full-width
    // plateau between. Take any UP-ramp from my level: crossing over the
    // top is the route, and once up there the normal cross-floor logic
    // descends the far side.
    const climbMode = Math.abs(floorGap) < 2.5;
    if (climbMode && !allowClimb) return false;
    const levelLow = Math.min(myFloorY, oppFloorY);
    const levelHigh = Math.max(myFloorY, oppFloorY);
    let bx = 0, bz = 0, bestD = Infinity;
    for (const s of surfaces) {
      if (s.type !== 'ramp') continue;
      const lo = Math.min(s.lowY, s.highY);
      const hi = Math.max(s.lowY, s.highY);
      if (climbMode) {
        // An up-ramp starting at my level.
        if (Math.abs(lo - myFloorY) > 2 || hi < myFloorY + 2.5) continue;
      } else if (Math.abs(lo - levelLow) > 2 || Math.abs(hi - levelHigh) > 2) {
        // Cross-floor: must actually connect the two floors.
        continue;
      }
      const wantY = (climbMode || floorGap > 0) ? lo : hi;   // the ramp end on MY level
      let ex, ez;
      if (s.axis === 'x') {
        const e0 = s.lowY === wantY ? s.minX : s.maxX;
        const e1 = s.lowY === wantY ? s.maxX : s.minX;
        ex = e0 + (e1 - e0) * 0.35;
        ez = (s.minZ + s.maxZ) / 2;
      } else {
        const e0 = s.lowY === wantY ? s.minZ : s.maxZ;
        const e1 = s.lowY === wantY ? s.maxZ : s.minZ;
        ez = e0 + (e1 - e0) * 0.35;
        ex = (s.minX + s.maxX) / 2;
      }
      const d = Math.hypot(ex - me.pos.x, ez - me.pos.z);
      if (d < bestD) { bestD = d; bx = ex; bz = ez; }
    }
    if (bestD === Infinity) return false;
    const dl = bestD || 1;
    me.botMazeDirX = (bx - me.pos.x) / dl;
    me.botMazeDirZ = (bz - me.pos.z) / dl;
    me.botMazeHadWall = true;   // corner turn handles wall contact en route
    me.botMazeHand = null;
    me.botMazeLosBlockedAtEntry = !playerHasLoS;
    return true;
  };

  // NAV PLAN — the universal pathfinder. Ask the grid for a real walk route
  // to the target; Maze follows it waypoint by waypoint. Returns false when
  // no walk route exists (target on a jump-only platform, degenerate snap) —
  // the heuristic stack (scan / ramp-seek / wall-follow) remains the
  // fallback. Paths live on matchState._navPaths, NOT on the fighter: the
  // fighter object is serialized into every snapshot.
  // FIRING-POSITION TRUNCATION — the raw path ends at the player's FEET.
  // Walk it (6-unit samples) and cut it at the first spot that already SEES
  // the player from inside the band's upper edge: the bot travels to a
  // FIRING POSITION, never to the player. Without this, a blind approach
  // rode the path until sight happened to open — often point-blank on
  // cover-heavy maps — before range discipline could act (the "runs at me
  // at match start" report). Nothing qualifies → keep the full path (some
  // fights genuinely require getting close before any sight exists).
  const truncateAtFiringPoint = (path) => {
    let prev = { x: me.pos.x, z: me.pos.z };
    for (let i = 0; i < path.length; i += 1) {
      const seg = path[i];
      const segLen = Math.hypot(seg.x - prev.x, seg.z - prev.z) || 1;
      const steps = Math.max(1, Math.ceil(segLen / 6));
      for (let s = 1; s <= steps; s += 1) {
        const px = prev.x + ((seg.x - prev.x) * s) / steps;
        const pz = prev.z + ((seg.z - prev.z) * s) / steps;
        if (Math.hypot(opp.pos.x - px, opp.pos.z - pz) > upperRange) continue;
        const fy = groundHeightAt(px, pz, surfaces, 1000);
        if (botHasLineOfSight(
          { x: px, y: fy + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: pz },
          { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
          obstacles
        )) {
          const cut = path.slice(0, i);
          cut.push({ x: px, z: pz });
          return cut;
        }
      }
      prev = seg;
    }
    return path;
  };
  const navPlan = () => {
    const grid = navGridFor(arena);
    // FIRST CHOICE: walk to a FIRING POSITION — the nearest reachable spot
    // that already sees the target from inside the band. This is what makes
    // a sniper cross the map to a sniping lane instead of to the enemy.
    // FALLBACK: path to the target itself, cut at the first sighted sample
    // (some pockets have no in-band sight anywhere — then getting close is
    // genuinely the only option, and the exit gates take over from there).
    let path = findFiringPath(
      grid, me.pos.x, me.pos.z, myFloorY,
      opp.pos.x, opp.pos.z, opp.pos.y + BOT_LOS_EYE_HEIGHT,
      lowerRange, upperRange, obstacles, oppFloorY
    );
    if (!path || path.length < 2) {
      path = findPathOnGrid(
        grid, me.pos.x, me.pos.z, opp.pos.x, opp.pos.z, myFloorY, oppFloorY, obstacles
      );
      if (path && path.length > 1) path = truncateAtFiringPoint(path);
    }
    if (matchState._navPaths == null) matchState._navPaths = {};
    if (path && path.length > 1) {
      // idx 0: walk to the pinned start square first — beelining to square
      // #2 from an off-grid position can clip the corner between them.
      matchState._navPaths[botId] = {
        path, idx: 0, gx: opp.pos.x, gz: opp.pos.z, at: now
      };
      me.botMazeLosBlockedAtEntry = !playerHasLoS;
      return true;
    }
    delete matchState._navPaths[botId];
    return false;
  };

  // --- State transition by precedence ---
  const prevState = me.botState ?? 'pursue';
  let nextState = prevState;
  const inDefenseGrace = prevState === 'defense' && now < (me.botDefenseUntil ?? 0);

  // PROACTIVE ROUTE (2026-08-05): test the walk itself instead of waiting
  // for the stuck clocks to prove a wall. Out of band with the straight
  // approach blocked: sightless fires INSTANTLY (the original fast lane);
  // SIGHTED (seeing the target over a low wall / across unwalkable ground)
  // fires after a 250 ms persistence — long enough that a graze the
  // avoidance slide already handles never cuts normal play into Maze.
  const towardBlocked = !walkTowardClear(Math.min(dist, 30));
  const approachBlocked = !inBandDist && towardBlocked;
  // Sighted variant is APPROACH-only (dist beyond the band's upper edge):
  // a too-close bot retreating over a crate must stay Engage's problem.
  const sightedBlocked = dist > upperRange && towardBlocked;
  if (!sightedBlocked) me.botApproachBlockedSince = null;
  else if (me.botApproachBlockedSince == null) me.botApproachBlockedSince = now;
  const approachBlockedLong = sightedBlocked
    && now - me.botApproachBlockedSince >= 250;

  if (underFire || inDefenseGrace) {
    nextState = 'defense';
  } else if (stuckTriggered || noProgressTime > 1500 || noLoSTime > 2000
      || (!playerHasLoS && approachBlocked)
      || approachBlockedLong) {
    // Wedged, spinning, stalled (1.5 s — trimmed from 2 s, 2026-08-05),
    // sightless for 2 s, or the approach walk is BLOCKED (instant when
    // sightless, 250 ms persistence when sighted) — commit to going AROUND
    // whatever is in the way instead of beelining into it. In-band sight
    // flickers (the cover peek-dance) still get the full 2 s buffer.
    nextState = 'maze';
  } else if (prevState === 'maze') {
    // Maze latches until the job is done: entered sightless, only reacquiring
    // sight releases it. Entered WITH sight (pillar graze), a short cap
    // releases it — else nothing ever would.
    // VIABILITY GATE: sight alone doesn't hand control back to Pursue —
    // either the fight starts here (in band → Engage, legitimate even
    // through a corridor window), or the walk TOWARD the player must be
    // clear for up to 50 units on the SAME floor. The old 20-unit probe
    // passed whenever the plateau was more than 20 away, releasing Maze
    // into a beeline that ground the plateau side 30 units later.
    const losReacquired = playerHasLoS && me.botMazeLosBlockedAtEntry
      && (inBandDist
        || (walkTowardClear(Math.min(dist, 50))
          && Math.abs(oppFloorY - myFloorY) < 2.5));
    const visibleEntryDone = !me.botMazeLosBlockedAtEntry
      && (now - (me.botStateEnteredAt ?? now)) > 3000;
    if (losReacquired || visibleEntryDone) {
      nextState = inBandDist ? 'engage' : 'pursue';
    }
  } else if (inBandDist) {
    // (Reposition removed: its no-sight-in-band case is fully owned by the
    // 2 s Maze trigger above, which fires before its 3 s timer ever could.)
    nextState = 'engage';
  } else {
    nextState = 'pursue';
  }

  // Maze re-commit: a stuck signal mid-Maze, or 7 s on one heading, picks a
  // fresh tangent instead of exiting — Maze doesn't give up, it tries a
  // different way around.
  const escapeDue = me.botMazeEscapeUntil != null && now >= me.botMazeEscapeUntil;
  if (nextState === 'maze' && prevState === 'maze'
      && (stuckTriggered || escapeDue || (now - (me.botStateEnteredAt ?? now)) > 7000)) {
    if (escapeDue) me.botMazeEscapeUntil = null;
    me.botStateEnteredAt = now;
    // STATUE ESCAPE: a FROZEN bot is body-pinched in a corner pocket the
    // zero-width pin test can't see (the ramp-top notch against Airport's
    // rim glass) — the planner then re-issues the identical line every
    // 1.5 s forever. If the fresh plan below starts at the very waypoint
    // it froze against, treat it as NO ROUTE: back out along the escape
    // heading for a beat, then replan from the freed spot. Deliberately
    // statue-only (zero net movement): bots that still move never take
    // the back-out, so live routing gains no back-and-forth.
    const navPrev = matchState._navPaths ? matchState._navPaths[botId] : null;
    const frozenWp = stuckFrozen && navPrev ? navPrev.path[navPrev.idx] : null;
    // Pathfinder first: a stuck signal or 7 s refresh re-plans the route
    // from the CURRENT position. Only when no route exists does the
    // heuristic stack take over.
    let planned = navPlan();
    if (planned && frozenWp) {
      const fresh = matchState._navPaths[botId];
      // The follower's own advance rule: the waypoint it would steer to.
      let fi = fresh.idx;
      while (fi < fresh.path.length - 1
          && Math.hypot(fresh.path[fi].x - me.pos.x, fresh.path[fi].z - me.pos.z) < 3) fi += 1;
      const firstWp = fresh.path[fi];
      if (Math.abs(firstWp.x - frozenWp.x) < 0.5 && Math.abs(firstWp.z - frozenWp.z) < 0.5) {
        delete matchState._navPaths[botId];
        planned = false;
        me.botMazeEscapeUntil = now + 800;
      }
    }
    if (planned) {
      // fresh path committed
    } else if (stuckTriggered) {
      // Stuck mid-Maze → escape re-commit (reverses when probes tie).
      commitMazeDirection(true);
    } else {
      // ROUTE-CHANGE PRIORITY: the ramp goes first when the fight needs a
      // different route — the target is on another floor, OR I can SEE the
      // player but can't WALK at them (the full-width Airport plateau
      // between two ground-floor fighters: sight passes over its 3.7 body,
      // feet don't). A reachable peephole is a consolation prize — scan-
      // first let it preempt the route every 7 s, shuttling the bot between
      // the peephole and the wall. Plain blind same-floor keeps scan-first
      // (Flashpoint rooms; Station falls through — no ramps there, the
      // perch reflex climbs instead).
      const needRoute = Math.abs(oppFloorY - myFloorY) > 2.5
        || (playerHasLoS && !inBandDist && !walkTowardClear(Math.min(dist, 50)));
      let committed = needRoute && mazeSeekElevationRoute(true);
      if (!committed) committed = mazeScanForOpening();
      if (!committed) {
        // Nothing seen, no ramp applies — re-aim toward the player (hand
        // dropped; keeping it lapped closed loops forever — the Flashpoint
        // spawn-room trap). The hand still rules corner turns WITHIN a leg.
        commitMazeDirection(false, false);
      }
    }
  }

  // --- State entry: commit per-state directions and timers ---
  if (nextState !== prevState) {
    me.botState = nextState;
    me.botStateEnteredAt = now;

    if (nextState === 'maze') {
      me.botMazeWallTicks = 0;
      me.botMazeEscapeUntil = null;
      // Pathfinder first; the heuristic commit is the no-route fallback.
      if (!navPlan()) commitMazeDirection();
    }

    if (nextState === 'engage'
        && (prevState === 'pursue' || prevState === 'maze' || prevState === 'defense' || me.botOrbitSign == null)) {
      // Orbit direction by SIGHT PROBE, not coin flip: from ~12 units along
      // each orbit tangent, which way keeps the player visible? The blind
      // coin flip walked the bot out of hard-won sight windows half the
      // time (the plateau-edge pacing). Ties fall back to random.
      const losCw = losFromPoint(me.pos.x + sideX * 12, me.pos.z + sideZ * 12);
      const losCcw = losFromPoint(me.pos.x - sideX * 12, me.pos.z - sideZ * 12);
      if (losCw !== losCcw) me.botOrbitSign = losCw ? 1 : -1;
      else me.botOrbitSign = Math.random() > 0.5 ? 1 : -1;
    }

    if (nextState === 'defense') {
      const sg = me.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd = sideX * sg;
      let dzd = sideZ * sg;
      if (obstacleNear && (dxd * (-avoid.rx) + dzd * (-avoid.rz) > 0.3)) {
        dxd = -dxd; dzd = -dzd;
      }
      me.botDefenseDirX = dxd;
      me.botDefenseDirZ = dzd;
      me.botDefenseDirAt = now;
      // Stuck-triggered Defense runs 1.5 s to give the strafe room to break
      // the wedge; hit/glint-triggered keeps the original 350/600 ms.
      me.botDefenseUntil = now + (stuckTriggered ? 1500 : (sniperCharging ? 600 : 350));
      me.botDefenseInCover = false;
      me.botDefenseCoverAt = 0;
      me.botDefensePeekDone = false;
      me.botDefenseStuckTicks = 0;
      me.botDefenseFlips = 0;
      me.botDefenseStuckMode = !!stuckTriggered;
      // Reset the stuck window — next check starts fresh after this entry.
      me.botStuckCheckX = me.pos.x;
      me.botStuckCheckZ = me.pos.z;
      me.botStuckCheckAt = now;
      me.botPathLen = 0;
    }
  }

  if (me.botState === 'defense' && underFire) {
    // Hit during stuck-Defense → snap back to regular Defense: refresh the
    // strafe direction and clear cover/peek so it behaves as if this hit
    // had triggered Defense fresh.
    if (me.botDefenseStuckMode) {
      const sg2 = me.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd2 = sideX * sg2;
      let dzd2 = sideZ * sg2;
      if (obstacleNear && (dxd2 * (-avoid.rx) + dzd2 * (-avoid.rz) > 0.3)) {
        dxd2 = -dxd2; dzd2 = -dzd2;
      }
      me.botDefenseDirX = dxd2;
      me.botDefenseDirZ = dzd2;
      me.botDefenseDirAt = now;
      me.botDefenseUntil = now + (sniperCharging ? 600 : 350);
      me.botDefenseInCover = false;
      me.botDefenseCoverAt = 0;
      me.botDefensePeekDone = false;
      me.botDefenseStuckTicks = 0;
      me.botDefenseFlips = 0;
      me.botDefenseStuckMode = false;
    }
    const minDur = sniperCharging ? 600 : 350;
    if ((me.botDefenseUntil ?? 0) < now + minDur) {
      me.botDefenseUntil = now + minDur;
    }
    // SUSTAINED-FIRE RE-ALIGN: under a continuous stream (fresh hits keep
    // Defense alive indefinitely) the once-picked perpendicular slowly
    // rotates into a stale TANGENT — a straight line that flies away from
    // the shooter forever. That was the "shorter the lock range, the harder
    // they flee" report: short-LR bots must close through the densest fire,
    // so their Defense chains never break and the tangent-flight runs long.
    // Re-perpendicularize at most every 400 ms so the bot CIRCLES the
    // shooter instead. Single-burst Defense (< 400 ms) is untouched.
    if (now - (me.botDefenseDirAt ?? 0) > 400) {
      const sg3 = me.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd3 = sideX * sg3;
      let dzd3 = sideZ * sg3;
      if (obstacleNear && (dxd3 * (-avoid.rx) + dzd3 * (-avoid.rz) > 0.3)) {
        dxd3 = -dxd3; dzd3 = -dzd3;
      }
      // RANGE-HOLD: sideways steps have an outward chord drift that
      // compounds over an endless hit chain (the shotgun bot slowly spiraled
      // to double its band and read as "backing off"). Bias the fresh
      // perpendicular with the same range pull Engage uses, so a suppressed
      // bot circle-strafes AT its band radius — closing while weaving when
      // it's too far, instead of drifting out forever.
      const pull3 = Math.max(-0.4, Math.min(0.4, (dist - optimalRange) * 0.12));
      dxd3 += dirX * pull3;
      dzd3 += dirZ * pull3;
      const dl3 = Math.hypot(dxd3, dzd3) || 1;
      me.botDefenseDirX = dxd3 / dl3;
      me.botDefenseDirZ = dzd3 / dl3;
      me.botDefenseDirAt = now;
    }
  }

  // --- State behavior: heading + sprint intent + optional jump ---
  let mx = 0, mz = 0;
  let wantSprint = false;
  let jumpThisTick = false;
  let jumpDirX = dirX, jumpDirZ = dirZ;
  // Default to 'pursue' — botState is only ASSIGNED on a state CHANGE, so
  // it's undefined for the whole first stretch of a match; the raw read
  // matched no movement branch and the bot stood frozen until the
  // no-progress timer shoved it into maze (the 2 s statue at match start).
  const botS = me.botState ?? 'pursue';

  if (botS === 'pursue') {
    // Pursue handles BOTH sides of the band: toward the player when too far,
    // AWAY from them when too close. Without the negative branch the bot just
    // keeps closing through lowerRange and collides at zero distance.
    const tooClose = dist < lowerRange;
    // Range discipline is unconditional outside Defense (the old LoS-gated
    // hold made the bot give up its range advantage to keep a peek — a
    // crutch for the pre-pathfinder Maze). If the retreat costs sight, the
    // 2 s no-LoS trigger hands off to Maze, which now PATHS back to a
    // firing position — kite out, return, fire, repeat.
    const dirSign = tooClose ? -1 : 1;
    let tx = dirX * dirSign + avoid.rx * 0.8;
    let tz = dirZ * dirSign + avoid.rz * 0.8;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;
    // Sprint down to the strategic reserve, no further. Both hysteresis
    // bounds sit on the one knob (band collapsed by design) — the dispatch
    // floor produces the same duty-cycle behavior either way, and the
    // reserve keeps a full dodge + margin in the tank at all times.
    if (me.boost >= BOT_BOOST_RESERVE) me.botPursueSprinting = true;
    if (me.boost <= BOT_BOOST_RESERVE) me.botPursueSprinting = false;
    wantSprint = !!me.botPursueSprinting;
    // Elevation aids close the gap; skip them when we're trying to back off.
    if (!tooClose && me.grounded && !me.airborne) {
      if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF && dist < 32 && Math.random() > 0.5) {
        if (botTryJump(me, now)) jumpThisTick = true;
      } else if (onHighGround) {
        const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (botTryJump(me, now)) jumpThisTick = true;
        }
      } else {
        // Low ground: take any reachable platform — no "toward player" gate,
        // since on maps like Station the raised decks are the strong positions
        // and we'd rather be up there than on the tracks. The jump cooldown
        // rate-limits this; no strict random gate needed.
        const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botTryJump(me, now)) jumpThisTick = true;
        }
      }
    }
  } else if (botS === 'maze') {
    let nav = matchState._navPaths ? matchState._navPaths[botId] : null;
    // ARRIVED / NOTHING-TO-DO-HERE: sighted inside the sweet spot. A path
    // whose goal is meaningfully CLOSER to the player is an approach — done,
    // drop it. A pathless (heuristic) maze has nothing sane to do here
    // either — its stale committed direction charged straight through the
    // player during sighted-entry windows. Both cases: trip the sighted-
    // entry cap so the maze ENDS and Engage/Pursue own the fight. A
    // REPOSITION path (goal not closer — e.g. a sidestep to an unjammed
    // in-band cell) keeps running.
    // SAME FLOOR required: raw distance isn't arrival when there's a cliff
    // between — a player at the Station platform's edge read as "arrived"
    // from the tracks below, which dropped every climb path and ground the
    // bot into the edge wall forever.
    if (playerHasLoS && dist <= optimalRange
        && Math.abs(oppFloorY - myFloorY) < 2.5) {
      const goalWp = nav && nav.path[nav.path.length - 1];
      const goalCloser = goalWp
        && Math.hypot(opp.pos.x - goalWp.x, opp.pos.z - goalWp.z) < dist - 4;
      if (!nav || goalCloser) {
        if (nav) delete matchState._navPaths[botId];
        nav = null;
        me.botStateEnteredAt = now - 3001;
      }
    }
    // FINAL-WAYPOINT ARRIVAL: destination reached but the maze hasn't
    // exited yet (e.g. sighted-entry cap still counting). Drop the path
    // rather than stand on it — a standing bot re-arms the no-progress
    // trigger every 2 s, which keeps re-selecting maze and STARVES the
    // exit branch forever (the Plain Field never-orbits bug). The moving
    // heuristic fallback covers the remaining ticks until the exit fires.
    if (nav && nav.path.length > 0) {
      const lastWp = nav.path[nav.path.length - 1];
      if (Math.hypot(lastWp.x - me.pos.x, lastWp.z - me.pos.z) < 3) {
        delete matchState._navPaths[botId];
        nav = null;
      }
    }
    if (nav && nav.path && nav.idx < nav.path.length) {
      // PATH FOLLOW — the universal pathfinder owns Maze whenever a route
      // exists. Head for the current waypoint, advance within 3 units, and
      // refresh the route (rate-limited) when the target wanders off the
      // planned goal. Avoidance stays blended in for dynamic wiggle room.
      let wp = nav.path[nav.idx];
      while (nav.idx < nav.path.length - 1
          && Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z) < 3) {
        nav.idx += 1;
        wp = nav.path[nav.idx];
      }
      if (now - nav.at > 1000
          && Math.hypot(opp.pos.x - nav.gx, opp.pos.z - nav.gz) > 12) {
        navPlan();
        const fresh = matchState._navPaths ? matchState._navPaths[botId] : null;
        if (fresh && fresh.path[fresh.idx]) wp = fresh.path[fresh.idx];
      }
      // JUMP-LINK crossing: the upcoming waypoint sits on a ledge above the
      // bot's floor (the path bridged a walk-island, e.g. Station's
      // platforms) — vault toward it once close enough. Downward crossings
      // need nothing: the bot just walks off the ledge.
      if (wp.y != null && wp.y - myFloorY > 1.7
          && me.grounded && !me.airborne
          && Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z) < 7) {
        const jdx = wp.x - me.pos.x, jdz = wp.z - me.pos.z;
        const jln = Math.hypot(jdx, jdz) || 1;
        jumpDirX = jdx / jln;
        jumpDirZ = jdz / jln;
        if (botTryJump(me, now)) jumpThisTick = true;
      }
      let tx = wp.x - me.pos.x, tz = wp.z - me.pos.z;
      const wl = Math.hypot(tx, tz) || 1;
      tx = tx / wl + avoid.rx * 0.3;
      tz = tz / wl + avoid.rz * 0.3;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      // JUMP RESERVE: an upcoming jump-link costs 48 boost, but maze's
      // permanent sprint pins the gauge at the ~8 floor — the bot arrived
      // at the ledge eternally unable to afford the hop (the "never jumps
      // onto Station's platform" bug). Walk and bank while a jump is ahead
      // and unaffordable; sprint resumes once the jump is funded.
      let jumpAhead = false;
      for (let k = nav.idx; k < nav.path.length; k += 1) {
        if ((nav.path[k].y ?? 0) - myFloorY > 1.7) { jumpAhead = true; break; }
      }
      // Bank target: the strategic reserve already exceeds jump cost + pad
      // at current tuning; the Math.max keeps the old jump-funding guarantee
      // if the reserve is ever tuned below it.
      const jumpBank = Math.max(BOT_BOOST_RESERVE, (me.unit?.jumpBoostCost ?? 48) + 10);
      wantSprint = !(jumpAhead && me.boost < jumpBank);
    } else {
      // HEURISTIC FALLBACK (no route exists): committed tangent + a gentle
      // pull toward the player. The pull FADES OUT near walls so it can't
      // press the bot into concave corners; in the open it curls the bot
      // around wall ends. Context change: committed in the open, and a wall
      // just interposed — switch to wall-follow NOW instead of grinding.
      if (me.botMazeHadWall === false && obstacleNear) commitMazeDirection();
      // CORNER TURN: the committed wall-follow ran into a NEW wall face
      // (concave corner). Same 2-tick wall-press read Defense uses —
      // re-commit HERE (~0.03 s) preserving the going-around hand.
      const mazeIntoWall = avoidMag > 0.4
        && ((me.botMazeDirX ?? 0) * avoid.rx + (me.botMazeDirZ ?? 0) * avoid.rz) < -0.4;
      if (mazeIntoWall) {
        me.botMazeWallTicks = (me.botMazeWallTicks ?? 0) + 1;
      } else {
        me.botMazeWallTicks = 0;
      }
      if (me.botMazeWallTicks >= 2) {
        me.botMazeWallTicks = 0;
        commitMazeDirection(false, true);
      }
      const mazePull = 0.4 * Math.max(0, 1 - avoidMag);
      let tx = (me.botMazeDirX ?? sideX) + dirX * mazePull + avoid.rx * 0.3;
      let tz = (me.botMazeDirZ ?? sideZ) + dirZ * mazePull + avoid.rz * 0.3;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      wantSprint = true;
    }
    if (me.grounded && !me.airborne) {
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botTryJump(me, now)) jumpThisTick = true;
      }
    }
  } else if (botS === 'engage') {
    // Mid-orbit sight keeping: if the next ~12 units along the orbit lose
    // sight while the other way keeps it, flip once (1 s cooldown so
    // opposing probes can't jitter it). Engage patrols INSIDE the sight
    // window it was handed instead of blindly strolling out of it.
    if (playerHasLoS && now >= (me.botOrbitFlipAt ?? 0)) {
      const sgn = me.botOrbitSign ?? 1;
      if (!losFromPoint(me.pos.x + sideX * sgn * 12, me.pos.z + sideZ * sgn * 12)
          && losFromPoint(me.pos.x - sideX * sgn * 12, me.pos.z - sideZ * sgn * 12)) {
        me.botOrbitSign = -sgn;
        me.botOrbitFlipAt = now + 1000;
      }
    }
    const sign = me.botOrbitSign ?? 1;
    // Full-strength range correction — the sweet spot always wins outside
    // Defense (the LoS gate that froze the outward drift is gone; Maze
    // paths back to a firing position if spacing ever costs sight).
    const pull = Math.max(-0.5, Math.min(0.5, (dist - optimalRange) * 0.12));
    let tx = sideX * sign + dirX * pull + avoid.rx * 0.6;
    let tz = sideZ * sign + dirZ * pull + avoid.rz * 0.6;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;

    // On low ground? Hop onto any reachable platform — high ground is the
    // better engagement / vantage spot on Station-like maps. Doesn't override
    // the orbit (just adds a jump when the chance is there); the jump cooldown
    // limits how often this fires.
    if (me.grounded && !me.airborne && !onHighGround) {
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.3) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botTryJump(me, now)) jumpThisTick = true;
      }
    }

    if (botS === 'engage') {
      if (obstacleNear && !playerHasLoS && now < me.nextFireAt) {
        mx *= 0.15; mz *= 0.15;
      }
      wantSprint = false;
    } else {
      wantSprint = true;
    }
  } else if (botS === 'defense') {
    mx = me.botDefenseDirX ?? sideX;
    mz = me.botDefenseDirZ ?? sideZ;
    wantSprint = true;

    if (!me.botDefenseInCover && obstacleNear && !playerHasLoS) {
      me.botDefenseInCover = true;
      me.botDefenseCoverAt = now;
      me.botDefensePeekDone = false;
    }

    if (me.botDefenseInCover) {
      const sinceCover = now - (me.botDefenseCoverAt ?? now);
      if (sinceCover < 300) {
        mx *= 0.1; mz *= 0.1;
        wantSprint = false;
      } else if (!me.botDefensePeekDone) {
        mx = dirX; mz = dirZ;
        wantSprint = false;
        if ((now >= me.nextFireAt && playerHasLoS) || sinceCover > 1000) {
          me.botDefensePeekDone = true;
        }
      } else {
        me.botDefenseUntil = now;
        me.botDefenseInCover = false;
      }
    } else {
      const intoWall = (mx * avoid.rx + mz * avoid.rz) < -0.4;
      if (intoWall && avoidMag > 0.4) {
        me.botDefenseStuckTicks = (me.botDefenseStuckTicks ?? 0) + 1;
      } else {
        me.botDefenseStuckTicks = 0;
      }
      if (me.botDefenseStuckTicks >= 2) {
        // VAULT FIRST: if the "wall" being pressed is actually a jumpable
        // ledge (walkable top 1.7–4.8 above, lip unfenced — the same perch
        // check used elsewhere, so Airport's rim glass still rejects it)
        // roughly along the committed escape line, jump ONTO it and keep
        // sprinting the same direction up top: the dodge continues with an
        // elevation change instead of a turn. Jump unaffordable (boost /
        // cooldown) or no ledge → the usual flip → slide → bail chain.
        let vaulted = false;
        if (me.grounded && !me.airborne) {
          const ledge = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, 6);
          if (ledge && ledge.dist < BOT_LEDGE_JUMP_REACH
              && ledge.toX * (me.botDefenseDirX ?? sideX) + ledge.toZ * (me.botDefenseDirZ ?? sideZ) > 0.3) {
            jumpDirX = ledge.toX;
            jumpDirZ = ledge.toZ;
            if (botTryJump(me, now)) {
              jumpThisTick = true;
              vaulted = true;
              me.botDefenseStuckTicks = 0;
            }
          }
        }
        if (vaulted) {
          // committed direction kept — the sprint resumes on the ledge
        } else {
        // Wedged mid-escape (~2 ticks of zero lateral motion pressing a
        // wall). The old response — end Defense and hand off to Maze — never
        // won under sustained fire: "under fire" re-asserted Defense every
        // tick with the SAME direction still pointed into the wall, so the
        // bot stood there getting farmed. Recover IN PLACE instead:
        //   1st wedge → the OTHER perpendicular (equally across the aim
        //               line, and away from the wall just hit by construction);
        //   2nd wedge → slide along the wall (concave corner / corridor);
        //   after that → the old bail-to-Maze as a last resort.
        const flips = me.botDefenseFlips ?? 0;
        if (flips === 0) {
          me.botDefenseDirX = -(me.botDefenseDirX ?? sideX);
          me.botDefenseDirZ = -(me.botDefenseDirZ ?? sideZ);
          me.botDefenseDirAt = now;
          me.botDefenseFlips = 1;
          me.botDefenseStuckTicks = 0;
        } else if (flips === 1) {
          const am = avoidMag || 1;
          let tx2 = -avoid.rz / am, tz2 = avoid.rx / am;
          if (tx2 * (me.botDefenseDirX ?? sideX) + tz2 * (me.botDefenseDirZ ?? sideZ) < 0) {
            tx2 = -tx2; tz2 = -tz2;
          }
          me.botDefenseDirX = tx2;
          me.botDefenseDirZ = tz2;
          me.botDefenseDirAt = now;
          me.botDefenseFlips = 2;
          me.botDefenseStuckTicks = 0;
        } else {
          me.botLastProgressAt = now - 2001;
          me.botDefenseUntil = now;
        }
        }
      }
    }
  }

  // === Velocity dispatch — drives the heading and sprint intent produced by
  // the active state into the body's velocity. Mid-jump airborne ticks hold
  // the launch aim so the arc lands where it was committed.
  const botSprintBase = me.unit?.sprintSpeed ?? BOOST_MOVE_SPEED;
  const botWalkSpeed = me.unit?.walkSpeed ?? WALK_SPEED;
  // Defense (escaping live fire) may spend down to the hard floor; every
  // other state stops at the strategic reserve.
  const botSprintFloor = me.botState === 'defense' ? BOT_SPRINT_MIN_BOOST : BOT_BOOST_RESERVE;
  const botCanSprint = me.boost >= botSprintFloor && now >= me.emptyRecoverUntil;

  if (jumpThisTick) {
    me.botAirSteerX = jumpDirX;
    me.botAirSteerZ = jumpDirZ;
    me.botAirSteerUntil = now + BOT_AIR_STEER_MS;
    me.vel.x = jumpDirX * botSprintBase;
    me.vel.z = jumpDirZ * botSprintBase;
    me.action = 'jump';
  } else if (me.airborne && (me.botAirSteerUntil ?? 0) > now) {
    const ax = me.botAirSteerX ?? mx;
    const az = me.botAirSteerZ ?? mz;
    me.vel.x = ax * botSprintBase;
    me.vel.z = az * botSprintBase;
    me.action = 'dash';
  } else if (wantSprint && botCanSprint) {
    me.vel.x = mx * botSprintBase;
    me.vel.z = mz * botSprintBase;
    inheritMomentum(me, MOMENTUM_STANDARD * 1.5);
    me.action = 'dash';
  } else {
    me.vel.x = mx * botWalkSpeed;
    me.vel.z = mz * botWalkSpeed;
    if (Math.abs(me.vel.x) + Math.abs(me.vel.z) < 0.08) {
      me.vel.x = sideX * 4.5;
      me.vel.z = sideZ * 4.5;
    }
    me.action = 'idle';
  }

  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing. Mirrors offline main.js updateEnemy.
  if (now < me.hitStunUntil) {
    me.vel.x *= me.hitStunScale;
    me.vel.z *= me.hitStunScale;
  }

  if (dist > 14 && Math.random() > 0.9) me.evadeHomingUntil = now + 90;

  // --- Firing: LoS-aware + universal burst sizing ---
  if (now >= me.nextFireAt) {
    const u = me.unit;
    // NOTE (2026-08-01): the bot's OWN spawn immunity no longer holds fire —
    // shots from an immune attacker deal full damage (every hit check is
    // target-side), and humans can already shoot while protected. Only the
    // TARGET-immunity hold below remains.
    if (u.magCapacity != null && me.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (me.reloadingUntil || now + u.reloadMs) - now);
      me.nextFireAt = now + wait;
      me.machineBurstRemaining = 0;
    } else if (now < opp.invulnerableUntil) {
      // Target is spawn-immune — no shot can hurt it, so hold fire instead
      // of wasting the burst (2026-08-01). Wake at the immunity lapse or the
      // regular 220 ms poll, whichever comes first (the target can change).
      me.nextFireAt = Math.min(opp.invulnerableUntil, now + 220);
      me.machineBurstRemaining = 0;
    } else if (!botHasLineOfSight(
      { x: me.pos.x, y: me.pos.y + BOT_LOS_EYE_HEIGHT, z: me.pos.z },
      { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
      obstacles
    )) {
      // No clear shot — hold fire and check again shortly.
      me.nextFireAt = now + 220;
      me.machineBurstRemaining = 0;
    } else if (u.sniperCharge) {
      const fired = attemptFire(matchState, me, opp, now);
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
      me.machineBurstRemaining = 0;
    } else {
      // Burst gating applies to every single-projectile gun AND to any
      // multi-pellet gun with an explicit botFireCap (2026-08-01: shotguns
      // carry cap 4 — four blasts per trigger pull, then the usual rest).
      const bursted = u.spreadCount === 1 || u.botFireCap;
      if (bursted && me.machineBurstRemaining <= 0) {
        me.machineBurstRemaining = botBurstSize(u);
      }
      const firedAt = me.lastFireAt;
      attemptFire(matchState, me, opp, now);
      const fired = me.lastFireAt !== firedAt;
      if (bursted) {
        if (fired) me.machineBurstRemaining -= 1;
        me.nextFireAt = me.machineBurstRemaining > 0
          ? now + u.fireCooldownMs
          : now + between(800, 1500);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        // Capless multi-pellet pacing — pace shots near the weapon's
        // mechanical fire cooldown so the bot uses its full per-shot DPS
        // instead of dawdling 1+ s between shots. Small jitter avoids a
        // perfectly robotic cadence; the magazine + autoReload still impose
        // a natural burst rhythm without the AI gating on top.
        if (fired) me.nextFireAt = now + u.fireCooldownMs + between(40, 220);
        else me.nextFireAt = now + 120;
      }
    }
  }
}
