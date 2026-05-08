// Pure-data tunables and unit/map definitions. No imports.
// Mirrors the constants currently inlined at the top of client/src/main.js.

export const UNIT_DATA = {
  unit1: {
    id: 'unit1',
    name: 'Unit 1 / Machine Gun',
    lockRange: 56,
    projectileSpeed: 67,
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
    projectileSpeed: 67,
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
    projectileSpeed: 95,
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
  arena1: { id: 'arena1', name: 'Plain Field' },
  arena2: { id: 'arena2', name: 'Streets' },
  factory: { id: 'factory', name: 'Factory' },
  square: { id: 'square', name: 'Square' },
  lobby: { id: 'lobby', name: 'Lobby' }
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
export const HOMING_MAX_DEG_PER_FRAME = 1;
export const HOMING_CLOSE_RANGE_CUTOFF = 2.6;
export const HOMING_SOFTEN_RANGE = 20;
export const HOMING_SOFTEN_DEG_PER_FRAME = 1;

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

// Shotgun cluster spread. Pellets spawn clustered at the muzzle and grow to
// the full clusterOffset over this many world units of travel distance —
// gives the shotgun a meaningful close-range bonus without changing its
// medium-/long-range pattern. ~18 small grid cells on Plain Field
// ((280/8)/(512/16) ≈ 1.09 units per cell, ×18 ≈ 19.7).
export const SHOTGUN_CLUSTER_SPREAD_DISTANCE = 20;

// Sniper-specific.
export const SNIPER_GLINT_VISIBLE = true;
// Sprint-cancel: holding sprint during the forced-standing charge ends the
// charge immediately and fires the projectile, costing half a step's worth
// of boost.
export const SNIPER_CANCEL_BOOST_COST = STEP_BOOST_COST / 2;
// Minimum on-screen glint duration so an instant sprint-cancel still flashes
// a hint at the target instead of vanishing within a single frame.
export const SNIPER_GLINT_MIN_FLASH_MS = 100;

// Anti-melee window granted on dash start (ms).
export const ANTI_MELEE_WINDOW_MS = 260;

// Dash-defense recovery window (player slowed for this long after dash).
export const DASH_RECOVER_MS = 180;
