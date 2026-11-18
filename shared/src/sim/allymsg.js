// THE TEAMMATE'S MESSAGES (b1105js, 9.8; user 2026-11-18: "I want to add a online 2V2 feature. 1. When both player are human
// player, the BOT command button still shows. 2. When tapping it, instead of "Forward/Back off" options for BOT, it pops up
// four options. "I'll go forward", "I'll back off", "Please go forward", "Please back off". 3. After the player chooses the
// message, their teammate will see the pop up message on their screen. The message will shows up for 2sec. 4. The cooldown for
// sending the message is 3sec. 5. No other effect is needed; it's just a simple communication tool. 6. No more lag should be
// caused to online games by this feature." Then, asked: the place is the kill feed's and "The sender is notified as well. But
// do make sure player won't be confused identifying the message of being sent by theirselves or receive from others."; "mouse
// click for now"; of Sudden Death, "yes, 2v2 online SD only"; of a teammate whose unit is down, "No. BTW, if the teammate is
// still alive and the human player left, the button changes its function to normal BOT command version."; 'change existing
// "Back Off" to "Pull Back"'; and "no need this on PT. I'll verify it on 9.8").
// WHAT IT IS: in an online 2v2 with a PLAYER in the seat beside one's own, the ally command's button offers four messages in
// the place of its two calls to a bot. A message is a word between two pages and nothing more: it is not in the sim, not in a
// snapshot, and no unit does anything for it. It costs the match one small packet to each of the two pages it concerns, three
// seconds apart at the nearest.
// THE RULE, pure, here (allyMsgTo): who may send what to whom, and how often. The server asks it of every message it is
// handed (index.js ally:msg) and passes a message that stands on to the two pages — the mate's, and the sender's own as its
// receipt. The page asks nothing of it: it shows the four where its last snapshot says a player sits beside it (main.js
// allyTacticVersion) and holds its own sender to the cooldown.
export const ALLY_MSG_KINDS = ['go', 'back', 'askGo', 'askBack'];
export const ALLY_MSG_TEXT = { go: "I'LL GO FORWARD", back: "I'LL PULL BACK", askGo: 'PLEASE GO FORWARD', askBack: 'PLEASE PULL BACK' };
export const ALLY_MSG_SHOW_MS = 2000;       // "The message will shows up for 2sec."
export const ALLY_MSG_COOLDOWN_MS = 3000;   // "The cooldown for sending the message is 3sec.": what the page holds its sender to
// ...and the server holds a sender to this much less: two messages a page sent three seconds apart can reach the server a
// little nearer each other (the line's delay is not the same twice), and a message its page took as sent is not dropped for that.
export const ALLY_MSG_SLACK_MS = 250;

// the seat beside `slot` on its side in a 2v2 (p1 and p3 are side A, p2 and p4 side B); null for anything else
const MATE = { p1: 'p3', p3: 'p1', p2: 'p4', p4: 'p2' };
export function allyMsgMate(slot) {
  return MATE[slot] ?? null;
}

// May `sender` send `kind` now? The mate's seat if so, null if not.
//   mode        the room's: a 2v2 alone has a seat beside one's own
//   humans      the seats a player sits in now — a spectator sits in none
//   bots        the seats a bot plays now: a seat its player left in mid-match is a bot's from then on, and the button on
//               the page that stays is the bot's two calls again (index.js ally:tactic takes those)
//   commanders  the seats playing command mode: there is no such button there, so none is taken from one (it still RECEIVES)
//   hpOf        (seat) => the HP of that seat's unit now: no message to a mate whose unit is down
//   lastAt      when this sender's last message was taken, on `now`'s clock (ms)
// Sudden Death is not asked about: a message is no order, and that match takes it as any other.
export function allyMsgTo({ mode, sender, kind, humans, bots, commanders, hpOf, lastAt = -Infinity, now = 0 }) {
  const has = (set, s) => !!set && (typeof set.has === 'function' ? set.has(s) : set.includes(s));
  if (mode !== '2v2' || typeof sender !== 'string' || !Object.hasOwn(MATE, sender) || !ALLY_MSG_KINDS.includes(kind)) return null;
  if (!has(humans, sender) || has(bots, sender) || has(commanders, sender)) return null;
  const mate = MATE[sender];
  if (!has(humans, mate) || has(bots, mate)) return null;
  if (!((hpOf?.(mate) ?? 0) > 0)) return null;
  if (now - lastAt < ALLY_MSG_COOLDOWN_MS - ALLY_MSG_SLACK_MS) return null;
  return mate;
}
