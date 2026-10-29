// Where a Trio respawn stands (b1021x). A map's spawn places are its data (arena.js ARENA_SPAWNS): the two homes
// p1 and p2 and, on a map that names them, the `more` places (Town: the user's six, 2026-10-18; Dust, Backrooms and
// Warehouse: the user's ten, 2026-10-22). On a map without `more` the answer is null and the slot keeps its own
// start, as before. `others` are the match's other fighters ({ team, hp, pos }), the dead slot left out.
// The rule (user 2026-10-22, "keep the respawned unit's contact with the enemy as late as possible"): a place no
// living enemy sees — sight at a metre over the floor, the bots' own test, as the enemies stand at the moment of the
// death — drawn at random; none unseen, the farthest from the nearest enemy. (A first tier of unseen places 12 m or
// more from the enemy was tried and dropped the same day: it left places that were never drawn.) Teammates count for
// nothing (the earlier rule put a respawn beside a living teammate; gone with the user's word). A place within SPAWN_CLEAR of a living body is passed over
// while another remains. A map whose spawns say `pick: 'random'` draws any free place at random instead (Spacecraft,
// user 2026-10-19). The server (index.js, the Trio step) and the offline client (main.js respawnSlotMech) ask this
// and hand the place to respawnFighterNext / the fresh mech.
import { MAP_DATA, GROUND_BASE_Y, FIGHTER_RADIUS } from './constants.js';
import { getArena, getArenaBounds } from './arena.js';
import { botHasLineOfSight } from './nbrain.js';
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

const SPAWN_CLEAR = 8;    // (units: two metres — a living body closer than this sits on the place)
const SPAWN_EYE = 4;      // (units: a metre over the floor — the sight that counts here; a crate hides the bots' lower eye)

export function pickRespawnSpawn(mapKey, team, others) {
  if (!MAP_DATA[mapKey]) return null;
  const arena = getArena(mapKey);
  const sp = arena.spawns;
  if (!sp.more) return null;
  const places = [sp.p1, sp.p2, ...sp.more].map((p) => ({ x: p.x, y: p.y ?? GROUND_BASE_Y, z: p.z }));
  const live = others.filter((f) => f.hp > 0);
  const free = places.filter((p) => live.every((f) => Math.hypot(f.pos.x - p.x, f.pos.z - p.z) >= SPAWN_CLEAR));
  const pool = free.length ? free : places;
  const draw = (ps) => ps[Math.floor(Math.random() * ps.length)];
  if (sp.pick === 'random') return draw(pool);
  const enemies = live.filter((f) => f.team !== team);
  const eye = (p) => ({ x: p.x, y: p.y + SPAWN_EYE, z: p.z });
  const seen = (p) => enemies.some((f) => botHasLineOfSight(eye(p), eye(f.pos), arena.obstacles, arena.surfaces));
  const nearest = (p) => Math.min(...enemies.map((f) => Math.hypot(f.pos.x - p.x, f.pos.z - p.z)));
  const unseen = pool.filter((p) => !seen(p));
  if (unseen.length) return draw(unseen);
  let best = null, bd = -Infinity;
  for (const p of pool) { const d = nearest(p); if (d > bd) { best = p; bd = d; } }   // (ties keep the data's order)
  return best;
}
