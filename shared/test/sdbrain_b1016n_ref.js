// THE SUDDEN DEATH BRAIN — one module, both hosts (owner 2026-10-16,
// "make SD brain patchless with same behaviour"). The server's tickBot
// (ai.js) and the client's updateEnemy (main.js) each build a HOST — the
// unit, its enemies, the arena and the body's actions behind a small
// interface — and call sdBrainTick(host) once a tick; it returns the legs'
// order (coverMove) and keeps its scratch on the unit (botSD*). There is
// no second copy of the brain any more, and no switch: every rule is always
// on, the numbers under each rule (BOT_SD) are the only knobs. The risk
// models live here too; ai.js re-exports them for the fire block.
//
// THE TICK, in order (the banners below):
//   1. PERCEIVE   — the eyes, hidden or not, the band, the zone, the trail,
//                   the gun hot or quiet, what the rules will read.
//   2. THE BUDGET — the exposure clock, the tank, the leave rule: is this
//                   exposure over (sdOverBudget).
//   3. THE GATES  — what a planned move must pass: the risk cap, the trade,
//                   the hot gun (R7), the tank — one function, sdHopOk.
//   4. BOOKKEEPING — the route under way, the peek leg, the watch, the hot
//                   wait.
//   5. THE ATTACKS — the fee peek (R9) at once; the engage run and the stand
//                   peek are the first stages of the plan (R3).
//   6. THE PLAN   — the hop search: hold, or the stage list (deep, escape,
//                   closing, rotate, flank, better, push; the engage and fire
//                   stages when due), one route search per tick.
//   7. THE REACTION — the flinch step the tick a line opens (R1 for a
//                   reaction), else the run.
//   8. THE LEGS   — one order for the body: the step, the route, the peek
//                   leg, the run, the cover shuffle (the rotation), the fight
//                   or open strafe.
//   9. AFTER      — the stream rule on that order, the stalled body, the
//                   handover to the plain brain, the tape.
// Equivalence: shared/test/sdbrain_equiv.test.js plays this brain against
// the frozen pre-module brain tick for tick on seeded matches.
//
// THE HOST INTERFACE (sdBrainTick(h)):
//   now, SD (the knobs), me (the unit's state: boost, hp, ammo, step clocks,
//   the botSD* scratch), pos {x,y,z} (the body), unit, vel, grounded,
//   opp {id, pos, hp, unit, invulnerableUntil}, enemies [{id, pos, vel,
//   unit, lastFireAt, bloom, hp, ammo, reloadingUntil, log}],
//   obstacles, grid, clear(p0, p1), eyeUp (a unit's muzzle above its
//   position), muzzleH (a cell's muzzle above its floor + GROUND_BASE_Y),
//   dist, sideX, sideZ, myFloorY, myShotY, avoid {rx, rz}, avoidMag,
//   playerHasLoS, groundHeightAt(x, z, fallback), startStep(dx, dz),
//   startJump(), searchSlot() (claims this tick's one route search),
//   deadline() (the search's CPU budget), tape(row) or null.
import { walkSegmentBlocked, unitOverlapsObstacle, segmentHitsObstacle, projectileHitsSurface, obstaclesNearSegment } from '../src/sim/physics.js';
import { findHiddenSpot, coverDistanceAt } from '../src/sim/navgrid.js';
import { STEP_BOOST_COST, STEP_DURATION_MS, STEP_DISTANCE, GROUND_BASE_Y, BOOST_MOVE_SPEED, TICK_RATE_MS, PROJECTILE_MUZZLE_Y_OFFSET, HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, BOOST_DASH_DRAIN_PER_TICK, SHOTGUN_PATTERN, SHOTGUN_CLUSTER_SPREAD_DISTANCE } from '../src/sim/constants.js';

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
// VOLLEY (the shotguns, spreadCount > 1): a blast is not a cone that thins
// with distance — a fixed 8-slot pattern (SHOTGUN_PATTERN, stretched by the
// gun's volleyStretchX) that opens over SHOTGUN_CLUSTER_SPREAD_DISTANCE and
// then keeps its size, every pellet lethal at 1 HP. A blast lands when ANY
// slot falls on the capsule after the no-lead drift `s`: the share of the
// per-shot rotations that do. (Owner 2026-10-11: the cone read Hoshino at
// 100 u as 6% a second; the pattern lands on a walker every time out to
// 140 u, and on a sprinter only inside ~70 u.) Cached on a 5 u / 0.25 u grid.
const sdVolleyCache = new Map();
function sdVolleyHitFrac(u, d, s) {
  const stretch = u.volleyStretchX ?? 1;
  const dq = Math.min(SHOTGUN_CLUSTER_SPREAD_DISTANCE, Math.round(d / 5) * 5), sq = Math.round(s * 4) / 4;
  const key = `${stretch}|${dq}|${sq}`;
  const hit = sdVolleyCache.get(key);
  if (hit != null) return hit;
  const f = Math.min(1, dq / SHOTGUN_CLUSTER_SPREAD_DISTANCE);
  const N = 36;
  let lands = 0;
  for (let i = 0; i < N; i += 1) {
    const rot = (i / N) * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < SHOTGUN_PATTERN.length; k += 1) {
      const px = SHOTGUN_PATTERN[k][0], py = SHOTGUN_PATTERN[k][1];
      const x = (px * c - py * sn) * stretch * f, y = (px * sn + py * c) * f;
      if (Math.abs(x - sq) < HIT_RADIUS_NORMAL && Math.abs(y) < HIT_HALF_HEIGHT + HIT_RADIUS_NORMAL) { lands += 1; break; }
    }
  }
  const frac = lands / N;
  if (sdVolleyCache.size > 4096) sdVolleyCache.clear();
  sdVolleyCache.set(key, frac);
  return frac;
}

// (No shot lead: every shot in this game — the player's lock-on, the plain
// bot's, this one's — is aimed at the target's CURRENT position. A lead was
// tried on 2026-10-05 and removed the same day; the lead rule of 2026-10-15
// was answered by the death report — the kills at range are the SPRAY — and
// is gone with its knobs.)
export function sdExposureRisk(threat, SD, d, lat, T, elapsed = 0, speed = SD.riskSprint, bloom = (threat.bloom ?? threat.state?.bloom ?? 0), hot = false) {
  const u = threat.unit ?? {};
  const base = u.spreadAngle ?? 0.02, pv = u.projectileSpeed ?? 600;
  const volley = (u.spreadCount ?? 1) > 1;   // (the shotguns' exposure risk from their real pellet pattern, sdVolleyHitFrac, not the cone)
  // (the first hotEdgeMs of a hot gun's exposure: the stream was on the edge before the unit came out — no credit for those rounds)
  const edgeMs = hot ? (SD.hotEdgeMs ?? 0) : 0;
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
  // HOT GUN (owner 2026-10-14, "too easy to kill the SD BOT by spamming from
  // distance"): a gun that is firing has rounds already in the air at the
  // corner — nothing to react to and no flight to wait for; the stream is on
  // the unit from the first ms of the window.
  const react = hot ? 0 : SD.riskReactMs + (d / pv) * 1000;
  const before = Math.max(0, elapsed - react) / shotMs;   // rounds already fired in this exposure: their bloom is on the cone
  const shots = Math.max(0, elapsed + T - react) / shotMs - before;
  let survive = 1;
  for (let k = 0, left = shots; left > 0; k += 1, left -= 1) {
    const n = Math.floor(before) + k;   // (the round's index in this exposure)
    const sa = Math.min(cap, sa0 + n * perShot);
    // (fired this long after the line opened)
    const fireAt = react + n * shotMs;
    const sK = fireAt < edgeMs ? 0 : s;
    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, sK);
    if (volley) p = Math.max(p, sdVolleyHitFrac(u, d, sK));   // (the larger of the two reads — never bolder than the cone)
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}

// THE UNIT'S OWN SIDE OF THE TRADE (owner 2026-10-14): the chance that at
// least one of `me`'s own rounds lands on `threat` inside a window of T ms
// at distance d — the same capsule arithmetic as sdExposureRisk, from the
// other side: the unit's cone plus its live bloom, its cadence, its round's
// flight (a planned window fires from its first tick, peekAimMs), and the
// threat's drift across the line during that flight (its live velocity — a
// standing sprayer drifts nothing). A volley gun lands by its pattern.
export function sdOwnHitChance(me, threat, d, T, SD) {
  const u = me.unit ?? {};
  const pv = u.projectileSpeed ?? 600;
  const base = u.spreadAngle ?? 0.02, cap = Math.max(base, u.bloomCap ?? base), perShot = u.bloomPerShot ?? 0;
  const sa0 = Math.min(cap, base + Math.max(0, me.bloom ?? me.state?.bloom ?? 0));
  const shotMs = Math.max(SD.riskShotMs, u.fireCooldownMs ?? 0);
  const tv = threat.vel ?? threat.state?.vel ?? null;
  const vx = tv?.x ?? 0, vz = tv?.z ?? 0;
  const lx = threat.pos.x - me.pos.x, lz = threat.pos.z - me.pos.z, ll = Math.hypot(lx, lz) || 1;
  // (the target is taken to be WALKING across the line at the least — a
  // sprayer standing still this instant will not stand still for the shot;
  // owner 2026-10-14, "一律假設對方在走動")
  const latSpeed = Math.max(threat.unit?.walkSpeed ?? 12, Math.abs(vx * lz - vz * lx) / ll);
  const s = latSpeed * (d / pv);
  const first = (SD.peekAimMs ?? 0) + (d / pv) * 1000;
  const shots = T >= first ? 1 + (T - first) / shotMs : 0;
  const volley = (u.spreadCount ?? 1) > 1;
  let survive = 1;
  for (let k = 0, left = shots; left > 0; k += 1, left -= 1) {
    const sa = Math.min(cap, sa0 + k * perShot);
    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, s);
    if (volley) p = Math.max(p, sdVolleyHitFrac(u, d, s));
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}
// OWN REACH: the distance to which every round of the unit's base cone lands
// on a target that stands still (the cone's footprint fits the hit radius)
// — the band's far edge: beyond it the unit's own fire thins out too. A
// volley gun's pattern is not a cone: its lock range stands in.
// (The rifles 160, Atsuko 107, Hina 80, Marina 53, the shotguns 40.)
// A unit's own set reach (UNIT_DATA sdReach) stands in for the cone's: the
// 0.02 assault rifles and the M60 reach 160 by the cone, and the owner wants
// them engaging from 80 in Sudden Death (2026-10-11: Saori, Asuna, Koyuki).
export function sdOwnReach(unit) {
  const u = unit ?? {};
  if (u.sdReach != null) return u.sdReach;
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
// `shoulder` (owner 2026-10-15): a piece is exposed when its centre OR either
// shoulder across the eye's line (shoulder u out) is — a thin prop hides the
// centre line and nothing else, and the enemy's sidestep opens it.
export function sdRouteRisk(path, sx, sz, floorY, eyes, threat, SD, clear, speed = SD.riskSprint, hot = false, shoulder = 0) {
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
      for (let e = 0; e < eyes.length && !exposed; e += 1) {
        const eye = eyes[e];
        if (clear(eye, mid)) { exposed = true; break; }
        if (shoulder > 0) {
          let nx = eye.z - mid.z, nz = mid.x - eye.x;
          const nl = Math.hypot(nx, nz) || 1; nx = nx / nl * shoulder; nz = nz / nl * shoulder;
          if (clear(eye, { x: mid.x + nx, y: muzzleY, z: mid.z + nz }) || clear(eye, { x: mid.x - nx, y: muzzleY, z: mid.z - nz })) exposed = true;
        }
      }
      const T = (len / nSub) / speed * 1000;
      if (!exposed) { inRun = false; elapsed = 0; continue; }
      exposedLen += len / nSub;
      if (!first) first = { x: mid.x, z: mid.z };
      if (!inRun) { inRun = true; elapsed = 0; }
      let lx = threat.pos.x - mid.x, lz = threat.pos.z - mid.z;
      const d = Math.hypot(lx, lz) || 1; lx /= d; lz /= d;
      const lat = Math.abs(dx * lz - dz * lx);
      survive *= 1 - sdExposureRisk(threat, SD, d, lat, T, elapsed, speed, undefined, hot);
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
  peekMs: 250,            // a DELIBERATE peek's planned fire time: sizes the risk window of a stand peek, the "fought" threshold (half of it) and the tank the peek needs
  peekJitterMs: 100,      //   + uniform jitter
  dwellMinMs: 250,        // cover dwell before the next hop (near the band)
  dwellMaxMs: 700,
  farDwellMs: 120,        // dwell when far outside the band (nothing to breathe for)
  dashFloor: 8,           // an exposed crossing, an open-ground run, a peek, an escape or a dodge sprints down to here (the normal bot's BOT_SPRINT_MIN_BOOST)
  sprintBurstMs: 500,     // ANTI-FLICKER (owner 2026-10-05, "no 抖動步伐"): a sprint started for an exposure runs at least this long (or to dashFloor) — the exposed / open tests flip tick to tick along a slatted fence and the pose went dash-walk-dash
  jumpBank: 110,          // JUMP LINK (owner 2026-10-05, Station): a route crossing onto a ledge needs the jump (48) + the dodge right after it (48) + a margin in the tank; while such a link lies ahead the covered legs walk and bank to this
  jumpReach: 7,           //   the vault starts within this distance of the ledge waypoint (the maze follower's rule)
  holdMaxMs: 6000,        // NEVER HOLD FOREVER (owner 2026-10-05, Station): a "good" position with no shot line for this long is not good — the hold ends, the search runs, and a search that still finds nothing ends in THE APPROACH stage (the hidden route nearer the enemy)
  exposedRetryMs: 150,    // nothing found while exposed: retry this soon
  hopGainMin: 10,         // advance / retreat gain per hop (u), scaled 0.3 x dist ...
  hopGainMax: 45,         //   ... and capped
  shiftMin: 8,            // lateral shift inside the band: at least this far from the current spot
  searchMs: 250,          // search cadence while a hop is wanted
  failRetryMs: 500,       // nothing found at any stage
  nearPops: 800,          // (2026-10-05 idle-player test: 150 / 600 starved on Scrapyard and Square — the exposure-costed search spent its budget on the cheap hidden cells behind the unit and never reached the strip it had to cross, so no goal was ever found; 800 / 3000 kills there in 4-19 s and costs LESS per tick on average, since a found route ends the re-searching)          // first stage Dijkstra budget (~22 u walk radius)
  farPops: 3000,
  bailMs: 700,            // route no-progress bail
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
  fireReactMs: 0,         // FIRE REACTION (owner 2026-10-06: 250 "like a human"; 2026-10-07 "change both side reactions to 0ms, let's see how it goes"): the first shot at a line that just opened waits this long; the risk model keeps assuming riskReactMs of the enemy
  fireReactBreakMs: 200,  //   a line lost for less than this is the same appearance (slats, a sidestep); longer and the next shot reacts again
  wedgeMs: 160,           // WEDGE (owner 2026-10-07): a route or peek leg that has moved the body less than wedgeMoveMin in this long while commanding a move is wedged on an obstacle
  wedgeMoveMin: 0.8,      //   (u) the corner shiver moves +-0.5 u a tick and nets nothing; a creeping leg nets 1 u in 85 ms
  slideMs: 350,           //   a wedged route leg slides along the obstacle (the walkable perpendicular) this long — one heading, no per-tick flips — then resumes
  peekAimMs: 0,           // AIM (owner 2026-10-07: 120 -> 0 "線一開就開槍", then 220, then 250 "the peeker still has more winrate than the one being ambushed", then 0 again with fireReactMs: "both side reactions to 0ms"): a PLANNED exposure — stand peek, fire hop, the watch fight, the engage crossing — fires this long after its line opens; fireReactMs (250) stays for a sighting it did not plan. The window walks while it aims (the dodge back must still land hidden: sdStrafeMax) and sprints from the first round on.
  shoulder: HIT_RADIUS_NORMAL,   // SHOULDERS (owner 2026-10-06): the hidden tests see the unit's width — the centre and both shoulders — not the centre point alone
  stuckAvoidMs: 6000,     // a waypoint a route could not reach (no-progress bail) is avoided this long, whatever the threat does
  peekRange: 25,          // engage / peek allowed up to upperRange + peekRange (owner 2026-10-05: 10 -> 25; beyond bandSlack the closing list and the peek now overlap)
  peekLeg: 4,             // peek leg length (u): out at a sprint, lateral to the threat's line
  peekLegMax: 10,         //   the longest leg tried (4, 7, 10 u) past a wide cover; the dodge step back covers 9.2 u, the rest is sprinted (owner 2026-10-05)
  fightSlack: 10,         // (owner 2026-10-07, "peek and pop"): the fight window and the stand peek run to this far past the band's upper edge — the same slack the position score already calls "in band" (bandSlack); the hug spots the hops end on sit 5-10 u outside the band and the peek was never due from them (Atsuko: band 43-57, walked for 35 s at 58-64 u with one peek)          // fight window allowed up to upperRange + fightSlack; beyond -> break off at once
  exposurePenalty: 8,     // hop routing: extra walk cost per exposed cell (0 = off; a cell is 1); 4 -> 8 (play test 2026-10-05: fewer gap crossings, longer covered detours)
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
  // THE SEVEN RULES (owner 2026-10-15, "use simple rule structure to recreate
  // the effect" — the effect is Version 126 / b1015p, the build that felt
  // right). One rule, one sentence; the numbers under a rule belong to it and
  // to nothing else. No rule reads the enemy's magazine (readReload below).
  //
  // R1 HIDDEN MEANS HIDDEN. A spot hides only when the whole body — centre,
  //    shoulders, head, and the skin against a face — is out of every eye:
  //    where the gun is, where it will be next (the predicted eyes), and where
  //    its rounds now in the air left from (the trail eyes). A waist-high wall
  //    is not cover. That is the test of a PLAN — a hold, a hop goal.
  //    FOR A REACTION (owner 2026-10-16, "I feel nothing" — b1016d, three
  //    deaths read line by line): a step's landing, the peek's step back, a
  //    shuffle leg, the run on and an escape's end are over within one step's
  //    time, so they hide from the eyes of THAT moment — the live eyes and
  //    where each gun will be reactS ahead — with the plain body: no cone
  //    width, no sidestep margin, no trail. Under a hot gun at 130-175 u the
  //    plan's test refused every landing, every leg and every near goal, and
  //    the body ran 0.4-0.65 s in the open instead of stepping 2 u behind the
  //    same cover (flinches 0, peekNoLanding 9, escapes of 10-20 u). One test,
  //    sdLandsHidden, answers it for every landing; a short escape (reactDist)
  //    runs straight to its cell — no crossing rotation, no stream refusal.
  // R2 THE CLOSE RANGE. Every round is aimed at where the target IS, so a
  //    target moving sideways slips off it before it lands: the unit attacks
  //    from min(own reach, peekSlip x round speed / sideways speed).
  // R3 ATTACK FROM COVER. THE ENGAGE RUN opens the line (owner 2026-10-16,
  //    "using dodge for first contact is the only good way for opening the
  //    line actively"): from the cover, a straight crossing across the
  //    threat's line that passes a firing point and ends hidden beyond it —
  //    opened with the i-frame step along it, then run on THE CROSSING LEGS
  //    it shares with the reaction (across the line as it is each tick, the
  //    side kept, leaning toward the cell), the magazine dumped from the step
  //    on, until the body is hidden again. Never back. No window, no budget
  //    and no reaction on its way: the run is the attack. The STAND PEEK only
  //    when no crossing exists: out to a firing point one sidestep away, fire,
  //    then the step back all the way to a landing hidden by R1. THE CLOSE
  //    PEEK (owner 2026-10-16, "dodge for first contact"): with the enemy
  //    within closePeekDist the leg out IS the dodge and the way back the
  //    sprint — the manoeuvres out and back swap places. Then the
  //    hidden moves: the Flank (to a cover one of the two can open a line
  //    from), better, push, the approach.
  //    ONE FIRING POINT (2026-10-16): every attack's line is the same test,
  //    sdFiringPoint — the point and firePointMargin either side of it see
  //    the target's muzzle — and the peek leg arrives ON its point (onPointU),
  //    the last stretch walked. No failure
  //    count, no locked cover: a point that gave no line means the enemy
  //    moved, and the next search picks the next point.
  // R4 OUT OF RANGE WITH THE GUN HOT: hold deep — a spot still hidden by R1
  //    when the gun sidesteps up to deepShift u — and let them come; inside
  //    1.5x the close range close in by routes with no exposed piece instead.
  // R5 EXPOSED — THE REACTION (owner 2026-10-16, "dodge, then sprint, all
  //    across the line, firing the whole time"). ONE rule for every exposure
  //    that is not a plan's own window:
  //    1. the DODGE across the line (perpendicular to it; the side with the
  //       longer run; into a wall it still buys its 0.3 s);
  //    2. the SPRINT across the line as it is THIS tick, the side kept — only
  //       a wall flips it — leaning up to reactDriftDeg toward the nearest
  //       hidden cell, until the body is hidden;
  //    3. the magazine dumped the whole way (the fire block, exposedDump).
  //    No road across on either side -> the route to the nearest hidden
  //    cell, straight (a corridor). Hidden: the run on for streamMs so the
  //    rounds in the air land short, then the search from where the body is.
  // R6 A QUIET GUN: silent 2 s — an attack (the engage run, the stand peek)
  //    is not priced at all, and its window is not ended by the
  //    model: it runs to its own end (the strafe cap, the spent dodge, the
  //    window's time) or until the gun fires. A hidden move's cap lifts to
  //    patienceCap. (The trade, R2's own-chance test, is off against a gun
  //    nobody fires.)
  // R7 THE HOT GUN (owner 2026-10-15, "one mission: not dying easily to long
  //    range spray"). Five sentences, each in ONE place:
  //    a. No planned exposure while a gun is hot — no crossing, no engage
  //       run, no window in the line, whatever the risk number
  //       says — and never an exposed piece longer than crossMaxMs, hot or
  //       quiet: sdPlanOk (every planned route) and the route re-check (a
  //       route under way, the fire cell included).
  //    b. Every planned goal hides from the live and predicted eyes (R1) and
  //       (R1); a deep hold (R4) stays hidden when the gun sidesteps deepShift
  //       u too (the side-shifted eyes); an escape ends out of the trail.
  //    c. A hot gun is "far and hot" at every distance (sdFarHot): no fight
  //       window in the open, no stand peek, no patience,
  //       every exposed leg fully lateral. Caught unplanned: THE REACTION
  //       (R5) — the dodge and the sprint across the line, dumping.
  //    d. A body the trail eyes still see does not stop (sdTrailSeen: the
  //       run on, whatever the eye of the moment sees); the trail and the
  //       kept heading last a full flight time (sdStreamMs, the trail loop).
  //    e. No plain-brain walk for recentFireMs after a shot.
  //    "Deep" (R4) now means out of the zone. The eyes of the moment (R1)
  //    still decide hidden/exposed; the zone decides where to BE.
  //    A hold inside the zone ROTATES: the nearest spot out of it, anywhere,
  //    is the first thing the search asks for (hop kind "rotate").
  // R9 THE FEE (owner 2026-10-16, "actively suppress the player before the
  //    player can get all the way to the superior position without paying any
  //    fee"): an enemy CROSSING — moving faster than feeSpeed over open ground
  //    (no cover within openDist) inside the gun's own CONE reach (the distance
  //    every round of the base cone lands on a standing target: 160 u for a
  //    0.02 rifle, the volley's lock range — not the engagement band, which
  //    is where the unit chooses to fight, not where its gun reaches) — is answered at
  //    once with the stand peek: out, the dump, the step back to a hidden
  //    landing (R3). No risk cap, no trade, no band, hot gun or not: the
  //    crossing is the one moment the enemy is in the open and the unit is
  //    not, and the peek's own i-frames close it. The crossing pays.
  //    (Built from b1015t-w, airport and station, twelve deaths read line by
  //    line: the spot opened by a sprint, the stand in the trail's line, the
  //    flinch into the open at 180 u, the 1 s fight window at 55 u.)
  //
  // R5 — exposed
  streamTurn: 0.3,
  streamMs: 300,          //   (one flight time across the band; a kept heading older than this no longer binds; also the run on after hiding)
  reactRoom: 4,           //   THE REACTION's sprint heading needs this much body-wide room ahead (u), re-tested every tick; none on the kept side -> the other side; none on either -> the route, straight
  reactSideProbe: 14,     //   the dodge's side: the side whose run across the line fits the body farthest (probed to this, u); equal -> the side the last hidden spot lies on
  reactDriftDeg: 45,      //   the sprint leans up to this (deg) off the perpendicular toward the nearest hidden cell — the zigzag that advances
  // R2 — the close range
  peekSlip: 1.6,          // hit radius the slip must stay inside: 33 u against a sprinter, 80 u against a walker, the own reach against one who stands (the stand peek is not gated by it — the risk and trade models are)
  // R1 — hidden means hidden
  reactS: 0.3,            // R1 FOR A REACTION: a landing, a leg, a run on and an escape's end hide from the live eyes and the eyes this far ahead (s) on each gun's velocity — one step's time — with the plain body
  reactDist: 6,           //   an escape whose cell is within this (u) is a SHORT escape: straight to it, no crossing rotation, no stream refusal — hidden in a fifth of a second beats any run in the open
  trailMs: 300,           // the trail eyes: where each enemy was this long ago — a landing, the peek's step back and the run on hide from them too
  skinMargin: 0.3,        // the skin: a round lands once within the hit radius of the centre, before the sweep reaches the face — a hold or a leg with the cover inside hit radius + this along an eye line is grazed, the leg scan walks out of it
  // R3 — attack from cover
  firePointMargin: 1,     //   THE FIRING POINT: the point and this much either side of it (across the target line) see the target's muzzle — one step of slack for the body, not a shoulder-wide window (u)
  onPointU: 0.3,          //   ON THE POINT: a peek leg has arrived within this of its point — the body stands on the point, not "within 1 u" of a lane 1 u wide (u)
  closePeekDist: 20,      //   THE CLOSE PEEK: with the enemy within this of the unit (the unit's distance, not the enemy's to its cover) the stand peek's leg out IS the dodge — the line opened inside the 0.3 s of invulnerability, the window fired from the landing, the way back a sprint (the dodge is spent) (u)
  crossRunMax: 16,        //   THE ENGAGE RUN: the crossing may run this much past the dodge's length before its hidden end (u) — a run in front of a hugged face and round its far end
  engageRunMaxMs: 2000,   //   an engage run that has neither hidden again after its crossing nor reached its cell within this is over (the enemy walked off) — the search runs again
  onPointWalkU: 2,        //   the last stretch to the point is walked, not sprinted: inside this the dash is off, so the body stops on the point (u)
  // R4 — out of range, gun hot
  deepShift: 15,          //   the sidestep a deep spot (R4) must survive — swept at 1/3, 2/3 and the full shift to either side (u)
  // R9 — the fee
  feeSpeed: 8,            // an enemy moving faster than this (u/s) over open ground inside the reach is crossing: the stand peek at once
  deepCloseFrac: 1.5,     //   inside the close range x this the unit is not held deep: it closes into the close range instead
  // R6 — a quiet gun
  quietLiftMs: 2000,      // the gun silent this long: no risk cap on an attack, a hidden move's cap at patienceCap — it reads the silence, never the magazine
  // R7 — the hot gun
  crossMaxMs: 500,        // hot or quiet, a planned exposed piece runs no longer than this — a human's reaction plus a flight; a longer one is not planned
  // (No shot lead: every shot in this game — the player's lock-on, the plain
  // bot's, this one's — is aimed at the target's CURRENT position. And NEVER
  // the enemy's magazine — owner 2026-10-07: no free window from its reload;
  // the unit's own magazine stays readable. The bloom IS read.)
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
  paceLeash: 6.0,         // stay within this of the arrival point (u) — THE ROTATION (owner 2026-10-16, "rotate out of the angle"): room to walk round the cover as the enemy moves; the "never more open than here" test keeps the legs on the cover (was 2.0: a statue the enemy's sidestep opened)
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
  // ENEMY FIRING -> STAY BACK IN COVER (owner 2026-10-10, "when enemy firing,
  // stay back in the cover"): a live enemy's round left within hotMs — the
  // shot is heard, never the magazine, and no gun's cycle is read (a slow
  // gun's cycle is the time it cannot fire). Hidden and not immune, the
  // unit stays put: no peek, no hop, the dwell runs on until every gun has
  // been quiet hotQuietMs. A route already under way goes on (hidden by
  // construction; a crossing finishes its leg — measured: dropping it was
  // no better). Not
  // while immune: the stream cannot hurt it and the immunity is its time
  // to move. The watchdog counts none of the wait (sdDeliberate).
  hotMs: 200,
  hotQuietMs: 400,
  // SPAM FROM DISTANCE (owner 2026-10-14, "too easy for a human to kill the SD
  // BOT by spamming any weapon from distance; keep the aggressiveness"):
  hotCycles: 2,           // a gun is hot for this many of its own fire intervals after a shot too (a tapped rifle never reads quiet between taps)
  hotHeardMs: 2000,       // rounds heard from a gun in this window ...
  hotQuietPerRound: 40,   //   ... each add this much to the quiet the unit needs (hotQuietMs) before it shows itself again: a spray needs a longer silence
  // (against a hot gun the exposure model assumes rounds already in the air: no reaction, no flight — sdExposureRisk)
  hotEdgeMs: 200,         //   A GUN ALREADY FIRING when the line opens is on the edge the unit comes out of (owner 2026-10-15, "too easy": shot within 0.1-0.3 s of appearing, the gun hot before the line opened): the rounds fired within this long of the line opening get no displacement credit — the unit runs INTO them; the stream then follows the unit (aimed at its position of the moment) and the credit returns
  tradeFloor: 0.02,       // THE TRADE: a deliberate exposure is taken only when the exposures it will take to land one hit (1 / the unit's own chance in the window, sdOwnHitChance, the enemy walking) add up to no more death than the engage cap; an enemy chance under this is "nobody is really shooting" and the test is off. A bad trade closes the distance instead of waiting
  coneShoulderMax: 4,     //   ... up to this much (u), so the spots never run out; the unit's own exposed / hidden read (fight, escape) keeps the plain shoulders
  coneUpMax: 2.4,         // THE CONE'S HEIGHT (proposal 5): the position tests also look at the capsule's TOP — up to this much above the muzzle line (hit half height + radius above the capsule's centre, less the muzzle's 0.8 above it) — against a hot gun's cone radius: rounds pitched up clear a cover top the muzzle line does not
  tradeMinHit: 0.3,       // NO LONG ODDS INTO A STREAM (proposal 6): against a hot gun a deliberate exposure needs the unit's own chance to land in its window to reach this, whatever the model reads of the enemy's — the model's zero at range is the sprinting read, not the standing moments; a bad trade closes instead
  recentFireMs: 8000,     // a hidden unit whose enemy fired within this long is never handed to the plain brain (the stuck watchdog): it keeps moving through cover (R7: 8 s — a reload's pause is not a quiet gun; the plain brain's walk is the death from distance)
  riskShotMs: 60,         // floor on the enemy's shot interval (their fireCooldownMs if longer): a held trigger fires at the cooldown — 150 read the 55 ms SMG as 2.7 x fewer rounds, and with the real sprint speed in the model the crossings it waved through died (mid batch: 0 -> 8-17% losses)
  riskSprint: 16.8,       //   fallback speed when the unit has no sprintSpeed (see riskSprintFactor)
  riskSprintFactor: 2.5,  //   exposure speed = unit sprintSpeed x this: the dash runs at 2.5 x sprintSpeed from its first tick (sprint + 1.5 x momentum: 29.4 u/s for 11.76, traced 2026-10-07, no ramp). The old 1.8 kept a "hand lead" margin the no-lead rule makes moot; it read every band exposure a third slower than it is.       // effective sprint speed (sprintSpeed + momentum)
  avoidR: 3.5,
  avoidMs: 2500,
  // THE BAND SITS AT THE REACH (owner 2026-10-16, "整條線刪掉，交戰帶 = 自己的射程"):
  // no enemy's gun shapes where the unit fights — upper = the own reach,
  // optimal = reach - bandHalf, lower = reach - 2 x bandHalf. No standoff:
  // an engage cell and a peek's point may lie at
  // any distance; the approach stops at optimal.
  bandHalf: 7,            //   the band's +-7 below the reach
  engageMaxDist: 200,     //   the farthest a gun's cone reach is read (R9's fee reach is capped here)
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
  // THE BODY MUST RUN (owner 2026-10-15, six airport deaths read off the
  // death report: three had the brain ordering "dash, across the line" while
  // the body stood on an obstacle for 0.2-0.5 s; two walked into the live
  // line at 8-12 u/s; one paced 1.2 s behind a cover, fully perpendicular,
  // never crossing; three died to rounds already in the air, standing at the
  // cover's edge they had just reached):
  crossRoom: 8,           //   the rotated heading is tried with this much walkable room first (a crossing's worth: 29 u/s x 0.3 s), the old 4 u as the fallback
  crossStallMs: 100,      //   an exposed leg ordered to dash that moved less than crossStallMove in this long is STALLED on something the room test did not see ...
  crossStallMove: 0.8,    //   ... (u; a dash with no momentum still makes 1.2 u in 100 ms) — that lateral side is dead for crossStallDeadMs: the other side gets the legs, both dead -> the route's heading
  crossStallDeadMs: 500,
  aheadLateral: 0.8,      // HIDDEN, EXPOSURE AHEAD: the pre-rotation keeps this much lateral and the rest along the route, so the leg ENTERS the exposure (fully perpendicular behind the cover ran along its face)
  // OPEN LAND (owner 2026-10-15, "killed in open lands": airport, three deaths
  // on 150-230 u of sparse cover — the tank empty and the unit walking in the
  // open at 8 u/s, an escape route dropped by the hot re-check, an engage
  // crossing that opened on the body with no probe warning):
  hotAheadFloor: 60,      //   a HIDDEN leg sprinting for a hot gun's predicted line ahead, or with rounds in the air behind cover, spends the tank only down to here — the dodge and the escape keep their boost; a live line (open, or 8 u ahead) still spends to dashFloor
  hotOpenPenaltyMul: 3,   //   with a gun hot, or fired within recentFireMs, the hop search prices an open cell (cover farther than openDist) at openPenalty x this: the detour or the wait, not the open field
  // THIN COVER AND THE COST OF STAYING (owner 2026-10-15, station and airport:
  // caught at a prop by a sidestep, dead standing in a nook with no room to
  // strafe, dead HIDDEN after 2.6 s of holding at a grazed spot with every
  // route over the cap):
  farShoulder: 6,         //   beyond farShoulderDist the route pricing and the goal / pacing tests use shoulders of at least shoulder + this (u): a spot must survive the enemy's sidestep, not only its position of the moment; the unit's own exposed read keeps the plain shoulders (4 -> 6, 2026-10-15: the human opened lines on 4 u spots by walking)
  farShoulderDist: 100,
  corneredCap: 0.2,       //   CORNERED: hidden under a hot gun at a grazed spot, or with no legal pacing leg for corneredMs, staying is not free — a movement hop (not an engage, not a fire hop; its goal passes the wide test) may run up to this risk (0.3 took a cornered unit across the airport field, 2026-10-15: 0.2)
  fallBackMax: 40,        //   FALL BACK: cornered, the last search stage is a hidden spot FARTHER from the enemy — within this much of here (u) ...
  fallBackGain: 8,        //   ... and at least this much farther from the enemy than the unit stands (u); the floors kept, the band not. The distance, not the stream (station: cornered 2-3.5 s dancing at a cover's edge, every forward route over the cap)  corneredMs: 500,
  // THE LOOP (owner 2026-10-15, "we are in a loop, need a breakthrough": six
  // deaths in a row within 0.1-0.3 s of a line opening at 110-185 u, almost
  // every one from a HOLD at a spot the route happened to be dropped on, or
  // on a line's edge, the strafe starting from a standing body):
  fragileHoldMs: 1000,    //   a hot-route drop, or a hidden spot that fails the safe-shoulder test (the enemy's sidestep opens it), is CORNERED at once and for this long: the search runs this tick, the fall-back stage included — no 250 ms wait, no 500 ms of pacing first
  danceMs: 1000,          //   EDGE DANCE: hidden / exposed flipping danceFlips times within this long is a line's edge — cornered
  danceFlips: 3,
  flinchReserve: 60,      //   ... when the tank holds the step's cost plus this (the escape after the landing needs boost too)
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
  // THE ENGAGE RUN (R3): a straight crossing from the cover across the
  // threat's line — at least bearingLateralNear of its heading lateral —
  // that passes a firing point and ends hidden beyond it.
  bearingLateralNear: 0.8,  // sin 53 deg
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

// The server's muzzle-line test: the projectile rules (the line botShotCanLand
// fires along, both ends at +PROJECTILE_MUZZLE_Y_OFFSET) — on Factory the eye
// line (+1.6) is blocked by the 4-5 high belts and crates that a muzzle line
// (+3.15) clears, and a 1 HP unit "hidden" by eye was shot over them.
export const makeMuzzleClear = (obstacles, surfaces) => (p0, p1) => {
  // (broadphase: only the boxes near the segment — see navgrid sightClear)
  const cand = obstaclesNearSegment(obstacles, p0, p1);
  for (let i = 0; i < cand.length; i += 1) {
    const o = cand[i];
    if (o.noProjectile) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  return !(surfaces && projectileHitsSurface(p0, p1, surfaces));
};

export function sdBrainTick(host) {
  const { now, SD, me, opp, obstacles, dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag, playerHasLoS } = host;
  const mePos = host.pos, meUnit = host.unit, meVel = host.vel, EYE_UP = host.eyeUp, MUZZLE_H = host.muzzleH;
  const selfRef = { pos: mePos, unit: meUnit, bloom: me.bloom ?? 0 };   // (the unit's own side of the trade: its gun, its spot, its bloom)
  let coverMove = null;
  // ===================== 1. PERCEIVE =====================
  const sdEnemies = host.enemies.slice();   // (the host's live enemies; sorted below)
  sdEnemies.sort((a, b) =>
    Math.hypot(a.pos.x - mePos.x, a.pos.z - mePos.z) - Math.hypot(b.pos.x - mePos.x, b.pos.z - mePos.z));
  // "Exposed" is judged on the MUZZLE line with the projectile rules (the
  // line botShotCanLand fires along, both ends at +EYE_UP):
  // on Factory the eye line (+1.6) is blocked by the 4-5 high belts and
  // crates that a muzzle line (+3.15) clears, and a 1 HP unit "hidden" by
  // eye was shot over them in the first smoke runs.
  const sdClear = host.clear;   // (the muzzle-line test is the host's: projectile rules on the server, botShotCanLand on the client)
  const sdEyes = sdEnemies.map((f) => ({ x: f.pos.x, y: f.pos.y + EYE_UP, z: f.pos.z }));
  const sdMyEye = { x: mePos.x, y: myShotY, z: mePos.z };
  // SHOULDERS (owner 2026-10-06, "隱蔽判定把左右 1.6 u 的肩膀一起算"): a
  // hidden test sees the unit's whole width — the centre and the two
  // points `shoulder` (the hit radius) to either side across the eye's
  // line — so a hug spot never leaves a shoulder out past the cover's
  // edge (the "killed behind cover" deaths: the brain's centre point was
  // hidden, the hitbox was not). The unit's OWN firing lines stay the
  // centre (the gun is there).
  // THE CLOUD'S WIDTH (owner 2026-10-11): a volley gun's pellets clear a cover
  // edge the muzzle line does not — dodged back to the edge and hidden by
  // the centre line, the unit died to a blast's outer pellets 0.4 s later.
  // Against such an eye the unit's width is its shoulders PLUS the cloud's
  // half-width at that distance (sdCloudHalf); a wide width is sampled at
  // the half way too, so a line through the middle is not missed.
  // (a gun hot right now — its own cycle, the round's flight; the quiet tail is not needed here)
  const sdHotNowOf = (k) => {
    const f = sdEnemies[k];
    if (!f) return false;
    const fu = f.unit ?? {};
    const flight = Math.hypot(f.pos.x - mePos.x, f.pos.z - mePos.z) / (fu.projectileSpeed ?? 600) * 1000;
    return (f.lastFireAt ?? -1e9) > now - Math.max(SD.hotMs, flight, (fu.fireCooldownMs ?? 0) * SD.hotCycles);
  };
  // THE CONE'S WIDTH (owner 2026-10-14, proposal 1): a hot gun's cone
  // radius at distance d (its base plus live bloom), capped at
  // coneShoulderMax — a spray's rounds clear an edge the muzzle line does not.
  const sdConeHalf = (k, d) => {
    const f = sdEnemies[k];
    if (!f || !sdHotNowOf(k)) return 0;
    const u = f.unit ?? {};
    const base = u.spreadAngle ?? 0.02;
    const sa = Math.min(Math.max(base, u.bloomCap ?? base), base + Math.max(0, f.bloom ?? 0));
    return Math.min(SD.coneShoulderMax, d * Math.tan(sa / 2));
  };
  // THE HEAD (BOT_SD headUp): the gun's cone at distance d, hot or not — a
  // round can be that far off the centre line the moment the gun fires; the
  // hidden read looks that far above the muzzle line (capped at coneUpMax).
  const sdConeHalfAny = (k, d) => {
    const f = sdEnemies[k];
    if (!f) return 0;
    const u = f.unit ?? {};
    const base = u.spreadAngle ?? 0.02;
    const sa = Math.min(Math.max(base, u.bloomCap ?? base), base + Math.max(0, f.bloom ?? 0));
    return d * Math.tan(sa / 2);
  };
  let sdHeadUp = 0;
  for (let k = 0; k < sdEnemies.length; k += 1) sdHeadUp = Math.max(sdHeadUp, Math.min(SD.coneUpMax, sdConeHalfAny(k, Math.hypot(sdEnemies[k].pos.x - mePos.x, sdEnemies[k].pos.z - mePos.z))));
  // `wide`: the position tests (goals, legs, the grazed read) keep the
  // cone's width too; the unit's own exposed read does not.
  const sdShoulderFor = (k, atX, atZ, wide = false) => {
    const f = sdEnemies[k];
    const d = f ? Math.hypot(f.pos.x - atX, f.pos.z - atZ) : 0;
    let s = SD.shoulder;
    if (wide) s += sdConeHalf(k, d);
    return s;
  };
  const sdSeenFrom = (eye, x, y, z, shoulder = SD.shoulder, up = 0) => {
    if (sdClear(eye, { x, y, z })) return true;
    let nx = eye.z - z, nz = x - eye.x;
    const nl = Math.hypot(nx, nz) || 1;
    nx = nx / nl * shoulder; nz = nz / nl * shoulder;
    if (sdClear(eye, { x: x + nx, y, z: z + nz }) || sdClear(eye, { x: x - nx, y, z: z - nz })) return true;
    // THE CONE'S HEIGHT (owner 2026-10-14, proposal 5): a hot gun's rounds
    // pitched up clear a cover top the muzzle line does not — the
    // capsule's top is in the test too (`up` above the muzzle line).
    if (up > 0 && sdClear(eye, { x, y: y + up, z })) return true;
    if (shoulder <= SD.shoulder * 1.5) return false;
    return sdClear(eye, { x: x + nx / 2, y, z: z + nz / 2 }) || sdClear(eye, { x: x - nx / 2, y, z: z - nz / 2 });
  };
  let sdHidden = true;
  let sdThreat = sdEnemies[0] ?? opp;   // the enemy whose line is open on the unit (else the nearest)
  for (let k = 0; k < sdEyes.length; k += 1) {
    if (sdSeenFrom(sdEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z, sdShoulderFor(k, mePos.x, mePos.z), sdHeadUp)) { sdHidden = false; sdThreat = sdEnemies[k]; break; }   // (the head too — BOT_SD headUp)
  }
  // GRAZED (owner 2026-10-14, proposal 1): hidden by the muzzle line but
  // inside a hot gun's cone at this distance — the spray clears the edge.
  // Not an exposure (no fight, no escape): a BAD POSITION — the hold ends
  // and the search runs for a deeper one; the pacing legs shuffle deeper.
  let sdGrazed = false;
  if (sdHidden) {
    for (let k = 0; k < sdEyes.length; k += 1) {
      const gd = Math.hypot(sdEnemies[k].pos.x - mePos.x, sdEnemies[k].pos.z - mePos.z);
      if (sdSeenFrom(sdEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z, sdShoulderFor(k, mePos.x, mePos.z, true), Math.min(SD.coneUpMax, sdConeHalf(k, gd)))) { sdGrazed = true; break; }
    }
  }
  // THE SKIN (BOT_SD skinMargin, owner 2026-10-15): a round lands once it is
  // within the hit radius of the centre, before the sweep reaches the
  // cover's face — hidden at the centre but with the cover inside the skin
  // along the eye line is hit through it. Grazed: a bad position, the leg
  // scan (legOk) and the search walk out of it.
  const sdSkinSeen = (eye, x, y, z) => {
    if (!(SD.skinMargin > 0)) return false;
    let ux = eye.x - x, uz = eye.z - z;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const r = SD.shoulder + SD.skinMargin;
    return sdClear(eye, { x: x + ux * r, y, z: z + uz * r });
  };
  let sdSkin = false;
  if (sdHidden) for (let k = 0; k < sdEyes.length; k += 1) if (sdSkinSeen(sdEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z)) { sdSkin = true; break; }
  if (sdSkin) { sdGrazed = true; me.botSDSkinTicks = (me.botSDSkinTicks ?? 0) + 1; }
  if (sdGrazed) me.botSDGrazedTicks = (me.botSDGrazedTicks ?? 0) + 1;
  // SD BAND: the own reach (sdOwnReach), bandHalf steps below it — no
  // enemy gun shapes it (owner 2026-10-16). SD_BAND_MARK
  // RISK SPEED (owner 2026-10-05, "make it not underestimate it"): the
  // exposure model moves the unit at its own sprint, measured 24-32 u/s
  // (sprintSpeed 11.76 + the dash momentum), not the old 16.8 constant
  // that read a 0.5 s crossing at 60 u as 38% dead. riskSprintFactor
  // keeps a margin for the momentum build-up and a human's hand lead.
  const sdSprint = (meUnit?.sprintSpeed ?? BOOST_MOVE_SPEED) * SD.riskSprintFactor;
  // THE BAND SITS AT THE REACH (BOT_SD bandHalf, owner 2026-10-16): the own
  // reach is the far edge, bandHalf steps below it; no enemy's gun shapes it
  // and nothing is kept at a distance — the standoff floor is gone.
  const sdReach = sdOwnReach(meUnit);
  const sdUpper = sdReach;
  const sdLower = Math.max(0, sdReach - 2 * SD.bandHalf);
  me.botSDUpper = sdUpper;
  me.botSDLower = sdLower;
  // Lateral fraction of a heading (hx, hz) relative to the threat's line.
  const sdLateral = (hx, hz) => {
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1;
    return Math.abs(hx * lz - hz * lx) / ll;
  };
  // Can the unit's own shot reach the lock target from here? (The fire
  // block's line; the peek clock runs on it.)
  const sdOppClear = sdClear(sdMyEye, { x: opp.pos.x, y: opp.pos.y + EYE_UP, z: opp.pos.z });
  if (sdOppClear || me.botSDLastClearAt == null) me.botSDLastClearAt = now;
  const sdNoShotTime = now - me.botSDLastClearAt;
  // COVER PROXIMITY (play test 2026-10-05, "walks into open dead space like
  // taking a walk"): the muzzle-line test alone called half the map
  // "hidden" whenever the enemy stood behind something far away, and the
  // unit strolled across open floor at walk speed. Open ground (no
  // muzzle-blocking cover within openDist) is never safe: hop goals stand
  // next to cover, routes are charged for open cells, open ground is
  // crossed at a sprint and never dwelt on.
  const sdGrid = host.grid;
  const sdCoverDist = coverDistanceAt(sdGrid, mePos.x, mePos.z, myFloorY, obstacles);
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
      sdPredEyes.push({ x: f.pos.x + vx * SD.predictS, y: f.pos.y + EYE_UP, z: f.pos.z + vz * SD.predictS });
    }
  }
  // (R1: a plan's eyes are the live eyes and the predicted ones — where each
  // gun will be predictS ahead on its live velocity. No spread eyes, no
  // sidestep that may never happen: path selection reads what is there; the
  // sidestep that comes is the reaction's business — owner 2026-10-16.)
  const sdRiskEyes = sdEyes.concat(sdPredEyes);
  const sdThreatMoving = Math.hypot(sdThreat.vel?.x ?? 0, sdThreat.vel?.z ?? 0) > SD.shadowMaxSpeed;
  // (The 2026-10-05 "sure shot" range gate — a hit-chance test that opened
  // the peek, the fight window and a long-range FIRE hop on a slow target
  // — is gone the same day, owner: "not even logically related". The
  // engagement is the band; the far side of a map is reached by crossing
  // it — the jump links and the shadow walk below.)
  const sdSearchEyes = sdEyes.concat(sdPredEyes);
  // THE SIDE-SHIFTED EYES (R4, BOT_SD deepShift): eyes deepShift u to either
  // side of each enemy across its line, swept — a deep spot hidden from them
  // needs a long walk to open.
  const sdDeepEyes = [];
  for (let k = 0; k < sdEnemies.length; k += 1) {
    const f = sdEnemies[k];
    let dx = mePos.x - f.pos.x, dz = mePos.z - f.pos.z;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    for (const s of [1, -1]) for (const m of [1 / 3, 2 / 3, 1]) sdDeepEyes.push({ x: f.pos.x - dz * s * SD.deepShift * m, y: f.pos.y + EYE_UP, z: f.pos.z + dx * s * SD.deepShift * m });
  }
  const sdDeepGoalEyes = sdSearchEyes.concat(sdDeepEyes);
  // THE CLOSE RANGE (BOT_SD peekReachMoving): where the unit's own rounds
  // land on THIS enemy — the own reach against one that stands, the close
  // range against one that moves.
  // (the slip that matters is ACROSS the line: an enemy running at the unit or away from it stays on the round's line)
  const sdThreatSpeed = (() => {
    const vx = sdThreat.vel?.x ?? 0, vz = sdThreat.vel?.z ?? 0;
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    return Math.abs(vx * lz - vz * lx);
  })();
  const sdPeekReach = Math.min(sdReach, SD.peekSlip * (meUnit?.projectileSpeed ?? 600) / Math.max(1, sdThreatSpeed));
  // R9 THE FEE: the threat CROSSING — moving faster than feeSpeed over open
  // ground (no muzzle-blocking cover within openDist) inside the reach.
  const sdThreatSpeedAll = Math.hypot(sdThreat.vel?.x ?? 0, sdThreat.vel?.z ?? 0);
  const sdThreatOpen = coverDistanceAt(sdGrid, sdThreat.pos.x, sdThreat.pos.z, host.groundHeightAt(sdThreat.pos.x, sdThreat.pos.z, sdThreat.pos.y - GROUND_BASE_Y), obstacles) > SD.openDist;
  // (the fee's reach is the GUN's: the cone's own reach, never the engagement band's sdReach — b1016d: fee peeks 0 at 130-220 u while the enemy sprinted the open for 5 s)
  const sdFeeU = meUnit ?? {};
  const sdFeeReach = Math.min(SD.engageMaxDist, (sdFeeU.spreadCount ?? 1) > 1 ? (sdFeeU.lockRange ?? 50) : ((sdFeeU.spreadAngle ?? 0.02) > 1e-6 ? HIT_RADIUS_NORMAL / Math.tan((sdFeeU.spreadAngle ?? 0.02) / 2) : SD.engageMaxDist));
  const sdCrossing = sdThreatSpeedAll > SD.feeSpeed && sdThreatOpen && Math.hypot(sdThreat.pos.x - mePos.x, sdThreat.pos.z - mePos.z) <= sdFeeReach;
  // TRAIL EYES (BOT_SD trailMs): where each enemy was trailMs ago — the
  // rounds now in the air left from there. A step's landing and the run on
  // hide from them too (sdStepEyes).
  const sdTrailEyes = [];
  if (SD.trailMs > 0) {
    const trails = (me.botSDTrail ??= []);
    for (let k = 0; k < sdEnemies.length; k += 1) {
      const f = sdEnemies[k];
      const tr = (trails[k] ??= []);
      if (!tr.length || now - tr[tr.length - 1].at >= 50) tr.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, at: now });
      // (R1: the trail is as long as the round's flight to the unit — at 250 u that is 0.42 s, not 0.3; b1015u: killed 69 ms after hiding by a round fired 264 ms earlier from 7.8 u back)
      const tms = Math.max(SD.trailMs, Math.hypot(f.pos.x - mePos.x, f.pos.z - mePos.z) / (f.unit?.projectileSpeed ?? 600) * 1000);
      while (tr.length > 1 && now - tr[1].at >= tms) tr.shift();
      const old = tr[0];
      if (now - old.at >= tms * 0.5 && Math.hypot(old.x - f.pos.x, old.z - f.pos.z) > 2) sdTrailEyes.push({ x: old.x, y: old.y + EYE_UP, z: old.z });
    }
  }
  const sdStepEyes = sdSearchEyes.concat(sdTrailEyes);
  // R1 FOR A REACTION (BOT_SD reactS): the eyes of the moment — live, and
  // one step's time ahead on each gun's velocity. A landing, a leg, a run
  // on and an escape's end hide from these with the plain body.
  const sdReactEyes = sdEyes.slice();
  for (let k = 0; k < sdEnemies.length; k += 1) {
    const f = sdEnemies[k];
    const vx = f.vel?.x ?? 0, vz = f.vel?.z ?? 0;
    if (Math.hypot(vx, vz) > 1) sdReactEyes.push({ x: f.pos.x + vx * SD.reactS, y: f.pos.y + EYE_UP, z: f.pos.z + vz * SD.reactS });
  }
  // Avoid marks (rejected stretches, refused corridors) expire by time or
  // once the threat has moved watchMoveTol (a different line now); the
  // last hidden spot is the back-off target when caught in a corridor.
  if (me.botSDAvoid && me.botSDAvoid.length) {
    me.botSDAvoid = me.botSDAvoid.filter((a) => now < a.until
      && (a.pinned || Math.hypot(sdThreat.pos.x - a.tx, sdThreat.pos.z - a.tz) <= SD.watchMoveTol));
  }
  if (sdHidden) me.botSDLastHidden = { x: mePos.x, z: mePos.z };
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
  // (NEVER the enemy's magazine — owner 2026-10-07: no "free window" from
  // its reload; the unit's OWN magazine stays readable. The bloom IS read: a
  // human sees the spray too.)
  const sdU = meUnit ?? {};
  const sdMyEmpty = sdU.magCapacity != null && me.ammo <= 0;
  const sdMyReloadLeft = sdMyEmpty ? Math.max(0, (me.reloadingUntil || (now + (sdU.reloadMs ?? 0))) - now) : 0;
  // ===================== 2. THE BUDGET =====================
  // Exposure clock: starts the tick the first enemy eye sees the unit.
  if (!sdHidden) {
    if (me.botSDExposedAt == null) {
      me.botSDExposedAt = now;
      // EXPOSED DUMP (BOT_SD exposedDump): the fire block runs THIS tick —
      // a burst rest still running when the line opened used to hold the
      // trigger for up to 1.5 s of a 0.3 s window.
      if (!sdU.sniperCharge) me.nextFireAt = Math.min(me.nextFireAt ?? now, now);
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
      me.botSDPeekArmed = false;   // (the peek's arming is spent by its first exposed tick — planned was read above)
      me.botSDWatchFight = watching;
      if (watching) { me.botSDWatchUntil = 0; me.botSDExchanges = (me.botSDExchanges ?? 0) + 1; }
      me.botSDExposures = (me.botSDExposures ?? 0) + 1;
      me.botSDWindowStart = { x: mePos.x, z: mePos.z };   // (where this window's strafe begins — the dodge-back cap below)
      me.botSDSearchAt = Math.min(me.botSDSearchAt ?? now, now);   // (R1 for a reaction: the escape search runs THIS tick — a hold's re-check cadence held it up to 500 ms while the body strafed in the open)
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
  const sdBackDist = (!sdHidden && me.botSDLastHidden) ? Math.hypot(me.botSDLastHidden.x - mePos.x, me.botSDLastHidden.z - mePos.z) : 0;
  const sdCanFight = me.boost > SD.dashFloor + sdStepCost + sdSprintCost(sdBackDist);
  // A PLANNED exposure (stand peek, engage crossing) starts only
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
  const sdThreatDist = Math.hypot(sdThreat.pos.x - mePos.x, sdThreat.pos.z - mePos.z);
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
  const sdStreamMs = Math.max(SD.streamMs, sdFlightMs);   // (R5/R7: the kept heading and the run on last a full flight time — longer than streamMs beyond 180 u)
  const sdIncoming = sdHidden && (sdThreat.lastFireAt ?? -1e9) > now - sdFlightMs && (me.botSDSeenAt ?? -1e9) > now - sdFlightMs;
  // HOT TRIGGER (BOT_SD hotMs): some live enemy fired within hotMs — any
  // gun, 2v2 included (the nearest enemy is not always the one firing).
  // ROUNDS STILL IN THE AIR (hotFlight, owner 2026-10-11): the trigger stays
  // hot for the round's flight time to the unit as well — a 350 u/s blast
  // fired at 140 u lands 0.4 s later, after a dodge back and a fresh peek.
  // THE GUN'S OWN CYCLE (owner 2026-10-14, "spamming any kind of weapon
  // from distance"): a gun stays hot for hotCycles of its own fire interval
  // as well — a tapped rifle at two rounds a second never reads quiet
  // between taps, a shotgun's slow cycle is still a hot gun — and the quiet
  // the unit needs before it shows itself again grows with the rounds it
  // heard in the last hotHeardMs (hotQuietPerRound): a spray needs a longer
  // silence than one shot.
  let sdAnyHot = false, sdHeard = 0, sdRecentFire = false;
  for (let k = 0; k < sdEnemies.length; k += 1) {
    const f = sdEnemies[k];
    const fu = f.unit ?? {};
    const flight = Math.hypot(f.pos.x - mePos.x, f.pos.z - mePos.z) / (fu.projectileSpeed ?? 600) * 1000;
    const last = f.lastFireAt ?? -1e9;
    const shotLog = f.log ?? f;   // (where the shooter's shot log lives: the fighter itself, or the client's state object)
    // (the shot log lives on the shooter: one shot per change of its last-shot stamp, a volley is one)
    if (shotLog.sdShotLog == null) { shotLog.sdShotLog = []; shotLog.sdShotLogLast = last; }
    else if (last > shotLog.sdShotLogLast) { shotLog.sdShotLog.push(last); shotLog.sdShotLogLast = last; }
    while (shotLog.sdShotLog.length && shotLog.sdShotLog[0] < now - SD.hotHeardMs) shotLog.sdShotLog.shift();
    sdHeard += shotLog.sdShotLog.length;
    if (last > now - Math.max(SD.hotMs, flight, (fu.fireCooldownMs ?? 0) * SD.hotCycles)) sdAnyHot = true;
    if (last > now - SD.recentFireMs) sdRecentFire = true;
  }
  if (sdAnyHot) me.botSDHotAt = now;
  // (hot, or not yet quiet for long enough after the last hot tick)
  const sdQuietNeed = SD.hotQuietMs + SD.hotQuietPerRound * sdHeard;
  const sdHot = sdAnyHot || now < (me.botSDHotAt ?? -1e9) + sdQuietNeed;
  const sdHotRise = sdHot && !me.botSDWasHot;   // (the tick the gun turned hot: a route under way is priced again at once)
  me.botSDWasHot = sdHot;
  // (no "pre-aimed" read off the enemy's facing — owner 2026-10-15: in this
  // game a mech always faces its lock (faceTowards, every tick), so the
  // facing says nothing about where the human is looking; the rule would
  // have read every exposure as pre-aimed)
  const sdHotVuln = sdHot && now >= (me.invulnerableUntil ?? 0);
  // R7c "FAR AND HOT" AT EVERY DISTANCE: a hot gun the unit is vulnerable to —
  // the lateral sprint is the only exposure, no stand peek,
  // no patience, the leave at once (was: beyond 60 u only).
  const sdFarHot = sdHotVuln;
  if (sdFarHot) me.botSDFarHotAt = now;   // (harness bookkeeping)
  // THE QUIET CLOCK (owner 2026-10-14): the no-shot clock that opens an
  // engage (peekWaitMs), ends a hold (holdMaxMs) and keeps the watchdog
  // off counts QUIET time only — while a gun is hot it is held at zero, so
  // no deliberate exposure opens into the stream and no hold expires into
  // the plain brain's walk. The hidden moves (closing, push, a better
  // spot) run on under fire as before: only the exposures wait.
  if (sdHotVuln) me.botSDLastClearAt = now;
  // (the shoulders every position test uses against the eyes of the moment: the plain ones plus the widest hot cone — proposal 1)
  const sdWideShoulder = SD.shoulder + Math.max(0, ...sdEnemies.map((f, k) => sdConeHalf(k, Math.hypot(f.pos.x - mePos.x, f.pos.z - mePos.z))));
  const sdWideUp = Math.max(sdHeadUp, Math.min(SD.coneUpMax, sdWideShoulder - SD.shoulder));   // (the cone's height for the same tests — proposal 5; never less than the head, BOT_SD headUp)
  // THIN COVER (BOT_SD farShoulder): beyond farShoulderDist the route pricing
  // and the goal / pacing tests ask for a spot that survives a sidestep.
  const sdSafeShoulder = Math.max(sdWideShoulder, SD.shoulder + (sdThreatDist >= SD.farShoulderDist ? SD.farShoulder : 0));
  // R1 FOR A LANDING (the one test): a point the body is about to arrive at
  // — a step's landing, the peek's step back, the step scan, the run on —
  // hides when its width (the safe shoulder) and its head (sdWideUp) are
  // out of the live, the predicted and the trail eyes.
  // (room for the BODY along a straight cut, sampled every ~0.6 u — the
  // route legs, THE ENGAGE RUN's scan and THE REACTION share it)
  const sdLegFits = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6));
    for (let k = 1; k <= n; k += 1) {
      const f = k / n;
      // (the physics' own body radius — a body that stands against a face can run along it)
      if (unitOverlapsObstacle(x0 + (x1 - x0) * f, mePos.y, z0 + (z1 - z0) * f, obstacles)) return false;
    }
    return true;
  };
  // (the perpendicular to the threat's line on side s)
  const sdPerp = (s) => { const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z, ll = Math.hypot(lx, lz) || 1; return { x: -lz / ll * s, z: lx / ll * s }; };
  const sdLandsHiddenFrom = (eyes, x, z) => {
    for (let k = 0; k < eyes.length; k += 1) if (sdSeenFrom(eyes[k], x, myShotY, z, sdSafeShoulder, sdWideUp)) return false;
    return true;
  };
  // R1 FOR A REACTION (owner 2026-10-16, "I feel nothing" — b1016d, three
  // deaths): a step's landing, the peek's step back, the run
  // on and an escape's end are over within one step's time. They hide from
  // the eyes of THAT moment (sdReactEyes) with the plain body — no cone
  // width, no sidestep margin, no trail. The strict test above is a PLAN's.
  // Under a hot gun at 130-175 u the plan's test refused every landing, every
  // leg and every near goal, and the body ran 0.4-0.65 s in the open instead
  // of stepping 2 u behind the same cover: flinches 0, peekNoLanding 9.
  const sdLandsHidden = (x, z) => {
    for (let k = 0; k < sdReactEyes.length; k += 1) if (sdSeenFrom(sdReactEyes[k], x, myShotY, z, SD.shoulder, sdHeadUp)) return false;
    return true;
  };
  // R1 ON THE SPOT: hidden from the eye of the moment but not from where the
  // rounds now in the air left — the body does not stop here, it runs on
  // (the stream post-pass below); b1015u: dead 69 ms after hiding.
  const sdTrailSeen = sdHidden && sdTrailEyes.length > 0 && !sdLandsHiddenFrom(sdTrailEyes, mePos.x, mePos.z);
  if (sdTrailSeen) me.botSDTrailSeenTicks = (me.botSDTrailSeenTicks ?? 0) + 1;
  // FRAGILE SPOT (BOT_SD fragileHoldMs): hidden by less than the safe margin
  // — the enemy's sidestep opens it; CORNERED reads it, at once.
  let sdFragileSpot = false;
  if (sdHidden && sdSafeShoulder > SD.shoulder + 0.01) {
    for (let k = 0; k < sdSearchEyes.length; k += 1) if (sdSeenFrom(sdSearchEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z, sdSafeShoulder, sdWideUp)) { sdFragileSpot = true; break; }   // (the predicted eyes too — R1)
  }
  // THE DEEP HOLD (BOT_SD deepHold, owner 2026-10-15, option 1): a gun hot
  // and the enemy beyond the close range — the unit does not close; it
  // holds a deep spot or moves to one by a hidden route (the search below).
  const sdDeepHold = sdHidden && sdHotVuln && dist > sdPeekReach * SD.deepCloseFrac;
  // THE NEAR BAND (BOT_SD deepCloseFrac): hot, just outside the close range — the unit closes into it by routes with no exposed piece (sdHopOk)
  const sdNearHot = sdHidden && sdHotVuln && dist > sdPeekReach && dist <= sdPeekReach * SD.deepCloseFrac;
  if (sdNearHot) me.botSDNearHotTicks = (me.botSDNearHotTicks ?? 0) + 1;
  // (R4 "deep" = hidden from the live, predicted and side-shifted eyes: the
  // spot survives the gun's sidestep of deepShift u)
  let sdDeepHere = false;
  if (sdDeepHold) {
    sdDeepHere = true;
    for (let k = 0; k < sdDeepGoalEyes.length; k += 1) if (sdSeenFrom(sdDeepGoalEyes[k], sdMyEye.x, sdMyEye.y, sdMyEye.z, sdSafeShoulder, sdWideUp)) { sdDeepHere = false; break; }
    me.botSDDeepTicks = (me.botSDDeepTicks ?? 0) + 1;
    if (sdDeepHere) me.botSDDeepHereTicks = (me.botSDDeepHereTicks ?? 0) + 1;
  }
  // EDGE DANCE (BOT_SD danceMs / danceFlips): hidden / exposed flipping on a
  // line's edge, the enemy's every step opening and closing it.
  if (me.botSDWasHidden != null && sdHidden !== me.botSDWasHidden) (me.botSDFlipLog ??= []).push(now);
  me.botSDWasHidden = sdHidden;
  const sdFlips = me.botSDFlipLog;
  if (sdFlips) while (sdFlips.length && sdFlips[0] < now - SD.danceMs) sdFlips.shift();
  const sdDancing = !!sdFlips && sdFlips.length >= SD.danceFlips;
  const sdLeaveMs = me.botSDPlanned ? (sdU.stepDurationMs ?? STEP_DURATION_MS) : sdBackDist / sdSprint * 1000;
  // THE DODGE MUST LAND HIDDEN (tank sc 81-83 after the rules above): the
  // window strafes away from the edge it stepped out of, and the dodge
  // back covers stepDistance; a strafe longer than that minus the
  // shoulders ends the dodge still in the line — and the step ends in a
  // dead stop, where the rounds fired at the dodging unit land. So a
  // planned window ends once its strafe has used up what the dodge can
  // bring back.
  const sdStrafeMax = (sdU.stepDistance ?? STEP_DISTANCE) - 2 * SD.shoulder;
  // (peeks only — an engage crossing runs its whole leg exposed by design and ends hidden on its own)
  const sdStrafed = (me.botSDPlanned && me.botSDPeekOrigin && !me.botSDEngageRun && me.botSDWindowStart) ? Math.hypot(mePos.x - me.botSDWindowStart.x, mePos.z - me.botSDWindowStart.z) : 0;
  // (a planned exposure still in the line after its dodge — the step ran
  // into a wall, tank sc 88 — does not resume the window: it leaves)
  const sdDodgeSpent = me.botSDPlanned && me.botSDPeekStepped && now >= (me.stepUntil ?? 0);
  // THE BODY, NOT THE PLAN (owner 2026-10-11): a window whose strafe a wall
  // stopped stands still, and a standing unit under a volley gun is dead at
  // any range — past the first 150 ms (the sprint's build-up) the leave test
  // reads the unit's actual lateral speed across the threat's line.
  const sdLatNow = (() => {
    if (sdHidden || sdExposedFor < 150) return 1;
    const vx = meVel?.x ?? 0, vz = meVel?.z ?? 0;
    const tx = sdThreat.pos.x - mePos.x, tz = sdThreat.pos.z - mePos.z, tl = Math.hypot(tx, tz) || 1;
    return Math.min(1, Math.abs(vx * tz - vz * tx) / tl / Math.max(1, sdSprint));
  })();
  // THE QUIET LIFT (R6, BOT_SD quietLiftMs): the gun silent this long — an
  // attack is not priced and its window is not ended by the model; a hidden
  // move's cap rises to patienceCap now, not after 8 s of idling (every
  // exposed piece still under crossMaxMs — R7). The gun fires: the model is
  // back at once (sdHotVuln).
  const sdQuietLift = SD.quietLiftMs > 0 && !sdHotVuln && now - (sdThreat.lastFireAt ?? -1e9) >= SD.quietLiftMs;
  const sdMustLeave = !sdHidden && (sdStrafed >= sdStrafeMax || sdDodgeSpent
    // THE WINDOW'S END (BOT_SD peekStill): a stand peek fires for its window — peekAimMs + peekMs (+ jitter) — and then the step back, whatever the model reads of the enemy
    || (me.botSDPlanned && me.botSDPeekOrigin && !me.botSDEngageRun && sdExposedFor >= (me.botSDPeekWindowMs ?? (SD.peekAimMs + SD.peekMs + SD.peekJitterMs)))
    // (R6: against a quiet gun the window runs to its end — the model read 1.0 at 20 u for every rifle and ended every window on its first tick, one round fired: the F9 tapes of 2026-10-16)
    || (!sdQuietLift && sdExposureRisk(sdThreat, SD, sdThreatDist, sdLatNow, sdLeaveMs, sdExposedFor, sdSprint, undefined, sdHot) > SD.engageRiskCap));
  // NO PEEK WITHOUT THE DODGE IN HAND (tank sc 84, 87): the step's cooldown
  // (1175 ms) outlasts a peek cycle, and a window that ended with the step
  // on cooldown had only a sprint back — which reversed into the rounds
  // aimed at where the unit had just been. A planned exposure starts only
  // with the dodge ready.
  const sdDodgeReady = now >= (me.stepCooldownUntil ?? 0);
  // THE ENGAGE RUN IS THE ATTACK (R3, owner 2026-10-16): its route, hidden
  // and exposed alike, is the plan's own exposure — no budget, no reaction,
  // no window; the crossing rules (R7c) steer it and it ends hidden at its
  // cell. (A shoulder glimpse one step from a firing cell used to read "seen,
  // cannot fire" — over budget — and the attack was given up at the cell's
  // edge every time, against a camper: the tape of 2026-10-16, d 9 u.)
  const sdAttackLeg = !!me.botSDPath && !!me.botSDEngageRun;
  const sdOverBudget = !sdHidden && !sdAttackLeg && ((sdFightOk && (!sdCanFight || sdMyEmpty)) || sdMustLeave
    || (sdFarHot && !me.botSDPlanned));   // (R7c: caught unplanned under a hot gun — no fight window, the escape from the first tick, dumping on the way)
  const sdSeenFar = !sdHidden && !sdFightOk;
  const sdGoalHidden = (goal) => {
    const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + MUZZLE_H, z: goal.z };
    for (let k = 0; k < sdEyes.length; k += 1) {
      if (sdSeenFrom(sdEyes[k], gEye.x, gEye.y, gEye.z, sdShoulderFor(k, goal.x, goal.z), sdHeadUp)) return false;   // (the head too)
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
  // (a peek leg dropped before its window — the anchor bail, the wedge,
  // the watchdog, spawn immunity — is VOID: not graded later, at the next
  // exposure or at another cover, against the snapshot it was armed on)
  const sdDropPeek = () => {
    me.botSDPeekTo = null; me.botSDPeekAnchor = null; me.botSDBackOff = false; me.botSDPeekArmed = false;
    // (and its origin: a void peek has no spot to dodge back to — the
    // retreat read a stale origin at the next unplanned exposure)
    me.botSDPeekOrigin = null; me.botSDPeekStepped = false;
  };
  // STUCK WATCHDOG (owner 2026-10-05, "BOT still get stuck from time to
  // time"): standing within stuckMoveMin for stuckMs with no reason to —
  // a deliberate stand is hidden, hugging cover and inside holdMaxMs
  // without a line — is stuck whatever the state: the spot is marked
  // (pinned), route and peek dropped, and the plain brain takes the legs
  // for plainMs (its own wedge detectors run in that window; the SD fire
  // rules stay).
  if (!me.botSDWd || Math.hypot(mePos.x - me.botSDWd.x, mePos.z - me.botSDWd.z) > SD.stuckMoveMin) me.botSDWd = { x: mePos.x, z: mePos.z, at: now };
  // (the hot-trigger wait is a deliberate stand too, wherever the unit is
  // hidden: the watchdog must not walk it out into the stream)
  const sdDeliberate = (sdHidden && sdCoverDist <= SD.hugDist && sdNoShotTime < SD.holdMaxMs)
    || (sdHidden && now < (me.botSDHotWaitUntil ?? 0))
    || (sdHidden && sdRecentFire);   // (UNDER FIRE: a hidden stand is never "stuck" — owner 2026-10-14, recentFireMs)
  // (a deliberate stand is a reason to stand: its ticks do not count — the
  // clock used to run on through a hold, and the first tick the stand was
  // no longer deliberate, the line opened by the enemy's sidestep, the
  // watchdog fired at once and the plain legs walked the unit into the
  // stream: spam probe 2026-10-10, every plain-legs death in the wait)
  if (sdDeliberate) me.botSDWd = { x: mePos.x, z: mePos.z, at: now };
  if (now - me.botSDWd.at > SD.stuckMs && !sdDeliberate && !me.airborne && now >= (me.botSDPlainUntil ?? 0)) {
    sdMark(mePos.x, mePos.z, SD.stuckAvoidMs, true);
    sdDrop();
    sdDropPeek();
    me.botSDWatchUntil = 0; me.botSDDwellUntil = 0;
    me.botSDStucks = (me.botSDStucks ?? 0) + 1;
    if (!sdHidden || dist > sdUpper + SD.farDist) {
      me.botSDPlainUntil = now + SD.plainMs;
      me.botSDSearchAt = now + SD.plainMs;
      // (re-check 2026-10-08: the stuck clock restarts when the SD brain
      // gets the legs BACK, not now — with plainMs == stuckMs it re-fired on
      // the first tick after the window, before the deferred search could
      // run, every 3 s for as long as the plain legs did not move it 3 u)
      me.botSDWd = { x: mePos.x, z: mePos.z, at: now + SD.plainMs };
    } else {
      // IN THE BAND, HIDDEN (BOT_SD stuckPlainInBand off, owner 2026-10-15):
      // the plain legs walked a stuck unit straight into the open at 48 u.
      // Here the spot is marked and the search runs again at once; if it
      // finds nothing the unit stands hidden with the fire rules on, which
      // beats an open walk into a sprayer.
      me.botSDSearchAt = now;
      me.botSDWd = { x: mePos.x, z: mePos.z, at: now };
      me.botSDBandStucks = (me.botSDBandStucks ?? 0) + 1;
    }
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
  // immunePlain (owner 2026-10-11, "use SD logic even in the invincible state"): OFF — the SD brain
  // keeps the legs through the immunity too. Measured against a human spraying at 90-160 u: bot deaths
  // 26% -> 24% over nine cells (a standing sprayer 22% -> 6%), no cell of the fire-on-sight set rose;
  // bot vs bot the opening slows (Factory 9.4 -> 11.2 s a match) and the sprint-rushers' edge goes.
  // (SPAWN IMMUNITY: the SD brain keeps the legs through it — owner 2026-10-11, "use SD logic even in the invincible state"; the plain-legs handover of 2026-10-07 is gone)
  const sdDwell = () => (dist > sdUpper + 30 && !playerHasLoS)
    ? SD.farDwellMs
    : SD.dwellMinMs + Math.random() * (SD.dwellMaxMs - SD.dwellMinMs);
  // Hop searches start from the cover's anchor point (where the unit
  // arrived), not from wherever the cover pacing left it: a 2 u shift of
  // the start node flipped the opening hop to a longer, deadlier route
  // (measured: Saori's A-seat opening losses 0 -> 15 of 40).
  const sdSearchX = me.botSDPaceAnchor ? me.botSDPaceAnchor.x : mePos.x;
  const sdSearchZ = me.botSDPaceAnchor ? me.botSDPaceAnchor.z : mePos.z;
  // ===================== 3. THE GATES =====================
  // RISK GATE for a planned hop (BOT_SD riskCap): the estimated death
  // chance of the route must stay under the cap (engage cap for deliberate
  // crossings; after patienceMs of holding, the patience cap). A rejected
  // route marks its first exposed stretch avoid. Escapes and free windows
  // (the enemy out of rounds) are not gated.
  // CORNERED (BOT_SD corneredCap, owner 2026-10-15, station: dead hidden after
  // 2.6 s of holding at a grazed spot with every route over the cap): hidden
  // under a hot gun at a spot the cone grazes, or with no legal pacing leg
  // for corneredMs, staying is not free — a movement hop may run up to
  // corneredCap. Not an engage run: the way out, not a fight.
  // (grazed; a fragile spot; a line's edge; a hot-route drop within
  // fragileHoldMs; no legal pacing leg for corneredMs — any of these)
  const sdCornered = sdHotVuln && sdHidden && (sdGrazed || sdFragileSpot || sdDancing
    || now - (me.botSDFragileAt ?? -1e9) < SD.fragileHoldMs
    );   // (a "no legal pacing leg for corneredMs" test sat here reading a knob that never existed — never true; gone)
  if (sdCornered) me.botSDCorneredTicks = (me.botSDCorneredTicks ?? 0) + 1;
  // (THE QUIET LIFT, sdQuietLift — R6 — is read above, with the leave rule)
  const sdRiskCap = (engage) => {
    const cap = engage ? SD.engageRiskCap : SD.riskCap;
    if (sdCornered && !engage) return Math.max(cap, SD.corneredCap);
    if (sdQuietLift) { me.botSDQuietLiftTicks = (me.botSDQuietLiftTicks ?? 0) + 1; return engage ? Infinity : Math.max(cap, SD.patienceCap); }   // (R6: a quiet gun prices no attack)
    if (sdFarHot) return cap;   // (FAR AND HOT: patience never buys an exposure into the stream; its clock runs on for the quiet)
    const since = me.botSDRiskHoldSince ?? me.botSDIdleSince;
    const waited = since != null ? now - since : 0;
    return waited > SD.patienceMs ? Math.max(cap, SD.patienceCap) : cap;
  };
  const sdRiskReject = () => {
    me.botSDRiskRejects = (me.botSDRiskRejects ?? 0) + 1;
    if (me.botSDRiskHoldSince == null) me.botSDRiskHoldSince = now;
  };
  // THE TRADE (owner 2026-10-14, "too easy to kill the SD BOT by spamming
  // from distance"): a deliberate exposure is worth taking only when the
  // unit's own rounds in that window land about as often as the enemy's
  // land on it — the same capsule arithmetic from the unit's side
  // (sdOwnHitChance: its cone and bloom, its cadence, its round's flight,
  // the enemy's drift). Against a gun that is not firing the enemy's side
  // reads near zero and nothing changes. A bad trade is no reason to wait:
  // the closing list runs instead (sdTradeClose) until the distance pays.
  // Patience (patienceMs) lifts the test the way it lifts the caps.
  const sdPeekT = SD.peekAimMs + SD.peekMs + SD.peekJitterMs / 2;
  const sdTradeOk = (d, T = sdPeekT) => {
    const pm = Math.max(0.02, sdOwnHitChance(selfRef, sdThreat, d, T, SD));
    // NO LONG ODDS INTO A STREAM (owner 2026-10-14, proposal 6): against a
    // hot gun the unit's own chance must reach tradeMinHit whatever the
    // model reads of the enemy's — its zero at range is the sprinting
    // read, not the standing moments nor the cone over the cover's top.
    if (sdHot && pm < SD.tradeMinHit) { me.botSDLastTrade = 1; return false; }
    const pe = sdExposureRisk(sdThreat, SD, d, 1, T, 0, sdSprint, undefined, sdHot);
    if (pe <= SD.tradeFloor) return true;
    // (the exposures it will take to land one hit, each pe dead — their
    // death adds up; owner 2026-10-14, "算我大概要探幾次頭才打中他")
    const death = 1 - Math.pow(1 - pe, 1 / pm);
    me.botSDLastTrade = death;
    return death <= sdRiskCap(true);   // (patience lifts this cap as it lifts every exposure's)
  };
  const sdTradeReject = () => { sdRiskReject(); me.botSDTradeRejects = (me.botSDTradeRejects ?? 0) + 1; };
  const sdTradeNow = sdHidden ? sdTradeOk(sdThreatDist) : true;
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
        const mid = { x: mx, y: Math.max(py, qy) + GROUND_BASE_Y + MUZZLE_H, z: mz };
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
  // `deliberate`: a planned exposure (the engage run) is read against
  // engageRiskCap like the stand peek — the same family: open a line, fire.
  // R7a THE ONE TEST every planned move passes: no exposed piece and no
  // window in the line while a gun is hot, whatever the risk number; and
  // never an exposed piece longer than crossMaxMs, hot or quiet.
  const sdPlanOk = (exposedLen, window) => {
    if (sdHot && (exposedLen > 0 || window)) { me.botSDHotRouteRejects = (me.botSDHotRouteRejects ?? 0) + 1; sdRiskReject(); return false; }
    if (exposedLen / sdSprint * 1000 > SD.crossMaxMs) { me.botSDLongCrossRejects = (me.botSDLongCrossRejects ?? 0) + 1; sdRiskReject(); return false; }
    return true;
  };
  // A SHORT ESCAPE (BOT_SD reactDist): the hidden cell within reactDist — behind
  // the same cover the enemy's sidestep just opened. Straight to it: no
  // crossing rotation, no stream refusal (R1 for a reaction).
  const sdNearGoalOf = (g) => !!g && Math.hypot(g.x - mePos.x, g.z - mePos.z) <= SD.reactDist;
  const sdHopOk = (found, engage, capScale = 1, deliberate = engage) => {
    const badLedge = sdCrossingBad(found.path);
    if (badLedge) { sdMark(badLedge.x, badLedge.z, SD.stuckAvoidMs, true); sdRiskReject(); return false; }
    // (no stream refusal of an escape: its legs never run exposed — THE
    // REACTION (R5) has the legs until the body is hidden)
    // ENGAGE ROUTE (Airport idle trace 2026-10-05, seed 14): the straight
    // run's midpoint saw the target but the ROUTE detoured round the
    // hangar and never showed — five 60 u loops out and back in 20 s. An
    // engage hop must open the line somewhere along its actual route (an
    // exposed piece against the live / predicted eyes).
    if (engage) {
      const rr = sdRouteRisk(found.path, sdSearchX, sdSearchZ, myFloorY, sdRiskEyes, sdThreat, SD, sdClear, sdSprint, sdHot, sdSafeShoulder);
      if (!rr.first) return false;
      if (sdOverBudget) return true;
      if (!sdTradeOk(dist)) { sdTradeReject(); return false; }   // (THE TRADE: the crossing fires midway, at about this distance)
      if (sdSprintCost(rr.exposedLen) > me.boost - SD.dashFloor) { sdRiskReject(); return false; }   // (the tank: see below)
      me.botSDLastRisk = rr.risk;
      if (!sdPlanOk(rr.exposedLen, true)) return false;   // (R7a: an engage run is an exposure by nature)
      if (rr.risk <= sdRiskCap(true) * capScale) return true;
      sdMark(rr.first.x, rr.first.z);
      sdRiskReject();
      return false;
    }
    if (sdOverBudget) return true;
    const rr = sdRouteRisk(found.path, sdSearchX, sdSearchZ, myFloorY, sdRiskEyes, sdThreat, SD, sdClear, sdSprint, sdHot, sdSafeShoulder);
    // THE TANK (owner 2026-10-07, "BOT still dies fast"): the route risk
    // prices the exposed stretches at a sprint; a hop started without
    // the boost to sprint them walks them instead (tank sc 83: a
    // relocation started on 8 boost walked into a clear line at 61 u and
    // died). No planned hop starts that the tank cannot sprint; escapes
    // and free windows (above) are not gated — the unit must move.
    if (sdSprintCost(rr.exposedLen) > me.boost - SD.dashFloor) { sdRiskReject(); return false; }
    let risk = rr.risk;
    me.botSDLastRisk = risk;
    if (!sdPlanOk(rr.exposedLen, !!(deliberate && found.goal))) return false;   // (R7a)
    // THE NEAR BAND (BOT_SD deepCloseFrac): hot, just outside the close range — only a route with no exposed piece closes in
    if (sdNearHot && !deliberate && rr.exposedLen > 0) { me.botSDNearHotRejects = (me.botSDNearHotRejects ?? 0) + 1; sdRiskReject(); return false; }
    if (risk <= sdRiskCap(deliberate) * capScale) return true;
    if (rr.first) sdMark(rr.first.x, rr.first.z);
    sdRiskReject();
    return false;
  };
  // LINE-CAPABLE (BOT_SD peekableBonus): from (x, z) a lateral leg (the
  // two perpendiculars and the two rotated 30 deg toward the target, at
  // peekLeg and 1.75 x) is walkable and its end has a muzzle line to the
  // target — the stand peek's precondition.
  const sdOppMuzzle = { x: opp.pos.x, y: opp.pos.y + EYE_UP, z: opp.pos.z };
  // THE FIRING POINT (R3, owner 2026-10-16, the wall-hugger): ONE definition
  // for every attack — the stand peek's leg end, the engage run's middle,
  // the peekable test.
  // A muzzle at (x, y, z) sees the target's muzzle, and so does a muzzle
  // firePointMargin u either side of it across the target line: the point
  // plus one step of slack each way, no more. (Before: four tests. The hop
  // cells wanted a shoulder-wide window, 3.2 u, that no lane past a hugged
  // wall ever gave; the stand peek wanted the bare point and arrived
  // outside its own lane; the near cell took a bare point too.)
  const sdFiringPoint = (x, y, z) => {
    if (!sdClear({ x, y, z }, sdOppMuzzle)) return false;
    let nx = opp.pos.z - z, nz = x - opp.pos.x;
    const nl = Math.hypot(nx, nz) || 1;
    nx = nx / nl * SD.firePointMargin; nz = nz / nl * SD.firePointMargin;
    return sdClear({ x: x + nx, y, z: z + nz }, sdOppMuzzle) && sdClear({ x: x - nx, y, z: z - nz }, sdOppMuzzle);
  };
  const sdPeekableAt = (x, z, fy) => {
    const my = fy + GROUND_BASE_Y + MUZZLE_H;
    let lx = opp.pos.x - x, lz = opp.pos.z - z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    const heads = [[-lz, lx], [lz, -lx], [-lz * 0.866 + lx * 0.5, lx * 0.866 + lz * 0.5], [lz * 0.866 + lx * 0.5, -lx * 0.866 + lz * 0.5]];
    for (let h = 0; h < heads.length; h += 1) {
      const cx = heads[h][0], cz = heads[h][1];
      for (const L of [SD.peekLeg, SD.peekLeg * 1.75, SD.peekLegMax]) {
        const px = x + cx * L, pz = z + cz * L;
        if (walkSegmentBlocked(x, z, px, pz, fy + GROUND_BASE_Y, obstacles)) break;
        if (sdFiringPoint(px, my, pz)) return true;
      }
    }
    return false;
  };
  // POSITION SCORE (BOT_SD holdScore): 0 when a live eye sees the muzzle
  // there; else 1 + strict-hidden + cover + exits covered / 2 + band
  // + peekableBonus when line-capable.
  const sdPosScoreAt = (x, z, fy) => {
    const eye = { x, y: fy + GROUND_BASE_Y + MUZZLE_H, z };
    for (let k = 0; k < sdEyes.length; k += 1) if (sdClear(sdEyes[k], eye)) return 0;
    let s = 1, strictHidden = true;
    for (let k = 0; k < sdPredEyes.length; k += 1) if (sdSeenFrom(sdPredEyes[k], eye.x, eye.y, eye.z, sdWideShoulder, sdWideUp)) { strictHidden = false; break; }
    if (strictHidden) s += 1;
    if (coverDistanceAt(sdGrid, x, z, fy, obstacles) <= SD.hugDist) s += 1;   // hugging the cover, not standing in its shadow
    s += Math.min(4, watchScore(x, z, fy)) * 0.5;
    const d = Math.hypot(opp.pos.x - x, opp.pos.z - z);
    if (d <= sdUpper + SD.bandSlack) s += 1;   // (in band: within the reach)
    if (sdPeekableAt(x, z, fy)) s += SD.peekableBonus;
    return s;
  };
  // ===================== 4. BOOKKEEPING =====================
  // Route bookkeeping: arrived -> drop and dwell; goal uncovered by a
  //    moving enemy -> drop (a fresh search follows).
  if (me.botSDPath) {
    const goal = me.botSDGoal;
    const sdArriveR = 2;
    if (Math.hypot(goal.x - mePos.x, goal.z - mePos.z) < sdArriveR) {
      const sdWasRetreat = !!me.botSDRetreatRoute;   // (sdDrop clears it)
      // ROUNDS IN THE AIR AT THE ROUTE'S END (BOT_SD flightRunOn): the
      // rounds fired at the crossing land flightMs later — the arrival
      // keeps running across the line (the legs: sdRunOnLeg) instead of
      // stopping at the cover's edge it just reached.
      if (sdIncoming) {
        me.botSDRunOnUntil = now + sdFlightMs;
        me.botSDRunOnSide = me.botSDCrossSide ?? me.botSDLatSide ?? null;
      }
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
        const peekHere = sdFightOk && sdPeekableAt(mePos.x, mePos.z, myFloorY);
        me.botSDDwellUntil = now + ((sdOpen || peekHere) ? 0 : sdDwell());
        me.botSDPeeksHere = 0;   // a new cover: the peek cap starts over
      }
      me.botSDRetreatRoute = false;
    } else if (!me.botSDGoalMayShow && !sdGoalHidden(goal)) {
      // UNCOVERED GOAL: the enemy moved and the goal now sees them — the route
      // is dropped and the search runs again (an Engage Run from here if the
      // line is worth it).
      sdDrop();
      me.botSDSearchAt = now;
    }
  }
  // Peek leg bookkeeping: arrived or exposed (the fight window takes over).
  // (A back-off leg is the same leg run the other way: it ends when the
  // unit is hidden again or arrived, and a fresh dwell follows.)
  if (me.botSDPeekTo) {
    const left = Math.hypot(me.botSDPeekTo.x - mePos.x, me.botSDPeekTo.z - mePos.z);
    const arrived = left < SD.onPointU;   // (ON the point — one arrival rule, R3)
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
        me.botSDPeekArmed = false;   // (arrived without a line: the enemy moved since the point was picked — the next search picks the next point; no count, no lock)
        me.botSDPeekNoLine = (me.botSDPeekNoLine ?? 0) + 1;   // (the report)
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
      sdDropPeek();   // (a bailed peek is void)
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
    const from = { x, y: fy + GROUND_BASE_Y + MUZZLE_H, z };
    let n = 0;
    for (let k = 0; k < 8; k += 1) {
      const a = k * Math.PI / 4;
      const px = opp.pos.x + Math.cos(a) * SD.exitR, pz = opp.pos.z + Math.sin(a) * SD.exitR;
      if (unitOverlapsObstacle(px, GROUND_BASE_Y + 1, pz, obstacles)) continue;
      if (sdClear(from, { x: px, y: opp.pos.y + EYE_UP, z: pz })) n += 1;
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
    if (moved > SD.watchMoveTol || (watchScore(mePos.x, mePos.z, myFloorY) < SD.exitMin)) {
      me.botSDWatchUntil = 0;
      me.botSDDwellUntil = now;
      me.botSDWatchCooldownUntil = now + SD.watchCooldownMs;   // (a cut-short watch cools down from now)
    }
  }
  // ENEMY FIRING -> STAY BACK IN COVER (BOT_SD hotWait): hidden, a gun
  // hot, not immune — a peek leg still hidden is dropped (the stream is
  // already on the corner); the unit stays: the dwell runs on until the
  // guns have been quiet hotQuietMs (after the watch maintenance above,
  // whose dwell reset must not open a search tick inside the wait); the
  // shuffle keeps it hidden; the stall clock starts over when it ends.
  // (The idle / patience clocks run on: a long wait earns the push.)
  const sdHotWaiting = sdHidden && sdHotVuln;
  if (sdHotWaiting && me.botSDPeekTo && !me.botSDBackOff) {
    sdDropPeek();
    me.botSDHotPeekDrops = (me.botSDHotPeekDrops ?? 0) + 1;
  }
  if (sdHotWaiting && !me.botSDPath && !me.botSDPeekTo) {
    if (!(now < (me.botSDHotWaitUntil ?? 0))) me.botSDHotWaits = (me.botSDHotWaits ?? 0) + 1;
    me.botSDHotWaitUntil = now + sdQuietNeed;
    // (the dwell is no longer extended — owner 2026-10-14: the hidden moves
    // go on under fire, only the exposures wait on the quiet clock above)
  }
  // 2. Hop search — one Dijkstra per tick per match (shares the hide
  //    search's slot). Wanted when exposed past the budget, or hidden with
  //    the dwell over (a long own reload is spent in cover unless the
  //    enemy is out of rounds too).
  const sdDwellOver = now >= (me.botSDDwellUntil ?? 0);
  const sdHoldReload = sdMyReloadLeft > SD.reloadHoldMs;
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
  const sdTryStandPeek = (cycling, fee = false) => {
    // (no close-range gate here — 2026-10-15: a hot gun forbids the stand peek already, hotWait; against a quiet gun the risk and trade models decide. b1015m: a 40 u gate refused 22 peeks at 104 u while the enemy reloaded)
    let best = null, bestScore = -Infinity, bestSide = 0;
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    const stepD = sdU.stepDistance ?? STEP_DISTANCE;
    // THE CLOSE PEEK (R3, BOT_SD closePeekDist): the enemy this near, the leg
    // out is the dodge — its fixed length, the body's width along it — and
    // the way back the sprint, so no step-back landing is asked for.
    const closePeek = sdThreatDist <= SD.closePeekDist;
    for (let k = 0; k < 8; k += 1) {
      const ang = k * Math.PI / 4 + Math.random() * 0.3;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      const lat = sdLateral(cx, cz);
      if (lat < SD.peekLateralMin) continue;
      const side = (cx * lz - cz * lx) >= 0 ? 1 : -1;
      // a short leg first, a longer one past a wide cover (the dodge
      // step back covers 9.2 u either way); the close peek: the dodge's length
      for (const legLen of (closePeek ? [stepD] : [SD.peekLeg, SD.peekLeg * 1.75, SD.peekLegMax])) {
        const px = mePos.x + cx * legLen, pz = mePos.z + cz * legLen;
        if (!sdLegFits(mePos.x, mePos.z, px, pz)) break;   // (the body runs the leg)
        if (!sdFiringPoint(px, myShotY, pz)) continue;   // (THE FIRING POINT — the one test)
        // THE STEP BACK LANDS HIDDEN (BOT_SD peekStill, owner 2026-10-15,
        // "步伐退回 … all the way"): the dodge back is the step's fixed
        // distance along this leg, back through the origin — its landing
        // (a 4 u leg lands 5 u beyond the origin) must be walkable and
        // hidden from the live and predicted eyes, else the next leg.
        if (!closePeek) {   // (THE STEP BACK LANDS HIDDEN)
          const bx = px - cx * stepD, bz = pz - cz * stepD;
          if (!sdLegFits(px, pz, bx, bz) || !sdLandsHidden(bx, bz)) { me.botSDPeekNoLanding = (me.botSDPeekNoLanding ?? 0) + 1; continue; }
        }
        // NO STAND-AND-FIRE (owner 2026-10-14, proposal 3): against a hot
        // gun the window must be able to strafe on past the leg point —
        // a walled leg point is a standing target in the stream.
        if (sdHot && walkSegmentBlocked(px, pz, px + cx * SD.peekLeg, pz + cz * SD.peekLeg, mePos.y, obstacles)) { me.botSDPeekNoRoom = (me.botSDPeekNoRoom ?? 0) + 1; continue; }
        let score = lat - (legLen - SD.peekLeg) * 0.03 + (Math.random() - 0.5) * 0.3;
        if (cycling && side === (me.botSDLastPeekSide ?? 0)) score -= 0.4;   // show the other shoulder
        if (score > bestScore) { bestScore = score; best = { x: px, z: pz, cx, cz }; bestSide = side; }
        break;
      }
    }
    // The stand peek is a planned exposure (the leg at a sprint, then
    // the fight window strafing across the line): gate it like a hop.
    // Only the fire window counts: the leg out is hidden until the line
    // opens and the dodge step back is invulnerable.
    if (best && !fee) {   // (R9: the fee peek is not priced — the crossing pays)
      // (the window is the pre-aimed acquisition plus the burst: the
      // enemy's rounds arrive inside it, the bloom of each on the cone)
      const T = SD.peekAimMs + SD.peekMs + SD.peekJitterMs / 2;
      const pr = sdExposureRisk(sdThreat, SD, dist, 1, T, 0, sdSprint, undefined, sdHot);
      me.botSDLastRisk = pr;
      if (pr > sdRiskCap(true)) { best = null; sdRiskReject(); }
      else if (!sdTradeOk(dist, T)) { best = null; sdTradeReject(); }   // (THE TRADE: a peek that cannot pay for itself)
    }
    if (!best) return false;
    // (THE CLOSE PEEK: the leg out is the dodge — no dodge, no peek; the way
    // back is the sprint, so the retreat's own step is marked spent)
    let stepped = false;
    if (closePeek) {
      if (!host.startStep(best.cx, best.cz)) return false;
      stepped = true;
      me.botSDDodges = (me.botSDDodges ?? 0) + 1;
      me.botSDClosePeeks = (me.botSDClosePeeks ?? 0) + 1;
      me.botSDStream = { x: best.cx, z: best.cz }; me.botSDStreamAt = now;
    }
    // (the retreat check must be able to run the tick the budget ends)
    me.botSDSearchAt = now; me.botSDRiskHoldSince = null; me.botSDIdleSince = null;
    me.botSDPeekTo = { x: best.x, z: best.z }; me.botSDPeekArmed = true; me.botSDPeekStepped = stepped;
    me.botSDPeekOrigin = { x: mePos.x, z: mePos.z };
    me.botSDPeekWindowMs = SD.peekAimMs + SD.peekMs + Math.random() * SD.peekJitterMs;   // (the window's end — peekStill)
    me.botSDLastPeekSide = bestSide;
    me.botSDPeekAt = now;
    me.botSDPeekFought = null;
    me.botSDPeeksHere = (me.botSDPeeksHere ?? 0) + 1;
    me.botSDPeeks = (me.botSDPeeks ?? 0) + 1;
    if (cycling) me.botSDPeekCycles = (me.botSDPeekCycles ?? 0) + 1;
    me.botSDCycleArm = null;
    return true;
  };
  // ===================== 5. THE ATTACKS =====================
  // (THE ENGAGE RUN and THE STAND PEEK are stages of the plan below, in that
  // order — R3; only R9's fee peek runs here, at once)
  // R9 THE FEE: the threat crossing open ground inside the reach — the stand
  // peek at once, hot gun or not, no cap, no trade, no band: out, the dump,
  // the step back to a hidden landing. The crossing pays.
  if (sdCrossing && sdHidden && !me.botSDPath && !me.botSDPeekTo && !sdOverBudget && !sdOppClear
      && !(now <= (me.stepUntil || 0)) && me.boost >= sdPeekNeed && sdDodgeReady && now >= (me.botSDPlainUntil ?? 0)
      && now >= (opp.invulnerableUntil ?? 0) && !sdMyEmpty) {
    if (sdTryStandPeek(false, true)) me.botSDFeePeeks = (me.botSDFeePeeks ?? 0) + 1;
  }
  // (THE STAND PEEK's own conditions — read by its stage in the plan below)
  const sdStandPeekOk = !sdOverBudget && (sdPeekDue || sdCycleDue) && !sdOppClear
    && (me.botSDPeeksHere ?? 0) < SD.peeksPerCover
    && !sdHotWaiting   // (ENEMY FIRING: no peek into the stream — BOT_SD hotWait)
    && !(now <= (me.stepUntil || 0))
    && me.boost >= sdPeekNeed && sdDodgeReady && now >= (me.botSDPlainUntil ?? 0);
  // ===================== 6. THE PLAN =====================
  const sdWantHop = !me.botSDPath && !me.botSDPeekTo && !sdDeepHere   // (THE DEEP HOLD: deep — no hop while the gun is hot)
    && (sdOverBudget || sdSeenFar || (sdHidden && sdDwellOver && !sdHoldReload) || (sdDeepHold && !sdDeepHere));
  if (sdWantHop && now >= (me.botSDSearchAt ?? 0) && host.searchSlot()) {
    let decided = false;
    // PEEK RETREAT: a stand peek's budget is up -> step straight back to
    // the cover it came from (the corner dance), no search.
    if (sdOverBudget && me.botSDPeekOrigin) {
      const o = me.botSDPeekOrigin;
      const ox = o.x - mePos.x, oz = o.z - mePos.z, ol = Math.hypot(ox, oz) || 1;
      // (did the peek get its window? only such a peek cycles on return)
      if (me.botSDPeekFought == null) me.botSDPeekFought = sdExposedFor >= SD.peekAimMs + SD.peekMs * 0.5;
      if (!me.botSDPeekStepped && ol > 1.5 && host.startStep(ox / ol, oz / ol)) {
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
          me.botSDHopKind = 'retreat';
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
      sdPosScore = sdPosScoreAt(mePos.x, mePos.z, myFloorY);
      me.botSDPosScore = sdPosScore;
      me.botSDPosAt = now;
    }
    // (a good position hugs its cover — "they should get closer to cover")
    const sdPosGood = sdHidden && !sdOverBudget && sdPosScore >= SD.holdScore && sdCoverDist <= SD.hugDist && !sdGrazed;   // (GRAZED: inside a hot cone's width behind the edge is no position — proposal 1)
    // A BAD TRADE CLOSES (owner 2026-10-14, "I don't want the BOT to lose
    // aggressiveness"): hidden where its own gun cannot pay for an
    // exposure, with room left above the band's lower edge, the unit runs
    // the closing list — through cover, risk-gated as ever — instead of a
    // hold. At the lower edge already, it waits for the quiet.
    const sdTradeClose = sdHidden && !sdTradeNow && dist > sdLower + SD.bandHalf + 2;
    const sdClosingDue = dist > sdUpper + SD.bandSlack || sdTradeClose;
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
        && !sdPeekableAt(mePos.x, mePos.z, myFloorY)
        && now >= (me.botSDWatchCooldownUntil ?? 0) && Math.random() < SD.pWatch
        && !sdOpen && sdCoverDist <= SD.hugDist && watchScore(mePos.x, mePos.z, myFloorY) >= SD.exitMin) {
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
    if (!decided && sdPosGood && sdHoldOk && !sdEngageDue && !sdPushDue && !sdTradeClose) {
      me.botSDSearchAt = now + SD.holdRecheckMs;
      me.botSDHeld = (me.botSDHeld ?? 0) + 1;
      decided = true;
    }
    // Closing goal (hidden, farther than the band): a hidden cell nearer
    // the target by gain (10-45 u), next to cover. No "farther when too
    // close" and no in-band shuffle any more.
    const gain = Math.min(SD.hopGainMax, Math.max(SD.hopGainMin, dist * 0.3));
    // (the closing disc's inner edge: the band's optimal — bandHalf below the reach)
    const sdRing = sdLower + SD.bandHalf;
    const within = sdClosingDue ? { x: opp.pos.x, z: opp.pos.z, r: Math.max(sdRing, dist - gain) } : null;
    // Exposed: break the line first (nearest hidden cell, near then far
    // budget). Hidden: the band hop (near then far), then any cell closer
    // to the target than the current spot.
    // Breaking off: prefer a cover whose straight run is LATERAL to the
    // threat's line (the crossing rule below), then any cover.
    const lateralGoal = (gx, gz) => {
      const dx = gx - mePos.x, dz = gz - mePos.z;
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
      const dx = gx - mePos.x, dz = gz - mePos.z;
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
    const closerMin = { x: mePos.x, z: mePos.z, d: SD.shiftMin };
    // (no standoff: a goal may lie at any distance — the floor is gone)
    const sdFlankOk = (gx, gz, fy) => sdPeekableAt(gx, gz, fy);
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
      const t = (mePos.x - opp.pos.x) * ax + (mePos.z - opp.pos.z) * az;
      if (t < al + 3) return;   // not behind the goal along its axis: no forward leg
      const P = { x: opp.pos.x + ax * t, z: opp.pos.z + az * t, y: myFloorY };
      if (Math.hypot(P.x - mePos.x, P.z - mePos.z) < 2) { found.path = [{ x: g.x, z: g.z, y: g.y ?? myFloorY }]; return; }
      if (walkSegmentBlocked(mePos.x, mePos.z, P.x, P.z, mePos.y, obstacles)) return;
      if (walkSegmentBlocked(P.x, P.z, g.x, g.z, mePos.y, obstacles)) return;
      for (const f of [0.2, 0.5, 0.8]) {
        if (!sdGoalHidden({ x: P.x + (g.x - P.x) * f, z: P.z + (g.z - P.z) * f, y: myFloorY })) return;
      }
      found.path = [P, { x: g.x, z: g.z, y: g.y ?? myFloorY }];
    };
    let attempts;
    if (sdDeepHold && !sdDeepHere) {
      // THE DEEP HOLD (BOT_SD deepHold, option 1): a gun hot, the enemy
      // beyond the close range, this spot not deep — a deep spot nearby
      // (hidden from the live, predicted and side-shifted eyes), hugging
      // cover first, by a route with no exposed piece (capScale 0 below).
      attempts = [{ maxPops: SD.nearPops, within: { x: mePos.x, z: mePos.z, r: SD.fallBackMax }, minDistFrom: { x: mePos.x, z: mePos.z, d: 2 }, goalCoverMax: SD.hugDist, deep: true },
        { maxPops: SD.farPops, within: { x: mePos.x, z: mePos.z, r: SD.fallBackMax * 2 }, minDistFrom: { x: mePos.x, z: mePos.z, d: 2 }, goalCoverMax: SD.goalCoverMax, deep: true },
        // (the last stage: a deep spot by a route priced at the cap — b1015m: with no hidden route the unit stood 1.3-4 s at a spot that was not deep, and was opened; standing there is the worse bet)
        { maxPops: SD.farPops, within: { x: mePos.x, z: mePos.z, r: SD.fallBackMax * 2 }, minDistFrom: { x: mePos.x, z: mePos.z, d: 2 }, goalCoverMax: SD.goalCoverMax, deep: true, deepCap: true }];
    } else if (sdOverBudget) {
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
      // best-of search stopping 15 u inside the disc — the
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
      attempts = [{ maxPops: SD.farPops, within, minDistFrom: closerMin, goalCoverMax: SD.hugDist, score: sdNearer, scoreStop: -Math.max(sdRing, within.r - 15), shadow: true },
        { maxPops: SD.farPops, within, goalCoverMax: SD.hugDist, accept: sdFlankOk, flank: true },
        { maxPops: SD.nearPops, within, goalCoverMax: SD.goalCoverMax },
        { maxPops: SD.farPops, within, goalCoverMax: SD.goalCoverMax },
        { maxPops: SD.farPops, within },
        { maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin },
        { maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, anyGoal: true }];
    } else {
      attempts = [];
      // FLANK: no line from here for peekWaitMs -> the nearest hidden
      // cover-adjacent spot in the band that CAN open one (hidden route,
      // risk-gated), then the peek-fire-dodge from there.
      if (sdEngageDue) {
        attempts.push({ maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.bandSlack }, minDistFrom: { x: mePos.x, z: mePos.z, d: 4 },
          goalCoverMax: SD.hugDist, accept: sdFlankOk, flank: true });
      }
      // BETTER POSITION (the spot here is not good): the hidden spot in
      // the band, hugging cover, scoring holdGain above this one.
      // (at least twice the arrival radius away: a 2 u "better" spot at
      // the lock floor's edge, reached 2 u short, scored better again
      // from where the unit stopped — nine hops in ten seconds between
      // two cells 8 u apart, Factory2 idle trace 2026-10-07)
      attempts.push({ maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdUpper + SD.bandSlack }, minDistFrom: { x: mePos.x, z: mePos.z, d: 4 },
        goalCoverMax: SD.hugDist, score: sdPosScoreAt, scoreStop: 8, better: true });
      // PUSH (patience): approach along cover, near-zero exposure only —
      // toward a line-capable spot first.
      if (sdPushDue) {
        const pushWithin = { x: opp.pos.x, z: opp.pos.z, r: dist - Math.max(SD.hopGainMin, dist * 0.3) };
        attempts.push({ maxPops: SD.farPops, within: pushWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, accept: sdFlankOk, push: true });
        attempts.push({ maxPops: SD.farPops, within: pushWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, push: true });
        attempts.push({ maxPops: SD.farPops, within: closerWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, push: true });
      }
      // THE APPROACH (owner 2026-10-16, "沒攻擊可做、沒點可去，就沿躲著的路線往
      // 你靠近"): the last hidden stages — a spot nearer the enemy than here
      // by hopGainMin, by a hidden route, next to cover first. The unit comes
      // on through cover; it is never handed to the plain brain's straight
      // walk (the stall handover is gone).
      const approachWithin = { x: opp.pos.x, z: opp.pos.z, r: Math.max(2, dist - SD.hopGainMin) };
      attempts.push({ maxPops: SD.farPops, within: approachWithin, minDistFrom: closerMin, goalCoverMax: SD.goalCoverMax, score: sdNearer, scoreStop: -Math.max(2, dist - 15), approach: true });
      attempts.push({ maxPops: SD.farPops, within: approachWithin, minDistFrom: closerMin, score: sdNearer, scoreStop: -Math.max(2, dist - 15), approach: true });
    }
    // THE ATTACKS, in order (R3): THE ENGAGE RUN — the crossing that opens a
    // line, taken with the dodge and the dump — then THE STAND PEEK, then the
    // relocations (flank, better, push, approach). A deliberate exposure is
    // planned only with the boost to sprint it and the dodge in hand.
    if (sdEngageDue && !sdDeepHold && me.boost >= sdPeekNeed && sdDodgeReady) {   // (THE DEEP HOLD: no engage crossing while the gun is hot beyond the close range)
      attempts.unshift(
        { engage: true, within: { x: opp.pos.x, z: opp.pos.z, r: sdClosingDue ? Math.max(sdRing, dist - gain) : sdUpper + SD.bandSlack } },
        { standPeek: true }
      );
    }
    // FALL BACK (BOT_SD fallBackMax, owner 2026-10-15): cornered, the last
    // stage is a hidden spot farther from the enemy — the distance, not the
    // stream — at the cornered cap; the band not kept.
    if (sdCornered && SD.fallBackMax > 0) {
      attempts.push({ maxPops: SD.farPops, within: { x: mePos.x, z: mePos.z, r: SD.fallBackMax }, minDistFrom: { x: opp.pos.x, z: opp.pos.z, d: dist + SD.fallBackGain }, goalCoverMax: SD.goalCoverMax, fallback: true });
    }
    // NO OPEN GOAL UNDER FIRE (owner 2026-10-14): while a gun is hot a
    // planned hop never ends on a cell that may show (the anyGoal stages)
    // — that walk is the crossing of the stream; escapes keep theirs.
    if (sdHot && !sdOverBudget) {
      for (let i = attempts.length - 1; i >= 0 && attempts.length > 1; i -= 1) if (attempts[i].anyGoal) attempts.splice(i, 1);
    }
    // FAR AND HOT: no stand peek into the stream — the engage crossing and the hidden moves stay.
    if (sdFarHot && !sdOverBudget) {
      for (let i = attempts.length - 1; i >= 0 && attempts.length > 1; i -= 1) if (attempts[i].standPeek) attempts.splice(i, 1);
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
    if (!decided && a.standPeek) {
      // THE STAND PEEK's stage: one sidestep from here to a firing point, the
      // window, the step back — taken when no Engage Run crossing exists.
      if (sdStandPeekOk && !me.botSDPath && !me.botSDPeekTo && sdTryStandPeek(sdCycleDue && !sdPeekDue)) decided = true;
    } else if (!decided && a.engage) {
      // THE ENGAGE RUN's scan (R3, owner 2026-10-16): straight crossings from
      // here across the threat's line — 16 headings, lateral at least
      // bearingLateralNear; along each, every 2 u out to the dodge's length
      // plus crossRunMax, the body-wide walkable run whose samples pass a
      // firing point (the line opens on the way) and whose end is hidden
      // from the live and predicted eyes (R1), next to cover, inside the
      // band. The shortest wins. (A route search found no such cell next to
      // a camper: its bearing test wanted 53 deg off the line, and a run in
      // front of a hugged face is 30.)
      const stepD = sdU.stepDistance ?? STEP_DISTANCE;
      let best = null;
      for (let k = 0; k < 16; k += 1) {
        const ang = k * Math.PI / 8 + Math.random() * 0.2;
        const cx = Math.cos(ang), cz = Math.sin(ang);
        if (sdLateral(cx, cz) < SD.bearingLateralNear) continue;
        let crossed = false;
        for (let L = 2; L <= stepD + SD.crossRunMax; L += 2) {
          if (best && L >= best.L) break;
          const ex = mePos.x + cx * L, ez = mePos.z + cz * L;
          if (!sdLegFits(mePos.x + cx * (L - 2), mePos.z + cz * (L - 2), ex, ez)) break;
          if (!crossed) { if (sdFiringPoint(ex, myShotY, ez)) crossed = true; continue; }
          if (L < stepD) continue;   // (the end lies past the dodge)
          if (Math.hypot(ex - opp.pos.x, ez - opp.pos.z) > a.within.r) continue;
          if (!sdLandsHiddenFrom(sdSearchEyes, ex, ez)) continue;
          if (coverDistanceAt(sdGrid, ex, ez, myFloorY, obstacles) > SD.goalCoverMax) continue;
          best = { x: ex, z: ez, cx, cz, L };
          break;
        }
      }
      if (best) found = { path: [{ x: best.x, z: best.z, y: myFloorY }], goal: { x: best.x, z: best.z, y: myFloorY }, score: null, heading: { x: best.cx, z: best.cz } };
    } else if (!decided) found = findHiddenSpot(
      // (R1 for a reaction: an ESCAPE is priced against the live eyes and ends at the nearest cell hidden from the eyes of the moment with the plain body — behind the same cover, 2 u away; the strict eyes made the nearest "hidden" cell 10-20 u of open ground away, b1016d)
      sdGrid, sdSearchX, sdSearchZ, myFloorY, a.deep ? sdDeepGoalEyes : sdOverBudget ? sdEyes : (sdThreatMoving ? sdSearchEyes : sdRiskEyes), obstacles,   // (a deep route hides from the side-shifted eyes too — R4)
      { maxPops: a.maxPops, within: a.within ?? null, minDistFrom: a.minDistFrom ?? null, accept: a.accept ?? null, eyeHeight: MUZZLE_H,
        goalEyes: sdOverBudget ? sdReactEyes : (a.deep ? sdDeepGoalEyes : sdSearchEyes),   // (R1: a planned goal hides from the live and predicted eyes; a DEEP hold from the side-shifted eyes too — R4; an escape ends hidden from the eyes of the moment)
        exposurePenalty: SD.exposurePenalty, openPenalty: (sdHot || sdRecentFire) ? SD.openPenalty * SD.hotOpenPenaltyMul : SD.openPenalty, openDist: SD.openDist, goalCoverMax: a.goalCoverMax ?? null, anyGoal: !!a.anyGoal,   // (OPEN LAND: a hot or recent gun prices the open field up — hotOpenPenaltyMul)
        threat: { x: sdThreat.pos.x, z: sdThreat.pos.z }, alongWeight: SD.alongWeight, avoid: sdOverBudget ? sdAvoidPinned : sdAvoid,
        score: a.score ?? null, scoreStop: a.scoreStop ?? Infinity,
        // (planned hops may cross jump links — Station's platforms; an
        // escape under fire never vaults)
        allowJump: !sdOverBudget,
        // (the goal must hide the unit's width, not its centre point)
        goalShoulder: sdOverBudget ? SD.shoulder : sdSafeShoulder,   // (an escape: the plain body; a plan: the hot cone's width, proposal 1; the far sidestep margin, farShoulder; cloudWidth: a volley gun's cloud — the goal keeps its width behind the edge)
        goalUp: sdOverBudget ? sdHeadUp : sdWideUp,   // (R1: the goal hides the head too)
        // (the server's per-tick CPU budget — see findHiddenSpot; the sim sets none)
        deadline: host.deadline(),
        job: me.botSDSearchJob }
    );
    if (found && found.pending) { found = null; sdSearchPending = true; }
    if (found && a.shadow) sdShadowShape(found);
    if (sdSearchPending) {
      me.botSDSearchAt = now;   // (the same stage continues next tick)
    } else if (decided) {
      // (watch / hold / retreat chosen above)
    } else if (found && (!a.better || found.score >= sdPosScore + (sdGrazed ? 0.5 : SD.holdGain)) && sdHopOk(found, !!a.engage, (a.deep && !a.deepCap) ? 0 : (a.push ? SD.pushCapScale : 1), !!a.engage)) {   // (a grazed spot takes any deeper one — proposal 1; a deep hop takes no exposed piece at all: capScale 0, its last stage the cap)
      me.botSDSearchJob = null;
      me.botSDRiskHoldSince = null;
      me.botSDIdleSince = null;
      if (a.engage) me.botSDEngages = (me.botSDEngages ?? 0) + 1;
      me.botSDEngageRun = !!a.engage;   // (its crossing fires with the pre-aimed reaction)
      if (a.engage) {
        // THE ENGAGE RUN starts with the dodge along its crossing (R3) and runs
        // on THE CROSSING LEGS it shares with the reaction: across the threat's
        // line as it is each tick, the side kept, leaning toward its cell, the
        // magazine dumped, until the body is hidden again.
        const h = found.heading, p1 = sdPerp(1);
        me.botSDReact = { side: (h.x * p1.x + h.z * p1.z) >= 0 ? 1 : -1, at: now, moved: false, engage: true, exposed: false };
        if (now > (me.stepUntil || 0) && host.startStep(h.x, h.z)) {
          me.botSDDodges = (me.botSDDodges ?? 0) + 1;
          me.botSDEngageDodges = (me.botSDEngageDodges ?? 0) + 1;
          me.botSDStream = { x: h.x, z: h.z }; me.botSDStreamAt = now;
        }
      }
      // (harness bookkeeping: what the hop was for)
      const hopKind = a.engage ? 'engage' : sdOverBudget ? 'escape' : a.deep ? 'deep' : a.fallback ? 'fallback' : a.flank ? 'flank' : a.better ? 'better' : a.push ? 'push' : a.approach ? 'approach' : 'close';
      if (sdOverBudget && sdNearGoalOf(found.goal)) me.botSDNearEscapes = (me.botSDNearEscapes ?? 0) + 1;   // (R1 for a reaction: a short escape)
      me.botSDHopKind = hopKind;   // (read by the hot re-check: an escape is never dropped)
      // (an anyGoal hop ends on a cell that may show: no "goal uncovered" drop for it)
      me.botSDGoalMayShow = !!a.anyGoal;
      if (!me.botSDHopKinds) me.botSDHopKinds = {};
      me.botSDHopKinds[hopKind] = (me.botSDHopKinds[hopKind] ?? 0) + 1;
      me.botSDPath = found.path;
      me.botSDPathIdx = 0;
      me.botSDGoal = found.goal;
      me.botSDMoveAnchor = null;
      me.botSDSearchStage = 0;
      me.botSDSearchAt = now + SD.searchMs;
      me.botSDHops = (me.botSDHops ?? 0) + 1;
      me.botSDHopLenSum = (me.botSDHopLenSum ?? 0) + Math.hypot(found.goal.x - mePos.x, found.goal.z - mePos.z);
    } else if (stage < attempts.length - 1) {
      me.botSDSearchJob = null;
      me.botSDSearchStage = stage + 1;
      me.botSDSearchAt = now;
    } else {
      me.botSDSearchJob = null;
      me.botSDSearchStage = 0;
      me.botSDSearchAt = now + (sdHidden ? SD.failRetryMs : SD.exposedRetryMs);
    }
  }
  // Cover pacing is anchored at the arrival point: leaving the cover
  // (a route, a peek, a line opening) drops the anchor and the leg.
  if (me.botSDPath || me.botSDPeekTo || !sdHidden) {
    me.botSDPaceAnchor = null;
    me.botSDPaceX = 0;
    me.botSDPaceZ = 0;
    me.botSDNoLegSince = null;
  }
  // ROOM FOR A STRAFE (owner 2026-10-15, the fight and open strafes had no
  // room test at all — two airport deaths pressed a wall at 5-10 u/s with
  // "dash, across the line" ordered): the body (radius 1.3) along the
  // heading for len u.
  const sdRoomFits = (cx, cz, len) => {
    const n = Math.max(1, Math.ceil(len / 0.6));
    for (let k = 1; k <= n; k += 1) {
      const f = k / n;
      if (unitOverlapsObstacle(mePos.x + cx * len * f, mePos.y, mePos.z + cz * len * f, obstacles, 1.3)) return false;
    }
    return true;
  };
  // (the strafe sign with room — crossRoom, then 4 u — and no stalled side
  // (botSDStallSide): sg, else -sg, else 0 = no side at all)
  const sdStrafeSide = (sx, sz, sg) => {
    const deadS = now < (me.botSDStallSide?.until ?? 0) ? me.botSDStallSide : null;
    const ok = (s) => !(deadS && (sx * s) * deadS.x + (sz * s) * deadS.z > 0)
      && (sdRoomFits(sx * s, sz * s, SD.crossRoom) || sdRoomFits(sx * s, sz * s, 4));
    if (ok(sg)) return sg;
    if (ok(-sg)) return -sg;
    return 0;
  };
  // RUN ON (BOT_SD flightRunOn): the route ended with rounds in the air —
  // keep running across the line on the crossing's side while a hidden
  // leg with room exists; the cover pacing starts once they have landed.
  const sdRunOnLeg = () => {
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    const sd = me.botSDRunOnSide;
    let cx = -lz, cz = lx;   // (the perpendicular, on the kept side)
    if (cx * sd.x + cz * sd.z < 0) { cx = -cx; cz = -cz; }
    const ex = mePos.x + cx * 4, ez = mePos.z + cz * 4;
    for (let k = 0; k < sdEyes.length; k += 1) if (sdSeenFrom(sdEyes[k], ex, myShotY, ez)) return false;
    if (walkSegmentBlocked(mePos.x, mePos.z, ex, ez, mePos.y, obstacles)) return false;
    coverMove = { hold: false, hide: true, dash: true, mx: cx, mz: cz };
    me.botSDHeadX = cx; me.botSDHeadZ = cz;
    me.botSDState = 'runon';
    me.botSDRunOns = (me.botSDRunOns ?? 0) + 1;
    return true;
  };
  // ===================== 7. THE REACTION =====================
  // THE REACTION (R5, owner 2026-10-16): every exposure that is not a plan's
  // own window — caught hidden, a window over its budget, a landing that
  // showed — is answered by ONE rule: the dodge across the line, the sprint
  // across the line, the magazine dumped, until the body is hidden. Here the
  // reaction starts (the side, the dodge); its legs are the 'react' branch
  // of THE LEGS; the fire block dumps while botSDExposedAt is set; the run on
  // after hiding (the stream, R5) and the search follow.
  const sdReactNow = !sdHidden && !me.botSDPeekTo && !sdAttackLeg && (!me.botSDPlanned || sdOverBudget);   // (an attack's route keeps its legs — R3)
  // (sdPerp — the perpendicular on side s — is defined with sdLegFits above; how far the body can run along a heading:)
  const sdRunRoom = (cx, cz) => { let room = 0; for (const L of [SD.reactRoom, SD.reactSideProbe * 0.5, SD.reactSideProbe]) { if (!sdLegFits(mePos.x, mePos.z, mePos.x + cx * L, mePos.z + cz * L)) break; room = L; } return room; };
  if (sdReactNow && !me.botSDReact) {
    // THE SIDE: the longer run across the line; equal -> the side the last
    // hidden spot lies on (the cover the unit came from); a side that stalled
    // the body (botSDStallSide) is not taken.
    const dead = now < (me.botSDStallSide?.until ?? 0) ? me.botSDStallSide : null;
    const rooms = [1, -1].map((s) => { const p = sdPerp(s); return (dead && p.x * dead.x + p.z * dead.z > 0) ? -1 : sdRunRoom(p.x, p.z); });
    let side;
    if (rooms[0] !== rooms[1]) side = rooms[0] > rooms[1] ? 1 : -1;
    else {
      const lh = me.botSDLastHidden, p = sdPerp(1);
      side = (lh && (lh.x - mePos.x) * p.x + (lh.z - mePos.z) * p.z < 0) ? -1 : 1;
    }
    me.botSDReact = { side, at: now, moved: false };
    me.botSDReacts = (me.botSDReacts ?? 0) + 1;
    // THE DODGE: across the line on that side — into a wall it still buys
    // its 0.3 s (the step bonks and stands, invulnerable); no road across on
    // either side -> along the route to the nearest hidden cell, if any.
    if (now >= (me.stepCooldownUntil ?? 0) && now > (me.stepUntil ?? 0) && me.boost >= sdStepCost + SD.flinchReserve) {
      let dx = 0, dz = 0;
      if (Math.max(rooms[0], rooms[1]) > 0) { const p = sdPerp(side); dx = p.x; dz = p.z; }
      else if (me.botSDPath) { const wp = me.botSDPath[me.botSDPathIdx]; dx = wp.x - mePos.x; dz = wp.z - mePos.z; }
      const dl = Math.hypot(dx, dz);
      if (dl > 0 && host.startStep(dx / dl, dz / dl)) {
        me.botSDDodges = (me.botSDDodges ?? 0) + 1;
        me.botSDReactDodges = (me.botSDReactDodges ?? 0) + 1;
        me.botSDStream = { x: dx / dl, z: dz / dl }; me.botSDStreamAt = now;
      }
    }
  } else if (me.botSDReact && me.botSDEngageRun) {
    // THE ENGAGE RUN ends hidden again after its crossing (the line was open
    // on the way), at its cell, or after engageRunMaxMs — the enemy walked
    // off. A new cover: no dwell, the next attack or move at once.
    const R = me.botSDReact;
    if (!sdHidden) R.exposed = true;
    const atCell = !!me.botSDGoal && Math.hypot(me.botSDGoal.x - mePos.x, me.botSDGoal.z - mePos.z) < 2;
    if ((sdHidden && R.exposed && now > (me.stepUntil || 0)) || atCell || now - R.at > SD.engageRunMaxMs) {
      me.botSDReact = null;
      sdDrop();
      me.botSDDwellUntil = now;
      me.botSDSearchAt = now;
      me.botSDEngageEnds = (me.botSDEngageEnds ?? 0) + 1;
    }
  } else if (!sdReactNow && me.botSDReact) {
    // HIDDEN (or a plan took over): the reaction is over — the route it ran
    // from is stale, the search starts from where the body is.
    const moved = me.botSDReact.moved;
    me.botSDReact = null;
    if (moved && me.botSDPath) { sdDrop(); me.botSDSearchAt = now; }
  }
  // (a route to a cell within reactDist — the short escape: straight to it)
  const sdNearGoal = !!me.botSDPath && sdNearGoalOf(me.botSDGoal);
  // ===================== 8. THE LEGS =====================
  if (now <= (me.stepUntil || 0)) {
    // mid dodge step (manoeuvre 2's way back): the lerp owns the body
    coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    me.botSDState = 'dodge';
  } else if (me.botSDReact && (sdReactNow || me.botSDEngageRun)) {
    // THE REACTION's LEGS (R5): the sprint across the line as it is THIS
    // tick, on the kept side, leaning up to reactDriftDeg toward the nearest
    // hidden cell (the escape route's goal) when that lean has room; the
    // kept side has no room -> the other side (the wall flips it, nothing
    // else does); neither -> the route to the nearest hidden cell, straight
    // (a corridor); no route -> the most lateral walkable heading of eight;
    // none -> stand and fire.
    const R = me.botSDReact;
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    const goal = me.botSDGoal ?? null;
    const alongSgn = goal ? Math.sign((goal.x - mePos.x) * lx + (goal.z - mePos.z) * lz) : 0;
    const dc = Math.cos(SD.reactDriftDeg * Math.PI / 180), ds = Math.sin(SD.reactDriftDeg * Math.PI / 180);
    const dead = now < (me.botSDStallSide?.until ?? 0) ? me.botSDStallSide : null;
    let hx = 0, hz = 0, found = false;
    for (const s of [R.side, -R.side]) {
      const p = sdPerp(s);
      if (dead && p.x * dead.x + p.z * dead.z > 0) continue;
      const cands = alongSgn ? [{ x: p.x * dc + lx * alongSgn * ds, z: p.z * dc + lz * alongSgn * ds }, p] : [p];
      for (const c of cands) {
        if (!sdLegFits(mePos.x, mePos.z, mePos.x + c.x * SD.reactRoom, mePos.z + c.z * SD.reactRoom)) continue;
        hx = c.x; hz = c.z; found = true;
        if (s !== R.side) { R.side = s; me.botSDReactFlips = (me.botSDReactFlips ?? 0) + 1; }
        break;
      }
      if (found) break;
    }
    if (!found && me.botSDPath) {
      // (the corridor: the route, straight — its waypoints advance as the body passes them)
      const sp = me.botSDPath;
      while (me.botSDPathIdx < sp.length - 1 && Math.hypot(sp[me.botSDPathIdx].x - mePos.x, sp[me.botSDPathIdx].z - mePos.z) < 2.5) me.botSDPathIdx += 1;
      const wp = sp[me.botSDPathIdx];
      hx = wp.x - mePos.x; hz = wp.z - mePos.z;
      const hl = Math.hypot(hx, hz);
      if (hl > 0.5) { hx /= hl; hz /= hl; found = true; me.botSDReactCorridorTicks = (me.botSDReactCorridorTicks ?? 0) + 1; }
    }
    if (!found) {
      let best = -1;
      for (let k = 0; k < 8; k += 1) {
        const cx = Math.cos(k * Math.PI / 4), cz = Math.sin(k * Math.PI / 4);
        const lat = Math.abs(cx * lz - cz * lx);
        if (lat <= best) continue;
        if (!sdLegFits(mePos.x, mePos.z, mePos.x + cx * SD.reactRoom, mePos.z + cz * SD.reactRoom)) continue;
        best = lat; hx = cx; hz = cz; found = true;
      }
    }
    if (found) {
      hx += avoid.rx * 0.6; hz += avoid.rz * 0.6;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: hx, mz: hz };
      me.botSDHeadX = hx; me.botSDHeadZ = hz;
      me.botSDStream = { x: hx, z: hz }; me.botSDStreamAt = now;   // (R5: the run on after hiding keeps this heading)
      R.moved = true;
      if (!sdHidden) R.exposed = true;
    } else {
      me.momentumVX = 0; me.momentumVZ = 0;
      coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    }
    me.botSDState = me.botSDEngageRun ? 'engage' : 'react';
    me.botSDReactTicks = (me.botSDReactTicks ?? 0) + 1;
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
    // (sdLegFits — the body-wide room test — is defined with THE REACTION above)
    let sdCreep = false;
    while (me.botSDPathIdx < sp.length - 1) {
      const dwp = Math.hypot(wp.x - mePos.x, wp.z - mePos.z);
      if (dwp >= 2.5) break;
      const nxt = sp[me.botSDPathIdx + 1];
      const ex = nxt.x - wp.x, ez = nxt.z - wp.z, el = Math.hypot(ex, ez) || 1;
      const passed = ((mePos.x - wp.x) * ex + (mePos.z - wp.z) * ez) / el >= 0;
      if (passed || (dwp < 2 && sdLegFits(mePos.x, mePos.z, nxt.x, nxt.z))) {
        me.botSDPathIdx += 1;
        wp = sp[me.botSDPathIdx];
      } else {
        // the cut would clip a corner: walk the last stretch onto the waypoint
        sdCreep = dwp < 2;
        break;
      }
    }
    let tx = wp.x - mePos.x, tz = wp.z - mePos.z;
    const wl = Math.hypot(tx, tz) || 1;
    tx = tx / wl + avoid.rx * 0.6;
    tz = tz / wl + avoid.rz * 0.6;
    const tl = Math.hypot(tx, tz) || 1;
    // Sprint where it matters: across exposure (now, or 5 u ahead on the
    // heading) and open ground down to dashFloor; a covered leg runs on
    // one of the two latches below.
    let aheadExposed = false, aheadPt = null;
    if (sdHidden) {
      const ahead = { x: mePos.x + (tx / tl) * SD.aheadProbe, y: myShotY, z: mePos.z + (tz / tl) * SD.aheadProbe };
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
    // A ROUTE PLANNED UNDER A QUIET GUN (owner 2026-10-15, "too easy"): the
    // gun went hot while the unit was still hidden and the route ran its
    // crossing into the stream on the plan's risk of 0.000. With the gun hot
    // and an exposed stretch ahead the rest of the route is priced again,
    // hot (every 200 ms), and dropped over the cap — the first exposed piece
    // marked, the unit holds and the search runs again. Escapes keep going.
    // (never an escape — its remaining stretch is exposed by nature and
    // dropping it stranded the unit in the open, airport 2026-10-15; and
    // once the tick the gun turns hot, probe or no probe: an engage
    // crossing opens on the body before the 8 u probe sees anything)
    if (sdHidden && sdHot && !sdOverBudget && me.botSDHopKind !== 'escape'
        && (sdHotRise || (aheadExposed && now - (me.botSDRouteHotCheckAt ?? -1e9) >= 200))) {
      me.botSDRouteHotCheckAt = now;
      const rr = sdRouteRisk(sp.slice(me.botSDPathIdx), mePos.x, mePos.z, myFloorY, sdRiskEyes, sdThreat, SD, sdClear, sdSprint, true, sdSafeShoulder);
      if (rr.exposedLen > 0) {   // (R7a: an exposed piece ahead under a hot gun is dropped, whatever the number)
        if (rr.first) sdMark(rr.first.x, rr.first.z);
        sdDrop();
        me.botSDSearchAt = now;          // (the search runs this tick — no wait at a spot the route happened to be dropped on)
        me.botSDFragileAt = now;         // (CORNERED at once, fragileHoldMs)
        me.botSDHotRouteDrops = (me.botSDHotRouteDrops ?? 0) + 1;
        me.botSDLastRisk = rr.risk;
        sdLegOverride = 'hold';
      }
    }
    const sdWpDist = Math.hypot(wp.x - mePos.x, wp.z - mePos.z);
    if ((wp.y ?? myFloorY) - myFloorY > 1.7 && host.grounded && !me.airborne && sdWpDist < SD.jumpReach) {
      // At the ledge. LATERAL CROSSING re-check (the threat may have moved
      // since the plan): seen here and the crossing along its line -> no
      // jump into the line; the ledge is marked and the route re-planned.
      const jl = sdWpDist || 1;
      const jx = (wp.x - mePos.x) / jl, jz = (wp.z - mePos.z) / jl;
      if (!sdHidden && sdLateral(jx, jz) < SD.lateralMin) {
        sdMark(wp.x, wp.z, SD.stuckAvoidMs, true);
        sdDrop();
        me.botSDSearchAt = now;
        sdLegOverride = 'hold';
      } else if (me.boost >= SD.jumpBank && now >= (me.jumpCooldownUntil ?? 0)) {
        if (host.startJump()) {
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
      if (host.startStep(wp.x - mePos.x, wp.z - mePos.z)) {
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
      const ap = { x: mePos.x + (tx / tl) * SD.shadowWalkProbe, y: myShotY, z: mePos.z + (tz / tl) * SD.shadowWalkProbe };
      for (let k = 0; k < sdPredEyes.length && !aheadPredicted; k += 1) if (sdSeenFrom(sdPredEyes[k], ap.x, ap.y, ap.z)) aheadPredicted = true;
    }
    // NO WALK INTO A HOT LINE (BOT_SD hotNoShadowWalk, owner 2026-10-15):
    // with a gun hot a covered leg about to enter the predicted line is an
    // exposure in the making — it sprints like one (to dashFloor; the
    // shadow walk, the corner creep and the travel latch stand down). Two
    // airport deaths walked into the live line at 8-12 u/s under fire.
    const sdHotAhead = sdHot && aheadPredicted;
    // (THE TANK, owner 2026-10-15: a live line — open, or 8 u ahead — spends
    // to dashFloor; a hidden leg sprinting for a hot gun's predicted line, or
    // with rounds in the air behind cover, only to hotAheadFloor: the dodge
    // and the escape keep their boost, no 8 u/s walk in the open)
    // (owner 2026-10-15, the loop: under a hot gun EVERY hidden leg keeps the
    // reserve — the line 8 u ahead included; only the open body spends to
    // the floor. The escape after the next line opens needs the boost.)
    const sdDash = !sdHidden
      ? me.boost > SD.dashFloor
      : (aheadExposed || sdHotAhead || sdIncoming)
        ? me.boost > (sdHot ? SD.hotAheadFloor : SD.dashFloor)
        : (!sdCreep && (sdBurst || (!aheadPredicted && !(jumpAhead && me.boost < SD.jumpBank) && sdTravel())));
    // THE BODY MUST RUN (BOT_SD crossStallMs, owner 2026-10-15): an exposed
    // leg ordered to dash that moved the body less than crossStallMove in
    // crossStallMs is stalled on something the room test did not see — that
    // lateral side is dead for crossStallDeadMs (the other side gets the
    // legs, both dead -> the route's heading) and the kept side is dropped.
    // Three airport deaths stood 0.2-0.5 s in the open with "dash, across
    // the line" ordered.
    // (hidden legs only here — the exposed ones, every branch, run the detector after the legs)
    const sdCrossing = sdHidden && (sdExposedLeg || sdHotAhead) && me.boost > SD.dashFloor && !me.airborne;
    if (!sdCrossing) me.botSDCrossAnchor = null;
    else if (!me.botSDCrossAnchor) me.botSDCrossAnchor = { x: mePos.x, z: mePos.z, at: now };
    else if (now - me.botSDCrossAnchor.at >= SD.crossStallMs) {
      const an = me.botSDCrossAnchor;
      if (Math.hypot(mePos.x - an.x, mePos.z - an.z) < SD.crossStallMove) {
        // (the side the last heading leaned to, across the threat's line; a heading on the line kills no side)
        let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
        const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const hxp = me.botSDHeadX ?? 0, hzp = me.botSDHeadZ ?? 0;
        const al = hxp * lx + hzp * lz;
        const sx = hxp - al * lx, sz = hzp - al * lz, sl = Math.hypot(sx, sz);
        if (sl > 0.2) me.botSDStallSide = { x: sx / sl, z: sz / sl, until: now + SD.crossStallDeadMs };
        me.botSDCrossSide = null;
        me.botSDLatSide = null;
        me.botSDCrossStalls = (me.botSDCrossStalls ?? 0) + 1;
      }
      me.botSDCrossAnchor = { x: mePos.x, z: mePos.z, at: now };
    }
    // (ONE SIDE PER EXPOSURE: the kept side outlives the flicker of the ahead / incoming reads by 300 ms, then clears)
    if (!(sdExposedLeg || sdHotAhead) && now - (me.botSDCrossSide?.at ?? -1e9) > 300) me.botSDCrossSide = null;
    let hx = tx / tl, hz = tz / tl;
    // Inside lateralFullDist the crossing is fully perpendicular (the
    // table in the owner's notes: 0.8 lateral at 60 u is still a hit).
    // FAR AND HOT: fully perpendicular at any distance.
    // HIDDEN WITH THE EXPOSURE AHEAD (BOT_SD aheadLateral, owner 2026-10-15):
    // the pre-rotation keeps aheadLateral and the rest along the route, so
    // the leg ENTERS the exposure — fully perpendicular behind the cover
    // ran along its face and never crossed (1.2 s of pacing, airport).
    // Rounds in the air behind a closed line keep the full crossing.
    // (a SHORT ESCAPE runs straight to its cell — reactDist: the rotation is for a crossing, not for the 2 u behind the cover)
    const latMin = sdNearGoal ? 0 : !sdHidden
      ? ((dist <= SD.lateralFullDist || sdFarHot) ? 1 : SD.lateralMin)
      : (sdIncoming ? 1 : Math.min(1, SD.aheadLateral));
    let legMode = 'dash';
    if ((sdExposedLeg || sdHotAhead) && latMin > 0) {
      // CROSSING RULE (micro-sim 2026-10-05): a no-lead shooter misses a
      // target displaced more than cone radius + capsule radius during the
      // round's flight — at 160 u a 20 u/s run PERPENDICULAR to the line
      // is nearly unhittable, a 12 u/s one or any run along the line is a
      // kill. Steer the exposed crossing so at least lateralMin of the
      // heading is perpendicular to the threat's line, keeping the
      // along-line sign so the hop still progresses; a heading right on
      // the line picks the walkable side.
      let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
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
        const ex = mePos.x + cx * 4, ez = mePos.z + cz * 4;
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
        // ONE SIDE PER EXPOSURE (BOT_SD crossKeepSide, owner 2026-10-15):
        // the side taken on this exposure (botSDCrossSide) is tried first
        // whatever the tick gap; a side that STALLED the body
        // (botSDStallSide) is dead for crossStallDeadMs and the other side
        // gets the legs; both dead -> no rotation, the route's heading at a
        // sprint (the shortest exposure there is). A fresh choice prefers
        // the side with a crossing's worth of room (crossRoom) over 4 u.
        const kept = me.botSDCrossSide;
        const pref = kept ?? me.botSDLatSide;
        const prefOk = !!pref && (!!kept || now - pref.at <= SD.lateralKeepMs);
        const firstSgn = (prefOk && pref.x * sx0 + pref.z * sz0 < 0) ? -1 : 1;
        const dead = now < (me.botSDStallSide?.until ?? 0) ? me.botSDStallSide : null;
        const sideDead = (sgn) => !!dead && (sx0 * sgn) * dead.x + (sz0 * sgn) * dead.z > 0;
        const alongSgn = along < 0 ? -1 : 1;
        const lats = latMin < 1 && SD.lateralSlide < latMin ? [latMin, SD.lateralSlide] : [latMin];
        const rooms = SD.crossRoom > 4 ? [SD.crossRoom, 4] : [4];
        // ([sign, room] in priority: a kept side through every room first; a fresh choice, the long room on either side first)
        const order = [];
        if (prefOk) { for (const r of rooms) order.push([firstSgn, r]); for (const r of rooms) order.push([-firstSgn, r]); }
        else { for (const r of rooms) { order.push([firstSgn, r]); order.push([-firstSgn, r]); } }
        const fits4 = new Map();   // (the 4 u body test per [side, lateral], shared by the long room and the fallback)
        let room = false, rx = 0, rz = 0;
        for (let o = 0; o < order.length && !room; o += 1) {
          const sgn = order[o][0], roomLen = order[o][1];
          if (sideDead(sgn)) continue;
          for (let i = 0; i < lats.length && !room; i += 1) {
            const ak = Math.sqrt(Math.max(0, 1 - lats[i] * lats[i])) * alongSgn;
            let cx = sx0 * sgn * lats[i] + lx * ak, cz = sz0 * sgn * lats[i] + lz * ak;
            const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
            // (room for the BODY, not a thin segment: the thin test sent the
            // rotated heading into cover edges and the wedge detector fired
            // ten times a minute at close range, 2026-10-07)
            const key = `${sgn}|${i}`;
            let fits = fits4.get(key);
            if (fits == null) { fits = sdLegFits(mePos.x, mePos.z, mePos.x + cx * 4, mePos.z + cz * 4) && !(sdBehindLine && sdLegSeen(cx, cz)); fits4.set(key, fits); }
            if (fits && roomLen > 4) fits = sdLegFits(mePos.x + cx * 4, mePos.z + cz * 4, mePos.x + cx * roomLen, mePos.z + cz * roomLen);
            if (fits) {
              rx = cx; rz = cz; room = true;
              me.botSDLatSide = { x: sx0 * sgn, z: sz0 * sgn, at: now };
              me.botSDCrossSide = me.botSDLatSide;
              me.botSDLatSign = (sx0 * sgn) * -lz + (sz0 * sgn) * lx >= 0 ? 1 : -1;
              if (lats[i] < latMin) me.botSDLateralSlides = (me.botSDLateralSlides ?? 0) + 1;
              if (roomLen < SD.crossRoom) me.botSDShortRooms = (me.botSDShortRooms ?? 0) + 1;
            }
          }
        }
        if (room) {
          hx = rx + avoid.rx * 0.6;
          hz = rz + avoid.rz * 0.6;
          const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
          me.botSDLateralTicks = (me.botSDLateralTicks ?? 0) + 1;
        } else if (headingLateral < SD.corridorLateral && (!sdHidden || aheadExposed)) {
          // (rounds in the air behind a closed line: no corridor — the route's heading stands)
          // CORRIDOR (owner 2026-10-05): the heading runs along the line and
          // nothing lets it turn — a run the enemy hits as if standing
          // (100 u: 92-100% per round). Caught inside: sprint back to the
          // last hidden spot and mark the corridor; not yet exposed: stop
          // short of it, mark it, re-plan around the mark. A heading that
          // is mostly lateral already, or the enemy's empty mag, commits.
          if (!sdHidden) {
            const lh = me.botSDLastHidden;
            const back = lh ? Math.hypot(lh.x - mePos.x, lh.z - mePos.z) : Infinity;
            sdMark(mePos.x, mePos.z);
            if (back > 1 && back <= SD.backOffMax) {
              sdDrop();
              me.botSDPeekTo = { x: lh.x, z: lh.z };
              me.botSDPeekArmed = false;
              me.botSDBackOff = true;
              me.botSDBackoffs = (me.botSDBackoffs ?? 0) + 1;
              me.botSDSearchAt = now + SD.searchMs;
              hx = (lh.x - mePos.x) / back; hz = (lh.z - mePos.z) / back;
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
        me.botSDCrossSide = me.botSDLatSide;
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
      if (!wa || Math.hypot(mePos.x - wa.x, mePos.z - wa.z) > SD.wedgeMoveMin) {
        me.botSDWedge = { x: mePos.x, z: mePos.z, at: now };
      } else if (now - wa.at >= SD.wedgeMs && now >= (me.botSDSlideUntil ?? 0)) {
        me.botSDWedge = { x: mePos.x, z: mePos.z, at: now };
        me.botSDWedges = (me.botSDWedges ?? 0) + 1;
        me.botSDRouteWedges = (me.botSDRouteWedges ?? 0) + 1;
        let slid = false;
        if (me.botSDRouteWedges <= 2) {
          let px = -coverMove.mz, pz = coverMove.mx;
          const nxt = sp[Math.min((me.botSDPathIdx ?? 0) + 1, sp.length - 1)];
          if ((nxt.x - mePos.x) * px + (nxt.z - mePos.z) * pz < 0) { px = -px; pz = -pz; }
          const okA = !walkSegmentBlocked(mePos.x, mePos.z, mePos.x + px * 3, mePos.z + pz * 3, mePos.y, obstacles);
          const okB = !walkSegmentBlocked(mePos.x, mePos.z, mePos.x - px * 3, mePos.z - pz * 3, mePos.y, obstacles);
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
    let sdRemain = Math.hypot(wp.x - mePos.x, wp.z - mePos.z);
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
    let tx = me.botSDPeekTo.x - mePos.x, tz = me.botSDPeekTo.z - mePos.z;
    const tl = Math.hypot(tx, tz) || 1;
    // A peek leg and a back-off leg are exposures (or about to be): sprint.
    // (the last onPointWalkU u of the leg out are walked: the body stops ON
    // the point instead of sprinting past the lane it was picked in)
    coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor && (me.botSDBackOff || tl > SD.onPointWalkU), mx: tx / tl, mz: tz / tl };
    me.botSDState = me.botSDBackOff ? 'back' : 'peek';
    // (a wedged peek leg bails at once — the 700 ms anchor bail above is
    // for a leg that merely stops closing; the point is pinned)
    if (now > (me.stepUntil || 0)) {
      const wa = me.botSDWedge;
      if (!wa || wa.peek !== me.botSDPeekTo || Math.hypot(mePos.x - wa.x, mePos.z - wa.z) > SD.wedgeMoveMin) {
        me.botSDWedge = { x: mePos.x, z: mePos.z, at: now, peek: me.botSDPeekTo };
      } else if (now - wa.at >= SD.wedgeMs) {
        me.botSDWedges = (me.botSDWedges ?? 0) + 1;
        sdMark(me.botSDPeekTo.x, me.botSDPeekTo.z, SD.stuckAvoidMs, true);
        sdDropPeek();   // (a wedged peek is void, like a bailed one)
        me.botSDSearchAt = now;
        me.botSDPeekBails = (me.botSDPeekBails ?? 0) + 1;
        coverMove = null;
      }
    }
  } else if (sdHidden && now < (me.botSDRunOnUntil ?? 0) && me.botSDRunOnSide && me.boost > SD.dashFloor && sdRunOnLeg()) {
    // (RUN ON: coverMove set by sdRunOnLeg — the rounds in the air land first)
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
    if (!me.botSDPaceAnchor) me.botSDPaceAnchor = { x: mePos.x, z: mePos.z };
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
      const hereCover = coverDistanceAt(sdGrid, mePos.x, mePos.z, myFloorY, obstacles);
      const legCoverMax = Math.max(SD.openDist, hereCover + 0.5);
      // THE ROTATION (owner 2026-10-16, "rotate out of the area/angle"): a
      // STRICT leg stays hidden through the enemy's next sidestep and predictS
      // of its run (the plan's eyes and width) — as the enemy moves, only the
      // legs round the cover ahead of the opening pass, and the shuffle
      // becomes the rotation; no strict leg -> a leg hidden from the eyes of
      // the moment (R1 for a reaction) — the shuffle goes on, it does not
      // stand a statue for the sidestep to open (b1016d: cornered 178 ticks).
      const legOk = (cx, cz, leg = SD.paceLeg, strict = true) => {
        const lx = mePos.x + cx * leg, lz = mePos.z + cz * leg;
        if (Math.hypot(lx - anchor.x, lz - anchor.z) > SD.paceLeash) { if (PP) PP.leash = (PP.leash ?? 0) + 1; return false; }
        if (walkSegmentBlocked(mePos.x, mePos.z, lx, lz, mePos.y, obstacles)) { if (PP) PP.walk = (PP.walk ?? 0) + 1; return false; }
        if (coverDistanceAt(sdGrid, lx, lz, myFloorY, obstacles) > legCoverMax) { if (PP) PP.open = (PP.open ?? 0) + 1; return false; }   // never MORE open than here
        if (strict) { for (let k = 0; k < sdSearchEyes.length; k += 1) if (sdSeenFrom(sdSearchEyes[k], lx, myShotY, lz, sdSafeShoulder, sdWideUp)) { if (PP) PP.seen = (PP.seen ?? 0) + 1; return false; } }   // (a hot cone's width and height too — proposals 1 and 5; the far sidestep margin: the shuffle goes deeper)
        else if (!sdLandsHidden(lx, lz)) { if (PP) PP.seen = (PP.seen ?? 0) + 1; return false; }
        for (let k = 0; k < sdEyes.length; k += 1) if (sdSkinSeen(sdEyes[k], lx, myShotY, lz)) { if (PP) PP.skin = (PP.skin ?? 0) + 1; return false; }   // (THE SKIN: not against a face a round reaches through)
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
      } else if (!moving || now >= (me.botSDPaceUntil ?? 0) || !legOk(hx, hz, me.botSDPaceLeg ?? SD.paceLeg, me.botSDPaceStrict !== false)) {
        // THE SHUFFLE (owner 2026-10-09, "very short range moving to prevent
        // pure stand still"): the 8 headings at paceLeg first, then at
        // paceLegMin — a tight nook that hides no 0.8 u leg still gets a
        // 0.4 u shuffle; every leg passes the same hidden / cover / walk
        // tests, so the move never costs survival. Fore / aft legs score
        // alongside lateral ones (paceLateralWeight), and a heading is not
        // reversed within paceReverseMinMs of the last pick unless nothing
        // else is legal: a human shifting weight in cover, not a twitch.
        let best = null, bestScore = -Infinity, bestLeg = SD.paceLeg, bestStrict = true;
        let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
        const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const phase = Math.random() * Math.PI * 2;
        const recent = moving && now - (me.botSDPacePickAt ?? -1e9) < SD.paceReverseMinMs;
        // (passes: strict with no reversal, strict, then the reaction's eyes — THE ROTATION)
        for (const leg of [SD.paceLeg, SD.paceLegMin]) {
          for (let pass = 0; pass < 3 && !best; pass += 1) {
            for (let k = 0; k < 8; k += 1) {
              const a = phase + k * Math.PI / 4;
              const cx = Math.cos(a), cz = Math.sin(a);
              if (pass === 0 && recent && (cx * hx + cz * hz) < -0.3) continue;   // (no reversal yet)
              if (!legOk(cx, cz, leg, pass < 2)) continue;
              const score = SD.paceLateralWeight * Math.abs(cx * lz - cz * lx) + 0.5 * (cx * hx + cz * hz) + (Math.random() - 0.5) * 0.8;
              if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; bestLeg = leg; bestStrict = pass < 2; }
            }
          }
          if (best) break;
        }
        if (best) {
          hx = best.x; hz = best.z;
          me.botSDPaceUntil = now + SD.paceMs;
          me.botSDPacePickAt = now;
          me.botSDPaceLeg = bestLeg;
          me.botSDPaceStrict = bestStrict;
          if (bestStrict) me.botSDPaceStrictLegs = (me.botSDPaceStrictLegs ?? 0) + 1; else me.botSDPaceLooseLegs = (me.botSDPaceLooseLegs ?? 0) + 1;
          me.botSDNoLegSince = null;
        } else {
          hx = 0; hz = 0;
          me.botSDPacePauseUntil = now + SD.paceRetryMs;
          if (me.botSDNoLegSince == null) me.botSDNoLegSince = now;   // (CORNERED reads this: no legal leg from here)
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
  } else {
    // FIGHT: a PLANNED window within its budget (every other exposure is THE
    // REACTION above) — fire from here (the fire block), standing
    // still (always when the enemy walked into a watched line) or
    // strafe-walking across the target line (flip on a wall).
    // Every exposed manoeuvre sprints (owner 2026-10-05) — the watch fight
    // too: the first round is the base cone whether the unit stands or not.
    if (me.botSDPlanned && me.botSDPeekOrigin && !me.botSDEngageRun && sdThreatDist <= sdPeekReach) {
      // (THE CLOSE PEEK STANDS: fires from its leg point, the step carries it back — BOT_SD peekStill)
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
        const away = sideX * (mePos.x - o.x) + sideZ * (mePos.z - o.z);
        if (Math.abs(away) > 0.3) { sg = away > 0 ? 1 : -1; peekAway = true; }
      }
      // THE BODY MUST RUN, the fight strafe (owner 2026-10-15): the side
      // needs room (crossRoom, then 4 u) and a side that stalled the body
      // is dead — the other side gets the legs; neither: stand and fire.
      let strafeNone = false;
      if (!peekAway) {
        const s2 = sdStrafeSide(sideX, sideZ, sg);
        if (s2 === 0) strafeNone = true;
        else if (s2 !== sg) { sg = s2; me.botSDStrafeSign = sg; }
      }
      // (the window strafes from its first tick — owner 2026-10-07: standing
      // for the first round, even in a slit, got the unit killed "immediately
      // after gunning": tank trace sc 82, dead at the first peek)
      let tx = strafeNone ? 0 : sideX * sg + avoid.rx * 0.8, tz = strafeNone ? 0 : sideZ * sg + avoid.rz * 0.8;
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
  }
  // ===================== 9. AFTER THE LEGS =====================
  // THE STREAM RULE (R5, owner 2026-10-15, "EASY EASY EASY"):
  // every round in this game is aimed at where the unit IS when it is fired
  // (no lead, no homing), so a body sprinting straight is ~7 u from every
  // aim point by the time the round lands, while a body that turns back
  // runs into the rounds fired at it ~130 ms earlier. The six deaths of
  // b1015j were all turns: a step out then an escape back, a fight strafe
  // then an escape the other way, a strafe sign flipping every tick
  // between the room test and the wall push, a step straight back along
  // the line. Exposed with a gun hot the heading is kept — a running
  // average over streamMs — and an order that turns back (dot <
  // -streamTurn) is refused: the i-frame step carries the body through the
  // stream (0.3 s invulnerable covers the window) when a route needs it
  // and the step is in hand, else the body runs on along the kept heading
  // when 4 u of it is walkable (a route that turned back is given up),
  // else the order stands.
  // AFTER HIDING (b1015k: five of six died HIDDEN, 20-150 ms after the line
  // closed, from rounds fired during the exposure — the unit stopped at the
  // first hidden spot, or turned back toward its exposure path, and the
  // rounds aimed at that path landed on it): the heading stays bound for
  // streamMs after the last exposed tick — a hold or a turn back in that
  // window becomes the run on along the kept heading while 4 u of it is
  // hidden and walkable; the cover pacing restarts where the run ends.
  const sdStreamWin = sdHot && !!me.botSDStream && now - (me.botSDStreamAt ?? -1e9) <= sdStreamMs;
  if (sdHot && (!sdHidden || sdStreamWin) && now <= (me.stepUntil || 0)) {
    if (me.botSDStream) me.botSDStreamAt = now;   // (the step's own heading binds at the landing)
  } else if (!sdHidden && sdHot && coverMove && !coverMove.hold && !coverMove.jump
      && !me.botSDPeekTo && !(me.botSDPlanned && me.botSDPeekOrigin)   // (a stand peek's legs — out, the window, the step back — are its own; the rule hijacked a peek's leg at 1 u in b1015l)
      && !sdNearGoal && !me.botSDReact) {   // (a short escape: straight to the cell — R1 for a reaction; THE REACTION keeps its own heading, the wall alone flips it)
    const st = (me.botSDStream && now - (me.botSDStreamAt ?? -1e9) <= sdStreamMs) ? me.botSDStream : null;
    let mx = coverMove.mx, mz = coverMove.mz;
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    if (st && mx * st.x + mz * st.z < -SD.streamTurn) {
      const deadS = now < (me.botSDStallSide?.until ?? 0) ? me.botSDStallSide : null;
      const onOk = !(deadS && st.x * deadS.x + st.z * deadS.z > 0)
        && !walkSegmentBlocked(mePos.x, mePos.z, mePos.x + st.x * 4, mePos.z + st.z * 4, mePos.y, obstacles);
      if (me.botSDPath && sdDodgeReady && me.boost >= sdStepCost && host.startStep(mx, mz)) {
        me.botSDDodges = (me.botSDDodges ?? 0) + 1;
        me.botSDStreamSteps = (me.botSDStreamSteps ?? 0) + 1;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
        me.botSDState = 'dodge';
        me.botSDStream = { x: mx, z: mz }; me.botSDStreamAt = now;   // (the legs run on with the step's heading after the landing)
        mx = 0; mz = 0;
      } else if (onOk) {
        if (me.botSDPath) { sdDrop(); me.botSDSearchAt = now + SD.searchMs; }   // (a route that turned back is given up: the search runs on from the run)
        coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: st.x, mz: st.z };
        mx = st.x; mz = st.z;
        me.botSDStrafeSign = (st.x * sideX + st.z * sideZ) >= 0 ? 1 : -1;   // (the strafe sign follows the kept heading: no flip-flop next tick)
        me.botSDStrafeUntil = now + 600 + Math.random() * 300;
        me.botSDState = 'stream';
        me.botSDStreamHolds = (me.botSDStreamHolds ?? 0) + 1;
      } else {
        me.botSDStreamTurns = (me.botSDStreamTurns ?? 0) + 1;   // (nothing better: the turn stands)
      }
    }
    if (mx !== 0 || mz !== 0) {
      const k = st ? Math.min(1, (now - me.botSDStreamAt) / sdStreamMs) : 1;
      const nx = st ? st.x * (1 - k) + mx * k : mx, nz = st ? st.z * (1 - k) + mz * k : mz;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-3) { me.botSDStream = { x: nx / nl, z: nz / nl }; me.botSDStreamAt = now; }
    }
  } else if (sdStreamWin && sdHidden && !me.botSDPeekTo
      && (sdTrailSeen || !coverMove || coverMove.hold || (!coverMove.jump && (coverMove.mx * me.botSDStream.x + coverMove.mz * me.botSDStream.z) / (Math.hypot(coverMove.mx, coverMove.mz) || 1) < -SD.streamTurn))) {
    // (hidden for less than a flight time: the rounds fired at the exposure are still landing — the run on, not a stand or a turn back; and never a stand where the trail eyes see — R1 on the spot)
    const st = me.botSDStream;
    const ex = mePos.x + st.x * 4, ez = mePos.z + st.z * 4;
    const ok = !walkSegmentBlocked(mePos.x, mePos.z, ex, ez, mePos.y, obstacles) && sdLandsHidden(ex, ez);   // (R1 for a reaction: 4 u on hides from the eyes of the moment — the trail is what the run leaves behind)
    if (ok && sdTrailSeen) me.botSDTrailRunOns = (me.botSDTrailRunOns ?? 0) + 1;
    if (ok) {
      if (me.botSDPath) { sdDrop(); me.botSDSearchAt = now + SD.searchMs; }
      coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: st.x, mz: st.z };
      me.botSDPaceAnchor = null;
      me.botSDState = 'stream';
      me.botSDStreamRunOns = (me.botSDStreamRunOns ?? 0) + 1;
    }
  }
  // THE BODY MUST RUN, every exposed leg (owner 2026-10-15): an exposed dash
  // — a crossing, a fight or open strafe, a run-on — that moved the body
  // less than crossStallMove in crossStallMs is stalled on something the
  // room tests did not see: the lateral side it leaned to is dead for
  // crossStallDeadMs (the crossing rule and the strafes read it), the
  // strafe sign flips, the kept crossing side is dropped. (Hidden legs with
  // the exposure ahead run the same detector inside the route legs.)
  if (!sdHidden && coverMove && !coverMove.hold && coverMove.dash && !me.airborne) {
    const an = me.botSDCrossAnchor;
    if (!an) me.botSDCrossAnchor = { x: mePos.x, z: mePos.z, at: now };
    else if (now - an.at >= SD.crossStallMs) {
      if (Math.hypot(mePos.x - an.x, mePos.z - an.z) < SD.crossStallMove) {
        let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
        const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
        const al = coverMove.mx * lx + coverMove.mz * lz;
        const sx = coverMove.mx - al * lx, sz = coverMove.mz - al * lz, sl = Math.hypot(sx, sz);
        if (sl > 0.2) me.botSDStallSide = { x: sx / sl, z: sz / sl, until: now + SD.crossStallDeadMs };
        me.botSDStrafeSign = -(me.botSDStrafeSign ?? 1);
        me.botSDStrafeUntil = now + 600 + Math.random() * 300;
        me.botSDCrossSide = null;
        me.botSDLatSide = null;
        me.botSDCrossStalls = (me.botSDCrossStalls ?? 0) + 1;
      }
      me.botSDCrossAnchor = { x: mePos.x, z: mePos.z, at: now };
    }
  } else if (!sdHidden) me.botSDCrossAnchor = null;
  // STUCK WATCHDOG window: the plain brain has the legs (and its own wedge
  // detectors, since no coverMove pins the stall clocks below).
  if (now < (me.botSDPlainUntil ?? 0)) {
    coverMove = null;
    me.botSDState = 'plain';
    me.botSDPaceAnchor = null;   // (the plain legs move the unit: the next search starts from where it is)
  }
  // DEATH REPORT TAPE (owner 2026-10-15, "show you how the BOT got caught
  // easily"): every 100 ms one line of what the brain sees and does, handed
  // to the host (the client keeps the last 8 s and prints it the frame the
  // unit dies, sdDeathReport, or on demand from window.__SD_REPORT()).
  if (host.tape && now - (me.botSDTapeAt ?? -1e9) >= 100) {
    me.botSDTapeAt = now;
    host.tape({
      t: now, fr: now - (me.botSDPrevTickAt ?? now), x: mePos.x, z: mePos.z, tx: sdThreat.pos.x, tz: sdThreat.pos.z, d: sdThreatDist,   // (fr: the gap since the brain last ran — a long frame or a frozen game shows here)
      hid: sdHidden ? 1 : 0, hot: sdHot ? 1 : 0, far: sdFarHot ? 1 : 0, heard: sdHeard,
      rc: me.botSDReact ? 1 : 0, ev: Math.round(sdThreatSpeedAll), eo: sdThreatOpen ? 1 : 0,   // (R5/R9: the reaction running; the enemy's speed; the enemy on open ground)
      st: me.botSDState ?? '-',
      kind: me.botSDPeekTo ? 'peek' : me.botSDPath ? (me.botSDHopKind ?? 'path') : (now <= (me.stepUntil || 0) ? 'step' : '-'),
      plan: me.botSDPlanned ? 1 : 0, over: sdOverBudget ? 1 : 0, exp: sdExposedFor,
      risk: me.botSDLastRisk, trade: me.botSDLastTrade, boost: me.boost, hp: me.hp,
      bloom: sdThreat.bloom ?? 0, idle: me.botSDIdleSince != null ? now - me.botSDIdleSince : null,
      // (what the legs COMMANDED this frame, against what the body did — a wall or a wedge shows as a dash that goes nowhere)
      cmd: coverMove ? (coverMove.hold ? 'hold' : coverMove.dash ? 'dash' : 'walk') : 'plain',
      hl: (() => { if (!coverMove || coverMove.hold) return null; const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z, ll = Math.hypot(lx, lz) || 1; return Math.abs(coverMove.mx * lz - coverMove.mz * lx) / ll; })(),
      // (which side of the threat's line the order leans to, a wall 1.6 u along the order, the speed the body was told last frame, its action)
      sg: (() => { if (!coverMove || coverMove.hold) return 0; const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z; const c = coverMove.mx * lz - coverMove.mz * lx; return c > 0.05 ? 1 : c < -0.05 ? -1 : 0; })(),
      wall: (coverMove && !coverMove.hold) ? (unitOverlapsObstacle(mePos.x + coverMove.mx * 1.6, mePos.y, mePos.z + coverMove.mz * 1.6, obstacles, 1.3) ? 1 : 0) : null,
      cmdv: Math.hypot(meVel?.x ?? 0, meVel?.z ?? 0),
      act: me.action ?? '-',
    });
  }
  me.botSDPrevTickAt = now;
  return coverMove;
}
