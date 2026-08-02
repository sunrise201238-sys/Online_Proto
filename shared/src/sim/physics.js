// Pure-JS collision math. Mirrors segmentHitsObstacle, unitOverlapsObstacle,
// resolveUnitObstacleCollisions, surfaceHeightAtXZ, and groundHeightAt from
// client/src/main.js. Operates on plain {x,y,z} POJOs and obstacle/surface
// arrays — no THREE or cannon involvement.

import { FIGHTER_RADIUS, GROUND_BASE_Y } from './constants.js';

const SURFACE_STEP_HEIGHT = 1.6;

// Slab method — does the segment p0→p1 (t in [0,1]) intersect the AABB o?
// Used to catch fast/homing projectiles that would tunnel through obstacles
// between frames.
export function segmentHitsObstacle(p0, p1, o) {
  let tMin = 0;
  let tMax = 1;
  const axes = [
    [p0.x, p1.x - p0.x, o.minX, o.maxX],
    [p0.y, p1.y - p0.y, o.minY, o.maxY],
    [p0.z, p1.z - p0.z, o.minZ, o.maxZ]
  ];
  for (let i = 0; i < 3; i += 1) {
    const start = axes[i][0];
    const delta = axes[i][1];
    const lo = axes[i][2];
    const hi = axes[i][3];
    if (Math.abs(delta) < 1e-9) {
      if (start < lo || start > hi) return false;
    } else {
      const t1 = (lo - start) / delta;
      const t2 = (hi - start) / delta;
      const tNear = t1 < t2 ? t1 : t2;
      const tFar = t1 < t2 ? t2 : t1;
      if (tNear > tMin) tMin = tNear;
      if (tFar < tMax) tMax = tFar;
      if (tMin > tMax) return false;
    }
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

export function obstaclesNearSegment(obstacles, p0, p1) {
  let grid = _gridCache.get(obstacles);
  if (grid === undefined) {
    grid = obstacles.length >= BROADPHASE_MIN_OBSTACLES ? buildObstacleGrid(obstacles) : null;
    _gridCache.set(obstacles, grid);
  }
  if (grid === null) return obstacles;
  // Same `/ BROADPHASE_CELL` floor math as the build pass — build and query
  // must bucket identically or an on-boundary obstacle could be missed.
  const sMinX = p0.x < p1.x ? p0.x : p1.x;
  const sMaxX = p0.x < p1.x ? p1.x : p0.x;
  const sMinZ = p0.z < p1.z ? p0.z : p1.z;
  const sMaxZ = p0.z < p1.z ? p1.z : p0.z;
  const c0 = Math.min(grid.cols - 1, Math.max(0, Math.floor((sMinX - grid.minX) / BROADPHASE_CELL)));
  const c1 = Math.min(grid.cols - 1, Math.max(0, Math.floor((sMaxX - grid.minX) / BROADPHASE_CELL)));
  const r0 = Math.min(grid.rows - 1, Math.max(0, Math.floor((sMinZ - grid.minZ) / BROADPHASE_CELL)));
  const r1 = Math.min(grid.rows - 1, Math.max(0, Math.floor((sMaxZ - grid.minZ) / BROADPHASE_CELL)));
  grid.stamp += 1;
  const stamp = grid.stamp;
  _bpScratch.length = 0;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const cell = grid.cells[r * grid.cols + c];
      if (cell === null) continue;
      for (let k = 0; k < cell.length; k += 1) {
        const idx = cell[k];
        if (grid.seen[idx] === stamp) continue;
        grid.seen[idx] = stamp;
        _bpScratch.push(obstacles[idx]);
      }
    }
  }
  return _bpScratch;
}

// Does the horizontal segment (x0,z0)→(x1,z1), walked at body-center height
// `y`, cross any obstacle a unit cannot WALK through? Uses the same y-window
// as unitOverlapsObstacle (topBuffer semantics) — a 2.4-high belt blocks
// walking even though a chest-height raw-AABB ray sails over it, and the
// walkable TOP of a topBuffer:0 body (the Airport plateau) doesn't block a
// unit standing on it. This is the test for "could the bot walk this line",
// as opposed to segmentHitsObstacle which answers "would a bullet hit".
export function walkSegmentBlocked(x0, z0, x1, z1, y, obstacles) {
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    if (y < o.minY - 2 || y > o.maxY + (o.topBuffer ?? 4)) continue;
    let tMin = 0, tMax = 1, miss = false;
    const axes = [
      [x0, x1 - x0, o.minX, o.maxX],
      [z0, z1 - z0, o.minZ, o.maxZ]
    ];
    for (const [start, delta, lo, hi] of axes) {
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
    if (!miss) return true;
  }
  return false;
}

// Does a fighter's bounding cylinder at (x, y, z) overlap any AABB obstacle?
export function unitOverlapsObstacle(x, y, z, obstacles, radius = FIGHTER_RADIUS) {
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    const topBuffer = o.topBuffer ?? 4;
    if (y < o.minY - 2 || y > o.maxY + topBuffer) continue;
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
export function resolveUnitObstacleCollisions(fighter, prevPos, obstacles, radius = FIGHTER_RADIUS) {
  const pos = fighter.pos;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    const topBuffer = o.topBuffer ?? 4;
    if (pos.y < o.minY - 2 || pos.y > o.maxY + topBuffer) continue;
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
    } else {
      const prevOutside = prevPos
        && (prevPos.x < o.minX - radius || prevPos.x > o.maxX + radius
          || prevPos.z < o.minZ - radius || prevPos.z > o.maxZ + radius);
      if (prevOutside) {
        pos.x = prevPos.x;
        pos.z = prevPos.z;
      } else {
        const dMinX = pos.x - o.minX;
        const dMaxX = o.maxX - pos.x;
        const dMinZ = pos.z - o.minZ;
        const dMaxZ = o.maxZ - pos.z;
        const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
        if (minD === dMinX) pos.x = o.minX - radius;
        else if (minD === dMaxX) pos.x = o.maxX + radius;
        else if (minD === dMinZ) pos.z = o.minZ - radius;
        else pos.z = o.maxZ + radius;
      }
    }
    fighter.vel.x = 0;
    fighter.vel.z = 0;
  }
}

// Returns the highest surface Y at (x,z) that the fighter can step up to
// from currentSurfaceY. Returns 0 if no surface is found (default ground).
export function groundHeightAt(x, z, surfaces, currentSurfaceY = 0) {
  let best = 0;
  for (let i = 0; i < surfaces.length; i += 1) {
    const s = surfaces[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > currentSurfaceY + SURFACE_STEP_HEIGHT) continue;
    if (h > best) best = h;
  }
  return best;
}

// Returns max surface Y at (x,z) ignoring step-up restrictions, or -Infinity
// if no surface covers the point. Used by the projectile-vs-surface check.
export function surfaceHeightAtXZ(x, z, surfaces) {
  let best = -Infinity;
  for (let i = 0; i < surfaces.length; i += 1) {
    const s = surfaces[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > best) best = h;
  }
  return best;
}

// Walk a projectile's segment through a few sample points and return true
// if it crosses a walkable surface. The sign-flip test runs PER SURFACE
// (delta resets whenever the sample leaves that surface's footprint):
// comparing against the max of the whole stack conflated different decks —
// a level shot that passed OVER a sidewalk (delta +) and then UNDER the
// Streets bridge deck (delta -) "flipped" and died in open air (2026-08-01
// fix). A real slab crossing still flips against the slab's own height.
// Mirrors projectileHitsSurface in main.js.
export function projectileHitsSurface(prevPos, nextPos, surfaces) {
  if (!surfaces.length) return false;
  const samples = 8;
  for (let si = 0; si < surfaces.length; si += 1) {
    const s = surfaces[si];
    let prevDelta = null;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const x = prevPos.x + (nextPos.x - prevPos.x) * t;
      const z = prevPos.z + (nextPos.z - prevPos.z) * t;
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) { prevDelta = null; continue; }
      const y = prevPos.y + (nextPos.y - prevPos.y) * t;
      const delta = y - s.heightAt(x, z);
      if (Math.abs(delta) < 0.04) return true;
      if (prevDelta !== null && ((prevDelta > 0 && delta < 0) || (prevDelta < 0 && delta > 0))) return true;
      prevDelta = delta;
    }
  }
  return false;
}

// Returns the ground level Y the fighter should be sitting on, accounting
// for surfaces beneath them.
export function getGroundLevelY(fighter, surfaces) {
  const currentSurfaceY = fighter.pos.y - GROUND_BASE_Y;
  return groundHeightAt(fighter.pos.x, fighter.pos.z, surfaces, currentSurfaceY) + GROUND_BASE_Y;
}
