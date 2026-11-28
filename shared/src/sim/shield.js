// THE SHIELD (b1105ly, 2026-11-28; user: "Add a simple geometry cbox for kurumi's shield. Which would block bullets for her.", done on PT as
// b1105lu, then "Apply Kurumi's shield to 1.0.0 (online and offline)"; of the server's side: "As long as it won't make online games more lag").
// A unit whose data carries `shield` holds a box that stops what is shot AT it and meets the box before it meets the unit: a round or a bolt,
// a pellet of a volley, the railgun's two beams — no damage, no stun, the round taken off at the box as at a wall. The game's rule stands: a
// round is tried against its own target alone, so the box covers its bearer and nobody behind it; and where the bearer cannot be hit anyway
// (down, the same team, spawn protection, the dodge's moment) the box is not tried either.
//
// The client has the box on the bone of the model that carries the shield and tries it where the motion in play has put that bone (main.js
// THE SHIELD). The server plays no motions. As it does for the crouching capsule (history.js hitCapOf), it reads the same moments off the
// fighter the way the client's motion picker and heading do (main.js updateUnitModelState) and takes the box's place for that motion from the
// table the model's own file gave (shield_poses.js, written by shared/tools/anim/shield_frames.mjs):
//   THE MOTION   the picker's order — on a ladder the climb, in a dodge the dodge, in the air the jump, sprinting the sprint (firing or not),
//                firing the shot (a magazine gun mid-reload is not firing), reloading the reload, moving the walk, else the stand; a moving
//                motion held 150 ms over a stand that blinks in (the client's anti-flicker). A motion played once (dodge, jump, reload) runs
//                from the tick it was picked, as the client's copy runs from the frame it was picked; one that goes round has its mean.
//   THE BLEND    the client fades one motion into the next over 0.12 s; so does the box here, from where it stood into the new motion's
//                place. Two motions on one clip (a dodge into a jump) cut, as the client's do.
//   THE HEADING  the client's model heading: the dodge's own line while a player's stick-chosen dodge runs and the unit fires on the ground;
//                a free-aiming unit's own facing; firing, the unit it is locked on (else the nearest living enemy); else the way it moves;
//                on a ladder, the ladder; else held — turned towards at 14 rad a second.
// All of it is kept OFF the fighter, in matchState.shields beside walls and history: nothing here rides a snapshot (a fighter's every field
// does, 62.5 times a second to every client). What it costs: for each shield bearer a tick, a few dozen multiplications; for each round shot
// at one, three slabs. recordBodies keeps the tick's box with the body, so a lagged shooter's round meets the box the shooter saw.
import { SHIELD_POSES } from './shield_poses.js';

const SHOOT_POSE_HOLD_MS = 200;   // the client's SPRITE_SHOOT_HOLD_MS: how long the firing motion holds after a shot
const MOTION_HOLD_MS = 150;       // the client's SPRITE_MOTION_HOLD_MS
const MOVE_MIN = 1.5;             // u/s, the client's MODEL_MOVE_MIN: slower reads as standing
const SNAP_U = 8;                 // u in one tick, the client's MODEL_SNAP_U: past this the body was put there, it did not walk
const TURN_RATE = 14;             // rad/s, the client's MODEL_TURN_RATE
const FADE_MS = 120;              // the client's MODEL_FADE_S
const HIT_CENTRE_Y = 2.35;        // the hit centre over the body's feet point (projectiles.js)

// The box table of a unit, or null: only a unit that names a shield AND has its motions' places written.
export function shieldPosesOf(unit) { return unit?.shield ? (SHIELD_POSES[unit.id] ?? null) : null; }

// A motion's frame at `ms` since it was picked: [cx, cy, cz, qx, qy, qz, qw] in the unit's own frame (written into `out`).
function poseFrame(pose, ms, out) {
  const fs = pose.frames;
  if (!(pose.dur > 0) || fs.length < 2) { for (let k = 0; k < 7; k += 1) out[k] = fs[0][k]; return out; }
  const u = Math.min(1, Math.max(0, ms / (pose.dur * 1000))) * (fs.length - 1);
  const i = Math.min(fs.length - 2, Math.floor(u)), w = u - i;
  return mixFrames(fs[i], fs[i + 1], w, out);
}
// a to b by w: the centre straight, the turn by the shorter way (normalized)
function mixFrames(a, b, w, out) {
  for (let k = 0; k < 3; k += 1) out[k] = a[k] + (b[k] - a[k]) * w;
  const d = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] < 0 ? -1 : 1;
  let x = a[3] + (d * b[3] - a[3]) * w, y = a[4] + (d * b[4] - a[4]) * w, z = a[5] + (d * b[5] - a[5]) * w, q = a[6] + (d * b[6] - a[6]) * w;
  const L = Math.hypot(x, y, z, q) || 1;
  out[3] = x / L; out[4] = y / L; out[5] = z / L; out[6] = q / L;
  return out;
}

// The motion the client's picker would show for this fighter now (updateUnitModelState), among those the table has.
function motionOf(f, s, poses, now, moving) {
  const u = f.unit;
  const firing = ((f.lastFireAt || 0) > 0 && now < f.lastFireAt + SHOOT_POSE_HOLD_MS) || f.sniperChargeTargetId != null || (f.chargedBeamUntil || 0) > now;
  const stepping = f.action === 'step' || now < (f.stepUntil || 0);
  const sprinting = f.action === 'dash';
  const reloading = u.magCapacity != null && (u.autoReload ? (f.ammo ?? u.magCapacity) < u.magCapacity : (f.reloadingUntil || 0) > now);
  let want = 'stand';
  if (f.ladder != null) want = 'climb';
  else if (stepping) want = 'dodge';
  else if (f.airborne) want = 'jump';
  else if (sprinting) want = firing && poses.sprintShoot ? 'sprintShoot' : 'sprint';
  else if (firing && !(reloading && !u.autoReload)) want = 'shoot';
  else if (reloading && poses.reload) want = 'reload';
  else if (moving) want = 'walk';
  if (want === 'sprint' || want === 'sprintShoot' || want === 'walk') { s.motionPose = want; s.motionHoldUntil = now + MOTION_HOLD_MS; }
  else if (want === 'stand' && s.motionPose && now < s.motionHoldUntil) want = s.motionPose;
  else if (want === 'stand') s.motionPose = null;
  if (!poses[want]) want = 'stand';
  return { want, firing, stepping };
}

// Once a tick, after the bodies have moved and before they are recorded (tick.js): every living shield bearer's heading, motion and box.
// `ladders`: the arena's (a climber faces its ladder).
export function trackShields(matchState, now, dt, ladders = []) {
  let table = matchState.shields;
  for (const f of Object.values(matchState.fighters)) {
    const poses = shieldPosesOf(f.unit);
    if (!poses) { if (table && table[f.id]) delete table[f.id]; continue; }
    if (!table) table = matchState.shields = {};
    let s = table[f.id];
    if (!s || s.f !== f) s = table[f.id] = { f, yaw: null, pose: null, poseAt: now, from: null, cur: new Array(7).fill(0), lastX: f.pos.x, lastZ: f.pos.z, motionPose: null, motionHoldUntil: 0, frame: null };
    // the body's own motion this tick (the client reads its drawn root's)
    let vx = 0, vz = 0;
    if (dt > 0) { const dx = f.pos.x - s.lastX, dz = f.pos.z - s.lastZ; if (Math.hypot(dx, dz) <= SNAP_U) { vx = dx / dt; vz = dz / dt; } }
    s.lastX = f.pos.x; s.lastZ = f.pos.z;
    if (!(f.hp > 0)) { s.frame = null; continue; }   // down: nothing is tried against it
    const moving = Math.hypot(vx, vz) > MOVE_MIN;
    const { want, firing, stepping } = motionOf(f, s, poses, now, moving);
    if (want !== s.pose) {
      const prev = s.pose ? poses[s.pose] : null, next = poses[want];
      // a new motion: faded into from where the box stands — unless it is the first, or the same clip under another name (a cut, or no change at all)
      s.from = prev && s.frame && prev.clip !== next.clip ? s.cur.slice() : null;
      s.pose = want; s.poseAt = now;
    }
    const pose = poses[s.pose];
    poseFrame(pose, now - s.poseAt, s.cur);
    if (s.from) { const w = (now - s.poseAt) / FADE_MS; if (w >= 1) s.from = null; else mixFrames(s.from, s.cur.slice(), w, s.cur); }

    // the heading
    let hx = 0, hz = 0, have = false;
    if (stepping && firing && !f.airborne && f.stepStick) { hx = (f.stepToX ?? 0) - (f.stepFromX ?? 0); hz = (f.stepToZ ?? 0) - (f.stepFromZ ?? 0); have = hx * hx + hz * hz > 1e-6; }
    if (!have && f.freeAim && Number.isFinite(f.yaw)) { hx = Math.sin(f.yaw); hz = Math.cos(f.yaw); have = true; }
    if (!have && firing) {
      let t = f.targetId != null ? matchState.fighters[f.targetId] : null;
      if (!t || !(t.hp > 0) || t === f) t = nearestEnemy(matchState, f);
      if (t) { hx = t.pos.x - f.pos.x; hz = t.pos.z - f.pos.z; have = Math.hypot(hx, hz) > 0.5; }
    }
    if (!have && moving) { hx = vx; hz = vz; have = true; }
    if (f.ladder != null && ladders[f.ladder]) { const L = ladders[f.ladder]; hx = -Math.sin(L.yaw); hz = -Math.cos(L.yaw); have = true; }   // (the climb clip's body is turned about: main.js CLIMB_CLIP_TURNED)
    if (s.yaw == null) {   // the first tick: the unit's own facing (the client's root is turned to its opponent), else towards its enemy
      if (Number.isFinite(f.yaw)) s.yaw = f.yaw;
      else { const t = (f.targetId != null ? matchState.fighters[f.targetId] : null) ?? nearestEnemy(matchState, f); s.yaw = t ? Math.atan2(t.pos.x - f.pos.x, t.pos.z - f.pos.z) : 0; }
    }
    if (have) {
      let d = Math.atan2(hx, hz) - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = TURN_RATE * dt;
      s.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }

    // the box in the world: the motion's frame turned to the heading, about the hit centre
    const c = s.cur, sn = Math.sin(s.yaw), cs = Math.cos(s.yaw), k = pose.k ?? 1;
    // (the frame's turn as a matrix, rows first)
    const x = c[3], y = c[4], z = c[5], w = c[6];
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
    const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
    const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
    // (a new object a tick: the bodies' record keeps the past ones)
    s.frame = {
      cx: f.pos.x + c[0] * cs + c[2] * sn, cy: f.pos.y + HIT_CENTRE_Y + c[1], cz: f.pos.z - c[0] * sn + c[2] * cs,
      r: [m00 * cs + m20 * sn, m01 * cs + m21 * sn, m02 * cs + m22 * sn, m10, m11, m12, -m00 * sn + m20 * cs, -m01 * sn + m21 * cs, -m02 * sn + m22 * cs],
      h: [poses.half[0] * k, poses.half[1] * k, poses.half[2] * k]
    };
  }
}
function nearestEnemy(matchState, f) {
  let best = null, bestD = Infinity;
  for (const e of Object.values(matchState.fighters)) {
    if (e === f || !(e.hp > 0) || (f.team && e.team && f.team === e.team)) continue;
    const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// The shield bearer's box as the shooter saw it: a recorded body carries the box of its tick (history.js recordBodies); the live fighter's
// is this tick's. Null: no shield, or none standing (down; a state nobody has ticked).
export function shieldFrameOf(matchState, fighter, body) {
  if (!fighter?.unit?.shield) return null;
  if (body && body !== fighter && body.shield !== undefined) return body.shield;
  const s = matchState.shields?.[fighter.id];
  return s && s.f === fighter ? s.frame : null;
}

// Where along a→b (0..1) the segment enters the box, or -1 when it does not meet it.
export function shieldEntryT(fr, ax, ay, az, bx, by, bz) {
  const r = fr.r, h = fr.h;
  const px = ax - fr.cx, py = ay - fr.cy, pz = az - fr.cz, dx = bx - ax, dy = by - ay, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k += 1) {   // the box's k-th axis is the matrix's k-th column
    const o = px * r[k] + py * r[3 + k] + pz * r[6 + k], d = dx * r[k] + dy * r[3 + k] + dz * r[6 + k], hk = h[k];
    if (Math.abs(d) < 1e-9) { if (o < -hk || o > hk) return -1; continue; }
    let x = (-hk - o) / d, y = (hk - o) / d;
    if (x > y) { const z = x; x = y; y = z; }
    if (x > t0) t0 = x;
    if (y < t1) t1 = y;
    if (t0 > t1) return -1;
  }
  return t0;
}

// Where the LINE through a→b comes nearest the point c — not held to the segment (written into `out`). "Before it meets her" is read on the
// round's line, not on this tick's step of it: a round goes 40 u a tick, and a step that ended inside her, short of the box, would let it through
// by the tick's chance.
export function nearestOnLine(a, b, c, out) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = dx * dx + dy * dy + dz * dz;
  const u = L > 1e-12 ? ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / L : 0;
  out.x = a.x + dx * u; out.y = a.y + dy * u; out.z = a.z + dz * u;
  return out;
}
