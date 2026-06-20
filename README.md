# Gun VS Gun

A fast-paced 1v1 / 2v2 duel prototype. Auto-aim — no manual targeting. The fight is about resource management: when to sprint, when to dodge, when to break line of sight, when to fire.

## Modes

### Offline
- **1v1**: you vs one enemy bot.
- **2v2**: you + an ally bot vs two enemy bots. Friendly fire is off between teammates.
- Optional "Dummy" mode on the map-select screen — zeroes out damage from every bot (enemies and your ally), so you can practice movement and observe bot behaviour without dying.

### Online
- **1v1**: matchmaking pools two humans into the same lobby.
- **2v2**: host picks `2v2` on connect, then presses **Start Match** when ready; empty player slots fill with bots. Up to four humans can play (any split between teams); bots fill any remaining slots.
- Multi-lobby — when an existing lobby is full or running, new joiners spawn their own lobby and become host.
- Team swap allowed during the lobby: any non-host player can `Join` an empty slot to switch teams (e.g. two humans want to co-op on one side against two bots).

## Units

Five pickable units, identical base stats (150 HP, 250 boost, 16 walk, 11.76 sprint base):

| | Mag | Damage | Fire rate | Lock range | Reload |
|---|---|---|---|---|---|
| Unit 1 — Assault Rifle | 30 | 4 / shot | ~850 RPM | 56 | 1.5 s |
| Unit 2 — Shotgun | 7 | 4 × 8 pellets | ~250 RPM | 43 | 1.5 s (auto, per round) |
| Unit 3 — Sniper Rifle | 5 | 50 / shot | 60 RPM | 120 | 2.5 s + 1 s charge |
| Unit 4 — Submachine Gun | 30 | 3 / shot | ~1100 RPM | 46 | 1.5 s |
| Unit 5 — Machine Gun | 250 | 4 / shot | ~1200 RPM | 80 | 5 s |

Red-lock (in-range target) enables homing on single-shot weapons.

### Sniper charge & sprint-cancel

- The Sniper holds its shot on a **1 s charge** (locked in place). Holding sprint cancels the charge and fires early — but never before a **0.5 s floor** (costs ½ a dodge's boost). So the shooter picks any release point in the **0.5–1 s** window, and the target always gets at least that much glint-to-bullet warning.
- The **dodge** is the counter: a step grants **0.3 s** of i-frame immunity, so a well-timed dodge passes through the shot. Bullet speed is **2000 u/s** (near-hitscan — only ~0.06 s flight even at max range), so evasion is a read off the glint, not the bullet.

**Bots vs. the sniper.**
- **As the shooter:** the bot releases at the **0.5 s floor 90%** of the time (a fast snap), and at a random **0.5–1 s** the other 10%.
- **On defense:** when a glint appears, the bot ignores it for a fixed **0.6 s**, then does exactly **one** lateral dodge (0.3 s i-frames) per charge — no prediction, no cover-sprint. A bullet **arriving ~0.6–0.9 s** after the glint is dodged — but at 2000 u/s a floor-snap (release at 0.5 s) lands ~0.5–0.56 s in, *before* the 0.6 s dodge, so the snap now beats the dodge **at any range**. Only a *held* shot can be dodged, and one held past ~0.9 s whiffs the dash entirely.

## Controls

| | |
|---|---|
| **Mobile** | On-screen joystick + buttons |
| **PC** | `WASD` move · `J` fire · `K` sprint · `L` dodge · `Space` jump · `U` switch target (2v2) |

Double-tap `K` (or the sprint button) to lock sprint. Dodge (step) grants 0.3 s of damage immunity (i-frames).

## Maps

Seven arenas: Plain Field, Streets, Factory, Square, Lobby, Station, Flashpoint. Each has its own cover layout and elevation; Station has raised platforms players jump up onto.

## Project layout

- `client/` — Three.js + cannon-es + Vite frontend. Both offline match runtime and online client live here.
- `server/` — Node + Socket.IO authoritative game server. Multi-lobby, runs the shared simulation per match.
- `shared/` — pure-JS game logic that the server (and the online prediction layer in the client) consumes. State, physics, AI, projectile system.
- `render.yaml` — Render blueprint (free-tier deploy of both services).
- `PLAN.md` — implementation history / phased roadmap.

## Local development

Install workspace dependencies from the repo root:

```
npm install
```

Run the server (terminal 1):

```
npm run dev:server
```

Run the client (terminal 2):

```
npm run dev:client
```

Open <http://localhost:5173>. The offline menu lets you pick a unit and play immediately. **Online (vs Player)** connects to the server you started in terminal 1.

## Deployment (Render)

The repo ships with `render.yaml` defining two free-tier services:

- `gvg-server` — Node web service (the Socket.IO server)
- `gvg-client` — static site (the Vite-built client)

After the first deploy, set the client's `VITE_SERVER_URL` environment variable in the Render dashboard to your server's public URL (e.g. `https://gvg-server-xxxx.onrender.com`) and redeploy the client.

> Free-tier services spin down after ~15 min idle. First connection to a cold server takes 30–60 s. Acceptable for prototype testing, not for production.

## Implementation notes

- **Server authoritative.** Shared sim runs on the server at ~62.5 Hz; clients predict their own local fighter and reconcile against snapshots.
- **Bot AI** has one logical state machine (Defense > Maze > Reposition > Engage > Pursue) with identical numbers in both offline (`updateEnemy` in `client/src/main.js`) and online (`tickBot` in `shared/src/sim/ai.js`) implementations.
- **Stamina economy** is shared by humans and bots — same cap (250), drain (1.1/tick), regen (4.59/tick), and empty-recovery lockout. Bots self-regulate via dispatch floor (`boost ≥ 8`) and the Pursue-state hysteresis (sprint at 48, stop at 33).
- **Friendly fire** in 2v2 is off — bullets pass through teammates.
- **Map collision data** for the online server is auto-extracted from offline at build time. Visual mesh is always rendered by the offline arena-build code on the client.

## Status

Prototype. Phases 0–4 from `PLAN.md` are landed (boot, sim extraction, naive networking, prediction & interpolation, robustness). 2v2 mode (both offline and online) has been added on top of the original 1v1 scope.
