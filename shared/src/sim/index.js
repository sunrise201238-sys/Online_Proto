// Public entry point for the shared sim. Server and (eventually) client
// import everything they need from here.

export * from './constants.js';
export * from './math.js';
export * from './state.js';
export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns } from './arena.js';
export {
  segmentHitsObstacle,
  unitOverlapsObstacle,
  resolveUnitObstacleCollisions,
  groundHeightAt,
  surfaceHeightAtXZ,
  projectileHitsSurface,
  getGroundLevelY
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
export { spawnProjectiles, tickProjectiles } from './projectiles.js';
export { tickBot } from './ai.js';
export { tickMatch, applyInput, emptyInput, updateLocks } from './tick.js';
