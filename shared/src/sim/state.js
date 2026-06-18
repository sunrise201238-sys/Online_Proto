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
    sniperChargeTargetId: null,

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
  hitStunMs
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
    hitStunMs
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
export function createMatchState({
  mapKey = 'arena1',
  mode = '1v1',
  p1UnitKey = 'unit1',
  p2UnitKey = 'unit2',
  p3UnitKey = 'unit1',
  p4UnitKey = 'unit2',
  startTime = 0
} = {}) {
  if (!MAP_DATA[mapKey]) throw new Error(`Unknown map: ${mapKey}`);
  const arena = getArena(mapKey);
  const fighters = {
    p1: createFighter('p1', p1UnitKey, arena.spawns.p1),
    p2: createFighter('p2', p2UnitKey, arena.spawns.p2)
  };
  fighters.p1.team = 'A';
  fighters.p2.team = 'B';
  fighters.p1.targetId = 'p2';
  fighters.p2.targetId = 'p1';

  if (mode === '2v2') {
    // 2v2 teammates spawn next to their counterpart, offset Z+12 (mirrors the
    // offline client's 4-corner placement). Station's narrow track is flanked by
    // raised platforms (clear only for |z|<=11), so there +Z lands inside a
    // platform — offset along the track toward centre (X) instead.
    const station = mapKey === 'station';
    const p3Spawn = {
      x: station ? arena.spawns.p1.x - Math.sign(arena.spawns.p1.x) * 12 : arena.spawns.p1.x,
      y: arena.spawns.p1.y ?? GROUND_BASE_Y,
      z: station ? arena.spawns.p1.z : arena.spawns.p1.z + 12
    };
    const p4Spawn = {
      x: station ? arena.spawns.p2.x - Math.sign(arena.spawns.p2.x) * 12 : arena.spawns.p2.x,
      y: arena.spawns.p2.y ?? GROUND_BASE_Y,
      z: station ? arena.spawns.p2.z : arena.spawns.p2.z + 12
    };
    fighters.p3 = createFighter('p3', p3UnitKey, p3Spawn);
    fighters.p4 = createFighter('p4', p4UnitKey, p4Spawn);
    fighters.p3.team = 'A';
    fighters.p4.team = 'B';
    // Default targets: each pairs off with the opposite-team counterpart.
    // Bot drivers / human target-switch can override later.
    fighters.p3.targetId = 'p4';
    fighters.p4.targetId = 'p3';
  }

  // Spawn protection — all fighters immune for the first SPAWN_IMMUNITY_MS.
  for (const f of Object.values(fighters)) {
    f.invulnerableUntil = startTime + SPAWN_IMMUNITY_MS;
  }

  return {
    tick: 0,
    startTime,
    now: startTime,
    mode,
    mapKey,
    fighters,
    projectiles: [],
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
    events: state.events
  };
}
