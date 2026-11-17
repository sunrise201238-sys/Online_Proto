// THE ALLY TACTIC (PT b1105gq, user 2026-11-12: "i want to make a in-game command that makes ally BOT moving forward/backward
// ... The goal is to ask ally BOT to stay close or away from enemies"; then: 'change the effect to "hide 10 sec" and
// "lockrange -30 for 10sec"'). A player in the classic view calls one of two things to a bot teammate:
//   'push'  FORWARD: the bot's range band (nbrain.js — the distance it keeps to its target, centred on its lock range, edges
//           ±BOT_BAND_HALF_WIDTH, constants.js) sits ALLY_TACTIC_PUSH nearer. Only where the bot wants to stand moves: the unit's own lock range — the red
//           lock's, the homing's (tick.js updateLocks) — is as it was, so a pushed bot stands well inside its lock.
//   'hide'  BACK OFF: the Hide stance (command mode's — nbrain.js HIDE STANCE): out of every enemy's sight, firing back only
//           at what it can see from where it stands.
// A CALL HAS NO TIME LIMIT (b1105jn; user 2026-11-17: "Change the in-game BOT command effective duration (Forward/Back Off) to
// no time limit"): it stands until it is taken back, and there is no clock in this rule. It stood 10 s at first, 20 s from
// b1105io and 40 s from b1105jm, by a number in constants.js (ALLY_TACTIC_MS) that went with the clock. What ends a call:
// the same one called again (the take-back), the other one (which replaces it), and the wipe of its unit's orders when the
// unit falls — a Trio's next unit comes in with none (command.js clearCommands).
// The standing one called again is taken back at once, the other one replaces it at once — the HUD's rule (main.js THE ALLY
// TACTIC), which sends what the player meant: a kind, or null for the take-back.
// It lives on the unit's command entry — matchState.commands[slot] online, the mech offline (main.js botCmdView); never on the
// fighter, which is serialized into every snapshot: `tactic` { kind } and `tacticDirty`, the mark an order leaves. The
// brain reads both each tick it runs (tacticSettle, tacticOf) and starts its route afresh on a change, the band having moved.
// Not in Sudden Death (that brain keeps its own distances and hides by no order), and not for a command-mode player, who has
// real orders (user 2026-11-12: "Remove these command buttons in command mode") — the hosts refuse those (server index.js
// ally:tactic, main.js allyTacticCan).
export const ALLY_TACTIC_KINDS = ['push', 'hide'];

// The tactic standing on this entry: 'push' | 'hide' | null.
export function tacticOf(cmd) {
  return cmd?.tactic?.kind ?? null;
}

// Once a tick, before the brain reads the tactic: whether the tactic changed since the brain last looked — by an order, a
// take-back or a wipe — is returned, the mark cleared.
export function tacticSettle(cmd) {
  if (!cmd || !cmd.tacticDirty) return false;
  cmd.tacticDirty = false;
  return true;
}

// An order on an entry: 'push' | 'hide' stands from then on (the kind already standing is set as it is — the HUD sends that
// only when it believed nothing stood); null takes the standing one back. False for anything else.
export function setTactic(cmd, kind) {
  if (!cmd) return false;
  if (kind == null) {
    if (cmd.tactic) { cmd.tactic = null; cmd.tacticDirty = true; }
    return true;
  }
  if (!ALLY_TACTIC_KINDS.includes(kind)) return false;
  cmd.tactic = { kind };
  cmd.tacticDirty = true;
  return true;
}

// What a team is told of an entry's tactic (the snapshot's `commands` block, server index.js): its kind — or null when none
// stands. `until` is for the pages built before b1105jn alone: such a page lights a call only while its clock is short of the
// call's end, so it is told an end no clock reaches, and lights the call for as long as it is echoed. A page of this build
// reads the kind alone (main.js allyTacticLive).
export const ALLY_TACTIC_NO_END = Number.MAX_SAFE_INTEGER;
export function tacticEcho(cmd) {
  const t = cmd ? cmd.tactic : null;
  return t ? { kind: t.kind, until: ALLY_TACTIC_NO_END } : null;
}
