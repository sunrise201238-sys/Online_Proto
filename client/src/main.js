import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import './style.css';
import { createConnection } from './online/connection.js';
import {
  tickMatch as simTickMatch,
  emptyInput as simEmptyInput,
  TICK_RATE_MS as SIM_TICK_RATE_MS,
  TICK_DT as SIM_TICK_DT,
  UNIT_DATA as SIM_UNIT_DATA,
  buildNavGrid,
  findPathOnGrid,
  findFiringPath,
  walkSegmentBlocked
} from '@gvg/shared/src/sim/index.js';

const app = document.getElementById('app');

// ----------------------------------------------------------------------------
// UNIT_DATA — per-unit (eventually per-character) stat & weapon definitions.
//
// Pilot stats — body-of-the-character knobs that differentiate one unit
// from another. Read with `??` against the global default constants below,
// so any field can be omitted on a unit and the default is used. Recognized
// fields:
//   hp             max health                                  (default MAX_HP)
//   boostCap       boost gauge volume                          (default BOOST_CAP)
//   walkSpeed      non-sprint movement speed                   (default WALK_SPEED)
//   sprintSpeed    sprint movement speed                       (default BOOST_MOVE_SPEED)
//   boostDrain     boost drained per tick while action='dash'  (default BOOST_DASH_DRAIN_PER_TICK)
//   boostRegen     boost gained per tick while idle, grounded  (default BOOST_REGEN_PER_TICK)
//   jumpVelocity   initial upward velocity on jump start       (default JUMP_INITIAL_VELOCITY)
//   jumpHoverMs    apex hang-time before fall                  (default JUMP_HOVER_MS)
//   jumpCooldownMs time between consecutive jumps              (default JUMP_COOLDOWN_MS)
//   jumpBoostCost  boost cost to start a jump                  (default JUMP_BOOST_COST)
//
// Fire rate is authored as `firePerMinute` (RPM, real-gun-spec style). The
// engine consumes `fireCooldownMs` which is auto-derived from RPM by the
// normalization loop right after this block. Mirrors the same scheme used
// in shared/src/sim/constants.js — both files must stay in sync.
// ----------------------------------------------------------------------------
const UNIT_DATA = {
  unit1: {
    name: 'Unit 1 / Assault Rifle',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'saori', char: 'Saori', accent: 0x3a4a78,

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
    firePerMinute: 850,        // ≈ 70.59 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.02,
    damage: 4,
    magCapacity: 30,
    reloadMs: 1500,
    autoReload: false,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit2: {
    name: 'Unit 2 / Shotgun',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'hoshino', char: 'Hoshino', accent: 0xff9ec7,

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
    // 27 = pellet-cluster fighting distance. The bot band rule (sweet spot =
    // lockRange, edges ±7) then reproduces the shotgun's old dedicated band
    // (20–34) with no special case.
    lockRange: 27,
    projectileSpeed: 300,
    firePerMinute: 250,         // ≈ 697.67 ms cooldown
    spreadCount: 8,
    spreadAngle: THREE.MathUtils.degToRad(16),
    damage: 4,
    magCapacity: 7,
    reloadMs: 1500,
    autoReload: true,
    stun: { ms: 100, moveScale: 0.25 }
  },
  unit3: {
    name: 'Unit 3 / Sniper Rifle',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'aru', char: 'Aru', accent: 0xff7a8a,

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
    projectileSpeed: 2000,
    firePerMinute: 60,         // = 1000 ms cooldown (exact)
    spreadCount: 1,
    spreadAngle: 0.02,
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
    name: 'Unit 4 / Submachine Gun',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'atsuko', char: 'Atsuko', accent: 0xe8a13a,

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
    lockRange: 46,
    projectileSpeed: 600,
    firePerMinute: 1100,       // ≈ 54.55 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.06,
    damage: 4,

    magCapacity: 30,
    reloadMs: 1500,
    autoReload: false,
    // Per-weapon hit-stun. Every unit declares its own stun; the ??-fallbacks
    // at the hit sites (100 ms, 0.25) are just a safety net. SMG = short +
    // light so the victim barely slows when hit.
    stun: { ms: 50, moveScale: 0.50 }
  },
  unit5: {
    name: 'Unit 5 / Machine Gun',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'hina', char: 'Hina', accent: 0x6fcf8f,

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
    firePerMinute: 1200,       // = 50 ms cooldown
    spreadCount: 1,
    spreadAngle: 0.04,
    damage: 4,
    magCapacity: 250,
    reloadMs: 7000,
    autoReload: false,
    stun: { ms: 50, moveScale: 0.85 }   // light stun, same as the SMG
  },
  unit6: {
    name: 'Unit 6 / Sniper Rifle',
    // Character billboard (client visual only — see makeUnitSprite / UNIT_DATA sync note).
    spriteKey: 'kei', char: 'Kei', accent: 0x9a7be0,

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
  }
};

// Derive fireCooldownMs from firePerMinute. See shared/src/sim/constants.js
// for the matching block — both must stay in sync since the offline build
// keeps its own UNIT_DATA copy.
for (const unit of Object.values(UNIT_DATA)) {
  if (unit.firePerMinute != null && unit.fireCooldownMs == null) {
    unit.fireCooldownMs = 60000 / unit.firePerMinute;
  }
}

const MAP_DATA = {
  arena1: { name: 'Plain Field' },
  arena2: { name: 'Streets' },
  factory: { name: 'Factory' },
  square: { name: 'Square' },
  lobby: { name: 'Lobby' },
  station: { name: 'Station' },
  flashpoint: { name: 'Flashpoint' },
  airport: { name: 'Airport' }
};

const state = {
  phase: 'select',
  mode: '1v1',                  // '1v1' | '2v2'
  playerUnitKey: 'unit1',
  enemyUnitKey: 'unit2',
  allyUnitKey: 'unit1',         // 2v2: your bot ally's unit
  enemy2UnitKey: 'unit2',       // 2v2: second enemy bot's unit
  mapKey: 'arena1',
  player: null,
  enemy: null,
  ally: null,                   // 2v2: your bot ally mech (null in 1v1)
  enemy2: null,                 // 2v2: second enemy bot mech (null in 1v1)
  playerCurrentTarget: null,    // mech the player is currently aiming at (cycle via target switch)
  projectiles: [],
  hud: null,
  reticle: null,
  speedLines: null,
  vfx: [],
  reticleEnemyFiringUntil: 0,
  reticleLastEnemyFireAt: null,
  running: false,
  matchStartAt: 0
};
state.dummyMode = false;

// ---- 2v2 team helpers ----
// All four fighters carry a `team` field on their .state object: 'A' for the
// player's side (player + ally), 'B' for the opposing side (enemy + enemy2).
// In 1v1, ally and enemy2 are null and the helpers degrade gracefully.

function getAllFighters() {
  const out = [];
  if (state.player) out.push(state.player);
  if (state.enemy) out.push(state.enemy);
  if (state.ally) out.push(state.ally);
  if (state.enemy2) out.push(state.enemy2);
  return out;
}
function getTeamOf(mech) {
  return mech?.state?.team ?? (mech === state.player || mech === state.ally ? 'A' : 'B');
}
function getEnemiesOf(mech) {
  const myTeam = getTeamOf(mech);
  return getAllFighters().filter((f) => f !== mech && getTeamOf(f) !== myTeam);
}
function getAlliesOf(mech) {
  const myTeam = getTeamOf(mech);
  return getAllFighters().filter((f) => f !== mech && getTeamOf(f) === myTeam);
}
// Slot conventions shared with the server — p1+p3 = team A, p2+p4 = team B.
// Used by the online code to map snapshot fighter ids onto the local
// state.player / state.ally / state.enemy / state.enemy2 mechs.
const ONLINE_SLOT_IDS = ['p1', 'p2', 'p3', 'p4'];
function teamOfSlot(slot) {
  return (slot === 'p1' || slot === 'p3') ? 'A' : 'B';
}

function pickClosestEnemyOf(mech) {
  if (!mech) return null;
  const enemies = getEnemiesOf(mech).filter((f) => f.state.hp > 0);
  if (enemies.length === 0) return null;
  let best = enemies[0];
  let bestDist = Infinity;
  for (const e of enemies) {
    const dx = e.body.position.x - mech.body.position.x;
    const dz = e.body.position.z - mech.body.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// LoS-aware bot target pick (2v2) — offline mirror of pickBotTargetId in
// shared/src/sim/ai.js. Score = real distance + a flat penalty when the
// enemy is out of line of sight — raw closest-distance locked the enemy
// sealed behind the Airport rim glass (unreachable without rounding the
// whole plateau) while the OTHER enemy shot freely. An enemy standing at an
// opening HAS LoS, so it still reads as genuinely close. Hysteresis: keep
// the current lock unless a rival beats it by a clear margin.
function pickBotTargetOf(mech) {
  if (!mech) return null;
  const enemies = getEnemiesOf(mech).filter((f) => f.state.hp > 0);
  if (enemies.length === 0) return null;
  if (enemies.length === 1) { mech.state.botTargetRef = enemies[0]; return enemies[0]; }
  let best = enemies[0];
  let bestScore = Infinity;
  let currentScore = null;
  for (const e of enemies) {
    const d = Math.hypot(
      e.body.position.x - mech.body.position.x,
      e.body.position.z - mech.body.position.z
    );
    const seen = botHasLineOfSight(
      { x: mech.body.position.x, y: mech.body.position.y + BOT_LOS_EYE_HEIGHT, z: mech.body.position.z },
      { x: e.body.position.x, y: e.body.position.y + BOT_LOS_EYE_HEIGHT, z: e.body.position.z }
    );
    const score = d + (seen ? 0 : BOT_TARGET_BLOCKED_PENALTY);
    if (e === mech.state.botTargetRef) currentScore = score;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (currentScore != null && currentScore <= bestScore + BOT_TARGET_SWITCH_MARGIN) {
    return mech.state.botTargetRef;
  }
  mech.state.botTargetRef = best;
  return best;
}
// Wrap-and-redirect: temporarily aliases state.player/state.enemy to (opp, me)
// so the existing updateEnemy() body — written for the 1v1 enemy bot — can
// drive any bot mech against any target without a 480-line refactor.
// All references inside updateEnemy resolve dynamically against the swapped
// values, then we restore in a finally block.
function runBotAIForMech(me, opp, now) {
  if (!me || !opp || me.state.hp <= 0) return;
  const savedEnemy = state.enemy;
  const savedPlayer = state.player;
  state.enemy = me;
  state.player = opp;
  try {
    updateEnemy(now);
  } finally {
    state.enemy = savedEnemy;
    state.player = savedPlayer;
  }
}
// Cycle the player's lock target between the live enemies. In 1v1 there's
// only one — no-op. In 2v2 it flips between enemy and enemy2 (skipping any
// that have hit 0 HP). Reparents the reticle sprite to the new target.
function cyclePlayerTarget() {
  // Online: server is authoritative on fighter.targetId. Set the input flag
  // and the next sent input frame will carry targetSwitch=true; the server
  // cycles, the snapshot mirror updates state.playerCurrentTarget.
  if (state.online) {
    input.targetSwitchTap = true;
    return;
  }
  // Offline: mutate local state directly.
  if (!state.player) return;
  const enemies = getEnemiesOf(state.player).filter((f) => f.state.hp > 0);
  if (enemies.length === 0) return;
  const current = state.playerCurrentTarget;
  const idx = enemies.indexOf(current);
  const next = enemies[((idx >= 0 ? idx : -1) + 1) % enemies.length];
  if (next === current) return;
  state.playerCurrentTarget = next;
  if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
  if (state.reticle && next) next.root.add(state.reticle);
  // Reset the firing-flash tracker so the reticle starts green on the new
  // target rather than red-flashing from stale lastFireAt comparison.
  state.reticleLastEnemyFireAt = next.state.lastFireAt;
  state.reticleEnemyFiringUntil = 0;
}
state.playerStuckSince = 0;
// Bullet trails that outlived their projectile and are fading in place.
state.dyingBulletTrails = [];

// Online-mode runtime state. Populated by startOnlineMatch and torn down by
// cleanupMatch (called from showSelectMenu). Includes Phase 3 prediction
// state: predictedState mirrors the server's MatchState locally, advanced
// ahead by pendingInputs the server hasn't ack'd yet. Phase 4 adds
// uiSubPhase + lazy mech setup keyed off the first snapshot.
state.online = null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f17);
scene.fog = new THREE.Fog(0x0b0f17, 28, 160);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 5, 15);
camera.lookAt(0, 0, 0);
const ambient = new THREE.AmbientLight(0x8cb2ff, 0.7);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xe5eeff, 1.15);
key.position.set(18, 34, 12);
scene.add(key);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -80.19, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(140, 0.25, 140)) });
groundBody.position.set(0, -0.25, 0);
world.addBody(groundBody);
const raycastResult = new CANNON.RaycastResult();

const gridCanvas = document.createElement('canvas');
gridCanvas.width = 512;
gridCanvas.height = 512;
const ctx = gridCanvas.getContext('2d');
ctx.fillStyle = '#141b27';
ctx.fillRect(0, 0, 512, 512);
ctx.strokeStyle = '#4f6387';
ctx.lineWidth = 2.5;
for (let i = 0; i < 32; i += 1) {
  const p = i * 16;
  ctx.beginPath();
  ctx.moveTo(p, 0);
  ctx.lineTo(p, 512);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, p);
  ctx.lineTo(512, p);
  ctx.stroke();
}
ctx.strokeStyle = '#8ca0ca';
ctx.lineWidth = 3.5;
for (let i = 0; i < 9; i += 1) {
  const p = i * 64;
  ctx.beginPath();
  ctx.moveTo(p, 0);
  ctx.lineTo(p, 512);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, p);
  ctx.lineTo(512, p);
  ctx.stroke();
}
const gridTex = new THREE.CanvasTexture(gridCanvas);
gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
gridTex.repeat.set(8, 8);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), new THREE.MeshStandardMaterial({
  map: gridTex,
  color: 0x8ea8de,
  metalness: 0.5,
  roughness: 0.58
}));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const gridHelper = new THREE.GridHelper(200, 50, 0xff0000, 0x444444);
scene.add(gridHelper);
const arenaDecor = [];
const arenaObstacles = [];
createArenaWalls();

const MOMENTUM_STANDARD = 100;
// --- Pilot-stat defaults (used when a unit's UNIT_DATA entry omits a field) ---
const MAX_HP = 150;                     // unit.hp default
const BOOST_MOVE_SPEED = 11.76;         // unit.sprintSpeed default
const WALK_SPEED = 16;                  // unit.walkSpeed default
const BOOST_DASH_DRAIN_PER_TICK = 1.1;  // unit.boostDrain default
const BOOST_REGEN_PER_TICK = 4.59;      // unit.boostRegen default
const GROUND_BASE_Y = 2.45;
const HOMING_MAX_DEG_PER_FRAME = 0;     // homing disabled — projectiles fly straight
const HOMING_CLOSE_RANGE_CUTOFF = 2.6;
const HOMING_SOFTEN_RANGE = 20;
const HOMING_SOFTEN_DEG_PER_FRAME = 0;  // homing disabled — projectiles fly straight
const BOOST_CAP = 250;                  // unit.boostCap default
const STEP_DISTANCE = 9.2;
const STEP_DURATION_MS = 300;
const STEP_COOLDOWN_MS = 1175;
const STEP_BOOST_COST = 48;
const STEP_HOMING_CUT_MS = 260;
// --- Jump defaults (used when a unit's UNIT_DATA entry omits the field) ---
const JUMP_BOOST_COST = STEP_BOOST_COST;     // unit.jumpBoostCost default (= 48)
const JUMP_INITIAL_VELOCITY = 30;            // unit.jumpVelocity default
const JUMP_HOVER_MS = 300;                   // unit.jumpHoverMs default
const JUMP_COOLDOWN_MS = 1500;               // unit.jumpCooldownMs default
const SNIPER_CANCEL_BOOST_COST = STEP_BOOST_COST / 2;
// Mirrors SNIPER_CANCEL_MIN_CHARGE_MS in shared/src/sim/constants.js — the
// sprint-cancel can't release the shot before the charge is this old, so a
// pre-held sprint can't produce a zero-telegraph snap shot.
const SNIPER_CANCEL_MIN_CHARGE_MS = 500;
const SNIPER_GLINT_MIN_FLASH_MS = 100;
// Mirrors SHOTGUN_CLUSTER_SPREAD_DISTANCE in shared/src/sim/constants.js —
// see that file for the 18-small-grid derivation.
const SHOTGUN_CLUSTER_SPREAD_DISTANCE = 20;
// Spawn protection — fighters take no damage for this long at round start
// (mirrors SPAWN_IMMUNITY_MS in shared/src/sim/constants.js).
const SPAWN_IMMUNITY_MS = 3000;

// --- Bot tactical-sprint tunables (mirrored in shared/src/sim/ai.js) ---
const BOT_SPRINT_READY_BOOST = STEP_BOOST_COST;
const BOT_SPRINT_MIN_BOOST = 8;
// Projectiles are near-hitscan (500-800 u/s), so a round in flight can't be
// reacted to — the bot reacts to the enemy *firing* instead. Treat the enemy
// as "shooting at me" for this long after their last shot, which covers the
// MG's fast cadence and bridges the gaps between rounds in a burst.
const BOT_FIRE_REACT_MS = 280;
// Cover-seek: how far to look for an obstacle to hide behind, how hard to
// steer toward it, and the largest obstacle footprint still treated as cover
// (anything bigger is an arena boundary wall, which can't be flanked — skip).
// A fresh hit forces an evade for this long (so taking damage always provokes a
// relocate, even if the shot landed at the edge of the fire window).
const BOT_HIT_EVADE_MS = 350;
// Mirrors BOT_GLINT_REACT_MS in shared/src/sim/ai.js — humanlike delay before
// the bot "notices" a sniper glint (Defense entry + its guessed dodge both
// wait on it), so a floor-canceled snap shot beats a bot that hasn't reacted.
const BOT_GLINT_REACT_MS = 540;
// No clear line to the player for this long => enter "dire search": drop all
// range discipline and beeline to the player until a clear line is regained.
const BOT_DIRE_SEARCH_MS = 4000;

const input = {
  x: 0,
  y: 0,
  boost: false,
  boostHeld: false,
  sprintLocked: false,
  jump: false,
  stepTap: false,
  shootTap: false,
  shootHold: false,
  targetSwitchTap: false  // 2v2: cycle to next enemy this frame
};

let touchSteeringActive = false;

const keyState = {
  up: false,
  down: false,
  left: false,
  right: false
};

// Shared "see-the-mech-through-walls" silhouette material. `depthFunc:
// GreaterDepth` flips the depth test — fragments only draw where the existing
// depth buffer is CLOSER than the ghost, i.e. where something is occluding the
// mech. When the mech is unobstructed, its real opaque meshes write to the
// depth buffer first and the ghost (same world position, equal depth) fails
// the inverted test → invisible. When a wall is between camera and mech, the
// wall writes its closer depth, the real mech fails normal depth (so it
// doesn't draw), but the ghost's depth is GREATER than the wall's so it
// passes → silhouette shows through. depthWrite off keeps it from poisoning
// the depth buffer for subsequent draws.
const MECH_OCCLUSION_GHOST = new THREE.MeshBasicMaterial({
  color: 0x9ec8ff,
  transparent: true,
  opacity: 0.45,
  depthFunc: THREE.GreaterDepth,
  depthWrite: false,
  fog: false
});

// ----------------------------------------------------------------------------
// Unit character billboards (Blue Archive SD models), STATE-DRIVEN.
// Each mech renders as a camera-facing sprite instead of the old box-mech, and
// swaps its texture to match the fighter's current pose. Real art lives in
// client/public/units/<spriteKey>_<state>.png (transparent portrait, feet near
// the bottom edge), one PNG per state below. Until those exist a labelled
// placeholder stands in, so the game still runs without the assets.
//
// State priority (highest first): dodge > sprint > shoot > stand. Sprint/dodge
// outrank shoot, so a unit firing while dashing/running keeps its motion pose
// (no shoot-frame cut-in); only a unit firing while standing still shows shoot.
// ----------------------------------------------------------------------------
const UNIT_SPRITE_HEIGHT = 6.4;   // world-units tall (feet → top of head/halo)
const UNIT_SPRITE_FOOT_Y = -3.2;  // sprite-local Y of the feet (matches old leg bottoms)
const UNIT_SPRITE_STATES = ['stand', 'sprint', 'dodge', 'shoot'];  // PNG suffixes
const SPRITE_SHOOT_HOLD_MS = 200; // how long the shoot pose holds after a shot
const SPRITE_MOTION_HOLD_MS = 150; // bridge brief gaps in a bot's sprint/dodge intent (anti-flicker)
const _unitTexLoader = new THREE.TextureLoader();
const _unitArtCache = {};         // `${spriteKey}_${state}` → loaded THREE.Texture
const _unitArtPending = {};       // `${spriteKey}_${state}` → [callbacks] awaiting load

// Procedural stand-in so the game renders before real PNGs are dropped in.
function makeUnitPlaceholderTexture(label, accentHex = 0x88aadd) {
  const W = 256, H = 384;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const accent = '#' + (accentHex >>> 0).toString(16).padStart(6, '0').slice(-6);

  // halo
  x.strokeStyle = '#ffe27a'; x.lineWidth = 8;
  x.beginPath(); x.ellipse(W / 2, 74, 52, 16, 0, 0, Math.PI * 2); x.stroke();
  // body
  x.fillStyle = accent;
  x.beginPath();
  x.moveTo(W / 2 - 64, H - 24); x.lineTo(W / 2 - 40, 150);
  x.lineTo(W / 2 + 40, 150); x.lineTo(W / 2 + 64, H - 24);
  x.closePath(); x.fill();
  // head
  x.fillStyle = '#ffe0d0';
  x.beginPath(); x.arc(W / 2, 118, 40, 0, Math.PI * 2); x.fill();
  // name plate
  x.fillStyle = 'rgba(8,16,30,0.82)';
  x.fillRect(W / 2 - 80, H - 66, 160, 42);
  x.fillStyle = '#eaf6ff';
  x.font = 'bold 30px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, W / 2, H - 44);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Load one state's real art (cached by `${spriteKey}_${state}`). onReady(texture)
// fires once the PNG decodes; on error the placeholder is kept (onReady never
// fires) so the game still works without that asset.
function loadUnitArt(spriteKey, state, onReady) {
  const key = `${spriteKey}_${state}`;
  if (_unitArtCache[key]) { onReady(_unitArtCache[key]); return; }
  if (_unitArtPending[key]) { _unitArtPending[key].push(onReady); return; }
  _unitArtPending[key] = [onReady];
  const url = `${import.meta.env.BASE_URL}units/${key}.png`;
  _unitTexLoader.load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      _unitArtCache[key] = tex;
      const cbs = _unitArtPending[key] || [];
      delete _unitArtPending[key];
      for (const cb of cbs) cb(tex);
    },
    undefined,
    () => { delete _unitArtPending[key]; }   // keep placeholder on 404/error
  );
}

// Build the camera-facing character sprite for a unit. Starts on the placeholder
// and preloads one texture per state (stand/sprint/dodge/shoot); the per-frame
// updater swaps `mat.map` to match the fighter's pose. Anchored at the feet
// (bottom-center). The state rig hangs off sprite.userData for the updater.
function makeUnitSprite(unitData, isOwnUnit = false) {
  const placeholder = makeUnitPlaceholderTexture(unitData.char || '?', unitData.accent);
  const mat = new THREE.SpriteMaterial({
    map: placeholder,
    transparent: true,
    alphaTest: 0.4,        // cutout → real depth occlusion behind cover
    depthWrite: true,
    fog: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);                 // anchor at feet (bottom-center)
  sprite.position.y = UNIT_SPRITE_FOOT_Y;

  // The local player's own unit is seen from behind (camera sits behind it), so
  // it renders the rear-facing "_rear" art set; every other unit faces the
  // camera and keeps the default front art.
  const bodySuffix = isOwnUnit ? '_rear' : '';

  // Through-wall X-ray silhouette — OWN UNIT ONLY. A second billboard riding on
  // the body draws the matching "_rear_shadow" art ONLY where the unit is hidden
  // behind cover. The depthFunc flip (GreaterDepth, same trick as
  // MECH_OCCLUSION_GHOST) passes only where the depth buffer is CLOSER than the
  // sprite — i.e. behind a wall — so the un-occluded part keeps the normal art
  // and just the blocked part shows the shadow (partial X-ray, no raycast needed;
  // a flat billboard has no parts to self-occlude). depthWrite off so it never
  // poisons the depth buffer. Added as a CHILD of the body sprite, so it inherits
  // the body's world position AND per-pose scale automatically — always
  // pixel-aligned. Hidden until its real shadow art loads, so a missing
  // "_rear_shadow" PNG simply means no X-ray. Other units never build it, so they
  // never X-ray through walls.
  let shadowMat = null;
  let shadowSprite = null;
  if (isOwnUnit) {
    shadowMat = new THREE.SpriteMaterial({
      map: placeholder,
      transparent: true,                 // keep the shadow art's own (soft) alpha
      depthFunc: THREE.GreaterDepth,     // draw only where occluded by closer geo
      depthWrite: false,
      fog: false
    });
    shadowSprite = new THREE.Sprite(shadowMat);
    shadowSprite.center.set(0.5, 0);
    shadowSprite.visible = false;
    sprite.add(shadowSprite);
  }

  // Rescale per texture so every pose keeps its own aspect ratio at a fixed
  // height. The shadow child inherits this scale (and the body's world position),
  // so it stays aligned with the body without any transform math of its own.
  const applyScale = (tex) => {
    const img = tex.image;
    const aspect = (img && img.width && img.height) ? img.width / img.height : 256 / 384;
    sprite.scale.set(UNIT_SPRITE_HEIGHT * aspect, UNIT_SPRITE_HEIGHT, 1);
  };
  applyScale(placeholder);

  // State rig: textures fill in as each PNG decodes; `shown` tracks the current
  // pose; fire bookkeeping drives the shoot hold. `shadow*`/`texShadow` drive the
  // through-wall silhouette, kept one-for-one with the body pose by the updater.
  const rig = {
    mat, shadowMat, shadowSprite, applyScale,
    tex: { stand: null, sprint: null, dodge: null, shoot: null },
    texShadow: { stand: null, sprint: null, dodge: null, shoot: null },
    shown: null, shadowShown: null, lastFireSeen: 0, fireUntil: 0,
    motionPose: null, motionHoldUntil: 0   // anti-flicker: last sprint/dodge pose + its linger deadline
  };
  sprite.userData.stateRig = rig;

  if (unitData.spriteKey) {
    for (const state of UNIT_SPRITE_STATES) {
      // Own unit pulls the "_rear" art set; other units the default front art.
      loadUnitArt(unitData.spriteKey, `${state}${bodySuffix}`, (tex) => {
        rig.tex[state] = tex;
        // Show the stand pose as soon as it arrives (first real art on screen).
        if (state === 'stand' && (rig.shown === null || rig.shown === 'stand')) {
          mat.map = tex;
          mat.needsUpdate = true;
          applyScale(tex);
          rig.shown = 'stand';
        }
      });
      // Matching through-wall silhouette ("<key>_<state>_rear_shadow.png") — own
      // unit only; the updater swaps shadowMat.map to follow the visible pose as
      // these arrive. Other units skip this load entirely (no X-ray for them).
      if (isOwnUnit) {
        loadUnitArt(unitData.spriteKey, `${state}_rear_shadow`, (tex) => {
          rig.texShadow[state] = tex;
        });
      }
    }
  }
  return sprite;
}

// ----------------------------------------------------------------------------
// State-driven sprite poses. Each frame every fighter's billboard swaps to the
// texture matching its current action, using the per-sprite rig built in
// makeUnitSprite(). State is derived from the sim's `action` field (plus state
// flags and a fire-change pulse), so it behaves identically for the offline
// sim and the online snapshot mirror.
//
// Priority (highest first): dodge > sprint > shoot > stand. Sprint/dodge outrank
// shoot, so firing while dashing/running keeps the motion pose; only firing while
// standing still shows the shoot pose.
// ----------------------------------------------------------------------------

// Resolve and apply one fighter's sprite pose for this frame.
// rig = m.sprite.userData.stateRig. The texture is swapped only when the wanted
// pose differs AND its art has finished loading (otherwise the current pose holds).
function updateUnitSpriteState(m, rig, dt, now) {
  // Pose is driven by the sim's `action` (mirrored online via s.action), NOT by
  // measured speed: basic joystick walking stays action 'idle', so it reads as
  // 'stand'; only the explicit sprint/dodge inputs change the motion pose.
  const st = m.state;

  // Fire is detected by a CHANGE in lastFireAt (not `now - lastFireAt`) so it is
  // immune to online's server-clock vs local-clock mismatch.
  const lf = st.lastFireAt || 0;
  if (lf !== rig.lastFireSeen) {
    rig.lastFireSeen = lf;
    if (lf > 0) rig.fireUntil = now + SPRITE_SHOOT_HOLD_MS;
  }

  // Dodge image = the discrete dodge burst (L / dodge button -> action 'step')
  // OR a jump: the whole airborne arc reuses the dodge pose. The 'jump' action
  // is only the takeoff frame (the unit reverts to idle/dash mid-air), so we key
  // off the persistent `airborne` flag, which is held until landing for player +
  // bot alike and is mirrored online.
  // Sprint = the held sprint run (K / sprint button)         -> action 'dash'.
  // Basic walking is action 'idle' and falls through to 'stand'.
  const dodging = st.action === 'step' || st.airborne || now < (st.stepUntil || 0);
  const sprinting = st.action === 'dash';
  // Sniper pre-aim (charging) reads as firing so Aru holds the shoot pose while
  // winding up. sniperChargeTarget truthiness tracks the charge precisely in both
  // modes (offline clears it when the shot fires; online mirrors the server flag),
  // so it needs no clock comparison.
  const charging = !!st.sniperChargeTarget;
  // Kei's full-charge sweep channel also holds the shoot pose: lastFireAt is
  // paused during it so rig.fireUntil doesn't cover it. chargedBeamUntil is 0
  // when idle, so this check reads correctly offline and online alike.
  const firing = now < rig.fireUntil || charging || st.chargedBeamUntil > now;

  // Priority: dodge > sprint > shoot > stand (sprint/dodge outrank shoot, so a
  // unit firing mid-dash/run keeps its motion pose — no shoot-frame cut-in).
  let want = 'stand';
  if (dodging) want = 'dodge';
  else if (sprinting) want = 'sprint';
  else if (firing) want = 'shoot';

  // Anti-flicker release-hold on the motion poses. A bot re-derives `action`
  // every AI tick, so its sprint/dodge intent can blink out for a frame or two
  // (boost dipping under the sprint threshold, a one-tick state flip) and strobe
  // the sprite between sprint/dodge and stand. When a motion pose is wanted we
  // refresh its linger deadline; when it drops we keep showing the last motion
  // pose until the deadline passes, bridging those brief gaps. UPGRADES are
  // instant (we only defer the downgrade), so it stays responsive; the player's
  // poses come from steady held input and never trigger the hold, so they look
  // unchanged. Render-only — uniform across the offline bots, the player, and the
  // online snapshot mirror, touching no gameplay/AI state.
  if (want === 'sprint' || want === 'dodge') {
    rig.motionPose = want;
    rig.motionHoldUntil = now + SPRITE_MOTION_HOLD_MS;
  } else if (rig.motionPose && now < rig.motionHoldUntil) {
    want = rig.motionPose;          // hold the last motion pose through a brief gap
  } else {
    rig.motionPose = null;
  }

  if (want !== rig.shown) {
    const tex = rig.tex[want];
    if (tex) {                        // only swap once the wanted pose has loaded
      rig.mat.map = tex;
      rig.mat.needsUpdate = true;
      rig.applyScale(tex);
      rig.shown = want;
    }
  }

  // Keep the through-wall silhouette one-for-one with the visible pose — OWN UNIT
  // ONLY (rig.shadowSprite is null for every other unit, which skips this block).
  // Tracked separately from `shown` because a pose's "_rear_shadow" PNG can finish
  // loading a few frames after the body PNG (or be absent). The shadow child stays
  // hidden until a real shadow texture is applied, so a missing PNG just means no
  // X-ray rather than a stray placeholder showing through walls.
  if (rig.shadowSprite && rig.shown && rig.shadowShown !== rig.shown) {
    const shadowTex = rig.texShadow[rig.shown];
    if (shadowTex) {
      rig.shadowMat.map = shadowTex;
      rig.shadowMat.needsUpdate = true;
      rig.shadowSprite.visible = true;
      rig.shadowShown = rig.shown;
    }
  }
}

// Drive every live fighter's sprite pose once per render frame (both modes —
// getAllFighters() mirrors online snapshots onto the same state.* mechs).
function updateMechAnimations(dt, now) {
  for (const m of getAllFighters()) {
    if (!m.root.visible) continue;
    const rig = m.sprite && m.sprite.userData.stateRig;
    if (rig) updateUnitSpriteState(m, rig, dt, now);
  }
}

// `isOwnUnit` is true only for the local player's own mech (the createMech calls
// that pass `true`, offline + online). The camera sits behind that unit, so it
// renders the rear-facing "_rear" art set AND gets the through-wall X-ray
// silhouette — it's the one the player needs to see when their own movement tucks
// it behind cover. Every other unit faces the camera (front art) with no X-ray.
// `color` (team tint) is no longer used for the body itself.
function createMech(color, unitData, isOwnUnit = false) {
  const root = new THREE.Group();

  // Character billboard replaces the old box-mech body. Team identity reads
  // from the reticle / floating triangle / HP indicators, not body color.
  const sprite = makeUnitSprite(unitData, isOwnUnit);
  root.add(sprite);

  const plumeLight = new THREE.PointLight(0x7efbff, 0, 7, 2);
  plumeLight.position.set(0, -2.2, -0.7);
  root.add(plumeLight);

  // Animation shims: the frame loop pokes `arms.left/right` (rotation zeroing)
  // and reads `torso`. Sprites have no such parts, so expose lightweight
  // stand-ins that make those pokes harmless no-ops.
  const armL = new THREE.Object3D();
  const armR = new THREE.Object3D();
  root.add(armL, armR);

  scene.add(root);

  const body = new CANNON.Body({ mass: 3, shape: new CANNON.Box(new CANNON.Vec3(0.95, 1.8, 0.8)), linearDamping: 0.24 });
  body.position.set(0, 2.45, 0);
  body.type = CANNON.Body.KINEMATIC;
  body.allowSleep = false;
  body.updateMassProperties();
  body.linearFactor.set(1, 0, 1);
  world.addBody(body);

  const mech = {
    root,
    body,
    unit: unitData,
    thrusters: [],
    plumeLight,
    trail: [],
    torso: sprite,
    sprite,
    modelYOffset: 2.35,
    legLength: 2.35,
    grounded: false,
    arms: { left: armL, right: armR },
    xRayGhosts: [],
    glintMesh: null,
    state: {
      action: 'idle',
      boost: unitData.boostCap ?? BOOST_CAP,
      hp: unitData.hp ?? MAX_HP,
      redLock: false,
      overheatedUntil: 0,
      hitStunUntil: 0,
      hitStunScale: 0.25,
      invulnerableUntil: 0,
      hoverUntil: 0,
      meleeAnimUntil: 0,
      meleeLungeUntil: 0,
      staggerUntil: 0,
      evadeHomingUntil: 0,
      evadeCooldownUntil: 0,
      dashRecoverUntil: 0,
      antiMeleeUntil: 0,
      meleeCooldownUntil: 0,
      meleeStrikeUntil: 0,
      meleeHitApplied: false,
      meleeLungeVX: 0,
      meleeLungeVZ: 0,
      momentumVX: 0,
      momentumVZ: 0,
      momentumDecay: 0.84,
      emptyRecoverUntil: 0,
      refillPausedUntil: 0,
      stepStartAt: 0,
      stepUntil: 0,
      stepCooldownUntil: 0,
      stepFromX: 0,
      stepFromZ: 0,
      stepToX: 0,
      stepToZ: 0,
      queuedMomentumVX: 0,
      queuedMomentumVZ: 0,
      machineBurstRemaining: 0,
      nextFireAt: 0,
      strafeSign: 1,
      stackUntil: 0,
      jumpCooldownUntil: 0,
      airborne: false,
      jumpVelocity: 0,
      lastFireAt: 0,
      ammo: unitData.magCapacity ?? Infinity,
      reloadingUntil: 0,
      reloadTickStartAt: 0,
      sniperChargeUntil: 0,
      sniperChargeStartAt: 0,
      sniperChargeTarget: null,
      // Kei full-charge sweep beam: chargedBeamUntil>now = the 1 s channel is
      // active (owner locked, joystick steers chargedBeamDir).
      chargedBeamUntil: 0,
      chargedBeamDirX: 0,
      chargedBeamDirZ: 0,
      chargedBeamPitch: 0   // steered vertical aim (radians)
    }
  };

  // The character billboard created above (mech.sprite) is the unit body; its
  // state rig swaps poses (stand/sprint/dodge/shoot) each frame in
  // updateMechAnimations(), driven by the unit's <spriteKey>_<state>.png art.

  return mech;
}

function tickAmmo(mech, now) {
  const u = mech.unit;
  if (u.magCapacity == null) return;
  const s = mech.state;
  if (s.ammo >= u.magCapacity) {
    s.reloadingUntil = 0;
    s.reloadTickStartAt = 0;
    return;
  }
  if (u.autoReload) {
    if (!s.reloadTickStartAt) s.reloadTickStartAt = now;
    while (now - s.reloadTickStartAt >= u.reloadMs && s.ammo < u.magCapacity) {
      s.ammo += 1;
      s.reloadTickStartAt += u.reloadMs;
    }
    if (s.ammo >= u.magCapacity) s.reloadTickStartAt = 0;
  } else if (s.ammo === 0) {
    if (!s.reloadingUntil) s.reloadingUntil = now + u.reloadMs;
    if (now >= s.reloadingUntil) {
      s.ammo = u.magCapacity;
      s.reloadingUntil = 0;
    }
  }
}

// Reticle textures come in three range tiers (Aru's rangeDamage zones):
//   0 base  — the four corner brackets (also every non-Aru matchup)
//   1 mid   — + slightly thicker cross ticks through the four edge midpoints
//   2 far   — + four inward-pointing triangles set out past the ticks
// All drawn in white on a 192px canvas (the old 128px art re-centred, with
// margin for the tier marks) so the SpriteMaterial tint gives clean red/green.
function buildReticleTexture(tier) {
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const x = c.getContext('2d');
  x.strokeStyle = '#ffffff';
  x.fillStyle = '#ffffff';
  x.lineWidth = 9;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const m = 46;        // bracket square margin (same 100px square as before)
  const arm = 32;      // length of each L-arm
  const e = 192 - m;   // far edge of the bracket square
  x.beginPath(); x.moveTo(m, m + arm); x.lineTo(m, m); x.lineTo(m + arm, m); x.stroke();
  x.beginPath(); x.moveTo(e - arm, m); x.lineTo(e, m); x.lineTo(e, m + arm); x.stroke();
  x.beginPath(); x.moveTo(m, e - arm); x.lineTo(m, e); x.lineTo(m + arm, e); x.stroke();
  x.beginPath(); x.moveTo(e - arm, e); x.lineTo(e, e); x.lineTo(e, e - arm); x.stroke();
  if (tier >= 1) {
    // Cross ticks at the edge midpoints, same thickness as the bracket frame,
    // mostly OUTSIDE it — they stop just inside so they never touch the
    // far-tier inner bars.
    x.lineWidth = 9;
    x.beginPath(); x.moveTo(96, m - 18); x.lineTo(96, m + 2); x.stroke();
    x.beginPath(); x.moveTo(96, e - 2); x.lineTo(96, e + 18); x.stroke();
    x.beginPath(); x.moveTo(m - 18, 96); x.lineTo(m + 2, 96); x.stroke();
    x.beginPath(); x.moveTo(e - 2, 96); x.lineTo(e + 18, 96); x.stroke();
  }
  if (tier >= 2) {
    // Short bars parallel to each edge, INSIDE the bracket square — an inner
    // frame closing around the target. Clear gap from the tick ends; the
    // parallel-vs-perpendicular contrast keeps them distinct from the ticks.
    x.lineWidth = 9;
    x.beginPath(); x.moveTo(82, 62); x.lineTo(110, 62); x.stroke();     // top
    x.beginPath(); x.moveTo(82, 130); x.lineTo(110, 130); x.stroke();   // bottom
    x.beginPath(); x.moveTo(62, 82); x.lineTo(62, 110); x.stroke();     // left
    x.beginPath(); x.moveTo(130, 82); x.lineTo(130, 110); x.stroke();   // right
  }
  return new THREE.CanvasTexture(c);
}

let reticleTierTextures = null;
function getReticleTierTextures() {
  if (!reticleTierTextures) {
    reticleTierTextures = {
      base: buildReticleTexture(0),
      mid: buildReticleTexture(1),
      far: buildReticleTexture(2)
    };
  }
  return reticleTierTextures;
}

function makeReticleSprite() {
  const t = getReticleTierTextures().base;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  // 1.5× the old 128px-canvas scale — the bracket square stays the same
  // on-screen size, the extra canvas room is for the tier marks.
  s.scale.set(8.1, 8.1, 1);
  s.renderOrder = 9999;
  scene.add(s);
  return s;
}

// Team marker (2v2 only): a downward-pointing chevron that floats above a
// unit's head so the player can locate it at a glance. Used for both the ally
// (mint, the default) and the not-locked enemy (red-orange, passed via
// fillHex). The fill is baked into the texture and the material left untinted,
// so it reads clearly against any backdrop. Drawn with depthTest off (like the
// reticle) so it stays visible through cover.
function makeAllyArrowSprite(fillHex = '#86f7c2') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.lineJoin = 'round';
  x.lineCap = 'round';
  const cx = 64;
  const topY = 30;
  const botY = 102;
  const halfW = 38;
  x.beginPath();
  x.moveTo(cx - halfW, topY);
  x.lineTo(cx + halfW, topY);
  x.lineTo(cx, botY);
  x.closePath();
  // Dark outline first (stroke straddles the path), mint fill on top.
  x.lineWidth = 14;
  x.strokeStyle = '#0b1622';
  x.stroke();
  x.fillStyle = fillHex;
  x.fill();
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  s.scale.set(2.55, 2.55, 1);
  s.renderOrder = 9998;
  scene.add(s);
  return s;
}

function setupHUD() {
  if (state.hud) state.hud.remove();
  const hud = document.createElement('div');
  hud.className = 'touch-hud';
  const teamBarsHtml = state.mode === '2v2' ? `
    <div class="ally-health"><div id="ally-health-fill"></div></div>
    <div class="enemy2-health"><div id="enemy2-health-fill"></div></div>` : '';
  hud.innerHTML = `
    <div class="health"><div id="health-fill"></div></div>
    <div class="enemy-health"><div id="enemy-health-fill"></div></div>
    ${teamBarsHtml}
    <div class="boost"><div id="boost-fill"></div></div>
    <div class="joy" id="joy"><div class="stick"></div></div>
    <div class="buttons" id="buttons"></div>
    <div class="speed-lines" id="speed-lines"></div>
    <button id="pause-btn" class="pause-btn">PAUSE</button>
  `;
  app.appendChild(hud);

  ['boost', 'shoot', 'step', 'jump'].forEach((action) => {
    const b = document.createElement('button');
    b.dataset.k = action;
    b.className = `btn-${action}`;
    if (action === 'shoot') {
      b.innerHTML = '<svg class="reload-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg><span class="ammo-count"></span>';
    } else {
      b.textContent = action === 'boost' ? 'SPRINT' : (action === 'step' ? 'DODGE' : action.toUpperCase());
    }
    hud.querySelector('#buttons').appendChild(b);
  });
  // 2v2 only: target switch button above SHOOT. Cycles state.playerCurrentTarget
  // between the live enemies. Single-tap action — no held state.
  if (state.mode === '2v2') {
    const tb = document.createElement('button');
    tb.dataset.k = 'target';
    tb.className = 'btn-target';
    tb.textContent = 'TARGET';
    hud.querySelector('#buttons').appendChild(tb);
    tb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cyclePlayerTarget();
    });
  }

  const joy = hud.querySelector('#joy');
  const stick = joy.querySelector('.stick');
  let pointerId = null;
  let lastTapAt = 0;
  let lastSprintTapAt = 0;

  const applyStick = (x, y) => {
    const r = joy.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const maxR = r.width * 0.33;
    const len = Math.min(maxR, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    stick.style.transform = `translate(${Math.cos(ang) * len}px, ${Math.sin(ang) * len}px)`;
    input.x = Math.cos(ang) * (len / maxR);
    input.y = Math.sin(ang) * (len / maxR);
  };

  joy.addEventListener('pointerdown', (e) => {
    const now = performance.now();
    if (now - lastTapAt < 240) input.boost = true;
    lastTapAt = now;
    pointerId = e.pointerId;
    touchSteeringActive = true;
    applyStick(e.clientX, e.clientY);
  });

  window.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return;
    applyStick(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', (e) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    touchSteeringActive = false;
    input.x = 0;
    input.y = 0;
    input.sprintLocked = false;
    input.boost = false;
    input.boostHeld = false;
    stick.style.transform = 'translate(0px,0px)';
  });

  hud.querySelectorAll('button').forEach((btn) => {
    if (btn.id === 'pause-btn') return;
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', () => {
      if (k === 'shoot') {
        input.shootTap = true;
        input.shootHold = true;
      }
      else if (k === 'step') input.stepTap = true;
      else if (k === 'boost') {
        const now = performance.now();
        const hasDir = Math.hypot(input.x, input.y) > 0.15;
        if (now - lastSprintTapAt < 260 && hasDir) input.sprintLocked = true;
        lastSprintTapAt = now;
        input.boostHeld = true;
        input.boost = true;
      } else input[k] = true;
    });
    btn.addEventListener('pointerup', () => {
      if (k === 'shoot') input.shootHold = false;
      else if (k === 'boost') {
        input.boostHeld = false;
        if (!input.sprintLocked) input.boost = false;
      } else input[k] = false;
    });
  });

  hud.querySelector('#pause-btn').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    showPauseMenu();
  });

  state.hud = hud;
  state.speedLines = hud.querySelector('#speed-lines');
  return {
    hp: hud.querySelector('#health-fill'),
    enemyHp: hud.querySelector('#enemy-health-fill'),
    allyHp: hud.querySelector('#ally-health-fill'),       // 2v2 only, null in 1v1
    enemy2Hp: hud.querySelector('#enemy2-health-fill'),   // 2v2 only, null in 1v1
    boost: hud.querySelector('#boost-fill'),
    shootBtn: hud.querySelector('.btn-shoot'),
    ammoCount: hud.querySelector('.btn-shoot .ammo-count'),
    reloadRing: hud.querySelector('.btn-shoot .reload-ring circle')
  };
}

let hudRefs = null;

// Build a projectile mesh. Sniper and MG rounds get a slim spindle (sharp at
// both ends) that's re-oriented along velocity each frame (see orientTracer);
// the MG spindle is half the sniper's length and width. The hit box is
// unchanged — hit detection in updateProjectileSystem / tickProjectiles uses
// the projectile's logical position vs the target's hit radius and never the
// mesh geometry, so the visual length/orientation has no gameplay effect.
const SNIPER_TRACER_LENGTH = 3.4;
const SNIPER_TRACER_MID_RADIUS = 0.18;
// MG reuses the sniper spindle at half length and half width.
const MG_TRACER_SCALE = 0.5;
// === Bullet trails (visual-only): a thin light-grey streak that follows each
// MG / Sniper round and fades out after the bullet expires. Shotgun pellets
// opt out so 8 pellets per shot don't make a noisy mess. The trail is a
// 2-vertex THREE.Line whose tail is computed analytically from the projectile's
// velocity (projectiles fly straight — homing is 0 — so no sample buffer
// needed). Despawned bullets hand their trail to state.dyingBulletTrails so it
// fades in place instead of vanishing the instant the bullet stops.
const BULLET_TRAIL_FADE_MS_MG = 100;  // short pop — long fades caused lag at MG fire-rate
const BULLET_TRAIL_FADE_MS_SNIPER = 1000;
const BULLET_TRAIL_COLOR = 0xbbbbbb;
const BULLET_TRAIL_OPACITY = 0.55;

function bulletTrailFadeMsFor(unit) {
  if (!unit) return 0;
  if (unit.sniperCharge) return BULLET_TRAIL_FADE_MS_SNIPER;
  if ((unit.spreadCount ?? 1) > 1) return 0;  // shotgun opts out (8 pellets/shot = visual noise)
  return BULLET_TRAIL_FADE_MS_MG;  // short 100 ms pop — keeps the MG feel without the lag
}

function buildBulletTrail() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const material = new THREE.LineBasicMaterial({
    color: BULLET_TRAIL_COLOR,
    transparent: true,
    opacity: BULLET_TRAIL_OPACITY,
    fog: false
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;  // streaks can be longer than the bounding box
  return line;
}

function disposeBulletTrail(trail) {
  if (!trail) return;
  if (trail.parent) trail.parent.remove(trail);
  if (trail.geometry) trail.geometry.dispose();
  if (trail.material) trail.material.dispose();
}

function updateBulletTrailEnds(trail, tx, ty, tz, hx, hy, hz) {
  const pos = trail.geometry.attributes.position.array;
  pos[0] = tx; pos[1] = ty; pos[2] = tz;
  pos[3] = hx; pos[4] = hy; pos[5] = hz;
  trail.geometry.attributes.position.needsUpdate = true;
}

// Hand the projectile's trail off to the dying-trails list so it fades in
// place rather than disappearing the instant the bullet expires/hits.
function despawnProjectileTrail(p, now) {
  if (!p.trail) return;
  state.dyingBulletTrails.push({
    trail: p.trail,
    diesAt: now + p.trailFadeMs,
    fadeMs: p.trailFadeMs,
    initialOpacity: BULLET_TRAIL_OPACITY
  });
  p.trail = null;
}

function updateDyingBulletTrails(now) {
  const arr = state.dyingBulletTrails;
  if (!arr || arr.length === 0) return;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const dt = arr[i];
    const remaining = dt.diesAt - now;
    if (remaining <= 0) {
      disposeBulletTrail(dt.trail);
      arr.splice(i, 1);
      continue;
    }
    // Freeze the trail's geometry at its last position; just fade opacity.
    // (More faithful to how a real tracer reads — the streak dims in place,
    // it doesn't retract.)
    dt.trail.material.opacity = dt.initialOpacity * (remaining / dt.fadeMs);
  }
}

function buildProjectileMesh(unit, isRedLock) {
  const isSniper = !!unit?.sniperCharge;
  const isMG = !isSniper && (unit?.spreadCount ?? 0) === 1;
  // Shotgun pellets (and anything unrecognized) stay as small spheres; sniper
  // and MG share the spindle tracer below. Pellets use the sniper tracer's
  // normal (non-lock) color 0xfff4d0 — a single warm tone, no red-lock variant,
  // since with homing disabled there's no red-lock behavior for it to signal.
  // Radius is purely visual; the hit box (see header) is unchanged.
  if (!isSniper && !isMG) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0 })
    );
  }
  // Spindle profile: revolve a 3-point silhouette around the Y axis to get a
  // shape with sharp tips at both ends and a fattest middle. The geometry is
  // built spanning y ∈ [-L/2, +L/2], then shifted so the head (y=+L/2) sits
  // at the mesh origin — i.e. the leading tip coincides with the projectile's
  // logical position and the body trails behind once orientTracer rotates the
  // local +Y axis onto the velocity direction.
  const scale = isMG ? MG_TRACER_SCALE : 1;
  const half = (SNIPER_TRACER_LENGTH * scale) / 2;
  const midRadius = SNIPER_TRACER_MID_RADIUS * scale;
  const profile = [
    new THREE.Vector2(0, -half),        // tail tip (sharp)
    new THREE.Vector2(midRadius, 0),    // mid (widest)
    new THREE.Vector2(0, half)          // head tip (sharp)
  ];
  const geom = new THREE.LatheGeometry(profile, 10);
  geom.translate(0, -half, 0);
  const color = isRedLock ? 0xffd28a : 0xfff4d0;
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, fog: false })
  );
  mesh.userData.isTracer = true;
  return mesh;
}

const _tracerUpAxis = new THREE.Vector3(0, 1, 0);
const _tracerDirTmp = new THREE.Vector3();
const _tracerQuatTmp = new THREE.Quaternion();
// Re-orient a tracer mesh's local +Y axis to point along the given velocity
// vector each frame. No-op for non-tracer meshes.
function orientTracer(mesh, velX, velY, velZ) {
  if (!mesh?.userData?.isTracer) return;
  const lenSq = velX * velX + velY * velY + velZ * velZ;
  if (lenSq < 1e-6) return;
  const inv = 1 / Math.sqrt(lenSq);
  _tracerDirTmp.set(velX * inv, velY * inv, velZ * inv);
  _tracerQuatTmp.setFromUnitVectors(_tracerUpAxis, _tracerDirTmp);
  mesh.quaternion.copy(_tracerQuatTmp);
}

// Detach + dispose a projectile mesh.
function disposeProjectileMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
}

function spawnProjectiles(owner, target) {
  const now = performance.now();
  if (owner.unit.magCapacity != null && owner.state.ammo <= 0) return;
  if (now - owner.state.lastFireAt < owner.unit.fireCooldownMs) return;
  owner.state.lastFireAt = now;
  if (owner.unit.magCapacity != null) owner.state.ammo -= 1;

  // Distance-tiered damage (Aru): tier locked at FIRE time so it always matches
  // what the laser sight showed. Units without rangeDamage keep flat damage.
  let shotDamage = owner.unit.damage;
  if (owner.unit.rangeDamage) {
    const rd = owner.unit.rangeDamage;
    const rdDist = Math.hypot(target.root.position.x - owner.root.position.x, target.root.position.z - owner.root.position.z);
    shotDamage = rdDist < rd.nearDist ? rd.near : rdDist < rd.midDist ? rd.mid : owner.unit.damage;
  }
  const baseDir = new THREE.Vector3().subVectors(target.root.position, owner.root.position).normalize();
  const isShotgun = owner.unit.spreadCount > 1;
  const centerIndex = isShotgun ? Math.floor(Math.random() * owner.unit.spreadCount) : 0;
  const shotgunOffsets = [];
  if (isShotgun) {
    const clusterRadius = 3.8;
    for (let i = 0; i < owner.unit.spreadCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * clusterRadius;
      shotgunOffsets.push(new THREE.Vector3(Math.cos(angle) * radius, (Math.random() - 0.5) * radius * 0.7, Math.sin(angle) * radius));
    }
  }
  let centerPellet = null;

  for (let i = 0; i < owner.unit.spreadCount; i += 1) {
    const isCenterPellet = isShotgun && i === centerIndex;
    const spreadScale = isShotgun ? (isCenterPellet ? 0.08 : 0.14) : 1;
    const yaw = (Math.random() - 0.5) * owner.unit.spreadAngle * spreadScale;
    const pitch = (Math.random() - 0.5) * owner.unit.spreadAngle * 0.35 * spreadScale;
    const dir = baseDir.clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);

    const mesh = buildProjectileMesh(owner.unit, owner.state.redLock);
    mesh.position.copy(owner.root.position).add(new THREE.Vector3(0, 0.8, 0));
    scene.add(mesh);
    // Bullet trail (MG / Sniper only — shotgun pellets opt out). Tail trails
    // by (fadeMs / 1000) * speed, clamped to spawn for the first fadeMs so the
    // line doesn't extend behind the muzzle.
    const trailFadeMs = bulletTrailFadeMsFor(owner.unit);
    let trail = null;
    if (trailFadeMs > 0) {
      trail = buildBulletTrail();
      scene.add(trail);
    }

    const projVel = dir.multiplyScalar(owner.unit.projectileSpeed);
    orientTracer(mesh, projVel.x, projVel.y, projVel.z);
    const homing = owner.state.redLock && (!isShotgun || isCenterPellet);
    const projectile = {
      owner,
      target,
      mesh,
      trail,
      trailFadeMs,
      trailSpawnPos: mesh.position.clone(),
      trailSpawnAt: now,
      vel: projVel,
      homing,
      homingLost: false,
      isCenterPellet,
      centerPellet: null,
      clusterOffset: isShotgun ? shotgunOffsets[i] : null,
      ttl: 2.2,
      damage: shotDamage,
      hitStunMs: owner.unit.stun?.ms ?? 100,
      hitStunScale: owner.unit.stun?.moveScale ?? 0.25,
      // Set on the shotgun's center pellet only — accumulates path length so
      // non-center pellets can interpolate cluster spread (0 → full) over
      // SHOTGUN_CLUSTER_SPREAD_DISTANCE travel. undefined for non-shotgun /
      // non-center projectiles (the update step skips them).
      distTraveled: (isShotgun && isCenterPellet) ? 0 : undefined
    };
    if (isCenterPellet) centerPellet = projectile;
    state.projectiles.push(projectile);
  }
  if (isShotgun && centerPellet) {
    for (let i = state.projectiles.length - owner.unit.spreadCount; i < state.projectiles.length; i += 1) {
      const pellet = state.projectiles[i];
      if (!pellet.isCenterPellet) pellet.centerPellet = centerPellet;
    }
  }
}


// Draws the glint art onto a fresh canvas — Aru's plain white flash or
// Kei's big pink shard glint. Single source of truth: the in-world glint
// AND the arrow-indicator glints both render from this exact art.
function drawGlintCanvas(isBeam) {
  const c = document.createElement('canvas');
  c.width = c.height = isBeam ? 128 : 64;
  const x = c.getContext('2d');
  if (isBeam) {
    // Kei 照射ビーム charge: a bigger, very-light-pink glint with thin geometric
    // "crack" shards radiating out to read as a building laser charge.
    const cc = 64;
    const grad = x.createRadialGradient(cc, cc, 0, cc, cc, 60);
    grad.addColorStop(0, 'rgba(255, 244, 250, 1)');
    grad.addColorStop(0.4, 'rgba(255, 199, 226, 0.78)');
    grad.addColorStop(1, 'rgba(255, 199, 226, 0)');
    x.fillStyle = grad;
    x.beginPath();
    x.arc(cc, cc, 60, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(255, 225, 240, 0.85)';
    x.lineWidth = 1.5;
    const shards = 7;
    for (let i = 0; i < shards; i += 1) {
      const a = (i / shards) * Math.PI * 2 + 0.3;
      const r0 = 9;
      const r1 = 50 + (i % 3) * 6;
      const kx = cc + Math.cos(a) * r1 * 0.55 + Math.cos(a + 1.3) * 4;
      const ky = cc + Math.sin(a) * r1 * 0.55 + Math.sin(a + 1.3) * 4;
      x.beginPath();
      x.moveTo(cc + Math.cos(a) * r0, cc + Math.sin(a) * r0);
      x.lineTo(kx, ky);
      x.lineTo(cc + Math.cos(a) * r1, cc + Math.sin(a) * r1);
      x.stroke();
    }
  } else {
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(248, 248, 248, 0.85)');
    grad.addColorStop(1, 'rgba(238, 238, 238, 0)');
    x.fillStyle = grad;
    x.beginPath();
    x.arc(32, 32, 32, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function createGlintForMech(mech) {
  if (mech.glintMesh) {
    // Refresh the min-flash window so a re-charge after a fast cancel still
    // shows for at least one flash duration.
    mech.glintMinHideAt = performance.now() + SNIPER_GLINT_MIN_FLASH_MS;
    mech.glintPendingRemove = false;
    return;
  }
  const isBeam = !!mech.unit?.beam;
  const tex = new THREE.CanvasTexture(drawGlintCanvas(isBeam));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false
  }));
  const base = isBeam ? 3.0 : 0.55;
  mech.glintBaseScale = base;
  mech.glintMaxScale = isBeam ? 9 : 6.5;
  sprite.scale.set(base, base, 1);
  // Beam glint is centered on the chest (~half the unit); the normal glint
  // stays the small offset muzzle spark.
  if (isBeam) sprite.position.set(0, 0.4, 0.55);
  else sprite.position.set(0.55, 0.55, 0.55);
  sprite.renderOrder = 9999;
  mech.root.add(sprite);
  mech.glintMesh = sprite;
  mech.glintMinHideAt = performance.now() + SNIPER_GLINT_MIN_FLASH_MS;
  mech.glintPendingRemove = false;
}

// Force-remove the glint sprite, ignoring the min-flash window. Used at match
// teardown so we don't leak resources.
function disposeGlintImmediate(mech) {
  if (!mech.glintMesh) return;
  mech.root.remove(mech.glintMesh);
  if (mech.glintMesh.material) {
    if (mech.glintMesh.material.map) mech.glintMesh.material.map.dispose();
    mech.glintMesh.material.dispose();
  }
  mech.glintMesh = null;
  mech.glintPendingRemove = false;
  mech.glintMinHideAt = 0;
}

function removeGlintFromMech(mech) {
  if (!mech.glintMesh) return;
  // Honor the minimum flash window. If the charge resolves (or sprint-cancels)
  // before SNIPER_GLINT_MIN_FLASH_MS has elapsed, defer removal so the glint
  // is still visible as a brief hint. The render loop polls glintPendingRemove.
  if (performance.now() < (mech.glintMinHideAt ?? 0)) {
    mech.glintPendingRemove = true;
    return;
  }
  disposeGlintImmediate(mech);
}

// Called per-frame. Finalizes a pending glint removal once the min-flash
// window has elapsed.
function tickGlintRemoval(mech) {
  if (!mech?.glintMesh || !mech.glintPendingRemove) return;
  if (performance.now() < (mech.glintMinHideAt ?? 0)) return;
  disposeGlintImmediate(mech);
}

function updateGlintScale(mech, now = performance.now()) {
  if (!mech.glintMesh) return;
  const dist = camera.position.distanceTo(mech.root.position);
  // Grow with distance so the glint stays readable on long-range maps (Streets/Square).
  const base = mech.glintBaseScale ?? 0.55;
  const max = mech.glintMaxScale ?? 6.5;
  let s = THREE.MathUtils.clamp(base + dist * 0.05, base, max);
  // Kei: the glint grows toward 2× as the charge fills (full charge = 2×).
  if (mech.unit?.beam && mech.state.sniperChargeUntil > 0) {
    const chargeMs = mech.unit.chargeMs ?? 1000;
    const prog = THREE.MathUtils.clamp(1 - (mech.state.sniperChargeUntil - now) / chargeMs, 0, 1);
    s *= (1 + prog);
  }
  mech.glintMesh.scale.set(s, s, 1);
}

function attemptFire(owner, target, now) {
  // Defensive re-target — never fire at a corpse. Mirrors the shared sim's
  // attemptFire so offline 2v2 also auto-swaps to a live enemy when the
  // current target is dead, including bots that might pass stale refs.
  if (target && target.state.hp <= 0) {
    const enemies = getEnemiesOf(owner).filter((f) => f.state.hp > 0);
    if (enemies.length === 0) return false;
    target = enemies[0];
    if (owner === state.player) {
      state.playerCurrentTarget = target;
      if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
      target.root.add(state.reticle);
    }
  }
  const u = owner.unit;
  if (u.sniperCharge) {
    if (owner.state.airborne) return false;
    if (owner.state.sniperChargeTarget) return false;
    if (u.magCapacity != null && owner.state.ammo <= 0) return false;
    if (now - owner.state.lastFireAt < u.fireCooldownMs) return false;
    const chargeMs = u.chargeMs ?? 1000;
    owner.state.sniperChargeUntil = now + chargeMs;
    owner.state.sniperChargeStartAt = now;
    owner.state.sniperChargeTarget = target;
    owner.body.velocity.x = 0;
    owner.body.velocity.z = 0;
    owner.state.momentumVX = 0;
    owner.state.momentumVZ = 0;
    createGlintForMech(owner);
    return true;
  }
  const before = owner.state.lastFireAt;
  spawnProjectiles(owner, target);
  return owner.state.lastFireAt !== before;
}

function tickSniperCharge(mech, now, sprintHeld = false) {
  const target = mech.state.sniperChargeTarget;
  if (!target) return;
  // Sprint-cancel: holding sprint while the forced-standing charge is active
  // ends it and fires the projectile. Costs SNIPER_CANCEL_BOOST_COST (half a
  // step's boost). The cancel only registers once the charge is
  // SNIPER_CANCEL_MIN_CHARGE_MS old, so a pre-held sprint releases the shot at
  // the floor instead of instantly — the target always gets a fixed
  // glint-to-bullet window. Gating registration (not deferring the fire) also
  // means the boost cost is paid exactly once, on the tick the shot releases.
  let wasCancelled = false;
  if (
    sprintHeld
    && now >= mech.state.sniperChargeUntil - (mech.unit.chargeMs ?? 1000) + SNIPER_CANCEL_MIN_CHARGE_MS
    && now < mech.state.sniperChargeUntil
    && mech.state.boost >= SNIPER_CANCEL_BOOST_COST
  ) {
    mech.state.boost = Math.max(0, mech.state.boost - SNIPER_CANCEL_BOOST_COST);
    mech.state.refillPausedUntil = now + 500;
    mech.state.sniperChargeUntil = now;
    wasCancelled = true;
  }
  if (now < mech.state.sniperChargeUntil) {
    mech.body.velocity.x = 0;
    mech.body.velocity.z = 0;
    mech.state.momentumVX = 0;
    mech.state.momentumVZ = 0;
    return;
  }
  mech.state.sniperChargeTarget = null;
  mech.state.sniperChargeUntil = 0;
  removeGlintFromMech(mech);
  if (mech.state.hp <= 0) return;
  if (mech.unit.beam) {
    const chargeMs = mech.unit.chargeMs ?? 1000;
    // Full charge → the 1 s steerable sweep channel; an early sprint-cancel (or
    // the bot's short release) → the quick fixed beam. A sprint-cancel ALWAYS
    // makes a quick beam even if it lands late — otherwise the still-held sprint
    // would cancel the channel on its first frame and the beam would never show.
    if (!wasCancelled && now - mech.state.sniperChargeStartAt >= chargeMs - 50) startChargedBeam(mech, target);
    else spawnBeamOffline(mech, target);
  } else {
    spawnProjectiles(mech, target);
  }
}

function getProjectileDamage(projectile) {
  // Dummy mode zeroes damage from EVERY bot — both enemies AND the player's
  // ally bot. Only the player's own bullets do damage. Lets the player
  // freely test/observe without anyone else being able to land hits.
  if (state.dummyMode
      && projectile.owner !== state.player
      && (projectile.owner === state.enemy
          || projectile.owner === state.enemy2
          || projectile.owner === state.ally)) return 0;
  return projectile.damage;
}

function segmentHitsObstacle(p0, p1, o) {
  // Slab method — does the segment p0→p1 (t in [0,1]) intersect the AABB o?
  // Catches projectiles tunneling through obstacles between frames.
  let tMin = 0;
  let tMax = 1;
  const axes = [
    [p0.x, p1.x - p0.x, o.minX, o.maxX],
    [p0.y, p1.y - p0.y, o.minY, o.maxY],
    [p0.z, p1.z - p0.z, o.minZ, o.maxZ]
  ];
  for (const [start, delta, lo, hi] of axes) {
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

function projectileHitsSurface(prevPos, nextPos) {
  const samples = 8;
  let prevDelta = null;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = THREE.MathUtils.lerp(prevPos.x, nextPos.x, t);
    const y = THREE.MathUtils.lerp(prevPos.y, nextPos.y, t);
    const z = THREE.MathUtils.lerp(prevPos.z, nextPos.z, t);
    const h = surfaceHeightAtXZ(x, z);
    if (h === -Infinity) continue;
    const delta = y - h;
    if (Math.abs(delta) < 0.04) return true;
    if (prevDelta !== null && ((prevDelta > 0 && delta < 0) || (prevDelta < 0 && delta > 0))) return true;
    prevDelta = delta;
  }
  return false;
}

function updateProjectileSystem(dt) {
  const now = performance.now();
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const p = state.projectiles[i];
    p.ttl -= dt;
    if (p.ttl <= 0) {
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
      continue;
    }

    if (p.centerPellet && p.centerPellet !== p) {
      if (p.centerPellet.ttl <= 0 || !state.projectiles.includes(p.centerPellet)) {
        p.centerPellet = null;
      } else {
        // Cluster offset scales 0 → 1 over SHOTGUN_CLUSTER_SPREAD_DISTANCE
        // world units of center-pellet travel, so pellets emerge bunched and
        // grow to the full clusterOffset by the time they reach mid-range.
        // distTraveled is monotonically non-decreasing, so spread can't
        // shrink even when homing curves the center pellet.
        const spreadFactor = THREE.MathUtils.clamp(
          (p.centerPellet.distTraveled ?? 0) / SHOTGUN_CLUSTER_SPREAD_DISTANCE,
          0,
          1
        );
        p.vel.copy(p.centerPellet.vel);
        const repositioned = p.centerPellet.mesh.position.clone()
          .addScaledVector(p.clusterOffset, spreadFactor);
        // The cluster reposition is a teleport — give it the same swept wall
        // check as normal flight, or pellets can be PLACED across a thin
        // barrier (e.g. Airport's 1.2-thick glass) without ever "flying"
        // through it. A pellet whose reposition crosses a wall dies on it.
        let repoBlocked = false;
        for (const obstacle of arenaObstacles) {
          if (obstacle.noProjectile) continue;
          if (!segmentHitsObstacle(p.mesh.position, repositioned, obstacle)) continue;
          repoBlocked = true;
          break;
        }
        if (repoBlocked) {
          despawnProjectileTrail(p, now);
          disposeProjectileMesh(p.mesh);
          state.projectiles.splice(i, 1);
          continue;
        }
        p.mesh.position.copy(repositioned);
      }
    }
    const toTarget = new THREE.Vector3().subVectors(p.target.root.position, p.mesh.position);
    if (toTarget.length() <= HOMING_CLOSE_RANGE_CUTOFF) {
      p.homing = false;
      p.homingLost = true;
    }
    if (!p.homingLost && p.vel.dot(toTarget) < 0) {
      p.homingLost = true;
      p.homing = false;
    }

    if (p.homing && !p.homingLost && now >= p.target.state.evadeHomingUntil) {
      const desiredAngle = Math.atan2(toTarget.z, toTarget.x);
      const currentAngle = Math.atan2(p.vel.z, p.vel.x);
      const distToTarget = toTarget.length();
      const turnDeg = distToTarget <= HOMING_SOFTEN_RANGE ? HOMING_SOFTEN_DEG_PER_FRAME : HOMING_MAX_DEG_PER_FRAME;
      const maxTurn = THREE.MathUtils.degToRad(turnDeg);
      const wrapped = wrapAngle(desiredAngle - currentAngle);
      const turn = THREE.MathUtils.clamp(wrapped, -maxTurn, maxTurn);
      const speed = p.vel.length();
      const next = currentAngle + turn;
      p.vel.x = Math.cos(next) * speed;
      p.vel.z = Math.sin(next) * speed;
    }

    const prevPos = p.mesh.position.clone();
    p.mesh.position.addScaledVector(p.vel, dt);
    // Re-orient tracer projectiles (sniper / MG) so the streak follows
    // velocity. No-op for sphere projectiles (shotgun).
    orientTracer(p.mesh, p.vel.x, p.vel.y, p.vel.z);
    // Bullet trail: tail trails by (fadeMs / 1000) * speed, clamped to the
    // spawn position for the first fadeMs so the line doesn't extend behind
    // the muzzle. Skipped for shotgun (no trail).
    if (p.trail) {
      const elapsedMs = now - p.trailSpawnAt;
      const fadeSec = p.trailFadeMs / 1000;
      let tailX, tailY, tailZ;
      if (elapsedMs < p.trailFadeMs) {
        tailX = p.trailSpawnPos.x;
        tailY = p.trailSpawnPos.y;
        tailZ = p.trailSpawnPos.z;
      } else {
        tailX = p.mesh.position.x - p.vel.x * fadeSec;
        tailY = p.mesh.position.y - p.vel.y * fadeSec;
        tailZ = p.mesh.position.z - p.vel.z * fadeSec;
      }
      updateBulletTrailEnds(p.trail, tailX, tailY, tailZ,
        p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
    }
    // Track total path length on shotgun center pellets so the cluster
    // spread factor uses actual distance flown (homing-aware).
    if (p.distTraveled !== undefined) {
      p.distTraveled += p.mesh.position.distanceTo(prevPos);
    }
    // Hit geometry, computed BEFORE the wall/surface sweep so that sweep can be
    // clipped to the target's hit point. Without the clip, the swept wall test
    // spans the full per-frame step (~34 u at 2000 u/s) and despawns the round
    // on a wall *behind* the target — eating a shot that reaches the target
    // first (the close-range "phantom dodge"). Capsule volume matches the tall
    // billboard: free vertical travel within ±hitHalfHeight of body center, then
    // sphere falloff at hitRadius, centered on root.position. Mirrors shared/sim.
    const hitRadius = 1.6;
    const hitHalfHeight = 1.6;
    const hitCenter = p.target.root.position;
    const path = new THREE.Line3(prevPos, p.mesh.position.clone());
    const nearest = new THREE.Vector3();
    path.closestPointToPoint(hitCenter, true, nearest);
    const _hdx = nearest.x - hitCenter.x;
    const _hdz = nearest.z - hitCenter.z;
    const _hdy = Math.max(0, Math.abs(nearest.y - hitCenter.y) - hitHalfHeight);
    const hitDistSq = _hdx * _hdx + _hdy * _hdy + _hdz * _hdz;
    // Spawn protection / step (dodge) immunity / friendly-fire (2v2) / dead
    // target: the round passes through in each of these cases.
    const sameTeam = p.owner?.state?.team && p.target.state.team && p.owner.state.team === p.target.state.team;
    const botHit = p.target.state.hp > 0 && !sameTeam && now >= p.target.state.invulnerableUntil && now > p.target.state.stepUntil && hitDistSq < hitRadius * hitRadius;
    // Clip the wall/surface sweep to the hit point when the target is hit this
    // frame, so obstacles beyond the target don't despawn the round first. When
    // the target isn't hit (or passes through), sweep the full step as before.
    const sweepEnd = botHit ? nearest : p.mesh.position;
    // Swept test: catches fast/homing projectiles that would otherwise tunnel through
    // an obstacle between frames. Obstacles flagged `noProjectile` (e.g. invisible
    // unit-only fences) are skipped so bullets fly through them.
    for (const obstacle of arenaObstacles) {
      if (obstacle.noProjectile) continue;
      if (!segmentHitsObstacle(prevPos, sweepEnd, obstacle)) continue;
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
      p.ttl = 0;
      break;
    }
    if (p.ttl <= 0) continue;
    if (projectileHitsSurface(prevPos, sweepEnd)) {
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
      p.ttl = 0;
    }
    if (p.ttl <= 0) continue;
    if (botHit) {
      const finalDamage = getProjectileDamage(p);
      p.target.state.hp = Math.max(0, p.target.state.hp - finalDamage);
      // Per-weapon stun, lowest-move-scale-wins: a fresh hit applies its stun
      // when the target is free OR when its stun is strictly heavier (lower
      // move-scale) than the active one — taking its own duration even if shorter.
      const _ts = p.target.state;
      if (now >= _ts.hitStunUntil || p.hitStunScale < _ts.hitStunScale) {
        _ts.hitStunScale = p.hitStunScale;
        _ts.hitStunUntil = now + p.hitStunMs;
      }
      p.target.state.momentumVX = 0;
      p.target.state.momentumVZ = 0;
      spawnHitEffect(p.target.root.position, p.target === state.player ? 0x67f2ff : 0xff73d2);
      p.target.body.velocity.set(0, 0, 0);
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// 照射ビーム (Kei) — offline mirror of shared spawnBeam / tickBeams. An instant
// hitscan laser from the muzzle along the aim, clipped to the first wall, that
// damages each enemy ONCE during its life. The light-pink visual (spawnBeamMesh
// / updateBeamVisuals) is reused by the online client, which builds it from the
// 'beam-fired' event instead of the gameplay array.
// ---------------------------------------------------------------------------
const BEAM_MAX_LENGTH = 400;
// Kei full-charge sweep beam (照射ビーム channel).
const KEI_CHARGED_DURATION_MS = 1000;   // how long the channel lasts at full charge
const KEI_CHARGED_RADIUS_MULT = 1.5;    // charged beam is 1.5× the quick beam's width
const KEI_BEAM_SWEEP_RATE = 0.175;      // rad/s the beam rotates toward the aim (≈10°/s — very low sensitivity)
const KEI_BEAM_AIM_DEADZONE = 0.3;      // joystick magnitude below this = hold direction
const KEI_BEAM_MAX_PITCH = Math.atan(2); // vertical aim clamp (~63°; tan = 2, matches old tanY cap)
const KEI_BEAM_VIS_SMOOTH = 0.35;       // online-only: ease the DRAWN charged beam toward the predicted dir per frame (kills reconciliation snap)
// Aru laser sight (units with rangeDamage). RETIRED in favor of the range-tier
// lock reticle — flip LASER_SIGHT_ENABLED to true to bring the line back.
const LASER_SIGHT_ENABLED = false;
// Always-on toward the lock target; false = show only during the charge wind-up.
const LASER_SIGHT_ALWAYS_ON = true;
const LASER_SIGHT_DIM = 0x8f2f2f;       // mid tier (nearDist..midDist) — dim red
const LASER_SIGHT_BRIGHT = 0xff4646;    // far tier (beyond midDist) — brighter red

// Distance from (ox,oy,oz) along (dx,dy,dz) to the nearest wall, clamped to
// maxLen. Mirrors shared raycastObstacleDistance (same slab method).
function beamLengthToWall(ox, oy, oz, dx, dy, dz, maxLen) {
  const ex = ox + dx * maxLen;
  const ey = oy + dy * maxLen;
  const ez = oz + dz * maxLen;
  let best = maxLen;
  for (const o of arenaObstacles) {
    if (o.noProjectile) continue;
    let tMin = 0;
    let tMax = 1;
    let miss = false;
    const axes = [
      [ox, ex - ox, o.minX, o.maxX],
      [oy, ey - oy, o.minY, o.maxY],
      [oz, ez - oz, o.minZ, o.maxZ]
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
        const tn = t1 < t2 ? t1 : t2;
        const tf = t1 < t2 ? t2 : t1;
        if (tn > tMin) tMin = tn;
        if (tf < tMax) tMax = tf;
        if (tMin > tMax) { miss = true; break; }
      }
    }
    if (miss) continue;
    const d = tMin * maxLen;
    if (d >= 0 && d < best) best = d;
  }
  return best;
}

// Perpendicular distance (XZ) from a point to the beam's clamped segment.
function beamPerpDistXZ(b, px, pz) {
  let t = (px - b.ox) * b.dx + (pz - b.oz) * b.dz;
  if (t < 0) t = 0; else if (t > b.length) t = b.length;
  const cx = b.ox + b.dx * t;
  const cz = b.oz + b.dz * t;
  const ddx = px - cx;
  const ddz = pz - cz;
  return Math.sqrt(ddx * ddx + ddz * ddz);
}

function spawnBeamOffline(owner, target) {
  const u = owner.unit;
  const now = performance.now();
  // Same ammo + fire-cooldown bookkeeping as spawnProjectiles (which the beam
  // path replaces), so Kei's beam consumes ammo and respects the fire cooldown.
  if (u.magCapacity != null && owner.state.ammo <= 0) return;
  if (now - owner.state.lastFireAt < u.fireCooldownMs) return;
  owner.state.lastFireAt = now;
  if (u.magCapacity != null) owner.state.ammo -= 1;
  const ox = owner.root.position.x;
  const oy = owner.root.position.y + 0.8;   // muzzle height (matches projectile spawn)
  const oz = owner.root.position.z;
  // Aim 3D toward the target so the beam tilts to the enemy's height (matches the
  // online shared spawnBeam). Keeping dir.y zeroed pinned the visual flat at
  // Kei's muzzle height even when the target was higher/lower. Hit detection is
  // XZ-only, so this only changes how the line is drawn.
  const dir = new THREE.Vector3().subVectors(target.root.position, owner.root.position);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const radius = u.beam?.radius ?? 1.6;
  const durationMs = u.beam?.durationMs ?? 500;
  const length = beamLengthToWall(ox, oy, oz, dir.x, dir.y, dir.z, BEAM_MAX_LENGTH);
  if (!state.beams) state.beams = [];
  state.beams.push({
    owner, team: owner.state.team,
    ox, oy, oz, dx: dir.x, dy: dir.y, dz: dir.z,
    length, radius,
    expiresAt: now + durationMs,
    damage: u.damage,
    hitStunMs: u.stun?.ms ?? 100,
    hitStunScale: u.stun?.moveScale ?? 0.25,
    hitIds: []
  });
  spawnBeamMesh(ox, oy, oz, dir.x, dir.y, dir.z, length, radius, durationMs);
}

function updateBeamDamage(now) {
  if (!state.beams || state.beams.length === 0) return;
  const fighters = getAllFighters();
  for (let i = state.beams.length - 1; i >= 0; i -= 1) {
    const b = state.beams[i];
    if (now >= b.expiresAt) { state.beams.splice(i, 1); continue; }
    // Real cylinder: the beam's drawn 3D line vs each enemy's capsule (1.6
    // vertical free band + 1.6 radius — same body model the projectiles use).
    const beamLine = new THREE.Line3(
      new THREE.Vector3(b.ox, b.oy, b.oz),
      new THREE.Vector3(b.ox + b.dx * b.length, b.oy + b.dy * b.length, b.oz + b.dz * b.length)
    );
    const rrN = b.radius + 1.6;
    for (const m of fighters) {
      if (!m || m === b.owner) continue;
      const st = m.state;
      if (st.hp <= 0) continue;
      if (b.hitIds.includes(m)) continue;
      if (b.team && st.team && b.team === st.team) continue;   // friendly fire off
      if (now < st.invulnerableUntil) continue;                // spawn protection
      if (now <= st.stepUntil) continue;                       // dodge i-frames
      const hc = m.root.position;
      const near = beamLine.closestPointToPoint(hc, true, new THREE.Vector3());
      const vdy = Math.max(0, Math.abs(near.y - hc.y) - 1.6);
      const hdx = near.x - hc.x, hdz = near.z - hc.z;
      if (hdx * hdx + vdy * vdy + hdz * hdz >= rrN * rrN) continue;
      let dmg = b.damage;
      if (state.dummyMode && b.owner !== state.player) dmg = 0;  // dummy: only player damages
      st.hp = Math.max(0, st.hp - dmg);
      if (now >= st.hitStunUntil || b.hitStunScale < st.hitStunScale) {
        st.hitStunScale = b.hitStunScale;
        st.hitStunUntil = now + b.hitStunMs;
      }
      st.momentumVX = 0;
      st.momentumVZ = 0;
      m.body.velocity.set(0, 0, 0);
      spawnHitEffect(m.root.position, m === state.player ? 0x67f2ff : 0xff73d2);
      b.hitIds.push(m);
    }
    deleteProjectilesInBeam(b, b.radius);   // #1: the laser deletes projectiles it touches
  }
}

// Light-pink beam mesh (bright core + soft glow), reused by offline and the
// online client. Fades over durationMs via state.beamVisuals / updateBeamVisuals.
function spawnBeamMesh(ox, oy, oz, dx, dy, dz, length, radius, durationMs = 500) {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc7e2, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, length, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff0f7, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  group.add(glow);
  group.add(core);
  // CylinderGeometry is along local +Y; rotate +Y → beam dir, center at mid-line.
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
  group.position.set(ox + dx * length / 2, oy + dy * length / 2, oz + dz * length / 2);
  group.renderOrder = 9998;
  scene.add(group);
  if (!state.beamVisuals) state.beamVisuals = [];
  state.beamVisuals.push({ group, spawnAt: performance.now(), durationMs, baseGlow: 0.5, baseCore: 0.95 });
}

function updateBeamVisuals(now) {
  const arr = state.beamVisuals;
  if (!arr || arr.length === 0) return;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const bv = arr[i];
    const t = (now - bv.spawnAt) / bv.durationMs;
    if (t >= 1) {
      scene.remove(bv.group);
      bv.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      arr.splice(i, 1);
      continue;
    }
    const fade = 1 - t;
    bv.group.children[0].material.opacity = bv.baseGlow * fade;
    bv.group.children[1].material.opacity = bv.baseCore * fade;
  }
}

// ---------------------------------------------------------------------------
// Kei full charge → 照射ビーム SWEEP CHANNEL. The owner is locked for
// KEI_CHARGED_DURATION_MS; the 1.5×-wide beam follows the muzzle, damages each
// enemy once, deletes projectiles it touches, and steers — the player's
// joystick rotates it toward the aim at a capped rate (bots track their
// target). Sprint cancels it; the fire cooldown only starts when it ends.
// ---------------------------------------------------------------------------
function startChargedBeam(owner, target) {
  const u = owner.unit;
  const now = performance.now();
  if (u.magCapacity != null && owner.state.ammo <= 0) return;
  if (u.magCapacity != null) owner.state.ammo -= 1;
  const dir = new THREE.Vector3().subVectors(target.root.position, owner.root.position);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  owner.state.chargedBeamUntil = now + KEI_CHARGED_DURATION_MS;
  // Cooldown is paused during the channel and starts at its end. Park lastFireAt
  // at the scheduled end NOW so the charge-init gate blocks a re-charge until
  // end + fireCooldownMs — even on the frame the channel expires, where
  // updatePlayer (charge-init) runs before updateChargedBeams (endChargedBeam).
  // endChargedBeam overwrites it with the real end time on an early sprint-cancel.
  owner.state.lastFireAt = owner.state.chargedBeamUntil;
  owner.state.chargedBeamDirX = dir.x;
  owner.state.chargedBeamDirZ = dir.z;
  // Start the vertical aim pointed at the target's height (channel opens on-
  // target); the player can then sweep it up/down, bots re-aim it each tick.
  const hd = Math.hypot(target.root.position.x - owner.root.position.x, target.root.position.z - owner.root.position.z);
  owner.state.chargedBeamPitch = THREE.MathUtils.clamp(Math.atan2(target.root.position.y - owner.root.position.y, hd), -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
  owner.chargedBeamHitIds = [];
  owner.chargedBeamVisual = buildChargedBeamMesh((u.beam?.radius ?? 1.6) * KEI_CHARGED_RADIUS_MULT);
}

function endChargedBeam(owner, now) {
  owner.state.chargedBeamUntil = 0;
  owner.state.lastFireAt = now;          // cooldown resumes from here
  owner.chargedBeamHitIds = null;
  fadeOutChargedBeamVisual(owner);
}

// Hand the charged-beam mesh to the fading-beam list so the channel fades over
// ~0.5 s (like the quick beam) on end/cancel instead of vanishing instantly.
function fadeOutChargedBeamVisual(owner) {
  if (!owner.chargedBeamVisual) return;
  if (!state.beamVisuals) state.beamVisuals = [];
  state.beamVisuals.push({ group: owner.chargedBeamVisual, spawnAt: performance.now(), durationMs: 500, baseGlow: 0.55, baseCore: 0.97 });
  owner.chargedBeamVisual = null;
}

function buildChargedBeamMesh(radius) {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc7e2, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, 1, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff0f7, transparent: true, opacity: 0.97, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  group.add(glow);
  group.add(core);
  group.renderOrder = 9998;
  scene.add(group);
  return group;
}

// Despawn any projectile whose position lies within the beam volume (XZ).
function deleteProjectilesInBeam(beamLike, radius) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const p = state.projectiles[i];
    if (!p.mesh) continue;
    if (beamPerpDistXZ(beamLike, p.mesh.position.x, p.mesh.position.z) >= radius) continue;
    despawnProjectileTrail(p, performance.now());
    disposeProjectileMesh(p.mesh);
    state.projectiles.splice(i, 1);
  }
}

// Orient + stretch a charged-beam mesh from the muzzle along its swept XZ
// heading, tilted vertically so the rendered line points at the nearest enemy's
// height instead of staying flat at Kei's muzzle height. The beam's hit test is
// XZ-only (height-agnostic), so this is purely cosmetic — used by both the
// offline sweep and the online snapshot render. Flat ground ⇒ tan 0 ⇒ unchanged.
// Vertical aim (rise per unit of XZ travel) toward the nearest enemy, clamped so
// a very close/high enemy can't make the beam near-vertical. Used by the BOT to
// auto-aim its charged-beam pitch at the target's height (players steer pitch
// themselves via the aim stick).
function chargedBeamTanYOffline(ownerMech) {
  let best = null, bestD = Infinity;
  for (const e of getEnemiesOf(ownerMech)) {
    if (!e || e.state.hp <= 0) continue;
    const ex = e.root.position.x - ownerMech.root.position.x;
    const ez = e.root.position.z - ownerMech.root.position.z;
    const d = ex * ex + ez * ez;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return 0;
  const horiz = Math.sqrt(bestD);
  if (horiz <= 1e-3) return 0;
  return THREE.MathUtils.clamp((best.root.position.y - ownerMech.root.position.y) / horiz, -2, 2);
}

function orientChargedBeamVisual(g, tanY, ox, oy, oz, dirX, dirZ, length) {
  const dir3 = new THREE.Vector3(dirX, tanY, dirZ).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3);
  g.scale.set(1, Math.hypot(length, tanY * length), 1);
  g.position.set(ox + dirX * length / 2, oy + tanY * length / 2, oz + dirZ * length / 2);
}

function updateChargedBeams(now, dt) {
  for (const m of getAllFighters()) {
    if (!m) continue;
    if (!(m.state.chargedBeamUntil > now)) {
      if (m.chargedBeamVisual) endChargedBeam(m, now);   // expired this frame
      continue;
    }
    const u = m.unit;
    const st = m.state;
    // --- Steer (capped rate). The bot auto-aims yaw+pitch at its target; the
    // player drives a twin-axis turret: joystick x = horizontal sweep, y = pitch. ---
    const maxStep = KEI_BEAM_SWEEP_RATE * dt;
    const curAngle = Math.atan2(st.chargedBeamDirZ, st.chargedBeamDirX);
    if (m === state.player) {
      if (input.boostHeld || input.sprintLocked) { endChargedBeam(m, now); continue; } // sprint cancels
      if (Math.abs(input.x) > KEI_BEAM_AIM_DEADZONE) {
        const newAngle = curAngle + input.x * maxStep;   // horizontal sweep
        st.chargedBeamDirX = Math.cos(newAngle);
        st.chargedBeamDirZ = Math.sin(newAngle);
      }
      if (Math.abs(input.y) > KEI_BEAM_AIM_DEADZONE) {     // vertical (pitch) sweep
        st.chargedBeamPitch = THREE.MathUtils.clamp(st.chargedBeamPitch - input.y * maxStep, -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
      }
    } else {
      let targetAngle = curAngle;
      const tgt = pickClosestEnemyOf(m) ?? state.player;
      if (tgt && tgt.state.hp > 0) {
        const ax = tgt.root.position.x - m.root.position.x;
        const az = tgt.root.position.z - m.root.position.z;
        if (ax * ax + az * az > 1e-4) targetAngle = Math.atan2(az, ax);
      }
      let delta = targetAngle - curAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const newAngle = curAngle + THREE.MathUtils.clamp(delta, -maxStep, maxStep);
      st.chargedBeamDirX = Math.cos(newAngle);
      st.chargedBeamDirZ = Math.sin(newAngle);
      // Vertical: aim at the target's height (the bot's beam tracks elevation).
      st.chargedBeamPitch = THREE.MathUtils.clamp(Math.atan(chargedBeamTanYOffline(m)), -KEI_BEAM_MAX_PITCH, KEI_BEAM_MAX_PITCH);
    }
    // --- Geometry ---
    const ox = m.root.position.x;
    const oy = m.root.position.y + 0.8;
    const oz = m.root.position.z;
    const radius = (u.beam?.radius ?? 1.6) * KEI_CHARGED_RADIUS_MULT;
    const length = beamLengthToWall(ox, oy, oz, st.chargedBeamDirX, 0, st.chargedBeamDirZ, BEAM_MAX_LENGTH);
    const beamLike = { ox, oz, dx: st.chargedBeamDirX, dz: st.chargedBeamDirZ, length };
    // Real cylinder: tilt the hit line to the steered pitch (same as the drawn
    // beam) and test each enemy's capsule against it.
    const tanY = Math.tan(st.chargedBeamPitch);
    const cBeamLine = new THREE.Line3(
      new THREE.Vector3(ox, oy, oz),
      new THREE.Vector3(ox + st.chargedBeamDirX * length, oy + tanY * length, oz + st.chargedBeamDirZ * length)
    );
    const rrC = radius + 1.6;
    // --- One-hit damage ---
    if (!m.chargedBeamHitIds) m.chargedBeamHitIds = [];
    for (const t of getAllFighters()) {
      if (!t || t === m) continue;
      const tst = t.state;
      if (tst.hp <= 0 || m.chargedBeamHitIds.includes(t)) continue;
      if (st.team && tst.team && st.team === tst.team) continue;
      if (now < tst.invulnerableUntil || now <= tst.stepUntil) continue;
      const hc = t.root.position;
      const near = cBeamLine.closestPointToPoint(hc, true, new THREE.Vector3());
      const vdy = Math.max(0, Math.abs(near.y - hc.y) - 1.6);
      const hdx = near.x - hc.x, hdz = near.z - hc.z;
      if (hdx * hdx + vdy * vdy + hdz * hdz >= rrC * rrC) continue;
      // The charged sweep channel hits softer than the quick beam / normal shot.
      let dmg = u.beam?.chargedDamage ?? u.damage;
      if (state.dummyMode && m !== state.player) dmg = 0;
      tst.hp = Math.max(0, tst.hp - dmg);
      if (now >= tst.hitStunUntil || (u.stun?.moveScale ?? 0.25) < tst.hitStunScale) {
        tst.hitStunScale = u.stun?.moveScale ?? 0.25;
        tst.hitStunUntil = now + (u.stun?.ms ?? 100);
      }
      tst.momentumVX = 0; tst.momentumVZ = 0; t.body.velocity.set(0, 0, 0);
      spawnHitEffect(t.root.position, t === state.player ? 0x67f2ff : 0xff73d2);
      m.chargedBeamHitIds.push(t);
    }
    deleteProjectilesInBeam(beamLike, radius);
    // --- Visual: stretch + orient the persistent mesh along the beam ---
    if (m.chargedBeamVisual) {
      orientChargedBeamVisual(m.chargedBeamVisual, tanY, ox, oy, oz, st.chargedBeamDirX, st.chargedBeamDirZ, length);
    }
  }
}

// Online render of charged sweep channels — drives the same persistent mesh
// from the snapshot-mirrored state (chargedBeamUntil / chargedBeamDirX|Z);
// damage + steering are server-authoritative (shared tickChargedBeams). `now`
// is server-clock (hudNow), since chargedBeamUntil is server-clock.
function syncOnlineChargedBeams(now) {
  const onl = state.online;
  getAllFighters().forEach((m) => {
    if (!m) return;
    if (!(m.state.chargedBeamUntil > now)) {
      fadeOutChargedBeamVisual(m);   // fade over ~0.5 s instead of vanishing
      if (m === state.player && onl) onl.beamVisActive = false;  // re-init smoothing next channel
      return;
    }
    const radius = (m.unit.beam?.radius ?? 1.6) * KEI_CHARGED_RADIUS_MULT;
    if (!m.chargedBeamVisual) m.chargedBeamVisual = buildChargedBeamMesh(radius);
    let dx = m.state.chargedBeamDirX;
    let dz = m.state.chargedBeamDirZ;
    let pitch = m.state.chargedBeamPitch;
    if (dx * dx + dz * dz < 1e-6) return;
    // Local player only: ease the DRAWN beam direction toward the predicted one so
    // the prediction→server reconciliation doesn't snap it each snapshot (the
    // "interference" feel). Render-only — the hit uses the real server direction,
    // so the drawn line can trail it by a sliver, but it never auto-aims to target.
    if (m === state.player && onl) {
      const tgtYaw = Math.atan2(dz, dx);
      if (!onl.beamVisActive) {
        onl.beamVisYaw = tgtYaw; onl.beamVisPitch = pitch; onl.beamVisActive = true;
      } else {
        let dyaw = tgtYaw - onl.beamVisYaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        onl.beamVisYaw += dyaw * KEI_BEAM_VIS_SMOOTH;
        onl.beamVisPitch += (pitch - onl.beamVisPitch) * KEI_BEAM_VIS_SMOOTH;
      }
      dx = Math.cos(onl.beamVisYaw);
      dz = Math.sin(onl.beamVisYaw);
      pitch = onl.beamVisPitch;
    }
    const ox = m.root.position.x;
    const oy = m.root.position.y + 0.8;
    const oz = m.root.position.z;
    const length = beamLengthToWall(ox, oy, oz, dx, 0, dz, BEAM_MAX_LENGTH);
    orientChargedBeamVisual(m.chargedBeamVisual, Math.tan(pitch), ox, oy, oz, dx, dz, length);
  });
}

// ---------------------------------------------------------------------------
// Aru laser sight — a 1px red line from the muzzle toward the lock target,
// clipped at the first wall. Pure client visual (no sim/net state), rendered
// for every mech with unit.rangeDamage in BOTH modes, so everyone sees it.
// Color encodes the damage tier: hidden inside nearDist (weak zone), dim red
// in the mid tier, brighter red at full-damage range.
// ---------------------------------------------------------------------------
function laserTargetOf(m) {
  if (state.online) {
    const sm = state.online.slotMap;
    if (sm && m.state.targetId) {
      const byId = { [sm.cameraId]: state.player, [sm.allyId]: state.ally, [sm.enemyId]: state.enemy, [sm.enemy2Id]: state.enemy2 };
      const t = byId[m.state.targetId];
      if (t) return t;
    }
    return pickClosestEnemyOf(m);
  }
  if (m === state.player) return state.playerCurrentTarget ?? state.enemy;
  return pickClosestEnemyOf(m);
}

function updateLaserSights() {
  if (!LASER_SIGHT_ENABLED) {
    // Retired visual — keep any existing lines hidden, but leave the system
    // intact so one flag flip restores it.
    for (const m of getAllFighters()) {
      if (m?.laserSightVisual) m.laserSightVisual.visible = false;
    }
    return;
  }
  for (const m of getAllFighters()) {
    if (!m) continue;
    const rd = m.unit?.rangeDamage;
    let show = !!rd && m.state.hp > 0;
    if (show && !LASER_SIGHT_ALWAYS_ON) show = !!m.state.sniperChargeTarget;
    const tgt = show ? laserTargetOf(m) : null;
    if (!tgt || tgt.state.hp <= 0) show = false;
    let dist = 0;
    if (show) {
      dist = Math.hypot(tgt.root.position.x - m.root.position.x, tgt.root.position.z - m.root.position.z);
      if (dist < rd.nearDist) show = false;   // weak zone: no laser
    }
    if (!show) {
      if (m.laserSightVisual) m.laserSightVisual.visible = false;
      continue;
    }
    if (!m.laserSightVisual) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: LASER_SIGHT_BRIGHT, transparent: true, opacity: 0.9 });
      m.laserSightVisual = new THREE.Line(geo, mat);
      m.laserSightVisual.renderOrder = 9997;
      scene.add(m.laserSightVisual);
    }
    const ox = m.root.position.x;
    const oy = m.root.position.y + 0.8;      // muzzle height (matches projectile spawn)
    const oz = m.root.position.z;
    let dx = tgt.root.position.x - ox;
    let dy = (tgt.root.position.y + 0.8) - oy;
    let dz = tgt.root.position.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    // Clip at the first wall so the sight never shows through cover.
    const drawLen = Math.min(len, beamLengthToWall(ox, oy, oz, dx, dy, dz, len));
    const pos = m.laserSightVisual.geometry.attributes.position;
    pos.setXYZ(0, ox, oy, oz);
    pos.setXYZ(1, ox + dx * drawLen, oy + dy * drawLen, oz + dz * drawLen);
    pos.needsUpdate = true;
    m.laserSightVisual.material.color.set(dist < rd.midDist ? LASER_SIGHT_DIM : LASER_SIGHT_BRIGHT);
    m.laserSightVisual.visible = true;
  }
}

// Draw Kei's quick 照射ビーム beams from the snapshot's beam list (state-driven).
// Each beam persists ~0.5 s across many snapshots, so — unlike the old one-shot
// 'beam-fired' event — this survives the snapshot drops that happen when two
// land in one render frame (common on sprint-cancel). Beam ids are monotonic, so
// we draw each one's fading mesh exactly once and fade it over its remaining life.
function syncOnlineBeams(snap) {
  const beams = snap.beams;
  if (!beams || !beams.length) return;
  const onl = state.online;
  if (!onl) return;
  const last = onl.lastBeamId || 0;
  let maxId = last;
  for (const b of beams) {
    if (b.id == null) continue;
    if (b.id > last) {
      const remaining = b.expiresAt - snap.serverTime;   // server clock, same units as expiresAt
      spawnBeamMesh(b.ox, b.oy, b.oz, b.dx, b.dy, b.dz, b.length, b.radius, Math.max(120, remaining));
    }
    if (b.id > maxId) maxId = b.id;
  }
  onl.lastBeamId = maxId;
}

function applyRepulsion(now) {
  // Soft-collision push between any two fighters that have closed inside 3
  // units. In 1v1 this is just player ↔ enemy. In 2v2 all six pairings are
  // checked so allies don't clip into each other or stack on a target.
  // Dead fighters are excluded — they're invisible and shouldn't shove
  // live mechs around.
  const fighters = getAllFighters().filter((m) => m.state.hp > 0);
  for (let i = 0; i < fighters.length; i += 1) {
    for (let j = i + 1; j < fighters.length; j += 1) {
      const a = fighters[i];
      const b = fighters[j];
      const diff = new THREE.Vector3().subVectors(a.root.position, b.root.position);
      const dist = diff.length();
      if (dist >= 3) continue;
      diff.normalize();
      const force = (3 - dist) * 16;
      a.body.velocity.x += diff.x * force * 0.04;
      a.body.velocity.z += diff.z * force * 0.04;
      b.body.velocity.x -= diff.x * force * 0.04;
      b.body.velocity.z -= diff.z * force * 0.04;
      a.state.stackUntil = now + 220;
      b.state.stackUntil = now + 220;
    }
  }
}

function updateBoost(mech, now, action) {
  const s = mech.state;
  const groundY = getGroundLevelY(mech) + 0.1;
  const grounded = mech.grounded || mech.body.position.y <= groundY;

  if (now < s.overheatedUntil) {
    s.action = 'hard-landing';
    mech.body.velocity.x = 0;
    mech.body.velocity.z = 0;
    mech.thrusters.forEach((t) => (t.material.opacity = 0.05));
    mech.plumeLight.intensity = 0;
    return;
  }

  s.action = action;
  const consume = ['dash'].includes(action);
  // Per-unit drain / regen / cap, with global-default fallbacks.
  const drain = mech.unit.boostDrain ?? BOOST_DASH_DRAIN_PER_TICK;
  const regen = mech.unit.boostRegen ?? BOOST_REGEN_PER_TICK;
  const cap = mech.unit.boostCap ?? BOOST_CAP;
  if (consume) {
    s.boost = Math.max(0, s.boost - drain);
    s.refillPausedUntil = now + 500;
  } else if (grounded && now >= s.refillPausedUntil) s.boost = Math.min(cap, s.boost + regen);

  if (s.boost <= 0) {
    if (s.emptyRecoverUntil <= now) s.emptyRecoverUntil = now + 100;
    s.overheatedUntil = now;
    s.action = 'idle';
  }

  mech.thrusters.forEach((t) => {
    t.material.opacity = consume ? 0.9 : 0.12;
    t.scale.y = consume ? 1.6 : 1;
  });
  mech.plumeLight.intensity = consume ? 2.1 : 0;
}

function updatePlayer(now) {
  // Dead player → no input, no movement, no firing. The mech is already
  // hidden by updateTransforms; this gate stops all gameplay-side effects so
  // the player can't control / fire while spectating their ally.
  if (state.player.state.hp <= 0) {
    state.player.body.velocity.x = 0;
    state.player.body.velocity.z = 0;
    state.player.state.momentumVX = 0;
    state.player.state.momentumVZ = 0;
    state.player.state.action = 'idle';
    // Drop any pending input flags so they don't fire when (if ever) we
    // come back. Match ends when the whole team dies, so this is mostly
    // belt-and-suspenders.
    input.shootTap = false;
    input.shootHold = false;
    input.stepTap = false;
    input.jump = false;
    return;
  }
  if (state.player.state.sniperChargeTarget) {
    state.player.body.velocity.x = 0;
    state.player.body.velocity.z = 0;
    state.player.state.momentumVX = 0;
    state.player.state.momentumVZ = 0;
    state.player.state.action = 'shoot';
    updateBoost(state.player, now, 'shoot');
    return;
  }
  // Locked during the charged sweep channel — the joystick becomes the aimer
  // (handled in updateChargedBeams), not movement.
  if (state.player.state.chargedBeamUntil > now) {
    state.player.body.velocity.x = 0;
    state.player.body.velocity.z = 0;
    state.player.state.momentumVX = 0;
    state.player.state.momentumVZ = 0;
    state.player.state.action = 'shoot';
    updateBoost(state.player, now, 'shoot');
    return;
  }
  const p = state.player.root.position;
  const e = state.enemy.root.position;
  const stepState = state.player.state;
  const inStep = now <= stepState.stepUntil;
  const hasDirInput = Math.hypot(input.x, input.y) > 0.15;
  if (!hasDirInput || input.jump || input.stepTap || state.player.state.boost <= 0) input.sprintLocked = false;
  input.boost = input.boostHeld || input.sprintLocked;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = forward.clone().multiplyScalar(-input.y).add(right.multiplyScalar(input.x));
  const moveMag = Math.hypot(input.x, input.y);

  const recoveringFromDash = now < state.player.state.dashRecoverUntil;
  const hasBoost = state.player.state.boost > 0;
  const emptyPenaltyActive = now < state.player.state.emptyRecoverUntil;
  const canDash = hasBoost && !emptyPenaltyActive;
  const useSprint = input.boost && canDash;
  // Per-unit movement speeds — fall back to the global defaults if a unit
  // omits the override.
  const playerSprintSpeed = state.player.unit.sprintSpeed ?? BOOST_MOVE_SPEED;
  const playerWalkSpeed = state.player.unit.walkSpeed ?? WALK_SPEED;
  const baseSpeed = useSprint ? playerSprintSpeed : (recoveringFromDash ? 4.55 : playerWalkSpeed);
  const speed = (!hasBoost || emptyPenaltyActive) ? Math.min(baseSpeed, 7.5) : baseSpeed;
  const hitStunned = now < state.player.state.hitStunUntil;
  const hitStunScale = hitStunned ? state.player.state.hitStunScale : 1;
  const canInputMove = !emptyPenaltyActive;
  if (!inStep) {
    state.player.body.velocity.x = canInputMove ? move.x * speed * hitStunScale : 0;
    state.player.body.velocity.z = canInputMove ? move.z * speed * hitStunScale : 0;
  }

  let action = 'idle';
  if (inStep) {
    const span = Math.max(1, stepState.stepUntil - stepState.stepStartAt);
    const progress = THREE.MathUtils.clamp((now - stepState.stepStartAt) / span, 0, 1);
    const targetX = THREE.MathUtils.lerp(stepState.stepFromX, stepState.stepToX, progress);
    const targetZ = THREE.MathUtils.lerp(stepState.stepFromZ, stepState.stepToZ, progress);
    // Bonk: the next lerp point lands inside an obstacle. Halt the dodge here for
    // the rest of the step — collapse the lerp path to this spot so a later point
    // on the FAR side of a thin wall can't tunnel the unit through. The step is
    // NOT ended early, so the animation + i-frames run the full duration.
    if (!unitOverlapsObstacle(targetX, state.player.body.position.y, targetZ)) {
      state.player.body.position.x = targetX;
      state.player.body.position.z = targetZ;
    } else {
      stepState.stepFromX = state.player.body.position.x; stepState.stepToX = state.player.body.position.x;
      stepState.stepFromZ = state.player.body.position.z; stepState.stepToZ = state.player.body.position.z;
    }
    state.player.body.velocity.x = 0;
    state.player.body.velocity.z = 0;
    state.player.state.action = 'step';
    action = 'step';
  } else if (stepState.stepUntil > 0) {
    stepState.stepUntil = 0;
    if (stepState.queuedMomentumVX !== 0 || stepState.queuedMomentumVZ !== 0) {
      state.player.state.momentumVX += stepState.queuedMomentumVX;
      state.player.state.momentumVZ += stepState.queuedMomentumVZ;
      stepState.queuedMomentumVX = 0;
      stepState.queuedMomentumVZ = 0;
    }
  } else if (
    input.jump
    && canInputMove
    && stepState.boost >= (state.player.unit.jumpBoostCost ?? JUMP_BOOST_COST)
    && (state.player.grounded || state.player.body.position.y <= getGroundLevelY(state.player) + 0.15)
    && now >= state.player.state.jumpCooldownUntil
  ) {
    // Per-unit jump tunables — fall back to globals if a unit doesn't
    // override. v0 sets peak height (≈ v² / (2·|gravity|)); hover holds
    // the apex; cooldown gates the next jump; boostCost gates entry.
    const jumpBoostCost = state.player.unit.jumpBoostCost ?? JUMP_BOOST_COST;
    const jumpVelocity = state.player.unit.jumpVelocity ?? JUMP_INITIAL_VELOCITY;
    const jumpHoverMs = state.player.unit.jumpHoverMs ?? JUMP_HOVER_MS;
    const jumpCooldownMs = state.player.unit.jumpCooldownMs ?? JUMP_COOLDOWN_MS;
    input.boost = false;
    state.player.state.boost = Math.max(0, state.player.state.boost - jumpBoostCost);
    state.player.state.refillPausedUntil = now + 500;
    state.player.state.jumpVelocity = jumpVelocity;
    state.player.state.airborne = true;
    state.player.state.hoverUntil = now + jumpHoverMs;
    state.player.state.jumpCooldownUntil = now + jumpCooldownMs;
    inheritMomentum(state.player, 70);
    action = 'jump';
  } else if (input.boost && canInputMove) {
    state.player.state.antiMeleeUntil = now + 260;
    inheritMomentum(state.player, MOMENTUM_STANDARD * 1.5);
    action = 'dash';
    triggerDashDefense(now);
  }

  if (input.stepTap) {
    if (!inStep && canInputMove && now >= stepState.stepCooldownUntil && stepState.boost >= STEP_BOOST_COST) {
      let stepDir = move.clone();
      if (stepDir.lengthSq() < 0.03) stepDir.set(state.player.body.velocity.x, 0, state.player.body.velocity.z);
      if (stepDir.lengthSq() < 0.03) stepDir.set(p.x - e.x, 0, p.z - e.z);
      if (stepDir.lengthSq() < 0.03) stepDir.set(1, 0, 0);
      stepDir.normalize();

      stepState.stepStartAt = now;
      stepState.stepUntil = now + STEP_DURATION_MS;
      stepState.stepCooldownUntil = now + STEP_COOLDOWN_MS;
      stepState.stepFromX = state.player.body.position.x;
      stepState.stepFromZ = state.player.body.position.z;
      stepState.stepToX = stepState.stepFromX + stepDir.x * STEP_DISTANCE;
      stepState.stepToZ = stepState.stepFromZ + stepDir.z * STEP_DISTANCE;
      stepState.queuedMomentumVX = state.player.state.momentumVX * 0.65 + state.player.body.velocity.x * 0.35;
      stepState.queuedMomentumVZ = state.player.state.momentumVZ * 0.65 + state.player.body.velocity.z * 0.35;
      state.player.state.momentumVX = 0;
      state.player.state.momentumVZ = 0;
      state.player.state.boost = Math.max(0, state.player.state.boost - STEP_BOOST_COST);
      input.sprintLocked = false;
      state.player.state.refillPausedUntil = now + 500;
      clearIncomingHoming(state.player, now);
      action = 'step';
    }
    input.stepTap = false;
  }

  // Resolve the current lock target. Defaults to state.enemy (1v1) but can
  // be the second enemy in 2v2 if the player switched targets. If the current
  // target died, fall back to the first live enemy.
  let pTarget = state.playerCurrentTarget ?? state.enemy;
  if (pTarget && pTarget.state.hp <= 0) {
    const live = getEnemiesOf(state.player).find((f) => f.state.hp > 0);
    if (live) {
      state.playerCurrentTarget = live;
      pTarget = live;
      if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
      state.reticle && live.root.add(state.reticle);
    }
  }
  if (input.shootTap) {
    input.boost = false;
    attemptFire(state.player, pTarget, now);
    triggerEnemyEvasion(now);
    if (action === 'idle') action = 'shoot';
    input.shootTap = false;
  }
  // Player MG: continuous fire while shoot is held — no burst cap (cooldown still gates rate).
  if (input.shootHold && state.player.unit.spreadCount === 1 && !state.player.unit.sniperCharge) {
    const firedAt = state.player.state.lastFireAt;
    attemptFire(state.player, pTarget, now);
    if (state.player.state.lastFireAt !== firedAt) {
      triggerEnemyEvasion(now);
      if (action === 'idle') action = 'shoot';
    }
  }
  state.player.state.machineBurstRemaining = 0;

  applyMomentum(state.player, { suspend: action === 'step' });
  const canAttemptMove = moveMag > 0.2 && !hitStunned && !inStep;
  const horizontalSpeed = Math.hypot(state.player.body.velocity.x, state.player.body.velocity.z);
  if (canAttemptMove && horizontalSpeed < 0.08) {
    if (!state.playerStuckSince) state.playerStuckSince = now;
    if (now - state.playerStuckSince > 420) {
      state.player.body.position.x += move.x * 0.45;
      state.player.body.position.z += move.z * 0.45;
      state.player.body.velocity.x = move.x * 3.2;
      state.player.body.velocity.z = move.z * 3.2;
      state.player.state.momentumVX = 0;
      state.player.state.momentumVZ = 0;
      state.playerStuckSince = now;
    }
  } else {
    state.playerStuckSince = 0;
  }
  updateBoost(state.player, now, action);
}

// ===== Universal bot AI helpers =====
// Tunables shared across the bot's situational checks. Sized so the avoidance
// vector is felt without overwhelming the player-tracking direction.
const BOT_OBSTACLE_AVOID_RADIUS = 7;
const BOT_OBSTACLE_AVOID_WEIGHT = 1.8;
const BOT_STUCK_MOVED_EPSILON = 0.4;
const BOT_STUCK_TICKS_THRESHOLD = 8;
const BOT_STUCK_PIVOT_MS = 1000;  // committed wall-follow window — long enough to run the length of a wall to its opening (was 600, too short to clear long walls)
// After a stuck event, remember the pinned spot for this long and bias
// movement away from it so the bot picks a different route around the wall
// instead of grinding into the same corner once the perpendicular pivot
// ends. Radius caps the influence so distant memories don't warp kiting.
const BOT_STUCK_MEMORY_MS = 3500;
const BOT_STUCK_MEMORY_RADIUS = 12;
const BOT_STUCK_MEMORY_WEIGHT = 0.7;  // below the ~0.85 pursuit pull, so it nudges the path angle without ever reversing pursuit (was 1.4 — strong enough to shove the bot away from the player and stall its search)
const BOT_LOS_EYE_HEIGHT = 1.6;
const BOT_JUMP_HEIGHT_DIFF = 2.5;
// LoS-aware 2v2 targeting: an enemy with no line of sight (sealed behind
// glass/walls) reads this many units FARTHER than it really is, so a visible
// enemy wins the lock unless the blocked one is drastically closer. The
// margin keeps the current lock unless a rival clearly beats it (no flicker).
const BOT_TARGET_BLOCKED_PENALTY = 50;
const BOT_TARGET_SWITCH_MARGIN = 6;

// --- Elevation-kiting tunables ---
// A ledge whose lip rises more than the auto-step height (1.6) above the
// bot's floor can't be walked onto — it needs a jump. The upper bound is
// what a jump arc can actually clear (apex ≈ jumpVelocity² / 2·|gravity|,
// ≈ 5.6 with the default 30 jump velocity), kept conservative for margin.
const BOT_CLIMB_MIN_RISE = 1.7;
const BOT_CLIMB_MAX_RISE = 4.8;
// How far out the bot scans for a ledge to perch on, and how close it has to
// get to that ledge (or to a drop edge) before it commits the jump.
const BOT_PERCH_SEEK_RADIUS = 24;
const BOT_LEDGE_JUMP_REACH = 4.5;
// A floor more than this above base ground means "the bot is on high ground".
const BOT_HIGH_GROUND_MIN_Y = 1.7;
// How far past a surface edge to sample when testing whether stepping off it
// actually drops to lower ground (vs. running straight into a wall).
const BOT_DESCENT_PROBE = 3;
// Weight of the ledge-seek steering when blended into the kiting vector.
const BOT_ELEV_STEER_WEIGHT = 2.4;
// How long after an elevation jump the bot keeps driving toward the ledge so
// the arc lands where it was aimed instead of drifting off on the kiting
// vector. Covers the longest arc (a drop off high ground, ~0.85 s airborne).
const BOT_AIR_STEER_MS = 900;

// Repulsion vector from blocking obstacles within `radius` of (px, py, pz).
// Returns un-normalized {rx, rz} that the caller can blend into the kiting
// direction. Uses the same y-skip math as resolveUnitObstacleCollisions so
// obstacles the bot is over (e.g. low platform decks) or below (high
// overheads) don't push them. Obstacles flagged `noProjectile` (the station
// platform-edge walls) are skipped here because they have a dedicated jump
// handler below — repelling from them would prevent the bot from approaching
// the platform at all.
function computeBotAvoidance(px, py, pz, obstacles, radius) {
  let rx = 0, rz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    const topBuffer = o.topBuffer ?? 4;
    if (py < o.minY - 2 || py > o.maxY + topBuffer) continue;
    const nx = Math.max(o.minX, Math.min(px, o.maxX));
    const nz = Math.max(o.minZ, Math.min(pz, o.maxZ));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    const d = Math.sqrt(d2);
    if (d > 0.001) {
      const t = 1 - d / radius;
      const strength = t * t;
      rx += (dx / d) * strength;
      rz += (dz / d) * strength;
    } else {
      // Bot center is on the AABB face — push along the axis of shallowest
      // penetration so resolveUnitObstacleCollisions doesn't have to.
      const dMinX = Math.abs(px - o.minX);
      const dMaxX = Math.abs(o.maxX - px);
      const dMinZ = Math.abs(pz - o.minZ);
      const dMaxZ = Math.abs(o.maxZ - pz);
      const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
      if (minD === dMinX) rx -= 1;
      else if (minD === dMaxX) rx += 1;
      else if (minD === dMinZ) rz -= 1;
      else rz += 1;
    }
  }
  return { rx, rz };
}

// Soft repulsion away from a spot the bot got recently pinned at. Same
// quadratic falloff as the obstacle avoidance so it blends naturally with
// the existing kiting vector, and zero outside `radius` so old memories
// don't pull the bot toward weird headings on the far side of the map.
function computeStuckRepulsion(px, pz, memX, memZ, radius) {
  const dx = px - memX;
  const dz = pz - memZ;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return { rx: 0, rz: 0 };
  const d = Math.sqrt(d2);
  if (d < 0.001) return { rx: 0, rz: 0 };
  const t = 1 - d / radius;
  const strength = t * t;
  return { rx: (dx / d) * strength, rz: (dz / d) * strength };
}

// Line-of-sight check between two world points using the same swept-AABB
// math projectiles use, so the bot only "sees" through gaps a bullet would
// actually pass through. Skips obstacles flagged noProjectile because bullets
// pass through those too.
function botHasLineOfSight(p0, p1) {
  for (const o of arenaObstacles) {
    if (o.noProjectile) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  return true;
}

// Universal burst size for continuous-fire weapons (spreadCount === 1): about
// half the magazine per trigger pull, clamped so a 5-round mag still feels
// like a burst and a 100-round mag doesn't fire forever. Derives from
// magCapacity so re-tuning a weapon's mag automatically re-tunes the bot.
function botBurstSize(unit) {
  if (!unit.magCapacity || unit.magCapacity === Infinity) return 6;
  return Math.max(3, Math.min(20, Math.floor(unit.magCapacity / 2)));
}

// Inline jump bookkeeping for the bot — mirrors the gating the player jump
// uses (boost cost + cooldown) plus the bot's extra BOT_SPRINT_MIN_BOOST
// margin so it never jumps itself completely dry. Returns true if a jump
// started this tick.
function botStartJump(now) {
  const eState = state.enemy.state;
  const jumpBoostCost = state.enemy.unit.jumpBoostCost ?? JUMP_BOOST_COST;
  if (!state.enemy.grounded || eState.airborne) return false;
  if (now < eState.jumpCooldownUntil) return false;
  if (eState.boost < jumpBoostCost + BOT_SPRINT_MIN_BOOST) return false;
  eState.boost = Math.max(0, eState.boost - jumpBoostCost);
  eState.refillPausedUntil = now + 500;
  eState.jumpVelocity = state.enemy.unit.jumpVelocity ?? JUMP_INITIAL_VELOCITY;
  eState.airborne = true;
  eState.hoverUntil = now + (state.enemy.unit.jumpHoverMs ?? JUMP_HOVER_MS);
  eState.jumpCooldownUntil = now + (state.enemy.unit.jumpCooldownMs ?? JUMP_COOLDOWN_MS);
  inheritMomentum(state.enemy, 70);
  return true;
}

// Scan for the nearest walkable surface whose lip sits a jump-height above
// the bot's floor — a ledge it can hop onto for a high-ground kiting
// advantage. Skips ledges too tall to clear with a jump (those need a ramp)
// and ones level enough to just walk onto. Returns a unit vector toward the
// nearest reachable point on that ledge plus the horizontal distance to it,
// or null if nothing suitable is in range.
function findHighGroundPerch(px, pz, myFloorY, searchRadius) {
  let best = null;
  let bestDist = searchRadius;
  for (const s of arenaSurfaces) {
    if (s.maxTop - myFloorY < BOT_CLIMB_MIN_RISE) continue;
    const nx = Math.max(s.minX, Math.min(px, s.maxX));
    const nz = Math.max(s.minZ, Math.min(pz, s.maxZ));
    const rise = s.heightAt(nx, nz) - myFloorY;
    if (rise < BOT_CLIMB_MIN_RISE || rise > BOT_CLIMB_MAX_RISE) continue;
    // A wall standing ON the ledge lip (e.g. Airport's rim glass fences) means
    // a unit couldn't stand at this point — treat it like any wall and don't
    // steer/jump toward it. (Station's edge walls top out AT the platform
    // surface with topBuffer 0, so they pass this check unchanged.)
    if (unitOverlapsObstacle(nx, myFloorY + rise + 2.45, nz)) continue;
    const ddx = nx - px;
    const ddz = nz - pz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d >= bestDist) continue;
    bestDist = d;
    const inv = d > 1e-3 ? 1 / d : 0;
    best = { toX: ddx * inv, toZ: ddz * inv, dist: d };
  }
  return best;
}

// The bot is standing on a raised surface — find the edge it should run or
// jump off to drop back to lower ground. Prefers the edge most aligned with
// `away` (a direction, usually away from the opponent) and rejects edges
// that just lead into a wall or don't actually descend. Returns a unit
// vector toward that edge plus the distance to it, or null if the bot isn't
// on a droppable surface.
function findDescentDirection(px, pz, myFloorY, awayX, awayZ) {
  let host = null;
  for (const s of arenaSurfaces) {
    if (px < s.minX || px > s.maxX || pz < s.minZ || pz > s.maxZ) continue;
    if (Math.abs(s.heightAt(px, pz) - myFloorY) > 1) continue;
    host = s;
    break;
  }
  if (!host) return null;
  const lowerY = myFloorY - BOT_CLIMB_MIN_RISE;
  const probeY = myFloorY + GROUND_BASE_Y;
  const edges = [
    { x: -1, z: 0, edgeDist: px - host.minX, probeX: host.minX - BOT_DESCENT_PROBE, probeZ: pz },
    { x: 1, z: 0, edgeDist: host.maxX - px, probeX: host.maxX + BOT_DESCENT_PROBE, probeZ: pz },
    { x: 0, z: -1, edgeDist: pz - host.minZ, probeX: px, probeZ: host.minZ - BOT_DESCENT_PROBE },
    { x: 0, z: 1, edgeDist: host.maxZ - pz, probeX: px, probeZ: host.maxZ + BOT_DESCENT_PROBE }
  ];
  let best = null;
  let bestScore = -Infinity;
  for (const e of edges) {
    if (groundHeightAt(e.probeX, e.probeZ, myFloorY + 50) > lowerY) continue;
    if (unitOverlapsObstacle(e.probeX, probeY, e.probeZ)) continue;
    const score = (e.x * awayX + e.z * awayZ) - e.edgeDist * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = { toX: e.x, toZ: e.z, edgeDist: Math.max(0, e.edgeDist) };
    }
  }
  return best;
}

function updateEnemy(now) {
  if (state.enemy.state.sniperChargeTarget) {
    state.enemy.body.velocity.x = 0;
    state.enemy.body.velocity.z = 0;
    state.enemy.state.momentumVX = 0;
    state.enemy.state.momentumVZ = 0;
    state.enemy.state.action = 'shoot';
    updateBoost(state.enemy, now, 'shoot');
    return;
  }
  // Locked while channeling a charged sweep (beam steers toward target in updateChargedBeams).
  if (state.enemy.state.chargedBeamUntil > now) {
    state.enemy.body.velocity.x = 0;
    state.enemy.body.velocity.z = 0;
    state.enemy.state.momentumVX = 0;
    state.enemy.state.momentumVZ = 0;
    state.enemy.state.action = 'shoot';
    updateBoost(state.enemy, now, 'shoot');
    return;
  }
  const p = state.player.root.position;
  const e = state.enemy.root.position;
  const toPlayer = new THREE.Vector3().subVectors(p, e).setY(0);
  const dist = toPlayer.length();
  const dir = toPlayer.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const eState = state.enemy.state;

  // --- Anti-sniper glint response: dodge a fixed BOT_GLINT_REACT_MS after the
  // glint appears (mirrors tickBot in shared/src/sim/ai.js). One step per
  // charge; the schedule survives the glint vanishing so a late/full-charge
  // shot is still covered.
  const sniperCharging = state.player.state.sniperChargeTarget === state.enemy;
  if (sniperCharging) {
    if (!eState.botGlintAt) {
      eState.botGlintAt = now;
      eState.botGlintStepAt = now + BOT_GLINT_REACT_MS;
    }
  } else {
    eState.botGlintAt = null;
  }
  // A fresh hit means the shot already landed — drop the now-pointless dodge.
  // (botPrevHitStun is only advanced by the threat block below, so the rising
  // edge is still visible here.)
  if (eState.hitStunUntil > (eState.botPrevHitStun ?? 0)) eState.botGlintStepAt = null;

  // The guessed dodge comes due: one attempt, then the guess is spent.
  if (eState.botGlintStepAt != null && now >= eState.botGlintStepAt) {
    eState.botGlintStepAt = null;
    if (
      now > (eState.stepUntil || 0)
      && now >= (eState.stepCooldownUntil || 0)
      && eState.boost >= STEP_BOOST_COST
    ) {
      // Continue the committed Defense escape line if one is active so the
      // dodge reads as part of the same evade; otherwise pick a random side.
      let sdx, sdz;
      if (eState.botState === 'defense' && eState.botDefenseDirX != null) {
        sdx = eState.botDefenseDirX; sdz = eState.botDefenseDirZ;
      } else {
        const lat = Math.random() < 0.5 ? 1 : -1;
        sdx = side.x * lat; sdz = side.z * lat;
      }
      const sLen = Math.hypot(sdx, sdz) || 1;
      sdx /= sLen; sdz /= sLen;
      eState.stepStartAt = now;
      eState.stepUntil = now + STEP_DURATION_MS;
      eState.stepCooldownUntil = now + STEP_COOLDOWN_MS;
      eState.stepFromX = state.enemy.body.position.x;
      eState.stepFromZ = state.enemy.body.position.z;
      eState.stepToX = eState.stepFromX + sdx * STEP_DISTANCE;
      eState.stepToZ = eState.stepFromZ + sdz * STEP_DISTANCE;
      eState.queuedMomentumVX = eState.momentumVX * 0.65 + state.enemy.body.velocity.x * 0.35;
      eState.queuedMomentumVZ = eState.momentumVZ * 0.65 + state.enemy.body.velocity.z * 0.35;
      eState.momentumVX = 0;
      eState.momentumVZ = 0;
      eState.boost = Math.max(0, eState.boost - STEP_BOOST_COST);
      eState.refillPausedUntil = now + 500;
      clearIncomingHoming(state.enemy, now);
      // "Dodge + 150 ms sprint": after the i-frame step ends, keep sprinting the
      // same way for 150 ms via a brief Defense commit.
      eState.botState = 'defense';
      eState.botStateEnteredAt = now;
      eState.botDefenseDirX = sdx; eState.botDefenseDirZ = sdz;
      eState.botDefenseDirAt = now;
      eState.botDefenseUntil = eState.stepUntil + 500;
      eState.botDefenseInCover = false;
      eState.botDefenseCoverAt = 0;
      eState.botDefensePeekDone = false;
      eState.botDefenseStuckTicks = 0;
      eState.botDefenseFlips = 0;
      eState.botDefenseStuckMode = false;
    }
  }

  // Step lifecycle (mirrors the player's step block in updatePlayer): while
  // mid-step the lerp owns position/velocity/action and the rest of the AI
  // sits out the tick; the first tick after it ends pays out queued momentum.
  if (now <= (eState.stepUntil || 0)) {
    const span = Math.max(1, eState.stepUntil - eState.stepStartAt);
    const progress = THREE.MathUtils.clamp((now - eState.stepStartAt) / span, 0, 1);
    const targetX = THREE.MathUtils.lerp(eState.stepFromX, eState.stepToX, progress);
    const targetZ = THREE.MathUtils.lerp(eState.stepFromZ, eState.stepToZ, progress);
    // Bonk: the next lerp point lands inside an obstacle. Halt the dodge here for
    // the rest of the step — collapse the lerp path to this spot so a later point
    // on the FAR side of a thin wall can't tunnel the unit through. The step is
    // NOT ended early, so the animation + i-frames run the full duration.
    if (!unitOverlapsObstacle(targetX, state.enemy.body.position.y, targetZ)) {
      state.enemy.body.position.x = targetX;
      state.enemy.body.position.z = targetZ;
    } else {
      eState.stepFromX = state.enemy.body.position.x; eState.stepToX = state.enemy.body.position.x;
      eState.stepFromZ = state.enemy.body.position.z; eState.stepToZ = state.enemy.body.position.z;
    }
    state.enemy.body.velocity.x = 0;
    state.enemy.body.velocity.z = 0;
    eState.action = 'step';
    updateBoost(state.enemy, now, 'step');
    return;
  } else if ((eState.stepUntil || 0) > 0) {
    eState.stepUntil = 0;
    eState.momentumVX += eState.queuedMomentumVX || 0;
    eState.momentumVZ += eState.queuedMomentumVZ || 0;
    eState.queuedMomentumVX = 0;
    eState.queuedMomentumVZ = 0;
  }

  // Range band centers ON the lock range: sweet spot = lockRange exactly,
  // edges ±7. The bot hovers right at the red-lock boundary — drifting past
  // it briefly is fine, the Engage pull immediately corrects back. One
  // universal rule for every weapon: the shotgun's lockRange is tuned to 27
  // (pellet-cluster distance), which lands its band at 20–34 — the same
  // numbers its old dedicated special case hard-coded.
  const lockRange = state.enemy.unit.lockRange ?? 50;
  const upperRange = lockRange + 7;
  const optimalRange = Math.max(10, lockRange);
  const lowerRange = Math.max(6, lockRange - 7);
  // === Behavior state machine: Defense > Maze > Engage > Pursue.
  // Each state has explicit time-bound exits — no latching. Replaces the
  // tangle of evadeActive / coverSeeking / escaping / inBurst / direSearch
  // flags with one botState whose transitions are recomputed every tick.

  // LoS + threats
  const playerHasLoS = botHasLineOfSight(
    { x: e.x, y: e.y + BOT_LOS_EYE_HEIGHT, z: e.z },
    { x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z }
  );
  // BLINK-TOLERANT SIGHT (decision layer). At cover slits the raw LoS ray
  // flickers per tick as either side moves a hair — and every state trigger
  // (orbit flips, the no-sight clock, maze latch/release, ARRIVED) consumed
  // that flicker at once, producing the pacing standoffs at arch gaps and
  // doorways. Decisions use `sightedStable`: raw LoS gated by a ~0.8 s
  // rolling average — sight must be SUSTAINED (avg > 0.6) to count, so
  // flicker-grade sight reads as BLIND for state changes and the bot
  // commits a route instead of dithering. Aiming/firing, Defense cover
  // reads, and the engage cover-hold keep the raw per-tick `playerHasLoS`.
  // (EMA assumes the fixed ~16 ms tick both sims run at.)
  eState.botSightAvg = (eState.botSightAvg ?? (playerHasLoS ? 1 : 0)) * 0.98
    + (playerHasLoS ? 0.02 : 0);
  const sightedStable = playerHasLoS && eState.botSightAvg > 0.6;
  // Would the player still be visible from (px, pz)? LoS-gates the range
  // discipline below: never retreat or drift outward past the edge of sight.
  const losFromPoint = (px, pz) => botHasLineOfSight(
    { x: px, y: e.y + BOT_LOS_EYE_HEIGHT, z: pz },
    { x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z }
  );
  // Are the next `len` units straight toward the player WALKABLE? Uses the
  // real movement rules (walkSegmentBlocked, topBuffer semantics) — the old
  // chest-height ray sailed clean over 2.4-high belts that physically stop
  // a unit, so the triggers/exits kept releasing the bot into low walls.
  const walkTowardClear = (len) => !walkSegmentBlocked(
    e.x, e.z,
    e.x + dir.x * len, e.z + dir.z * len,
    e.y, arenaObstacles
  );
  if (eState.hitStunUntil > (eState.botPrevHitStun ?? 0)) eState.botHitEvadeUntil = now + BOT_HIT_EVADE_MS;
  eState.botPrevHitStun = eState.hitStunUntil;
  // Defense (cover-sprint) triggers on a FRESH HIT only. The SNIPER GLINT no
  // longer triggers Defense — the bot's sole response to a glint is the
  // committed dodge scheduled above, so it ALWAYS dodges instead of sometimes
  // sprinting to cover. We also deliberately do NOT trigger on "player squeezed
  // the trigger". "Sprint when getting hit" is provided by hitEvading below.
  const hitEvading = now < (eState.botHitEvadeUntil ?? 0);
  const underFire = hitEvading;
  const inBandDist = dist >= lowerRange && dist <= upperRange;

  // LoS clock (Reposition's 3 s timeout) + position-progress clock (Maze's 2 s
  // trigger). Progress is measured as real net displacement over a rolling
  // 500 ms window, not per-tick velocity, so the stun crawl can't false-trigger
  // Maze the way the old velocity-based stuck-detector did.
  if (sightedStable || eState.botLastLoSAt == null) eState.botLastLoSAt = now;
  const noLoSTime = now - eState.botLastLoSAt;
  if (eState.botProgressAnchorAt == null) {
    eState.botProgressAnchorX = e.x;
    eState.botProgressAnchorZ = e.z;
    eState.botProgressAnchorAt = now;
    eState.botLastProgressAt = now;
  }
  if (now - eState.botProgressAnchorAt > 500) {
    const ddx = e.x - eState.botProgressAnchorX;
    const ddz = e.z - eState.botProgressAnchorZ;
    // Hit-stun overlapped this window → excused. Being slowed to a crawl by
    // landing bullets is suppression, not "stuck": sustained fire otherwise
    // starves this clock and drops the bot into spurious mid-fight Maze
    // episodes (the angled-backward-sprint sightings on Plain Field).
    // Under-fire wedges are Defense's job, on its own 2-tick trigger.
    // A bounded-window hold is likewise DELIBERATE standing, not a stall.
    if (Math.hypot(ddx, ddz) > 3
        || eState.hitStunUntil > eState.botProgressAnchorAt
        || now < (eState.botOrbitHoldUntil ?? 0)) {
      eState.botLastProgressAt = now;
    }
    eState.botProgressAnchorX = e.x;
    eState.botProgressAnchorZ = e.z;
    eState.botProgressAnchorAt = now;
  }
  const noProgressTime = now - (eState.botLastProgressAt ?? now);

  const avoid = computeBotAvoidance(e.x, e.y, e.z, arenaObstacles, BOT_OBSTACLE_AVOID_RADIUS);
  const avoidMag = Math.hypot(avoid.rx, avoid.rz);
  const obstacleNear = avoidMag > 0.3;

  const myFloorY = groundHeightAt(e.x, e.z, e.y - GROUND_BASE_Y);
  const oppFloorY = groundHeightAt(p.x, p.z, p.y - GROUND_BASE_Y);
  const onHighGround = myFloorY > BOT_HIGH_GROUND_MIN_Y;

  // --- Stuck cut-in detection over a rolling 1.5 s window, two flavors:
  //   WEDGED   — barely any net movement AND barely any path traveled.
  //   SPINNING — plenty of path traveled but almost no net displacement
  //              (ping-ponging, orbit jams, wall grinding).
  // Either funnels into Maze (committed go-around) below — the old remedy
  // (a blind Defense strafe) is gone. Skips airborne and stun frames; a
  // window inflated by a charge-lock freeze (the AI early-returns while
  // charging, so the clock runs without samples) is discarded unevaluated.
  let stuckTriggered = false;
  eState.botPathLen = (eState.botPathLen ?? 0)
    + Math.hypot(e.x - (eState.botPrevX ?? e.x), e.z - (eState.botPrevZ ?? e.z));
  eState.botPrevX = e.x;
  eState.botPrevZ = e.z;
  if (eState.botStuckCheckAt == null) {
    eState.botStuckCheckX = e.x;
    eState.botStuckCheckZ = e.z;
    eState.botStuckCheckAt = now;
    eState.botPathLen = 0;
  } else if (now - eState.botStuckCheckAt >= 1500) {
    const windowStale = now - eState.botStuckCheckAt > 2200;
    const net = Math.hypot(e.x - eState.botStuckCheckX, e.z - eState.botStuckCheckZ);
    const wedged = net < 2.5 && eState.botPathLen < 6;
    const spinning = eState.botPathLen > 18 && net < 6;
    if (!windowStale
        && (wedged || spinning)
        && !eState.airborne
        && now >= eState.hitStunUntil
        && now >= (eState.botOrbitHoldUntil ?? 0)   // hold = deliberate standing
        && (eState.botState ?? 'pursue') !== 'defense') {
      stuckTriggered = true;
    }
    eState.botStuckCheckX = e.x;
    eState.botStuckCheckZ = e.z;
    eState.botStuckCheckAt = now;
    eState.botPathLen = 0;
  }

  // Commit (or re-commit) Maze's go-around heading: tangent to the nearest
  // obstacle, biased toward the player so the detour closes distance.
  // `escaping` = re-commit fired by the stuck alarm: when the probes can't
  // pick a side, REVERSE the current heading instead of leaning toward the
  // player — the player-lean is what walks the bot straight back into the
  // corner it just jammed in.
  const commitMazeDirection = (escaping = false, keepHand = false) => {
    let mxe = avoid.rx, mze = avoid.rz;
    const ml = Math.hypot(mxe, mze);
    eState.botMazeHadWall = ml >= 0.1;
    if (ml < 0.1) {
      // OPEN GROUND: nothing to go around yet — head straight at the player.
      // (The old commit here was side*orbitSign = PERPENDICULAR to the player,
      // which combined with the toward-pull traced a stable ORBIT around the
      // target — the endless circling below the Airport plateau.) The moment
      // a wall interposes, the context check in the maze movement block
      // re-commits into wall-follow.
      mxe = dir.x;
      mze = dir.z;
      if (escaping) { mxe = -mxe; mze = -mze; }
      eState.botMazeHand = null;
    } else {
      const ux = mxe / ml, uz = mze / ml;
      let tx = -uz, tz = ux;
      // MULTI-DISTANCE probes: from 20/40/60 units along each tangent, how
      // soon would the player become visible? Picking the side that gains
      // sight SOONEST approximates the shorter way around a finite wall —
      // the old single-20 probe went blind past one cover-length, leaving
      // the tie to a fixed-rotation default (the "always turns right" bias).
      const probeDist = (px2, pz2) => {
        for (const pd of [20, 40, 60]) {
          if (losFromPoint(e.x + px2 * pd, e.z + pz2 * pd)) return pd;
        }
        return Infinity;
      };
      const dPlus = probeDist(tx, tz);
      const dMinus = probeDist(-tx, -tz);
      if (dPlus !== dMinus) {
        if (dMinus < dPlus) { tx = -tx; tz = -tz; }
      } else if (escaping) {
        // Probes tied while escaping a jam: reverse the committed heading.
        const proj = tx * (eState.botMazeDirX ?? tx) + tz * (eState.botMazeDirZ ?? tz);
        if (proj > 0) { tx = -tx; tz = -tz; }
      } else if (keepHand && eState.botMazeHand != null) {
        // KEEP THE SAME WAY AROUND: preserve which hand the wall is on. Corner
        // re-commits keep circling the object, and 7 s refreshes along a long
        // wall hold their direction — instead of the toward-player tiebreak
        // re-aiming every refresh and pendulum-ing the bot under the player
        // (it never committed the full run to the Airport ramp gaps).
        if ((tz * ux - tx * uz) * eState.botMazeHand < 0) { tx = -tx; tz = -tz; }
      } else if (tx * dir.x + tz * dir.z < 0) {
        tx = -tx; tz = -tz;
      }
      // Record the chosen going-around hand (side of the wall vs travel).
      eState.botMazeHand = (tz * ux - tx * uz) >= 0 ? 1 : -1;
      // WALL-FOLLOW: tangent-dominant with a slight standoff. The old blend
      // (away + 1.3*tangent = 61% away after normalizing) detached the bot
      // from the wall diagonally within a second, stranding it in open
      // ground where the old open-ground commit turned the march into an
      // orbit. Hugging the wall is the whole point of Maze.
      mxe = tx + ux * 0.25;
      mze = tz + uz * 0.25;
    }
    const ml2 = Math.hypot(mxe, mze) || 1;
    eState.botMazeDirX = mxe / ml2;
    eState.botMazeDirZ = mze / ml2;
    // Record whether LoS was blocked at (re)commit. The LoS-restored exit only
    // counts when it was — otherwise (stuck against a side pillar with LoS
    // already clear) Maze would exit on the first tick and never get to act.
    eState.botMazeLosBlockedAtEntry = !sightedStable;
  };

  // OPENING SCAN — Maze's loop breaker. Wall-following a CLOSED loop (a
  // room's inside perimeter, a free-standing block) laps forever: corners
  // hand off cleanly, the stuck alarm sees real movement, and a blind-entry
  // Maze has no time cap. So every 7 s refresh scans rings of probe points
  // (8 directions × 25/50/75 units) for one that can SEE the player — a
  // doorway or opening — and commits straight at it. Ties on the same ring
  // break toward the player (no fixed-rotation bias). False if nothing sees.
  const mazeScanForOpening = () => {
    for (const sd of [25, 50, 75]) {
      let bx = 0, bz = 0, bestDot = -Infinity;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const sx2 = Math.cos(a), sz2 = Math.sin(a);
        const px3 = e.x + sx2 * sd, pz3 = e.z + sz2 * sd;
        // REACHABILITY at WALK height (+1.0, ALL obstacles): eye-height
        // testing had two holes — it skipped jump-only edges, and it passed
        // clean OVER the 3.7 plateau body, calling points on the far side
        // "reachable" through a wall the bot can't walk through.
        const r0 = { x: e.x, y: e.y + 1.0, z: e.z };
        const r1 = { x: px3, y: e.y + 1.0, z: pz3 };
        let reachable = true;
        for (const o of arenaObstacles) {
          if (segmentHitsObstacle(r0, r1, o)) { reachable = false; break; }
        }
        if (!reachable) continue;
        if (!losFromPoint(px3, pz3)) continue;
        const dt = sx2 * dir.x + sz2 * dir.z;
        if (dt > bestDot) { bestDot = dt; bx = sx2; bz = sz2; }
      }
      if (bestDot > -Infinity) {
        eState.botMazeDirX = bx;
        eState.botMazeDirZ = bz;
        // hadWall=true suppresses the open-ground context re-commit (the
        // wall being left behind would instantly re-grab the heading);
        // real wall contact en route is handled by the corner turn.
        eState.botMazeHadWall = true;
        eState.botMazeHand = null;
        eState.botMazeLosBlockedAtEntry = !sightedStable;
        return true;
      }
    }
    return false;
  };

  // ELEVATION ROUTE — Maze's ramp-seeker. When the opening scan sees nothing
  // AND the target stands on a meaningfully different floor, same-floor
  // wall-following can never help (Airport plateau: the 12-high rim glass
  // blocks every between-floor sight line, and fence lips block the perch
  // hop — ramps are the only route). Commit toward a point a third of the
  // way INTO the nearest connecting ramp from MY end (foot when climbing,
  // crest when descending); riding it to the other level is what finally
  // opens sight, and the normal flow takes over from there.
  const mazeSeekElevationRoute = (allowClimb = false) => {
    const floorGap = oppFloorY - myFloorY;
    // CLIMB MODE: same floor, but the flat route is dead (allowClimb is
    // passed only then) — e.g. both on Airport ground with the full-width
    // plateau between. Take any UP-ramp from my level: crossing over the
    // top is the route, and once up there the normal cross-floor logic
    // descends the far side.
    const climbMode = Math.abs(floorGap) < 2.5;
    if (climbMode && !allowClimb) return false;
    const levelLow = Math.min(myFloorY, oppFloorY);
    const levelHigh = Math.max(myFloorY, oppFloorY);
    let bx = 0, bz = 0, bestD = Infinity;
    for (const s of arenaSurfaces) {
      if (s.type !== 'ramp') continue;
      const lo = Math.min(s.lowY, s.highY);
      const hi = Math.max(s.lowY, s.highY);
      if (climbMode) {
        // An up-ramp starting at my level.
        if (Math.abs(lo - myFloorY) > 2 || hi < myFloorY + 2.5) continue;
      } else if (Math.abs(lo - levelLow) > 2 || Math.abs(hi - levelHigh) > 2) {
        // Cross-floor: must actually connect the two floors.
        continue;
      }
      const wantY = (climbMode || floorGap > 0) ? lo : hi;   // the ramp end on MY level
      let ex, ez;
      if (s.axis === 'x') {
        const e0 = s.lowY === wantY ? s.minX : s.maxX;
        const e1 = s.lowY === wantY ? s.maxX : s.minX;
        ex = e0 + (e1 - e0) * 0.35;
        ez = (s.minZ + s.maxZ) / 2;
      } else {
        const e0 = s.lowY === wantY ? s.minZ : s.maxZ;
        const e1 = s.lowY === wantY ? s.maxZ : s.minZ;
        ez = e0 + (e1 - e0) * 0.35;
        ex = (s.minX + s.maxX) / 2;
      }
      const d = Math.hypot(ex - e.x, ez - e.z);
      if (d < bestD) { bestD = d; bx = ex; bz = ez; }
    }
    if (bestD === Infinity) return false;
    const dl = bestD || 1;
    eState.botMazeDirX = (bx - e.x) / dl;
    eState.botMazeDirZ = (bz - e.z) / dl;
    eState.botMazeHadWall = true;   // corner turn handles wall contact en route
    eState.botMazeHand = null;
    eState.botMazeLosBlockedAtEntry = !sightedStable;
    return true;
  };

  // NAV PLAN — the universal pathfinder (offline mirror of the shared one).
  // Ask the grid for a real walk route to the target; Maze follows it
  // waypoint by waypoint. Returns false when no walk route exists (target
  // on a jump-only platform, degenerate snap) — the heuristic stack
  // (scan / ramp-seek / wall-follow) remains the fallback.
  // FIRING-POSITION TRUNCATION — the raw path ends at the player's FEET.
  // Walk it (6-unit samples) and cut it at the first spot that already SEES
  // the player from inside the band's upper edge: the bot travels to a
  // FIRING POSITION, never to the player. Without this, a blind approach
  // rode the path until sight happened to open — often point-blank on
  // cover-heavy maps — before range discipline could act (the "runs at me
  // at match start" report). Nothing qualifies → keep the full path (some
  // fights genuinely require getting close before any sight exists).
  const truncateAtFiringPoint = (path) => {
    let prev = { x: e.x, z: e.z };
    for (let i = 0; i < path.length; i += 1) {
      const seg = path[i];
      const segLen = Math.hypot(seg.x - prev.x, seg.z - prev.z) || 1;
      const steps = Math.max(1, Math.ceil(segLen / 6));
      for (let s = 1; s <= steps; s += 1) {
        const px = prev.x + ((seg.x - prev.x) * s) / steps;
        const pz = prev.z + ((seg.z - prev.z) * s) / steps;
        if (Math.hypot(p.x - px, p.z - pz) > upperRange) continue;
        const fy = groundHeightAt(px, pz, 1000);
        if (botHasLineOfSight(
          { x: px, y: fy + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: pz },
          { x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z }
        )) {
          const cut = path.slice(0, i);
          cut.push({ x: px, z: pz });
          return cut;
        }
      }
      prev = seg;
    }
    return path;
  };
  const navPlan = () => {
    if (!offlineNavGrid) offlineNavGrid = buildNavGrid(arenaObstacles, arenaSurfaces);
    // FIRST CHOICE: walk to a FIRING POSITION — the nearest reachable spot
    // that already sees the target from inside the band. This is what makes
    // a sniper cross the map to a sniping lane instead of to the enemy.
    // FALLBACK: path to the target itself, cut at the first sighted sample
    // (some pockets have no in-band sight anywhere — then getting close is
    // genuinely the only option, and the exit gates take over from there).
    let path = findFiringPath(
      offlineNavGrid, e.x, e.z, myFloorY,
      p.x, p.z, p.y + BOT_LOS_EYE_HEIGHT,
      lowerRange, upperRange, arenaObstacles, oppFloorY
    );
    if (!path || path.length < 2) {
      path = findPathOnGrid(
        offlineNavGrid, e.x, e.z, p.x, p.z, myFloorY, oppFloorY, arenaObstacles
      );
      if (path && path.length > 1) path = truncateAtFiringPoint(path);
    }
    if (path && path.length > 1) {
      // idx 0: walk to the pinned start square first — beelining to square
      // #2 from an off-grid position can clip the corner between them.
      eState.botNav = {
        path, idx: 0, gx: p.x, gz: p.z, at: now
      };
      eState.botMazeLosBlockedAtEntry = !sightedStable;
      return true;
    }
    eState.botNav = null;
    return false;
  };

  // --- State transition by precedence ---
  const prevState = eState.botState ?? 'pursue';
  let nextState = prevState;
  const inDefenseGrace = prevState === 'defense' && now < (eState.botDefenseUntil ?? 0);

  if (underFire || inDefenseGrace) {
    nextState = 'defense';
  } else if (stuckTriggered || noProgressTime > 2000 || noLoSTime > 2000
      || (!sightedStable && !inBandDist && !walkTowardClear(Math.min(dist, 30)))) {
    // Wedged, spinning, stalled, or sightless for 2 s — commit to going
    // AROUND whatever is in the way. FAST LANE (4th condition): can't see
    // the target, too far to fight, AND the straight walk is blocked —
    // nothing to debounce, route NOW instead of beelining into a wall for
    // 2 s (the awkward approach at every match start). In-band sight
    // flickers (the cover peek-dance) still get the full 2 s buffer.
    nextState = 'maze';
  } else if (prevState === 'maze') {
    // Maze latches until the job is done: entered sightless, only reacquiring
    // sight releases it. Entered WITH sight (pillar graze), a short cap
    // releases it — else nothing ever would.
    // VIABILITY GATE: sight alone doesn't hand control back to Pursue —
    // either the fight starts here (in band → Engage, legitimate even
    // through a corridor window), or the walk TOWARD the player must be
    // clear for up to 50 units on the SAME floor. The old 20-unit probe
    // passed whenever the plateau was more than 20 away, releasing Maze
    // into a beeline that ground the plateau side 30 units later.
    const losReacquired = sightedStable && eState.botMazeLosBlockedAtEntry
      && (inBandDist
        || (walkTowardClear(Math.min(dist, 50))
          && Math.abs(oppFloorY - myFloorY) < 2.5));
    const visibleEntryDone = !eState.botMazeLosBlockedAtEntry
      && (now - (eState.botStateEnteredAt ?? now)) > 3000;
    if (losReacquired || visibleEntryDone) {
      nextState = inBandDist ? 'engage' : 'pursue';
    }
  } else if (inBandDist) {
    // (Reposition removed: its no-sight-in-band case is fully owned by the
    // 2 s Maze trigger above, which fires before its 3 s timer ever could.)
    nextState = 'engage';
  } else {
    nextState = 'pursue';
  }

  // Maze re-commit: a stuck signal mid-Maze, or 7 s on one heading, picks a
  // fresh tangent instead of exiting — Maze doesn't give up, it tries a
  // different way around.
  const escapeDue = eState.botMazeEscapeUntil != null && now >= eState.botMazeEscapeUntil;
  if (nextState === 'maze' && prevState === 'maze'
      && (stuckTriggered || escapeDue || (now - (eState.botStateEnteredAt ?? now)) > 7000)) {
    if (escapeDue) eState.botMazeEscapeUntil = null;
    eState.botStateEnteredAt = now;
    // ESCAPE-FIRST ON REPEAT WEDGES: note the waypoint the wedge alarm
    // caught us steering at. The pin/reach tests are zero-width lines, so
    // a corner pocket (Airport's ramp-top notch) passes them while the
    // unit-radius body stays pinched — the planner then re-issues the
    // identical line every 1.5 s forever. If the fresh plan below starts
    // by steering at that same waypoint, treat it as NO ROUTE: back out
    // along the escape heading for a beat, then replan from the freed spot.
    const navPrev = eState.botNav;
    const wedgedWp = stuckTriggered && navPrev ? navPrev.path[navPrev.idx] : null;
    // Pathfinder first: a stuck signal or 7 s refresh re-plans the route
    // from the CURRENT position. Only when no route exists does the
    // heuristic stack take over.
    let planned = navPlan();
    if (planned && wedgedWp) {
      const fresh = eState.botNav;
      // Apply the follower's own advance rule (skip waypoints within 3
      // units) to find the waypoint it would actually steer to.
      let fi = fresh.idx;
      while (fi < fresh.path.length - 1
          && Math.hypot(fresh.path[fi].x - e.x, fresh.path[fi].z - e.z) < 3) fi += 1;
      const firstWp = fresh.path[fi];
      if (Math.abs(firstWp.x - wedgedWp.x) < 0.5 && Math.abs(firstWp.z - wedgedWp.z) < 0.5) {
        eState.botNav = null;
        planned = false;
        eState.botMazeEscapeUntil = now + 800;
      }
    }
    if (planned) {
      // fresh path committed
    } else if (stuckTriggered) {
      // Stuck mid-Maze → escape re-commit (reverses when probes tie).
      commitMazeDirection(true);
    } else {
      // ROUTE-CHANGE PRIORITY: the ramp goes first when the fight needs a
      // different route — the target is on another floor, OR I can SEE the
      // player but can't WALK at them (the full-width Airport plateau
      // between two ground-floor fighters: sight passes over its 3.7 body,
      // feet don't). A reachable peephole is a consolation prize — scan-
      // first let it preempt the route every 7 s, shuttling the bot between
      // the peephole and the wall. Plain blind same-floor keeps scan-first
      // (Flashpoint rooms; Station falls through — no ramps there, the
      // perch reflex climbs instead).
      const needRoute = Math.abs(oppFloorY - myFloorY) > 2.5
        || (sightedStable && !inBandDist && !walkTowardClear(Math.min(dist, 50)));
      let committed = needRoute && mazeSeekElevationRoute(true);
      if (!committed) committed = mazeScanForOpening();
      if (!committed) {
        // Nothing seen, no ramp applies — re-aim toward the player (hand
        // dropped; keeping it lapped closed loops forever — the Flashpoint
        // spawn-room trap). The hand still rules corner turns WITHIN a leg.
        commitMazeDirection(false, false);
      }
    }
  }

  // --- State entry: commit per-state directions and timers ---
  if (nextState !== prevState) {
    eState.botState = nextState;
    eState.botStateEnteredAt = now;

    if (nextState === 'maze') {
      eState.botMazeWallTicks = 0;
      eState.botMazeEscapeUntil = null;
      // Pathfinder first; the heuristic commit is the no-route fallback.
      if (!navPlan()) commitMazeDirection();
    }

    if (nextState === 'engage'
        && (prevState === 'pursue' || prevState === 'maze' || prevState === 'defense' || eState.botOrbitSign == null)) {
      // Orbit direction by SIGHT PROBE, not coin flip: from ~12 units along
      // each orbit tangent, which way keeps the player visible? The blind
      // coin flip walked the bot out of hard-won sight windows half the
      // time (the plateau-edge pacing). Ties fall back to random.
      const losCw = losFromPoint(e.x + side.x * 12, e.z + side.z * 12);
      const losCcw = losFromPoint(e.x - side.x * 12, e.z - side.z * 12);
      if (losCw !== losCcw) eState.botOrbitSign = losCw ? 1 : -1;
      else eState.botOrbitSign = Math.random() > 0.5 ? 1 : -1;
    }

    if (nextState === 'defense') {
      // Commit a perpendicular-to-player sprint direction; flip away from the
      // nearest wall if we'd otherwise immediately drive into it.
      const sg = eState.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd = side.x * sg;
      let dzd = side.z * sg;
      if (obstacleNear && (dxd * (-avoid.rx) + dzd * (-avoid.rz) > 0.3)) {
        dxd = -dxd; dzd = -dzd;
      }
      eState.botDefenseDirX = dxd;
      eState.botDefenseDirZ = dzd;
      eState.botDefenseDirAt = now;
      // 350 ms for a normal hit; ≥600 ms while a sniper is mid-charge so the
      // sprint outlasts the glint window. Stuck-triggered runs 1.5 s to give
      // the strafe room to break the wedge.
      eState.botDefenseUntil = now + (stuckTriggered ? 1500 : (sniperCharging ? 600 : 350));
      eState.botDefenseInCover = false;
      eState.botDefenseCoverAt = 0;
      eState.botDefensePeekDone = false;
      eState.botDefenseStuckTicks = 0;
      eState.botDefenseFlips = 0;
      eState.botDefenseStuckMode = !!stuckTriggered;
      // Reset the stuck window — next check starts fresh after this entry.
      eState.botStuckCheckX = e.x;
      eState.botStuckCheckZ = e.z;
      eState.botStuckCheckAt = now;
      eState.botPathLen = 0;
    }
  }

  // Extend Defense duration while fire continues (keeps the bot evading until
  // the threat actually lets up, rather than committing exactly 350 ms).
  if (eState.botState === 'defense' && underFire) {
    // Hit during stuck-Defense → snap back to regular Defense: refresh the
    // strafe direction and clear cover/peek so it behaves as if this hit
    // had triggered Defense fresh.
    if (eState.botDefenseStuckMode) {
      const sg2 = eState.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd2 = side.x * sg2;
      let dzd2 = side.z * sg2;
      if (obstacleNear && (dxd2 * (-avoid.rx) + dzd2 * (-avoid.rz) > 0.3)) {
        dxd2 = -dxd2; dzd2 = -dzd2;
      }
      eState.botDefenseDirX = dxd2;
      eState.botDefenseDirZ = dzd2;
      eState.botDefenseDirAt = now;
      eState.botDefenseUntil = now + (sniperCharging ? 600 : 350);
      eState.botDefenseInCover = false;
      eState.botDefenseCoverAt = 0;
      eState.botDefensePeekDone = false;
      eState.botDefenseStuckTicks = 0;
      eState.botDefenseFlips = 0;
      eState.botDefenseStuckMode = false;
    }
    const minDur = sniperCharging ? 600 : 350;
    if ((eState.botDefenseUntil ?? 0) < now + minDur) {
      eState.botDefenseUntil = now + minDur;
    }
    // SUSTAINED-FIRE RE-ALIGN: under a continuous stream (fresh hits keep
    // Defense alive indefinitely) the once-picked perpendicular slowly
    // rotates into a stale TANGENT — a straight line that flies away from
    // the shooter forever. That was the "shorter the lock range, the harder
    // they flee" report: short-LR bots must close through the densest fire,
    // so their Defense chains never break and the tangent-flight runs long.
    // Re-perpendicularize at most every 400 ms so the bot CIRCLES the
    // shooter instead. Single-burst Defense (< 400 ms) is untouched.
    if (now - (eState.botDefenseDirAt ?? 0) > 400) {
      const sg3 = eState.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
      let dxd3 = side.x * sg3;
      let dzd3 = side.z * sg3;
      if (obstacleNear && (dxd3 * (-avoid.rx) + dzd3 * (-avoid.rz) > 0.3)) {
        dxd3 = -dxd3; dzd3 = -dzd3;
      }
      // RANGE-HOLD: sideways steps have an outward chord drift that
      // compounds over an endless hit chain (the shotgun bot slowly spiraled
      // to double its band and read as "backing off"). Bias the fresh
      // perpendicular with the same range pull Engage uses, so a suppressed
      // bot circle-strafes AT its band radius — closing while weaving when
      // it's too far, instead of drifting out forever.
      const pull3 = Math.max(-0.4, Math.min(0.4, (dist - optimalRange) * 0.12));
      dxd3 += dir.x * pull3;
      dzd3 += dir.z * pull3;
      const dl3 = Math.hypot(dxd3, dzd3) || 1;
      eState.botDefenseDirX = dxd3 / dl3;
      eState.botDefenseDirZ = dzd3 / dl3;
      eState.botDefenseDirAt = now;
    }
  }

  // --- State behavior: heading + sprint intent + optional jump ---
  let mx = 0, mz = 0;
  let wantSprint = false;
  let jumpThisTick = false;
  let jumpDirX = dir.x, jumpDirZ = dir.z;
  // Default to 'pursue' — botState is only ASSIGNED on a state CHANGE, so
  // it's undefined for the whole first stretch of a match; the raw read
  // matched no movement branch and the bot stood frozen until the
  // no-progress timer shoved it into maze (the 2 s statue at match start).
  const botS = eState.botState ?? 'pursue';

  if (botS === 'pursue') {
    // Pursue handles BOTH sides of the band: toward the player when too far,
    // AWAY from them when too close. Without the negative branch the bot just
    // keeps closing through lowerRange and collides at zero distance.
    const tooClose = dist < lowerRange;
    // Range discipline is unconditional outside Defense (the old LoS-gated
    // hold made the bot give up its range advantage to keep a peek — a
    // crutch for the pre-pathfinder Maze). If the retreat costs sight, the
    // 2 s no-LoS trigger hands off to Maze, which now PATHS back to a
    // firing position — kite out, return, fire, repeat.
    const dirSign = tooClose ? -1 : 1;
    let tx = dir.x * dirSign + avoid.rx * 0.8;
    let tz = dir.z * dirSign + avoid.rz * 0.8;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;
    // Occasional sprint with hysteresis. A boost reserve keeps at least one
    // good evade in the tank — Defense should never find the gauge empty.
    const reserveBoost = BOT_SPRINT_MIN_BOOST + 25;
    if (eState.boost >= BOT_SPRINT_READY_BOOST) eState.botPursueSprinting = true;
    if (eState.boost <= reserveBoost) eState.botPursueSprinting = false;
    wantSprint = !!eState.botPursueSprinting;
    // Elevation aids close the gap; skip them when we're trying to back off.
    if (!tooClose && state.enemy.grounded && !eState.airborne) {
      if (oppFloorY - myFloorY > BOT_JUMP_HEIGHT_DIFF && dist < 32 && Math.random() > 0.5) {
        if (botStartJump(now)) jumpThisTick = true;
      } else if (onHighGround) {
        const exit = findDescentDirection(e.x, e.z, myFloorY, dir.x, dir.z);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (botStartJump(now)) jumpThisTick = true;
        }
      } else {
        // Low ground: take any reachable platform — no "toward player" gate,
        // since on maps like Station the raised decks are the strong positions
        // and we'd rather be up there than on the tracks. The jump cooldown
        // rate-limits this; no strict random gate needed.
        const perch = findHighGroundPerch(e.x, e.z, myFloorY, BOT_PERCH_SEEK_RADIUS);
        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botStartJump(now)) jumpThisTick = true;
        }
      }
    }
  } else if (botS === 'maze') {
    // Committed tangent + a gentle pull toward the player (the Pursue-
    // flavored heart). The pull FADES OUT near walls (scaled by avoidance
    // strength) so it can't press the bot into concave corners; in the open —
    // i.e. right after the wall ends — it kicks back in and curls the bot
    // around the corner instead of letting it sprint on past the opening.
    // Context change: committed in the open, and a wall just interposed —
    // switch to wall-follow NOW instead of grinding into it.
    let nav = eState.botNav;
    // ARRIVED / NOTHING-TO-DO-HERE: sighted inside the sweet spot. A path
    // whose goal is meaningfully CLOSER to the player is an approach — done,
    // drop it. A pathless (heuristic) maze has nothing sane to do here
    // either — its stale committed direction charged straight through the
    // player during sighted-entry windows. Both cases: trip the sighted-
    // entry cap so the maze ENDS and Engage/Pursue own the fight. A
    // REPOSITION path (goal not closer — e.g. a sidestep to an unjammed
    // in-band cell) keeps running.
    // SAME FLOOR required: raw distance isn't arrival when there's a cliff
    // between — a player at the Station platform's edge read as "arrived"
    // from the tracks below, which dropped every climb path and ground the
    // bot into the edge wall forever.
    if (sightedStable && dist <= optimalRange
        && Math.abs(oppFloorY - myFloorY) < 2.5) {
      const goalWp = nav && nav.path[nav.path.length - 1];
      const goalCloser = goalWp
        && Math.hypot(p.x - goalWp.x, p.z - goalWp.z) < dist - 4;
      if (!nav || goalCloser) {
        if (nav) eState.botNav = null;
        nav = null;
        eState.botStateEnteredAt = now - 3001;
      }
    }
    // FINAL-WAYPOINT ARRIVAL: destination reached but the maze hasn't
    // exited yet (e.g. sighted-entry cap still counting). Drop the path
    // rather than stand on it — a standing bot re-arms the no-progress
    // trigger every 2 s, which keeps re-selecting maze and STARVES the
    // exit branch forever (the Plain Field never-orbits bug). The moving
    // heuristic fallback covers the remaining ticks until the exit fires.
    if (nav && nav.path.length > 0) {
      const lastWp = nav.path[nav.path.length - 1];
      if (Math.hypot(lastWp.x - e.x, lastWp.z - e.z) < 3) {
        eState.botNav = null;
        nav = null;
      }
    }
    if (nav && nav.path && nav.idx < nav.path.length) {
      // PATH FOLLOW — the universal pathfinder owns Maze whenever a route
      // exists. Head for the current waypoint, advance within 3 units, and
      // refresh the route (rate-limited) when the target wanders off the
      // planned goal. Avoidance stays blended in for dynamic wiggle room.
      let wp = nav.path[nav.idx];
      while (nav.idx < nav.path.length - 1
          && Math.hypot(wp.x - e.x, wp.z - e.z) < 3) {
        nav.idx += 1;
        wp = nav.path[nav.idx];
      }
      if (now - nav.at > 1000
          && Math.hypot(p.x - nav.gx, p.z - nav.gz) > 12) {
        navPlan();
        if (eState.botNav && eState.botNav.path[eState.botNav.idx]) {
          wp = eState.botNav.path[eState.botNav.idx];
        }
      }
      // JUMP-LINK crossing: the upcoming waypoint sits on a ledge above the
      // bot's floor (the path bridged a walk-island, e.g. Station's
      // platforms) — vault toward it once close enough. Downward crossings
      // need nothing: the bot just walks off the ledge.
      if (wp.y != null && wp.y - myFloorY > 1.7
          && state.enemy.grounded && !eState.airborne
          && Math.hypot(wp.x - e.x, wp.z - e.z) < 7) {
        const jdx = wp.x - e.x, jdz = wp.z - e.z;
        const jln = Math.hypot(jdx, jdz) || 1;
        jumpDirX = jdx / jln;
        jumpDirZ = jdz / jln;
        if (botStartJump(now)) jumpThisTick = true;
      }
      let tx = wp.x - e.x, tz = wp.z - e.z;
      const wl = Math.hypot(tx, tz) || 1;
      tx = tx / wl + avoid.rx * 0.3;
      tz = tz / wl + avoid.rz * 0.3;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      // JUMP RESERVE: an upcoming jump-link costs 48 boost, but maze's
      // permanent sprint pins the gauge at the ~8 floor — the bot arrived
      // at the ledge eternally unable to afford the hop (the "never jumps
      // onto Station's platform" bug). Walk and bank while a jump is ahead
      // and unaffordable; sprint resumes once the jump is funded.
      let jumpAhead = false;
      for (let k = nav.idx; k < nav.path.length; k += 1) {
        if ((nav.path[k].y ?? 0) - myFloorY > 1.7) { jumpAhead = true; break; }
      }
      const jumpCost = (state.enemy.unit.jumpBoostCost ?? JUMP_BOOST_COST) + 10;
      wantSprint = !(jumpAhead && eState.boost < jumpCost);
    } else {
      // HEURISTIC FALLBACK (no route exists): committed tangent + a gentle
      // pull toward the player, wall-follow corner turns — the pre-
      // pathfinder Maze, kept for jump-only targets and degenerate spots.
      if (eState.botMazeHadWall === false && obstacleNear) commitMazeDirection();
      // CORNER TURN: the committed wall-follow ran into a NEW wall face
      // (concave corner). Same 2-tick wall-press read Defense uses —
      // re-commit HERE (~0.03 s) preserving the going-around hand.
      const mazeIntoWall = avoidMag > 0.4
        && ((eState.botMazeDirX ?? 0) * avoid.rx + (eState.botMazeDirZ ?? 0) * avoid.rz) < -0.4;
      if (mazeIntoWall) {
        eState.botMazeWallTicks = (eState.botMazeWallTicks ?? 0) + 1;
      } else {
        eState.botMazeWallTicks = 0;
      }
      if (eState.botMazeWallTicks >= 2) {
        eState.botMazeWallTicks = 0;
        commitMazeDirection(false, true);
      }
      const mazePull = 0.4 * Math.max(0, 1 - avoidMag);
      let tx = (eState.botMazeDirX ?? side.x) + dir.x * mazePull + avoid.rx * 0.3;
      let tz = (eState.botMazeDirZ ?? side.z) + dir.z * mazePull + avoid.rz * 0.3;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      wantSprint = true;
    }
    // Vertical Maze: hop up onto a reachable platform (Station).
    if (state.enemy.grounded && !eState.airborne) {
      const perch = findHighGroundPerch(e.x, e.z, myFloorY, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botStartJump(now)) jumpThisTick = true;
      }
    }
  } else if (botS === 'engage') {
    // Mid-orbit sight keeping: if the next ~12 units along the orbit lose
    // sight while the other way keeps it, flip once (1 s cooldown so
    // opposing probes can't jitter it). Engage patrols INSIDE the sight
    // window it was handed instead of blindly strolling out of it.
    if (sightedStable && now >= (eState.botOrbitFlipAt ?? 0)
        && now >= (eState.botOrbitHoldUntil ?? 0)) {
      const sgn = eState.botOrbitSign ?? 1;
      if (!losFromPoint(e.x + side.x * sgn * 12, e.z + side.z * sgn * 12)
          && losFromPoint(e.x - side.x * sgn * 12, e.z - side.z * sgn * 12)) {
        // DOUBLE FLIP = BOUNDED WINDOW: flipping BACK within 2.5 s means the
        // orbit is pacing wall-to-wall inside a bounded sight window (arch
        // gaps, alley mouths) — a metronome wiper, the back-and-forth
        // sighting. HOLD instead: stand on the window and fight (damp
        // below; solid because sightedStable can't flicker). A single flip
        // within 10 s of a hold re-arms it directly, so between holds the
        // bot creeps one leg at most instead of lapping. Sight truly lost →
        // damp lifts and the 2 s no-sight clock commits the Maze approach.
        const pairFlip = eState.botOrbitFlipLastAt != null && now - eState.botOrbitFlipLastAt < 2500;
        const recentHold = eState.botOrbitHoldLastAt != null && now - eState.botOrbitHoldLastAt < 10000;
        if (pairFlip || recentHold) {
          eState.botOrbitHoldUntil = now + 4000;
          eState.botOrbitHoldLastAt = now;
          eState.botOrbitFlipLastAt = null;
        } else {
          eState.botOrbitSign = -sgn;
          eState.botOrbitFlipAt = now + 1000;
          eState.botOrbitFlipLastAt = now;
        }
      }
    }
    const sign = eState.botOrbitSign ?? 1;
    // Full-strength range correction — the sweet spot always wins outside
    // Defense (the LoS gate that froze the outward drift is gone; Maze
    // paths back to a firing position if spacing ever costs sight).
    const pull = Math.max(-0.5, Math.min(0.5, (dist - optimalRange) * 0.12));
    let tx = side.x * sign + dir.x * pull + avoid.rx * 0.6;
    let tz = side.z * sign + dir.z * pull + avoid.rz * 0.6;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;
    // BOUNDED-WINDOW HOLD (armed by the double-flip detector above): stand
    // and fight while the window works. sightedStable can't flicker, so the
    // damp holds solidly; sight lost or band left → it lifts and the normal
    // state machine takes over.
    if (now < (eState.botOrbitHoldUntil ?? 0) && sightedStable && inBandDist) {
      mx *= 0.1; mz *= 0.1;
    }

    // On low ground? Hop onto any reachable platform — high ground is the
    // better engagement / vantage spot on Station-like maps. Doesn't override
    // the orbit (just adds a jump when the chance is there); the jump cooldown
    // limits how often this fires.
    if (state.enemy.grounded && !eState.airborne && !onHighGround) {
      const perch = findHighGroundPerch(e.x, e.z, myFloorY, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.3) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botStartJump(now)) jumpThisTick = true;
      }
    }

    if (botS === 'engage') {
      // Peek-cover: while behind cover (obstacle near + line blocked) AND not
      // yet ready to fire, tuck (slow the orbit way down). The instant the
      // weapon is ready, the orbit resumes and naturally peeks out — fires —
      // continues. That's the peek-cover loop, tied to the weapon's cadence.
      if (obstacleNear && !playerHasLoS && now < eState.nextFireAt) {
        mx *= 0.15; mz *= 0.15;
      }
      wantSprint = false; // walk in engage — conserve boost
    } else {
      // Reposition — sprint along the orbit to break to a new vantage.
      wantSprint = true;
    }
  } else if (botS === 'defense') {
    // Committed perpendicular sprint.
    mx = eState.botDefenseDirX ?? side.x;
    mz = eState.botDefenseDirZ ?? side.z;
    wantSprint = true;

    // Did this evade just run us into cover?
    if (!eState.botDefenseInCover && obstacleNear && !playerHasLoS) {
      eState.botDefenseInCover = true;
      eState.botDefenseCoverAt = now;
      eState.botDefensePeekDone = false;
    }

    if (eState.botDefenseInCover) {
      // Single peek-cover loop, then exit Defense.
      const sinceCover = now - (eState.botDefenseCoverAt ?? now);
      if (sinceCover < 300) {
        mx *= 0.1; mz *= 0.1;
        wantSprint = false;
      } else if (!eState.botDefensePeekDone) {
        // One peek toward the player.
        mx = dir.x; mz = dir.z;
        wantSprint = false;
        if ((now >= eState.nextFireAt && playerHasLoS) || sinceCover > 1000) {
          eState.botDefensePeekDone = true;
        }
      } else {
        eState.botDefenseUntil = now;
        eState.botDefenseInCover = false;
      }
    } else {
      // Defense's wall read must be FAST — under fire there's no time for the
      // 2 s Maze trigger. Drive straight into a wall for ~2 ticks and we hand
      // off to Maze immediately (force the trigger by ageing the progress
      // timer).
      const intoWall = (mx * avoid.rx + mz * avoid.rz) < -0.4;
      if (intoWall && avoidMag > 0.4) {
        eState.botDefenseStuckTicks = (eState.botDefenseStuckTicks ?? 0) + 1;
      } else {
        eState.botDefenseStuckTicks = 0;
      }
      if (eState.botDefenseStuckTicks >= 2) {
        // VAULT FIRST: if the "wall" being pressed is actually a jumpable
        // ledge (walkable top 1.7–4.8 above, lip unfenced — the same perch
        // check used elsewhere, so Airport's rim glass still rejects it)
        // roughly along the committed escape line, jump ONTO it and keep
        // sprinting the same direction up top: the dodge continues with an
        // elevation change instead of a turn. Jump unaffordable (boost /
        // cooldown) or no ledge → the usual flip → slide → bail chain.
        let vaulted = false;
        if (state.enemy.grounded && !eState.airborne) {
          const ledge = findHighGroundPerch(e.x, e.z, myFloorY, 6);
          if (ledge && ledge.dist < BOT_LEDGE_JUMP_REACH
              && ledge.toX * (eState.botDefenseDirX ?? side.x) + ledge.toZ * (eState.botDefenseDirZ ?? side.z) > 0.3) {
            jumpDirX = ledge.toX;
            jumpDirZ = ledge.toZ;
            if (botStartJump(now)) {
              jumpThisTick = true;
              vaulted = true;
              eState.botDefenseStuckTicks = 0;
            }
          }
        }
        if (vaulted) {
          // committed direction kept — the sprint resumes on the ledge
        } else {
        // Wedged mid-escape (~2 ticks of zero lateral motion pressing a
        // wall). The old response — end Defense and hand off to Maze — never
        // won under sustained fire: "under fire" re-asserted Defense every
        // tick with the SAME direction still pointed into the wall, so the
        // bot stood there getting farmed. Recover IN PLACE instead:
        //   1st wedge → the OTHER perpendicular (equally across the aim
        //               line, and away from the wall just hit by construction);
        //   2nd wedge → slide along the wall (concave corner / corridor);
        //   after that → the old bail-to-Maze as a last resort.
        const flips = eState.botDefenseFlips ?? 0;
        if (flips === 0) {
          eState.botDefenseDirX = -(eState.botDefenseDirX ?? side.x);
          eState.botDefenseDirZ = -(eState.botDefenseDirZ ?? side.z);
          eState.botDefenseDirAt = now;
          eState.botDefenseFlips = 1;
          eState.botDefenseStuckTicks = 0;
        } else if (flips === 1) {
          const am = avoidMag || 1;
          let tx2 = -avoid.rz / am, tz2 = avoid.rx / am;
          if (tx2 * (eState.botDefenseDirX ?? side.x) + tz2 * (eState.botDefenseDirZ ?? side.z) < 0) {
            tx2 = -tx2; tz2 = -tz2;
          }
          eState.botDefenseDirX = tx2;
          eState.botDefenseDirZ = tz2;
          eState.botDefenseDirAt = now;
          eState.botDefenseFlips = 2;
          eState.botDefenseStuckTicks = 0;
        } else {
          eState.botLastProgressAt = now - 2001;
          eState.botDefenseUntil = now;
        }
        }
      }
    }
  }

  // === Velocity dispatch — drives the heading and sprint intent produced by
  // the active state into the body's velocity. Mid-jump airborne ticks hold
  // the launch aim so the arc lands where it was committed.
  const botSprintBase = state.enemy.unit.sprintSpeed ?? BOOST_MOVE_SPEED;
  const botWalkSpeed = state.enemy.unit.walkSpeed ?? WALK_SPEED;
  const botCanSprint = eState.boost >= BOT_SPRINT_MIN_BOOST && now >= eState.emptyRecoverUntil;

  if (jumpThisTick) {
    eState.botAirSteerX = jumpDirX;
    eState.botAirSteerZ = jumpDirZ;
    eState.botAirSteerUntil = now + BOT_AIR_STEER_MS;
    state.enemy.body.velocity.x = jumpDirX * botSprintBase;
    state.enemy.body.velocity.z = jumpDirZ * botSprintBase;
    eState.action = 'jump';
  } else if (eState.airborne && (eState.botAirSteerUntil ?? 0) > now) {
    const ax = eState.botAirSteerX ?? mx;
    const az = eState.botAirSteerZ ?? mz;
    state.enemy.body.velocity.x = ax * botSprintBase;
    state.enemy.body.velocity.z = az * botSprintBase;
    eState.action = 'dash';
  } else if (wantSprint && botCanSprint) {
    state.enemy.body.velocity.x = mx * botSprintBase;
    state.enemy.body.velocity.z = mz * botSprintBase;
    inheritMomentum(state.enemy, MOMENTUM_STANDARD * 1.5);
    eState.action = 'dash';
  } else {
    state.enemy.body.velocity.x = mx * botWalkSpeed;
    state.enemy.body.velocity.z = mz * botWalkSpeed;
    if (Math.abs(state.enemy.body.velocity.x) + Math.abs(state.enemy.body.velocity.z) < 0.08) {
      state.enemy.body.velocity.x = side.x * 4.5;
      state.enemy.body.velocity.z = side.z * 4.5;
    }
    eState.action = 'idle';
  }

  if (dist > 14 && Math.random() > 0.9) eState.evadeHomingUntil = now + 90;

  // --- Firing: LoS-aware + universal burst sizing ---
  // Skip firing entirely if line of sight is blocked — there's no point
  // dumping rounds into a wall. The bot keeps repositioning (via the
  // avoidance + kiting movement above) until the shot is clear.
  if (now >= eState.nextFireAt) {
    const u = state.enemy.unit;
    const s = eState;
    if (now < s.invulnerableUntil) {
      // Spawn immunity — no shot can land yet, so hold fire until it lapses.
      s.nextFireAt = s.invulnerableUntil;
      s.machineBurstRemaining = 0;
    } else if (u.magCapacity != null && s.ammo <= 0) {
      const wait = u.autoReload
        ? u.reloadMs
        : Math.max(120, (s.reloadingUntil || now + u.reloadMs) - now);
      s.nextFireAt = now + wait;
      s.machineBurstRemaining = 0;
    } else if (!botHasLineOfSight(
      { x: e.x, y: e.y + BOT_LOS_EYE_HEIGHT, z: e.z },
      { x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z }
    )) {
      // No clear shot — hold fire and check again shortly.
      s.nextFireAt = now + 220;
      s.machineBurstRemaining = 0;
    } else if (u.sniperCharge) {
      const fired = attemptFire(state.enemy, state.player, now);
      if (fired) {
        // Sniper release timing. Kei (beam): 70% quick at the floor / 30% holds
        // to full charge (the sweep channel). Other snipers: 90% floor / 10%
        // random point in the cancel window.
        s.sniperChargeUntil = now + (u.beam
          ? (Math.random() < 0.7 ? SNIPER_CANCEL_MIN_CHARGE_MS : (u.chargeMs ?? 1000))
          : (Math.random() < 0.9 ? SNIPER_CANCEL_MIN_CHARGE_MS : PhaserLikeBetween(SNIPER_CANCEL_MIN_CHARGE_MS, u.chargeMs ?? 1000)));
        s.nextFireAt = now + u.fireCooldownMs + PhaserLikeBetween(400, 1200);
      } else s.nextFireAt = now + 220;
      s.machineBurstRemaining = 0;
    } else {
      // Universal burst: derive length from magCapacity so different weapons
      // (5-round mag, 30-round MG, future 100-round LMG) all feel right.
      if (u.spreadCount === 1 && s.machineBurstRemaining <= 0) {
        s.machineBurstRemaining = botBurstSize(u);
      }
      const firedAt = s.lastFireAt;
      attemptFire(state.enemy, state.player, now);
      const fired = s.lastFireAt !== firedAt;
      if (u.spreadCount === 1) {
        if (fired) s.machineBurstRemaining -= 1;
        // Intra-burst cadence ties to the unit's actual fireCooldownMs — tune
        // firePerMinute and the bot's DPS scales with it. Inter-burst pause
        // is short (0.8-1.5 s) so the bot keeps sustained pressure on like a
        // real MG user would.
        s.nextFireAt = s.machineBurstRemaining > 0
          ? now + u.fireCooldownMs
          : now + PhaserLikeBetween(800, 1500);
        if (s.machineBurstRemaining <= 0) s.machineBurstRemaining = 0;
      } else {
        // Multi-pellet (shotgun-style) pacing — pace shots near the weapon's
        // mechanical fire cooldown so the bot uses its full per-shot DPS
        // instead of dawdling 1+ s between shots. Small jitter avoids a
        // perfectly robotic cadence; the magazine + autoReload still impose
        // a natural burst rhythm without the AI gating on top.
        if (fired) s.nextFireAt = now + u.fireCooldownMs + PhaserLikeBetween(40, 220);
        else s.nextFireAt = now + 120;
      }
    }
  }
  if (state.enemy.grounded && now > state.enemy.state.hoverUntil && state.enemy.state.action !== 'jump') {
    state.enemy.body.velocity.y = 0;
  }
  applyMomentum(state.enemy);
  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing. Apply the same scale to the bot AFTER momentum so sprint +
  // momentum scale together, matching the player's velocity exactly.
  if (now < eState.hitStunUntil) {
    state.enemy.body.velocity.x *= eState.hitStunScale;
    state.enemy.body.velocity.z *= eState.hitStunScale;
  }
  updateBoost(state.enemy, now, state.enemy.state.action);
}

// How long the reticle stays red after each enemy shot. Re-armed on every
// shot, so sustained fire holds it red and a lone shot flashes briefly.
const RETICLE_FIRING_FLASH_MS = 200;

// White spawn-protection glow — a soft radial-gradient sprite (additive) that
// covers the mech modestly, adapted from the reference project's buff aura.
// Attached to mech.root so it follows the unit and reads from any camera angle.
function createImmunityAuraForMech(mech) {
  if (!mech || mech.immunityAura) return;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  // Soft white fill that covers the unit modestly — brightest over the body,
  // fading to transparent at the edge. Kept low so it reads as a gentle glow
  // rather than a wash that hides the model's colors.
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.13)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  x.fillStyle = grad;
  x.beginPath();
  x.arc(64, 64, 64, 0, Math.PI * 2);
  x.fill();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  }));
  // Upright ellipse roughly matching the mech's silhouette, centered on its
  // mid-height so the glow covers the whole body and fades out around it.
  sprite.scale.set(5.5, 9, 1);
  sprite.position.set(0, -0.4, 0);
  // Below the reticle/glint render order (9999) so they sit on top of the aura.
  sprite.renderOrder = 9000;
  mech.root.add(sprite);
  mech.immunityAura = sprite;
}

function removeImmunityAuraFromMech(mech) {
  if (!mech?.immunityAura) return;
  mech.root.remove(mech.immunityAura);
  if (mech.immunityAura.material) {
    if (mech.immunityAura.material.map) mech.immunityAura.material.map.dispose();
    mech.immunityAura.material.dispose();
  }
  mech.immunityAura = null;
}

// Show the glow while spawn-protected, drop it when immunity ends. The
// create/remove guards make this safe to call every frame.
function applyImmunityGlow(mech, immune) {
  if (!mech || !mech.root) return;
  if (immune) createImmunityAuraForMech(mech);
  else removeImmunityAuraFromMech(mech);
}

function updateLocksAndReticle() {
  const nowMs = performance.now();
  // When the player is dead, hide the reticle entirely (spectating ally) —
  // it'd otherwise hover on whatever lock target the player had at death,
  // which doesn't reflect the ally's combat.
  if (state.player.state.hp <= 0) {
    if (state.reticle) state.reticle.visible = false;
    return;
  }
  if (state.reticle) state.reticle.visible = true;
  // Reticle / lock evaluation is always against the player's CURRENT target,
  // not necessarily state.enemy. In 2v2 the player can flip between enemies
  // with the target switch button.
  const tgt = state.playerCurrentTarget ?? state.enemy;
  const dist = state.player.root.position.distanceTo(tgt.root.position);
  state.player.state.redLock = dist <= state.player.unit.lockRange;
  // Enemy bots compute their own redLock against their own targets via the AI
  // loop's runBotAIForMech swap; here we only refresh the primary enemy's
  // redLock against the player (1v1 parity, harmless in 2v2).
  state.enemy.state.redLock = state.player.root.position.distanceTo(state.enemy.root.position) <= state.enemy.unit.lockRange;

  // Reticle is GREEN by default and turns RED only while the current target is
  // firing. lastFireAt is monotonic so we detect any forward jump.
  const enemyFireAt = tgt.state.lastFireAt;
  if (state.reticleLastEnemyFireAt != null && enemyFireAt > state.reticleLastEnemyFireAt) {
    state.reticleEnemyFiringUntil = nowMs + RETICLE_FIRING_FLASH_MS;
  }
  state.reticleLastEnemyFireAt = enemyFireAt;
  const enemyFiring = nowMs < state.reticleEnemyFiringUntil;

  // Sniper charge warning: RED while the lock target (Aru or Kei) is mid-charge
  // with ME as the charge target — a continuous danger signal from glint to
  // shot. Offline stores the target as a mech ref; online mirrors { id }.
  const chargeTgt = tgt.state.sniperChargeTarget;
  const chargingAtMe = !!chargeTgt && (state.online
    ? chargeTgt.id === state.online.myPlayerId
    : chargeTgt === state.player);

  // Kei's charged sweep channel: stay red for the channel's WHOLE duration —
  // the beam sweeps and can hit anyone, so no "at me" filter. Returns to green
  // the moment a sprint-cancel (or expiry) ends it: chargedBeamVisual is
  // non-null exactly while the channel is live in both modes (offline
  // start/endChargedBeam, online syncOnlineChargedBeams).
  const sweepChannelActive = !!tgt.chargedBeamVisual;

  // Range-tier reticle (Aru's rangeDamage zones). Applies when I am Aru
  // (my damage tier on the target) or my lock target is an Aru (which of HER
  // zones I'm standing in) — same distance either way. XZ distance, matching
  // the fire-time damage tier calc.
  const rd = state.player.unit?.rangeDamage ?? tgt.unit?.rangeDamage;
  const tex = getReticleTierTextures();
  let tierTex = tex.base;
  if (rd) {
    const distXZ = Math.hypot(tgt.root.position.x - state.player.root.position.x, tgt.root.position.z - state.player.root.position.z);
    tierTex = distXZ >= rd.midDist ? tex.far : distXZ >= rd.nearDist ? tex.mid : tex.base;
  }
  if (state.reticle.material.map !== tierTex) {
    state.reticle.material.map = tierTex;
    state.reticle.material.needsUpdate = true;
  }

  state.reticle.position.set(0, 0.2, 0);
  state.reticle.material.color.set((enemyFiring || chargingAtMe || sweepChannelActive) ? 0xff5f72 : 0x7effbd);
  const camDist = camera.position.distanceTo(tgt.root.position);
  const distScale = THREE.MathUtils.clamp(camDist / 22, 0.7, 4.5);
  // 1.5× the old 6.1 — larger canvas, same on-screen bracket size.
  state.reticle.scale.setScalar(9.15 * distScale);
  state.reticle.quaternion.copy(camera.quaternion);
}

// Lazily build the screen-edge direction arrow (a DOM overlay). Kept on
// document.body rather than the HUD so it survives HUD rebuilds; pointer-events
// off so it never eats touches. Mint chevron + dark outline to match the
// in-world marker.
function ensureAllyEdgeArrow() {
  if (state.allyEdgeArrow && state.allyEdgeArrow.isConnected) return state.allyEdgeArrow;
  const el = document.createElement('div');
  el.id = 'ally-edge-arrow';
  el.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'width:34px', 'height:34px',
    'pointer-events:none', 'z-index:35', 'display:none', 'will-change:transform',
    'filter:drop-shadow(0 0 3px rgba(0,0,0,0.55))'
  ].join(';');
  // Glint halo (hidden by default): pulses while the teammate sniper is
  // mid-charge, using their own glint art (set per-frame in updateAllyArrow).
  el.innerHTML = '<div data-glint style="position:absolute; left:-12px; top:-12px; width:58px; height:58px;'
    + 'background-position:center; background-repeat:no-repeat; background-size:contain;'
    + 'display:none;"></div>'
    + '<svg viewBox="0 0 32 32" width="100%" height="100%" style="position:relative;">'
    + '<path d="M16 3 L28 27 L16 21 L4 27 Z" fill="#86f7c2" stroke="#0b1622" '
    + 'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  document.body.appendChild(el);
  state.allyEdgeArrow = el;
  return el;
}

function hideAllyEdgeArrow() {
  if (state.allyEdgeArrow) state.allyEdgeArrow.style.display = 'none';
}

// Enemy counterpart to the ally edge arrow — same overlay, red-orange fill so
// it reads as a threat. Points toward the not-locked enemy when it's off-frame.
function ensureEnemyEdgeArrow() {
  if (state.enemyEdgeArrow && state.enemyEdgeArrow.isConnected) return state.enemyEdgeArrow;
  const el = document.createElement('div');
  el.id = 'enemy-edge-arrow';
  el.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'width:34px', 'height:34px',
    'pointer-events:none', 'z-index:35', 'display:none', 'will-change:transform',
    'filter:drop-shadow(0 0 3px rgba(0,0,0,0.55))'
  ].join(';');
  // Glint halo (hidden by default): pulses while the tracked enemy is a
  // sniper mid-charge — the off-screen telegraph. Uses the unit's own glint
  // art (set per-frame in updateEnemyArrow). Overlaps the chevron by design.
  el.innerHTML = '<div data-glint style="position:absolute; left:-12px; top:-12px; width:58px; height:58px;'
    + 'background-position:center; background-repeat:no-repeat; background-size:contain;'
    + 'display:none;"></div>'
    + '<svg viewBox="0 0 32 32" width="100%" height="100%" style="position:relative;">'
    + '<path d="M16 3 L28 27 L16 21 L4 27 Z" fill="#ff6a2c" stroke="#0b1622" '
    + 'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  document.body.appendChild(el);
  state.enemyEdgeArrow = el;
  return el;
}

// Edge-arrow glints reuse the EXACT in-world glint art via drawGlintCanvas —
// Aru's white flash for Aru, Kei's shard glint for Kei. Data-URLs are built
// once per variant and shared. (Edge indicator only — the floating chevron
// above the unit's head carries no glint.)
const _arrowGlintUrl = { std: null, beam: null };
function getArrowGlintUrl(isBeam) {
  const key = isBeam ? 'beam' : 'std';
  if (!_arrowGlintUrl[key]) _arrowGlintUrl[key] = drawGlintCanvas(isBeam).toDataURL();
  return _arrowGlintUrl[key];
}

function hideEnemyEdgeArrow() {
  if (state.enemyEdgeArrow) state.enemyEdgeArrow.style.display = 'none';
}

// Friendly-unit indicator, refreshed once per frame from both the offline and
// online render paths. Two complementary pieces:
//   1. state.allyArrow     — a 3D chevron floating above the teammate; only
//      visible while they're actually inside the camera frustum.
//   2. state.allyEdgeArrow — a DOM arrow pinned to the screen edge that points
//      toward the teammate whenever they're OUT OF FRAME (off to the side or
//      behind the camera), so the player always knows which way to look.
const _allyArrowNdc = new THREE.Vector3();
const _allyArrowCam = new THREE.Vector3();
function updateAllyArrow() {
  const ally = state.ally;
  const active = state.mode === '2v2' && !!ally && ally.state.hp > 0;

  // Teammate sniper wind-up: the ally's arrow carries a glint while they're
  // mid-charge (or Kei mid-sweep) — using the teammate's OWN glint art.
  const allyGlint = active
    && (!!ally.state.sniperChargeTarget || !!ally.chargedBeamVisual);
  const allyGlintBeam = active && !!ally.unit?.beam;

  // --- 1. In-world floating chevron (self-culls when off-frustum). ---
  const arrow = state.allyArrow;
  if (arrow) {
    if (!active) {
      arrow.visible = false;
    } else {
      arrow.visible = true;
      const bob = Math.sin(performance.now() * 0.004) * 0.18;
      arrow.position.set(0, 4.6 + bob, 0);
      const camDist = camera.position.distanceTo(ally.root.position);
      const distScale = THREE.MathUtils.clamp(camDist / 26, 0.85, 4.0);
      arrow.scale.setScalar(2.55 * distScale);
    }
  }

  // --- 2. Screen-edge direction arrow (off-frame case). ---
  if (!active) { hideAllyEdgeArrow(); return; }
  const edge = ensureAllyEdgeArrow();

  // updateCamera() set camera.position/quaternion fresh this frame, but the
  // world matrices aren't recomposed until render — refresh them here so the
  // projection below reflects the current camera.
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  // Anchor on the teammate's torso (not the higher chevron) so the on/off
  // screen decision matches where the player perceives the unit.
  _allyArrowNdc.set(ally.root.position.x, ally.root.position.y + 2.0, ally.root.position.z);
  const camZ = _allyArrowCam.copy(_allyArrowNdc).applyMatrix4(camera.matrixWorldInverse).z;
  const inFront = camZ < 0;        // camera looks down -z in its own space
  _allyArrowNdc.project(camera);   // -> NDC; x,y in [-1,1] means on screen
  const onScreen = inFront
    && Math.abs(_allyArrowNdc.x) <= 1
    && Math.abs(_allyArrowNdc.y) <= 1;

  if (onScreen) { edge.style.display = 'none'; return; }

  // Direction toward the teammate in NDC (y up). project() mirrors points that
  // sit behind the camera, so flip those back to the true bearing.
  let dx = _allyArrowNdc.x;
  let dy = _allyArrowNdc.y;
  if (!inFront) { dx = -dx; dy = -dy; }
  if (dx === 0 && dy === 0) dy = -1;

  // Slide that direction onto an inset screen rectangle (touch the nearest edge).
  const inset = 0.82;
  const k = inset / Math.max(Math.abs(dx), Math.abs(dy));
  const ex = dx * k;
  const ey = dy * k;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  const sx = (ex * 0.5 + 0.5) * w;
  const sy = (-ey * 0.5 + 0.5) * h;   // NDC y up -> screen y down

  // Glyph points up by default; rotate to face the teammate. Screen y is down,
  // so the screen-space bearing is (dx, -dy) and +90° aligns "up" onto it.
  const rot = Math.atan2(-dy, dx) + Math.PI / 2;

  edge.style.display = 'block';
  edge.style.left = `${sx}px`;
  edge.style.top = `${sy}px`;
  edge.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
  // Glint on the edge arrow while the teammate sniper is mid-charge —
  // their own glint art, shown as-is, no animation.
  const halo = edge.firstElementChild;
  if (halo && halo.hasAttribute('data-glint')) {
    halo.style.display = allyGlint ? 'block' : 'none';
    if (allyGlint) {
      const variant = allyGlintBeam ? 'beam' : 'std';
      if (halo.dataset.variant !== variant) {
        halo.dataset.variant = variant;
        halo.style.backgroundImage = `url(${getArrowGlintUrl(allyGlintBeam)})`;
      }
    }
  }
}

// The enemy that ISN'T currently locked, in 2v2 — the live one of the two that
// the player's reticle is not on. Used to mark the "other" threat (the locked
// one already wears the green reticle). Returns null in 1v1 or if none qualify.
function getUnlockedEnemy() {
  if (state.mode !== '2v2') return null;
  const locked = state.playerCurrentTarget;
  for (const e of [state.enemy, state.enemy2]) {
    if (e && e.state.hp > 0 && e !== locked) return e;
  }
  return null;
}

// Enemy counterpart to the friendly indicator (2v2 only), refreshed each frame.
// Mirrors updateAllyArrow but rides the NOT-locked enemy and reads red-orange:
//   1. state.enemyArrow     — a 3D chevron above that enemy, in-frustum only.
//   2. state.enemyEdgeArrow — a screen-edge arrow pointing at it when off-frame.
const _enemyArrowNdc = new THREE.Vector3();
const _enemyArrowCam = new THREE.Vector3();
function updateEnemyArrow() {
  const foe = getUnlockedEnemy();
  const active = !!foe;

  // Sniper-charge glint on the arrow: shows whenever the tracked (unlocked)
  // enemy is a sniper mid-charge or Kei mid-sweep — using that unit's OWN
  // glint art (Aru's flash for Aru, Kei's shard glint for Kei). Keeps the
  // blind-side wind-up visible while the camera and lock are busy elsewhere.
  const arrowGlint = active
    && (!!foe.state.sniperChargeTarget || !!foe.chargedBeamVisual);
  const foeGlintBeam = active && !!foe.unit?.beam;

  // --- 1. In-world floating chevron (self-culls when off-frustum). ---
  const arrow = state.enemyArrow;
  if (arrow) {
    if (!active) {
      arrow.visible = false;
    } else {
      // The lock can be switched mid-match, so ride whichever enemy is unlocked.
      if (arrow.parent !== foe.root) foe.root.add(arrow);
      arrow.visible = true;
      const bob = Math.sin(performance.now() * 0.004) * 0.18;
      arrow.position.set(0, 4.6 + bob, 0);
      const camDist = camera.position.distanceTo(foe.root.position);
      const distScale = THREE.MathUtils.clamp(camDist / 26, 0.85, 4.0);
      arrow.scale.setScalar(2.55 * distScale);
    }
  }

  // --- 2. Screen-edge direction arrow (off-frame case). ---
  if (!active) { hideEnemyEdgeArrow(); return; }
  const edge = ensureEnemyEdgeArrow();

  // Refresh the composed camera matrices before projecting (updateCamera() only
  // set position/quaternion this frame).
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  // Anchor on the enemy's torso so the on/off-screen decision matches where the
  // player perceives the unit.
  _enemyArrowNdc.set(foe.root.position.x, foe.root.position.y + 2.0, foe.root.position.z);
  const camZ = _enemyArrowCam.copy(_enemyArrowNdc).applyMatrix4(camera.matrixWorldInverse).z;
  const inFront = camZ < 0;        // camera looks down -z in its own space
  _enemyArrowNdc.project(camera);  // -> NDC; x,y in [-1,1] means on screen
  const onScreen = inFront
    && Math.abs(_enemyArrowNdc.x) <= 1
    && Math.abs(_enemyArrowNdc.y) <= 1;

  if (onScreen) { edge.style.display = 'none'; return; }

  // Direction toward the enemy in NDC (y up). project() mirrors points behind
  // the camera, so flip those back to the true bearing.
  let dx = _enemyArrowNdc.x;
  let dy = _enemyArrowNdc.y;
  if (!inFront) { dx = -dx; dy = -dy; }
  if (dx === 0 && dy === 0) dy = -1;

  // Slide that direction onto an inset screen rectangle (touch the nearest edge).
  const inset = 0.82;
  const k = inset / Math.max(Math.abs(dx), Math.abs(dy));
  const ex = dx * k;
  const ey = dy * k;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  const sx = (ex * 0.5 + 0.5) * w;
  const sy = (-ey * 0.5 + 0.5) * h;   // NDC y up -> screen y down

  // Glyph points up by default; rotate to face the enemy.
  const rot = Math.atan2(-dy, dx) + Math.PI / 2;

  edge.style.display = 'block';
  edge.style.left = `${sx}px`;
  edge.style.top = `${sy}px`;
  edge.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
  // Glint on the edge arrow while the tracked sniper is charging — the
  // unit's own glint art (Aru's / Kei's), shown as-is, no animation.
  const halo = edge.firstElementChild;
  if (halo && halo.hasAttribute('data-glint')) {
    halo.style.display = arrowGlint ? 'block' : 'none';
    if (arrowGlint) {
      const variant = foeGlintBeam ? 'beam' : 'std';
      if (halo.dataset.variant !== variant) {
        halo.dataset.variant = variant;
        halo.style.backgroundImage = `url(${getArrowGlintUrl(foeGlintBeam)})`;
      }
    }
  }
}

function updateTransforms(dt) {
  getAllFighters().forEach((m) => {
    // Hide dead fighters' models. Keeps the body / state intact so cleanup
    // and AI checks (hp<=0 guards in pickClosestEnemyOf etc.) keep working.
    m.root.visible = m.state.hp > 0;
    const groundY = getGroundLevelY(m);

    if (m.state.airborne) {
      m.state.jumpVelocity += world.gravity.y * dt;
      m.body.position.y += m.state.jumpVelocity * dt;
      if (m.body.position.y <= groundY && m.state.jumpVelocity <= 0) {
        m.body.position.y = groundY;
        m.body.velocity.y = 0;
        m.state.airborne = false;
        m.state.jumpVelocity = 0;
      }
    } else if (m.body.position.y > groundY + 0.6) {
      m.state.airborne = true;
      m.state.jumpVelocity = 0;
    } else {
      m.body.position.y = groundY;
      m.body.velocity.y = 0;
    }

    m.body.linearFactor.set(1, 0, 1);
    m.root.position.set(m.body.position.x, m.body.position.y + m.modelYOffset, m.body.position.z);
    m.grounded = !m.state.airborne;
  });
  const pToE = new THREE.Vector3().subVectors(state.enemy.root.position, state.player.root.position).normalize();
  state.player.root.rotation.y = Math.atan2(pToE.x, pToE.z);
  state.enemy.root.rotation.y = Math.atan2(-pToE.x, -pToE.z);

  getAllFighters().forEach((m) => {
    m.arms.left.rotation.x = 0;
    m.arms.right.rotation.x = 0;
    m.arms.left.rotation.z = 0;
    m.arms.right.rotation.z = 0;
    m.root.rotation.x = 0;
    if (performance.now() < m.state.staggerUntil) m.root.rotation.x = 0.18;
    if (m.state.action === 'stagger' && performance.now() > m.state.staggerUntil) m.state.action = 'idle';
    if (!['dash'].includes(m.state.action)) return;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0x7efbff, transparent: true, opacity: 0.4 }));
    puff.position.copy(m.root.position).add(new THREE.Vector3(0, -1.8, -0.6));
    scene.add(puff);
    m.trail.push({ mesh: puff, life: 0.2 });
  });

  getAllFighters().forEach((m) => {
    m.trail = m.trail.filter((t) => {
      t.life -= 1 / 60;
      t.mesh.material.opacity = Math.max(0, t.life * 1.6);
      t.mesh.scale.multiplyScalar(1.07);
      if (t.life > 0) return true;
      scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      return false;
    });
  });
}

// Show the local player's X-ray silhouette ONLY when the camera-to-mech line
// is actually blocked by an arena obstacle. When the mech is in clear view,
// the ghost would just create self-occlusion artifacts (one body part's
// silhouette showing through another), so we hide them entirely. Cheap —
// one AABB scan per frame against arenaObstacles.
function updateMechXRayVisibility() {
  const mech = state.player;
  if (!mech || !mech.xRayGhosts || mech.xRayGhosts.length === 0) return;
  const bp = mech.body.position;
  const cp = camera.position;
  const blocked = !botHasLineOfSight(
    { x: cp.x, y: cp.y, z: cp.z },
    { x: bp.x, y: bp.y, z: bp.z }
  );
  for (const ghost of mech.xRayGhosts) ghost.visible = blocked;
}

function updateCamera() {
  // Camera frames a LIVE fighter on the player's team and that fighter's
  // current target. Normally that's the player + state.playerCurrentTarget.
  // When the player has died but their ally is still up, the camera switches
  // to the ally (spectator mode) and follows whatever enemy the ally is
  // currently fighting (its closest live opponent).
  const playerAlive = (state.player?.state.hp ?? 0) > 0;
  const allyAlive = (state.ally?.state.hp ?? 0) > 0;
  const cam = playerAlive ? state.player : (allyAlive ? state.ally : state.player);
  let tgt;
  if (cam === state.player) {
    tgt = state.playerCurrentTarget ?? state.enemy;
  } else {
    tgt = pickClosestEnemyOf(cam) ?? state.enemy;
  }
  // Auto-fallback: if the chosen target is dead, swing the camera to the
  // closest live enemy of the camera fighter. Belt-and-suspenders — the
  // gameplay path (offline updatePlayer / online applyInput) also retargets
  // on death, but the camera reads its own tgt each frame so we cover the
  // edge case where the player can't fire (sniper charge, hit-stun, etc).
  if (tgt && tgt.state.hp <= 0) {
    const fallback = pickClosestEnemyOf(cam);
    if (fallback) tgt = fallback;
  }
  if (!cam || !tgt) return;
  const p = cam.root.position;
  const e = tgt.root.position;
  const line = new THREE.Vector3().subVectors(e, p).normalize();
  const side = new THREE.Vector3(-line.z, 0, line.x);
  const desired = new THREE.Vector3(p.x - line.x * 13 + side.x * 2, p.y + 6.8, p.z - line.z * 13 + side.z * 2);

  camera.position.lerp(desired, 0.16);
  camera.lookAt(new THREE.Vector3((p.x + e.x) / 2, (p.y + e.y) / 2 + 2.2, (p.z + e.z) / 2));

  const dist = p.distanceTo(e);
  camera.fov = THREE.MathUtils.lerp(76, 46, THREE.MathUtils.clamp(1 - dist / 28, 0, 1));
  if (state.player.state.action === 'dash') camera.fov = Math.min(82, camera.fov + 5);
  camera.updateProjectionMatrix();
}

function updateHud(now = performance.now()) {
  // `now` defaults to performance.now() for offline (where mech.state
  // timestamps are stored in performance.now() reference). Online passes the
  // prediction's server-clock time (onl.lastPredSimTime) because the local
  // player's predicted timestamps live in that clock — NOT the client's raw
  // Date.now(), which would be off by the client↔server wall-clock skew.
  // HUD bars normalize against each fighter's own per-unit caps so a
  // higher-HP / higher-boost character's bar still reads full at full state.
  const playerHpMax = state.player.unit.hp ?? MAX_HP;
  const enemyHpMax = state.enemy.unit.hp ?? MAX_HP;
  const playerBoostMax = state.player.unit.boostCap ?? BOOST_CAP;
  hudRefs.hp.style.width = `${(state.player.state.hp / playerHpMax) * 100}%`;
  hudRefs.enemyHp.style.width = `${(state.enemy.state.hp / enemyHpMax) * 100}%`;
  if (hudRefs.allyHp && state.ally) {
    const allyHpMax = state.ally.unit.hp ?? MAX_HP;
    hudRefs.allyHp.style.width = `${(state.ally.state.hp / allyHpMax) * 100}%`;
  }
  if (hudRefs.enemy2Hp && state.enemy2) {
    const enemy2HpMax = state.enemy2.unit.hp ?? MAX_HP;
    hudRefs.enemy2Hp.style.width = `${(state.enemy2.state.hp / enemy2HpMax) * 100}%`;
  }
  hudRefs.boost.style.width = `${(state.player.state.boost / playerBoostMax) * 100}%`;
  hudRefs.boost.style.background = state.player.state.overheatedUntil > now ? '#ff8c45' : '#90ff63';
  if (state.speedLines) state.speedLines.style.opacity = '0';

  const u = state.player.unit;
  const s = state.player.state;
  if (u.magCapacity != null && hudRefs.ammoCount) {
    hudRefs.ammoCount.textContent = String(s.ammo);
    const isMg = !u.autoReload;
    const empty = isMg && s.ammo === 0;
    let progress = 0;
    let showRing = false;
    if (isMg) {
      if (s.ammo === 0 && s.reloadingUntil > 0) {
        progress = THREE.MathUtils.clamp(1 - (s.reloadingUntil - now) / u.reloadMs, 0, 1);
        showRing = true;
      } else if (u.sniperCharge && s.lastFireAt > 0 && s.ammo > 0) {
        // Sniper between-shot cooldown — same fire-button ring effect as reload.
        const sinceShot = now - s.lastFireAt;
        if (sinceShot < u.fireCooldownMs) {
          progress = THREE.MathUtils.clamp(sinceShot / u.fireCooldownMs, 0, 1);
          showRing = true;
        }
      }
    } else if (s.ammo < u.magCapacity) {
      const partial = s.reloadTickStartAt
        ? THREE.MathUtils.clamp((now - s.reloadTickStartAt) / u.reloadMs, 0, 1)
        : 0;
      progress = (s.ammo + partial) / u.magCapacity;
      showRing = true;
    }
    hudRefs.shootBtn.classList.toggle('empty', empty);
    hudRefs.shootBtn.classList.toggle('reloading', showRing);
    const circumference = 2 * Math.PI * 46;
    hudRefs.reloadRing.style.strokeDashoffset = String(circumference * (1 - progress));
  }
}

function cleanupMatch() {
  // If we were in an online match, close the socket + drop online-only meshes.
  if (state.online) {
    if (state.online.conn) state.online.conn.close();
    if (state.online.projectileMeshes) {
      for (const op of state.online.projectileMeshes.values()) {
        disposeProjectileMesh(op.mesh);
        if (op.trail) disposeBulletTrail(op.trail);
      }
      state.online.projectileMeshes.clear();
    }
    state.online = null;
    hideOnlineOverlay();
  }
  getAllFighters().forEach((m) => {
    if (!m) return;
    disposeGlintImmediate(m);
    removeImmunityAuraFromMech(m);
    if (m.chargedBeamVisual) {
      scene.remove(m.chargedBeamVisual);
      m.chargedBeamVisual.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      m.chargedBeamVisual = null;
    }
    if (m.laserSightVisual) {
      scene.remove(m.laserSightVisual);
      m.laserSightVisual.geometry.dispose();
      m.laserSightVisual.material.dispose();
      m.laserSightVisual = null;
    }
    scene.remove(m.root);
    world.removeBody(m.body);
    m.trail.forEach((t) => scene.remove(t.mesh));
  });
  // Dispose any lingering 照射ビーム visuals + clear beam state.
  if (state.beamVisuals) {
    for (const bv of state.beamVisuals) {
      scene.remove(bv.group);
      bv.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }
  state.beams = [];
  state.beamVisuals = [];
  state.player = null;
  state.enemy = null;
  state.ally = null;
  state.enemy2 = null;
  state.playerCurrentTarget = null;
  state.projectiles.forEach((p) => {
    disposeProjectileMesh(p.mesh);
    if (p.trail) disposeBulletTrail(p.trail);
  });
  state.projectiles.length = 0;
  if (state.dyingBulletTrails && state.dyingBulletTrails.length) {
    state.dyingBulletTrails.forEach((dt) => disposeBulletTrail(dt.trail));
    state.dyingBulletTrails.length = 0;
  }
  state.vfx.forEach((vfx) => scene.remove(vfx.mesh));
  state.vfx.length = 0;
  if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
  if (state.allyArrow?.parent) state.allyArrow.parent.remove(state.allyArrow);
  state.allyArrow = null;
  if (state.enemyArrow?.parent) state.enemyArrow.parent.remove(state.enemyArrow);
  state.enemyArrow = null;
  if (state.allyEdgeArrow) { state.allyEdgeArrow.remove(); state.allyEdgeArrow = null; }
  if (state.enemyEdgeArrow) { state.enemyEdgeArrow.remove(); state.enemyEdgeArrow = null; }
}

function startMatch() {
  cleanupMatch();
  clearMenus();
  renderer.domElement.style.pointerEvents = 'auto';
  state.player = createMech(0x62d7ff, UNIT_DATA[state.playerUnitKey], true);
  state.enemy = createMech(0xff7ad5, UNIT_DATA[state.enemyUnitKey]);
  state.player.state.team = 'A';
  state.enemy.state.team = 'B';
  if (state.mode === '2v2') {
    // Ally: cyan-tinted so the player can tell it apart from themselves.
    // Enemy 2: paler pink so two enemies are visually distinguishable.
    state.ally = createMech(0x86f7c2, UNIT_DATA[state.allyUnitKey]);
    state.enemy2 = createMech(0xff5a8a, UNIT_DATA[state.enemy2UnitKey]);
    state.ally.state.team = 'A';
    state.enemy2.state.team = 'B';
  }
  if (state.mapKey === 'arena2') {
    // Streets: spawn on opposite ends of the cross road (X axis), not the bridge lane.
    state.player.body.position.set(-108, 2.45, 0);
    state.enemy.body.position.set(108, 2.45, 0);
  } else if (state.mapKey === 'lobby') {
    // Lobby: spawn on lower floor on opposite ends, mezzanine reachable via the central stairs.
    state.player.body.position.set(-30, 2.45, 50);
    state.enemy.body.position.set(30, 2.45, 50);
  } else if (state.mapKey === 'factory') {
    state.player.body.position.set(-50, 2.45, 0);
    state.enemy.body.position.set(50, 2.45, 0);
  } else if (state.mapKey === 'station') {
    // Station: spawn at the far west/east ends of the track corridor (tracks at y=0).
    // Platforms on either side are raised 4m — players must jump up to reach them.
    state.player.body.position.set(-128, 2.45, 0);
    state.enemy.body.position.set(128, 2.45, 0);
  } else if (state.mapKey === 'square') {
    // Diagonal spawn across the plaza — past the cathedral and clock tower zones.
    state.player.body.position.set(-95, 2.45, -45);
    state.enemy.body.position.set(95, 2.45, 45);
  } else if (state.mapKey === 'airport') {
    // Diagonal spawn at opposite ends of the concourse, clear of the plateau
    // end-ramps (z ±40..50) and the baggage carousels (|x| <= 102).
    state.player.body.position.set(-118, 2.45, -72);
    state.enemy.body.position.set(118, 2.45, 72);
  } else {
    state.player.body.position.set(-24, 2.45, 0);
    state.enemy.body.position.set(24, 2.45, 0);
  }
  // 2v2 placement: drop ally next to the player, enemy2 next to the enemy.
  // Most maps offset 12 along +Z. Station's track is clear only for |z|<=11
  // (raised side platforms beyond), so +Z there lands the 2nd unit inside a
  // platform — offset along the track toward centre (X) instead, keeping both
  // teammates on the clear central lane between the rail lines.
  if (state.mode === '2v2') {
    const pp = state.player.body.position;
    const ep = state.enemy.body.position;
    if (state.mapKey === 'station') {
      state.ally.body.position.set(pp.x - Math.sign(pp.x) * 12, pp.y, pp.z);
      state.enemy2.body.position.set(ep.x - Math.sign(ep.x) * 12, ep.y, ep.z);
    } else {
      state.ally.body.position.set(pp.x, pp.y, pp.z + 12);
      state.enemy2.body.position.set(ep.x, ep.y, ep.z + 12);
    }
  }
  buildArenaForMap(state.mapKey);
  const now = performance.now();
  getAllFighters().forEach((m) => {
    m.state.lastFireAt = now;
    m.state.invulnerableUntil = now + SPAWN_IMMUNITY_MS;
  });
  state.enemy.state.nextFireAt = now + 650;
  if (state.enemy2) state.enemy2.state.nextFireAt = now + 650;
  input.shootHold = false;
  input.shootTap = false;
  // Default the player's lock target to the first enemy. In 2v2 this can be
  // cycled to enemy2 via the target switch (U on PC, target button on mobile).
  state.playerCurrentTarget = state.enemy;
  state.reticle = makeReticleSprite();
  state.enemy.root.add(state.reticle);
  // Fresh match — seed the firing tracker so the reticle starts green.
  state.reticleLastEnemyFireAt = null;
  state.reticleEnemyFiringUntil = 0;
  // 2v2: a floating marker above the teammate so the player can find them.
  state.allyArrow = null;
  if (state.mode === '2v2' && state.ally) {
    state.allyArrow = makeAllyArrowSprite();
    state.ally.root.add(state.allyArrow);
  }
  // 2v2: a red-orange marker above whichever enemy isn't currently locked.
  // updateEnemyArrow() parents it onto the live not-locked enemy each frame.
  state.enemyArrow = null;
  if (state.mode === '2v2') {
    state.enemyArrow = makeAllyArrowSprite('#ff6a2c');
    state.enemyArrow.visible = false;
  }
  hudRefs = setupHUD();
  state.phase = 'match';
  state.running = true;
  state.matchStartAt = performance.now();
}

// ---- Online match runtime ----
//
// Online mode shares the offline scene/camera/HUD setup but skips the
// offline simulation entirely. Each frame, tickOnline() pulls the latest
// snapshot from the server, mirrors it onto the local mech objects (so
// existing render code — camera, reticle, HUD — keeps working), syncs
// projectile meshes, fires VFX events, and sends the local input frame
// back to the server.

function showOnlineOverlay(text) {
  const existing = document.getElementById('online-overlay');
  if (existing) {
    existing.querySelector('.msg').textContent = text;
    return existing;
  }
  const el = document.createElement('div');
  el.id = 'online-overlay';
  el.className = 'online-overlay';
  el.innerHTML = `<div class="msg"></div>`;
  el.querySelector('.msg').textContent = text;
  app.appendChild(el);
  return el;
}

function hideOnlineOverlay() {
  const el = document.getElementById('online-overlay');
  if (el) el.remove();
}


function startOnlineMatch() {
  cleanupMatch();
  clearMenus();
  state.hud?.remove();
  renderer.domElement.style.pointerEvents = 'auto';

  // No mechs / arena created yet — we defer that until the player has picked
  // their unit and the server has chosen a map (sent in the first snapshot).
  // ensureOnlineMatchSetup() handles it lazily once we hit the 'playing' phase.

  state.online = {
    conn: createConnection(),
    myPlayerId: null,
    projectileMeshes: new Map(),
    snapshotsApplied: 0,

    // Phase 3 — prediction.
    predictedState: null,
    pendingInputs: [],
    nextSeq: 0,
    predAccumulator: 0,
    lastPredRealTime: performance.now(),
    lastPredSimTime: 0,
    lastAppliedSnapshotTick: -1,

    // Reconciliation smoothing — when a snapshot arrives and the server's
    // view of the local fighter differs from our prediction, instead of
    // visibly snapping the mech to the corrected position, we capture the
    // pre-snapshot rendered position relative to the post-snapshot
    // predicted position as a "visual offset" that decays over a few
    // frames. The mech keeps moving smoothly while prediction quietly
    // corrects underneath. Without this, even small drift produces
    // visible warps that look like "lag" even on a clean connection.
    visualPosOffset: { x: 0, y: 0, z: 0 },

    // Phase 4 — UI lifecycle.
    uiSubPhase: 'connecting',    // see computeOnlineUiPhase()
    mechsCreatedFor: null,        // signature key; set when ensureOnlineMatchSetup builds rig
    modePushedToServer: false     // set true once host has pushed state.mode → server
  };
  state.online.conn.open();

  state.phase = 'online';
  state.running = false;
  showOnlineOverlay('Connecting…');
}

function buildOnlineInputFrame() {
  // Convert joystick (screen-space) into world-space move using the camera's
  // forward — same conversion the offline updatePlayer uses.
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = forward.clone().multiplyScalar(-input.y).add(right.multiplyScalar(input.x));

  // Mirror updatePlayer's per-frame sprint normalization for online mode.
  // Without this, the PC sprint-lock workflow can leak input.boost=true:
  //   1. double-tap K → sprintLocked=true, boost=true
  //   2. tap shoot, release K (keyup-K leaves boost=true because
  //      sprintLocked is still true at that moment)
  //   3. release WASD (keyup-WASD clears sprintLocked but never touches boost)
  // → input.boost stays asserted forever even with no keys held, and the
  // server keeps draining the boost gauge to zero. Offline doesn't see
  // this because updatePlayer re-derives input.boost every frame; mobile
  // doesn't see it because the joystick's pointerup explicitly clears all
  // three flags. Doing the same derivation here makes the online PC path
  // behave identically.
  const hasDirInput = Math.hypot(input.x, input.y) > 0.15;
  const playerBoost = state.player?.state?.boost;
  if (
    !hasDirInput
    || input.jump
    || input.stepTap
    || (playerBoost != null && playerBoost <= 0)
  ) {
    input.sprintLocked = false;
  }
  input.boost = input.boostHeld || input.sprintLocked;

  return {
    moveX: move.x,
    moveZ: move.z,
    boost: !!input.boost,
    sprintLocked: !!input.sprintLocked,
    jump: !!input.jump,
    stepTap: !!input.stepTap,
    shootTap: !!input.shootTap,
    shootHold: !!input.shootHold,
    targetSwitch: !!input.targetSwitchTap,
    aimX: input.x,   // raw aim-stick → Kei charged-sweep horizontal aim
    aimY: input.y    // raw aim-stick → Kei charged-sweep vertical (pitch) aim
  };
}

// Per-fighter snapshot → mech mirror. Copies the fields the existing render
// code (updateCamera, updateLocksAndReticle, updateHud, glint) reads from
// mech.state and mech.body.
function mirrorFighterToMech(fighter, mech) {
  mech.body.position.set(fighter.pos.x, fighter.pos.y, fighter.pos.z);
  mech.root.position.set(fighter.pos.x, fighter.pos.y + mech.modelYOffset, fighter.pos.z);
  mech.grounded = !fighter.airborne;
  // Dead fighters disappear visually. The body / root / sim state stay in
  // memory so refs / IDs remain stable, only the rendered model hides.
  mech.root.visible = fighter.hp > 0;

  const s = mech.state;
  s.action = fighter.action;
  s.hp = fighter.hp;
  s.boost = fighter.boost;
  s.ammo = fighter.ammo;
  s.lastFireAt = fighter.lastFireAt;
  s.reloadingUntil = fighter.reloadingUntil;
  s.reloadTickStartAt = fighter.reloadTickStartAt;
  s.redLock = fighter.redLock;
  s.airborne = fighter.airborne;
  s.hitStunUntil = fighter.hitStunUntil;
  s.hitStunScale = fighter.hitStunScale ?? 0.25;
  s.invulnerableUntil = fighter.invulnerableUntil;
  s.overheatedUntil = fighter.overheatedUntil;
  // Kei charged sweep channel — server-clock timestamps, used to render the beam.
  s.chargedBeamUntil = fighter.chargedBeamUntil ?? 0;
  s.chargedBeamDirX = fighter.chargedBeamDirX ?? 0;
  s.chargedBeamDirZ = fighter.chargedBeamDirZ ?? 0;
  s.chargedBeamPitch = fighter.chargedBeamPitch ?? 0;   // steered vertical aim, used by the beam visual
  s.targetId = fighter.targetId ?? null;                 // lock target — drives the laser-sight visual
  // sniperChargeTarget needs to be a truthy reference for HUD/glint code;
  // anything works since the offline code only checks truthiness.
  //
  // State-driven glint: drive createGlintForMech / removeGlintFromMech off the
  // snapshot-mirrored field rather than off the sim's `sniper-charge-start` /
  // `sniper-charge-fire` events. Events are only processed on the LATEST
  // snapshot per render frame (see runOnlineMatchFrame + processOnlineEvents);
  // when two snapshots land in one frame — typical for sprint-cancel where
  // charge-start and charge-fire happen 1 tick apart — the older snapshot's
  // start event is silently dropped and the glint never appears. Detecting
  // the null↔non-null transition on the mirrored state catches the charge as
  // long as ANY render frame fires between the two snapshots arriving, which
  // is far more common than the event handler winning the race.
  const wasCharging = !!s.sniperChargeTarget;
  const isCharging = !!fighter.sniperChargeTargetId;
  s.sniperChargeTarget = isCharging ? { id: fighter.sniperChargeTargetId } : null;
  s.sniperChargeUntil = fighter.sniperChargeUntil;
  if (isCharging && !wasCharging) createGlintForMech(mech);
  else if (!isCharging && wasCharging) removeGlintFromMech(mech);
}

function syncOnlineProjectiles(snap) {
  const meshes = state.online.projectileMeshes;
  const liveIds = new Set();
  const now = performance.now();
  for (const sp of snap.projectiles) {
    liveIds.add(sp.id);
    let entry = meshes.get(sp.id);
    if (!entry) {
      const owner = snap.fighters[sp.ownerId];
      const isOwnerRedLock = owner?.redLock ?? false;
      const ownerUnit = owner?.unit ?? SIM_UNIT_DATA[owner?.unitKey] ?? {};
      const mesh = buildProjectileMesh(ownerUnit, isOwnerRedLock);
      scene.add(mesh);
      // Bullet trail (MG / Sniper only — shotgun pellets opt out).
      const trailFadeMs = bulletTrailFadeMsFor(ownerUnit);
      let trail = null;
      if (trailFadeMs > 0) {
        trail = buildBulletTrail();
        scene.add(trail);
      }
      entry = {
        mesh,
        trail,
        trailFadeMs,
        trailSpawnX: sp.pos.x, trailSpawnY: sp.pos.y, trailSpawnZ: sp.pos.z,
        trailSpawnAt: now
      };
      meshes.set(sp.id, entry);
    }
    entry.mesh.position.set(sp.pos.x, sp.pos.y, sp.pos.z);
    // Re-orient sniper tracers along their snapshot velocity so the streak
    // visibly follows the projectile's path. No-op for sphere projectiles.
    orientTracer(entry.mesh, sp.vel.x, sp.vel.y, sp.vel.z);
    // Update the bullet trail (same analytic tail as offline).
    if (entry.trail) {
      const elapsedMs = now - entry.trailSpawnAt;
      const fadeSec = entry.trailFadeMs / 1000;
      let tailX, tailY, tailZ;
      if (elapsedMs < entry.trailFadeMs) {
        tailX = entry.trailSpawnX;
        tailY = entry.trailSpawnY;
        tailZ = entry.trailSpawnZ;
      } else {
        tailX = sp.pos.x - sp.vel.x * fadeSec;
        tailY = sp.pos.y - sp.vel.y * fadeSec;
        tailZ = sp.pos.z - sp.vel.z * fadeSec;
      }
      updateBulletTrailEnds(entry.trail, tailX, tailY, tailZ, sp.pos.x, sp.pos.y, sp.pos.z);
    }
  }
  // Despawn anything no longer in the snapshot — hand any trail off to the
  // dying list so it fades in place instead of vanishing instantly.
  for (const [id, entry] of meshes.entries()) {
    if (liveIds.has(id)) continue;
    disposeProjectileMesh(entry.mesh);
    if (entry.trail) {
      state.dyingBulletTrails.push({
        trail: entry.trail,
        diesAt: now + entry.trailFadeMs,
        fadeMs: entry.trailFadeMs,
        initialOpacity: BULLET_TRAIL_OPACITY
      });
    }
    meshes.delete(id);
  }
}

function processOnlineEvents(snap, myPlayerId) {
  if (!snap.events) return;
  for (const ev of snap.events) {
    if (ev.type === 'hit' && ev.pos) {
      // Color the hit ring by who got hit, matching offline conventions.
      const color = ev.targetId === myPlayerId ? 0x67f2ff : 0xff73d2;
      spawnHitEffect(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), color);
    }
    // 'beam-fired' is intentionally NOT drawn here anymore — the beam visual is
    // state-driven from snap.beams in syncOnlineBeams, which survives the snapshot
    // drops that used to lose this one-shot event (common on sprint-cancel).
    // Sniper-charge glint is driven by snapshot state inside
    // mirrorFighterToMech, not by 'sniper-charge-start' / -fire / -cancel
    // events here — events get dropped when two snapshots land between
    // render frames (common on sprint-cancel). The sim still emits those
    // events for telemetry/test consumers; we just don't act on them.
  }
}

function showOnlineEndMenu(winnerId, myPlayerId, rematchRequested) {
  // Drawn by renderOnlineUi when uiSubPhase transitions to 'ended', and
  // re-drawn by refreshEndMenuIfStale when the opponent's rematch status
  // changes. The new match doesn't start until BOTH players click Rematch.
  //
  // winnerId is either a slot id ('p1'/'p2' for 1v1) OR a team letter
  // ('A'/'B' for 2v2). Detect by string content.
  const isTeamWinner = winnerId === 'A' || winnerId === 'B';
  const myTeam = ONLINE_SLOT_IDS.includes(myPlayerId) ? teamOfSlot(myPlayerId) : null;
  const win = isTeamWinner ? (winnerId === myTeam) : (winnerId === myPlayerId);
  const tie = winnerId == null;
  const oppId = (myPlayerId === 'p1') ? 'p2' : 'p1';
  const oppReady = rematchRequested?.[oppId] === true;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <h2>${tie ? 'MATCH ENDED' : (win ? 'YOU WIN' : 'YOU LOSE')}</h2>
    ${oppReady ? '<div class="menu-divider">Opponent wants a rematch</div>' : ''}
    <button id="online-rematch">Rematch</button>
    <button id="online-leave" class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  menu.querySelector('#online-rematch').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.online.conn.requestRematch();
    // Server's lobby:config will echo back our request; refreshEndMenuIfStale
    // sees rematchRequested[me]=true and switches to the overlay.
  });
  menu.querySelector('#online-leave').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
  });
}

// ---- Phase 3: prediction & interpolation ----

// Deep-clone a fighter for prediction. Snapshots arrive as plain JSON, so the
// `unit` reference (set in createFighter) is no longer === UNIT_DATA[unitKey].
// We re-attach the canonical reference so any code that does identity checks
// or relies on the same object stays consistent.
function cloneFighterForPrediction(f) {
  const cloned = JSON.parse(JSON.stringify(f));
  cloned.unit = SIM_UNIT_DATA[cloned.unitKey];
  return cloned;
}

// Build a workable MatchState from the latest snapshot. Projectiles are
// always reset to []  — we don't predict them (server-authoritative; client
// just renders snapshot projectiles).
function cloneSnapshotForPrediction(snap) {
  // Include every fighter the server actually has — p1+p2 in 1v1, p1..p4 in
  // 2v2. Missing p3/p4 in the cloned state was the cause of the "submerged
  // mech" bug for players who moved to a p3/p4 slot: simTickMatch would
  // iterate only [p1,p2], the local fighter (e.g. p4) never existed in
  // predictedState, cameraFighter was undefined, mirrorFighterToMech was
  // skipped, and the mech root stayed at its scene-add default (y=0 with
  // negative-Y leg meshes).
  const fighters = {};
  for (const id of ['p1', 'p2', 'p3', 'p4']) {
    if (snap.fighters?.[id]) {
      fighters[id] = cloneFighterForPrediction(snap.fighters[id]);
    }
  }
  return {
    tick: snap.tick,
    now: snap.serverTime,
    startTime: snap.serverTime,
    mapKey: snap.mapKey,
    mode: snap.mode || '1v1',
    fighters,
    projectiles: [],
    events: []
  };
}

// On every new snapshot: snap to server state, then re-apply every input
// the server hasn't ack'd yet so we end up "ahead" of the server by RTT.
//
// Reconciliation smoothing: capture the pre-snap rendered position
// (predicted + current visual offset) and the post-snap predicted
// position. The difference is pushed into `visualPosOffset` so the next
// few render frames can decay it back to zero — the mech keeps moving
// smoothly across the discontinuity instead of warping.
function applySnapshotToPrediction(snap) {
  const onl = state.online;
  if (!onl) return;
  const myId = onl.myPlayerId;
  if (!ONLINE_SLOT_IDS.includes(myId)) return;

  // Pre-snap rendered position = pre-snap predicted + current visual offset.
  const prePredFighter = onl.predictedState?.fighters?.[myId];
  const renderedX = prePredFighter ? prePredFighter.pos.x + (onl.visualPosOffset?.x ?? 0) : null;
  const renderedY = prePredFighter ? prePredFighter.pos.y + (onl.visualPosOffset?.y ?? 0) : null;
  const renderedZ = prePredFighter ? prePredFighter.pos.z + (onl.visualPosOffset?.z ?? 0) : null;

  const fresh = cloneSnapshotForPrediction(snap);
  // Drop inputs the server has consumed.
  const ack = snap.acks?.[myId] ?? -1;
  onl.pendingInputs = onl.pendingInputs.filter((p) => p.seq > ack);

  // Replay the unack'd ones to advance prediction back to ~present. Empty
  // inputs for the other slots — only the local player's predictions matter.
  let simNow = snap.serverTime;
  for (let i = 0; i < onl.pendingInputs.length; i += 1) {
    const p = onl.pendingInputs[i];
    simNow += SIM_TICK_RATE_MS;
    const inputs = {
      p1: simEmptyInput(), p2: simEmptyInput(),
      p3: simEmptyInput(), p4: simEmptyInput()
    };
    inputs[myId] = p.input;
    simTickMatch(fresh, inputs, simNow, SIM_TICK_DT);
  }

  onl.predictedState = fresh;
  onl.lastPredSimTime = simNow;

  // Set new visual offset = (where we WERE rendered) − (where we ARE
  // NOW predicted), so rendering the local mech at predicted+offset
  // continues displaying the same position as before this snapshot.
  // The offset then decays toward zero in runOnlineMatchFrame, smoothly
  // bringing the rendered mech onto the corrected predicted path.
  if (renderedX != null) {
    const newPos = fresh.fighters[myId]?.pos;
    if (newPos) {
      const offX = renderedX - newPos.x;
      const offY = renderedY - newPos.y;
      const offZ = renderedZ - newPos.z;
      // Cap the offset — for very large discontinuities (e.g. step/dodge
      // landing very differently on the server) just snap rather than
      // ride a long visible rubberband. SNAP_THRESHOLD ≈ a single
      // sprint tick of distance.
      const SNAP_THRESHOLD_SQ = 4 * 4;
      const len2 = offX * offX + offY * offY + offZ * offZ;
      if (len2 > SNAP_THRESHOLD_SQ) {
        onl.visualPosOffset.x = 0;
        onl.visualPosOffset.y = 0;
        onl.visualPosOffset.z = 0;
      } else {
        onl.visualPosOffset.x = offX;
        onl.visualPosOffset.y = offY;
        onl.visualPosOffset.z = offZ;
      }
    }
  }
}

// Prediction tick — fixed cadence (TICK_RATE_MS) regardless of render
// rate. Builds an input frame from the current input state, sends it to
// the server with a seq number, and applies it to the local
// predictedState so the local fighter visibly advances before the
// server round-trip.
function runPredictionTick() {
  const onl = state.online;
  if (!onl || !onl.predictedState) return;
  const myId = onl.myPlayerId;
  if (!ONLINE_SLOT_IDS.includes(myId)) return;

  const inputFrame = buildOnlineInputFrame();
  const seq = onl.nextSeq++;

  onl.conn.sendInput({ ...inputFrame, seq });
  onl.pendingInputs.push({ seq, input: inputFrame });
  // Cap the buffer; >1s of pending inputs at 40 Hz = 40 entries. Worst-case
  // RTT scenarios shouldn't blow past ~120.
  if (onl.pendingInputs.length > 240) onl.pendingInputs.shift();

  onl.lastPredSimTime += SIM_TICK_RATE_MS;
  const inputs = {
    p1: simEmptyInput(), p2: simEmptyInput(),
    p3: simEmptyInput(), p4: simEmptyInput()
  };
  inputs[myId] = inputFrame;
  simTickMatch(onl.predictedState, inputs, onl.lastPredSimTime, SIM_TICK_DT);

  // Reset taps so they fire exactly once per press.
  input.stepTap = false;
  input.shootTap = false;
  input.targetSwitchTap = false;
  input.jump = false;
}

// Interpolate the remote fighter between the previous and latest snapshots
// for smoother rendering. Returns a fighter-shaped object with lerped
// position; non-position fields come from the latest snapshot.
function interpolateRemoteFighter(remoteId, prevSnap, latestSnap, lastSnapAt, now) {
  const latestF = latestSnap?.fighters?.[remoteId];
  if (!latestF) return null;
  const prevF = prevSnap?.fighters?.[remoteId];
  if (!prevF) return latestF;

  const elapsed = now - lastSnapAt;
  const alpha = Math.max(0, Math.min(1, elapsed / SIM_TICK_RATE_MS));
  return {
    ...latestF,
    pos: {
      x: prevF.pos.x + (latestF.pos.x - prevF.pos.x) * alpha,
      y: prevF.pos.y + (latestF.pos.y - prevF.pos.y) * alpha,
      z: prevF.pos.z + (latestF.pos.z - prevF.pos.z) * alpha
    }
  };
}

// Compute which UI sub-phase we should be in based on connection + lobby state.
function computeOnlineUiPhase(onl, conn) {
  const myId = onl.myPlayerId;
  const matchSt = conn.getMatchState();
  if (!myId) return 'connecting';
  if (myId === 'spectator') {
    if (matchSt === 'active' && conn.getLatestSnapshot()) return 'playing';
    if (matchSt === 'ended') return 'ended';
    return 'spectator-waiting';
  }
  // Player slot.
  if (matchSt === 'active') {
    return conn.getLatestSnapshot() ? 'playing' : 'starting';
  }
  if (matchSt === 'ended') return 'ended';
  // 'waiting' — drive UI off picks.
  const cfg = conn.getLobbyConfig();
  const myCfg = cfg?.config?.[myId] ?? {};
  // Host has to choose 1v1 vs 2v2 before anything else — and only once.
  // Joiners (p2/p3/p4) skip this — they inherit the lobby's existing mode.
  if (myId === 'p1' && !onl.modePushedToServer) return 'pick-mode';
  if (!myCfg.unitKey) return 'pick-unit';
  if (myId === 'p1' && !myCfg.mapKey) return 'pick-map';
  // Host tapping a bot slot opens the bot-unit picker (1v1 or 2v2).
  if (onl.pickingBotSlot && myId === 'p1') return 'pick-bot-unit';
  return 'waiting-opp';
}

function renderOnlineUi(phase, prevPhase, onl, conn) {
  // Always reset the UI surface before rendering the new phase.
  clearMenus();
  hideOnlineOverlay();

  // Entering 'playing' is a "new match started" signal — wipe prediction
  // bookkeeping so any stale inputs from the previous match don't replay.
  if (phase === 'playing' && prevPhase !== 'playing') {
    onl.pendingInputs = [];
    onl.nextSeq = 0;
    onl.lastAppliedSnapshotTick = -1;
    onl.predictedState = null;
  }

  switch (phase) {
    case 'connecting':
      showOnlineOverlay('Connecting…');
      break;
    case 'pick-mode':
      showOnlineModePicker(onl);
      break;
    case 'pick-unit':
      showOnlineUnitPicker(onl, conn);
      break;
    case 'pick-map':
      showOnlineMapPicker(onl, conn);
      break;
    case 'pick-bot-unit':
      showOnlineBotUnitPicker(onl, conn);
      break;
    case 'waiting-opp':
      showOnlineWaitingOpp(onl, conn);
      break;
    case 'spectator-waiting':
      showOnlineOverlay('Spectator mode — match in progress or full');
      break;
    case 'starting':
      showOnlineOverlay('Match starting…');
      break;
    case 'playing':
      // Mechs / arena are built lazily inside runOnlineMatchFrame.
      break;
    case 'ended': {
      const end = conn.getLastMatchEnd();
      const cfg = conn.getLobbyConfig();
      const rs = cfg?.rematchRequested ?? { p1: false, p2: false };
      // Initialize the staleness signature so refreshEndMenuIfStale doesn't
      // immediately re-render this same state.
      onl.lastEndMenuSig = rematchSig(onl.myPlayerId, rs);
      if (rs[onl.myPlayerId]) {
        // We've already requested (e.g. mid-flight reconnect) — show overlay.
        showOnlineOverlay(rs[opponentId(onl.myPlayerId)] ? 'Opponent ready — starting…' : 'Waiting for opponent…');
      } else {
        showOnlineEndMenu(end?.winnerId ?? null, onl.myPlayerId, rs);
      }
      break;
    }
    default:
      break;
  }
}

function opponentId(myId) {
  return myId === 'p1' ? 'p2' : 'p1';
}

function rematchSig(myId, rs) {
  const oppId = opponentId(myId);
  return `${rs[myId] ? 1 : 0}|${rs[oppId] ? 1 : 0}`;
}

function refreshEndMenuIfStale(onl, conn) {
  const cfg = conn.getLobbyConfig();
  const rs = cfg?.rematchRequested ?? { p1: false, p2: false };
  const sig = rematchSig(onl.myPlayerId, rs);
  if (onl.lastEndMenuSig === sig) return;
  onl.lastEndMenuSig = sig;
  clearMenus();
  hideOnlineOverlay();
  if (rs[onl.myPlayerId]) {
    // Self has requested — show waiting overlay; opp may or may not be ready.
    const oppReady = rs[opponentId(onl.myPlayerId)];
    showOnlineOverlay(oppReady ? 'Opponent ready — starting…' : 'Waiting for opponent…');
  } else {
    // Self hasn't requested yet — show end menu, possibly with "opponent wants rematch".
    const end = conn.getLastMatchEnd();
    showOnlineEndMenu(end?.winnerId ?? null, onl.myPlayerId, rs);
  }
}

const ONLINE_AVAILABLE_MAPS = new Set(['arena1', 'arena2', 'factory', 'square', 'lobby', 'station', 'flashpoint', 'airport']);

// Host-only step: select 1v1 or 2v2. Only shown once per session (gated by
// onl.modePushedToServer). Joiners skip this and inherit the lobby's mode.
function showOnlineModePicker(onl) {
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <h2>Choose Mode</h2>
    <div class="menu-divider">Online — you are p1 (host)</div>
    <button data-mode-pick="1v1" class="online-play-btn">1v1</button>
    <button data-mode-pick="2v2" class="online-play-btn">2v2</button>
    <button data-leave class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  menu.querySelectorAll('button[data-mode-pick]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const mode = btn.dataset.modePick;
      onl.conn.sendSetMode(mode);
      onl.modePushedToServer = true;
    });
  });
  menu.querySelector('button[data-leave]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
  });
}

function showOnlineUnitPicker(onl, conn) {
  const menu = document.createElement('div');
  menu.className = 'menu';
  const unitEntries = Object.entries(UNIT_DATA);
  // Mention which mode the lobby is in so non-hosts know what they joined.
  const mode = conn?.getLobbyConfig?.()?.mode ?? '1v1';
  menu.innerHTML = `
    <h2>Pick Your Unit</h2>
    <div class="menu-divider">Online ${mode} — you are ${onl.myPlayerId}${onl.myPlayerId === 'p1' ? ' (host)' : ''}</div>
    ${unitGridHTML(unitEntries)}
    <button data-leave class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  wireUnitGrid(menu, (key) => {
    onl.conn.sendConfigure({ unitKey: key });
  });
  menu.querySelector('button[data-leave]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
  });
}

// Host taps a bot slot → pick which unit that bot uses (1v1 or 2v2). Sends
// { botSlot, botUnitKey }; the server stores it per-slot in lobby.botUnits.
function showOnlineBotUnitPicker(onl, conn) {
  const menu = document.createElement('div');
  menu.className = 'menu';
  const slot = onl.pickingBotSlot;
  const unitEntries = Object.entries(UNIT_DATA);
  menu.innerHTML = `
    <h2>Pick Bot Unit</h2>
    <div class="menu-divider">Bot in slot ${slot}</div>
    ${unitGridHTML(unitEntries)}
    <button data-back class="online-leave-btn">Back</button>
  `;
  app.appendChild(menu);
  wireUnitGrid(menu, (key) => {
    onl.conn.sendConfigure({ botSlot: slot, botUnitKey: key });
    onl.pickingBotSlot = null;   // back to the queue room next frame
  });
  menu.querySelector('button[data-back]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onl.pickingBotSlot = null;
  });
}

function showOnlineMapPicker(onl, conn) {
  const menu = document.createElement('div');
  menu.className = 'menu';
  const mapEntries = Object.entries(MAP_DATA);
  const mode = conn?.getLobbyConfig?.()?.mode ?? '1v1';
  menu.innerHTML = `
    <h2>Pick a Map</h2>
    <div class="menu-divider">Online ${mode} — you are p1 (host)</div>
    ${mapEntries.map(([id, m]) => {
      const enabled = ONLINE_AVAILABLE_MAPS.has(id);
      const label = enabled ? m.name : `${m.name} (offline only)`;
      return `<button data-map="${id}"${enabled ? '' : ' disabled'}>${label}</button>`;
    }).join('')}
    <button data-leave class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  menu.querySelectorAll('button[data-map]:not([disabled])').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onl.conn.sendConfigure({ mapKey: btn.dataset.map });
    });
  });
  menu.querySelector('button[data-leave]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
  });
}

function showOnlineWaitingOpp(onl, conn) {
  const cfg = conn.getLobbyConfig();
  const myId = onl.myPlayerId;
  const mode = cfg?.mode ?? '1v1';
  const isHost = myId === 'p1';
  const slots = mode === '2v2' ? ONLINE_SLOT_IDS : ONLINE_SLOT_IDS.slice(0, 2);
  const occupied = new Set(cfg?.occupied ?? []);
  const myCfg = cfg?.config?.[myId] ?? {};
  const mapKey = myCfg.mapKey || cfg?.config?.p1?.mapKey;
  const mapName = mapKey ? MAP_DATA[mapKey]?.name : null;

  // Headline text. Both modes use the manual-start flow: the host picks unit +
  // map then starts; everyone else waits for the host.
  let waitingText;
  if (isHost) {
    if (!myCfg.unitKey) waitingText = 'Pick your unit…';
    else if (!myCfg.mapKey) waitingText = 'Pick a map…';
    else waitingText = 'Lobby — start when ready';
  } else {
    waitingText = 'Waiting for host to start…';
  }

  // Roster grouped by team. Each team gets its own <section> with a header
  // and one row per slot on that side. Empty non-host slots show a Join
  // button so a player can hop to the other team.
  const renderSlot = (s) => {
    const team = teamOfSlot(s);
    const isMe = s === myId;
    const isOccupied = occupied.has(s);
    const slotCfg = cfg?.config?.[s] ?? {};
    const unitName = slotCfg.unitKey ? UNIT_DATA[slotCfg.unitKey]?.name : null;
    let statusHtml;
    if (isMe) {
      statusHtml = `<span class="roster-status">${unitName ? `You — ${unitName}` : 'You'}</span>`;
    } else if (isOccupied) {
      statusHtml = `<span class="roster-status">${unitName ? `Player — ${unitName}` : 'Player (picking…)'}</span>`;
    } else if (s === 'p1') {
      // Host slot is locked — no Join button. Reaches here only briefly,
      // during connect-time before p1 is assigned.
      statusHtml = `<span class="roster-status">(host slot)</span>`;
    } else {
      // Empty slot = a bot until a human takes it. Show its (host-chosen) unit.
      // Host taps to change that bot's unit; non-hosts get a Join button in 2v2
      // (team-switch). 1v1 has no Join (two slots, auto-assigned).
      const botUnitKey = cfg?.botUnits?.[s] || 'unit1';
      const botChar = UNIT_DATA[botUnitKey]?.char || 'Saori';
      if (isHost) {
        statusHtml = `<span class="roster-status roster-bot-pick" data-pick-bot-slot="${s}">${botChar} (BOT) — tap to change</span>`;
      } else {
        const joinBtn = mode === '2v2' ? `<button class="roster-join" data-join-slot="${s}">Join</button>` : '';
        statusHtml = `<span class="roster-status">${botChar} (BOT)</span>${joinBtn}`;
      }
    }
    return `<div class="roster-row roster-team-${team}">
      <span class="roster-slot">${s}</span>
      ${statusHtml}
    </div>`;
  };
  const teamASlots = slots.filter((s) => teamOfSlot(s) === 'A');
  const teamBSlots = slots.filter((s) => teamOfSlot(s) === 'B');
  const rosterHtml = `
    <div class="roster-team-group roster-team-A">
      <div class="roster-team-header">Team A</div>
      ${teamASlots.map(renderSlot).join('')}
    </div>
    <div class="roster-team-group roster-team-B">
      <div class="roster-team-header">Team B</div>
      ${teamBSlots.map(renderSlot).join('')}
    </div>`;

  // Mode is chosen on the main menu before entering the online flow.
  // Display it here as read-only — no toggle.
  const modeChip = `<div class="menu-divider">Mode: ${mode}</div>`;

  // Host's explicit Start button (both modes). Enabled once they've picked
  // unit + map (server rejects otherwise). Starting with an empty opponent slot
  // fills it with a bot (1v1 → Saori); a human who joins first takes the slot.
  const canStart = isHost && !!myCfg.unitKey && !!myCfg.mapKey;
  const startBtnHtml = isHost
    ? `<button id="online-start-now" class="online-play-btn"${canStart ? '' : ' disabled'}>Start Match</button>`
    : '';

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <h2>${waitingText}</h2>
    ${modeChip}
    <div class="online-roster">${rosterHtml}</div>
    <div class="online-status">
      <div><span class="lbl">Map:</span> <span class="val">${mapName ?? '—'}</span></div>
    </div>
    ${startBtnHtml}
    <button data-leave class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  menu.querySelectorAll('button[data-join-slot]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onl.conn.sendJoinSlot(btn.dataset.joinSlot);
    });
  });
  // Host taps a bot slot to open the bot-unit picker (1v1 or 2v2).
  menu.querySelectorAll('[data-pick-bot-slot]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onl.pickingBotSlot = el.dataset.pickBotSlot;
    });
  });
  const startBtn = menu.querySelector('#online-start-now');
  if (startBtn) {
    startBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (startBtn.disabled) return;
      onl.conn.sendStartNow();
    });
  }
  menu.querySelector('button[data-leave]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
  });
}

// Lazy mech + arena setup. Called every frame from runOnlineMatchFrame; only
// rebuilds when the (mapKey, mode, unit assignments, my slot) signature
// changes. In 2v2 it builds 4 mechs and remembers which snapshot slot maps
// to state.player / state.ally / state.enemy / state.enemy2 (onl.slotMap).
function ensureOnlineMatchSetup(snap) {
  if (!snap) return;
  const onl = state.online;
  const myId = onl.myPlayerId;
  const mode = snap.mode || '1v1';
  const cameraId = ONLINE_SLOT_IDS.includes(myId) ? myId : 'p1';
  const activeSlots = mode === '2v2' ? ONLINE_SLOT_IDS : ONLINE_SLOT_IDS.slice(0, 2);
  const myTeam = teamOfSlot(cameraId);
  const allyId = activeSlots.find((id) => id !== cameraId && teamOfSlot(id) === myTeam) || null;
  const enemyIds = activeSlots.filter((id) => teamOfSlot(id) !== myTeam);
  const enemyId = enemyIds[0];
  const enemy2Id = enemyIds[1] || null;

  const unitSig = activeSlots.map((id) => `${id}:${snap.fighters[id]?.unitKey ?? ''}`).join('|');
  const mapKey = snap.mapKey;
  const sig = `${mapKey}|${unitSig}|${cameraId}|${mode}`;
  if (onl.mechsCreatedFor === sig) return;

  // Tear down old mechs/arena/HUD/projectile meshes. getAllFighters covers
  // any subset (1v1 had 2; 2v2 has 4) so we don't have to special-case.
  getAllFighters().forEach((m) => {
    disposeGlintImmediate(m);
    removeImmunityAuraFromMech(m);
    scene.remove(m.root);
    world.removeBody(m.body);
    m.trail.forEach((t) => scene.remove(t.mesh));
  });
  state.player = null;
  state.enemy = null;
  state.ally = null;
  state.enemy2 = null;
  state.playerCurrentTarget = null;
  if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
  state.reticle = null;
  if (state.allyArrow?.parent) state.allyArrow.parent.remove(state.allyArrow);
  state.allyArrow = null;
  if (state.enemyArrow?.parent) state.enemyArrow.parent.remove(state.enemyArrow);
  state.enemyArrow = null;
  if (state.allyEdgeArrow) { state.allyEdgeArrow.remove(); state.allyEdgeArrow = null; }
  if (state.enemyEdgeArrow) { state.enemyEdgeArrow.remove(); state.enemyEdgeArrow = null; }
  if (state.hud) { state.hud.remove(); state.hud = null; }
  hudRefs = null;
  for (const op of onl.projectileMeshes.values()) {
    disposeProjectileMesh(op.mesh);
    if (op.trail) disposeBulletTrail(op.trail);
  }
  onl.projectileMeshes.clear();

  // Tell the HUD layout which mode it is BEFORE setupHUD reads state.mode.
  state.mode = mode;

  // Build new mechs. Same colour palette as offline so it reads consistently.
  state.player = createMech(0x62d7ff, UNIT_DATA[snap.fighters[cameraId].unitKey], true);
  state.player.state.team = myTeam;
  const myPos = snap.fighters[cameraId].pos;
  state.player.body.position.set(myPos.x, myPos.y, myPos.z);

  state.enemy = createMech(0xff7ad5, UNIT_DATA[snap.fighters[enemyId].unitKey]);
  state.enemy.state.team = teamOfSlot(enemyId);
  const ePos = snap.fighters[enemyId].pos;
  state.enemy.body.position.set(ePos.x, ePos.y, ePos.z);

  if (mode === '2v2' && allyId) {
    state.ally = createMech(0x86f7c2, UNIT_DATA[snap.fighters[allyId].unitKey]);
    state.ally.state.team = myTeam;
    const aPos = snap.fighters[allyId].pos;
    state.ally.body.position.set(aPos.x, aPos.y, aPos.z);
  }
  if (mode === '2v2' && enemy2Id) {
    state.enemy2 = createMech(0xff5a8a, UNIT_DATA[snap.fighters[enemy2Id].unitKey]);
    state.enemy2.state.team = teamOfSlot(enemy2Id);
    const e2Pos = snap.fighters[enemy2Id].pos;
    state.enemy2.body.position.set(e2Pos.x, e2Pos.y, e2Pos.z);
  }

  // Save the snapshot-id → mech mapping for per-frame mirroring.
  onl.slotMap = { cameraId, allyId, enemyId, enemy2Id };

  buildArenaForMap(mapKey);
  state.reticle = makeReticleSprite();
  state.enemy.root.add(state.reticle);
  state.playerCurrentTarget = state.enemy;
  // Fresh match — seed the firing tracker so the reticle starts green.
  state.reticleLastEnemyFireAt = null;
  state.reticleEnemyFiringUntil = 0;
  // 2v2: a floating marker above the teammate so the player can find them.
  state.allyArrow = null;
  if (mode === '2v2' && state.ally) {
    state.allyArrow = makeAllyArrowSprite();
    state.ally.root.add(state.allyArrow);
  }
  // 2v2: a red-orange marker above whichever enemy isn't currently locked.
  // updateEnemyArrow() parents it onto the live not-locked enemy each frame.
  state.enemyArrow = null;
  if (mode === '2v2') {
    state.enemyArrow = makeAllyArrowSprite('#ff6a2c');
    state.enemyArrow.visible = false;
  }
  hudRefs = setupHUD();
  // Pause button is meaningless online (server runs the sim authoritatively).
  const pauseBtn = state.hud?.querySelector('#pause-btn');
  if (pauseBtn) pauseBtn.remove();
  onl.mechsCreatedFor = sig;
}

function runOnlineMatchFrame(dt, onl, conn) {
  const snap = conn.getLatestSnapshot();
  if (!snap) return;
  ensureOnlineMatchSetup(snap);
  if (!state.player || !state.enemy) return;

  const prevSnap = conn.getPreviousSnapshot();
  const lastSnapAt = conn.getLastSnapshotAt();

  // 1. New snapshot? Reset prediction from it and replay unack'd inputs.
  if (snap.tick !== onl.lastAppliedSnapshotTick) {
    onl.lastAppliedSnapshotTick = snap.tick;
    onl.snapshotsApplied += 1;
    if (ONLINE_SLOT_IDS.includes(onl.myPlayerId)) {
      applySnapshotToPrediction(snap);
    }
    syncOnlineProjectiles(snap);
    syncOnlineBeams(snap);
    processOnlineEvents(snap, onl.myPlayerId);
  }

  // 2. Drive prediction at fixed 25 ms cadence.
  const realNow = performance.now();
  onl.predAccumulator += realNow - onl.lastPredRealTime;
  onl.lastPredRealTime = realNow;
  if (onl.predAccumulator > 250) onl.predAccumulator = 250;
  while (onl.predAccumulator >= SIM_TICK_RATE_MS) {
    onl.predAccumulator -= SIM_TICK_RATE_MS;
    runPredictionTick();
  }

  // 3. Render. state.player = local (camera target); state.enemy = primary
  //    enemy (slotMap.enemyId in 2v2, opposite slot in 1v1).
  const myId = onl.myPlayerId;
  const cameraId = ONLINE_SLOT_IDS.includes(myId) ? myId : 'p1';
  // 1v1 fallback when slotMap hasn't been built yet: derive otherId directly.
  const otherId = onl.slotMap?.enemyId ?? (cameraId === 'p1' ? 'p2' : 'p1');
  let cameraFighter;
  if (ONLINE_SLOT_IDS.includes(myId) && onl.predictedState) {
    cameraFighter = onl.predictedState.fighters[cameraId];
  } else {
    cameraFighter = snap.fighters[cameraId];
  }
  const otherFighter = interpolateRemoteFighter(otherId, prevSnap, snap, lastSnapAt, realNow);

  // Reconciliation smoothing — decay the visual offset toward zero each
  // frame so any discontinuity captured at snapshot time fades smoothly
  // over ~6-10 frames (~100-150 ms at 60 fps render). DECAY of 0.85 per
  // frame ≈ half-life of ~4 frames; small enough offsets snap to zero
  // to avoid sub-pixel jitter.
  const off = onl.visualPosOffset;
  if (off) {
    const DECAY = 0.85;
    off.x *= DECAY;
    off.y *= DECAY;
    off.z *= DECAY;
    if (Math.abs(off.x) < 0.01) off.x = 0;
    if (Math.abs(off.y) < 0.01) off.y = 0;
    if (Math.abs(off.z) < 0.01) off.z = 0;
  }

  // Apply the smoothing offset to the local fighter only — remote is
  // already softened by interpolateRemoteFighter().
  if (cameraFighter && off && (off.x !== 0 || off.y !== 0 || off.z !== 0)) {
    cameraFighter = {
      ...cameraFighter,
      pos: {
        x: cameraFighter.pos.x + off.x,
        y: cameraFighter.pos.y + off.y,
        z: cameraFighter.pos.z + off.z
      }
    };
  }

  if (cameraFighter) mirrorFighterToMech(cameraFighter, state.player);
  if (otherFighter) mirrorFighterToMech(otherFighter, state.enemy);

  // 2v2: mirror ally + enemy2 from interpolated snapshots (same path as the
  // primary opponent — both are remote fighters from this client's view).
  if (state.mode === '2v2' && onl.slotMap) {
    if (state.ally && onl.slotMap.allyId) {
      const af = interpolateRemoteFighter(onl.slotMap.allyId, prevSnap, snap, lastSnapAt, realNow);
      if (af) mirrorFighterToMech(af, state.ally);
    }
    if (state.enemy2 && onl.slotMap.enemy2Id) {
      const ef = interpolateRemoteFighter(onl.slotMap.enemy2Id, prevSnap, snap, lastSnapAt, realNow);
      if (ef) mirrorFighterToMech(ef, state.enemy2);
    }
  }

  // Sync the player's local current-target reference to whatever the server
  // says (cameraFighter.targetId). The server is authoritative for cycle
  // behaviour — client just reparents the reticle to match.
  if (cameraFighter?.targetId && state.mode === '2v2' && onl.slotMap) {
    const tgt = cameraFighter.targetId === onl.slotMap.enemyId ? state.enemy
      : cameraFighter.targetId === onl.slotMap.enemy2Id ? state.enemy2
      : null;
    if (tgt && tgt !== state.playerCurrentTarget) {
      state.playerCurrentTarget = tgt;
      if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
      tgt.root.add(state.reticle);
      state.reticleLastEnemyFireAt = tgt.state.lastFireAt;
      state.reticleEnemyFiringUntil = 0;
    }
  }
  // Defensive: in 2v2 if our locally-tracked target is dead but another
  // enemy is still alive, repoint state.playerCurrentTarget locally. The
  // server's applyInput auto-fallback already does this server-side, but in
  // the snapshot-lag window (RTT + 25 ms tick) the reticle would otherwise
  // hover on the corpse. Bullets themselves are server-driven, so they'll
  // land correctly once the next snapshot delivers the updated targetId.
  if (state.mode === '2v2' && state.playerCurrentTarget && state.playerCurrentTarget.state.hp <= 0) {
    const live = [state.enemy, state.enemy2].find((m) => m && m.state.hp > 0);
    if (live && live !== state.playerCurrentTarget) {
      state.playerCurrentTarget = live;
      if (state.reticle?.parent) state.reticle.parent.remove(state.reticle);
      live.root.add(state.reticle);
      state.reticleLastEnemyFireAt = live.state.lastFireAt;
      state.reticleEnemyFiringUntil = 0;
    }
  }

  // HUD + glow timing uses the prediction's server-clock time (anchored to
  // snap.serverTime, advanced by tick rate), NOT the client wall clock. The
  // local player's predicted timestamps (lastFireAt, reloadingUntil,
  // invulnerableUntil) live in that clock, so plain Date.now() reads off by the
  // client↔server clock skew — most visible as the sniper's 1 s fire-cooldown
  // ring being wrong. Falls back to the snapshot time for non-slot spectators.
  const hudNow = onl.lastPredSimTime || snap.serverTime;
  const immuneNow = hudNow;
  getAllFighters().forEach((m) => {
    applyImmunityGlow(m, immuneNow < m.state.invulnerableUntil);
  });

  const ddx = state.enemy.root.position.x - state.player.root.position.x;
  const ddz = state.enemy.root.position.z - state.player.root.position.z;
  if (ddx * ddx + ddz * ddz > 1e-6) {
    const yaw = Math.atan2(ddx, ddz);
    state.player.root.rotation.y = yaw;
    state.enemy.root.rotation.y = yaw + Math.PI;
  }

  updateLocksAndReticle();
  updateAllyArrow();
  updateEnemyArrow();
  getAllFighters().forEach((m) => {
    tickGlintRemoval(m);
    updateGlintScale(m, hudNow);
  });
  updateVfx(dt);
  updateCamera();
  updateMechXRayVisibility();
  updateWallFade();
  updateBeamVisuals(performance.now());
  syncOnlineChargedBeams(hudNow);
  updateLaserSights();
  updateHud(hudNow);
}

function tickOnline(dt, _now) {
  const onl = state.online;
  if (!onl) return;
  const conn = onl.conn;

  // Sync to the connection's playerId — it can change when the player swaps
  // slots in the lobby (server sends a fresh player:assigned event).
  const connPid = conn.getPlayerId();
  if (connPid && onl.myPlayerId !== connPid) {
    onl.myPlayerId = connPid;
    // Force the lobby UI to re-render with the new slot info.
    onl.lastWaitingSig = null;
  }
  // Mode is committed by the host via the in-flow `pick-mode` UI phase
  // (showOnlineModePicker). The auto-push from state.mode that used to be
  // here was removed — the offline chip no longer drives the online mode.
  // For joiners (non-p1), they don't push mode at all; the server's
  // existing lobby.mode is what they inherit. We force-set modePushedToServer
  // on the client to true for joiners so they skip the pick-mode phase.
  if (onl.myPlayerId && onl.myPlayerId !== 'p1' && !onl.modePushedToServer) {
    onl.modePushedToServer = true;
  }
  if (!conn.isConnected() && conn.getLastError()) {
    showOnlineOverlay(`Connection error: ${conn.getLastError()}`);
  }

  // Phase machine — re-render UI on transition.
  const targetPhase = computeOnlineUiPhase(onl, conn);
  if (targetPhase !== onl.uiSubPhase) {
    const prevPhase = onl.uiSubPhase;
    onl.uiSubPhase = targetPhase;
    renderOnlineUi(targetPhase, prevPhase, onl, conn);
  } else if (targetPhase === 'waiting-opp') {
    // Re-render waiting-opp on opponent config changes (their unit pick etc).
    refreshWaitingOppIfStale(onl, conn);
  } else if (targetPhase === 'ended') {
    // Re-render end menu / overlay when rematch readiness changes.
    refreshEndMenuIfStale(onl, conn);
  }

  if (targetPhase === 'playing') {
    runOnlineMatchFrame(dt, onl, conn);
  }
}

function refreshWaitingOppIfStale(onl, conn) {
  const cfg = conn.getLobbyConfig();
  // Include mode + occupied so a mode toggle or another player joining
  // triggers a re-render (otherwise just the config object stays the same).
  const sig = JSON.stringify({
    config: cfg?.config ?? {},
    mode: cfg?.mode ?? '1v1',
    occupied: cfg?.occupied ?? [],
    botUnits: cfg?.botUnits ?? {}
  });
  if (onl.lastWaitingSig === sig) return;
  onl.lastWaitingSig = sig;
  // Rebuild the menu in place.
  clearMenus();
  showOnlineWaitingOpp(onl, conn);
}

function showSelectMenu() {
  cleanupMatch();
  clearMenus();
  state.phase = 'select';
  state.running = false;
  state.hud?.remove();
  renderer.domElement.style.pointerEvents = 'none';

  const unitEntries = Object.entries(UNIT_DATA);

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `<h2>Select Your Unit</h2>
    <div class="menu-divider">— Offline —</div>
    <div class="mode-chip">
      <button data-mode="1v1" class="${state.mode === '1v1' ? 'mode-active' : ''}">1v1</button>
      <button data-mode="2v2" class="${state.mode === '2v2' ? 'mode-active' : ''}">2v2</button>
    </div>
    ${unitGridHTML(unitEntries)}
    <div class="menu-divider">— Online —</div>
    <button data-online-play class="online-play-btn">Online (vs Player)</button>
    <button data-online-debug class="online-debug-btn">Server Boot-up</button>
    <button data-guide class="guide-btn">Guide</button>`;
  app.appendChild(menu);

  menu.querySelectorAll('.mode-chip button').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      state.mode = btn.dataset.mode;
      menu.querySelectorAll('.mode-chip button').forEach((b) => b.classList.remove('mode-active'));
      btn.classList.add('mode-active');
    });
  });

  menu.querySelector('button[data-online-play]').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startOnlineMatch();
  });

  menu.querySelector('button[data-online-debug]').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    import('./online/debugPanel.js').then(({ showOnlineDebugPanel }) => {
      showOnlineDebugPanel(app);
    });
  });

  menu.querySelector('button[data-guide]').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    showGuidePopup();
  });

  wireUnitGrid(menu, (key) => {
    state.playerUnitKey = key;
    clearMenus();
    proceedAfterPlayerPick();
  });
}

// 2v2 flow: player pick → (ally pick) → enemy pick → (enemy2 pick) → map.
// In 1v1 the bracketed steps are skipped and the chain is identical to before.
function proceedAfterPlayerPick() {
  if (state.mode === '2v2') {
    showUnitPicker('Select Ally Unit', (key) => {
      state.allyUnitKey = key;
      proceedToEnemyPick();
    });
  } else {
    proceedToEnemyPick();
  }
}
function proceedToEnemyPick() {
  showUnitPicker('Select Enemy Unit', (key) => {
    state.enemyUnitKey = key;
    if (state.mode === '2v2') {
      showUnitPicker('Select Enemy 2 Unit', (key2) => {
        state.enemy2UnitKey = key2;
        showMapPicker();
      });
    } else {
      showMapPicker();
    }
  });
}
// ---------------------------------------------------------------------------
// Unit thumbnail picker — shared by the offline player/ally/enemy pickers and
// the online lobby. Renders a thumbnail grid (portrait + "Character / Weapon"
// label). First tap previews: the card frame glows and the character's full
// profile art pops up beside it. Tapping the SAME card again confirms; tapping
// another card switches the preview; tapping anywhere else cancels back to the
// plain grid.
// ---------------------------------------------------------------------------
let _activeProfilePopup = null;
function removeProfilePopup() {
  if (_activeProfilePopup) { _activeProfilePopup.remove(); _activeProfilePopup = null; }
}
function showProfilePopup(card, spriteKey, char, onConfirm) {
  removeProfilePopup();
  const popup = document.createElement('div');
  popup.className = 'unit-profile-popup';
  popup.innerHTML = `<img src="${import.meta.env.BASE_URL}units/${spriteKey}_profile.png" alt="${char || ''}" draggable="false" />`;
  document.body.appendChild(popup);
  _activeProfilePopup = popup;
  // Tapping the profile art confirms the pending selection — same as a second
  // tap on the thumbnail.
  popup.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onConfirm) onConfirm();
  });
  // Position beside the card; flip to the left edge if it would run off-screen.
  const place = () => {
    const r = card.getBoundingClientRect();
    const pw = popup.offsetWidth || 150;
    const ph = popup.offsetHeight || 200;
    let left = r.right + 12;
    if (left + pw > window.innerWidth - 8) left = r.left - pw - 12;
    const top = Math.min(Math.max(8, r.top + r.height / 2 - ph / 2), window.innerHeight - ph - 8);
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${top}px`;
  };
  place();
  const img = popup.querySelector('img');
  if (img) img.addEventListener('load', place);
}
// Grid markup for Object.entries(UNIT_DATA). Label is "Char<br>Weapon" where
// Weapon is the part of unit.name after the "/".
function unitGridHTML(unitEntries) {
  return `<div class="unit-grid">${unitEntries.map(([id, u]) => {
    const weapon = (u.name.split('/')[1] || u.name).trim();
    const thumb = `${import.meta.env.BASE_URL}units/${u.spriteKey}_profile_thumbnail.png`;
    return `<button class="unit-card" data-unit-card="${id}">
      <img class="unit-thumb" src="${thumb}" alt="${u.char || id}" draggable="false" />
      <span class="unit-label">${u.char || u.name}<br>${weapon}</span>
    </button>`;
  }).join('')}</div>`;
}
// Wire preview→confirm onto a menu containing a .unit-grid. onPick(unitKey)
// fires on the confirming (second) tap of the same card.
function wireUnitGrid(menu, onPick) {
  const grid = menu.querySelector('.unit-grid');
  if (!grid) return;
  let pendingKey = null;
  const clearPending = () => {
    pendingKey = null;
    grid.querySelectorAll('.unit-card.selecting').forEach((c) => c.classList.remove('selecting'));
    removeProfilePopup();
  };
  grid.querySelectorAll('.unit-card').forEach((card) => {
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = card.dataset.unitCard;
      if (pendingKey === key) { clearPending(); onPick(key); return; }
      clearPending();
      pendingKey = key;
      card.classList.add('selecting');
      const u = UNIT_DATA[key];
      showProfilePopup(card, u.spriteKey, u.char, () => { clearPending(); onPick(key); });
    });
  });
  // Tap anywhere else in the menu → cancel the preview, back to plain selection.
  menu.addEventListener('pointerdown', () => { if (pendingKey) clearPending(); });
}

function showUnitPicker(title, onPick) {
  const unitEntries = Object.entries(UNIT_DATA);
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `<h2>${title}</h2>${unitGridHTML(unitEntries)}`;
  app.appendChild(menu);
  wireUnitGrid(menu, (key) => {
    clearMenus();
    onPick(key);
  });
}
function showMapPicker() {
  const mapEntries = Object.entries(MAP_DATA);
  const mapMenu = document.createElement('div');
  mapMenu.className = 'menu';
  mapMenu.innerHTML = `<h2>Select Map</h2>
    <label style="display:flex;align-items:center;justify-content:center;gap:8px;margin:10px 0 14px;color:#d8fcff;">
      <input type="checkbox" id="dummy-mode-toggle" />
      Dummy (BOT projectile damage = 0)
    </label>
    ${mapEntries.map(([id, map]) => `<button data-map="${id}">${map.name}</button>`).join('')}`;
  app.appendChild(mapMenu);
  const dummyModeToggle = mapMenu.querySelector('#dummy-mode-toggle');
  dummyModeToggle.checked = !!state.dummyMode;
  dummyModeToggle.addEventListener('change', () => {
    state.dummyMode = dummyModeToggle.checked;
  });

  mapMenu.querySelectorAll('button[data-map]').forEach((mapButton) => {
    mapButton.addEventListener('pointerdown', (mapEvent) => {
      mapEvent.preventDefault();
      state.mapKey = mapButton.dataset.map;
      startMatch();
    });
  });
}

function showGuidePopup() {
  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';
  overlay.innerHTML = `
    <div class="guide-overlay-inner">
      <div class="guide-card">
        <div class="guide-card-header">
          <h3>Guide</h3>
          <button class="guide-close-btn" aria-label="Close">×</button>
        </div>
        <div class="guide-card-body">
          <p>Gun VS Gun — A fast-paced duel gunfight.</p>
          <p class="guide-tagline">No aiming problem — resource management is the key.</p>

          <h4>Controls</h4>
          <ul>
            <li>Mobile — On-screen buttons.</li>
            <li>PC — WASD move · J fire · K sprint · L dodge · Space jump · U target switch.</li>
          </ul>

          <h4>Game Mechanics</h4>
          <ul>
            <li>Your character auto-locks on the enemy.</li>
            <li>Sprint and dodge help you avoid hits, but both cost stamina.</li>
            <li>Stamina has a cap and needs time to refill.</li>
            <li>Use cover for safe recovery and pick the best angle for your weapon.</li>
          </ul>
          <div class="guide-list-gap"></div>
          <ul>
            <li>Double-tap sprint to lock it on — handy on mobile. Mind the drain.</li>
            <li>Character can't be hit during a dodge.</li>
            <li>Sniper has a forced aim time. Sprint can cancel the aim and fire instantly (costs stamina).</li>
          </ul>
        </div>
      </div>
    </div>`;
  app.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.guide-close-btn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    close();
  });
  // Use 'click' for backdrop close so a drag-to-scroll on the overlay padding
  // doesn't accidentally dismiss the popup mid-gesture. Close fires for taps
  // on the overlay OR its inner wrapper (the padded backdrop area).
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('guide-overlay-inner')) close();
  });
}

function setupRootTouchAction() {
  document.documentElement.style.touchAction = 'none';
  document.body.style.touchAction = 'none';
  app.style.touchAction = 'none';
}

// ---- Pseudo-fullscreen toggle ----
// Single button (top-right corner) that maximizes available canvas area.
// Behavior per platform:
//   Desktop + Android + iPad:  Triggers the real Fullscreen API → true
//                              fullscreen with no browser chrome.
//   iPhone Safari/Chrome:      Real API silently no-ops (Apple blocks it),
//                              but we still switch #app from 100vh → 100dvh
//                              (so the canvas sizes to the actually-visible
//                              area instead of extending behind the URL bar)
//                              and trigger the scroll-trick to retract the
//                              URL bar into compact mode. Net: ~10–15% more
//                              usable canvas without any popups or hints.
// Toggle off reverses everything; Escape on desktop also fully exits.
let pseudoFullscreenActive = false;

function isRealFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function tryEnterRealFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const r = req.call(el);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (_) { /* no-op — missing user gesture or unsupported */ }
}
function tryExitRealFullscreen() {
  if (!isRealFullscreen()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return;
  try {
    const r = exit.call(document);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (_) { /* no-op */ }
}
function hideMobileChrome() {
  // iOS Safari scroll-trick: scrolling the page even 1 px retracts the URL
  // bar into its compact form. No effect on desktop or Android, where the
  // chrome is either absent or doesn't scroll-retract.
  window.scrollTo(0, 1);
}

function togglePseudoFullscreen() {
  if (pseudoFullscreenActive) {
    pseudoFullscreenActive = false;
    document.body.classList.remove('pseudo-fullscreen');
    tryExitRealFullscreen();
  } else {
    pseudoFullscreenActive = true;
    document.body.classList.add('pseudo-fullscreen');
    tryEnterRealFullscreen();
    hideMobileChrome();
    // iOS sometimes restores the URL bar a beat after layout settles;
    // re-apply the scroll-trick once after a short delay to catch that.
    setTimeout(hideMobileChrome, 250);
  }
  // Manually dispatch resize so renderer + camera pick up the new canvas
  // dimensions immediately, ahead of the browser's own resize event.
  window.dispatchEvent(new Event('resize'));
}

// SVG icons: 4 corner brackets pointing outward (enter) / inward (exit).
// Inline so they inherit currentColor and need no extra assets.
const FS_ICON_ENTER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 9 3 3 9 3"/><polyline points="21 9 21 3 15 3"/><polyline points="3 15 3 21 9 21"/><polyline points="21 15 21 21 15 21"/></svg>';
const FS_ICON_EXIT  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 3 9 9 3 9"/><polyline points="15 3 15 9 21 9"/><polyline points="9 21 9 15 3 15"/><polyline points="15 21 15 15 21 15"/></svg>';

function setupFullscreenToggle() {
  const btn = document.createElement('button');
  btn.id = 'fullscreen-btn';
  btn.className = 'fullscreen-btn';
  btn.type = 'button';
  btn.title = 'Toggle fullscreen';
  const syncIcon = () => {
    const on = pseudoFullscreenActive || isRealFullscreen();
    btn.innerHTML = on ? FS_ICON_EXIT : FS_ICON_ENTER;
  };
  syncIcon();
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePseudoFullscreen();
    syncIcon();
  });
  // If the user presses Escape (desktop) to leave real fullscreen, also
  // drop pseudo-fullscreen state so the body class doesn't get stranded.
  const onChange = () => {
    if (!isRealFullscreen() && pseudoFullscreenActive) {
      pseudoFullscreenActive = false;
      document.body.classList.remove('pseudo-fullscreen');
      window.dispatchEvent(new Event('resize'));
    }
    syncIcon();
  };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  // Re-apply the scroll-trick on orientation change while in pseudo mode —
  // iOS Safari resets the URL bar state when you rotate the device.
  window.addEventListener('orientationchange', () => {
    if (pseudoFullscreenActive) setTimeout(hideMobileChrome, 120);
  });
  app.appendChild(btn);
}

window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('gesturechange', (e) => e.preventDefault());
window.addEventListener('gestureend', (e) => e.preventDefault());

window.addEventListener('dblclick', (e) => {
  if (!e.target.closest('.menu') && !e.target.closest('.pause-btn')) e.preventDefault();
});

window.addEventListener('touchstart', (e) => {
  if (!e.target.closest('.menu') && !e.target.closest('.pause-btn') && !e.target.closest('.guide-overlay')) e.preventDefault();
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastSprintKeyAt = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keyState.up = true;
  else if (k === 's' || e.key === 'ArrowDown') keyState.down = true;
  else if (k === 'a' || e.key === 'ArrowLeft') keyState.left = true;
  else if (k === 'd' || e.key === 'ArrowRight') keyState.right = true;
  else if (k === ' ') input.jump = true;
  else if (k === 'k') {
    const now = performance.now();
    const hasDir = Math.hypot(input.x, input.y) > 0.15;
    if (now - lastSprintKeyAt < 260 && hasDir) input.sprintLocked = true;
    lastSprintKeyAt = now;
    input.boostHeld = true; input.boost = true;
  }
  else if (k === 'l') input.stepTap = true;
  else if (k === 'j') { input.shootTap = true; input.shootHold = true; }
  else if (k === 'u') cyclePlayerTarget();
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keyState.up = false;
  else if (k === 's' || e.key === 'ArrowDown') keyState.down = false;
  else if (k === 'a' || e.key === 'ArrowLeft') keyState.left = false;
  else if (k === 'd' || e.key === 'ArrowRight') keyState.right = false;
  else if (k === ' ') input.jump = false;
  else if (k === 'k') { input.boostHeld = false; if (!input.sprintLocked) input.boost = false; }
  else if (k === 'j') input.shootHold = false;
  const hasKeyboardDir = keyState.up || keyState.down || keyState.left || keyState.right;
  if (!hasKeyboardDir) input.sprintLocked = false;
});

function syncKeyboardMovement() {
  const hasKeyboardDir = keyState.up || keyState.down || keyState.left || keyState.right;
  if (!hasKeyboardDir) {
    if (!touchSteeringActive) {
      input.x = 0;
      input.y = 0;
    }
    return;
  }

  const x = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
  const y = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  input.x = x / len;
  input.y = y / len;
}

setupRootTouchAction();
setupFullscreenToggle();
showSelectMenu();
animate();

function showEndMenu(win) {
  state.phase = 'end';
  state.running = false;
  hideAllyEdgeArrow();
  hideEnemyEdgeArrow();
  clearMenus();

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <h2>${win ? 'YOU WIN' : 'YOU LOSE'}</h2>
    <button id="rematch">Rematch</button>
    <button id="select">Select Unit</button>
  `;
  app.appendChild(menu);

  menu.querySelector('#rematch').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startMatch();
  });
  menu.querySelector('#select').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    showSelectMenu();
  });
}

function triggerEnemyEvasion(now) {
  if (state.enemy.state.hp <= 0 || now <= state.enemy.state.evadeCooldownUntil || Math.random() > 0.6) return;
  const toPlayer = new THREE.Vector3().subVectors(state.player.root.position, state.enemy.root.position).setY(0).normalize();
  const side = Math.random() > 0.5 ? new THREE.Vector3(-toPlayer.z, 0, toPlayer.x) : new THREE.Vector3(toPlayer.z, 0, -toPlayer.x);
  const shouldDash = Math.random() > 0.5;
  if (shouldDash) {
    state.enemy.body.velocity.x += side.x * 28;
    state.enemy.body.velocity.z += side.z * 28;
    state.enemy.state.action = 'dash';
  } else {
    state.enemy.body.velocity.x += side.x * 18;
    state.enemy.body.velocity.z += side.z * 18;
    state.enemy.state.action = 'dash';
  }
  state.enemy.state.evadeHomingUntil = now + 260;
  state.enemy.state.evadeCooldownUntil = now + 520;
}

function clearIncomingHoming(mech, now) {
  mech.state.evadeHomingUntil = now + STEP_HOMING_CUT_MS;
  for (const projectile of state.projectiles) {
    if (projectile.target !== mech) continue;
    projectile.homing = false;
    projectile.homingLost = true;
  }
}

function triggerDashDefense(now) {
  state.player.state.dashRecoverUntil = now + 180;
}

function PhaserLikeBetween(min, max) {
  return min + Math.random() * (max - min);
}

function spawnHitEffect(position, color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.58, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.position.copy(position).add(new THREE.Vector3(0, 1.4, 0));
  ring.lookAt(camera.position);
  scene.add(ring);
  state.vfx.push({ mesh: ring, life: 0.18, growth: 1.26 });
}

function spawnMeleeHitboxVisual(mech, color, scaleBoost = 1) {
  const slash = new THREE.Mesh(
    new THREE.TorusGeometry(2.5 * scaleBoost, 0.18 * scaleBoost, 12, 36, Math.PI * 1.05),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  slash.position.copy(mech.root.position).add(new THREE.Vector3(0, 1.15, 2.55));
  slash.rotation.x = Math.PI / 2.6;
  slash.rotation.y = mech.root.rotation.y;
  scene.add(slash);
  state.vfx.push({ mesh: slash, life: 0.22, growth: 1.0, followMech: mech, followYOffset: 1.15, followForward: 2.55 });
}

function getMeleeHitboxCenter(mech, forward = 2.55) {
  return new THREE.Vector3(
    mech.root.position.x + Math.sin(mech.root.rotation.y) * forward,
    mech.root.position.y + 1.15,
    mech.root.position.z + Math.cos(mech.root.rotation.y) * forward
  );
}

function showPauseMenu() {
  if (!state.running || state.phase !== 'match') return;
  state.running = false;
  state.phase = 'pause';
  hideAllyEdgeArrow();
  hideEnemyEdgeArrow();
  clearMenus();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `<h2>Paused</h2><button data-action="resume">Resume</button><button data-action="new">New Game</button>`;
  app.appendChild(menu);
  menu.querySelector('button[data-action="resume"]').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    clearMenus();
    state.phase = 'match';
    state.running = true;
  });
  menu.querySelector('button[data-action="new"]').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    showSelectMenu();
  });
}

function clearMenus() {
  removeProfilePopup();
  document.querySelectorAll('.menu').forEach((menu) => menu.remove());
}

function inheritMomentum(mech, momentumValue = MOMENTUM_STANDARD) {
  const factor = momentumValue / MOMENTUM_STANDARD;
  mech.state.momentumVX = mech.body.velocity.x * factor;
  mech.state.momentumVZ = mech.body.velocity.z * factor;
}

function applyMomentum(mech, { suspend = false } = {}) {
  if (suspend) return;
  mech.body.velocity.x += mech.state.momentumVX;
  mech.body.velocity.z += mech.state.momentumVZ;
  mech.state.momentumVX *= mech.state.momentumDecay;
  mech.state.momentumVZ *= mech.state.momentumDecay;
  if (Math.abs(mech.state.momentumVX) < 0.02) mech.state.momentumVX = 0;
  if (Math.abs(mech.state.momentumVZ) < 0.02) mech.state.momentumVZ = 0;
}


const arenaSurfaces = [];
const SURFACE_STEP_HEIGHT = 1.6;

// Camera-proximity wall fade: registered walls (state.wallFadeMeshes, set by
// map builders) ease to translucent when the camera gets close, so backing
// into a wall or hugging the plateau edge doesn't fill the screen with a
// solid face. Render-only; collision is untouched.
function updateWallFade() {
  const list = state.wallFadeMeshes;
  if (!list || list.length === 0) return;
  for (const mesh of list) {
    const b = mesh.userData.fadeBox;
    if (!b || !mesh.material) continue;
    let blocking;
    if (b.occlude) {
      // Occlusion mode (Streets buildings): fade only while the box actually
      // sits between the camera and the player unit — walking past or
      // fighting beside it keeps it fully solid (no seeing through cover).
      const pr = state.player?.root;
      blocking = !!pr && segmentHitsObstacle(
        camera.position,
        { x: pr.position.x, y: pr.position.y + 1.6, z: pr.position.z },
        b
      );
    } else {
      // Proximity mode (edge walls, plateau, overhead signage): fade when the
      // camera closes within 14 units of the box.
      const cx = Math.max(b.minX, Math.min(camera.position.x, b.maxX));
      const cy = Math.max(b.minY, Math.min(camera.position.y, b.maxY));
      const cz = Math.max(b.minZ, Math.min(camera.position.z, b.maxZ));
      const d = Math.hypot(camera.position.x - cx, camera.position.y - cy, camera.position.z - cz);
      blocking = d < 14;
    }
    const target = blocking ? 0.25 : 1;
    mesh.material.opacity += (target - mesh.material.opacity) * 0.2;
    // Depth-toggled groups (Station's trains): write depth while solid
    // (self-occluding — no seeing the car's inside structure), stop while
    // faded (no depth = the own-unit X-ray can't patch onto the ghost).
    if (mesh.userData.fadeDepthToggle) {
      mesh.material.depthWrite = mesh.material.opacity > 0.95;
    }
  }
}

// Register a mesh for the camera-proximity fade above. The mesh needs its
// OWN material instance — clone shared materials before registering, or
// every object using that material fades together.
function registerWallFade(mesh, box) {
  mesh.material.transparent = true;
  mesh.userData.fadeBox = box;
  if (!state.wallFadeMeshes) state.wallFadeMeshes = [];
  state.wallFadeMeshes.push(mesh);
}

// Offline nav grid — built lazily from arenaObstacles/arenaSurfaces on the
// bots' first Maze plan, dropped on every map rebuild.
let offlineNavGrid = null;

function clearArenaDecor() {
  state.wallFadeMeshes = [];
  offlineNavGrid = null;
  while (arenaDecor.length) {
    const obj = arenaDecor.pop();
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  }
  arenaObstacles.length = 0;
  arenaSurfaces.length = 0;
}

function addBlockingBox({ x, y, z, sx, sy, sz, material, topBuffer, decorOnly, invisible, noProjectile }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.userData.blocking = !decorOnly;
  if (invisible) mesh.visible = false;   // collision-only helper (e.g. ramp skirts)
  scene.add(mesh);
  arenaDecor.push(mesh);
  if (decorOnly) return mesh;
  const obstacle = { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, minY: y - sy / 2, maxY: y + sy / 2 };
  if (topBuffer !== undefined) obstacle.topBuffer = topBuffer;
  if (noProjectile) obstacle.noProjectile = true;   // unit fence: bullets pass through
  arenaObstacles.push(obstacle);
  return mesh;
}

function addPlatform({ minX, maxX, minZ, maxZ, top, material, thickness = 0.5 }) {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, thickness, sz), material);
  mesh.position.set((minX + maxX) / 2, top - thickness / 2, (minZ + maxZ) / 2);
  scene.add(mesh);
  arenaDecor.push(mesh);
  // `type`/`top` mirror the serialized shape in shared/src/sim/arena.js so the
  // collision exporter (exportArenaCollision) can round-trip this surface; the
  // sim reconstructs heightAt from them via materializeSurface().
  arenaSurfaces.push({ minX, maxX, minZ, maxZ, maxTop: top, type: 'flat', top, heightAt: () => top });
  return mesh;
}

function addRamp({ minX, maxX, minZ, maxZ, axis, lowY, highY, material, thickness = 0.6 }) {
  const lowEnd = axis === 'x' ? minX : minZ;
  const highEnd = axis === 'x' ? maxX : maxZ;
  const span = (highEnd - lowEnd) || 1;
  const dy = highY - lowY;
  const angle = Math.atan2(dy, Math.abs(span));
  const length = Math.hypot(span, dy);
  const width = axis === 'x' ? (maxZ - minZ) : (maxX - minX);
  const geo = axis === 'x'
    ? new THREE.BoxGeometry(length, thickness, width)
    : new THREE.BoxGeometry(width, thickness, length);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((minX + maxX) / 2, (lowY + highY) / 2, (minZ + maxZ) / 2);
  // Rotation signs differ per axis: about Z, +angle lifts the +X end; about X,
  // -angle lifts the +Z end. (The old unconditional -angle made axis-x ramp
  // MESHES slope the wrong way while the walkable surface was correct.)
  if (axis === 'x') mesh.rotation.z = angle;
  else mesh.rotation.x = -angle;
  scene.add(mesh);
  arenaDecor.push(mesh);
  arenaSurfaces.push({
    minX, maxX, minZ, maxZ,
    maxTop: Math.max(lowY, highY),
    // `type`/`axis`/`lowY`/`highY` mirror the serialized shape the sim consumes
    // (materializeSurface) so the collision exporter can round-trip this ramp.
    type: 'ramp', axis, lowY, highY,
    heightAt(x, z) {
      const v = axis === 'x' ? x : z;
      const t = (v - lowEnd) / span;
      const c = Math.max(0, Math.min(1, t));
      return lowY + dy * c;
    }
  });
  return mesh;
}

// Adds the standard play-area edge: a 4-sided invisible (collision-only)
// perimeter wall plus a red glowing floor stripe inset 1.6 units inside it
// on each side. The wall is 2 units thick and `ceilY` tall, sitting just
// outside (HALF_X..HALF_X+2 etc.) the play extent so the camera never clips
// against a solid mesh when the player backs into a corner. Mirrors the
// pattern Station uses inline.
function addBoundaryIndicator(HALF_X, HALF_Z, CEIL_Y) {
  arenaObstacles.push(
    { minX: -HALF_X - 2, maxX: HALF_X + 2, minZ: HALF_Z, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y },
    { minX: -HALF_X - 2, maxX: HALF_X + 2, minZ: -HALF_Z - 2, maxZ: -HALF_Z, minY: 0, maxY: CEIL_Y },
    { minX: -HALF_X - 2, maxX: -HALF_X, minZ: -HALF_Z - 2, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y },
    { minX: HALF_X, maxX: HALF_X + 2, minZ: -HALF_Z - 2, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y }
  );
  const boundaryGlow = new THREE.MeshStandardMaterial({
    color: 0xff2a32, emissive: 0xff2a32, emissiveIntensity: 1.4, roughness: 0.4
  });
  const stripeInset = 1.6;
  for (const zEdge of [HALF_Z - stripeInset, -(HALF_Z - stripeInset)]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X - 4, 1.4), boundaryGlow);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.05, zEdge);
    scene.add(s); arenaDecor.push(s);
  }
  for (const xEdge of [HALF_X - stripeInset, -(HALF_X - stripeInset)]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2 * HALF_Z - 4), boundaryGlow);
    s.rotation.x = -Math.PI / 2;
    s.position.set(xEdge, 0.05, 0);
    scene.add(s); arenaDecor.push(s);
  }
}

function groundHeightAt(x, z, currentSurfaceY = 0) {
  let best = 0;
  for (const s of arenaSurfaces) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > currentSurfaceY + SURFACE_STEP_HEIGHT) continue;
    if (h > best) best = h;
  }
  return best;
}

function getGroundLevelY(mech) {
  const pos = mech.body.position;
  const currentSurfaceY = pos.y - GROUND_BASE_Y;
  return groundHeightAt(pos.x, pos.z, currentSurfaceY) + GROUND_BASE_Y;
}

function surfaceHeightAtXZ(x, z) {
  let best = -Infinity;
  for (const s of arenaSurfaces) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const h = s.heightAt(x, z);
    if (h > best) best = h;
  }
  return best;
}

function applyMapAmbience(mapKey) {
  // Defaults — match the original dim atmosphere used by Plain Field & Streets.
  scene.background.setHex(0x0b0f17);
  scene.fog.color.setHex(0x0b0f17);
  scene.fog.near = 28;
  scene.fog.far = 160;
  ambient.color.setHex(0x8cb2ff);
  ambient.intensity = 0.7;
  key.color.setHex(0xe5eeff);
  key.intensity = 1.15;
  if (mapKey === 'square' || mapKey === 'arena2') {
    // Overcast daylight palette — shared by Square and Streets.
    scene.background.setHex(0x6e8ba3);
    scene.fog.color.setHex(0x8ea3b6);
    scene.fog.near = 70;
    scene.fog.far = 280;
    ambient.color.setHex(0xb4c6db);
    ambient.intensity = 0.65;
    key.color.setHex(0xc4d2e2);
    key.intensity = 1.0;
  } else if (mapKey === 'lobby') {
    // Sleek sci-fi lobby: bright interior, deep blue night-sky background through the glass wall.
    scene.background.setHex(0x141d33);
    scene.fog.color.setHex(0x16213a);
    scene.fog.near = 60;
    scene.fog.far = 260;
    ambient.color.setHex(0xd4e2ff);
    ambient.intensity = 0.95;
    key.color.setHex(0xeaf2ff);
    key.intensity = 1.4;
  } else if (mapKey === 'factory') {
    scene.background.setHex(0x141821);
    scene.fog.color.setHex(0x14181f);
    scene.fog.near = 40;
    scene.fog.far = 200;
    ambient.color.setHex(0xc4d4e8);
    ambient.intensity = 0.6;
    key.color.setHex(0xfff6e0);
    key.intensity = 1.05;
  } else if (mapKey === 'station') {
    // Industrial terminal hall: cool steel-grey base with sodium-yellow platform lights.
    scene.background.setHex(0x10141c);
    scene.fog.color.setHex(0x141a24);
    scene.fog.near = 45;
    scene.fog.far = 210;
    ambient.color.setHex(0xbfd0e2);
    ambient.intensity = 0.6;
    key.color.setHex(0xffe9b8);
    key.intensity = 1.0;
  } else if (mapKey === 'flashpoint') {
    // Industrial CQB arena, well-lit for readability. Cool steel-blue base
    // ambient with a warm sodium key light over the concrete; fog kept
    // mid-range so the room dividers still read as silhouettes at the back
    // of the hall without losing target visibility.
    scene.background.setHex(0x2a3140);
    scene.fog.color.setHex(0x2c3340);
    scene.fog.near = 45;
    scene.fog.far = 200;
    ambient.color.setHex(0xc4d2e2);
    ambient.intensity = 0.95;
    key.color.setHex(0xfff0d0);
    key.intensity = 1.3;
  } else if (mapKey === 'airport') {
    // Bright daylight departure hall: white terminal light, pale sky seen
    // through the glass curtain walls, long fog range for the big sightlines.
    scene.background.setHex(0x9db8cc);
    scene.fog.color.setHex(0xaebfd0);
    scene.fog.near = 80;
    scene.fog.far = 340;
    ambient.color.setHex(0xe8f0fa);
    ambient.intensity = 1.0;
    key.color.setHex(0xffffff);
    key.intensity = 1.35;
  }
}

function buildArenaForMap(mapKey) {
  clearArenaDecor();
  applyMapAmbience(mapKey);
  if (mapKey === 'arena1') buildPlainFieldArena();
  else if (mapKey === 'arena2') buildStreetsArena();
  else if (mapKey === 'factory') buildFactoryArena();
  else if (mapKey === 'square') buildSquareArena();
  else if (mapKey === 'lobby') buildLobbyArena();
  else if (mapKey === 'station') buildStationArena();
  else if (mapKey === 'flashpoint') buildFlashpointArena();
  else if (mapKey === 'airport') buildAirportArena();
}

// ---------------------------------------------------------------------------
// Dev tool: regenerate the online collision snapshot from this offline build,
// so shared/src/sim/arena.js can't silently drift from the buildXArena()
// geometry. The offline addBlockingBox/addPlatform/addRamp helpers are the
// single source of truth; this serialises their output (arenaObstacles +
// arenaSurfaces) into the exact `{ obstacles, surfaces }` shape that
// GENERATED_ARENA_COLLISION_DATA expects. buildGeneratedArena() prepends the
// runtime perimeter walls via makeBoundaryObstacles(), so the addBoundaryIndicator
// walls baked into arenaObstacles are kept in the dump verbatim — matching how
// the original snapshot was captured.
//
// Console usage:
//   __exportArenaCollision()          // dump the currently-loaded map
//   __exportArenaCollision('arena2')  // rebuild+dump a specific map, then restore
// Then paste the printed block over that map's entry in GENERATED_ARENA_COLLISION_DATA
// and commit client/src/main.js + shared/src/sim/arena.js together. Safety check:
// run it on an UNCHANGED map first and diff — the output should match the file.
function serializeArenaCollision() {
  return {
    // Obstacles are already plain AABBs ({minX..maxY [,topBuffer][,noProjectile]}).
    obstacles: arenaObstacles.map((o) => ({ ...o })),
    // Surfaces drop their heightAt closure; type + top/(axis,lowY,highY) remain
    // and are what materializeSurface() rebuilds heightAt from on the sim side.
    surfaces: arenaSurfaces.map(({ heightAt, ...rest }) => rest)
  };
}

function exportArenaCollision(mapKey) {
  const restoreKey = state.mapKey;
  const target = mapKey || restoreKey;
  if (!target) {
    console.warn('[arena-export] no map loaded — pass one, e.g. __exportArenaCollision("arena2")');
    return '';
  }
  if (target !== restoreKey) buildArenaForMap(target);
  const json = JSON.stringify({ [target]: serializeArenaCollision() }, null, 2);
  if (target !== restoreKey && restoreKey) buildArenaForMap(restoreKey); // restore the live scene
  console.log(`[arena-export] paste over GENERATED_ARENA_COLLISION_DATA["${target}"] in shared/src/sim/arena.js:`);
  console.log(json);
  if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(json).catch(() => {});
  return json;
}
if (typeof window !== 'undefined') window.__exportArenaCollision = exportArenaCollision;

function buildPlainFieldArena() {
  // Plain Field is intentionally featureless — just the boundary so players
  // know the edge of the play area. The 280x280 global ground plane gives a
  // wide visible field; the red stripes + invisible wall sit at +/-120 (so a
  // 240x240 play area with a 20-unit visual buffer to the ground edge). The
  // outer cannon wall at HALF=138 stays as a backstop. CEIL_Y=16 matches the
  // physics wall height so the camera never clips when backing into a corner.
  addBoundaryIndicator(120, 120, 16);
}

function buildStreetsArena() {
  const road = new THREE.MeshStandardMaterial({ color: 0x1f2530, roughness: 0.92 });
  const sidewalk = new THREE.MeshStandardMaterial({ color: 0x8d96a4, roughness: 0.78 });
  const ramp = new THREE.MeshStandardMaterial({ color: 0xb89a3a, roughness: 0.7 });
  const bridgeDeck = new THREE.MeshStandardMaterial({ color: 0x9b8338, roughness: 0.7 });
  const railing = new THREE.MeshStandardMaterial({ color: 0xd4d8df, roughness: 0.55, metalness: 0.4 });
  const storefrontA = new THREE.MeshStandardMaterial({ color: 0xc05650, roughness: 0.78 });
  const storefrontB = new THREE.MeshStandardMaterial({ color: 0x5773a8, roughness: 0.78 });
  const storefrontC = new THREE.MeshStandardMaterial({ color: 0xe2c265, roughness: 0.72 });
  const storefrontD = new THREE.MeshStandardMaterial({ color: 0x3d4759, roughness: 0.82 });
  const sign = new THREE.MeshStandardMaterial({ color: 0xff6db0, emissive: 0x55173a, emissiveIntensity: 0.35, roughness: 0.55 });
  const signCyan = new THREE.MeshStandardMaterial({ color: 0x4dd6ff, emissive: 0x163d52, emissiveIntensity: 0.4, roughness: 0.55 });
  const vendor = new THREE.MeshStandardMaterial({ color: 0x26407a, roughness: 0.6 });
  const billboard = new THREE.MeshStandardMaterial({ color: 0xffe2a3, emissive: 0x4a3915, emissiveIntensity: 0.3, roughness: 0.6 });

  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.4 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xfff4c2, emissiveIntensity: 0.9, roughness: 0.3 });
  const scooter = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6 });
  const stallAwning = new THREE.MeshStandardMaterial({ color: 0xd95a52, roughness: 0.7 });

  // --- Detail materials + dressing helpers. These add purely-decorative meshes
  // (decorOnly: true → no collision) on top of the gameplay-sized cover boxes so
  // they read as real objects instead of plain slabs. Collision/cover is
  // unchanged; this is render-only. ---
  const vendGlass = new THREE.MeshStandardMaterial({ color: 0xcdefff, emissive: 0x5fc8ff, emissiveIntensity: 0.7, roughness: 0.25 });
  const vendSign = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffae3f, emissiveIntensity: 0.6, roughness: 0.5 });
  const vendTray = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.85 });
  const vendTrim = new THREE.MeshStandardMaterial({ color: 0xd9dde4, roughness: 0.5, metalness: 0.3 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4f9145, roughness: 0.95 });
  const hedgeMat2 = new THREE.MeshStandardMaterial({ color: 0x3c7a39, roughness: 0.95 });
  const planterRim = new THREE.MeshStandardMaterial({ color: 0xaab0ba, roughness: 0.8 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.7 });
  const stripeRed = new THREE.MeshStandardMaterial({ color: 0xd64a44, roughness: 0.7 });
  const stripeWhite = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
  const windowLit = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffd27a, emissiveIntensity: 0.5, roughness: 0.4 });
  const windowDark = new THREE.MeshStandardMaterial({ color: 0x2b3344, roughness: 0.35, metalness: 0.4 });
  const roofTrim = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.8 });
  const towerBase = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.5 });
  const industrialBody = new THREE.MeshStandardMaterial({ color: 0x70757d, roughness: 0.6, metalness: 0.5 });
  const industrialBase = new THREE.MeshStandardMaterial({ color: 0x4e525a, roughness: 0.85 });
  const industrialDark = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.6, metalness: 0.6 });
  const hazardStripe = new THREE.MeshStandardMaterial({ color: 0xd9a82a, roughness: 0.6 });
  const industrialPipe = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7, metalness: 0.3 });
  const billboardFrame = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.6, metalness: 0.4 });
  const adScreenA = new THREE.MeshStandardMaterial({ color: 0xff5db0, emissive: 0xff2a8a, emissiveIntensity: 0.9, roughness: 0.4 });
  const adScreenB = new THREE.MeshStandardMaterial({ color: 0x4dd6ff, emissive: 0x18a8e0, emissiveIntensity: 0.9, roughness: 0.4 });
  const adScreenC = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffae3f, emissiveIntensity: 0.8, roughness: 0.4 });

  // When fadeGroup is set, dressing meshes are collected so a whole building
  // (body + windows + roof + billboard) can be registered for camera fade.
  let fadeGroup = null;
  const addDecor = (opts) => {
    const mesh = addBlockingBox({ ...opts, decorOnly: true });
    if (fadeGroup) fadeGroup.push(mesh);
    return mesh;
  };
  // Camera-proximity fade for a whole building. Materials are cloned once per
  // building (shared within the group so every piece fades in step — cloning
  // matters because storefront/window materials are shared across buildings),
  // and ONE mesh per cloned material drives the opacity in updateWallFade.
  const applyBuildingFade = (meshes, fadeBox) => {
    fadeBox.occlude = true;   // fade on view-block only, not camera proximity
    const cache = new Map();
    for (const m of meshes) {
      const cm = cache.get(m.material);
      if (cm) { m.material = cm; continue; }
      const clone = m.material.clone();
      cache.set(m.material, clone);
      m.material = clone;
      registerWallFade(m, fadeBox);
    }
  };

  // Vending machine: lit display window, top sign band, dispenser tray, and side
  // trim — placed on the face toward the road centreline (z=0).
  const dressVending = (x, z, sx, sy, sz) => {
    const faceDir = z < 0 ? 1 : -1;
    const fz = z + faceDir * (sz / 2 + 0.06);
    addDecor({ x, y: sy * 0.52, z: fz, sx: sx - 0.5, sy: sy * 0.62, sz: 0.12, material: vendGlass });
    addDecor({ x, y: sy - 0.45, z: fz, sx, sy: 0.7, sz: 0.22, material: vendSign });
    addDecor({ x, y: 0.95, z: fz, sx: sx - 0.6, sy: 0.7, sz: 0.16, material: vendTray });
    for (const dx of [-1, 1]) {
      addDecor({ x: x + dx * (sx / 2 - 0.12), y: sy * 0.5, z: z + faceDir * (sz / 2), sx: 0.24, sy: sy - 0.25, sz: sz * 0.5, material: vendTrim });
    }
  };

  // Planter wall: keep the lower ~1.8 as the concrete container, then grow a tall
  // hedge of overlapping green clumps to the top so it reads as planted, not a wall.
  const dressPlanter = (x, z, sx, sy, sz) => {
    const baseTop = 1.8;
    const hedgeMidY = (baseTop + sy + 0.5) / 2;
    const hedgeH = (sy + 0.5) - baseTop;
    const clumps = Math.max(3, Math.round(sx / 2.2));
    for (let i = 0; i < clumps; i += 1) {
      const cx = x - sx / 2 + (i + 0.5) * (sx / clumps);
      addDecor({ x: cx, y: hedgeMidY + (i % 2) * 0.3, z, sx: (sx / clumps) * 1.1, sy: hedgeH, sz: sz + 0.6, material: i % 2 ? hedgeMat : hedgeMat2 });
    }
    addDecor({ x, y: baseTop, z, sx: sx + 0.2, sy: 0.3, sz: sz + 0.3, material: planterRim }); // container rim
  };

  // Market stall: striped awning band under the canopy + four corner posts.
  const dressStall = (x, z, sx, sy, sz) => {
    const stripes = 5;
    for (let i = 0; i < stripes; i += 1) {
      const sxpos = x - sx / 2 + (i + 0.5) * (sx / stripes);
      addDecor({ x: sxpos, y: sy + 0.1, z, sx: (sx / stripes) * 0.92, sy: 0.5, sz: sz + 0.8, material: i % 2 ? stripeRed : stripeWhite });
    }
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      addDecor({ x: x + dx * (sx / 2 - 0.15), y: sy * 0.5, z: z + dz * (sz / 2 - 0.15), sx: 0.22, sy, sz: 0.22, material: postMat });
    }
  };

  // One column×floor window grid on a single building face. `axis` 'z' = the
  // window-bearing width runs along X (front/back faces); 'x' = along Z (sides).
  // `faceCoord` is the perpendicular coord of the face; `outDir` pushes windows
  // proud of the wall; larger `spacing` = sparser grid (used for sides/back).
  const addWindowWall = (x, z, sx, sz, visualH, axis, faceCoord, outDir, spacing) => {
    const spanW = axis === 'z' ? sx : sz;
    const spanCenter = axis === 'z' ? x : z;
    const cols = Math.max(2, Math.round(spanW / spacing));
    const winW = (spanW / cols) * 0.5;
    const fc = faceCoord + outDir * 0.06;
    let floor = 0;
    for (let wy = 4.5; wy < visualH - 2.5; wy += 6, floor += 1) {
      if (floor % 3 === 1) {
        // Ribbon floor: one continuous connected window band across the whole face.
        const mat = floor % 2 === 0 ? windowLit : windowDark;
        if (axis === 'z') addDecor({ x: spanCenter, y: wy, z: fc, sx: spanW * 0.88, sy: 2.6, sz: 0.18, material: mat });
        else addDecor({ x: fc, y: wy, z: spanCenter, sx: 0.18, sy: 2.6, sz: spanW * 0.88, material: mat });
        continue;
      }
      for (let c = 0; c < cols; c += 1) {
        const wc = spanCenter - spanW / 2 + (c + 0.5) * (spanW / cols);
        const mat = (c * 3 + floor) % 4 !== 0 ? windowLit : windowDark;
        if (axis === 'z') addDecor({ x: wc, y: wy, z: fc, sx: winW, sy: 3.5, sz: 0.18, material: mat });
        else addDecor({ x: fc, y: wy, z: wc, sx: 0.18, sy: 3.5, sz: winW, material: mat });
      }
    }
  };

  // Storefront building. The collision box (h) only needs to block the bullet
  // line at y≈5, so this dresses a much TALLER visual on top of it — extra floors
  // as decor (no collision) so the building towers over the ~6.4-tall unit and
  // stops reading like the unit is a giant. Floors are unit-height (~6) with big
  // windows on ALL four faces (detailed front, sparser sides/back).
  const dressBuilding = (x, z, sx, h, sz, accentMat, visualH) => {
    const faceDir = z < 0 ? 1 : -1;
    const fz = z + faceDir * (sz / 2 + 0.06);
    addDecor({ x, y: (h + visualH) / 2, z, sx, sy: visualH - h, sz, material: accentMat }); // upper floors (visual only)
    addWindowWall(x, z, sx, sz, visualH, 'z', z + faceDir * (sz / 2), faceDir, 5);   // front (avenue)
    addWindowWall(x, z, sx, sz, visualH, 'z', z - faceDir * (sz / 2), -faceDir, 7);  // back
    addWindowWall(x, z, sx, sz, visualH, 'x', x + sx / 2, 1, 8);                     // right side
    addWindowWall(x, z, sx, sz, visualH, 'x', x - sx / 2, -1, 8);                    // left side
    addDecor({ x, y: 2.2, z: fz, sx: sx * 0.94, sy: 4.0, sz: 0.25, material: accentMat }); // ground-floor storefront band (front)
    addDecor({ x, y: visualH - 0.4, z, sx: sx + 0.6, sy: 1.0, sz: sz + 0.6, material: roofTrim }); // roof parapet
    addDecor({ x: x - sx * 0.22, y: visualH + 1.4, z, sx: sx * 0.32, sy: 2.8, sz: sz * 0.4, material: towerBase }); // rooftop unit
    // Rooftop billboard on the bigger blocks — emissive ad screen on a framed
    // stand facing the avenue, for city flavour.
    if (sx >= 20) {
      const key = Math.abs(Math.round(x)) % 3;
      const screen = key === 0 ? adScreenA : key === 1 ? adScreenB : adScreenC;
      const bbW = Math.min(sx * 0.7, 16);
      const bbH = 5.5;
      const bbY = visualH + bbH / 2 + 1.2;
      const bbZ = z + faceDir * (sz / 2 - 0.5);
      addDecor({ x, y: bbY, z: bbZ, sx: bbW + 0.6, sy: bbH + 0.6, sz: 0.45, material: billboardFrame });        // frame
      addDecor({ x, y: bbY, z: bbZ + faceDir * 0.25, sx: bbW, sy: bbH, sz: 0.12, material: screen });           // ad screen
      for (const dx of [-1, 1]) addDecor({ x: x + dx * bbW * 0.32, y: visualH + 0.9, z: bbZ, sx: 0.35, sy: 2.4, sz: 0.35, material: billboardFrame }); // support legs
    }
  };

  // Corner tower, industrial style: a concrete base, a hazard-stripe band,
  // riveted steel rings climbing the shaft, a vertical conduit pipe, and a
  // vented metal cap — reads like a factory smokestack instead of a neon sign.
  const dressTower = (x, z, w, topY) => {
    addDecor({ x, y: 1.8, z, sx: w + 2.6, sy: 3.6, sz: w + 2.6, material: industrialBase });           // concrete base
    addDecor({ x, y: 4.3, z, sx: w + 0.7, sy: 0.9, sz: w + 0.7, material: hazardStripe });             // hazard band
    for (let i = 1; i <= 4; i += 1) {
      addDecor({ x, y: 7 + (topY - 11) * (i / 5), z, sx: w + 0.4, sy: 0.5, sz: w + 0.4, material: industrialDark }); // riveted rings
    }
    addDecor({ x: x + (w / 2 + 0.25), y: topY * 0.5 + 2, z, sx: 0.5, sy: topY - 5, sz: 0.5, material: industrialPipe }); // conduit
    addDecor({ x, y: topY + 0.4, z, sx: w + 1.2, sy: 1.6, sz: w + 1.2, material: industrialDark });    // cap flange
    addDecor({ x, y: topY + 1.9, z, sx: w * 0.55, sy: 1.6, sz: w * 0.55, material: industrialBody });  // vent stub
  };

  const base = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), road);
  base.rotation.x = -Math.PI / 2; base.position.y = 0.005; scene.add(base); arenaDecor.push(base);

  // ===== Bridge dimensions (referenced throughout) =====
  const BRIDGE_TOP = 8;
  const BRIDGE_HALF_X = 8;
  const BRIDGE_MIN_Z = -28;
  const BRIDGE_MAX_Z = 28;
  const RAMP_HALF_X = BRIDGE_HALF_X;
  const RAMP_LOW_Y = 0.45;
  const RAMP_S_MIN_Z = -56;
  const RAMP_S_MAX_Z = -28;
  const RAMP_N_MIN_Z = 28;
  const RAMP_N_MAX_Z = 56;

  // Sidewalks lining the main avenue (street runs along X, narrow in Z)
  addPlatform({ minX: -120, maxX: 120, minZ: -18, maxZ: -12, top: 0.45, material: sidewalk });
  addPlatform({ minX: -120, maxX: 120, minZ: 12, maxZ: 18, top: 0.45, material: sidewalk });

  // Plaza decks on each side (extend out to support longer ramps)
  addPlatform({ minX: -34, maxX: 34, minZ: -58, maxZ: -18, top: 0.45, material: sidewalk });
  addPlatform({ minX: -34, maxX: 34, minZ: 18, maxZ: 58, top: 0.45, material: sidewalk });

  // ===== Storefront buildings =====
  // Pulled closer to sidewalks while preserving movement lanes.
  const southBuildings = [
    { x: -100, sx: 28, h: 14, mat: storefrontA },
    { x: -68, sx: 22, h: 11, mat: storefrontC },
    { x: -42, sx: 14, h: 16, mat: storefrontB },
    { x: 42, sx: 14, h: 16, mat: storefrontD },
    { x: 68, sx: 22, h: 12, mat: storefrontA },
    { x: 100, sx: 28, h: 15, mat: storefrontC }
  ];
  southBuildings.forEach((b) => {
    const body = addBlockingBox({ x: b.x, y: b.h / 2, z: -48, sx: b.sx, sy: b.h, sz: 24, material: b.mat });
    fadeGroup = [body];
    dressBuilding(b.x, -48, b.sx, b.h, 24, b.mat, b.h + 22);
    applyBuildingFade(fadeGroup, {
      minX: b.x - b.sx / 2, maxX: b.x + b.sx / 2,
      minY: 0, maxY: b.h + 22,
      minZ: -60, maxZ: -36
    });
    fadeGroup = null;
  });
  const northBuildings = [
    { x: -100, sx: 28, h: 13, mat: storefrontD },
    { x: -68, sx: 22, h: 16, mat: storefrontB },
    { x: -42, sx: 14, h: 12, mat: storefrontA },
    { x: 42, sx: 14, h: 14, mat: storefrontC },
    { x: 68, sx: 22, h: 17, mat: storefrontB },
    { x: 100, sx: 28, h: 12, mat: storefrontA }
  ];
  northBuildings.forEach((b) => {
    const body = addBlockingBox({ x: b.x, y: b.h / 2, z: 48, sx: b.sx, sy: b.h, sz: 24, material: b.mat });
    fadeGroup = [body];
    dressBuilding(b.x, 48, b.sx, b.h, 24, b.mat, b.h + 22);
    applyBuildingFade(fadeGroup, {
      minX: b.x - b.sx / 2, maxX: b.x + b.sx / 2,
      minY: 0, maxY: b.h + 22,
      minZ: 36, maxZ: 60
    });
    fadeGroup = null;
  });

  // (Outer back walls removed — the play area is bounded by the invisible
  // boundary walls at HALF_Z=92, well inside z=±100; tall back-of-block
  // walls past the boundary just blocked the horizon view from near the
  // map edge.)

  // ===== Footbridge (deck at y=8, spans 16m × 56m) =====
  // Deck + railings fade ONLY while they actually sit between the camera
  // and the player unit (occlusion mode, same as the storefront buildings) —
  // e.g. fighting under the deck with the camera above it, or standing
  // behind the railings. Otherwise they stay fully solid. Slopes are left
  // alone. Materials are cloned — `railing` is shared with the support
  // pillars, which stay solid.
  const deckMesh = addPlatform({
    minX: -BRIDGE_HALF_X, maxX: BRIDGE_HALF_X,
    minZ: BRIDGE_MIN_Z, maxZ: BRIDGE_MAX_Z,
    top: BRIDGE_TOP, thickness: 0.8, material: bridgeDeck.clone()
  });
  registerWallFade(deckMesh, {
    minX: -BRIDGE_HALF_X, maxX: BRIDGE_HALF_X,
    minY: BRIDGE_TOP - 0.8, maxY: BRIDGE_TOP,
    minZ: BRIDGE_MIN_Z, maxZ: BRIDGE_MAX_Z,
    occlude: true
  });
  // Railings along bridge sides
  const RAIL_H = 1.6;
  const railLength = BRIDGE_MAX_Z - BRIDGE_MIN_Z;
  for (const railX of [-BRIDGE_HALF_X - 0.2, BRIDGE_HALF_X + 0.2]) {
    const railMesh = addBlockingBox({ x: railX, y: BRIDGE_TOP + RAIL_H / 2, z: 0, sx: 0.4, sy: RAIL_H, sz: railLength, material: railing.clone() });
    registerWallFade(railMesh, {
      minX: railX - 0.2, maxX: railX + 0.2,
      minY: BRIDGE_TOP, maxY: BRIDGE_TOP + RAIL_H,
      minZ: BRIDGE_MIN_Z, maxZ: BRIDGE_MAX_Z,
      occlude: true
    });
  }
  // No hanging end-caps across bridge entries; slope gates are provided along ramp edges.
  // Underside support pillars (set into the sidewalks, not the street)
  addBlockingBox({ x: -BRIDGE_HALF_X + 0.6, y: BRIDGE_TOP / 2, z: -15, sx: 1.4, sy: BRIDGE_TOP, sz: 1.4, material: railing });
  addBlockingBox({ x: BRIDGE_HALF_X - 0.6, y: BRIDGE_TOP / 2, z: -15, sx: 1.4, sy: BRIDGE_TOP, sz: 1.4, material: railing });
  addBlockingBox({ x: -BRIDGE_HALF_X + 0.6, y: BRIDGE_TOP / 2, z: 15, sx: 1.4, sy: BRIDGE_TOP, sz: 1.4, material: railing });
  addBlockingBox({ x: BRIDGE_HALF_X - 0.6, y: BRIDGE_TOP / 2, z: 15, sx: 1.4, sy: BRIDGE_TOP, sz: 1.4, material: railing });

  // ===== Ramps (slopes — units walk straight up, no jump) =====
  // 16m horizontal × 7.55m rise → ~25° walkable; 8m wide
  addRamp({
    minX: -RAMP_HALF_X, maxX: RAMP_HALF_X,
    minZ: RAMP_S_MIN_Z, maxZ: RAMP_S_MAX_Z,
    axis: 'z', lowY: RAMP_LOW_Y, highY: BRIDGE_TOP,
    material: ramp
  });
  addRamp({
    minX: -RAMP_HALF_X, maxX: RAMP_HALF_X,
    minZ: RAMP_N_MIN_Z, maxZ: RAMP_N_MAX_Z,
    axis: 'z', lowY: BRIDGE_TOP, highY: RAMP_LOW_Y,
    material: ramp
  });
  // Long angled gate visuals that match slope angle, with matching collision samples.
  const RAMP_WALL_H = RAIL_H;
  const slopeSpan = (RAMP_S_MAX_Z - RAMP_S_MIN_Z);
  const slopeGateLen = slopeSpan - 2;
  const slopeRise = BRIDGE_TOP - RAMP_LOW_Y;
  const slopeAngle = Math.atan2(slopeRise, slopeSpan);
  const addAngledSlopeGate = ({ x, zCenter, yCenter, rotationX, zStart, zEnd }) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, RAMP_WALL_H, slopeGateLen), railing);
    mesh.position.set(x, yCenter, zCenter);
    mesh.rotation.x = rotationX;
    scene.add(mesh);
    arenaDecor.push(mesh);

    const samples = 5;
    for (let i = 0; i < samples; i += 1) {
      const t = (i + 0.5) / samples;
      const z = THREE.MathUtils.lerp(zStart, zEnd, t);
      const slopeY = THREE.MathUtils.lerp(RAMP_LOW_Y, BRIDGE_TOP, t);
      const y = slopeY + RAMP_WALL_H / 2;
      const sx = 0.45;
      const sy = RAMP_WALL_H;
      const sz = slopeGateLen / samples;
      arenaObstacles.push({
        minX: x - sx / 2, maxX: x + sx / 2,
        minZ: z - sz / 2, maxZ: z + sz / 2,
        minY: y - sy / 2, maxY: y + sy / 2
      });
      // Invisible under-slope bar: blocks units from walking beneath the slope from the road.
      // Top sits at the slope underside (below the gate above), so it never exceeds the gate.
      // noProjectile: true so bullets pass through this invisible block (it's only meant
      // to gate unit movement, not draw fire).
      if (slopeY > 0) {
        arenaObstacles.push({
          minX: x - sx / 2, maxX: x + sx / 2,
          minZ: z - sz / 2, maxZ: z + sz / 2,
          minY: 0, maxY: slopeY,
          noProjectile: true
        });
      }
    }
  };
  for (const sx of [-1, 1]) {
    addAngledSlopeGate({
      x: sx * (RAMP_HALF_X + 0.2),
      zCenter: (RAMP_S_MIN_Z + RAMP_S_MAX_Z) / 2,
      yCenter: (RAMP_LOW_Y + BRIDGE_TOP) / 2 + RAMP_WALL_H / 2,
      rotationX: -slopeAngle,
      zStart: RAMP_S_MIN_Z + 1,
      zEnd: RAMP_S_MAX_Z - 1
    });
    addAngledSlopeGate({
      x: sx * (RAMP_HALF_X + 0.2),
      zCenter: (RAMP_N_MIN_Z + RAMP_N_MAX_Z) / 2,
      yCenter: (RAMP_LOW_Y + BRIDGE_TOP) / 2 + RAMP_WALL_H / 2,
      rotationX: slopeAngle,
      zStart: RAMP_N_MAX_Z - 1,
      zEnd: RAMP_N_MIN_Z + 1
    });
  }
  // Cap the under-slope tunnel at each ramp's high-end short edge (the side facing
  // the main road). Top stays below the deck so bridge↔slope transit at y≈BRIDGE_TOP +
  // GROUND_BASE_Y clears the +4 collision Y buffer in resolveUnitObstacleCollisions.
  // noProjectile: true so bullets aren't blocked by these invisible caps.
  const underSlopeCapMaxY = BRIDGE_TOP - 2;
  const underSlopeCapThickness = 0.45;
  for (const edgeZ of [RAMP_S_MAX_Z, RAMP_N_MIN_Z]) {
    arenaObstacles.push({
      minX: -RAMP_HALF_X, maxX: RAMP_HALF_X,
      minZ: edgeZ - underSlopeCapThickness / 2, maxZ: edgeZ + underSlopeCapThickness / 2,
      minY: 0, maxY: underSlopeCapMaxY,
      noProjectile: true
    });
  }

  // ===== Akihabara dressing =====
  // Corner towers (industrial smokestacks), dressed with base/hazard/rings/cap.
  addBlockingBox({ x: -110, y: 12, z: -94, sx: 5, sy: 24, sz: 5, material: industrialBody });
  addBlockingBox({ x: 110, y: 12, z: 94, sx: 5, sy: 24, sz: 5, material: industrialBody });
  addBlockingBox({ x: -110, y: 14, z: 94, sx: 5, sy: 28, sz: 5, material: industrialBody });
  addBlockingBox({ x: 110, y: 14, z: -94, sx: 5, sy: 28, sz: 5, material: industrialBody });
  dressTower(-110, -94, 5, 24);
  dressTower(110, 94, 5, 24);
  dressTower(-110, 94, 5, 28);
  dressTower(110, -94, 5, 28);

  // Lamp posts along sidewalks
  const lampXs = [-110, -88, -66, -44, 44, 66, 88, 110];
  for (const lx of lampXs) {
    for (const lz of [-15, 15]) {
      addBlockingBox({ x: lx, y: 9.1, z: lz, sx: 0.35, sy: 18.2, sz: 0.35, material: lampMat });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), lampGlow);
      head.position.set(lx, 18.4, lz);
      scene.add(head); arenaDecor.push(head);
    }
  }

  // Vending machines — clusters along sidewalks (not in front of buildings everywhere)
  const vendingPos = [
    [-95, -15.2], [-93.5, -15.2],
    [-50, -15.2], [-48.5, -15.2],
    [25, -15.2], [26.5, -15.2],
    [80, -15.2], [78.5, -15.2],
    [-78, 15.2], [-76.5, 15.2],
    [-25, 15.2], [-23.5, 15.2],
    [50, 15.2], [51.5, 15.2],
    [95, 15.2], [93.5, 15.2]
  ];
  vendingPos.forEach(([x, z]) => {
    // Full cover: sized to hide the WHOLE unit (~4.3 wide, head at y≈8), not just
    // the hittable body — wide + tall enough to fully duck behind one.
    addBlockingBox({ x, y: 4.0, z, sx: 5.0, sy: 8.0, sz: 3.0, material: vendor });
    dressVending(x, z, 5.0, 8.0, 3.0);
  });

  // Street stalls with awnings (sidewalk side, opposite ends from vending)
  const stallSpots = [[-30, -15], [30, 15], [-58, 14.8], [60, -14.8]];
  stallSpots.forEach(([x, z]) => {
    // Long booth cover: extended along x into a market-stall length; awning on top.
    addBlockingBox({ x, y: 4.0, z, sx: 12.0, sy: 8.0, sz: 4.5, material: stallAwning });
    addBlockingBox({ x, y: 8.2, z, sx: 12.5, sy: 0.25, sz: 5.0, material: storefrontA });
    dressStall(x, z, 12.0, 8.0, 4.5);
  });

  // (Parked scooters removed.)

  // Plaza dressing — planters extended into long cover walls along the plaza.
  // Each pair runs from the plaza edge (x=±32) inward to x=±12, leaving a central
  // opening (x -12..12, which also keeps the bridge ramp clear) for units to pass
  // through front-to-back. Tall enough to block bullets.
  for (const [px, pz] of [[-22, -38], [22, -38], [-22, 38], [22, 38]]) {
    addBlockingBox({ x: px, y: 3.25, z: pz, sx: 20, sy: 6.5, sz: 2.4, material: sidewalk });
    dressPlanter(px, pz, 20, 6.5, 2.4);
  }
  for (const [px, pz] of [[-28, -52], [-26, -52], [26, 52], [28, 52]]) {
    addBlockingBox({ x: px, y: 4.0, z: pz, sx: 5.0, sy: 8.0, sz: 3.0, material: vendor });
    dressVending(px, pz, 5.0, 8.0, 3.0);
  }

  // Power-line / overhead banner strung between corner towers
  addBlockingBox({ x: 0, y: 16, z: -94, sx: 220, sy: 0.25, sz: 0.25, material: lampMat });
  addBlockingBox({ x: 0, y: 16, z: 94, sx: 220, sy: 0.25, sz: 0.25, material: lampMat });

  // ===== Play-area edge: invisible perimeter wall + red floor stripe.
  // The HALF_Z is set just inside the storefront back walls (z=±97-103) so
  // those remain visible decor past the boundary. HALF_X bounds the avenue
  // a few units past the corner sign towers (x=±110).
  addBoundaryIndicator(128, 92, 28);
}

function buildFactoryArena() {
  // Big interior hall (260 x 210) with dense industrial cover: workbenches,
  // assembly stations, hydraulic presses, conveyors with crates, storage racks,
  // crate stacks, and steel pillars. Sized for the ~5m-tall mech.
  const concrete = new THREE.MeshStandardMaterial({ color: 0x2d3540, roughness: 0.92 });
  const floorPaint = new THREE.MeshStandardMaterial({ color: 0x37424f, roughness: 0.85 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xeae66f, roughness: 0.7 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x6a7383, roughness: 0.7 });
  const wallTrim = new THREE.MeshStandardMaterial({ color: 0xa8aebd, roughness: 0.5, metalness: 0.45 });
  const beltSurface = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.95 });
  const beltFrame = new THREE.MeshStandardMaterial({ color: 0xd9a028, roughness: 0.6 });
  const roller = new THREE.MeshStandardMaterial({ color: 0xa8aebd, roughness: 0.45, metalness: 0.7 });
  const machine = new THREE.MeshStandardMaterial({ color: 0x2b3f5f, roughness: 0.55, metalness: 0.4 });
  const machineAlt = new THREE.MeshStandardMaterial({ color: 0x37547a, roughness: 0.55, metalness: 0.4 });
  const machineTop = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x9c6526, roughness: 0.55, metalness: 0.4 });
  const crate = new THREE.MeshStandardMaterial({ color: 0x7e5635, roughness: 0.85 });
  const crateAlt = new THREE.MeshStandardMaterial({ color: 0x614126, roughness: 0.9 });
  const beam = new THREE.MeshStandardMaterial({ color: 0x8b3a36, roughness: 0.5 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff5d6, emissive: 0xfff5d6, emissiveIntensity: 0.9, roughness: 0.3 });
  const rackFrame = new THREE.MeshStandardMaterial({ color: 0xc09030, roughness: 0.6 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x6a7383, roughness: 0.5, metalness: 0.55 });
  const cautionMat = new THREE.MeshStandardMaterial({ color: 0xe6a630, roughness: 0.7 });

  const HALF_X = 130;  // interior x range -130 .. 130
  const HALF_Z = 105;  // interior z range -105 .. 105
  const CEIL_Y = 22;

  // Concrete floor (covers the arena grid)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), concrete);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005;
  scene.add(floor); arenaDecor.push(floor);

  // Painted walkway markings on the floor
  for (const z of [-42, 42]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(230, 5), floorPaint);
    w.rotation.x = -Math.PI / 2; w.position.set(0, 0.02, z);
    scene.add(w); arenaDecor.push(w);
    for (let x = -110; x <= 110; x += 5) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), stripe);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.03, z);
      scene.add(dash); arenaDecor.push(dash);
    }
  }
  // Cross-axis painted lane at z=0 (visual variety)
  const crossLane = new THREE.Mesh(new THREE.PlaneGeometry(6, 200), floorPaint);
  crossLane.rotation.x = -Math.PI / 2; crossLane.position.set(0, 0.02, 0);
  scene.add(crossLane); arenaDecor.push(crossLane);

  // ===== Outer factory hall edge: invisible perimeter wall + red glowing
  // floor stripe indicator (same pattern as Station). Replaces the previous
  // visible grey hall walls so the camera doesn't clip when the player backs
  // into a corner; the wall trim below still marks the boundary visually.
  addBoundaryIndicator(HALF_X, HALF_Z, CEIL_Y);
  // Wall base trim
  addBlockingBox({ x: 0, y: 0.4, z: -HALF_Z, sx: 2 * HALF_X, sy: 0.8, sz: 0.6, material: wallTrim });
  addBlockingBox({ x: 0, y: 0.4, z: HALF_Z, sx: 2 * HALF_X, sy: 0.8, sz: 0.6, material: wallTrim });

  // ===== Conveyor belts (idle, with crates riding on top) =====
  // topBuffer: 2 lets units jumping over the belt skip collision once they're well above
  // the top. The "transport to opposite side" issue from the inside-bbox edge case is
  // handled in resolveUnitObstacleCollisions — see the velocity-aware exit branch.
  const drawConveyor = (cx, len, beltZ) => {
    // Belt body — top at y ≈ 2.6
    addBlockingBox({ x: cx, y: 1.4, z: beltZ, sx: 4.0, sy: 2.4, sz: len, material: beltSurface, topBuffer: 2 });
    // Yellow safety frames along both sides
    addBlockingBox({ x: cx - 2.3, y: 1.5, z: beltZ, sx: 0.5, sy: 2.8, sz: len, material: beltFrame, topBuffer: 2 });
    addBlockingBox({ x: cx + 2.3, y: 1.5, z: beltZ, sx: 0.5, sy: 2.8, sz: len, material: beltFrame, topBuffer: 2 });
    // End rollers
    [-len / 2, len / 2].forEach((dz) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 5.0, 16), roller);
      c.rotation.z = Math.PI / 2;
      c.position.set(cx, 2.4, beltZ + dz);
      scene.add(c); arenaDecor.push(c);
    });
    // Crates riding on the belt (idle parts left on a stopped line) — solid cover
    const stride = 9;
    let alt = false;
    for (let lz = -len / 2 + 6; lz <= len / 2 - 6; lz += stride) {
      addBlockingBox({
        x: cx, y: 4.0, z: beltZ + lz, sx: 2.6, sy: 2.6, sz: 2.6,
        material: alt ? crate : crateAlt, topBuffer: 2
      });
      alt = !alt;
    }
  };
  drawConveyor(-25, 90, 0);
  drawConveyor(25, 90, 0);

  // ===== Industrial partition walls (full hiding cover, ~8m tall, taller than the unit) =====
  const drawPartition = (x, z, axis = 'x', length = 10) => {
    // Sheet-metal panel
    if (axis === 'x') {
      addBlockingBox({ x, y: 4.0, z, sx: length, sy: 8.0, sz: 0.6, material: machineAlt });
      // Vertical seams (panel divisions)
      for (const dx of [-length / 4, 0, length / 4]) {
        addBlockingBox({ x: x + dx, y: 4.0, z, sx: 0.12, sy: 7.8, sz: 0.7, material: beltFrame });
      }
      // Top trim
      addBlockingBox({ x, y: 8.15, z, sx: length + 0.2, sy: 0.3, sz: 0.8, material: beam });
      // Caution stripe at the base
      addBlockingBox({ x, y: 0.05, z, sx: length, sy: 0.06, sz: 1.0, material: cautionMat });
    } else {
      addBlockingBox({ x, y: 4.0, z, sx: 0.6, sy: 8.0, sz: length, material: machineAlt });
      for (const dz of [-length / 4, 0, length / 4]) {
        addBlockingBox({ x, y: 4.0, z: z + dz, sx: 0.7, sy: 7.8, sz: 0.12, material: beltFrame });
      }
      addBlockingBox({ x, y: 8.15, z, sx: 0.8, sy: 0.3, sz: length + 0.2, material: beam });
      addBlockingBox({ x, y: 0.05, z, sx: 1.0, sy: 0.06, sz: length, material: cautionMat });
    }
  };
  // Central horizontal partitions (in the gap between the two main conveyors)
  drawPartition(0, -30, 'x', 12);
  drawPartition(0, 30, 'x', 12);
  // Side partitions (between conveyors and side machinery)
  drawPartition(-60, -10, 'z', 10);
  drawPartition(60, 10, 'z', 10);
  // Outer partitions (between machinery and pillars)
  drawPartition(-30, -65, 'x', 10);
  drawPartition(30, 65, 'x', 10);
  drawPartition(-90, 60, 'z', 8);
  drawPartition(90, -60, 'z', 8);

  // ===== Workbenches (10 spots — bigger map, more cover) =====
  const drawWorkbench = (x, z) => {
    // 4 thick legs
    for (const ox of [-3.5, 3.5]) {
      for (const oz of [-2, 2]) {
        addBlockingBox({ x: x + ox, y: 1.6, z: z + oz, sx: 0.7, sy: 3.2, sz: 0.7, material: roller });
      }
    }
    // Tabletop (8m × 4.5m × 0.5m)
    addBlockingBox({ x, y: 3.4, z, sx: 8, sy: 0.5, sz: 4.5, material: machine });
    // Toolbox at one end
    addBlockingBox({ x: x - 2.6, y: 4.4, z, sx: 2.4, sy: 1.5, sz: 1.6, material: machineTop });
    // Vise / parts cluster at the other end
    addBlockingBox({ x: x + 2.4, y: 4.2, z: z + 1, sx: 1.4, sy: 1.0, sz: 1.4, material: stripe });
    addBlockingBox({ x: x + 2.6, y: 4.6, z: z - 1, sx: 1.0, sy: 1.6, sz: 1.0, material: roller });
    // Backsplash panel — the back of the bench rises to give full cover
    addBlockingBox({ x, y: 5.5, z: z + 2.4, sx: 7.5, sy: 3.6, sz: 0.4, material: machineTop });
  };
  const workbenches = [
    [-70, -75], [70, -75], [-70, 75], [70, 75],
    [-70, -25], [70, -25], [-70, 25], [70, 25]
  ];
  workbenches.forEach(([x, z]) => drawWorkbench(x, z));

  // ===== Hydraulic presses (NEW — heavy industrial cover) =====
  const drawPress = (x, z) => {
    // Base plinth
    addBlockingBox({ x, y: 1.0, z, sx: 5.0, sy: 2.0, sz: 4.0, material: machineTop });
    // Press frame uprights
    addBlockingBox({ x: x - 2.0, y: 5.0, z, sx: 0.8, sy: 8, sz: 4, material: machine });
    addBlockingBox({ x: x + 2.0, y: 5.0, z, sx: 0.8, sy: 8, sz: 4, material: machine });
    // Crossbeam
    addBlockingBox({ x, y: 8.5, z, sx: 5, sy: 1.4, sz: 4, material: machineAlt });
    // Hydraulic ram
    addBlockingBox({ x, y: 6.0, z, sx: 1.6, sy: 2.0, sz: 1.6, material: roller });
    // Caution stripe at the base
    addBlockingBox({ x, y: 0.05, z, sx: 6.6, sy: 0.06, sz: 5.6, material: cautionMat });
  };
  drawPress(-40, -75);
  drawPress(40, -75);
  drawPress(-40, 75);
  drawPress(40, 75);

  // ===== Tall storage tanks (NEW — round full-cover obstacles) =====
  const drawTank = (x, z) => {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 12, 18), tankMat);
    tank.position.set(x, 6, z);
    scene.add(tank); arenaDecor.push(tank);
    // Cap dome
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
    cap.position.set(x, 12, z);
    scene.add(cap); arenaDecor.push(cap);
    // Caution band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.6, 18), cautionMat);
    band.position.set(x, 2, z);
    scene.add(band); arenaDecor.push(band);
    arenaObstacles.push({
      minX: x - 2.2, maxX: x + 2.2,
      minZ: z - 2.2, maxZ: z + 2.2,
      minY: 0, maxY: 14
    });
  };
  drawTank(-110, -50);
  drawTank(-110, 0);
  drawTank(-110, 50);
  drawTank(110, -50);
  drawTank(110, 0);
  drawTank(110, 50);

  // ===== Storage racks along the long walls (8 racks) =====
  const drawRack = (x, z) => {
    addBlockingBox({ x: x - 2.5, y: 4.5, z, sx: 0.5, sy: 9.0, sz: 0.5, material: rackFrame });
    addBlockingBox({ x: x + 2.5, y: 4.5, z, sx: 0.5, sy: 9.0, sz: 0.5, material: rackFrame });
    addBlockingBox({ x, y: 9.0, z, sx: 5.4, sy: 0.4, sz: 1.8, material: rackFrame });
    addBlockingBox({ x, y: 6.0, z, sx: 5.4, sy: 0.4, sz: 1.8, material: rackFrame });
    addBlockingBox({ x, y: 3.0, z, sx: 5.4, sy: 0.4, sz: 1.8, material: rackFrame });
    addBlockingBox({ x: x - 1.5, y: 3.9, z, sx: 1.4, sy: 1.4, sz: 1.4, material: crate });
    addBlockingBox({ x: x + 1.5, y: 3.9, z, sx: 1.4, sy: 1.4, sz: 1.4, material: crateAlt });
    addBlockingBox({ x, y: 6.9, z, sx: 1.4, sy: 1.4, sz: 1.4, material: crate });
    addBlockingBox({ x: x + 1.5, y: 9.9, z, sx: 1.4, sy: 1.4, sz: 1.4, material: crateAlt });
  };
  // Along z=±100 walls
  for (const z of [-100, 100]) {
    for (const x of [-75, -25, 25, 75]) {
      drawRack(x, z);
    }
  }

  // ===== Steel I-beam pillars (8 pillars, structural cover) =====
  const pillarSpots = [
    [-50, -55], [50, -55], [-50, 55], [50, 55],
    [-100, -85], [100, -85], [-100, 85], [100, 85]
  ];
  pillarSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: CEIL_Y / 2, z, sx: 2.4, sy: CEIL_Y, sz: 2.4, material: beam });
    addBlockingBox({ x, y: 0.4, z, sx: 3.6, sy: 0.8, sz: 3.6, material: wallTrim });
  });

  // ===== Workstation machinery along the long walls (just inside the rack rows) =====
  const machineLine = (z) => {
    [[-115, 14], [-50, 12], [0, 16], [50, 12], [115, 14]].forEach(([x, w]) => {
      addBlockingBox({ x, y: 2.6, z, sx: w, sy: 5.2, sz: 5.5, material: machine });
      addBlockingBox({ x, y: 5.7, z, sx: w * 0.5, sy: 1.5, sz: 2.5, material: machineTop });
      addBlockingBox({ x, y: 7.0, z, sx: w * 0.25, sy: 1.0, sz: 1.0, material: stripe });
    });
  };
  machineLine(-90);
  machineLine(90);

  // ===== Crate stack clusters scattered as proper cover (3m cubes stacked) =====
  const crateClusters = [
    [-15, -15], [15, 15], [-30, 35], [30, -35],
    [0, -55], [0, 55], [-85, -55], [85, 55],
    [-30, -50], [30, 50]
  ];
  crateClusters.forEach(([x, z]) => {
    addBlockingBox({ x, y: 1.5, z, sx: 2.8, sy: 2.8, sz: 2.8, material: crate });
    addBlockingBox({ x: x + 2.9, y: 1.5, z, sx: 2.8, sy: 2.8, sz: 2.8, material: crateAlt });
    addBlockingBox({ x, y: 1.5, z: z + 2.9, sx: 2.8, sy: 2.8, sz: 2.8, material: crateAlt });
    addBlockingBox({ x: x + 2.9, y: 1.5, z: z + 2.9, sx: 2.8, sy: 2.8, sz: 2.8, material: crate });
    addBlockingBox({ x: x + 1.45, y: 4.4, z: z + 1.45, sx: 2.8, sy: 2.8, sz: 2.8, material: crate });
  });

  // ===== Tool carts (NEW — low cover scattered around) =====
  const drawCart = (x, z) => {
    addBlockingBox({ x, y: 0.4, z, sx: 2.4, sy: 0.8, sz: 1.4, material: machineTop });
    addBlockingBox({ x, y: 1.4, z, sx: 2.0, sy: 1.2, sz: 1.0, material: roller });
    addBlockingBox({ x, y: 2.3, z, sx: 1.4, sy: 0.6, sz: 0.8, material: stripe });
  };
  const cartSpots = [
    [-60, -45], [60, 45], [-90, 35], [90, -35],
    [-15, 50], [15, -50], [-45, -30], [45, 30]
  ];
  cartSpots.forEach(([x, z]) => drawCart(x, z));

  // ===== Overhead pipework (visual only) =====
  for (const z of [-65, -28, 28, 65]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 260, 12), pipe);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, 16, z);
    scene.add(p); arenaDecor.push(p);
  }
  for (const x of [-80, -30, 30, 80]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 210, 12), pipe);
    p.position.set(x, 16, 0);
    scene.add(p); arenaDecor.push(p);
  }

  // ===== Ceiling truss beams =====
  for (const x of [-110, -75, -40, -10, 20, 55, 90]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 210), beam);
    b.position.set(x, CEIL_Y - 3, 0);
    scene.add(b); arenaDecor.push(b);
  }

  // ===== Hanging shop lights =====
  for (const x of [-90, -45, 0, 45, 90]) {
    for (const z of [-65, 0, 65]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 1.6), lightMat);
      l.position.set(x, CEIL_Y - 4.5, z);
      scene.add(l); arenaDecor.push(l);
    }
  }
}

function buildSquareArena() {
  // Daytime English-square vibe — gothic cathedral with green-roof spires, Big Ben-style
  // clock tower, tiered white-stone fountain, and cream tile plaza. Obstacles scaled so
  // benches, planters, and trees actually serve as cover for the mech's ~5m height.
  const grass = new THREE.MeshStandardMaterial({ color: 0x6ab442, roughness: 0.95 });
  const plazaTile = new THREE.MeshStandardMaterial({ color: 0xead7a8, roughness: 0.85 });
  const plazaTileAlt = new THREE.MeshStandardMaterial({ color: 0xc8a874, roughness: 0.85 });
  const path = new THREE.MeshStandardMaterial({ color: 0xb0a886, roughness: 0.8 });
  const whiteStone = new THREE.MeshStandardMaterial({ color: 0xeae5d8, roughness: 0.65 });
  const creamStone = new THREE.MeshStandardMaterial({ color: 0xd4c8a8, roughness: 0.7 });
  const stoneAccent = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.8 });
  const greenRoof = new THREE.MeshStandardMaterial({ color: 0x5e7e3a, roughness: 0.7 });
  const goldTrim = new THREE.MeshStandardMaterial({ color: 0xc4a440, roughness: 0.55, metalness: 0.45 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x6fb6e0, transparent: true, opacity: 0.85, roughness: 0.2,
    emissive: 0x356d92, emissiveIntensity: 0.2
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x6fa8c8, roughness: 0.3, metalness: 0.4,
    emissive: 0x213a48, emissiveIntensity: 0.25
  });
  const clockFace = new THREE.MeshStandardMaterial({
    color: 0xfff2d4, roughness: 0.4, emissive: 0x806c40, emissiveIntensity: 0.3
  });
  const clockHand = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
  const treeFoliage = new THREE.MeshStandardMaterial({ color: 0x4a8b3a, roughness: 0.95 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x4a341e, roughness: 0.9 });
  const lamppost = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.55, metalness: 0.5 });
  const lampGlow = new THREE.MeshStandardMaterial({
    color: 0xfff7d0, emissive: 0xfff7d0, emissiveIntensity: 0.95, roughness: 0.4
  });

  // Grass base
  const grassPlane = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), grass);
  grassPlane.rotation.x = -Math.PI / 2; grassPlane.position.y = 0.005;
  scene.add(grassPlane); arenaDecor.push(grassPlane);

  // Cream tile plaza — alternating tiles in a checkerboard for visual depth
  for (let x = -55; x < 55; x += 11) {
    for (let z = -55; z < 55; z += 11) {
      const useAlt = (Math.floor((x + 55) / 11) + Math.floor((z + 55) / 11)) % 2 === 0;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), useAlt ? plazaTileAlt : plazaTile);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(x + 5.5, 0.01, z + 5.5);
      scene.add(tile); arenaDecor.push(tile);
    }
  }
  // Sand/gravel paths radiating outward
  for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 80), path);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = ang;
    p.position.set(Math.cos(ang) * 70, 0.02, Math.sin(ang) * 70);
    scene.add(p); arenaDecor.push(p);
  }

  // ===== Multi-tier central fountain (white stone, ~14m wide base, 3 cascading tiers) =====
  // Tier 1 base
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.6, 24), whiteStone);
  tier1.position.set(0, 0.8, 0);
  scene.add(tier1); arenaDecor.push(tier1);
  const tier1Lip = new THREE.Mesh(new THREE.CylinderGeometry(13.4, 13.4, 0.4, 24), stoneAccent);
  tier1Lip.position.set(0, 1.4, 0);
  scene.add(tier1Lip); arenaDecor.push(tier1Lip);
  const water1 = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 12.2, 0.3, 24), waterMat);
  water1.position.set(0, 1.5, 0);
  scene.add(water1); arenaDecor.push(water1);
  // Tier 2 pillar + bowl
  const tier2Pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 2.6, 16), whiteStone);
  tier2Pillar.position.set(0, 2.9, 0);
  scene.add(tier2Pillar); arenaDecor.push(tier2Pillar);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 4.2, 1.4, 24), whiteStone);
  tier2.position.set(0, 4.9, 0);
  scene.add(tier2); arenaDecor.push(tier2);
  const water2 = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.25, 24), waterMat);
  water2.position.set(0, 5.6, 0);
  scene.add(water2); arenaDecor.push(water2);
  // Tier 3 pillar + bowl
  const tier3Pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 2.0, 16), whiteStone);
  tier3Pillar.position.set(0, 6.7, 0);
  scene.add(tier3Pillar); arenaDecor.push(tier3Pillar);
  const tier3 = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 2.2, 0.9, 24), whiteStone);
  tier3.position.set(0, 8.2, 0);
  scene.add(tier3); arenaDecor.push(tier3);
  const water3 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 24), waterMat);
  water3.position.set(0, 8.75, 0);
  scene.add(water3); arenaDecor.push(water3);
  // Top finial (gold)
  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 1.4, 16), whiteStone);
  spireBase.position.set(0, 9.4, 0);
  scene.add(spireBase); arenaDecor.push(spireBase);
  const spirePeak = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 12), goldTrim);
  spirePeak.position.set(0, 11.0, 0);
  scene.add(spirePeak); arenaDecor.push(spirePeak);

  // Fountain collision: cross of AABBs approximating the round base, plus a tall center column.
  // topBuffer: 2 on the base ring lets a unit clear the top when jumping over.
  // The "transport to opposite side" edge case is handled in resolveUnitObstacleCollisions.
  const fountainBaseAABB = (sx, sz) => ({
    minX: -sx / 2, maxX: sx / 2, minZ: -sz / 2, maxZ: sz / 2, minY: 0, maxY: 1.6, topBuffer: 2
  });
  arenaObstacles.push(
    fountainBaseAABB(26, 14),
    fountainBaseAABB(14, 26),
    // Tall central column (the cascading bowls + spire)
    { minX: -3.4, maxX: 3.4, minZ: -3.4, maxZ: 3.4, minY: 1.6, maxY: 11.5 }
  );
  // Thin invisible perimeter posts on a circle matching the fountain's outer
  // gray rim (outermost decorative step at r ≈ 16.6). Each post is a tiny
  // 0.2×0.2 footprint, so a unit brushing one barely feels it. With 68 posts
  // the gap between adjacent posts is ~1.33 — far smaller than the unit
  // diameter (2.3), so units can't slip between, but the boundary sits exactly
  // on the visible fountain edge instead of well outside it.
  {
    const PILL = 0.1;
    const PILL_H = 14;
    const RING_R = 16.55;
    const N = 68;
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2;
      const px = Math.cos(theta) * RING_R;
      const pz = Math.sin(theta) * RING_R;
      arenaObstacles.push({
        minX: px - PILL, maxX: px + PILL,
        minZ: pz - PILL, maxZ: pz + PILL,
        minY: 0, maxY: PILL_H, noProjectile: true
      });
    }
  }
  // Decorative low steps around the fountain base
  for (let i = 0; i < 3; i += 1) {
    const r = 13 + 1.4 + i * 1.1;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 32), whiteStone);
    step.position.set(0, 0.1 + i * 0.08, 0);
    scene.add(step); arenaDecor.push(step);
  }

  // ===== Gothic Cathedral on south side (multiple spires, green roofs) =====
  const cathX = 0;
  const cathZ = -78;
  // Main body (60m wide × 30m tall × 22m deep)
  addBlockingBox({ x: cathX, y: 15, z: cathZ, sx: 60, sy: 30, sz: 22, material: whiteStone });
  // Base trim
  addBlockingBox({ x: cathX, y: 1.0, z: cathZ, sx: 62, sy: 2.0, sz: 24, material: stoneAccent });
  // Buttresses (column ribs sticking out the front of the cathedral)
  for (let bx = -25; bx <= 25; bx += 8) {
    addBlockingBox({ x: cathX + bx, y: 13, z: cathZ + 11.5, sx: 1.8, sy: 26, sz: 2.5, material: whiteStone });
  }
  // Tall pointed gothic windows along the front
  for (let bx = -20; bx <= 20; bx += 8) {
    const gw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12, 0.4), windowMat);
    gw.position.set(cathX + bx, 14, cathZ + 11.05);
    scene.add(gw); arenaDecor.push(gw);
    // Pointed arch top
    const arch = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.0, 8), windowMat);
    arch.position.set(cathX + bx, 21, cathZ + 11.05);
    scene.add(arch); arenaDecor.push(arch);
  }
  // Three wide contiguous towers (no gaps) on the cathedral upper section.
  // Each tower is 16 wide so centers at -16/0/16 leave neighbors touching at x=±8.
  // Depth/position kept clear of the apse spire behind (which sits at z=-82).
  const sideTowers = [-16, 0, 16];
  const towerW = 16;
  const towerD = 10;
  const towerH = 22;
  sideTowers.forEach((bx) => {
    addBlockingBox({ x: cathX + bx, y: 30 + towerH / 2, z: cathZ + 4, sx: towerW, sy: towerH, sz: towerD, material: whiteStone });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 9, 8), greenRoof);
    cone.position.set(cathX + bx, 30 + towerH + 4.5, cathZ + 4);
    scene.add(cone); arenaDecor.push(cone);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 8), goldTrim);
    tip.position.set(cathX + bx, 30 + towerH + 9 + 1.2, cathZ + 4);
    scene.add(tip); arenaDecor.push(tip);
  });
  // ===== Big Ben-style clock tower on east side =====
  const towerX = 92;
  const towerZ = 28;
  // Stacked tower body
  addBlockingBox({ x: towerX, y: 14, z: towerZ, sx: 13, sy: 28, sz: 13, material: creamStone });
  // Mid trim
  addBlockingBox({ x: towerX, y: 28.5, z: towerZ, sx: 14, sy: 1.2, sz: 14, material: stoneAccent });
  // Clock section (slightly inset)
  addBlockingBox({ x: towerX, y: 36, z: towerZ, sx: 11, sy: 14, sz: 11, material: whiteStone });
  // Clock faces on all four sides
  const clockY = 36;
  // West (facing plaza)
  const cfW = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 24), clockFace);
  cfW.rotation.z = Math.PI / 2;
  cfW.position.set(towerX - 5.7, clockY, towerZ);
  scene.add(cfW); arenaDecor.push(cfW);
  // Hour hand
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.18), clockHand);
  hourHand.position.set(towerX - 5.85, clockY + 0.6, towerZ);
  scene.add(hourHand); arenaDecor.push(hourHand);
  // Minute hand
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), clockHand);
  minuteHand.rotation.x = Math.PI / 5;
  minuteHand.position.set(towerX - 5.85, clockY - 0.4, towerZ + 0.7);
  scene.add(minuteHand); arenaDecor.push(minuteHand);
  // North & South clock faces
  for (const sz of [-1, 1]) {
    const cf = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 24), clockFace);
    cf.rotation.x = Math.PI / 2;
    cf.position.set(towerX, clockY, towerZ + sz * 5.7);
    scene.add(cf); arenaDecor.push(cf);
  }
  // Top trim and green pyramid roof
  addBlockingBox({ x: towerX, y: 44, z: towerZ, sx: 12, sy: 1.0, sz: 12, material: stoneAccent });
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(8, 13, 4), greenRoof);
  pyramid.rotation.y = Math.PI / 4;
  pyramid.position.set(towerX, 51, towerZ);
  scene.add(pyramid); arenaDecor.push(pyramid);
  const towerTip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 8), goldTrim);
  towerTip.position.set(towerX, 58.8, towerZ);
  scene.add(towerTip); arenaDecor.push(towerTip);

  // ===== Other classical buildings around the plaza =====
  const drawClassicalBuilding = (cx, cz, sx, sz, h, opts = {}) => {
    addBlockingBox({ x: cx, y: h / 2, z: cz, sx, sy: h, sz, material: opts.alt ? creamStone : whiteStone });
    addBlockingBox({ x: cx, y: 0.7, z: cz, sx: sx + 0.5, sy: 1.4, sz: sz + 0.5, material: stoneAccent });
    // Green peaked roof
    const r = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.6, 2.6, sz + 0.6), greenRoof);
    r.position.set(cx, h + 1.3, cz);
    scene.add(r); arenaDecor.push(r);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.6, 1.4), greenRoof);
    ridge.position.set(cx, h + 3.0, cz);
    scene.add(ridge); arenaDecor.push(ridge);
    // Tall arched windows on the facade
    const facadeZ = opts.facadeFront ? cz + sz / 2 + 0.06 : cz - sz / 2 - 0.06;
    const xOffsets = [-0.36, -0.12, 0.12, 0.36];
    for (const wx of xOffsets) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, h * 0.42, 0.2), windowMat);
      w.position.set(cx + wx * sx, h * 0.55, facadeZ);
      scene.add(w); arenaDecor.push(w);
      // Pointed gothic arch above
      const arch = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 8), windowMat);
      arch.position.set(cx + wx * sx, h * 0.55 + h * 0.21 + 0.5, facadeZ);
      scene.add(arch); arenaDecor.push(arch);
    }
  };
  // North-side classical buildings (facade faces -Z)
  drawClassicalBuilding(-60, 78, 36, 18, 22, { facadeFront: false });
  drawClassicalBuilding(60, 78, 36, 18, 22, { facadeFront: false, alt: true });
  // West-side row (next to clock tower)
  drawClassicalBuilding(-92, -10, 18, 38, 20, { facadeFront: true });
  drawClassicalBuilding(-92, 42, 18, 22, 18, { facadeFront: true, alt: true });

  // ===== Lampposts ringing the fountain plaza =====
  const lampSpots = [[-30, -30], [30, -30], [-30, 30], [30, 30], [-50, 0], [50, 0], [0, -50], [0, 50]];
  lampSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: 4.5, z, sx: 0.45, sy: 9.0, sz: 0.45, material: lamppost });
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), lampGlow);
    head.position.set(x, 9.4, z);
    scene.add(head); arenaDecor.push(head);
  });

  // ===== Stone planters with shrubs (bigger so they break sightlines) =====
  const planterSpots = [[-44, -44], [44, -44], [-44, 44], [44, 44]];
  planterSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: 1.0, z, sx: 3.2, sy: 2.0, sz: 3.2, material: stoneAccent });
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 14), treeFoliage);
    leaves.position.set(x, 3.6, z);
    scene.add(leaves); arenaDecor.push(leaves);
  });

  // ===== Trees on grass borders (large enough to actually hide a mech) =====
  const treeSpots = [[-95, -55], [-95, 90], [95, -55], [95, 90], [-50, 95], [50, 95]];
  treeSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: 4, z, sx: 1.6, sy: 8, sz: 1.6, material: trunk });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(4.6, 16, 16), treeFoliage);
    crown.position.set(x, 10, z);
    scene.add(crown); arenaDecor.push(crown);
  });

  // ===== Outer boundary walls (low cream-stone garden walls) =====
  addBlockingBox({ x: 0, y: 4, z: -110, sx: 240, sy: 8, sz: 4, material: creamStone });
  addBlockingBox({ x: 0, y: 4, z: 110, sx: 240, sy: 8, sz: 4, material: creamStone });
  addBlockingBox({ x: -120, y: 4, z: 0, sx: 4, sy: 8, sz: 240, material: creamStone });
  addBlockingBox({ x: 120, y: 4, z: 0, sx: 4, sy: 8, sz: 240, material: creamStone });

  // ===== Play-area edge: invisible perimeter wall + red floor stripe.
  // The boundary sits flush against the inner faces of the cream-stone
  // garden walls (x=±118, z=±108), so the visible walls remain the outer
  // shell while the invisible wall is what units actually collide with.
  addBoundaryIndicator(116, 106, 28);
}

function buildLobbyArena() {
  // Sleek sci-fi lobby — white/silver marble + bright blue accent lighting,
  // glass back wall facing the night city, sleek angular benches with blue cushions,
  // tall structural pillars with glow rings.
  // Layout: full-width slope (no side gaps to sneak under the deck) merging into a
  // full-width mezzanine that reaches all four walls (no falling off the edges).
  const marble = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.3, metalness: 0.2 });
  const marbleDark = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.45, metalness: 0.15 });
  const marbleStair = new THREE.MeshStandardMaterial({ color: 0xd4d8e0, roughness: 0.35, metalness: 0.2 });
  const wall = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.5 });
  const sideWall = new THREE.MeshStandardMaterial({ color: 0xc4cbd6, roughness: 0.4, metalness: 0.3 });
  const wallAccent = new THREE.MeshStandardMaterial({
    color: 0x3da0ff, roughness: 0.35, metalness: 0.4,
    emissive: 0x125a99, emissiveIntensity: 0.55
  });
  const blueGlow = new THREE.MeshStandardMaterial({
    color: 0x68c0ff, emissive: 0x68c0ff, emissiveIntensity: 0.95, roughness: 0.3
  });
  const benchBase = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.4, metalness: 0.15 });
  const benchSeat = new THREE.MeshStandardMaterial({ color: 0xdce0e6, roughness: 0.5 });
  const cushion = new THREE.MeshStandardMaterial({
    color: 0x4280ff, roughness: 0.7, emissive: 0x0d2a66, emissiveIntensity: 0.18
  });
  const railGlass = new THREE.MeshStandardMaterial({
    color: 0x9bc7e8, transparent: true, opacity: 0.32, roughness: 0.1
  });
  const desk = new THREE.MeshStandardMaterial({ color: 0xeaedf0, roughness: 0.4, metalness: 0.2 });
  const deskTop = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.4, metalness: 0.2 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.35, metalness: 0.25 });
  const ceilingLight = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.3
  });
  const glassWall = new THREE.MeshStandardMaterial({
    color: 0x1a2640, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.5
  });
  const treeFoliage = new THREE.MeshStandardMaterial({ color: 0x4a8b3a, roughness: 0.95 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xeaedf0, roughness: 0.5, metalness: 0.2 });
  const grassDecor = new THREE.MeshStandardMaterial({ color: 0x6ab442, roughness: 0.95 });
  const decorMat = new THREE.MeshStandardMaterial({ color: 0x1a3460, roughness: 0.5 });

  const HALF_X = 108;             // mezzanine + slope half-width (touches the side walls)
  const UPPER_Y = 5;
  const UPPER_MIN_Z = -98;        // back edge of mezzanine touches the back wall
  const UPPER_MAX_Z = -5;
  const SLOPE_MIN_Z = -5;
  const SLOPE_MAX_Z = 12;

  // Polished marble floor (covers the arena grid)
  const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), marble);
  baseFloor.rotation.x = -Math.PI / 2; baseFloor.position.y = 0.005;
  scene.add(baseFloor); arenaDecor.push(baseFloor);

  // Dark marble inset rectangle in front of the stairs (entrance runway)
  const inset = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), marbleDark);
  inset.rotation.x = -Math.PI / 2; inset.position.set(0, 0.012, 38);
  scene.add(inset); arenaDecor.push(inset);
  // Blue-glow runway strips pointing at the stairs
  for (const x of [-22, -8, 8, 22]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 30), blueGlow);
    strip.rotation.x = -Math.PI / 2; strip.position.set(x, 0.013, 38);
    scene.add(strip); arenaDecor.push(strip);
  }

  // ===== Outer walls (lobby interior 220 x 200) =====
  // Registered for camera-proximity fade (same rule as Airport's edge walls):
  // backing the camera into a wall turns it translucent instead of blanking
  // the screen. Materials cloned — `wall` is shared with the ceiling beams.
  for (const w of [
    { x: 0, y: 12, z: -100, sx: 220, sy: 24, sz: 4 },
    { x: 0, y: 12, z: 100, sx: 220, sy: 24, sz: 4 },
    { x: -110, y: 12, z: 0, sx: 4, sy: 24, sz: 200 },
    { x: 110, y: 12, z: 0, sx: 4, sy: 24, sz: 200 }
  ]) {
    const mesh = addBlockingBox({ ...w, material: wall.clone() });
    registerWallFade(mesh, {
      minX: w.x - w.sx / 2, maxX: w.x + w.sx / 2,
      minY: w.y - w.sy / 2, maxY: w.y + w.sy / 2,
      minZ: w.z - w.sz / 2, maxZ: w.z + w.sz / 2
    });
  }

  // ===== Glass back wall facing the night city skyline =====
  // Positioned just in front of the back wall, above the mezzanine deck (mezzanine extends to z=-98).
  const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(180, 16, 0.3), glassWall);
  glassPanel.position.set(0, 14, -97.6);
  scene.add(glassPanel); arenaDecor.push(glassPanel);
  // Vertical mullions on the glass
  for (let mx = -80; mx <= 80; mx += 13) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 0.5), sideWall);
    mullion.position.set(mx, 14, -97.4);
    scene.add(mullion); arenaDecor.push(mullion);
  }
  // Blue wall decorations ride the SAME camera-proximity fade as the walls
  // they're mounted on, so wall and trim vanish together instead of the
  // blue bits floating opaque over a ghosted wall. Materials cloned —
  // blueGlow/wallAccent are shared with non-wall props that stay solid.
  // Bright blue header bar above the glass wall
  const headerBar = addBlockingBox({ x: 0, y: 22.4, z: -97.6, sx: 182, sy: 0.8, sz: 0.4, material: blueGlow.clone() });
  registerWallFade(headerBar, { minX: -91, maxX: 91, minY: 22, maxY: 22.8, minZ: -97.8, maxZ: -97.4 });
  // Lower glow line at the top of the mezzanine deck
  const deckGlow = addBlockingBox({ x: 0, y: UPPER_Y + 0.6, z: -97.6, sx: 182, sy: 0.4, sz: 0.4, material: blueGlow.clone() });
  registerWallFade(deckGlow, { minX: -91, maxX: 91, minY: UPPER_Y + 0.4, maxY: UPPER_Y + 0.8, minZ: -97.8, maxZ: -97.4 });

  // Side wall logo accents (vertical glow strips + Millennium-style panels)
  for (const sxn of [-1, 1]) {
    const accentStrip = addBlockingBox({ x: sxn * 107.6, y: 14, z: 0, sx: 0.5, sy: 8, sz: 60, material: wallAccent.clone() });
    registerWallFade(accentStrip, {
      minX: sxn * 107.6 - 0.25, maxX: sxn * 107.6 + 0.25,
      minY: 10, maxY: 18, minZ: -30, maxZ: 30
    });
    // Glow line accent along its length
    const glowLine = addBlockingBox({ x: sxn * 107.4, y: 14, z: 0, sx: 0.4, sy: 0.4, sz: 64, material: blueGlow.clone() });
    registerWallFade(glowLine, {
      minX: sxn * 107.4 - 0.2, maxX: sxn * 107.4 + 0.2,
      minY: 13.8, maxY: 14.2, minZ: -32, maxZ: 32
    });
    // Logo panels along the wall (lower floor side only — z>0)
    for (let i = 0; i < 3; i += 1) {
      const z = 30 - i * 28;
      const lblock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 7), wallAccent.clone());
      lblock.position.set(sxn * 107.2, 9, z);
      scene.add(lblock); arenaDecor.push(lblock);
      registerWallFade(lblock, {
        minX: sxn * 107.2 - 0.2, maxX: sxn * 107.2 + 0.2,
        minY: 7, maxY: 11, minZ: z - 3.5, maxZ: z + 3.5
      });
    }
  }

  // ===== Mezzanine (full width, reaches the back & side walls) =====
  addPlatform({
    minX: -HALF_X, maxX: HALF_X,
    minZ: UPPER_MIN_Z, maxZ: UPPER_MAX_Z,
    top: UPPER_Y, thickness: 0.8, material: marble
  });
  // No front edge strip needed at the slope-mezzanine boundary — they merge seamlessly.

  // Support pillars under the mezzanine deck — purely visual now (no unit can reach them
  // since the slope and mezzanine cover the whole hall floor at z<12). Skip collision data.
  const supportSpots = [[-80, -75], [80, -75], [-80, -45], [80, -45], [-30, -75], [30, -75], [-30, -25], [30, -25]];
  supportSpots.forEach(([x, z]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, UPPER_Y, 18), pillarMat);
    col.position.set(x, UPPER_Y / 2, z);
    scene.add(col); arenaDecor.push(col);
  });

  // ===== Big slope (full width — extends to both side walls) =====
  addRamp({
    minX: -HALF_X, maxX: HALF_X,
    minZ: SLOPE_MIN_Z, maxZ: SLOPE_MAX_Z,
    axis: 'z', lowY: UPPER_Y, highY: 0,
    material: marbleStair, thickness: 0.6
  });
  // Stepped front trim across the slope (escalator-feel)
  for (let i = 0; i < 9; i += 1) {
    const t = (i + 0.5) / 9;
    const z = THREE.MathUtils.lerp(SLOPE_MAX_Z, SLOPE_MIN_Z, t);
    const y = THREE.MathUtils.lerp(0.05, UPPER_Y - 0.15, t);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_X + 0.4, 0.16, 0.3), marbleDark);
    trim.position.set(0, y, z);
    scene.add(trim); arenaDecor.push(trim);
  }
  // Blue accent lane markers tilted to follow the slope
  const slopeLen = SLOPE_MAX_Z - SLOPE_MIN_Z;
  const slopeAngle = Math.atan2(UPPER_Y, slopeLen);
  for (const sx of [-80, -40, 0, 40, 80]) {
    const accentBar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, slopeLen / Math.cos(slopeAngle)), blueGlow);
    accentBar.position.set(sx, UPPER_Y / 2 + 0.05, (SLOPE_MIN_Z + SLOPE_MAX_Z) / 2);
    accentBar.rotation.x = slopeAngle;
    scene.add(accentBar); arenaDecor.push(accentBar);
  }

  // ===== Reception desks on the lower floor (taller, proper cover) =====
  const drawDesk = (cx, cz) => {
    addBlockingBox({ x: cx, y: 1.5, z: cz, sx: 14, sy: 3.0, sz: 3.2, material: desk });
    addBlockingBox({ x: cx, y: 3.1, z: cz, sx: 14.4, sy: 0.3, sz: 3.4, material: deskTop });
    addBlockingBox({ x: cx, y: 4.4, z: cz - 1.4, sx: 14, sy: 2.0, sz: 0.4, material: deskTop });
    addBlockingBox({ x: cx, y: 5.3, z: cz - 1.4, sx: 12, sy: 0.2, sz: 0.5, material: blueGlow });
  };
  drawDesk(-60, 55);
  drawDesk(60, 55);

  // ===== Sleek benches — FULLY HARD: every visible piece is a real collision
  // box (no decor-only meshes, no hidden colliders). Chunky solid body so the
  // whole object is one solid bench and blocks the bullet line. =====
  const drawSciFiBench = (x, baseY, z, sofa = false) => {
    const w = sofa ? 9 : 6;
    // High-backed bench, fully hard — every piece is collision AND rendered.
    // Low seat + blue cushion + a tall full-width backrest that doubles as the
    // bullet cover (its 2.8..6.4 span crosses the ~5 bullet line).
    addBlockingBox({ x, y: baseY + 1.4, z, sx: w, sy: 2.8, sz: 4.0, material: benchBase });             // seat
    addBlockingBox({ x, y: baseY + 3.1, z: z - 0.3, sx: w - 0.4, sy: 0.6, sz: 3.0, material: cushion }); // seat cushion
    addBlockingBox({ x, y: baseY + 4.6, z: z + 1.5, sx: w, sy: 3.6, sz: 1.0, material: benchSeat });      // tall backrest / cover
  };
  // Lower-floor benches (z=12..98 walkable area)
  drawSciFiBench(-78, 0, 82, true);
  drawSciFiBench(-50, 0, 82, false);
  drawSciFiBench(78, 0, 82, true);
  drawSciFiBench(50, 0, 82, false);
  drawSciFiBench(-25, 0, 86, false);
  drawSciFiBench(25, 0, 86, false);
  drawSciFiBench(-78, 0, 25, true);
  drawSciFiBench(78, 0, 25, true);
  // (Benches at (±30, 32) removed — they overlapped the tall pillars at (±30, 30).)

  // Coffee tables paired with seating (taller now)
  const coffeeTables = [[-60, 70], [60, 70], [0, 78]];
  coffeeTables.forEach(([x, z]) => {
    addBlockingBox({ x, y: 0.7, z, sx: 4.0, sy: 1.4, sz: 2.6, material: deskTop });
    addBlockingBox({ x, y: 1.45, z, sx: 4.2, sy: 0.18, sz: 2.8, material: railGlass });
  });

  // ===== Holo-globe pedestals (full cover ~6m wide × ~9.5m tall) =====
  // A stone pedestal carrying a large glowing globe wrapped in a flat halo
  // ring — a lobby centerpiece silhouette that can't read as tomb, crate
  // pile, or water cooler. Collision = stone base box + invisible cover
  // AABB; the SAME boxes are baked in shared arena.js (lobby) — change
  // dims here and there together or online/offline collision diverges.
  // The globe's equator matches the AABB width right at muzzle height, so
  // the cover reads honestly where bullets actually fly; the halo ring
  // overhangs the box and blocks nothing (it reads as a hologram).
  const drawHoloKiosk = (x, baseY, z /* axis ignored — radially symmetric */) => {
    const potW = 6.0;
    const potH = 2.9;
    // Wide stone base — solid cover for the lower body (collision unchanged)
    addBlockingBox({ x, y: baseY + potH / 2, z, sx: potW, sy: potH, sz: potW, material: pillarMat });
    // Base rim (decor)
    addBlockingBox({ x, y: baseY + potH + 0.18, z, sx: potW + 0.5, sy: 0.36, sz: potW + 0.5, material: marbleDark, decorOnly: true });
    // Blue glow accent ring on the rim (sci-fi lobby touch)
    addBlockingBox({ x, y: baseY + potH + 0.42, z, sx: potW + 0.42, sy: 0.14, sz: potW + 0.42, material: blueGlow, decorOnly: true });

    // Upper-body cover AABB — collision-only, mirrored in shared arena.js.
    const bushBaseY = baseY + potH + 0.4;
    const bushW = 5.3;
    const bushH = 6.2;
    addBlockingBox({ x, y: bushBaseY + bushH / 2, z, sx: bushW, sy: bushH, sz: bushW, material: treeFoliage, invisible: true });

    // Stone pedestal shaft + cap plate (globe bottom rests on the plate)
    const shaftTop = bushBaseY + 0.6;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.8, shaftTop - (baseY + potH), 2.8), pillarMat);
    shaft.position.set(x, (baseY + potH + shaftTop) / 2, z);
    scene.add(shaft); arenaDecor.push(shaft);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.35, 3.7), marbleDark);
    plate.position.set(x, shaftTop + 0.18, z);
    scene.add(plate); arenaDecor.push(plate);

    // Glowing globe — equator width == cover AABB width, top == AABB top
    const globeR = 2.65;
    const globeY = bushBaseY + bushH - globeR;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(globeR, 24, 16), wallAccent);
    globe.position.set(x, globeY, z);
    scene.add(globe); arenaDecor.push(globe);
    // Flat halo ring around the equator (visual only — reads as a hologram)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.12, 10, 40), blueGlow);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(x, globeY, z);
    scene.add(halo); arenaDecor.push(halo);
  };

  // ===== Aquarium pillars =====
  // The quieter sibling for clustered spots: a glass tank on the same stone
  // base — steel corner posts, lid, glowing water (no floating contents).
  // Glass box over box collision = zero visual/hitbox mismatch at any height.
  // Bright lit aquarium water — NOT the dark night-window glass; a light
  // aqua with a soft inner glow so the tanks read as illuminated features.
  const aquaWater = new THREE.MeshStandardMaterial({
    color: 0x8fd8ea, emissive: 0x1f7f9c, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.2
  });
  const drawAquariumPillar = (x, baseY, z) => {
    const potW = 5.2;
    const potH = 2.5;
    // Stone base + trims (collision unchanged)
    addBlockingBox({ x, y: baseY + potH / 2, z, sx: potW, sy: potH, sz: potW, material: pillarMat });
    addBlockingBox({ x, y: baseY + potH + 0.18, z, sx: potW + 0.5, sy: 0.36, sz: potW + 0.5, material: marbleDark, decorOnly: true });
    addBlockingBox({ x, y: baseY + potH + 0.42, z, sx: potW + 0.42, sy: 0.14, sz: potW + 0.42, material: blueGlow, decorOnly: true });
    // Invisible cover AABB (collision unchanged)
    const tankBaseY = baseY + potH + 0.4;
    const tankW = 4.6;
    const tankH = 5.4;
    addBlockingBox({ x, y: tankBaseY + tankH / 2, z, sx: tankW, sy: tankH, sz: tankW, material: treeFoliage, invisible: true });

    // Bright water body — same no-depth-write rule as the Airport panes so
    // units/sprites behind it stay visible.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(tankW - 0.2, tankH - 0.2, tankW - 0.2), aquaWater.clone());
    glass.material.depthWrite = false;
    glass.renderOrder = 2;
    glass.position.set(x, tankBaseY + tankH / 2, z);
    scene.add(glass); arenaDecor.push(glass);
    // Steel corner posts + lid
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, tankH + 0.2, 0.35), sideWall);
      post.position.set(x + px * (tankW / 2 - 0.18), tankBaseY + tankH / 2, z + pz * (tankW / 2 - 0.18));
      scene.add(post); arenaDecor.push(post);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(tankW + 0.3, 0.4, tankW + 0.3), sideWall);
    lid.position.set(x, tankBaseY + tankH + 0.2, z);
    scene.add(lid); arenaDecor.push(lid);
  };

  // ===== Cube sculptures (full cover, ~8m tall stacked geometric forms) =====
  const drawCubeSculpture = (x, baseY, z) => {
    addBlockingBox({ x, y: baseY + 0.4, z, sx: 5.5, sy: 0.8, sz: 5.5, material: marbleDark });
    addBlockingBox({ x, y: baseY + 3.0, z, sx: 4.5, sy: 4.4, sz: 4.5, material: pillarMat });
    addBlockingBox({ x: x + 1.0, y: baseY + 6.5, z: z - 1.0, sx: 3.5, sy: 3.0, sz: 3.5, material: benchBase });
    addBlockingBox({ x, y: baseY + 8.4, z, sx: 2.6, sy: 0.2, sz: 2.6, material: blueGlow });
  };

  // ===== Big planter boxes with tall conifers (~9m total, full cover) =====
  const drawBigPlanter = (x, baseY, z) => {
    addBlockingBox({ x, y: baseY + 1.4, z, sx: 4.4, sy: 2.8, sz: 4.4, material: pillarMat });
    addBlockingBox({ x, y: baseY + 2.85, z, sx: 4.4, sy: 0.1, sz: 4.4, material: grassDecor });
    addBlockingBox({ x, y: baseY + 5.5, z, sx: 0.9, sy: 5.0, sz: 0.9, material: trunkMat });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(3.0, 6.5, 16), treeFoliage);
    leaves.position.set(x, baseY + 8.7, z);
    scene.add(leaves); arenaDecor.push(leaves);
    // Decorative blue rim on the planter
    addBlockingBox({ x, y: baseY + 2.95, z, sx: 4.5, sy: 0.15, sz: 4.5, material: blueGlow });
  };

  // Lower-floor cover (entrance lounge area)
  // One globe centerpiece up front; the clustered lounge spots get the
  // quieter aquarium pillars (five identical glowing orbs read as an orb
  // farm, not interior design).
  drawHoloKiosk(0, 0, 42, 'x');
  drawAquariumPillar(-30, 0, 60);
  drawAquariumPillar(30, 0, 60);
  drawAquariumPillar(-15, 0, 88);
  drawAquariumPillar(15, 0, 88);
  drawCubeSculpture(-50, 0, 88);
  drawCubeSculpture(50, 0, 88);
  drawBigPlanter(-90, 0, 65);
  drawBigPlanter(90, 0, 65);

  // Mezzanine cover
  drawHoloKiosk(0, UPPER_Y, -30, 'x');
  drawCubeSculpture(-40, UPPER_Y, -78);
  drawCubeSculpture(40, UPPER_Y, -78);
  drawBigPlanter(-90, UPPER_Y, -45);
  drawBigPlanter(90, UPPER_Y, -45);

  // ===== Tall lobby pillars (full ceiling height, much thicker for cover) =====
  const tallPillars = [[-65, 65], [65, 65], [-30, 30], [30, 30], [-65, 25], [65, 25]];
  const PILLAR_R = 3.2;
  tallPillars.forEach(([x, z]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R, PILLAR_R, 24, 24), pillarMat.clone());
    col.position.set(x, 12, z);
    scene.add(col); arenaDecor.push(col);
    // Pillars are mid-map cover: fade ONLY while one actually sits between
    // the camera and the player unit (occlusion mode, same as Streets'
    // buildings) — cover still reads solid whenever it isn't hiding you.
    // pillarMat is cloned per column (shared with the indoor tree planters,
    // which stay solid).
    registerWallFade(col, {
      minX: x - PILLAR_R, maxX: x + PILLAR_R,
      minY: 0, maxY: 24,
      minZ: z - PILLAR_R, maxZ: z + PILLAR_R,
      occlude: true
    });
    arenaObstacles.push({
      minX: x - PILLAR_R, maxX: x + PILLAR_R,
      minZ: z - PILLAR_R, maxZ: z + PILLAR_R,
      minY: 0, maxY: 24
    });
    // Base ring
    const baseTrim = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R + 0.5, PILLAR_R + 0.5, 0.5, 24), marbleDark);
    baseTrim.position.set(x, 0.25, z);
    scene.add(baseTrim); arenaDecor.push(baseTrim);
    // Blue glow accent ring at the base
    const accentRing = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R + 0.2, PILLAR_R + 0.2, 0.3, 24), blueGlow);
    accentRing.position.set(x, 0.85, z);
    scene.add(accentRing); arenaDecor.push(accentRing);
  });

  // ===== Decorative indoor trees in planters =====
  const drawIndoorTree = (x, baseY, z) => {
    addBlockingBox({ x, y: baseY + 1.2, z, sx: 2.6, sy: 2.4, sz: 2.6, material: pillarMat });
    addBlockingBox({ x, y: baseY + 2.45, z, sx: 2.6, sy: 0.1, sz: 2.6, material: grassDecor });
    addBlockingBox({ x, y: baseY + 4.6, z, sx: 0.6, sy: 4.0, sz: 0.6, material: trunkMat });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.5, 14), treeFoliage);
    leaves.position.set(x, baseY + 8.4, z);
    scene.add(leaves); arenaDecor.push(leaves);
  };
  const lowerTrees = [[-95, 80], [95, 80], [-95, 55], [95, 55], [-95, 30], [95, 30]];
  lowerTrees.forEach(([x, z]) => drawIndoorTree(x, 0, z));

  // ===== Mezzanine furniture =====
  // Lounge benches on the mezzanine
  const mezzBenches = [[-50, -55], [50, -55], [-25, -80], [25, -80]];
  mezzBenches.forEach(([x, z]) => drawSciFiBench(x, UPPER_Y, z));

  // Mezzanine planters along the walls
  const mezzTrees = [[-95, -60], [95, -60], [-95, -25], [95, -25]];
  mezzTrees.forEach(([x, z]) => drawIndoorTree(x, UPPER_Y, z));

  // Mezzanine sculpture centerpiece — clean dark plinth, no orb
  addBlockingBox({ x: 0, y: UPPER_Y + 1.8, z: -55, sx: 5, sy: 3.6, sz: 5, material: decorMat });
  addBlockingBox({ x: 0, y: UPPER_Y + 3.8, z: -55, sx: 4, sy: 0.5, sz: 4, material: deskTop });
  addBlockingBox({ x: 0, y: UPPER_Y + 4.3, z: -55, sx: 2.4, sy: 0.6, sz: 2.4, material: wallAccent });
  // Blue glow ring around the sculpture base
  const sculpRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 12, 36), blueGlow);
  sculpRing.rotation.x = Math.PI / 2;
  sculpRing.position.set(0, UPPER_Y + 0.15, -55);
  scene.add(sculpRing); arenaDecor.push(sculpRing);

  // ===== Ceiling lights and beams =====
  for (const x of [-80, -40, 0, 40, 80]) {
    for (const z of [-80, -40, 0, 40, 80]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, 4), ceilingLight);
      light.position.set(x, 23.6, z);
      scene.add(light); arenaDecor.push(light);
    }
  }
  for (const z of [-80, -40, 0, 40, 80]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(220, 0.4, 1.2), wall);
    b.position.set(0, 23.8, z);
    scene.add(b); arenaDecor.push(b);
  }
  // Long blue accent strips along the ceiling
  for (const z of [-60, -20, 20, 60]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(220, 0.1, 0.3), blueGlow);
    strip.position.set(0, 23.5, z);
    scene.add(strip); arenaDecor.push(strip);
  }
}

function buildStationArena() {
  // Large industrial terminal (~270 x 264) with two parallel east-west train
  // tracks down the centre and six staggered freight cars on them (each 35 m
  // long × 8 m tall — full hard cover even for a jumping mech). On either side
  // of the tracks the floor is RAISED 4 m: a player on the tracks must JUMP
  // to reach the platforms. Platforms hold steel pillars (floor-to-ceiling),
  // ticket booths, departure boards, info kiosks, vending rows, shipping
  // containers, storage tanks, crate stacks, and info totems — every primary
  // cover is sized to fully hide a ~5 m mech.
  //
  // The outer perimeter walls are collision-only (no mesh) so the camera
  // never clips when the player backs into a corner. The play area boundary
  // is marked with glowing red floor stripes inside the invisible wall.
  // ===== Materials =====
  const tracksFloor = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.95 });
  const platformFloor = new THREE.MeshStandardMaterial({ color: 0x3a4350, roughness: 0.85 });
  const platformEdge = new THREE.MeshStandardMaterial({ color: 0xa6acba, roughness: 0.5, metalness: 0.45 });
  const platformFace = new THREE.MeshStandardMaterial({ color: 0x252b35, roughness: 0.85 });
  const cautionStripe = new THREE.MeshStandardMaterial({ color: 0xe6a630, roughness: 0.65 });
  const boundaryGlow = new THREE.MeshStandardMaterial({ color: 0xff2a32, emissive: 0xff2a32, emissiveIntensity: 1.4, roughness: 0.4 });
  const railTie = new THREE.MeshStandardMaterial({ color: 0x4a3d2a, roughness: 0.92 });
  const railSteel = new THREE.MeshStandardMaterial({ color: 0xb0b6c2, roughness: 0.4, metalness: 0.7 });
  const ballast = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.95 });
  const pillarSteel = new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.5, metalness: 0.55 });
  const pillarRim = new THREE.MeshStandardMaterial({ color: 0xb0b6c2, roughness: 0.45, metalness: 0.5 });
  const trainBodyA = new THREE.MeshStandardMaterial({ color: 0x83302a, roughness: 0.6 });
  const trainBodyB = new THREE.MeshStandardMaterial({ color: 0x2f4a76, roughness: 0.6 });
  const trainAccent = new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.7 });
  const trainRoof = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.55, metalness: 0.3 });
  const booth = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.7 });
  const boothTrim = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.8 });
  const boardFrame = new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.5, metalness: 0.5 });
  const boardScreen = new THREE.MeshStandardMaterial({ color: 0x121820, emissive: 0xe6a630, emissiveIntensity: 0.6, roughness: 0.4 });
  const kiosk = new THREE.MeshStandardMaterial({ color: 0xd4d8df, roughness: 0.5, metalness: 0.2 });
  const vending = new THREE.MeshStandardMaterial({ color: 0x9b2c2c, roughness: 0.6 });
  const vendingFront = new THREE.MeshStandardMaterial({ color: 0x141820, emissive: 0xff8a3a, emissiveIntensity: 0.4, roughness: 0.5 });
  const hallWall = new THREE.MeshStandardMaterial({ color: 0x3d4a5c, roughness: 0.7 });
  const billboard = new THREE.MeshStandardMaterial({ color: 0xe6dab0, emissive: 0x4a3a20, emissiveIntensity: 0.3, roughness: 0.6 });
  const containerA = new THREE.MeshStandardMaterial({ color: 0x356b8a, roughness: 0.75 });
  const containerB = new THREE.MeshStandardMaterial({ color: 0x9b6a2a, roughness: 0.75 });
  const containerRib = new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.7 });
  const crateA = new THREE.MeshStandardMaterial({ color: 0x7e5635, roughness: 0.85 });
  const crateB = new THREE.MeshStandardMaterial({ color: 0x614126, roughness: 0.9 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x707783, roughness: 0.5, metalness: 0.6 });
  const tankBand = new THREE.MeshStandardMaterial({ color: 0xe6a630, roughness: 0.7 });
  const totem = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.5, metalness: 0.4 });
  const totemGlow = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffe9b8, emissiveIntensity: 0.9, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffe2a8, emissiveIntensity: 0.9, roughness: 0.3 });
  const beam = new THREE.MeshStandardMaterial({ color: 0x2d343f, roughness: 0.6, metalness: 0.45 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x8b6f3a, roughness: 0.6, metalness: 0.4 });

  const HALF_X = 135;
  const HALF_Z = 132;
  const CEIL_Y = 28;
  const PLATFORM_Y = 4;
  const TRACK_Z_HALF = 11;

  // ===== Base concrete floor (covers the whole arena at y=0) =====
  // Platforms below raise sections of the walkable surface to y=4; this floor
  // shows through wherever the platforms don't, and forms the under-platform
  // ceiling when seen from the tracks corridor.
  const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X, 2 * HALF_Z), tracksFloor);
  baseFloor.rotation.x = -Math.PI / 2; baseFloor.position.set(0, 0.005, 0);
  scene.add(baseFloor); arenaDecor.push(baseFloor);
  // Gravel ballast bands flanking each rail
  for (const z of [8, -8]) {
    const bal = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X, 4.6), ballast);
    bal.rotation.x = -Math.PI / 2; bal.position.set(0, 0.012, z);
    scene.add(bal); arenaDecor.push(bal);
  }
  // Wooden ties + steel rails (decor)
  for (const z of [8, -8]) {
    for (let x = -130; x <= 130; x += 4.5) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 4.6), railTie);
      tie.position.set(x, 0.14, z);
      scene.add(tie); arenaDecor.push(tie);
    }
    for (const dz of [-1.5, 1.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_X, 0.28, 0.28), railSteel);
      rail.position.set(0, 0.32, z + dz);
      scene.add(rail); arenaDecor.push(rail);
    }
  }

  // ===== Raised platforms (PLATFORM_Y = 4 m, no ramps — must JUMP up) =====
  // SURFACE_STEP_HEIGHT is 1.6, so a 4 m step cannot be walked up automatically.
  addPlatform({ minX: -HALF_X + 1, maxX: HALF_X - 1, minZ: TRACK_Z_HALF, maxZ: HALF_Z - 1, top: PLATFORM_Y, material: platformFloor, thickness: 0.6 });
  addPlatform({ minX: -HALF_X + 1, maxX: HALF_X - 1, minZ: -(HALF_Z - 1), maxZ: -TRACK_Z_HALF, top: PLATFORM_Y, material: platformFloor, thickness: 0.6 });
  // Visible 4 m platform face skirts (decor only — the surface above catches a
  // jumping player, the face is just for the player to *see* the step). The
  // face matches the platform's full x extent (HALF_X - 1) so the visible
  // face aligns with the invisible collision wall below.
  for (const zEdge of [TRACK_Z_HALF, -TRACK_Z_HALF]) {
    const face = new THREE.Mesh(new THREE.BoxGeometry(2 * (HALF_X - 1), PLATFORM_Y, 0.5), platformFace);
    face.position.set(0, PLATFORM_Y / 2, zEdge);
    scene.add(face); arenaDecor.push(face);
    // Steel edge cap running along the top of the platform face
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2 * (HALF_X - 1), 0.35, 1.0), platformEdge);
    cap.position.set(0, PLATFORM_Y + 0.18, zEdge + (zEdge > 0 ? 0.5 : -0.5));
    scene.add(cap); arenaDecor.push(cap);
    // Yellow safety stripe on top of the platform edge
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HALF_X - 1) - 2, 0.9), cautionStripe);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, PLATFORM_Y + 0.05, zEdge + (zEdge > 0 ? 1.3 : -1.3));
    scene.add(stripe); arenaDecor.push(stripe);
  }

  // ===== Outer perimeter walls — COLLISION ONLY, NO MESH =====
  // Pushed directly so the camera never clips against them when the player
  // backs into a corner. The boundary is marked by red floor stripes below.
  arenaObstacles.push(
    { minX: -HALF_X - 2, maxX: HALF_X + 2, minZ: HALF_Z, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y },
    { minX: -HALF_X - 2, maxX: HALF_X + 2, minZ: -HALF_Z - 2, maxZ: -HALF_Z, minY: 0, maxY: CEIL_Y },
    { minX: -HALF_X - 2, maxX: -HALF_X, minZ: -HALF_Z - 2, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y },
    { minX: HALF_X, maxX: HALF_X + 2, minZ: -HALF_Z - 2, maxZ: HALF_Z + 2, minY: 0, maxY: CEIL_Y }
  );

  // ===== Invisible platform-edge walls (COLLISION ONLY) =====
  // 4 m tall AABBs running along each platform front so a player walking on
  // the tracks can't stroll into the platform's xz region — they must JUMP.
  // topBuffer: 0 means once the player's center clears y=4 (mid-jump) the
  // collision is skipped, so a forward jump can carry them onto the platform.
  // noProjectile: true keeps bullets from being stopped by the invisible wall.
  arenaObstacles.push(
    { minX: -(HALF_X - 1), maxX: HALF_X - 1, minZ: 10.75, maxZ: 11.25, minY: 0, maxY: 4, topBuffer: 0, noProjectile: true },
    { minX: -(HALF_X - 1), maxX: HALF_X - 1, minZ: -11.25, maxZ: -10.75, minY: 0, maxY: 4, topBuffer: 0, noProjectile: true }
  );

  // ===== Red glowing boundary stripes (the play-area edge indicator) =====
  // Each stripe sits just inside its wall, on whichever floor is present
  // (platform top y=4 or track floor y=0).
  const stripeInset = 1.6;
  // North/south stripes — these always sit on a platform.
  for (const zEdge of [HALF_Z - stripeInset, -(HALF_Z - stripeInset)]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X - 4, 1.4), boundaryGlow);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, PLATFORM_Y + 0.05, zEdge);
    scene.add(s); arenaDecor.push(s);
  }
  // East/west stripes — split into three sections so each rides the correct
  // floor (platform north, track corridor, platform south).
  for (const xEdge of [HALF_X - stripeInset, -(HALF_X - stripeInset)]) {
    const nLen = (HALF_Z - 1) - TRACK_Z_HALF;
    const n = new THREE.Mesh(new THREE.PlaneGeometry(1.4, nLen), boundaryGlow);
    n.rotation.x = -Math.PI / 2;
    n.position.set(xEdge, PLATFORM_Y + 0.05, (TRACK_Z_HALF + HALF_Z - 1) / 2);
    scene.add(n); arenaDecor.push(n);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, nLen), boundaryGlow);
    s.rotation.x = -Math.PI / 2;
    s.position.set(xEdge, PLATFORM_Y + 0.05, -(TRACK_Z_HALF + HALF_Z - 1) / 2);
    scene.add(s); arenaDecor.push(s);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2 * TRACK_Z_HALF), boundaryGlow);
    t.rotation.x = -Math.PI / 2;
    t.position.set(xEdge, 0.05, 0);
    scene.add(t); arenaDecor.push(t);
  }

  // Cover pieces fade ONLY while they actually sit between the camera and
  // the player unit (occlusion mode — same rule as Streets' buildings), so
  // cover still reads solid whenever it isn't hiding your own unit. Each
  // structure's materials are cloned once per group (its parts fade in
  // step); the base materials stay shared and solid everywhere else.
  // `depthToggle` (trains): while the group is FADED its materials stop
  // writing depth, so the own-unit X-ray silhouette can't patch onto the
  // ghost (the mixed x-ray/transparency look) — but while SOLID they write
  // depth normally, so the car self-occludes and you can't see its inside
  // structure. The toggle lives in updateWallFade, driven by opacity.
  const fadeCoverGroup = (meshes, box, depthToggle = false) => {
    const cache = new Map();
    for (const m of meshes) {
      if (depthToggle) m.userData.fadeDepthToggle = true;
      const cm = cache.get(m.material);
      if (cm) { m.material = cm; continue; }
      const clone = m.material.clone();
      cache.set(m.material, clone);
      m.material = clone;
      registerWallFade(m, { ...box, occlude: true });
    }
  };

  // ===== Stopped freight cars on two staggered tracks (6 — big hard cover) =====
  const drawTrainCar = (cx, beltZ, bodyMat) => {
    const parts = [];
    parts.push(addBlockingBox({ x: cx, y: 4, z: beltZ, sx: 35, sy: 8, sz: 5, material: bodyMat }));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(35.6, 0.7, 5.4), trainRoof);
    roof.position.set(cx, 8.35, beltZ);
    scene.add(roof); arenaDecor.push(roof); parts.push(roof);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(35, 1.0, 5.2), trainAccent);
    skirt.position.set(cx, 0.55, beltZ);
    scene.add(skirt); arenaDecor.push(skirt); parts.push(skirt);
    const stripeMid = new THREE.Mesh(new THREE.BoxGeometry(35, 0.8, 5.05), trainAccent);
    stripeMid.position.set(cx, 5.2, beltZ);
    scene.add(stripeMid); arenaDecor.push(stripeMid); parts.push(stripeMid);
    for (const dx of [-17.8, 17.8]) {
      const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), railSteel);
      buf.rotation.z = Math.PI / 2;
      buf.position.set(cx + dx, 2.8, beltZ);
      scene.add(buf); arenaDecor.push(buf); parts.push(buf);
    }
    // Wheel sets (decor)
    for (const dx of [-12, 12]) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 16), trainAccent);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(cx + dx, 1.0, beltZ);
      scene.add(axle); arenaDecor.push(axle); parts.push(axle);
    }
    fadeCoverGroup(parts, {
      minX: cx - 18, maxX: cx + 18, minY: 0, maxY: 8.8,
      minZ: beltZ - 2.8, maxZ: beltZ + 2.8
    }, true /* depthToggle — solid: self-occluding; faded: pure transparency */);
  };
  // North track — rust-red wagons
  drawTrainCar(-100, 8, trainBodyA);
  drawTrainCar(-25, 8, trainBodyA);
  drawTrainCar(60, 8, trainBodyA);
  // South track — weathered-blue wagons, offset for staggered cross-fire
  drawTrainCar(100, -8, trainBodyB);
  drawTrainCar(25, -8, trainBodyB);
  drawTrainCar(-60, -8, trainBodyB);

  // ===== Steel I-beam pillars carrying the roof (16 — structural cover) =====
  const drawPillar = (cx, cz) => {
    const body = addBlockingBox({ x: cx, y: CEIL_Y / 2, z: cz, sx: 4, sy: CEIL_Y, sz: 4, material: pillarSteel });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 5.4), pillarRim);
    cap.position.set(cx, CEIL_Y - 0.4, cz);
    scene.add(cap); arenaDecor.push(cap);
    const flange = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.0, 5.8), pillarRim);
    flange.position.set(cx, PLATFORM_Y + 0.5, cz);
    scene.add(flange); arenaDecor.push(flange);
    fadeCoverGroup([body, flange], {
      minX: cx - 2, maxX: cx + 2, minY: 0, maxY: 18,
      minZ: cz - 2, maxZ: cz + 2
    });
  };
  [
    [-105, 55], [-35, 55], [35, 55], [105, 55],
    [-105, -55], [-35, -55], [35, -55], [105, -55],
    [-105, 115], [-35, 115], [35, 115], [105, 115],
    [-105, -115], [-35, -115], [35, -115], [105, -115]
  ].forEach(([x, z]) => drawPillar(x, z));

  // ===== Ticket booths — biggest cover, along the deep back walls =====
  const drawBooth = (cx, cz) => {
    const body = addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 28, sy: 15, sz: 18, material: booth });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(29, 0.8, 19), boothTrim);
    roof.position.set(cx, 15.4, cz);
    scene.add(roof); arenaDecor.push(roof);
    // Glass front facing the platform (decor only)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(22, 5, 0.25), boardScreen);
    glass.position.set(cx, PLATFORM_Y + 4, cz - 9.15);
    scene.add(glass); arenaDecor.push(glass);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 0.4), boardScreen);
    sign.position.set(cx, 13, cz - 9.2);
    scene.add(sign); arenaDecor.push(sign);
    fadeCoverGroup([body, roof, glass, sign], {
      minX: cx - 14, maxX: cx + 14, minY: 0, maxY: 15.8,
      minZ: cz - 9.5, maxZ: cz + 9.5
    });
  };
  drawBooth(-65, 122);
  drawBooth(65, 122);
  drawBooth(-65, -122);
  drawBooth(65, -122);

  // ===== Departure information boards (perpendicular sight-line blockers) =====
  const drawDepartureBoard = (cx, cz) => {
    const parts = [];
    parts.push(addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 24, sy: 15, sz: 3, material: boardFrame }));
    for (const dz of [-1.6, 1.6]) {
      const screen = new THREE.Mesh(new THREE.BoxGeometry(22, 13, 0.15), boardScreen);
      screen.position.set(cx, 7.8, cz + dz);
      scene.add(screen); arenaDecor.push(screen); parts.push(screen);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(25, 0.6, 3.4), boardFrame);
    crown.position.set(cx, 15.3, cz);
    scene.add(crown); arenaDecor.push(crown); parts.push(crown);
    fadeCoverGroup(parts, {
      minX: cx - 12.5, maxX: cx + 12.5, minY: 0, maxY: 15.6,
      minZ: cz - 1.8, maxZ: cz + 1.8
    });
  };
  drawDepartureBoard(-65, 80);
  drawDepartureBoard(65, 80);
  drawDepartureBoard(-65, -80);
  drawDepartureBoard(65, -80);

  // ===== Hall partition walls — break the back hall into bays =====
  const drawHallWall = (cx, cz) => {
    const parts = [];
    parts.push(addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 32, sy: 15, sz: 2.5, material: hallWall }));
    const trim = new THREE.Mesh(new THREE.BoxGeometry(33, 0.5, 3), beam);
    trim.position.set(cx, 15.25, cz);
    scene.add(trim); arenaDecor.push(trim); parts.push(trim);
    for (const dz of [-1.4, 1.4]) {
      const ad = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.12), billboard);
      ad.position.set(cx, 8, cz + dz);
      scene.add(ad); arenaDecor.push(ad); parts.push(ad);
    }
    fadeCoverGroup(parts, {
      minX: cx - 16.5, maxX: cx + 16.5, minY: 0, maxY: 15.5,
      minZ: cz - 1.7, maxZ: cz + 1.7
    });
  };
  drawHallWall(-70, 95);
  drawHallWall(70, 95);
  drawHallWall(-70, -95);
  drawHallWall(70, -95);

  // ===== Info kiosks on the platforms (8 — full-cover boxes) =====
  const drawKiosk = (cx, cz) => {
    const body = addBlockingBox({ x: cx, y: 6, z: cz, sx: 12, sy: 12, sz: 10, material: kiosk });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.25), boardScreen);
    sign.position.set(cx, PLATFORM_Y + 5, cz - 5.15);
    scene.add(sign); arenaDecor.push(sign);
    fadeCoverGroup([body, sign], {
      minX: cx - 6, maxX: cx + 6, minY: 0, maxY: 12,
      minZ: cz - 5.2, maxZ: cz + 5.2
    });
  };
  [
    [-105, 30], [-35, 30], [35, 30], [105, 30],
    [-105, -30], [-35, -30], [35, -30], [105, -30]
  ].forEach(([x, z]) => drawKiosk(x, z));

  // ===== Vending machine rows along the back of each platform (10) =====
  const drawVending = (cx, cz) => {
    const body = addBlockingBox({ x: cx, y: 5.5, z: cz, sx: 8, sy: 11, sz: 3, material: vending });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 0.12), vendingFront);
    panel.position.set(cx, 7, cz - 1.56);
    scene.add(panel); arenaDecor.push(panel);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.6, 3.4), boardFrame);
    top.position.set(cx, 11.3, cz);
    scene.add(top); arenaDecor.push(top);
    fadeCoverGroup([body, panel, top], {
      minX: cx - 4.2, maxX: cx + 4.2, minY: 0, maxY: 11.6,
      minZ: cz - 1.8, maxZ: cz + 1.8
    });
  };
  [
    [-95, 65], [-45, 65], [0, 65], [45, 65], [95, 65],
    [-95, -65], [-45, -65], [0, -65], [45, -65], [95, -65]
  ].forEach(([x, z]) => drawVending(x, z));

  // ===== Shipping containers — long horizontal cover (4) =====
  // NOT fade-registered, deliberately: the containers stand on the
  // platforms (floor 4, top 10), so their effective height is ~6 — just
  // under the 6.4 unit sprite. They can never hide a whole unit, the
  // occlusion fade's torso test never trips, and the permanent transparent
  // flag only broke the X-ray rear-shadow (it needs the occluder in the
  // OPAQUE pass to have written depth). Opaque = shadow silhouette works.
  const drawContainer = (cx, cz, mat) => {
    addBlockingBox({ x: cx, y: 5, z: cz, sx: 18, sy: 10, sz: 8, material: mat });
    const top = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.5, 8.4), containerRib);
    top.position.set(cx, 10.25, cz);
    scene.add(top); arenaDecor.push(top);
    // Corrugated rib strips
    for (let dx = -8; dx <= 8; dx += 1.6) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 9.6, 8.2), containerRib);
      rib.position.set(cx + dx, 5, cz);
      scene.add(rib); arenaDecor.push(rib);
    }
  };
  drawContainer(-50, 105, containerA);
  drawContainer(50, 105, containerB);
  drawContainer(-50, -105, containerB);
  drawContainer(50, -105, containerA);

  // ===== Storage tanks — round full-cover cylinders (8) =====
  const drawTank = (cx, cz) => {
    // Square AABB matching the tank's footprint, pushed directly so we can use
    // a cylinder mesh as the visual (addBlockingBox would also create a box).
    arenaObstacles.push({
      minX: cx - 2.5, maxX: cx + 2.5,
      minZ: cz - 2.5, maxZ: cz + 2.5,
      minY: 0, maxY: 14
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 14, 20), tankMat);
    body.position.set(cx, 7, cz);
    scene.add(body); arenaDecor.push(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
    dome.position.set(cx, 14, cz);
    scene.add(dome); arenaDecor.push(dome);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.7, 20), tankBand);
    band.position.set(cx, PLATFORM_Y + 1.6, cz);
    scene.add(band); arenaDecor.push(band);
    fadeCoverGroup([body, dome, band], {
      minX: cx - 2.6, maxX: cx + 2.6, minY: 0, maxY: 16.5,
      minZ: cz - 2.6, maxZ: cz + 2.6
    });
  };
  [
    [-125, 45], [125, 45], [-125, -45], [125, -45],
    [-125, 105], [125, 105], [-125, -105], [125, -105]
  ].forEach(([x, z]) => drawTank(x, z));

  // ===== Crate stacks along the platform front edge (4) =====
  const drawCrateStack = (cx, cz) => {
    // Push the AABB directly; visual is four individual stacked crates below.
    arenaObstacles.push({
      minX: cx - 4, maxX: cx + 4,
      minZ: cz - 4, maxZ: cz + 4,
      minY: 0, maxY: 11
    });
    const crates = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.7, 7.8), i % 2 === 0 ? crateA : crateB);
      c.position.set(cx, 1.4 + i * 2.75, cz);
      scene.add(c); arenaDecor.push(c); crates.push(c);
    }
    fadeCoverGroup(crates, {
      minX: cx - 4, maxX: cx + 4, minY: 0, maxY: 12.4,
      minZ: cz - 4, maxZ: cz + 4
    });
  };
  drawCrateStack(-75, 18);
  drawCrateStack(75, 18);
  drawCrateStack(-75, -18);
  drawCrateStack(75, -18);

  // ===== Info totems mid-platform (4 — slim full-height columns) =====
  const drawTotem = (cx, cz) => {
    const body = addBlockingBox({ x: cx, y: 7, z: cz, sx: 3, sy: 14, sz: 3, material: totem });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10), totemGlow);
    globe.position.set(cx, 15.2, cz);
    scene.add(globe); arenaDecor.push(globe);
    fadeCoverGroup([body, globe], {
      minX: cx - 1.5, maxX: cx + 1.5, minY: 0, maxY: 16.6,
      minZ: cz - 1.5, maxZ: cz + 1.5
    });
  };
  drawTotem(-25, 70);
  drawTotem(25, 70);
  drawTotem(-25, -70);
  drawTotem(25, -70);

  // ===== Overhead pipework (decor only) =====
  for (const z of [-100, -55, -15, 15, 55, 100]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2 * HALF_X, 12), pipe);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, 20, z);
    scene.add(p); arenaDecor.push(p);
  }

  // ===== Ceiling truss beams =====
  for (const x of [-115, -75, -35, 0, 35, 75, 115]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 2 * HALF_Z), beam);
    b.position.set(x, CEIL_Y - 3.5, 0);
    scene.add(b); arenaDecor.push(b);
  }

  // ===== Hanging sodium-lamp banks (warm yellow station lighting) =====
  for (const x of [-115, -75, -35, 35, 75, 115]) {
    for (const z of [-110, -70, -35, 0, 35, 70, 110]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 2.2), lampMat);
      l.position.set(x, CEIL_Y - 5.5, z);
      scene.add(l); arenaDecor.push(l);
    }
  }

  // ===== Hanging central station clock (decor only) =====
  const clockBack = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 24), beam);
  clockBack.rotation.x = Math.PI / 2;
  clockBack.position.set(0, 22, 0);
  scene.add(clockBack); arenaDecor.push(clockBack);
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.3, 24), lampMat);
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(0, 22, 0.3);
  scene.add(clockFace); arenaDecor.push(clockFace);
  const clockHanger = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), beam);
  clockHanger.position.set(0, 25.5, 0);
  scene.add(clockHanger); arenaDecor.push(clockHanger);
}

function buildAirportArena() {
  // Bright daylight departure concourse, v2 — FLAT (offline-only until
  // finalized). v1's mezzanines/ramps caused traversal traps and camera
  // occlusion at the map edges, so all elevation is gone. Airport identity now
  // comes from ground-level set pieces: a security checkpoint line (x-ray
  // machines + metal-detector arches) as the central divider, check-in
  // islands, baggage carousels with solid feed housings, gate desks, kiosks,
  // seating lounges, overhead signage, and parked aircraft on the aprons
  // outside the glass. Point-symmetric about the center.
  //
  // COVER RULE — measured from the FLOOR (y=0), where units actually stand:
  //   sprite is 6.4 tall (feet -> head/halo), the hit capsule reaches ~8.0,
  //   and the fire line (muzzle) sits at ~5.6.
  // Every piece is either TRUE COVER (top >= 8 — fully hides the sprite AND
  // the whole hittable capsule AND blocks fire), a HARD WALL (>= 12), or
  // CLUTTER (top <= 2.5 — you see over it and shoot over it). Nothing between
  // 3 and 8 exists on this map, so visuals never lie about protection.
  const HALF_X = 138;
  const HALF_Z = 112;   // widened so the ground bands breathe around the plateau
  const WALL_Y = 26;

  const tileMat = new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.35, metalness: 0.1 });
  const tileDark = new THREE.MeshStandardMaterial({ color: 0x33404e, roughness: 0.5 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fc3e8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.4 });
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.4, metalness: 0.5 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.35, metalness: 0.5 });
  const planeWhite = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.3 });
  const planeDark = new THREE.MeshStandardMaterial({ color: 0x30475e, roughness: 0.4, metalness: 0.3 });
  const deskMat = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.4 });
  const deskTopMat = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.4, metalness: 0.2 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.85 });
  const signBlue = new THREE.MeshStandardMaterial({ color: 0x2f7fd6, emissive: 0x155a9e, emissiveIntensity: 0.6, roughness: 0.35 });
  const signYellow = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x8a6a10, emissiveIntensity: 0.5, roughness: 0.4 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.35, metalness: 0.45 });
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0x3565b0, roughness: 0.7 });
  const caseMats = [0xc23b3b, 0x3565b0, 0x3f9e5f, 0xd8a03c, 0x7a4fa0]
    .map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

  // ===== Terminal floor + walkway strips =====
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X + 24, 2 * HALF_Z + 24), tileMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005;
  scene.add(floor); arenaDecor.push(floor);
  for (const z of [-42, 42]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_X - 20, 3), tileDark);
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.012, z);
    scene.add(strip); arenaDecor.push(strip);
  }

  // ===== Outer shell: solid walls, glass curtain on the end walls =====
  // Walls register for camera-proximity fade (see updateWallFade): when the
  // camera closes in, they turn translucent instead of filling the screen.
  state.wallFadeMeshes = [];
  const wallDefs = [
    { x: 0, y: WALL_Y / 2, z: -HALF_Z - 2, sx: 2 * HALF_X + 8, sy: WALL_Y, sz: 4 },
    { x: 0, y: WALL_Y / 2, z: HALF_Z + 2, sx: 2 * HALF_X + 8, sy: WALL_Y, sz: 4 },
    { x: -HALF_X - 2, y: WALL_Y / 2, z: 0, sx: 4, sy: WALL_Y, sz: 2 * HALF_Z + 8 },
    { x: HALF_X + 2, y: WALL_Y / 2, z: 0, sx: 4, sy: WALL_Y, sz: 2 * HALF_Z + 8 }
  ];
  for (const w of wallDefs) {
    const mesh = addBlockingBox({ ...w, material: wallMat.clone() });
    registerWallFade(mesh, {
      minX: w.x - w.sx / 2, maxX: w.x + w.sx / 2,
      minY: w.y - w.sy / 2, maxY: w.y + w.sy / 2,
      minZ: w.z - w.sz / 2, maxZ: w.z + w.sz / 2
    });
  }
  // Full-height glass curtain: floor to near-ceiling so it reads as the
  // terminal's window wall (no floating panel gap underneath).
  for (const gx of [-HALF_X + 0.3, HALF_X - 0.3]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_Y - 3, 2 * HALF_Z - 8), glassMat);
    glass.position.set(gx, (WALL_Y - 3) / 2 + 1, 0);
    scene.add(glass); arenaDecor.push(glass);
    for (let mz = -90; mz <= 90; mz += 15) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_Y - 2, 0.6), mullionMat);
      m.position.set(gx, (WALL_Y - 2) / 2, mz);
      scene.add(m); arenaDecor.push(m);
    }
  }

  // ===== Long-wall dressing: wayfinding band + high window strip =====
  for (const side of [-1, 1]) {
    const wz = side * (HALF_Z - 0.2);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_X - 12, 1.4, 0.3), signBlue);
    band.position.set(0, 10, wz);
    scene.add(band); arenaDecor.push(band);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_X - 12, 5, 0.3), glassMat);
    win.position.set(0, 18, wz);
    scene.add(win); arenaDecor.push(win);
  }

  // ===== Security plateau: the middle band (z -40..40) raised to h4 =====
  // Station's exact platform height: low enough to jump onto anywhere (apex
  // ~5.6) and for bots to climb, central so it never blocks the camera. The
  // checkpoint, check-in islands, board walls and end gate desks sit ON it.
  const PLATEAU_Y = 4;
  // topBuffer 0 is CRITICAL: the default (4) extends collision 4 above the
  // body's top, which shoves anyone standing ON the plateau back off — the
  // "invisible wall". With 0, only units below the top collide with the side.
  const plateauBody = addBlockingBox({ x: 0, y: (PLATEAU_Y - 0.3) / 2, z: 0, sx: 273.6, sy: PLATEAU_Y - 0.3, sz: 79.6, material: steelMat.clone(), topBuffer: 0 });
  registerWallFade(plateauBody, { minX: -136.8, maxX: 136.8, minY: 0, maxY: PLATEAU_Y, minZ: -39.8, maxZ: 39.8 });
  addPlatform({ minX: -137, maxX: 137, minZ: -40, maxZ: 40, top: PLATEAU_Y, material: tileMat, thickness: 0.6 });
  // Yellow edge stripes so the height change reads at a glance.
  for (const ez of [-39.2, 39.2]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(272, 0.15, 1.2), signYellow);
    stripe.position.set(0, PLATEAU_Y + 0.08, ez);
    scene.add(stripe); arenaDecor.push(stripe);
  }
  // Glass rim fences along BOTH plateau edges: see-through but SOLID — they
  // block movement, jumps (top at 12; a ground jump reaches ~5.6) and bullets.
  // They leave only the wide end ramps as ways up — the plateau is a genuinely
  // secured zone.
  for (const side of [-1, 1]) {
    for (const [fx0, fx1] of [[-88, 88], [-137, -130], [130, 137]]) {
      const fw = fx1 - fx0;
      const pane = addBlockingBox({ x: (fx0 + fx1) / 2, y: PLATEAU_Y + 4, z: side * 40, sx: fw, sy: 8, sz: 1.2, material: glassMat.clone() });
      // Transparent panes must NOT write depth: their centers are far away, so
      // Three.js draws them before nearby sprites/tracers, and a depth-writing
      // pane would cull everything behind the glass. renderOrder 1 draws them
      // after the default transparent pass instead.
      pane.material.depthWrite = false;
      pane.renderOrder = 1;
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.5, 1.4), steelMat);
      railTop.position.set((fx0 + fx1) / 2, PLATEAU_Y + 8.2, side * 40);
      scene.add(railTop); arenaDecor.push(railTop);
    }
  }
  // Four walk-up ramps at the platform's two ENDS (both edges, mirror-
  // symmetric) so the mid-section stays a clean checkpoint zone; bots never
  // need to jump.
  addRamp({ minX: 88, maxX: 130, minZ: -50, maxZ: -40, axis: 'z', lowY: 0, highY: PLATEAU_Y, material: steelMat });
  addRamp({ minX: -130, maxX: -88, minZ: -50, maxZ: -40, axis: 'z', lowY: 0, highY: PLATEAU_Y, material: steelMat });
  addRamp({ minX: 88, maxX: 130, minZ: 40, maxZ: 50, axis: 'z', lowY: PLATEAU_Y, highY: 0, material: steelMat });
  addRamp({ minX: -130, maxX: -88, minZ: 40, maxZ: 50, axis: 'z', lowY: PLATEAU_Y, highY: 0, material: steelMat });
  // Invisible side rails along both long edges of every ramp: a unit can only
  // enter a ramp at its foot (walking up) or from the plateau (walking down) —
  // never sideways into the sloped slab, which made units overlap the mesh.
  // maxY 5 + topBuffer 0: blocks grounded units (collision point 2.45), frees
  // anyone already high on the ramp or on the plateau.
  // Visible glass side barriers along every ramp edge (replacing the old
  // INVISIBLE rails, whose unseen ends caught units walking off at an angle).
  // They stop 1.5 short of the foot so diagonal exits merge smoothly, and
  // match the rim fences: solid, unjumpable, tops at 12.
  for (const [rx, rz] of [[87.5, -44.25], [130.5, -44.25], [-87.5, -44.25], [-130.5, -44.25], [87.5, 44.25], [130.5, 44.25], [-87.5, 44.25], [-130.5, 44.25]]) {
    const pane = addBlockingBox({ x: rx, y: 6, z: rz, sx: 1, sy: 12, sz: 8.5, material: glassMat.clone() });
    pane.material.depthWrite = false;   // same no-depth-write rule as all fence glass
    pane.renderOrder = 1;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 8.7), steelMat);
    rail.position.set(rx, 12.2, rz);
    scene.add(rail); arenaDecor.push(rail);
  }
  // Entrance indicators: glowing yellow floor chevrons marching toward each
  // ramp foot, plus marker pylons flanking every rim opening — the four ramps
  // read as THE ways on/off the plateau from across the hall.
  const mkChevron = (cx, cz, dirZ) => {
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.9), signYellow);
      bar.position.set(cx + s * 1.35, 0.08, cz - dirZ * 1.35);
      bar.rotation.y = s * dirZ * Math.PI / 4;
      scene.add(bar); arenaDecor.push(bar);
    }
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      mkChevron(sx * 109, sz * 54, -sz);
      mkChevron(sx * 109, sz * 58, -sz);
      for (const px of [88, 130]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.9), signYellow);
        pylon.position.set(sx * px, PLATEAU_Y + 3, sz * 40);
        scene.add(pylon); arenaDecor.push(pylon);
      }
    }
  }

  // ===== Security checkpoint (the central divider, at GROUND level) =====
  // A north-south line at x=0 alternating x-ray belt machines (h8 true cover)
  // with metal-detector arches (h10 post pairs, 8-wide walk gaps). Weave
  // through the arches or fight around the machines — no elevation anywhere.
  // (Everything here sits ON the plateau — all heights offset by PLATEAU_Y.)
  for (const mz of [-13, 13]) {
    addBlockingBox({ x: 0, y: PLATEAU_Y + 4, z: mz, sx: 9, sy: 8, sz: 8, material: deskMat });
    const slot = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 3), beltMat);
    slot.position.set(0, PLATEAU_Y + 8.1, mz);
    scene.add(slot); arenaDecor.push(slot);
    // Dark scanner-tunnel mouths on both x faces so it reads as an x-ray
    // machine you'd feed a bag through, not a gray crate.
    for (const f of [-1, 1]) {
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 5), tileDark);
      mouth.position.set(f * 4.7, PLATEAU_Y + 5.2, mz);
      scene.add(mouth); arenaDecor.push(mouth);
    }
  }
  // Metal-detector arches: posts BESIDE the walk path (gap runs along X, the
  // direction you actually cross the line), crossbar spanning them.
  for (const gz of [-26, 0, 26]) {
    addBlockingBox({ x: 0, y: PLATEAU_Y + 5, z: gz - 6.5, sx: 5, sy: 10, sz: 5, material: gateMat });
    addBlockingBox({ x: 0, y: PLATEAU_Y + 5, z: gz + 6.5, sx: 5, sy: 10, sz: 5, material: gateMat });
    // Crossbar fades when the camera closes in (same rule as the edge walls)
    // so overhead furniture never blanks the plateau fight.
    const bar = addBlockingBox({ x: 0, y: PLATEAU_Y + 10.8, z: gz, sx: 5, sy: 1.6, sz: 18, material: signBlue.clone(), decorOnly: true });
    registerWallFade(bar, {
      minX: -2.5, maxX: 2.5,
      minY: PLATEAU_Y + 10, maxY: PLATEAU_Y + 11.6,
      minZ: gz - 9, maxZ: gz + 9
    });
  }
  // Security fences closing the plateau shoulders beside the checkpoint:
  // glass panels you can SEE through but not cross, jump (top at 12 — jump
  // apex from the plateau reaches ~9.6) or shoot through. Crossing the
  // mid-plateau means going through an arch, like a real checkpoint.
  for (const fz of [-37.5, 37.5]) {
    const pane = addBlockingBox({ x: 0, y: PLATEAU_Y + 4, z: fz, sx: 1.2, sy: 8, sz: 5, material: glassMat.clone() });
    pane.material.depthWrite = false;   // same no-depth-write rule as the rim panes
    pane.renderOrder = 1;
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 5.2), steelMat);
    railTop.position.set(0, PLATEAU_Y + 8.2, fz);
    scene.add(railTop); arenaDecor.push(railTop);
  }
  // Queue-lane furniture: retractable-belt barriers + dark floor lanes feeding
  // into each arch from both approaches — the checkpoint workflow look.
  for (const gz of [-26, 0, 26]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(44, 2.6), tileDark);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, PLATEAU_Y + 0.02, gz);
    scene.add(lane); arenaDecor.push(lane);
    for (const rowZ of [gz - 4.5, gz + 4.5]) {
      let prev = null;
      for (const px of [-22, -16.7, -11.4, -6.1, 6.1, 11.4, 16.7, 22]) {
        // Chest-height barrier posts (1.5× the old waist height).
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.8, 0.6), mullionMat);
        post.position.set(px, PLATEAU_Y + 2.4, rowZ);
        scene.add(post); arenaDecor.push(post);
        if (prev !== null && px - prev < 6) {
          const belt = new THREE.Mesh(new THREE.BoxGeometry(px - prev - 0.6, 0.3, 0.15), beltMat);
          belt.position.set((px + prev) / 2, PLATEAU_Y + 4.35, rowZ);
          scene.add(belt); arenaDecor.push(belt);
        }
        prev = px;
      }
    }
  }

  // ===== Departure-board walls (h10 hard walls extending the center line) =====
  for (const side of [-1, 1]) {
    addBlockingBox({ x: side * 75, y: PLATEAU_Y + 6, z: 0, sx: 30, sy: 12, sz: 4, material: wallMat });
    for (const face of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(24, 5, 0.3), tileDark);
      board.position.set(side * 75, PLATEAU_Y + 7, face * 2.3);
      scene.add(board); arenaDecor.push(board);
      const header = new THREE.Mesh(new THREE.BoxGeometry(24, 0.8, 0.3), signYellow);
      header.position.set(side * 75, PLATEAU_Y + 10.3, face * 2.3);
      scene.add(header); arenaDecor.push(header);
    }
  }

  // ===== Gate desks (h8 true cover in the end zones) =====
  // End pair sits ON the plateau; the corner pair stays at ground level.
  for (const [gx, gz, gy] of [[120, -30, PLATEAU_Y], [-120, 30, PLATEAU_Y], [-105, -90, 0], [105, 90, 0]]) {
    addBlockingBox({ x: gx, y: gy + 4, z: gz, sx: 6, sy: 8, sz: 12, material: deskMat });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.4, 0.5), signYellow);
    sign.position.set(gx, gy + 8.6, gz);
    scene.add(sign); arenaDecor.push(sign);
    // Boarding-door frame on the glass wall behind the desks near the ends.
    if (Math.abs(gx) > 110) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 8), tileDark);
      door.position.set(Math.sign(gx) * (HALF_X - 0.7), gy + 5, gz);
      scene.add(door); arenaDecor.push(door);
    }
  }

  // ===== Check-in desk rows (h6 true cover) =====
  // Repositioned fully ONTO the plateau (they used to straddle its edge).
  for (const [dx, dzs] of [[-75, [-32, -14]], [75, [14, 32]]]) {
    for (const dz of dzs) {
      addBlockingBox({ x: dx, y: PLATEAU_Y + 4, z: dz, sx: 40, sy: 8, sz: 6, material: deskMat });
      const top = new THREE.Mesh(new THREE.BoxGeometry(40.6, 0.3, 6.6), deskTopMat);
      top.position.set(dx, PLATEAU_Y + 8.1, dz);
      scene.add(top); arenaDecor.push(top);
      // Hanging airline sign above + queue-barrier posts on the concourse side
      // make the islands read as check-in counters.
      const hang = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 0.6), signBlue.clone());
      hang.position.set(dx, PLATEAU_Y + 11.5, dz);
      scene.add(hang); arenaDecor.push(hang);
      registerWallFade(hang, {
        minX: dx - 6, maxX: dx + 6,
        minY: PLATEAU_Y + 10.3, maxY: PLATEAU_Y + 12.7,
        minZ: dz - 0.3, maxZ: dz + 0.3
      });
      // Chest-height belt barriers matching the checkpoint set — the old
      // version was 5 bare shin-high stubs, which read as creepy floor
      // bumps instead of queue furniture. Fewer posts, connected by belts.
      const qz = dz + (dz > 0 ? -5.5 : 5.5);
      let prevQ = null;
      for (const qx of [-13.5, -4.5, 4.5, 13.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.8, 0.6), mullionMat);
        post.position.set(dx + qx, PLATEAU_Y + 2.4, qz);
        scene.add(post); arenaDecor.push(post);
        if (prevQ !== null) {
          const belt = new THREE.Mesh(new THREE.BoxGeometry(qx - prevQ - 0.6, 0.3, 0.15), beltMat);
          belt.position.set(dx + (qx + prevQ) / 2, PLATEAU_Y + 4.35, qz);
          scene.add(belt); arenaDecor.push(belt);
        }
        prevQ = qx;
      }
    }
  }

  // ===== Kiosks (h6 true cover) =====
  // Two DISTINCT kiosk types (no more identical yellow-capped cubes):
  // info totems — gray-blue body, dark screens all faces, white cap.
  for (const [kx, kz] of [[-20, -72], [20, 72], [90, -72], [-90, 72]]) {
    addBlockingBox({ x: kx, y: 4, z: kz, sx: 8, sy: 8, sz: 8, material: mullionMat });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.5, 8.4), planeWhite);
    cap.position.set(kx, 8.2, kz);
    scene.add(cap); arenaDecor.push(cap);
    for (const [ox, oz] of [[4.3, 0], [-4.3, 0], [0, 4.3], [0, -4.3]]) {
      const scr = new THREE.Mesh(new THREE.BoxGeometry(ox !== 0 ? 0.3 : 5, 3.6, oz !== 0 ? 0.3 : 5), tileDark);
      scr.position.set(kx + ox, 4.8, kz + oz);
      scene.add(scr); arenaDecor.push(scr);
    }
  }
  // Vending machine banks — dark body, one red + one blue machine front on
  // both long faces, lit strip along the top.
  for (const [kx, kz] of [[45, -92], [-45, 92], [-45, -92], [45, 92]]) {
    addBlockingBox({ x: kx, y: 4, z: kz, sx: 8, sy: 8, sz: 8, material: tileDark });
    for (const f of [-1, 1]) {
      const fz = kz + f * 4.2;
      const vRed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.4, 0.3), caseMats[0]);
      vRed.position.set(kx - 1.9, 3.4, fz);
      scene.add(vRed); arenaDecor.push(vRed);
      const vBlue = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.4, 0.3), caseMats[1]);
      vBlue.position.set(kx + 1.9, 3.4, fz);
      scene.add(vBlue); arenaDecor.push(vBlue);
      const lit = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.7, 0.3), planeWhite);
      lit.position.set(kx, 6.9, fz);
      scene.add(lit); arenaDecor.push(lit);
    }
  }

  // ===== Baggage bays: luggage belts (h2 clutter) with suitcases on top =====
  // Carousel-scale loops: two wide lanes joined by end caps, reading as one
  // baggage carousel per bay, with a chunky suitcase trail riding on top.
  for (const side of [1, -1]) {
    const bz = side * -1;                        // side 1 -> NW bay (z<0), side -1 -> SE bay (z>0)
    for (const lane of [80, 66]) {
      addBlockingBox({ x: side * -70, y: 1.2, z: bz * lane, sx: 64, sy: 2.4, sz: 6, material: beltMat });
    }
    for (const ex of [-99, -41]) {
      addBlockingBox({ x: side === 1 ? ex : -ex, y: 1.2, z: bz * 73, sx: 6, sy: 2.4, sz: 17.2, material: beltMat });
    }
    // Center feed housing — h8, so the carousel is REAL cover, not just decor.
    addBlockingBox({ x: side * -70, y: 4, z: bz * 73, sx: 40, sy: 8, sz: 8, material: steelMat });
    const num = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.4), signYellow);
    num.position.set(side * -70, 5.5, bz * 68.6);
    scene.add(num); arenaDecor.push(num);
    // Yellow hazard band at the housing base — baggage-area signature look.
    const hz = new THREE.Mesh(new THREE.BoxGeometry(40.4, 1, 8.4), signYellow);
    hz.position.set(side * -70, 0.5, bz * 73);
    scene.add(hz); arenaDecor.push(hz);
    const caseXs = [-96, -86, -75, -64, -53, -44];
    caseXs.forEach((cx, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 3.4), caseMats[i % caseMats.length]);
      c.position.set(side === 1 ? cx : -cx, 3.1, bz * (i % 2 === 0 ? 80 : 66));
      c.rotation.y = ((i % 3) - 1) * 0.35;
      scene.add(c); arenaDecor.push(c);
    });
  }

  // ===== Seating lounges: back-to-back benches around an h8 ad-panel spine =====
  // NO free-standing low boxes: every lounge is a REAL h8 cover spine with
  // low seat aprons attached to both sides — reads as airport seating, and the
  // tall panel means what you see is what protects you.
  const seatRow = (sx0, sz0, len) => {
    addBlockingBox({ x: sx0, y: 4, z: sz0, sx: len, sy: 8, sz: 1.2, material: steelMat });
    for (const s of [-1, 1]) {
      addBlockingBox({ x: sx0, y: 1, z: sz0 + s * 1.9, sx: len, sy: 2, sz: 2.6, material: steelMat });
      const cush = new THREE.Mesh(new THREE.BoxGeometry(len - 1, 0.5, 2.2), cushionMat);
      cush.position.set(sx0, 2.15, sz0 + s * 1.9);
      scene.add(cush); arenaDecor.push(cush);
      const ad = new THREE.Mesh(new THREE.BoxGeometry(len - 2, 4.2, 0.3), signBlue);
      ad.position.set(sx0, 5.2, sz0 + s * 0.75);
      scene.add(ad); arenaDecor.push(ad);
    }
  };
  seatRow(0, -62, 40); seatRow(0, 62, 40);
  seatRow(70, -57, 24);
  seatRow(-70, 57, 24);

  // ===== Overhead signage gantries (visual only, high above fire lanes) =====
  for (const gx of [-40, 40]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 150), mullionMat.clone());
    beam.position.set(gx, 14.5, 0);
    scene.add(beam); arenaDecor.push(beam);
    registerWallFade(beam, {
      minX: gx - 0.75, maxX: gx + 0.75,
      minY: 13.75, maxY: 15.25,
      minZ: -75, maxZ: 75
    });
    for (const sz of [-55, 0, 55]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 11), signBlue.clone());
      panel.position.set(gx, 12, sz);
      scene.add(panel); arenaDecor.push(panel);
      registerWallFade(panel, {
        minX: gx - 0.2, maxX: gx + 0.2,
        minY: 10.3, maxY: 13.7,
        minZ: sz - 5.5, maxZ: sz + 5.5
      });
    }
  }

  // ===== Parked aircraft on the aprons (visual only, beyond the glass) =====
  // The single strongest "this is an airport" cue — one plane outside each
  // glass end wall, point-symmetric. Pure decor: outside the play area.
  for (const side of [-1, 1]) {
    const px = side * 172;
    const zOff = side * -10;
    const nose = -side;                          // nose direction along z
    const fus = new THREE.Mesh(new THREE.BoxGeometry(13, 11, 82), planeWhite);
    fus.position.set(px, 8.5, zOff);
    scene.add(fus); arenaDecor.push(fus);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 14), planeWhite);
    cockpit.position.set(px, 7, zOff + nose * 46);
    scene.add(cockpit); arenaDecor.push(cockpit);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.2, 70), planeDark);
    stripe.position.set(px, 10.5, zOff);
    scene.add(stripe); arenaDecor.push(stripe);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13, 12), planeDark);
    fin.position.set(px, 17, zOff - nose * 38);
    scene.add(fin); arenaDecor.push(fin);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 15), planeWhite);
    wing.position.set(px - side * 14, 6, zOff);
    scene.add(wing); arenaDecor.push(wing);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 9), planeDark);
    engine.position.set(px - side * 16, 3.6, zOff + 2);
    scene.add(engine); arenaDecor.push(engine);
  }
}

function buildFlashpointArena() {
  // Industrial CQB arena (~220 × 150) — a tighter, well-lit concrete hall
  // divided into rooms by partition walls, corrugated-metal panels, and
  // wood paneling. Two diagonal spawns (B-1 NE / B-2 SW) each in a partial
  // enclosure with one doorway. The mid-east half hosts a Reception/
  // Blueprint room and a Research/Lab room behind their own walls. A
  // container cluster sits mid-west with a substation behind it. Concrete
  // pillars rise full-height for true cover, with chunky 7 m crate stacks
  // and 6 m drum stacks scattered as side cover. Brighter than the first
  // pass — readable at distance — but still gritty Factory/Station tone.

  // ===== Materials (lifted brightness for visibility under bigger ambient) =====
  const concreteFloor = new THREE.MeshStandardMaterial({ color: 0x4a525e, roughness: 0.95 });
  const concreteFloorAlt = new THREE.MeshStandardMaterial({ color: 0x5a626e, roughness: 0.92 });
  const floorMarking = new THREE.MeshStandardMaterial({ color: 0xe8b430, roughness: 0.7 });
  const concreteWall = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.85 });
  const concreteWallTrim = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 });
  const corrugated = new THREE.MeshStandardMaterial({ color: 0xa68a55, roughness: 0.7, metalness: 0.4 });
  const corrugatedRust = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.78, metalness: 0.3 });
  const woodPanel = new THREE.MeshStandardMaterial({ color: 0xb38545, roughness: 0.85 });
  const containerRedMat = new THREE.MeshStandardMaterial({ color: 0xc8463c, roughness: 0.7 });
  const containerBlueMat = new THREE.MeshStandardMaterial({ color: 0x356da6, roughness: 0.7 });
  const containerRustMat = new THREE.MeshStandardMaterial({ color: 0x7e564a, roughness: 0.78 });
  const containerRib = new THREE.MeshStandardMaterial({ color: 0x252b35, roughness: 0.65 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x945c34, roughness: 0.74 });
  const drumLid = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.68 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xb38545, roughness: 0.82 });
  const crateRib = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.88 });
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x5a626e, roughness: 0.55, metalness: 0.5 });
  const columnTrim = new THREE.MeshStandardMaterial({ color: 0xc4cad6, roughness: 0.45, metalness: 0.6 });
  const subStationMat = new THREE.MeshStandardMaterial({ color: 0x6a737e, roughness: 0.65, metalness: 0.45 });
  const subStationVent = new THREE.MeshStandardMaterial({ color: 0x252b35, roughness: 0.6, metalness: 0.4 });
  const platformDeck = new THREE.MeshStandardMaterial({ color: 0x4a525e, roughness: 0.55, metalness: 0.55 });
  const platformEdge = new THREE.MeshStandardMaterial({ color: 0xb8becb, roughness: 0.5, metalness: 0.45 });
  const cautionStripe = new THREE.MeshStandardMaterial({ color: 0xe8b430, roughness: 0.65 });
  const exitSign = new THREE.MeshStandardMaterial({ color: 0x6fdfff, emissive: 0x6fdfff, emissiveIntensity: 1.2, roughness: 0.4 });
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.7, metalness: 0.3 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xb8784a, roughness: 0.6, metalness: 0.45 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xfff0c0, emissiveIntensity: 1.2, roughness: 0.4 });

  // ===== Concrete floor + painted walkway markings =====
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 170), concreteFloor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005;
  scene.add(floor); arenaDecor.push(floor);
  // Diagonal walkway band running corner-to-corner (decor — visual flow line).
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(220, 6), concreteFloorAlt);
  lane.rotation.x = -Math.PI / 2; lane.rotation.z = Math.atan2(110, 190);
  lane.position.set(0, 0.012, 0);
  scene.add(lane); arenaDecor.push(lane);
  // Yellow tape boundary stripes around the central arena (decor).
  for (const z of [-22, 22]) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.6), floorMarking);
    tape.rotation.x = -Math.PI / 2; tape.position.set(0, 0.018, z);
    scene.add(tape); arenaDecor.push(tape);
  }

  // Corner-room pieces fade ONLY while they actually sit between the camera
  // and the player unit (occlusion mode — same rule as Streets' buildings),
  // so spawn-room fights stay readable while the walls still look solid
  // whenever they aren't hiding your own unit. Materials cloned per mesh —
  // corrugated/rust/exit-sign are shared across the map.
  const fadeRoomPiece = (mesh, box) => {
    mesh.material = mesh.material.clone();
    registerWallFade(mesh, { ...box, occlude: true });
  };

  // ===== B-2 spawn enclosure (SW) — 28 m central doorway in the N wall
  // PLUS a 6 m side opening at the south end of the E wall, right against
  // the south boundary (the E wall stops at z=-71 instead of z=-73, so the
  // gap from boundary to wall is the side door at the map edge). =====
  // N wall — full length, no side opening.
  fadeRoomPiece(
    addBlockingBox({ x: -96, y: 6, z: -30.5, sx: 28, sy: 12, sz: 3, material: corrugated }),
    { minX: -110, maxX: -82, minY: 0, maxY: 12, minZ: -32, maxZ: -29 }
  );
  fadeRoomPiece(
    addBlockingBox({ x: -47, y: 6, z: -30.5, sx: 14, sy: 12, sz: 3, material: corrugated }),
    { minX: -54, maxX: -40, minY: 0, maxY: 12, minZ: -32, maxZ: -29 }
  );
  // E wall — shortened from sz=41 to sz=39 so the south end sits at z=-71
  // (was z=-73), leaving a 6 m gap to the south boundary at z=-77.
  fadeRoomPiece(
    addBlockingBox({ x: -41.5, y: 6, z: -51.5, sx: 3, sy: 12, sz: 39, material: corrugatedRust }),
    { minX: -43, maxX: -40, minY: 0, maxY: 12, minZ: -71, maxZ: -32 }
  );
  // Central doorway lintel.
  const b2Lintel = new THREE.Mesh(new THREE.BoxGeometry(28, 2, 3), corrugatedRust);
  b2Lintel.position.set(-68, 11, -30.5);
  scene.add(b2Lintel); arenaDecor.push(b2Lintel);
  fadeRoomPiece(b2Lintel, { minX: -82, maxX: -54, minY: 10, maxY: 12, minZ: -32, maxZ: -29 });
  // Side opening lintel — frames the 6 m gap at the south end of the E wall,
  // right against the south boundary at the map edge.
  const b2SouthLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), corrugatedRust);
  b2SouthLintel.position.set(-41.5, 11, -74);
  scene.add(b2SouthLintel); arenaDecor.push(b2SouthLintel);
  fadeRoomPiece(b2SouthLintel, { minX: -43, maxX: -40, minY: 10, maxY: 12, minZ: -77, maxZ: -71 });
  // "B-2" exit-sign placards on both faces of the central doorway lintel.
  const b2SignS = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b2SignS.position.set(-68, 8.5, -32.05); b2SignS.rotation.y = Math.PI;
  scene.add(b2SignS); arenaDecor.push(b2SignS);
  fadeRoomPiece(b2SignS, { minX: -69.7, maxX: -66.3, minY: 7.8, maxY: 9.2, minZ: -32.3, maxZ: -31.8 });
  const b2SignN = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b2SignN.position.set(-68, 8.5, -28.95);
  scene.add(b2SignN); arenaDecor.push(b2SignN);
  fadeRoomPiece(b2SignN, { minX: -69.7, maxX: -66.3, minY: 7.8, maxY: 9.2, minZ: -29.2, maxZ: -28.7 });

  // ===== B-1 spawn enclosure (NE) — mirror of B-2: 28 m central S-wall
  // doorway PLUS a 6 m side opening at the north end of the W wall, right
  // against the north boundary. =====
  fadeRoomPiece(
    addBlockingBox({ x: 96, y: 6, z: 30.5, sx: 28, sy: 12, sz: 3, material: corrugated }),
    { minX: 82, maxX: 110, minY: 0, maxY: 12, minZ: 29, maxZ: 32 }
  );
  fadeRoomPiece(
    addBlockingBox({ x: 47, y: 6, z: 30.5, sx: 14, sy: 12, sz: 3, material: corrugated }),
    { minX: 40, maxX: 54, minY: 0, maxY: 12, minZ: 29, maxZ: 32 }
  );
  // W wall — shortened from sz=41 to sz=39 so the north end sits at z=71
  // (was z=73), leaving a 6 m gap to the north boundary at z=77.
  fadeRoomPiece(
    addBlockingBox({ x: 41.5, y: 6, z: 51.5, sx: 3, sy: 12, sz: 39, material: corrugatedRust }),
    { minX: 40, maxX: 43, minY: 0, maxY: 12, minZ: 32, maxZ: 71 }
  );
  const b1Lintel = new THREE.Mesh(new THREE.BoxGeometry(28, 2, 3), corrugatedRust);
  b1Lintel.position.set(68, 11, 30.5);
  scene.add(b1Lintel); arenaDecor.push(b1Lintel);
  fadeRoomPiece(b1Lintel, { minX: 54, maxX: 82, minY: 10, maxY: 12, minZ: 29, maxZ: 32 });
  // Side opening lintel — frames the 6 m gap at the north end of the W wall,
  // right against the north boundary at the map edge.
  const b1NorthLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), corrugatedRust);
  b1NorthLintel.position.set(41.5, 11, 74);
  scene.add(b1NorthLintel); arenaDecor.push(b1NorthLintel);
  fadeRoomPiece(b1NorthLintel, { minX: 40, maxX: 43, minY: 10, maxY: 12, minZ: 71, maxZ: 77 });
  const b1SignN = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b1SignN.position.set(68, 8.5, 32.05);
  scene.add(b1SignN); arenaDecor.push(b1SignN);
  fadeRoomPiece(b1SignN, { minX: 66.3, maxX: 69.7, minY: 7.8, maxY: 9.2, minZ: 31.8, maxZ: 32.3 });
  const b1SignS = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b1SignS.position.set(68, 8.5, 28.95); b1SignS.rotation.y = Math.PI;
  scene.add(b1SignS); arenaDecor.push(b1SignS);
  fadeRoomPiece(b1SignS, { minX: 66.3, maxX: 69.7, minY: 7.8, maxY: 9.2, minZ: 28.7, maxZ: 29.2 });

  // ===== Mid divider at z=0 — raised to 8 m to match the Factory-style
  // partition height. Still well below the ceiling so the player camera
  // reads across the hall, but tall enough to function as proper cover. =====
  addBlockingBox({ x: -49, y: 4, z: 0, sx: 18, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: -5,  y: 4, z: 0, sx: 30, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x:  44, y: 4, z: 0, sx: 28, sy: 8, sz: 3, material: concreteWall });
  // Concrete-wall base trim (decor — adds weight to the divider visually).
  for (const [tx, tw] of [[-49, 18], [-5, 30], [44, 28]]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.4, 0.6, 3.4), concreteWallTrim);
    trim.position.set(tx, 0.3, 0);
    scene.add(trim); arenaDecor.push(trim);
  }
  // Steel cap rail along the top of each segment.
  for (const [tx, tw] of [[-49, 18], [-5, 30], [44, 28]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.4, 0.3, 3.6), columnTrim);
    cap.position.set(tx, 8.15, 0);
    scene.add(cap); arenaDecor.push(cap);
  }

  // ===== Container cluster (3 parallel shipping containers, mid-west NORTH half) =====
  const containerColors = [containerRedMat, containerBlueMat, containerRustMat];
  containerColors.forEach((mat, i) => {
    const cz = 13 + i * 10;
    addBlockingBox({ x: -30, y: 4, z: cz, sx: 16, sy: 8, sz: 6, material: mat });
    // Top corner ribs (decor — short stubs on each end of the container).
    for (const xs of [-38, -22]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.4, 0.9), containerRib);
      corner.position.set(xs, 4, cz - 3);
      scene.add(corner); arenaDecor.push(corner);
      const corner2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.4, 0.9), containerRib);
      corner2.position.set(xs, 4, cz + 3);
      scene.add(corner2); arenaDecor.push(corner2);
    }
  });

  // ===== Reception / Blueprint room (mid-east, NORTH of divider) =====
  // L-shape passage: south doorway at x=22-30 (entry from divider side) AND
  // west doorway at z=18-22 (exit toward the food-court area). Walls raised
  // to 8 m to match the Factory-style partition height.
  addBlockingBox({ x: 22.5, y: 4, z: 23.5, sx: 25, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 33.5, y: 4, z: 16,   sx: 3,  sy: 8, sz: 12, material: concreteWall });
  addBlockingBox({ x: 16,   y: 4, z: 11.5, sx: 12, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 32.5, y: 4, z: 11.5, sx: 5,  sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 11.5, y: 4, z: 15.5, sx: 3,  sy: 8, sz: 5, material: concreteWall });
  // Steel cap rail along the top of each room wall.
  for (const [tx, ty, tz, lx, lz] of [
    [22.5, 8.15, 23.5, 25.4, 3.4], [33.5, 8.15, 16, 3.4, 12.4],
    [16, 8.15, 11.5, 12.4, 3.4],   [32.5, 8.15, 11.5, 5.4, 3.4],
    [11.5, 8.15, 15.5, 3.4, 5.4]
  ]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.3, lz), columnTrim);
    cap.position.set(tx, ty, tz);
    scene.add(cap); arenaDecor.push(cap);
  }
  // Wood-panel accent strip on the north wall.
  const recAccent = new THREE.Mesh(new THREE.BoxGeometry(25, 1.6, 0.2), woodPanel);
  recAccent.position.set(22.5, 5, 22);
  scene.add(recAccent); arenaDecor.push(recAccent);

  // ===== Research / Lab room (mid-east, SOUTH of divider) — L-shape passage,
  // mirror of Reception across z=0; raised to 8 m to match. =====
  addBlockingBox({ x: 22.5, y: 4, z: -11.5, sx: 25, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 33.5, y: 4, z: -17.5, sx: 3,  sy: 8, sz: 9,  material: concreteWall });
  addBlockingBox({ x: 16,   y: 4, z: -23.5, sx: 12, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 32.5, y: 4, z: -23.5, sx: 5,  sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: 11.5, y: 4, z: -15.5, sx: 3,  sy: 8, sz: 5, material: concreteWall });
  for (const [tx, ty, tz, lx, lz] of [
    [22.5, 8.15, -11.5, 25.4, 3.4], [33.5, 8.15, -17.5, 3.4, 9.4],
    [16, 8.15, -23.5, 12.4, 3.4],   [32.5, 8.15, -23.5, 5.4, 3.4],
    [11.5, 8.15, -15.5, 3.4, 5.4]
  ]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.3, lz), columnTrim);
    cap.position.set(tx, ty, tz);
    scene.add(cap); arenaDecor.push(cap);
  }
  const labAccent = new THREE.Mesh(new THREE.BoxGeometry(25, 1.6, 0.2), woodPanel);
  labAccent.position.set(22.5, 5, -13);
  scene.add(labAccent); arenaDecor.push(labAccent);

  // ===== Substation block (mid-west, SOUTH half) — 8 m tall industrial unit =====
  addBlockingBox({ x: -15, y: 4, z: -22.5, sx: 20, sy: 8, sz: 15, material: subStationMat });
  // Vent louvres on top (decor)
  const vent = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 13), subStationVent);
  vent.position.set(-15, 8.25, -22.5);
  scene.add(vent); arenaDecor.push(vent);
  // Caution-yellow band wrapping the substation base (decor)
  const subBand = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.8, 15.4), cautionStripe);
  subBand.position.set(-15, 0.6, -22.5);
  scene.add(subBand); arenaDecor.push(subBand);

  // ===== Corner partitions (L-shape walls). FLIPPED 180°: each L opens
  // toward the central play area. NW partition's walls have been LOWERED
  // to 8 m (matching the Factory-style partition height) and Wall A pulled
  // 5 m south (Wall B shortened to match) so the alley between Wall A and
  // the north boundary widens from ~7 m to ~12 m — clearly a passable side
  // opening rather than an unintended crack. SE partition mirrors. =====
  // NW corner partition (flipped, lowered, alley widened).
  addBlockingBox({ x: -80,   y: 4, z: 61.5, sx: 30, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x: -66.5, y: 4, z: 57.5, sx: 3,  sy: 8, sz: 5, material: concreteWall });
  const nwLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 6), corrugatedRust);
  nwLintel.position.set(-66.5, 8.4, 52);
  scene.add(nwLintel); arenaDecor.push(nwLintel);
  // SE corner partition (mirror — flipped, opens NE; lowered to 8 m to
  // match the NW partition's height for visual consistency).
  addBlockingBox({ x:  80,   y: 4, z: -66.5, sx: 30, sy: 8, sz: 3, material: concreteWall });
  addBlockingBox({ x:  66.5, y: 4, z: -60,   sx: 3,  sy: 8, sz: 10, material: concreteWall });
  const seLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 6), corrugatedRust);
  seLintel.position.set(66.5, 8.4, -52);
  scene.add(seLintel); arenaDecor.push(seLintel);

  // ===== Factory-style sheet-metal partitions scattered through the hall.
  // The previously-overlapping support pillars have been removed (the
  // partition itself provides all the cover; the thin pillars just
  // duplicated collision and clutter inside the panel). Two of the
  // partitions near the SW spawn (col indexes [0] and [6]) are rotated
  // 90° per the user's request — see axis values below. =====
  const columnSpots = [
    // [x, z, partition axis]
    [-50, -20, 'z'],  // outside SW door — rotated x→z
    [-50,  20, 'x'],
    [ 50, -50, 'x'],
    [ 75,  48, 'x'],  // inside NE room — sits in the door↔viewing-deck path
    [  0, -55, 'z'],
    [  0,  55, 'z'],
    [-65, -50, 'x'],  // inside SW room — rotated z→x
    [ 65, -25, 'z']
  ];
  columnSpots.forEach(([cx, cz, axis]) => {
    const PART_LEN = 8;
    if (axis === 'x') {
      addBlockingBox({ x: cx, y: 4, z: cz, sx: PART_LEN, sy: 8, sz: 0.6, material: subStationMat });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(PART_LEN + 0.2, 0.3, 0.8), columnTrim);
      trim.position.set(cx, 8.15, cz);
      scene.add(trim); arenaDecor.push(trim);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(PART_LEN, 0.06, 1.0), cautionStripe);
      stripe.position.set(cx, 0.05, cz);
      scene.add(stripe); arenaDecor.push(stripe);
    } else {
      addBlockingBox({ x: cx, y: 4, z: cz, sx: 0.6, sy: 8, sz: PART_LEN, material: subStationMat });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, PART_LEN + 0.2), columnTrim);
      trim.position.set(cx, 8.15, cz);
      scene.add(trim); arenaDecor.push(trim);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, PART_LEN), cautionStripe);
      stripe.position.set(cx, 0.05, cz);
      scene.add(stripe); arenaDecor.push(stripe);
    }
  });

  // ===== Wooden crate stacks (WIDER — 6 m square × 7 m tall) =====
  const crateSpots = [[-80, -15], [-65, 20], [80, 15], [65, -20]];
  crateSpots.forEach(([cx, cz]) => {
    addBlockingBox({ x: cx, y: 3.5, z: cz, sx: 6, sy: 7, sz: 6, material: crateMat });
    // Cross-brace plank trim along the top + middle of the visible faces (decor).
    const trimTop = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 6.2), crateRib);
    trimTop.position.set(cx, 7.05, cz);
    scene.add(trimTop); arenaDecor.push(trimTop);
    const trimMid = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.3, 6.2), crateRib);
    trimMid.position.set(cx, 3.5, cz);
    scene.add(trimMid); arenaDecor.push(trimMid);
  });

  // ===== Stacked oil drums (WIDER — 4 m square AABB, visual is 3 stacked) =====
  const drumSpots = [[-72, -5], [72, 5], [-15, 60], [15, -60]];
  drumSpots.forEach(([dx, dz]) => {
    arenaObstacles.push({ minX: dx - 2, maxX: dx + 2, minZ: dz - 2, maxZ: dz + 2, minY: 0, maxY: 6 });
    for (let stackI = 0; stackI < 3; stackI++) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 2.0, 16), drumMat);
      drum.position.set(dx, 1.0 + stackI * 2.0, dz);
      scene.add(drum); arenaDecor.push(drum);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.86, 1.86, 0.14, 16), drumLid);
      lid.position.set(dx, 2.0 + stackI * 2.0, dz);
      scene.add(lid); arenaDecor.push(lid);
    }
  });

  // ===== Viewing platform inside B-1 (4 m raised catwalk) =====
  addPlatform({ minX: 80, maxX: 108, minZ: 57, maxZ: 73, top: 4, material: platformDeck, thickness: 0.5 });
  // Visible platform-face skirt + caution-stripe top, mirrors Station's pattern.
  const vpFace = new THREE.Mesh(new THREE.BoxGeometry(28, 4, 0.5), platformEdge);
  vpFace.position.set(94, 2, 56.75);
  scene.add(vpFace); arenaDecor.push(vpFace);
  const vpStripe = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.7), cautionStripe);
  vpStripe.rotation.x = -Math.PI / 2;
  vpStripe.position.set(94, 4.05, 58);
  scene.add(vpStripe); arenaDecor.push(vpStripe);
  // Platform-edge walls — all 4 sides collision-only, jump-only. Without
  // these, ground-level units could walk straight into the platform's xz
  // footprint and clip into the deck mesh; with them, the only way onto
  // the platform is to jump (the topBuffer:0 lets a mech mid-jump pass
  // through once its center clears y=4). noProjectile:true so bullets
  // still pass through the perimeter.
  for (const w of [
    { minX: 80,    maxX: 108,   minZ: 56.7, maxZ: 57.3 },  // south face
    { minX: 80,    maxX: 108,   minZ: 72.7, maxZ: 73.3 },  // north face
    { minX: 79.7,  maxX: 80.3,  minZ: 57,   maxZ: 73   },  // west face
    { minX: 107.7, maxX: 108.3, minZ: 57,   maxZ: 73   }   // east face
  ]) {
    arenaObstacles.push({ ...w, minY: 0, maxY: 4, topBuffer: 0, noProjectile: true });
  }

  // ===== Overhead industrial decor (no collision — purely atmospheric).
  // Pushed 3× their previous height (y ≈ 33-35) — well above any mech jump
  // apex (~8 m) and outside the player camera's normal field of view, so
  // the pipes/ducts/light bars no longer intrude on the player's sight. =====
  // Long ceiling ducts spanning the hall.
  for (const dz of [-40, 0, 40]) {
    const duct = new THREE.Mesh(new THREE.BoxGeometry(200, 1.0, 1.6), ductMat);
    duct.position.set(0, 34.5, dz);
    scene.add(duct); arenaDecor.push(duct);
  }
  // Copper exposed pipes along one ceiling axis.
  for (const px of [-50, 50]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 150, 10), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, 33.9, 0);
    scene.add(pipe); arenaDecor.push(pipe);
  }
  // Fluorescent strip lights (warm-amber emissive bars).
  const lightSpots = [
    [-75, -45], [-75, 45], [-25, -25], [-25, 25],
    [ 25, -25], [ 25, 25], [ 75, -45], [ 75, 45], [0, 0]
  ];
  lightSpots.forEach(([lx, lz]) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 0.9), lampGlow);
    light.position.set(lx, 35.25, lz);
    scene.add(light); arenaDecor.push(light);
  });

  // ===== Play-area edge: invisible perimeter wall + red floor stripe =====
  addBoundaryIndicator(110, 75, 12);
}

function createArenaWalls() {
  const WALL_HEIGHT = 16;
  const HALF = 138;
  const THICKNESS = 2;
  const walls = [
    { x: HALF, z: 0, sx: THICKNESS, sz: HALF },
    { x: -HALF, z: 0, sx: THICKNESS, sz: HALF },
    { x: 0, z: HALF, sx: HALF, sz: THICKNESS },
    { x: 0, z: -HALF, sx: HALF, sz: THICKNESS }
  ];
  walls.forEach((wall) => {
    const wallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(wall.sx, WALL_HEIGHT, wall.sz))
    });
    wallBody.position.set(wall.x, WALL_HEIGHT, wall.z);
    world.addBody(wallBody);
  });
}

function wrapAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function unitOverlapsObstacle(x, y, z, radius = 1.15) {
  for (const o of arenaObstacles) {
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

function resolveUnitObstacleCollisions(mech, prevPos) {
  const radius = 1.15;
  const pos = mech.body.position;
  for (const o of arenaObstacles) {
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
      // Standard side-overlap: push out toward the nearest exterior edge.
      const push = radius - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // Unit ended up fully inside the AABB (tunneling, spawn, etc.). Picking the
      // axis-nearest edge can teleport them to the wrong side, which feels like
      // being "pushed to the other side" of the obstacle. Prefer reverting to the
      // previous (known-outside) position; if that's also inside, bail out by exiting
      // along the axis the unit penetrated least.
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
    mech.body.velocity.x = 0; mech.body.velocity.z = 0;
  }
}

function updateVfx(dt) {
  state.vfx = state.vfx.filter((vfx) => {
    vfx.life -= dt;
    if (vfx.followMech) {
      vfx.mesh.position.copy(getMeleeHitboxCenter(vfx.followMech, vfx.followForward));
      vfx.mesh.rotation.y = vfx.followMech.root.rotation.y;
    }
    vfx.mesh.material.opacity = Math.max(0, vfx.life * 4);
    vfx.mesh.scale.multiplyScalar(vfx.growth);
    if (vfx.life > 0) return true;
    scene.remove(vfx.mesh);
    vfx.mesh.geometry.dispose();
    vfx.mesh.material.dispose();
    return false;
  });
}

const clock = new THREE.Clock();
function animate() {
  try {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const now = performance.now();

    if (state.online) {
      syncKeyboardMovement();
      tickOnline(dt, now);
      // Online has its own update path (no updateProjectileSystem), so the
      // dying-trails fade has to be ticked here too — otherwise online trails
      // sit at full opacity forever, never disposed.
      updateDyingBulletTrails(now);
    } else if (state.running) {
      syncKeyboardMovement();
      const playerSprintHeld = !!(input.boostHeld || input.sprintLocked);
      getAllFighters().forEach((m) => {
        tickAmmo(m, now);
        tickSniperCharge(m, now, m === state.player ? playerSprintHeld : false);
      });
      updatePlayer(now);
      if (state.mode === '2v2') {
        runBotAIForMech(state.enemy, pickBotTargetOf(state.enemy), now);
        runBotAIForMech(state.ally, pickBotTargetOf(state.ally), now);
        runBotAIForMech(state.enemy2, pickBotTargetOf(state.enemy2), now);
      } else {
        updateEnemy(now);
      }
      applyRepulsion(now);
      const prevPositions = getAllFighters().map((m) => ({
        m, x: m.body.position.x, z: m.body.position.z
      }));
      world.step(1 / 60, dt, 3);
      prevPositions.forEach(({ m, x, z }) => resolveUnitObstacleCollisions(m, { x, z }));

      updateTransforms(dt);
      updateLocksAndReticle();
      updateAllyArrow();
      updateEnemyArrow();
      getAllFighters().forEach((m) => {
        applyImmunityGlow(m, now < m.state.invulnerableUntil);
        tickGlintRemoval(m);
        updateGlintScale(m);
      });
      updateProjectileSystem(dt);
      updateBeamDamage(now);
      updateChargedBeams(now, dt);
      updateBeamVisuals(performance.now());
      updateLaserSights();
      updateDyingBulletTrails(performance.now());
      updateVfx(dt);
      updateCamera();
      updateMechXRayVisibility();
      updateWallFade();
      updateHud();

      // Win condition. 1v1: existing player-vs-enemy check. 2v2: team A
      // (player + ally) wins when team B has both at 0 HP, and vice versa.
      if (state.mode === '2v2') {
        const teamADead = state.player.state.hp <= 0 && (state.ally?.state.hp ?? 0) <= 0;
        const teamBDead = state.enemy.state.hp <= 0 && (state.enemy2?.state.hp ?? 0) <= 0;
        if (teamADead || teamBDead) showEndMenu(teamBDead);
      } else if (state.player.state.hp <= 0 || state.enemy.state.hp <= 0) {
        showEndMenu(state.enemy.state.hp <= 0);
      }
    }
    // Drive 3D character models (idle/walk/sprint/dodge/fire) + gun attach —
    // both online and offline. No-op for mechs still on the billboard fallback.
    updateMechAnimations(dt, now);
    renderer.render(scene, camera);
  } catch (error) {
    console.error('Render loop error:', error);
  }
  requestAnimationFrame(animate);
}
