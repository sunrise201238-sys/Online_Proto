import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as CANNON from 'cannon-es';
import './style.css';
import { createConnection } from './online/connection.js';
import {
  tickMatch as simTickMatch,
  emptyInput as simEmptyInput,
  TICK_RATE_MS as SIM_TICK_RATE_MS,
  TICK_DT as SIM_TICK_DT,
  UNIT_DATA as SIM_UNIT_DATA
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
    name: 'Unit 1 / Machine Gun',
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
    autoReload: false
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
    lockRange: 43,
    projectileSpeed: 300,
    firePerMinute: 250,         // ≈ 697.67 ms cooldown
    spreadCount: 8,
    spreadAngle: THREE.MathUtils.degToRad(16),
    damage: 4,
    magCapacity: 7,
    reloadMs: 1500,
    autoReload: true
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
    projectileSpeed: 1000,
    firePerMinute: 60,         // = 1000 ms cooldown (exact)
    spreadCount: 1,
    spreadAngle: 0.02,
    damage: 50,
    magCapacity: 5,
    reloadMs: 2500,
    autoReload: false,
    sniperCharge: true,
    chargeMs: 500
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
  flashpoint: { name: 'Flashpoint' }
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
const STEP_DURATION_MS = 125;
const STEP_COOLDOWN_MS = 1000;
const STEP_BOOST_COST = 48;
const STEP_HOMING_CUT_MS = 260;
// --- Jump defaults (used when a unit's UNIT_DATA entry omits the field) ---
const JUMP_BOOST_COST = STEP_BOOST_COST;     // unit.jumpBoostCost default (= 48)
const JUMP_INITIAL_VELOCITY = 30;            // unit.jumpVelocity default
const JUMP_HOVER_MS = 300;                   // unit.jumpHoverMs default
const JUMP_COOLDOWN_MS = 1500;               // unit.jumpCooldownMs default
const SNIPER_CANCEL_BOOST_COST = STEP_BOOST_COST / 2;
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
const BOT_COVER_SEEK_RADIUS = 60;
const BOT_COVER_STEER_WEIGHT = 2.6;
const BOT_COVER_MAX_OBSTACLE_SPAN = 60;
// A fresh hit forces an evade for this long (so taking damage always provokes a
// relocate, even if the shot landed at the edge of the fire window).
const BOT_HIT_EVADE_MS = 350;
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
// Unit character billboards (Blue Archive SD models).
// Each mech renders as a camera-facing sprite instead of the old box-mech.
// Real art lives in client/public/units/<spriteKey>.png (transparent portrait,
// feet near the bottom edge). Until those PNGs exist a labelled placeholder
// stands in, so the game still runs without the assets.
// ----------------------------------------------------------------------------
const UNIT_SPRITE_HEIGHT = 6.4;   // world-units tall (feet → top of head/halo)
const UNIT_SPRITE_FOOT_Y = -3.2;  // sprite-local Y of the feet (matches old leg bottoms)
const _unitTexLoader = new THREE.TextureLoader();
const _unitArtCache = {};         // spriteKey → loaded THREE.Texture (real art)
const _unitArtPending = {};       // spriteKey → [callbacks] awaiting in-flight load

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

// Load real art (cached). onReady(texture) fires once the PNG decodes; on error
// the placeholder is kept (onReady never fires) so the game still works.
function loadUnitArt(spriteKey, onReady) {
  if (_unitArtCache[spriteKey]) { onReady(_unitArtCache[spriteKey]); return; }
  if (_unitArtPending[spriteKey]) { _unitArtPending[spriteKey].push(onReady); return; }
  _unitArtPending[spriteKey] = [onReady];
  const url = `${import.meta.env.BASE_URL}units/${spriteKey}.png`;
  _unitTexLoader.load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      _unitArtCache[spriteKey] = tex;
      const cbs = _unitArtPending[spriteKey] || [];
      delete _unitArtPending[spriteKey];
      for (const cb of cbs) cb(tex);
    },
    undefined,
    () => { delete _unitArtPending[spriteKey]; }   // keep placeholder on 404/error
  );
}

// Build the camera-facing character sprite for a unit. Starts on the placeholder
// and swaps in real art when/if it loads. Anchored at the feet (bottom-center).
function makeUnitSprite(unitData) {
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

  const applyScale = (tex) => {
    const img = tex.image;
    const aspect = (img && img.width && img.height) ? img.width / img.height : 256 / 384;
    sprite.scale.set(UNIT_SPRITE_HEIGHT * aspect, UNIT_SPRITE_HEIGHT, 1);
  };
  applyScale(placeholder);

  if (unitData.spriteKey) {
    loadUnitArt(unitData.spriteKey, (tex) => {
      mat.map = tex;
      mat.needsUpdate = true;
      applyScale(tex);
    });
  }
  return sprite;
}

// ----------------------------------------------------------------------------
// Unit 3D models (glTF / .glb) — "real 3D" characters, each holding a gun that
// is loaded SEPARATELY and parented to the character's hand bone, so the weapon
// follows every animation automatically.
//
// Per unit, keyed by spriteKey (saori / hoshino / aru):
//   units/<key>.glb      -> rigged character; clips drive idle/walk/sprint/
//                           dodge/fire (matched by name, see MODEL_CLIP_KEYWORDS)
//   units/<key>_gun.glb  -> weapon mesh, seated in the hand (OPTIONAL — skip it
//                           if the character already holds its gun)
//
// Fallback chain: .glb (3D, animated) -> .png (static billboard) -> procedural
// placeholder. Each stage degrades gracefully, so the game runs with no assets.
// ----------------------------------------------------------------------------
const UNIT_MODEL_HEIGHT = UNIT_SPRITE_HEIGHT;  // fit models to the billboard/hitbox height
const UNIT_MODEL_YAW_OFFSET = 0;               // flip to Math.PI if a model faces AWAY from its target
const MODEL_WALK_SPEED = 0.8;                  // horiz speed (u/s) above which -> walking
const MODEL_SPRINT_SPEED = 10.0;               // horiz speed (u/s) above which -> sprinting
const MODEL_FIRE_HOLD_MS = 180;                // how long the fire pose holds after a shot
const MODEL_FADE = 0.18;                       // crossfade seconds between animation states

// Match a gameplay state to an animation clip by NAME (first case-insensitive
// substring match wins, so "Armature|Run01" resolves to sprint).
const MODEL_CLIP_KEYWORDS = {
  idle:   ['idle', 'stand', 'wait'],
  walk:   ['walk', 'move'],
  sprint: ['run', 'sprint'],
  dodge:  ['dodge', 'roll', 'evade', 'avoid', 'step', 'dash'],
  fire:   ['fire', 'shoot', 'attack', 'atk', 'shot', 'skill']
};

// Common right-hand bone names across rigs (Mixamo / VRoid / Rigify / ...),
// auto-detected unless a unit overrides handBone in UNIT_MODEL_CONFIG.
const COMMON_HAND_BONES = [
  'mixamorig:righthand', 'righthand', 'right_hand', 'hand_r', 'hand.r',
  'r_hand', 'rhand', 'j_bip_r_hand', 'rightwrist', 'wrist_r', 'hand_right'
];

// Per-unit model + gun tuning. handBone: substring of the bone to hang the gun
// on (null = auto-detect from COMMON_HAND_BONES). gun.pos / gun.rot (RADIANS) /
// gun.scale seat the weapon in the grip — given in the hand bone's local space,
// they almost always need hand-tuning per model, so nudge them until the gun
// sits right. gun.scale is RELATIVE to the auto-fitted character.
const UNIT_MODEL_CONFIG = {
  saori:   { handBone: null, gun: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 } },
  hoshino: { handBone: null, gun: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 } },
  aru:     { handBone: null, gun: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 } }
};

const _gltfLoader = new GLTFLoader();
const _glbCache = {};     // url -> loaded gltf (template; cloned per mech)
const _glbPending = {};   // url -> [{ onReady, onErr }] awaiting an in-flight load

// Generic cached GLB load. onReady(gltf); onErr() on 404 / parse failure.
function loadGLB(url, onReady, onErr) {
  if (_glbCache[url]) { onReady(_glbCache[url]); return; }
  if (_glbPending[url]) { _glbPending[url].push({ onReady, onErr }); return; }
  _glbPending[url] = [{ onReady, onErr }];
  _gltfLoader.load(
    url,
    (gltf) => {
      _glbCache[url] = gltf;
      const cbs = _glbPending[url] || []; delete _glbPending[url];
      for (const c of cbs) c.onReady(gltf);
    },
    undefined,
    () => { const cbs = _glbPending[url] || []; delete _glbPending[url]; for (const c of cbs) if (c.onErr) c.onErr(); }
  );
}

// Load a unit's character glb. onReady({scene, animations}); onErr() keeps the billboard.
function loadUnitModel(spriteKey, onReady, onErr) {
  loadGLB(
    `${import.meta.env.BASE_URL}units/${spriteKey}.glb`,
    (gltf) => onReady({ scene: gltf.scene, animations: gltf.animations || [] }),
    onErr
  );
}

// Find the hand bone to hang the gun on. Tries a unit-specified name first, then
// the common cross-rig names. Depth-first pre-order means a palm bone is matched
// before its finger children.
function findHandBone(model, preferred) {
  const tryKeys = (keys) => {
    let found = null;
    model.traverse((o) => {
      if (found || !o.isBone) return;
      const n = o.name.toLowerCase();
      if (keys.some((k) => n.includes(k))) found = o;
    });
    return found;
  };
  return (preferred && tryKeys([preferred.toLowerCase()])) || tryKeys(COMMON_HAND_BONES);
}

// Clone the character template for one mech, auto-fit it, wire an AnimationMixer,
// resolve the state->clip map, hide the billboard, and attach the gun.
function attachModelToMech(mech, entry) {
  const holder = new THREE.Group();
  const model = cloneSkeleton(entry.scene);
  // Skinned meshes can be wrongly frustum-culled when their bounds animate.
  model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false; });

  // Auto-fit: scale to a consistent height, plant the feet at the foot line, and
  // center horizontally — robust to whatever native scale/origin the export used.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(UNIT_MODEL_HEIGHT / (size.y || 1));
  const fit = new THREE.Box3().setFromObject(model);
  model.position.y += UNIT_SPRITE_FOOT_Y - fit.min.y;
  model.position.x -= (fit.min.x + fit.max.x) / 2;
  model.position.z -= (fit.min.z + fit.max.z) / 2;

  holder.add(model);
  mech.root.add(holder);

  const mixer = new THREE.AnimationMixer(model);
  const clips = entry.animations;
  const findClip = (keys) => clips.find((c) => keys.some((k) => c.name.toLowerCase().includes(k)));
  const actions = {};
  for (const key of Object.keys(MODEL_CLIP_KEYWORDS)) {
    const clip = findClip(MODEL_CLIP_KEYWORDS[key]);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  // Graceful degradation when clips are missing.
  const anyAction = clips.length ? mixer.clipAction(clips[0]) : null;
  actions.idle = actions.idle || anyAction;
  actions.walk = actions.walk || actions.idle;
  actions.sprint = actions.sprint || actions.walk;
  actions.dodge = actions.dodge || actions.sprint;
  // actions.fire stays optional — if absent, locomotion just keeps playing.

  mech.modelRig = { mixer, actions, current: null, holder, model, gun: null, lastFireSeen: 0, fireUntil: 0 };
  if (mech.sprite) mech.sprite.visible = false;   // 3D model is in -> drop billboard
  if (actions.idle) { actions.idle.play(); mech.modelRig.current = actions.idle; }

  // Attach the gun (optional) to the hand bone so it rides every animation.
  const key = mech.unit?.spriteKey;
  if (!key) return;
  const cfg = UNIT_MODEL_CONFIG[key] || {};
  const handBone = findHandBone(model, cfg.handBone);
  // TEMP diagnostic — shows what the model actually contains (animation clip
  // names + which hand bone the gun attached to). Read it in the browser
  // console (F12). Remove once the models are dialed in.
  console.log(`[unit-model] ${key}: ${clips.length} clip(s): [${clips.map((c) => c.name).join(', ')}] | handBone: ${handBone ? handBone.name : 'NOT FOUND'}`);
  if (!handBone) return;   // no rigged hand -> character renders without a held gun
  loadGLB(
    `${import.meta.env.BASE_URL}units/${key}_gun.glb`,
    (gltf) => {
      const g = cfg.gun || {};
      const seat = new THREE.Group();
      seat.position.fromArray(g.pos || [0, 0, 0]);
      seat.rotation.set(...(g.rot || [0, 0, 0]));
      seat.scale.setScalar(g.scale ?? 1);
      const gun = cloneSkeleton(gltf.scene);
      gun.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false; });
      // A gun exported on its own usually keeps a big positional offset from how
      // it sat in the source scene (e.g. floating beside the character). Recenter
      // it on its own bounds so it starts AT the hand; cfg.gun.pos fine-tunes from there.
      const gbox = new THREE.Box3().setFromObject(gun);
      gun.position.sub(gbox.getCenter(new THREE.Vector3()));
      seat.add(gun);
      handBone.add(seat);
      mech.modelRig.gun = seat;
    },
    () => { /* no _gun.glb — character holds nothing extra */ }
  );
}

// Crossfade the rig to a base looping action (idle/walk/sprint/dodge/fire).
function setMechBaseAction(rig, key) {
  const next = rig.actions[key] || rig.actions.idle;
  if (!next || next === rig.current) return;
  if (rig.current) rig.current.fadeOut(MODEL_FADE);
  next.reset().fadeIn(MODEL_FADE).play();
  rig.current = next;
}

// Per-frame model update: pick a state from movement + dodge + fire, face the
// nearest live opponent, advance the mixer. dt = seconds, now = render clock.
function updateMechModel(m, dt, now) {
  const rig = m.modelRig;
  if (!rig || !rig.mixer) return;

  // Measured horizontal speed — path-agnostic, so it works identically for the
  // offline sim and the online snapshot mirror.
  const pos = m.root.position;
  if (!m._animPrev) m._animPrev = pos.clone();
  const speed = dt > 0 ? Math.hypot(pos.x - m._animPrev.x, pos.z - m._animPrev.z) / dt : 0;
  m._animPrev.copy(pos);

  // Face the nearest live opponent (visual only). Subtracting root yaw keeps the
  // facing correct whether or not other code already yawed root.
  let foe = null, best = Infinity;
  for (const e of getEnemiesOf(m)) {
    if (e.state.hp <= 0) continue;
    const d = (e.root.position.x - pos.x) ** 2 + (e.root.position.z - pos.z) ** 2;
    if (d < best) { best = d; foe = e; }
  }
  if (foe && best > 1e-4) {
    const worldYaw = Math.atan2(foe.root.position.x - pos.x, foe.root.position.z - pos.z) + UNIT_MODEL_YAW_OFFSET;
    rig.holder.rotation.y = worldYaw - m.root.rotation.y;
  }

  // Fire is detected by a CHANGE in lastFireAt (not `now - lastFireAt`) so it is
  // immune to online's server-clock vs local-clock mismatch.
  const st = m.state;
  const lf = st.lastFireAt || 0;
  if (lf !== rig.lastFireSeen) {
    rig.lastFireSeen = lf;
    if (lf > 0) rig.fireUntil = now + MODEL_FIRE_HOLD_MS;
  }

  // Priority: dodge > fire > sprint > walk > idle.
  let key;
  if (st.action === 'dash' || now < (st.stepUntil || 0)) key = 'dodge';
  else if (rig.actions.fire && now < rig.fireUntil) key = 'fire';
  else if (speed > MODEL_SPRINT_SPEED) key = 'sprint';
  else if (speed > MODEL_WALK_SPEED) key = 'walk';
  else key = 'idle';
  setMechBaseAction(rig, key);

  rig.mixer.update(dt);
}

// Drive every live fighter's 3D model once per render frame (both modes —
// getAllFighters() mirrors online snapshots onto the same state.* mechs).
function updateMechAnimations(dt, now) {
  for (const m of getAllFighters()) {
    if (m.modelRig && m.root.visible) updateMechModel(m, dt, now);
  }
}

// `addXRayGhost` is kept in the signature for call-site compatibility; the
// box-mech (and its x-ray ghost) was replaced by a character billboard, so the
// flag and `color` team tint are no longer used for the body itself.
function createMech(color, unitData, addXRayGhost = false) {
  const root = new THREE.Group();

  // Character billboard replaces the old box-mech body. Team identity reads
  // from the reticle / floating triangle / HP indicators, not body color.
  const sprite = makeUnitSprite(unitData);
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
      sniperChargeTarget: null
    }
  };

  // Kick off the 3D character load (async). On success it replaces the
  // billboard (attachModelToMech) and attaches the gun; on absence/failure the
  // static billboard sprite remains as the fallback.
  if (unitData.spriteKey) {
    loadUnitModel(
      unitData.spriteKey,
      (entry) => attachModelToMech(mech, entry),
      () => { /* no .glb yet — keep the billboard fallback */ }
    );
  }

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

function makeReticleSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  // Draw with white so the SpriteMaterial color tint produces a clean red/green.
  x.strokeStyle = '#ffffff';
  x.lineWidth = 9;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const m = 14;        // margin from canvas edge
  const arm = 32;      // length of each L-arm
  const e = 128 - m;   // far edge
  // Top-left bracket
  x.beginPath();
  x.moveTo(m, m + arm); x.lineTo(m, m); x.lineTo(m + arm, m);
  x.stroke();
  // Top-right bracket
  x.beginPath();
  x.moveTo(e - arm, m); x.lineTo(e, m); x.lineTo(e, m + arm);
  x.stroke();
  // Bottom-left bracket
  x.beginPath();
  x.moveTo(m, e - arm); x.lineTo(m, e); x.lineTo(m + arm, e);
  x.stroke();
  // Bottom-right bracket
  x.beginPath();
  x.moveTo(e - arm, e); x.lineTo(e, e); x.lineTo(e, e - arm);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  s.scale.set(5.4, 5.4, 1);
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
      damage: owner.unit.damage,
      hitStunMs: 100,
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


function createGlintForMech(mech) {
  if (mech.glintMesh) {
    // Refresh the min-flash window so a re-charge after a fast cancel still
    // shows for at least one flash duration.
    mech.glintMinHideAt = performance.now() + SNIPER_GLINT_MIN_FLASH_MS;
    mech.glintPendingRemove = false;
    return;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(248, 248, 248, 0.85)');
  grad.addColorStop(1, 'rgba(238, 238, 238, 0)');
  x.fillStyle = grad;
  x.beginPath();
  x.arc(32, 32, 32, 0, Math.PI * 2);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false
  }));
  sprite.scale.set(0.55, 0.55, 1);
  sprite.position.set(0.55, 0.55, 0.55);
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

function updateGlintScale(mech) {
  if (!mech.glintMesh) return;
  const dist = camera.position.distanceTo(mech.root.position);
  // Grow with distance so the glint stays readable on long-range maps (Streets/Square).
  const s = THREE.MathUtils.clamp(0.55 + dist * 0.05, 0.55, 6.5);
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
    const chargeMs = u.chargeMs ?? 500;
    owner.state.sniperChargeUntil = now + chargeMs;
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
  // ends it immediately and fires the projectile. Costs SNIPER_CANCEL_BOOST_COST
  // (half a step's boost). The glint still flashes via the min-hold window.
  if (
    sprintHeld
    && now < mech.state.sniperChargeUntil
    && mech.state.boost >= SNIPER_CANCEL_BOOST_COST
  ) {
    mech.state.boost = Math.max(0, mech.state.boost - SNIPER_CANCEL_BOOST_COST);
    mech.state.refillPausedUntil = now + 500;
    mech.state.sniperChargeUntil = now;
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
  spawnProjectiles(mech, target);
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
        p.mesh.position
          .copy(p.centerPellet.mesh.position)
          .addScaledVector(p.clusterOffset, spreadFactor);
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
    // Swept test: catches fast/homing projectiles that would otherwise tunnel through
    // an obstacle between frames. Obstacles flagged `noProjectile` (e.g. invisible
    // unit-only fences) are skipped so bullets fly through them.
    for (const obstacle of arenaObstacles) {
      if (obstacle.noProjectile) continue;
      if (!segmentHitsObstacle(prevPos, p.mesh.position, obstacle)) continue;
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
      p.ttl = 0;
      break;
    }
    if (p.ttl <= 0) continue;
    if (projectileHitsSurface(prevPos, p.mesh.position)) {
      despawnProjectileTrail(p, now);
      disposeProjectileMesh(p.mesh);
      state.projectiles.splice(i, 1);
      p.ttl = 0;
    }
    if (p.ttl <= 0) continue;
    // Capsule hit volume that matches the tall character billboard: free
    // vertical travel within ±hitHalfHeight of the body center, then sphere-style
    // falloff at hitRadius. Centered on root.position — the sprite's vertical
    // center (feet −3.2 .. head +3.2 around it). Mirrors shared/sim/projectiles.js.
    const hitRadius = 1.6;        // horizontal radius (unchanged)
    const hitHalfHeight = 1.6;    // vertical half-extent → capsule spans ±3.2 = full 6.4 sprite
    const hitCenter = p.target.root.position;
    const path = new THREE.Line3(prevPos, p.mesh.position.clone());
    const nearest = new THREE.Vector3();
    path.closestPointToPoint(hitCenter, true, nearest);
    const _hdx = nearest.x - hitCenter.x;
    const _hdz = nearest.z - hitCenter.z;
    const _hdy = Math.max(0, Math.abs(nearest.y - hitCenter.y) - hitHalfHeight);
    const hitDistSq = _hdx * _hdx + _hdy * _hdy + _hdz * _hdz;
    // Spawn protection: the round passes through an invulnerable target.
    // Step (dodge) immunity: the round also passes through while the target is
    // mid-step, so a well-timed dodge avoids the hit entirely.
    // Friendly fire (2v2): if owner and target are on the same team, the
    // round passes through. In 1v1 the team fields are unset so this is a no-op.
    // Dead-target pass-through: matches the shared sim behaviour — bullets
    // fly past corpses rather than triggering a hit-VFX on empty space.
    const sameTeam = p.owner?.state?.team && p.target.state.team && p.owner.state.team === p.target.state.team;
    if (p.target.state.hp > 0 && !sameTeam && now >= p.target.state.invulnerableUntil && now > p.target.state.stepUntil && hitDistSq < hitRadius * hitRadius) {
      const finalDamage = getProjectileDamage(p);
      p.target.state.hp = Math.max(0, p.target.state.hp - finalDamage);
      if (performance.now() >= p.target.state.hitStunUntil) p.target.state.hitStunUntil = performance.now() + p.hitStunMs;
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
  const hitStunScale = hitStunned ? 0.25 : 1;
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
    if (unitOverlapsObstacle(targetX, state.player.body.position.y, targetZ)) {
      stepState.stepUntil = now;
    } else {
      state.player.body.position.x = targetX;
      state.player.body.position.z = targetZ;
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

// Offline mirror of findCoverDirection in shared/src/sim/ai.js. Returns a unit
// vector toward a hiding spot just behind the nearest flankable obstacle (far
// side from the opponent) plus its distance, or null if nothing usable is in
// range. Skips noProjectile obstacles and boundary walls (too large to flank).
function findCoverDirection(px, pz, oppX, oppZ, obstacles, searchRadius) {
  let best = null;
  let bestDist = searchRadius;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.noProjectile) continue;
    if (o.maxX - o.minX > BOT_COVER_MAX_OBSTACLE_SPAN) continue;
    if (o.maxZ - o.minZ > BOT_COVER_MAX_OBSTACLE_SPAN) continue;
    const cx = (o.minX + o.maxX) * 0.5;
    const cz = (o.minZ + o.maxZ) * 0.5;
    const sx = cx - oppX;
    const sz = cz - oppZ;
    const slen = Math.sqrt(sx * sx + sz * sz);
    if (slen < 1e-3) continue;
    const behind = Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.5 + 2.5;
    const hideX = cx + (sx / slen) * behind;
    const hideZ = cz + (sz / slen) * behind;
    const ddx = hideX - px;
    const ddz = hideZ - pz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d >= bestDist) continue;
    bestDist = d;
    const inv = d > 1e-3 ? 1 / d : 0;
    best = { toX: ddx * inv, toZ: ddz * inv, dist: d };
  }
  return best;
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
  const p = state.player.root.position;
  const e = state.enemy.root.position;
  const toPlayer = new THREE.Vector3().subVectors(p, e).setY(0);
  const dist = toPlayer.length();
  const dir = toPlayer.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const eState = state.enemy.state;

  // Kite near the outer edge of the weapon's red-lock range — far enough to
  // minimize incoming fire effectiveness while still landing our own shots.
  // Most weapons derive the band from lockRange directly; multi-pellet
  // shotguns use a dedicated tighter band so they fight inside the cluster
  // spread distance (SHOTGUN_CLUSTER_SPREAD_DISTANCE = 20) where pellets
  // haven't fully fanned out yet and more land per shot.
  const lockRange = state.enemy.unit.lockRange ?? 50;
  const isShotgun = (state.enemy.unit.spreadCount ?? 1) > 1;
  let upperRange, optimalRange, lowerRange;
  if (isShotgun) {
    upperRange = 34;
    optimalRange = 27;
    lowerRange = 20;
  } else {
    upperRange = Math.max(12, lockRange - 2);
    optimalRange = Math.max(10, upperRange - 7);
    lowerRange = Math.max(6, optimalRange - 7);
  }
  // === Behavior state machine: Defense > Maze > Reposition > Engage > Pursue.
  // Each state has explicit time-bound exits — no latching. Replaces the
  // tangle of evadeActive / coverSeeking / escaping / inBurst / direSearch
  // flags with one botState whose transitions are recomputed every tick.

  // LoS + threats
  const playerHasLoS = botHasLineOfSight(
    { x: e.x, y: e.y + BOT_LOS_EYE_HEIGHT, z: e.z },
    { x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z }
  );
  const sniperCharging = state.player.state.sniperChargeTarget === state.enemy;
  if (eState.hitStunUntil > (eState.botPrevHitStun ?? 0)) eState.botHitEvadeUntil = now + BOT_HIT_EVADE_MS;
  eState.botPrevHitStun = eState.hitStunUntil;
  // Defense triggers on the SNIPER GLINT (with clear line) or a FRESH HIT.
  // We deliberately do NOT trigger on "player squeezed the trigger" (the
  // BOT_FIRE_REACT_MS window) — that made the bot too evasive, dodging every
  // MG round before it could even land. "Sprint when getting hit" is provided
  // by hitEvading below.
  const firedAtWithLoS = sniperCharging && playerHasLoS;
  const hitEvading = now < (eState.botHitEvadeUntil ?? 0);
  const underFire = firedAtWithLoS || hitEvading;
  const inBandDist = dist >= lowerRange && dist <= upperRange;

  // LoS clock (Reposition's 3 s timeout) + position-progress clock (Maze's 2 s
  // trigger). Progress is measured as real net displacement over a rolling
  // 500 ms window, not per-tick velocity, so the stun crawl can't false-trigger
  // Maze the way the old velocity-based stuck-detector did.
  if (playerHasLoS || eState.botLastLoSAt == null) eState.botLastLoSAt = now;
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
    if (Math.hypot(ddx, ddz) > 3) eState.botLastProgressAt = now;
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

  // --- Stuck cut-in detection: if net displacement over the last 3 s drops
  // below 5 units (any state), fire a fresh 1.5 s Defense to bounce loose.
  // Tracker reinitialises on first tick and resets on every Defense entry.
  // Skips airborne and stun frames so landing pauses / hit-freezes don't count.
  let stuckTriggered = false;
  if (eState.botStuckCheckAt == null) {
    eState.botStuckCheckX = e.x;
    eState.botStuckCheckZ = e.z;
    eState.botStuckCheckAt = now;
  } else if (now - eState.botStuckCheckAt >= 3000) {
    const sddx = e.x - eState.botStuckCheckX;
    const sddz = e.z - eState.botStuckCheckZ;
    if (Math.hypot(sddx, sddz) < 5
        && !eState.airborne
        && now >= eState.hitStunUntil
        && (eState.botState ?? 'pursue') !== 'defense') {
      stuckTriggered = true;
    }
    eState.botStuckCheckX = e.x;
    eState.botStuckCheckZ = e.z;
    eState.botStuckCheckAt = now;
  }

  // --- State transition by precedence ---
  const prevState = eState.botState ?? 'pursue';
  let nextState = prevState;
  const inDefenseGrace = prevState === 'defense' && now < (eState.botDefenseUntil ?? 0);

  if (underFire || inDefenseGrace || stuckTriggered) {
    nextState = 'defense';
  } else if (noProgressTime > 2000) {
    nextState = 'maze';
  } else if (prevState === 'maze') {
    // Exit Maze when the obstacle is GENUINELY behind us — i.e. the line to the
    // player clears. Only counts if LoS was blocked when Maze fired (otherwise
    // it'd exit on tick 1 every time the bot is stuck-but-visible, e.g. against
    // a side pillar). 5 s safety still applies as the ultimate latch break.
    const losReacquired = playerHasLoS && eState.botMazeLosBlockedAtEntry;
    if (losReacquired || (now - (eState.botStateEnteredAt ?? now)) > 5000) {
      nextState = inBandDist ? 'engage' : 'pursue';
    }
  } else if (inBandDist) {
    if (noLoSTime > 3000 || prevState === 'reposition') {
      nextState = playerHasLoS ? 'engage' : 'reposition';
    } else {
      nextState = 'engage';
    }
  } else {
    nextState = 'pursue';
  }

  // --- State entry: commit per-state directions and timers ---
  if (nextState !== prevState) {
    eState.botState = nextState;
    eState.botStateEnteredAt = now;

    if (nextState === 'maze') {
      // Tangent to nearest obstacle, biased toward the player so we round the
      // wall in the direction that closes the gap. Committed for the duration.
      let mxe = avoid.rx, mze = avoid.rz;
      const ml = Math.hypot(mxe, mze);
      if (ml < 0.1) {
        const sg = eState.botOrbitSign ?? (Math.random() > 0.5 ? 1 : -1);
        mxe = side.x * sg;
        mze = side.z * sg;
      } else {
        const ux = mxe / ml, uz = mze / ml;
        let tx = -uz, tz = ux;
        if (tx * dir.x + tz * dir.z < 0) { tx = -tx; tz = -tz; }
        mxe = ux + tx * 1.3;
        mze = uz + tz * 1.3;
      }
      const ml2 = Math.hypot(mxe, mze) || 1;
      eState.botMazeDirX = mxe / ml2;
      eState.botMazeDirZ = mze / ml2;
      // Record whether LoS was blocked at entry. The LoS-restored exit only
      // counts when it was — otherwise (stuck against a side pillar with LoS
      // already clear) Maze would exit on the first tick and never get to act.
      eState.botMazeLosBlockedAtEntry = !playerHasLoS;
    }

    if (nextState === 'engage'
        && (prevState === 'pursue' || prevState === 'maze' || prevState === 'defense' || eState.botOrbitSign == null)) {
      // Commit a fresh orbit direction. Engage <-> Reposition keep the same sign.
      eState.botOrbitSign = Math.random() > 0.5 ? 1 : -1;
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
      // 350 ms for a normal hit; ≥600 ms while a sniper is mid-charge so the
      // sprint outlasts the glint window. Stuck-triggered runs 1.5 s to give
      // the strafe room to break the wedge.
      eState.botDefenseUntil = now + (stuckTriggered ? 1500 : (sniperCharging ? 600 : 350));
      eState.botDefenseInCover = false;
      eState.botDefenseCoverAt = 0;
      eState.botDefensePeekDone = false;
      eState.botDefenseStuckTicks = 0;
      eState.botDefenseStuckMode = !!stuckTriggered;
      // Reset the stuck window — next check starts 3 s after this entry.
      eState.botStuckCheckX = e.x;
      eState.botStuckCheckZ = e.z;
      eState.botStuckCheckAt = now;
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
      eState.botDefenseUntil = now + (sniperCharging ? 600 : 350);
      eState.botDefenseInCover = false;
      eState.botDefenseCoverAt = 0;
      eState.botDefensePeekDone = false;
      eState.botDefenseStuckTicks = 0;
      eState.botDefenseStuckMode = false;
    }
    const minDur = sniperCharging ? 600 : 350;
    if ((eState.botDefenseUntil ?? 0) < now + minDur) {
      eState.botDefenseUntil = now + minDur;
    }
  }

  // --- State behavior: heading + sprint intent + optional jump ---
  let mx = 0, mz = 0;
  let wantSprint = false;
  let jumpThisTick = false;
  let jumpDirX = dir.x, jumpDirZ = dir.z;
  const botS = eState.botState;

  if (botS === 'pursue') {
    // Pursue handles BOTH sides of the band: toward the player when too far,
    // AWAY from them when too close. Without the negative branch the bot just
    // keeps closing through lowerRange and collides at zero distance.
    const tooClose = dist < lowerRange;
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
    // Committed circumnavigation + light avoidance to keep rounding corners.
    let tx = (eState.botMazeDirX ?? side.x) + avoid.rx * 0.3;
    let tz = (eState.botMazeDirZ ?? side.z) + avoid.rz * 0.3;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;
    wantSprint = true;
    // Vertical Maze: hop up onto a reachable platform (Station).
    if (state.enemy.grounded && !eState.airborne) {
      const perch = findHighGroundPerch(e.x, e.z, myFloorY, BOT_PERCH_SEEK_RADIUS);
      if (perch && perch.dist < BOT_LEDGE_JUMP_REACH) {
        jumpDirX = perch.toX; jumpDirZ = perch.toZ;
        if (botStartJump(now)) jumpThisTick = true;
      }
    }
  } else if (botS === 'engage' || botS === 'reposition') {
    // Committed orbit (same direction across Engage <-> Reposition), with a
    // gentle pull toward the optimal distance.
    const sign = eState.botOrbitSign ?? 1;
    const pull = Math.max(-0.5, Math.min(0.5, (dist - optimalRange) * 0.12));
    let tx = side.x * sign + dir.x * pull + avoid.rx * 0.6;
    let tz = side.z * sign + dir.z * pull + avoid.rz * 0.6;
    const l = Math.hypot(tx, tz) || 1;
    mx = tx / l; mz = tz / l;

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
        eState.botLastProgressAt = now - 2001;
        eState.botDefenseUntil = now;
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
    if (u.magCapacity != null && s.ammo <= 0) {
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
      if (fired) s.nextFireAt = now + u.fireCooldownMs + PhaserLikeBetween(400, 1200);
      else s.nextFireAt = now + 220;
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
  // Hit-stun parity: the player keeps moving at 0.25x speed while stunned
  // (hitStunScale at line ~1100) rather than freezing. Apply the same scale to
  // the bot AFTER momentum so sprint + momentum scale together, matching the
  // player's velocity exactly. Previously the bot used moveScalar 0 and stood
  // frozen, eating entire bursts instead of crawling to safety.
  if (now < eState.hitStunUntil) {
    state.enemy.body.velocity.x *= 0.25;
    state.enemy.body.velocity.z *= 0.25;
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

  state.reticle.position.set(0, 0.2, 0);
  state.reticle.material.color.set(enemyFiring ? 0xff5f72 : 0x7effbd);
  const camDist = camera.position.distanceTo(tgt.root.position);
  const distScale = THREE.MathUtils.clamp(camDist / 22, 0.7, 4.5);
  state.reticle.scale.setScalar(6.1 * distScale);
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
  el.innerHTML = '<svg viewBox="0 0 32 32" width="100%" height="100%">'
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
  el.innerHTML = '<svg viewBox="0 0 32 32" width="100%" height="100%">'
    + '<path d="M16 3 L28 27 L16 21 L4 27 Z" fill="#ff6a2c" stroke="#0b1622" '
    + 'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  document.body.appendChild(el);
  state.enemyEdgeArrow = el;
  return el;
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
  // timestamps are stored in performance.now() reference). Online passes
  // Date.now() because the server-mirrored timestamps are Date.now()-style.
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
    scene.remove(m.root);
    world.removeBody(m.body);
    m.trail.forEach((t) => scene.remove(t.mesh));
  });
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
  } else {
    state.player.body.position.set(-24, 2.45, 0);
    state.enemy.body.position.set(24, 2.45, 0);
  }
  // 2v2 placement: drop ally next to the player, enemy2 next to the enemy,
  // each offset 12 units along Z. Keeps each team grouped at their map corner
  // without overlapping or requiring per-map spawn data.
  if (state.mode === '2v2') {
    const pp = state.player.body.position;
    state.ally.body.position.set(pp.x, pp.y, pp.z + 12);
    const ep = state.enemy.body.position;
    state.enemy2.body.position.set(ep.x, ep.y, ep.z + 12);
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
    targetSwitch: !!input.targetSwitchTap
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
  s.invulnerableUntil = fighter.invulnerableUntil;
  s.overheatedUntil = fighter.overheatedUntil;
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

const ONLINE_AVAILABLE_MAPS = new Set(['arena1', 'arena2', 'factory', 'square', 'lobby', 'station', 'flashpoint']);

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
    ${unitEntries.map(([id, u]) => `<button data-unit="${id}">${u.name}</button>`).join('')}
    <button data-leave class="online-leave-btn">Leave</button>
  `;
  app.appendChild(menu);
  menu.querySelectorAll('button[data-unit]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onl.conn.sendConfigure({ unitKey: btn.dataset.unit });
    });
  });
  menu.querySelector('button[data-leave]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    showSelectMenu();
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

  // Headline text. 2v2 host: prompt to start. 2v2 non-host: waiting for host
  // to start. 1v1: existing text driven off opp picks.
  let waitingText;
  if (mode === '2v2') {
    if (isHost) {
      if (!myCfg.unitKey) waitingText = 'Pick your unit…';
      else if (!myCfg.mapKey) waitingText = 'Pick a map…';
      else waitingText = 'Lobby — start when ready';
    } else {
      waitingText = 'Waiting for host to start…';
    }
  } else {
    const oppId = isHost ? 'p2' : 'p1';
    const oppCfg = cfg?.config?.[oppId] ?? {};
    if (!oppCfg.unitKey) waitingText = isHost ? 'Waiting for opponent to pick unit…' : 'Waiting for host to pick unit…';
    else if (!isHost && !oppCfg.mapKey) waitingText = 'Waiting for host to pick map…';
    else waitingText = 'Starting…';
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
      const labelText = mode === '2v2' ? '(empty — bot fill)' : '(waiting…)';
      statusHtml = `<span class="roster-status">${labelText}</span>
        <button class="roster-join" data-join-slot="${s}">Join</button>`;
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

  // 2v2 host's explicit Start Now button. Only enabled once they've picked
  // unit + map (otherwise the server rejects).
  const canStart = mode === '2v2' && isHost && !!myCfg.unitKey && !!myCfg.mapKey;
  const startBtnHtml = mode === '2v2' && isHost
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

  // Spawn-protection glow. invulnerableUntil is server-clock (Date.now) here,
  // mirrored from the snapshot, so compare against Date.now().
  const immuneNow = Date.now();
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
    updateGlintScale(m);
  });
  updateVfx(dt);
  updateCamera();
  updateMechXRayVisibility();
  updateHud(Date.now());
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
    occupied: cfg?.occupied ?? []
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
    ${unitEntries.map(([id, unit]) => `<button data-player-unit="${id}">${unit.name}</button>`).join('')}
    <div class="menu-divider">— Online —</div>
    <button data-online-play class="online-play-btn">Online (vs Player)</button>
    <button data-online-debug class="online-debug-btn">Online (Debug Connect)</button>
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

  menu.querySelectorAll('button[data-player-unit]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      state.playerUnitKey = button.dataset.playerUnit;
      clearMenus();
      proceedAfterPlayerPick();
    });
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
function showUnitPicker(title, onPick) {
  const unitEntries = Object.entries(UNIT_DATA);
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `<h2>${title}</h2>${unitEntries.map(([id, unit]) => `<button data-unit-pick="${id}">${unit.name}</button>`).join('')}`;
  app.appendChild(menu);
  menu.querySelectorAll('button[data-unit-pick]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const key = btn.dataset.unitPick;
      clearMenus();
      onPick(key);
    });
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

function clearArenaDecor() {
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

function addBlockingBox({ x, y, z, sx, sy, sz, material, topBuffer, decorOnly }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.userData.blocking = !decorOnly;
  scene.add(mesh);
  arenaDecor.push(mesh);
  if (decorOnly) return mesh;
  const obstacle = { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, minY: y - sy / 2, maxY: y + sy / 2 };
  if (topBuffer !== undefined) obstacle.topBuffer = topBuffer;
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
  arenaSurfaces.push({ minX, maxX, minZ, maxZ, maxTop: top, heightAt: () => top });
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
  if (axis === 'x') mesh.rotation.z = -angle;
  else mesh.rotation.x = -angle;
  scene.add(mesh);
  arenaDecor.push(mesh);
  arenaSurfaces.push({
    minX, maxX, minZ, maxZ,
    maxTop: Math.max(lowY, highY),
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
}

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
  const vendor = new THREE.MeshStandardMaterial({ color: 0xe33c4d, roughness: 0.6 });
  const billboard = new THREE.MeshStandardMaterial({ color: 0xffe2a3, emissive: 0x4a3915, emissiveIntensity: 0.3, roughness: 0.6 });

  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.4 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xfff4c2, emissiveIntensity: 0.9, roughness: 0.3 });
  const scooter = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6 });
  const stallAwning = new THREE.MeshStandardMaterial({ color: 0xd95a52, roughness: 0.7 });

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
    addBlockingBox({ x: b.x, y: b.h / 2, z: -48, sx: b.sx, sy: b.h, sz: 24, material: b.mat });
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
    addBlockingBox({ x: b.x, y: b.h / 2, z: 48, sx: b.sx, sy: b.h, sz: 24, material: b.mat });
  });

  // (Outer back walls removed — the play area is bounded by the invisible
  // boundary walls at HALF_Z=92, well inside z=±100; tall back-of-block
  // walls past the boundary just blocked the horizon view from near the
  // map edge.)

  // ===== Footbridge (deck at y=8, spans 16m × 56m) =====
  addPlatform({
    minX: -BRIDGE_HALF_X, maxX: BRIDGE_HALF_X,
    minZ: BRIDGE_MIN_Z, maxZ: BRIDGE_MAX_Z,
    top: BRIDGE_TOP, thickness: 0.8, material: bridgeDeck
  });
  // Railings along bridge sides
  const RAIL_H = 1.6;
  const railLength = BRIDGE_MAX_Z - BRIDGE_MIN_Z;
  addBlockingBox({ x: -BRIDGE_HALF_X - 0.2, y: BRIDGE_TOP + RAIL_H / 2, z: 0, sx: 0.4, sy: RAIL_H, sz: railLength, material: railing });
  addBlockingBox({ x: BRIDGE_HALF_X + 0.2, y: BRIDGE_TOP + RAIL_H / 2, z: 0, sx: 0.4, sy: RAIL_H, sz: railLength, material: railing });
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
  // Corner signage towers (neon-emissive)
  addBlockingBox({ x: -110, y: 12, z: -94, sx: 5, sy: 24, sz: 5, material: sign });
  addBlockingBox({ x: 110, y: 12, z: 94, sx: 5, sy: 24, sz: 5, material: signCyan });
  addBlockingBox({ x: -110, y: 14, z: 94, sx: 5, sy: 28, sz: 5, material: signCyan });
  addBlockingBox({ x: 110, y: 14, z: -94, sx: 5, sy: 28, sz: 5, material: sign });

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
    addBlockingBox({ x, y: 1.4, z, sx: 1.4, sy: 2.6, sz: 1.2, material: vendor });
  });

  // Street stalls with awnings (sidewalk side, opposite ends from vending)
  const stallSpots = [[-30, -15], [30, 15], [-58, 14.8], [60, -14.8]];
  stallSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: 0.85, z, sx: 3, sy: 1.7, sz: 1.5, material: stallAwning });
    addBlockingBox({ x, y: 2.7, z, sx: 3.4, sy: 0.18, sz: 2.0, material: storefrontA });
  });

  // Parked scooters (low cover)
  const scooterSpots = [[-20, -14.5], [-12, -14.5], [12, 14.5], [20, 14.5], [-100, -14.5], [100, 14.5]];
  scooterSpots.forEach(([x, z]) => {
    addBlockingBox({ x, y: 0.55, z, sx: 1.8, sy: 1.0, sz: 0.7, material: scooter });
  });

  // Plaza dressing — planters and a vending row
  addBlockingBox({ x: -22, y: 0.85, z: -38, sx: 8, sy: 1.6, sz: 1.6, material: sidewalk });
  addBlockingBox({ x: 22, y: 0.85, z: -38, sx: 8, sy: 1.6, sz: 1.6, material: sidewalk });
  addBlockingBox({ x: -22, y: 0.85, z: 38, sx: 8, sy: 1.6, sz: 1.6, material: sidewalk });
  addBlockingBox({ x: 22, y: 0.85, z: 38, sx: 8, sy: 1.6, sz: 1.6, material: sidewalk });
  addBlockingBox({ x: -28, y: 1.4, z: -52, sx: 1.4, sy: 2.6, sz: 1.2, material: vendor });
  addBlockingBox({ x: -26, y: 1.4, z: -52, sx: 1.4, sy: 2.6, sz: 1.2, material: vendor });
  addBlockingBox({ x: 26, y: 1.4, z: 52, sx: 1.4, sy: 2.6, sz: 1.2, material: vendor });
  addBlockingBox({ x: 28, y: 1.4, z: 52, sx: 1.4, sy: 2.6, sz: 1.2, material: vendor });

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
  addBlockingBox({ x: 0, y: 12, z: -100, sx: 220, sy: 24, sz: 4, material: wall });
  addBlockingBox({ x: 0, y: 12, z: 100, sx: 220, sy: 24, sz: 4, material: wall });
  addBlockingBox({ x: -110, y: 12, z: 0, sx: 4, sy: 24, sz: 200, material: wall });
  addBlockingBox({ x: 110, y: 12, z: 0, sx: 4, sy: 24, sz: 200, material: wall });

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
  // Bright blue header bar above the glass wall
  addBlockingBox({ x: 0, y: 22.4, z: -97.6, sx: 182, sy: 0.8, sz: 0.4, material: blueGlow });
  // Lower glow line at the top of the mezzanine deck
  addBlockingBox({ x: 0, y: UPPER_Y + 0.6, z: -97.6, sx: 182, sy: 0.4, sz: 0.4, material: blueGlow });

  // Side wall logo accents (vertical glow strips + Millennium-style panels)
  for (const sxn of [-1, 1]) {
    addBlockingBox({ x: sxn * 107.6, y: 14, z: 0, sx: 0.5, sy: 8, sz: 60, material: wallAccent });
    // Glow line accent along its length
    addBlockingBox({ x: sxn * 107.4, y: 14, z: 0, sx: 0.4, sy: 0.4, sz: 64, material: blueGlow });
    // Logo panels along the wall (lower floor side only — z>0)
    for (let i = 0; i < 3; i += 1) {
      const z = 30 - i * 28;
      const lblock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 7), wallAccent);
      lblock.position.set(sxn * 107.2, 9, z);
      scene.add(lblock); arenaDecor.push(lblock);
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

  // ===== Sleek angular benches with blue cushions (much bigger, proper cover ~5m total) =====
  const drawSciFiBench = (x, baseY, z, sofa = false) => {
    const w = sofa ? 9 : 6;
    // Angular base (white shell)
    addBlockingBox({ x, y: baseY + 0.9, z, sx: w, sy: 1.8, sz: 3.0, material: benchBase });
    // Seat slab on top
    addBlockingBox({ x, y: baseY + 1.95, z, sx: w + 0.5, sy: 0.3, sz: 3.2, material: benchSeat });
    // Blue cushion
    addBlockingBox({ x, y: baseY + 2.45, z, sx: w * 0.85, sy: 0.6, sz: 2.4, material: cushion });
    // Backrest
    addBlockingBox({ x, y: baseY + 3.6, z: z + 1.4, sx: w, sy: 2.9, sz: 0.5, material: benchSeat });
    // Backrest blue accent line
    addBlockingBox({ x, y: baseY + 4.95, z: z + 1.6, sx: w * 0.92, sy: 0.2, sz: 0.3, material: blueGlow });
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
  drawSciFiBench(-30, 0, 32, false);
  drawSciFiBench(30, 0, 32, false);

  // Coffee tables paired with seating (taller now)
  const coffeeTables = [[-60, 70], [60, 70], [0, 78]];
  coffeeTables.forEach(([x, z]) => {
    addBlockingBox({ x, y: 0.7, z, sx: 4.0, sy: 1.4, sz: 2.6, material: deskTop });
    addBlockingBox({ x, y: 1.45, z, sx: 4.2, sy: 0.18, sz: 2.8, material: railGlass });
  });

  // ===== Big indoor topiary plants (full cover ~5m wide × ~9m tall) =====
  // Replaces the earlier kiosk/pod silhouette. A wide stone planter at the base plus
  // a bushy foliage column that fully hides the ~5m mech behind it. The foliage AABB
  // matches the dense visible mass; sphere clusters break up the silhouette so it
  // reads as an organic plant.
  const drawHoloKiosk = (x, baseY, z /* axis ignored — plants are radially symmetric */) => {
    const potW = 5.2;
    const potH = 2.5;
    // Wide stone pot — solid cover for the lower body
    addBlockingBox({ x, y: baseY + potH / 2, z, sx: potW, sy: potH, sz: potW, material: pillarMat });
    // Pot rim (decor)
    addBlockingBox({ x, y: baseY + potH + 0.18, z, sx: potW + 0.5, sy: 0.36, sz: potW + 0.5, material: marbleDark, decorOnly: true });
    // Blue glow accent ring on the rim (sci-fi lobby touch)
    addBlockingBox({ x, y: baseY + potH + 0.42, z, sx: potW + 0.42, sy: 0.14, sz: potW + 0.42, material: blueGlow, decorOnly: true });
    // Soil / mulch layer (decor)
    addBlockingBox({ x, y: baseY + potH + 0.05, z, sx: potW * 0.86, sy: 0.1, sz: potW * 0.86, material: trunkMat, decorOnly: true });

    // Bush body — collision AABB providing upper-body cover, hidden inside the foliage spheres
    const bushBaseY = baseY + potH + 0.4;
    const bushW = 4.6;
    const bushH = 5.4;
    addBlockingBox({ x, y: bushBaseY + bushH / 2, z, sx: bushW, sy: bushH, sz: bushW, material: treeFoliage });

    // Stacked column of overlapping spheres along the central axis to hide the box edges
    const stack = [
      { dy: bushBaseY + 1.0, r: 3.0 },
      { dy: bushBaseY + 2.6, r: 2.8 },
      { dy: bushBaseY + 4.0, r: 2.5 },
      { dy: bushBaseY + 5.2, r: 2.0 }
    ];
    stack.forEach(({ dy, r }) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), treeFoliage);
      ball.position.set(x, dy, z);
      scene.add(ball); arenaDecor.push(ball);
    });
    // Off-axis offshoots for an asymmetric, more natural silhouette
    const offshoots = [
      { dx: 1.6, dz: 1.3, dy: bushBaseY + 1.6, r: 2.0 },
      { dx: -1.7, dz: -1.0, dy: bushBaseY + 2.2, r: 2.1 },
      { dx: 1.4, dz: -1.5, dy: bushBaseY + 3.4, r: 1.8 },
      { dx: -1.5, dz: 1.4, dy: bushBaseY + 3.9, r: 1.8 },
      { dx: 0.6, dz: 1.6, dy: bushBaseY + 4.7, r: 1.4 }
    ];
    offshoots.forEach(({ dx, dy, dz, r }) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), treeFoliage);
      ball.position.set(x + dx, dy, z + dz);
      scene.add(ball); arenaDecor.push(ball);
    });
    // Crowning tuft at the very top
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), treeFoliage);
    top.position.set(x, bushBaseY + bushH + 0.2, z);
    scene.add(top); arenaDecor.push(top);
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
  drawHoloKiosk(0, 0, 42, 'x');
  drawHoloKiosk(-30, 0, 60, 'z');
  drawHoloKiosk(30, 0, 60, 'z');
  drawHoloKiosk(-15, 0, 88, 'x');
  drawHoloKiosk(15, 0, 88, 'x');
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
    const col = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R, PILLAR_R, 24, 24), pillarMat);
    col.position.set(x, 12, z);
    scene.add(col); arenaDecor.push(col);
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

  // ===== Stopped freight cars on two staggered tracks (6 — big hard cover) =====
  const drawTrainCar = (cx, beltZ, bodyMat) => {
    addBlockingBox({ x: cx, y: 4, z: beltZ, sx: 35, sy: 8, sz: 5, material: bodyMat });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(35.6, 0.7, 5.4), trainRoof);
    roof.position.set(cx, 8.35, beltZ);
    scene.add(roof); arenaDecor.push(roof);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(35, 1.0, 5.2), trainAccent);
    skirt.position.set(cx, 0.55, beltZ);
    scene.add(skirt); arenaDecor.push(skirt);
    const stripeMid = new THREE.Mesh(new THREE.BoxGeometry(35, 0.8, 5.05), trainAccent);
    stripeMid.position.set(cx, 5.2, beltZ);
    scene.add(stripeMid); arenaDecor.push(stripeMid);
    for (const dx of [-17.8, 17.8]) {
      const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), railSteel);
      buf.rotation.z = Math.PI / 2;
      buf.position.set(cx + dx, 2.8, beltZ);
      scene.add(buf); arenaDecor.push(buf);
    }
    // Wheel sets (decor)
    for (const dx of [-12, 12]) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 16), trainAccent);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(cx + dx, 1.0, beltZ);
      scene.add(axle); arenaDecor.push(axle);
    }
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
    addBlockingBox({ x: cx, y: CEIL_Y / 2, z: cz, sx: 4, sy: CEIL_Y, sz: 4, material: pillarSteel });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 5.4), pillarRim);
    cap.position.set(cx, CEIL_Y - 0.4, cz);
    scene.add(cap); arenaDecor.push(cap);
    const flange = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.0, 5.8), pillarRim);
    flange.position.set(cx, PLATFORM_Y + 0.5, cz);
    scene.add(flange); arenaDecor.push(flange);
  };
  [
    [-105, 55], [-35, 55], [35, 55], [105, 55],
    [-105, -55], [-35, -55], [35, -55], [105, -55],
    [-105, 115], [-35, 115], [35, 115], [105, 115],
    [-105, -115], [-35, -115], [35, -115], [105, -115]
  ].forEach(([x, z]) => drawPillar(x, z));

  // ===== Ticket booths — biggest cover, along the deep back walls =====
  const drawBooth = (cx, cz) => {
    addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 28, sy: 15, sz: 18, material: booth });
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
  };
  drawBooth(-65, 122);
  drawBooth(65, 122);
  drawBooth(-65, -122);
  drawBooth(65, -122);

  // ===== Departure information boards (perpendicular sight-line blockers) =====
  const drawDepartureBoard = (cx, cz) => {
    addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 24, sy: 15, sz: 3, material: boardFrame });
    for (const dz of [-1.6, 1.6]) {
      const screen = new THREE.Mesh(new THREE.BoxGeometry(22, 13, 0.15), boardScreen);
      screen.position.set(cx, 7.8, cz + dz);
      scene.add(screen); arenaDecor.push(screen);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(25, 0.6, 3.4), boardFrame);
    crown.position.set(cx, 15.3, cz);
    scene.add(crown); arenaDecor.push(crown);
  };
  drawDepartureBoard(-65, 80);
  drawDepartureBoard(65, 80);
  drawDepartureBoard(-65, -80);
  drawDepartureBoard(65, -80);

  // ===== Hall partition walls — break the back hall into bays =====
  const drawHallWall = (cx, cz) => {
    addBlockingBox({ x: cx, y: 7.5, z: cz, sx: 32, sy: 15, sz: 2.5, material: hallWall });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(33, 0.5, 3), beam);
    trim.position.set(cx, 15.25, cz);
    scene.add(trim); arenaDecor.push(trim);
    for (const dz of [-1.4, 1.4]) {
      const ad = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.12), billboard);
      ad.position.set(cx, 8, cz + dz);
      scene.add(ad); arenaDecor.push(ad);
    }
  };
  drawHallWall(-70, 95);
  drawHallWall(70, 95);
  drawHallWall(-70, -95);
  drawHallWall(70, -95);

  // ===== Info kiosks on the platforms (8 — full-cover boxes) =====
  const drawKiosk = (cx, cz) => {
    addBlockingBox({ x: cx, y: 6, z: cz, sx: 12, sy: 12, sz: 10, material: kiosk });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.25), boardScreen);
    sign.position.set(cx, PLATFORM_Y + 5, cz - 5.15);
    scene.add(sign); arenaDecor.push(sign);
  };
  [
    [-105, 30], [-35, 30], [35, 30], [105, 30],
    [-105, -30], [-35, -30], [35, -30], [105, -30]
  ].forEach(([x, z]) => drawKiosk(x, z));

  // ===== Vending machine rows along the back of each platform (10) =====
  const drawVending = (cx, cz) => {
    addBlockingBox({ x: cx, y: 5.5, z: cz, sx: 8, sy: 11, sz: 3, material: vending });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 0.12), vendingFront);
    panel.position.set(cx, 7, cz - 1.56);
    scene.add(panel); arenaDecor.push(panel);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.6, 3.4), boardFrame);
    top.position.set(cx, 11.3, cz);
    scene.add(top); arenaDecor.push(top);
  };
  [
    [-95, 65], [-45, 65], [0, 65], [45, 65], [95, 65],
    [-95, -65], [-45, -65], [0, -65], [45, -65], [95, -65]
  ].forEach(([x, z]) => drawVending(x, z));

  // ===== Shipping containers — long horizontal cover (4) =====
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
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.7, 7.8), i % 2 === 0 ? crateA : crateB);
      c.position.set(cx, 1.4 + i * 2.75, cz);
      scene.add(c); arenaDecor.push(c);
    }
  };
  drawCrateStack(-75, 18);
  drawCrateStack(75, 18);
  drawCrateStack(-75, -18);
  drawCrateStack(75, -18);

  // ===== Info totems mid-platform (4 — slim full-height columns) =====
  const drawTotem = (cx, cz) => {
    addBlockingBox({ x: cx, y: 7, z: cz, sx: 3, sy: 14, sz: 3, material: totem });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10), totemGlow);
    globe.position.set(cx, 15.2, cz);
    scene.add(globe); arenaDecor.push(globe);
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

  // ===== B-2 spawn enclosure (SW) — 28 m central doorway in the N wall
  // PLUS a 6 m side opening at the south end of the E wall, right against
  // the south boundary (the E wall stops at z=-71 instead of z=-73, so the
  // gap from boundary to wall is the side door at the map edge). =====
  // N wall — full length, no side opening.
  addBlockingBox({ x: -96, y: 6, z: -30.5, sx: 28, sy: 12, sz: 3, material: corrugated });
  addBlockingBox({ x: -47, y: 6, z: -30.5, sx: 14, sy: 12, sz: 3, material: corrugated });
  // E wall — shortened from sz=41 to sz=39 so the south end sits at z=-71
  // (was z=-73), leaving a 6 m gap to the south boundary at z=-77.
  addBlockingBox({ x: -41.5, y: 6, z: -51.5, sx: 3, sy: 12, sz: 39, material: corrugatedRust });
  // Central doorway lintel.
  const b2Lintel = new THREE.Mesh(new THREE.BoxGeometry(28, 2, 3), corrugatedRust);
  b2Lintel.position.set(-68, 11, -30.5);
  scene.add(b2Lintel); arenaDecor.push(b2Lintel);
  // Side opening lintel — frames the 6 m gap at the south end of the E wall,
  // right against the south boundary at the map edge.
  const b2SouthLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), corrugatedRust);
  b2SouthLintel.position.set(-41.5, 11, -74);
  scene.add(b2SouthLintel); arenaDecor.push(b2SouthLintel);
  // "B-2" exit-sign placards on both faces of the central doorway lintel.
  const b2SignS = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b2SignS.position.set(-68, 8.5, -32.05); b2SignS.rotation.y = Math.PI;
  scene.add(b2SignS); arenaDecor.push(b2SignS);
  const b2SignN = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b2SignN.position.set(-68, 8.5, -28.95);
  scene.add(b2SignN); arenaDecor.push(b2SignN);

  // ===== B-1 spawn enclosure (NE) — mirror of B-2: 28 m central S-wall
  // doorway PLUS a 6 m side opening at the north end of the W wall, right
  // against the north boundary. =====
  addBlockingBox({ x: 96, y: 6, z: 30.5, sx: 28, sy: 12, sz: 3, material: corrugated });
  addBlockingBox({ x: 47, y: 6, z: 30.5, sx: 14, sy: 12, sz: 3, material: corrugated });
  // W wall — shortened from sz=41 to sz=39 so the north end sits at z=71
  // (was z=73), leaving a 6 m gap to the north boundary at z=77.
  addBlockingBox({ x: 41.5, y: 6, z: 51.5, sx: 3, sy: 12, sz: 39, material: corrugatedRust });
  const b1Lintel = new THREE.Mesh(new THREE.BoxGeometry(28, 2, 3), corrugatedRust);
  b1Lintel.position.set(68, 11, 30.5);
  scene.add(b1Lintel); arenaDecor.push(b1Lintel);
  // Side opening lintel — frames the 6 m gap at the north end of the W wall,
  // right against the north boundary at the map edge.
  const b1NorthLintel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), corrugatedRust);
  b1NorthLintel.position.set(41.5, 11, 74);
  scene.add(b1NorthLintel); arenaDecor.push(b1NorthLintel);
  const b1SignN = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b1SignN.position.set(68, 8.5, 32.05);
  scene.add(b1SignN); arenaDecor.push(b1SignN);
  const b1SignS = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), exitSign);
  b1SignS.position.set(68, 8.5, 28.95); b1SignS.rotation.y = Math.PI;
  scene.add(b1SignS); arenaDecor.push(b1SignS);

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
        runBotAIForMech(state.enemy, pickClosestEnemyOf(state.enemy), now);
        runBotAIForMech(state.ally, pickClosestEnemyOf(state.ally), now);
        runBotAIForMech(state.enemy2, pickClosestEnemyOf(state.enemy2), now);
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
      updateDyingBulletTrails(performance.now());
      updateVfx(dt);
      updateCamera();
      updateMechXRayVisibility();
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
