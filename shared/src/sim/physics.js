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
// if it crosses any walkable surface. Mirrors projectileHitsSurface in
// main.js (8 samples, sign-flip detection on `delta = y - h`).
export function projectileHitsSurface(prevPos, nextPos, surfaces) {
  if (!surfaces.length) return false;
  const samples = 8;
  let prevDelta = null;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = prevPos.x + (nextPos.x - prevPos.x) * t;
    const y = prevPos.y + (nextPos.y - prevPos.y) * t;
    const z = prevPos.z + (nextPos.z - prevPos.z) * t;
    const h = surfaceHeightAtXZ(x, z, surfaces);
    if (h === -Infinity) continue;
    const delta = y - h;
    if (Math.abs(delta) < 0.04) return true;
    if (prevDelta !== null && ((prevDelta > 0 && delta < 0) || (prevDelta < 0 && delta > 0))) return true;
    prevDelta = delta;
  }
  return false;
}

// Returns the ground level Y the fighter should be sitting on, accounting
// for surfaces beneath them.
export function getGroundLevelY(fighter, surfaces) {
  const currentSurfaceY = fighter.pos.y - GROUND_BASE_Y;
  return groundHeightAt(fighter.pos.x, fighter.pos.z, surfaces, currentSurfaceY) + GROUND_BASE_Y;
}
