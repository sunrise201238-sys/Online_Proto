// Pure math helpers. No imports.
// Replaces the Three.js MathUtils calls scattered through main.js so the
// sim can run in node without bundling Three.

export const clamp = (v, min, max) => v < min ? min : v > max ? max : v;

export const lerp = (a, b, t) => a + (b - a) * t;

export const wrapAngle = (angle) => {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

export const between = (min, max) => min + Math.random() * (max - min);

export const degToRad = (deg) => (deg * Math.PI) / 180;

// Plain-object vector helpers operating on {x, y, z} POJOs. The sim never
// uses THREE.Vector3 — these helpers are the only "math" the projectile and
// movement code needs. Each function takes the components, never an instance,
// to avoid coupling to a class shape.

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const vec3Length = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export const vec3Length2D = (v) => Math.sqrt(v.x * v.x + v.z * v.z);

export const vec3Dist = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const vec3Dist2D = (a, b) => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
};

export const vec3Sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const vec3Add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const vec3Scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });

export const vec3Normalize = (v) => {
  const len = vec3Length(v);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

export const vec3Dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Closest point on segment a→b to point p, used by the projectile-target
// hit test. Returns the clamped point as a new vec3.
export const closestPointOnSegment = (a, b, p) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 < 1e-12) return { x: a.x, y: a.y, z: a.z };
  let t = (apx * abx + apy * aby + apz * abz) / ab2;
  t = clamp(t, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
};

// Apply yaw rotation around Y, then pitch around X. Matches the Three.js
// applyAxisAngle calls in spawnProjectiles for the spread cone.
export const applyYawPitch = (dir, yaw, pitch) => {
  // Yaw around Y axis: (x, z) plane rotation.
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  let x = dir.x * cy + dir.z * sy;
  let z = -dir.x * sy + dir.z * cy;
  let y = dir.y;
  // Pitch around X axis: (y, z) plane rotation.
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const ny = y * cp - z * sp;
  const nz = y * sp + z * cp;
  return { x, y: ny, z: nz };
};
