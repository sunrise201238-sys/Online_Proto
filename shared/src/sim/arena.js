// Arena (map) data — pure JS. The shared sim only needs the obstacles,
// surfaces, and spawn positions for collision and respawn logic. Mesh
// creation stays client-side.

import { GROUND_BASE_Y } from './constants.js';

// Each obstacle is an axis-aligned bounding box (AABB) used for unit and
// projectile collision. Optional flags:
//   topBuffer    — units above maxY+topBuffer are NOT colliding (for jumping
//                  over short obstacles); default 4.
//   noProjectile — projectiles pass through (for unit-only fences).
//
// Surfaces describe walkable ground at non-zero heights (platforms, ramps).
// heightAt(x, z) returns the surface Y for a point inside the surface bbox.

// Per-map play-area half-extents. Wall obstacles are placed at ±halfX
// (along X) and ±halfZ (along Z) — same positions where the offline
// `addBoundaryIndicator` helper draws its red ground stripes inside
// client/src/main.js. Lobby and Station never had an indicator in offline
// either, so they fall back to the original ±138 outer cannon-wall extent.
// Any map id not listed here defaults to ±138 (matching the previous
// global behaviour).
const MAP_BOUNDARY = {
  arena1:     { halfX: 120, halfZ: 120 },  // Plain Field
  arena2:     { halfX: 128, halfZ:  92 },  // Streets
  factory:    { halfX: 130, halfZ: 105 },
  factory2:   { halfX: 130, halfZ: 105 },
  square:     { halfX: 116, halfZ: 106 },
  lobby:      { halfX: 138, halfZ: 138 },
  station:    { halfX: 138, halfZ: 138 },
  flashpoint: { halfX: 110, halfZ:  75 },
  airport:    { halfX: 138, halfZ: 112 }
};
const BOUNDARY_WALL_THICKNESS = 2;
const BOUNDARY_WALL_HEIGHT = 16;

function makeBoundaryObstacles(mapKey) {
  const { halfX, halfZ } = MAP_BOUNDARY[mapKey] ?? { halfX: 138, halfZ: 138 };
  const T = BOUNDARY_WALL_THICKNESS;
  const H2 = BOUNDARY_WALL_HEIGHT * 2;
  return [
    { minX: halfX - T,    maxX: halfX + T,    minZ: -halfZ,        maxZ:  halfZ,        minY: 0, maxY: H2, topBuffer: H2 },
    { minX: -halfX - T,   maxX: -halfX + T,   minZ: -halfZ,        maxZ:  halfZ,        minY: 0, maxY: H2, topBuffer: H2 },
    { minX: -halfX,       maxX:  halfX,       minZ:  halfZ - T,    maxZ:  halfZ + T,    minY: 0, maxY: H2, topBuffer: H2 },
    { minX: -halfX,       maxX:  halfX,       minZ: -halfZ - T,    maxZ: -halfZ + T,    minY: 0, maxY: H2, topBuffer: H2 }
  ];
}

function buildPlainField() {
  return {
    mapKey: 'arena1',
    obstacles: makeBoundaryObstacles('arena1'),
    surfaces: [],
    spawns: {
      p1: { x: -24, y: GROUND_BASE_Y, z: 0 },
      p2: { x: 24, y: GROUND_BASE_Y, z: 0 }
    }
  };
}

const GENERATED_ARENA_COLLISION_DATA = {
  "factory2": {
    "obstacles": [
      {
        "minX": -132,
        "maxX": 132,
        "minZ": 105,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -132,
        "maxX": 132,
        "minZ": -107,
        "maxZ": -105,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -132,
        "maxX": -130,
        "minZ": -107,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 130,
        "maxX": 132,
        "minZ": -107,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": -105.3,
        "maxZ": -104.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": 104.7,
        "maxZ": 105.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -59.8,
        "maxX": 59.8,
        "minZ": -31.8,
        "maxZ": 31.8,
        "minY": 0,
        "maxY": 3.7,
        "topBuffer": 0
      },
      {
        "minX": -52,
        "maxX": -8,
        "minZ": -32.5,
        "maxZ": -31.5,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": 8,
        "maxX": 52,
        "minZ": -32.5,
        "maxZ": -31.5,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -52,
        "maxX": -8,
        "minZ": 31.5,
        "maxZ": 32.5,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": 8,
        "maxX": 52,
        "minZ": 31.5,
        "maxZ": 32.5,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -60.5,
        "maxX": -59.5,
        "minZ": -32,
        "maxZ": -24,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": 59.5,
        "maxX": 60.5,
        "minZ": -32,
        "maxZ": -24,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -60.5,
        "maxX": -59.5,
        "minZ": -8,
        "maxZ": 8,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": 59.5,
        "maxX": 60.5,
        "minZ": -8,
        "maxZ": 8,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -60.5,
        "maxX": -59.5,
        "minZ": 24,
        "maxZ": 32,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": 59.5,
        "maxX": 60.5,
        "minZ": 24,
        "maxZ": 32,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": -22.799999999999997,
        "maxZ": -22,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": -10,
        "maxZ": -9.2,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": 9.2,
        "maxZ": 10,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": 22,
        "maxZ": 22.799999999999997,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": -22.799999999999997,
        "maxZ": -22,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": -10,
        "maxZ": -9.2,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": 9.2,
        "maxZ": 10,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": 22,
        "maxZ": 22.799999999999997,
        "minY": 0,
        "maxY": 6,
        "topBuffer": 0
      },
      {
        "minX": -3.5,
        "maxX": 3.5,
        "minZ": -23,
        "maxZ": -17,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -3.7,
        "maxX": 3.7,
        "minZ": -23.2,
        "maxZ": -16.8,
        "minY": 12.05,
        "maxY": 12.55
      },
      {
        "minX": -3.5,
        "maxX": 3.5,
        "minZ": 17,
        "maxZ": 23,
        "minY": 4,
        "maxY": 12
      },
      {
        "minX": -3.7,
        "maxX": 3.7,
        "minZ": 16.8,
        "maxZ": 23.2,
        "minY": 12.05,
        "maxY": 12.55
      },
      {
        "minX": -2.6500000000000004,
        "maxX": -1.7500000000000002,
        "minZ": -2.25,
        "maxZ": 2.25,
        "minY": 4,
        "maxY": 13
      },
      {
        "minX": 1.7500000000000002,
        "maxX": 2.6500000000000004,
        "minZ": -2.25,
        "maxZ": 2.25,
        "minY": 4,
        "maxY": 13
      },
      {
        "minX": -2.8,
        "maxX": 2.8,
        "minZ": -2.25,
        "maxZ": 2.25,
        "minY": 12.65,
        "maxY": 14.15
      },
      {
        "minX": -2.7,
        "maxX": 2.7,
        "minZ": -2.1,
        "maxZ": 2.1,
        "minY": 3.9999999999999996,
        "maxY": 6.199999999999999
      },
      {
        "minX": -96,
        "maxX": -92,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.19999999999999996,
        "maxY": 2.5999999999999996,
        "topBuffer": 2
      },
      {
        "minX": -96.55,
        "maxX": -96.05,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": -91.95,
        "maxX": -91.45,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": -25.3,
        "maxZ": -22.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": -16.3,
        "maxZ": -13.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": -7.3,
        "maxZ": -4.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": 1.7,
        "maxZ": 4.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": 10.7,
        "maxZ": 13.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -95.3,
        "maxX": -92.7,
        "minZ": 19.7,
        "maxZ": 22.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92,
        "maxX": 96,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.19999999999999996,
        "maxY": 2.5999999999999996,
        "topBuffer": 2
      },
      {
        "minX": 91.45,
        "maxX": 91.95,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": 96.05,
        "maxX": 96.55,
        "minZ": -30,
        "maxZ": 30,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": -25.3,
        "maxZ": -22.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": -16.3,
        "maxZ": -13.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": -7.3,
        "maxZ": -4.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": 1.7,
        "maxZ": 4.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": 10.7,
        "maxZ": 13.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 92.7,
        "maxX": 95.3,
        "minZ": 19.7,
        "maxZ": 22.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -7,
        "maxX": 7,
        "minZ": -66.3,
        "maxZ": -65.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -7.1,
        "maxX": 7.1,
        "minZ": -66.4,
        "maxZ": -65.6,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -7,
        "maxX": 7,
        "minZ": 65.7,
        "maxZ": 66.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -7.1,
        "maxX": 7.1,
        "minZ": 65.6,
        "maxZ": 66.4,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -42.3,
        "maxX": -41.7,
        "minZ": -86,
        "maxZ": -74,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -42.4,
        "maxX": -41.6,
        "minZ": -86.1,
        "maxZ": -73.9,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 41.7,
        "maxX": 42.3,
        "minZ": 74,
        "maxZ": 86,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 41.6,
        "maxX": 42.4,
        "minZ": 73.9,
        "maxZ": 86.1,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -90,
        "maxX": -78,
        "minZ": 61.7,
        "maxZ": 62.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -90.1,
        "maxX": -77.9,
        "minZ": 61.6,
        "maxZ": 62.4,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 78,
        "maxX": 90,
        "minZ": -62.3,
        "maxZ": -61.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 77.9,
        "maxX": 90.1,
        "minZ": -62.4,
        "maxZ": -61.6,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -72.3,
        "maxX": -71.7,
        "minZ": -51,
        "maxZ": -41,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -72.4,
        "maxX": -71.6,
        "minZ": -51.1,
        "maxZ": -40.9,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 71.7,
        "maxX": 72.3,
        "minZ": 41,
        "maxZ": 51,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 71.6,
        "maxX": 72.4,
        "minZ": 40.9,
        "maxZ": 51.1,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -32.5,
        "maxX": -27.5,
        "minZ": -56.5,
        "maxZ": -47.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -32.7,
        "maxX": -27.3,
        "minZ": -56.7,
        "maxZ": -47.3,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -30.8,
        "maxX": -29.2,
        "minZ": -56,
        "maxZ": -53.599999999999994,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": -27.65,
        "maxX": -27.15,
        "minZ": -56.5,
        "maxZ": -47.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": 27.5,
        "maxX": 32.5,
        "minZ": 47.5,
        "maxZ": 56.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 27.3,
        "maxX": 32.7,
        "minZ": 47.3,
        "maxZ": 56.7,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 29.2,
        "maxX": 30.8,
        "minZ": 48,
        "maxZ": 50.400000000000006,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": 32.35,
        "maxX": 32.85,
        "minZ": 47.5,
        "maxZ": 56.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": -80.5,
        "maxX": -75.5,
        "minZ": 77.5,
        "maxZ": 86.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -80.7,
        "maxX": -75.3,
        "minZ": 77.3,
        "maxZ": 86.7,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -78.8,
        "maxX": -77.2,
        "minZ": 78,
        "maxZ": 80.4,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": -75.65,
        "maxX": -75.15,
        "minZ": 77.5,
        "maxZ": 86.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": 75.5,
        "maxX": 80.5,
        "minZ": -86.5,
        "maxZ": -77.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 75.3,
        "maxX": 80.7,
        "minZ": -86.7,
        "maxZ": -77.3,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 77.2,
        "maxX": 78.8,
        "minZ": -86,
        "maxZ": -83.6,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": 80.35,
        "maxX": 80.85,
        "minZ": -86.5,
        "maxZ": -77.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": -110.5,
        "maxX": -105.5,
        "minZ": -74.5,
        "maxZ": -65.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -110.7,
        "maxX": -105.3,
        "minZ": -74.7,
        "maxZ": -65.3,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -108.8,
        "maxX": -107.2,
        "minZ": -74,
        "maxZ": -71.6,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": -105.65,
        "maxX": -105.15,
        "minZ": -74.5,
        "maxZ": -65.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": 105.5,
        "maxX": 110.5,
        "minZ": 65.5,
        "maxZ": 74.5,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 105.3,
        "maxX": 110.7,
        "minZ": 65.3,
        "maxZ": 74.7,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 107.2,
        "maxX": 108.8,
        "minZ": 66,
        "maxZ": 68.4,
        "minY": 3.8499999999999996,
        "maxY": 5.35
      },
      {
        "minX": 110.35,
        "maxX": 110.85,
        "minZ": 65.5,
        "maxZ": 74.5,
        "minY": 3.8,
        "maxY": 8.399999999999999
      },
      {
        "minX": -34.5,
        "maxX": -29.5,
        "minZ": 9.5,
        "maxZ": 18.5,
        "minY": 4,
        "maxY": 7.4
      },
      {
        "minX": -34.7,
        "maxX": -29.3,
        "minZ": 9.3,
        "maxZ": 18.7,
        "minY": 7.4,
        "maxY": 7.9
      },
      {
        "minX": -32.8,
        "maxX": -31.2,
        "minZ": 10,
        "maxZ": 12.399999999999999,
        "minY": 7.85,
        "maxY": 9.35
      },
      {
        "minX": -29.65,
        "maxX": -29.15,
        "minZ": 9.5,
        "maxZ": 18.5,
        "minY": 7.8,
        "maxY": 12.399999999999999
      },
      {
        "minX": 29.5,
        "maxX": 34.5,
        "minZ": -18.5,
        "maxZ": -9.5,
        "minY": 4,
        "maxY": 7.4
      },
      {
        "minX": 29.3,
        "maxX": 34.7,
        "minZ": -18.7,
        "maxZ": -9.3,
        "minY": 7.4,
        "maxY": 7.9
      },
      {
        "minX": 31.2,
        "maxX": 32.8,
        "minZ": -18,
        "maxZ": -15.600000000000001,
        "minY": 7.85,
        "maxY": 9.35
      },
      {
        "minX": 34.35,
        "maxX": 34.85,
        "minZ": -18.5,
        "maxZ": -9.5,
        "minY": 7.8,
        "maxY": 12.399999999999999
      },
      {
        "minX": 11.5,
        "maxX": 16.5,
        "minZ": -31.5,
        "maxZ": -22.5,
        "minY": 4,
        "maxY": 7.4
      },
      {
        "minX": 11.3,
        "maxX": 16.7,
        "minZ": -31.7,
        "maxZ": -22.3,
        "minY": 7.4,
        "maxY": 7.9
      },
      {
        "minX": 13.2,
        "maxX": 14.8,
        "minZ": -31,
        "maxZ": -28.6,
        "minY": 7.85,
        "maxY": 9.35
      },
      {
        "minX": 16.35,
        "maxX": 16.85,
        "minZ": -31.5,
        "maxZ": -22.5,
        "minY": 7.8,
        "maxY": 12.399999999999999
      },
      {
        "minX": -16.5,
        "maxX": -11.5,
        "minZ": 22.5,
        "maxZ": 31.5,
        "minY": 4,
        "maxY": 7.4
      },
      {
        "minX": -16.7,
        "maxX": -11.3,
        "minZ": 22.3,
        "maxZ": 31.7,
        "minY": 7.4,
        "maxY": 7.9
      },
      {
        "minX": -14.8,
        "maxX": -13.2,
        "minZ": 23,
        "maxZ": 25.4,
        "minY": 7.85,
        "maxY": 9.35
      },
      {
        "minX": -11.65,
        "maxX": -11.15,
        "minZ": 22.5,
        "maxZ": 31.5,
        "minY": 7.8,
        "maxY": 12.399999999999999
      },
      {
        "minX": -80.5,
        "maxX": -71.5,
        "minZ": -37,
        "maxZ": -31,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": -80.7,
        "maxX": -71.3,
        "minZ": -37.2,
        "maxZ": -30.8,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": -75,
        "maxX": -71.80000000000001,
        "minZ": -31.05,
        "maxZ": -30.55,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": -81.3,
        "maxX": -70.7,
        "minZ": -37.8,
        "maxZ": -30.2,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 71.5,
        "maxX": 80.5,
        "minZ": 31,
        "maxZ": 37,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": 71.3,
        "maxX": 80.7,
        "minZ": 30.8,
        "maxZ": 37.2,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": 77,
        "maxX": 80.19999999999999,
        "minZ": 36.95,
        "maxZ": 37.45,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": 70.7,
        "maxX": 81.3,
        "minZ": 30.2,
        "maxZ": 37.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -24.5,
        "maxX": -15.5,
        "minZ": -89,
        "maxZ": -83,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": -24.7,
        "maxX": -15.3,
        "minZ": -89.2,
        "maxZ": -82.8,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": -19,
        "maxX": -15.799999999999999,
        "minZ": -83.05,
        "maxZ": -82.55,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": -25.3,
        "maxX": -14.7,
        "minZ": -89.8,
        "maxZ": -82.2,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 15.5,
        "maxX": 24.5,
        "minZ": 83,
        "maxZ": 89,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": 15.3,
        "maxX": 24.7,
        "minZ": 82.8,
        "maxZ": 89.2,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": 21,
        "maxX": 24.200000000000003,
        "minZ": 88.95,
        "maxZ": 89.45,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": 14.7,
        "maxX": 25.3,
        "minZ": 82.2,
        "maxZ": 89.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -118.5,
        "maxX": -109.5,
        "minZ": -3,
        "maxZ": 3,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": -118.7,
        "maxX": -109.3,
        "minZ": -3.2,
        "maxZ": 3.2,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": -113,
        "maxX": -109.80000000000001,
        "minZ": 2.95,
        "maxZ": 3.45,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": -119.3,
        "maxX": -108.7,
        "minZ": -3.8,
        "maxZ": 3.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 109.5,
        "maxX": 118.5,
        "minZ": -3,
        "maxZ": 3,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": 109.3,
        "maxX": 118.7,
        "minZ": -3.2,
        "maxZ": 3.2,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": 115,
        "maxX": 118.19999999999999,
        "minZ": 2.95,
        "maxZ": 3.45,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": 108.7,
        "maxX": 119.3,
        "minZ": -3.8,
        "maxZ": 3.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -52.5,
        "maxX": -43.5,
        "minZ": 41,
        "maxZ": 47,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": -52.7,
        "maxX": -43.3,
        "minZ": 40.8,
        "maxZ": 47.2,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": -47,
        "maxX": -43.8,
        "minZ": 46.95,
        "maxZ": 47.45,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": -53.3,
        "maxX": -42.7,
        "minZ": 40.2,
        "maxZ": 47.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 43.5,
        "maxX": 52.5,
        "minZ": -47,
        "maxZ": -41,
        "minY": 0,
        "maxY": 8.5
      },
      {
        "minX": 43.3,
        "maxX": 52.7,
        "minZ": -47.2,
        "maxZ": -40.8,
        "minY": 8.5,
        "maxY": 9.100000000000001
      },
      {
        "minX": 49,
        "maxX": 52.2,
        "minZ": -41.05,
        "maxZ": -40.55,
        "minY": 3.5,
        "maxY": 6.9
      },
      {
        "minX": 42.7,
        "maxX": 53.3,
        "minZ": -47.8,
        "maxZ": -40.2,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -59,
        "maxX": -49,
        "minZ": -71.6,
        "maxZ": -68.4,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -59.15,
        "maxX": -48.85,
        "minZ": -71.75,
        "maxZ": -68.25,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": 49,
        "maxX": 59,
        "minZ": 68.4,
        "maxZ": 71.6,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 48.85,
        "maxX": 59.15,
        "minZ": 68.25,
        "maxZ": 71.75,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": 103,
        "maxX": 113,
        "minZ": -53.6,
        "maxZ": -50.4,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 102.85,
        "maxX": 113.15,
        "minZ": -53.75,
        "maxZ": -50.25,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -113,
        "maxX": -103,
        "minZ": 50.4,
        "maxZ": 53.6,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -113.15,
        "maxX": -102.85,
        "minZ": 50.25,
        "maxZ": 53.75,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -87.6,
        "maxX": -84.4,
        "minZ": -61,
        "maxZ": -51,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -87.75,
        "maxX": -84.25,
        "minZ": -61.15,
        "maxZ": -50.85,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": 84.4,
        "maxX": 87.6,
        "minZ": 51,
        "maxZ": 61,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 84.25,
        "maxX": 87.75,
        "minZ": 50.85,
        "maxZ": 61.15,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -103.6,
        "maxX": -100.4,
        "minZ": -31,
        "maxZ": -21,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -103.75,
        "maxX": -100.25,
        "minZ": -31.15,
        "maxZ": -20.85,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": 100.4,
        "maxX": 103.6,
        "minZ": 21,
        "maxZ": 31,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 100.25,
        "maxX": 103.75,
        "minZ": 20.85,
        "maxZ": 31.15,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -29,
        "maxX": -19,
        "minZ": 38.4,
        "maxZ": 41.6,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -29.15,
        "maxX": -18.85,
        "minZ": 38.25,
        "maxZ": 41.75,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": 19,
        "maxX": 29,
        "minZ": -41.6,
        "maxZ": -38.4,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 18.85,
        "maxX": 29.15,
        "minZ": -41.75,
        "maxZ": -38.25,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -1.6,
        "maxX": 1.6,
        "minZ": 85,
        "maxZ": 95,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -1.75,
        "maxX": 1.75,
        "minZ": 84.85,
        "maxZ": 95.15,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -1.6,
        "maxX": 1.6,
        "minZ": -95,
        "maxZ": -85,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -1.75,
        "maxX": 1.75,
        "minZ": -95.15,
        "maxZ": -84.85,
        "minY": 7.999999999999999,
        "maxY": 8.399999999999999
      },
      {
        "minX": -15.1,
        "maxX": -8.9,
        "minZ": 48.9,
        "maxZ": 55.1,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -15,
        "maxX": -9,
        "minZ": 49,
        "maxZ": 55,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -13.44,
        "maxX": -13.26,
        "minZ": 48.97,
        "maxZ": 55.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -12.09,
        "maxX": -11.91,
        "minZ": 48.97,
        "maxZ": 55.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -10.74,
        "maxX": -10.56,
        "minZ": 48.97,
        "maxZ": 55.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -15.075,
        "maxX": -14.625,
        "minZ": 48.975,
        "maxZ": 55.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -9.375,
        "maxX": -8.925,
        "minZ": 48.975,
        "maxZ": 55.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -15.04,
        "maxX": -8.96,
        "minZ": 48.96,
        "maxZ": 55.04,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": 8.9,
        "maxX": 15.1,
        "minZ": -55.1,
        "maxZ": -48.9,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 9,
        "maxX": 15,
        "minZ": -55,
        "maxZ": -49,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 10.56,
        "maxX": 10.74,
        "minZ": -55.03,
        "maxZ": -48.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 11.91,
        "maxX": 12.09,
        "minZ": -55.03,
        "maxZ": -48.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 13.26,
        "maxX": 13.44,
        "minZ": -55.03,
        "maxZ": -48.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 8.925,
        "maxX": 9.375,
        "minZ": -55.025,
        "maxZ": -48.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 14.625,
        "maxX": 15.075,
        "minZ": -55.025,
        "maxZ": -48.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 8.96,
        "maxX": 15.04,
        "minZ": -55.04,
        "maxZ": -48.96,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": -101.1,
        "maxX": -94.9,
        "minZ": 80.9,
        "maxZ": 87.1,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -101,
        "maxX": -95,
        "minZ": 81,
        "maxZ": 87,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -99.44,
        "maxX": -99.25999999999999,
        "minZ": 80.97,
        "maxZ": 87.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -98.09,
        "maxX": -97.91,
        "minZ": 80.97,
        "maxZ": 87.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -96.74000000000001,
        "maxX": -96.56,
        "minZ": 80.97,
        "maxZ": 87.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -101.07499999999999,
        "maxX": -100.625,
        "minZ": 80.975,
        "maxZ": 87.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -95.375,
        "maxX": -94.92500000000001,
        "minZ": 80.975,
        "maxZ": 87.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -101.04,
        "maxX": -94.96,
        "minZ": 80.96,
        "maxZ": 87.04,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": 94.9,
        "maxX": 101.1,
        "minZ": -87.1,
        "maxZ": -80.9,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 95,
        "maxX": 101,
        "minZ": -87,
        "maxZ": -81,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 96.56,
        "maxX": 96.74000000000001,
        "minZ": -87.03,
        "maxZ": -80.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 97.91,
        "maxX": 98.09,
        "minZ": -87.03,
        "maxZ": -80.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 99.25999999999999,
        "maxX": 99.44,
        "minZ": -87.03,
        "maxZ": -80.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 94.92500000000001,
        "maxX": 95.375,
        "minZ": -87.025,
        "maxZ": -80.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 100.625,
        "maxX": 101.07499999999999,
        "minZ": -87.025,
        "maxZ": -80.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 94.96,
        "maxX": 101.04,
        "minZ": -87.04,
        "maxZ": -80.96,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": -99.1,
        "maxX": -92.9,
        "minZ": -93.1,
        "maxZ": -86.9,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -99,
        "maxX": -93,
        "minZ": -93,
        "maxZ": -87,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -97.44,
        "maxX": -97.25999999999999,
        "minZ": -93.03,
        "maxZ": -86.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -96.09,
        "maxX": -95.91,
        "minZ": -93.03,
        "maxZ": -86.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -94.74000000000001,
        "maxX": -94.56,
        "minZ": -93.03,
        "maxZ": -86.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -99.07499999999999,
        "maxX": -98.625,
        "minZ": -93.025,
        "maxZ": -86.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -93.375,
        "maxX": -92.92500000000001,
        "minZ": -93.025,
        "maxZ": -86.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -99.04,
        "maxX": -92.96,
        "minZ": -93.04,
        "maxZ": -86.96,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": 92.9,
        "maxX": 99.1,
        "minZ": 86.9,
        "maxZ": 93.1,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 93,
        "maxX": 99,
        "minZ": 87,
        "maxZ": 93,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 94.56,
        "maxX": 94.74000000000001,
        "minZ": 86.97,
        "maxZ": 93.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 95.91,
        "maxX": 96.09,
        "minZ": 86.97,
        "maxZ": 93.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 97.25999999999999,
        "maxX": 97.44,
        "minZ": 86.97,
        "maxZ": 93.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 92.92500000000001,
        "maxX": 93.375,
        "minZ": 86.975,
        "maxZ": 93.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 98.625,
        "maxX": 99.07499999999999,
        "minZ": 86.975,
        "maxZ": 93.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 92.96,
        "maxX": 99.04,
        "minZ": 86.96,
        "maxZ": 93.04,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": -125.1,
        "maxX": -118.9,
        "minZ": 54.9,
        "maxZ": 61.1,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -125,
        "maxX": -119,
        "minZ": 55,
        "maxZ": 61,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -123.44,
        "maxX": -123.25999999999999,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -122.09,
        "maxX": -121.91,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -120.74000000000001,
        "maxX": -120.56,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -125.07499999999999,
        "maxX": -124.625,
        "minZ": 54.975,
        "maxZ": 61.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -119.375,
        "maxX": -118.92500000000001,
        "minZ": 54.975,
        "maxZ": 61.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -125.04,
        "maxX": -118.96,
        "minZ": 54.96,
        "maxZ": 61.04,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": 118.9,
        "maxX": 125.1,
        "minZ": -61.1,
        "maxZ": -54.9,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 119,
        "maxX": 125,
        "minZ": -61,
        "maxZ": -55,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 120.56,
        "maxX": 120.74000000000001,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 121.91,
        "maxX": 122.09,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 123.25999999999999,
        "maxX": 123.44,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 118.92500000000001,
        "maxX": 119.375,
        "minZ": -61.025,
        "maxZ": -54.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 124.625,
        "maxX": 125.07499999999999,
        "minZ": -61.025,
        "maxZ": -54.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 118.96,
        "maxX": 125.04,
        "minZ": -61.04,
        "maxZ": -54.96,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": -23.1,
        "maxX": -16.9,
        "minZ": -27.1,
        "maxZ": -20.9,
        "minY": 4,
        "maxY": 4.5
      },
      {
        "minX": -23,
        "maxX": -17,
        "minZ": -27,
        "maxZ": -21,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -21.44,
        "maxX": -21.26,
        "minZ": -27.03,
        "maxZ": -20.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -20.09,
        "maxX": -19.91,
        "minZ": -27.03,
        "maxZ": -20.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -18.74,
        "maxX": -18.56,
        "minZ": -27.03,
        "maxZ": -20.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -23.075000000000003,
        "maxX": -22.625,
        "minZ": -27.025,
        "maxZ": -20.975,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -17.375,
        "maxX": -16.924999999999997,
        "minZ": -27.025,
        "maxZ": -20.975,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -23.04,
        "maxX": -16.96,
        "minZ": -27.04,
        "maxZ": -20.96,
        "minY": 7.1000000000000005,
        "maxY": 7.7
      },
      {
        "minX": 16.9,
        "maxX": 23.1,
        "minZ": 20.9,
        "maxZ": 27.1,
        "minY": 4,
        "maxY": 4.5
      },
      {
        "minX": 17,
        "maxX": 23,
        "minZ": 21,
        "maxZ": 27,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 18.56,
        "maxX": 18.74,
        "minZ": 20.97,
        "maxZ": 27.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 19.91,
        "maxX": 20.09,
        "minZ": 20.97,
        "maxZ": 27.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 21.26,
        "maxX": 21.44,
        "minZ": 20.97,
        "maxZ": 27.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 16.924999999999997,
        "maxX": 17.375,
        "minZ": 20.975,
        "maxZ": 27.025,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 22.625,
        "maxX": 23.075000000000003,
        "minZ": 20.975,
        "maxZ": 27.025,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 16.96,
        "maxX": 23.04,
        "minZ": 20.96,
        "maxZ": 27.04,
        "minY": 7.1000000000000005,
        "maxY": 7.7
      },
      {
        "minX": -47.1,
        "maxX": -40.9,
        "minZ": 16.9,
        "maxZ": 23.1,
        "minY": 4,
        "maxY": 4.5
      },
      {
        "minX": -47,
        "maxX": -41,
        "minZ": 17,
        "maxZ": 23,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -45.440000000000005,
        "maxX": -45.26,
        "minZ": 16.97,
        "maxZ": 23.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -44.09,
        "maxX": -43.91,
        "minZ": 16.97,
        "maxZ": 23.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -42.74,
        "maxX": -42.559999999999995,
        "minZ": 16.97,
        "maxZ": 23.03,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": -47.075,
        "maxX": -46.625,
        "minZ": 16.975,
        "maxZ": 23.025,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -41.375,
        "maxX": -40.925,
        "minZ": 16.975,
        "maxZ": 23.025,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": -47.04,
        "maxX": -40.96,
        "minZ": 16.96,
        "maxZ": 23.04,
        "minY": 7.1000000000000005,
        "maxY": 7.7
      },
      {
        "minX": 40.9,
        "maxX": 47.1,
        "minZ": -23.1,
        "maxZ": -16.9,
        "minY": 4,
        "maxY": 4.5
      },
      {
        "minX": 41,
        "maxX": 47,
        "minZ": -23,
        "maxZ": -17,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 42.559999999999995,
        "maxX": 42.74,
        "minZ": -23.03,
        "maxZ": -16.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 43.91,
        "maxX": 44.09,
        "minZ": -23.03,
        "maxZ": -16.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 45.26,
        "maxX": 45.440000000000005,
        "minZ": -23.03,
        "maxZ": -16.97,
        "minY": 4.6,
        "maxY": 11.799999999999999
      },
      {
        "minX": 40.925,
        "maxX": 41.375,
        "minZ": -23.025,
        "maxZ": -16.975,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 46.625,
        "maxX": 47.075,
        "minZ": -23.025,
        "maxZ": -16.975,
        "minY": 4.5,
        "maxY": 12
      },
      {
        "minX": 40.96,
        "maxX": 47.04,
        "minZ": -23.04,
        "maxZ": -16.96,
        "minY": 7.1000000000000005,
        "maxY": 7.7
      },
      {
        "minX": -55.1,
        "maxX": -48.9,
        "minZ": 54.9,
        "maxZ": 61.1,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -55,
        "maxX": -49,
        "minZ": 55,
        "maxZ": 61,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -53.440000000000005,
        "maxX": -53.26,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -52.09,
        "maxX": -51.91,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -50.74,
        "maxX": -50.559999999999995,
        "minZ": 54.97,
        "maxZ": 61.03,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": -55.075,
        "maxX": -54.625,
        "minZ": 54.975,
        "maxZ": 61.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -49.375,
        "maxX": -48.925,
        "minZ": 54.975,
        "maxZ": 61.025,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": -55.04,
        "maxX": -48.96,
        "minZ": 54.96,
        "maxZ": 61.04,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": 48.9,
        "maxX": 55.1,
        "minZ": -61.1,
        "maxZ": -54.9,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 49,
        "maxX": 55,
        "minZ": -61,
        "maxZ": -55,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 50.559999999999995,
        "maxX": 50.74,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 51.91,
        "maxX": 52.09,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 53.26,
        "maxX": 53.440000000000005,
        "minZ": -61.03,
        "maxZ": -54.97,
        "minY": 0.6000000000000001,
        "maxY": 7.800000000000001
      },
      {
        "minX": 48.925,
        "maxX": 49.375,
        "minZ": -61.025,
        "maxZ": -54.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 54.625,
        "maxX": 55.075,
        "minZ": -61.025,
        "maxZ": -54.975,
        "minY": 0.5,
        "maxY": 8
      },
      {
        "minX": 48.96,
        "maxX": 55.04,
        "minZ": -61.04,
        "maxZ": -54.96,
        "minY": 3.1,
        "maxY": 3.6999999999999997
      },
      {
        "minX": -120.2,
        "maxX": -115.8,
        "minZ": -90.2,
        "maxZ": -85.8,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": -114.2,
        "maxX": -109.8,
        "minZ": -82.2,
        "maxZ": -77.8,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": 115.8,
        "maxX": 120.2,
        "minZ": 85.8,
        "maxZ": 90.2,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": 109.8,
        "maxX": 114.2,
        "minZ": 77.8,
        "maxZ": 82.2,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": 115.8,
        "maxX": 120.2,
        "minZ": -86.2,
        "maxZ": -81.8,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": -120.2,
        "maxX": -115.8,
        "minZ": 81.8,
        "maxZ": 86.2,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": -120.75,
        "maxX": -120.25,
        "minZ": 27.75,
        "maxZ": 28.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -115.75,
        "maxX": -115.25,
        "minZ": 27.75,
        "maxZ": 28.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -120.7,
        "maxX": -115.3,
        "minZ": 27.1,
        "maxZ": 28.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -120.7,
        "maxX": -115.3,
        "minZ": 27.1,
        "maxZ": 28.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -120.2,
        "maxX": -118.8,
        "minZ": 27.3,
        "maxZ": 28.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -117.2,
        "maxX": -115.8,
        "minZ": 27.3,
        "maxZ": 28.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 115.25,
        "maxX": 115.75,
        "minZ": -28.25,
        "maxZ": -27.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 120.25,
        "maxX": 120.75,
        "minZ": -28.25,
        "maxZ": -27.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 115.3,
        "maxX": 120.7,
        "minZ": -28.9,
        "maxZ": -27.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 115.3,
        "maxX": 120.7,
        "minZ": -28.9,
        "maxZ": -27.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 115.8,
        "maxX": 117.2,
        "minZ": -28.7,
        "maxZ": -27.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 118.8,
        "maxX": 120.2,
        "minZ": -28.7,
        "maxZ": -27.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -66.75,
        "maxX": -66.25,
        "minZ": -94.25,
        "maxZ": -93.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -61.75,
        "maxX": -61.25,
        "minZ": -94.25,
        "maxZ": -93.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -66.7,
        "maxX": -61.3,
        "minZ": -94.9,
        "maxZ": -93.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -66.7,
        "maxX": -61.3,
        "minZ": -94.9,
        "maxZ": -93.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -66.2,
        "maxX": -64.8,
        "minZ": -94.7,
        "maxZ": -93.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -63.2,
        "maxX": -61.8,
        "minZ": -94.7,
        "maxZ": -93.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 61.25,
        "maxX": 61.75,
        "minZ": 93.75,
        "maxZ": 94.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 66.25,
        "maxX": 66.75,
        "minZ": 93.75,
        "maxZ": 94.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 61.3,
        "maxX": 66.7,
        "minZ": 93.1,
        "maxZ": 94.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 61.3,
        "maxX": 66.7,
        "minZ": 93.1,
        "maxZ": 94.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 61.8,
        "maxX": 63.2,
        "minZ": 93.3,
        "maxZ": 94.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 64.8,
        "maxX": 66.2,
        "minZ": 93.3,
        "maxZ": 94.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -13.3,
        "maxX": -10.7,
        "minZ": -89.3,
        "maxZ": -86.7,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": 10.7,
        "maxX": 13.3,
        "minZ": 86.7,
        "maxZ": 89.3,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": -59.3,
        "maxX": -56.7,
        "minZ": 44.7,
        "maxZ": 47.3,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": 56.7,
        "maxX": 59.3,
        "minZ": -47.3,
        "maxZ": -44.7,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": -97.3,
        "maxX": -94.7,
        "minZ": -45.3,
        "maxZ": -42.7,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": 94.7,
        "maxX": 97.3,
        "minZ": 42.7,
        "maxZ": 45.3,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": 28.7,
        "maxX": 31.3,
        "minZ": -75.3,
        "maxZ": -72.7,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": -31.3,
        "maxX": -28.7,
        "minZ": 72.7,
        "maxZ": 75.3,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": -45.3,
        "maxX": -42.7,
        "minZ": -7.3,
        "maxZ": -4.7,
        "minY": 4,
        "maxY": 6.4,
        "topBuffer": 2
      },
      {
        "minX": 42.7,
        "maxX": 45.3,
        "minZ": 4.7,
        "maxZ": 7.3,
        "minY": 4,
        "maxY": 6.4,
        "topBuffer": 2
      },
      {
        "minX": 6.7,
        "maxX": 9.3,
        "minZ": 10.7,
        "maxZ": 13.3,
        "minY": 4,
        "maxY": 6.4,
        "topBuffer": 2
      },
      {
        "minX": -9.3,
        "maxX": -6.7,
        "minZ": -13.3,
        "maxZ": -10.7,
        "minY": 4,
        "maxY": 6.4,
        "topBuffer": 2
      },
      {
        "minX": -113.3,
        "maxX": -110.7,
        "minZ": -45.3,
        "maxZ": -42.7,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      },
      {
        "minX": 110.7,
        "maxX": 113.3,
        "minZ": 42.7,
        "maxZ": 45.3,
        "minY": 0,
        "maxY": 2.4,
        "topBuffer": 2
      }
    ],
    "surfaces": [
      {
        "minX": -60,
        "maxX": 60,
        "minZ": -32,
        "maxZ": 32,
        "maxTop": 4,
        "type": "flat",
        "top": 4
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": -22,
        "maxZ": -10,
        "maxTop": 4,
        "type": "ramp",
        "axis": "x",
        "lowY": 4,
        "highY": 0
      },
      {
        "minX": 60,
        "maxX": 82,
        "minZ": 10,
        "maxZ": 22,
        "maxTop": 4,
        "type": "ramp",
        "axis": "x",
        "lowY": 4,
        "highY": 0
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": -22,
        "maxZ": -10,
        "maxTop": 4,
        "type": "ramp",
        "axis": "x",
        "lowY": 0,
        "highY": 4
      },
      {
        "minX": -82,
        "maxX": -60,
        "minZ": 10,
        "maxZ": 22,
        "maxTop": 4,
        "type": "ramp",
        "axis": "x",
        "lowY": 0,
        "highY": 4
      },
      {
        "minX": -96,
        "maxX": -92,
        "minZ": -30,
        "maxZ": 30,
        "maxTop": 2.6,
        "type": "flat",
        "top": 2.6
      },
      {
        "minX": 92,
        "maxX": 96,
        "minZ": -30,
        "maxZ": 30,
        "maxTop": 2.6,
        "type": "flat",
        "top": 2.6
      }
    ]
  },
  "arena2": {
    "obstacles": [
      {
        "minX": -114,
        "maxX": -86,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": -114,
        "maxX": -86,
        "minZ": -60,
        "maxZ": -36,
        "minY": 14,
        "maxY": 36,
        "topBuffer": 2
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 11
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": -60,
        "maxZ": -36,
        "minY": 11,
        "maxY": 33,
        "topBuffer": 2
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 16
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": -60,
        "maxZ": -36,
        "minY": 16,
        "maxY": 38,
        "topBuffer": 2
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 16
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": -60,
        "maxZ": -36,
        "minY": 16,
        "maxY": 38,
        "topBuffer": 2
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": -60,
        "maxZ": -36,
        "minY": 12,
        "maxY": 34,
        "topBuffer": 2
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 15
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": -60,
        "maxZ": -36,
        "minY": 15,
        "maxY": 37,
        "topBuffer": 2
      },
      {
        "minX": -114,
        "maxX": -86,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 13
      },
      {
        "minX": -114,
        "maxX": -86,
        "minZ": 36,
        "maxZ": 60,
        "minY": 13,
        "maxY": 35,
        "topBuffer": 2
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 16
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": 36,
        "maxZ": 60,
        "minY": 16,
        "maxY": 38,
        "topBuffer": 2
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": 36,
        "maxZ": 60,
        "minY": 12,
        "maxY": 34,
        "topBuffer": 2
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": 36,
        "maxZ": 60,
        "minY": 14,
        "maxY": 36,
        "topBuffer": 2
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 17
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": 36,
        "maxZ": 60,
        "minY": 17,
        "maxY": 39,
        "topBuffer": 2
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": 36,
        "maxZ": 60,
        "minY": 12,
        "maxY": 34,
        "topBuffer": 2
      },
      {
        "minX": -8.399999999999999,
        "maxX": -7.999999999999999,
        "minZ": -28,
        "maxZ": 28,
        "minY": 8,
        "maxY": 9.600000000000001
      },
      {
        "minX": 7.999999999999999,
        "maxX": 8.399999999999999,
        "minZ": -28,
        "maxZ": 28,
        "minY": 8,
        "maxY": 9.600000000000001
      },
      {
        "minX": -8.1,
        "maxX": -6.7,
        "minZ": -15.7,
        "maxZ": -14.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 6.7,
        "maxX": 8.1,
        "minZ": -15.7,
        "maxZ": -14.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -8.1,
        "maxX": -6.7,
        "minZ": 14.3,
        "maxZ": 15.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 6.7,
        "maxX": 8.1,
        "minZ": 14.3,
        "maxZ": 15.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -55,
        "maxZ": -49.8,
        "minY": 1.2049999999999998,
        "maxY": 2.8049999999999997
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -55,
        "maxZ": -49.8,
        "minY": 0,
        "maxY": 1.205,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -49.800000000000004,
        "maxZ": -44.6,
        "minY": 2.715,
        "maxY": 4.3149999999999995
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -49.800000000000004,
        "maxZ": -44.6,
        "minY": 0,
        "maxY": 2.715,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -44.6,
        "maxZ": -39.4,
        "minY": 4.225,
        "maxY": 5.824999999999999
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -44.6,
        "maxZ": -39.4,
        "minY": 0,
        "maxY": 4.225,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -39.4,
        "maxZ": -34.199999999999996,
        "minY": 5.734999999999999,
        "maxY": 7.334999999999999
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -39.4,
        "maxZ": -34.199999999999996,
        "minY": 0,
        "maxY": 5.734999999999999,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -34.2,
        "maxZ": -29,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -34.2,
        "maxZ": -29,
        "minY": 0,
        "maxY": 7.245,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 49.8,
        "maxZ": 55,
        "minY": 1.2049999999999998,
        "maxY": 2.8049999999999997
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 49.8,
        "maxZ": 55,
        "minY": 0,
        "maxY": 1.205,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 44.6,
        "maxZ": 49.800000000000004,
        "minY": 2.715,
        "maxY": 4.3149999999999995
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 44.6,
        "maxZ": 49.800000000000004,
        "minY": 0,
        "maxY": 2.715,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 39.4,
        "maxZ": 44.6,
        "minY": 4.225,
        "maxY": 5.824999999999999
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 39.4,
        "maxZ": 44.6,
        "minY": 0,
        "maxY": 4.225,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 34.199999999999996,
        "maxZ": 39.4,
        "minY": 5.734999999999999,
        "maxY": 7.334999999999999
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 34.199999999999996,
        "maxZ": 39.4,
        "minY": 0,
        "maxY": 5.734999999999999,
        "noProjectile": true
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 29,
        "maxZ": 34.2,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 29,
        "maxZ": 34.2,
        "minY": 0,
        "maxY": 7.245,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -55,
        "maxZ": -49.8,
        "minY": 1.2049999999999998,
        "maxY": 2.8049999999999997
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -55,
        "maxZ": -49.8,
        "minY": 0,
        "maxY": 1.205,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -49.800000000000004,
        "maxZ": -44.6,
        "minY": 2.715,
        "maxY": 4.3149999999999995
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -49.800000000000004,
        "maxZ": -44.6,
        "minY": 0,
        "maxY": 2.715,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -44.6,
        "maxZ": -39.4,
        "minY": 4.225,
        "maxY": 5.824999999999999
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -44.6,
        "maxZ": -39.4,
        "minY": 0,
        "maxY": 4.225,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -39.4,
        "maxZ": -34.199999999999996,
        "minY": 5.734999999999999,
        "maxY": 7.334999999999999
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -39.4,
        "maxZ": -34.199999999999996,
        "minY": 0,
        "maxY": 5.734999999999999,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -34.2,
        "maxZ": -29,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -34.2,
        "maxZ": -29,
        "minY": 0,
        "maxY": 7.245,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 49.8,
        "maxZ": 55,
        "minY": 1.2049999999999998,
        "maxY": 2.8049999999999997
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 49.8,
        "maxZ": 55,
        "minY": 0,
        "maxY": 1.205,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 44.6,
        "maxZ": 49.800000000000004,
        "minY": 2.715,
        "maxY": 4.3149999999999995
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 44.6,
        "maxZ": 49.800000000000004,
        "minY": 0,
        "maxY": 2.715,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 39.4,
        "maxZ": 44.6,
        "minY": 4.225,
        "maxY": 5.824999999999999
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 39.4,
        "maxZ": 44.6,
        "minY": 0,
        "maxY": 4.225,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 34.199999999999996,
        "maxZ": 39.4,
        "minY": 5.734999999999999,
        "maxY": 7.334999999999999
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 34.199999999999996,
        "maxZ": 39.4,
        "minY": 0,
        "maxY": 5.734999999999999,
        "noProjectile": true
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 29,
        "maxZ": 34.2,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 29,
        "maxZ": 34.2,
        "minY": 0,
        "maxY": 7.245,
        "noProjectile": true
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -28.225,
        "maxZ": -27.775,
        "minY": 0,
        "maxY": 6,
        "noProjectile": true
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": 27.775,
        "maxZ": 28.225,
        "minY": 0,
        "maxY": 6,
        "noProjectile": true
      },
      {
        "minX": -112.5,
        "maxX": -107.5,
        "minZ": -96.5,
        "maxZ": -91.5,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": 107.5,
        "maxX": 112.5,
        "minZ": 91.5,
        "maxZ": 96.5,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -112.5,
        "maxX": -107.5,
        "minZ": 91.5,
        "maxZ": 96.5,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": 107.5,
        "maxX": 112.5,
        "minZ": -96.5,
        "maxZ": -91.5,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": -110.175,
        "maxX": -109.825,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -110.175,
        "maxX": -109.825,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -88.175,
        "maxX": -87.825,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -88.175,
        "maxX": -87.825,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -66.175,
        "maxX": -65.825,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -66.175,
        "maxX": -65.825,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -44.175,
        "maxX": -43.825,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -44.175,
        "maxX": -43.825,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 43.825,
        "maxX": 44.175,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 43.825,
        "maxX": 44.175,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 65.825,
        "maxX": 66.175,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 65.825,
        "maxX": 66.175,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 87.825,
        "maxX": 88.175,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 87.825,
        "maxX": 88.175,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 109.825,
        "maxX": 110.175,
        "minZ": -15.175,
        "maxZ": -14.825,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": 109.825,
        "maxX": 110.175,
        "minZ": 14.825,
        "maxZ": 15.175,
        "minY": 0,
        "maxY": 18.2
      },
      {
        "minX": -97.5,
        "maxX": -92.5,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -96,
        "maxX": -91,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -52.5,
        "maxX": -47.5,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -51,
        "maxX": -46,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 22.5,
        "maxX": 27.5,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 24,
        "maxX": 29,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 77.5,
        "maxX": 82.5,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 76,
        "maxX": 81,
        "minZ": -16.7,
        "maxZ": -13.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -80.5,
        "maxX": -75.5,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -79,
        "maxX": -74,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -27.5,
        "maxX": -22.5,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -26,
        "maxX": -21,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 47.5,
        "maxX": 52.5,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 49,
        "maxX": 54,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 92.5,
        "maxX": 97.5,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 91,
        "maxX": 96,
        "minZ": 13.7,
        "maxZ": 16.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -36,
        "maxX": -24,
        "minZ": -17.25,
        "maxZ": -12.75,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -36.25,
        "maxX": -23.75,
        "minZ": -17.5,
        "maxZ": -12.5,
        "minY": 8.075,
        "maxY": 8.325
      },
      {
        "minX": 24,
        "maxX": 36,
        "minZ": 12.75,
        "maxZ": 17.25,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 23.75,
        "maxX": 36.25,
        "minZ": 12.5,
        "maxZ": 17.5,
        "minY": 8.075,
        "maxY": 8.325
      },
      {
        "minX": -64,
        "maxX": -52,
        "minZ": 12.55,
        "maxZ": 17.05,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -64.25,
        "maxX": -51.75,
        "minZ": 12.3,
        "maxZ": 17.3,
        "minY": 8.075,
        "maxY": 8.325
      },
      {
        "minX": 54,
        "maxX": 66,
        "minZ": -17.05,
        "maxZ": -12.55,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 53.75,
        "maxX": 66.25,
        "minZ": -17.3,
        "maxZ": -12.3,
        "minY": 8.075,
        "maxY": 8.325
      },
      {
        "minX": -26,
        "maxX": -14,
        "minZ": -39.2,
        "maxZ": -36.8,
        "minY": 0,
        "maxY": 6.5
      },
      {
        "minX": 14,
        "maxX": 26,
        "minZ": -39.2,
        "maxZ": -36.8,
        "minY": 0,
        "maxY": 6.5
      },
      {
        "minX": -26,
        "maxX": -14,
        "minZ": 36.8,
        "maxZ": 39.2,
        "minY": 0,
        "maxY": 6.5
      },
      {
        "minX": 14,
        "maxX": 26,
        "minZ": 36.8,
        "maxZ": 39.2,
        "minY": 0,
        "maxY": 6.5
      },
      {
        "minX": -30.5,
        "maxX": -25.5,
        "minZ": -53.5,
        "maxZ": -50.5,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -28.5,
        "maxX": -23.5,
        "minZ": -53.5,
        "maxZ": -50.5,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 23.5,
        "maxX": 28.5,
        "minZ": 50.5,
        "maxZ": 53.5,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 25.5,
        "maxX": 30.5,
        "minZ": 50.5,
        "maxZ": 53.5,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -110,
        "maxX": 110,
        "minZ": -94.125,
        "maxZ": -93.875,
        "minY": 15.875,
        "maxY": 16.125
      },
      {
        "minX": -110,
        "maxX": 110,
        "minZ": 93.875,
        "maxZ": 94.125,
        "minY": 15.875,
        "maxY": 16.125
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": 92,
        "maxZ": 94,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": -94,
        "maxZ": -92,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": -130,
        "maxX": -128,
        "minZ": -94,
        "maxZ": 94,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": 128,
        "maxX": 130,
        "minZ": -94,
        "maxZ": 94,
        "minY": 0,
        "maxY": 28
      }
    ],
    "surfaces": [
      {
        "minX": -120,
        "maxX": 120,
        "minZ": -18,
        "maxZ": -12,
        "maxTop": 0.45,
        "type": "flat",
        "top": 0.45
      },
      {
        "minX": -120,
        "maxX": 120,
        "minZ": 12,
        "maxZ": 18,
        "maxTop": 0.45,
        "type": "flat",
        "top": 0.45
      },
      {
        "minX": -34,
        "maxX": 34,
        "minZ": -58,
        "maxZ": -18,
        "maxTop": 0.45,
        "type": "flat",
        "top": 0.45
      },
      {
        "minX": -34,
        "maxX": 34,
        "minZ": 18,
        "maxZ": 58,
        "maxTop": 0.45,
        "type": "flat",
        "top": 0.45
      },
      {
        "minX": -114,
        "maxX": -86,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 36,
        "type": "flat",
        "top": 36
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 33,
        "type": "flat",
        "top": 33
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 38,
        "type": "flat",
        "top": 38
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 38,
        "type": "flat",
        "top": 38
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 34,
        "type": "flat",
        "top": 34
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": -60,
        "maxZ": -36,
        "maxTop": 37,
        "type": "flat",
        "top": 37
      },
      {
        "minX": -114,
        "maxX": -86,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 35,
        "type": "flat",
        "top": 35
      },
      {
        "minX": -79,
        "maxX": -57,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 38,
        "type": "flat",
        "top": 38
      },
      {
        "minX": -49,
        "maxX": -35,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 34,
        "type": "flat",
        "top": 34
      },
      {
        "minX": 35,
        "maxX": 49,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 36,
        "type": "flat",
        "top": 36
      },
      {
        "minX": 57,
        "maxX": 79,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 39,
        "type": "flat",
        "top": 39
      },
      {
        "minX": 86,
        "maxX": 114,
        "minZ": 36,
        "maxZ": 60,
        "maxTop": 34,
        "type": "flat",
        "top": 34
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -28,
        "maxZ": 28,
        "maxTop": 8,
        "type": "flat",
        "top": 8
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -56,
        "maxZ": -28,
        "maxTop": 8,
        "type": "ramp",
        "axis": "z",
        "lowY": 0.45,
        "highY": 8
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": 28,
        "maxZ": 56,
        "maxTop": 8,
        "type": "ramp",
        "axis": "z",
        "lowY": 8,
        "highY": 0.45
      }
    ]
  },
  "factory": {
    "obstacles": [
      {
        "minX": -132,
        "maxX": 132,
        "minZ": 105,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -132,
        "maxX": 132,
        "minZ": -107,
        "maxZ": -105,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -132,
        "maxX": -130,
        "minZ": -107,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 130,
        "maxX": 132,
        "minZ": -107,
        "maxZ": 107,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": -105.3,
        "maxZ": -104.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": 104.7,
        "maxZ": 105.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -27,
        "maxX": -23,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.19999999999999996,
        "maxY": 2.5999999999999996,
        "topBuffer": 2
      },
      {
        "minX": -27.55,
        "maxX": -27.05,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": -22.95,
        "maxX": -22.45,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": -40.3,
        "maxZ": -37.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": -31.3,
        "maxZ": -28.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": -22.3,
        "maxZ": -19.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": -13.3,
        "maxZ": -10.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": -4.3,
        "maxZ": -1.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": 4.7,
        "maxZ": 7.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": 13.7,
        "maxZ": 16.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": 22.7,
        "maxZ": 25.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -26.3,
        "maxX": -23.7,
        "minZ": 31.7,
        "maxZ": 34.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23,
        "maxX": 27,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.19999999999999996,
        "maxY": 2.5999999999999996,
        "topBuffer": 2
      },
      {
        "minX": 22.45,
        "maxX": 22.95,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": 27.05,
        "maxX": 27.55,
        "minZ": -45,
        "maxZ": 45,
        "minY": 0.10000000000000009,
        "maxY": 2.9,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": -40.3,
        "maxZ": -37.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": -31.3,
        "maxZ": -28.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": -22.3,
        "maxZ": -19.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": -13.3,
        "maxZ": -10.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": -4.3,
        "maxZ": -1.7,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": 4.7,
        "maxZ": 7.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": 13.7,
        "maxZ": 16.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": 22.7,
        "maxZ": 25.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": 23.7,
        "maxX": 26.3,
        "minZ": 31.7,
        "maxZ": 34.3,
        "minY": 2.7,
        "maxY": 5.3,
        "topBuffer": 2
      },
      {
        "minX": -6,
        "maxX": 6,
        "minZ": -30.3,
        "maxZ": -29.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -3.06,
        "maxX": -2.94,
        "minZ": -30.35,
        "maxZ": -29.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -0.06,
        "maxX": 0.06,
        "minZ": -30.35,
        "maxZ": -29.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 2.94,
        "maxX": 3.06,
        "minZ": -30.35,
        "maxZ": -29.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -6.1,
        "maxX": 6.1,
        "minZ": -30.4,
        "maxZ": -29.6,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -6,
        "maxX": 6,
        "minZ": -30.5,
        "maxZ": -29.5,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -6,
        "maxX": 6,
        "minZ": 29.7,
        "maxZ": 30.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -3.06,
        "maxX": -2.94,
        "minZ": 29.65,
        "maxZ": 30.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -0.06,
        "maxX": 0.06,
        "minZ": 29.65,
        "maxZ": 30.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 2.94,
        "maxX": 3.06,
        "minZ": 29.65,
        "maxZ": 30.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -6.1,
        "maxX": 6.1,
        "minZ": 29.6,
        "maxZ": 30.4,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -6,
        "maxX": 6,
        "minZ": 29.5,
        "maxZ": 30.5,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -60.3,
        "maxX": -59.7,
        "minZ": -15,
        "maxZ": -5,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -60.35,
        "maxX": -59.65,
        "minZ": -12.56,
        "maxZ": -12.44,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -60.35,
        "maxX": -59.65,
        "minZ": -10.06,
        "maxZ": -9.94,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -60.35,
        "maxX": -59.65,
        "minZ": -7.56,
        "maxZ": -7.44,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -60.4,
        "maxX": -59.6,
        "minZ": -15.1,
        "maxZ": -4.9,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -60.5,
        "maxX": -59.5,
        "minZ": -15,
        "maxZ": -5,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 59.7,
        "maxX": 60.3,
        "minZ": 5,
        "maxZ": 15,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 59.65,
        "maxX": 60.35,
        "minZ": 7.44,
        "maxZ": 7.56,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 59.65,
        "maxX": 60.35,
        "minZ": 9.94,
        "maxZ": 10.06,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 59.65,
        "maxX": 60.35,
        "minZ": 12.44,
        "maxZ": 12.56,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 59.6,
        "maxX": 60.4,
        "minZ": 4.9,
        "maxZ": 15.1,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 59.5,
        "maxX": 60.5,
        "minZ": 5,
        "maxZ": 15,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -35,
        "maxX": -25,
        "minZ": -65.3,
        "maxZ": -64.7,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -32.56,
        "maxX": -32.44,
        "minZ": -65.35,
        "maxZ": -64.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -30.06,
        "maxX": -29.94,
        "minZ": -65.35,
        "maxZ": -64.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -27.56,
        "maxX": -27.44,
        "minZ": -65.35,
        "maxZ": -64.65,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -35.1,
        "maxX": -24.9,
        "minZ": -65.4,
        "maxZ": -64.6,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -35,
        "maxX": -25,
        "minZ": -65.5,
        "maxZ": -64.5,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 25,
        "maxX": 35,
        "minZ": 64.7,
        "maxZ": 65.3,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 27.44,
        "maxX": 27.56,
        "minZ": 64.65,
        "maxZ": 65.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 29.94,
        "maxX": 30.06,
        "minZ": 64.65,
        "maxZ": 65.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 32.44,
        "maxX": 32.56,
        "minZ": 64.65,
        "maxZ": 65.35,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 24.9,
        "maxX": 35.1,
        "minZ": 64.6,
        "maxZ": 65.4,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 25,
        "maxX": 35,
        "minZ": 64.5,
        "maxZ": 65.5,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -90.3,
        "maxX": -89.7,
        "minZ": 56,
        "maxZ": 64,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -90.35,
        "maxX": -89.65,
        "minZ": 57.94,
        "maxZ": 58.06,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -90.35,
        "maxX": -89.65,
        "minZ": 59.94,
        "maxZ": 60.06,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -90.35,
        "maxX": -89.65,
        "minZ": 61.94,
        "maxZ": 62.06,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": -90.4,
        "maxX": -89.6,
        "minZ": 55.9,
        "maxZ": 64.1,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": -90.5,
        "maxX": -89.5,
        "minZ": 56,
        "maxZ": 64,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 89.7,
        "maxX": 90.3,
        "minZ": -64,
        "maxZ": -56,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 89.65,
        "maxX": 90.35,
        "minZ": -62.06,
        "maxZ": -61.94,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 89.65,
        "maxX": 90.35,
        "minZ": -60.06,
        "maxZ": -59.94,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 89.65,
        "maxX": 90.35,
        "minZ": -58.06,
        "maxZ": -57.94,
        "minY": 0.10000000000000009,
        "maxY": 7.9
      },
      {
        "minX": 89.6,
        "maxX": 90.4,
        "minZ": -64.1,
        "maxZ": -55.9,
        "minY": 8,
        "maxY": 8.3
      },
      {
        "minX": 89.5,
        "maxX": 90.5,
        "minZ": -64,
        "maxZ": -56,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -77.25,
        "maxZ": -72.75,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -74.2,
        "maxX": -65.8,
        "minZ": -77.45,
        "maxZ": -72.55,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": -74.7,
        "maxZ": -73.3,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -72.85,
        "maxZ": -72.35,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -77.25,
        "maxZ": -72.75,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 65.8,
        "maxX": 74.2,
        "minZ": -77.45,
        "maxZ": -72.55,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": -74.7,
        "maxZ": -73.3,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -72.85,
        "maxZ": -72.35,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 72.75,
        "maxZ": 77.25,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -74.2,
        "maxX": -65.8,
        "minZ": 72.55,
        "maxZ": 77.45,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": 75.3,
        "maxZ": 76.7,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 77.15,
        "maxZ": 77.65,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 72.75,
        "maxZ": 77.25,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 65.8,
        "maxX": 74.2,
        "minZ": 72.55,
        "maxZ": 77.45,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": 75.3,
        "maxZ": 76.7,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 77.15,
        "maxZ": 77.65,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -27.25,
        "maxZ": -22.75,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -74.2,
        "maxX": -65.8,
        "minZ": -27.45,
        "maxZ": -22.55,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": -25.8,
        "maxZ": -24.2,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": -24.7,
        "maxZ": -23.3,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -22.85,
        "maxZ": -22.35,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -27.25,
        "maxZ": -22.75,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 65.8,
        "maxX": 74.2,
        "minZ": -27.45,
        "maxZ": -22.55,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": -25.8,
        "maxZ": -24.2,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": -24.7,
        "maxZ": -23.3,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -22.85,
        "maxZ": -22.35,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 22.75,
        "maxZ": 27.25,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": -74.2,
        "maxX": -65.8,
        "minZ": 22.55,
        "maxZ": 27.45,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": 24.2,
        "maxZ": 25.8,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": 25.3,
        "maxZ": 26.7,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 27.15,
        "maxZ": 27.65,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 22.75,
        "maxZ": 27.25,
        "minY": 0,
        "maxY": 3.4
      },
      {
        "minX": 65.8,
        "maxX": 74.2,
        "minZ": 22.55,
        "maxZ": 27.45,
        "minY": 3.4,
        "maxY": 3.9
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": 24.2,
        "maxZ": 25.8,
        "minY": 3.9000000000000004,
        "maxY": 5.4
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": 25.3,
        "maxZ": 26.7,
        "minY": 3.9000000000000004,
        "maxY": 4.9
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 27.15,
        "maxZ": 27.65,
        "minY": 3.9,
        "maxY": 8.2
      },
      {
        "minX": -42.5,
        "maxX": -37.5,
        "minZ": -77,
        "maxZ": -73,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": -42.4,
        "maxX": -41.6,
        "minZ": -77,
        "maxZ": -73,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": -38.4,
        "maxX": -37.6,
        "minZ": -77,
        "maxZ": -73,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": -42.5,
        "maxX": -37.5,
        "minZ": -77,
        "maxZ": -73,
        "minY": 7.8,
        "maxY": 9.2
      },
      {
        "minX": -41.6,
        "maxX": -38.4,
        "minZ": -77,
        "maxZ": -73,
        "minY": 2.0000000000000004,
        "maxY": 7.800000000000001
      },
      {
        "minX": -43.3,
        "maxX": -36.7,
        "minZ": -77.8,
        "maxZ": -72.2,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 37.5,
        "maxX": 42.5,
        "minZ": -77,
        "maxZ": -73,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": 37.6,
        "maxX": 38.4,
        "minZ": -77,
        "maxZ": -73,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": 41.6,
        "maxX": 42.4,
        "minZ": -77,
        "maxZ": -73,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": 37.5,
        "maxX": 42.5,
        "minZ": -77,
        "maxZ": -73,
        "minY": 7.8,
        "maxY": 9.2
      },
      {
        "minX": 38.4,
        "maxX": 41.6,
        "minZ": -77,
        "maxZ": -73,
        "minY": 2.0000000000000004,
        "maxY": 7.800000000000001
      },
      {
        "minX": 36.7,
        "maxX": 43.3,
        "minZ": -77.8,
        "maxZ": -72.2,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -42.5,
        "maxX": -37.5,
        "minZ": 73,
        "maxZ": 77,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": -42.4,
        "maxX": -41.6,
        "minZ": 73,
        "maxZ": 77,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": -38.4,
        "maxX": -37.6,
        "minZ": 73,
        "maxZ": 77,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": -42.5,
        "maxX": -37.5,
        "minZ": 73,
        "maxZ": 77,
        "minY": 7.8,
        "maxY": 9.2
      },
      {
        "minX": -41.6,
        "maxX": -38.4,
        "minZ": 73,
        "maxZ": 77,
        "minY": 2.0000000000000004,
        "maxY": 7.800000000000001
      },
      {
        "minX": -43.3,
        "maxX": -36.7,
        "minZ": 72.2,
        "maxZ": 77.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": 37.5,
        "maxX": 42.5,
        "minZ": 73,
        "maxZ": 77,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": 37.6,
        "maxX": 38.4,
        "minZ": 73,
        "maxZ": 77,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": 41.6,
        "maxX": 42.4,
        "minZ": 73,
        "maxZ": 77,
        "minY": 1,
        "maxY": 9
      },
      {
        "minX": 37.5,
        "maxX": 42.5,
        "minZ": 73,
        "maxZ": 77,
        "minY": 7.8,
        "maxY": 9.2
      },
      {
        "minX": 38.4,
        "maxX": 41.6,
        "minZ": 73,
        "maxZ": 77,
        "minY": 2.0000000000000004,
        "maxY": 7.800000000000001
      },
      {
        "minX": 36.7,
        "maxX": 43.3,
        "minZ": 72.2,
        "maxZ": 77.8,
        "minY": 0.020000000000000004,
        "maxY": 0.08
      },
      {
        "minX": -112.2,
        "maxX": -107.8,
        "minZ": -52.2,
        "maxZ": -47.8,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": -112.2,
        "maxX": -107.8,
        "minZ": -2.2,
        "maxZ": 2.2,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": -112.2,
        "maxX": -107.8,
        "minZ": 47.8,
        "maxZ": 52.2,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": 107.8,
        "maxX": 112.2,
        "minZ": -52.2,
        "maxZ": -47.8,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": 107.8,
        "maxX": 112.2,
        "minZ": -2.2,
        "maxZ": 2.2,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": 107.8,
        "maxX": 112.2,
        "minZ": 47.8,
        "maxZ": 52.2,
        "minY": 0,
        "maxY": 14
      },
      {
        "minX": -77.75,
        "maxX": -77.25,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -72.75,
        "maxX": -72.25,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -77.2,
        "maxX": -75.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -74.2,
        "maxX": -72.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -75.7,
        "maxX": -74.3,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": -77.6,
        "maxX": -72.4,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": -77.6,
        "maxX": -72.4,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": -74.2,
        "maxX": -72.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": -27.75,
        "maxX": -27.25,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -22.75,
        "maxX": -22.25,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -27.2,
        "maxX": -25.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -24.2,
        "maxX": -22.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -25.7,
        "maxX": -24.3,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": -27.6,
        "maxX": -22.4,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": -27.6,
        "maxX": -22.4,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": -24.2,
        "maxX": -22.8,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": 22.25,
        "maxX": 22.75,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 27.25,
        "maxX": 27.75,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 22.8,
        "maxX": 24.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 25.8,
        "maxX": 27.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 24.3,
        "maxX": 25.7,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": 22.4,
        "maxX": 27.6,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": 22.4,
        "maxX": 27.6,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": 25.8,
        "maxX": 27.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": 72.25,
        "maxX": 72.75,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 77.25,
        "maxX": 77.75,
        "minZ": -100.25,
        "maxZ": -99.75,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": -100.9,
        "maxZ": -99.1,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 72.8,
        "maxX": 74.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 75.8,
        "maxX": 77.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 74.3,
        "maxX": 75.7,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": 72.4,
        "maxX": 77.6,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": 72.4,
        "maxX": 77.6,
        "minZ": -100.85,
        "maxZ": -99.15,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": 75.8,
        "maxX": 77.2,
        "minZ": -100.7,
        "maxZ": -99.3,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": -77.75,
        "maxX": -77.25,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -72.75,
        "maxX": -72.25,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": -77.7,
        "maxX": -72.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -77.2,
        "maxX": -75.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -74.2,
        "maxX": -72.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -75.7,
        "maxX": -74.3,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": -77.6,
        "maxX": -72.4,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": -77.6,
        "maxX": -72.4,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": -74.2,
        "maxX": -72.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": -27.75,
        "maxX": -27.25,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -22.75,
        "maxX": -22.25,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": -27.7,
        "maxX": -22.3,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": -27.2,
        "maxX": -25.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -24.2,
        "maxX": -22.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": -25.7,
        "maxX": -24.3,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": -27.6,
        "maxX": -22.4,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": -27.6,
        "maxX": -22.4,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": -24.2,
        "maxX": -22.8,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": 22.25,
        "maxX": 22.75,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 27.25,
        "maxX": 27.75,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": 22.3,
        "maxX": 27.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 22.8,
        "maxX": 24.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 25.8,
        "maxX": 27.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 24.3,
        "maxX": 25.7,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": 22.4,
        "maxX": 27.6,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": 22.4,
        "maxX": 27.6,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": 25.8,
        "maxX": 27.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": 72.25,
        "maxX": 72.75,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 77.25,
        "maxX": 77.75,
        "minZ": 99.75,
        "maxZ": 100.25,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 8.8,
        "maxY": 9.2
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 5.8,
        "maxY": 6.2
      },
      {
        "minX": 72.3,
        "maxX": 77.7,
        "minZ": 99.1,
        "maxZ": 100.9,
        "minY": 2.8,
        "maxY": 3.2
      },
      {
        "minX": 72.8,
        "maxX": 74.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 75.8,
        "maxX": 77.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 3.2,
        "maxY": 4.6
      },
      {
        "minX": 74.3,
        "maxX": 75.7,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 6.2,
        "maxY": 7.6000000000000005
      },
      {
        "minX": 72.4,
        "maxX": 77.6,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 3.2,
        "maxY": 5.8
      },
      {
        "minX": 72.4,
        "maxX": 77.6,
        "minZ": 99.15,
        "maxZ": 100.85,
        "minY": 6.2,
        "maxY": 8.8
      },
      {
        "minX": 75.8,
        "maxX": 77.2,
        "minZ": 99.3,
        "maxZ": 100.7,
        "minY": 9.200000000000001,
        "maxY": 10.6
      },
      {
        "minX": -51.2,
        "maxX": -48.8,
        "minZ": -56.2,
        "maxZ": -53.8,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -51.8,
        "maxX": -48.2,
        "minZ": -56.8,
        "maxZ": -53.2,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 48.8,
        "maxX": 51.2,
        "minZ": -56.2,
        "maxZ": -53.8,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 48.2,
        "maxX": 51.8,
        "minZ": -56.8,
        "maxZ": -53.2,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -51.2,
        "maxX": -48.8,
        "minZ": 53.8,
        "maxZ": 56.2,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -51.8,
        "maxX": -48.2,
        "minZ": 53.2,
        "maxZ": 56.8,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 48.8,
        "maxX": 51.2,
        "minZ": 53.8,
        "maxZ": 56.2,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 48.2,
        "maxX": 51.8,
        "minZ": 53.2,
        "maxZ": 56.8,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -101.2,
        "maxX": -98.8,
        "minZ": -86.2,
        "maxZ": -83.8,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -101.8,
        "maxX": -98.2,
        "minZ": -86.8,
        "maxZ": -83.2,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 98.8,
        "maxX": 101.2,
        "minZ": -86.2,
        "maxZ": -83.8,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 98.2,
        "maxX": 101.8,
        "minZ": -86.8,
        "maxZ": -83.2,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -101.2,
        "maxX": -98.8,
        "minZ": 83.8,
        "maxZ": 86.2,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -101.8,
        "maxX": -98.2,
        "minZ": 83.2,
        "maxZ": 86.8,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 98.8,
        "maxX": 101.2,
        "minZ": 83.8,
        "maxZ": 86.2,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 98.2,
        "maxX": 101.8,
        "minZ": 83.2,
        "maxZ": 86.8,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -122,
        "maxX": -108,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -118.5,
        "maxX": -111.5,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -116.75,
        "maxX": -113.25,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -56,
        "maxX": -44,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -51.5,
        "maxX": -48.5,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -4,
        "maxX": 4,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": 44,
        "maxX": 56,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": 48.5,
        "maxX": 51.5,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": 108,
        "maxX": 122,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": 111.5,
        "maxX": 118.5,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": 113.25,
        "maxX": 116.75,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -122,
        "maxX": -108,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -118.5,
        "maxX": -111.5,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -116.75,
        "maxX": -113.25,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -56,
        "maxX": -44,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -51.5,
        "maxX": -48.5,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": -4,
        "maxX": 4,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": 44,
        "maxX": 56,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": 48.5,
        "maxX": 51.5,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": 108,
        "maxX": 122,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 8.2
      },
      {
        "minX": 111.5,
        "maxX": 118.5,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 8.2,
        "maxY": 9.7
      },
      {
        "minX": 113.25,
        "maxX": 116.75,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 9.7,
        "maxY": 10.7
      },
      {
        "minX": -16.45,
        "maxX": -10.65,
        "minZ": -16.45,
        "maxZ": -10.65,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -16.35,
        "maxX": -10.75,
        "minZ": -16.35,
        "maxZ": -10.75,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -16.425,
        "maxX": -10.675,
        "minZ": -16.425,
        "maxZ": -10.675,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -16.35,
        "maxX": -10.75,
        "minZ": -16.35,
        "maxZ": -10.75,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -16.425,
        "maxX": -10.675,
        "minZ": -16.425,
        "maxZ": -10.675,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -16.35,
        "maxX": -10.75,
        "minZ": -16.35,
        "maxZ": -10.75,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": -14.125,
        "maxX": -12.975000000000001,
        "minZ": -16.41,
        "maxZ": -10.690000000000001,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": 13.549999999999999,
        "maxX": 19.349999999999998,
        "minZ": 13.549999999999999,
        "maxZ": 19.349999999999998,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 13.649999999999999,
        "maxX": 19.25,
        "minZ": 13.649999999999999,
        "maxZ": 19.25,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": 13.575,
        "maxX": 19.325,
        "minZ": 13.575,
        "maxZ": 19.325,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": 13.649999999999999,
        "maxX": 19.25,
        "minZ": 13.649999999999999,
        "maxZ": 19.25,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": 13.575,
        "maxX": 19.325,
        "minZ": 13.575,
        "maxZ": 19.325,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": 13.649999999999999,
        "maxX": 19.25,
        "minZ": 13.649999999999999,
        "maxZ": 19.25,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 15.875,
        "maxX": 17.025,
        "minZ": 13.59,
        "maxZ": 19.31,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -35.449999999999996,
        "maxX": -29.65,
        "minZ": 33.550000000000004,
        "maxZ": 39.35,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -35.349999999999994,
        "maxX": -29.749999999999996,
        "minZ": 33.650000000000006,
        "maxZ": 39.25,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -35.425,
        "maxX": -29.674999999999997,
        "minZ": 33.575,
        "maxZ": 39.325,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -35.349999999999994,
        "maxX": -29.749999999999996,
        "minZ": 33.650000000000006,
        "maxZ": 39.25,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -35.425,
        "maxX": -29.674999999999997,
        "minZ": 33.575,
        "maxZ": 39.325,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -35.349999999999994,
        "maxX": -29.749999999999996,
        "minZ": 33.650000000000006,
        "maxZ": 39.25,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": -33.125,
        "maxX": -31.974999999999998,
        "minZ": 33.59,
        "maxZ": 39.31,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": 32.550000000000004,
        "maxX": 38.35,
        "minZ": -36.449999999999996,
        "maxZ": -30.65,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 32.650000000000006,
        "maxX": 38.25,
        "minZ": -36.349999999999994,
        "maxZ": -30.749999999999996,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": 32.575,
        "maxX": 38.325,
        "minZ": -36.425,
        "maxZ": -30.674999999999997,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": 32.650000000000006,
        "maxX": 38.25,
        "minZ": -36.349999999999994,
        "maxZ": -30.749999999999996,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": 32.575,
        "maxX": 38.325,
        "minZ": -36.425,
        "maxZ": -30.674999999999997,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": 32.650000000000006,
        "maxX": 38.25,
        "minZ": -36.349999999999994,
        "maxZ": -30.749999999999996,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 34.875,
        "maxX": 36.025000000000006,
        "minZ": -36.41,
        "maxZ": -30.689999999999998,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -1.45,
        "maxX": 4.35,
        "minZ": -56.449999999999996,
        "maxZ": -50.65,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -1.425,
        "maxX": 4.325,
        "minZ": -56.425,
        "maxZ": -50.675,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -1.425,
        "maxX": 4.325,
        "minZ": -56.425,
        "maxZ": -50.675,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 0.875,
        "maxX": 2.025,
        "minZ": -56.41,
        "maxZ": -50.69,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -1.45,
        "maxX": 4.35,
        "minZ": 53.550000000000004,
        "maxZ": 59.35,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -1.425,
        "maxX": 4.325,
        "minZ": 53.575,
        "maxZ": 59.325,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -1.425,
        "maxX": 4.325,
        "minZ": 53.575,
        "maxZ": 59.325,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -1.3499999999999999,
        "maxX": 4.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 0.875,
        "maxX": 2.025,
        "minZ": 53.59,
        "maxZ": 59.31,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -86.45,
        "maxX": -80.64999999999999,
        "minZ": -56.449999999999996,
        "maxZ": -50.65,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -86.35,
        "maxX": -80.75,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -86.425,
        "maxX": -80.675,
        "minZ": -56.425,
        "maxZ": -50.675,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -86.35,
        "maxX": -80.75,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -86.425,
        "maxX": -80.675,
        "minZ": -56.425,
        "maxZ": -50.675,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -86.35,
        "maxX": -80.75,
        "minZ": -56.349999999999994,
        "maxZ": -50.75,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": -84.125,
        "maxX": -82.975,
        "minZ": -56.41,
        "maxZ": -50.69,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": 83.55,
        "maxX": 89.35000000000001,
        "minZ": 53.550000000000004,
        "maxZ": 59.35,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 83.65,
        "maxX": 89.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": 83.575,
        "maxX": 89.325,
        "minZ": 53.575,
        "maxZ": 59.325,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": 83.65,
        "maxX": 89.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": 83.575,
        "maxX": 89.325,
        "minZ": 53.575,
        "maxZ": 59.325,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": 83.65,
        "maxX": 89.25,
        "minZ": 53.650000000000006,
        "maxZ": 59.25,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 85.875,
        "maxX": 87.025,
        "minZ": 53.59,
        "maxZ": 59.31,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -31.45,
        "maxX": -25.650000000000002,
        "minZ": -51.449999999999996,
        "maxZ": -45.65,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": -31.35,
        "maxX": -25.75,
        "minZ": -51.349999999999994,
        "maxZ": -45.75,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": -31.425,
        "maxX": -25.675,
        "minZ": -51.425,
        "maxZ": -45.675,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": -31.35,
        "maxX": -25.75,
        "minZ": -51.349999999999994,
        "maxZ": -45.75,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": -31.425,
        "maxX": -25.675,
        "minZ": -51.425,
        "maxZ": -45.675,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": -31.35,
        "maxX": -25.75,
        "minZ": -51.349999999999994,
        "maxZ": -45.75,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": -29.125,
        "maxX": -27.975,
        "minZ": -51.41,
        "maxZ": -45.69,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": 28.55,
        "maxX": 34.35,
        "minZ": 48.550000000000004,
        "maxZ": 54.35,
        "minY": 0,
        "maxY": 0.5
      },
      {
        "minX": 28.65,
        "maxX": 34.25,
        "minZ": 48.650000000000006,
        "maxZ": 54.25,
        "minY": 0.5,
        "maxY": 3.2
      },
      {
        "minX": 28.575,
        "maxX": 34.325,
        "minZ": 48.575,
        "maxZ": 54.325,
        "minY": 3.1999999999999997,
        "maxY": 3.4
      },
      {
        "minX": 28.65,
        "maxX": 34.25,
        "minZ": 48.650000000000006,
        "maxZ": 54.25,
        "minY": 3.4,
        "maxY": 6.1
      },
      {
        "minX": 28.575,
        "maxX": 34.325,
        "minZ": 48.575,
        "maxZ": 54.325,
        "minY": 6.1000000000000005,
        "maxY": 6.3
      },
      {
        "minX": 28.65,
        "maxX": 34.25,
        "minZ": 48.650000000000006,
        "maxZ": 54.25,
        "minY": 6.3,
        "maxY": 8.7
      },
      {
        "minX": 30.875,
        "maxX": 32.025,
        "minZ": 48.59,
        "maxZ": 54.31,
        "minY": 0.5,
        "maxY": 8.7
      },
      {
        "minX": -61.2,
        "maxX": -58.8,
        "minZ": -45.7,
        "maxZ": -44.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -61,
        "maxX": -59,
        "minZ": -45.5,
        "maxZ": -44.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": -60.7,
        "maxX": -59.3,
        "minZ": -45.4,
        "maxZ": -44.6,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": 58.8,
        "maxX": 61.2,
        "minZ": 44.3,
        "maxZ": 45.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 59,
        "maxX": 61,
        "minZ": 44.5,
        "maxZ": 45.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": 59.3,
        "maxX": 60.7,
        "minZ": 44.6,
        "maxZ": 45.4,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": -91.2,
        "maxX": -88.8,
        "minZ": 34.3,
        "maxZ": 35.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -91,
        "maxX": -89,
        "minZ": 34.5,
        "maxZ": 35.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": -90.7,
        "maxX": -89.3,
        "minZ": 34.6,
        "maxZ": 35.4,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": 88.8,
        "maxX": 91.2,
        "minZ": -35.7,
        "maxZ": -34.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 89,
        "maxX": 91,
        "minZ": -35.5,
        "maxZ": -34.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": 89.3,
        "maxX": 90.7,
        "minZ": -35.4,
        "maxZ": -34.6,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": -16.2,
        "maxX": -13.8,
        "minZ": 49.3,
        "maxZ": 50.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -16,
        "maxX": -14,
        "minZ": 49.5,
        "maxZ": 50.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": -15.7,
        "maxX": -14.3,
        "minZ": 49.6,
        "maxZ": 50.4,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": 13.8,
        "maxX": 16.2,
        "minZ": -50.7,
        "maxZ": -49.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 14,
        "maxX": 16,
        "minZ": -50.5,
        "maxZ": -49.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": 14.3,
        "maxX": 15.7,
        "minZ": -50.4,
        "maxZ": -49.6,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": -46.2,
        "maxX": -43.8,
        "minZ": -30.7,
        "maxZ": -29.3,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -46,
        "maxX": -44,
        "minZ": -30.5,
        "maxZ": -29.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": -45.7,
        "maxX": -44.3,
        "minZ": -30.4,
        "maxZ": -29.6,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      },
      {
        "minX": 43.8,
        "maxX": 46.2,
        "minZ": 29.3,
        "maxZ": 30.7,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 44,
        "maxX": 46,
        "minZ": 29.5,
        "maxZ": 30.5,
        "minY": 0.7999999999999999,
        "maxY": 2
      },
      {
        "minX": 44.3,
        "maxX": 45.7,
        "minZ": 29.6,
        "maxZ": 30.4,
        "minY": 1.9999999999999998,
        "maxY": 2.5999999999999996
      }
    ],
    "surfaces": [
      {
        "minX": -27,
        "maxX": -23,
        "minZ": -45,
        "maxZ": 45,
        "maxTop": 2.6,
        "type": "flat",
        "top": 2.6
      },
      {
        "minX": 23,
        "maxX": 27,
        "minZ": -45,
        "maxZ": 45,
        "maxTop": 2.6,
        "type": "flat",
        "top": 2.6
      }
    ]
  },
  "square": {
    "obstacles": [
      {
        "minX": -13,
        "maxX": 13,
        "minZ": -7,
        "maxZ": 7,
        "minY": 0,
        "maxY": 1.6,
        "topBuffer": 2
      },
      {
        "minX": -7,
        "maxX": 7,
        "minZ": -13,
        "maxZ": 13,
        "minY": 0,
        "maxY": 1.6,
        "topBuffer": 2
      },
      {
        "minX": -3.4,
        "maxX": 3.4,
        "minZ": -3.4,
        "maxZ": 3.4,
        "minY": 1.6,
        "maxY": 11.5
      },
      {
        "minX": 16.45,
        "maxX": 16.650000000000002,
        "minZ": -0.1,
        "maxZ": 0.1,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 16.37940061768282,
        "maxX": 16.579400617682822,
        "minZ": 1.427041349117648,
        "maxZ": 1.627041349117648,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 16.168204799768574,
        "maxX": 16.368204799768577,
        "minZ": 2.941054519864239,
        "maxZ": 3.1410545198642392,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 15.818214394510155,
        "maxX": 16.018214394510156,
        "minZ": 4.429122485692972,
        "maxZ": 4.629122485692971,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 15.332415396642089,
        "maxX": 15.532415396642088,
        "minZ": 5.878549575397382,
        "maxZ": 6.078549575397381,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 14.714952471926283,
        "maxX": 14.914952471926282,
        "minZ": 7.276969788101709,
        "maxZ": 7.476969788101708,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 13.971093596325117,
        "maxX": 14.171093596325116,
        "minZ": 8.612452295620239,
        "maxZ": 8.812452295620238,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 13.107185111487965,
        "maxX": 13.307185111487964,
        "minZ": 9.873603232076693,
        "maxZ": 10.073603232076692,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 12.13059758000191,
        "maxX": 12.330597580001909,
        "minZ": 11.049662902350523,
        "maxZ": 11.249662902350522,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 11.049662902350523,
        "maxX": 11.249662902350522,
        "minZ": 12.13059758000191,
        "maxZ": 12.330597580001909,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 9.873603232076695,
        "maxX": 10.073603232076694,
        "minZ": 13.107185111487965,
        "maxZ": 13.307185111487964,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 8.61245229562024,
        "maxX": 8.81245229562024,
        "minZ": 13.971093596325113,
        "maxZ": 14.171093596325113,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 7.2769697881017095,
        "maxX": 7.476969788101709,
        "minZ": 14.714952471926283,
        "maxZ": 14.914952471926282,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 5.8785495753973835,
        "maxX": 6.078549575397383,
        "minZ": 15.332415396642089,
        "maxZ": 15.532415396642088,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 4.429122485692974,
        "maxX": 4.629122485692974,
        "minZ": 15.818214394510155,
        "maxZ": 16.018214394510156,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 2.9410545198642426,
        "maxX": 3.1410545198642428,
        "minZ": 16.168204799768574,
        "maxZ": 16.368204799768577,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 1.4270413491176484,
        "maxX": 1.6270413491176485,
        "minZ": 16.37940061768282,
        "maxZ": 16.579400617682822,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -0.09999999999999899,
        "maxX": 0.10000000000000102,
        "minZ": 16.45,
        "maxZ": 16.650000000000002,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -1.6270413491176465,
        "maxX": -1.4270413491176464,
        "minZ": 16.379400617682823,
        "maxZ": 16.579400617682825,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -3.14105451986424,
        "maxX": -2.94105451986424,
        "minZ": 16.168204799768574,
        "maxZ": 16.368204799768577,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -4.629122485692972,
        "maxX": -4.4291224856929725,
        "minZ": 15.818214394510155,
        "maxZ": 16.018214394510156,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -6.078549575397381,
        "maxX": -5.878549575397382,
        "minZ": 15.332415396642089,
        "maxZ": 15.532415396642088,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -7.476969788101707,
        "maxX": -7.276969788101708,
        "minZ": 14.714952471926283,
        "maxZ": 14.914952471926282,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -8.812452295620242,
        "maxX": -8.612452295620242,
        "minZ": 13.971093596325113,
        "maxZ": 14.171093596325113,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -10.073603232076692,
        "maxX": -9.873603232076693,
        "minZ": 13.107185111487967,
        "maxZ": 13.307185111487966,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -11.249662902350522,
        "maxX": -11.049662902350523,
        "minZ": 12.13059758000191,
        "maxZ": 12.330597580001909,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -12.330597580001907,
        "maxX": -12.130597580001908,
        "minZ": 11.049662902350526,
        "maxZ": 11.249662902350526,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -13.307185111487964,
        "maxX": -13.107185111487965,
        "minZ": 9.873603232076695,
        "maxZ": 10.073603232076694,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -14.171093596325111,
        "maxX": -13.971093596325112,
        "minZ": 8.612452295620244,
        "maxZ": 8.812452295620243,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -14.91495247192628,
        "maxX": -14.714952471926281,
        "minZ": 7.27696978810171,
        "maxZ": 7.47696978810171,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -15.532415396642087,
        "maxX": -15.332415396642087,
        "minZ": 5.878549575397388,
        "maxZ": 6.078549575397387,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.018214394510156,
        "maxX": -15.818214394510155,
        "minZ": 4.429122485692975,
        "maxZ": 4.6291224856929745,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.368204799768577,
        "maxX": -16.168204799768574,
        "minZ": 2.9410545198642395,
        "maxZ": 3.1410545198642397,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.579400617682822,
        "maxX": -16.37940061768282,
        "minZ": 1.427041349117653,
        "maxZ": 1.6270413491176532,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.650000000000002,
        "maxX": -16.45,
        "minZ": -0.09999999999999798,
        "maxZ": 0.10000000000000203,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.579400617682825,
        "maxX": -16.379400617682823,
        "minZ": -1.6270413491176419,
        "maxZ": -1.4270413491176417,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.368204799768577,
        "maxX": -16.168204799768574,
        "minZ": -3.1410545198642357,
        "maxZ": -2.9410545198642355,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -16.018214394510156,
        "maxX": -15.818214394510157,
        "minZ": -4.629122485692964,
        "maxZ": -4.4291224856929645,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -15.532415396642087,
        "maxX": -15.332415396642087,
        "minZ": -6.078549575397384,
        "maxZ": -5.878549575397384,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -14.914952471926286,
        "maxX": -14.714952471926287,
        "minZ": -7.4769697881017,
        "maxZ": -7.276969788101701,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -14.171093596325113,
        "maxX": -13.971093596325113,
        "minZ": -8.81245229562024,
        "maxZ": -8.61245229562024,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -13.307185111487966,
        "maxX": -13.107185111487967,
        "minZ": -10.07360323207669,
        "maxZ": -9.873603232076691,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -12.330597580001909,
        "maxX": -12.13059758000191,
        "minZ": -11.249662902350522,
        "maxZ": -11.049662902350523,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -11.249662902350526,
        "maxX": -11.049662902350526,
        "minZ": -12.330597580001905,
        "maxZ": -12.130597580001906,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -10.073603232076696,
        "maxX": -9.873603232076697,
        "minZ": -13.307185111487964,
        "maxZ": -13.107185111487965,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -8.812452295620243,
        "maxX": -8.612452295620244,
        "minZ": -14.171093596325111,
        "maxZ": -13.971093596325112,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -7.476969788101704,
        "maxX": -7.276969788101705,
        "minZ": -14.914952471926284,
        "maxZ": -14.714952471926285,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -6.078549575397382,
        "maxX": -5.878549575397383,
        "minZ": -15.532415396642088,
        "maxZ": -15.332415396642089,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -4.629122485692975,
        "maxX": -4.429122485692976,
        "minZ": -16.018214394510156,
        "maxZ": -15.818214394510155,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -3.141054519864248,
        "maxX": -2.941054519864248,
        "minZ": -16.368204799768574,
        "maxZ": -16.16820479976857,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -1.627041349117647,
        "maxX": -1.4270413491176468,
        "minZ": -16.579400617682825,
        "maxZ": -16.379400617682823,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -0.10000000000000304,
        "maxX": 0.09999999999999697,
        "minZ": -16.650000000000002,
        "maxZ": -16.45,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 1.4270413491176406,
        "maxX": 1.6270413491176408,
        "minZ": -16.579400617682825,
        "maxZ": -16.379400617682823,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 2.9410545198642417,
        "maxX": 3.141054519864242,
        "minZ": -16.368204799768577,
        "maxZ": -16.168204799768574,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 4.429122485692971,
        "maxX": 4.62912248569297,
        "minZ": -16.018214394510156,
        "maxZ": -15.818214394510155,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 5.878549575397376,
        "maxX": 6.078549575397376,
        "minZ": -15.53241539664209,
        "maxZ": -15.33241539664209,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 7.2769697881017,
        "maxX": 7.476969788101699,
        "minZ": -14.914952471926286,
        "maxZ": -14.714952471926287,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 8.61245229562024,
        "maxX": 8.81245229562024,
        "minZ": -14.171093596325113,
        "maxZ": -13.971093596325113,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 9.873603232076691,
        "maxX": 10.07360323207669,
        "minZ": -13.307185111487968,
        "maxZ": -13.107185111487968,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 11.049662902350526,
        "maxX": 11.249662902350526,
        "minZ": -12.330597580001905,
        "maxZ": -12.130597580001906,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 12.1305975800019,
        "maxX": 12.3305975800019,
        "minZ": -11.249662902350531,
        "maxZ": -11.049662902350532,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 13.107185111487963,
        "maxX": 13.307185111487962,
        "minZ": -10.073603232076696,
        "maxZ": -9.873603232076697,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 13.97109359632511,
        "maxX": 14.17109359632511,
        "minZ": -8.812452295620245,
        "maxZ": -8.612452295620246,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 14.714952471926285,
        "maxX": 14.914952471926284,
        "minZ": -7.476969788101705,
        "maxZ": -7.276969788101706,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 15.332415396642089,
        "maxX": 15.532415396642088,
        "minZ": -6.078549575397383,
        "maxZ": -5.8785495753973835,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 15.818214394510154,
        "maxX": 16.018214394510153,
        "minZ": -4.629122485692976,
        "maxZ": -4.429122485692977,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 16.16820479976857,
        "maxX": 16.368204799768574,
        "minZ": -3.141054519864249,
        "maxZ": -2.941054519864249,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": 16.37940061768282,
        "maxX": 16.579400617682822,
        "minZ": -1.6270413491176479,
        "maxZ": -1.4270413491176477,
        "minY": 0,
        "maxY": 14,
        "noProjectile": true
      },
      {
        "minX": -30,
        "maxX": 30,
        "minZ": -89,
        "maxZ": -67,
        "minY": 0,
        "maxY": 30
      },
      {
        "minX": -31,
        "maxX": 31,
        "minZ": -90,
        "maxZ": -66,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": -25.9,
        "maxX": -24.1,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": -17.9,
        "maxX": -16.1,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": -9.9,
        "maxX": -8.1,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": -1.9,
        "maxX": -0.09999999999999998,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": 6.1,
        "maxX": 7.9,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": 14.1,
        "maxX": 15.9,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": 22.1,
        "maxX": 23.9,
        "minZ": -67.75,
        "maxZ": -65.25,
        "minY": 0,
        "maxY": 26
      },
      {
        "minX": -24,
        "maxX": -8,
        "minZ": -79,
        "maxZ": -69,
        "minY": 30,
        "maxY": 52
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -79,
        "maxZ": -69,
        "minY": 30,
        "maxY": 52
      },
      {
        "minX": 8,
        "maxX": 24,
        "minZ": -79,
        "maxZ": -69,
        "minY": 30,
        "maxY": 52
      },
      {
        "minX": 85.5,
        "maxX": 98.5,
        "minZ": 21.5,
        "maxZ": 34.5,
        "minY": 0,
        "maxY": 28
      },
      {
        "minX": 85,
        "maxX": 99,
        "minZ": 21,
        "maxZ": 35,
        "minY": 27.9,
        "maxY": 29.1
      },
      {
        "minX": 86.5,
        "maxX": 97.5,
        "minZ": 22.5,
        "maxZ": 33.5,
        "minY": 29,
        "maxY": 43
      },
      {
        "minX": 86,
        "maxX": 98,
        "minZ": 22,
        "maxZ": 34,
        "minY": 43.5,
        "maxY": 44.5
      },
      {
        "minX": -78,
        "maxX": -42,
        "minZ": 69,
        "maxZ": 87,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": -78.25,
        "maxX": -41.75,
        "minZ": 68.75,
        "maxZ": 87.25,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": 42,
        "maxX": 78,
        "minZ": 69,
        "maxZ": 87,
        "minY": 0,
        "maxY": 22
      },
      {
        "minX": 41.75,
        "maxX": 78.25,
        "minZ": 68.75,
        "maxZ": 87.25,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": -101,
        "maxX": -83,
        "minZ": -29,
        "maxZ": 9,
        "minY": 0,
        "maxY": 20
      },
      {
        "minX": -101.25,
        "maxX": -82.75,
        "minZ": -29.25,
        "maxZ": 9.25,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": -101,
        "maxX": -83,
        "minZ": 31,
        "maxZ": 53,
        "minY": 0,
        "maxY": 18
      },
      {
        "minX": -101.25,
        "maxX": -82.75,
        "minZ": 30.75,
        "maxZ": 53.25,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": -30.225,
        "maxX": -29.775,
        "minZ": -30.225,
        "maxZ": -29.775,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 29.775,
        "maxX": 30.225,
        "minZ": -30.225,
        "maxZ": -29.775,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -30.225,
        "maxX": -29.775,
        "minZ": 29.775,
        "maxZ": 30.225,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 29.775,
        "maxX": 30.225,
        "minZ": 29.775,
        "maxZ": 30.225,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -50.225,
        "maxX": -49.775,
        "minZ": -0.225,
        "maxZ": 0.225,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": 49.775,
        "maxX": 50.225,
        "minZ": -0.225,
        "maxZ": 0.225,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -0.225,
        "maxX": 0.225,
        "minZ": -50.225,
        "maxZ": -49.775,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -0.225,
        "maxX": 0.225,
        "minZ": 49.775,
        "maxZ": 50.225,
        "minY": 0,
        "maxY": 9
      },
      {
        "minX": -45.6,
        "maxX": -42.4,
        "minZ": -45.6,
        "maxZ": -42.4,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": 42.4,
        "maxX": 45.6,
        "minZ": -45.6,
        "maxZ": -42.4,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": -45.6,
        "maxX": -42.4,
        "minZ": 42.4,
        "maxZ": 45.6,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": 42.4,
        "maxX": 45.6,
        "minZ": 42.4,
        "maxZ": 45.6,
        "minY": 0,
        "maxY": 2
      },
      {
        "minX": -95.8,
        "maxX": -94.2,
        "minZ": -55.8,
        "maxZ": -54.2,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -95.8,
        "maxX": -94.2,
        "minZ": 89.2,
        "maxZ": 90.8,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 94.2,
        "maxX": 95.8,
        "minZ": -55.8,
        "maxZ": -54.2,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 94.2,
        "maxX": 95.8,
        "minZ": 89.2,
        "maxZ": 90.8,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -50.8,
        "maxX": -49.2,
        "minZ": 94.2,
        "maxZ": 95.8,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 49.2,
        "maxX": 50.8,
        "minZ": 94.2,
        "maxZ": 95.8,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -120,
        "maxX": 120,
        "minZ": -112,
        "maxZ": -108,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -120,
        "maxX": 120,
        "minZ": 108,
        "maxZ": 112,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": -122,
        "maxX": -118,
        "minZ": -120,
        "maxZ": 120,
        "minY": 0,
        "maxY": 8
      },
      {
        "minX": 118,
        "maxX": 122,
        "minZ": -120,
        "maxZ": 120,
        "minY": 0,
        "maxY": 8
      },
      { "minX": -118, "maxX": 118, "minZ": 106, "maxZ": 108, "minY": 0, "maxY": 28 },
      { "minX": -118, "maxX": 118, "minZ": -108, "maxZ": -106, "minY": 0, "maxY": 28 },
      { "minX": -118, "maxX": -116, "minZ": -108, "maxZ": 108, "minY": 0, "maxY": 28 },
      { "minX": 116, "maxX": 118, "minZ": -108, "maxZ": 108, "minY": 0, "maxY": 28 }
    ],
    "surfaces": []
  },
  "lobby": {
    "obstacles": [
      {
        "minX": -110,
        "maxX": 110,
        "minZ": -102,
        "maxZ": -98,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -110,
        "maxX": 110,
        "minZ": 98,
        "maxZ": 102,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -112,
        "maxX": -108,
        "minZ": -100,
        "maxZ": 100,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": 108,
        "maxX": 112,
        "minZ": -100,
        "maxZ": 100,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -91,
        "maxX": 91,
        "minZ": -97.8,
        "maxZ": -97.39999999999999,
        "minY": 22,
        "maxY": 22.799999999999997
      },
      {
        "minX": -91,
        "maxX": 91,
        "minZ": -97.8,
        "maxZ": -97.39999999999999,
        "minY": 5.3999999999999995,
        "maxY": 5.8
      },
      {
        "minX": -107.85,
        "maxX": -107.35,
        "minZ": -30,
        "maxZ": 30,
        "minY": 10,
        "maxY": 18
      },
      {
        "minX": -107.60000000000001,
        "maxX": -107.2,
        "minZ": -32,
        "maxZ": 32,
        "minY": 13.8,
        "maxY": 14.2
      },
      {
        "minX": 107.35,
        "maxX": 107.85,
        "minZ": -30,
        "maxZ": 30,
        "minY": 10,
        "maxY": 18
      },
      {
        "minX": 107.2,
        "maxX": 107.60000000000001,
        "minZ": -32,
        "maxZ": 32,
        "minY": 13.8,
        "maxY": 14.2
      },
      {
        "minX": -67,
        "maxX": -53,
        "minZ": 53.4,
        "maxZ": 56.6,
        "minY": 0,
        "maxY": 3
      },
      {
        "minX": -67.2,
        "maxX": -52.8,
        "minZ": 53.3,
        "maxZ": 56.7,
        "minY": 2.95,
        "maxY": 3.25
      },
      {
        "minX": -67,
        "maxX": -53,
        "minZ": 53.35,
        "maxZ": 53.85,
        "minY": 3.1000000000000005,
        "maxY": 8.2
      },
      {
        "minX": -66,
        "maxX": -54,
        "minZ": 53.300000000000004,
        "maxZ": 53.9,
        "minY": 8,
        "maxY": 8.2
      },
      {
        "minX": 53,
        "maxX": 67,
        "minZ": 53.4,
        "maxZ": 56.6,
        "minY": 0,
        "maxY": 3
      },
      {
        "minX": 52.8,
        "maxX": 67.2,
        "minZ": 53.3,
        "maxZ": 56.7,
        "minY": 2.95,
        "maxY": 3.25
      },
      {
        "minX": 53,
        "maxX": 67,
        "minZ": 53.35,
        "maxZ": 53.85,
        "minY": 3.1000000000000005,
        "maxY": 8.2
      },
      {
        "minX": 54,
        "maxX": 66,
        "minZ": 53.300000000000004,
        "maxZ": 53.9,
        "minY": 8,
        "maxY": 8.2
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 80,
        "maxZ": 84,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": -82.3,
        "maxX": -73.7,
        "minZ": 80.2,
        "maxZ": 83.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 83,
        "maxZ": 84,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 80,
        "maxZ": 84,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": -52.8,
        "maxX": -47.2,
        "minZ": 80.2,
        "maxZ": 83.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 83,
        "maxZ": 84,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 80,
        "maxZ": 84,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": 73.7,
        "maxX": 82.3,
        "minZ": 80.2,
        "maxZ": 83.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 83,
        "maxZ": 84,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 80,
        "maxZ": 84,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": 47.2,
        "maxX": 52.8,
        "minZ": 80.2,
        "maxZ": 83.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 83,
        "maxZ": 84,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": 84,
        "maxZ": 88,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": -27.8,
        "maxX": -22.2,
        "minZ": 84.2,
        "maxZ": 87.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": 87,
        "maxZ": 88,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": 84,
        "maxZ": 88,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": 22.2,
        "maxX": 27.8,
        "minZ": 84.2,
        "maxZ": 87.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": 87,
        "maxZ": 88,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 23,
        "maxZ": 27,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": -82.3,
        "maxX": -73.7,
        "minZ": 23.2,
        "maxZ": 26.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 26,
        "maxZ": 27,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 23,
        "maxZ": 27,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": 73.7,
        "maxX": 82.3,
        "minZ": 23.2,
        "maxZ": 26.2,
        "minY": 2.8000000000000003,
        "maxY": 3.4
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 26,
        "maxZ": 27,
        "minY": 2.8,
        "maxY": 8.2
      },
      {
        "minX": -62,
        "maxX": -58,
        "minZ": 68.7,
        "maxZ": 71.3,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": -62.1,
        "maxX": -57.9,
        "minZ": 68.6,
        "maxZ": 71.4,
        "minY": 1.3599999999999999,
        "maxY": 1.54
      },
      {
        "minX": 58,
        "maxX": 62,
        "minZ": 68.7,
        "maxZ": 71.3,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": 57.9,
        "maxX": 62.1,
        "minZ": 68.6,
        "maxZ": 71.4,
        "minY": 1.3599999999999999,
        "maxY": 1.54
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": 76.7,
        "maxZ": 79.3,
        "minY": 0,
        "maxY": 1.4
      },
      {
        "minX": -2.1,
        "maxX": 2.1,
        "minZ": 76.6,
        "maxZ": 79.4,
        "minY": 1.3599999999999999,
        "maxY": 1.54
      },
      {
        "minX": -3,
        "maxX": 3,
        "minZ": 39,
        "maxZ": 45,
        "minY": 0,
        "maxY": 2.9
      },
      {
        "minX": -2.65,
        "maxX": 2.65,
        "minZ": 39.35,
        "maxZ": 44.65,
        "minY": 3.3000000000000003,
        "maxY": 9.5
      },
      {
        "minX": -32.6,
        "maxX": -27.4,
        "minZ": 57.4,
        "maxZ": 62.6,
        "minY": 0,
        "maxY": 2.5
      },
      {
        "minX": -32.3,
        "maxX": -27.7,
        "minZ": 57.7,
        "maxZ": 62.3,
        "minY": 2.8999999999999995,
        "maxY": 8.3
      },
      {
        "minX": 27.4,
        "maxX": 32.6,
        "minZ": 57.4,
        "maxZ": 62.6,
        "minY": 0,
        "maxY": 2.5
      },
      {
        "minX": 27.7,
        "maxX": 32.3,
        "minZ": 57.7,
        "maxZ": 62.3,
        "minY": 2.8999999999999995,
        "maxY": 8.3
      },
      {
        "minX": -17.6,
        "maxX": -12.4,
        "minZ": 85.4,
        "maxZ": 90.6,
        "minY": 0,
        "maxY": 2.5
      },
      {
        "minX": -17.3,
        "maxX": -12.7,
        "minZ": 85.7,
        "maxZ": 90.3,
        "minY": 2.8999999999999995,
        "maxY": 8.3
      },
      {
        "minX": 12.4,
        "maxX": 17.6,
        "minZ": 85.4,
        "maxZ": 90.6,
        "minY": 0,
        "maxY": 2.5
      },
      {
        "minX": 12.7,
        "maxX": 17.3,
        "minZ": 85.7,
        "maxZ": 90.3,
        "minY": 2.8999999999999995,
        "maxY": 8.3
      },
      {
        "minX": -52.75,
        "maxX": -47.25,
        "minZ": 85.25,
        "maxZ": 90.75,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": -52.25,
        "maxX": -47.75,
        "minZ": 85.75,
        "maxZ": 90.25,
        "minY": 0.7999999999999998,
        "maxY": 5.2
      },
      {
        "minX": -50.75,
        "maxX": -47.25,
        "minZ": 85.25,
        "maxZ": 88.75,
        "minY": 5,
        "maxY": 8
      },
      {
        "minX": -51.3,
        "maxX": -48.7,
        "minZ": 86.7,
        "maxZ": 89.3,
        "minY": 8.3,
        "maxY": 8.5
      },
      {
        "minX": 47.25,
        "maxX": 52.75,
        "minZ": 85.25,
        "maxZ": 90.75,
        "minY": 0,
        "maxY": 0.8
      },
      {
        "minX": 47.75,
        "maxX": 52.25,
        "minZ": 85.75,
        "maxZ": 90.25,
        "minY": 0.7999999999999998,
        "maxY": 5.2
      },
      {
        "minX": 49.25,
        "maxX": 52.75,
        "minZ": 85.25,
        "maxZ": 88.75,
        "minY": 5,
        "maxY": 8
      },
      {
        "minX": 48.7,
        "maxX": 51.3,
        "minZ": 86.7,
        "maxZ": 89.3,
        "minY": 8.3,
        "maxY": 8.5
      },
      {
        "minX": -92.2,
        "maxX": -87.8,
        "minZ": 62.8,
        "maxZ": 67.2,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": -92.2,
        "maxX": -87.8,
        "minZ": 62.8,
        "maxZ": 67.2,
        "minY": 2.8000000000000003,
        "maxY": 2.9
      },
      {
        "minX": -90.45,
        "maxX": -89.55,
        "minZ": 64.55,
        "maxZ": 65.45,
        "minY": 3,
        "maxY": 8
      },
      {
        "minX": -92.25,
        "maxX": -87.75,
        "minZ": 62.75,
        "maxZ": 67.25,
        "minY": 2.875,
        "maxY": 3.0250000000000004
      },
      {
        "minX": 87.8,
        "maxX": 92.2,
        "minZ": 62.8,
        "maxZ": 67.2,
        "minY": 0,
        "maxY": 2.8
      },
      {
        "minX": 87.8,
        "maxX": 92.2,
        "minZ": 62.8,
        "maxZ": 67.2,
        "minY": 2.8000000000000003,
        "maxY": 2.9
      },
      {
        "minX": 89.55,
        "maxX": 90.45,
        "minZ": 64.55,
        "maxZ": 65.45,
        "minY": 3,
        "maxY": 8
      },
      {
        "minX": 87.75,
        "maxX": 92.25,
        "minZ": 62.75,
        "maxZ": 67.25,
        "minY": 2.875,
        "maxY": 3.0250000000000004
      },
      {
        "minX": -3,
        "maxX": 3,
        "minZ": -33,
        "maxZ": -27,
        "minY": 5,
        "maxY": 7.9
      },
      {
        "minX": -2.65,
        "maxX": 2.65,
        "minZ": -32.65,
        "maxZ": -27.35,
        "minY": 8.3,
        "maxY": 14.5
      },
      {
        "minX": -42.75,
        "maxX": -37.25,
        "minZ": -80.75,
        "maxZ": -75.25,
        "minY": 5,
        "maxY": 5.800000000000001
      },
      {
        "minX": -42.25,
        "maxX": -37.75,
        "minZ": -80.25,
        "maxZ": -75.75,
        "minY": 5.8,
        "maxY": 10.2
      },
      {
        "minX": -40.75,
        "maxX": -37.25,
        "minZ": -80.75,
        "maxZ": -77.25,
        "minY": 10,
        "maxY": 13
      },
      {
        "minX": -41.3,
        "maxX": -38.7,
        "minZ": -79.3,
        "maxZ": -76.7,
        "minY": 13.3,
        "maxY": 13.5
      },
      {
        "minX": 37.25,
        "maxX": 42.75,
        "minZ": -80.75,
        "maxZ": -75.25,
        "minY": 5,
        "maxY": 5.800000000000001
      },
      {
        "minX": 37.75,
        "maxX": 42.25,
        "minZ": -80.25,
        "maxZ": -75.75,
        "minY": 5.8,
        "maxY": 10.2
      },
      {
        "minX": 39.25,
        "maxX": 42.75,
        "minZ": -80.75,
        "maxZ": -77.25,
        "minY": 10,
        "maxY": 13
      },
      {
        "minX": 38.7,
        "maxX": 41.3,
        "minZ": -79.3,
        "maxZ": -76.7,
        "minY": 13.3,
        "maxY": 13.5
      },
      {
        "minX": -92.2,
        "maxX": -87.8,
        "minZ": -47.2,
        "maxZ": -42.8,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": -92.2,
        "maxX": -87.8,
        "minZ": -47.2,
        "maxZ": -42.8,
        "minY": 7.8,
        "maxY": 7.8999999999999995
      },
      {
        "minX": -90.45,
        "maxX": -89.55,
        "minZ": -45.45,
        "maxZ": -44.55,
        "minY": 8,
        "maxY": 13
      },
      {
        "minX": -92.25,
        "maxX": -87.75,
        "minZ": -47.25,
        "maxZ": -42.75,
        "minY": 7.875,
        "maxY": 8.025
      },
      {
        "minX": 87.8,
        "maxX": 92.2,
        "minZ": -47.2,
        "maxZ": -42.8,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": 87.8,
        "maxX": 92.2,
        "minZ": -47.2,
        "maxZ": -42.8,
        "minY": 7.8,
        "maxY": 7.8999999999999995
      },
      {
        "minX": 89.55,
        "maxX": 90.45,
        "minZ": -45.45,
        "maxZ": -44.55,
        "minY": 8,
        "maxY": 13
      },
      {
        "minX": 87.75,
        "maxX": 92.25,
        "minZ": -47.25,
        "maxZ": -42.75,
        "minY": 7.875,
        "maxY": 8.025
      },
      {
        "minX": -68.2,
        "maxX": -61.8,
        "minZ": 61.8,
        "maxZ": 68.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": 61.8,
        "maxX": 68.2,
        "minZ": 61.8,
        "maxZ": 68.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -33.2,
        "maxX": -26.8,
        "minZ": 26.8,
        "maxZ": 33.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": 26.8,
        "maxX": 33.2,
        "minZ": 26.8,
        "maxZ": 33.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -68.2,
        "maxX": -61.8,
        "minZ": 21.8,
        "maxZ": 28.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": 61.8,
        "maxX": 68.2,
        "minZ": 21.8,
        "maxZ": 28.2,
        "minY": 0,
        "maxY": 24
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 78.7,
        "maxZ": 81.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 78.7,
        "maxZ": 81.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": -95.3,
        "maxX": -94.7,
        "minZ": 79.7,
        "maxZ": 80.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 78.7,
        "maxZ": 81.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 78.7,
        "maxZ": 81.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": 94.7,
        "maxX": 95.3,
        "minZ": 79.7,
        "maxZ": 80.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 53.7,
        "maxZ": 56.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 53.7,
        "maxZ": 56.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": -95.3,
        "maxX": -94.7,
        "minZ": 54.7,
        "maxZ": 55.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 53.7,
        "maxZ": 56.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 53.7,
        "maxZ": 56.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": 94.7,
        "maxX": 95.3,
        "minZ": 54.7,
        "maxZ": 55.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 28.7,
        "maxZ": 31.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": 28.7,
        "maxZ": 31.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": -95.3,
        "maxX": -94.7,
        "minZ": 29.7,
        "maxZ": 30.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 28.7,
        "maxZ": 31.3,
        "minY": 0,
        "maxY": 2.4
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": 28.7,
        "maxZ": 31.3,
        "minY": 2.4000000000000004,
        "maxY": 2.5
      },
      {
        "minX": 94.7,
        "maxX": 95.3,
        "minZ": 29.7,
        "maxZ": 30.3,
        "minY": 2.5999999999999996,
        "maxY": 6.6
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": -57,
        "maxZ": -53,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": -52.8,
        "maxX": -47.2,
        "minZ": -56.8,
        "maxZ": -53.8,
        "minY": 7.8,
        "maxY": 8.4
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": -54,
        "maxZ": -53,
        "minY": 7.8,
        "maxY": 13.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -57,
        "maxZ": -53,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": 47.2,
        "maxX": 52.8,
        "minZ": -56.8,
        "maxZ": -53.8,
        "minY": 7.8,
        "maxY": 8.4
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -54,
        "maxZ": -53,
        "minY": 7.8,
        "maxY": 13.2
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": -82,
        "maxZ": -78,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": -27.8,
        "maxX": -22.2,
        "minZ": -81.8,
        "maxZ": -78.8,
        "minY": 7.8,
        "maxY": 8.4
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": -79,
        "maxZ": -78,
        "minY": 7.8,
        "maxY": 13.2
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": -82,
        "maxZ": -78,
        "minY": 5,
        "maxY": 7.800000000000001
      },
      {
        "minX": 22.2,
        "maxX": 27.8,
        "minZ": -81.8,
        "maxZ": -78.8,
        "minY": 7.8,
        "maxY": 8.4
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": -79,
        "maxZ": -78,
        "minY": 7.8,
        "maxY": 13.2
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": -61.3,
        "maxZ": -58.7,
        "minY": 5,
        "maxY": 7.4
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": -61.3,
        "maxZ": -58.7,
        "minY": 7.4,
        "maxY": 7.5
      },
      {
        "minX": -95.3,
        "maxX": -94.7,
        "minZ": -60.3,
        "maxZ": -59.7,
        "minY": 7.6,
        "maxY": 11.6
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": -61.3,
        "maxZ": -58.7,
        "minY": 5,
        "maxY": 7.4
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": -61.3,
        "maxZ": -58.7,
        "minY": 7.4,
        "maxY": 7.5
      },
      {
        "minX": 94.7,
        "maxX": 95.3,
        "minZ": -60.3,
        "maxZ": -59.7,
        "minY": 7.6,
        "maxY": 11.6
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": -26.3,
        "maxZ": -23.7,
        "minY": 5,
        "maxY": 7.4
      },
      {
        "minX": -96.3,
        "maxX": -93.7,
        "minZ": -26.3,
        "maxZ": -23.7,
        "minY": 7.4,
        "maxY": 7.5
      },
      {
        "minX": -95.3,
        "maxX": -94.7,
        "minZ": -25.3,
        "maxZ": -24.7,
        "minY": 7.6,
        "maxY": 11.6
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": -26.3,
        "maxZ": -23.7,
        "minY": 5,
        "maxY": 7.4
      },
      {
        "minX": 93.7,
        "maxX": 96.3,
        "minZ": -26.3,
        "maxZ": -23.7,
        "minY": 7.4,
        "maxY": 7.5
      },
      {
        "minX": 94.7,
        "maxX": 95.3,
        "minZ": -25.3,
        "maxZ": -24.7,
        "minY": 7.6,
        "maxY": 11.6
      },
      {
        "minX": -2.5,
        "maxX": 2.5,
        "minZ": -57.5,
        "maxZ": -52.5,
        "minY": 5,
        "maxY": 8.6
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": -57,
        "maxZ": -53,
        "minY": 8.55,
        "maxY": 9.05
      },
      {
        "minX": -1.2,
        "maxX": 1.2,
        "minZ": -56.2,
        "maxZ": -53.8,
        "minY": 9,
        "maxY": 9.600000000000001
      }
    ],
    "surfaces": [
      {
        "minX": -108,
        "maxX": 108,
        "minZ": -98,
        "maxZ": -5,
        "maxTop": 5,
        "type": "flat",
        "top": 5
      },
      {
        "minX": -108,
        "maxX": 108,
        "minZ": -5,
        "maxZ": 12,
        "maxTop": 5,
        "type": "ramp",
        "axis": "z",
        "lowY": 5,
        "highY": 0
      }
    ]
  },
  "station": {
    "obstacles": [
      { "minX": -137, "maxX": 137, "minZ": 132, "maxZ": 134, "minY": 0, "maxY": 28 },
      { "minX": -137, "maxX": 137, "minZ": -134, "maxZ": -132, "minY": 0, "maxY": 28 },
      { "minX": -137, "maxX": -135, "minZ": -134, "maxZ": 134, "minY": 0, "maxY": 28 },
      { "minX": 135, "maxX": 137, "minZ": -134, "maxZ": 134, "minY": 0, "maxY": 28 },

      { "minX": -134, "maxX": 134, "minZ": 10.75, "maxZ": 11.25, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },
      { "minX": -134, "maxX": 134, "minZ": -11.25, "maxZ": -10.75, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },

      { "minX": -117.5, "maxX": -82.5, "minZ": 5.5, "maxZ": 10.5, "minY": 0, "maxY": 8 },
      { "minX": -42.5, "maxX": -7.5, "minZ": 5.5, "maxZ": 10.5, "minY": 0, "maxY": 8 },
      { "minX": 42.5, "maxX": 77.5, "minZ": 5.5, "maxZ": 10.5, "minY": 0, "maxY": 8 },
      { "minX": 82.5, "maxX": 117.5, "minZ": -10.5, "maxZ": -5.5, "minY": 0, "maxY": 8 },
      { "minX": 7.5, "maxX": 42.5, "minZ": -10.5, "maxZ": -5.5, "minY": 0, "maxY": 8 },
      { "minX": -77.5, "maxX": -42.5, "minZ": -10.5, "maxZ": -5.5, "minY": 0, "maxY": 8 },

      { "minX": -107, "maxX": -103, "minZ": 53, "maxZ": 57, "minY": 0, "maxY": 28 },
      { "minX": -37, "maxX": -33, "minZ": 53, "maxZ": 57, "minY": 0, "maxY": 28 },
      { "minX": 33, "maxX": 37, "minZ": 53, "maxZ": 57, "minY": 0, "maxY": 28 },
      { "minX": 103, "maxX": 107, "minZ": 53, "maxZ": 57, "minY": 0, "maxY": 28 },
      { "minX": -107, "maxX": -103, "minZ": -57, "maxZ": -53, "minY": 0, "maxY": 28 },
      { "minX": -37, "maxX": -33, "minZ": -57, "maxZ": -53, "minY": 0, "maxY": 28 },
      { "minX": 33, "maxX": 37, "minZ": -57, "maxZ": -53, "minY": 0, "maxY": 28 },
      { "minX": 103, "maxX": 107, "minZ": -57, "maxZ": -53, "minY": 0, "maxY": 28 },
      { "minX": -107, "maxX": -103, "minZ": 113, "maxZ": 117, "minY": 0, "maxY": 28 },
      { "minX": -37, "maxX": -33, "minZ": 113, "maxZ": 117, "minY": 0, "maxY": 28 },
      { "minX": 33, "maxX": 37, "minZ": 113, "maxZ": 117, "minY": 0, "maxY": 28 },
      { "minX": 103, "maxX": 107, "minZ": 113, "maxZ": 117, "minY": 0, "maxY": 28 },
      { "minX": -107, "maxX": -103, "minZ": -117, "maxZ": -113, "minY": 0, "maxY": 28 },
      { "minX": -37, "maxX": -33, "minZ": -117, "maxZ": -113, "minY": 0, "maxY": 28 },
      { "minX": 33, "maxX": 37, "minZ": -117, "maxZ": -113, "minY": 0, "maxY": 28 },
      { "minX": 103, "maxX": 107, "minZ": -117, "maxZ": -113, "minY": 0, "maxY": 28 },

      { "minX": -79, "maxX": -51, "minZ": 113, "maxZ": 131, "minY": 0, "maxY": 15 },
      { "minX": 51, "maxX": 79, "minZ": 113, "maxZ": 131, "minY": 0, "maxY": 15 },
      { "minX": -79, "maxX": -51, "minZ": -131, "maxZ": -113, "minY": 0, "maxY": 15 },
      { "minX": 51, "maxX": 79, "minZ": -131, "maxZ": -113, "minY": 0, "maxY": 15 },

      { "minX": -77, "maxX": -53, "minZ": 78.5, "maxZ": 81.5, "minY": 0, "maxY": 15 },
      { "minX": 53, "maxX": 77, "minZ": 78.5, "maxZ": 81.5, "minY": 0, "maxY": 15 },
      { "minX": -77, "maxX": -53, "minZ": -81.5, "maxZ": -78.5, "minY": 0, "maxY": 15 },
      { "minX": 53, "maxX": 77, "minZ": -81.5, "maxZ": -78.5, "minY": 0, "maxY": 15 },

      // Hall partition walls: the spawn-quadrant pair (54..86 @ z>0 and
      // -86..-54 @ z<0) was removed (user 2026-08-07) — bots looped against
      // it near the corner spawns (engage-orbit bump). Diagonal pair kept.
      { "minX": -86, "maxX": -54, "minZ": 93.75, "maxZ": 96.25, "minY": 0, "maxY": 15 },
      { "minX": 54, "maxX": 86, "minZ": -96.25, "maxZ": -93.75, "minY": 0, "maxY": 15 },

      { "minX": -111, "maxX": -99, "minZ": 25, "maxZ": 35, "minY": 0, "maxY": 12 },
      { "minX": -41, "maxX": -29, "minZ": 25, "maxZ": 35, "minY": 0, "maxY": 12 },
      { "minX": 29, "maxX": 41, "minZ": 25, "maxZ": 35, "minY": 0, "maxY": 12 },
      { "minX": 99, "maxX": 111, "minZ": 25, "maxZ": 35, "minY": 0, "maxY": 12 },
      { "minX": -111, "maxX": -99, "minZ": -35, "maxZ": -25, "minY": 0, "maxY": 12 },
      { "minX": -41, "maxX": -29, "minZ": -35, "maxZ": -25, "minY": 0, "maxY": 12 },
      { "minX": 29, "maxX": 41, "minZ": -35, "maxZ": -25, "minY": 0, "maxY": 12 },
      { "minX": 99, "maxX": 111, "minZ": -35, "maxZ": -25, "minY": 0, "maxY": 12 },

      { "minX": -99, "maxX": -91, "minZ": 63.5, "maxZ": 66.5, "minY": 0, "maxY": 11 },
      { "minX": -49, "maxX": -41, "minZ": 63.5, "maxZ": 66.5, "minY": 0, "maxY": 11 },
      { "minX": -4, "maxX": 4, "minZ": 63.5, "maxZ": 66.5, "minY": 0, "maxY": 11 },
      { "minX": 41, "maxX": 49, "minZ": 63.5, "maxZ": 66.5, "minY": 0, "maxY": 11 },
      { "minX": 91, "maxX": 99, "minZ": 63.5, "maxZ": 66.5, "minY": 0, "maxY": 11 },
      { "minX": -99, "maxX": -91, "minZ": -66.5, "maxZ": -63.5, "minY": 0, "maxY": 11 },
      { "minX": -49, "maxX": -41, "minZ": -66.5, "maxZ": -63.5, "minY": 0, "maxY": 11 },
      { "minX": -4, "maxX": 4, "minZ": -66.5, "maxZ": -63.5, "minY": 0, "maxY": 11 },
      { "minX": 41, "maxX": 49, "minZ": -66.5, "maxZ": -63.5, "minY": 0, "maxY": 11 },
      { "minX": 91, "maxX": 99, "minZ": -66.5, "maxZ": -63.5, "minY": 0, "maxY": 11 },

      { "minX": -59, "maxX": -41, "minZ": 101, "maxZ": 109, "minY": 0, "maxY": 10 },
      { "minX": 41, "maxX": 59, "minZ": 101, "maxZ": 109, "minY": 0, "maxY": 10 },
      { "minX": -59, "maxX": -41, "minZ": -109, "maxZ": -101, "minY": 0, "maxY": 10 },
      { "minX": 41, "maxX": 59, "minZ": -109, "maxZ": -101, "minY": 0, "maxY": 10 },

      { "minX": -127.5, "maxX": -122.5, "minZ": 42.5, "maxZ": 47.5, "minY": 0, "maxY": 14 },
      { "minX": 122.5, "maxX": 127.5, "minZ": 42.5, "maxZ": 47.5, "minY": 0, "maxY": 14 },
      { "minX": -127.5, "maxX": -122.5, "minZ": -47.5, "maxZ": -42.5, "minY": 0, "maxY": 14 },
      { "minX": 122.5, "maxX": 127.5, "minZ": -47.5, "maxZ": -42.5, "minY": 0, "maxY": 14 },
      { "minX": -127.5, "maxX": -122.5, "minZ": 102.5, "maxZ": 107.5, "minY": 0, "maxY": 14 },
      { "minX": 122.5, "maxX": 127.5, "minZ": 102.5, "maxZ": 107.5, "minY": 0, "maxY": 14 },
      { "minX": -127.5, "maxX": -122.5, "minZ": -107.5, "maxZ": -102.5, "minY": 0, "maxY": 14 },
      { "minX": 122.5, "maxX": 127.5, "minZ": -107.5, "maxZ": -102.5, "minY": 0, "maxY": 14 },

      { "minX": -79, "maxX": -71, "minZ": 14, "maxZ": 22, "minY": 0, "maxY": 11 },
      { "minX": 71, "maxX": 79, "minZ": 14, "maxZ": 22, "minY": 0, "maxY": 11 },
      { "minX": -79, "maxX": -71, "minZ": -22, "maxZ": -14, "minY": 0, "maxY": 11 },
      { "minX": 71, "maxX": 79, "minZ": -22, "maxZ": -14, "minY": 0, "maxY": 11 },

      { "minX": -26.5, "maxX": -23.5, "minZ": 68.5, "maxZ": 71.5, "minY": 0, "maxY": 14 },
      { "minX": 23.5, "maxX": 26.5, "minZ": 68.5, "maxZ": 71.5, "minY": 0, "maxY": 14 },
      { "minX": -26.5, "maxX": -23.5, "minZ": -71.5, "maxZ": -68.5, "minY": 0, "maxY": 14 },
      { "minX": 23.5, "maxX": 26.5, "minZ": -71.5, "maxZ": -68.5, "minY": 0, "maxY": 14 }
    ],
    "surfaces": [
      // Station's raised platforms — bounds extended past the ±138 boundary
      // wall on the outer edges (X both sides, outer Z) so the wall stops the
      // unit BEFORE its single-point center would walk off the surface.
      // Inner Z edges (±11) kept tight against the track corridor so the
      // jump-up onto the platform from y=0 still works as before.
      { "minX": -145, "maxX": 145, "minZ": 11, "maxZ": 145, "maxTop": 4, "type": "flat", "top": 4 },
      { "minX": -145, "maxX": 145, "minZ": -145, "maxZ": -11, "maxTop": 4, "type": "flat", "top": 4 }
    ]
  },
  "flashpoint": {
    "obstacles": [
      // ----- Play-area boundary (matches addBoundaryIndicator(110, 75, 12)) -----
      { "minX": -112, "maxX": 112, "minZ": 75, "maxZ": 77, "minY": 0, "maxY": 12 },
      { "minX": -112, "maxX": 112, "minZ": -77, "maxZ": -75, "minY": 0, "maxY": 12 },
      { "minX": -112, "maxX": -110, "minZ": -77, "maxZ": 77, "minY": 0, "maxY": 12 },
      { "minX": 110, "maxX": 112, "minZ": -77, "maxZ": 77, "minY": 0, "maxY": 12 },

      // ----- B-2 spawn enclosure (SW) — 28 m central doorway in the N wall
      //       PLUS a 6 m side opening at the south end of the E wall, right
      //       against the south boundary (E wall stops at z=-71 instead of
      //       z=-73, leaving the 6 m gap as the side door). -----
      { "minX": -110, "maxX": -82, "minZ": -32, "maxZ": -29, "minY": 0, "maxY": 12 },
      { "minX": -54,  "maxX": -40, "minZ": -32, "maxZ": -29, "minY": 0, "maxY": 12 },
      { "minX": -43,  "maxX": -40, "minZ": -71, "maxZ": -32, "minY": 0, "maxY": 12 },

      // ----- B-1 spawn enclosure (NE) — mirror of B-2: 28 m central
      //       S-wall doorway PLUS a 6 m side opening at the north end of
      //       the W wall (W wall stops at z=71 instead of z=73, leaving
      //       the 6 m gap as the side door against the north boundary). -----
      { "minX": 82, "maxX": 110, "minZ": 29, "maxZ": 32, "minY": 0, "maxY": 12 },
      { "minX": 40, "maxX": 54,  "minZ": 29, "maxZ": 32, "minY": 0, "maxY": 12 },
      { "minX": 40, "maxX": 43,  "minZ": 32, "maxZ": 71, "minY": 0, "maxY": 12 },

      // ----- Mid divider (8 m — matches Factory-style partition height) -----
      { "minX": -58, "maxX": -40, "minZ": -1.5, "maxZ": 1.5, "minY": 0, "maxY": 8 },
      { "minX": -20, "maxX": 10, "minZ": -1.5, "maxZ": 1.5, "minY": 0, "maxY": 8 },
      { "minX": 30, "maxX": 58, "minZ": -1.5, "maxZ": 1.5, "minY": 0, "maxY": 8 },

      // ----- Container cluster (3 parallel shipping containers — red/blue/rust) -----
      { "minX": -38, "maxX": -22, "minZ": 10, "maxZ": 16, "minY": 0, "maxY": 8 },
      { "minX": -38, "maxX": -22, "minZ": 20, "maxZ": 26, "minY": 0, "maxY": 8 },
      { "minX": -38, "maxX": -22, "minZ": 30, "maxZ": 36, "minY": 0, "maxY": 8 },

      // ----- Reception / blueprint room (mid-east, north half) — walls 8 m
      //       (match Factory-style partition height) -----
      { "minX": 10, "maxX": 35, "minZ": 22, "maxZ": 25, "minY": 0, "maxY": 8 },
      { "minX": 32, "maxX": 35, "minZ": 10, "maxZ": 22, "minY": 0, "maxY": 8 },
      { "minX": 10, "maxX": 22, "minZ": 10, "maxZ": 13, "minY": 0, "maxY": 8 },
      { "minX": 30, "maxX": 35, "minZ": 10, "maxZ": 13, "minY": 0, "maxY": 8 },
      { "minX": 10, "maxX": 13, "minZ": 13, "maxZ": 18, "minY": 0, "maxY": 8 },

      // ----- Research / lab room (mid-east, south half) — L-shape, mirror,
      //       walls 8 m -----
      { "minX": 10, "maxX": 35, "minZ": -13, "maxZ": -10, "minY": 0, "maxY": 8 },
      { "minX": 32, "maxX": 35, "minZ": -22, "maxZ": -13, "minY": 0, "maxY": 8 },
      { "minX": 10, "maxX": 22, "minZ": -25, "maxZ": -22, "minY": 0, "maxY": 8 },
      { "minX": 30, "maxX": 35, "minZ": -25, "maxZ": -22, "minY": 0, "maxY": 8 },
      { "minX": 10, "maxX": 13, "minZ": -18, "maxZ": -13, "minY": 0, "maxY": 8 },

      // ----- Substation block (mid-west, south half) — 8 m tall industrial unit -----
      { "minX": -25, "maxX": -5, "minZ": -30, "maxZ": -15, "minY": 0, "maxY": 8 },

      // ----- NW corner partition (FLIPPED 180°, walls LOWERED to 8 m to
      //       match Factory-style partition height, Wall A pulled 5 m south
      //       and Wall B shortened so the alley between the L and the north
      //       boundary widens to ~12 m — clearly a passable side opening) -----
      { "minX": -95, "maxX": -65, "minZ": 60, "maxZ": 63, "minY": 0, "maxY": 8 },
      { "minX": -68, "maxX": -65, "minZ": 55, "maxZ": 60, "minY": 0, "maxY": 8 },

      // ----- SE corner partition (FLIPPED 180° — mirror, opens toward NE;
      //       lowered to 8 m to match the NW partition's height) -----
      { "minX": 65, "maxX": 95, "minZ": -68, "maxZ": -65, "minY": 0, "maxY": 8 },
      { "minX": 65, "maxX": 68, "minZ": -65, "maxZ": -55, "minY": 0, "maxY": 8 },

      // ----- Factory-style sheet-metal partitions (8 m long × 8 m tall ×
      //       0.6 m thick). The previously-overlapping support pillars have
      //       been removed — the partition itself provides full-body cover.
      //       Two SW-area partitions are rotated 90° from the others; the
      //       NE partition has been moved north (z=50→z=60) to blockade the
      //       door↔viewing-deck path inside the B-1 enclosure. -----
      { "minX": -50.3, "maxX": -49.7, "minZ": -24, "maxZ": -16, "minY": 0, "maxY": 8 },
      { "minX": -54, "maxX": -46, "minZ": 19.7, "maxZ": 20.3, "minY": 0, "maxY": 8 },
      { "minX": 46, "maxX": 54, "minZ": -50.3, "maxZ": -49.7, "minY": 0, "maxY": 8 },
      { "minX": 71, "maxX": 79, "minZ": 47.7, "maxZ": 48.3, "minY": 0, "maxY": 8 },
      { "minX": -0.3, "maxX": 0.3, "minZ": -59, "maxZ": -51, "minY": 0, "maxY": 8 },
      { "minX": -0.3, "maxX": 0.3, "minZ": 51, "maxZ": 59, "minY": 0, "maxY": 8 },
      { "minX": -69, "maxX": -61, "minZ": -50.3, "maxZ": -49.7, "minY": 0, "maxY": 8 },
      { "minX": 64.7, "maxX": 65.3, "minZ": -29, "maxZ": -21, "minY": 0, "maxY": 8 },

      // ----- Wooden crate stacks (WIDER 6 m, still 7 m tall) -----
      { "minX": -83, "maxX": -77, "minZ": -18, "maxZ": -12, "minY": 0, "maxY": 7 },
      { "minX": -68, "maxX": -62, "minZ": 17, "maxZ": 23, "minY": 0, "maxY": 7 },
      { "minX": 77, "maxX": 83, "minZ": 12, "maxZ": 18, "minY": 0, "maxY": 7 },
      { "minX": 62, "maxX": 68, "minZ": -23, "maxZ": -17, "minY": 0, "maxY": 7 },

      // ----- Stacked oil drums (WIDER 4 m square, 6 m tall) -----
      { "minX": -74, "maxX": -70, "minZ": -7, "maxZ": -3, "minY": 0, "maxY": 6 },
      { "minX": 70, "maxX": 74, "minZ": 3, "maxZ": 7, "minY": 0, "maxY": 6 },
      { "minX": -17, "maxX": -13, "minZ": 58, "maxZ": 62, "minY": 0, "maxY": 6 },
      { "minX": 13, "maxX": 17, "minZ": -62, "maxZ": -58, "minY": 0, "maxY": 6 },

      // ----- Viewing platform edge walls (all 4 sides — keeps ground units
      //       out of the deck footprint so they can't clip into it; only
      //       jumping mechs clear the 4 m wall to land on top) -----
      { "minX": 80, "maxX": 108, "minZ": 56.7, "maxZ": 57.3, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },
      { "minX": 80, "maxX": 108, "minZ": 72.7, "maxZ": 73.3, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },
      { "minX": 79.7, "maxX": 80.3, "minZ": 57, "maxZ": 73, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },
      { "minX": 107.7, "maxX": 108.3, "minZ": 57, "maxZ": 73, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true }
    ],
    "surfaces": [
      // Viewing platform — short raised catwalk inside the B-1 enclosure
      { "minX": 80, "maxX": 108, "minZ": 57, "maxZ": 73, "maxTop": 4, "type": "flat", "top": 4 }
    ]
  },

  // Hand-derived from buildAirportArena() in client/src/main.js (the offline
  // builder is the source of truth — keep in sync, or regenerate via the
  // browser console: __exportArenaCollision('airport')).
  "airport": {
    "obstacles": [
      // ----- Outer terminal shell (solid, 26 tall) -----
      { "minX": -142, "maxX": 142, "minZ": -116, "maxZ": -112, "minY": 0, "maxY": 26 },
      { "minX": -142, "maxX": 142, "minZ": 112, "maxZ": 116, "minY": 0, "maxY": 26 },
      { "minX": -142, "maxX": -138, "minZ": -116, "maxZ": 116, "minY": 0, "maxY": 26 },
      { "minX": 138, "maxX": 142, "minZ": -116, "maxZ": 116, "minY": 0, "maxY": 26 },
      // ----- Security plateau body (walkable top is the flat surface below);
      //       topBuffer 0 so units standing ON the plateau don't collide -----
      { "minX": -136.8, "maxX": 136.8, "minZ": -39.8, "maxZ": 39.8, "minY": 0, "maxY": 3.7, "topBuffer": 0 },
      // ----- Glass rim fences (solid, block bullets; ramp openings excepted) -----
      { "minX": -88, "maxX": 88, "minZ": -40.6, "maxZ": -39.4, "minY": 4, "maxY": 12 },
      { "minX": -137, "maxX": -130, "minZ": -40.6, "maxZ": -39.4, "minY": 4, "maxY": 12 },
      { "minX": 130, "maxX": 137, "minZ": -40.6, "maxZ": -39.4, "minY": 4, "maxY": 12 },
      { "minX": -88, "maxX": 88, "minZ": 39.4, "maxZ": 40.6, "minY": 4, "maxY": 12 },
      { "minX": -137, "maxX": -130, "minZ": 39.4, "maxZ": 40.6, "minY": 4, "maxY": 12 },
      { "minX": 130, "maxX": 137, "minZ": 39.4, "maxZ": 40.6, "minY": 4, "maxY": 12 },
      // ----- Glass ramp balustrades (stop 1.5 short of each ramp foot) -----
      { "minX": 87, "maxX": 88, "minZ": -48.5, "maxZ": -40, "minY": 0, "maxY": 12 },
      { "minX": 130, "maxX": 131, "minZ": -48.5, "maxZ": -40, "minY": 0, "maxY": 12 },
      { "minX": -88, "maxX": -87, "minZ": -48.5, "maxZ": -40, "minY": 0, "maxY": 12 },
      { "minX": -131, "maxX": -130, "minZ": -48.5, "maxZ": -40, "minY": 0, "maxY": 12 },
      { "minX": 87, "maxX": 88, "minZ": 40, "maxZ": 48.5, "minY": 0, "maxY": 12 },
      { "minX": 130, "maxX": 131, "minZ": 40, "maxZ": 48.5, "minY": 0, "maxY": 12 },
      { "minX": -88, "maxX": -87, "minZ": 40, "maxZ": 48.5, "minY": 0, "maxY": 12 },
      { "minX": -131, "maxX": -130, "minZ": 40, "maxZ": 48.5, "minY": 0, "maxY": 12 },
      // ----- Checkpoint: x-ray machines + metal-detector posts + shoulder glass -----
      { "minX": -4.5, "maxX": 4.5, "minZ": 9, "maxZ": 17, "minY": 4, "maxY": 12 },
      { "minX": -4.5, "maxX": 4.5, "minZ": -17, "maxZ": -9, "minY": 4, "maxY": 12 },
      { "minX": -2.5, "maxX": 2.5, "minZ": -35, "maxZ": -30, "minY": 4, "maxY": 14 },
      { "minX": -2.5, "maxX": 2.5, "minZ": -22, "maxZ": -17, "minY": 4, "maxY": 14 },
      { "minX": -2.5, "maxX": 2.5, "minZ": -9, "maxZ": -4, "minY": 4, "maxY": 14 },
      { "minX": -2.5, "maxX": 2.5, "minZ": 4, "maxZ": 9, "minY": 4, "maxY": 14 },
      { "minX": -2.5, "maxX": 2.5, "minZ": 17, "maxZ": 22, "minY": 4, "maxY": 14 },
      { "minX": -2.5, "maxX": 2.5, "minZ": 30, "maxZ": 35, "minY": 4, "maxY": 14 },
      { "minX": -0.6, "maxX": 0.6, "minZ": 35, "maxZ": 40, "minY": 4, "maxY": 12 },
      { "minX": -0.6, "maxX": 0.6, "minZ": -40, "maxZ": -35, "minY": 4, "maxY": 12 },
      // ----- Departure-board walls (h12 from the plateau) -----
      { "minX": 60, "maxX": 90, "minZ": -2, "maxZ": 2, "minY": 4, "maxY": 16 },
      { "minX": -90, "maxX": -60, "minZ": -2, "maxZ": 2, "minY": 4, "maxY": 16 },
      // ----- Check-in islands (on the plateau) -----
      { "minX": -95, "maxX": -55, "minZ": -35, "maxZ": -29, "minY": 4, "maxY": 12 },
      { "minX": -95, "maxX": -55, "minZ": -17, "maxZ": -11, "minY": 4, "maxY": 12 },
      { "minX": 55, "maxX": 95, "minZ": 11, "maxZ": 17, "minY": 4, "maxY": 12 },
      { "minX": 55, "maxX": 95, "minZ": 29, "maxZ": 35, "minY": 4, "maxY": 12 },
      // ----- Gate desks (end pair on plateau, corner pair on ground) -----
      { "minX": 117, "maxX": 123, "minZ": -36, "maxZ": -24, "minY": 4, "maxY": 12 },
      { "minX": -123, "maxX": -117, "minZ": 24, "maxZ": 36, "minY": 4, "maxY": 12 },
      { "minX": -108, "maxX": -102, "minZ": -96, "maxZ": -84, "minY": 0, "maxY": 8 },
      { "minX": 102, "maxX": 108, "minZ": 84, "maxZ": 96, "minY": 0, "maxY": 8 },
      // ----- Info totems -----
      { "minX": -24, "maxX": -16, "minZ": -76, "maxZ": -68, "minY": 0, "maxY": 8 },
      { "minX": 16, "maxX": 24, "minZ": 68, "maxZ": 76, "minY": 0, "maxY": 8 },
      { "minX": 86, "maxX": 94, "minZ": -76, "maxZ": -68, "minY": 0, "maxY": 8 },
      { "minX": -94, "maxX": -86, "minZ": 68, "maxZ": 76, "minY": 0, "maxY": 8 },
      // ----- Vending machine banks -----
      { "minX": 41, "maxX": 49, "minZ": -96, "maxZ": -88, "minY": 0, "maxY": 8 },
      { "minX": -49, "maxX": -41, "minZ": 88, "maxZ": 96, "minY": 0, "maxY": 8 },
      { "minX": -49, "maxX": -41, "minZ": -96, "maxZ": -88, "minY": 0, "maxY": 8 },
      { "minX": 41, "maxX": 49, "minZ": 88, "maxZ": 96, "minY": 0, "maxY": 8 },
      // ----- Seating lounges: h8 ad-panel spine + two low seat aprons each -----
      { "minX": -20, "maxX": 20, "minZ": -62.6, "maxZ": -61.4, "minY": 0, "maxY": 8 },
      { "minX": -20, "maxX": 20, "minZ": -65.2, "maxZ": -62.6, "minY": 0, "maxY": 2 },
      { "minX": -20, "maxX": 20, "minZ": -61.4, "maxZ": -58.8, "minY": 0, "maxY": 2 },
      { "minX": -20, "maxX": 20, "minZ": 61.4, "maxZ": 62.6, "minY": 0, "maxY": 8 },
      { "minX": -20, "maxX": 20, "minZ": 58.8, "maxZ": 61.4, "minY": 0, "maxY": 2 },
      { "minX": -20, "maxX": 20, "minZ": 62.6, "maxZ": 65.2, "minY": 0, "maxY": 2 },
      { "minX": 58, "maxX": 82, "minZ": -57.6, "maxZ": -56.4, "minY": 0, "maxY": 8 },
      { "minX": 58, "maxX": 82, "minZ": -60.2, "maxZ": -57.6, "minY": 0, "maxY": 2 },
      { "minX": 58, "maxX": 82, "minZ": -56.4, "maxZ": -53.8, "minY": 0, "maxY": 2 },
      { "minX": -82, "maxX": -58, "minZ": 56.4, "maxZ": 57.6, "minY": 0, "maxY": 8 },
      { "minX": -82, "maxX": -58, "minZ": 53.8, "maxZ": 56.4, "minY": 0, "maxY": 2 },
      { "minX": -82, "maxX": -58, "minZ": 57.6, "maxZ": 60.2, "minY": 0, "maxY": 2 },
      // ----- Baggage carousels: low belt loops + h8 center feed housings -----
      { "minX": -102, "maxX": -38, "minZ": -83, "maxZ": -77, "minY": 0, "maxY": 2.4 },
      { "minX": -102, "maxX": -38, "minZ": -69, "maxZ": -63, "minY": 0, "maxY": 2.4 },
      { "minX": -102, "maxX": -96, "minZ": -81.6, "maxZ": -64.4, "minY": 0, "maxY": 2.4 },
      { "minX": -44, "maxX": -38, "minZ": -81.6, "maxZ": -64.4, "minY": 0, "maxY": 2.4 },
      { "minX": -90, "maxX": -50, "minZ": -77, "maxZ": -69, "minY": 0, "maxY": 8 },
      { "minX": 38, "maxX": 102, "minZ": 77, "maxZ": 83, "minY": 0, "maxY": 2.4 },
      { "minX": 38, "maxX": 102, "minZ": 63, "maxZ": 69, "minY": 0, "maxY": 2.4 },
      { "minX": 96, "maxX": 102, "minZ": 64.4, "maxZ": 81.6, "minY": 0, "maxY": 2.4 },
      { "minX": 38, "maxX": 44, "minZ": 64.4, "maxZ": 81.6, "minY": 0, "maxY": 2.4 },
      { "minX": 50, "maxX": 90, "minZ": 69, "maxZ": 77, "minY": 0, "maxY": 8 }
    ],
    "surfaces": [
      // Security plateau top + the four end ramps
      { "minX": -137, "maxX": 137, "minZ": -40, "maxZ": 40, "maxTop": 4, "type": "flat", "top": 4 },
      { "minX": 88, "maxX": 130, "minZ": -50, "maxZ": -40, "maxTop": 4, "type": "ramp", "axis": "z", "lowY": 0, "highY": 4 },
      { "minX": -130, "maxX": -88, "minZ": -50, "maxZ": -40, "maxTop": 4, "type": "ramp", "axis": "z", "lowY": 0, "highY": 4 },
      { "minX": 88, "maxX": 130, "minZ": 40, "maxZ": 50, "maxTop": 4, "type": "ramp", "axis": "z", "lowY": 4, "highY": 0 },
      { "minX": -130, "maxX": -88, "minZ": 40, "maxZ": 50, "maxTop": 4, "type": "ramp", "axis": "z", "lowY": 4, "highY": 0 }
    ]
  }
};

const ARENA_SPAWNS = {
  // Streets: diagonal corner spawns (user 2026-08-06; old values ±108, 0) —
  // 8u clear of the boundary walls (x ±126, z ±90) and the corner towers.
  arena2: { p1: { x: -118, y: GROUND_BASE_Y, z: -82 }, p2: { x: 118, y: GROUND_BASE_Y, z: 82 } },
  factory: { p1: { x: -120, y: GROUND_BASE_Y, z: 77 }, p2: { x: 120, y: GROUND_BASE_Y, z: -77 } },
  factory2: { p1: { x: -100, y: GROUND_BASE_Y, z: -60 }, p2: { x: 100, y: GROUND_BASE_Y, z: 60 } },
  square: { p1: { x: -95, y: GROUND_BASE_Y, z: -45 }, p2: { x: 95, y: GROUND_BASE_Y, z: 45 } },
  lobby: { p1: { x: -30, y: GROUND_BASE_Y, z: 50 }, p2: { x: 30, y: GROUND_BASE_Y, z: 50 } },
  // Station spawns moved ONTO the decks (2026-08-05 experiment): diagonal,
  // opposite platforms, well inside the deck bodies (deck floor 4 → spawn
  // y = GROUND_BASE_Y + 4). The old track-corridor spawns anchored every
  // fight to the railway axis. Old values: p1 (-128, 0), p2 (128, 0).
  // 2026-08-06 (user): deck spawns in the FAR corners (older values ±100/±70,
  // ±128/±70) — x ±128 leaves 7u to the end wall (±135); z ±112 sits just
  // past the corner storage tank (z 102.5–107.5) and 20u off the outer wall
  // (inner face ±132). 2026-08-07: briefly moved to the back-wall pockets
  // (±25/±125) — engagements started too fast; reverted same day (user).
  station: { p1: { x: -128, y: GROUND_BASE_Y + 4, z: -112 }, p2: { x: 128, y: GROUND_BASE_Y + 4, z: 112 } },
  flashpoint: { p1: { x: -24, y: GROUND_BASE_Y, z: 0 }, p2: { x: 24, y: GROUND_BASE_Y, z: 0 } },
  // Airport: ground level right at the mouth of a corner ramp (ramp x-span
  // 88..130, feet at |z| 50). 2026-08-08 (user): ±118/±72 -> ±130/±56, 6u
  // off the foot, with the 2v2 teammate offset stepping AWAY from centre so
  // the pair lands 6u + 18u out on BOTH sides — mirrored distances are what
  // matter (the original plain +Z offset gave one team 10u and the other
  // 34u, so the near team always won the climb race and the far team spent
  // the match fighting on the ground).
  airport: { p1: { x: -130, y: GROUND_BASE_Y, z: -56 }, p2: { x: 130, y: GROUND_BASE_Y, z: 56 } }
};

function materializeSurface(surface) {
  if (surface.type === 'ramp') {
    const { minX, maxX, minZ, maxZ, maxTop, axis, lowY, highY } = surface;
    const lowEnd = axis === 'x' ? minX : minZ;
    const highEnd = axis === 'x' ? maxX : maxZ;
    const span = (highEnd - lowEnd) || 1;
    const dy = highY - lowY;
    // type/axis/lowY/highY are kept on the materialized surface so bot-side
    // consumers (nav grid, surface-aware LoS) can reason about the slope.
    return { minX, maxX, minZ, maxZ, maxTop, type: 'ramp', axis, lowY, highY, heightAt(x, z) {
      const v = axis === 'x' ? x : z;
      const t = (v - lowEnd) / span;
      const c = Math.max(0, Math.min(1, t));
      return lowY + dy * c;
    } };
  }
  const { minX, maxX, minZ, maxZ, maxTop, top } = surface;
  return { minX, maxX, minZ, maxZ, maxTop, heightAt: () => top };
}

function buildGeneratedArena(mapKey) {
  const data = GENERATED_ARENA_COLLISION_DATA[mapKey];
  return {
    mapKey,
    obstacles: [...makeBoundaryObstacles(mapKey), ...data.obstacles],
    surfaces: data.surfaces.map(materializeSurface),
    spawns: ARENA_SPAWNS[mapKey]
  };
}

const ARENAS = {
  arena1: buildPlainField(),
  arena2: buildGeneratedArena('arena2'),
  factory: buildGeneratedArena('factory'),
  factory2: buildGeneratedArena('factory2'),
  square: buildGeneratedArena('square'),
  lobby: buildGeneratedArena('lobby'),
  station: buildGeneratedArena('station'),
  flashpoint: buildGeneratedArena('flashpoint'),
  airport: buildGeneratedArena('airport')
};

export function getArena(mapKey) {
  const arena = ARENAS[mapKey];
  if (!arena) throw new Error(`No arena data for map: ${mapKey}`);
  return arena;
}

export function getArenaObstacles(mapKey) { return getArena(mapKey).obstacles; }
export function getArenaSurfaces(mapKey) { return getArena(mapKey).surfaces; }
export function getArenaSpawns(mapKey) { return getArena(mapKey).spawns; }
