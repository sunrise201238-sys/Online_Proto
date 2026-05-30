# Gun VS Gun

A fast-paced 1v1 / 2v2 mecha duel prototype. Auto-aim — no manual targeting. The fight is about resource management: when to sprint, when to dodge, when to break line of sight, when to fire.

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

Three pickable units, identical chassis stats (150 HP, 250 boost, 16 walk, 11.76 sprint base):

| | Mag | Damage | Fire rate | Lock range | Reload |
|---|---|---|---|---|---|
| Unit 1 — Machine Gun | 30 | 4 / shot | ~850 RPM | 56 | 1.5 s |
| Unit 2 — Shotgun | 7 | 4 × 8 pellets | ~250 RPM | 43 | 1.5 s (auto, per round) |
| Unit 3 — Sniper Rifle | 5 | 50 / shot | 60 RPM | 120 | 2.5 s + 0.5 s charge |

Red-lock (in-range target) enables homing on single-shot weapons.

## Controls

| | |
|---|---|
| **Mobile** | On-screen joystick + buttons |
| **PC** | `WASD` move · `J` fire · `K` sprint · `L` dodge · `Space` jump · `U` switch target (2v2) |

Double-tap `K` (or the sprint button) to lock sprint. Dodge (step) grants brief damage immunity.

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
