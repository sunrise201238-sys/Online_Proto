// Pure-JS collision math. Mirrors segmentHitsObstacle, unitOverlapsObstacle,
// resolveUnitObstacleCollisions, surfaceHeightAtXZ, and groundHeightAt from
// client/src/main.js. Operates on plain {x,y,z} POJOs and obstacle/surface
// arrays — no THREE or cannon involvement.

import { FIGHTER_RADIUS, GROUND_BASE_Y, SURFACE_STEP_HEIGHT } from './constants.js';

// Slab method — does the segment p0→p1 (t in [0,1]) intersect the AABB o?
// Used to catch fast/homing projectiles that would tunnel through obstacles
// between frames.
// (2026-10-07, "online SD is very lag": the three slabs are unrolled with no
// per-call arrays — the Sudden Death brain's searches run this a million
// times a minute per match, and the four small arrays each call allocated
// were most of the sight test's cost and all of its garbage. Same maths,
// same epsilon, same answer.)
export function segmentHitsObstacle(p0, p1, o) {
  let tMin = 0;
  let tMax = 1;
  let start = p0.x, delta = p1.x - p0.x, lo = o.minX, hi = o.maxX;
  if (Math.abs(delta) < 1e-9) {
    if (start < lo || start > hi) return false;
  } else {
    const t1 = (lo - start) / delta, t2 = (hi - start) / delta;
    const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
    if (tNear > tMin) tMin = tNear;
    if (tFar < tMax) tMax = tFar;
    if (tMin > tMax) return false;
  }
  start = p0.y; delta = p1.y - p0.y; lo = o.minY; hi = o.maxY;
  if (Math.abs(delta) < 1e-9) {
    if (start < lo || start > hi) return false;
  } else {
    const t1 = (lo - start) / delta, t2 = (hi - start) / delta;
    const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
    if (tNear > tMin) tMin = tNear;
    if (tFar < tMax) tMax = tFar;
    if (tMin > tMax) return false;
  }
  start = p0.z; delta = p1.z - p0.z; lo = o.minZ; hi = o.maxZ;
  if (Math.abs(delta) < 1e-9) {
    if (start < lo || start > hi) return false;
  } else {
    const t1 = (lo - start) / delta, t2 = (hi - start) / delta;
    const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
    if (tNear > tMin) tMin = tNear;
    if (tFar < tMax) tMax = tFar;
    if (tMin > tMax) return false;
  }
  return true;
}

// Distance from `origin` along unit `dir` to the nearest obstacle face, clamped
// to maxLen. Used to stop a hitscan beam at the first wall. Skips noProjectile
// obstacles; the 3D slab test naturally lets the beam pass over/under obstacles
// it clears vertically (e.g. low cover when the beam flies at chest height).
export function raycastObstacleDistance(origin, dir, maxLen, obstacles) {
  const ex = origin.x + dir.x * maxLen;
  const ey = origin.y + dir.y * maxLen;
  const ez = origin.z + dir.z * maxLen;
  let best = maxLen;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    let tMin = 0;
    let tMax = 1;
    let miss = false;
    const axes = [
      [origin.x, ex - origin.x, o.minX, o.maxX],
      [origin.y, ey - origin.y, o.minY, o.maxY],
      [origin.z, ez - origin.z, o.minZ, o.maxZ]
    ];
    for (let a = 0; a < 3; a += 1) {
      const start = axes[a][0];
      const delta = axes[a][1];
      const lo = axes[a][2];
      const hi = axes[a][3];
      if (Math.abs(delta) < 1e-9) {
        if (start < lo || start > hi) { miss = true; break; }
      } else {
        const t1 = (lo - start) / delta;
        const t2 = (hi - start) / delta;
        const tNear = t1 < t2 ? t1 : t2;
        const tFar = t1 < t2 ? t2 : t1;
        if (tNear > tMin) tMin = tNear;
        if (tFar < tMax) tMax = tFar;
        if (tMin > tMax) { miss = true; break; }
      }
    }
    if (miss) continue;
    const d = tMin * maxLen;
    if (d >= 0 && d < best) best = d;
  }
  return best;
}

// --- Projectile broadphase --------------------------------------------------
// Static XZ grid over a map's obstacle list, built lazily ONCE per obstacle
// array (arenas are module-level singletons, so once per map per process) and
// cached by array identity. obstaclesNearSegment returns a conservative
// SUPERSET of the obstacles whose AABB can intersect the swept segment: any
// intersection point lies inside both the obstacle's AABB and the segment's
// XZ bounds, hence inside a queried cell — the grid can only ADD candidates,
// never hide one. Correctness stays with the precise slab test, which still
// runs on every candidate. Y is ignored (XZ-only cells): vertical misses are
// filtered by the slab test like before.
// The returned array is a reused scratch buffer (or the obstacles array
// itself on small maps) — consume it before the next query, never store it.
const BROADPHASE_CELL = 24;
const BROADPHASE_MIN_OBSTACLES = 24;   // below this, brute force is already optimal
const _gridCache = new WeakMap();
const _bpScratch = [];
const _bpIndex = [];
const _gndScratch = [];   // (the ground lookups' own list: they are called from inside loops over the other one)
const _ovlScratch = [], _resScratch = [];   // (the body's own box tests' lists, for the same reason)

function buildObstacleGrid(obstacles) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    if (o.minX < minX) minX = o.minX;
    if (o.minZ < minZ) minZ = o.minZ;
    if (o.maxX > maxX) maxX = o.maxX;
    if (o.maxZ > maxZ) maxZ = o.maxZ;
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / BROADPHASE_CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / BROADPHASE_CELL));
  const cells = new Array(cols * rows).fill(null);
  for (let idx = 0; idx < obstacles.length; idx += 1) {
    const o = obstacles[idx];
    const c0 = Math.min(cols - 1, Math.max(0, Math.floor((o.minX - minX) / BROADPHASE_CELL)));
    const c1 = Math.min(cols - 1, Math.max(0, Math.floor((o.maxX - minX) / BROADPHASE_CELL)));
    const r0 = Math.min(rows - 1, Math.max(0, Math.floor((o.minZ - minZ) / BROADPHASE_CELL)));
    const r1 = Math.min(rows - 1, Math.max(0, Math.floor((o.maxZ - minZ) / BROADPHASE_CELL)));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const key = r * cols + c;
        if (cells[key] === null) cells[key] = [];
        cells[key].push(idx);
      }
    }
  }
  // seen[] + stamp give O(1) dedupe for obstacles spanning several queried
  // cells without allocating a Set per query.
  return { minX, minZ, cols, rows, cells, seen: new Float64Array(obstacles.length), stamp: 0 };
}

function obstacleGridFor(obstacles) {
  let grid = _gridCache.get(obstacles);
  // (SD proto: the offline client refills ONE obstacles array per map, so an
  // identity-keyed cache must also check that the contents are the ones it
  // was built from — length and the first / last entries)
  if (grid === undefined || (grid !== null && (grid.len !== obstacles.length || grid.first !== obstacles[0] || grid.last !== obstacles[obstacles.length - 1]))) {
    grid = obstacles.length >= BROADPHASE_MIN_OBSTACLES ? buildObstacleGrid(obstacles) : null;
    if (grid) { grid.len = obstacles.length; grid.first = obstacles[0]; grid.last = obstacles[obstacles.length - 1]; }
    _gridCache.set(obstacles, grid);
  }
  return grid;
}

export function obstaclesNearSegment(obstacles, p0, p1) {
  const grid = obstacleGridFor(obstacles);
  if (grid === null) return obstacles;
  // Same `/ BROADPHASE_CELL` floor math as the build pass — build and query
  // must bucket identically or an on-boundary obstacle could be missed.
  // SD proto (2026-10-05): the cells are walked ALONG the segment (grid
  // traversal) instead of over its bounding box — a 150 u diagonal sight
  // line touched 36 cells and 120 of a map's 400 boxes; it crosses ~13.
  grid.stamp += 1;
  const stamp = grid.stamp;
  _bpScratch.length = 0;
  const cs = BROADPHASE_CELL;
  const visit = (c, r) => {
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return;
    const cell = grid.cells[r * grid.cols + c];
    if (cell === null) return;
    for (let k = 0; k < cell.length; k += 1) {
      const idx = cell[k];
      if (grid.seen[idx] === stamp) continue;
      grid.seen[idx] = stamp;
      _bpScratch.push(obstacles[idx]);
    }
  };
  let cx = Math.floor((p0.x - grid.minX) / cs), cz = Math.floor((p0.z - grid.minZ) / cs);
  const ex = Math.floor((p1.x - grid.minX) / cs), ez = Math.floor((p1.z - grid.minZ) / cs);
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0), stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
  let tMaxX = stepX !== 0 ? ((grid.minX + (cx + (stepX > 0 ? 1 : 0)) * cs) - p0.x) / dx : Infinity;
  let tMaxZ = stepZ !== 0 ? ((grid.minZ + (cz + (stepZ > 0 ? 1 : 0)) * cs) - p0.z) / dz : Infinity;
  const tDeltaX = stepX !== 0 ? Math.abs(cs / dx) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(cs / dz) : Infinity;
  let t = 0;
  for (let guard = 0; guard < 8192; guard += 1) {
    visit(cx, cz);
    if ((cx === ex && cz === ez) || t > 1) break;
    if (tMaxX < tMaxZ) { t = tMaxX; cx += stepX; tMaxX += tDeltaX; } else { t = tMaxZ; cz += stepZ; tMaxZ += tDeltaZ; }
  }
  return _bpScratch;
}

// The same broadphase for a POINT with a reach: every obstacle whose box can come
// within r of (x, z) overlaps a cell the square [x - r, x + r] x [z - r, z + r]
// touches, so those cells hold a superset; the caller's exact test decides.
export function obstaclesNearPoint(obstacles, x, z, r, out = _bpScratch) {
  const grid = obstacleGridFor(obstacles);
  if (grid === null) return obstacles;
  grid.stamp += 1;
  const stamp = grid.stamp;
  out.length = 0;
  const cs = BROADPHASE_CELL;
  const c0 = Math.max(0, Math.floor((x - r - grid.minX) / cs)), c1 = Math.min(grid.cols - 1, Math.floor((x + r - grid.minX) / cs));
  const r0 = Math.max(0, Math.floor((z - r - grid.minZ) / cs)), r1 = Math.min(grid.rows - 1, Math.floor((z + r - grid.minZ) / cs));
  _bpIndex.length = 0;
  for (let rr = r0; rr <= r1; rr += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const cell = grid.cells[rr * grid.cols + c];
      if (cell === null) continue;
      for (let k = 0; k < cell.length; k += 1) {
        const idx = cell[k];
        if (grid.seen[idx] === stamp) continue;
        grid.seen[idx] = stamp;
        _bpIndex.push(idx);
      }
    }
  }
  // in the list's own order: a caller that SUMS over the candidates (the steering's pushes) adds the same
  // numbers in the same order as a full scan would, so its floating point comes out identical
  _bpIndex.sort((a, b) => a - b);
  for (let k = 0; k < _bpIndex.length; k += 1) out.push(obstacles[_bpIndex[k]]);
  return out;
}

// Does a box hold a body whose centre is at height y? Not when the body is 2 or more under its bottom (it
// passes beneath), nor over its top by more than its topBuffer (4 for a wall) — nor, for a box whose top is a
// floor (floorTop, arena.js: a surface lies on it), when the body's feet are within SURFACE_STEP_HEIGHT of that
// top: the ground rule (groundHeightAt) steps the body onto the floor, so the box lets it come. The one window the
// movement's push-out, the overlap test, the walk test and the bots' steering use.
export function boxHoldsAt(o, y) {
  if (y < o.minY - 2 || y > o.maxY + (o.topBuffer ?? 4)) return false;
  return !(o.floorTop && y - GROUND_BASE_Y + SURFACE_STEP_HEIGHT >= o.maxY);
}

// Does the horizontal segment (x0,z0)→(x1,z1), walked at body-center height
// `y`, cross any obstacle a unit cannot WALK through? Uses the same y-window
// as unitOverlapsObstacle (topBuffer semantics) — a 2.4-high belt blocks
// walking even though a chest-height raw-AABB ray sails over it, and the
// walkable TOP of a topBuffer:0 body (the Airport plateau) doesn't block a
// unit standing on it. This is the test for "could the bot walk this line",
// as opposed to segmentHitsObstacle which answers "would a bullet hit".
export function walkSegmentBlocked(x0, z0, x1, z1, y, obstacles) {
  // (SD proto: broadphase — the legs tested are a few units long)
  const cand = obstaclesNearSegment(obstacles, { x: x0, z: z0 }, { x: x1, z: z1 });
  for (let i = 0; i < cand.length; i += 1) {
    const o = cand[i];
    if (!boxHoldsAt(o, y)) continue;
    // (two slabs, unrolled with no per-call arrays — see segmentHitsObstacle)
    let tMin = 0, tMax = 1, miss = false;
    let start = x0, delta = x1 - x0, lo = o.minX, hi = o.maxX;
    if (Math.abs(delta) < 1e-9) {
      if (start < lo || start > hi) miss = true;
    } else {
      const t1 = (lo - start) / delta, t2 = (hi - start) / delta;
      const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
      if (tNear > tMin) tMin = tNear;
      if (tFar < tMax) tMax = tFar;
      if (tMin > tMax) miss = true;
    }
    if (!miss) {
      start = z0; delta = z1 - z0; lo = o.minZ; hi = o.maxZ;
      if (Math.abs(delta) < 1e-9) {
        if (start < lo || start > hi) miss = true;
      } else {
        const t1 = (lo - start) / delta, t2 = (hi - start) / delta;
        const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
        if (tNear > tMin) tMin = tNear;
        if (tFar < tMax) tMax = tFar;
        if (tMin > tMax) miss = true;
      }
    }
    if (!miss) return true;
  }
  return false;
}

// Does a fighter's bounding cylinder at (x, y, z) overlap any AABB obstacle?
export function unitOverlapsObstacle(x, y, z, obstacles, radius = FIGHTER_RADIUS) {
  // (the broadphase: only the boxes that can come within the radius; any one of them answers, so the same answer as the full scan)
  const near = obstaclesNearPoint(obstacles, x, z, radius, _ovlScratch);
  for (let i = 0; i < near.length; i += 1) {
    const o = near[i];
    if (!boxHoldsAt(o, y)) continue;
    const nearestX = Math.max(o.minX, Math.min(x, o.maxX));
    const nearestZ = Math.max(o.minZ, Math.min(z, o.maxZ));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

// Push a fighter out of any obstacle it has penetrated. `prevPos` is where
// the fighter was at the start of the tick — if the fighter ended up fully
// inside an AABB this tick, we revert to that known-outside position rather
// than picking the nearest face (which would teleport them across the
// obstacle in pathological cases).
// Returns the outward normal {x, z} of the face(s) the body was pushed out of
// (unit length, the faces summed), or null when it touched none: physics' own
// note of a wall, for the bots' brains (tick.js keeps it per tick, off the
// fighter and out of every snapshot).
const REST_SLACK = 0.05;
export function resolveUnitObstacleCollisions(fighter, prevPos, obstacles, radius = FIGHTER_RADIUS) {
  const pos = fighter.pos;
  let nx = 0, nz = 0, touched = false;
  // (the broadphase: the boxes within the radius plus 2 units, in the list's own order, so the pushes come in
  // the order the full scan would give them; a box farther out can only matter if this tick's pushes carry the
  // body more than 2 units, which a step's worth of penetration never does)
  const near = obstaclesNearPoint(obstacles, pos.x, pos.z, radius + 2, _resScratch);
  for (let i = 0; i < near.length; i += 1) {
    const o = near[i];
    if (!boxHoldsAt(o, pos.y)) continue;
    const nearestX = Math.max(o.minX, Math.min(pos.x, o.maxX));
    const nearestZ = Math.max(o.minZ, Math.min(pos.z, o.maxZ));
    const dx = pos.x - nearestX;
    const dz = pos.z - nearestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    const d = Math.sqrt(d2);
    if (d > 0.0001) {
      const push = radius - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
      nx += dx / d; nz += dz / d;
    } else {
      const prevOutside = prevPos
        && (prevPos.x < o.minX - radius || prevPos.x > o.maxX + radius
          || prevPos.z < o.minZ - radius || prevPos.z > o.maxZ + radius);
      if (prevOutside) {
        pos.x = prevPos.x;
        pos.z = prevPos.z;
        // (the face: from the box's nearest point out to the restored body)
        const ex = pos.x - Math.max(o.minX, Math.min(pos.x, o.maxX)), ez = pos.z - Math.max(o.minZ, Math.min(pos.z, o.maxZ));
        const el = Math.hypot(ex, ez) || 1;
        nx += ex / el; nz += ez / el;
      } else {
        const dMinX = pos.x - o.minX;
        const dMaxX = o.maxX - pos.x;
        const dMinZ = pos.z - o.minZ;
        const dMaxZ = o.maxZ - pos.z;
        const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
        if (minD === dMinX) { pos.x = o.minX - radius; nx -= 1; }
        else if (minD === dMaxX) { pos.x = o.maxX + radius; nx += 1; }
        else if (minD === dMinZ) { pos.z = o.minZ - radius; nz -= 1; }
        else { pos.z = o.maxZ + radius; nz += 1; }
      }
    }
    touched = true;
    fighter.vel.x = 0;
    fighter.vel.z = 0;
  }
  // A body never rests in a box. When the pushes above leave it in one — a slot narrower than itself, which it can
  // only have come down into from the air; a corner of thin boxes, where one push lands it in the next and the push
  // from inside is to the nearest face — it is put back where this tick began, which was clear, and the next tick
  // tries again from there: it hangs at the lip until its input takes it elsewhere, instead of wedging between the
  // boxes or being flung face to face through a wall of them (b1022e). REST_SLACK: a body pushed clean out of a box
  // sits exactly a radius from its face, so only a deeper overlap counts.
  if (touched && prevPos && prevPos.y !== undefined
      && unitOverlapsObstacle(pos.x, pos.y, pos.z, obstacles, radius - REST_SLACK)
      && !unitOverlapsObstacle(prevPos.x, prevPos.y, prevPos.z, obstacles, radius - REST_SLACK)) {
    pos.x = prevPos.x; pos.y = prevPos.y; pos.z = prevPos.z;
  }
  if (!touched) return null;
  const nl = Math.hypot(nx, nz);
  return nl > 1e-6 ? { x: nx / nl, z: nz / nl } : null;
}

// Returns the highest surface Y at (x,z) that the fighter can step up to
// from currentSurfaceY; the street (0) where no surface covers the point — so
// a surface below the street (a sunken yard) is the ground there.
export function groundHeightAt(x, z, surfaces, currentSurfaceY = 0) {
  let best = -Infinity;
  // (the broadphase: only the surfaces whose box can cover the point; a maximum, so the same answer as the full scan)
  const near = obstaclesNearPoint(surfaces, x, z, 0, _gndScratch);
  for (let i = 0; i < near.length; i += 1) {
    const s = near[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > currentSurfaceY + SURFACE_STEP_HEIGHT) continue;
    if (h > best) best = h;
  }
  return best === -Infinity ? 0 : best;
}

// Where a body WALKING from (x0, z0), its feet on floor0, to (x1, z1) stands when it gets there: the step rule
// above, applied every WALK_SAMPLE along the way as movement applies it every tick — so a rise a body climbs step
// by step (a kerb's 45-degree ramp, a flight of steps) is walked however much it rises over the whole way, and a
// ledge taller than a step is not. The one place that says what a body can walk to: the nav grid's edges and the
// bots' jump decisions ask this, not the difference between two floors four units apart (b1021s). The +0.1 is the
// step rule's float slack, as the grid always had it.
const WALK_SAMPLE = 1;
export function walkFloorTo(x0, z0, floor0, x1, z1, surfaces) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / WALK_SAMPLE));
  let cur = floor0;
  for (let s = 1; s <= steps; s += 1) {
    const x = x0 + ((x1 - x0) * s) / steps, z = z0 + ((z1 - z0) * s) / steps;
    let g = groundHeightAt(x, z, surfaces, cur + 0.1);
    // (a rise too steep for one sample — a kerb's ramp climbs a step's height in a quarter of a metre — is walked in
    // finer steps before it is called a wall: the body moves a fifth of a unit a tick and takes a step a tick)
    if (g < surfaceHeightAtXZ(x, z, surfaces) - 1e-6) { const px = x0 + ((x1 - x0) * (s - 1)) / steps, pz = z0 + ((z1 - z0) * (s - 1)) / steps; let c = cur; for (let f = 1; f <= 4; f += 1) c = groundHeightAt(px + ((x - px) * f) / 4, pz + ((z - pz) * f) / 4, surfaces, c + 0.1); g = c; }
    cur = g;
  }
  return cur;
}

// Returns max surface Y at (x,z) ignoring step-up restrictions, or -Infinity
// if no surface covers the point. Used by the projectile-vs-surface check.
export function surfaceHeightAtXZ(x, z, surfaces) {
  let best = -Infinity;
  const near = obstaclesNearPoint(surfaces, x, z, 0, _gndScratch);
  for (let i = 0; i < near.length; i += 1) {
    const s = near[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > best) best = h;
  }
  return best;
}

// Impact fraction (t in [0,1]) where the segment p0→p1 FIRST enters AABB o,
// or -1 on miss — the slab test with its tMin returned instead of discarded.
// Used to clamp death positions/visuals to the wall face: a sniper round
// steps ~40 u per tick, and an unclamped death leaves its trail stabbing
// through cover (2026-08-01).
export function segmentObstacleImpactT(p0, p1, o) {
  let tMin = 0;
  let tMax = 1;
  const axes = [
    [p0.x, p1.x - p0.x, o.minX, o.maxX],
    [p0.y, p1.y - p0.y, o.minY, o.maxY],
    [p0.z, p1.z - p0.z, o.minZ, o.maxZ]
  ];
  for (let a = 0; a < 3; a += 1) {
    const [start, delta, lo, hi] = axes[a];
    if (Math.abs(delta) < 1e-9) {
      if (start < lo || start > hi) return -1;
    } else {
      const t1 = (lo - start) / delta;
      const t2 = (hi - start) / delta;
      const tNear = t1 < t2 ? t1 : t2;
      const tFar = t1 < t2 ? t2 : t1;
      if (tNear > tMin) tMin = tNear;
      if (tFar < tMax) tMax = tFar;
      if (tMin > tMax) return -1;
    }
  }
  return tMin;
}

// EXACT segment-vs-surface crossing: the fraction t in [0,1] where the segment
// crosses this surface's plane, or -1.
//
// Inside a surface's footprint both the ray's height and the surface's height
// are LINEAR along the ray (flat: constant; ramp: heightAt is linear in its
// axis and never clamps within its own extent), so delta = y - height is
// linear too and cannot dip and recover in between. Clipping the segment to
// the footprint and comparing delta at the two clipped ENDPOINTS is therefore
// exact and complete — the same Liang-Barsky clip sightHitsSurface uses.
//
// Replaces an 8-sample sign-flip walk (2026-08-15). Sampling was blind to any
// crossing that fell between two samples, and a projectile covers up to ~34
// units in ONE tick at 2000 u/s: fast rounds flew straight through the Streets
// bridge slope and hit a target standing on it, while the bot's fire gate —
// which asks this same question — cleared the shot (user report). Leak rate
// scaled with projectile speed: 100 / 588 / 931 pairs at 300 / 900 / 2000 u/s.
// Samples landing outside the footprint also reset the comparison, so a short
// traverse of a narrow surface could leave one usable sample and compare nothing.
//
// Still judged PER SURFACE over its own clipped interval, so a level shot that
// passes OVER a sidewalk and UNDER the Streets deck cannot "flip" across two
// different slabs (2026-08-01 fix, preserved).
const SURFACE_GRAZE_EPS = 0.04;
function surfaceCrossT(p0, p1, s) {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  let t0 = 0;
  let t1 = 1;
  const axes = [[p0.x, dx, s.minX, s.maxX], [p0.z, dz, s.minZ, s.maxZ]];
  for (let i = 0; i < 2; i += 1) {
    const p = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return -1;
    } else {
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  const dy = p1.y - p0.y;
  const dA = (p0.y + dy * t0) - s.heightAt(p0.x + dx * t0, p0.z + dz * t0);
  const dB = (p0.y + dy * t1) - s.heightAt(p0.x + dx * t1, p0.z + dz * t1);
  // delta is linear across [t0,t1], so its extremes ARE the endpoints: a graze
  // anywhere on the interval shows up at one of them.
  if (Math.abs(dA) < SURFACE_GRAZE_EPS) return t0;
  if (Math.abs(dB) < SURFACE_GRAZE_EPS) return t1;
  if ((dA > 0) === (dB > 0)) return -1;
  return t0 + (t1 - t0) * (dA / (dA - dB));
}

// Earliest fraction (t in [0,1]) where the segment crosses a walkable
// surface, or -1 if none. Used for precise death clamping.
export function surfaceImpactT(prevPos, nextPos, surfaces) {
  if (!surfaces || !surfaces.length) return -1;
  let best = -1;
  for (let si = 0; si < surfaces.length; si += 1) {
    const t = surfaceCrossT(prevPos, nextPos, surfaces[si]);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

// True if the projectile's segment crosses a walkable surface.
// Mirrors projectileHitsSurface in main.js.
export function projectileHitsSurface(prevPos, nextPos, surfaces) {
  if (!surfaces || !surfaces.length) return false;
  for (let si = 0; si < surfaces.length; si += 1) {
    if (surfaceCrossT(prevPos, nextPos, surfaces[si]) >= 0) return true;
  }
  return false;
}

// Returns the ground level Y the fighter should be sitting on, accounting
// for surfaces beneath them.
export function getGroundLevelY(fighter, surfaces) {
  const currentSurfaceY = fighter.pos.y - GROUND_BASE_Y;
  return groundHeightAt(fighter.pos.x, fighter.pos.z, surfaces, currentSurfaceY) + GROUND_BASE_Y;
}

// Does a sight ray hit this surface's mass? RAMPS and PLANES block wherever the ray dips
// below the surface's local height inside the footprint (both the ray's y and the
// ramp height are linear along the ray, so checking the clipped interval's
// endpoints is exact). FLAT elevated decks stand on open pillars, so only
// CROSSING the deck plane blocks — two units both under the bridge keep their
// sight lines. 0.4 epsilon forgives grazes at lips.
// Lives here (moved out of ai.js, 2026-08-14) so the BOT's sight test and the
// PLANNER's firing-position search share one rule: findFiringPath used to
// ignore surfaces entirely and certified firing cells whose line ran straight
// through the Streets bridge deck.
export function sightHitsSurface(p0, p1, s) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  let t0 = 0, t1 = 1;
  // Liang-Barsky clip of the XZ segment to the surface rect.
  const axes = [[p0.x, dx, s.minX, s.maxX], [p0.z, dz, s.minZ, s.maxZ]];
  for (let i = 0; i < 2; i++) {
    const p = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
  }
  const dy = p1.y - p0.y;
  const yA = p0.y + dy * t0, yB = p0.y + dy * t1;
  const EPS = 0.4;
  if (s.type === 'ramp' || s.type === 'plane') {
    const hA = s.heightAt(p0.x + dx * t0, p0.z + dz * t0);
    const hB = s.heightAt(p0.x + dx * t1, p0.z + dz * t1);
    return yA < hA - EPS || yB < hB - EPS;
  }
  const top = s.top ?? s.maxTop;
  if (top == null) return false;
  return (yA > top + EPS && yB < top - EPS) || (yA < top - EPS && yB > top + EPS);
}
