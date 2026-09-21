// Per-shot spread BLOOM (owner design, 2026-09-21) — replaces the horizontal
// spread (HA) mechanic on every weapon.
//
//   - A unit's cone starts at its base `spreadAngle` (full angle, radians).
//   - Every shot fired adds `bloomPerShot` to the fighter's `bloom`, capped so
//     that spreadAngle + bloom never exceeds `bloomCap`.
//   - Once `bloomRecoverDelayMs` has passed since the last shot, bloom decays
//     at `bloomRecoverPerSec` (0 ms = it also recovers between the shots of a
//     burst; 200 ms on a 96 ms gun = frozen while spraying).
//   - The effective cone used by spawnProjectiles is spreadAngle + bloom.
//
// Both sims (shared / server and the offline client mirror) use these helpers
// so the numbers can never drift apart. Everything here is closed-form: no
// sampling, no per-tick allocation.
import { SURE_HIT_WIDTH, BOT_SUPPRESS_BURST, BLOOM_STILL_SPEED, BLOOM_STILL_DWELL_MS } from './constants.js';

// How much bloom the unit can carry (bloomCap - base). 0 = the gun has no bloom.
export function bloomMax(unit) {
  return Math.max(0, (unit.bloomCap ?? unit.spreadAngle) - unit.spreadAngle);
}

// The cone a shot fired right now would use.
export function effectiveSpread(unit, bloom) {
  return unit.spreadAngle + Math.min(bloom || 0, bloomMax(unit));
}

// Bloom AFTER a shot spawned (call after sampling the shot's direction, so
// the first shot always leaves at the base cone).
export function bloomAfterShot(unit, bloom) {
  return Math.min(bloomMax(unit), (bloom || 0) + (unit.bloomPerShot ?? 0));
}

// Bloom after `dtSec` of recovery; `sinceLastShotMs` gates the delay.
export function bloomAfterTime(unit, bloom, sinceLastShotMs, dtSec) {
  if (!(bloom > 0)) return 0;
  if (sinceLastShotMs < (unit.bloomRecoverDelayMs ?? 0)) return bloom;
  return Math.max(0, bloom - (unit.bloomRecoverPerSec ?? 0) * dtSec);
}

// 0..1 — how much of the unit's bloom budget is spent. Drives the lock
// bracket's universal visual scale on the client.
export function bloomFraction(unit, bloom) {
  const m = bloomMax(unit);
  return m > 0 ? Math.max(0, Math.min(1, (bloom || 0) / m)) : 0;
}

// Distance at which a cone of full angle `spread` still lands every shot on a
// STANDING target: cone radius (d * spread / 2) == capsule radius (1.6), i.e.
// SURE_HIT_WIDTH / spread. Same formula the README's "sure-hit" column uses.
export function sureHitDistance(spread) {
  return spread > 0 ? SURE_HIT_WIDTH / spread : Infinity;
}

// Bot fire gate: single-projectile non-sniper guns only pull the trigger
// while the target sits inside the CURRENT sure-hit distance. Shotguns fly a
// fixed pattern (the cone formula does not describe them) and the snipers'
// 0.02 cone out-reaches their lock range, so both always pass.
export function withinSureHit(unit, bloom, dist) {
  if (unit.spreadCount !== 1 || unit.sniperCharge) return true;
  return dist <= sureHitDistance(effectiveSpread(unit, bloom));
}

// Bot trigger rule (owner 2026-09-21), one call per fire poll. `bot` is the
// fighter (or the offline mech state) carrying `bloom`,
// `botSuppressRemaining` and `botHoldDist`; returns true when the bot may pull
// the trigger now. One rule for every gun:
//   - A committed suppress burst runs to its end.
//   - Inside the current sure-hit distance: fire freely.
//   - Outside it with the cone fully recovered: start a suppress burst of
//     `botSuppressBurst` rounds (BOT_SUPPRESS_BURST for autos, 1 for the
//     marksman rifles) and fire.
//   - Outside it with bloom still up: hold until the cone has fully
//     recovered — the line drifting back out past a static target does not
//     release the hold (no one-round trickle) — unless the target closes in
//     past where the line stood when the hold began, which releases it at
//     once.
export function botMayFire(unit, bot, dist) {
  if (unit.spreadCount !== 1 || unit.sniperCharge) return true;
  if (bot.botSuppressRemaining > 0) return true;
  if (bot.botHoldDist > 0) {
    if (bot.bloom > 0 && dist > bot.botHoldDist) return false;
    bot.botHoldDist = 0;                       // recovered, or the target closed in
  }
  const cone = effectiveSpread(unit, bot.bloom);
  if (dist <= sureHitDistance(cone)) return true;
  if (!(bot.bloom > 0)) { bot.botSuppressRemaining = unit.botSuppressBurst ?? BOT_SUPPRESS_BURST; return true; }
  bot.botHoldDist = sureHitDistance(cone);     // freeze where the line stood
  return false;
}

// Call after a bot shot actually spawned: consumes one round of a running
// suppress burst.
export function botNoteShot(bot) {
  if (bot.botSuppressRemaining > 0) bot.botSuppressRemaining -= 1;
}

// Abort any suppress burst / recovery hold (target lost, reload, immunity).
export function botClearFireRule(bot) {
  bot.botSuppressRemaining = 0;
  bot.botHoldDist = 0;
}

// Standing-still tracking (owner 2026-09-21). Call once per tick with the
// fighter's horizontal speed and grounded flag BEFORE the bloom step:
// `stillSince` stamps the moment a grounded fighter dropped under
// BLOOM_STILL_SPEED and clears the instant it moves or leaves the ground.
export function tickStillness(bot, now, speed, grounded) {
  if (grounded && speed < BLOOM_STILL_SPEED) { if (!bot.stillSince) bot.stillSince = now; }
  else bot.stillSince = 0;
}

// True once the fighter has been still for the dwell: its shots add no bloom
// and its bloom recovers with no delay, even mid-burst.
export function isStill(bot, now) {
  return bot.stillSince > 0 && now - bot.stillSince >= BLOOM_STILL_DWELL_MS;
}
