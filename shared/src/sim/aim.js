// FREE POV helpers (user 2026-10-30). The player in free pov aims by a crosshair instead of the lock: the frame carries
// the shot direction, the rounds fly it and hit whichever enemy they meet (projectiles.js retargetFreeAim), the unit
// turns to the crosshair while firing, else faces the way it moves (movement.js faceAim / faceMovement). Two picks live here because tick.js and actions.js both need them:
//   nearestEnemyId — the lock the way back from free pov takes (the frame that leaves it says lockNearest);
//   aimTargetOf    — the enemy nearest the aim: the living enemy whose body centre lies closest to the ray from the
//                    muzzle along `dir`, among those in front of it, else the nearest enemy at all. A free-aim shot's
//                    "intent target": the round carries it as targetId, a sniper charge is marked with it (and warns
//                    EVERY enemy bot, ai.js), the hit test itself looks at every enemy.
import { PROJECTILE_MUZZLE_Y_OFFSET } from './constants.js';

export function nearestEnemyId(matchState, fighter) {
  let best = null, bestD = Infinity;
  for (const f of Object.values(matchState.fighters)) {
    if (f.team === fighter.team || f.hp <= 0) continue;
    const dx = f.pos.x - fighter.pos.x, dz = f.pos.z - fighter.pos.z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? best.id : null;
}

export function aimTargetOf(matchState, fighter, dir) {
  let best = null, bestPerp = Infinity, nearest = null, nearestD = Infinity;
  const ox = fighter.pos.x, oy = fighter.pos.y + PROJECTILE_MUZZLE_Y_OFFSET, oz = fighter.pos.z;
  for (const f of Object.values(matchState.fighters)) {
    if (f.team === fighter.team || f.hp <= 0) continue;
    const vx = f.pos.x - ox, vy = f.pos.y + 2.35 - oy, vz = f.pos.z - oz;   // (the body centre, as the hit test anchors it)
    const d2 = vx * vx + vy * vy + vz * vz;
    if (d2 < nearestD) { nearestD = d2; nearest = f; }
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t <= 0) continue;
    const perp = d2 - t * t;
    if (perp < bestPerp) { bestPerp = perp; best = f; }
  }
  return best ?? nearest;
}
