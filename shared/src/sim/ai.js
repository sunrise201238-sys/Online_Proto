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
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle } from './physics.js';
import { getArena } from './arena.js';
import { inheritMomentum } from './movement.js';
import { MAX_HP, STEP_BOOST_COST, GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS } from './constants.js';

// --- Bot tactical-sprint tunables ---
// Hysteresis: bot only initiates a new sprint burst once boost has refilled
// to BOT_SPRINT_READY_BOOST. This prevents the stutter-step that happens when
// boost barely crosses 0 and is immediately spent again.
const BOT_SPRINT_READY_BOOST = STEP_BOOST_COST;            // 48
const BOT_SPRINT_MIN_BOOST = 8;
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
// Anti-sniper humanization: the bot only "notices" a sniper glint after this
// reaction delay — Defense entry AND its guessed dodge both wait on it. A
// floor-canceled snap shot (SNIPER_CANCEL_MIN_CHARGE_MS) therefore arrives
// before a bot that hasn't reacted yet, instead of being dodged on frame one.
const BOT_GLINT_REACT_MS = 540;
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
// the bot is over or under (same skip math as resolveUnitObstacleCollisions),
// and skips `noProjectile`-flagged obstacles since those have a dedicated
// jump handler (e.g. station's platform-edge walls).
function computeBotAvoidance(px, py, pz, obstacles, radius) {
  let rx = 0, rz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
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

// Universal burst size for continuous-fire weapons (spreadCount === 1): about
// half the mag per trigger pull, clamped so tiny or huge mags still feel
// right. Derives from magCapacity so re-tuning a weapon re-tunes the bot.
function botBurstSize(unit) {
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

export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
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

  // --- Anti-sniper glint response: dodge a fixed BOT_GLINT_REACT_MS after the
  // glint appears (mirrors updateEnemy in main.js). One step per charge; the
  // schedule survives the glint vanishing so a late/full-charge shot is still
  // covered.
  const sniperCharging = opp.sniperChargeTargetId === me.id;
  if (sniperCharging) {
    if (!me.botGlintAt) {
      me.botGlintAt = now;
      me.botGlintStepAt = now + BOT_GLINT_REACT_MS;
    }
  } else {
    me.botGlintAt = null;
  }
  // A fresh hit means the shot already landed — drop the now-pointless dodge.
  // (botPrevHitStun is only advanced by the threat block below, so the rising
  // edge is still visible here.)
  if (me.hitStunUntil > (me.botPrevHitStun ?? 0)) me.botGlintStepAt = null;

  // The dodge comes due: one i-frame step, then a 150 ms sprint in the same
  // direction (the guess/schedule is spent either way).
  if (me.botGlintStepAt != null && now >= me.botGlintStepAt) {
    me.botGlintStepAt = null;
    if (now > me.stepUntil) {
      // Continue the committed Defense escape line if one is active so the
      // dodge reads as part of the same evade; otherwise pick a random side.
      let sdx, sdz;
      if (me.botState === 'defense' && me.botDefenseDirX != null) {
        sdx = me.botDefenseDirX; sdz = me.botDefenseDirZ;
      } else {
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = sideX * lat; sdz = sideZ * lat;
      }
      if (tryStartStep(matchState, me, sdx, sdz, now, obstacles)) {
        // "Dodge + 150 ms sprint": after the i-frame step ends, keep sprinting
        // the same way for 150 ms via a brief Defense commit.
        me.botState = 'defense';
        me.botStateEnteredAt = now;
        me.botDefenseDirX = sdx; me.botDefenseDirZ = sdz;
        me.botDefenseUntil = me.stepUntil + 500;
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

  // Kite near the outer edge of the weapon's red-lock range — far enough to
  // minimize incoming fire effectiveness while still landing our own shots.
  // Most weapons derive the band from lockRange directly; multi-pellet
  // shotguns use a dedicated tighter band so they fight inside the cluster
  // spread distance (SHOTGUN_CLUSTER_SPREAD_DISTANCE = 20) where pellets
  // haven't fully fanned out yet and more land per shot.
  const lockRange = me.unit?.lockRange ?? 50;
  const isShotgun = (me.unit?.spreadCount ?? 1) > 1;
  let upperRange, optimalRange, lowerRange;
  if (isShotgun) {
    upperRange = 34;
    optimalRange = 27;
    lowerRange = 20;
  } else {
    upperRange = Math.max(12, lockRange - 2);
    optimalRange = Math.max(10, upperRange - 7);
    lowerRange = Math.max(6, optimalRange - 7);
  }
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
    if (Math.hypot(ddx, ddz) > 3) me.botLastProgressAt = now;
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
  me.botPathLen = (me.botPathLen ?? 0)
    + Math.hypot(me.pos.x - (me.botPrevX ?? me.pos.x), me.pos.z - (me.botPrevZ ?? me.pos.z));
  me.botPrevX = me.pos.x;
  me.botPrevZ = me.pos.z;
  if (me.botStuckCheckAt == null) {
    me.botStuckCheckX = me.pos.x;
    me.botStuckCheckZ = me.pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  } else if (now - me.botStuckCheckAt >= 1500) {
    const windowStale = now - me.botStuckCheckAt > 2200;
    const net = Math.hypot(me.pos.x - me.botStuckCheckX, me.pos.z - me.botStuckCheckZ);
    const wedged = net < 2.5 && me.botPathLen < 6;
    const spinning = me.botPathLen > 18 && net < 6;
    if (!windowStale
        && (wedged || spinning)
        && !me.airborne
        && now >= me.hitStunUntil
        && (me.botState ?? 'pursue') !== 'defense') {
      stuckTriggered = true;
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
      // Tiebreak the go-around side by PROBING: from ~20 units along each
      // tangent, would the player be visible? Prefer the side that opens
      // sight (kills the long-way-around coin flip at symmetric walls);
      // fall back to the old "lean toward the player" rule when probes agree.
      const mazeProbe = (px2, pz2) => botHasLineOfSight(
        { x: px2, y: me.pos.y + BOT_LOS_EYE_HEIGHT, z: pz2 },
        { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
        obstacles
      );
      const losPlus = mazeProbe(me.pos.x + tx * 20, me.pos.z + tz * 20);
      const losMinus = mazeProbe(me.pos.x - tx * 20, me.pos.z - tz * 20);
      if (losPlus !== losMinus) {
        if (losMinus) { tx = -tx; tz = -tz; }
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

  // --- State transition by precedence ---
  const prevState = me.botState ?? 'pursue';
  let nextState = prevState;
  const inDefenseGrace = prevState === 'defense' && now < (me.botDefenseUntil ?? 0);

  if (underFire || inDefenseGrace) {
    nextState = 'defense';
  } else if (stuckTriggered || noProgressTime > 2000 || noLoSTime > 2000) {
    // Wedged, spinning, stalled, or sightless for 2 s — commit to going
    // AROUND whatever is in the way.
    nextState = 'maze';
  } else if (prevState === 'maze') {
    // Maze latches until the job is done: entered sightless, only reacquiring
    // sight releases it. Entered WITH sight (pillar graze), a short cap
    // releases it — else nothing ever would.
    const losReacquired = playerHasLoS && me.botMazeLosBlockedAtEntry;
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
  if (nextState === 'maze' && prevState === 'maze'
      && (stuckTriggered || (now - (me.botStateEnteredAt ?? now)) > 7000)) {
    me.botStateEnteredAt = now;
    // Stuck → escape (reverse). Plain 7 s refresh → keep the same hand, so a
    // long wall gets walked to its end instead of re-aimed toward the player.
    commitMazeDirection(stuckTriggered, !stuckTriggered);
  }

  // --- State entry: commit per-state directions and timers ---
  if (nextState !== prevState) {
    me.botState = nextState;
    me.botStateEnteredAt = now;

    if (nextState === 'maze') {
      me.botMazeWallTicks = 0;
      commitMazeDirection();
    }

    if (nextState === 'engage'
        && (prevState === 'pursue' || prevState === 'maze' || prevState === 'defense' || me.botOrbitSign == null)) {
      me.botOrbitSign = Math.random() > 0.5 ? 1 : -1;
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
  }

  // --- State behavior: heading + sprint intent + optional jump ---
  let mx = 0, mz = 0;
  let wantSprint = false;
  let jumpThisTick = false;
  let jumpDirX = dirX, jumpDirZ = dirZ;
  const botS = me.botState;

  if (botS === 'pursue') {
    // Pursue handles BOTH sides of the band: toward the player when too far,
    // AWAY from them when too close. Without the negative branch the bot just
    // keeps closing through lowerRange and collides at zero distance.
    const tooClose = dist < lowerRange;
    const dirSign = tooClose ? -1 : 1;
    let tx = dirX * dirSign + avoid.rx * 0.8;
    let tz = dirZ * dirSign + avoid.rz * 0.8;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;
    const reserveBoost = BOT_SPRINT_MIN_BOOST + 25;
    if (me.boost >= BOT_SPRINT_READY_BOOST) me.botPursueSprinting = true;
    if (me.boost <= reserveBoost) me.botPursueSprinting = false;
    wantSprint = !!me.botPursueSprinting;
    // Elevation aids close the gap; skip them when we're trying to back off.
    if (!tooClose && me.grounded && !me.airborne) {
      if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF && dist < 32 && Math.random() > 0.5) {
        if (tryStartJump(me, now)) jumpThisTick = true;
      } else if (onHighGround) {
        const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (tryStartJump(me, now)) jumpThisTick = true;
        }
      } else {
        // Low ground: take any reachable platform — no "toward player" gate,
        // since on maps like Station the raised decks are the strong positions
        // and we'd rather be up there than on the tracks. The jump cooldown
        // rate-limits this; no strict random gate needed.
        const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (tryStartJump(me, now)) jumpThisTick = true;
        }
      }
    }
  } else if (botS === 'maze') {
    // Committed tangent + a gentle pull toward the player (the Pursue-
    // flavored heart). The pull FADES OUT near walls (scaled by avoidance
    // strength) so it can't press the bot into concave corners; in the open —
    // i.e. right after the wall ends — it kicks back in and curls the bot
    // around the corner instead of letting it sprint on past the opening.
    // Context change: committed in the open, and a wall just interposed —
    // switch to wall-follow NOW instead of grinding into it.
    if (me.botMazeHadWall === false && obstacleNear) commitMazeDirection();
    // CORNER TURN: the committed wall-follow ran into a NEW wall face
    // (concave corner). Same 2-tick wall-press read Defense uses — re-commit
    // HERE (~0.03 s, not the 1.5 s stuck alarm) preserving the going-around
    // hand, so the bot turns the corner and keeps circling the object
    // instead of stalling until the alarm reverses it.
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
    if (me.grounded && !me.airborne) {
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (tryStartJump(me, now)) jumpThisTick = true;
      }
    }
  } else if (botS === 'engage') {
    const sign = me.botOrbitSign ?? 1;
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
        if (tryStartJump(me, now)) jumpThisTick = true;
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
          me.botDefenseFlips = 2;
          me.botDefenseStuckTicks = 0;
        } else {
          me.botLastProgressAt = now - 2001;
          me.botDefenseUntil = now;
        }
      }
    }
  }

  // === Velocity dispatch — drives the heading and sprint intent produced by
  // the active state into the body's velocity. Mid-jump airborne ticks hold
  // the launch aim so the arc lands where it was committed.
  const botSprintBase = me.unit?.sprintSpeed ?? BOOST_MOVE_SPEED;
  const botWalkSpeed = me.unit?.walkSpeed ?? WALK_SPEED;
  const botCanSprint = me.boost >= BOT_SPRINT_MIN_BOOST && now >= me.emptyRecoverUntil;

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
    if (now < me.invulnerableUntil) {
      // Spawn immunity — no shot can land yet, so hold fire until it lapses.
      me.nextFireAt = me.invulnerableUntil;
      me.machineBurstRemaining = 0;
    } else if (u.magCapacity != null && me.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (me.reloadingUntil || now + u.reloadMs) - now);
      me.nextFireAt = now + wait;
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
        // Sniper release timing. Kei (beam): 70% quick at the floor / 30% holds
        // to full charge (the sweep channel). Other snipers: 90% floor / 10%
        // random point in the cancel window.
        me.sniperChargeUntil = now + (u.beam
          ? (Math.random() < 0.7 ? SNIPER_CANCEL_MIN_CHARGE_MS : (u.chargeMs ?? 1000))
          : (Math.random() < 0.9 ? SNIPER_CANCEL_MIN_CHARGE_MS : between(SNIPER_CANCEL_MIN_CHARGE_MS, u.chargeMs ?? 1000)));
        me.nextFireAt = now + u.fireCooldownMs + between(400, 1200);
      } else me.nextFireAt = now + 220;
      me.machineBurstRemaining = 0;
    } else {
      if (u.spreadCount === 1 && me.machineBurstRemaining <= 0) {
        me.machineBurstRemaining = botBurstSize(u);
      }
      const firedAt = me.lastFireAt;
      attemptFire(matchState, me, opp, now);
      const fired = me.lastFireAt !== firedAt;
      if (u.spreadCount === 1) {
        if (fired) me.machineBurstRemaining -= 1;
        me.nextFireAt = me.machineBurstRemaining > 0
          ? now + u.fireCooldownMs
          : now + between(800, 1500);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        // Multi-pellet (shotgun-style) pacing — pace shots near the weapon's
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
