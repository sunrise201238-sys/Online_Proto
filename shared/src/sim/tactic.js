// THE ALLY TACTIC (PT b1105gq, user 2026-11-12: "i want to make a in-game command that makes ally BOT moving forward/backward
// ... The goal is to ask ally BOT to stay close or away from enemies"; then: 'change the effect to "hide 10 sec" and
// "lockrange -30 for 10sec"'). A player in the classic view calls one of two things to a bot teammate, each standing for
// ALLY_TACTIC_MS:
//   'push'  FORWARD: the bot's range band (nbrain.js — the distance it keeps to its target, centred on its lock range, edges
//           ±7) sits ALLY_TACTIC_PUSH nearer. Only where the bot wants to stand moves: the unit's own lock range — the red
//           lock's, the homing's (tick.js updateLocks) — is as it was, so a pushed bot stands well inside its lock.
//   'hide'  BACK OFF: the Hide stance (command mode's — nbrain.js HIDE STANCE): out of every enemy's sight, firing back only
//           at what it can see from where it stands.
// The standing one called again is taken back at once, the other one replaces it at once — the HUD's rule (main.js THE ALLY
// TACTIC), which sends what the player meant: a kind, or null for the take-back.
// It lives on the unit's command entry — matchState.commands[slot] online, the mech offline (main.js botCmdView); never on the
// fighter, which is serialized into every snapshot: `tactic` { kind, until } and `tacticDirty`, the mark an order leaves. The
// brain reads both each tick it runs (tacticSettle, tacticOf) and starts its route afresh on a change, the band having moved.
// Not in Sudden Death (that brain keeps its own distances and hides by no order), and not for a command-mode player, who has
// real orders (user 2026-11-12: "Remove these command buttons in command mode") — the hosts refuse those (server index.js
// ally:tactic, main.js allyTacticCan).
import { ALLY_TACTIC_MS } from './constants.js';

export const ALLY_TACTIC_KINDS = ['push', 'hide'];

// The tactic standing on this entry now: 'push' | 'hide' | null.
export function tacticOf(cmd, now) {
  const t = cmd ? cmd.tactic : null;
  return t && now < t.until ? t.kind : null;
}

// Once a tick, before the brain reads the tactic: one that has run out is dropped, and whether the tactic changed since the
// brain last looked — by an order, a take-back or the clock — is returned, the mark cleared.
export function tacticSettle(cmd, now) {
  if (!cmd) return false;
  const t = cmd.tactic;
  if (t && now >= t.until) { cmd.tactic = null; cmd.tacticDirty = true; }
  if (!cmd.tacticDirty) return false;
  cmd.tacticDirty = false;
  return true;
}

// An order on an entry: 'push' | 'hide' stands for ALLY_TACTIC_MS from `now` (the kind already standing starts its time
// anew — the HUD sends that only when it believed nothing stood); null takes the standing one back. False for anything else.
export function setTactic(cmd, kind, now) {
  if (!cmd) return false;
  if (kind == null) {
    if (cmd.tactic) { cmd.tactic = null; cmd.tacticDirty = true; }
    return true;
  }
  if (!ALLY_TACTIC_KINDS.includes(kind)) return false;
  cmd.tactic = { kind, until: now + ALLY_TACTIC_MS };
  cmd.tacticDirty = true;
  return true;
}

// What a team is told of an entry's tactic (the snapshot's `commands` block, server index.js): the kind and when it ends, in
// the server's clock — or null when none stands.
export function tacticEcho(cmd, now) {
  const t = cmd ? cmd.tactic : null;
  return t && now < t.until ? { kind: t.kind, until: t.until } : null;
}
