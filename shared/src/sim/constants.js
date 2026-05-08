// Pure-data tunables and unit/map definitions. No imports.
// Mirrors the constants currently inlined at the top of client/src/main.js.

export const UNIT_DATA = {
  unit1: {
    id: 'unit1',
    name: 'Unit 1 / Machine Gun',
    lockRange: 56,
    projectileSpeed: 45,
    fireCooldownMs: 140,
    spreadCount: 1,
    spreadAngle: 0.02,
    damage: 4,
    magCapacity: 30,
    reloadMs: 2000,
    autoReload: false
  },
  unit2: {
    id: 'unit2',
    name: 'Unit 2 / Shotgun',
    lockRange: 43,
    projectileSpeed: 45,
    fireCooldownMs: 700,
    spreadCount: 8,
    // 16 degrees in radians, computed once.
    spreadAngle: (16 * Math.PI) / 180,
    damage: 4,
    magCapacity: 7,
    reloadMs: 2000,
    autoReload: true
  },
  unit3: {
    id: 'unit3',
    name: 'Unit 3 / Sniper Rifle',
    lockRange: 120,
    projectileSpeed: 85,
    fireCooldownMs: 1000,
    spreadCount: 1,
    spreadAngle: 0.02,
    damage: 35,
    magCapacity: 5,
    reloadMs: 2500,
    autoReload: false,
    sniperCharge: true,
    chargeMs: 500
  }
};

export const MAP_DATA = {
  arena1: { id: 'arena1', name: 'Plain Field' }
  // Other maps from the offline build (Streets, Factory, Square, Lobby) are
  // intentionally omitted from the online v1. Their obstacle/surface data
  // can be ported into shared/src/sim/arena.js when we want to enable them
  // online; the offline client still has them for reference.
};

// Match-wide tunables.
export const MAX_HP = 150;
export const BOOST_CAP = 125;
export const GROUND_BASE_Y = 2.45;

// Movement / boost.
export const BOOST_MOVE_SPEED = 11.76;
export const MOMENTUM_STANDARD = 100;

// Step (dodge) tunables.
export const STEP_DISTANCE = 9.2;
export const STEP_DURATION_MS = 125;
export const STEP_COOLDOWN_MS = 1000;
export const STEP_BOOST_COST = 48;
export const STEP_HOMING_CUT_MS = 260;

// Jump tunables.
export const JUMP_BOOST_COST = STEP_BOOST_COST;
export const JUMP_INITIAL_VELOCITY = 30;
export const JUMP_HOVER_MS = 300;
export const JUMP_COOLDOWN_MS = 1500;

// Homing tunables.
export const HOMING_MAX_DEG_PER_FRAME = 10;
export const HOMING_CLOSE_RANGE_CUTOFF = 2.6;
export const HOMING_SOFTEN_RANGE = 20;
export const HOMING_SOFTEN_DEG_PER_FRAME = 1.5;

// Hit reactions.
export const HIT_RADIUS_NORMAL = 1.6;
export const HIT_RADIUS_VULNERABLE = 2.25;
export const HIT_VULNERABILITY_DAMAGE_BONUS = 1.35; // ×damage when target is vulnerable
export const HIT_STUN_MS = 200;

// Repulsion (soft-collide) between fighters.
export const REPULSION_RANGE = 3;
export const REPULSION_FORCE = 16;
export const REPULSION_DECAY_MS = 220;

// Boost behavior.
export const BOOST_DASH_DRAIN_PER_TICK = 1.1;
export const BOOST_REGEN_PER_TICK = 4.59;
export const BOOST_REFILL_PAUSE_MS = 500;
export const BOOST_EMPTY_RECOVER_MS = 100;

// Server tick rate (ms per tick) — drives both server broadcast and the
// "per-tick" semantics of the values above. Changing this changes feel.
export const TICK_RATE_MS = 25;
export const TICK_DT = TICK_RATE_MS / 1000;

// Gravity used by the explicit jump integration. Pulled from cannon-es's
// world.gravity.y in the offline build (-80.19) — kept identical.
export const GRAVITY_Y = -80.19;

// Fighter collision radius (X/Z, used for unit-vs-obstacle checks and the
// repulsion soft-collide).
export const FIGHTER_RADIUS = 1.15;

// Projectile lifetime (seconds).
export const PROJECTILE_TTL_S = 2.2;
export const PROJECTILE_HIT_STUN_MS = 200;

// Sniper-specific.
export const SNIPER_GLINT_VISIBLE = true;

// Anti-melee window granted on dash start (ms).
export const ANTI_MELEE_WINDOW_MS = 260;

// Dash-defense recovery window (player slowed for this long after dash).
export const DASH_RECOVER_MS = 180;
