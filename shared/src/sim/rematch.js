// THE END OF A MATCH ONLINE: WHAT THE ROOM DOES NEXT (b1105is; user 2026-11-16: "Revamp the current online rematches flow.
// Currently there are only rematch and leave options, any player's wouldn't know if opponents have left. I want there be
// rematch/reselect/leave options, where reselect will let host to reselect the map and both sides to reselect their units.
// The mode could not be changed though. And player should be notified that other human player has left and be replaced by
// BOT."; then, of the three ways put to them: "等所有人都選完，只要有一人選 RESELECT 就重選。" — wait until everyone has
// chosen, and one RESELECT is enough for the room to pick again).
//
// A match over, every seated player chooses REMATCH — the same map, units and seats again — or RESELECT — the room goes
// back to its waiting room, everyone picks a unit anew and the host a map; the mode stays as it was. The room moves when
// everyone who still sits has chosen. A player who left is not waited for, and a seat nobody sits in is a bot's in the
// next match. The rule alone lives here, where the suite reads it (rematch.test.js); the room's own state is the server's
// (index.js THE END OF A MATCH).
//
// A PLAYER'S LEAVING DOES NOT MOVE THE ROOM IN THE SAME BREATH. Where the one who leaves the end page was the last the
// room waited for, the room would move at that instant — and a player who had chosen REMATCH and was waiting would find
// the next match under way with no word that the other had gone and that a bot plays the seat (the very thing the user
// asked to be told). So the room holds for END_LEAVE_NOTICE_MS from a leaving at the end page (endHoldLeft): the room's
// config goes out at once and the pages show the seat as left; a choice made meanwhile is taken and waits with the rest;
// the room moves when the hold is over. A player who left in mid-match was shown to the others then (a 2v2's line in the
// match, a 1v1's forfeit page), and holds nothing.

export const END_CHOICES = ['rematch', 'reselect'];
export const END_LEAVE_NOTICE_MS = 3000;

// What the room does, from what its seated players chose. `seated`: the seats a player sits in NOW (any iterable);
// `choice`: seat -> 'rematch' | 'reselect' | anything else for "not yet". null while a seated player has not chosen, or
// with nobody seated; 'reselect' once everyone has chosen and one of them asked for it; 'rematch' when everyone did.
export function endVerdict(seated, choice) {
  let n = 0;
  let reselect = false;
  for (const s of seated) {
    const c = choice ? choice[s] : null;
    if (c !== 'rematch' && c !== 'reselect') return null;
    n += 1;
    if (c === 'reselect') reselect = true;
  }
  if (!n) return null;
  return reselect ? 'reselect' : 'rematch';
}

// The seats whose player has left since the match began: of the mode's seats (`active`, in order), those no bot played
// at the match's start (`startBots`) and nobody sits in now (`seated`). Seats do not change hands while a match runs or
// stands ended, so the list names the players who went — in mid-match (a 2v2's unit plays on as a bot) or at the end page.
export function leftSeats(active, startBots, seated) {
  const bots = new Set(startBots);
  const here = new Set(seated);
  return active.filter((s) => !bots.has(s) && !here.has(s));
}

// How long the room still holds, ms (A PLAYER'S LEAVING DOES NOT MOVE THE ROOM IN THE SAME BREATH, above): `leftAt` the
// time the last player left the end page — 0 where nobody has since the match ended — and `now` the time. Never longer
// than the hold itself, whatever the clock did in between.
export function endHoldLeft(leftAt, now) {
  if (!(leftAt > 0)) return 0;
  return Math.max(0, Math.min(END_LEAVE_NOTICE_MS, leftAt + END_LEAVE_NOTICE_MS - now));
}
