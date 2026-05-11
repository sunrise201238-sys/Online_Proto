// Pure-JS state factories. The shapes here are the canonical "snapshot"
// types that travel over the wire and that the client renders from.

import {
  UNIT_DATA,
  MAP_DATA,
  MAX_HP,
  BOOST_CAP,
  GROUND_BASE_Y
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

    // Movement modifier.
    vulnerabilityMove: false,

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
export function createMatchState({
  mapKey = 'arena1',
  p1UnitKey = 'unit1',
  p2UnitKey = 'unit2',
  startTime = 0
} = {}) {
  if (!MAP_DATA[mapKey]) throw new Error(`Unknown map: ${mapKey}`);
  const arena = getArena(mapKey);
  const fighters = {
    p1: createFighter('p1', p1UnitKey, arena.spawns.p1),
    p2: createFighter('p2', p2UnitKey, arena.spawns.p2)
  };
  // Set initial lock targeting (each fighter targets the other).
  fighters.p1.targetId = 'p2';
  fighters.p2.targetId = 'p1';
  return {
    tick: 0,
    startTime,
    now: startTime,
    mapKey,
    fighters,
    projectiles: [],
    // Per-tick events the client uses to spawn one-shot VFX (hits, fires,
    // expirations). Cleared at the top of every tick.
    events: []
  };
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
