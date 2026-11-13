// THE LOADING WAIT (b1105hh; user 2026-11-13, asked whether the online server should wait for every player's files before
// it starts its clock: "Yes."; of how long at the most: "up to 30 sec (player would standby in loading screen, correct?)";
// "PT and 9.7"). Until this build the server began a match's hold — the game-start intro, constants.js INTRO_MS — the
// moment the host started the match, whatever the players' pages had loaded: a page still loading saw its loading screen
// in the intro's place, and one that loaded for longer than the hold came into a match already under way, its unit
// standing on its spawn to be shot at, its page still fetching and decoding files through its first seconds of play.
// Now the hold begins when every player's page has said its match's things are in hand, and at the latest
// LOAD_WAIT_MAX_MS (30 s) after the start; until then every page stays on its loading screen, the ones that are done
// too. THE RULE, pure, here; the server keeps one of these a match (index.js startMatchFor, tickLobby) and the clients
// say `match:loaded` (main.js runOnlineMatchFrame).
//  - WHO IS WAITED FOR: the seats whose pages said, as they connected, that they report their loading (connection.js:
//    the handshake's `auth.loadWait`). A bot's seat has no page; a page older than this build says nothing and is not
//    waited for — it would never report, and every match with it in the room would wait the whole time. A spectator
//    is not waited for.
//  - A seat is done when its page reports, or when its player leaves (index.js `disconnect`).
//  - OVER when nobody is waited for any more, or when the time has run out: the match starts then on whatever each page
//    has, as every match did until this build.
import { LOAD_WAIT_MAX_MS } from './constants.js';

// a match's wait, begun at `now` (the match's start) for `seats`; null when there is nobody to wait for
export function beginLoadWait(seats, now, maxMs = LOAD_WAIT_MAX_MS) {
  const waiting = new Set(seats);
  return waiting.size ? { waiting, until: now + maxMs } : null;
}
// a seat's page has loaded, or its player has left: no longer waited for (a seat that was never waited for: nothing)
export function loadWaitDone(wait, seat) {
  if (wait) wait.waiting.delete(seat);
}
// over: nobody waited for any more, or the time run out (no wait at all is over)
export function loadWaitOver(wait, now) {
  return !wait || wait.waiting.size === 0 || now >= wait.until;
}
