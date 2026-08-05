// Pure-data tunables and unit/map definitions. No imports.
// Mirrors the constants currently inlined at the top of client/src/main.js.

// Pilot stats per unit fall back to the global defaults further down
// (MAX_HP, BOOST_CAP, WALK_SPEED, BOOST_MOVE_SPEED, BOOST_DASH_DRAIN_PER_TICK,
// BOOST_REGEN_PER_TICK, JUMP_INITIAL_VELOCITY, JUMP_HOVER_MS,
// JUMP_COOLDOWN_MS, JUMP_BOOST_COST; the dodge family is likewise per-unit
// tunable via optional stepBoostCost / stepDurationMs (ALSO the i-frame
// window) / stepCooldownMs / stepDistance falling back to the STEP_*
// globals). Units declare core fields explicitly so the schema is visible —
// mirrors client/src/main.js.
//
// Fire rate is authored as `firePerMinute` (RPM, real-gun-spec style). The
// engine consumes `fireCooldownMs` (per-shot minimum delay in ms) which is
// auto-derived from RPM by the normalization loop right after this block.
// Setting fireCooldownMs directly still works as an escape hatch — the
// normalizer only fills it in when it's absent.
export const UNIT_DATA = {
  unit1: {
    id: 'unit1',
    name: 'Unit 1 / Assault Rifle',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 56,
    projectileSpeed: 600,
    firePerMinute: 700,        // ≈ 85.71 ms cooldown — 96 ms tick slot (10.4/s); AR/SMG cadence ladder: M4 700 < FAMAS 900 < EVO3 1100
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 4.5,
    magCapacity: 30,
    botFireCap: 30,         // bot: shots per trigger pull (fire cap, 2026-08-01)
    reloadMs: 1500,
    autoReload: false,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit2: {
    id: 'unit2',
    name: 'Unit 2 / Shotgun',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    // Pellet-cluster fighting distance; the bot band rule (sweet spot =
    // lockRange, edges ±7) gives the shotgun a 33–47 band.
    lockRange: 40,
    projectileSpeed: 300,
    firePerMinute: 250,         // ≈ 697.67 ms cooldown
    spreadCount: 8,
    // 16 degrees in radians, computed once.
    spreadAngle: (16 * Math.PI) / 180,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 5,               // per pellet (volley max 8 x 5 = 40 point-blank)
    magCapacity: 7,
    botFireCap: 4,         // bot: shots per trigger pull (fire cap: 4 blasts per trigger pull, 2026-08-01)
    reloadMs: 1200,
    autoReload: true,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit3: {
    id: 'unit3',
    name: 'Unit 3 / Sniper Rifle',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 120,
    projectileSpeed: 2500,
    firePerMinute: 60,         // = 1000 ms cooldown (exact)
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 50,
    // Distance-tiered damage (locked at fire time): closer than nearDist →
    // near, between nearDist and midDist → mid, beyond midDist → full damage.
    // Also drives the laser-sight tiers (client visual).
    rangeDamage: { nearDist: 15, midDist: 50, near: 20, mid: 35 },
    magCapacity: 5,
    reloadMs: 2500,
    autoReload: false,
    sniperCharge: true,
    chargeMs: 1000,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit4: {
    id: 'unit4',
    name: 'Unit 4 / Submachine Gun',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 50,
    projectileSpeed: 600,
    firePerMinute: 1100,       // ≈ 54.55 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.06,
    horizontalAngle: 0,          // HA 0.04 -> 0 (2026-07-31, moved to Marina): modern EVO3 shoots tight; sure-hit ~53
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 3.5,               // 9mm — lightest bullet in the block; the 64ms cadence is her payload

    magCapacity: 30,
    botFireCap: 30,         // bot: shots per trigger pull (fire cap, 2026-08-01)
    reloadMs: 1500,
    autoReload: false,
    // Per-weapon hit-stun. Every unit declares its own stun; the ??-fallbacks
    // in projectiles.js (PROJECTILE_HIT_STUN_MS, 0.25) are just a safety net.
    // SMG = short + light.
    stun: { ms: 50, moveScale: 0.50 }
  },
  unit5: {
    id: 'unit5',
    name: 'Unit 5 / Machine Gun',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 8,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 80,
    projectileSpeed: 600,
    firePerMinute: 1250,       // = 48 ms cooldown — 48 ms tick slot (20.8/s), one real tier above the 64 ms guns
    spreadCount: 1,
    spreadAngle: 0.04,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 4,
    magCapacity: 250,
    botFireCap: 250,         // bot: shots per trigger pull = full mag (fire cap, 2026-08-01)
    reloadMs: 7000,
    autoReload: false,
    stun: { ms: 50, moveScale: 0.85 }   // light stun, same as the SMG
  },
  unit6: {
    id: 'unit6',
    name: 'Unit 6 / Sniper Rifle',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — cloned from Unit 3 / Sniper Rifle (to be tuned later).
    lockRange: 120,
    projectileSpeed: 2000,
    firePerMinute: 60,         // = 1000 ms cooldown (exact)
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 30,
    magCapacity: 5,
    reloadMs: 2500,
    autoReload: false,
    sniperCharge: true,
    chargeMs: 1000,
    stun: { ms: 100, moveScale: 0.25 },
    // Kei fires a 照射ビーム (sustained hitscan laser) instead of a bullet: on
    // release an instant wide line appears (blocked by walls), damaging each
    // enemy once during durationMs, then fading. radius = visual half-width.
    beam: { durationMs: 500, radius: 1.6, chargedDamage: 20 }
  },
  unit7: {
    id: 'unit7',
    name: 'Unit 7 / Rifle',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 56,
    projectileSpeed: 600,
    firePerMinute: 250,        // = 240 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 15,
    magCapacity: 8,
    reloadMs: 1200,
    autoReload: true,
    stun: { ms: 100, moveScale: 0.25 },
    // Flight kit REMOVED for the demo (2026-08-05 user order): no `flight`
    // flag, no airJumpBoostCost, standard 1500 ms jump cooldown — she plays
    // as a normal ground unit. Mirrored in client/src/main.js UNIT_DATA.
    // Laser bolt: the projectile's hitbox is a thin beamBolt-sized cylinder
    // that grows out of the muzzle; the client draws the transparent cyan
    // visual from this same entry, so hitbox and visual can't drift apart.
    beamBolt: { length: 64, radius: 0.4 }
  },
  unit8: {
    id: 'unit8',
    name: 'Unit 8 / Submachine Gun',
    // Mika — hidden from all pickers/random pools since 0.5.9 (client
    // `hidden` flag; Marina/unit13 took her slot). Sim stats stay so the
    // server still validates and simulates her if an old roster carries her.

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec
    lockRange: 50,
    projectileSpeed: 600,
    firePerMinute: 600,        // = 100 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.04,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 4,
    magCapacity: 50,
    botFireCap: 50,         // bot: shots per trigger pull (fire cap, 2026-08-01)
    reloadMs: 1500,
    autoReload: false,
    stun: { ms: 50, moveScale: 0.50 }
  },
  unit9: {
    id: 'unit9',
    name: 'Unit 9 / Assault Rifle',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — Saori-derived, tuned 2026-07-14: faster cadence, lighter
    // per-shot damage, smaller mag.
    lockRange: 56,
    projectileSpeed: 600,
    firePerMinute: 900,        // ≈ 66.67 ms cooldown — 80 ms tick slot (12.5/s), middle rung of the M4 700 < FAMAS 900 < EVO3 1100 ladder
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 4,
    magCapacity: 25,
    botFireCap: 25,         // bot: shots per trigger pull (fire cap, 2026-08-01)
    reloadMs: 1500,
    autoReload: false,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit10: {
    id: 'unit10',
    name: 'Unit 10 / Rifle',

    // Pilot stats — NORMAL maneuver kit by design: unlike Aris she gets the
    // standard jump cooldown/cost and NO flight/air-pop fields.
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — Aris-derived, tuned 2026-07-14: ordinary bullet (no
    // laser bolt), heavier per-shot chunk on a 30-round mag with a slow
    // manual reload.
    lockRange: 56,
    projectileSpeed: 600,
    firePerMinute: 250,        // = 240 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 10,
    magCapacity: 20,        // mag 30 -> 20 (2026-08-05)
    botFireCap: 20,         // bot: shots per trigger pull = full mag (fire cap, 2026-08-01)
    reloadMs: 2000,
    autoReload: false,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit11: {
    id: 'unit11',
    name: 'Unit 11 / Shotgun',

    // Pilot stats
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — Hoshino-derived, tuned 2026-07-14: WIDE shotgun. Her
    // volley pattern is stretched 1.4x horizontally (volleyStretchX below;
    // vertical unchanged) and pellets hit lighter — a dodge-catching fan vs
    // Hoshino's concentrated slug.
    lockRange: 40,
    projectileSpeed: 300,
    firePerMinute: 250,         // ≈ 697.67 ms cooldown
    spreadCount: 8,
    // 16 degrees in radians, computed once.
    spreadAngle: (16 * Math.PI) / 180,
    horizontalAngle: 0,          // dead field on shotguns (volley ignores HA) — width lives in volleyStretchX
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 5,               // per pellet (volley max 8 x 5 = 40 point-blank)
    magCapacity: 7,
    botFireCap: 4,         // bot: shots per trigger pull (fire cap: 4 blasts per trigger pull, 2026-08-01)
    reloadMs: 1200,
    autoReload: true,
    stun: { ms: 100, moveScale: 0.25 },
    // Horizontal-only pattern widening (see volleyPelletOffset): applied
    // after the per-shot random rotation, so blasts stay randomized while
    // the cloud is 1.4x wider and exactly as tall as Hoshino's.
    volleyStretchX: 1.4
  },
  unit12: {
    id: 'unit12',
    name: 'Unit 12 / Machine Gun',

    // Pilot stats — lighter mobility tax than Hina (walk 12 vs her 8).
    hp: 150,
    boostCap: 250,
    walkSpeed: 12,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — Hina-derived, tuned 2026-07-14/15: slower cadence with
    // HA anti-dodge scatter, smaller mag, quicker reload, and AR-grade heavy
    // stun — at ~10 hits/s her chain-slow is the identity Hina can't match.
    lockRange: 80,
    projectileSpeed: 600,
    firePerMinute: 600,        // = 100 ms cooldown — 112 ms tick slot (8.9/s), below Saori's 96 ms rung
    spreadCount: 1,
    spreadAngle: 0.04,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 4.5,               // 7.62 chunk — outhits Mika's 9mm (4) per shot; same 600 RPM rhythm
    magCapacity: 100,
    botFireCap: 100,         // bot: shots per trigger pull = full mag (fire cap, 2026-08-01)
    reloadMs: 5000,
    autoReload: false,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit13: {
    id: 'unit13',
    name: 'Unit 13 / Submachine Gun',

    // Pilot stats — Atsuko template (0.5.9): same mobility block.
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — Atsuko's envelope pushed to the 48 ms tick slot (Hina's
    // cadence) with the PPSh drum: lightest bullet in the game, 71-round mag
    // on a 2 s reload (tuned 2026-07-31: damage 3.5 -> 3 -> 2.5, reload
    // 1.5 s -> 2 s; HA 0 -> 0.04 taken from Atsuko — the WWII hose sprays
    // wide, sure-hit drops to ~32).
    lockRange: 50,
    projectileSpeed: 600,
    firePerMinute: 1250,       // = 48 ms cooldown — 48 ms tick slot (20.8/s), one real tier above the 64 ms guns
    spreadCount: 1,
    spreadAngle: 0.06,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 2.5,               // suppression-first: the 48 ms stun cadence is the payload, not the bullet

    magCapacity: 71,
    botFireCap: 71,         // bot: shots per trigger pull = full mag (fire cap, 2026-08-01)
    reloadMs: 2000,
    autoReload: false,
    // Per-weapon hit-stun. SMG = short + light, same as Atsuko/Mika.
    stun: { ms: 50, moveScale: 0.50 }
  },
  unit14: {
    id: 'unit14',
    name: 'Unit 14 / Submachine Gun',
    // P90 (2026-08-05): replaces the client-hidden unit13 in the pickers —
    // unit13 stays fully simulated, same treatment as Mika/unit8.

    // Pilot stats — PPSh/Atsuko template: same mobility block.
    hp: 150,
    boostCap: 250,
    walkSpeed: 16,
    sprintSpeed: 11.76,
    boostDrain: 1.1,
    boostRegen: 4.59,
    jumpVelocity: 30,
    jumpHoverMs: 300,
    jumpCooldownMs: 1500,
    jumpBoostCost: 48,

    // Weapon spec — PPSh-derived: FAMAS's cadence in the SMG chassis —
    // 50-round mag, 3 damage, AR spread profile (SA 0.02 + HA 0.04,
    // sure-hit ~53).
    lockRange: 50,
    projectileSpeed: 600,
    firePerMinute: 900,        // ≈ 66.7 ms cooldown — 80 ms tick slot (12.5/s), FAMAS's rung
    spreadCount: 1,
    spreadAngle: 0.02,
    horizontalAngle: 0.04,          // extra HORIZONTAL-only random spread (rad); active beyond horizontalTriggerRange
    horizontalTriggerRange: 0,   // fire-time target distance beyond which horizontalAngle kicks in
    damage: 3.5,               // 3 -> 3.5 (2026-08-05)

    magCapacity: 50,
    botFireCap: 50,         // bot: shots per trigger pull = full mag (fire cap policy)
    reloadMs: 2000,
    autoReload: false,
    // Per-weapon hit-stun. SMG = short + light.
    stun: { ms: 50, moveScale: 0.50 }
  }
};

// Derive fireCooldownMs from firePerMinute. Engine code reads
// u.fireCooldownMs everywhere; designers only ever write u.firePerMinute.
// If both are present, fireCooldownMs wins (explicit override).
for (const unit of Object.values(UNIT_DATA)) {
  if (unit.firePerMinute != null && unit.fireCooldownMs == null) {
    unit.fireCooldownMs = 60000 / unit.firePerMinute;
  }
}

export const MAP_DATA = {
  arena1: { id: 'arena1', name: 'Plain Field' },
  arena2: { id: 'arena2', name: 'Streets' },
  factory: { id: 'factory', name: 'Factory' },
  factory2: { id: 'factory2', name: 'Factory 2' },
  square: { id: 'square', name: 'Square' },
  lobby: { id: 'lobby', name: 'Lobby' },
  station: { id: 'station', name: 'Station' },
  flashpoint: { id: 'flashpoint', name: 'Flashpoint' },
  airport: { id: 'airport', name: 'Airport' }
};

// Match-wide tunables.
export const MAX_HP = 150;
export const BOOST_CAP = 250;
export const GROUND_BASE_Y = 2.45;

// Movement / boost. BOOST_MOVE_SPEED is the sprint default; WALK_SPEED is
// the non-sprint default. Both are fall-throughs for units that omit
// `sprintSpeed` / `walkSpeed` in their UNIT_DATA entry.
export const BOOST_MOVE_SPEED = 11.76;   // unit.sprintSpeed default
export const WALK_SPEED = 16;            // unit.walkSpeed default
export const MOMENTUM_STANDARD = 100;

// Step (dodge) tunables.
export const STEP_DISTANCE = 9.2;
export const STEP_DURATION_MS = 300;
export const STEP_COOLDOWN_MS = 1175;
export const STEP_BOOST_COST = 48;
export const STEP_HOMING_CUT_MS = 260;

// Jump tunables.
export const JUMP_BOOST_COST = STEP_BOOST_COST;
export const JUMP_INITIAL_VELOCITY = 30;
export const JUMP_HOVER_MS = 300;
export const JUMP_COOLDOWN_MS = 1500;

// Homing tunables.
export const HOMING_MAX_DEG_PER_FRAME = 0;     // homing disabled — projectiles fly straight
export const HOMING_CLOSE_RANGE_CUTOFF = 2.6;
export const HOMING_SOFTEN_RANGE = 20;
export const HOMING_SOFTEN_DEG_PER_FRAME = 0;  // homing disabled — projectiles fly straight

// Hit reactions. The hit volume is a vertical capsule matching the character
// billboard: HIT_RADIUS_NORMAL is its horizontal radius, HIT_HALF_HEIGHT the
// vertical half-extent of the straight section. Together they span the full
// 6.4-tall sprite (body center ± (1.6 + 1.6) = ±3.2).
export const HIT_RADIUS_NORMAL = 1.6;
export const HIT_HALF_HEIGHT = 1.6;
export const HIT_STUN_MS = 100;

// Spawn protection — fighters take no damage for this long at round start.
export const SPAWN_IMMUNITY_MS = 3000;
// Sprint-lock release grace: a joystick flip (left→right) crosses the center
// deadzone for a few frames and used to read as the let-go-to-stop gesture,
// killing the locked sprint mid-flip. Only a neutral stick SUSTAINED this
// long releases the lock. Kept well under the 260 ms double-tap window so
// the two gestures can't tangle. Mirrored in client/src/main.js.
export const SPRINT_LOCK_RELEASE_GRACE_MS = 180;

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
//
// 16 ms = 62.5 Hz. Bumped from 25 ms (40 Hz) for online smoothness:
//   - Snapshots arrive ~36% sooner; remote-fighter interpolation lag drops
//     from ~12 ms average to ~8 ms.
//   - Client prediction ticks at the same higher rate; local input
//     responsiveness stays as good as a 60 fps render loop allows.
//   - 1.5× more snapshots per second. For a 1v1 with ~10 projectiles in
//     flight, the per-tick simulation work is microseconds — well within
//     Render's free-tier 0.1 CPU envelope. Bandwidth at ~2 KB/snapshot
//     × 60/sec × 2 clients ≈ 240 KB/s per match, comfortably under the
//     100 GB/month free-tier ceiling for any reasonable usage.
//
// If the server ever struggles to hold cadence on free tier (visible as
// the simulation running slow), drop to 20 ms (50 Hz) or 25 ms (40 Hz).
export const TICK_RATE_MS = 16;
export const TICK_DT = TICK_RATE_MS / 1000;

// Gravity used by the explicit jump integration. Pulled from cannon-es's
// world.gravity.y in the offline build (-80.19) — kept identical.
export const GRAVITY_Y = -80.19;

// Fighter collision radius (X/Z, used for unit-vs-obstacle checks and the
// repulsion soft-collide).
export const FIGHTER_RADIUS = 1.15;

// Beam (照射ビーム) max length before it's clipped to the first wall. Spans the
// largest arena, so on open ground the beam reaches the far edge.
export const BEAM_MAX_LENGTH = 400;
// Kei full-charge sweep channel (照射ビーム). Mirrors the offline constants.
export const KEI_CHARGED_DURATION_MS = 1000;  // channel length at full charge
export const KEI_CHARGED_RADIUS_MULT = 1.5;   // charged beam is 1.5× the quick beam's width
export const KEI_BEAM_SWEEP_RATE = 0.175;     // rad/s the beam rotates toward the aim (≈10°/s)
export const KEI_BEAM_AIM_DEADZONE = 0.3;     // move-input magnitude below this = hold direction
export const KEI_BEAM_MAX_PITCH = Math.atan(2); // vertical aim clamp (~63°; tan = 2, matches old tanY cap)

// Projectile lifetime (seconds).
export const PROJECTILE_TTL_S = 2.2;
export const PROJECTILE_HIT_STUN_MS = 100;

// Shotgun cluster spread. Pellets spawn clustered at the muzzle and grow to
// the full pattern over this many world units of travel distance. At 70
// (1.75x the SG's lockRange 40) the pattern stays tight across the locked-
// fire envelope — ~57% open (radius ~1.8) at lock range — trading graze
// coverage against dodgers for concentrated on-target damage.
export const SHOTGUN_CLUSTER_SPREAD_DISTANCE = 70;
// Hand-designed irregular 8-point shotgun pattern (pattern-plane [x, y]
// coordinates; max radius ≤ 3.8, no two points closer than ~1.6). One
// VOLLEY object flies per trigger pull; these points — rotated by the
// volley's random per-shot rotation and scaled by the 0→1 spread growth —
// are both the pellet HITBOXES and the pellet VISUALS, so they can never
// drift apart. Pellets die individually via the volley's pelletMask.
export const SHOTGUN_PATTERN = [
  [0.000, 0.315], [1.890, 1.710], [-1.530, 2.340], [-2.790, -0.360], [-1.350, -2.160], [0.810, -2.970], [2.970, -1.080], [1.260, -0.810]
];

// Sniper-specific.
export const SNIPER_GLINT_VISIBLE = true;
// Sprint-cancel: holding sprint during the forced-standing charge ends the
// charge and fires the projectile, costing half a step's worth of boost.
export const SNIPER_CANCEL_BOOST_COST = STEP_BOOST_COST / 2;
// The cancel can't release the shot before the charge is at least this old.
// Guarantees the target a fixed glint-to-bullet telegraph even when sprint is
// pre-held (which previously fired the very next tick — unreactable at close
// range once netcode delay eats into the window). Holding sprint through the
// floor releases the shot exactly at the floor; pressing sprint after the
// floor still fires immediately.
export const SNIPER_CANCEL_MIN_CHARGE_MS = 500;
// Floating unlock: online, the cancel floor counts from the moment the
// DEFENDER's client confirms the glint rendered (fighter.sniperGlintAt),
// not from the attacker's button press — restoring the "500 ms of SEEN
// warning" contract under network delay. This cap bounds how long the
// server waits for that confirmation (availability, not anti-cheat): if
// the ack hasn't arrived within it, the charge proceeds pessimistically.
// Offline and bot defenders confirm instantly, so nothing changes there.
// SET TO 500 (2026-07-25, final user verdict after touring 200/500/1000/
// uncapped): normal connections ack in ~30-100 ms so nothing changes;
// against a non-confirming defender (backgrounded tab, stalled client,
// zombie connection) the earliest cancel becomes commit + 500 + 500 =
// commit + 1000 — which lands EXACTLY on the full-charge auto-release, so
// the attacker's worst case is simply "this shot becomes a normal full
// charge". No release can ever exceed chargeMs; the tickSniperCharge
// early-release slide is a no-op at this value. (Note: this tidy
// coincidence assumes chargeMs stays 1000 — revisit if that changes.)
export const GLINT_CONFIRM_CAP_MS = 500;
// Minimum on-screen glint duration so an instant sprint-cancel still flashes
// a hint at the target instead of vanishing within a single frame.
export const SNIPER_GLINT_MIN_FLASH_MS = 100;

// Anti-melee window granted on dash start (ms).
export const ANTI_MELEE_WINDOW_MS = 260;

// Dash-defense recovery window (player slowed for this long after dash).
export const DASH_RECOVER_MS = 180;
