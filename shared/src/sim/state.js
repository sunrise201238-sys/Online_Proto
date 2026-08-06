// Pure-JS state factories. The shapes here are the canonical "snapshot"
// types that travel over the wire and that the client renders from.

import {
  UNIT_DATA,
  MAP_DATA,
  MAX_HP,
  BOOST_CAP,
  GROUND_BASE_Y,
  SPAWN_IMMUNITY_MS
} from './constants.js';
import { getArena } from './arena.js';

// One fighter's full sim state. Mirrors the fields populated by createMech
// in client/src/main.js, minus the Three.js / cannon refs (root, body,
// thrusters, plumeLight, trail, torso, arms, glintMesh, etc.) which live
// purely on the client.
export function createFighter(id, unitKey, spawn) {
  const unit = UNIT_DATA[unitKey];
  if (!unit) throw new Error(`Unknown unit: ${unitKey}`);
  return {
    id,
    unitKey,
    pos: { x: spawn.x, y: spawn.y ?? GROUND_BASE_Y, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    facing: 1,
    grounded: true,

    // Lifecycle.
    hp: unit.hp ?? MAX_HP,
    action: 'idle',

    // Boost.
    boost: unit.boostCap ?? BOOST_CAP,
    overheatedUntil: 0,
    refillPausedUntil: 0,
    emptyRecoverUntil: 0,

    // Lock & stun.
    redLock: false,
    hitStunUntil: 0,
    hitStunScale: 0.25,
    staggerUntil: 0,
    // Spawn protection — set per round in createMatchState; no damage while
    // now < invulnerableUntil.
    invulnerableUntil: 0,

    // Step (dodge).
    stepStartAt: 0,
    stepUntil: 0,
    stepCooldownUntil: 0,
    stepFromX: 0,
    stepFromZ: 0,
    stepToX: 0,
    stepToZ: 0,
    queuedMomentumVX: 0,
    queuedMomentumVZ: 0,

    // Momentum carry-over (used by step/jump/dash).
    momentumVX: 0,
    momentumVZ: 0,
    momentumDecay: 0.84,

    // Jump.
    jumpCooldownUntil: 0,
    airborne: false,
    jumpVelocity: 0,
    hoverUntil: 0,

    // Dash.
    dashRecoverUntil: 0,
    antiMeleeUntil: 0,

    // Lock-cut from step (homing-evade).
    evadeHomingUntil: 0,
    evadeCooldownUntil: 0,

    // Repulsion / stack timer.
    stackUntil: 0,

    // Firing.
    lastFireAt: 0,
    nextFireAt: 0,
    machineBurstRemaining: 0,
    strafeSign: 1,

    // Ammo / reload.
    ammo: unit.magCapacity ?? Infinity,
    reloadingUntil: 0,
    reloadTickStartAt: 0,

    // Sniper charge.
    sniperChargeUntil: 0,
    sniperChargeStartAt: 0,
    sniperChargeTargetId: null,
    // Floating unlock: when the DEFENDER is confirmed to have seen the glint.
    // attemptFire presets it to the charge start (correct for offline/bot
    // defenders); the server bumps it to the pessimistic cap for human
    // targets and lets their client's ack improve it. The cancel floor
    // counts from here.
    sniperGlintAt: 0,
    // Kei full-charge sweep channel (chargedBeamUntil>now = active; owner locked,
    // beam steers toward chargedBeamDir; one hit per fighter via chargedBeamHitIds).
    chargedBeamUntil: 0,
    chargedBeamDirX: 0,
    chargedBeamDirZ: 0,
    chargedBeamPitch: 0,   // steered vertical aim (radians); player drives it, bot tracks target height
    chargedBeamHitIds: [],

    // Cached unit reference is convenient at call sites; clients can
    // re-read it from UNIT_DATA[unitKey] if they want.
    unit
  };
}

let _projectileSeq = 0;
export function nextProjectileId() {
  _projectileSeq = (_projectileSeq + 1) >>> 0;
  return _projectileSeq;
}

export function createProjectile({
  id,
  ownerId,
  targetId,
  pos,
  vel,
  damage,
  homing,
  isCenterPellet = false,
  centerPelletId = null,
  clusterOffset = null,
  ttl,
  hitStunMs,
  hitStunScale = 0.25
}) {
  return {
    id: id ?? nextProjectileId(),
    ownerId,
    targetId,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: vel.x, y: vel.y, z: vel.z },
    damage,
    homing,
    homingLost: false,
    isCenterPellet,
    centerPelletId,
    clusterOffset: clusterOffset ? { x: clusterOffset.x, y: clusterOffset.y, z: clusterOffset.z } : null,
    ttl,
    hitStunMs,
    hitStunScale
  };
}

// Match state — the thing that travels in snapshots.
//
// Mode is '1v1' (p1 vs p2, team A vs team B) or '2v2' (p1+p3 team A,
// p2+p4 team B). p3UnitKey / p4UnitKey are ignored in 1v1 and the fighters
// object only contains p1 and p2 in that case. Every fighter carries
// `team` ('A' | 'B') and `targetId` (id of the enemy it's currently locked
// onto). For human-controlled fighters the targetId is mutated via the
// targetSwitch input flag; for bot-controlled fighters the server driver
// picks it before each tick.
// Trio: `rosters` maps slot id → ordered array of 3 unit keys (repeats
// allowed). When present each fighter starts as roster[0] and carries
// `roster` + `rosterIdx` in its snapshot state; on death the server calls
// respawnFighterNext to swap in the next unit at the slot's recorded
// spawn point. Omitted (null) = classic Duel, no roster fields at all.
export function createMatchState({
  mapKey = 'arena1',
  mode = '1v1',
  p1UnitKey = 'unit1',
  p2UnitKey = 'unit2',
  p3UnitKey = 'unit1',
  p4UnitKey = 'unit2',
  rosters = null,
  startTime = 0
} = {}) {
  if (!MAP_DATA[mapKey]) throw new Error(`Unknown map: ${mapKey}`);
  const arena = getArena(mapKey);
  if (rosters) {
    p1UnitKey = rosters.p1?.[0] ?? p1UnitKey;
    p2UnitKey = rosters.p2?.[0] ?? p2UnitKey;
    p3UnitKey = rosters.p3?.[0] ?? p3UnitKey;
    p4UnitKey = rosters.p4?.[0] ?? p4UnitKey;
  }
  const fighters = {
    p1: createFighter('p1', p1UnitKey, arena.spawns.p1),
    p2: createFighter('p2', p2UnitKey, arena.spawns.p2)
  };
  fighters.p1.team = 'A';
  fighters.p2.team = 'B';
  fighters.p1.targetId = 'p2';
  fighters.p2.targetId = 'p1';

  // Per-slot spawn points, kept on the match state so Trio respawns land
  // exactly where the slot's first unit spawned.
  const spawnPoints = {
    p1: { x: arena.spawns.p1.x, y: arena.spawns.p1.y ?? GROUND_BASE_Y, z: arena.spawns.p1.z },
    p2: { x: arena.spawns.p2.x, y: arena.spawns.p2.y ?? GROUND_BASE_Y, z: arena.spawns.p2.z }
  };

  if (mode === '2v2') {
    // 2v2 teammates spawn next to their counterpart, offset Z+12 (mirrors the
    // offline client's 4-corner placement). Station's deck spawns sit near the
    // END walls — offset along the deck toward centre (X) instead. Streets'
    // corner spawns sit 8u off the south/north walls, so +Z would bury the
    // teammate in the wall — offset along Z TOWARD CENTRE there.
    const station = mapKey === 'station';
    const streets = mapKey === 'arena2';
    const zOff = (s) => streets ? s.z - Math.sign(s.z) * 12 : s.z + 12;
    const p3Spawn = {
      x: station ? arena.spawns.p1.x - Math.sign(arena.spawns.p1.x) * 12 : arena.spawns.p1.x,
      y: arena.spawns.p1.y ?? GROUND_BASE_Y,
      z: station ? arena.spawns.p1.z : zOff(arena.spawns.p1)
    };
    const p4Spawn = {
      x: station ? arena.spawns.p2.x - Math.sign(arena.spawns.p2.x) * 12 : arena.spawns.p2.x,
      y: arena.spawns.p2.y ?? GROUND_BASE_Y,
      z: station ? arena.spawns.p2.z : zOff(arena.spawns.p2)
    };
    fighters.p3 = createFighter('p3', p3UnitKey, p3Spawn);
    fighters.p4 = createFighter('p4', p4UnitKey, p4Spawn);
    fighters.p3.team = 'A';
    fighters.p4.team = 'B';
    // Default targets: each pairs off with the opposite-team counterpart.
    // Bot drivers / human target-switch can override later.
    fighters.p3.targetId = 'p4';
    fighters.p4.targetId = 'p3';
    spawnPoints.p3 = { x: p3Spawn.x, y: p3Spawn.y ?? GROUND_BASE_Y, z: p3Spawn.z };
    spawnPoints.p4 = { x: p4Spawn.x, y: p4Spawn.y ?? GROUND_BASE_Y, z: p4Spawn.z };
  }

  // Spawn protection — all fighters immune for the first SPAWN_IMMUNITY_MS.
  for (const f of Object.values(fighters)) {
    f.invulnerableUntil = startTime + SPAWN_IMMUNITY_MS;
  }

  // Trio: each fighter carries its ordered roster + current index. These
  // travel in every snapshot, so clients read remaining-unit counts and
  // detect mid-match unit swaps straight off the fighter.
  if (rosters) {
    for (const f of Object.values(fighters)) {
      const r = rosters[f.id];
      f.roster = Array.isArray(r) && r.length ? r.slice() : [f.unitKey];
      f.rosterIdx = 0;
    }
  }

  return {
    tick: 0,
    startTime,
    now: startTime,
    mode,
    mapKey,
    trio: !!rosters,
    spawnPoints,
    fighters,
    projectiles: [],
    // Active 照射ビーム beams (Kei). Server-authoritative one-hit damage volumes
    // that live for durationMs. Shipped in the snapshot so the client draws them
    // state-driven (each beam's mesh spawned once, by id) — robust to the
    // snapshot drops that used to eat the one-shot 'beam-fired' event.
    beams: [],
    // Per-tick events the client uses to spawn one-shot VFX (hits, fires,
    // expirations). Cleared at the top of every tick.
    events: []
  };
}

// Helpers for team-aware iteration. Used by tickMatch and any caller that
// needs to enumerate teams without hardcoding p1/p2/p3/p4 ids.
export function getFightersOnTeam(matchState, team) {
  return Object.values(matchState.fighters).filter((f) => f.team === team);
}
export function getEnemiesOf(matchState, fighter) {
  return Object.values(matchState.fighters).filter((f) => f.team !== fighter.team);
}
export function pickClosestEnemyId(matchState, fighter) {
  const enemies = getEnemiesOf(matchState, fighter).filter((f) => f.hp > 0);
  if (enemies.length === 0) return null;
  let bestId = enemies[0].id;
  let bestDist = Infinity;
  for (const e of enemies) {
    const dx = e.pos.x - fighter.pos.x;
    const dz = e.pos.z - fighter.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; bestId = e.id; }
  }
  return bestId;
}

// Trio respawn: replace a dead fighter with its next roster unit at the
// slot's recorded spawn point, with fresh spawn immunity. The killer keeps
// all its state (no reward) — we only ever touch the dead slot. Returns the
// fresh fighter, or null when the roster is spent (slot stays dead) or the
// match isn't Trio.
export function respawnFighterNext(matchState, id) {
  const old = matchState.fighters[id];
  if (!old || !old.roster) return null;
  const nextIdx = old.rosterIdx + 1;
  if (nextIdx >= old.roster.length) return null;
  const fresh = createFighter(id, old.roster[nextIdx], matchState.spawnPoints[id]);
  fresh.team = old.team;
  fresh.roster = old.roster;
  fresh.rosterIdx = nextIdx;
  fresh.invulnerableUntil = matchState.now + SPAWN_IMMUNITY_MS;
  // Keep the old lock if that enemy is still alive; otherwise closest.
  const oldTgt = matchState.fighters[old.targetId];
  fresh.targetId = (oldTgt && oldTgt.team !== old.team && oldTgt.hp > 0)
    ? old.targetId
    : (pickClosestEnemyId(matchState, fresh) ?? old.targetId);
  matchState.fighters[id] = fresh;
  return fresh;
}

// Snapshot extraction — what the server sends to clients each tick. By
// convention we send the whole match state for now (small enough at 1v1).
// Phase 5 polish: delta-encode against last acked snapshot.
export function buildSnapshot(state) {
  return {
    tick: state.tick,
    serverTime: state.now,
    mapKey: state.mapKey,
    fighters: state.fighters,
    projectiles: state.projectiles,
    // Active Kei 照射ビーム beams. Shipped so the client can draw them
    // state-driven (each beam persists ~0.5 s across many snapshots), instead of
    // off the one-shot 'beam-fired' event which is lost when two snapshots land
    // in one render frame.
    beams: state.beams,
    events: state.events
  };
}
