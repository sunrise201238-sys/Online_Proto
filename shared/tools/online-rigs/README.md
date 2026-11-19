# Online and HUD rigs (2026-11-18 and 19)

Headless checks of the page against the repo's own server: the teammate's messages in online 2v2 (b1105js, the line only) and
the LAST tag on a tapped card in the online pickers (b1105ju). Each takes a checkout of the line with `npm install` done and
the client built (`cd client && npm run build`; built with no `VITE_SERVER_URL` the page calls `http://localhost:3001`, which
is where the rigs start the server).

| file | what |
| --- | --- |
| `online_msgs.cjs <repo root> <out dir> [msgs\|leave\|sd]` | two pages in one room on one side of a 2v2, bots on the other. `msgs`: the four messages both ways, the 2 s on screen, the 3 s cooldown, the server's own limit; `leave`: the mate leaves and the button turns back into the bot command; `sd`: Sudden Death, one message, then the mate leaves. Prints PASS / FAIL a check |
| `online_keys.cjs <repo root> <out dir>` | the keyboard round: E opens the four messages, a pick by the mouse, the pointer lock let go in the free point of view |
| `online_pics.cjs <repo root> <out dir>` | both pages photographed at 2x with the messages on screen |
| `hud_now.cjs <dist> <out dir>` | the 2v2 HUD as it is at three screen sizes, the bot command open and two knockouts in the kill feed (offline 2v2 on Warehouse) |
| `hud_mock.cjs <dist> <out dir> <state>` | the same three sizes with the messages forced on through the page's hooks: `menu`, `recv`, `own`, `recv1`, `recv2`, `cool` |
| `last_tag.cjs <repo root> <page dir> <out dir> <label>` | one page as a room's host, told what the last match was, walks Trio, 2v2, the unit picker and the map picker; a LAST card is tapped in each, the card's `::before` and `::after` measured and photographed. `<page dir>` is a `client/dist` or a PT folder |

## A headless page is slow: what that costs and how the rigs get round it

- A page under software drawing makes one to three frames a second and answers a call from the rig seconds late. A real
  Playwright `tap` can take 8 s. So nothing is timed from outside: the page keeps its own log on its own clock, the presses
  are made by timers inside the page, and the rig reads the logs afterwards. A timer inside the page fires late too (a press
  set for 1.5 s came at 2.9 s), so a check of a limit sends its second message at once.
- The server sends 60 snapshots a second and a heavy page falls behind for good (Town at 2x never catches up). Keep the page
  light: a small viewport (480 × 270), `__gvgRenderer.setPixelRatio(0.25)`, or 0.5 for a picture at 2x. The HUD is the page's
  own and stays sharp.
- Wait on what happened, not on the clock: a picture taken on a timer caught the loading screen. For a picture, wait until
  the HUD button is the top element at its place, then three seconds.
- Buttons differ: a unit or map card acts on `click`, and only after a `pointerdown` that came later than the last change of
  menu (the guard against a ghost click); a HUD button acts on `pointerdown`. In the page:
  `el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }))`,
  then `el.click()` for a card.
- A human's unit that stands still is knocked out by the bots within a minute. Use Town, Aris as the bots, Kurumi or Minori as
  the players, keep each part short, and split a long check into rounds (that is why `online_msgs.cjs` has three).
- One rig at a time on port 3001, two pages at most, screenshots with a long timeout (240 s). Do not run the test suite beside
  a rig: the pages starve.

## The page's hooks

`__gvgState` (the match, the units, `online.conn`), `__gvgRenderer`, `__gvgCamera`, `__THREE`, `__startMatch({ mapKey, mode,
mainMode, player, ally, enemy, enemy2, suddenDeath })`, `__loading.up()`, `__intro.active`, `__finale.shot`,
`__killFeed { state, cfg, push, note }`, `__tactic { cfg, hud, shown, can, live, call, open, lit, version, pickMsg, cooling,
msgs, note }`. `__tactic.version()` says which button a seat has: `'bot'` (the bot command), `'msg'` (the teammate's messages)
or `null`.
