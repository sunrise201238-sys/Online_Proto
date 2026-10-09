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
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle, walkSegmentBlocked, sightHitsSurface, projectileHitsSurface, obstaclesNearSegment } from './physics.js';
import { getArena } from './arena.js';
import { buildNavGrid, findPathOnGrid, findFiringPath, findHiddenSpot, smoothPath, coverDistanceAt } from './navgrid.js';
import { inheritMomentum } from './movement.js';
import { MAX_HP, STEP_BOOST_COST, STEP_DURATION_MS, STEP_DISTANCE, GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS, PROJECTILE_MUZZLE_Y_OFFSET, MANDATED_JUMP_MIN_BOOST, TICK_RATE_MS, BOT_LOS_EYE_HEIGHT, CMD_TRAVEL_BOOST_FLOOR, HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, BOOST_DASH_DRAIN_PER_TICK } from './constants.js';
import { botMayFire, botNoteShot, botClearFireRule } from './bloom.js';

// --- Bot tactical-sprint tunables (mirrored in client/src/main.js) ---
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
// (there is no distance cap — the unit walks as far as it takes). Mirrored
// in client/src/main.js.
const BOT_HIDE_SEARCH_MS = 500;
const BOT_HIDE_FAIL_RETRY_MS = 500;   // 1500 -> 500 (owner 2026-09-27: keep looking for a double-block spot)
const BOT_HIDE_BAIL_MS = 700;
const BOT_HIDE_BAIL_RETRY_MS = 700;
const BOT_HIDE_MAX_POPS = 600;
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
// SUDDEN DEATH BRAIN (sim prototype, flag me.botSD). Every fighter has 1 HP,
// so a hit is a death: Defense (a reaction to being hit) is pointless and a
// sprint keyed to the enemy's trigger reads as cheating. The brain instead
// plays the way a human plays SD — cover to cover, sprinting across the gaps
// and firing on the way, standing exposed only for a short budgeted window:
//   cover  : hidden from every live enemy eye; dwell a jittered beat (the
//            'breath' a human takes behind a crate), then hop;
//   dash   : sprint a findHiddenSpot route to the next cell hidden from every
//            enemy, chosen by band — closer when far (gain scales with the
//            distance), farther when too close, a lateral shift inside the
//            band; a hop never waits for the enemy to shoot;
//   fight  : found in the open (or the enemy walked around the cover): fire
//            back for the exposure budget while strafing, then break off to
//            the nearest hidden cell — the budget starts the tick the first
//            enemy eye sees the unit, not the tick the enemy fires;
//   peek   : hidden, in band, no hop available: step to a cell that sees the
//            target, fire for the budget, fall back behind cover;
//   open   : exposed past the budget with no cover anywhere within the
//            search budget: strafe-sprint, re-search every SEARCH_MS.
// An enemy out of rounds (empty mag with reload time left — what a human
// reads off the reload animation) suspends the budget and the dwell. Own
// long reloads are spent in cover. The anti-glint dodge stays as it is.
// Tunables live in one mutable bag so the sim harness can A/B them.
// Fraction of a uniform disc of radius c (a cone's footprint at the target's
// range) that lies inside the target's HIT VOLUME when the target has moved
// s sideways during the flight: the chance ONE round aimed at where the
// target WAS still lands. The volume is the sim's capsule (projectiles.js):
// a stadium of half-width R with a straight half-height H and round caps —
// the full 6.4-tall sprite, not a 1.6 u ball. (2026-10-07: the ball model
// read a spraying MG at 100 u as 41%/s against a sprinter; the capsule the
// rounds actually test is 71%/s — a wide cone's rounds land anywhere up
// and down the body. The band's floors moved 0-35 u out with it.) The
// overlap is integrated in `n` lateral slices; the shooter aims at the
// chest, so the volume's centre sits on the footprint's horizontal axis.
export function capsuleHitFrac(c, R, H, s) {
  s = Math.abs(s);
  if (c <= 1e-6) return s < R ? 1 : 0;
  if (s >= c + R) return 0;
  if (s + c <= R) return 1;
  const x0 = Math.max(-c, s - R), x1 = Math.min(c, s + R);
  const n = 12, dx = (x1 - x0) / n;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const x = x0 + (i + 0.5) * dx;
    const hs = H + Math.sqrt(Math.max(0, R * R - (x - s) * (x - s)));   // the stadium's half-height at this lateral offset
    const hd = Math.sqrt(Math.max(0, c * c - x * x));                    // the footprint's
    area += 2 * Math.min(hs, hd) * dx;
  }
  return Math.max(0, Math.min(1, area / (Math.PI * c * c)));
}

// Chance of dying while exposed to `threat` for T ms at distance d, moving
// with lateral fraction `lat` (of riskSprint) across its line: a no-lead
// shooter fires riskReactMs after the line opens and every shotMs after.
// `elapsed` ms of the exposure already spent (a reaction already consumed).
// `speed` is the exposed unit's own sprint (u/s): the SD block passes the
// unit's sprint x riskSprintFactor; SD.riskSprint is the fallback.
// `bloom` is the shooter's current bloom (spread carried above its base
// spreadAngle, bloom.js); it defaults to the threat's live value.
export function sdExposureRisk(threat, SD, d, lat, T, elapsed = 0, speed = SD.riskSprint, bloom = (threat.bloom ?? threat.state?.bloom ?? 0)) {
  const u = threat.unit ?? {};
  const base = u.spreadAngle ?? 0.02, pv = u.projectileSpeed ?? 600;
  // BLOOM (owner 2026-10-06, "散佈只算基礎值不算 bloom"): the cone is the
  // shooter's CURRENT spread — the base plus the bloom it carries — and
  // every round it fires at the unit widens it by bloomPerShot up to
  // bloomCap (no recovery inside a burst: bloomRecoverDelayMs). A wider
  // cone thins the rounds on a target that has not moved and reaches one
  // that has; capsuleHitFrac weighs both, round by round.
  const cap = Math.max(base, u.bloomCap ?? base), perShot = u.bloomPerShot ?? 0;
  const sa0 = Math.min(cap, base + Math.max(0, bloom));
  const shotMs = Math.max(SD.riskShotMs, u.fireCooldownMs ?? 0);
  const s = speed * lat * (d / pv);
  // The first round that can land arrives riskReactMs (the shooter's reaction)
  // plus the flight time after the line opens — an exposure that ends before
  // that is free (the round lands on an empty spot or a dodge's i-frames).
  const react = SD.riskReactMs + (d / pv) * 1000;
  const before = Math.max(0, elapsed - react) / shotMs;   // rounds already fired in this exposure: their bloom is on the cone
  const shots = Math.max(0, elapsed + T - react) / shotMs - before;
  let survive = 1;
  for (let k = 0, left = shots; left > 0; k += 1, left -= 1) {
    const sa = Math.min(cap, sa0 + (Math.floor(before) + k) * perShot);
    const p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, s);
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}

// ENGAGE FLOOR (owner 2026-10-07, "in SD the BOT don't use Lockrange, they
// use the engage range to keep themselves from instant killed according to
// the opponent enemy"): the nearest distance (5 u steps from 20, up to
// engageMaxDist) at which a lateral sprint of engageWindowMs under `unit`'s
// gun is at most engageFloorRisk dead — the gun starts clean and sprays for
// the rest of the window (the model grows its bloom round by round). A
// 1 HP unit nearer than this to that gun dies the first second it is seen;
// outside it the rounds land where it was (the game aims every shot, a
// player's too, at the target's position of the moment, and homing is off:
// the model's shooter IS the game's). Bloom-era guns, the capsule hit
// volume, the unit's own measured sprint (`speed`), 1%: Saori 50, Asuna 60,
// Koyuki 60, Atsuko 75, Mika 75, Hina 95, Marina 155, the volley 180, the
// marksman rifles none under engageMaxDist (one wide-cap round is a dice
// roll at any range). At 5% they were 50 / 60 / 55 / 70 / 65 / 85 / 130 /
// 105 / 135.
// (The band is a standing choice: it is read against the gun's base cone,
// not the bloom of the moment — the bloom goes into the route and peek
// risks, which are decided move by move.) Cached per gun and speed.
const sdFloorCache = new Map();
export function sdEngageFloor(unit, SD, speed = SD.riskSprint) {
  const u = unit ?? {};
  const key = `${u.id ?? u.name ?? '?'}|${speed.toFixed(2)}|${SD.engageWindowMs}|${SD.engageFloorRisk}|${SD.engageMaxDist}|${SD.riskReactMs}|${SD.riskShotMs}`;
  const hit = sdFloorCache.get(key);
  if (hit != null) return hit;
  const threat = { unit: u, pos: { x: 0, z: 0 } };
  let floor = SD.engageMaxDist;
  for (let d = 20; d <= SD.engageMaxDist; d += 5) {
    if (sdExposureRisk(threat, SD, d, 1, SD.engageWindowMs, 0, speed, 0) <= SD.engageFloorRisk) { floor = d; break; }
  }
  if (sdFloorCache.size > 256) sdFloorCache.clear();
  sdFloorCache.set(key, floor);
  return floor;
}
// OWN REACH: the distance to which every round of the unit's base cone lands
// on a target that stands still (the cone's footprint fits the hit radius)
// — the band's far edge: beyond it the unit's own fire thins out too. A
// volley gun's pattern is not a cone: its lock range stands in.
// (Saori / Asuna / Koyuki / the rifles 160, Atsuko 107, Mika / Hina 80,
// Marina 53, the shotguns 40.)
export function sdOwnReach(unit) {
  const u = unit ?? {};
  if ((u.spreadCount ?? 1) > 1) return u.lockRange ?? 50;
  const sa = u.spreadAngle ?? 0.02;
  return sa > 1e-6 ? HIT_RADIUS_NORMAL / Math.tan(sa / 2) : 200;
}

// FIRE REACTION (owner 2026-10-06, "make SD bot attack reaction 250 ms like
// human"): the SD bot's first shot at a line that just opened waits
// fireReactMs — what the risk model already assumes of the enemy
// (riskReactMs); the bot itself fired 32 ms after a line opened. The fire
// block tracks its line on every poll: a line lost for less than
// fireReactBreakMs is the same appearance (slats, a sidestep), longer is a
// new one and the next shot reacts again.
export function sdFireReactHold(me, now, SD) {
  if (me.botSDFireLineSince == null) me.botSDFireLineSince = now;
  me.botSDFireLineLostAt = null;
  // (a planned exposure — the SD block sets botSDPlanned the tick its line
  // opens — was aimed during the leg: peekAimMs; an unplanned one reacts)
  const react = me.botSDPlanned ? (SD.peekAimMs ?? SD.fireReactMs) : SD.fireReactMs;
  return now - me.botSDFireLineSince < react;
}
export function sdFireLineLost(me, now, SD) {
  if (me.botSDFireLineLostAt == null) me.botSDFireLineLostAt = now;
  if (now - me.botSDFireLineLostAt >= SD.fireReactBreakMs) me.botSDFireLineSince = null;
}

// Estimated death chance of a hop: the route from (sx, sz) through `path`
// (navgrid points, y = floor), sub-divided into ~4 u pieces; a piece is
// exposed when `clear(eye, muzzle)` holds for any eye; each contiguous
// exposed run shares one reaction. Returns { risk, first } with the first
// exposed piece's midpoint (the avoid mark on rejection).
export function sdRouteRisk(path, sx, sz, floorY, eyes, threat, SD, clear, speed = SD.riskSprint) {
  let survive = 1, first = null, elapsed = 0, inRun = false, exposedLen = 0;
  let px = sx, pz = sz;
  for (let i = 0; i < path.length; i += 1) {
    const q = path[i];
    const len = Math.hypot(q.x - px, q.z - pz);
    if (len < 0.01) { px = q.x; pz = q.z; continue; }
    const dx = (q.x - px) / len, dz = (q.z - pz) / len;
    const nSub = Math.max(1, Math.ceil(len / 4));
    const muzzleY = (q.y ?? floorY) + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET;
    for (let k = 0; k < nSub; k += 1) {
      const f = (k + 0.5) / nSub;
      const mid = { x: px + (q.x - px) * f, y: muzzleY, z: pz + (q.z - pz) * f };
      let exposed = false;
      for (let e = 0; e < eyes.length && !exposed; e += 1) if (clear(eyes[e], mid)) exposed = true;
      const T = (len / nSub) / speed * 1000;
      if (!exposed) { inRun = false; elapsed = 0; continue; }
      exposedLen += len / nSub;
      if (!first) first = { x: mid.x, z: mid.z };
      if (!inRun) { inRun = true; elapsed = 0; }
      let lx = threat.pos.x - mid.x, lz = threat.pos.z - mid.z;
      const d = Math.hypot(lx, lz) || 1; lx /= d; lz /= d;
      const lat = Math.abs(dx * lz - dz * lx);
      survive *= 1 - sdExposureRisk(threat, SD, d, lat, T, elapsed, speed);
      elapsed += T;
    }
    px = q.x; pz = q.z;
  }
  // (exposedLen: the route's exposed length in u — the SD block prices its
  // sprint against the tank before the hop starts)
  return { risk: 1 - survive, first, exposedLen };
}

export const BOT_SD = {
  // (re-check 2026-10-08: no exposure TIME budget any more — a window ends on
  // the tank reserve, the empty magazine, the strafe cap, the spent dodge or
  // the leave-risk; exposeMs / watchFightMs were written to a field nobody read)
  peekMs: 250,            // a DELIBERATE peek's planned fire time: sizes the risk window of a stand peek / fire hop, the "fought" threshold (half of it) and the tank the peek needs
  peekJitterMs: 100,      //   + uniform jitter
  dwellMinMs: 250,        // cover dwell before the next hop (near the band)
  dwellMaxMs: 700,
  farDwellMs: 120,        // dwell when far outside the band (nothing to breathe for)
  dashFloor: 8,           // an exposed crossing, an open-ground run, a peek, an escape or a dodge sprints down to here (the normal bot's BOT_SPRINT_MIN_BOOST)
  sprintBurstMs: 500,     // ANTI-FLICKER (owner 2026-10-05, "no 抖動步伐"): a sprint started for an exposure runs at least this long (or to dashFloor) — the exposed / open tests flip tick to tick along a slatted fence and the pose went dash-walk-dash
  jumpBank: 110,          // JUMP LINK (owner 2026-10-05, Station): a route crossing onto a ledge needs the jump (48) + the dodge right after it (48) + a margin in the tank; while such a link lies ahead the covered legs walk and bank to this
  jumpReach: 7,           //   the vault starts within this distance of the ledge waypoint (the maze follower's rule)
  holdMaxMs: 6000,        // NEVER HOLD FOREVER (owner 2026-10-05, Station): a "good" position with no shot line for this long is not good — the hold ends, the search runs, and a search that still finds nothing hands the legs to the plain brain (stallMs) whose maze crosses anything
  exposedRetryMs: 150,    // nothing found while exposed: retry this soon
  hopGainMin: 10,         // advance / retreat gain per hop (u), scaled 0.3 x dist ...
  hopGainMax: 45,         //   ... and capped
  shiftMin: 8,            // lateral shift inside the band: at least this far from the current spot
  searchMs: 250,          // search cadence while a hop is wanted
  failRetryMs: 500,       // nothing found at any stage
  nearPops: 800,          // (2026-10-05 idle-player test: 150 / 600 starved on Scrapyard and Square — the exposure-costed search spent its budget on the cheap hidden cells behind the unit and never reached the strip it had to cross, so no goal was ever found; 800 / 3000 kills there in 4-19 s and costs LESS per tick on average, since a found route ends the re-searching)          // first stage Dijkstra budget (~22 u walk radius)
  farPops: 3000,
  bailMs: 700,            // route no-progress bail
  freeMinMs: 350,         // enemy reload time left that counts as a free window
  reloadHoldMs: 800,      // own reload longer than this is spent in cover (no hop)
  peekWaitMs: 400,        // hidden, in band, no shot line for this long -> engage hop, flank, or the stand peek (owner 2026-10-05: 800 -> 400, "go as I preferred")
  // FLANK (owner 2026-10-05, "create the line without the risk"): a spot is
  // LINE-CAPABLE when a lateral leg of peekLeg or 1.75 x peekLeg from it is
  // walkable and ends with a muzzle line to the target — the peek's own
  // precondition. Line-capable spots score peekableBonus, and an engage that
  // finds no cover to cross and no leg from here moves (hidden, risk-gated)
  // to the nearest line-capable spot in the band, then peek-fire-dodges.
  peekableBonus: 2,
  // The stand peek needs the dodge step back (STEP_BOOST_COST 48) plus the
  // sprint of the fight window in the tank — one started on 26 boost stood
  // in the open when the tank ran dry (SD-vs-SD trace seed 7).
  // (peekBoostMin, the fixed 60, is gone — owner 2026-10-07, "BOT still dies
  // fast": the SD block prices the whole manoeuvre, sdPeekNeed, about 100)
  peekCycleMs: 400,       // PEEK CYCLE (owner 2026-10-06): back on the cover after a peek's dodge, the next peek may start within this window with no dwell and no peekWait
  peeksPerCover: 99,      // PEEK CAP (owner 2026-10-07: the tank ends a stand, not a count — 2 -> 99; kept as a loop stopper): stand peeks from one cover before the hop search gets the first word (after them the peek is the fallback at the search cadence, as before)
  dryPeeksMax: 2,         // DRY PEEKS (owner 2026-10-07, "BOTs stuck into endless peek loop in same place"): a peek that ends without a round fired is dry (a slit that shows a shoulder but never the gun, a window the model closes first); this many in a row from one cover and the cover peeks no more — the search relocates (Scrapyard idle smoke: 67 peeks from one spot in 60 s, the target never hit). A new cover starts the count over.
  fireReactMs: 0,         // FIRE REACTION (owner 2026-10-06: 250 "like a human"; 2026-10-07 "change both side reactions to 0ms, let's see how it goes"): the first shot at a line that just opened waits this long; the risk model keeps assuming riskReactMs of the enemy
  fireReactBreakMs: 200,  //   a line lost for less than this is the same appearance (slats, a sidestep); longer and the next shot reacts again
  plainReactMs: 0,        //   HARNESS ONLY (default off): the same reaction for the plain bot and the camper, so SD-vs-base duels measure the brain and not who fires first (--opts '{"plainReactMs":250}')
  wedgeMs: 160,           // WEDGE (owner 2026-10-07): a route or peek leg that has moved the body less than wedgeMoveMin in this long while commanding a move is wedged on an obstacle
  wedgeMoveMin: 0.8,      //   (u) the corner shiver moves +-0.5 u a tick and nets nothing; a creeping leg nets 1 u in 85 ms
  slideMs: 350,           //   a wedged route leg slides along the obstacle (the walkable perpendicular) this long — one heading, no per-tick flips — then resumes
  peekAimMs: 0,           // AIM (owner 2026-10-07: 120 -> 0 "線一開就開槍", then 220, then 250 "the peeker still has more winrate than the one being ambushed", then 0 again with fireReactMs: "both side reactions to 0ms"): a PLANNED exposure — stand peek, fire hop, the watch fight, the engage crossing — fires this long after its line opens; fireReactMs (250) stays for a sighting it did not plan. The window walks while it aims (the dodge back must still land hidden: sdStrafeMax) and sprints from the first round on.
  fireHopSeenMs: 150,     //   a fire hop's goal is in the line for about this long on the approach: its window's rounds start that far into the enemy's reaction
  shoulder: HIT_RADIUS_NORMAL,   // SHOULDERS (owner 2026-10-06): the hidden tests see the unit's width — the centre and both shoulders — not the centre point alone
  stuckAvoidMs: 6000,     // a waypoint a route could not reach (no-progress bail) is avoided this long, whatever the threat does
  peekRange: 25,          // engage / peek allowed up to upperRange + peekRange (owner 2026-10-05: 10 -> 25; beyond bandSlack the closing list and the peek now overlap)
  peekLeg: 4,             // peek leg length (u): out at a sprint, lateral to the threat's line
  peekLegMax: 10,         //   the longest leg tried (4, 7, 10 u) past a wide cover; the dodge step back covers 9.2 u, the rest is sprinted (owner 2026-10-05)
  stallMs: 2500,          // hidden with no hop found for this long -> plain brain legs
  fightStill: false,      // fight window: stand still (true) or strafe-walk (false)
  fightSlack: 10,         // (owner 2026-10-07, "peek and pop"): the fight window and the stand peek run to this far past the band's upper edge — the same slack the position score already calls "in band" (bandSlack); the hug spots the hops end on sit 5-10 u outside the band and the peek was never due from them (Atsuko: band 43-57, walked for 35 s at 58-64 u with one peek)          // fight window allowed up to upperRange + fightSlack; beyond -> break off at once
  exposurePenalty: 8,     // hop routing: extra walk cost per exposed cell (0 = off; a cell is 1); 4 -> 8 (play test 2026-10-05: fewer gap crossings, longer covered detours)
  eyeSpread: 6,           // hop goals / routes are also hidden from eyes this far to either side of each enemy (a sidestep must not uncover the spot)
  lateralMin: 0.8,        // exposed crossing: keep at least this fraction of the heading perpendicular to the threat's line (0 = off)
  lateralGoalMin: 0.5,    // breaking off: first try covers whose straight run is at least this lateral
  // COVER PROXIMITY (play test 2026-10-05): open ground is never safe.
  openDist: 6,            // a cell farther than this from muzzle-blocking cover is OPEN ground
  openPenalty: 2,         // hop routing: extra walk cost per open cell (a cell is 1)
  goalCoverMax: 4,        // hop goals must stand within this distance of cover (fallback stages)
  hugDist: 2.5,           // HUG THE COVER (owner 2026-10-05, "they should get closer to cover"): the first-choice goals, a hold and a watch stand this close to cover — in the shadow but off the cover is not a position
  stuckMoveMin: 3,        // STUCK WATCHDOG (owner 2026-10-05): standing within this radius ...
  stuckMs: 3000,          //   ... for this long with no reason to (not hidden-hugging-and-inside holdMaxMs) -> the spot is marked, route and peek dropped, and ...
  plainMs: 3000,          //   ... the plain brain takes the legs for this long (its wedge detectors run; the SD fire rules stay)
  farDist: 40,            // beyond upperRange + farDist the unit is TRAVELLING (pursue / maze-like): covered legs run on the travel latch (travelArm / travelFloor); inside, covered legs WALK — the shadow walk ("在影子裡用走的往對方推進"), the sprint is for the exposed lateral move only
  predictS: 0.6,          // hop goals are hidden from the enemies' positions this far ahead on their velocity too
  // ALONG-LINE EXPOSURE (play test 2026-10-05): an exposed route step costs exposurePenalty x (1 + alongWeight x along^2),
  // along = how much the step runs along the threat's line (a gap crossed toward the shooter is a straight shot).
  alongWeight: 3,
  engagePenalty: 1,       // engage hops keep a small exposure cost so their crossing is still a lateral one
  aheadProbe: 8,          // dash leg: sprint when the heading is exposed this far ahead
  shadowWalkProbe: 5,     // SHADOW WALK (owner 2026-10-07): a covered leg WALKS only when the heading enters the enemy's PREDICTED line this far ahead; every other covered leg runs on the travel latch (walking every covered leg in contact was 29-47% of an engagement)
  // WATCH / AMBUSH (play test 2026-10-05, "no back and forth, no tactical
  // positioning"): in band the unit alternates hops with WATCH phases — a
  // hidden, cover-adjacent spot whose muzzle line covers most of the enemy's
  // EXITS (a ring of exitR around the enemy); it stands there pre-aimed,
  // fires the instant the enemy crosses, trades for watchFightMs, then
  // relocates. A stand peek now returns to the cover it stepped out from.
  pWatch: 0.6,            // chance a band decision becomes a watch instead of a shift hop
  watchCooldownMs: 2000,  // after a watch ends (or is cut short) no new watch for this long — the search decides instead (re-check 2026-10-08: the cooldown field was read but never set)
  watchMinMs: 1500,       // watch window (+ random up to watchMaxMs)
  watchMaxMs: 3500,
  exitR: 10,              // exit ring radius around the enemy
  exitMin: 3,             // a watch spot must see at least this many of the 8 exit points
  watchRecheckMs: 500,    // re-validate the spot this often
  watchMoveTol: 10,       // enemy moved this far from where the spot was chosen -> decide again
  firePollMs: 32,         // in band, re-test the firing line this often (the plain bot's 220 ms let a sprint through a gap go unshot)
  // (No shot lead: every shot in this game — the player's lock-on, the plain
  // bot's, this one's — is aimed at the target's CURRENT position. A lead
  // was tried here on 2026-10-05 and removed the same day: not in the deal.)
  readReload: false,      // NEVER (owner 2026-10-07): the enemy's magazine is not readable — no free windows from it; the unit's OWN magazine (empty, reload left, the reload hold) stays readable. (bloom IS read: a human sees the spray too)
  // COVER PACING (play test 2026-10-05, "don't make them stand deadly
  // still"): behind cover (cover / watch states) the unit paces on a short
  // leash — the base hide stance's recipe — instead of holding a statue.
  // Every leg is hidden on the muzzle line from every live eye (re-checked
  // each tick), from the predicted / spread eyes when such a leg exists,
  // walkable, inside the leash, and during a watch keeps the watched exits
  // covered. Exposure rules are untouched: a leg that would open a line is
  // never taken.
  paceSpeed: 0.4,         // walk-speed fraction while pacing (0 = the old dead-still hold)
  paceLeg: 0.8,           // a leg's look-ahead step (u): must stay hidden and on the leash
  paceLeash: 2.0,         // stay within this of the arrival point (u)
  paceMs: 350,            // keep a heading this long, then re-pick (8 headings)
  paceRetryMs: 300,       // no hidden leg at all: stand this long, then try again
  pacePauseMs: 200,       // a leg may end in a stand of 0..this ms (was 400 — owner 2026-10-09, "very short range moving to prevent pure stand still")
  pacePauseChance: 0.34,  //   ... this often (was every other leg)
  paceLegMin: 0.4,        // no 0.8 u leg stays hidden? try this short a shuffle on the same 8 headings before standing (a tight nook still moves)
  paceLateralWeight: 0.5, // the lateral preference in a leg's score (1 = the old strafe-only taste): fore / aft shuffles toward and away from the enemy appear too
  paceReverseMinMs: 250,  // a heading is not reversed sooner than this after a pick unless nothing else is legal — a shuffle, never a twitch
  // RISK-WEIGHTED CLOSING (owner 2026-10-05, "the bot can go for the range
  // if the situation allows but don't go for a suicide route just because
  // LR forces it to go in"). The band stays the preference; a PLANNED hop
  // (band hop, watch hop, engage hop, stand peek) is taken only if its
  // estimated death chance (sdRouteRisk: every exposed stretch crossed at
  // riskSprint against a no-lead shooter — the lock-on player — who fires
  // riskReactMs after the line opens and every riskShotMs after; a round
  // lands with capsuleHitFrac for the stretch's distance and lateral motion)
  // stays under the cap. A rejected route marks its first exposed point
  // avoid (avoidR, for avoidMs or until the threat moves watchMoveTol) and
  // the next search goes around it; nothing under the cap -> hold the cover
  // and wait for a window (the enemy's empty mag — sdFree skips the cap —
  // their move, the mark expiring). The wait is not forever: after
  // patienceMs the cap rises to patienceCap. Escapes (caught exposed) are
  // never capped — the unit must move.
  riskCap: 0.08,
  engageRiskCap: 0.15,    // deliberate moves: engage hops and stand peeks
  patienceMs: 8000,
  patienceCap: 0.3,
  riskReactMs: 250,       // a human's reaction to a line opening (the plain bot polls at 220, this one at 32 — the sim is harsher than play)
  riskShotMs: 60,         // floor on the enemy's shot interval (their fireCooldownMs if longer): a held trigger fires at the cooldown — 150 read the 55 ms SMG as 2.7 x fewer rounds, and with the real sprint speed in the model the crossings it waved through died (mid batch: 0 -> 8-17% losses)
  riskSprint: 16.8,       //   fallback speed when the unit has no sprintSpeed (see riskSprintFactor)
  riskSprintFactor: 2.5,  //   exposure speed = unit sprintSpeed x this: the dash runs at 2.5 x sprintSpeed from its first tick (sprint + 1.5 x momentum: 29.4 u/s for 11.76, traced 2026-10-07, no ramp). The old 1.8 kept a "hand lead" margin the no-lead rule makes moot; it read every band exposure a third slower than it is.       // effective sprint speed (sprintSpeed + momentum)
  avoidR: 3.5,
  avoidMs: 2500,
  // ENGAGE RANGE (owner 2026-10-07, "the BOT don't use Lockrange, they use
  // the engage range to keep themselves from instant killed according to
  // the opponent enemy"): the SD band is read off the GUNS, not the lock
  // range. Its floor is sdEngageFloor — the distance from which a lateral
  // sprint of engageWindowMs under the target's gun is at most
  // engageFloorRisk dead; its far edge is the unit's own reach (sdOwnReach)
  // — the band runs bandHalf x 2 out from the floor, no farther than the
  // reach. Every PLANNED position keeps every live enemy's floor ("if there
  // are two enemies, they should position themselves in a position that
  // fits the range from both"); the fight band itself is the target's.
  engageWindowMs: 1000,   //   the exposure the floor is read for: the first second a line is open on the unit
  engageFloorRisk: 0.01,  //   ... may kill it at most this often (owner 2026-10-07, "5% is not safe enough, try 1%": 0.05 -> 0.01)
  engageMaxDist: 200,     //   the floor search stops here (a sniper's gun: nowhere is safe, and snipers are out of SD)
  bandHalf: 7,            //   the plain band's +-7: optimal = floor + bandHalf, upper = optimal + bandHalf (both no farther than the own reach, never nearer than the floor)
  // CROSSING (owner 2026-10-05): inside lateralFullDist the exposed crossing
  // is fully perpendicular to the threat's line (lateral 1.0, no progress
  // along it while exposed); a crossing that has no room to turn (a corridor
  // running at the enemy) is not run straight any more: caught inside ->
  // sprint back to the last hidden spot and mark the corridor; not yet
  // exposed -> stop short, mark it, re-plan. The enemy's empty mag (sdFree)
  // still lets the unit commit straight.
  lateralFullDist: 70,
  corridorLateral: 0.5,   // a heading with less lateral than this and no room to turn is a corridor run
  lateralSlide: 0.6,      // CROSSING ALONG A WALL (Factory opening trace 2026-10-09, "no jitter"): the rotated heading with no room is tried again on the SAME side at this lateral (the wall slide, still a crossing) before the other side gets the legs; the side taken is kept tick to tick. Along the top wall the full rotation had room two ticks in three and its mirror the third — east, east, south — and the "lateral" sprint netted a crawl along the enemy's line (0.3): the round fired at its last seen spot landed.
  lateralKeepMs: 100,     //   the side taken within this long is tried first (0 = the heading's own side every tick, as before)
  flightKeep: 1,          // ROUNDS IN THE AIR: after the line closes the crossing is kept for the threat's round flight time (dist / projectile speed) x this, if it fired inside the line (0 = off)
  backOffMax: 14,         // back off only to a hidden spot within this (else escape as before)
  // POSITION HOLDING (owner 2026-10-05, "I would really not prefer to see
  // BOT give up good position"): a hidden unit scores where it stands —
  // hidden from the live eyes (1), from the predicted / spread eyes too
  // (+1), cover within goalCoverMax (+1), the enemy's exits it covers (+0.5
  // each, up to +2), inside the band +- bandSlack (+1) — and HOLDS while the
  // score is at least holdScore, re-scored every holdRecheckMs. It leaves
  // only when the spot goes bad, for a hidden cover-adjacent spot in the
  // band scoring holdGain more (risk-gated), on a free window while far,
  // or for a deliberate engage (manoeuvres 1 and 2). The old "farther when
  // too close" retreat and the in-band 8 u shift are gone.
  holdScore: 3,           // hidden + cover + band is a spot worth keeping; exits and strict hiding are bonuses
  holdGain: 1.5,
  holdRecheckMs: 500,
  bandSlack: 10,
  // MANOEUVRE 1 — the suppress sprint (owner 2026-10-05): the engage hop's
  // cover must lie across the threat's line — its bearing at least
  // bearingLateralNear (sin 75 deg) inside bearingFullDist, bearingLateralFar
  // (sin 60 deg) beyond — and the run sees the target midway, so the unit
  // sprints across firing and ends hidden again.
  bearingFullDist: 90,
  bearingLateralNear: 0.8,  // sin 53 deg: the crossing rule steers the exposed part to 90 deg anyway (measured: 0.966 found almost no cover)
  bearingLateralFar: 0.6,
  // MANOEUVRE 2 — peek, fire, dodge back: when no such cover exists, a
  // lateral leg (peekLateralMin across the line) of peekLeg at a sprint to a
  // spot that sees the target, the fight window (peekMs) strafing across the
  // line, then the i-frame dodge step back toward the cover (the sprint back
  // would run into rounds already in the air) and the rest at a sprint.
  peekLateralMin: 0.7,
  // PUSH (patience): held for patienceMs with no engage cover and no peek
  // leg -> approach along cover ("go for the range if the situation
  // allows"): any hidden cover-adjacent cell closer than now, gated at
  // riskCap x pushCapScale — near-zero exposure only.
  pushCapScale: 0.5,
  pushAfterMs: 2500,      // held this long with nothing to do -> push (the caps only rise at patienceMs)
  shadowMaxSpeed: 3,      // a narrow shadow is an approach lane only while the threat moves slower than this (u/s): a running enemy's shadow moves with it
  travelArm: 250,         // TRAVEL LATCH (owner 2026-10-05, "全程只用一條閘門"): a covered TRAVEL leg (far from the target) sprints only from a full tank ...
  travelFloor: 110,       //   ... down to here — the ENGAGEMENT RESERVE (owner 2026-10-06, "used the gauge until 8 just for Maze, then had no boost for true engage"): a peek (60) plus a dodge (48), or a jump plus the dodge after it — then walks until full again (a ~2 s sprint from full, a 1 s refill walk). Was 40 (one crossing), and open ground drained to 8 even unseen. Nobody shooting -> never below the reserve; exposed crossings, escapes, peeks and dodges still spend to dashFloor. One latch, no near / far thresholds; in contact covered legs walk (the shadow walk)
};
// Every hide scratch field, nulled when a hide ends (stance cleared, cover
// hide over) so the normal brain resumes from a clean slate. Offline twin:
// client resetBotHideFields.
function resetBotHideFields(f) {
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
const BOT_TARGET_BLOCKED_PENALTY = 50;
const BOT_TARGET_SWITCH_MARGIN = 6;

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

// --- Elevation-kiting tunables ---
// A ledge whose lip rises more than the auto-step height (1.6) above the
// bot's floor can't be walked onto — it needs a jump. The upper bound is
// what a jump arc can actually clear (apex ≈ jumpVelocity² / 2·|gravity|,
// ≈ 5.6 with the default 30 jump velocity), kept conservative for margin.
const BOT_CLIMB_MIN_RISE = 1.7;
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
// waypoint comparison silently stops matching. Mirrored in client main.js.
const BOT_WAYPOINT_ADVANCE_RADIUS = 1.5;
// How far out the bot scans for a ledge to perch on, and how close it has to
// get to that ledge (or to a drop edge) before it commits the jump.
const BOT_PERCH_SEEK_RADIUS = 24;
// STATION-SPECIFIC BOT RULES master switch (2026-08-05): HIDDEN, not
// deleted — the deck-spawn experiment runs with these off. Flip to true to
// re-enable the station perch pull, low-level discouragement dwell, mount
// hold, and descent suppression in one move. Mirrored in client main.js.
const STATION_BOT_RULES = false;
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
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    // Invisible unit-fences normally don't block sight (bullets pass), but
    // bars flagged blocksBotSight DO: a see-through wall the bot cannot walk
    // through defeats every routing trigger — the bot paces in Engage
    // against the invisible face instead of routing around (Streets
    // under-slope bars, 2026-08-13). Mirrored in client main.js.
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

// Can the SHOT actually land? The fire gate has to test the line the BULLET
// takes, not the eye line. spawnProjectiles fires from pos.y +
// PROJECTILE_MUZZLE_Y_OFFSET along (target.pos - owner.pos), i.e. the pos→pos
// line raised by that offset at BOTH ends — 1.55 ABOVE the eye line online and
// 0.8 BELOW it offline (root space). Anything inside that band — a slope's
// guard rail, the bridge deck underside, the ramp plane itself — let the bot
// hold a clear sight line into a shot that died on the geometry. Measured on
// Streets: 3.1% of clear-sight pairs online, 7.4% offline, worst on
// road→slope, i.e. a unit standing on the bridge slope (user 2026-08-15).
//
// Uses the PROJECTILE rules, not the sight rules, so the gate and the shot can
// never disagree: noProjectile fences never stop a bullet (blocksBotSight is a
// NAVIGATION rule — movement LoS still honours it, so the 2026-08-13 pacing fix
// stands), and surfaces use the projectile's own crossing test.
function botShotCanLand(originY, me, opp, obstacles, surfaces) {
  const from = { x: me.pos.x, y: originY, z: me.pos.z };
  const to = { x: opp.pos.x, y: opp.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: opp.pos.z };
  for (let i = 0; i < obstacles.length; i++) {
    if (obstacles[i].noProjectile) continue;
    if (segmentHitsObstacle(from, to, obstacles[i])) return false;
  }
  return !(surfaces && projectileHitsSurface(from, to, surfaces));
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

// Bot jump funding: the shared tryStartJump gates at the raw jump cost
// (human mechanics — untouched); bots additionally respect the strategic
// reserve so a hop never leaves them without an emergency dodge. This also
// closes an old offline/online gap — offline botStartJump always carried a
// +BOT_SPRINT_MIN_BOOST margin that the online path lacked.
function botTryJump(me, now) {
  const funded = Math.max(BOT_TRAVEL_SPRINT_FLOOR, (me.unit?.jumpBoostCost ?? 48) + BOT_SPRINT_MIN_BOOST);
  if (me.boost < funded) return false;
  return tryStartJump(me, now);
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
function botTryJumpSurvival(me, now) {
  if (me.boost < MANDATED_JUMP_MIN_BOOST) return false;
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
  // universal rule for every weapon.
  // 2v2 (2026-08-07): bots derive the band from lockRange2v2 instead —
  // compressed 50–70 team-synergy table (long locks let a teammate die
  // alone at the front). Units without the field (hidden ones) and every
  // other mode keep lockRange. Mirrored in client updateEnemy.
  const lockRange = (matchState.mode === '2v2' && me.unit?.lockRange2v2)
    ? me.unit.lockRange2v2
    : (me.unit?.lockRange ?? 50);
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
  if (me.grounded && !me.airborne) me.botSightY = me.pos.y;
  const myEyeY = Math.min(me.pos.y, me.botSightY ?? me.pos.y) + BOT_LOS_EYE_HEIGHT;
  // Same grounded latch, at MUZZLE height — the fire gate's line (botShotCanLand).
  const myShotY = Math.min(me.pos.y, me.botSightY ?? me.pos.y) + PROJECTILE_MUZZLE_Y_OFFSET;

  // LoS + threats
  const playerHasLoS = botHasLineOfSight(
    { x: me.pos.x, y: myEyeY, z: me.pos.z },
    { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
    obstacles, surfaces
  );
  // Would the player still be visible from (px, pz)? LoS-gates the range
  // discipline below: never retreat or drift outward past the edge of sight.
  const losFromPoint = (px, pz) => botHasLineOfSight(
    { x: px, y: myEyeY, z: pz },
    { x: opp.pos.x, y: opp.pos.y + BOT_LOS_EYE_HEIGHT, z: opp.pos.z },
    obstacles, surfaces
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

  // HIDE STANCE flag (owner 2026-09-26): read straight off the command
  // side-table (matchState.commands[slot].hide — command.js imports this
  // module, so importing isHideOrdered back would close a cycle), OR the
  // RELOAD HIDE: a manual reload of BOT_RELOAD_HIDE_MIN_MS or more is spent
  // in the stance — entered the tick the reload starts, left the tick it
  // completes. A command-side unit (a side-table entry exists) carries it as
  // hide + hideAuto so the badge shows and its standing move / lock orders
  // are wiped like any hide; a manual stance or a landed order meanwhile
  // clears hideAuto, and only an auto hide is released when the reload ends
  // (a unit released early stays out for the rest of that reload). Bots
  // without an entry (enemies, classic mode) run the same behaviour off
  // botReloadHide alone.
  const cmdEntry = matchState.commands?.[botId] ?? null;
  const rUnit = me.unit ?? {};
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
  const hideMode = me.botSD ? null : (hideOrdered ? 'stance' : (me.botCH ? 'cover' : null));

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
  //                           eyes first (tier 'all'), then live only, then
  //                           a cell the NEAREST enemy cannot see (tier
  //                           'nearest'); still none -> the plain pursue
  //                           legs move it while the search retries.
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
    const hideEnemies = [];
    for (const f of Object.values(matchState.fighters)) {
      if (f.team !== me.team && f.hp > 0) hideEnemies.push(f);
    }
    // Nearest first: eyes[0] is the threat the pacing steers away from.
    hideEnemies.sort((a, b) =>
      Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) - Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z));
    // Enemy eyes stay LIVE (the existing convention — a jumping human must
    // still count); the unit's own eye is the grounded latch (myEyeY).
    const hideEyes = hideEnemies.map((f) => ({ x: f.pos.x, y: f.pos.y + BOT_LOS_EYE_HEIGHT, z: f.pos.z }));
    // Predicted eyes: where each enemy will be BOT_HIDE_PREDICT_S ahead on
    // its live velocity; a near-still enemy adds none (saves the tests).
    const hidePredEyes = [];
    for (let k = 0; k < hideEnemies.length; k += 1) {
      const f = hideEnemies[k];
      const vx = f.vel?.x ?? 0, vz = f.vel?.z ?? 0;
      if (Math.hypot(vx, vz) > BOT_HIDE_PREDICT_MIN_SPEED) {
        hidePredEyes.push({
          x: f.pos.x + vx * BOT_HIDE_PREDICT_S, y: f.pos.y + BOT_LOS_EYE_HEIGHT, z: f.pos.z + vz * BOT_HIDE_PREDICT_S
        });
      }
    }
    const hideMyEye = { x: me.pos.x, y: myEyeY, z: me.pos.z };
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
      const dx = me.pos.x - threat.pos.x, dz = me.pos.z - threat.pos.z;
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
    // Is a route goal still hidden at its tier (live eyes)? (<= 2 LoS tests)
    const hideGoalStillHidden = (goal, tier) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: goal.z };
      const count = tier === 'nearest' ? 1 : hideEyes.length;
      for (let k = 0; k < count; k += 1) {
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
      if (Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z) < 2) {
        hideDropPath();
        me.botHideAnchor = null;
      } else if (!hideGoalStillHidden(goal, me.botHideTier)) {
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
      // The 'nearest' tier only when the unit is NOT already hidden from
      // the nearest enemy — from a nearest-tier hide that search would just
      // re-issue the next nearest-hidden cell every cadence and the unit
      // would shuffle between neighbours instead of pacing its cover.
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
        && matchState.hideSearchTick !== matchState.tick) {
      matchState.hideSearchTick = matchState.tick;
      const stage = Math.min(me.botHideSearchStage ?? 0, hideAttempts.length - 1);
      const attempt = hideAttempts[stage];
      const found = findHiddenSpot(
        navGridFor(arena), me.pos.x, me.pos.z, myFloorY, attempt.eyes, obstacles,
        { maxPops: BOT_HIDE_MAX_POPS, minDistFrom: attempt.minDistFrom, within: attempt.within ?? null, deadline: matchState.searchDeadline ?? 0 }
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
          && Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z) < 2) {
        me.botHidePathIdx += 1;
        wp = hp[me.botHidePathIdx];
      }
      let tx = wp.x - me.pos.x, tz = wp.z - me.pos.z;
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
          || Math.hypot(me.pos.x - me.botHideMoveAnchor.x, me.pos.z - me.botHideMoveAnchor.z) > 1) {
        me.botHideMoveAnchor = { x: me.pos.x, z: me.pos.z, at: now };
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
      // every eye of its tier — the predicted eyes too when possible (pass
      // 0), live eyes only as the fallback (pass 1). The current leg is
      // re-checked against the live eyes every tick and re-picked at
      // BOT_HIDE_DRIFT_MS: 8 headings from a random phase, scored away from
      // the nearest enemy with a little continuity and noise so the pacing
      // reads as a person, not a metronome. No hidden leg at all (a tight
      // nook) -> stand for BOT_HIDE_DRIFT_RETRY_MS, then try again.
      const paceEyes = hideTier === 'all' ? hideEyes : hideEyes.slice(0, 1);
      const pacePred = hideTier === 'all' ? hidePredEyes : [];
      if (!me.botHideAnchor) me.botHideAnchor = { x: me.pos.x, z: me.pos.z };
      const anchor = me.botHideAnchor;
      const legOk = (hx, hz, strict) => {
        const lx = me.pos.x + hx * BOT_HIDE_LEG, lz = me.pos.z + hz * BOT_HIDE_LEG;
        if (Math.hypot(lx - anchor.x, lz - anchor.z) > BOT_HIDE_LEASH) return false;
        if (walkSegmentBlocked(me.pos.x, me.pos.z, lx, lz, me.pos.y, obstacles)) return false;
        const eye = { x: lx, y: myEyeY, z: lz };
        for (let k = 0; k < paceEyes.length; k += 1) if (botHasLineOfSight(paceEyes[k], eye, obstacles, surfaces)) return false;
        if (strict) for (let k = 0; k < pacePred.length; k += 1) if (botHasLineOfSight(pacePred[k], eye, obstacles, surfaces)) return false;
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
  // ===== SUDDEN DEATH BRAIN (sim prototype; see the BOT_SD note) =====
  // Per-fighter overrides (me.botSDOpts) let the harness A/B two rule sets
  // inside one match; the fire block below reads SDG too.
  const SDG = me.botSD ? (me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD) : null;
  if (me.botSD && !defenseLive) {
    const SD = SDG;
    const sdEnemies = [];
    for (const f of Object.values(matchState.fighters)) {
      if (f.team !== me.team && f.hp > 0) sdEnemies.push(f);
    }
    sdEnemies.sort((a, b) =>
      Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) - Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z));
    // "Exposed" is judged on the MUZZLE line with the projectile rules (the
    // line botShotCanLand fires along, both ends at +PROJECTILE_MUZZLE_Y_OFFSET):
    // on Factory the eye line (+1.6) is blocked by the 4-5 high belts and
    // crates that a muzzle line (+3.15) clears, and a 1 HP unit "hidden" by
    // eye was shot over them in the first smoke runs.
    const sdClear = (p0, p1) => {
      // (broadphase: only the boxes near the segment — see navgrid sightClear)
      const cand = obstaclesNearSegment(obstacles, p0, p1);
      for (let i = 0; i < cand.length; i += 1) {
        const o = cand[i];
        if (o.noProjectile) continue;
        if (segmentHitsObstacle(p0, p1, o)) return false;
      }
      return !(surfaces && projectileHitsSurface(p0, p1, surfaces));
    };
    const sdEyes = sdEnemies.map((f) => ({ x: f.pos.x, y: f.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: f.pos.z }));
    const sdMyEye = { x: me.pos.x, y: myShotY, z: me.pos.z };
    // SHOULDERS (owner 2026-10-06, "隱蔽判定把左右 1.6 u 的肩膀一起算"): a
    // hidden test sees the unit's whole width — the centre and the two
    // points `shoulder` (the hit radius) to either side across the eye's
    // line — so a hug spot never leaves a shoulder out past the cover's
    // edge (the "killed behind cover" deaths: the brain's centre point was
    // hidden, the hitbox was not). The unit's OWN firing lines stay the
    // centre (the gun is there).
    const sdSeenFrom = (eye, x, y, z) => {
      if (sdClear(eye, { x, y, z })) return true;
      let nx = eye.z - z, nz = x - eye.x;
      const nl = Math.hypot(nx, nz) || 1;
      nx = nx / nl * SD.shoulder; nz = nz / nl * SD.shoulder;
      return sdClear(eye, { x: x + nx, y, z: z + nz }) || sdClear(eye, { x: x - nx, y, z: z - nz });
    };
    let sdHidden = true;
    let sdThreat = sdEnemies[0] ?? opp;   // the enemy whose line is open on the unit (else the nearest)
    for (let k = 0; k < sdEyes.length; k += 1) {
      if (sdSeenFrom(sdEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z)) { sdHidden = false; sdThreat = sdEnemies[k]; break; }
    }
    // SD BAND — THE ENGAGE RANGE (owner 2026-10-07, "in SD the BOT don't use
    // Lockrange, they use the engage range to keep themselves from instant
    // killed according to the opponent enemy"): the band is read off the
    // guns (BOT_SD engageWindowMs). SD_BAND_MARK
    // RISK SPEED (owner 2026-10-05, "make it not underestimate it"): the
    // exposure model moves the unit at its own sprint, measured 24-32 u/s
    // (sprintSpeed 11.76 + the dash momentum), not the old 16.8 constant
    // that read a 0.5 s crossing at 60 u as 38% dead. riskSprintFactor
    // keeps a margin for the momentum build-up and a human's hand lead.
    const sdSprint = (me.unit?.sprintSpeed ?? BOOST_MOVE_SPEED) * SD.riskSprintFactor;
    // Each live enemy's floor: the distance its gun needs to kill a lateral
    // sprinter in the first second (sdEngageFloor) — parallel to sdEnemies.
    const sdFloors = sdEnemies.map((f) => sdEngageFloor(f.unit, SD, sdSprint));
    // The fight band is the TARGET's: floor = its gun's engage floor, far
    // edge = the unit's own reach (sdOwnReach), bandHalf steps between.
    // (Marina's 0.06 cone reaches 53 u but her floor against most guns is
    // 120: the band collapses onto the floor — safety first, as asked.)
    const sdLower = sdEngageFloor(opp.unit, SD, sdSprint);
    const sdReach = sdOwnReach(me.unit);
    const sdOptimal = Math.max(sdLower, Math.min(sdReach, sdLower + SD.bandHalf));
    const sdUpper = Math.max(sdLower, Math.min(sdReach, sdOptimal + SD.bandHalf));
    me.botSDUpper = sdUpper;
    me.botSDLower = sdLower;
    // TWO ENEMIES (owner: "position themselves in a position that fits the
    // range from both enemies"): a planned position keeps EVERY live
    // enemy's floor (less `slack`), not only the target's.
    const sdOutsideFloors = (gx, gz, slack = 0) => {
      for (let k = 0; k < sdEnemies.length; k += 1) {
        const f = sdEnemies[k];
        if (Math.hypot(gx - f.pos.x, gz - f.pos.z) < sdFloors[k] - slack) return false;
      }
      return true;
    };
    // Lateral fraction of a heading (hx, hz) relative to the threat's line.
    const sdLateral = (hx, hz) => {
      let lx = sdThreat.pos.x - me.pos.x, lz = sdThreat.pos.z - me.pos.z;
      const ll = Math.hypot(lx, lz) || 1;
      return Math.abs(hx * lz - hz * lx) / ll;
    };
    // Can the unit's own shot reach the lock target from here? (The fire
    // block's line; the peek clock runs on it.)
    const sdOppClear = sdClear(sdMyEye, { x: opp.pos.x, y: opp.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: opp.pos.z });
    if (sdOppClear || me.botSDLastClearAt == null) me.botSDLastClearAt = now;
    const sdNoShotTime = now - me.botSDLastClearAt;
    // COVER PROXIMITY (play test 2026-10-05, "walks into open dead space like
    // taking a walk"): the muzzle-line test alone called half the map
    // "hidden" whenever the enemy stood behind something far away, and the
    // unit strolled across open floor at walk speed. Open ground (no
    // muzzle-blocking cover within openDist) is never safe: hop goals stand
    // next to cover, routes are charged for open cells, open ground is
    // crossed at a sprint and never dwelt on.
    const sdGrid = navGridFor(arena);
    const sdCoverDist = coverDistanceAt(sdGrid, me.pos.x, me.pos.z, myFloorY, obstacles);
    const sdOpen = sdCoverDist > SD.openDist;
    const sdFar = dist > sdUpper + SD.farDist;
    // Hop goals are chosen hidden from the enemies' PREDICTED positions too
    // (predictS ahead on their live velocity) — a human reads where the
    // enemy is heading, not only where it stands.
    const sdPredEyes = [];
    for (let k = 0; k < sdEnemies.length; k += 1) {
      const f = sdEnemies[k];
      const vx = f.vel?.x ?? 0, vz = f.vel?.z ?? 0;
      if (Math.hypot(vx, vz) > 1) {
        sdPredEyes.push({ x: f.pos.x + vx * SD.predictS, y: f.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: f.pos.z + vz * SD.predictS });
      }
    }
    // The risk model judges a route against the live and PREDICTED eyes (not
    // the spread ones: those are a sidestep that may never happen).
    const sdRiskEyes = sdEyes.concat(sdPredEyes);
    const sdThreatMoving = Math.hypot(sdThreat.vel?.x ?? 0, sdThreat.vel?.z ?? 0) > SD.shadowMaxSpeed;
    // (The 2026-10-05 "sure shot" range gate — a hit-chance test that opened
    // the peek, the fight window and a long-range FIRE hop on a slow target
    // — is gone the same day, owner: "not even logically related". The
    // engagement is the band; the far side of a map is reached by crossing
    // it — the jump links and the shadow walk below.)
    // EYE SPREAD (play test 2026-10-05): a human strafes constantly, and a
    // cell hidden from the enemy's exact position opens the moment they
    // step sideways. Hop goals and routes are judged against the enemy's
    // position PLUS eyes eyeSpread to either side of the line, so the
    // chosen cover holds for a sidestep.
    if (SD.eyeSpread > 0) {
      for (let k = 0; k < sdEnemies.length; k += 1) {
        const f = sdEnemies[k];
        let lx = f.pos.x - me.pos.x, lz = f.pos.z - me.pos.z;
        const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const ey = f.pos.y + PROJECTILE_MUZZLE_Y_OFFSET;
        sdPredEyes.push({ x: f.pos.x - lz * SD.eyeSpread, y: ey, z: f.pos.z + lx * SD.eyeSpread });
        sdPredEyes.push({ x: f.pos.x + lz * SD.eyeSpread, y: ey, z: f.pos.z - lx * SD.eyeSpread });
      }
    }
    const sdSearchEyes = sdEyes.concat(sdPredEyes);
    // Avoid marks (rejected stretches, refused corridors) expire by time or
    // once the threat has moved watchMoveTol (a different line now); the
    // last hidden spot is the back-off target when caught in a corridor.
    if (me.botSDAvoid && me.botSDAvoid.length) {
      me.botSDAvoid = me.botSDAvoid.filter((a) => now < a.until
        && (a.pinned || Math.hypot(sdThreat.pos.x - a.tx, sdThreat.pos.z - a.tz) <= SD.watchMoveTol));
    }
    if (sdHidden) me.botSDLastHidden = { x: me.pos.x, z: me.pos.z };
    const sdAvoid = (me.botSDAvoid && me.botSDAvoid.length) ? me.botSDAvoid : null;
    // (an ESCAPE search ignores the risk marks — the unit must move — but
    // never the pinned ones: a wall it just wedged on is still a wall)
    const sdAvoidPinned = (() => { const p = sdAvoid ? sdAvoid.filter((a) => a.pinned) : []; return p.length ? p : null; })();
    // (a pinned mark — a stuck waypoint — outlives the threat's movement)
    const sdMark = (x, z, ms = SD.avoidMs, pinned = false) => {
      if (!me.botSDAvoid) me.botSDAvoid = [];
      for (const a of me.botSDAvoid) {
        if (Math.hypot(a.x - x, a.z - z) <= a.r) { a.until = Math.max(a.until, now + ms); a.pinned = a.pinned || pinned; return; }
      }
      me.botSDAvoid.push({ x, z, r: SD.avoidR, until: now + ms, tx: sdThreat.pos.x, tz: sdThreat.pos.z, pinned });
    };
    // Enemy fire windows: every live enemy out of rounds with at least
    // freeMinMs of reload left -> a free window (the budget and the dwell
    // are suspended). Off when readReload is false.
    let sdFree = SD.readReload && sdEnemies.length > 0;
    if (sdFree) {
      for (const f of sdEnemies) {
        const fu = f.unit ?? {};
        const out = fu.magCapacity != null && f.ammo <= 0 && (f.reloadingUntil ?? 0) > now + SD.freeMinMs;
        if (!out) { sdFree = false; break; }
      }
    }
    const sdU = me.unit ?? {};
    const sdMyEmpty = sdU.magCapacity != null && me.ammo <= 0;
    const sdMyReloadLeft = sdMyEmpty ? Math.max(0, (me.reloadingUntil || (now + (sdU.reloadMs ?? 0))) - now) : 0;
    // Exposure clock: starts the tick the first enemy eye sees the unit.
    if (!sdHidden) {
      if (me.botSDExposedAt == null) {
        me.botSDExposedAt = now;
        // A deliberate peek buys its own window; being caught buys exposeMs.
        const watching = now < (me.botSDWatchUntil ?? 0) && !me.botSDPath;
        // (a peek's window carries the pre-aimed acquisition in front of the
        // burst: peekAimMs, then peekMs of fire, then the dodge back; the
        // fire block reads botSDPlanned for its reaction)
        // (an ENGAGE hop's crossing was chosen for its line: pre-aimed too —
        // factory2 idle trace 2026-10-07, seed 12: a 4 u gap crossed in
        // 176 ms opened nothing against the 250 ms reaction and the unit
        // shuttled 60 u out and back 29 times without a shot)
        me.botSDPlanned = !!(me.botSDPeekArmed || watching || me.botSDEngageRun);
        // (no time budget any more — re-check 2026-10-08: the window ends on
        // the tank reserve, the empty magazine, the strafe cap, the spent
        // dodge or the leave-risk, sdOverBudget; the old botSDExposeBudget
        // was written here and read nowhere)
        // (a fire hop's pre-aimed window is for its cell: a shoulder glimpse
        // on the approach, with no line of its own, does not spend it — the
        // cell then opened with no window and the unit dodged back without a
        // shot: "goes near, backs off", Hina Factory opening 2026-10-07)
        if (!me.botSDFireGoal || sdOppClear) me.botSDPeekArmed = false;
        me.botSDWatchFight = watching;
        if (watching) { me.botSDWatchUntil = 0; me.botSDExchanges = (me.botSDExchanges ?? 0) + 1; }
        me.botSDExposures = (me.botSDExposures ?? 0) + 1;
        me.botSDWindowStart = { x: me.pos.x, z: me.pos.z };   // (where this window's strafe begins — the dodge-back cap below)
      }
    } else {
      me.botSDExposedAt = null;
      me.botSDWatchFight = false;
      me.botSDPlanned = false;
    }
    const sdExposedFor = sdHidden ? 0 : now - me.botSDExposedAt;
    // The fight window is only worth standing for inside the band (the unit's
    // own shots land there); exposed beyond it — Factory's 190 u lanes — or
    // out of rounds, break off at once (firing on the way).
    const sdFightOk = dist <= sdUpper + SD.fightSlack;
    // THE FIGHT, not hide-and-seek (owner 2026-10-07, "it shouldn't be a hide
    // and seek"): exposed in the band the unit FIGHTS — the lateral sprint is
    // its defence (the enemy's no-lead rounds miss a sprinting side-on target
    // past 41 u, 84 u at the bloom cap) — and breaks off only when the tank
    // can no longer pay for the sprint AND the dodge step out (dashFloor +
    // the step's cost), or the magazine is empty. The time budgets (exposeMs,
    // peekMs) no longer end a window; the exposure clock still times the
    // reaction and the dodge-back bookkeeping.
    // Beyond the band a sighting is a long-range exchange, not a capture: the
    // unit keeps closing on the covered list, lateral, firing on the way
    // (Airport: "retreat back to the side ways after invincible wears off" —
    // the nearest hidden cell from the ramp top was the side wall behind).
    // RETREAT RESERVE (owner 2026-10-07, "BOT still dies fast"): every death
    // in the camper traces (tank sc 81-83) was the same picture — the tank
    // ran dry in the open: boost 7-12, the dash over, walking in a clear
    // line at 50-70 u (a dash drains 1.1 a tick, 69 a second; 250 boost is
    // 3.6 s of sprint). "The tank says stop" is read honestly now: the fight
    // window and a planned exposure end while the unit can still SPRINT
    // BACK to the last spot it was hidden at (botSDLastHidden) and dodge —
    // not at a fixed 56. sdSprintCost prices a sprint of d u at the dash
    // speed the risk model uses (sdSprint).
    const sdDrainPerS = (sdU.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK) * (1000 / TICK_RATE_MS);
    const sdSprintCost = (d) => d / sdSprint * sdDrainPerS;
    const sdStepCost = sdU.stepBoostCost ?? STEP_BOOST_COST;
    const sdBackDist = (!sdHidden && me.botSDLastHidden) ? Math.hypot(me.botSDLastHidden.x - me.pos.x, me.botSDLastHidden.z - me.pos.z) : 0;
    const sdCanFight = me.boost > SD.dashFloor + sdStepCost + sdSprintCost(sdBackDist);
    // A PLANNED exposure (stand peek, fire hop, engage crossing) starts only
    // with its whole price in the tank: the leg out (peekLegMax at a
    // sprint), the fight window (peekMs), the dodge back and the floor —
    // about 100 for a 10 u leg. (Replaces the peekBoostMin 60 knob: peeks
    // started on 60 ended with the unit walking in the open on 7.)
    const sdPeekNeed = SD.dashFloor + sdStepCost + sdSprintCost(SD.peekLegMax) + sdDrainPerS * (SD.peekMs + SD.peekJitterMs / 2) / 1000;
    // LEAVE WHEN THE MODEL SAYS SO (owner 2026-10-07, "BOT still dies
    // fast"): the camper traces also killed the unit ON the lateral sprint
    // (tank sc 82, 84) — the camper's cone was at its cap from the last
    // exchange, and a sprayed Saori cone lands 40-50%/s on a sprinter at
    // 60-70 u (capsuleHitFrac). The lateral sprint is the defence against a
    // gun that has NOT been fired for a second; against a held trigger only
    // the exposure's length is. So a window also ends the moment the risk
    // of the way out — the dodge back (stepDurationMs) for a planned
    // exposure, the sprint back to the last hidden spot otherwise — read
    // against the threat's LIVE bloom and the time already exposed, passes
    // the deliberate cap: every later tick is worse. Against a clean gun
    // this is a long window (its first rounds miss a sprinter); against a
    // spraying one it is the free reaction time and no more. The enemy
    // without rounds (sdFree) still suspends everything.
    const sdThreatDist = Math.hypot(sdThreat.pos.x - me.pos.x, sdThreat.pos.z - me.pos.z);
    // ROUNDS IN THE AIR (Factory opening trace 2026-10-09): a round the
    // threat fired while the unit was in its line flies dist / projectile
    // speed after the trigger (0.27 s at 160 u for a 600 u/s gun). The unit
    // that passed behind a cover edge and turned straight onto its route's
    // heading died to the round aimed at where it had just been: the
    // crossing (lateral, at a sprint) is kept for the flight time after
    // the line closes while the threat fired inside it. (The trigger is
    // heard — the shot, not the magazine.)
    if (!sdHidden) me.botSDSeenAt = now;
    const sdFlightMs = SD.flightKeep * sdThreatDist / (sdThreat.unit?.projectileSpeed ?? 600) * 1000;
    const sdIncoming = sdHidden && (sdThreat.lastFireAt ?? -1e9) > now - sdFlightMs && (me.botSDSeenAt ?? -1e9) > now - sdFlightMs;
    const sdLeaveMs = me.botSDPlanned ? (sdU.stepDurationMs ?? STEP_DURATION_MS) : sdBackDist / sdSprint * 1000;
    // THE DODGE MUST LAND HIDDEN (tank sc 81-83 after the rules above): the
    // window strafes away from the edge it stepped out of, and the dodge
    // back covers stepDistance; a strafe longer than that minus the
    // shoulders ends the dodge still in the line — and the step ends in a
    // dead stop, where the rounds fired at the dodging unit land. So a
    // planned window ends once its strafe has used up what the dodge can
    // bring back.
    const sdStrafeMax = (sdU.stepDistance ?? STEP_DISTANCE) - 2 * SD.shoulder;
    // (peeks and fire hops only — an engage crossing runs its whole leg exposed by design and ends hidden on its own)
    const sdStrafed = (me.botSDPlanned && me.botSDPeekOrigin && !me.botSDEngageRun && me.botSDWindowStart) ? Math.hypot(me.pos.x - me.botSDWindowStart.x, me.pos.z - me.botSDWindowStart.z) : 0;
    // (a planned exposure still in the line after its dodge — the step ran
    // into a wall, tank sc 88 — does not resume the window: it leaves)
    const sdDodgeSpent = me.botSDPlanned && me.botSDPeekStepped && now >= (me.stepUntil ?? 0);
    const sdMustLeave = !sdHidden && (sdStrafed >= sdStrafeMax || sdDodgeSpent
      || sdExposureRisk(sdThreat, SD, sdThreatDist, 1, sdLeaveMs, sdExposedFor, sdSprint) > SD.engageRiskCap);
    // NO PEEK WITHOUT THE DODGE IN HAND (tank sc 84, 87): the step's cooldown
    // (1175 ms) outlasts a peek cycle, and a window that ended with the step
    // on cooldown had only a sprint back — which reversed into the rounds
    // aimed at where the unit had just been. A planned exposure starts only
    // with the dodge ready.
    const sdDodgeReady = now >= (me.stepCooldownUntil ?? 0);
    const sdOverBudget = !sdHidden && !sdFree && ((sdFightOk && (!sdCanFight || sdMyEmpty)) || sdMustLeave);
    const sdSeenFar = !sdHidden && !sdFightOk;
    const sdGoalHidden = (goal) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z: goal.z };
      for (let k = 0; k < sdEyes.length; k += 1) {
        if (sdSeenFrom(sdEyes[k], gEye.x, gEye.y, gEye.z)) return false;
      }
      return true;
    };
    const sdDrop = () => {
      me.botSDPath = null;
      me.botSDPathIdx = null;
      me.botSDGoal = null;
      me.botSDMoveAnchor = null;
      me.botSDGoalMayShow = false;
      me.botSDSlideUntil = 0;
      me.botSDEngageRun = false;
      me.botSDFireGoal = false;
      // (re-check 2026-10-08: the retreat flag used to outlive a dropped
      // route — bail, wedge, corridor, ledge, watchdog, immunity — and the
      // next arrival of ANY hop read as "back at the peek's cover": no
      // peek-count reset, a stale "fought" arming the cycle)
      me.botSDRetreatRoute = false;
      // (a parked peek cycle dies with the route: it must not come back to
      // life after some later, unrelated dodge — the window now counts from
      // the dodge's cooldown end)
      me.botSDCycleArm = null;
    };
    // STUCK WATCHDOG (owner 2026-10-05, "BOT still get stuck from time to
    // time"): standing within stuckMoveMin for stuckMs with no reason to —
    // a deliberate stand is hidden, hugging cover and inside holdMaxMs
    // without a line — is stuck whatever the state: the spot is marked
    // (pinned), route and peek dropped, and the plain brain takes the legs
    // for plainMs (its own wedge detectors run in that window; the SD fire
    // rules stay).
    if (!me.botSDWd || Math.hypot(me.pos.x - me.botSDWd.x, me.pos.z - me.botSDWd.z) > SD.stuckMoveMin) me.botSDWd = { x: me.pos.x, z: me.pos.z, at: now };
    const sdDeliberate = sdHidden && sdCoverDist <= SD.hugDist && sdNoShotTime < SD.holdMaxMs;
    if (now - me.botSDWd.at > SD.stuckMs && !sdDeliberate && !me.airborne && now >= (me.botSDPlainUntil ?? 0)) {
      sdMark(me.pos.x, me.pos.z, SD.stuckAvoidMs, true);
      sdDrop();
      me.botSDPeekTo = null; me.botSDPeekArmed = false; me.botSDBackOff = false; me.botSDPeekAnchor = null;
      me.botSDWatchUntil = 0; me.botSDDwellUntil = 0;
      me.botSDPlainUntil = now + SD.plainMs;
      me.botSDSearchAt = now + SD.plainMs;
      me.botSDStucks = (me.botSDStucks ?? 0) + 1;
      // (re-check 2026-10-08: the stuck clock restarts when the SD brain
      // gets the legs BACK, not now — with plainMs == stuckMs it re-fired on
      // the first tick after the window, before the deferred search could
      // run, every 3 s for as long as the plain legs did not move it 3 u)
      me.botSDWd = { x: me.pos.x, z: me.pos.z, at: now + SD.plainMs };
    }
    // SPAWN IMMUNITY (owner 2026-10-07, "無敵期間當 normal bot 走"): while the
    // unit cannot be hurt, cover buys nothing — the legs are the normal
    // bot's (pursue / maze, straight at the target) and the SD planning
    // waits; the first vulnerable tick searches from wherever the run got
    // to. The SD fire rules stay. (Airport: the covered search's first hops
    // from the spawn hugged the terminal's side wall; the normal bot's 3 s
    // reach the concourse.) Only while TRAVELLING (far outside the band):
    // an immune spawn within the band walked into the enemy's view and
    // stood there at the first vulnerable tick (mid-map spawns, SD 92% ->
    // 81%); in contact the SD brain keeps the legs, immune or not.
    if (now < (me.invulnerableUntil ?? 0) && dist > sdUpper + SD.farDist) {
      if (me.botSDPath || me.botSDPeekTo) {
        sdDrop();
        me.botSDPeekTo = null; me.botSDPeekArmed = false; me.botSDBackOff = false; me.botSDPeekAnchor = null;
      }
      // (2026-10-09: an early SD handover — the brain taking the legs 600 ms
      // before the immunity lapsed, to be in cover at the lapse — was
      // measured and dropped: Factory opening, SD seat A, Atsuko 83% -> 42%,
      // Hina seat B 100% -> 75%; the route planned from mid-run was worse
      // than the plain run's end point plus a search there)
      me.botSDPlainUntil = Math.max(me.botSDPlainUntil ?? 0, me.invulnerableUntil);
      me.botSDSearchAt = Math.max(me.botSDSearchAt ?? 0, me.invulnerableUntil);
      me.botSDWatchUntil = 0;
      me.botSDDwellUntil = 0;
      // (the search starts from where the normal bot's legs got to, not
      // from the spawn the pace anchor was pinned at: Airport, the first
      // hop at 3 s routed from the spawn back down the ramp)
      me.botSDPaceAnchor = null;
    }
    const sdDwell = () => (dist > sdUpper + 30 && !playerHasLoS)
      ? SD.farDwellMs
      : SD.dwellMinMs + Math.random() * (SD.dwellMaxMs - SD.dwellMinMs);
    // Hop searches start from the cover's anchor point (where the unit
    // arrived), not from wherever the cover pacing left it: a 2 u shift of
    // the start node flipped the opening hop to a longer, deadlier route
    // (measured: Saori's A-seat opening losses 0 -> 15 of 40).
    const sdSearchX = me.botSDPaceAnchor ? me.botSDPaceAnchor.x : me.pos.x;
    const sdSearchZ = me.botSDPaceAnchor ? me.botSDPaceAnchor.z : me.pos.z;
    // RISK GATE for a planned hop (BOT_SD riskCap): the estimated death
    // chance of the route must stay under the cap (engage cap for deliberate
    // crossings; after patienceMs of holding, the patience cap). A rejected
    // route marks its first exposed stretch avoid. Escapes and free windows
    // (the enemy out of rounds) are not gated.
    const sdRiskCap = (engage) => {
      const since = me.botSDRiskHoldSince ?? me.botSDIdleSince;
      const waited = since != null ? now - since : 0;
      const cap = engage ? SD.engageRiskCap : SD.riskCap;
      return waited > SD.patienceMs ? Math.max(cap, SD.patienceCap) : cap;
    };
    const sdRiskReject = () => {
      me.botSDRiskRejects = (me.botSDRiskRejects ?? 0) + 1;
      if (me.botSDRiskHoldSince == null) me.botSDRiskHoldSince = now;
    };
    // LATERAL CROSSING (owner 2026-10-05, "keep the unit in vertical moving
    // angle"): a jump-link crossing the threat can see is made only ACROSS
    // its line — the crossing direction's lateral fraction at least
    // lateralMin, like every other exposed crossing. An along-line one is
    // rejected and its ledge marked, so the next search takes a link farther
    // along the trench or a hidden one. Returns the offending ledge or null.
    const sdCrossingBad = (path) => {
      let px = sdSearchX, pz = sdSearchZ, py = myFloorY;
      for (let i = 0; i < path.length; i += 1) {
        const q = path[i], qy = q.y ?? py;
        if (Math.abs(qy - py) > 1.7) {
          const mx = (px + q.x) / 2, mz = (pz + q.z) / 2;
          const mid = { x: mx, y: Math.max(py, qy) + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z: mz };
          let exposed = false;
          for (let e = 0; e < sdRiskEyes.length && !exposed; e += 1) if (sdClear(sdRiskEyes[e], mid)) exposed = true;
          if (exposed) {
            const dx = q.x - px, dz = q.z - pz, dl = Math.hypot(dx, dz) || 1;
            let lx = sdThreat.pos.x - mx, lz = sdThreat.pos.z - mz;
            const ll = Math.hypot(lx, lz) || 1;
            const lat = Math.abs((dx / dl) * (lz / ll) - (dz / dl) * (lx / ll));
            if (lat < SD.lateralMin) return { x: q.x, z: q.z };
          }
        }
        px = q.x; pz = q.z; py = qy;
      }
      return null;
    };
    // `deliberate`: a planned exposure (engage hop, FIRE hop) is read against
    // engageRiskCap like the stand peek — the same manoeuvre family: open a
    // line, fire the window, dodge back. (owner 2026-10-07: the fire hop sat
    // on the plain cap and was the most-rejected move in the band)
    const sdHopOk = (found, engage, capScale = 1, deliberate = engage) => {
      const badLedge = sdCrossingBad(found.path);
      if (badLedge) { sdMark(badLedge.x, badLedge.z, SD.stuckAvoidMs, true); sdRiskReject(); return false; }
      // NO OVERSHOOT (owner 2026-10-07, "goes very near to enemy without
      // good reason just to back off again"): a planned hop never passes
      // nearer the target than where it ends (bandSlack of slack) — a
      // "better position" hop ran a hidden 101 u detour past the target at
      // 33 u to reach a 61 u spot on its far side (tank trace, seed 81).
      // Escapes are unbounded.
      // (not the engage hop: its crossing runs in front of the target's
      // cover by design and is gated by the engage cap; Hina's camper kills
      // were all crossings, and the rule rejected 25 of them in 90 s)
      if (!sdOverBudget && !engage && found.goal) {
        const gd = Math.hypot(found.goal.x - opp.pos.x, found.goal.z - opp.pos.z);
        let px = sdSearchX, pz = sdSearchZ, minD = Infinity, nearest = null;
        for (let i = 0; i < found.path.length; i += 1) {
          const q = found.path[i];
          const len = Math.hypot(q.x - px, q.z - pz), nSub = Math.max(1, Math.ceil(len / 2));
          for (let s = 1; s <= nSub; s += 1) {
            const x = px + (q.x - px) * s / nSub, z = pz + (q.z - pz) * s / nSub;
            const d = Math.hypot(x - opp.pos.x, z - opp.pos.z);
            if (d < minD) { minD = d; nearest = { x, z }; }
          }
          px = q.x; pz = q.z;
        }
        if (minD < gd - SD.bandSlack) {
          if (nearest) sdMark(nearest.x, nearest.z);
          me.botSDOvershoots = (me.botSDOvershoots ?? 0) + 1;
          return false;
        }
      }
      // ENGAGE ROUTE (Airport idle trace 2026-10-05, seed 14): the straight
      // run's midpoint saw the target but the ROUTE detoured round the
      // hangar and never showed — five 60 u loops out and back in 20 s. An
      // engage hop must open the line somewhere along its actual route (an
      // exposed piece against the live / predicted eyes).
      if (engage) {
        const rr = sdRouteRisk(found.path, sdSearchX, sdSearchZ, myFloorY, sdRiskEyes, sdThreat, SD, sdClear, sdSprint);
        if (!rr.first) return false;
        if (sdFree || sdOverBudget) return true;
        if (sdSprintCost(rr.exposedLen) > me.boost - SD.dashFloor) { sdRiskReject(); return false; }   // (the tank: see below)
        me.botSDLastRisk = rr.risk;
        if (rr.risk <= sdRiskCap(true) * capScale) return true;
        sdMark(rr.first.x, rr.first.z);
        sdRiskReject();
        return false;
      }
      if (sdFree || sdOverBudget) return true;
      const rr = sdRouteRisk(found.path, sdSearchX, sdSearchZ, myFloorY, sdRiskEyes, sdThreat, SD, sdClear, sdSprint);
      // THE TANK (owner 2026-10-07, "BOT still dies fast"): the route risk
      // prices the exposed stretches at a sprint; a hop started without
      // the boost to sprint them walks them instead (tank sc 83: a
      // relocation started on 8 boost walked into a clear line at 61 u and
      // died). No planned hop starts that the tank cannot sprint; escapes
      // and free windows (above) are not gated — the unit must move.
      if (sdSprintCost(rr.exposedLen) > me.boost - SD.dashFloor) { sdRiskReject(); return false; }
      let risk = rr.risk;
      if (deliberate && !engage && found.goal) {
        // FIRE WINDOW (owner 2026-10-07): a fire hop ends standing in the
        // line for the peek window — the exposure the stand peek is read
        // for; the route risk alone read the lunge as free (human-like
        // smoke: 15 a minute at 25-45 u, each 30-60% dead).
        const gd = Math.hypot(found.goal.x - opp.pos.x, found.goal.z - opp.pos.z);
        const win = sdExposureRisk(sdThreat, SD, gd, 1, SD.peekAimMs + SD.peekMs + SD.peekJitterMs / 2, SD.fireHopSeenMs, sdSprint);
        risk = 1 - (1 - risk) * (1 - win);
      }
      me.botSDLastRisk = risk;
      if (risk <= sdRiskCap(deliberate) * capScale) return true;
      if (rr.first) sdMark(rr.first.x, rr.first.z);
      sdRiskReject();
      return false;
    };
    // LINE-CAPABLE (BOT_SD peekableBonus): from (x, z) a lateral leg (the
    // two perpendiculars and the two rotated 30 deg toward the target, at
    // peekLeg and 1.75 x) is walkable and its end has a muzzle line to the
    // target — the stand peek's precondition.
    const sdOppMuzzle = { x: opp.pos.x, y: opp.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: opp.pos.z };
    // WIDE LINE: a muzzle at (x, y, z) AND both shoulders (shoulder u either
    // side, across the target line) see the target's muzzle — a slit that
    // closes on the first strafe step is not a firing cell (Hina, Factory
    // opening 2026-10-07: the window opened for one tick).
    const sdWideLine = (x, y, z) => {
      if (!sdClear({ x, y, z }, sdOppMuzzle)) return false;
      let nx = opp.pos.z - z, nz = x - opp.pos.x;
      const nl = Math.hypot(nx, nz) || 1;
      nx = nx / nl * SD.shoulder; nz = nz / nl * SD.shoulder;
      return sdClear({ x: x + nx, y, z: z + nz }, sdOppMuzzle) && sdClear({ x: x - nx, y, z: z - nz }, sdOppMuzzle);
    };
    const sdPeekableAt = (x, z, fy) => {
      const my = fy + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET;
      let lx = opp.pos.x - x, lz = opp.pos.z - z;
      const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
      const heads = [[-lz, lx], [lz, -lx], [-lz * 0.866 + lx * 0.5, lx * 0.866 + lz * 0.5], [lz * 0.866 + lx * 0.5, -lx * 0.866 + lz * 0.5]];
      for (let h = 0; h < heads.length; h += 1) {
        const cx = heads[h][0], cz = heads[h][1];
        for (const L of [SD.peekLeg, SD.peekLeg * 1.75, SD.peekLegMax]) {
          const px = x + cx * L, pz = z + cz * L;
          if (walkSegmentBlocked(x, z, px, pz, fy + GROUND_BASE_Y, obstacles)) break;
          if (sdClear({ x: px, y: my, z: pz }, sdOppMuzzle)) return true;
        }
      }
      return false;
    };
    // POSITION SCORE (BOT_SD holdScore): 0 when a live eye sees the muzzle
    // there; else 1 + strict-hidden + cover + exits covered / 2 + band
    // + peekableBonus when line-capable.
    const sdPosScoreAt = (x, z, fy) => {
      const eye = { x, y: fy + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z };
      for (let k = 0; k < sdEyes.length; k += 1) if (sdClear(sdEyes[k], eye)) return 0;
      let s = 1, strictHidden = true;
      for (let k = 0; k < sdPredEyes.length; k += 1) if (sdSeenFrom(sdPredEyes[k], eye.x, eye.y, eye.z)) { strictHidden = false; break; }
      if (strictHidden) s += 1;
      if (coverDistanceAt(sdGrid, x, z, fy, obstacles) <= SD.hugDist) s += 1;   // hugging the cover, not standing in its shadow
      s += Math.min(4, watchScore(x, z, fy)) * 0.5;
      const d = Math.hypot(opp.pos.x - x, opp.pos.z - z);
      if (sdOutsideFloors(x, z) && d <= sdUpper + SD.bandSlack) s += 1;   // (the engage floor of every enemy: a cell inside one is not "in band")
      if (sdPeekableAt(x, z, fy)) s += SD.peekableBonus;
      return s;
    };
    // 1. Route bookkeeping: arrived -> drop and dwell; goal uncovered by a
    //    moving enemy -> drop (a fresh search follows).
    if (me.botSDPath) {
      const goal = me.botSDGoal;
      // FIRE HOP ENDS ON THE LINE (owner 2026-10-07, "stand peek or hops not
      // working"): a fire hop arrived 2 u short of its cell on the hidden
      // side of the edge, never fired, and the search then relocated 90 u
      // away (Hina, Factory opening, 12/12 draws); it runs to the cell
      // itself unless its line is already open.
      const sdArriveR = (me.botSDFireGoal && !sdOppClear) ? 0.6 : 2;
      if (Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z) < sdArriveR) {
        const sdWasRetreat = !!me.botSDRetreatRoute;   // (sdDrop clears it)
        sdDrop();
        // (no planned watch hop any more — a watch starts in place; the
        // "arrived at a watch spot" branch was dead code, re-check 2026-10-08)
        if (sdWasRetreat) {
          // back at the cover a peek left: a peek that got its window may
          // cycle at once (no dwell); one cut short (the line closed, the
          // band out of reach) waits the dwell like any arrival
          const fought = me.botSDPeekFought === true;
          me.botSDDwellUntil = fought ? now : now + sdDwell();
          if (fought) me.botSDCycleArm = now;
        } else {
          // never dwell on open ground; nor where a peek is possible with the
          // target in the fight band — arrival is the moment to open the line
          // (owner 2026-10-06), the dwell is for arrivals with nothing to do
          const peekHere = sdFightOk && sdPeekableAt(me.pos.x, me.pos.z, myFloorY);
          me.botSDDwellUntil = now + ((sdOpen || peekHere) ? 0 : sdDwell());
          me.botSDPeeksHere = 0;   // a new cover: the peek cap starts over
          me.botSDPeekDry = 0;     //   ... and the dry-peek count
        }
        me.botSDRetreatRoute = false;
      } else if (!me.botSDGoalMayShow && !sdGoalHidden(goal)) {
        // UNCOVERED GOAL -> FIRE HOP (owner 2026-10-06): the enemy moved and
        // the goal now sees them. Inside the band with the standoff kept it
        // is a firing position: keep going, fire on arrival, dodge back —
        // instead of dropping the route and searching again.
        const gd = Math.hypot(goal.x - opp.pos.x, goal.z - opp.pos.z);
        const gMuzzle = { x: goal.x, y: (goal.y ?? myFloorY) + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z: goal.z };
        if (gd <= sdUpper + SD.fightSlack && sdOutsideFloors(goal.x, goal.z) && sdWideLine(gMuzzle.x, gMuzzle.y, gMuzzle.z)) {
          me.botSDGoalMayShow = true;
          me.botSDPeekArmed = true; me.botSDPeekStepped = false; me.botSDPeekOrigin = { x: me.pos.x, z: me.pos.z };
          me.botSDFires = (me.botSDFires ?? 0) + 1;
          me.botSDConverts = (me.botSDConverts ?? 0) + 1;
          me.botSDFireGoal = true;
          // (re-check 2026-10-08: a fire hop is graded like a stand peek —
          // fought / dry — only when these are fresh; they used to carry the
          // last stand peek's verdict and the fire hop went ungraded)
          me.botSDPeekFought = null;
          me.botSDPeekShotsAt = me.lastFireAt;
        } else {
          sdDrop();
          me.botSDSearchAt = now;
        }
      }
    }
    // Peek leg bookkeeping: arrived or exposed (the fight window takes over).
    // (A back-off leg is the same leg run the other way: it ends when the
    // unit is hidden again or arrived, and a fresh dwell follows.)
    if (me.botSDPeekTo) {
      const left = Math.hypot(me.botSDPeekTo.x - me.pos.x, me.botSDPeekTo.z - me.pos.z);
      const arrived = left < 1;
      // The leg out ends when the GUN line opens (the fight window fires
      // from there) or at its point — not when the enemy first sees a
      // SHOULDER (sdHidden reads the unit's width): at a cover edge the
      // shoulder clears 1.6 u before the gun does, and the leg stopped one
      // step short of its line on all 28 peeks of the factory2 idle trace
      // (seed 12, 2026-10-07).
      if (me.botSDBackOff ? (sdHidden || arrived) : (sdOppClear || arrived)) {
        me.botSDPeekTo = null;
        me.botSDPeekAnchor = null;
        if (me.botSDBackOff) {
          me.botSDBackOff = false;
          me.botSDDwellUntil = now + sdDwell();
        } else if (!sdOppClear) {
          me.botSDPeekArmed = false;   // arrived without a line: the peek failed
        }
      } else if (!me.botSDPeekAnchor || left < me.botSDPeekAnchor.best - 0.5) {
        me.botSDPeekAnchor = { best: left, at: now };
      } else if (now - me.botSDPeekAnchor.at > SD.bailMs) {
        // PEEK BAIL (playable Airport idle 2026-10-05: one run in five sat
        // out its 70 s in the 'peek' state, the body wedged on the leg): a
        // peek or back-off leg that stops closing on its point for bailMs is
        // dropped — the point marked, the search re-opened — instead of
        // running against the wall for the rest of the match. (A route has
        // had this bail since the Factory wedge; the peek leg had none.)
        sdMark(me.botSDPeekTo.x, me.botSDPeekTo.z, SD.stuckAvoidMs, true);
        me.botSDPeekTo = null;
        me.botSDPeekAnchor = null;
        me.botSDBackOff = false;
        me.botSDPeekArmed = false;
        me.botSDSearchAt = now;
        me.botSDPeekBails = (me.botSDPeekBails ?? 0) + 1;
      }
    } else {
      me.botSDPeekAnchor = null;
    }
    // WATCH SCORE: how many of the 8 exit points on the ring exitR around
    // the target a muzzle at (x, z, floor) could hit. The watch spot is the
    // hidden cell maximising this — it covers where the enemy will step
    // out, not where it stands.
    const watchScore = (x, z, fy) => {
      const from = { x, y: fy + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z };
      let n = 0;
      for (let k = 0; k < 8; k += 1) {
        const a = k * Math.PI / 4;
        const px = opp.pos.x + Math.cos(a) * SD.exitR, pz = opp.pos.z + Math.sin(a) * SD.exitR;
        if (unitOverlapsObstacle(px, GROUND_BASE_Y + 1, pz, obstacles)) continue;
        if (sdClear(from, { x: px, y: opp.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, z: pz })) n += 1;
      }
      return n;
    };
    // WATCH maintenance: the spot must keep covering the enemy's exits —
    // the enemy moving away from where it was chosen, or the lines closing,
    // ends the watch and a fresh decision follows.
    const sdWatching = sdHidden && !me.botSDPath && now < (me.botSDWatchUntil ?? 0);
    if (sdWatching && now >= (me.botSDWatchRecheckAt ?? 0)) {
      me.botSDWatchRecheckAt = now + SD.watchRecheckMs;
      const wa = me.botSDWatchAnchor;
      const moved = wa ? Math.hypot(opp.pos.x - wa.x, opp.pos.z - wa.z) : 0;
      if (moved > SD.watchMoveTol || watchScore(me.pos.x, me.pos.z, myFloorY) < SD.exitMin) {
        me.botSDWatchUntil = 0;
        me.botSDDwellUntil = now;
        me.botSDWatchCooldownUntil = now + SD.watchCooldownMs;   // (a cut-short watch cools down from now)
      }
    }
    // 2. Hop search — one Dijkstra per tick per match (shares the hide
    //    search's slot). Wanted when exposed past the budget, or hidden with
    //    the dwell over (a long own reload is spent in cover unless the
    //    enemy is out of rounds too).
    const sdDwellOver = now >= (me.botSDDwellUntil ?? 0);
    const sdHoldReload = sdMyReloadLeft > SD.reloadHoldMs && !sdFree;
    const oppMuzzle = sdOppMuzzle;
    const sdEngageDue = sdHidden && dist <= sdUpper + SD.peekRange && sdNoShotTime >= SD.peekWaitMs;
    // NEVER HOLD FOREVER: no shot line for holdMaxMs makes any position a
    // bad one — the hold and the watch end, the search runs.
    const sdHoldOk = sdNoShotTime < SD.holdMaxMs;
    // PEEK CYCLE (owner 2026-10-06, "re-order the triggered effect"): the
    // dodge back from a peek just ended at the cover it left — one more
    // peek from there within peekCycleMs, no dwell and no peekWait between
    // them, the other side preferred. The tank bounds it: each cycle costs
    // the dodge (48), so two or three cycles and the reserve ends it.
    // The stand peek fires from where it stands: inside the fight band only
    // (beyond it the window is over the tick it opens — Flashpoint idle
    // trace 2026-10-06: 30 one-tick peeks a second at a corner, no shot);
    // the engage HOP may still start peekRange beyond, it closes.
    const sdPeekDue = sdEngageDue && sdFightOk;
    // The dodge back alone landed the unit hidden at the cover it left: the
    // peek is over — the cycle is armed when the peek got its window.
    if (me.botSDPeekOrigin && me.botSDPeekStepped && sdHidden && now > (me.stepUntil || 0)) {
      if (me.botSDPeekFought === true) me.botSDCycleArm = now;
      me.botSDPeekOrigin = null;
      me.botSDPeekStepped = false;
    }
    // (re-check 2026-10-08: the window counts from the moment the dodge is
    // ready again, not from the landing — the step cooldown (1175 ms)
    // outlasted the 400 ms window and the cycle never fired after a dodge)
    const sdCycleDue = sdHidden && sdFightOk && me.botSDCycleArm != null
      && now - Math.max(me.botSDCycleArm, me.stepCooldownUntil ?? 0) <= SD.peekCycleMs;
    // STAND PEEK (MANOEUVRE 2 — peek, fire, dodge back): a LATERAL leg
    // (peekLateralMin across the threat's line) of peekLeg whose end sees
    // the target, run at a sprint; the fight window fires strafing, the
    // retreat dodges back. Returns true when a peek was armed.
    const sdTryStandPeek = (cycling) => {
      let best = null, bestScore = -Infinity, bestSide = 0;
      let lx = sdThreat.pos.x - me.pos.x, lz = sdThreat.pos.z - me.pos.z;
      const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
      for (let k = 0; k < 8; k += 1) {
        const ang = k * Math.PI / 4 + Math.random() * 0.3;
        const cx = Math.cos(ang), cz = Math.sin(ang);
        const lat = sdLateral(cx, cz);
        if (lat < SD.peekLateralMin) continue;
        const side = (cx * lz - cz * lx) >= 0 ? 1 : -1;
        // a short leg first, a longer one past a wide cover (the dodge
        // step back covers 9.2 u either way)
        for (const legLen of [SD.peekLeg, SD.peekLeg * 1.75, SD.peekLegMax]) {
          const px = me.pos.x + cx * legLen, pz = me.pos.z + cz * legLen;
          if (walkSegmentBlocked(me.pos.x, me.pos.z, px, pz, me.pos.y, obstacles)) break;
          if (!sdClear({ x: px, y: myShotY, z: pz }, oppMuzzle)) continue;
          let score = lat - (legLen - SD.peekLeg) * 0.03 + (Math.random() - 0.5) * 0.3;
          if (cycling && side === (me.botSDLastPeekSide ?? 0)) score -= 0.4;   // show the other shoulder
          if (score > bestScore) { bestScore = score; best = { x: px, z: pz }; bestSide = side; }
          break;
        }
      }
      // The stand peek is a planned exposure (the leg at a sprint, then
      // the fight window strafing across the line): gate it like a hop.
      // Only the fire window counts: the leg out is hidden until the line
      // opens and the dodge step back is invulnerable.
      if (best && !sdFree) {
        // (the window is the pre-aimed acquisition plus the burst: the
        // enemy's rounds arrive inside it, the bloom of each on the cone)
        const T = SD.peekAimMs + SD.peekMs + SD.peekJitterMs / 2;
        const pr = sdExposureRisk(sdThreat, SD, dist, 1, T, 0, sdSprint);
        me.botSDLastRisk = pr;
        if (pr > sdRiskCap(true)) { best = null; sdRiskReject(); }
      }
      if (!best) return false;
      // (the retreat check must be able to run the tick the budget ends)
      me.botSDSearchAt = now; me.botSDRiskHoldSince = null; me.botSDIdleSince = null;
      me.botSDPeekTo = best; me.botSDPeekArmed = true; me.botSDPeekStepped = false;
      me.botSDPeekOrigin = { x: me.pos.x, z: me.pos.z };
      me.botSDLastPeekSide = bestSide;
      me.botSDPeekAt = now;
      me.botSDPeekFought = null;
      me.botSDPeekShotsAt = me.lastFireAt;   // (a peek that ends with this unchanged fired nothing: dryPeeksMax)
      me.botSDPeeksHere = (me.botSDPeeksHere ?? 0) + 1;
      me.botSDPeeks = (me.botSDPeeks ?? 0) + 1;
      if (cycling) me.botSDPeekCycles = (me.botSDPeekCycles ?? 0) + 1;
      me.botSDCycleArm = null;
      return true;
    };
    // STAND PEEK FIRST (owner 2026-10-06): while an engagement is due and a
    // lateral leg from here opens a line, the peek runs before any hop
    // search, every tick — not as the fallback after the whole list fails,
    // and not waiting for the dwell or the search cadence. peeksPerCover
    // peeks from one cover, then the hop search has the first word (the
    // crossing, the fire hop, a relocation) and the peek is its fallback.
    const sdPeekDryOut = (me.botSDPeekDry ?? 0) >= SD.dryPeeksMax;   // this cover's peeks fire nothing: relocate instead
    if (!me.botSDPath && !me.botSDPeekTo && !sdOverBudget && (sdPeekDue || sdCycleDue) && !sdOppClear
        && (me.botSDPeeksHere ?? 0) < SD.peeksPerCover && !sdPeekDryOut
        && me.boost >= sdPeekNeed && sdDodgeReady && !(now <= (me.stepUntil || 0)) && now >= (me.botSDPlainUntil ?? 0)) {
      sdTryStandPeek(sdCycleDue && !sdPeekDue);
    }
    const sdWantHop = !me.botSDPath && !me.botSDPeekTo
      && (sdOverBudget || sdSeenFar || (sdHidden && sdDwellOver && !sdHoldReload));
    if (sdWantHop && now >= (me.botSDSearchAt ?? 0) && matchState.hideSearchTick !== matchState.tick) {
      matchState.hideSearchTick = matchState.tick;
      let decided = false;
      // ENGAGE HOP (owner's description of human SD play — "sprint from a
      // cover to another while firing during moving"): hidden in band with
      // no shot line for peekWaitMs, a band hop whose crossing OPENS a line
      // to the target (the midpoint of the straight run sees it) and ends
      // hidden again.
      // (the run sees the target somewhere in its middle half)
      const midSees = (gx, gz) => [0.35, 0.5, 0.65].some((f) => sdClear({ x: me.pos.x + (gx - me.pos.x) * f, y: myShotY, z: me.pos.z + (gz - me.pos.z) * f }, oppMuzzle));
      // PEEK RETREAT: a stand peek's budget is up -> step straight back to
      // the cover it came from (the corner dance), no search.
      if (sdOverBudget && me.botSDPeekOrigin) {
        const o = me.botSDPeekOrigin;
        const ox = o.x - me.pos.x, oz = o.z - me.pos.z, ol = Math.hypot(ox, oz) || 1;
        // (did the peek get its window? only such a peek cycles on return)
        if (me.botSDPeekFought == null) {
          me.botSDPeekFought = sdExposedFor >= SD.peekAimMs + SD.peekMs * 0.5;
          // DRY PEEK: not one round left the gun — count it against this cover
          me.botSDPeekDry = me.lastFireAt === me.botSDPeekShotsAt ? (me.botSDPeekDry ?? 0) + 1 : 0;
        }
        if (!me.botSDPeekStepped && ol > 1.5 && tryStartStep(matchState, me, ox / ol, oz / ol, now, obstacles)) {
          // MANOEUVRE 2, the way back: the i-frame dodge step toward the
          // cover (the AI sits out the step); the leftover at a sprint below.
          me.botSDPeekStepped = true;
          me.botSDDodges = (me.botSDDodges ?? 0) + 1;
          me.botSDSearchAt = now + SD.searchMs;
          decided = true;
        } else {
          me.botSDPeekOrigin = null;
          me.botSDPeekStepped = false;
          if (ol <= 12 && sdGoalHidden({ x: o.x, z: o.z, y: myFloorY })) {
            me.botSDPath = [{ x: o.x, z: o.z, y: myFloorY }];
            me.botSDPathIdx = 0;
            me.botSDGoal = { x: o.x, z: o.z, y: myFloorY };
            me.botSDMoveAnchor = null;
            me.botSDRetreatRoute = true;   // (its arrival arms the peek cycle, no dwell)
            me.botSDSearchAt = now + SD.searchMs;
            me.botSDRetreats = (me.botSDRetreats ?? 0) + 1;
            decided = true;
          }
        }
      }
      // POSITION SCORE of the spot the unit stands on, re-scored every
      // holdRecheckMs while hidden — the basis of HOLD below.
      let sdPosScore = me.botSDPosScore ?? 0;
      if (sdHidden && !sdOverBudget && (me.botSDPosAt == null || now - me.botSDPosAt >= SD.holdRecheckMs)) {
        sdPosScore = sdPosScoreAt(me.pos.x, me.pos.z, myFloorY);
        me.botSDPosScore = sdPosScore;
        me.botSDPosAt = now;
      }
      // (a good position hugs its cover — "they should get closer to cover")
      const sdPosGood = sdHidden && !sdOverBudget && sdPosScore >= SD.holdScore && sdCoverDist <= SD.hugDist;
      const sdClosingDue = dist > sdUpper + SD.bandSlack;
      // IDLE clock: hidden with nothing accepted. An accepted plan or an
      // exposure resets it; past patienceMs the PUSH attempt opens and the
      // caps rise to patienceCap.
      if (!sdHidden) me.botSDIdleSince = null;
      else if (me.botSDIdleSince == null) me.botSDIdleSince = now;
      // (in or out of band: out of band the push IS the closing list below)
      const sdPushDue = sdHidden && !sdOverBudget && me.botSDIdleSince != null && now - me.botSDIdleSince > SD.pushAfterMs;
      // WATCH (in band, hidden, nothing due): a good spot that covers the
      // enemy's exits is watched — the pre-aimed hold with the watch-fight
      // budget when they walk into the line. (No watch hop any more: a
      // better spot is the BETTER POSITION move below.)
      const sdInBand = dist <= sdUpper + 20;
      // (a line-capable spot never watches — it peeks; owner 2026-10-06)
      if (!decided && sdInBand && sdPosGood && !sdEngageDue && sdHoldOk
          && !sdPeekableAt(me.pos.x, me.pos.z, myFloorY)
          && now >= (me.botSDWatchCooldownUntil ?? 0) && Math.random() < SD.pWatch
          && !sdOpen && sdCoverDist <= SD.hugDist && watchScore(me.pos.x, me.pos.z, myFloorY) >= SD.exitMin) {
        me.botSDWatchUntil = now + SD.watchMinMs + Math.random() * (SD.watchMaxMs - SD.watchMinMs);
        me.botSDWatchAnchor = { x: opp.pos.x, z: opp.pos.z };
        me.botSDWatchRecheckAt = now + SD.watchRecheckMs;
        me.botSDWatchCooldownUntil = me.botSDWatchUntil + SD.watchCooldownMs;   // (no back-to-back ambushes; re-check 2026-10-08)
        me.botSDDwellUntil = me.botSDWatchUntil;
        me.botSDWatches = (me.botSDWatches ?? 0) + 1;
        me.botSDSearchAt = now + SD.searchMs;
        decided = true;
      }
      // HOLD (owner 2026-10-05): a good position is kept — nothing to plan
      // unless an engage is due, the push patience (pushAfterMs idle) is up
      // or a free window opens while far. Out of band the patience ends the
      // hold too: two hidden units out of band otherwise held for ever
      // (SD-vs-SD trace seed 3: 104 u, both scoring 5-6, no attempt in
      // 40 s), while closing at once threw the ambush away (mid batch: the
      // unit ran out at contact, 46 hops/min, 1.6 s fights, 17% losses to
      // the base bot that it had beaten 96%). Re-score shortly; a hold is
      // never a stall.
      if (!decided && sdPosGood && sdHoldOk && !sdEngageDue && !sdPushDue && !(sdFree && sdClosingDue)) {
        me.botSDSearchAt = now + SD.holdRecheckMs;
        me.botSDStallSince = null;
        me.botSDHeld = (me.botSDHeld ?? 0) + 1;
        decided = true;
      }
      // Closing goal (hidden, farther than the band): a hidden cell nearer
      // the target by gain (10-45 u), next to cover. No "farther when too
      // close" and no in-band shuffle any more.
      const gain = Math.min(SD.hopGainMax, Math.max(SD.hopGainMin, dist * 0.3));
      const within = sdClosingDue ? { x: opp.pos.x, z: opp.pos.z, r: Math.max(sdOptimal, dist - gain) } : null;
      // MANOEUVRE 1 (BOT_SD bearingLateralNear): the engage cover lies across
      // the threat's line.
      const bearingOk = (gx, gz) => {
        const dx = gx - me.pos.x, dz = gz - me.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        return sdLateral(dx / dl, dz / dl) >= (dist <= SD.bearingFullDist ? SD.bearingLateralNear : SD.bearingLateralFar);
      };
      // Exposed: break the line first (nearest hidden cell, near then far
      // budget). Hidden: the band hop (near then far), then any cell closer
      // to the target than the current spot.
      // Breaking off: prefer a cover whose straight run is LATERAL to the
      // threat's line (the crossing rule below), then any cover.
      const lateralGoal = (gx, gz) => {
        const dx = gx - me.pos.x, dz = gz - me.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        return sdLateral(dx / dl, dz / dl) >= SD.lateralGoalMin;
      };
      // NO DOUBLING BACK (Hoshino opening trace 2026-10-05): a shotgun volley
      // fired at the start of a crossing lands 0.46 s later where the unit
      // WAS — a break-off that runs back to the cover it came from walks
      // into it. Prefer covers that keep the last heading (dot >= -0.2).
      const hdx = me.botSDHeadX ?? 0, hdz = me.botSDHeadZ ?? 0;
      const forwardGoal = (gx, gz) => {
        if (hdx === 0 && hdz === 0) return true;
        const dx = gx - me.pos.x, dz = gz - me.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        return (dx * hdx + dz * hdz) / dl >= -0.2;
      };
      // Stage order. Hidden: band hop next to cover (near, far budget), band
      // hop anywhere hidden, any hidden cell closer to the target, and last
      // a cover-adjacent cell closer to the target even if not hidden
      // (anyGoal — the enemy stands in a coverless pocket: approach along
      // cover rather than stand still forever). Exposed: break the line to
      // a cover-adjacent cell lateral and forward, forward, any hidden cell
      // near then far, last a cover-adjacent cell forward even if not
      // hidden (better than strafing in the open).
      // (a closing hop gains at least hopGainMin toward the target and walks
      // at least shiftMin — "2 u closer, 3 u away" let the unit chain 2-4 u
      // hops five times a second at a platform edge, sprinting each, the
      // tank 226 -> 6 in 20 s: the Station "back and forth" of 2026-10-05)
      const closerWithin = { x: opp.pos.x, z: opp.pos.z, r: dist - SD.hopGainMin };
      const closerMin = { x: me.pos.x, z: me.pos.z, d: SD.shiftMin };
      // STANDOFF (owner: no suicide route for the range): no planned goal
      // inside the band's lower edge, whatever its line — line-capable spots
      // cluster along the target's own cover, and a flank that ran from 64 u
      // to a hidden spot 30 u from the target died on the way (SD-vs-SD
      // trace seed 7). Escapes stay unbounded.
      // LOCK FLOOR (owner 2026-10-07, "is Lock Range a joke?"): the band's
      // lower edge is the floor of every PLANNED goal — not bandSlack inside
      // it. The slack let the shadow hop, the better-position hop, the
      // push and the flank plan cells 33-42 u from a 50 u gun (lock-7 = 43),
      // and the unit then peeked and ran back out ("goes very near for no
      // reason, then backs off").
      // ENGAGE FLOOR (owner 2026-10-07, later the same day): the floor is
      // now each enemy's gun's (sdEngageFloor), and a planned goal keeps
      // every live enemy's — sdOutsideFloors.
      const sdStandoffOk = (gx, gz) => sdOutsideFloors(gx, gz);
      const sdFlankOk = (gx, gz, fy) => sdStandoffOk(gx, gz) && sdPeekableAt(gx, gz, fy);
      // FIRE SPOT: a cell (standoff kept) with a WIDE muzzle line to the target.
      const sdFireSpot = (gx, gz, fy) => sdStandoffOk(gx, gz) && sdWideLine(gx, fy + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, gz);
      // LAST RESORT (Lobby camper pockets 2026-10-07: the only cells with a
      // line sat inside the lock floor, and with the floor alone the unit
      // held, stalled, walked in with the plain brain and hopped back out
      // for 90 s): a firing cell bandSlack inside the floor, tried only
      // after every standoff option and relocation has failed — going near
      // TO FIRE is a reason; going near and backing off was the bug.
      // (a centre line is enough here: in Sudden Death one landed round
      // wins, and a pocket's only lines are doorway slits)
      const sdFireSpotNear = (gx, gz, fy) => sdOutsideFloors(gx, gz, SD.bandSlack)
        && sdClear({ x: gx, y: fy + GROUND_BASE_Y + PROJECTILE_MUZZLE_Y_OFFSET, z: gz }, sdOppMuzzle);
      // SHADOW score: the cell nearest the target wins.
      const sdNearer = (gx, gz) => -Math.hypot(gx - opp.pos.x, gz - opp.pos.z);
      // SHADOW SHAPE (owner's maze): bend a shadow hop's route into the two
      // legs — LATERAL (across the threat's line) onto the shadow's axis
      // (threat -> goal, extended), then FORWARD along the axis to the goal
      // — when both legs are walkable on this floor and the forward leg
      // stays hidden; otherwise the exposure-costed route stands.
      const sdShadowShape = (found) => {
        const g = found.goal;
        if (Math.abs((g.y ?? myFloorY) - myFloorY) > 0.5) return;
        let ax = g.x - opp.pos.x, az = g.z - opp.pos.z;
        const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        const t = (me.pos.x - opp.pos.x) * ax + (me.pos.z - opp.pos.z) * az;
        if (t < al + 3) return;   // not behind the goal along its axis: no forward leg
        const P = { x: opp.pos.x + ax * t, z: opp.pos.z + az * t, y: myFloorY };
        if (Math.hypot(P.x - me.pos.x, P.z - me.pos.z) < 2) { found.path = [{ x: g.x, z: g.z, y: g.y ?? myFloorY }]; return; }
        if (walkSegmentBlocked(me.pos.x, me.pos.z, P.x, P.z, me.pos.y, obstacles)) return;
        if (walkSegmentBlocked(P.x, P.z, g.x, g.z, me.pos.y, obstacles)) return;
        for (const f of [0.2, 0.5, 0.8]) {
          if (!sdGoalHidden({ x: P.x + (g.x - P.x) * f, z: P.z + (g.z - P.z) * f, y: myFloorY })) return;
        }
        found.path = [P, { x: g.x, z: g.z, y: g.y ?? myFloorY }];
      };
      let attempts;
      if (sdOverBudget) {
        attempts = [{ maxPops: SD.nearPops, accept: (gx, gz) => lateralGoal(gx, gz) && forwardGoal(gx, gz), goalCoverMax: SD.goalCoverMax },
          { maxPops: SD.nearPops, accept: forwardGoal, goalCoverMax: SD.goalCoverMax },
          { maxPops: SD.nearPops, accept: forwardGoal },
          { maxPops: SD.nearPops }, { maxPops: SD.farPops },
          { maxPops: SD.nearPops, accept: forwardGoal, goalCoverMax: SD.goalCoverMax, anyGoal: true }];
      } else if (sdClosingDue) {
        // SHADOW WALK (owner's maze, 2026-10-05: "先橫移進影子，再在影子裡用走的
        // 往對方推進"): the first choice is the cover-adjacent hidden cell
        // NEAREST the target inside this hop's disc (gain 10-45 u closer —
        // one cover at a time, a dwell and a re-read at each; an unbounded
        // disc made 215 u charges at 31% exposure, SD vs SD dead in 1.7 s),
        // best-of search stopping 15 u inside the disc, standoff kept — the
        // shadow that brings the unit closest; sdShadowShape bends its route
        // into the lateral-then-forward legs when they are walkable. Then
        // the older list: a closer spot that can open a line, any closer
        // cover, any closer hidden cell, cover even if not hidden.
        // (2026-10-06: a line-capable shadow cell FIRST was tried and dropped
        // — scored nearest-the-enemy it charged the lane, 115 u hops; nearest-
        // first it still lengthened the opening hops 56 -> 76 u and cost the
        // opening, SD seat B 100% -> 50-67% vs the base bot. The arrival's
        // line comes from the peek-first rule and the uncovered-goal fire
        // conversion instead.)
        // (Airport's "side walkways", owner 2026-10-07: the route hugs the
        // terminal's side wall and the centre pillars because every hop ends
        // at cover and those are the concourse's only covers. Three
        // alternatives were measured and dropped: a straight run to the
        // band's edge met the charging plain bot in the open (Factory SD
        // seat B 56% -> 8%); waiving the far route's open penalty took the
        // ground apron; scoring the goal along the plain bot's route made
        // 100 u lane hops (Hina seat A 69% -> 39%) or, bounded to one hop's
        // reach, the same wall route.)
        attempts = [{ maxPops: SD.farPops, within, minDistFrom: closerMin, goalCoverMax: SD.hugDist, accept: sdStandoffOk, score: sdNearer, scoreStop: -Math.max(sdOptimal, within.r - 15), shadow: true },
          { maxPops: SD.farPops, within, goalCoverMax: SD.hugDist, accept: sdFlankOk, flank: true },
          { maxPops: SD.nearPops, within, goalCoverMax: SD.goalCoverMax, accept: sdStandoffOk },
          { maxPops: SD.farPops, within, goalCoverMax: SD.goalCoverMax, accept: sdStandoffOk },
          { maxPops: SD.farPops, within, accept: sdStandoffOk },
          { maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin, accept: sdStandoffOk },
          { maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, anyGoal: true, accept: sdStandoffOk }];
      } else {
        attempts = [];
        // FLANK: no line from here for peekWaitMs -> the nearest hidden
        // cover-adjacent spot in the band that CAN open one (hidden route,
        // risk-gated), then the peek-fire-dodge from there.
        if (sdEngageDue) {
          attempts.push({ maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.bandSlack }, minDistFrom: { x: me.pos.x, z: me.pos.z, d: 4 },
            goalCoverMax: SD.hugDist, accept: sdFlankOk, flank: true });
        }
        // BETTER POSITION (the spot here is not good): the hidden spot in
        // the band, hugging cover, scoring holdGain above this one.
        // (at least twice the arrival radius away: a 2 u "better" spot at
        // the lock floor's edge, reached 2 u short, scored better again
        // from where the unit stopped — nine hops in ten seconds between
        // two cells 8 u apart, Factory2 idle trace 2026-10-07)
        attempts.push({ maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.bandSlack }, minDistFrom: { x: me.pos.x, z: me.pos.z, d: 4 },
          goalCoverMax: SD.hugDist, accept: sdStandoffOk, score: sdPosScoreAt, scoreStop: 8, better: true });
        // PUSH (patience): approach along cover, near-zero exposure only —
        // toward a line-capable spot first.
        if (sdPushDue) {
          const pushWithin = { x: opp.pos.x, z: opp.pos.z, r: dist - Math.max(SD.hopGainMin, dist * 0.3) };
          attempts.push({ maxPops: SD.farPops, within: pushWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, accept: sdFlankOk, push: true });
          attempts.push({ maxPops: SD.farPops, within: pushWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, accept: sdStandoffOk, push: true });
          attempts.push({ maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, accept: sdStandoffOk, push: true });
        }
      }
      // (a deliberate exposure — the crossing, the fire hop — is planned
      // only with the boost to sprint it and dodge back, the stand peek's
      // own gate: the Airport human-like smoke hopped at 6-30 boost, the
      // exposed legs at a walk, 6 wedges and 15 hops in 12 s at one corner)
      if (sdEngageDue && me.boost >= sdPeekNeed && sdDodgeReady) {
        const engageWithin = { x: opp.pos.x, z: opp.pos.z, r: sdClosingDue ? Math.max(sdOptimal, dist - gain) : sdUpper + SD.bandSlack };
        const engageMin = { x: me.pos.x, z: me.pos.z, d: SD.shiftMin };
        const engageOk = (gx, gz) => sdStandoffOk(gx, gz) && midSees(gx, gz) && bearingOk(gx, gz);
        // ORDER (owner 2026-10-06, "re-order the triggered effect"): the
        // stand peek already ran first (above, every tick). Then the
        // crossing that opens a line; then the FIRE HOPS — manoeuvre 2 with
        // a longer leg out: a cell with a muzzle line to the target, standoff
        // kept, fire on arrival, dodge back to the cell it left — the cover's
        // own edge first (CORNER FIRE, a cheap ring scan: the firing cell is
        // usually a few metres along this cover), the band-wide search
        // second; only then the relocations (flank, better, push).
        attempts.unshift(
          { maxPops: SD.nearPops, within: engageWithin, minDistFrom: engageMin, accept: engageOk, goalCoverMax: SD.goalCoverMax, engage: true },
          { maxPops: SD.farPops, within: engageWithin, minDistFrom: engageMin, accept: engageOk, goalCoverMax: SD.goalCoverMax, engage: true },
          { cornerFire: true, fire: true },
          // (a firing cell inside the fight band: beyond it the window is over on arrival)
          { maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.fightSlack }, minDistFrom: engageMin, anyGoal: true, accept: sdFireSpot, fire: true }
        );
        // (the last resort, after every relocation: a firing cell inside the floor)
        attempts.push({ maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.fightSlack }, minDistFrom: engageMin, anyGoal: true, accept: sdFireSpotNear, fire: true, near: true });
      }
      const stage = Math.min(me.botSDSearchStage ?? 0, attempts.length - 1);
      const a = attempts[stage];
      // RESUMABLE SEARCH (owner 2026-10-08, "BOT sometimes freezes"): a
      // search cut by the tick's budget parks in me.botSDSearchJob and goes
      // on next tick on the same stage — "not done yet", not "nothing
      // found" (a budget-cut stage used to fail, and on a slow host every
      // far stage failed: the unit stood in cover with nothing to do). The
      // job is dropped when the stage, the list or the start moves under it.
      const sdJobKey = `${stage}|${attempts.length}|${sdOverBudget ? 1 : 0}|${Math.round(sdSearchX)},${Math.round(sdSearchZ)}`;
      if (!me.botSDSearchJob || me.botSDSearchJob.key !== sdJobKey) me.botSDSearchJob = { key: sdJobKey, state: null };
      let sdSearchPending = false;
      // Hidden (planned) hops: the ROUTE is costed against the live and
      // predicted eyes, the GOAL must hold against the spread eyes too — so
      // a distant crate's narrow shadow is an approach lane (owner 2026-10-05,
      // "vertical sprint behind a distant obstacle and walk up safely").
      // Escapes keep the strict set for both.
      let found = null;
      if (!decided && a.cornerFire) {
        // CORNER FIRE: 16 headings x 3 radii from here — a straight walkable
        // leg to a cell next to cover (goalCoverMax), standoff kept, muzzle
        // line to the target; the nearest wins. Risk-gated below like a hop.
        let best = null, bestR = Infinity;
        for (let k = 0; k < 16; k += 1) {
          const ang = k * Math.PI / 8 + Math.random() * 0.2;
          const cx = Math.cos(ang), cz = Math.sin(ang);
          // (a lateral leg, like the peek's: never out along the enemy's line)
          if (sdLateral(cx, cz) < SD.peekLateralMin) continue;
          for (const R of [6, 10, 14]) {
            if (R >= bestR) break;
            const px = me.pos.x + cx * R, pz = me.pos.z + cz * R;
            if (walkSegmentBlocked(me.pos.x, me.pos.z, px, pz, me.pos.y, obstacles)) break;
            if (Math.hypot(px - opp.pos.x, pz - opp.pos.z) > sdUpper + SD.fightSlack) continue;   // inside the fight band
            if (!sdFireSpot(px, pz, myFloorY)) continue;
            if (coverDistanceAt(sdGrid, px, pz, myFloorY, obstacles) > SD.goalCoverMax) continue;
            best = { x: px, z: pz }; bestR = R;
            break;
          }
        }
        if (best) found = { path: [{ x: best.x, z: best.z, y: myFloorY }], goal: { x: best.x, z: best.z, y: myFloorY }, score: null };
        if (best) me.botSDCornerFires = (me.botSDCornerFires ?? 0) + 1;
      } else if (!decided) found = findHiddenSpot(
        sdGrid, sdSearchX, sdSearchZ, myFloorY, (sdOverBudget || sdThreatMoving) ? sdSearchEyes : sdRiskEyes, obstacles,
        { maxPops: a.maxPops, within: a.within ?? null, minDistFrom: a.minDistFrom ?? null, accept: a.accept ?? null, eyeHeight: PROJECTILE_MUZZLE_Y_OFFSET,
          goalEyes: (sdOverBudget || sdThreatMoving) ? null : sdSearchEyes,
          exposurePenalty: a.engage ? SD.engagePenalty : SD.exposurePenalty, openPenalty: SD.openPenalty, openDist: SD.openDist, goalCoverMax: a.goalCoverMax ?? null, anyGoal: !!a.anyGoal,
          threat: { x: sdThreat.pos.x, z: sdThreat.pos.z }, alongWeight: SD.alongWeight, avoid: sdOverBudget ? sdAvoidPinned : sdAvoid,
          score: a.score ?? null, scoreStop: a.scoreStop ?? Infinity,
          // (planned hops may cross jump links — Station's platforms; an
          // escape under fire never vaults)
          allowJump: !sdOverBudget,
          // (the goal must hide the unit's width, not its centre point)
          goalShoulder: SD.shoulder,
          // (the server's per-tick CPU budget — see findHiddenSpot; the sim sets none)
          deadline: matchState.searchDeadline ?? 0,
          job: me.botSDSearchJob }
      );
      if (found && found.pending) { found = null; sdSearchPending = true; }
      if (found && a.shadow) sdShadowShape(found);
      if (sdSearchPending) {
        me.botSDSearchAt = now;   // (the same stage continues next tick)
      } else if (decided) {
        // (watch / hold / retreat chosen above)
      } else if (found && (!a.better || found.score >= sdPosScore + SD.holdGain) && sdHopOk(found, !!a.engage, a.push ? SD.pushCapScale : 1, !!(a.engage || a.fire))) {
        me.botSDSearchJob = null;
        me.botSDRiskHoldSince = null;
        me.botSDIdleSince = null;
        if (a.engage) me.botSDEngages = (me.botSDEngages ?? 0) + 1;
        me.botSDEngageRun = !!a.engage;   // (its crossing fires with the pre-aimed reaction)
        // (harness bookkeeping: what the hop was for)
        const hopKind = a.engage ? 'engage' : sdOverBudget ? 'escape' : a.flank ? 'flank' : a.better ? 'better' : a.push ? 'push' : a.fire ? 'fire' : 'close';
        if (a.fire) {
          // the arrival opens the line: the fight window (the peek budget)
          // fires, then the dodge back toward the spot it left
          me.botSDPeekArmed = true; me.botSDPeekStepped = false; me.botSDPeekOrigin = { x: me.pos.x, z: me.pos.z };
          me.botSDFires = (me.botSDFires ?? 0) + 1;
          me.botSDFireGoal = true;
          me.botSDPeekFought = null;            // (graded at the window end, like a stand peek)
          me.botSDPeekShotsAt = me.lastFireAt;
        }
        // (a fire or anyGoal hop ends on a cell that may show: no "goal
        // uncovered" drop for it)
        me.botSDGoalMayShow = !!(a.fire || a.anyGoal);
        if (!me.botSDHopKinds) me.botSDHopKinds = {};
        me.botSDHopKinds[hopKind] = (me.botSDHopKinds[hopKind] ?? 0) + 1;
        me.botSDPath = found.path;
        me.botSDPathIdx = 0;
        me.botSDGoal = found.goal;
        me.botSDMoveAnchor = null;
        me.botSDSearchStage = 0;
        me.botSDSearchAt = now + SD.searchMs;
        me.botSDHops = (me.botSDHops ?? 0) + 1;
        me.botSDHopLenSum = (me.botSDHopLenSum ?? 0) + Math.hypot(found.goal.x - me.pos.x, found.goal.z - me.pos.z);
        me.botSDStallSince = null;
      } else if (stage < attempts.length - 1) {
        me.botSDSearchJob = null;
        me.botSDSearchStage = stage + 1;
        me.botSDSearchAt = now;
      } else {
        me.botSDSearchJob = null;
        me.botSDSearchStage = 0;
        me.botSDSearchAt = now + (sdHidden ? SD.failRetryMs : SD.exposedRetryMs);
        if (sdHidden) {
          // A risk hold is a wait, not a stall; a near-good spot is held too.
          // The plain-brain fallback only runs from a bad spot with no route.
          // (a position with no line for holdMaxMs stalls whatever its score:
          // the plain brain's maze then crosses what the hidden search cannot)
          if (me.botSDStallSince == null && me.botSDRiskHoldSince == null && (sdPosScore < SD.holdScore - 1 || !sdHoldOk)) me.botSDStallSince = now;
          // STAND PEEK FALLBACK: past the peek cap from this cover the peek
          // runs only here — the whole list failed — at the search cadence.
          if (sdPeekDue && !sdOppClear && !sdPeekDryOut && me.boost >= sdPeekNeed && sdDodgeReady && !(now <= (me.stepUntil || 0))) sdTryStandPeek(false);
        }
      }
    }
    // Cover pacing is anchored at the arrival point: leaving the cover
    // (a route, a peek, a line opening) drops the anchor and the leg.
    if (me.botSDPath || me.botSDPeekTo || !sdHidden) {
      me.botSDPaceAnchor = null;
      me.botSDPaceX = 0;
      me.botSDPaceZ = 0;
    }
    // 3. Legs.
    if (now <= (me.stepUntil || 0)) {
      // mid dodge step (manoeuvre 2's way back): the lerp owns the body
      coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      me.botSDState = 'dodge';
    } else if (me.botSDPath) {
      const sp = me.botSDPath;
      let wp = sp[me.botSDPathIdx];
      // CORNER-SAFE ADVANCE (playable wedge 2026-10-05): the 2 u skip-ahead
      // cut a route's corner into the end of a 90 u low wall and the body
      // wedged there for a minute. The next waypoint is taken early when the
      // straight cut to it fits the body (sampled every ~0.6 u), or as soon
      // as the unit is past the waypoint along the next edge (the cut then
      // runs along the edge itself). Requiring the waypoint exactly made the
      // unit overshoot it every tick and shake +-1 u for 14 s (shake trace).
      const sdLegFits = (x0, z0, x1, z1) => {
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6));
        for (let k = 1; k <= n; k += 1) {
          const f = k / n;
          // (body radius 1.15 + 0.15 margin)
          if (unitOverlapsObstacle(x0 + (x1 - x0) * f, me.pos.y, z0 + (z1 - z0) * f, obstacles, 1.3)) return false;
        }
        return true;
      };
      let sdCreep = false;
      while (me.botSDPathIdx < sp.length - 1) {
        const dwp = Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z);
        if (dwp >= 2.5) break;
        const nxt = sp[me.botSDPathIdx + 1];
        const ex = nxt.x - wp.x, ez = nxt.z - wp.z, el = Math.hypot(ex, ez) || 1;
        const passed = ((me.pos.x - wp.x) * ex + (me.pos.z - wp.z) * ez) / el >= 0;
        if (passed || (dwp < 2 && sdLegFits(me.pos.x, me.pos.z, nxt.x, nxt.z))) {
          me.botSDPathIdx += 1;
          wp = sp[me.botSDPathIdx];
        } else {
          // the cut would clip a corner: walk the last stretch onto the waypoint
          sdCreep = dwp < 2;
          break;
        }
      }
      let tx = wp.x - me.pos.x, tz = wp.z - me.pos.z;
      const wl = Math.hypot(tx, tz) || 1;
      tx = tx / wl + avoid.rx * 0.6;
      tz = tz / wl + avoid.rz * 0.6;
      const tl = Math.hypot(tx, tz) || 1;
      // Sprint where it matters: across exposure (now, or 5 u ahead on the
      // heading) and open ground down to dashFloor; a covered leg runs on
      // one of the two latches below.
      let aheadExposed = false, aheadPt = null;
      if (sdHidden) {
        const ahead = { x: me.pos.x + (tx / tl) * SD.aheadProbe, y: myShotY, z: me.pos.z + (tz / tl) * SD.aheadProbe };
        aheadPt = ahead;
        for (let k = 0; k < sdEyes.length; k += 1) {
          if (sdSeenFrom(sdEyes[k], ahead.x, ahead.y, ahead.z)) { aheadExposed = true; break; }
        }
      }
      // ONE LATCH (owner 2026-10-05, "全程只用一條閘門"): a covered leg FAR
      // from the target (travel) sprints from a full tank (travelArm) down
      // to travelFloor and walks until full again — the normal bot's gate
      // shape with a deeper floor; a covered leg in contact WALKS (the
      // shadow walk, "在影子裡用走的往對方推進"). The sprint is for the
      // exposed lateral move, open ground, peeks and escapes.
      const sdTravel = () => {
        if (me.boost >= SD.travelArm) me.botSDTravel = true;
        else if (me.boost <= SD.travelFloor) me.botSDTravel = false;
        return !!me.botSDTravel;
      };
      // JUMP LINK (owner 2026-10-05, Station: "don't let that happen"): the
      // route may cross a jump link (findHiddenSpot allowJump) — a waypoint
      // on a ledge above the floor. Bank for it (the covered legs walk while
      // it lies ahead and the tank is under jumpBank), vault within
      // jumpReach of it, and dodge toward it right after take-off (the
      // owner's crossing: jump, dodge, sprint) so the arc carries over the
      // trench; the air steer holds the launch heading. The crossing is
      // exposure in the route risk like any other stretch, with its lateral
      // fraction against the threat's line.
      let jumpAhead = false;
      for (let k = me.botSDPathIdx; k < sp.length; k += 1) {
        if ((sp[k].y ?? myFloorY) - myFloorY > 1.7) { jumpAhead = true; break; }
      }
      let sdJump = null, sdLegOverride = null;
      const sdWpDist = Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z);
      if ((wp.y ?? myFloorY) - myFloorY > 1.7 && me.grounded && !me.airborne && sdWpDist < SD.jumpReach) {
        // At the ledge. LATERAL CROSSING re-check (the threat may have moved
        // since the plan): seen here and the crossing along its line -> no
        // jump into the line; the ledge is marked and the route re-planned.
        const jl = sdWpDist || 1;
        const jx = (wp.x - me.pos.x) / jl, jz = (wp.z - me.pos.z) / jl;
        if (!sdHidden && sdLateral(jx, jz) < SD.lateralMin) {
          sdMark(wp.x, wp.z, SD.stuckAvoidMs, true);
          sdDrop();
          me.botSDSearchAt = now;
          sdLegOverride = 'hold';
        } else if (me.boost >= SD.jumpBank && now >= (me.jumpCooldownUntil ?? 0)) {
          if (tryStartJump(me, now)) {
            sdJump = { x: jx, z: jz };
            me.botSDJumpAt = now;
            me.botSDJumpStepped = false;
            me.botSDJumps = (me.botSDJumps ?? 0) + 1;
          }
        } else {
          // BANK: stand at the ledge for the tank / the cooldown instead of
          // pressing the wall (the no-progress bail waits with it).
          sdLegOverride = 'bank';
        }
      } else if (me.airborne && me.botSDJumpAt != null && now - me.botSDJumpAt <= 250
          && !me.botSDJumpStepped && sdWpDist > 3) {
        if (tryStartStep(matchState, me, wp.x - me.pos.x, wp.z - me.pos.z, now, obstacles)) {
          me.botSDJumpStepped = true;
          me.botSDDodges = (me.botSDDodges ?? 0) + 1;
        }
      }
      // ANTI-FLICKER (owner: "no 抖動步伐"): a sprint started for an exposure
      // keeps running sprintBurstMs past the last exposed tick (or to the
      // floor) — the exposed / open tests flip tick to tick along a slatted
      // fence and the pose went dash-walk-dash.
      // (open ground UNSEEN is travel: it runs on the latch above the
      // reserve, not down to the floor — owner 2026-10-06, the tank was
      // empty at contact after an open approach; seen or about to be seen
      // still spends everything)
      // (rounds in the air after the line closed: still a crossing, see sdIncoming)
      const sdExposedLeg = !sdHidden || aheadExposed || sdIncoming;
      if (sdExposedLeg && me.boost > SD.dashFloor) me.botSDBurstUntil = now + SD.sprintBurstMs;
      const sdBurst = now <= (me.botSDBurstUntil ?? 0) && me.boost > SD.dashFloor;
      // (the corner creep shapes COVERED legs only — an exposed leg always
      // sprints: mid seed 91, 2026-10-07, 23 ticks of walking at 68 u with
      // a full tank because the creep outranked the exposure, dead)
      // SHADOW WALK, only where it is needed (owner 2026-10-07): a covered
      // leg walks only when the heading is about to enter the enemy's
      // PREDICTED line (shadowWalkProbe ahead, seen from where the enemy
      // will be predictS from now) — the controlled last steps; every other
      // covered leg, in contact or not, runs on the travel latch.
      let aheadPredicted = false;
      if (sdHidden && !sdExposedLeg && sdPredEyes.length) {
        const ap = { x: me.pos.x + (tx / tl) * SD.shadowWalkProbe, y: myShotY, z: me.pos.z + (tz / tl) * SD.shadowWalkProbe };
        for (let k = 0; k < sdPredEyes.length && !aheadPredicted; k += 1) if (sdSeenFrom(sdPredEyes[k], ap.x, ap.y, ap.z)) aheadPredicted = true;
      }
      const sdDash = sdExposedLeg
        ? me.boost > SD.dashFloor
        : (!sdCreep && (sdBurst || (!aheadPredicted && !(jumpAhead && me.boost < SD.jumpBank) && sdTravel())));
      let hx = tx / tl, hz = tz / tl;
      // Inside lateralFullDist the crossing is fully perpendicular (the
      // table in the owner's notes: 0.8 lateral at 60 u is still a hit).
      const latMin = dist <= SD.lateralFullDist ? 1 : SD.lateralMin;
      let legMode = 'dash';
      if (sdExposedLeg && latMin > 0) {
        // CROSSING RULE (micro-sim 2026-10-05): a no-lead shooter misses a
        // target displaced more than cone radius + capsule radius during the
        // round's flight — at 160 u a 20 u/s run PERPENDICULAR to the line
        // is nearly unhittable, a 12 u/s one or any run along the line is a
        // kill. Steer the exposed crossing so at least lateralMin of the
        // heading is perpendicular to the threat's line, keeping the
        // along-line sign so the hop still progresses; a heading right on
        // the line picks the walkable side.
        let lx = sdThreat.pos.x - me.pos.x, lz = sdThreat.pos.z - me.pos.z;
        const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const along = hx * lx + hz * lz;
        let px = hx - along * lx, pz = hz - along * lz;
        let pl = Math.hypot(px, pz);
        const headingLateral = pl;
        // (review 2026-10-09: behind a closed line with rounds in the air —
        // sdIncoming, not an exposure ahead — a rotated leg must itself
        // stay hidden from the live eyes, else it would sprint back out of
        // the cover toward the spot the round was aimed at; no such leg ->
        // the route's heading stands)
        const sdBehindLine = sdHidden && !aheadExposed;
        const sdLegSeen = (cx, cz) => {
          const ex = me.pos.x + cx * 4, ez = me.pos.z + cz * 4;
          for (let k = 0; k < sdEyes.length; k += 1) if (sdSeenFrom(sdEyes[k], ex, myShotY, ez)) return true;
          return false;
        };
        if (pl < latMin) {
          // the natural side: the heading's own perpendicular component —
          // or, right on the line, the side kept last / a coin
          let sx0, sz0;
          if (pl >= 0.05) { sx0 = px / pl; sz0 = pz / pl; }
          else {
            const sgn = me.botSDLatSign ?? (me.botSDLatSign = Math.random() < 0.5 ? 1 : -1);
            sx0 = -lz * sgn; sz0 = lx * sgn;
          }
          // The rotated heading must have ROOM (play test 2026-10-05): in a
          // narrow gap between two machines the sideways heading hits a
          // wall, and the follower's re-aim turned the crossing into a
          // jitter at the gap's edge — exposed every other tick.
          // ONE SIDE, THEN THE SLIDE (Factory opening trace 2026-10-09, "no
          // jitter"): the side taken in the last ticks is tried first, at
          // latMin and then at lateralSlide (the wall slide: along the wall
          // with less of the heading perpendicular — still a crossing);
          // only when that side has no room at either does the other side
          // get the legs, and then it keeps them. Neither side walkable ->
          // commit straight through the gap at a sprint (the shortest
          // exposure there is). Inside lateralFullDist (latMin 1) there is
          // no slide: the other side at full lateral, or the commit.
          const pref = me.botSDLatSide;
          const firstSgn = (pref && now - pref.at <= SD.lateralKeepMs && pref.x * sx0 + pref.z * sz0 < 0) ? -1 : 1;
          const alongSgn = along < 0 ? -1 : 1;
          const lats = latMin < 1 && SD.lateralSlide < latMin ? [latMin, SD.lateralSlide] : [latMin];
          let room = false, rx = 0, rz = 0;
          for (let side = 0; side < 2 && !room; side += 1) {
            const sgn = side === 0 ? firstSgn : -firstSgn;
            for (let i = 0; i < lats.length && !room; i += 1) {
              const ak = Math.sqrt(Math.max(0, 1 - lats[i] * lats[i])) * alongSgn;
              let cx = sx0 * sgn * lats[i] + lx * ak, cz = sz0 * sgn * lats[i] + lz * ak;
              const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
              // (room for the BODY, not a thin segment: the thin test sent the
              // rotated heading into cover edges and the wedge detector fired
              // ten times a minute at close range, 2026-10-07)
              if (sdLegFits(me.pos.x, me.pos.z, me.pos.x + cx * 4, me.pos.z + cz * 4) && !(sdBehindLine && sdLegSeen(cx, cz))) {
                rx = cx; rz = cz; room = true;
                me.botSDLatSide = { x: sx0 * sgn, z: sz0 * sgn, at: now };
                me.botSDLatSign = (sx0 * sgn) * -lz + (sz0 * sgn) * lx >= 0 ? 1 : -1;
                if (lats[i] < latMin) me.botSDLateralSlides = (me.botSDLateralSlides ?? 0) + 1;
              }
            }
          }
          if (room) {
            hx = rx + avoid.rx * 0.6;
            hz = rz + avoid.rz * 0.6;
            const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
            me.botSDLateralTicks = (me.botSDLateralTicks ?? 0) + 1;
          } else if (headingLateral < SD.corridorLateral && !sdFree && (!sdHidden || aheadExposed)) {
            // (rounds in the air behind a closed line: no corridor — the route's heading stands)
            // CORRIDOR (owner 2026-10-05): the heading runs along the line and
            // nothing lets it turn — a run the enemy hits as if standing
            // (100 u: 92-100% per round). Caught inside: sprint back to the
            // last hidden spot and mark the corridor; not yet exposed: stop
            // short of it, mark it, re-plan around the mark. A heading that
            // is mostly lateral already, or the enemy's empty mag, commits.
            if (!sdHidden) {
              const lh = me.botSDLastHidden;
              const back = lh ? Math.hypot(lh.x - me.pos.x, lh.z - me.pos.z) : Infinity;
              sdMark(me.pos.x, me.pos.z);
              if (back > 1 && back <= SD.backOffMax) {
                sdDrop();
                me.botSDPeekTo = { x: lh.x, z: lh.z };
                me.botSDPeekArmed = false;
                me.botSDBackOff = true;
                me.botSDBackoffs = (me.botSDBackoffs ?? 0) + 1;
                me.botSDSearchAt = now + SD.searchMs;
                hx = (lh.x - me.pos.x) / back; hz = (lh.z - me.pos.z) / back;
                legMode = 'back';
              }
            } else {
              if (aheadPt) sdMark(aheadPt.x, aheadPt.z);
              sdDrop();
              me.botSDSearchAt = now + SD.searchMs;
              me.botSDHolds = (me.botSDHolds ?? 0) + 1;
              legMode = 'hold';
            }
          }
        } else if (!sdHidden) {
          // (a crossing that needs no rotation still records its side, so
          // the ticks behind the next cover edge keep THAT side — not a
          // stale coin — while the rounds are in the air)
          me.botSDLatSide = { x: px / pl, z: pz / pl, at: now };
        }
      }
      if (sdLegOverride) legMode = sdLegOverride;
      if (legMode === 'hold' || legMode === 'bank') {
        me.momentumVX = 0;
        me.momentumVZ = 0;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
        me.botSDState = legMode;
      } else {
        coverMove = { hold: false, hide: true, dash: legMode === 'back' ? me.boost > SD.dashFloor : sdDash, mx: hx, mz: hz, jump: !!sdJump, jx: sdJump?.x ?? 0, jz: sdJump?.z ?? 0 };
        me.botSDHeadX = hx;
        me.botSDHeadZ = hz;
        // (telemetry: a covered leg that walks — shadow walk, corner creep,
        // bank, travel latch off — reads 'walk', not 'dash')
        me.botSDState = (legMode === 'dash' && !coverMove.dash) ? 'walk' : legMode;
      }
      // WEDGE (owner 2026-10-07, jitter scan — Station 22.8 s: the leg's
      // straight cut clipped an obstacle corner, the body stuck on it and
      // the collision shoved it left-right every tick: 43 reversals a
      // second at full sprint, exposed, the tank gone in 2 s; the 700 ms
      // bail then re-planned the same route because an escape search
      // ignored the marks). A leg that has not moved the body wedgeMoveMin
      // in wedgeMs while commanding a move is wedged: SLIDE along the
      // obstacle — the walkable perpendicular, the side toward the next
      // waypoint first — for slideMs with one sticky heading, then resume
      // the leg. A second wedge on the same route, or no room either way,
      // pins the waypoint and gives the route up (escapes honour pinned
      // marks: sdAvoidPinned).
      if (me.botSDWedgePath !== sp) { me.botSDWedgePath = sp; me.botSDWedge = null; me.botSDRouteWedges = 0; me.botSDSlideUntil = 0; }
      if (coverMove && !coverMove.hold && !coverMove.jump && now > (me.stepUntil || 0)) {
        if (now < (me.botSDSlideUntil ?? 0)) {
          coverMove.mx = me.botSDSlideX; coverMove.mz = me.botSDSlideZ;
          me.botSDHeadX = coverMove.mx; me.botSDHeadZ = coverMove.mz;
        }
        const wa = me.botSDWedge;
        if (!wa || Math.hypot(me.pos.x - wa.x, me.pos.z - wa.z) > SD.wedgeMoveMin) {
          me.botSDWedge = { x: me.pos.x, z: me.pos.z, at: now };
        } else if (now - wa.at >= SD.wedgeMs && now >= (me.botSDSlideUntil ?? 0)) {
          me.botSDWedge = { x: me.pos.x, z: me.pos.z, at: now };
          me.botSDWedges = (me.botSDWedges ?? 0) + 1;
          me.botSDRouteWedges = (me.botSDRouteWedges ?? 0) + 1;
          let slid = false;
          if (me.botSDRouteWedges <= 2) {
            let px = -coverMove.mz, pz = coverMove.mx;
            const nxt = sp[Math.min((me.botSDPathIdx ?? 0) + 1, sp.length - 1)];
            if ((nxt.x - me.pos.x) * px + (nxt.z - me.pos.z) * pz < 0) { px = -px; pz = -pz; }
            const okA = !walkSegmentBlocked(me.pos.x, me.pos.z, me.pos.x + px * 3, me.pos.z + pz * 3, me.pos.y, obstacles);
            const okB = !walkSegmentBlocked(me.pos.x, me.pos.z, me.pos.x - px * 3, me.pos.z - pz * 3, me.pos.y, obstacles);
            if (!okA && okB) { px = -px; pz = -pz; }
            if (okA || okB) {
              me.botSDSlideX = px; me.botSDSlideZ = pz; me.botSDSlideUntil = now + SD.slideMs;
              coverMove.mx = px; coverMove.mz = pz; me.botSDHeadX = px; me.botSDHeadZ = pz;
              slid = true;
            }
          }
          if (!slid) {
            sdMark(wp.x, wp.z, SD.stuckAvoidMs, true);
            sdDrop();
            me.botSDSearchAt = now;
            coverMove = null;
          }
        }
      }
      // NO-PROGRESS BAIL: the remaining route length (to the waypoint plus
      // the edges after it) must shrink by 1 u within bailMs. A position
      // anchor let a +-1 u shake around a waypoint reset itself for ever
      // (shake trace 2026-10-05).
      // (skipped when the corridor rule above already dropped the route:
      // a null index read sp[null] and crashed the Airport batch)
      let sdRemain = Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z);
      for (let k = me.botSDPathIdx ?? sp.length; k < sp.length - 1; k += 1) sdRemain += Math.hypot(sp[k + 1].x - sp[k].x, sp[k + 1].z - sp[k].z);
      if (!me.botSDPath) {
        // (route dropped this tick — nothing to bail from)
      } else if (legMode === 'bank' || !me.botSDMoveAnchor || sdRemain < me.botSDMoveAnchor.best - 1) {
        me.botSDMoveAnchor = { best: sdRemain, at: now };
      } else if (now - me.botSDMoveAnchor.at > SD.bailMs) {
        // STUCK ROUTE (playable trace 2026-10-05: a unit wedged on a crate
        // corner re-planned the same route 37 times in 60 s): the waypoint it
        // could not reach is avoided for stuckAvoidMs (pinned: the wall does
        // not move with the threat), so the next search routes around it or
        // picks another goal.
        const wpStuck = me.botSDPath[me.botSDPathIdx];
        if (wpStuck) sdMark(wpStuck.x, wpStuck.z, SD.stuckAvoidMs, true);
        sdDrop();
        me.botSDSearchAt = now + SD.failRetryMs * 0.5;
        coverMove = null;
      }
    } else if (me.botSDPeekTo) {
      let tx = me.botSDPeekTo.x - me.pos.x, tz = me.botSDPeekTo.z - me.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      // A peek leg and a back-off leg are exposures (or about to be): sprint.
      coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: tx / tl, mz: tz / tl };
      me.botSDState = me.botSDBackOff ? 'back' : 'peek';
      // (a wedged peek leg bails at once — the 700 ms anchor bail above is
      // for a leg that merely stops closing; the point is pinned)
      if (now > (me.stepUntil || 0)) {
        const wa = me.botSDWedge;
        if (!wa || wa.peek !== me.botSDPeekTo || Math.hypot(me.pos.x - wa.x, me.pos.z - wa.z) > SD.wedgeMoveMin) {
          me.botSDWedge = { x: me.pos.x, z: me.pos.z, at: now, peek: me.botSDPeekTo };
        } else if (now - wa.at >= SD.wedgeMs) {
          me.botSDWedges = (me.botSDWedges ?? 0) + 1;
          sdMark(me.botSDPeekTo.x, me.botSDPeekTo.z, SD.stuckAvoidMs, true);
          me.botSDPeekTo = null; me.botSDPeekAnchor = null; me.botSDBackOff = false; me.botSDPeekArmed = false;
          me.botSDSearchAt = now;
          me.botSDPeekBails = (me.botSDPeekBails ?? 0) + 1;
          coverMove = null;
        }
      }
    } else if (sdHidden) {
      // COVER / WATCH: the dwell, the reload or the watch running — pace the
      // cover on a short leash (BOT_SD pace* knobs) instead of standing dead
      // still. A leg (paceLeg ahead) must stay inside paceLeash of the
      // arrival point, be walkable, keep the muzzle hidden from every live
      // eye — and from the predicted / spread eyes when any such leg exists
      // (pass 0; live eyes only as the fallback, pass 1) — and, while
      // watching, keep the watched exits covered. The current leg is
      // re-checked against the live eyes every tick and re-picked every
      // paceMs from 8 headings scored along the threat's line (strafing the
      // cover's face) with continuity and noise; half the legs end in a short
      // stand. No hidden leg at all (a tight nook) -> stand paceRetryMs.
      const watching = now < (me.botSDWatchUntil ?? 0);
      if (!me.botSDPaceAnchor) me.botSDPaceAnchor = { x: me.pos.x, z: me.pos.z };
      const anchor = me.botSDPaceAnchor;
      // The sprint momentum is dropped in cover (the old hold did the same):
      // a pacing leg moves at paceSpeed x walk, not walk + the arrival dash.
      me.momentumVX = 0;
      me.momentumVZ = 0;
      let hx = 0, hz = 0;
      if (SD.paceSpeed > 0) {
        // A leg is hidden from the live eyes AND the predicted / spread eyes
        // — the hop goals' own standard. (The base hide stance falls back to
        // live eyes only; in SD that fallback parked units a step from a
        // cover's edge and the enemy's next sidestep opened the line.)
        const PP = globalThis.__sdProf ? (globalThis.__sdProf.pace ??= {}) : null;   // (harness profiling: why legs fail)
        // "Never onto open ground" is relative to where the unit stands
        // (owner 2026-10-09, the shuffle): a spot hidden by a surface or a
        // far box reads as open (cover > openDist) and every leg from it
        // failed — the unit stood dead still in 78% of its cover time. A leg
        // may now be as open as the spot itself, never more.
        const hereCover = coverDistanceAt(sdGrid, me.pos.x, me.pos.z, myFloorY, obstacles);
        const legCoverMax = Math.max(SD.openDist, hereCover + 0.5);
        const legOk = (cx, cz, leg = SD.paceLeg) => {
          const lx = me.pos.x + cx * leg, lz = me.pos.z + cz * leg;
          if (Math.hypot(lx - anchor.x, lz - anchor.z) > SD.paceLeash) { if (PP) PP.leash = (PP.leash ?? 0) + 1; return false; }
          if (walkSegmentBlocked(me.pos.x, me.pos.z, lx, lz, me.pos.y, obstacles)) { if (PP) PP.walk = (PP.walk ?? 0) + 1; return false; }
          if (coverDistanceAt(sdGrid, lx, lz, myFloorY, obstacles) > legCoverMax) { if (PP) PP.open = (PP.open ?? 0) + 1; return false; }   // never MORE open than here
          for (let k = 0; k < sdSearchEyes.length; k += 1) if (sdSeenFrom(sdSearchEyes[k], lx, myShotY, lz)) { if (PP) PP.seen = (PP.seen ?? 0) + 1; return false; }
          if (watching && watchScore(lx, lz, myFloorY) < SD.exitMin) { if (PP) PP.watch = (PP.watch ?? 0) + 1; return false; }
          if (PP) PP.ok = (PP.ok ?? 0) + 1;
          return true;
        };
        hx = me.botSDPaceX ?? 0; hz = me.botSDPaceZ ?? 0;
        const moving = hx !== 0 || hz !== 0;
        if (now < (me.botSDPacePauseUntil ?? 0)) {
          hx = 0; hz = 0;
        } else if (moving && now >= (me.botSDPaceUntil ?? 0) && SD.pacePauseMs > 0 && Math.random() < SD.pacePauseChance) {
          me.botSDPacePauseUntil = now + Math.random() * SD.pacePauseMs;
          hx = 0; hz = 0;
        } else if (!moving || now >= (me.botSDPaceUntil ?? 0) || !legOk(hx, hz, me.botSDPaceLeg ?? SD.paceLeg)) {
          // THE SHUFFLE (owner 2026-10-09, "very short range moving to prevent
          // pure stand still"): the 8 headings at paceLeg first, then at
          // paceLegMin — a tight nook that hides no 0.8 u leg still gets a
          // 0.4 u shuffle; every leg passes the same hidden / cover / walk
          // tests, so the move never costs survival. Fore / aft legs score
          // alongside lateral ones (paceLateralWeight), and a heading is not
          // reversed within paceReverseMinMs of the last pick unless nothing
          // else is legal: a human shifting weight in cover, not a twitch.
          let best = null, bestScore = -Infinity, bestLeg = SD.paceLeg;
          let lx = sdThreat.pos.x - me.pos.x, lz = sdThreat.pos.z - me.pos.z;
          const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
          const phase = Math.random() * Math.PI * 2;
          const recent = moving && now - (me.botSDPacePickAt ?? -1e9) < SD.paceReverseMinMs;
          for (const leg of [SD.paceLeg, SD.paceLegMin]) {
            for (let pass = 0; pass < 2 && !best; pass += 1) {
              for (let k = 0; k < 8; k += 1) {
                const a = phase + k * Math.PI / 4;
                const cx = Math.cos(a), cz = Math.sin(a);
                if (pass === 0 && recent && (cx * hx + cz * hz) < -0.3) continue;   // (no reversal yet)
                if (!legOk(cx, cz, leg)) continue;
                const score = SD.paceLateralWeight * Math.abs(cx * lz - cz * lx) + 0.5 * (cx * hx + cz * hz) + (Math.random() - 0.5) * 0.8;
                if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; bestLeg = leg; }
              }
            }
            if (best) break;
          }
          if (best) {
            hx = best.x; hz = best.z;
            me.botSDPaceUntil = now + SD.paceMs;
            me.botSDPacePickAt = now;
            me.botSDPaceLeg = bestLeg;
          } else {
            hx = 0; hz = 0;
            me.botSDPacePauseUntil = now + SD.paceRetryMs;
          }
        }
        me.botSDPaceX = hx;
        me.botSDPaceZ = hz;
      }
      if (hx === 0 && hz === 0) {
        me.momentumVX = 0;
        me.momentumVZ = 0;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      } else {
        coverMove = { hold: false, hide: true, dash: false, mx: hx * SD.paceSpeed, mz: hz * SD.paceSpeed };
      }
      me.botSDState = watching ? 'watch' : 'cover';
    } else if (!sdOverBudget) {
      // FIGHT: the budget window — fire from here (the fire block), standing
      // still (always when the enemy walked into a watched line) or
      // strafe-walking across the target line (flip on a wall).
      // Every exposed manoeuvre sprints (owner 2026-10-05) — the watch fight
      // too: the first round is the base cone whether the unit stands or not.
      if (SD.fightStill) {
        me.momentumVX = 0;
        me.momentumVZ = 0;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      } else {
        let sg = me.botSDStrafeSign ?? (me.botSDStrafeSign = (Math.random() < 0.5 ? 1 : -1));
        // A PEEK'S WINDOW strafes AWAY from the cover it stepped out of,
        // never back into it: the strafe sign is a match-long coin flip, and
        // on the factory2 idle trace (seed 12, 2026-10-07) it pointed
        // straight back at the peek origin on all 28 peeks — one tick of
        // shoulder, hidden again, no line ever opened. (For this window
        // only: the sign is not kept — a kept sign walked the tank runs
        // into the band's floor.) A wall on the away side: stand and fire.
        let peekAway = false;
        if (me.botSDPlanned && me.botSDPeekOrigin && !me.botSDPeekStepped) {
          const o = me.botSDPeekOrigin;
          const away = sideX * (me.pos.x - o.x) + sideZ * (me.pos.z - o.z);
          if (Math.abs(away) > 0.3) { sg = away > 0 ? 1 : -1; peekAway = true; }
        }
        // (the window strafes from its first tick — owner 2026-10-07: standing
        // for the first round, even in a slit, got the unit killed "immediately
        // after gunning": tank trace sc 82, dead at the first peek)
        let tx = sideX * sg + avoid.rx * 0.8, tz = sideZ * sg + avoid.rz * 0.8;
        if ((tx * avoid.rx + tz * avoid.rz) < -0.4 && avoidMag > 0.4) {
          if (peekAway) {
            tx = 0; tz = 0;
          } else {
            me.botSDStrafeSign = -sg;
            tx = -sideX * sg + avoid.rx * 0.8; tz = -sideZ * sg + avoid.rz * 0.8;
          }
        }
        if (tx === 0 && tz === 0) {
          me.momentumVX = 0;
          me.momentumVZ = 0;
          coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
        } else {
          const tl = Math.hypot(tx, tz) || 1;
          // (a planned window WALKS its aim time — peekAimMs — and sprints
          // from the first round on: a sprinted aim used up the strafe the
          // dodge can bring back, sdStrafeMax, before the first shot)
          const aiming = me.botSDPlanned && sdExposedFor < SD.peekAimMs;
          coverMove = { hold: false, hide: true, dash: !aiming && me.boost > SD.dashFloor, mx: tx / tl, mz: tz / tl };
        }
      }
      me.botSDState = 'fight';
    } else {
      // OPEN: past the budget, nothing hidden found yet — strafe-sprint
      // across the target line while the search retries (flip on a wall or
      // every 600-900 ms).
      if (now >= (me.botSDStrafeUntil ?? 0)) {
        me.botSDStrafeSign = -(me.botSDStrafeSign ?? 1);
        me.botSDStrafeUntil = now + 600 + Math.random() * 300;
      }
      const sg = me.botSDStrafeSign ?? 1;
      let tx = sideX * sg + avoid.rx * 0.8, tz = sideZ * sg + avoid.rz * 0.8;
      if ((tx * avoid.rx + tz * avoid.rz) < -0.4 && avoidMag > 0.4) {
        me.botSDStrafeSign = -sg;
        me.botSDStrafeUntil = now + 600 + Math.random() * 300;
        tx = -sideX * sg + avoid.rx * 0.8; tz = -sideZ * sg + avoid.rz * 0.8;
      }
      const tl = Math.hypot(tx, tz) || 1;
      // (SEEN: the one exposure gate, down to dashFloor — owner 2026-10-07,
      // "critical = the enemy's line is on me"; the reserve had this strafe
      // walking at 12 u/s in the open, hittable out to 160 u)
      coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: tx / tl, mz: tz / tl };
      me.botSDState = 'open';
    }
    // STALL: hidden with no hop found for stallMs (the target stands in a
    // coverless pocket) -> hand the legs to the plain brain until a hop
    // appears; the exposure rules above still apply next tick.
    if (sdHidden && !me.botSDPath && !me.botSDPeekTo && me.botSDStallSince != null
        && now - me.botSDStallSince > SD.stallMs) {
      // (a spot that stalled is no "better position" for a while: the
      // better hop walked the unit back to the same lineless spot it had
      // just stalled on, every 10 s for 90 s — Lobby camper trace 2026-10-07)
      if (me.botSDStallMarkAt !== me.botSDStallSince) {
        me.botSDStallMarkAt = me.botSDStallSince;
        sdMark(me.pos.x, me.pos.z, SD.stuckAvoidMs, true);
      }
      coverMove = null;
      me.botSDState = 'plain';
    }
    // STUCK WATCHDOG window: the plain brain has the legs (and its own wedge
    // detectors, since no coverMove pins the stall clocks below).
    if (now < (me.botSDPlainUntil ?? 0)) {
      coverMove = null;
      me.botSDState = 'plain';
      me.botSDPaceAnchor = null;   // (the plain legs move the unit: the next search starts from where it is)
    }
    if (!sdHidden) me.botSDStallSince = null;
  } else if (me.botSD) {
    me.botSDState = 'dodge';
  }

  if (coverMove) {
    // Pin the stall clocks: a deliberate hide (cover reload OR the hide
    // order) must not read as wedged / stalled / sightless — those
    // detectors' remedies all route toward SIGHTED cells and would fight
    // the cover intent on exit.
    me.botLastProgressAt = now;
    me.botLastLoSAt = now;
    me.botStuckCheckX = me.pos.x;
    me.botStuckCheckZ = me.pos.z;
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
      me.botStuckMemX = me.pos.x;
      me.botStuckMemZ = me.pos.z;
      me.botStuckMemAt = now;
    }
    me.botStuckCheckX = me.pos.x;
    me.botStuckCheckZ = me.pos.z;
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
  // the detectors re-fire. Paths live on matchState._navPaths, NOT on the fighter: the
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
    // Diagonal legs where the swept corridor proves them safe (see
    // smoothPath's header note). Mirrored in main.js navPlan.
    if (path && path.length > 2) path = smoothPath(grid, path, obstacles);
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
  const sdParks = !!(me.botSD && coverMove);
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
    const navPrev = matchState._navPaths ? matchState._navPaths[botId] : null;
    const frozenWp = stuckFrozen && navPrev ? navPrev.path[navPrev.idx] : null;
    let planned = navPlan();
    if (planned && frozenWp) {
      const fresh = matchState._navPaths[botId];
      // The follower's own advance rule: the waypoint it would steer to.
      let fi = fresh.idx;
      while (fi < fresh.path.length - 1
          && Math.hypot(fresh.path[fi].x - me.pos.x, fresh.path[fi].z - me.pos.z) < BOT_WAYPOINT_ADVANCE_RADIUS) fi += 1;
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
        delete matchState._navPaths[botId];
        planned = false;
        me.botMazeEscapeUntil = now + 800;
        const edx = me.pos.x - frozenWp.x, edz = me.pos.z - frozenWp.z;
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
    if (!tooClose && me.grounded && !me.airborne) {
      // Climb aid: only for a step a jump can actually clear. Above that the
      // router owns it — and the aid was unreachable dead code until the
      // vertical-stack fix above (it needs dist < 32 while tooClose held for
      // every dist below lowerRange >= 33, i.e. 0 of 18 units could run it).
      if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF
          && oppFloorY - myFloorY <= BOT_CLIMB_MAX_RISE
          && dist < 32 && Math.random() > 0.5) {
        if (botTryJump(me, now)) jumpThisTick = true;
      } else if (onHighGround) {
        // STATION MOUNT HOLD (map-keyed, 2026-08-05): for a beat after a
        // fresh mount, skip the descent aid so the bot doesn't yo-yo right
        // back down — the 22-wide track corridor keeps the firing band
        // valid from the deck edge, so hopping down to close a small gap
        // is a needless descent. EXCEPTIONS that still descend: sight lost,
        // or the target pulled well past the band (those need the chase).
        const holdUp = STATION_BOT_RULES && matchState.mapKey === 'station'
          && now < (me.botMountHoldUntil ?? 0)
          && playerHasLoS
          && dist < upperRange + 12;
        if (!holdUp) {
          const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
          if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
            jumpDirX = exit.toX; jumpDirZ = exit.toZ;
            if (botTryJump(me, now)) jumpThisTick = true;
          }
        }
      } else {
        // Low ground: take any reachable platform — no "toward player" gate,
        // since on maps like Station the raised decks are the strong positions
        // and we'd rather be up there than on the tracks. The jump cooldown
        // rate-limits this; no strict random gate needed.
        const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botTryJump(me, now)) {
            jumpThisTick = true;
            // STATION MOUNT HOLD: see the onHighGround branch above.
            if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
          }
        } else if (STATION_BOT_RULES && matchState.mapKey === 'station' && perch
            && (perch.toX * dirX + perch.toZ * dirZ > 0.2 || perch.dist < 12)) {
          // STATION-ONLY PERCH PULL (map-keyed, 2026-08-05 user order):
          // on this one map the decks are the strong positions but they're
          // jump-only (no ramps, so paths never cross them) — steer the
          // approach toward a scanned ledge that's roughly ON THE WAY
          // (within ~78° of the target direction, or already close — 12 covers
          // the track corridor half-width), and the jump above fires when it
          // comes into reach. Weight 0.6
          // keeps the target-pull dominant; every other map skips this
          // branch entirely (behavior byte-identical elsewhere).
          const tx = mx + perch.toX * 0.6;
          const tz = mz + perch.toZ * 0.6;
          const tl = Math.hypot(tx, tz) || 1;
          mx = tx / tl; mz = tz / tl;
        }
      }
    }
  } else if (botS === 'maze') {
    let nav = matchState._navPaths ? matchState._navPaths[botId] : null;
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
        if (nav) delete matchState._navPaths[botId];
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
      if (Math.hypot(lastWp.x - me.pos.x, lastWp.z - me.pos.z) < 3) {
        // Arrived — but if the trip did NOT buy sight of the target, dropping
        // to the pathless fallback sends the bot beelining back where it came
        // from (the Streets under-bridge out-and-back loop). Ask for a fresh
        // route first and take it when it aims somewhere NEW; only fall back
        // when the planner has nothing better, which keeps the original
        // "never stand on a consumed path" property.
        let replaced = false;
        if (!playerHasLoS) {
          navPlan();
          const fresh = matchState._navPaths ? matchState._navPaths[botId] : null;
          const freshLast = fresh && fresh.path[fresh.path.length - 1];
          if (freshLast && Math.hypot(freshLast.x - lastWp.x, freshLast.z - lastWp.z) > 0.5) {
            nav = fresh;
            replaced = true;
          }
        }
        if (!replaced) {
          delete matchState._navPaths[botId];
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
          && Math.hypot(wp.x - me.pos.x, wp.z - me.pos.z) < BOT_WAYPOINT_ADVANCE_RADIUS) {
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
      const jumpBank = Math.max(BOT_TRAVEL_SPRINT_FLOOR, (me.unit?.jumpBoostCost ?? 48) + 10);
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
          me.pos.x, me.pos.z, me.botStuckMemX, me.botStuckMemZ, BOT_STUCK_MEMORY_RADIUS);
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
    if (me.grounded && !me.airborne) {
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS, 0);
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

    // STATION LOW-LEVEL DISCOURAGEMENT (map-keyed, 2026-08-05 user order):
    // fighting on the track level is tolerated only briefly. After ~3 s of
    // continuous Engage time down there, a ramping pull (0 → 0.6 over the
    // next 3 s; the orbit/range discipline stays dominant) drifts the bot
    // toward the nearest mountable deck edge, and the perch jump below
    // completes the mount. Short exchanges and transit are untouched; the
    // continuity check restarts the clock after any gap (state change,
    // death, leaving the low floor). Other maps skip all of it.
    if (STATION_BOT_RULES && matchState.mapKey === 'station' && !onHighGround) {
      const cont = now - (me.botLowDwellTickAt ?? 0) < 250;
      me.botLowDwellTickAt = now;
      if (!cont || me.botLowDwellSince == null) me.botLowDwellSince = now;
      const dwell = now - me.botLowDwellSince;
      if (dwell > 3000) {
        const deck = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (deck) {
          const w = Math.min(0.6, ((dwell - 3000) / 3000) * 0.6);
          const px2 = mx + deck.toX * w;
          const pz2 = mz + deck.toZ * w;
          const pl = Math.hypot(px2, pz2) || 1;
          mx = px2 / pl; mz = pz2 / pl;
        }
      }
    }

    // On low ground? Hop onto any reachable platform — high ground is the
    // better engagement / vantage spot on Station-like maps. Doesn't override
    // the orbit (just adds a jump when the chance is there); the jump cooldown
    // limits how often this fires.
    if (me.grounded && !me.airborne && !onHighGround) {
      const perch = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.3) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botTryJump(me, now)) {
          jumpThisTick = true;
          // STATION MOUNT HOLD: a fresh mount suppresses the pursue descent
          // aid for a beat (see onHighGround branch) so the bot doesn't
          // yo-yo straight back down.
          if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
        }
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
      if (me.grounded && !me.airborne && me.botGlintStepAt == null) {
        const ahead = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, 6);
        if (ahead && ahead.dist < BOT_LEDGE_JUMP_REACH
            && ahead.toX * mx + ahead.toZ * mz > 0.8) {
          jumpDirX = ahead.toX;
          jumpDirZ = ahead.toZ;
          if (botTryJumpSurvival(me, now)) {
            jumpThisTick = true;
            me.botDefenseStuckTicks = 0;
            // STATION MOUNT HOLD: an escape mount also holds the deck.
            if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
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
        if (me.grounded && !me.airborne && me.botGlintStepAt == null) {
          const ledge = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, 6);
          if (ledge && ledge.dist < BOT_LEDGE_JUMP_REACH
              && ledge.toX * (me.botDefenseDirX ?? sideX) + ledge.toZ * (me.botDefenseDirZ ?? sideZ) > 0.3) {
            jumpDirX = ledge.toX;
            jumpDirZ = ledge.toZ;
            if (botTryJumpSurvival(me, now)) {
              jumpThisTick = true;
              vaulted = true;
              // STATION MOUNT HOLD: an escape mount also holds the deck.
              if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
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
  // Sprint funding tiers: Defense (escaping live fire) may spend down to the
  // hard floor; the HIDE stance's latched route sprint (owner 2026-09-26) is
  // funded down to the hard floor too — the latch itself (arm > 50, drop
  // <= 8) paces it; every other state (Pursue / Maze travel) stops at the
  // travel floor — the latch above arms them only from a full tank.
  const botSprintFloor = me.botState === 'defense' ? BOT_SPRINT_MIN_BOOST
    : (coverMove && coverMove.hide) ? BOT_SPRINT_MIN_BOOST
    : BOT_TRAVEL_SPRINT_FLOOR;
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
    // Anti-freeze nudge — skipped during a cover-reload HOLD (the hold paces
    // its own narrow sway; the nudge must not override a flip instant).
    if (!(coverMove && coverMove.hold)
        && Math.abs(me.vel.x) + Math.abs(me.vel.z) < 0.08) {
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
    // (the fire reaction: the SD brain's knobs; the plain bot's only when
    // the harness asks for the same reaction on both sides, plainReactMs)
    const reactSD = SDG ?? (BOT_SD.plainReactMs > 0 ? { fireReactMs: BOT_SD.plainReactMs, fireReactBreakMs: BOT_SD.fireReactBreakMs } : null);
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
    } else if (!botMayFire(u, me, Math.hypot(opp.pos.x - me.pos.x, opp.pos.y - me.pos.y, opp.pos.z - me.pos.z), matchState.mode)) {
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
      me.nextFireAt = now + TICK_RATE_MS;
    } else if (!botShotCanLand(myShotY, me, opp, obstacles, surfaces)) {
      // No clear shot — hold fire and check again shortly. The origin is the
      // GROUNDED muzzle (see myShotY): a jump must not manufacture a firing line.
      // SD in band: poll every firePollMs — a sprint through a one-cell gap
      // lasts ~200 ms and the 220 ms poll let it go unshot.
      me.nextFireAt = now + ((SDG && dist <= (me.botSDUpper ?? upperRange) + 20) ? SDG.firePollMs : 220);
      me.machineBurstRemaining = 0;
      botClearFireRule(me);
      if (reactSD) sdFireLineLost(me, now, reactSD);
    } else if (reactSD && sdFireReactHold(me, now, reactSD)) {
      // FIRE REACTION (owner 2026-10-06, "make SD bot attack reaction 250 ms
      // like human"): the line opened less than fireReactMs ago — still
      // acquiring. Polls every tick; the first round goes the tick the
      // reaction is up.
      me.nextFireAt = now + TICK_RATE_MS;
      me.machineBurstRemaining = 0;
      botClearFireRule(me);
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
      if (fired) botNoteShot(me);
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
