// Arena (map) data — pure JS. The shared sim only needs the obstacles,
// surfaces, and spawn positions for collision and respawn logic. Mesh
// creation stays client-side.
//
// Phase 1 ships ONLINE with Plain Field only. The four other maps from the
// offline build (Streets, Factory, Square, Lobby) are planned but their
// obstacle data hasn't been ported yet. Adding a map online = filling in
// another `arena<key>` block here with the obstacles + surfaces + spawns.

import { GROUND_BASE_Y } from './constants.js';

// Each obstacle is an axis-aligned bounding box (AABB) used for unit and
// projectile collision. Optional flags:
//   topBuffer    — units above maxY+topBuffer are NOT colliding (for jumping
//                  over short obstacles); default 4.
//   noProjectile — projectiles pass through (for unit-only fences).
//
// Surfaces describe walkable ground at non-zero heights (platforms, ramps).
// `heightAt(x, z)` returns the surface Y for a point inside the surface bbox.

const PLAIN_FIELD_HALF = 138;
const PLAIN_FIELD_WALL_THICKNESS = 2;
const PLAIN_FIELD_WALL_HEIGHT = 16;

// Plain Field is just the four boundary walls of the arena. No interior
// obstacles. The default ground at y=0 (with GROUND_BASE_Y offset) handles
// vertical placement for fighters.
function buildPlainField() {
  const obstacles = [
    // East wall.
    {
      minX: PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS,
      maxX: PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS,
      minZ: -PLAIN_FIELD_HALF,
      maxZ: PLAIN_FIELD_HALF,
      minY: 0,
      maxY: PLAIN_FIELD_WALL_HEIGHT * 2,
      topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2
    },
    // West wall.
    {
      minX: -PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS,
      maxX: -PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS,
      minZ: -PLAIN_FIELD_HALF,
      maxZ: PLAIN_FIELD_HALF,
      minY: 0,
      maxY: PLAIN_FIELD_WALL_HEIGHT * 2,
      topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2
    },
    // North wall.
    {
      minX: -PLAIN_FIELD_HALF,
      maxX: PLAIN_FIELD_HALF,
      minZ: PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS,
      maxZ: PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS,
      minY: 0,
      maxY: PLAIN_FIELD_WALL_HEIGHT * 2,
      topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2
    },
    // South wall.
    {
      minX: -PLAIN_FIELD_HALF,
      maxX: PLAIN_FIELD_HALF,
      minZ: -PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS,
      maxZ: -PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS,
      minY: 0,
      maxY: PLAIN_FIELD_WALL_HEIGHT * 2,
      topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2
    }
  ];
  return {
    mapKey: 'arena1',
    obstacles,
    surfaces: [],
    // Spawn positions match startMatch's fallback in main.js for arena1.
    spawns: {
      p1: { x: -24, y: GROUND_BASE_Y, z: 0 },
      p2: { x: 24, y: GROUND_BASE_Y, z: 0 }
    }
  };
}

const ARENAS = {
  arena1: buildPlainField()
};

export function getArena(mapKey) {
  const arena = ARENAS[mapKey];
  if (!arena) throw new Error(`No arena data for map: ${mapKey}`);
  return arena;
}

export function getArenaObstacles(mapKey) {
  return getArena(mapKey).obstacles;
}

export function getArenaSurfaces(mapKey) {
  return getArena(mapKey).surfaces;
}

export function getArenaSpawns(mapKey) {
  return getArena(mapKey).spawns;
}
