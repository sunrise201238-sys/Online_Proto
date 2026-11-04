// THE LADDERS (user 2026-11-04/05). A ladder is a RECORD of the arena (arena.js ARENA_LADDERS, by map): the climb line — the
// column the body rides, a body's width off the rungs — its facing into the wall, its grab width, the feet's height at its
// foot and at the top of the climb (the parapet's or the hatch's lip), and the EXIT: where the body stands on the platform the
// ladder serves. One rule, run by the server's tick, the client's online prediction and the offline client alike (tick.js
// applyInput / tickMatch; the client's updatePlayer / updateEnemy / updateTransforms): the collision data is not touched for a
// ladder — the rule carries the body up the line, over the lip and onto the exit, and from the exit back over the lip and
// down, the walls and floors ignored meanwhile (the push-out, the void's edge and the repulsion skip a climber, the record's
// validity is the test's, ladder.test.js).
//   The jump button is the ladder's (user: "jump button will be the ladder key"): standing at a ladder's foot (in front of the
//   line, within its width, the feet within a step of the foot's floor) or on its platform by the exit, the press MOUNTS — no
//   jump; on the ladder the press LETS GO — the body drops where it is (no boost, no jump arc). The press that mounted or let
//   go is spent: the button held on is nothing until let go (ladderJumpLatch — offline the button is a held state, online a
//   tap the server re-arms from the held state, and the latch reads both the same). A body passing or jumping through a
//   ladder is never caught (no mid-air grab).
//   On the ladder a HUMAN steers by the stick along the ladder's facing: toward the wall climbs, away descends, anything else
//   holds — sideways never lets go (user: "moving the joycon left/right won't make the unit jump off"). A BOT rides to the end
//   it set out for (botLadderGoal, the brain's: +1 up from the foot, -1 down from the exit), nothing it is told meanwhile
//   changes that. Reaching the TOP of the climb the body is carried onto the exit and released standing there (user: "put the
//   unit on the platform when they reach the top"); reaching the FOOT it stands.
//   The climb is LADDER_CLIMB_SPEED (constants.js: the sprint's steady speed, user's choice) times dt, every leg — a pure
//   function of the ticks, the same on every host (the offline client steps it on a 16 ms clock, updateTransforms); no gravity,
//   no momentum, no stun (a hit does its damage, applyHitStun skips a climber; a stun running at the mount is dropped), no
//   boost drained or refilled (tickBoost is not run), no firing, dodging or sprinting (actions.js refuses them). Dying on the
//   ladder lets go (the body, hidden as every dead body is, drops).
import { GROUND_BASE_Y, LADDER_CLIMB_SPEED, SURFACE_STEP_HEIGHT } from './constants.js';

export const LADDER_GRAB_FRONT = 2.0;   // units in front of the climb line a body stands to mount (0.5 m)
export const LADDER_GRAB_BACK = 0.6;    // and behind it (toward the wall)
export const LADDER_TOP_RADIUS = 4.0;
// The point a bot walks to before it mounts from the foot: the middle of the foot zone, LADDER_GRAB_MID in front of the climb
// line (the route grid's ladder links name it — navgrid.js attachLadderLinks; a follower heads for it with the goal set).
export const LADDER_GRAB_MID = (LADDER_GRAB_FRONT - LADDER_GRAB_BACK) / 2;
export function ladderGrabPoint(L) { const n = ladderNormal(L); return { x: L.x - n.x * LADDER_GRAB_MID, z: L.z - n.z * LADDER_GRAB_MID }; }   // units around the exit a body stands to mount from the top (1 m)

const G = GROUND_BASE_Y;

export function onLadder(st) { return st.ladder != null; }
export function ladderNormal(L) { return { x: Math.sin(L.yaw), z: Math.cos(L.yaw) }; }

// The foot zone: the feet within a step of the foot's floor, the body in front of the line within the grab width.
export function ladderFootZone(L, pos) {
  if (Math.abs(pos.y - G - L.y0) > SURFACE_STEP_HEIGHT) return false;
  const n = ladderNormal(L); const dx = pos.x - L.x, dz = pos.z - L.z;
  const d = dx * n.x + dz * n.z, s = -dx * n.z + dz * n.x;
  return d >= -LADDER_GRAB_FRONT && d <= LADDER_GRAB_BACK && Math.abs(s) <= L.w / 2;
}
// The top zone: the feet within a step of the exit's floor, the body within LADDER_TOP_RADIUS of the exit.
export function ladderTopZone(L, pos) {
  if (Math.abs(pos.y - G - L.ey) > SURFACE_STEP_HEIGHT) return false;
  return Math.hypot(pos.x - L.ex, pos.z - L.ez) <= LADDER_TOP_RADIUS;
}
// The ladder a body stands at, and which end — or null.
export function ladderAt(ladders, pos) {
  for (let i = 0; i < ladders.length; i += 1) {
    const L = ladders[i];
    if (ladderFootZone(L, pos)) return { index: i, end: 'foot' };
    if (ladderTopZone(L, pos)) return { index: i, end: 'top' };
  }
  return null;
}

function clearMotion(st, vel) { vel.x = 0; vel.z = 0; st.momentumVX = 0; st.momentumVZ = 0; st.queuedMomentumVX = 0; st.queuedMomentumVZ = 0; }

// Onto the ladder at one end: the enter leg slides the body onto the line, then it climbs toward the other end.
export function ladderMount(st, vel, ladders, index, end) {
  st.ladder = index; st.ladderDir = end === 'foot' ? 1 : -1; st.ladderLeg = 'enter'; st.ladderIntent = st.ladderDir;
  clearMotion(st, vel);
  st.airborne = false; st.grounded = false; st.jumpVelocity = 0; st.action = 'climb';
  st.hitStunUntil = 0; st.plantUntil = 0; st.landedOnLid = false;
  st.ladderJumpLatch = true; st.ladderClock = undefined;
  st.yaw = ladders[index].yaw;
}
// Off the ladder: standing where it is ('stand' — the foot or the exit, the floor it stands on noted for the landing plant and
// the void's edge) or dropped ('drop' — a let-go or a death: airborne from here, gravity's from the next tick).
export function ladderRelease(st, pos, vel, how) {
  clearMotion(st, vel);
  if (how === 'stand') { st.airborne = false; st.grounded = true; st.floorY = pos.y; }
  else { st.airborne = true; st.grounded = false; st.jumpVelocity = 0; }
  st.action = 'idle';
  st.ladder = undefined; st.ladderDir = undefined; st.ladderLeg = undefined; st.ladderIntent = undefined; st.ladderClock = undefined;
  if (st.botLadderGoal) st.botLadderGoal = undefined;
}

// The stick against the ladder's facing: toward the wall climbs (+1), away descends (-1), anything else holds (0).
export function ladderIntentOf(L, moveX, moveZ) {
  const m = Math.hypot(moveX, moveZ); if (m < 0.15) return 0;
  const n = ladderNormal(L); const a = (moveX * n.x + moveZ * n.z) / m;
  return a >= 0.5 ? 1 : a <= -0.5 ? -1 : 0;
}
// The jump button through the latch: true on a press the ladder may take; the button let go re-arms the latch.
export function ladderJumpPress(st, input) {
  if (!input.jump) { st.ladderJumpLatch = false; return false; }
  return !st.ladderJumpLatch;
}
// A human on the ladder, this tick's input: the jump lets go, the stick steers (the enter and exit legs are committed).
export function ladderHumanInput(st, pos, vel, input, ladders) {
  const L = ladders[st.ladder];
  if (!L) { ladderRelease(st, pos, vel, 'drop'); return; }
  if (ladderJumpPress(st, input)) { st.ladderJumpLatch = true; ladderRelease(st, pos, vel, 'drop'); return; }
  st.ladderIntent = st.ladderLeg === 'climb' ? ladderIntentOf(L, input.moveX, input.moveZ) : st.ladderDir;
  clearMotion(st, vel); st.action = 'climb'; st.yaw = L.yaw;
}
// A human's jump press on the ground: at a ladder's end it mounts (true) — the caller then makes no jump.
export function ladderTryMount(st, pos, vel, ladders) {
  const at = ladderAt(ladders, pos); if (!at) return false;
  ladderMount(st, vel, ladders, at.index, at.end); return true;
}
// A bot, every tick: its goal mounts it at the matching end, and on the ladder it rides to the other end whatever its brain
// says (the brain's velocity is thrown away). True while the bot is on a ladder.
export function ladderBotStep(st, pos, vel, ladders) {
  if (st.ladder == null) {
    if (!st.botLadderGoal || st.airborne) return false;
    const at = ladderAt(ladders, pos);
    if (!at || (st.botLadderGoal > 0) !== (at.end === 'foot')) return false;
    ladderMount(st, vel, ladders, at.index, at.end);
  }
  st.ladderIntent = st.ladderDir; clearMotion(st, vel); st.action = 'climb'; st.yaw = ladders[st.ladder].yaw;
  return true;
}

function moveToward(pos, tx, ty, tz, step) {
  const dx = tx - pos.x, dy = ty - pos.y, dz = tz - pos.z; const d = Math.hypot(dx, dy, dz);
  if (d <= step) { pos.x = tx; pos.y = ty; pos.z = tz; return true; }
  const k = step / d; pos.x += dx * k; pos.y += dy * k; pos.z += dz * k; return false;
}
// The movement, one tick of dt: the enter leg onto the line, the climb between the foot and the top, the exit leg onto the
// platform — LADDER_CLIMB_SPEED along each; the stand at the foot or the exit, the drop of a dead climber.
export function ladderTick(st, pos, vel, ladders, dt) {
  const L = ladders[st.ladder];
  if (!L || st.hp <= 0) { ladderRelease(st, pos, vel, 'drop'); return; }
  const step = LADDER_CLIMB_SPEED * dt;
  if (st.ladderLeg === 'enter') {
    if (moveToward(pos, L.x, (st.ladderDir > 0 ? L.y0 : L.y1) + G, L.z, step)) st.ladderLeg = 'climb';
  } else if (st.ladderLeg === 'climb') {
    pos.x = L.x; pos.z = L.z;
    const intent = st.ladderIntent ?? 0;
    if (intent > 0) { pos.y = Math.min(L.y1 + G, pos.y + step); if (pos.y >= L.y1 + G - 1e-9) st.ladderLeg = 'exit'; }
    else if (intent < 0) { pos.y = Math.max(L.y0 + G, pos.y - step); if (pos.y <= L.y0 + G + 1e-9) { ladderRelease(st, pos, vel, 'stand'); return; } }
  } else if (moveToward(pos, L.ex, L.ey + G, L.ez, step)) { ladderRelease(st, pos, vel, 'stand'); return; }
  clearMotion(st, vel); vel.y = 0; st.action = 'climb'; st.airborne = false; st.grounded = false;
}

// A record in model metres to arena units, for the rows in arena.js: scale and the model's centre as the client's GLB_MAPS line
// has them; the heights over the street.
export function ladderRow(s, cx, cz, m) {
  return { x: (m.x - cx) * s, z: (m.z - cz) * s, yaw: m.yaw, w: m.w * s, y0: m.y0 * s, y1: m.y1 * s, ex: (m.ex - cx) * s, ez: (m.ez - cz) * s, ey: m.ey * s, name: m.name };
}
