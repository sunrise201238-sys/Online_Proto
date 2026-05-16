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

const PLAIN_FIELD_HALF = 138;
const PLAIN_FIELD_WALL_THICKNESS = 2;
const PLAIN_FIELD_WALL_HEIGHT = 16;

function makeBoundaryObstacles() {
  return [
    { minX: PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS, maxX: PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS, minZ: -PLAIN_FIELD_HALF, maxZ: PLAIN_FIELD_HALF, minY: 0, maxY: PLAIN_FIELD_WALL_HEIGHT * 2, topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2 },
    { minX: -PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS, maxX: -PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS, minZ: -PLAIN_FIELD_HALF, maxZ: PLAIN_FIELD_HALF, minY: 0, maxY: PLAIN_FIELD_WALL_HEIGHT * 2, topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2 },
    { minX: -PLAIN_FIELD_HALF, maxX: PLAIN_FIELD_HALF, minZ: PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS, maxZ: PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS, minY: 0, maxY: PLAIN_FIELD_WALL_HEIGHT * 2, topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2 },
    { minX: -PLAIN_FIELD_HALF, maxX: PLAIN_FIELD_HALF, minZ: -PLAIN_FIELD_HALF - PLAIN_FIELD_WALL_THICKNESS, maxZ: -PLAIN_FIELD_HALF + PLAIN_FIELD_WALL_THICKNESS, minY: 0, maxY: PLAIN_FIELD_WALL_HEIGHT * 2, topBuffer: PLAIN_FIELD_WALL_HEIGHT * 2 }
  ];
}

function buildPlainField() {
  return {
    mapKey: 'arena1',
    obstacles: makeBoundaryObstacles(),
    surfaces: [],
    spawns: {
      p1: { x: -24, y: GROUND_BASE_Y, z: 0 },
      p2: { x: 24, y: GROUND_BASE_Y, z: 0 }
    }
  };
}

const GENERATED_ARENA_COLLISION_DATA = {
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
        "minX": -79,
        "maxX": -57,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 11
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
        "minX": 35,
        "maxX": 49,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 16
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
        "minX": 86,
        "maxX": 114,
        "minZ": -60,
        "maxZ": -36,
        "minY": 0,
        "maxY": 15
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
        "minX": -79,
        "maxX": -57,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 16
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
        "minX": 35,
        "maxX": 49,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 14
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
        "minX": 86,
        "maxX": 114,
        "minZ": 36,
        "maxZ": 60,
        "minY": 0,
        "maxY": 12
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": -103,
        "maxZ": -97,
        "minY": 0,
        "maxY": 20
      },
      {
        "minX": -130,
        "maxX": 130,
        "minZ": 97,
        "maxZ": 103,
        "minY": 0,
        "maxY": 20
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
        "minZ": -34.199999999999996,
        "maxZ": -28.999999999999996,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": -34.199999999999996,
        "maxZ": -28.999999999999996,
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
        "minZ": 28.999999999999996,
        "maxZ": 34.199999999999996,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": -8.424999999999999,
        "maxX": -7.975,
        "minZ": 28.999999999999996,
        "maxZ": 34.199999999999996,
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
        "minZ": -34.199999999999996,
        "maxZ": -28.999999999999996,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": -34.199999999999996,
        "maxZ": -28.999999999999996,
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
        "minZ": 28.999999999999996,
        "maxZ": 34.199999999999996,
        "minY": 7.245,
        "maxY": 8.845
      },
      {
        "minX": 7.975,
        "maxX": 8.424999999999999,
        "minZ": 28.999999999999996,
        "maxZ": 34.199999999999996,
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
        "minX": -95.7,
        "maxX": -94.3,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -94.2,
        "maxX": -92.8,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -50.7,
        "maxX": -49.3,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -49.2,
        "maxX": -47.8,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 24.3,
        "maxX": 25.7,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 25.8,
        "maxX": 27.2,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 79.3,
        "maxX": 80.7,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 77.8,
        "maxX": 79.2,
        "minZ": -15.799999999999999,
        "maxZ": -14.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -78.7,
        "maxX": -77.3,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -77.2,
        "maxX": -75.8,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -25.7,
        "maxX": -24.3,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -24.2,
        "maxX": -22.8,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 49.3,
        "maxX": 50.7,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 50.8,
        "maxX": 52.2,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 94.3,
        "maxX": 95.7,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 92.8,
        "maxX": 94.2,
        "minZ": 14.6,
        "maxZ": 15.799999999999999,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -31.5,
        "maxX": -28.5,
        "minZ": -15.75,
        "maxZ": -14.25,
        "minY": 0,
        "maxY": 1.7
      },
      {
        "minX": -31.7,
        "maxX": -28.3,
        "minZ": -16,
        "maxZ": -14,
        "minY": 2.6100000000000003,
        "maxY": 2.79
      },
      {
        "minX": 28.5,
        "maxX": 31.5,
        "minZ": 14.25,
        "maxZ": 15.75,
        "minY": 0,
        "maxY": 1.7
      },
      {
        "minX": 28.3,
        "maxX": 31.7,
        "minZ": 14,
        "maxZ": 16,
        "minY": 2.6100000000000003,
        "maxY": 2.79
      },
      {
        "minX": -59.5,
        "maxX": -56.5,
        "minZ": 14.05,
        "maxZ": 15.55,
        "minY": 0,
        "maxY": 1.7
      },
      {
        "minX": -59.7,
        "maxX": -56.3,
        "minZ": 13.8,
        "maxZ": 15.8,
        "minY": 2.6100000000000003,
        "maxY": 2.79
      },
      {
        "minX": 58.5,
        "maxX": 61.5,
        "minZ": -15.55,
        "maxZ": -14.05,
        "minY": 0,
        "maxY": 1.7
      },
      {
        "minX": 58.3,
        "maxX": 61.7,
        "minZ": -15.8,
        "maxZ": -13.8,
        "minY": 2.6100000000000003,
        "maxY": 2.79
      },
      {
        "minX": -20.9,
        "maxX": -19.1,
        "minZ": -14.85,
        "maxZ": -14.15,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": -12.9,
        "maxX": -11.1,
        "minZ": -14.85,
        "maxZ": -14.15,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": 11.1,
        "maxX": 12.9,
        "minZ": 14.15,
        "maxZ": 14.85,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": 19.1,
        "maxX": 20.9,
        "minZ": 14.15,
        "maxZ": 14.85,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": -100.9,
        "maxX": -99.1,
        "minZ": -14.85,
        "maxZ": -14.15,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": 99.1,
        "maxX": 100.9,
        "minZ": 14.15,
        "maxZ": 14.85,
        "minY": 0.050000000000000044,
        "maxY": 1.05
      },
      {
        "minX": -26,
        "maxX": -18,
        "minZ": -38.8,
        "maxZ": -37.2,
        "minY": 0.04999999999999993,
        "maxY": 1.65
      },
      {
        "minX": 18,
        "maxX": 26,
        "minZ": -38.8,
        "maxZ": -37.2,
        "minY": 0.04999999999999993,
        "maxY": 1.65
      },
      {
        "minX": -26,
        "maxX": -18,
        "minZ": 37.2,
        "maxZ": 38.8,
        "minY": 0.04999999999999993,
        "maxY": 1.65
      },
      {
        "minX": 18,
        "maxX": 26,
        "minZ": 37.2,
        "maxZ": 38.8,
        "minY": 0.04999999999999993,
        "maxY": 1.65
      },
      {
        "minX": -28.7,
        "maxX": -27.3,
        "minZ": -52.6,
        "maxZ": -51.4,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": -26.7,
        "maxX": -25.3,
        "minZ": -52.6,
        "maxZ": -51.4,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 25.3,
        "maxX": 26.7,
        "minZ": 51.4,
        "maxZ": 52.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
      },
      {
        "minX": 27.3,
        "maxX": 28.7,
        "minZ": 51.4,
        "maxZ": 52.6,
        "minY": 0.09999999999999987,
        "maxY": 2.7
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
      { "minX": -130, "maxX": 130, "minZ": 92, "maxZ": 94, "minY": 0, "maxY": 28 },
      { "minX": -130, "maxX": 130, "minZ": -94, "maxZ": -92, "minY": 0, "maxY": 28 },
      { "minX": -130, "maxX": -128, "minZ": -94, "maxZ": 94, "minY": 0, "maxY": 28 },
      { "minX": 128, "maxX": 130, "minZ": -94, "maxZ": 94, "minY": 0, "maxY": 28 }
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
        "minZ": -107,
        "maxZ": -105,
        "minY": 0,
        "maxY": 22
      },
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
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": -77.35,
        "maxZ": -76.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": -73.35,
        "maxZ": -72.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": -77.35,
        "maxZ": -76.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": -73.35,
        "maxZ": -72.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -77.25,
        "maxZ": -72.75,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": -74.7,
        "maxZ": -73.3,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": -67.9,
        "maxX": -66.9,
        "minZ": -76.5,
        "maxZ": -75.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": -73.75,
        "maxX": -66.25,
        "minZ": -72.8,
        "maxZ": -72.39999999999999,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": -77.35,
        "maxZ": -76.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": -73.35,
        "maxZ": -72.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": -77.35,
        "maxZ": -76.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": -73.35,
        "maxZ": -72.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -77.25,
        "maxZ": -72.75,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": -74.7,
        "maxZ": -73.3,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": 72.1,
        "maxX": 73.1,
        "minZ": -76.5,
        "maxZ": -75.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": 66.25,
        "maxX": 73.75,
        "minZ": -72.8,
        "maxZ": -72.39999999999999,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": 72.65,
        "maxZ": 73.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": 76.65,
        "maxZ": 77.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": 72.65,
        "maxZ": 73.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": 76.65,
        "maxZ": 77.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 72.75,
        "maxZ": 77.25,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": 75.3,
        "maxZ": 76.7,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": -67.9,
        "maxX": -66.9,
        "minZ": 73.5,
        "maxZ": 74.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": -73.75,
        "maxX": -66.25,
        "minZ": 77.2,
        "maxZ": 77.60000000000001,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": 72.65,
        "maxZ": 73.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": 76.65,
        "maxZ": 77.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": 72.65,
        "maxZ": 73.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": 76.65,
        "maxZ": 77.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 72.75,
        "maxZ": 77.25,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": 75.3,
        "maxZ": 76.7,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": 72.1,
        "maxX": 73.1,
        "minZ": 73.5,
        "maxZ": 74.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": 66.25,
        "maxX": 73.75,
        "minZ": 77.2,
        "maxZ": 77.60000000000001,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": -27.35,
        "maxZ": -26.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": -23.35,
        "maxZ": -22.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": -27.35,
        "maxZ": -26.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": -23.35,
        "maxZ": -22.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": -27.25,
        "maxZ": -22.75,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": -25.8,
        "maxZ": -24.2,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": -24.7,
        "maxZ": -23.3,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": -67.9,
        "maxX": -66.9,
        "minZ": -26.5,
        "maxZ": -25.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": -73.75,
        "maxX": -66.25,
        "minZ": -22.8,
        "maxZ": -22.400000000000002,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": -27.35,
        "maxZ": -26.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": -23.35,
        "maxZ": -22.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": -27.35,
        "maxZ": -26.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": -23.35,
        "maxZ": -22.65,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": -27.25,
        "maxZ": -22.75,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": -25.8,
        "maxZ": -24.2,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": -24.7,
        "maxZ": -23.3,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": 72.1,
        "maxX": 73.1,
        "minZ": -26.5,
        "maxZ": -25.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": 66.25,
        "maxX": 73.75,
        "minZ": -22.8,
        "maxZ": -22.400000000000002,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": 22.65,
        "maxZ": 23.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -73.85,
        "maxX": -73.15,
        "minZ": 26.65,
        "maxZ": 27.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": 22.65,
        "maxZ": 23.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -66.85,
        "maxX": -66.15,
        "minZ": 26.65,
        "maxZ": 27.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": -74,
        "maxX": -66,
        "minZ": 22.75,
        "maxZ": 27.25,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": -73.8,
        "maxX": -71.39999999999999,
        "minZ": 24.2,
        "maxZ": 25.8,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": -68.3,
        "maxX": -66.89999999999999,
        "minZ": 25.3,
        "maxZ": 26.7,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": -67.9,
        "maxX": -66.9,
        "minZ": 23.5,
        "maxZ": 24.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": -73.75,
        "maxX": -66.25,
        "minZ": 27.2,
        "maxZ": 27.599999999999998,
        "minY": 3.7,
        "maxY": 7.3
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": 22.65,
        "maxZ": 23.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66.15,
        "maxX": 66.85,
        "minZ": 26.65,
        "maxZ": 27.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": 22.65,
        "maxZ": 23.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 73.15,
        "maxX": 73.85,
        "minZ": 26.65,
        "maxZ": 27.35,
        "minY": 0,
        "maxY": 3.2
      },
      {
        "minX": 66,
        "maxX": 74,
        "minZ": 22.75,
        "maxZ": 27.25,
        "minY": 3.15,
        "maxY": 3.65
      },
      {
        "minX": 66.2,
        "maxX": 68.60000000000001,
        "minZ": 24.2,
        "maxZ": 25.8,
        "minY": 3.6500000000000004,
        "maxY": 5.15
      },
      {
        "minX": 71.7,
        "maxX": 73.10000000000001,
        "minZ": 25.3,
        "maxZ": 26.7,
        "minY": 3.7,
        "maxY": 4.7
      },
      {
        "minX": 72.1,
        "maxX": 73.1,
        "minZ": 23.5,
        "maxZ": 24.5,
        "minY": 3.8,
        "maxY": 5.3999999999999995
      },
      {
        "minX": 66.25,
        "maxX": 73.75,
        "minZ": 27.2,
        "maxZ": 27.599999999999998,
        "minY": 3.7,
        "maxY": 7.3
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
        "minX": -40.8,
        "maxX": -39.2,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 5,
        "maxY": 7
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
        "minX": 39.2,
        "maxX": 40.8,
        "minZ": -75.8,
        "maxZ": -74.2,
        "minY": 5,
        "maxY": 7
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
        "minX": -40.8,
        "maxX": -39.2,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 5,
        "maxY": 7
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
        "minX": 39.2,
        "maxX": 40.8,
        "minZ": 74.2,
        "maxZ": 75.8,
        "minY": 5,
        "maxY": 7
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
        "maxY": 5.2
      },
      {
        "minX": -118.5,
        "maxX": -111.5,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -116.75,
        "maxX": -113.25,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -56,
        "maxX": -44,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -51.5,
        "maxX": -48.5,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": -4,
        "maxX": 4,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": 44,
        "maxX": 56,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": 48.5,
        "maxX": 51.5,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": 108,
        "maxX": 122,
        "minZ": -92.75,
        "maxZ": -87.25,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": 111.5,
        "maxX": 118.5,
        "minZ": -91.25,
        "maxZ": -88.75,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": 113.25,
        "maxX": 116.75,
        "minZ": -90.5,
        "maxZ": -89.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -122,
        "maxX": -108,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": -118.5,
        "maxX": -111.5,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -116.75,
        "maxX": -113.25,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -56,
        "maxX": -44,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -51.5,
        "maxX": -48.5,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -8,
        "maxX": 8,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": -4,
        "maxX": 4,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": -2,
        "maxX": 2,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": 44,
        "maxX": 56,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": 48.5,
        "maxX": 51.5,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": 108,
        "maxX": 122,
        "minZ": 87.25,
        "maxZ": 92.75,
        "minY": 0,
        "maxY": 5.2
      },
      {
        "minX": 111.5,
        "maxX": 118.5,
        "minZ": 88.75,
        "maxZ": 91.25,
        "minY": 4.95,
        "maxY": 6.45
      },
      {
        "minX": 113.25,
        "maxX": 116.75,
        "minZ": 89.5,
        "maxZ": 90.5,
        "minY": 6.5,
        "maxY": 7.5
      },
      {
        "minX": -16.4,
        "maxX": -13.6,
        "minZ": -16.4,
        "maxZ": -13.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -13.5,
        "maxX": -10.7,
        "minZ": -16.4,
        "maxZ": -13.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -16.4,
        "maxX": -13.6,
        "minZ": -13.5,
        "maxZ": -10.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -13.5,
        "maxX": -10.7,
        "minZ": -13.5,
        "maxZ": -10.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -14.950000000000001,
        "maxX": -12.15,
        "minZ": -14.950000000000001,
        "maxZ": -12.15,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": 13.6,
        "maxX": 16.4,
        "minZ": 13.6,
        "maxZ": 16.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 16.5,
        "maxX": 19.299999999999997,
        "minZ": 13.6,
        "maxZ": 16.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 13.6,
        "maxX": 16.4,
        "minZ": 16.5,
        "maxZ": 19.299999999999997,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 16.5,
        "maxX": 19.299999999999997,
        "minZ": 16.5,
        "maxZ": 19.299999999999997,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 15.049999999999999,
        "maxX": 17.849999999999998,
        "minZ": 15.049999999999999,
        "maxZ": 17.849999999999998,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": -31.4,
        "maxX": -28.6,
        "minZ": 33.6,
        "maxZ": 36.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -28.5,
        "maxX": -25.700000000000003,
        "minZ": 33.6,
        "maxZ": 36.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -31.4,
        "maxX": -28.6,
        "minZ": 36.5,
        "maxZ": 39.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -28.5,
        "maxX": -25.700000000000003,
        "minZ": 36.5,
        "maxZ": 39.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -29.95,
        "maxX": -27.150000000000002,
        "minZ": 35.050000000000004,
        "maxZ": 37.85,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": 28.6,
        "maxX": 31.4,
        "minZ": -36.4,
        "maxZ": -33.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 31.5,
        "maxX": 34.3,
        "minZ": -36.4,
        "maxZ": -33.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 28.6,
        "maxX": 31.4,
        "minZ": -33.5,
        "maxZ": -30.700000000000003,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 31.5,
        "maxX": 34.3,
        "minZ": -33.5,
        "maxZ": -30.700000000000003,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 30.05,
        "maxX": 32.85,
        "minZ": -34.949999999999996,
        "maxZ": -32.15,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": -1.4,
        "maxX": 1.4,
        "minZ": -56.4,
        "maxZ": -53.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 1.5,
        "maxX": 4.3,
        "minZ": -56.4,
        "maxZ": -53.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -1.4,
        "maxX": 1.4,
        "minZ": -53.5,
        "maxZ": -50.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 1.5,
        "maxX": 4.3,
        "minZ": -53.5,
        "maxZ": -50.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 0.050000000000000044,
        "maxX": 2.8499999999999996,
        "minZ": -54.949999999999996,
        "maxZ": -52.15,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": -1.4,
        "maxX": 1.4,
        "minZ": 53.6,
        "maxZ": 56.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 1.5,
        "maxX": 4.3,
        "minZ": 53.6,
        "maxZ": 56.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -1.4,
        "maxX": 1.4,
        "minZ": 56.5,
        "maxZ": 59.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 1.5,
        "maxX": 4.3,
        "minZ": 56.5,
        "maxZ": 59.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 0.050000000000000044,
        "maxX": 2.8499999999999996,
        "minZ": 55.050000000000004,
        "maxZ": 57.85,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": -86.4,
        "maxX": -83.6,
        "minZ": -56.4,
        "maxZ": -53.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -83.5,
        "maxX": -80.69999999999999,
        "minZ": -56.4,
        "maxZ": -53.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -86.4,
        "maxX": -83.6,
        "minZ": -53.5,
        "maxZ": -50.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -83.5,
        "maxX": -80.69999999999999,
        "minZ": -53.5,
        "maxZ": -50.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -84.95,
        "maxX": -82.14999999999999,
        "minZ": -54.949999999999996,
        "maxZ": -52.15,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": 83.6,
        "maxX": 86.4,
        "minZ": 53.6,
        "maxZ": 56.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 86.5,
        "maxX": 89.30000000000001,
        "minZ": 53.6,
        "maxZ": 56.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 83.6,
        "maxX": 86.4,
        "minZ": 56.5,
        "maxZ": 59.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 86.5,
        "maxX": 89.30000000000001,
        "minZ": 56.5,
        "maxZ": 59.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 85.05,
        "maxX": 87.85000000000001,
        "minZ": 55.050000000000004,
        "maxZ": 57.85,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": -31.4,
        "maxX": -28.6,
        "minZ": -51.4,
        "maxZ": -48.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -28.5,
        "maxX": -25.700000000000003,
        "minZ": -51.4,
        "maxZ": -48.6,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -31.4,
        "maxX": -28.6,
        "minZ": -48.5,
        "maxZ": -45.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -28.5,
        "maxX": -25.700000000000003,
        "minZ": -48.5,
        "maxZ": -45.7,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": -29.95,
        "maxX": -27.150000000000002,
        "minZ": -49.949999999999996,
        "maxZ": -47.15,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
      },
      {
        "minX": 28.6,
        "maxX": 31.4,
        "minZ": 48.6,
        "maxZ": 51.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 31.5,
        "maxX": 34.3,
        "minZ": 48.6,
        "maxZ": 51.4,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 28.6,
        "maxX": 31.4,
        "minZ": 51.5,
        "maxZ": 54.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 31.5,
        "maxX": 34.3,
        "minZ": 51.5,
        "maxZ": 54.3,
        "minY": 0.10000000000000009,
        "maxY": 2.9
      },
      {
        "minX": 30.05,
        "maxX": 32.85,
        "minZ": 50.050000000000004,
        "maxZ": 52.85,
        "minY": 3.0000000000000004,
        "maxY": 5.800000000000001
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
    "surfaces": []
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
        "minX": -2.5,
        "maxX": 2.5,
        "minZ": -84.5,
        "maxZ": -79.5,
        "minY": 30,
        "maxY": 54
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
        "minZ": 53.4,
        "maxZ": 53.800000000000004,
        "minY": 3.4000000000000004,
        "maxY": 5.4
      },
      {
        "minX": -66,
        "maxX": -54,
        "minZ": 53.35,
        "maxZ": 53.85,
        "minY": 5.2,
        "maxY": 5.3999999999999995
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
        "minZ": 53.4,
        "maxZ": 53.800000000000004,
        "minY": 3.4000000000000004,
        "maxY": 5.4
      },
      {
        "minX": 54,
        "maxX": 66,
        "minZ": 53.35,
        "maxZ": 53.85,
        "minY": 5.2,
        "maxY": 5.3999999999999995
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 80.5,
        "maxZ": 83.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": -82.75,
        "maxX": -73.25,
        "minZ": 80.4,
        "maxZ": 83.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": -81.825,
        "maxX": -74.175,
        "minZ": 80.8,
        "maxZ": 83.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 83.15,
        "maxZ": 83.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": -82.14,
        "maxX": -73.86,
        "minZ": 83.44999999999999,
        "maxZ": 83.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 80.5,
        "maxZ": 83.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": -53.25,
        "maxX": -46.75,
        "minZ": 80.4,
        "maxZ": 83.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": -52.55,
        "maxX": -47.45,
        "minZ": 80.8,
        "maxZ": 83.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": 83.15,
        "maxZ": 83.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": -52.76,
        "maxX": -47.24,
        "minZ": 83.44999999999999,
        "maxZ": 83.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 80.5,
        "maxZ": 83.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": 73.25,
        "maxX": 82.75,
        "minZ": 80.4,
        "maxZ": 83.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": 74.175,
        "maxX": 81.825,
        "minZ": 80.8,
        "maxZ": 83.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 83.15,
        "maxZ": 83.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": 73.86,
        "maxX": 82.14,
        "minZ": 83.44999999999999,
        "maxZ": 83.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 80.5,
        "maxZ": 83.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": 46.75,
        "maxX": 53.25,
        "minZ": 80.4,
        "maxZ": 83.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": 47.45,
        "maxX": 52.55,
        "minZ": 80.8,
        "maxZ": 83.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": 83.15,
        "maxZ": 83.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": 47.24,
        "maxX": 52.76,
        "minZ": 83.44999999999999,
        "maxZ": 83.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": 84.5,
        "maxZ": 87.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": -28.25,
        "maxX": -21.75,
        "minZ": 84.4,
        "maxZ": 87.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": -27.55,
        "maxX": -22.45,
        "minZ": 84.8,
        "maxZ": 87.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": 87.15,
        "maxZ": 87.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": -27.76,
        "maxX": -22.24,
        "minZ": 87.44999999999999,
        "maxZ": 87.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": 84.5,
        "maxZ": 87.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": 21.75,
        "maxX": 28.25,
        "minZ": 84.4,
        "maxZ": 87.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": 22.45,
        "maxX": 27.55,
        "minZ": 84.8,
        "maxZ": 87.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": 87.15,
        "maxZ": 87.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": 22.24,
        "maxX": 27.76,
        "minZ": 87.44999999999999,
        "maxZ": 87.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 23.5,
        "maxZ": 26.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": -82.75,
        "maxX": -73.25,
        "minZ": 23.4,
        "maxZ": 26.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": -81.825,
        "maxX": -74.175,
        "minZ": 23.8,
        "maxZ": 26.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": -82.5,
        "maxX": -73.5,
        "minZ": 26.15,
        "maxZ": 26.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": -82.14,
        "maxX": -73.86,
        "minZ": 26.450000000000003,
        "maxZ": 26.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 23.5,
        "maxZ": 26.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": 73.25,
        "maxX": 82.75,
        "minZ": 23.4,
        "maxZ": 26.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": 74.175,
        "maxX": 81.825,
        "minZ": 23.8,
        "maxZ": 26.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": 73.5,
        "maxX": 82.5,
        "minZ": 26.15,
        "maxZ": 26.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": 73.86,
        "maxX": 82.14,
        "minZ": 26.450000000000003,
        "maxZ": 26.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": -33,
        "maxX": -27,
        "minZ": 30.5,
        "maxZ": 33.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": -33.25,
        "maxX": -26.75,
        "minZ": 30.4,
        "maxZ": 33.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": -32.55,
        "maxX": -27.45,
        "minZ": 30.8,
        "maxZ": 33.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": -33,
        "maxX": -27,
        "minZ": 33.15,
        "maxZ": 33.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": -32.76,
        "maxX": -27.24,
        "minZ": 33.45,
        "maxZ": 33.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
      },
      {
        "minX": 27,
        "maxX": 33,
        "minZ": 30.5,
        "maxZ": 33.5,
        "minY": 0,
        "maxY": 1.8
      },
      {
        "minX": 26.75,
        "maxX": 33.25,
        "minZ": 30.4,
        "maxZ": 33.6,
        "minY": 1.8,
        "maxY": 2.1
      },
      {
        "minX": 27.45,
        "maxX": 32.55,
        "minZ": 30.8,
        "maxZ": 33.2,
        "minY": 2.1500000000000004,
        "maxY": 2.75
      },
      {
        "minX": 27,
        "maxX": 33,
        "minZ": 33.15,
        "maxZ": 33.65,
        "minY": 2.1500000000000004,
        "maxY": 5.05
      },
      {
        "minX": 27.24,
        "maxX": 32.76,
        "minZ": 33.45,
        "maxZ": 33.75,
        "minY": 4.8500000000000005,
        "maxY": 5.05
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
        "minX": -2.6,
        "maxX": 2.6,
        "minZ": 39.4,
        "maxZ": 44.6,
        "minY": 0,
        "maxY": 2.5
      },
      {
        "minX": -2.3,
        "maxX": 2.3,
        "minZ": 39.7,
        "maxZ": 44.3,
        "minY": 2.8999999999999995,
        "maxY": 8.3
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
        "minX": -2.6,
        "maxX": 2.6,
        "minZ": -32.6,
        "maxZ": -27.4,
        "minY": 5,
        "maxY": 7.5
      },
      {
        "minX": -2.3,
        "maxX": 2.3,
        "minZ": -32.3,
        "maxZ": -27.7,
        "minY": 7.900000000000001,
        "maxY": 13.3
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
        "minZ": -56.5,
        "maxZ": -53.5,
        "minY": 5,
        "maxY": 6.800000000000001
      },
      {
        "minX": -53.25,
        "maxX": -46.75,
        "minZ": -56.6,
        "maxZ": -53.4,
        "minY": 6.8,
        "maxY": 7.1000000000000005
      },
      {
        "minX": -52.55,
        "maxX": -47.45,
        "minZ": -56.2,
        "maxZ": -53.8,
        "minY": 7.15,
        "maxY": 7.75
      },
      {
        "minX": -53,
        "maxX": -47,
        "minZ": -53.85,
        "maxZ": -53.35,
        "minY": 7.1499999999999995,
        "maxY": 10.049999999999999
      },
      {
        "minX": -52.76,
        "maxX": -47.24,
        "minZ": -53.55,
        "maxZ": -53.25,
        "minY": 9.85,
        "maxY": 10.049999999999999
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -56.5,
        "maxZ": -53.5,
        "minY": 5,
        "maxY": 6.800000000000001
      },
      {
        "minX": 46.75,
        "maxX": 53.25,
        "minZ": -56.6,
        "maxZ": -53.4,
        "minY": 6.8,
        "maxY": 7.1000000000000005
      },
      {
        "minX": 47.45,
        "maxX": 52.55,
        "minZ": -56.2,
        "maxZ": -53.8,
        "minY": 7.15,
        "maxY": 7.75
      },
      {
        "minX": 47,
        "maxX": 53,
        "minZ": -53.85,
        "maxZ": -53.35,
        "minY": 7.1499999999999995,
        "maxY": 10.049999999999999
      },
      {
        "minX": 47.24,
        "maxX": 52.76,
        "minZ": -53.55,
        "maxZ": -53.25,
        "minY": 9.85,
        "maxY": 10.049999999999999
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": -81.5,
        "maxZ": -78.5,
        "minY": 5,
        "maxY": 6.800000000000001
      },
      {
        "minX": -28.25,
        "maxX": -21.75,
        "minZ": -81.6,
        "maxZ": -78.4,
        "minY": 6.8,
        "maxY": 7.1000000000000005
      },
      {
        "minX": -27.55,
        "maxX": -22.45,
        "minZ": -81.2,
        "maxZ": -78.8,
        "minY": 7.15,
        "maxY": 7.75
      },
      {
        "minX": -28,
        "maxX": -22,
        "minZ": -78.85,
        "maxZ": -78.35,
        "minY": 7.1499999999999995,
        "maxY": 10.049999999999999
      },
      {
        "minX": -27.76,
        "maxX": -22.24,
        "minZ": -78.55000000000001,
        "maxZ": -78.25,
        "minY": 9.85,
        "maxY": 10.049999999999999
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": -81.5,
        "maxZ": -78.5,
        "minY": 5,
        "maxY": 6.800000000000001
      },
      {
        "minX": 21.75,
        "maxX": 28.25,
        "minZ": -81.6,
        "maxZ": -78.4,
        "minY": 6.8,
        "maxY": 7.1000000000000005
      },
      {
        "minX": 22.45,
        "maxX": 27.55,
        "minZ": -81.2,
        "maxZ": -78.8,
        "minY": 7.15,
        "maxY": 7.75
      },
      {
        "minX": 22,
        "maxX": 28,
        "minZ": -78.85,
        "maxZ": -78.35,
        "minY": 7.1499999999999995,
        "maxY": 10.049999999999999
      },
      {
        "minX": 22.24,
        "maxX": 27.76,
        "minZ": -78.55000000000001,
        "maxZ": -78.25,
        "minY": 9.85,
        "maxY": 10.049999999999999
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

      { "minX": -86, "maxX": -54, "minZ": 93.75, "maxZ": 96.25, "minY": 0, "maxY": 15 },
      { "minX": 54, "maxX": 86, "minZ": 93.75, "maxZ": 96.25, "minY": 0, "maxY": 15 },
      { "minX": -86, "maxX": -54, "minZ": -96.25, "maxZ": -93.75, "minY": 0, "maxY": 15 },
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
      { "minX": -134, "maxX": 134, "minZ": 11, "maxZ": 131, "maxTop": 4, "type": "flat", "top": 4 },
      { "minX": -134, "maxX": 134, "minZ": -131, "maxZ": -11, "maxTop": 4, "type": "flat", "top": 4 }
    ]
  },
  "carnival": {
    "obstacles": [
      // ----- Play-area boundary (matches addBoundaryIndicator(130, 130, 28)) -----
      { "minX": -132, "maxX": 132, "minZ": 130, "maxZ": 132, "minY": 0, "maxY": 28 },
      { "minX": -132, "maxX": 132, "minZ": -132, "maxZ": -130, "minY": 0, "maxY": 28 },
      { "minX": -132, "maxX": -130, "minZ": -132, "maxZ": 132, "minY": 0, "maxY": 28 },
      { "minX": 130, "maxX": 132, "minZ": -132, "maxZ": 132, "minY": 0, "maxY": 28 },

      // ----- Rock stage (north) -----
      // Stage backdrop wall (tall, hides anyone behind it)
      { "minX": -52, "maxX": 52, "minZ": 121, "maxZ": 124, "minY": 0, "maxY": 14 },
      // Stage front-edge wall (jump-only, like Station's platform edges)
      { "minX": -50, "maxX": 50, "minZ": 95.7, "maxZ": 96.3, "minY": 0, "maxY": 4, "topBuffer": 0, "noProjectile": true },
      // Front speaker stacks
      { "minX": -54, "maxX": -50, "minZ": 90, "maxZ": 94, "minY": 0, "maxY": 9 },
      { "minX": 50, "maxX": 54, "minZ": 90, "maxZ": 94, "minY": 0, "maxY": 9 },
      // Side scaffold towers (tall, with stage lights)
      { "minX": -56, "maxX": -52, "minZ": 95, "maxZ": 99, "minY": 0, "maxY": 16 },
      { "minX": 52, "maxX": 56, "minZ": 95, "maxZ": 99, "minY": 0, "maxY": 16 },

      // ----- Motocross slope stage (south) -----
      // Side berms (dirt mounds flanking the course, full mech-height cover)
      { "minX": -28, "maxX": -16, "minZ": -125, "maxZ": -100, "minY": 0, "maxY": 8 },
      { "minX": 16, "maxX": 28, "minZ": -125, "maxZ": -100, "minY": 0, "maxY": 8 },
      { "minX": -28, "maxX": -16, "minZ": -94, "maxZ": -69, "minY": 0, "maxY": 8 },
      { "minX": 16, "maxX": 28, "minZ": -94, "maxZ": -69, "minY": 0, "maxY": 8 },
      // Hay bale stacks at ramp ends
      { "minX": -50, "maxX": -44, "minZ": -100, "maxZ": -94, "minY": 0, "maxY": 6 },
      { "minX": 44, "maxX": 50, "minZ": -100, "maxZ": -94, "minY": 0, "maxY": 6 },
      { "minX": -50, "maxX": -44, "minZ": -125, "maxZ": -119, "minY": 0, "maxY": 6 },
      { "minX": 44, "maxX": 50, "minZ": -125, "maxZ": -119, "minY": 0, "maxY": 6 },

      // ----- Mid-zone food / amenity area -----
      // Food trucks (8x4x5 — long boxes)
      { "minX": -110, "maxX": -102, "minZ": -50, "maxZ": -46, "minY": 0, "maxY": 5 },
      { "minX": -75, "maxX": -67, "minZ": -25, "maxZ": -21, "minY": 0, "maxY": 5 },
      { "minX": -45, "maxX": -37, "minZ": 30, "maxZ": 34, "minY": 0, "maxY": 5 },
      { "minX": 37, "maxX": 45, "minZ": -30, "maxZ": -26, "minY": 0, "maxY": 5 },
      { "minX": 67, "maxX": 75, "minZ": 25, "maxZ": 29, "minY": 0, "maxY": 5 },
      { "minX": 102, "maxX": 110, "minZ": 50, "maxZ": 54, "minY": 0, "maxY": 5 },
      // Food kiosks (6x6x5 — chunkier square stalls)
      { "minX": -85, "maxX": -79, "minZ": 20, "maxZ": 26, "minY": 0, "maxY": 5 },
      { "minX": 79, "maxX": 85, "minZ": -26, "maxZ": -20, "minY": 0, "maxY": 5 },
      { "minX": -10, "maxX": -4, "minZ": 60, "maxZ": 66, "minY": 0, "maxY": 5 },
      { "minX": 4, "maxX": 10, "minZ": -66, "maxZ": -60, "minY": 0, "maxY": 5 },
      // Picnic pavilions (8x8x5 — covered tent canopies for tables/benches)
      { "minX": -30, "maxX": -22, "minZ": -10, "maxZ": -2, "minY": 0, "maxY": 5 },
      { "minX": 22, "maxX": 30, "minZ": 2, "maxZ": 10, "minY": 0, "maxY": 5 },
      { "minX": -100, "maxX": -92, "minZ": 60, "maxZ": 68, "minY": 0, "maxY": 5 },
      { "minX": 92, "maxX": 100, "minZ": -68, "maxZ": -60, "minY": 0, "maxY": 5 },
      // Carnival info totems (2x2x7 — tall thin pillars)
      { "minX": -1, "maxX": 1, "minZ": 19, "maxZ": 21, "minY": 0, "maxY": 7 },
      { "minX": -1, "maxX": 1, "minZ": -21, "maxZ": -19, "minY": 0, "maxY": 7 },
      { "minX": -41, "maxX": -39, "minZ": -1, "maxZ": 1, "minY": 0, "maxY": 7 },
      { "minX": 39, "maxX": 41, "minZ": -1, "maxZ": 1, "minY": 0, "maxY": 7 },
      // Generator / sound trucks flanking the stage approach (8x8x6)
      { "minX": -98, "maxX": -90, "minZ": 88, "maxZ": 96, "minY": 0, "maxY": 6 },
      { "minX": 90, "maxX": 98, "minZ": 88, "maxZ": 96, "minY": 0, "maxY": 6 }
    ],
    "surfaces": [
      // Stage platform — raised 4 m, jump up onto it via the edge wall above
      { "minX": -50, "maxX": 50, "minZ": 96, "maxZ": 119, "maxTop": 4, "type": "flat", "top": 4 },
      // Motocross take-off ramp (low at south end → rises north to the kicker)
      { "minX": -10, "maxX": 10, "minZ": -125, "maxZ": -101, "maxTop": 5, "type": "ramp", "axis": "z", "lowY": 0, "highY": 5 },
      // Motocross landing ramp (peaks south, descends north back to flat)
      { "minX": -10, "maxX": 10, "minZ": -93, "maxZ": -69, "maxTop": 5, "type": "ramp", "axis": "z", "lowY": 5, "highY": 0 }
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
  }
};

const ARENA_SPAWNS = {
  arena2: { p1: { x: -108, y: GROUND_BASE_Y, z: 0 }, p2: { x: 108, y: GROUND_BASE_Y, z: 0 } },
  factory: { p1: { x: -50, y: GROUND_BASE_Y, z: 0 }, p2: { x: 50, y: GROUND_BASE_Y, z: 0 } },
  square: { p1: { x: -95, y: GROUND_BASE_Y, z: -45 }, p2: { x: 95, y: GROUND_BASE_Y, z: 45 } },
  lobby: { p1: { x: -30, y: GROUND_BASE_Y, z: 50 }, p2: { x: 30, y: GROUND_BASE_Y, z: 50 } },
  station: { p1: { x: -128, y: GROUND_BASE_Y, z: 0 }, p2: { x: 128, y: GROUND_BASE_Y, z: 0 } },
  carnival: { p1: { x: -118, y: GROUND_BASE_Y, z: 0 }, p2: { x: 118, y: GROUND_BASE_Y, z: 0 } },
  flashpoint: { p1: { x: -95, y: GROUND_BASE_Y, z: -55 }, p2: { x: 95, y: GROUND_BASE_Y, z: 55 } }
};

function materializeSurface(surface) {
  if (surface.type === 'ramp') {
    const { minX, maxX, minZ, maxZ, maxTop, axis, lowY, highY } = surface;
    const lowEnd = axis === 'x' ? minX : minZ;
    const highEnd = axis === 'x' ? maxX : maxZ;
    const span = (highEnd - lowEnd) || 1;
    const dy = highY - lowY;
    return { minX, maxX, minZ, maxZ, maxTop, heightAt(x, z) {
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
    obstacles: [...makeBoundaryObstacles(), ...data.obstacles],
    surfaces: data.surfaces.map(materializeSurface),
    spawns: ARENA_SPAWNS[mapKey]
  };
}

const ARENAS = {
  arena1: buildPlainField(),
  arena2: buildGeneratedArena('arena2'),
  factory: buildGeneratedArena('factory'),
  square: buildGeneratedArena('square'),
  lobby: buildGeneratedArena('lobby'),
  station: buildGeneratedArena('station'),
  carnival: buildGeneratedArena('carnival'),
  flashpoint: buildGeneratedArena('flashpoint')
};

export function getArena(mapKey) {
  const arena = ARENAS[mapKey];
  if (!arena) throw new Error(`No arena data for map: ${mapKey}`);
  return arena;
}

export function getArenaObstacles(mapKey) { return getArena(mapKey).obstacles; }
export function getArenaSurfaces(mapKey) { return getArena(mapKey).surfaces; }
export function getArenaSpawns(mapKey) { return getArena(mapKey).spawns; }
