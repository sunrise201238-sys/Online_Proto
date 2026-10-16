// SUDDEN DEATH BRAIN (b1017a): ONE RULE IN FOUR PARTS, EACH WRITTEN ONCE.
//
// THE RULE: the unit stands only where it is hidden; it is exposed only to
// buy something — a firing line, a better cell, the way back — and every
// exposure is priced the same way: the chance of dying in it under the
// enemy's eyes and gun, against the chance of landing a hit. The planner
// takes the cheapest exposure that buys the most, else it holds; the legs
// run every exposure across the line.
//
//   1. HIDDEN (sdHiddenAt): one test of the body's silhouette — the front of
//      the capsule, both shoulders, the four shoulder corners, the top —
//      against every eye: each enemy
//      where it stands, where its run takes it in predictS, and where it
//      fired from while that round is still in flight.
//   2. THE PRICE (sdPrice, sdOwn, sdDeathsPerHit): the chance of dying in an
//      exposure of T ms at distance d moving lat across the line, after the
//      enemy's reaction — none while its stream is on, riskReactMs while its
//      gun is aimed (fired within aimHoldMs), acquireMs when it is not — with
//      its live bloom and cadence (sdExposureRisk); and the chance the unit's
//      own rounds land in the same window (sdOwnHitChance). An attack is
//      taken when the deaths it costs to land one hit stay under riskCap; a
//      route, when its death chance does. One cap.
//   3. THE PLAN: hidden with nothing under way, the unit prices THE ENGAGE
//      RUN (a straight run across the line through a firing point to a
//      hidden end), THE STAND PEEK (a leg to a firing point — the dodge when
//      the point is one step away — the window, the way back), and a
//      RELOCATION (a hidden cell by a priced route: closer while beyond the
//      reach, a line-capable cell inside it, else any cell nearer), takes
//      the cheapest under the cap. Every option refused, it asks what it is
//      waiting for: priced once more with what time brings back — the gun
//      gone quiet, the dodge in hand, the magazine and the tank full, the
//      target's immunity over — an option under the cap makes the plan THE
//      WAIT for it; none makes it THE APPROACH: the pathfinder's route to
//      the enemy, taken unpriced until a line opens or a cheaper plan
//      appears. A route under way is priced against the attacks at the same
//      cadence. Caught exposed with no plan, the plan is THE REACTION: the
//      nearest hidden cell.
//   4. THE LEGS: hidden, along the route; exposed, THE CROSSING LEGS: the
//      dodge across the line when it is in hand, then the sprint on the kept
//      side leaning reactDriftDeg toward the goal, the side flipped by a wall
//      alone (the room test, or physics' note of the face it was pushed out
//      of). A peek's window runs across the line away from its cover and
//      ends the tick its way out would cost the cap. THE WAIT paces its
//      hidden cell inside a leash, every step hidden by the same test. The
//      trigger is open whenever an eye sees the unit (botSDFire).
//
// THE HOST INTERFACE (sdBrainTick(h)):
//   now, SD (the knobs), me (the unit's state: boost, hp, ammo, step clocks,
//   the botSD* scratch), pos {x,y,z} (the body), unit, vel, grounded, wall
//   ({x,z}: the outward normal of the face physics pushed the body out of
//   last tick; null when it touched none),
//   opp {id, pos, hp, unit, invulnerableUntil}, enemies [{id, pos, vel,
//   unit, lastFireAt, bloom, hp, ammo, reloadingUntil, log}],
//   obstacles, grid, clear(p0, p1), eyeUp (a unit's muzzle above its
//   position), muzzleH (a cell's muzzle above its floor + GROUND_BASE_Y),
//   dist, sideX, sideZ, myFloorY, myShotY, avoid {rx, rz}, avoidMag,
//   playerHasLoS, groundHeightAt(x, z, fallback), startStep(dx, dz),
//   startJump(), searchSlot() (claims this tick's one route search),
//   deadline() (the search's CPU budget), tape(row) or null.
//   The order back: coverMove {hold, hide, dash, mx, mz, jump, jx, jz};
//   the trigger: me.botSDFire.
import { walkSegmentBlocked, unitOverlapsObstacle, segmentHitsObstacle, projectileHitsSurface, obstaclesNearSegment } from './physics.js';
import { findHiddenSpot, findPathOnGrid, coverDistanceAt } from './navgrid.js';
import { STEP_BOOST_COST, STEP_DURATION_MS, STEP_DISTANCE, GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, TICK_RATE_MS, PROJECTILE_MUZZLE_Y_OFFSET, HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, BOOST_DASH_DRAIN_PER_TICK, SHOTGUN_PATTERN, SHOTGUN_CLUSTER_SPREAD_DISTANCE } from './constants.js';

// ===================== THE MODELS =====================
// Fraction of a uniform disc of radius c (a cone's footprint at the target's
// range) that lies inside the target's HIT VOLUME when the target has moved
// s sideways during the flight: the chance ONE round aimed at where the
// target WAS still lands. The volume is the sim's capsule (projectiles.js):
// a stadium of half-width R with a straight half-height H and round caps.
// The overlap is integrated in `n` lateral slices; the shooter aims at the
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

// VOLLEY (the shotguns, spreadCount > 1): a blast is not a cone that thins
// with distance — a fixed 8-slot pattern (SHOTGUN_PATTERN, stretched by the
// gun's volleyStretchX) that opens over SHOTGUN_CLUSTER_SPREAD_DISTANCE and
// then keeps its size, every pellet lethal at 1 HP. A blast lands when ANY
// slot falls on the capsule after the no-lead drift `s`: the share of the
// per-shot rotations that do. Cached on a 5 u / 0.25 u grid.
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

// Chance of dying while exposed to `threat` for T ms at distance d, moving
// with lateral fraction `lat` (of `speed`, u/s) across its line. No shot in
// this game leads its target: every round is aimed at the position of the
// moment, so a body moving across the line is missed by the drift `s` it
// makes during the round's flight. The shooter's first round comes `react`
// ms after the line opens plus the flight — 0 when its stream is already on
// the unit (then the first hotEdgeMs of rounds were aimed at the edge, no
// drift credit for them) — and every shotMs after; the cone is the base
// spread plus the live `bloom`, widened by each round up to the cap.
// `elapsed` ms of the exposure are already spent (a reaction consumed).
export function sdExposureRisk(threat, SD, d, lat, T, elapsed = 0, speed = SD.riskSprint, bloom = (threat.bloom ?? threat.state?.bloom ?? 0), react = SD.riskReactMs) {
  const u = threat.unit ?? {};
  const base = u.spreadAngle ?? 0.02, pv = u.projectileSpeed ?? 600;
  const volley = (u.spreadCount ?? 1) > 1;
  const streaming = react <= 0;
  const edgeMs = streaming ? SD.hotEdgeMs : 0;
  const cap = Math.max(base, u.bloomCap ?? base), perShot = u.bloomPerShot ?? 0;
  const sa0 = Math.min(cap, base + Math.max(0, bloom));
  const shotMs = Math.max(SD.riskShotMs, u.fireCooldownMs ?? 0);
  const s = speed * lat * (d / pv);
  const first = streaming ? 0 : react + (d / pv) * 1000;
  const before = Math.max(0, elapsed - first) / shotMs;   // rounds already fired in this exposure: their bloom is on the cone
  const shots = Math.max(0, elapsed + T - first) / shotMs - before;
  let survive = 1;
  for (let k = 0, left = shots; left > 0; k += 1, left -= 1) {
    const n = Math.floor(before) + k;
    const sa = Math.min(cap, sa0 + n * perShot);
    const fireAt = first + n * shotMs;
    const sK = fireAt < edgeMs ? 0 : s;
    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, sK);
    if (volley) p = Math.max(p, sdVolleyHitFrac(u, d, sK));
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}

// THE UNIT'S OWN SIDE: the chance that at least one of `me`'s rounds lands
// on `threat` inside a window of T ms at distance d — the same capsule
// arithmetic from the other side: the unit's cone plus its live bloom, its
// cadence, its round's flight, and the threat's drift across the line
// during that flight (its live velocity, walking at the least — a sprayer
// standing this instant will not stand for the shot). A volley gun lands
// by its pattern. The first round goes the tick the line opens.
export function sdOwnHitChance(me, threat, d, T, SD) {
  const u = me.unit ?? {};
  const pv = u.projectileSpeed ?? 600;
  const base = u.spreadAngle ?? 0.02, cap = Math.max(base, u.bloomCap ?? base), perShot = u.bloomPerShot ?? 0;
  const sa0 = Math.min(cap, base + Math.max(0, me.bloom ?? me.state?.bloom ?? 0));
  const shotMs = Math.max(SD.riskShotMs, u.fireCooldownMs ?? 0);
  const tv = threat.vel ?? threat.state?.vel ?? null;
  const vx = tv?.x ?? 0, vz = tv?.z ?? 0;
  const lx = threat.pos.x - me.pos.x, lz = threat.pos.z - me.pos.z, ll = Math.hypot(lx, lz) || 1;
  const latSpeed = Math.max(threat.unit?.walkSpeed ?? 12, Math.abs(vx * lz - vz * lx) / ll);
  const s = latSpeed * (d / pv);
  const first = (d / pv) * 1000;
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
// on a target that stands still (the cone's footprint fits the hit radius).
// A volley gun's pattern is not a cone: its lock range stands in. A unit's
// own set reach (UNIT_DATA sdReach) stands in for the cone's.
export function sdOwnReach(unit) {
  const u = unit ?? {};
  if (u.sdReach != null) return u.sdReach;
  if ((u.spreadCount ?? 1) > 1) return u.lockRange ?? 50;
  const sa = u.spreadAngle ?? 0.02;
  return sa > 1e-6 ? HIT_RADIUS_NORMAL / Math.tan(sa / 2) : 200;
}

// The death chance of a route from (sx, sz) through `path` (navgrid points,
// y = floor), sub-divided into ~4 u pieces; a piece is exposed when
// `seen(x, z, floorY)` says so (the brain's silhouette test); each
// contiguous exposed run shares one reaction (`react`, see
// sdExposureRisk). Returns { risk, first, exposedLen } with the first
// exposed piece's midpoint (the avoid mark on rejection) and the exposed
// length in u.
export function sdRouteRisk(path, sx, sz, floorY, seen, threat, SD, speed = SD.riskSprint, react = SD.riskReactMs) {
  let survive = 1, first = null, elapsed = 0, inRun = false, exposedLen = 0, tAcc = 0;
  let px = sx, pz = sz;
  for (let i = 0; i < path.length; i += 1) {
    const q = path[i];
    const len = Math.hypot(q.x - px, q.z - pz);
    if (len < 0.01) { px = q.x; pz = q.z; continue; }
    const dx = (q.x - px) / len, dz = (q.z - pz) / len;
    const nSub = Math.max(1, Math.ceil(len / 4));
    for (let k = 0; k < nSub; k += 1) {
      const f = (k + 0.5) / nSub;
      const mid = { x: px + (q.x - px) * f, z: pz + (q.z - pz) * f };
      const T = (len / nSub) / speed * 1000;
      const exposed = seen(mid.x, mid.z, q.y ?? floorY, tAcc + T / 2);   // (the piece's moment on the way)
      tAcc += T;
      if (!exposed) { inRun = false; elapsed = 0; continue; }
      exposedLen += len / nSub;
      if (!first) first = { x: mid.x, z: mid.z };
      if (!inRun) { inRun = true; elapsed = 0; }
      let lx = threat.pos.x - mid.x, lz = threat.pos.z - mid.z;
      const d = Math.hypot(lx, lz) || 1; lx /= d; lz /= d;
      const lat = Math.abs(dx * lz - dz * lx);
      survive *= 1 - sdExposureRisk(threat, SD, d, lat, T, elapsed, speed, undefined, react);
      elapsed += T;
    }
    px = q.x; pz = q.z;
  }
  return { risk: 1 - survive, first, exposedLen };
}

// ===================== THE KNOBS =====================
// Every number is a physical quantity of the game or of a human, or the one
// cap. None is a rule of its own.
export const BOT_SD = {
  // THE ENEMY'S HAND
  riskReactMs: 250,       // a human's reaction: the first round comes this long after a line opens, when the gun is aimed at the spot
  acquireMs: 600,         // a human's acquisition: the first round when the gun is NOT aimed there (the turn and the aim)
  aimHoldMs: 2000,        // a gun that fired within this long is aimed (the attention holds on the last target)
  hotMs: 200,             // the STREAM is on: the gun fired within this long, within its round's flight to the unit, or within hotCycles of its own cycle
  hotCycles: 2,
  hotEdgeMs: 200,         //   the stream's first rounds after the line opens are still on the edge: no drift credit for them
  riskShotMs: 60,         // the least shot interval the price assumes of any gun
  // THE UNIT'S BODY
  riskSprint: 16.8,       // the sprint the price moves the unit at when the unit data has none
  sprintFactor: 2.5,      //   the body's sprint with the dash momentum, measured 24-32 u/s, over the unit's sprintSpeed (11.76)
  predictS: 0.5,          // an eye is also where the enemy's run takes it this far ahead
  dashFloor: 8,           // an exposed leg sprints down to this much boost
  boostReserve: 110,      // a hidden leg sprints above this and walks below it: a dodge (48) and a jump (48) stay in hand
  acrossMin: 0.7,         // ACROSS THE LINE: a heading's lateral fraction at least this much (45 deg is 0.71)
  waitLeash: 6,           // THE WAIT paces its hidden cell within this of where the wait began
  paceSpeed: 0.4,         //   at this share of the walk: a human shifting in cover, not a march
  // THE ONE CAP
  riskCap: 0.15,          // the death chance accepted for a planned route, and the deaths-per-hit accepted for an attack
  // THE GROUND
  goalCoverMax: 4,        // a goal cell stands within this of muzzle-blocking cover; open ground is never a goal
  openDist: 6,            //   a route cell farther than this from cover is open ground ...
  openPenalty: 2,         //   ... and costs this much extra walking in the search
  exposurePenalty: 8,     // a route cell some eye sees costs this much extra, times (1 + alongWeight x along^2) when stepped along the threat's line
  alongWeight: 3,
  avoidR: 3.5,            // a mark (a rejected stretch, a waypoint a wall refused) keeps routes this far off ...
  avoidMs: 6000,          // ... for this long
  hopGainMin: 10,         // a closing hop gains at least this toward the enemy ...
  hopGainMax: 45,         // ... and at most this (0.3 x the distance between)
  shiftMin: 8,            // a relocation inside the reach moves at least this far
  bandSlack: 10,          // inside the reach plus this the unit attacks from where it is
  // THE ATTACKS
  firePointMargin: 1,     // a FIRING POINT sees the target's muzzle from itself and from this far either side across the line
  onPointU: 0.3,          // a peek leg has arrived within this of its point
  peekLegMax: 10,         // the stand peek's leg is scanned out to this
  crossRunMax: 16,        // the engage run's end is scanned to this beyond the dodge's length
  jumpReach: 7,           // a ledge waypoint is vaulted from within this
  aheadProbe: 8,          // a hidden leg sprints when this much of it ahead is exposed
  // THE CROSSING LEGS
  reactRoom: 4,           // a crossing heading needs this much walkable room
  reactSideProbe: 14,     // the side with the longer run (to this) is taken first
  reactDriftDeg: 45,      // the crossing leans this far toward its goal when that heading has room
  // THE CADENCE (the search slot, the CPU)
  searchMs: 250,          // a plan is priced again this often while nothing was taken
  failRetryMs: 500,       // every option refused: the next pricing this much later (hidden)
  exposedRetryMs: 150,    //   ... and this much later while exposed (the escape search)
  nearPops: 800,          // the route search's Dijkstra budget, near then far
  farPops: 3000,
  firePollMs: 32,         // the host's line poll while the Sudden Death brain drives
};

// The muzzle-line test from the projectile rules: walls block (fences a
// round passes do not), surfaces block — the server's `clear`.
export const makeMuzzleClear = (obstacles, surfaces) => (p0, p1) => {
  const cand = obstaclesNearSegment(obstacles, p0, p1);
  for (let i = 0; i < cand.length; i += 1) {
    const o = cand[i];
    if (o.noProjectile) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  return !(surfaces && projectileHitsSurface(p0, p1, surfaces));
};

const SILHOUETTE_TOP = HIT_HALF_HEIGHT + HIT_RADIUS_NORMAL;   // the capsule's top above its centre

// ===================== THE TICK =====================
export function sdBrainTick(host) {
  const { now, SD, me, opp, obstacles, dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag } = host;
  const mePos = host.pos, meUnit = host.unit ?? {}, meVel = host.vel, EYE_UP = host.eyeUp, MUZZLE_H = host.muzzleH;
  const sdClear = host.clear;
  const sdGrid = host.grid;
  let coverMove = null;

  // ===================== 1. HIDDEN =====================
  const sdEnemies = host.enemies.slice();
  sdEnemies.sort((a, b) => Math.hypot(a.pos.x - mePos.x, a.pos.z - mePos.z) - Math.hypot(b.pos.x - mePos.x, b.pos.z - mePos.z));
  // THE EYES of a point the body reaches tMs from now: each enemy where it
  // stands, where its run takes it by then (predictS at the most), and
  // where it fired from while that round is still in the air at that time.
  const sdSprint = (meUnit.sprintSpeed ?? BOOST_MOVE_SPEED) * SD.sprintFactor;
  const logs = (me.botSDShotLogs ??= {});
  const sdShotLogs = [];
  for (let k = 0; k < sdEnemies.length; k += 1) {
    const f = sdEnemies[k];
    const last = f.lastFireAt ?? -1e9;
    const key = f.id?.id ?? f.id ?? k;
    const log = logs[key] ?? (logs[key] = { at: -1e9, x: 0, y: 0, z: 0 });
    if (last > log.at) { log.at = last; log.x = f.pos.x; log.y = f.pos.y; log.z = f.pos.z; }
    sdShotLogs.push(log);
  }
  const sdEyesAt = (x, z, tMs) => {
    const eyes = [];
    const horizon = Math.min(SD.predictS, Math.max(0, tMs) / 1000);
    for (let k = 0; k < sdEnemies.length; k += 1) {
      const f = sdEnemies[k];
      eyes.push({ x: f.pos.x, y: f.pos.y + EYE_UP, z: f.pos.z, k });
      const vx = f.vel?.x ?? 0, vz = f.vel?.z ?? 0;
      if (horizon > 0 && Math.hypot(vx, vz) > 1) eyes.push({ x: f.pos.x + vx * horizon, y: f.pos.y + EYE_UP, z: f.pos.z + vz * horizon, k });
      const log = sdShotLogs[k];
      const flight = Math.hypot(log.x - x, log.z - z) / (f.unit?.projectileSpeed ?? 600) * 1000;
      if (log.at + flight > now + tMs && Math.hypot(log.x - f.pos.x, log.z - f.pos.z) > 1) eyes.push({ x: log.x, y: log.y + EYE_UP, z: log.z, k });
    }
    return eyes;
  };
  const sdEyes = sdEyesAt(mePos.x, mePos.z, 0);   // (the eyes of this moment, for the route search's cost shaping)
  // THE SILHOUETTE at (x, z) on floor fy (the muzzle line's height is the
  // capsule's centre), reached tMs from now (the sprint there, unless
  // given): the capsule's outline as the eye sees it — the front toward the
  // eye, both shoulders across the eye's line, the four shoulder corners
  // where the straight part meets the caps, the top. Hidden when no eye of
  // that moment reaches any of them. Returns the eye that sees it, or null.
  const sdSeenAt = (x, z, fy, tMs = Math.hypot(x - mePos.x, z - mePos.z) / sdSprint * 1000) => {
    const y = fy + GROUND_BASE_Y + MUZZLE_H;
    const eyes = sdEyesAt(x, z, tMs);
    for (let i = 0; i < eyes.length; i += 1) {
      const eye = eyes[i];
      let ux = eye.x - x, uz = eye.z - z;
      const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const R = HIT_RADIUS_NORMAL, H = HIT_HALF_HEIGHT;
      const lx = x - uz * R, lz = z + ux * R, rx = x + uz * R, rz = z - ux * R;
      if (sdClear(eye, { x: x + ux * R, y, z: z + uz * R })) return eye;
      if (sdClear(eye, { x: lx, y, z: lz })) return eye;
      if (sdClear(eye, { x: rx, y, z: rz })) return eye;
      if (sdClear(eye, { x, y: y + SILHOUETTE_TOP, z })) return eye;
      if (sdClear(eye, { x: lx, y: y + H, z: lz })) return eye;
      if (sdClear(eye, { x: rx, y: y + H, z: rz })) return eye;
      if (sdClear(eye, { x: lx, y: y - H, z: lz })) return eye;
      if (sdClear(eye, { x: rx, y: y - H, z: rz })) return eye;
    }
    return null;
  };
  const sdHiddenAt = (x, z, fy, tMs) => sdSeenAt(x, z, fy, tMs) == null;
  const sdSeenBy = sdSeenAt(mePos.x, mePos.z, myFloorY, 0);
  const sdHidden = sdSeenBy == null;
  const sdThreat = sdSeenBy ? sdEnemies[sdSeenBy.k] : (sdEnemies[0] ?? opp);
  const sdThreatDist = Math.hypot(sdThreat.pos.x - mePos.x, sdThreat.pos.z - mePos.z);
  const sdWall = host.wall ?? null;
  const sdIntoWall = (hx, hz) => !!sdWall && hx * sdWall.x + hz * sdWall.z < 0;
  if (sdWall) me.botSDWallTicks = (me.botSDWallTicks ?? 0) + 1;
  if (sdHidden) me.botSDLastHidden = { x: mePos.x, z: mePos.z };
  else me.botSDSeenAt = now;
  // THE ENEMY'S HAND, read off its shots: how long after a line opened on
  // the unit the threat's trigger followed — the median of the last five
  // exposures it fired into. A bot answers within a tick, a human in a
  // quarter second or more; the price takes the faster of this reading
  // and the human prior.
  if (!sdHidden && me.botSDExposedAt != null && !me.botSDReactSampled && (sdThreat.lastFireAt ?? -1e9) >= me.botSDExposedAt) {
    me.botSDReactSampled = true;
    const s = (me.botSDReactSamples ??= []);
    s.push(sdThreat.lastFireAt - me.botSDExposedAt);
    if (s.length > 5) s.shift();
  }
  const sdReactRead = (() => { const s = me.botSDReactSamples; if (!s || !s.length) return Infinity; const o = s.slice().sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; })();
  // THE GUN'S STATE: streaming (its rounds are on the unit's spot now),
  // aimed (it fired within aimHoldMs), or cold.
  const sdGunReact = (f) => {
    const u = f.unit ?? {};
    const last = f.lastFireAt ?? -1e9;
    const flight = Math.hypot(f.pos.x - mePos.x, f.pos.z - mePos.z) / (u.projectileSpeed ?? 600) * 1000;
    if (last > now - Math.max(SD.hotMs, flight, (u.fireCooldownMs ?? 0) * SD.hotCycles)) return 0;
    return Math.min(last > now - SD.aimHoldMs ? SD.riskReactMs : SD.acquireMs, sdReactRead);
  };
  const sdReact = sdGunReact(sdThreat);
  // THE BODY
  const sdDrainPerS = (meUnit.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK) * (1000 / TICK_RATE_MS);
  const sdSprintCost = (d) => d / sdSprint * sdDrainPerS;
  const sdStepCost = meUnit.stepBoostCost ?? STEP_BOOST_COST;
  const stepD = meUnit.stepDistance ?? STEP_DISTANCE;
  const stepMs = meUnit.stepDurationMs ?? STEP_DURATION_MS;
  const sdDodgeReady = now >= (me.stepCooldownUntil ?? 0) && now > (me.stepUntil ?? 0);
  const sdStepping = now <= (me.stepUntil || 0);
  const sdMyEmpty = meUnit.magCapacity != null && me.ammo <= 0;
  const sdReach = sdOwnReach(meUnit);
  const sdPerp = (s) => { const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z, ll = Math.hypot(lx, lz) || 1; return { x: -lz / ll * s, z: lx / ll * s }; };
  const sdLateral = (hx, hz) => { const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z, ll = Math.hypot(lx, lz) || 1; return Math.abs(hx * lz - hz * lx) / ll; };
  // (room for the BODY along a straight cut on floor height y, sampled every ~0.6 u, with the physics' own radius)
  const sdLegFitsAt = (x0, z0, x1, z1, y) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6));
    for (let k = 1; k <= n; k += 1) {
      const f = k / n;
      if (unitOverlapsObstacle(x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f, obstacles)) return false;
    }
    return true;
  };
  const sdLegFits = (x0, z0, x1, z1) => sdLegFitsAt(x0, z0, x1, z1, mePos.y);
  // THE FIRING POINT: a muzzle at (x, y, z) sees the target's muzzle, and so
  // does a muzzle firePointMargin u either side of it across the line.
  const sdOppMuzzle = { x: opp.pos.x, y: opp.pos.y + EYE_UP, z: opp.pos.z };
  const sdFiringPoint = (x, z, y) => {
    if (!sdClear({ x, y, z }, sdOppMuzzle)) return false;
    let nx = opp.pos.z - z, nz = x - opp.pos.x;
    const nl = Math.hypot(nx, nz) || 1;
    nx = nx / nl * SD.firePointMargin; nz = nz / nl * SD.firePointMargin;
    return sdClear({ x: x + nx, y, z: z + nz }, sdOppMuzzle) && sdClear({ x: x - nx, y, z: z - nz }, sdOppMuzzle);
  };
  // THE LINE: the unit's own muzzle sees the target's muzzle from where it stands.
  const sdLine = sdClear({ x: mePos.x, y: myShotY, z: mePos.z }, sdOppMuzzle);
  // THE FIRING LEGS from (x, z) on floor fy — the stand peek's geometry, and
  // what makes a cell line-capable: for each of 8 headings across the line
  // from there (acrossMin), the dodge's landing when it is a firing point
  // and the dodge is in hand, else the first firing point every 2 u out to
  // peekLegMax whose dodge back (stepD through the origin) lands walkable
  // and hidden.
  const sdFiringLegs = (x, z, fy, dodgeOk) => {
    const by = fy + GROUND_BASE_Y, my = by + MUZZLE_H;
    let lx = opp.pos.x - x, lz = opp.pos.z - z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    const out = [];
    for (let k = 0; k < 8; k += 1) {
      const ang = k * Math.PI / 4, cx = Math.cos(ang), cz = Math.sin(ang);
      if (Math.abs(cx * lz - cz * lx) < SD.acrossMin) continue;
      if (dodgeOk) {
        const px = x + cx * stepD, pz = z + cz * stepD;
        if (sdLegFitsAt(x, z, px, pz, by) && sdFiringPoint(px, pz, my)) { out.push({ x: px, z: pz, L: stepD, cx, cz, dodge: true }); continue; }
      }
      for (let L = 2; L <= SD.peekLegMax; L += 2) {
        const px = x + cx * L, pz = z + cz * L;
        if (!sdLegFitsAt(x + cx * (L - 2), z + cz * (L - 2), px, pz, by)) break;
        if (!sdFiringPoint(px, pz, my)) continue;
        const bx = px - cx * stepD, bz = pz - cz * stepD;
        if (sdLegFitsAt(px, pz, bx, bz, by) && sdHiddenAt(bx, bz, fy)) out.push({ x: px, z: pz, L, cx, cz, dodge: false });
        break;
      }
    }
    return out;
  };
  const sdSeenRoute = (x, z, fy, tMs) => sdSeenAt(x, z, fy, tMs) != null;
  // THE MARKS: a rejected route's first exposed stretch, a waypoint a wall
  // refused — routes keep off them for avoidMs.
  if (me.botSDAvoid && me.botSDAvoid.length) me.botSDAvoid = me.botSDAvoid.filter((a) => now < a.until);
  const sdAvoid = (me.botSDAvoid && me.botSDAvoid.length) ? me.botSDAvoid : null;
  const sdMark = (x, z) => {
    if (!me.botSDAvoid) me.botSDAvoid = [];
    for (const a of me.botSDAvoid) if (Math.hypot(a.x - x, a.z - z) <= a.r) { a.until = now + SD.avoidMs; return; }
    me.botSDAvoid.push({ x, z, r: SD.avoidR, until: now + SD.avoidMs });
  };

  // ===================== 2. THE PRICE =====================
  const selfRef = { pos: mePos, unit: meUnit, bloom: me.bloom ?? 0 };
  // THE CONDITIONS a price is read under: the real ones, or what time
  // brings back (THE WAIT's question).
  const sdReal = { react: sdReact, dodge: sdDodgeReady && me.boost >= sdStepCost, ammo: !sdMyEmpty, tank: true, immune: now < (opp.invulnerableUntil ?? 0) };
  const sdRestored = { react: SD.acquireMs, dodge: true, ammo: true, tank: false, immune: false };
  // (the death chance of standing T ms at distance d, lat across the line, elapsed ms already spent, under the enemy's reaction `react`)
  const sdPriceAs = (T, d, lat, elapsed, react) => sdExposureRisk(sdThreat, SD, d, lat, T, elapsed, sdSprint, undefined, react);
  const sdPrice = (T, d = sdThreatDist, lat = 0, elapsed = 0) => sdPriceAs(T, d, lat, elapsed, sdReact);
  // (the chance the unit lands a hit inside T ms at distance d; none without rounds, none on an immune target)
  const sdOwnAs = (T, d, as) => (!as.ammo || as.immune) ? 0 : sdOwnHitChance(selfRef, sdThreat, d, T, SD);
  const sdOwn = (T, d = sdThreatDist) => sdOwnAs(T, d, sdReal);
  // THE TRADE: the deaths it takes to land one hit — each exposure pe dead,
  // 1 / pm of them needed. Under the cap, the attack is worth it.
  const sdDeathsPerHit = (pe, pm) => (pm <= 0 ? 1 : pe <= 0 ? 0 : 1 - Math.pow(1 - pe, 1 / Math.max(0.02, pm)));
  // THE WAY OUT: the exposed time until hidden — one tick when the dodge is
  // in hand (its i-frames carry the body), else the sprint back.
  const sdExitMs = (back) => (sdDodgeReady && me.boost >= sdStepCost) ? TICK_RATE_MS : back / sdSprint * 1000;
  // THE TANK for a planned exposure: the floor, the dodge, the sprint there and back.
  const sdNeed = (legLen) => SD.dashFloor + sdStepCost + sdSprintCost(legLen * 2);

  // ===================== 3. THE STATE =====================
  // The exposure clock (the price's `elapsed`); the trigger.
  if (!sdHidden) { if (me.botSDExposedAt == null) { me.botSDExposedAt = now; me.botSDReactSampled = false; me.botSDExposures = (me.botSDExposures ?? 0) + 1; if (!meUnit.sniperCharge) me.nextFireAt = Math.min(me.nextFireAt ?? now, now); } }
  else me.botSDExposedAt = null;
  const sdExposedFor = sdHidden ? 0 : now - me.botSDExposedAt;
  const sdOpened = !sdHidden && me.botSDExposedAt === now;   // (the tick the line opened: the dodge is the opening move of every exposure)
  me.botSDFire = !sdHidden;
  // THE PLAN under way: me.botSDPlan = { kind, ... }
  //   route  : { kind: 'close'|'flank'|'approach'|'escape', path, idx, goal }
  //   engage : { kind: 'engage', end, side, at, exposed }
  //   peek   : { kind: 'peek', point, origin, leg, dodge, at, armed }
  //   cross  : { kind: 'react'|'retreat', goal, side, at }   (the crossing legs; THE REACTION, THE RETREAT)
  let plan = me.botSDPlan ?? null;
  const sdDrop = () => { me.botSDPlan = null; plan = null; me.botSDReact = null; };
  const sdTake = (p) => {
    me.botSDPlan = p; plan = p;
    me.botSDPlans ??= {}; me.botSDPlans[p.kind] = (me.botSDPlans[p.kind] ?? 0) + 1;
    me.botSDSearchStage = 0; me.botSDSearchJob = null;
    me.botSDSearchAt = now + SD.searchMs;
  };
  // THE CROSSING LEGS' state (kept across ticks: the side, the goal) — the
  // probes read it as botSDReact
  const sdCross = (kind, goal, side) => { const c = { kind, goal: goal ?? null, side, at: now, moved: false }; me.botSDReact = c; return c; };
  // Arrivals and ends.
  if (plan) {
    if (plan.kind === 'close' || plan.kind === 'flank' || plan.kind === 'nearer') {
      const g = plan.goal;
      // (ON the goal — the cell the silhouette was tested at — the plan is over; the last stretch is walked)
      if (Math.hypot(g.x - mePos.x, g.z - mePos.z) < SD.onPointU) { sdDrop(); me.botSDSearchAt = now; }
      else if (!sdHiddenAt(g.x, g.z, g.y ?? myFloorY)) { sdDrop(); me.botSDSearchAt = now; }   // (the enemy moved: the goal shows — priced again)
      else if (sdHidden) me.botSDReact = null;   // (a route's priced exposure is over: the next one picks its side afresh)
    } else if (plan.kind === 'approach') {
      // THE APPROACH ends the tick a line opens either way: THE REACTION takes it from there
      if (!sdHidden || sdLine) { sdDrop(); me.botSDSearchAt = now; }
    } else if (plan.kind === 'wait') {
      if (!sdHidden) { sdDrop(); me.botSDSearchAt = now; }   // (the enemy came: THE REACTION)
    } else if (plan.kind === 'engage') {
      if (!sdHidden) plan.exposed = true;
      const atEnd = Math.hypot(plan.end.x - mePos.x, plan.end.z - mePos.z) < 2;
      if ((sdHidden && plan.exposed && !sdStepping) || atEnd) { sdDrop(); me.botSDSearchAt = now; }
    } else if (plan.kind === 'peek') {
      const left = Math.hypot(plan.point.x - mePos.x, plan.point.z - mePos.z);
      // (THE WINDOW opens on the LINE — the gun's, not the enemy's first sight of a shoulder — or on the point; its legs run across the line away from the origin)
      if (!plan.armed && !sdStepping && (left < SD.onPointU || sdLine)) {
        plan.armed = true; plan.at = now; me.botSDWindows = (me.botSDWindows ?? 0) + 1;
        const p1 = sdPerp(1);
        plan.side = (plan.leg.x * p1.x + plan.leg.z * p1.z) >= 0 ? 1 : -1;
      }
      if (plan.armed && !sdStepping) {
        // THE WINDOW'S END: the way out costs the cap, the magazine is
        // empty, the line is gone (the enemy moved) or the tank is at the
        // floor — THE RETREAT to the origin, the dodge first when in hand.
        const back = Math.hypot(plan.origin.x - mePos.x, plan.origin.z - mePos.z);
        const exitPrice = sdPrice(sdExitMs(back), sdThreatDist, 1, sdExposedFor);
        const lineGone = !sdLine && now - plan.at > TICK_RATE_MS * 2;
        if (exitPrice >= SD.riskCap || sdMyEmpty || lineGone || me.boost <= SD.dashFloor) {
          me.botSDWindowMs = (me.botSDWindowMs ?? 0) + (now - plan.at);
          const o = plan.origin;
          const p1 = sdPerp(1);
          const side = ((o.x - mePos.x) * p1.x + (o.z - mePos.z) * p1.z) >= 0 ? 1 : -1;
          sdDrop();
          sdTake({ kind: 'retreat', goal: { x: o.x, z: o.z, y: myFloorY } });
          sdCross('retreat', plan.goal, side);
          if (back > 1 && sdDodgeReady && me.boost >= sdStepCost && host.startStep((o.x - mePos.x) / back, (o.z - mePos.z) / back)) me.botSDDodges = (me.botSDDodges ?? 0) + 1;
        }
      }
    } else if (plan.kind === 'retreat' || plan.kind === 'react') {
      const g = plan.goal;
      if ((sdHidden && !sdStepping) || (g && Math.hypot(g.x - mePos.x, g.z - mePos.z) < 2)) { sdDrop(); me.botSDSearchAt = now; }
    }
  }
  // Caught with no plan (or a hidden plan just dropped): THE REACTION — the
  // dodge across the line on the side with the longer run, then the
  // crossing legs to the nearest hidden cell (found by the escape search
  // below; until then, across the line).
  if (!sdHidden && !plan) {
    const runRoom = (cx, cz) => { let room = 0; for (const L of [SD.reactRoom, SD.reactSideProbe * 0.5, SD.reactSideProbe]) { if (!sdLegFits(mePos.x, mePos.z, mePos.x + cx * L, mePos.z + cz * L)) break; room = L; } return room; };
    const rooms = [1, -1].map((s) => { const p = sdPerp(s); return sdIntoWall(p.x, p.z) ? -1 : runRoom(p.x, p.z); });
    let side;
    if (rooms[0] !== rooms[1]) side = rooms[0] > rooms[1] ? 1 : -1;
    else { const lh = me.botSDLastHidden, p = sdPerp(1); side = (lh && (lh.x - mePos.x) * p.x + (lh.z - mePos.z) * p.z < 0) ? -1 : 1; }
    sdTake({ kind: 'react', goal: null });
    sdCross('react', null, side);
    me.botSDReacts = (me.botSDReacts ?? 0) + 1;
    me.botSDSearchAt = now;
    if (sdDodgeReady && me.boost >= sdStepCost + SD.dashFloor && Math.max(rooms[0], rooms[1]) > 0) {
      const p = sdPerp(side);
      if (host.startStep(p.x, p.z)) me.botSDDodges = (me.botSDDodges ?? 0) + 1;
    }
  }

  // ===================== 4. THE PLAN =====================
  const inReach = dist <= sdReach + SD.bandSlack;
  // THE ATTACKS from here, priced under the conditions `as`: THE ENGAGE RUN
  // (16 straight headings across the line; along each, every 2 u out to the
  // dodge's length plus crossRunMax, the body-wide walkable run that passes
  // a firing point and ends hidden, next to cover, inside the reach — priced
  // as a route against the hit its crossing lands) and THE STAND PEEK (the
  // firing legs from here; the window runs from the point; the way back is
  // the dodge after a sprint leg, the sprint after a dodge leg — priced as
  // the leg out plus the window it takes to land the first round, against
  // the way out). Returns the cheapest under the cap, or null.
  const sdAttacks = (as) => {
    if (!as.dodge) return null;   // (A PLANNED EXPOSURE STARTS WITH ITS WAY OUT IN HAND: the dodge — the leg out of a close peek, the way back of the others)
    let best = null;
    const consider = (dph, len, take) => { if (dph <= SD.riskCap && (!best || dph < best.dph || (dph === best.dph && len < best.len))) best = { dph, len, take }; };
    for (let k = 0; k < 16; k += 1) {
      const ang = k * Math.PI / 8 + Math.random() * 0.2;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      if (sdLateral(cx, cz) < SD.acrossMin) continue;
      let crossed = false;
      for (let L = 2; L <= stepD + SD.crossRunMax; L += 2) {
        const ex = mePos.x + cx * L, ez = mePos.z + cz * L;
        if (!sdLegFits(mePos.x + cx * (L - 2), mePos.z + cz * (L - 2), ex, ez)) break;
        if (!crossed) { if (sdFiringPoint(ex, ez, myShotY)) crossed = true; continue; }
        if (L < stepD) continue;
        if (Math.hypot(ex - opp.pos.x, ez - opp.pos.z) > sdReach + SD.bandSlack) continue;
        if (!sdHiddenAt(ex, ez, myFloorY)) continue;
        if (coverDistanceAt(sdGrid, ex, ez, myFloorY, obstacles) > SD.goalCoverMax) continue;
        if (as.tank && me.boost < sdNeed(L)) break;
        const rr = sdRouteRisk([{ x: ex, z: ez, y: myFloorY }], mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, as.react);
        const T = rr.exposedLen / sdSprint * 1000;
        const dph = sdDeathsPerHit(rr.risk, sdOwnAs(T, Math.hypot(opp.pos.x - (mePos.x + cx * L / 2), opp.pos.z - (mePos.z + cz * L / 2)), as));
        me.botSDLastRisk = rr.risk; me.botSDLastTrade = dph;
        consider(dph, L, () => {
          const p1 = sdPerp(1);
          sdTake({ kind: 'engage', end: { x: ex, z: ez, y: myFloorY }, exposed: false });
          sdCross('engage', { x: ex, z: ez, y: myFloorY }, (cx * p1.x + cz * p1.z) >= 0 ? 1 : -1);
          me.botSDEngages = (me.botSDEngages ?? 0) + 1;
          if (sdDodgeReady && me.boost >= sdStepCost && host.startStep(cx, cz)) me.botSDDodges = (me.botSDDodges ?? 0) + 1;
        });
        break;
      }
    }
    for (const leg of sdFiringLegs(mePos.x, mePos.z, myFloorY, as.dodge)) {
      if (as.tank && me.boost < sdNeed(leg.L)) continue;
      const d = Math.hypot(opp.pos.x - leg.x, opp.pos.z - leg.z);
      const first = d / (meUnit.projectileSpeed ?? 600) * 1000;
      const exit = (leg.dodge || !as.dodge) ? leg.L / sdSprint * 1000 : TICK_RATE_MS;
      const legRisk = leg.dodge ? 0 : sdRouteRisk([{ x: leg.x, z: leg.z, y: myFloorY }], mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, as.react).risk;
      const pe = 1 - (1 - legRisk) * (1 - sdPriceAs(first + exit, d, 0, 0, as.react));
      const dph = sdDeathsPerHit(pe, sdOwnAs(first + Math.max(SD.riskShotMs, meUnit.fireCooldownMs ?? 0), d, as));
      me.botSDLastRisk = pe; me.botSDLastTrade = dph;
      consider(dph, leg.L, () => {
        sdTake({ kind: 'peek', point: { x: leg.x, z: leg.z }, origin: { x: mePos.x, z: mePos.z }, leg: { x: leg.cx, z: leg.cz }, dodge: leg.dodge, at: now, armed: false });
        me.botSDPeeks = (me.botSDPeeks ?? 0) + 1;
        if (leg.dodge) { if (host.startStep(leg.cx, leg.cz)) me.botSDDodges = (me.botSDDodges ?? 0) + 1; me.botSDClosePeeks = (me.botSDClosePeeks ?? 0) + 1; }
      });
    }
    return best;
  };
  // THE APPROACH: the route to the enemy — the pathfinder's as far as the
  // grid goes, then straight onto him where the body fits (he may stand
  // where the grid has no cell: a pocket, a wall's foot).
  const sdApproachRoute = () => {
    const oppFloor = host.groundHeightAt(opp.pos.x, opp.pos.z, opp.pos.y - GROUND_BASE_Y);
    const path = (findPathOnGrid(sdGrid, mePos.x, mePos.z, opp.pos.x, opp.pos.z, myFloorY, oppFloor, obstacles) ?? []).slice();
    const end = path.length ? path[path.length - 1] : { x: mePos.x, z: mePos.z, y: myFloorY };
    if (Math.hypot(opp.pos.x - end.x, opp.pos.z - end.z) > 1 && sdLegFitsAt(end.x, end.z, opp.pos.x, opp.pos.z, (end.y ?? myFloorY) + GROUND_BASE_Y)) path.push({ x: opp.pos.x, z: opp.pos.z, y: oppFloor });
    return path.length ? path : null;
  };
  // Hidden: with nothing under way, with a route under way (the attacks at
  // the cadence; THE APPROACH re-routed as the enemy moves), or waiting
  // (priced again). Exposed on THE REACTION with no goal yet: the escape
  // search. One route search per tick per match (the host's slot).
  const sdOnRoute = !!plan && (plan.kind === 'close' || plan.kind === 'flank' || plan.kind === 'nearer' || plan.kind === 'approach');
  const sdWantPlan = (sdHidden && (!plan || plan.kind === 'wait' || sdOnRoute)) || (!!plan && plan.kind === 'react' && !plan.goal);
  if (sdWantPlan && now >= (me.botSDSearchAt ?? 0)) {
    if (sdOnRoute && plan.kind !== 'approach') {
      // (a hidden route under way: the attacks from here; one under the cap replaces the route — the light scan, no slot)
      const best = inReach ? sdAttacks(sdReal) : null;
      if (best) { sdDrop(); best.take(); } else me.botSDSearchAt = now + SD.searchMs;
    } else if (host.searchSlot()) {
      me.botSDSearches = (me.botSDSearches ?? 0) + 1;
      let taken = false;
      if (sdHidden && inReach) { const best = sdAttacks(sdReal); if (best) { if (plan) sdDrop(); best.take(); taken = true; } }
      if (!taken && plan && plan.kind === 'approach') {
        // (THE APPROACH under way: re-routed to where the enemy is now; no route -> THE WAIT)
        const path = sdApproachRoute();
        if (path) { plan.path = path; plan.idx = 0; plan.goal = path[path.length - 1]; me.botSDSearchAt = now + SD.searchMs; }
        else { sdDrop(); sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); me.botSDSearchAt = now + SD.failRetryMs; }
        taken = true;
      }
      // ---- THE RELOCATION / THE ESCAPE: one route search, by stage ----
      if (!taken) {
        const escape = !sdHidden;
        const gain = Math.min(SD.hopGainMax, Math.max(SD.hopGainMin, dist * 0.3));
        const nearer = (gx, gz) => -Math.hypot(gx - opp.pos.x, gz - opp.pos.z);
        // (THE GOAL hides the whole silhouette — the one test, sdHiddenAt; a flank's goal has a firing leg — the one scan, sdFiringLegs)
        const hiddenGoal = (gx, gz, fy) => sdHiddenAt(gx, gz, fy);
        const flankGoal = (gx, gz, fy) => sdHiddenAt(gx, gz, fy) && sdFiringLegs(gx, gz, fy, true).length > 0;
        let stages;
        if (escape) stages = [{ kind: 'escape', maxPops: SD.nearPops, accept: hiddenGoal }, { kind: 'escape', maxPops: SD.farPops, accept: hiddenGoal }];
        else if (!inReach) stages = [
          { kind: 'close', maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: Math.max(sdReach, dist - gain) }, minDistFrom: { x: mePos.x, z: mePos.z, d: SD.shiftMin }, accept: hiddenGoal, score: nearer, scoreStop: -Math.max(sdReach, dist - gain - 15) }];
        else stages = [
          { kind: 'flank', maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: sdReach + SD.bandSlack }, minDistFrom: { x: mePos.x, z: mePos.z, d: SD.shiftMin }, accept: flankGoal },
          { kind: 'nearer', maxPops: SD.farPops, within: { x: opp.pos.x, z: opp.pos.z, r: Math.max(2, dist - SD.hopGainMin) }, minDistFrom: { x: mePos.x, z: mePos.z, d: SD.shiftMin }, accept: hiddenGoal, score: nearer, scoreStop: -Math.max(2, dist - 15) }];
        const stage = Math.min(me.botSDSearchStage ?? 0, stages.length - 1);
        if (stage === 0 && !me.botSDSearchJob) me.botSDRefusedPath = null;   // (a new cycle: no refused route yet)
        const a = stages[stage];
        const jobKey = `${a.kind}|${stage}|${Math.round(mePos.x)},${Math.round(mePos.z)}`;
        if (!me.botSDSearchJob || me.botSDSearchJob.key !== jobKey) me.botSDSearchJob = { key: jobKey, state: null };
        let found = findHiddenSpot(sdGrid, mePos.x, mePos.z, myFloorY, sdEyes, obstacles, {
          maxPops: a.maxPops, within: a.within ?? null, minDistFrom: a.minDistFrom ?? null, accept: a.accept, eyeHeight: MUZZLE_H,
          goalCoverMax: SD.goalCoverMax,
          exposurePenalty: SD.exposurePenalty, openPenalty: SD.openPenalty, openDist: SD.openDist,
          threat: { x: sdThreat.pos.x, z: sdThreat.pos.z }, alongWeight: SD.alongWeight, avoid: sdAvoid,
          score: a.score ?? null, scoreStop: a.scoreStop ?? Infinity,
          allowJump: !escape, deadline: host.deadline(), job: me.botSDSearchJob
        });
        let pending = false;
        if (found && found.pending) { found = null; pending = true; }
        if (pending) me.botSDSearchAt = now;
        else if (found) {
          let ok = true;
          if (!escape) {
            // THE PRICE of the route: its exposed stretches at a sprint, the
            // tank able to sprint them; over the cap, the first exposed
            // stretch is marked and the next stage is tried.
            const rr = sdRouteRisk(found.path, mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, sdReact);
            me.botSDLastRisk = rr.risk;
            ok = rr.risk <= SD.riskCap && sdSprintCost(rr.exposedLen) <= me.boost - SD.dashFloor;
            if (!ok) { if (rr.first) sdMark(rr.first.x, rr.first.z); me.botSDRejects = (me.botSDRejects ?? 0) + 1; me.botSDRefusedPath = found.path; }
          }
          if (ok) {
            if (escape) { plan.goal = found.goal; plan.path = found.path; plan.idx = 0; me.botSDReact.goal = found.goal; me.botSDSearchStage = 0; me.botSDSearchJob = null; me.botSDSearchAt = now + SD.searchMs; }
            else { if (plan) sdDrop(); sdTake({ kind: a.kind, path: found.path, idx: 0, goal: found.goal }); }
            taken = true;
          }
        }
        if (!pending && !taken) {
          me.botSDSearchJob = null;
          if (stage < stages.length - 1) { me.botSDSearchStage = stage + 1; me.botSDSearchAt = now; }
          else if (escape) { me.botSDSearchStage = 0; me.botSDSearchAt = now + SD.exposedRetryMs; }
          else {
            // THE FLOOR OF THE LIST. Every option refused: what is the unit
            // waiting for? Priced once more under what time brings back — the
            // gun gone quiet, the dodge in hand, the magazine and the tank
            // full, the target's immunity over. An attack or the refused route
            // under the cap then: THE WAIT for it (the plan, paced in the leash,
            // priced again at the cadence). Nothing: THE APPROACH — the
            // pathfinder's route to the enemy, unpriced; no route at all -> the
            // wait (he cannot be reached from here).
            me.botSDSearchStage = 0;
            const refused = me.botSDRefusedPath;
            const waitFor = !!sdAttacks(sdRestored) || (!!refused && sdRouteRisk(refused, mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, SD.acquireMs).risk <= SD.riskCap);
            if (waitFor) {
              if (!plan || plan.kind !== 'wait') { if (plan) sdDrop(); sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); }
              me.botSDWaits = (me.botSDWaits ?? 0) + 1;
            } else {
              const path = sdApproachRoute();
              if (plan) sdDrop();
              if (path) { sdTake({ kind: 'approach', path, idx: 0, goal: path[path.length - 1] }); me.botSDApproaches = (me.botSDApproaches ?? 0) + 1; }
              else { sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); me.botSDUnreachable = (me.botSDUnreachable ?? 0) + 1; }   // (no route to him at all: the wait, like any other)
            }
            if (plan && plan.kind === 'wait') me.botSDSearchAt = now + SD.failRetryMs;
          }
        }
      }
    }
  }

  // ===================== 5. THE LEGS =====================
  // (a route's priced exposure runs on the crossing legs too: the side is picked the tick it opens)
  if (!sdHidden && plan && plan.path && !me.botSDReact && plan.kind !== 'peek') {
    const runRoom = (cx, cz) => { let room = 0; for (const L of [SD.reactRoom, SD.reactSideProbe * 0.5, SD.reactSideProbe]) { if (!sdLegFits(mePos.x, mePos.z, mePos.x + cx * L, mePos.z + cz * L)) break; room = L; } return room; };
    const rooms = [1, -1].map((s) => { const p = sdPerp(s); return sdIntoWall(p.x, p.z) ? -1 : runRoom(p.x, p.z); });
    sdCross(plan.kind, plan.goal, rooms[0] >= rooms[1] ? 1 : -1);
  }
  const cross = me.botSDReact;
  if (sdStepping) {
    // mid dodge: the lerp owns the body
    coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    me.botSDState = 'dodge';
  } else if (plan && plan.kind !== 'peek' && cross && (!sdHidden || plan.kind === 'react' || plan.kind === 'retreat' || plan.kind === 'engage')) {
    // THE CROSSING LEGS: across the line as it is this tick, toward the
    // route's next waypoint (the goal itself without a route) — the
    // waypoint's own heading when it runs across the line (acrossMin), else
    // the perpendicular on the kept side leaning reactDriftDeg toward it;
    // no room on that side, or into the wall the body touches -> the other
    // side; neither -> the waypoint straight (a corridor); none -> the most
    // lateral walkable heading of eight; none -> stand and fire.
    let lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z;
    const ll = Math.hypot(lx, lz) || 1; lx /= ll; lz /= ll;
    let wp = cross.goal ?? plan.goal ?? null;
    if (plan.path) {
      const sp = plan.path;
      while (plan.idx < sp.length - 1 && Math.hypot(sp[plan.idx].x - mePos.x, sp[plan.idx].z - mePos.z) < 2.5) plan.idx += 1;
      wp = sp[plan.idx];
    }
    let wx = 0, wz = 0, wl = 0;
    if (wp) { wx = wp.x - mePos.x; wz = wp.z - mePos.z; wl = Math.hypot(wx, wz); if (wl > 0.5) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; wl = 0; } }
    const fits = (c) => !sdIntoWall(c.x, c.z) && sdLegFits(mePos.x, mePos.z, mePos.x + c.x * SD.reactRoom, mePos.z + c.z * SD.reactRoom);
    const alongSgn = wl > 0 ? Math.sign(wx * lx + wz * lz) : 0;
    const dc = Math.cos(SD.reactDriftDeg * Math.PI / 180), ds = Math.sin(SD.reactDriftDeg * Math.PI / 180);
    let hx = 0, hz = 0, found = false;
    if (wl > 0 && Math.abs(wx * lz - wz * lx) >= SD.acrossMin && fits({ x: wx, z: wz })) { hx = wx; hz = wz; found = true; }
    for (const s of found ? [] : [cross.side, -cross.side]) {
      const p = sdPerp(s);
      const cands = alongSgn ? [{ x: p.x * dc + lx * alongSgn * ds, z: p.z * dc + lz * alongSgn * ds }, p] : [p];
      for (const c of cands) {
        if (!fits(c)) continue;
        hx = c.x; hz = c.z; found = true;
        break;
      }
      if (found) break;
    }
    if (!found && wl > 0 && fits({ x: wx, z: wz })) { hx = wx; hz = wz; found = true; me.botSDReactCorridorTicks = (me.botSDReactCorridorTicks ?? 0) + 1; }
    if (found) {
      const p1 = sdPerp(1), s = (hx * p1.x + hz * p1.z) >= 0.05 ? 1 : (hx * p1.x + hz * p1.z) <= -0.05 ? -1 : cross.side;
      if (s !== cross.side) { cross.side = s; me.botSDReactFlips = (me.botSDReactFlips ?? 0) + 1; }
    }
    if (!found) {
      let best = -1;
      for (let k = 0; k < 8; k += 1) {
        const cx = Math.cos(k * Math.PI / 4), cz = Math.sin(k * Math.PI / 4);
        const lat = Math.abs(cx * lz - cz * lx);
        if (lat <= best) continue;
        if (sdIntoWall(cx, cz) || !sdLegFits(mePos.x, mePos.z, mePos.x + cx * SD.reactRoom, mePos.z + cz * SD.reactRoom)) continue;
        best = lat; hx = cx; hz = cz; found = true;
      }
    }
    if (found) {
      hx += avoid.rx * 0.6; hz += avoid.rz * 0.6;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: hx, mz: hz };
      cross.moved = true;
    } else {
      me.momentumVX = 0; me.momentumVZ = 0;
      coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    }
    me.botSDState = plan.kind;
    me.botSDReactTicks = (me.botSDReactTicks ?? 0) + 1;
  } else if (plan && plan.kind === 'peek') {
    if (plan.armed) {
      // THE WINDOW: the trigger open (the host fires), the body sprinting
      // across the line away from the cover it stepped out of — the line
      // opened past the cover's edge and runs on that side; no room there
      // -> stand and fire (never back into the cover: that is THE RETREAT)
      const p = sdPerp(plan.side);
      if (!sdIntoWall(p.x, p.z) && sdLegFits(mePos.x, mePos.z, mePos.x + p.x * SD.reactRoom, mePos.z + p.z * SD.reactRoom)) {
        coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor, mx: p.x, mz: p.z };
      } else {
        me.momentumVX = 0; me.momentumVZ = 0;
        coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      }
      me.botSDState = 'window';
    } else {
      // THE LEG OUT: the sprint to the point (the dodge leg landed there)
      let tx = plan.point.x - mePos.x, tz = plan.point.z - mePos.z;
      const tl = Math.hypot(tx, tz) || 1;
      if (sdIntoWall(tx / tl, tz / tl)) { sdMark(plan.point.x, plan.point.z); sdDrop(); me.botSDSearchAt = now; coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 }; me.botSDState = 'hold'; }
      else { coverMove = { hold: false, hide: true, dash: me.boost > SD.dashFloor && tl > 2, mx: tx / tl, mz: tz / tl }; me.botSDState = 'peek'; }
    }
  } else if (plan && plan.path) {
    // THE ROUTE: the next waypoint, taken early when the straight cut to it
    // fits the body; a ledge waypoint is vaulted (the jump, then the dodge
    // toward it); the sprint where the leg ahead is exposed (to dashFloor)
    // or while the tank is above its reserve; a leg into the wall the body
    // touches is no leg — the waypoint is marked and the route dropped.
    const sp = plan.path;
    let wp = sp[plan.idx];
    while (plan.idx < sp.length - 1) {
      const dwp = Math.hypot(wp.x - mePos.x, wp.z - mePos.z);
      if (dwp >= 2.5) break;
      const nxt = sp[plan.idx + 1];
      const ex = nxt.x - wp.x, ez = nxt.z - wp.z, el = Math.hypot(ex, ez) || 1;
      const passed = ((mePos.x - wp.x) * ex + (mePos.z - wp.z) * ez) / el >= 0;
      if (passed || (dwp < 2 && sdLegFits(mePos.x, mePos.z, nxt.x, nxt.z))) { plan.idx += 1; wp = sp[plan.idx]; }
      else break;
    }
    let tx = wp.x - mePos.x, tz = wp.z - mePos.z;
    const wl = Math.hypot(tx, tz) || 1;
    tx = tx / wl + avoid.rx * 0.6; tz = tz / wl + avoid.rz * 0.6;
    const tl = Math.hypot(tx, tz) || 1;
    const hx = tx / tl, hz = tz / tl;
    if (sdIntoWall(hx, hz) && wl > 1) {
      sdMark(wp.x, wp.z); sdDrop(); me.botSDSearchAt = now;
      me.momentumVX = 0; me.momentumVZ = 0;
      coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
      me.botSDState = 'hold';
    } else {
      const aheadExposed = !sdHidden || !sdHiddenAt(mePos.x + hx * SD.aheadProbe, mePos.z + hz * SD.aheadProbe, myFloorY);
      let jumpAhead = false;
      for (let k = plan.idx; k < sp.length; k += 1) if ((sp[k].y ?? myFloorY) - myFloorY > 1.7) { jumpAhead = true; break; }
      let sdJump = null, bank = false;
      if ((wp.y ?? myFloorY) - myFloorY > 1.7 && host.grounded && !me.airborne && wl < SD.jumpReach) {
        if (me.boost >= SD.boostReserve && now >= (me.jumpCooldownUntil ?? 0)) {
          if (host.startJump()) { sdJump = { x: hx, z: hz }; plan.jumpAt = now; plan.jumpStepped = false; me.botSDJumps = (me.botSDJumps ?? 0) + 1; }
        } else bank = true;   // (the tank or the cooldown: stand at the ledge)
      } else if (me.airborne && plan.jumpAt != null && now - plan.jumpAt <= 250 && !plan.jumpStepped && wl > 3) {
        if (host.startStep(wp.x - mePos.x, wp.z - mePos.z)) { plan.jumpStepped = true; me.botSDDodges = (me.botSDDodges ?? 0) + 1; }
      }
      const lastLeg = plan.idx === sp.length - 1 && wl <= 2;   // (the last 2 u onto the goal are walked: the body stops ON the cell)
      const dash = !lastLeg && (aheadExposed ? me.boost > SD.dashFloor : (!jumpAhead && me.boost > SD.boostReserve));
      if (bank) { me.momentumVX = 0; me.momentumVZ = 0; coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 }; me.botSDState = 'bank'; }
      else { coverMove = { hold: false, hide: true, dash, mx: hx, mz: hz, jump: !!sdJump, jx: sdJump?.x ?? 0, jz: sdJump?.z ?? 0 }; me.botSDState = dash ? 'dash' : 'walk'; }
    }
  } else if (plan && plan.kind === 'wait') {
    // THE WAIT's legs: the body paces its hidden cell — a heading is kept
    // while one body radius ahead stays inside the leash, walkable and
    // hidden (the same test, at that step's own moment); else another of
    // the eight is drawn; none -> stand. A hidden step costs nothing, so
    // nothing here touches the price.
    const w = plan;
    const step = HIT_RADIUS_NORMAL;
    const paceV = (meUnit.walkSpeed ?? WALK_SPEED) * SD.paceSpeed;
    const okHeading = (hx, hz) => {
      const ex = mePos.x + hx * step, ez = mePos.z + hz * step;
      return Math.hypot(ex - w.cx, ez - w.cz) <= SD.waitLeash && !sdIntoWall(hx, hz) && sdLegFits(mePos.x, mePos.z, ex, ez) && sdHiddenAt(ex, ez, myFloorY, step / paceV * 1000);
    };
    let hx = w.hx ?? 0, hz = w.hz ?? 0;
    if (!(hx || hz) || !okHeading(hx, hz)) {
      hx = 0; hz = 0;
      const start = Math.floor(Math.random() * 8);
      for (let k = 0; k < 8; k += 1) {
        const a = (start + k) * Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a);
        if (okHeading(cx, cz)) { hx = cx; hz = cz; break; }
      }
      w.hx = hx; w.hz = hz;
    }
    me.momentumVX = 0; me.momentumVZ = 0;
    if (hx || hz) coverMove = { hold: false, hide: true, dash: false, mx: hx * SD.paceSpeed, mz: hz * SD.paceSpeed };
    else coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    me.botSDState = 'wait';
    me.botSDWaitTicks = (me.botSDWaitTicks ?? 0) + 1;
  } else {
    // THE HOLD: no plan and no legs this tick (the search's own ticks between plans; exposed with nothing to do)
    me.momentumVX = 0; me.momentumVZ = 0;
    coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    me.botSDState = sdHidden ? 'hold' : 'stand';
    if (sdHidden) me.botSDHoldTicks = (me.botSDHoldTicks ?? 0) + 1;
  }
  // THE OPENING MOVE: the tick a line opens on the body, the dodge along the
  // legs' own heading when it is in hand — its i-frames carry the body
  // through the enemy's first rounds, planned exposure or not (THE REACTION
  // and the dodge-leg peek have already stepped; a window on its point has
  // no leg to step along).
  if (sdOpened && coverMove && !coverMove.hold && sdDodgeReady && me.boost >= sdStepCost + SD.dashFloor && host.startStep(coverMove.mx, coverMove.mz)) {
    me.botSDDodges = (me.botSDDodges ?? 0) + 1;
    me.botSDOpeningDodges = (me.botSDOpeningDodges ?? 0) + 1;
    coverMove = { hold: true, hide: true, dash: false, mx: 0, mz: 0 };
    me.botSDState = 'dodge';
  }
  if (coverMove && !coverMove.hold) { me.botSDHeadX = coverMove.mx; me.botSDHeadZ = coverMove.mz; }

  // ===================== 6. THE TAPE =====================
  // (every 100 ms one line of what the brain sees and does — the host keeps
  // the last 8 s and prints it when the unit dies or on demand)
  if (host.tape && now - (me.botSDTapeAt ?? -1e9) >= 100) {
    me.botSDTapeAt = now;
    const tv = Math.hypot(sdThreat.vel?.x ?? 0, sdThreat.vel?.z ?? 0);
    host.tape({
      t: now, fr: now - (me.botSDPrevTickAt ?? now), x: mePos.x, z: mePos.z, tx: sdThreat.pos.x, tz: sdThreat.pos.z, d: sdThreatDist,
      hid: sdHidden ? 1 : 0, hot: sdReact === 0 ? 1 : 0, far: sdReact === SD.riskReactMs ? 1 : 0, heard: 0,
      rc: cross ? 1 : 0, ev: Math.round(tv), eo: coverDistanceAt(sdGrid, sdThreat.pos.x, sdThreat.pos.z, host.groundHeightAt(sdThreat.pos.x, sdThreat.pos.z, sdThreat.pos.y - GROUND_BASE_Y), obstacles) > SD.openDist ? 1 : 0,
      st: me.botSDState ?? '-',
      kind: plan ? plan.kind : (sdStepping ? 'step' : '-'),
      plan: plan && plan.kind === 'peek' && plan.armed ? 1 : 0, over: 0, exp: sdExposedFor,
      risk: me.botSDLastRisk, trade: me.botSDLastTrade, boost: me.boost, hp: me.hp,
      bloom: sdThreat.bloom ?? 0, idle: null,
      cmd: coverMove ? (coverMove.hold ? 'hold' : coverMove.dash ? 'dash' : 'walk') : 'plain',
      hl: (() => { if (!coverMove || coverMove.hold) return null; const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z, ll = Math.hypot(lx, lz) || 1; return Math.abs(coverMove.mx * lz - coverMove.mz * lx) / ll; })(),
      sg: (() => { if (!coverMove || coverMove.hold) return 0; const lx = sdThreat.pos.x - mePos.x, lz = sdThreat.pos.z - mePos.z; const c = coverMove.mx * lz - coverMove.mz * lx; return c > 0.05 ? 1 : c < -0.05 ? -1 : 0; })(),
      wall: sdWall ? 1 : 0,
      cmdv: Math.hypot(meVel?.x ?? 0, meVel?.z ?? 0),
      act: me.action ?? '-',
    });
  }
  me.botSDPrevTickAt = now;
  return coverMove;
}
