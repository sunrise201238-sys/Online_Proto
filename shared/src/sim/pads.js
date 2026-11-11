// THE TRANSPORTERS (b1105fk, user 2026-11-10, Neon: "a golden glowing circle area at this wall ... When unit near to the
// wall holds jump button, a golden half-transparent circle timer will start running ... The timer takes 1 sec to complete the
// circle. When the timer is done, the unit will be transported to this position. The position also has a golden circle area
// on the ground, but no text. The transportation can be done from this spot as well. Bot should know this as part of the
// path"; of the timer: "Transporting unit's own crosshair indicator is enough"). A pad is a RECORD of the arena (arena.js
// ARENA_PADS, by map) as a ladder is: its zone (a circle on its floor), the pad it sends to (`to`) and where a body arrives on
// it (the arrival point, with a few spots beside it for a second body). One rule, run by the server's tick, the client's online
// prediction and the offline client alike (tick.js applyInput / tickMatch; the client's updatePlayer / updateEnemy); the
// collision data is not touched.
//   The jump button is the pad's, as at a ladder: standing on a pad's floor inside its zone, a FRESH press (the button went
//   down there — a body that jumped in with the button held is not caught) starts the CHARGE — no jump. While the button is
//   held the charge runs: the body stands (the stick, the dodge and the trigger do nothing — actions.js refuses a charging
//   unit's shot and dodge), and PAD_HOLD_MS after the press it is moved onto the other pad's arrival point, standing, its
//   motion gone. Let go first, or be put out of the zone, and the charge is dropped. A hit does its damage and does not stop it
//   (user's pick, b1105fk). The press is SPENT, as a ladder's: after the move (or a charge dropped with the button still held)
//   the held button is nothing until let go (padLatch), so an arrival does not send the body straight back. No cooldown.
//   The hold reads `jumpDown`, the button's own held state, which the online frame carries beside the jump's tap (the online
//   client sends `jump` as a tap for a unit that does not fly — main.js runPredictionTick — so the server could not tell a
//   hold from it); offline the client's own flag.
//   A BOT takes a pad on its route as a ladder: the route's waypoint after a pad link is the arrival on the other pad; the
//   follower walks to the zone's middle with the goal set (botPadGoal, the pad it means to use) and padBotStep starts and holds
//   the charge there, the brain's motion thrown away meanwhile; the move itself is the rule's.
//   Nothing of this is drawn by the sim: the client draws each pad as a golden circle on its floor, the zone's own size, and a
//   pad's `sign` as words on a wall (b1105fl, user: "Move the transporting circle and its detection on the floor instead of on
//   the wall. The text stays on the wall though, without detection" — the sign is no zone), and, for the charging player alone,
//   a golden ring round its own crosshair with TRANSPORTING (user: "No need to show to the others"). A pad's `color` is its
//   look alone — 'gold' (the default) or 'silver' (b1105fo, Neon's second pair, user: "Add another pair of transport
//   points as well. use silver instead of golden this time"): its floor circle and the charging player's ring in that colour;
//   the rule is the same for every pad, and a pair sends only to each other (`to`).
import { GROUND_BASE_Y, SURFACE_STEP_HEIGHT } from './constants.js';
import { unitOverlapsObstacle } from './physics.js';

export const PAD_HOLD_MS = 1000;        // the charge, press to move (user: "The timer takes 1 sec")
export const PAD_CLEAR = 2.4;           // units between an arrival spot's centre and another living body's for the spot to be free (two bodies' radii)
const G = GROUND_BASE_Y;

export function padCharging(st) { return st.padCharge != null; }
// The zone: the feet within a step of the pad's floor, the body within its radius of the zone's centre.
export function padZone(P, pos) {
  if (Math.abs(pos.y - G - P.y) > SURFACE_STEP_HEIGHT) return false;
  return Math.hypot(pos.x - P.x, pos.z - P.z) <= P.r;
}
// The pad a body stands on — its index, or -1.
export function padAt(pads, pos) { for (let i = 0; i < pads.length; i += 1) if (padZone(pads[i], pos)) return i; return -1; }
// The charge's share done, 0..1 (the client's ring), or null when there is none.
export function padChargeProgress(st, now) { return st.padCharge == null ? null : Math.max(0, Math.min(1, (now - (st.padChargeAt ?? now)) / PAD_HOLD_MS)); }

function clearMotion(st, vel) { vel.x = 0; vel.z = 0; st.momentumVX = 0; st.momentumVZ = 0; st.queuedMomentumVX = 0; st.queuedMomentumVZ = 0; }
function dropCharge(st) { st.padCharge = undefined; st.padChargeAt = undefined; }

// The arrival on pad `to`: its point, or the first spot beside it no other living body stands on and no box holds; the body
// put there standing — the floor's height, no motion, on the ground — and the move counted (padMoves: the online client snaps
// its view to a move instead of smoothing it, main.js applySnapshotToPrediction).
export function padArrive(st, pos, vel, pads, to, others = [], obstacles = []) {
  const P = pads[to]; if (!P) return false;
  const y = P.y + G; let at = null;
  for (const [dx, dz] of P.spots ?? [[0, 0]]) {
    const x = P.ax + dx, z = P.az + dz;
    if (others.some((o) => o && o !== st && (o.hp ?? 1) > 0 && o.pos && Math.hypot(o.pos.x - x, o.pos.z - z) < PAD_CLEAR)) continue;
    if (obstacles.length && unitOverlapsObstacle(x, y, z, obstacles)) continue;
    at = { x, z }; break;
  }
  if (!at) at = { x: P.ax, z: P.az };   // (every spot taken: the point itself — the bodies' soft repulsion parts them)
  pos.x = at.x; pos.y = y; pos.z = at.z;
  clearMotion(st, vel); vel.y = 0;
  st.airborne = false; st.grounded = true; st.jumpVelocity = 0; st.floorY = y; st.action = 'idle';
  st.plantUntil = 0; st.landedOnLid = false; st.stepUntil = 0;
  st.padMoves = (st.padMoves ?? 0) + 1;
  dropCharge(st); if (st.botPadGoal != null) st.botPadGoal = undefined;
  return true;
}

// A human, this tick (tick.js applyInput before the jump and the ladder's press; the client's updatePlayer the same):
//   'charging' — the charge runs (or just began): the caller makes no move, no jump, no dodge this tick;
//   'moved'    — the charge was done and the body is on the other pad: nothing else this tick;
//   'spent'    — the press is spent (the latch): the caller makes no jump of the held button;
//   null       — the button is no pad's this tick.
// `others` the other fighters (their pos and hp), `obstacles` the arena's boxes (an arrival spot must be clear).
export function padHumanInput(st, pos, vel, input, pads, now, others = [], obstacles = []) {
  const down = !!input.jumpDown;
  const fresh = down && !st.padPrevDown;
  st.padPrevDown = down;
  if (!pads.length) return null;
  if (st.padLatch) { if (!down) st.padLatch = undefined; else return 'spent'; }
  if (st.padCharge != null) {
    const P = pads[st.padCharge];
    if (!down || !P || st.hp <= 0 || st.airborne || !padZone(P, pos)) { dropCharge(st); if (down) { st.padLatch = true; return 'spent'; } return null; }
    clearMotion(st, vel); st.action = 'idle';
    if (now - st.padChargeAt >= PAD_HOLD_MS) { padArrive(st, pos, vel, pads, P.to, others, obstacles); st.padLatch = true; return 'moved'; }
    return 'charging';
  }
  if (!fresh || st.hp <= 0 || st.airborne || st.grounded === false || now <= (st.stepUntil ?? 0)) return null;   // (not out of a dodge; the offline client's state keeps no `grounded` — its airborne says it)
  const k = padAt(pads, pos); if (k < 0) return null;
  st.padCharge = k; st.padChargeAt = now; clearMotion(st, vel); st.action = 'idle';
  return 'charging';
}

// A bot, every tick: its goal starts the charge in the zone of the pad it means, the charge holds the body (the brain's motion
// thrown away) and ends in the move. True while the bot charges (the caller skips the body's momentum and gauge, as a
// climber's), and on the tick it moved.
export function padBotStep(st, pos, vel, pads, now, others = [], obstacles = []) {
  if (!pads.length) return false;
  if (st.padCharge == null) {
    if (st.botPadGoal == null || st.hp <= 0 || st.airborne) return false;
    const P = pads[st.botPadGoal]; if (!P || !padZone(P, pos)) return false;
    st.padCharge = st.botPadGoal; st.padChargeAt = now;
  }
  const P = pads[st.padCharge];
  if (!P || st.hp <= 0 || !padZone(P, pos)) { dropCharge(st); return false; }
  clearMotion(st, vel); st.action = 'idle';
  if (now - st.padChargeAt >= PAD_HOLD_MS) padArrive(st, pos, vel, pads, P.to, others, obstacles);
  return true;
}

// A record in model metres to arena units, for the rows in arena.js (the client's GLB_MAPS scale and centre, as ladderRow):
// x, z the zone's centre and r its radius; y the floor (feet) over the street; to the paired pad; ax, az the arrival point;
// spots the arrival spots beside it (metres, offsets from the arrival point, the point itself first); dr the floor circle's
// radius (the zone's unless set); color the look ('gold' unless set, or 'silver'); sign: words on a wall (x, z the middle on
// the wall's face, y its height, w the width the words are fitted in, yaw the face's outward direction, text), or none.
export function padRow(s, cx, cz, m) {
  return { name: m.name, x: (m.x - cx) * s, z: (m.z - cz) * s, r: m.r * s, y: m.y * s, to: m.to, ax: (m.ax - cx) * s, az: (m.az - cz) * s,
    spots: (m.spots ?? [[0, 0]]).map(([dx, dz]) => [dx * s, dz * s]), dr: (m.dr ?? m.r) * s, color: m.color ?? 'gold',
    ...(m.sign ? { sign: { x: (m.sign.x - cx) * s, z: (m.sign.z - cz) * s, y: m.sign.y * s, w: (m.sign.w ?? 2) * s, yaw: m.sign.yaw ?? 0, text: m.sign.text } } : {}) };
}
