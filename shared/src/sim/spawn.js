// Where a Trio respawn stands (b1021x). A map's spawn places are its data (arena.js ARENA_SPAWNS): the two homes
// p1 and p2 and, on a map that names them, the `more` places (Town: the user's six, 2026-10-18). On a map without
// `more` the answer is null and the slot keeps its own start, as before. `others` are the match's other fighters
// ({ team, hp, pos }), the dead slot left out. A living teammate means "join it": a place a teammate sees, the
// nearest to a teammate. No living teammate means "stay unseen": a place no living enemy sees, the farthest from
// the nearest enemy. Sight is the bots' own rule at their eye height. A place within SPAWN_CLEAR of a living body
// is passed over while another remains; ties keep the data's order. The server (index.js, the Trio step) and the
// offline client (main.js respawnSlotMech) ask this and hand the place to respawnFighterNext / the fresh mech.
import { MAP_DATA, GROUND_BASE_Y, BOT_LOS_EYE_HEIGHT } from './constants.js';
import { getArena } from './arena.js';
import { botHasLineOfSight } from './nbrain.js';

const SPAWN_CLEAR = 8;

export function pickRespawnSpawn(mapKey, team, others) {
  if (!MAP_DATA[mapKey]) return null;
  const arena = getArena(mapKey);
  const sp = arena.spawns;
  if (!sp.more) return null;
  const places = [sp.p1, sp.p2, ...sp.more].map((p) => ({ x: p.x, y: p.y ?? GROUND_BASE_Y, z: p.z }));
  const live = others.filter((f) => f.hp > 0);
  const mates = live.filter((f) => f.team === team);
  const enemies = live.filter((f) => f.team !== team);
  const eye = (p) => ({ x: p.x, y: p.y + BOT_LOS_EYE_HEIGHT, z: p.z });
  const sees = (p, f) => botHasLineOfSight(eye(p), eye(f.pos), arena.obstacles, arena.surfaces);
  const nearest = (p, fs) => Math.min(...fs.map((f) => Math.hypot(f.pos.x - p.x, f.pos.z - p.z)));
  // [first, second]: the smaller wins; the first is the sight, the second the distance
  const score = mates.length ? (p) => [mates.some((f) => sees(p, f)) ? 0 : 1, nearest(p, mates)]
    : enemies.length ? (p) => [enemies.some((f) => sees(p, f)) ? 1 : 0, -nearest(p, enemies)]
      : () => [0, 0];
  const free = places.filter((p) => live.every((f) => Math.hypot(f.pos.x - p.x, f.pos.z - p.z) >= SPAWN_CLEAR));
  let best = null, bs = null;
  for (const p of (free.length ? free : places)) {
    const s = score(p);
    if (!bs || s[0] < bs[0] || (s[0] === bs[0] && s[1] < bs[1])) { best = p; bs = s; }
  }
  return best;
}
