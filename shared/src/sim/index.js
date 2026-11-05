// Public entry point for the shared sim. Server and (eventually) client
// import everything they need from here.

export * from './constants.js';
export * from './math.js';
export * from './state.js';
export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns, getArenaLadders, getArenaBounds, getGeneratedObstacles, registerGeneratedData, hasGeneratedData, generatedDataFile, FILE_DATA_MAPS } from './arena.js';
export { onLadder, ladderAt, ladderFootZone, ladderTopZone, ladderMount, ladderRelease, ladderIntentOf, ladderJumpPress, ladderHumanInput, ladderTryMount, ladderBotStep, ladderTick, ladderNormal, ladderRow, ladderGrabPoint, ladderApproach, ladderPress, LADDER_GRAB_FRONT, LADDER_GRAB_BACK, LADDER_GRAB_SIDE, LADDER_TOP_RADIUS, LADDER_GRAB_MID, LADDER_APPROACH_FRONT, LADDER_PRESS_MS } from './ladder.js';
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
export { bloomMax, effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit, botGateDistance, botMayFire, botNoteShot, botClearFireRule, tickStillness, isStill } from './bloom.js';
export { buildNavGrid, findPathOnGrid, findFiringPath, findHiddenSpot, smoothPath, attachLadderLinks } from './navgrid.js';
export { tickMatch, applyInput, emptyInput, updateLocks } from './tick.js';
export { nearestEnemyId, aimTargetOf } from './aim.js';   // (free pov, user 2026-10-30)
export {
  setMoveOrder, setForceLock, setStance, isHideOrdered, clearCommands, clearMoveOrder, getCommands, ensureCommands,
  commandTargetIdOf, tickCommandDriver
} from './command.js';
