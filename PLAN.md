# Implementation plan — gvg-online

Tracks the five-phase rollout of online versus. Update this file as phases land so future sessions can re-orient quickly.

---

## Phase 0 — Boot & connect (in progress)

**Goal:** server starts, client opens a socket, hello round-trips. No gameplay over the wire yet.

**Status:** scaffolded. Awaiting first local test + first Render deploy.

- [x] New monorepo at `gvg-online/`
- [x] `package.json` workspaces include `client`, `server`, `shared`
- [x] `.gitignore`, `README.md`, `PLAN.md`, `render.yaml`
- [x] `socket.io-client` added to `client/package.json`
- [x] `client/src/online/connection.js` wraps the socket + event log
- [x] Debug **Online (Debug Connect)** button on unit-select menu opens a status panel
- [x] Server emits `match:hello` on connect alongside `player:assigned`
- [ ] **User action:** `npm install` from repo root
- [ ] **User action:** local smoke test — both `npm run dev:server` and `npm run dev:client`, click the debug button, confirm `match:hello` appears
- [ ] **User action:** push to GitHub, wire to Render, set `VITE_SERVER_URL` on the client service after first deploy

---

## Phase 1 — Extract simulation (the big refactor)

**Goal:** all gameplay logic from `client/src/main.js` lives in `shared/` as pure JS with no Three.js or cannon-es dependency. Existing offline game still feels identical.

**Status:** not started. Existing `shared/src/gameLogic.js` is an orphan from an earlier prototype; it does not match the current game and will be replaced or rewritten in this phase.

Sub-tasks (when we start):

- Inventory each function in `main.js` as `SIM` / `RENDER` / `INPUT` / `MIXED`
- Build `shared/src/sim/{state,step,actions,physics,arena}.js`
- Replace cannon-es with explicit kinematic integration in the sim (cannon stays only client-side, possibly removed entirely)
- Drive the existing client off the new sim — bot match must feel identical
- Headless test harness: 10k-tick bot vs bot, no NaNs, snapshot serialization round-trip
- Feel-regression checklist: sniper kill at max range, MG sustained DPS, dodge i-frame duration, jump apex, lock snap timing, melee combo cancel window

This phase is the biggest risk to game feel. Move code line-by-line, preserve magic numbers exactly, refactor for cleanliness later.

---

## Phase 2 — Naive networking

**Goal:** two browsers fight each other across the internet. No prediction yet — local player feels laggy, but it's playable for testing.

**Status:** not started.

- Client sends inputs `{ tick, type, payload }` over socket
- Server drains inputs each tick, runs `tickMatch`, broadcasts snapshot
- Client renders directly from snapshots (no local sim during online matches)
- Online mode selectable from menu; offline bot mode unchanged

---

## Phase 3 — Prediction & interpolation

**Goal:** game feels responsive. Local player runs the sim immediately on input; remote player is rendered from a 100ms-buffered interpolation.

**Status:** not started.

- Local prediction with input ring buffer + reconciliation on snapshot arrival
- Remote player interpolated between last two snapshots at `serverTime - 100ms`
- Server-authoritative damage; client shows hit VFX optimistically
- Visual smoothing on small reconciliation pops

---

## Phase 4 — Robustness & lifecycle

**Goal:** can be played by strangers, not just the dev.

**Status:** not started.

- Disconnect / reconnect with 30s grace window
- Lobby → matchmaking → countdown → match → end → return to lobby state machine
- Character/map select syncs across both clients
- Ping display in HUD
- Server tick-duration logging (p50 / p95)
- Input rate limiting

---

## Phase 5 — Optional polish

- Delta-encoded snapshots
- Replay system (recordings of input + snapshot streams)
- Spectator mode (read-only socket)
- Multi-match scaling (one Render instance hosts many matches)

---

## Working notes

- **Authority model:** server-authoritative with prediction + reconciliation. Decided over peer-relay for cheat resistance and because the stub already assumed it.
- **Determinism:** not required. Server and client run the same code but float drift is fine; reconciliation snaps divergence.
- **Render free tier:** acceptable for prototype. Spins down after 15min idle; first connect takes 30–60s. Single region; non-US players see 150–250ms RTT.
- **Tick rate:** 25ms (40Hz) per `TICK_RATE_MS` in shared. Drop to 30Hz only if free tier struggles.
- **Game feel is the load-bearing risk.** Phase 1 will subtly break things during extraction. Mitigation: don't refactor for cleanliness during the move; preserve constants exactly; playtest every chunk.

---

## Session re-orientation checklist

When picking up after a break:

1. Read this file
2. Check the latest commit on `main` for in-progress work
3. Open the relevant phase section above; pick the first unchecked item
4. If something seems wrong with extracted gameplay feel, check the feel-regression items in Phase 1
