// THE BODIES' RECENT PAST (lag compensation, 2026-10-17). A human's shot is
// judged in the world the human was looking at, and that world is the
// server's of a moment ago: the latest snapshot their client had drawn when
// the input was given (input.viewAt, that snapshot's serverTime; applyInput
// turns it into matchState.lagMs[id], 0..LAG_COMP_MAX_MS). So every tick,
// after the bodies have moved and before the rounds are tested, each
// fighter's body is recorded here — the position and the two immunity clocks
// a hit test reads — and a round, pellet, beam or sweep fired with a lag reads
// the target's body of (now - lag) instead of the live one, from its aim at
// the trigger to its last tick in the air (bodyAt). A lag of 0 — a bot,
// offline, an older client — reads the live fighter itself: nothing changes
// for them. A body's past is its own: a Trio respawn is a new fighter object
// and starts a new record. Nothing here rides a snapshot; the record lives on
// matchState beside walls and events.
import { LAG_COMP_MAX_MS, TICK_RATE_MS, HIT_HALF_HEIGHT } from './constants.js';

// THE CROUCHING HIT CAPSULE ONLINE (b1105ct, 2026-11-08; user: "update Asuna/Aru HB to online as well"): the client gives a unit
// whose data lists `crouchHit` a capsule two thirds as tall, its bottom kept, while its model plays its firing or reload clip
// (main.js hitCapsule). The server plays no clips, so it reads the same moments off the fighter the way the client's clip picker
// does (updateUnitModelState): alive, off a ladder, not dodging, not airborne, not sprinting, and either firing — within
// SHOOT_POSE_HOLD_MS of a shot, charging a sniper shot, or sweeping a charged beam — or reloading. [y offset of the centre from
// the body's hit centre, half height of the straight side]. The bots never read it; only where a round truly lands changes.
export const HIT_CAP_STAND = [0, HIT_HALF_HEIGHT];
export const HIT_CAP_CROUCH = [-16 / 15, 8 / 15];   // (6.4 x 2/3 = 64/15 tall, the bottom kept at 3.2 under the centre)
const SHOOT_POSE_HOLD_MS = 200;   // the client's SPRITE_SHOOT_HOLD_MS: how long the firing clip holds after a shot
export function hitCapOf(f, now) {
  const u = f?.unit;
  if (!u?.crouchHit || !(f.hp > 0)) return HIT_CAP_STAND;
  if (f.ladder != null || f.airborne || f.action === 'dash' || f.action === 'step' || now <= (f.stepUntil || 0)) return HIT_CAP_STAND;
  const firing = ((f.lastFireAt || 0) > 0 && now < f.lastFireAt + SHOOT_POSE_HOLD_MS) || f.sniperChargeTargetId != null || (f.chargedBeamUntil || 0) > now;
  const reloading = u.magCapacity != null && (u.autoReload ? (f.ammo ?? u.magCapacity) < u.magCapacity : (f.reloadingUntil || 0) > now);
  return firing || reloading ? HIT_CAP_CROUCH : HIT_CAP_STAND;
}
// A body's capsule: a recorded body carries the one of its tick (recordBodies); the live fighter's is read now.
export function hitCapAt(body, now) { return body.hitCap ?? hitCapOf(body, now); }

const KEEP = Math.ceil(LAG_COMP_MAX_MS / TICK_RATE_MS) + 2;   // ticks of past kept, the cap and a margin

export function recordBodies(matchState, now) {
  const history = matchState.history ?? (matchState.history = {});
  for (const f of Object.values(matchState.fighters)) {
    let h = history[f.id];
    if (!h || h.f !== f) h = history[f.id] = { f, ring: [] };
    h.ring.push({ t: now, pos: { x: f.pos.x, y: f.pos.y, z: f.pos.z }, stepUntil: f.stepUntil, invulnerableUntil: f.invulnerableUntil, hitCap: hitCapOf(f, now) });
    if (h.ring.length > KEEP) h.ring.shift();
  }
}

// The fighter's body as the shooter saw it: the live fighter when there is no
// lag or no record of this body yet, else the recorded body nearest to
// (now - lagMs) — pos, stepUntil and invulnerableUntil, the fields a hit test
// reads — the oldest kept when the lag reaches past the record.
export function bodyAt(matchState, fighter, lagMs, now) {
  if (!(lagMs > 0)) return fighter;
  const h = matchState.history?.[fighter.id];
  if (!h || h.f !== fighter || h.ring.length === 0) return fighter;
  const ring = h.ring;
  const at = now - lagMs;
  for (let i = ring.length - 1; i >= 0; i -= 1) {
    if (ring[i].t > at) continue;
    const newer = ring[i + 1];
    return newer && newer.t - at < at - ring[i].t ? newer : ring[i];
  }
  return ring[0];
}
