// THE PLAIN BRAIN (Health Point mode) — one module for both hosts (owner
// 2026-10-17, the plain-brain rework: "one place, one structure, patchless").
// The server's tickBot (ai.js) and the offline client's updateEnemy (main.js)
// each build a host and call nbBrainTick once a tick; there is no second copy.
// The brain is the b1018a brain unchanged (the equivalence test
// shared/test/nb_equiv.test.js plays it tick for tick against the frozen
// host): the state machine Defense > Maze > Engage > Pursue, the hide stance,
// the anti-glint dodge, the stuck detectors, the pathfinder's Maze, the
// velocity dispatch and the fire block. The Sudden Death brain (sdbrain.js)
// runs inside it on the same host.
//
// THE HOST — what the brain reads and does through it:
//   now, me          the clock; the unit's state object (its bot* scratch,
//                    boost, ammo, reload, fire clocks, momentum, action...)
//   pos, vel         the body centre {x, y, z} and the velocity it writes
//   grounded, unit   the body's ground contact; the unit's data
//   opp, enemies     views of the target and of every live enemy: {id, pos,
//                    vel, hp, unit, lastFireAt, bloom, invulnerableUntil,
//                    chargeStartAt, chargingAtMe}; opp is one of enemies
//   cmd              the command entry {hide, hideAuto, move, lockTargetId}
//                    the brain reads and writes, or null
//   obstacles, surfaces, grid   the arena and its nav grid
//   eyeUp, muzzleUp  the eye and the muzzle above the body centre
//   mode, tickMs     the match mode; the host's tick length (the fire poll)
//   charging         the unit holds a sniper charge (stands still)
//   sd               the Sudden Death knobs when that brain runs, else null
//   wall             physics' note of the face the body was pushed out of
//   clear(p0, p1)    can a round fly p0 -> p1 (the projectile rules)
//   startStep(dx, dz), tickStep(), startJump(), fire()   the body's actions
//   inheritMomentum(k), navGet(), navSet(v), searchSlot(), deadline(), tape
// Returns 'locked' (charge or beam: standing), 'step' (the plain bot sat the
// dodge out), 'stepping' (the Sudden Death brain watched it) or 'ran'.

import { between } from './math.js';
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle, walkSegmentBlocked, sightHitsSurface, obstaclesNearPoint, obstaclesNearSegment, boxHoldsAt } from './physics.js';
import { findPathOnGrid, findFiringPath, findHiddenSpot, smoothPath } from './navgrid.js';
import { SURFACE_STEP_HEIGHT, JUMP_RISE_MIN, GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS, MANDATED_JUMP_MIN_BOOST, CMD_TRAVEL_BOOST_FLOOR, HIT_RADIUS_NORMAL } from './constants.js';
import { botMayFire, botNoteShot, botClearFireRule } from './bloom.js';
import { sdBrainTick } from './sdbrain.js';

// --- Bot tactical-sprint tunables ---
const BOT_SPRINT_MIN_BOOST = 8;
// Strategic reserve: bots never VOLUNTARILY spend below this — one knob
// gating every travel decision (sprint dispatch, Pursue hysteresis, Maze
// cruise/jump funding, the anti-glint dodge). The sole exception is
// Defense: escaping live fire may burn down to BOT_SPRINT_MIN_BOOST.
// This is purely a bot DECISION threshold — the stamina MECHANICS
// (costs, drain, regen, caps, empty-recovery) stay identical to the
// human player's.
const BOT_BOOST_RESERVE = 250;   // 150 -> 250 (2026-08-01): a travel sprint leg ARMS only from a topped-up tank
const BOT_TRAVEL_SPRINT_FLOOR = 200;   // owner 2026-09-29: an armed leg runs down to here, then walk until full again; discretionary jumps fund from this line too (arm and floor both sat at 250 before: one dash tick per half second)
// Pursue / Maze sprint latch: arm at the reserve, release at the floor.
function botTravelSprint(me) {
  if (me.boost >= BOT_BOOST_RESERVE) me.botPursueSprinting = true;
  else if (me.boost <= BOT_TRAVEL_SPRINT_FLOOR) me.botPursueSprinting = false;
  return !!me.botPursueSprinting;
}
// A fresh hit forces an evade for this long (so taking damage always provokes a
// relocate, even if the shot landed at the edge of the fire window).
const BOT_HIT_EVADE_MS = 350;
// Anti-sniper humanization: the bot rolls its reaction PER CHARGE  — a defensive mixed strategy against the sniper's
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
const BOT_OBSTACLE_AVOID_RADIUS = 7;
// After a stuck event, remember the pinned spot for this long and bias
// movement away from it so the bot picks a different route around the wall
// instead of grinding into the same corner. Radius caps the influence so
// distant memories don't warp kiting. (Briefly 6/1500 on 2026-08-08 while
// chasing the Airport "bots avoid the middle" report — reverted by the user
// once that turned out to be the 2v2 spawn asymmetry, since fixed.)
const BOT_STUCK_MEMORY_MS = 3500;
const BOT_STUCK_MEMORY_RADIUS = 12;
const BOT_STUCK_MEMORY_WEIGHT = 0.7;  // below the ~0.85 pursuit pull, so it nudges the path angle without ever reversing pursuit (was 1.4 — strong enough to shove the bot away from the player and stall its search)
// (BOT_LOS_EYE_HEIGHT 1.6 moved to constants.js, 2026-09-26 — the hide-spot
// search in navgrid.js shares the bot's eye rule.)
// RELOAD HIDE (the 2026-08-08 cover reload, re-based on the Hide stance by
// the owner 2026-09-26): units with a MANUAL reload at least MIN_MS long
// (Hina's 7 s drum, Koyuki's 5 s) spend the famine in the Hide stance —
// entered the tick the reload starts, left the tick it completes — with
// every Hide rule (hidden from every enemy, pace, slip, no Defense, fire
// back only from where it stands). Auto and per-shell reloaders are
// excluded by design. See the hideOrdered read in tickBot.
const BOT_RELOAD_HIDE_MIN_MS = 3000;
// HIDE ORDER (owner 2026-09-26 — the Fight/Hide stance; the HIDE block in
// tickBot): a hidden-spot search runs at most every SEARCH_MS per unit (and
// once per tick per match), a search that found nothing at all retries
// after FAIL_RETRY_MS, a route that stops making progress bails after
// BAIL_MS and retries after BAIL_RETRY_MS, and MAX_POPS bounds the Dijkstra
// (there is no distance cap — the unit walks as far as it takes). 
const BOT_HIDE_SEARCH_MS = 500;
const BOT_HIDE_FAIL_RETRY_MS = 500;   // 1500 -> 500 (owner 2026-09-27: keep looking for a double-block spot)
const BOT_HIDE_BAIL_MS = 700;
const BOT_HIDE_BAIL_RETRY_MS = 700;
const BOT_HIDE_MAX_POPS = 600;
// SHOULDERS (2026-10-10, the Streets reload-hide test turned flaky once the
// map-edge slabs moved and the nav cells shifted): the hide goal must hide
// the unit's WIDTH — its centre and both shoulders across each eye's line —
// like the Sudden Death search (SD.shoulder). A cell hidden by a hair at an
// alley mouth used to pass the centre test; the unit stopped within its
// 2 u arrival tolerance in view, re-searched, got the same cell, and
// shuffled there for the whole reload.
const BOT_HIDE_SHOULDER = HIT_RADIUS_NORMAL;
// Pacing and slipping while hidden (owner 2026-09-26: no statue): a pacing
// leg is LEG units long and must be verified hidden before it is taken,
// legs stay within LEASH of the hide anchor and a heading is re-picked
// every DRIFT_MS (DRIFT_RETRY_MS when no hidden leg exists). Enemies are
// projected PREDICT_S ahead on their live velocity (below PREDICT_MIN_SPEED
// they are treated as standing); a nearest enemy inside CLOSE_DIST closing
// faster than APPROACH_SPEED triggers a slip to a cell at least SLIP_GAIN
// farther from it.
const BOT_HIDE_LEG = 2.5;
const BOT_HIDE_LEASH = 6;
const BOT_HIDE_DRIFT_MS = 350;
const BOT_HIDE_DRIFT_RETRY_MS = 150;
const BOT_HIDE_PREDICT_S = 0.5;
const BOT_HIDE_PREDICT_MIN_SPEED = 1;
const BOT_HIDE_CLOSE_DIST = 26;
const BOT_HIDE_APPROACH_SPEED = 2;
const BOT_HIDE_SLIP_GAIN = 6;
// COVER HIDE (owner 2026-09-26/27): a unit under a MOVE ORDER spends a long
// manual reload (BOT_RELOAD_HIDE_MIN_MS+) in a hide bound to the order —
// cover from BOTH enemies inside the order's area first (AREA_R around the
// ordered point; anchor phase only — a unit still travelling has no area
// yet and skips that tier), then the nearest such cover anywhere; no cover
// -> the reload is spent on the order's legs (a hit then runs Defense as
// usual) and no retry for BOT_HIDE_FAIL_RETRY_MS. Sprints like Defense to
// the cover (down to the 8 floor, no arming), paces once hidden, and ends
// with the reload. No badge; the move order stands throughout and the
// driver resumes it after (commandReflexActive yields to botCH). A fresh
// HIT under a move order runs plain Defense (2026-09-27: the hit-triggered
// cover hide measured about half of Defense's survival in bot duels on
// Factory / Streets / Airport and was retired). Never alongside the Hide
// stance (it wipes move orders anyway).
const BOT_CH_AREA_R = 14;
// Every hide scratch field, nulled when a hide ends (stance cleared, cover
// hide over) so the normal brain resumes from a clean slate; the client also
// wipes a corpse with it.
export function resetBotHideFields(f) {
  f.botHidePath = null;
  f.botHidePathIdx = null;
  f.botHideGoal = null;
  f.botHideSearchAt = null;
  f.botHideSearchStage = null;
  f.botHideFailedAt = null;
  f.botHideHold = null;
  f.botHideDashArmed = null;
  f.botHideTier = null;
  f.botHideMoveAnchor = null;
  f.botHideAnchor = null;
  f.botHideDriftX = null;
  f.botHideDriftZ = null;
  f.botHideDriftUntil = null;
  f.botHideNoCover = null;
}
const BOT_JUMP_HEIGHT_DIFF = 2.5;
// LoS-aware 2v2 targeting: an enemy with no line of sight (sealed behind
// glass/walls) reads this many units FARTHER than it really is, so a visible
// enemy wins the lock unless the blocked one is drastically closer. The
// margin keeps the current lock unless a rival clearly beats it (no flicker).
export const BOT_TARGET_BLOCKED_PENALTY = 50;
export const BOT_TARGET_SWITCH_MARGIN = 6;

// --- Elevation-kiting tunables ---
// A ledge whose lip rises more than the auto-step height above the
// bot's floor can't be walked onto — it needs a jump. The upper bound is
// what a jump arc can actually clear (apex ≈ jumpVelocity² / 2·|gravity|,
// ≈ 5.6 with the default 30 jump velocity), kept conservative for margin.
const BOT_CLIMB_MIN_RISE = JUMP_RISE_MIN;
const BOT_CLIMB_MAX_RISE = 4.8;
// Narrowest surface still worth treating as a perch. Below this a jump
// overshoots it entirely (see findHighGroundPerch). 6 sits in the gap between
// the 4-wide conveyors and the next-narrowest real platform at 10.
const BOT_PERCH_MIN_WIDTH = 6;
// How close the Maze follower gets to a waypoint before starting the next
// leg. 3 -> 1.5 (2026-08-12): at 3 on a 4-unit nav grid — whose corner
// waypoints stand only ~1.5-2.8u off the blocks — the early turn rounded
// every corner INTO the obstacle's end face, where the radial-only avoidance
// has no sideways component and the bot rubbed until a stuck detector fired
// (the residual wall-grind the user kept seeing). Measured at 1.5, seeded
// A/B: grind episodes -36% flashpoint / -89% factory2 / -66% airport, no
// freeze regression on current spawns, clean at 20 fps timing and with a
// 1-frame-stale self view; cost is ~1-2.5 s slower closing on flashpoint and
// AA12 +3.1pp in the 1v1 ladder (only mover beyond its CI). The final-
// arrival test stays at 3 — shrinking THAT re-arms the no-progress trigger
// on a standing bot (the Plain Field never-orbits bug). Used at the follower
// AND its statue-escape replay: the two must stay identical or the replay's
// waypoint comparison silently stops matching. 
const BOT_WAYPOINT_ADVANCE_RADIUS = 1.5;
// How far out the bot scans for a ledge to perch on, and how close it has to
// get to that ledge (or to a drop edge) before it commits the jump.
const BOT_PERCH_SEEK_RADIUS = 24;
const BOT_LEDGE_JUMP_REACH = 4.5;
// A floor more than this above base ground means "the bot is on high ground".
const BOT_HIGH_GROUND_MIN_Y = 1.7;
// How far past a surface edge to sample when testing whether stepping off it
// actually drops to lower ground (vs. running straight into a wall).
const BOT_DESCENT_PROBE = 3;
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
  let rx = 0, rz = 0, top = 0;
  const near = obstaclesNearPoint(obstacles, px, pz, radius);   // the broadphase: the boxes within reach
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    // (py > o.maxY: a bot already ABOVE the fence top — e.g. crossing the
    // streets bridge deck over its 6-high under-deck end walls — passes over
    // it freely and must not be shoved sideways.)
    if (o.noProjectile && ((o.maxY - o.minY) <= BOT_CLIMB_MAX_RISE || py > o.maxY)) continue;
    if (!boxHoldsAt(o, py)) continue;
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
      if (strength > top) top = strength;
    } else {
      top = 1;
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
  // The field is bounded by the nearest box's own push: the boxes stand for the
  // walls, not the other way round, so a wall cut into twenty boxes (the glTF
  // maps' fences, rails, deck edges and facades) weighs what one wall weighs.
  // Unbounded, the sum of a cluster 3-5 u away reached 1.7 and more, outweighing
  // the route's own pull (weight 0.6 on the sum): the heading normalised a
  // near-zero vector and flipped 180 degrees every tick, the body stepping back
  // and forth on one spot for as long as the goal stayed hidden (Town, Plaza;
  // b1021g). The direction stays the sum's; one box alone is untouched.
  const mag = Math.sqrt(rx * rx + rz * rz);
  if (mag > top + 1e-9) { rx *= top / mag; rz *= top / mag; }
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

// Sight vs a walkable surface (2026-08-06): decks/ramps are NOT obstacle
// boxes, so without this a sight ray passed straight through a bridge
// slope's solid wedge (Streets bots blazing at each other across the ramp)
// or an elevated deck's floor. RAMPS are solid fill — the ray is blocked
// wherever it dips below the ramp's local height inside the footprint (both
// the ray's y and the ramp height are linear along the ray, so checking the
// clipped interval's endpoints is exact). FLAT elevated decks stand on open
// pillars, so only CROSSING the deck plane blocks — two units both under
// the bridge keep their sight lines. 0.4 epsilon forgives grazes at lips.
// (sightHitsSurface moved to physics.js, 2026-08-14 — the planner's
// firing-position search needs the SAME surface sight rule the bot uses.)

// Line-of-sight check using the same swept-AABB math projectiles use, so the
// bot only "sees" through gaps a bullet would actually pass through.
// `surfaces` adds the deck/ramp masses (see sightHitsSurface) — optional so
// exotic callers without surface data stay safe. Exported (2026-09-26) so the
// hide-order tests judge "hidden" by the bot's own rule.
export function botHasLineOfSight(p0, p1, obstacles, surfaces) {
  const cand = obstaclesNearSegment(obstacles, p0, p1);   // the broadphase: the boxes the segment's cells hold
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    // Invisible unit-fences normally don't block sight (bullets pass), but
    // bars flagged blocksBotSight DO: a see-through wall the bot cannot walk
    // through defeats every routing trigger — the bot paces in Engage
    // against the invisible face instead of routing around (Streets
    // under-slope bars, 2026-08-13). 
    if (o.noProjectile && !o.blocksBotSight) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  if (surfaces) {
    const near = obstaclesNearSegment(surfaces, p0, p1);   // (floors are boxes to the broadphase too)
    for (let i = 0; i < near.length; i++) {
      if (sightHitsSurface(p0, p1, near[i])) return false;
    }
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
// minWidth defaults to the perch floor. MAZE passes 0: it is following a route,
// not shopping for a vantage point, so a narrow strip its path climbs is a
// legitimate step — see the call site for the measurements behind that split.
function findHighGroundPerch(px, pz, myFloorY, surfaces, obstacles, searchRadius, minWidth = BOT_PERCH_MIN_WIDTH) {
  let best = null;
  let bestDist = searchRadius;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.maxTop - myFloorY < BOT_CLIMB_MIN_RISE) continue;
    // TOO NARROW TO LAND ON (user 2026-08-09). A jump carries 12-17 units
    // horizontally, so a strip thinner than this isn't a perch — the bot sails
    // clean over it and lands on the far side, then finds the same strip 4 u
    // behind and hops back. Factory's 4-wide conveyors did exactly that, and
    // being airborne meant it couldn't dodge while it happened. Only those and
    // Factory 2's belts are excluded game-wide; every other surface in the
    // climb window is 10 u or wider and behaves exactly as before.
    if (Math.min(s.maxX - s.minX, s.maxZ - s.minZ) < minWidth) continue;
    const nx = Math.max(s.minX, Math.min(px, s.maxX));
    const nz = Math.max(s.minZ, Math.min(pz, s.maxZ));
    const rise = s.heightAt(nx, nz) - myFloorY;
    if (rise < BOT_CLIMB_MIN_RISE || rise > BOT_CLIMB_MAX_RISE) continue;
    // Farther than the best so far: it cannot win, whatever its lip holds.
    const ddx = nx - px;
    const ddz = nz - pz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d >= bestDist) continue;
    // A wall standing ON the ledge lip (e.g. Airport's rim glass fences) means
    // a unit couldn't stand at this point — treat it like any wall and don't
    // steer/jump toward it. Same y-window semantics as unit collision; Station's
    // edge walls (maxY == platform top, topBuffer 0) pass unchanged. Only the
    // boxes the broadphase puts within 1.15 u of the lip are looked at.
    const lipY = myFloorY + rise + 2.45;
    let lipBlocked = false;
    const near = obstaclesNearPoint(obstacles, nx, nz, 1.15);
    for (let j = 0; j < near.length; j++) {
      const o = near[j];
      const tb = o.topBuffer ?? 4;
      if (lipY < o.minY - 2 || lipY > o.maxY + tb) continue;
      const ox = Math.max(o.minX, Math.min(nx, o.maxX));
      const oz = Math.max(o.minZ, Math.min(nz, o.maxZ));
      const bdx = nx - ox;
      const bdz = nz - oz;
      if (bdx * bdx + bdz * bdz < 1.15 * 1.15) { lipBlocked = true; break; }
    }
    if (lipBlocked) continue;
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
  let deck = null;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (px < s.minX || px > s.maxX || pz < s.minZ || pz > s.maxZ) continue;
    if (Math.abs(s.heightAt(px, pz) - myFloorY) > 1) continue;
    deck = s;
    break;
  }
  if (!deck) return null;
  const lowerY = myFloorY - BOT_CLIMB_MIN_RISE;
  const probeY = myFloorY + GROUND_BASE_Y;
  const edges = [
    { x: -1, z: 0, edgeDist: px - deck.minX, probeX: deck.minX - BOT_DESCENT_PROBE, probeZ: pz },
    { x: 1, z: 0, edgeDist: deck.maxX - px, probeX: deck.maxX + BOT_DESCENT_PROBE, probeZ: pz },
    { x: 0, z: -1, edgeDist: pz - deck.minZ, probeX: px, probeZ: deck.minZ - BOT_DESCENT_PROBE },
    { x: 0, z: 1, edgeDist: deck.maxZ - pz, probeX: px, probeZ: deck.maxZ + BOT_DESCENT_PROBE }
  ];
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (groundHeightAt(e.probeX, e.probeZ, surfaces, myFloorY + 50) > lowerY) continue;
    if (unitOverlapsObstacle(e.probeX, probeY, e.probeZ, obstaclesNearPoint(obstacles, e.probeX, e.probeZ, 4))) continue;
    const score = (e.x * awayX + e.z * awayZ) - e.edgeDist * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = { toX: e.x, toZ: e.z, edgeDist: Math.max(0, e.edgeDist) };
    }
  }
  return best;
}

// Bot jump funding: the host's jump (the shared tryStartJump online, the
// client's botStartJump offline) gates at the raw jump cost — human
// mechanics, untouched; bots additionally respect the strategic reserve so a
// hop never leaves them without an emergency dodge.
function botTryJump(host) {
  const funded = Math.max(BOT_TRAVEL_SPRINT_FLOOR, (host.unit?.jumpBoostCost ?? 48) + BOT_SPRINT_MIN_BOOST);
  if (host.me.boost < funded) return false;
  return host.startJump();
}

// SURVIVAL jump funding (2026-08-05): the Defense hop/vault is an escape
// move, and Defense's own sprint drains below the 250 travel reserve within
// a few ticks — reserve-gated funding made the hop nearly unaffordable in
// practice. Same doctrine as the two existing survival exemptions (Defense
// sprints to the hard floor, the anti-glint dodge pays raw step cost).
// Owner 2026-08-22: the gate is the flat MANDATED tier (60 — shared with
// commanded-travel route jumps, was cost+sprint-floor 56). Discretionary
// jumps (pursue perch, elevation aids) keep the reserve gate — bots still
// hoard for the road.
function botTryJumpSurvival(host) {
  if (host.me.boost < MANDATED_JUMP_MIN_BOOST) return false;
  return host.startJump();
}

export function nbBrainTick(host) {
  const { now, me, pos, vel, grounded, unit, opp, enemies, obstacles, surfaces, grid, eyeUp, muzzleUp, mode, sd } = host;

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

  // --- Anti-sniper glint response (mirrors updateEnemy in main.js): dodge a
  // fixed reaction delay after a glint AIMED AT ME appears — from ANY enemy,
  // locked or not (humans see off-lock glints on the edge indicator too; no
  // LoS check, matching the locked case). The earliest-started active charge
  // wins; one step per charge, one schedule at a time — a charge that
  // overlaps a pending/spent dodge gets its own dodge only after the first
  // charge resolves. The schedule survives the glint vanishing so a
  // late/full-charge shot is still covered. `sniperCharging` (locked-target
  // charge) keeps driving the regular Defense durations below unchanged.
  const sniperCharging = chargers.some((c) => c.id === opp.id);
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
  // (botPrevHitAt is only advanced by the threat block below, so the rising
  // edge is still visible here. The hit is read off lastHitAt, which every
  // landed hit stamps — the stun timer no longer, since a stunImmune unit's
  // never moves and her bot never knew it was hit; user 2026-10-23.)
  if ((me.lastHitAt ?? 0) > (me.botPrevHitAt ?? 0)) me.botGlintStepAt = null;

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
      const glintAtk = me.botGlintAttackerId ? (enemies.find((f) => f.id === me.botGlintAttackerId) ?? null) : null;
      if (glintAtk && glintAtk.id !== opp.id) {
        const adx = pos.x - glintAtk.pos.x;
        const adz = pos.z - glintAtk.pos.z;
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
      if (host.startStep(sdx, sdz)) {
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
  // THE SUDDEN DEATH BRAIN WATCHES THE DODGE: the step's lerp owns the body,
  // but the brain still sees (the eyes, the rounds in the air, the clock)
  // and the gun still fires — the velocity dispatch below stands down for
  // the step's duration. The plain bot sits the step out as before.
  const sdStepping = !!sd && now <= me.stepUntil;
  if (now <= me.stepUntil) {
    host.tickStep();
    if (!sdStepping) return 'step';
  } else if (me.stepUntil > 0) host.tickStep();

  // Range band centers ON the lock range: sweet spot = lockRange exactly,
  // edges ±7. The bot hovers right at the red-lock boundary — drifting past
  // it briefly is fine, the Engage pull immediately corrects back. One
  // universal rule for every weapon.
  // 2v2 (2026-08-07): bots derive the band from lockRange2v2 instead —
  // compressed 50–70 team-synergy table (long locks let a teammate die
  // alone at the front). Units without the field (hidden ones) and every
  // other mode keep lockRange.
  const lockRange = (mode === '2v2' && unit?.lockRange2v2)
    ? unit.lockRange2v2
    : (unit?.lockRange ?? 50);
  const upperRange = lockRange + 7;
  const optimalRange = Math.max(10, lockRange);
  const lowerRange = Math.max(6, lockRange - 7);
  // === Behavior state machine: Defense > Maze > Engage > Pursue.
  // Each state has explicit time-bound exits — no latching. Replaces the
  // tangle of evadeActive / coverSeeking / escaping / inBurst / direSearch
  // flags with one botState whose transitions are recomputed every tick.

  // GROUNDED SIGHT (2026-08-14, user: "bot exploits the jump to temporarily
  // fire"). Every sight test the bot makes about ITSELF is taken from the
  // eye it has with its feet down, never from the live body height. A jump
  // lifts the eye 5.6 (apex) — past the 8-tall true-cover line and over the
  // Streets deck — so mid-air the bot could see, and shoot, targets it has
  // no business seeing; worse, that airborne blip also reset the no-sight
  // clock that would otherwise have sent it around. Latch the last grounded
  // height and take the LOWER of it and the live one, so a drop off a ledge
  // stays honest too. The OPPONENT endpoint stays live: bots must still
  // react to a jumping human.
  if (grounded && !me.airborne) me.botSightY = pos.y;
  const myEyeY = Math.min(pos.y, me.botSightY ?? pos.y) + eyeUp;
  // Same grounded latch, at MUZZLE height — the fire gate's line (botShotCanLand).
  const myShotY = Math.min(pos.y, me.botSightY ?? pos.y) + muzzleUp;

  // LoS + threats
  const playerHasLoS = botHasLineOfSight(
    { x: pos.x, y: myEyeY, z: pos.z },
    { x: opp.pos.x, y: opp.pos.y + eyeUp, z: opp.pos.z },
    obstacles, surfaces
  );
  // Would the player still be visible from (px, pz)? LoS-gates the range
  // discipline below: never retreat or drift outward past the edge of sight.
  const losFromPoint = (px, pz) => botHasLineOfSight(
    { x: px, y: myEyeY, z: pz },
    { x: opp.pos.x, y: opp.pos.y + eyeUp, z: opp.pos.z },
    obstacles, surfaces
  );
  // Are the next `len` units straight toward the player WALKABLE? Uses the
  // real movement rules (walkSegmentBlocked, topBuffer semantics) — the old
  // chest-height ray sailed clean over 2.4-high belts that physically stop
  // a unit, so the triggers/exits kept releasing the bot into low walls.
  const walkTowardClear = (len) => !walkSegmentBlocked(
    pos.x, pos.z,
    pos.x + dirX * len, pos.z + dirZ * len,
    pos.y, obstacles
  );
  if ((me.lastHitAt ?? 0) > (me.botPrevHitAt ?? 0)) me.botHitEvadeUntil = now + BOT_HIT_EVADE_MS;
  me.botPrevHitAt = me.lastHitAt ?? 0;
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
    me.botProgressAnchorX = pos.x;
    me.botProgressAnchorZ = pos.z;
    me.botProgressAnchorAt = now;
    me.botLastProgressAt = now;
  }
  if (now - me.botProgressAnchorAt > 500) {
    const ddx = pos.x - me.botProgressAnchorX;
    const ddz = pos.z - me.botProgressAnchorZ;
    // Hit-stun overlapped this window → excused. Being slowed to a crawl by
    // landing bullets is suppression, not "stuck": sustained fire otherwise
    // starves this clock and drops the bot into spurious mid-fight Maze
    // episodes (the angled-backward-sprint sightings on Plain Field).
    // Under-fire wedges are Defense's job, on its own 2-tick trigger.
    if (Math.hypot(ddx, ddz) > 3 || (me.lastHitAt ?? 0) > me.botProgressAnchorAt) {
      me.botLastProgressAt = now;
    }
    me.botProgressAnchorX = pos.x;
    me.botProgressAnchorZ = pos.z;
    me.botProgressAnchorAt = now;
  }
  const noProgressTime = now - (me.botLastProgressAt ?? now);

  const avoid = computeBotAvoidance(pos.x, pos.y, pos.z, obstacles, BOT_OBSTACLE_AVOID_RADIUS);
  const avoidMag = Math.hypot(avoid.rx, avoid.rz);
  const obstacleNear = avoidMag > 0.3;

  const myFloorY = groundHeightAt(pos.x, pos.z, surfaces, pos.y - GROUND_BASE_Y);
  const oppFloorY = groundHeightAt(opp.pos.x, opp.pos.z, surfaces, opp.pos.y - GROUND_BASE_Y);
  const onHighGround = myFloorY > BOT_HIGH_GROUND_MIN_Y;

  // HIDE STANCE flag (owner 2026-09-26): read off the host's command entry
  // (the server's side-table matchState.commands[slot]), OR the
  // RELOAD HIDE: a manual reload of BOT_RELOAD_HIDE_MIN_MS or more is spent
  // in the stance — entered the tick the reload starts, left the tick it
  // completes. A command-side unit (a side-table entry exists) carries it as
  // hide + hideAuto so the badge shows and its standing move / lock orders
  // are wiped like any hide; a manual stance or a landed order meanwhile
  // clears hideAuto, and only an auto hide is released when the reload ends
  // (a unit released early stays out for the rest of that reload). Bots
  // without an entry (enemies, classic mode) run the same behaviour off
  // botReloadHide alone.
  const cmdEntry = host.cmd ?? null;
  const rUnit = unit ?? {};
  const reloadHide = rUnit.magCapacity != null && !rUnit.autoReload
    && (rUnit.reloadMs ?? 0) >= BOT_RELOAD_HIDE_MIN_MS
    && (me.reloadingUntil ?? 0) > now;
  if (reloadHide && !me.botReloadHide) {
    me.botReloadHide = true;
    if (cmdEntry && cmdEntry.move && !cmdEntry.hide) {
      // Under a MOVE ORDER (owner 2026-09-26): the reload is spent in a
      // COVER HIDE bound to the order — the order stays and resumes after;
      // no stance, no badge (the lifecycle below starts it). A new order
      // landing mid-reload takes over at once (botReloadCH drops).
      me.botReloadCH = true;
    } else if (cmdEntry && !cmdEntry.hide) {
      cmdEntry.hide = true;
      cmdEntry.hideAuto = true;
      cmdEntry.move = null;
      cmdEntry.lockTargetId = null;
    }
  } else if (!reloadHide && me.botReloadHide) {
    me.botReloadHide = false;
    me.botReloadCH = false;
    if (cmdEntry && cmdEntry.hide && cmdEntry.hideAuto) {
      cmdEntry.hide = false;
      cmdEntry.hideAuto = false;
    }
  }
  const hideOrdered = cmdEntry ? !!cmdEntry.hide : !!me.botReloadHide;
  // COVER HIDE lifecycle (owner 2026-09-26/27 — see the constants note): a
  // long reload on a unit with a standing move order and no Hide stance; a
  // live Defense keeps its frames first, and a no-cover verdict holds the
  // trigger off for a while (the search would only fail again).
  const defenseLive = (me.botState ?? 'pursue') === 'defense' && now < (me.botDefenseUntil ?? 0);
  const chOrder = (!hideOrdered && cmdEntry?.move) ? cmdEntry.move : null;
  if (me.botCH && (!chOrder || defenseLive || chOrder !== me.botCH.order || !reloadHide)) {
    // The order ended or was REPLACED (the new order takes over at once and
    // the rest of the reload is spent on it), Defense owns the frame, or
    // the reload completed.
    if (me.botCH.order !== chOrder && chOrder) me.botReloadCH = false;
    me.botCH = null;
    resetBotHideFields(me);
  }
  const reloadCH = !!(me.botReloadCH && reloadHide);   // read AFTER the end block: a replaced order drops botReloadCH
  if (!me.botCH && chOrder && !defenseLive && now >= (me.botCHNoCoverUntil ?? 0) && reloadCH) {
    me.botCH = {
      startedAt: now,
      order: chOrder,
      reload: true,   // bound to the reload: lasts until it completes
      within: chOrder.phase === 'anchor' ? { x: chOrder.x, z: chOrder.z, r: BOT_CH_AREA_R } : null
    };
    resetBotHideFields(me);
  }
  // Which hide runs this tick: the stance (ordered / reload) or the cover hide.
  const hideMode = sd ? null : (hideOrdered ? 'stance' : (me.botCH ? 'cover' : null));

  // Movement override carried by the hide stance below (the 2026-08-08
  // cover reload's vehicle, kept: the dispatch and the stall-clock pinning
  // key on it).
  let coverMove = null;
  // --- HIDE STANCE (owner 2026-09-26) ---
  // The 2026-08-08 cover reload generalised into a stance: ordered from the
  // card, or entered automatically for a long manual reload (hideOrdered
  // above). While it stands on this unit:
  //   hidden at its tier   -> PACE: keep moving at walk speed on short legs
  //                           that are verified hidden BEFORE they are taken
  //                           (a BOT_HIDE_LEG look-ahead eye test against
  //                           every enemy eye plus the walk rule), on a
  //                           BOT_HIDE_LEASH around the hide anchor, biased
  //                           away from the nearest enemy (owner 2026-09-26:
  //                           a statue "looks awful");
  //   exposure ahead /     -> SLIP: the enemies are watched every tick — an
  //   enemy closing in        eye that would see the unit BOT_HIDE_PREDICT_S
  //                           ahead on its live velocity, or a nearest enemy
  //                           inside BOT_HIDE_CLOSE_DIST closing faster than
  //                           BOT_HIDE_APPROACH_SPEED, triggers a
  //                           findHiddenSpot route to a cell hidden from the
  //                           live AND the predicted eyes (when closing, one
  //                           at least BOT_HIDE_SLIP_GAIN farther from that
  //                           enemy than the unit stands now);
  //   exposed              -> follow / search a findHiddenSpot route to the
  //                           nearest cell no enemy sees, live and predicted
  //                           eyes first, then live only; still none -> the
  //                           plain pursue legs move it while the search
  //                           retries.
  // Firing is untouched: the fire block at the bottom still shoots whatever
  // it can see from where the unit stands — the unit never moves for a
  // shot. Defense never triggers on a hit (state transition below; hit-stun
  // physics still applies); the anti-glint dodge, charge locks and beam
  // channels stay as they are, and the dodge's Defense follow-up owns its
  // frames like any reflex. coverMove carries the hide override (hide:
  // true; dash = the latched sprint on a route).
  // Online budget: per tick <= 2 (position) + 2 (predicted eyes) + 2 (route
  // goal) + 2 (current leg) LoS tests and one walk-rule segment test; a leg
  // re-pick every BOT_HIDE_DRIFT_MS costs 8 headings x (walk test + <= 4
  // LoS); searches keep the BOT_HIDE_SEARCH_MS cadence, run ONE attempt per
  // tick (the fallback tiers follow on the next ticks) and at most one per
  // tick per match (matchState.hideSearchTick). Mirrored in client
  // updateEnemy (fields eState.botHide*).
  if (!hideMode) {
    if (me.botHideHold != null) {
      // Stance cleared (or the cover hide ended): null every hide field so
      // the normal brain resumes from a clean slate.
      resetBotHideFields(me);
    }
  } else if (!defenseLive) {
    // (A live Defense here can only be the anti-glint dodge's 520 ms
    // follow-up sprint — it keeps its frames; the hide resumes after.)
    // Nearest first: eyes[0] is the threat the pacing steers away from.
    const hideEnemies = enemies.slice().sort((a, b) =>
      Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) - Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z));
    // Enemy eyes stay LIVE (the existing convention — a jumping human must
    // still count); the unit's own eye is the grounded latch (myEyeY).
    const hideEyes = hideEnemies.map((f) => ({ x: f.pos.x, y: f.pos.y + eyeUp, z: f.pos.z }));
    // Predicted eyes: where each enemy will be BOT_HIDE_PREDICT_S ahead on
    // its live velocity; a near-still enemy adds none (saves the tests).
    const hidePredEyes = [];
    for (let k = 0; k < hideEnemies.length; k += 1) {
      const f = hideEnemies[k];
      const vx = f.vel?.x ?? 0, vz = f.vel?.z ?? 0;
      if (Math.hypot(vx, vz) > BOT_HIDE_PREDICT_MIN_SPEED) {
        hidePredEyes.push({
          x: f.pos.x + vx * BOT_HIDE_PREDICT_S, y: f.pos.y + eyeUp, z: f.pos.z + vz * BOT_HIDE_PREDICT_S
        });
      }
    }
    const hideMyEye = { x: pos.x, y: myEyeY, z: pos.z };
    // Position test (<= 2 LoS tests): nearest eye first, early exit on the
    // first eye that sees the unit.
    let hiddenAll = true;
    for (let k = 0; k < hideEyes.length; k += 1) {
      const seen = botHasLineOfSight(hideEyes[k], hideMyEye, obstacles, surfaces);
      if (seen) { hiddenAll = false; break; }
    }
    // Only cover from BOTH enemies counts (owner 2026-09-27: the nearest-
    // enemy-only tier is gone for the stance too — hidden from one enemy
    // while the other shoots a walking target measured worse than Defense).
    // Exposed to either with no such spot: the pursue legs and Defense on a
    // hit, re-searching every BOT_HIDE_FAIL_RETRY_MS until one appears.
    const hideTier = hiddenAll ? 'all' : null;
    if (hideTier) me.botHideNoCover = false;   // standing hidden = cover exists
    // Threat read: the nearest enemy, the unit's bearing away from it and
    // whether it is closing in.
    const threat = hideEnemies[0] ?? null;
    let threatDist = Infinity, awayX = 0, awayZ = 0, closing = false;
    if (threat) {
      const dx = pos.x - threat.pos.x, dz = pos.z - threat.pos.z;
      threatDist = Math.hypot(dx, dz) || 1;
      awayX = dx / threatDist;
      awayZ = dz / threatDist;
      const closingSpeed = (threat.vel?.x ?? 0) * awayX + (threat.vel?.z ?? 0) * awayZ;
      closing = threatDist < BOT_HIDE_CLOSE_DIST && closingSpeed > BOT_HIDE_APPROACH_SPEED;
    }
    // Exposure ahead (<= 2 LoS tests, only while hidden from all): would a
    // predicted eye see the unit where it stands?
    let exposedSoon = false;
    if (hiddenAll) {
      for (let k = 0; k < hidePredEyes.length; k += 1) {
        if (botHasLineOfSight(hidePredEyes[k], hideMyEye, obstacles, surfaces)) { exposedSoon = true; break; }
      }
    }
    // Is a route goal still hidden from the live eyes?
    const hideGoalStillHidden = (goal) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + eyeUp, z: goal.z };
      for (let k = 0; k < hideEyes.length; k += 1) {
        if (botHasLineOfSight(hideEyes[k], gEye, obstacles, surfaces)) return false;
      }
      return true;
    };
    const hideDropPath = () => {
      me.botHidePath = null;
      me.botHidePathIdx = null;
      me.botHideGoal = null;
      me.botHideMoveAnchor = null;
    };
    // 1. Route bookkeeping: arrived -> drop it and re-anchor the pacing
    //    there; goal exposed by a moving enemy -> drop it (a fresh search
    //    follows on the cadence).
    if (me.botHidePath) {
      const goal = me.botHideGoal;
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 2) {
        hideDropPath();
        me.botHideAnchor = null;
      } else if (!hideGoalStillHidden(goal)) {
        hideDropPath();
      }
    }
    // 2. Searches. The attempt list depends on the situation; exactly ONE
    //    attempt runs per tick (the next tier follows next tick) so a
    //    search never costs more than one Dijkstra in a tick.
    const hideAttempts = [];
    if (!hiddenAll) {
      if (hidePredEyes.length) hideAttempts.push({ eyes: hideEyes.concat(hidePredEyes), tier: 'all', minDistFrom: null });
      hideAttempts.push({ eyes: hideEyes, tier: 'all', minDistFrom: null });
    }
    if (!hiddenAll && hideMode === 'cover' && me.botCH.within) {
      // COVER HIDE first tier: cover inside the order's area, ahead of the
      // unrestricted tiers.
      const w = me.botCH.within;
      const inArea = [];
      if (hidePredEyes.length) inArea.push({ eyes: hideEyes.concat(hidePredEyes), tier: 'all', minDistFrom: null, within: w });
      inArea.push({ eyes: hideEyes, tier: 'all', minDistFrom: null, within: w });
      hideAttempts.unshift(...inArea);
    }
    if (hiddenAll && (exposedSoon || closing)) {
      const eyes = hideEyes.concat(hidePredEyes);
      hideAttempts.push({
        eyes, tier: 'all',
        minDistFrom: closing ? { x: threat.pos.x, z: threat.pos.z, d: threatDist + BOT_HIDE_SLIP_GAIN } : null
      });
      if (closing && exposedSoon) hideAttempts.push({ eyes, tier: 'all', minDistFrom: null });
    }
    if (hideAttempts.length
        && !me.botHidePath
        && now >= (me.botHideSearchAt ?? 0)
        && host.searchSlot()) {
      const stage = Math.min(me.botHideSearchStage ?? 0, hideAttempts.length - 1);
      const attempt = hideAttempts[stage];
      const found = findHiddenSpot(
        grid, pos.x, pos.z, myFloorY, attempt.eyes, obstacles,
        { maxPops: BOT_HIDE_MAX_POPS, minDistFrom: attempt.minDistFrom, within: attempt.within ?? null, goalShoulder: BOT_HIDE_SHOULDER, deadline: host.deadline() }
      );
      if (found) {
        me.botHideNoCover = false;
        me.botHidePath = found.path;
        me.botHidePathIdx = 0;
        me.botHideGoal = found.goal;
        me.botHideTier = attempt.tier;
        me.botHideMoveAnchor = null;
        me.botHideSearchStage = 0;
        me.botHideSearchAt = now + BOT_HIDE_SEARCH_MS;
      } else if (stage < hideAttempts.length - 1) {
        me.botHideSearchStage = stage + 1;   // next tier next tick
        me.botHideSearchAt = now;
      } else {
        me.botHideSearchStage = 0;
        if (hideTier) {
          // Hidden at some tier: keep probing on the cadence (the enemies
          // move — the scan stays dynamic).
          me.botHideSearchAt = now + BOT_HIDE_SEARCH_MS;
        } else {
          // Exposed and NOTHING anywhere within the budget: no cover. Until a
          // later search finds one, a fresh hit runs the plain Defense escape
          // (owner 2026-09-26; the transition below reads the flag).
          me.botHideNoCover = true;
          me.botHideFailedAt = now;
          me.botHideSearchAt = now + BOT_HIDE_FAIL_RETRY_MS;
        }
      }
    }
    // 3. Legs.
    if (me.botHidePath) {
      // Route follow — the cover-reload follower's recipe: advance within
      // 2 u, avoidance blend, 700 ms no-progress bail.
      const hp = me.botHidePath;
      let wp = hp[me.botHidePathIdx];
      while (me.botHidePathIdx < hp.length - 1
          && Math.hypot(wp.x - pos.x, wp.z - pos.z) < 2) {
        me.botHidePathIdx += 1;
        wp = hp[me.botHidePathIdx];
      }
      let tx = wp.x - pos.x, tz = wp.z - pos.z;
      const wl = Math.hypot(tx, tz) || 1;
      tx = tx / wl + avoid.rx * 0.6;
      tz = tz / wl + avoid.rz * 0.6;
      const tl = Math.hypot(tx, tz) || 1;
      // Latched sprint (owner 2026-09-26): arm above CMD_TRAVEL_BOOST_FLOOR
      // (50), spend down to BOT_SPRINT_MIN_BOOST (8), walk until re-armed.
      // The dispatch funds it at the 8 floor (its own tier below).
      if (me.botHideDashArmed) {
        if (me.boost <= BOT_SPRINT_MIN_BOOST) me.botHideDashArmed = false;
      } else if (me.boost > CMD_TRAVEL_BOOST_FLOOR) {
        me.botHideDashArmed = true;
      }
      me.botHideHold = false;
      // The COVER HIDE sprints like Defense: no arming, the 8 floor only.
      coverMove = { hold: false, hide: true, dash: hideMode === 'cover' ? true : !!me.botHideDashArmed, mx: tx / tl, mz: tz / tl };
      if (!me.botHideMoveAnchor
          || Math.hypot(pos.x - me.botHideMoveAnchor.x, pos.z - me.botHideMoveAnchor.z) > 1) {
        me.botHideMoveAnchor = { x: pos.x, z: pos.z, at: now };
      } else if (now - me.botHideMoveAnchor.at > BOT_HIDE_BAIL_MS) {
        // No progress: drop the route, retry the search shortly; until then
        // the plain legs below move the unit.
        hideDropPath();
        me.botHideFailedAt = now;
        me.botHideSearchAt = now + BOT_HIDE_BAIL_RETRY_MS;
        coverMove = null;
      }
    } else if (hideTier) {
      // PACE the cover. A leg is a BOT_HIDE_LEG step that must (a) stay on
      // the leash, (b) be walkable and (c) keep the unit's eye hidden from
      // every eye — the predicted eyes too when possible (pass 0), live
      // eyes only as the fallback (pass 1). The current leg is
      // re-checked against the live eyes every tick and re-picked at
      // BOT_HIDE_DRIFT_MS: 8 headings from a random phase, scored away from
      // the nearest enemy with a little continuity and noise so the pacing
      // reads as a person, not a metronome. No hidden leg at all (a tight
      // nook) -> stand for BOT_HIDE_DRIFT_RETRY_MS, then try again.
      if (!me.botHideAnchor) me.botHideAnchor = { x: pos.x, z: pos.z };
      const anchor = me.botHideAnchor;
      const legOk = (hx, hz, strict) => {
        const lx = pos.x + hx * BOT_HIDE_LEG, lz = pos.z + hz * BOT_HIDE_LEG;
        if (Math.hypot(lx - anchor.x, lz - anchor.z) > BOT_HIDE_LEASH) return false;
        if (walkSegmentBlocked(pos.x, pos.z, lx, lz, pos.y, obstacles)) return false;
        const eye = { x: lx, y: myEyeY, z: lz };
        for (let k = 0; k < hideEyes.length; k += 1) if (botHasLineOfSight(hideEyes[k], eye, obstacles, surfaces)) return false;
        if (strict) for (let k = 0; k < hidePredEyes.length; k += 1) if (botHasLineOfSight(hidePredEyes[k], eye, obstacles, surfaces)) return false;
        return true;
      };
      let hx = me.botHideDriftX ?? 0, hz = me.botHideDriftZ ?? 0;
      const moving = hx !== 0 || hz !== 0;
      if (!moving || now >= (me.botHideDriftUntil ?? 0) || !legOk(hx, hz, false)) {
        let best = null, bestScore = -Infinity;
        const phase = Math.random() * Math.PI * 2;
        for (let pass = 0; pass < 2 && !best; pass += 1) {
          for (let k = 0; k < 8; k += 1) {
            const a = phase + k * Math.PI / 4;
            const cx = Math.cos(a), cz = Math.sin(a);
            if (!legOk(cx, cz, pass === 0)) continue;
            const score = (cx * awayX + cz * awayZ) + 0.5 * (cx * hx + cz * hz) + (Math.random() - 0.5) * 0.8;
            if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
          }
        }
        if (best) {
          hx = best.x; hz = best.z;
          me.botHideDriftUntil = now + BOT_HIDE_DRIFT_MS;
        } else {
          hx = 0; hz = 0;
          me.botHideDriftUntil = now + BOT_HIDE_DRIFT_RETRY_MS;
        }
        me.botHideDriftX = hx;
        me.botHideDriftZ = hz;
      }
      me.botHideHold = true;
      me.botHideTier = hideTier;
      if (hx === 0 && hz === 0) {
        me.momentumVX = 0;
        me.momentumVZ = 0;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      } else {
        coverMove = { hold: false, hide: true, dash: false, mx: hx, mz: hz };
      }
    } else {
      // Exposed with nothing to walk (search not due / nothing found): the
      // plain pursue legs below keep the unit moving while the search
      // retries — a statue in the open is the worst of both.
      me.botHideHold = false;
      me.botHideTier = null;
      me.botHideAnchor = null;
    }
    if (hideMode === 'cover') {
      // COVER HIDE end: no cover anywhere -> give the reload up (the order's
      // legs resume; a fresh hit then runs Defense as usual) and hold the
      // trigger off for the retry window. Otherwise the hide ends with its
      // reload (lifecycle above).
      if (me.botHideNoCover) {
        me.botCH = null;
        me.botCHNoCoverUntil = now + BOT_HIDE_FAIL_RETRY_MS;
        resetBotHideFields(me);
        me.botHideNoCover = true;   // keeps this tick's transition on Defense
        coverMove = null;
      }
    }
  }
  // ===== SUDDEN DEATH BRAIN (see sdbrain.js — one module, both hosts) =====
  // Its host is this host: the same body, enemies, arena and actions; the
  // fire block below reads `sd` too.
  if (sd && !defenseLive) {
    coverMove = sdBrainTick({
      now, SD: sd, me, pos, unit, vel, grounded,
      wall: host.wall,   // (physics' note from the last tick: the face the body was pushed out of)
      opp, enemies,
      obstacles, grid, clear: host.clear,
      eyeUp: muzzleUp, muzzleH: muzzleUp,
      dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag, playerHasLoS,
      groundHeightAt: (x, z, fallback) => groundHeightAt(x, z, surfaces, fallback),
      startStep: host.startStep,
      startJump: host.startJump,
      searchSlot: host.searchSlot,
      deadline: host.deadline,
      tape: host.tape ?? null
    });
  } else if (sd) {
    me.botSDState = 'dodge';
  }

  if (coverMove) {
    // Pin the stall clocks: a deliberate hide (cover reload OR the hide
    // order) must not read as wedged / stalled / sightless — those
    // detectors' remedies all route toward SIGHTED cells and would fight
    // the cover intent on exit.
    me.botLastProgressAt = now;
    me.botLastLoSAt = now;
    me.botStuckCheckX = pos.x;
    me.botStuckCheckZ = pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  }

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
    + Math.hypot(pos.x - (me.botPrevX ?? pos.x), pos.z - (me.botPrevZ ?? pos.z));
  me.botPrevX = pos.x;
  me.botPrevZ = pos.z;
  if (me.botStuckCheckAt == null) {
    me.botStuckCheckX = pos.x;
    me.botStuckCheckZ = pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  } else if (now - me.botStuckCheckAt >= 1000) {   // 1.5 s -> 1 s (2026-08-05 trim)
    const windowStale = now - me.botStuckCheckAt > 1700;
    const net = Math.hypot(pos.x - me.botStuckCheckX, pos.z - me.botStuckCheckZ);
    // Thresholds scaled 2/3 with the window (1.5 s -> 1 s) so the per-second
    // movement rates that count as wedged/spinning are unchanged.
    // WEDGED's path cap was 4 until 2026-08-08: a bot SLIDING along a wall
    // travelled 4–12 u/s while netting nothing, which was too fast for
    // wedged and too slow for spinning — 47% of Airport's ramp-corner
    // grinds fell in that gap with no detector to free them. Raising the
    // cap to spinning's 12 makes the pair partition the space: net < 1.7
    // is stuck no matter how much wall it rubbed.
    const wedged = net < 1.7 && me.botPathLen < 12;
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
      // STUCK MEMORY (revived 2026-08-08 with the Maze slim-down): remember
      // the pinned spot so the maze fallback's retries bend away from it.
      me.botStuckMemX = pos.x;
      me.botStuckMemZ = pos.z;
      me.botStuckMemAt = now;
    }
    me.botStuckCheckX = pos.x;
    me.botStuckCheckZ = pos.z;
    me.botStuckCheckAt = now;
    me.botPathLen = 0;
  }

  // (Heuristic stack RETIRED 2026-08-08, user-ordered: the committed
  // wall-follow, the opening scan, and the ramp-seeker are gone — the
  // pathfinder owns Maze outright. No-route ticks run the minimal fallback
  // in the maze movement leg, paced by the stall detectors and bent away
  // from the last pinned spot by the revived stuck-memory repulsion.)

  // NAV PLAN — the universal pathfinder. Ask the grid for a real walk route
  // to the target; Maze follows it waypoint by waypoint. Returns false when
  // no walk route exists (target on a jump-only platform, degenerate snap) —
  // the minimal fallback in the maze movement leg covers those ticks until
  // the detectors re-fire. Paths live where the host keeps them (navGet /
  // navSet — the server keeps them off the fighter, which is serialized
  // into every snapshot).
  // FIRING-POSITION TRUNCATION — the raw path ends at the player's FEET.
  // Walk it (6-unit samples) and cut it at the first spot that already SEES
  // the player from inside the band's upper edge: the bot travels to a
  // FIRING POSITION, never to the player. Without this, a blind approach
  // rode the path until sight happened to open — often point-blank on
  // cover-heavy maps — before range discipline could act (the "runs at me
  // at match start" report). Nothing qualifies → keep the full path (some
  // fights genuinely require getting close before any sight exists).
  const truncateAtFiringPoint = (path) => {
    let prev = { x: pos.x, z: pos.z };
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
          { x: px, y: fy + GROUND_BASE_Y + eyeUp, z: pz },
          { x: opp.pos.x, y: opp.pos.y + eyeUp, z: opp.pos.z },
          obstacles, surfaces
        )) {
          const cut = path.slice(0, i);
          // Carry the sample's floor: smoothPath's same-floor gate reads
          // (y ?? 0), so a y-less cut point on a deck froze the final leg
          // out of smoothing (review 2026-08-13).
          cut.push({ x: px, z: pz, y: fy });
          return cut;
        }
      }
      prev = seg;
    }
    return path;
  };
  const navPlan = () => {
    // FIRST CHOICE: walk to a FIRING POSITION — the nearest reachable spot
    // that already sees the target from inside the band. This is what makes
    // a sniper cross the map to a sniping lane instead of to the enemy.
    // FALLBACK: path to the target itself, cut at the first sighted sample
    // (some pockets have no in-band sight anywhere — then getting close is
    // genuinely the only option, and the exit gates take over from there).
    let path = findFiringPath(
      grid, pos.x, pos.z, myFloorY,
      opp.pos.x, opp.pos.z, opp.pos.y + eyeUp,
      lowerRange, upperRange, obstacles, oppFloorY
    );
    if (!path || path.length < 2) {
      path = findPathOnGrid(
        grid, pos.x, pos.z, opp.pos.x, opp.pos.z, myFloorY, oppFloorY, obstacles
      );
      if (path && path.length > 1) path = truncateAtFiringPoint(path);
    }
    // Diagonal legs where the swept corridor proves them safe (see
    // smoothPath's header note).
    if (path && path.length > 2) path = smoothPath(grid, path, obstacles);
    if (path && path.length > 1) {
      // idx 0: walk to the pinned start square first — beelining to square
      // #2 from an off-grid position can clip the corner between them.
      host.navSet({ path, idx: 0, gx: opp.pos.x, gz: opp.pos.z, at: now });
      me.botMazeLosBlockedAtEntry = !playerHasLoS;
      return true;
    }
    host.navSet(null);
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

  // HIDE (stance or cover hide, owner 2026-09-26): the brain is parked on
  // 'pursue' — a fresh hit never enters Defense (hit-stun physics still
  // applies; the unit fires back from where it stands), and no Maze/Engage
  // transition runs while the hide block owns the legs (a Maze entry would
  // burn a firing-position plan the hide would never follow, and its exit
  // would route the unit back into sight). Two exceptions: a Defense already
  // live (the anti-glint dodge's follow-up) runs its grace out first, and
  // when NO cover exists anywhere (botHideNoCover) a fresh hit runs the
  // plain Defense escape until a later search finds cover.
  const hideParks = hideMode != null && !(me.botHideNoCover && underFire);
  // SD brain owning the legs this tick: same parking as a hide.
  const sdParks = !!(sd && coverMove);
  if ((hideParks || sdParks) && !inDefenseGrace) {
    nextState = 'pursue';
  } else if (underFire || inDefenseGrace) {
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

  // Maze re-commit: a stuck signal mid-Maze, or 7 s on one heading, re-plans
  // the route from the CURRENT position — Maze doesn't give up, it retries
  // the pathfinder (heuristic stack retired 2026-08-08; the stall detectors
  // pace the retries, and the stuck-memory bias in the fallback leg keeps
  // them from re-treading the pinned spot).
  const escapeDue = me.botMazeEscapeUntil != null && now >= me.botMazeEscapeUntil;
  if (nextState === 'maze' && prevState === 'maze'
      && (stuckTriggered || escapeDue || (now - (me.botStateEnteredAt ?? now)) > 7000)) {
    if (escapeDue) me.botMazeEscapeUntil = null;
    me.botStateEnteredAt = now;
    // STATUE ESCAPE (kept): a FROZEN bot is body-pinched in a corner pocket
    // the zero-width pin test can't see (the ramp-top notch against
    // Airport's rim glass) — the planner then re-issues the identical line
    // every 1.5 s forever. If the fresh plan below starts at the very
    // waypoint it froze against, treat it as NO ROUTE: back out along the
    // stored escape heading for a beat, then replan from the freed spot.
    // Deliberately statue-only (zero net movement): bots that still move
    // never take the back-out, so live routing gains no back-and-forth.
    const navPrev = host.navGet();
    const frozenWp = stuckFrozen && navPrev ? navPrev.path[navPrev.idx] : null;
    let planned = navPlan();
    if (planned && frozenWp) {
      const fresh = host.navGet();
      // The follower's own advance rule: the waypoint it would steer to.
      let fi = fresh.idx;
      while (fi < fresh.path.length - 1
          && Math.hypot(fresh.path[fi].x - pos.x, fresh.path[fi].z - pos.z) < BOT_WAYPOINT_ADVANCE_RADIUS) fi += 1;
      const firstWp = fresh.path[fi];
      // Match against EVERY remaining waypoint of the frozen route, not just
      // the indexed steer-to: smoothPath's greedy anchors are start/goal-
      // dependent, so a re-plan from the same frozen spot can re-issue the
      // same line under a different first anchor — single-index matching
      // dropped mid-leg statue detection ~20pp and a moving target could
      // dodge it every re-commit (review 2026-08-13). Waypoints are unmoved
      // cell centres in both paths, so the 0.5 equality stays exact; the
      // trigger only fires on stuckFrozen bots, where backing out of ANY
      // retraced line is the right call.
      const retraced = navPrev.path.slice(navPrev.idx).some((w) =>
        Math.abs(firstWp.x - w.x) < 0.5 && Math.abs(firstWp.z - w.z) < 0.5);
      if (retraced) {
        host.navSet(null);
        planned = false;
        me.botMazeEscapeUntil = now + 800;
        const edx = pos.x - frozenWp.x, edz = pos.z - frozenWp.z;
        const edl = Math.hypot(edx, edz);
        me.botMazeEscapeDirX = edl > 0.05 ? edx / edl : -dirX;
        me.botMazeEscapeDirZ = edl > 0.05 ? edz / edl : -dirZ;
      }
    }
    if (!planned && stuckTriggered && me.botMazeEscapeUntil == null) {
      // No route AND still stuck: back out for a beat before the next retry —
      // the fallback's forward lean alone would press straight back into the
      // same wall between detector firings. Heading: AWAY from the pinning
      // wall (the avoidance vector points off the nearest obstacle face);
      // reverse of the target line as the tiebreak. (The stuck-memory spot
      // is stamped to the CURRENT position this same tick, so "away from
      // memory" would always be degenerate here — audit finding 2026-08-08.)
      me.botMazeEscapeUntil = now + 500;
      const mdl = Math.hypot(avoid.rx, avoid.rz);
      me.botMazeEscapeDirX = mdl > 0.05 ? avoid.rx / mdl : -dirX;
      me.botMazeEscapeDirZ = mdl > 0.05 ? avoid.rz / mdl : -dirZ;
    }
  }

  // --- State entry: commit per-state directions and timers ---
  if (nextState !== prevState) {
    me.botState = nextState;
    me.botStateEnteredAt = now;

    if (nextState === 'maze') {
      me.botMazeEscapeUntil = null;
      // Pathfinder only (heuristics retired): no route → the minimal
      // fallback movement covers the ticks until the detectors re-fire.
      // The LoS-at-entry record must still be stamped for the exit gate.
      if (!navPlan()) me.botMazeLosBlockedAtEntry = !playerHasLoS;
    }

    if (nextState === 'engage'
        && (prevState === 'pursue' || prevState === 'maze' || prevState === 'defense' || me.botOrbitSign == null)) {
      // Orbit direction by SIGHT PROBE, not coin flip: from ~12 units along
      // each orbit tangent, which way keeps the player visible? The blind
      // coin flip walked the bot out of hard-won sight windows half the
      // time (the plateau-edge pacing). Ties fall back to random.
      const losCw = losFromPoint(pos.x + sideX * 12, pos.z + sideZ * 12);
      const losCcw = losFromPoint(pos.x - sideX * 12, pos.z - sideZ * 12);
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
      me.botStuckCheckX = pos.x;
      me.botStuckCheckZ = pos.z;
      me.botStuckCheckAt = now;
      me.botPathLen = 0;
    }
  }

  // (Hide order: a hit never extends the glint dodge's Defense follow-up —
  // sustained fire must not keep the unit sprinting out of its hide.)
  if (me.botState === 'defense' && underFire && !hideParks) {
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

  if (coverMove) {
    // The HIDE stance owns movement for the tick — the state branches below
    // (including their jump commands) don't run, so a maze path can't vault
    // the bot mid-hide. Never active during a live Defense (the hide block
    // yields those frames).
    // HIDE ORDER (hide: true): pacing legs and routes walk (routes sprint
    // only while the 50/8 latch is armed — dash); a hold (no hidden leg at
    // all) is mx = mz = 0 and skips the anti-freeze nudge below.
    mx = coverMove.mx;
    mz = coverMove.mz;
    wantSprint = coverMove.hide ? !!coverMove.dash : !coverMove.hold;
    // (SD jump-link vault: the jump was started in the SD block; the dispatch
    // below sets the launch velocity and the air steer toward the ledge)
    if (coverMove.jump) { jumpThisTick = true; jumpDirX = coverMove.jx; jumpDirZ = coverMove.jz; }
  } else if (botS === 'pursue') {
    // Pursue handles BOTH sides of the band: toward the player when too far,
    // AWAY from them when too close. Without the negative branch the bot just
    // keeps closing through lowerRange and collides at zero distance.
    // VERTICAL STACK (2026-08-14, user: "bot lingers when the enemy is right
    // below/above them"). `dist` is horizontal, so an enemy a floor above
    // reads as distance ~0 and range discipline walks the bot AWAY — then
    // back in once it re-enters the band, forever (measured: a direction
    // reversal every ~0.4 s, no net progress). Backing off does nothing
    // about a vertical gap, so suppress the retreat and let the router (now
    // multi-layer) take the bot to the other level.
    const stackedVertically = Math.abs(oppFloorY - myFloorY) > 2.5;
    const tooClose = dist < lowerRange && !stackedVertically;
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
    // TRAVEL SPRINT LATCH (owner 2026-09-29): a leg arms only from a full tank
    // (BOT_BOOST_RESERVE) and runs down to BOT_TRAVEL_SPRINT_FLOOR, then the
    // bot walks until the tank is full again. Both bounds used to sit on the
    // one 250 knob: in Pursue the release won at exactly 250 (no sprint at
    // all), in Maze the dispatch floor let one dash tick through every half
    // second — the flickering sprint pose. Shared with Maze below.
    wantSprint = botTravelSprint(me);
    // Elevation aids close the gap; skip them when we're trying to back off.
    if (!tooClose && grounded && !me.airborne) {
      // Climb aid: only for a step a jump can actually clear. Above that the
      // router owns it — and the aid was unreachable dead code until the
      // vertical-stack fix above (it needs dist < 32 while tooClose held for
      // every dist below lowerRange >= 33, i.e. 0 of 18 units could run it).
      if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF
          && oppFloorY - myFloorY <= BOT_CLIMB_MAX_RISE
          && dist < 32 && Math.random() > 0.5) {
        if (botTryJump(host)) jumpThisTick = true;
      } else if (onHighGround) {
        const exit = findDescentDirection(pos.x, pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (botTryJump(host)) jumpThisTick = true;
        }
      } else {
        // Low ground: take any reachable platform — no "toward player" gate,
        // since on maps like Station the raised decks are the strong positions
        // and we'd rather be up there than on the tracks. The jump cooldown
        // rate-limits this; no strict random gate needed.
        const perch = findHighGroundPerch(pos.x, pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botTryJump(host)) jumpThisTick = true;
        }
      }
    }
  } else if (botS === 'maze') {
    let nav = host.navGet();
    // ARRIVED / NOTHING-TO-DO-HERE: sighted inside the sweet spot. A path
    // whose goal is meaningfully CLOSER to the player is an approach — done,
    // drop it. A pathless maze has nothing sane to do here
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
        if (nav) host.navSet(null);
        nav = null;
        me.botStateEnteredAt = now - 3001;
      }
    }
    // FINAL-WAYPOINT ARRIVAL: destination reached but the maze hasn't
    // exited yet (e.g. sighted-entry cap still counting). Drop the path
    // rather than stand on it — a standing bot re-arms the no-progress
    // trigger every 2 s, which keeps re-selecting maze and STARVES the
    // exit branch forever (the Plain Field never-orbits bug). The minimal
    // fallback covers the remaining ticks until the exit fires.
    if (nav && nav.path.length > 0) {
      const lastWp = nav.path[nav.path.length - 1];
      if (Math.hypot(lastWp.x - pos.x, lastWp.z - pos.z) < 3) {
        // Arrived — but if the trip did NOT buy sight of the target, dropping
        // to the pathless fallback sends the bot beelining back where it came
        // from (the Streets under-bridge out-and-back loop). Ask for a fresh
        // route first and take it when it aims somewhere NEW; only fall back
        // when the planner has nothing better, which keeps the original
        // "never stand on a consumed path" property.
        let replaced = false;
        if (!playerHasLoS) {
          navPlan();
          const fresh = host.navGet();
          const freshLast = fresh && fresh.path[fresh.path.length - 1];
          if (freshLast && Math.hypot(freshLast.x - lastWp.x, freshLast.z - lastWp.z) > 0.5) {
            nav = fresh;
            replaced = true;
          }
        }
        if (!replaced) {
          host.navSet(null);
          nav = null;
        }
      }
    }
    if (nav && nav.path && nav.idx < nav.path.length) {
      // PATH FOLLOW — the universal pathfinder owns Maze whenever a route
      // exists. Head for the current waypoint, advance within
      // BOT_WAYPOINT_ADVANCE_RADIUS (see its note — 1.5, tight on purpose so
      // corners are not cut into obstacle end faces), and refresh the route
      // (rate-limited) when the target wanders off the planned goal.
      // Avoidance stays blended in for dynamic wiggle room.
      let wp = nav.path[nav.idx];
      while (nav.idx < nav.path.length - 1
          && Math.hypot(wp.x - pos.x, wp.z - pos.z) < BOT_WAYPOINT_ADVANCE_RADIUS) {
        nav.idx += 1;
        wp = nav.path[nav.idx];
      }
      if (now - nav.at > 1000
          && Math.hypot(opp.pos.x - nav.gx, opp.pos.z - nav.gz) > 12) {
        navPlan();
        const fresh = host.navGet();
        if (fresh && fresh.path[fresh.idx]) wp = fresh.path[fresh.idx];
      }
      // JUMP-LINK crossing: the path reaches the upcoming waypoint by a jump
      // link (flagged `jump`: a ledge above the bot's floor, a walk-island
      // bridged, e.g. Station's platforms) — vault toward it once close
      // enough. A slope or a kerb's ramp the body walks is a walk edge and
      // flagged nothing: no vault (b1021s). Downward crossings need nothing:
      // the bot just walks off the ledge.
      if (wp.jump
          && grounded && !me.airborne
          && Math.hypot(wp.x - pos.x, wp.z - pos.z) < 7) {
        const jdx = wp.x - pos.x, jdz = wp.z - pos.z;
        const jln = Math.hypot(jdx, jdz) || 1;
        jumpDirX = jdx / jln;
        jumpDirZ = jdz / jln;
        if (botTryJump(host)) jumpThisTick = true;
      }
      let tx = wp.x - pos.x, tz = wp.z - pos.z;
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
        if (nav.path[k].jump) { jumpAhead = true; break; }
      }
      // Bank target: the strategic reserve already exceeds jump cost + pad
      // at current tuning; the Math.max keeps the old jump-funding guarantee
      // if the reserve is ever tuned below it.
      const jumpBank = Math.max(BOT_TRAVEL_SPRINT_FLOOR, (unit?.jumpBoostCost ?? 48) + 10);
      wantSprint = botTravelSprint(me) && !(jumpAhead && me.boost < jumpBank);
    } else if (me.botMazeEscapeUntil != null && now < me.botMazeEscapeUntil) {
      // STATUE BACK-OUT (no route, escape armed): reverse along the stored
      // escape heading to free the body, then the next re-commit replans
      // from the freed spot.
      let tx = (me.botMazeEscapeDirX ?? -dirX) + avoid.rx * 0.3;
      let tz = (me.botMazeEscapeDirZ ?? -dirZ) + avoid.rz * 0.3;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      wantSprint = false;
    } else {
      // MINIMAL FALLBACK (no route exists — rare with the full nav grid):
      // pursue-style steering toward the player with avoidance, bent by the
      // revived STUCK-MEMORY repulsion so each detector-paced retry leans
      // away from the last pinned spot instead of re-treading it. The
      // detectors keep polling; the next stuck/7 s signal replans.
      let tx = dirX + avoid.rx * 0.8;
      let tz = dirZ + avoid.rz * 0.8;
      if (me.botStuckMemAt != null && now - me.botStuckMemAt < BOT_STUCK_MEMORY_MS) {
        const rep = computeStuckRepulsion(
          pos.x, pos.z, me.botStuckMemX, me.botStuckMemZ, BOT_STUCK_MEMORY_RADIUS);
        tx += rep.rx * BOT_STUCK_MEMORY_WEIGHT;
        tz += rep.rz * BOT_STUCK_MEMORY_WEIGHT;
      }
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      wantSprint = botTravelSprint(me);
    }
    // minWidth 0 here ONLY (2026-08-10). Maze is walking a route, so a strip
    // too thin to be a vantage point is still a legitimate thing to climb —
    // the width floor added in 367a87b applied everywhere and doubled Factory
    // belt crossings from 2.6 s to 5.3 s. Measured on the reversal breakdown:
    // of 21 crossings-and-straight-back, 76% happened in Defense and only 10%
    // in Maze, so the floor is worth keeping exactly where the bouncing is and
    // dropping exactly where the routing is.
    if (grounded && !me.airborne) {
      const perch = findHighGroundPerch(pos.x, pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS, 0);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botTryJump(host)) jumpThisTick = true;
      }
    }
  } else if (botS === 'engage') {
    // Mid-orbit sight keeping: if the next ~12 units along the orbit lose
    // sight while the other way keeps it, flip once (1 s cooldown so
    // opposing probes can't jitter it). Engage patrols INSIDE the sight
    // window it was handed instead of blindly strolling out of it.
    if (playerHasLoS && now >= (me.botOrbitFlipAt ?? 0)) {
      const sgn = me.botOrbitSign ?? 1;
      if (!losFromPoint(pos.x + sideX * sgn * 12, pos.z + sideZ * sgn * 12)
          && losFromPoint(pos.x - sideX * sgn * 12, pos.z - sideZ * sgn * 12)) {
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

    // WEDGE REVERSE (2026-08-08, user-ordered — Defense's first recovery
    // stage, ported): two consecutive ticks of driving INTO a wall flips the
    // orbit. The tangent is perpendicular to the aim line, so reversing it
    // points away from the face just hit BY CONSTRUCTION — no need to know
    // which wall it is. Without this the bot stuck to the wall at ~6% of
    // walk speed until the 1 s wedge detector shipped it to Maze, which
    // breaks off the fight entirely (10% of engage time was spent that way).
    // Deliberately stage ONE only: measured on Defense, the reverse alone
    // clears >70% of wedges, while its stage-2 wall-slide bails almost as
    // often as it fires (92 slides, 91 bails). The LoS flip's 1 s cooldown
    // is NOT consulted — a bot pressed into a wall can't wait a second —
    // but firing here re-arms it so the two can't fight over the same tick.
    const engageIntoWall = (mx * avoid.rx + mz * avoid.rz) < -0.4 && avoidMag > 0.4;
    me.botEngageWallTicks = engageIntoWall ? (me.botEngageWallTicks ?? 0) + 1 : 0;
    if (me.botEngageWallTicks >= 2) {
      me.botEngageWallTicks = 0;
      me.botOrbitSign = -sign;
      me.botOrbitFlipAt = now + 1000;
      let rx = sideX * me.botOrbitSign + dirX * pull + avoid.rx * 0.6;
      let rz = sideZ * me.botOrbitSign + dirZ * pull + avoid.rz * 0.6;
      const rl = Math.hypot(rx, rz) || 1;
      mx = rx / rl; mz = rz / rl;
    }

    // On low ground? Hop onto any reachable platform — high ground is the
    // better engagement / vantage spot on Station-like maps. Doesn't override
    // the orbit (just adds a jump when the chance is there); the jump cooldown
    // limits how often this fires.
    if (grounded && !me.airborne && !onHighGround) {
      const perch = findHighGroundPerch(pos.x, pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.3) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botTryJump(host)) jumpThisTick = true;
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
      // PROACTIVE HOP (2026-08-05, user-designed): don't wait to grind —
      // while escaping on the ground, if a jumpable lip sits DEAD AHEAD on
      // the committed line (tight ~35° cone; the stuck vault below keeps
      // its wider one), jump it the moment it's in reach and keep sprinting
      // the same direction up top. Adds ZERO decision time: the direction
      // never changes, the ledge is simply cleared instead of deflecting
      // the sprint. GLINT GATE: never while an anti-glint dodge is
      // scheduled (me.botGlintStepAt) — airborne can't dodge, and a hop
      // there converts a guaranteed-dodgeable sniper shot into a hit.
      if (grounded && !me.airborne && me.botGlintStepAt == null) {
        const ahead = findHighGroundPerch(pos.x, pos.z, myFloorY, surfaces, obstacles, 6);
        if (ahead && ahead.dist < BOT_LEDGE_JUMP_REACH
            && ahead.toX * mx + ahead.toZ * mz > 0.8) {
          jumpDirX = ahead.toX;
          jumpDirZ = ahead.toZ;
          if (botTryJumpSurvival(host)) {
            jumpThisTick = true;
            me.botDefenseStuckTicks = 0;
          }
        }
      }
      const intoWall = (mx * avoid.rx + mz * avoid.rz) < -0.4;
      if (intoWall && avoidMag > 0.4) {
        me.botDefenseStuckTicks = (me.botDefenseStuckTicks ?? 0) + 1;
      } else {
        me.botDefenseStuckTicks = 0;
      }
      if (!jumpThisTick && me.botDefenseStuckTicks >= 2) {
        // VAULT FIRST: if the "wall" being pressed is actually a jumpable
        // ledge (walkable top 1.7–4.8 above, lip unfenced — the same perch
        // check used elsewhere, so Airport's rim glass still rejects it)
        // roughly along the committed escape line, jump ONTO it and keep
        // sprinting the same direction up top: the dodge continues with an
        // elevation change instead of a turn. Jump unaffordable (boost /
        // cooldown) or no ledge → the usual flip → slide → bail chain.
        // Same glint gate as the proactive hop above.
        let vaulted = false;
        if (grounded && !me.airborne && me.botGlintStepAt == null) {
          const ledge = findHighGroundPerch(pos.x, pos.z, myFloorY, surfaces, obstacles, 6);
          if (ledge && ledge.dist < BOT_LEDGE_JUMP_REACH
              && ledge.toX * (me.botDefenseDirX ?? sideX) + ledge.toZ * (me.botDefenseDirZ ?? sideZ) > 0.3) {
            jumpDirX = ledge.toX;
            jumpDirZ = ledge.toZ;
            if (botTryJumpSurvival(host)) {
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
  const botSprintBase = unit?.sprintSpeed ?? BOOST_MOVE_SPEED;
  const botWalkSpeed = unit?.walkSpeed ?? WALK_SPEED;
  // Sprint funding tiers: Defense (escaping live fire) may spend down to the
  // hard floor; the HIDE stance's latched route sprint (owner 2026-09-26) is
  // funded down to the hard floor too — the latch itself (arm > 50, drop
  // <= 8) paces it; every other state (Pursue / Maze travel) stops at the
  // travel floor — the latch above arms them only from a full tank.
  const botSprintFloor = me.botState === 'defense' ? BOT_SPRINT_MIN_BOOST
    : (coverMove && coverMove.hide) ? BOT_SPRINT_MIN_BOOST
    : BOT_TRAVEL_SPRINT_FLOOR;
  const botCanSprint = me.boost >= botSprintFloor && now >= me.emptyRecoverUntil;

  if (sdStepping) {
    // (the dodge's lerp owns the body this tick: no velocity, no action from the brain)
  } else if (jumpThisTick) {
    me.botAirSteerX = jumpDirX;
    me.botAirSteerZ = jumpDirZ;
    me.botAirSteerUntil = now + BOT_AIR_STEER_MS;
    vel.x = jumpDirX * botSprintBase;
    vel.z = jumpDirZ * botSprintBase;
    me.action = 'jump';
  } else if (me.airborne && (me.botAirSteerUntil ?? 0) > now) {
    const ax = me.botAirSteerX ?? mx;
    const az = me.botAirSteerZ ?? mz;
    vel.x = ax * botSprintBase;
    vel.z = az * botSprintBase;
    me.action = 'dash';
  } else if (wantSprint && botCanSprint) {
    vel.x = mx * botSprintBase;
    vel.z = mz * botSprintBase;
    host.inheritMomentum(MOMENTUM_STANDARD * 1.5);
    me.action = 'dash';
  } else {
    vel.x = mx * botWalkSpeed;
    vel.z = mz * botWalkSpeed;
    // Anti-freeze nudge — skipped during a cover-reload HOLD (the hold paces
    // its own narrow sway; the nudge must not override a flip instant).
    if (!(coverMove && coverMove.hold)
        && Math.abs(vel.x) + Math.abs(vel.z) < 0.08) {
      vel.x = sideX * 4.5;
      vel.z = sideZ * 4.5;
    }
    me.action = 'idle';
  }

  // --- Firing: LoS-aware + universal burst sizing ---
  if (now >= me.nextFireAt) {
    const u = unit;
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
      botClearFireRule(me);
    } else if (now < opp.invulnerableUntil) {
      // Target is spawn-immune — no shot can hurt it, so hold fire instead
      // of wasting the burst (2026-08-01). Wake at the immunity lapse or the
      // regular 220 ms poll, whichever comes first (the target can change).
      me.nextFireAt = Math.min(opp.invulnerableUntil, now + 220);
      me.machineBurstRemaining = 0;
      botClearFireRule(me);
    } else if (sd ? !me.botSDFire : !botMayFire(u, me, Math.hypot(opp.pos.x - pos.x, opp.pos.y - pos.y, opp.pos.z - pos.z), mode)) {
      // (SUDDEN DEATH: the brain's trigger (botSDFire) is the unit's only
      // trigger — open, no bloom-gate hold: a 1 HP duel is the same lottery
      // both ways, and a held trigger returns nothing; closed (hidden, or the
      // unit's own reaction still running), no shot, polled every tick.
      // Otherwise the gate stands as before.)
      // BLOOM GATE (owner 2026-09-21, bloom.js botMayFire; gate line
      // 2026-09-22): inside the CURRENT gate line (8.84 / SA-now for the
      // autos — the 33%-hit distance — and 3.2 / SA-now, sure-hit, for the
      // marksman rifles) the bot fires freely on the old burst / rest rhythm;
      // outside it the bot waits for the cone to fully recover (released
      // early only if the target closes in) and then fires a committed
      // suppress burst of botSuppressBurst rounds (5 autos, 10 SMGs, 1
      // marksman rifles). Closed form,
      // checked BEFORE the obstacle scan; polls every tick. Mirrors offline
      // main.js updateEnemy.
      me.nextFireAt = now + host.tickMs;
    } else if (!host.clear({ x: pos.x, y: myShotY, z: pos.z }, { x: opp.pos.x, y: opp.pos.y + muzzleUp, z: opp.pos.z })) {
      // No clear shot — hold fire and check again shortly. The origin is the
      // GROUNDED muzzle (see myShotY): a jump must not manufacture a firing line.
      // SD in band: poll every firePollMs — a sprint through a one-cell gap
      // lasts ~200 ms and the 220 ms poll let it go unshot.
      me.nextFireAt = now + (sd ? sd.firePollMs : 220);   // (the Sudden Death brain: the fast poll — a line opens and closes within one sprint)
      me.machineBurstRemaining = 0;
      botClearFireRule(me);
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
      me.machineBurstRemaining = 0;
    } else {
      // Burst gating applies to every single-projectile gun AND to any
      // multi-pellet gun with an explicit botFireCap (2026-08-01: shotguns
      // carry cap 4 — four blasts per trigger pull, then the usual rest).
      const bursted = u.spreadCount === 1 || u.botFireCap;
      // EXPOSED DUMP (BOT_SD exposedDump, owner 2026-10-15, "still easy"):
      // while an enemy line is open on the unit there is no burst rest and
      // no cadence jitter — rounds at the gun's own cooldown until the line
      // closes or the magazine empties. SD only.
      const sdDump = !!(sd && me.botSDFire);
      if (bursted && me.machineBurstRemaining <= 0) {
        me.machineBurstRemaining = botBurstSize(u);
      }
      const firedAt = me.lastFireAt;
      host.fire();
      const fired = me.lastFireAt !== firedAt;
      if (fired) {
        botNoteShot(me);
        if (me.botSDFire) me.botSDExposedShots = (me.botSDExposedShots ?? 0) + 1;   // (the report: rounds fired while exposed)
      }
      if (bursted) {
        if (fired) me.machineBurstRemaining -= 1;
        me.nextFireAt = (me.machineBurstRemaining > 0 || sdDump)
          ? now + u.fireCooldownMs
          : now + between(800, 1500);
        if (me.machineBurstRemaining <= 0) me.machineBurstRemaining = 0;
      } else {
        // Capless multi-pellet pacing — pace shots near the weapon's
        // mechanical fire cooldown so the bot uses its full per-shot DPS
        // instead of dawdling 1+ s between shots. Small jitter avoids a
        // perfectly robotic cadence; the magazine + autoReload still impose
        // a natural burst rhythm without the AI gating on top.
        if (fired) me.nextFireAt = now + u.fireCooldownMs + (sdDump ? 0 : between(40, 220));
        else me.nextFireAt = now + 120;
      }
    }
  }
  return sdStepping ? 'stepping' : 'ran';
}
