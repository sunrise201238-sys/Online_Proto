// Public entry point for the shared sim. Server and (eventually) client
// import everything they need from here.

export * from './constants.js';
export * from './math.js';
export * from './state.js';
export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns, getArenaLadders, getArenaPads, getArenaBounds, getGeneratedObstacles, registerGeneratedData, hasGeneratedData, generatedDataFile, FILE_DATA_MAPS } from './arena.js';
export { onLadder, ladderAt, ladderFootZone, ladderTopZone, ladderMount, ladderRelease, ladderIntentOf, ladderJumpPress, ladderHumanInput, ladderTryMount, ladderBotStep, ladderTick, ladderNormal, ladderRow, ladderGrabPoint, ladderTangent, ladderOffsetAt, ladderColumnAt, ladderExitAt, LADDER_SPAN_END, LADDER_SPAN_LINK_STEP, ladderApproach, ladderPress, LADDER_GRAB_FRONT, LADDER_GRAB_BACK, LADDER_GRAB_SIDE, LADDER_TOP_RADIUS, LADDER_GRAB_MID, LADDER_APPROACH_FRONT, LADDER_PRESS_MS } from './ladder.js';
export { PAD_HOLD_MS, PAD_CLEAR, padCharging, padZone, padAt, padChargeProgress, padArrive, padHumanInput, padBotStep, padRow } from './pads.js';   // the transporters (pads.js; b1105fk)
export {
  segmentHitsObstacle,
  unitOverlapsObstacle,
  walkSegmentBlocked,
  resolveUnitObstacleCollisions,
  groundHeightAt,
  groundSurfaceAt,
  surfaceHeightAtXZ,
  projectileHitsSurface,
  getGroundLevelY,
  obstaclesNearSegment,
  obstaclesNearPoint,
  segmentObstacleImpactT,
  surfaceImpactT
} from './physics.js';
export {
  tickBoost,
  inheritMomentum,
  applyMomentum,
  applyRepulsion,
  integrateFighter,
  integrateHorizontal,
  integrateVertical,
  dampHorizontal,
  faceTowards
} from './movement.js';
export {
  tickAmmo,
  attemptFire,
  tickSniperCharge,
  clearIncomingHoming,
  tryStartStep,
  tickStep,
  tryStartJump,
  startDash,
  reloadHolds
} from './actions.js';
export {
  spawnProjectiles, tickProjectiles, applyHitStun,
  // Shotgun volley pattern math — shared by the sim, the offline renderer,
  // and the online snapshot mirror so pellet hitboxes and visuals can never
  // drift apart.
  volleyAxes, volleyPelletOffset, volleySpreadFactor
} from './projectiles.js';
export { tickBot, pickBotTargetId, botHasLineOfSight } from './ai.js';
export { pickRespawnSpawn, mateSpawnFor } from './spawn.js';
export { bloomMax, effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit, botGateDistance, botMayFire, botNoteShot, botClearFireRule } from './bloom.js';
export { buildNavGrid, findPathOnGrid, findFiringPath, findHiddenSpot, smoothPath, attachLadderLinks } from './navgrid.js';
export { tickMatch, applyInput, emptyInput, updateLocks } from './tick.js';
export { nearestEnemyId, aimTargetOf } from './aim.js';   // (free pov, user 2026-10-30)
export {
  setMoveOrder, setForceLock, setStance, isHideOrdered, clearCommands, clearMoveOrder, getCommands, ensureCommands,
  commandTargetIdOf, tickCommandDriver, setAllyTactic
} from './command.js';
export { ALLY_TACTIC_KINDS, tacticOf, tacticSettle, setTactic, tacticEcho } from './tactic.js';   // THE ALLY TACTIC (b1105gq)
