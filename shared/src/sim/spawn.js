// WHERE A UNIT COMES ON. A map's spawn places are its data (arena.js ARENA_SPAWNS): the two homes p1 and p2 and, on a scene map, the `more`
// places. A match starts at the homes, a 2v2 mate beside its home (mateSpawnFor, below), and a Trio respawn comes on at its slot's own start
// on every map (state.js respawnFighterNext; the offline client, main.js respawnSlotMech) — since b1105mj (user 2026-11-28: "make scene maps use fixed spawn spots mechanics, just like concept maps do" and "use existing initial spawn spots. Other alternate spawn spots are not deleted; just not being used").
// Until then a scene map's respawn asked this file for one of the map's places: one no living enemy saw, drawn at random (pickRespawnSpawn,
// b1021x, user 2026-10-22), and for team 1's unit in the offline game the place nearest a living enemy (pickRespawnNearEnemy, b1105lf). Both
// rules are gone with their callers; the `more` places stay in the data, read by nothing.
import { GROUND_BASE_Y, FIGHTER_RADIUS } from './constants.js';
import { getArena, getArenaBounds } from './arena.js';
import { walkFloorTo, groundHeightAt, unitOverlapsObstacle, walkSegmentBlocked } from './physics.js';

// THE MATE'S SPAWN (2v2): where a slot's teammate stands at the start, beside the slot's home — the one rule for the
// server's match (state.js createMatchState) and the offline client (main.js, the 2v2 teleports). The map's own offset
// is tried first, as it always was: 12 units along z (+z), or along x toward the centre on the decks (Station, Airport,
// Flashpoint), or along z toward the centre where the homes sit 8 units off the end walls (Streets' arena2, Factory).
// Where that lands in a thing, the other sides at 12 units, then at 8, then the diagonals at 8: the first spot inside
// the arena, on a floor walked to from the home, in no box at the body's height, with the line from the home clear
// (the Hospital's far home is in a ward: 3 m north or south is its wall, 3 m east its beds, and the enemy's mate spawned
// in the wall — user 2026-10-29). None clear: the map's own offset, as before. `home` is the slot's spawn, y its body's.
export function mateSpawnFor(mapKey, home) {
  const arena = getArena(mapKey); const b = getArenaBounds(mapKey); const hx = b?.halfX ?? Infinity, hz = b?.halfZ ?? Infinity;
  const xOffset = mapKey === 'station' || mapKey === 'airport' || mapKey === 'flashpoint';
  const zTowardCentre = mapKey === 'arena2' || mapKey === 'factory';
  const first = xOffset ? [-Math.sign(home.x) * 12, 0] : zTowardCentre ? [0, -Math.sign(home.z) * 12] : [0, 12];
  const tries = [first, [0, 12], [0, -12], [12, 0], [-12, 0], [0, 8], [0, -8], [8, 0], [-8, 0], [8, 8], [-8, 8], [8, -8], [-8, -8]];
  const homeY = home.y ?? GROUND_BASE_Y; const homeFloor = homeY - GROUND_BASE_Y;
  // (two passes: a spot on the home's own floor first; then one walked to over a step or a standable thing — a mate on a
  // ward's cabinet is a spawn, a mate in its wall is none)
  for (const sameFloor of [true, false]) for (const [dx, dz] of tries) {
    const x = home.x + dx, z = home.z + dz; if (Math.abs(x) > hx - FIGHTER_RADIUS || Math.abs(z) > hz - FIGHTER_RADIUS) continue;
    const floor = walkFloorTo(home.x, home.z, homeFloor, x, z, arena.surfaces); if (Math.abs(floor - groundHeightAt(x, z, arena.surfaces, floor)) > 1e-6) continue;
    if (sameFloor && Math.abs(floor - homeFloor) > 0.3) continue;
    const y = GROUND_BASE_Y + floor; if (unitOverlapsObstacle(x, y, z, arena.obstacles) || walkSegmentBlocked(home.x, home.z, x, z, y, arena.obstacles)) continue;
    return { x, y, z };
  }
  return { x: home.x + first[0], y: homeY, z: home.z + first[1] };
}
