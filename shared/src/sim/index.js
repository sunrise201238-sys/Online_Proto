// Public entry point for the shared sim. Server and (eventually) client
// import everything they need from here.

export * from './constants.js';
export * from './math.js';
export * from './state.js';
export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns } from './arena.js';
export {
  segmentHitsObstacle,
  unitOverlapsObstacle,
  walkSegmentBlocked,
  resolveUnitObstacleCollisions,
  groundHeightAt,
  surfaceHeightAtXZ,
  projectileHitsSurface,
  getGroundLevelY,
  obstaclesNearSegment,
  segmentObstacleImpactT,
  surfaceImpactT
} from './physics.js';
export {
  tickBoost,
  inheritMomentum,
  applyMomentum,
  applyRepulsion,
  integrateFighter,
  dampHorizontal,
  faceTowards
} from './movement.js';
export {
  tickAmmo,
  attemptFire,
  tickSniperCharge,
  clearIncomingHoming,
  triggerDashDefense,
  tryStartStep,
  tickStep,
  tryStartJump,
  startDash
} from './actions.js';
export {
  spawnProjectiles, tickProjectiles,
  // Shotgun volley pattern math — shared by the sim, the offline renderer,
  // and the online snapshot mirror so pellet hitboxes and visuals can never
  // drift apart.
  volleyAxes, volleyPelletOffset, volleySpreadFactor
} from './projectiles.js';
export { tickBot, pickBotTargetId } from './ai.js';
export { buildNavGrid, findPathOnGrid, findFiringPath, smoothPath } from './navgrid.js';
export { tickMatch, applyInput, emptyInput, updateLocks } from './tick.js';
export {
  setMoveOrder, setForceLock, clearCommands, clearMoveOrder, getCommands,
  commandTargetIdOf, tickCommandDriver
} from './command.js';
