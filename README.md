# Gun VS Gun

A fast-paced 1v1 / 2v2 arena prototype with two main modes — **Duel** (single stock) and **Trio** (three-unit rosters). Auto-aim — no manual targeting. The fight is about resource management: when to sprint, when to dodge, when to break line of sight, when to fire.

> **Demo build** (branch `0.6.3_Demo_Version`): all character art and character names are removed. In-game, fighters render as neutral stick figures colored by role — blue you, green ally, red/orange enemies — with a dark through-wall silhouette for your own unit; every unit in the same slot shares the same figure. In menus, units are identified by their gun's name and silhouette; the in-game roster indicator shows the same silhouettes, and every fighter carries its weapon name on a tag above its head — all weapon-identity UI shares one dark-plate style.

## Modes

Two main modes, each playable **1v1 or 2v2**, offline and online:

- **Duel** — classic single stock: one unit per fighter; a team loses when all its fighters are down.
- **Trio** — three-unit stock: every slot (human or bot) fields an **ordered roster of three units**, repeats allowed. When a unit dies, the slot's next unit respawns at its original spawn point with the standard 3 s spawn immunity; the killer keeps position / HP / boost — no kill reward. A team loses when every roster on its side is spent. Each fighter's remaining units show as a row of small weapon renders under their side's HP bars (one line per team member; Duel shows its single unit the same way), and each Trio line's currently fielded weapon renders its silhouette in gold.
- **Spectating (2v2, both modes)**: if you're out for good while your ally fights on, the camera follows the ally with your own-unit visual kit (through-wall X-ray silhouette); the lock reticle stays up and mirrors the ally's actual target (the TARGET button goes inert).

### Offline
- **1v1**: you vs one enemy bot.
- **2v2**: you + an ally bot vs two enemy bots. Friendly fire is off between teammates.
- **Trio picks**: you select your three units in order, then each bot's three — same selection grid, titles count up (1/3 → 3/3).
- Optional "Dummy" mode on the map-select screen — zeroes out damage from every bot (enemies and your ally), so you can practice movement and observe bot behaviour without dying.
- Optional "Spectator" mode beside it — a bot takes over your unit and you watch the match: **TARGET** cycles the camera across every unit on the field (both teams), the HUD (HP / boost / ammo) follows whoever you're watching, the edge arrows stay viewer-relative, and the end banner reads **TEAM 1 WINS / TEAM 2 WINS**. Stacks with Dummy for an endless no-deaths bot exhibition.

### Online
- **Mode selection**: the host picks **Duel or Trio**, then **1v1 or 2v2**; joiners inherit the lobby's modes.
- **1v1**: the host presses **Start Match** when ready. The opponent slot holds a bot (default **Unit 1 / Unit 1**) until a second human queues in and takes it — start early to play the bot, or wait for a player.
- **2v2**: the host presses **Start Match** when ready; empty player slots fill with bots. Up to four humans can play (any split between teams); bots fill any remaining slots.
- **Bot unit selection**: in the lobby, the host can tap any bot slot to pick which unit that bot plays — in Trio, its three units in order (default: three copies of the slot's usual unit). A human joining the slot always overrides the bot.
- **Trio queue room**: every slot's roster is shown in three lines and updates live as picks land.
- **Host migration**: if the host leaves in the lobby or at the end menu, the longest-waiting player is promoted to host (their unit picks carry over; they re-choose mode and map).
- Multi-lobby — when an existing lobby is full or running, new joiners spawn their own lobby and become host.
- Team swap in 2v2: any non-host player can `Join` an empty slot to switch teams (e.g. two humans want to co-op on one side against two bots).

### Random & All Random cards

Both offline and online pickers carry them:

- Every unit grid has a gray **Random** card (question-mark thumbnail): it rolls a unit the roster being built doesn't already contain (different players can still land on the same unit). The map grid's Random skips **Shooting Range** and **Plain Field**.
- Unit grids in a multi-pick flow also carry a golden **All Random** card: one confirm fills every remaining unit slot of the current flow at once and advances it (offline Trio: the rest of your roster, then each bot's as its picks come up; online: the rest of your roster). The map picker deliberately has no All Random.

## Units

Twelve pickable units, near-identical base stats (150 HP, 250 boost, 16 walk, 11.76 sprint base — Unit 5 walks at 8, Unit 12 at 12; Unit 7 flies):

**Weapons:**

| | Mag | Damage | Fire rate | Projectile speed | Lock range | Reload |
|---|---|---|---|---|---|---|
| Unit 1 — Assault Rifle | 30 | 4.5 / shot | ~700 RPM | 600 | 56 | 1.5 s |
| Unit 9 — Assault Rifle | 25 | 4 / shot | ~900 RPM | 600 | 56 | 1.5 s |
| Unit 4 — Submachine Gun | 30 | 3.5 / shot | ~1100 RPM | 600 | 50 | 1.5 s |
| Unit 13 — Submachine Gun | 71 | 2.5 / shot | ~1250 RPM | 600 | 50 | 2 s |
| Unit 2 — Shotgun | 7 | 5 × 8 pellets | ~250 RPM | 300 | 40 | 1.2 s (auto, per round) |
| Unit 11 — Shotgun | 7 | 5 × 8 pellets | ~250 RPM | 300 | 40 | 1.2 s (auto, per round) |
| Unit 12 — Machine Gun | 100 | 4.5 / shot | ~600 RPM | 600 | 80 | 5 s |
| Unit 5 — Machine Gun | 250 | 4 / shot | ~1250 RPM | 600 | 80 | 7 s |
| Unit 10 — Rifle | 30 | 10 / shot | ~250 RPM | 600 | 56 | 2 s |
| Unit 7 — Laser | 8 | 15 / bolt | ~250 RPM | 600 | 56 | 1.2 s (auto, per round) |
| Unit 3 — Sniper Rifle | 5 | 50 / 35 / 20 by range | 60 RPM | 2500 | 120 | 2.5 s + 1 s charge |
| Unit 6 — Railgun | 5 | 30 / beam (charged sweep: 20) | 60 RPM | instant (hitscan) | 120 | 2.5 s + 1 s charge |

**Theoretical DPS** (every shot landing; cadences are the real 16 ms tick slots, not label RPM):

| Unit | Real cadence | Dmg/shot | Burst DPS | Sustained (incl. reload) |
|---|---|---|---|---|
| Unit 2 / Unit 11 | 4.17 blasts/s | 40 (8×5, point-blank) | **166.7** | ~33.3 (shell-regen limited) |
| Unit 5 | 20.8/s (48 ms) | 4 | **83.3** | 52.8 |
| Unit 7 | 4.17/s | 15 / bolt | **62.5** | ~12.5 (bolt-regen limited) |
| Unit 4 | 15.6/s (64 ms) | 3.5 | **54.7** | 31.3 |
| Unit 13 | 20.8/s (48 ms) | 2.5 | **52.1** | 33.1 |
| Unit 9 | 12.5/s (80 ms) | 4 | **50.0** | 29.2 |
| Unit 1 | 10.4/s (96 ms) | 4.5 | **46.9** | 31.5 |
| Unit 10 | 4.17/s | 10 | **41.7** | 33.5 |
| Unit 12 | 8.9/s (112 ms) | 4.5 | **40.2** | 28.0 |
| Unit 3 | 1 per ~1.5 s (snap cycle) | 50 / 35 / 20 by range | **~33.3** (full-damage snaps) | ~33.3 |
| Unit 6 | 1 per ~1.5 s | 30 quick beam | **~20.0** | ~20.0 |

Reading the DPS table: the shotgun row is the most theoretical — all 8 pellets only land point-blank, and the 7-shell magazine burns in ~1.7 s before per-shell regen throttles the long run. Unit 7's burst is real for its 8-bolt spike (120 damage in ~1.7 s), then collapses to the worst sustained figure in the game. The sniper rows use cycle math (cooldown + floor charge) at full range-tier damage. The tight 40–55 spread across six mid-table guns is deliberate — fights are decided by accuracy curves, uptime, and positioning rather than raw DPS.

**Handling (stun + spread):**

| | Stun | Spread (SA) | Horizontal spread (HA) | Sure-hit vs standing |
|---|---|---|---|---|
| Unit 1 | 100 ms @ 0.25 | 0.02 | 0.04 | ~53 |
| Unit 9 | 100 ms @ 0.25 | 0.02 | 0.04 | ~53 |
| Unit 4 | 50 ms @ 0.50 | 0.06 | — | ~53 |
| Unit 13 | 50 ms @ 0.50 | 0.06 | 0.04 | ~32 |
| Unit 2 | 100 ms @ 0.25 | pattern (see below) | — | pattern |
| Unit 11 | 100 ms @ 0.25 | pattern, 1.4× wide (see below) | — | pattern |
| Unit 12 | 100 ms @ 0.25 | 0.04 | 0.04 | ~40 |
| Unit 5 | 50 ms @ 0.85 | 0.04 | — | ~80 |
| Unit 10 | 100 ms @ 0.25 | 0.02 | — | ~160 |
| Unit 7 | 100 ms @ 0.25 | 0.02 | — | ~160 |
| Unit 3 | 100 ms @ 0.25 | 0.02 | — | ~160 |
| Unit 6 | 100 ms @ 0.25 | — (beam) | — | instant |

Unit 13 is the lightest bullet in the game on Unit 5's cadence: the 48 ms tick slot (20.8 shots/s) in an SMG chassis and a 71-round drum — ~3.4 s of continuous fire (≈178 damage per drum) behind a 2 s reload. Suppression-first: her value is steady chip on the longest trigger in the SMG class, plus the boost her stream forces targets to burn escaping; the kill usually needs cross-fire or a second drum. Since 0.5.9 the SMG spread profiles follow the real guns: the WWII PPSh hoses wide (Unit 13 carries the 0.04 HA), the modern EVO3 shoots tight (Unit 4 dropped hers — sure-hit ~53).

**Reading the stun column** (`duration @ move-scale`): every landed hit slows the victim's movement to *move-scale* for *duration* — e.g. `100 ms @ 0.25` means crawling at 25% speed for 100 ms. Each new hit refreshes it; when two stuns compete, the heavier slow (lower scale) wins. **In practice the slow itself is a minor stat**: sprinting pays straight through it (and everyone sprints away from fire anyway, stun or not), while a walking target was already highly hittable — so the currencies that actually decide fights are the damage actually landed and the boost the target burns escaping, not the movement penalty.

**Reading the spread columns:** both are random cone angles in radians. **SA** is a perfectly ROUND random cone (equal scatter in both axes); **HA** adds extra scatter on the *horizontal axis only* — the axis enemies dodge along — so HA is pure anti-dodge coverage with no vertical waste. Total horizontal cone = SA + HA. Since angular error grows with distance, each gun has a **sure-hit range** against a stationary target (≈ 3.2 ÷ (SA + HA)); beyond it, hit chance falls off roughly as sure-hit ÷ distance. Wide-HA guns (Unit 13) deliberately trade standing-target accuracy at range for taxing dodgers. The shotguns ignore the cones entirely: their pellets fly a fixed 8-point pattern that opens toward ~5.8 wide over the first 70 units of flight — at lock range it is still a tight ~3.3-wide cluster; Unit 11's pattern is additionally stretched 1.4× horizontally (details below).

**Preferred engage distance:** every unit's fighting range is its **lock range ± 7** — the band where bots hold position, orbit, and fire (shotgun 33–47, SMGs 43–57, snipers 113–127). One rule for all weapons: retune a lock range and the combat distance follows.

**Measured hit rates** (Shooting Range; every unit fires from her own lock range; 100 shots per lane — shotguns 7 blasts = 56 pellets, rows show pellet rates):

| @ own lock range | Stationary | Walk (16 u/s) | Sprint (27.8 u/s) |
|---|---|---|---|
| Unit 1 @56 | 99% | 69% | 6% |
| Unit 9 @56 | 100% | 64% | 8% |
| Unit 4 @50 | 100% | 62% | 12% |
| Unit 13 @50 | 85% | 61% | 18% |
| Unit 2 @40 | 75% | 30% | 0% |
| Unit 11 @40 | 61% | 30% | 4% |
| Unit 12 @80 | 76% | 40% | 3% |
| Unit 5 @80 | 100% | 25% | 0% |

*Test environment:* Shooting Range (offline practice map). Each unit stands at her own lock range and empties the shot count into each lane in turn: a stationary sign, a walk-speed slider (16 u/s) and a sprint-speed slider (27.8 u/s) ping-ponging along their trails. **Shots are only taken while the target sign sits fully inside the giant score screen's width (both edges visible)** — i.e. only mid-trail, near-perpendicular engagements count. Near the trail edges a turning slider moves almost along the line of fire and is far easier to hit; earlier runs that fired across the whole trail inflated the mover columns and were retired. Screens accumulate per-lane damage and grouping — **yellow dots are hits** (plotted at the impact point), **red dots are misses** (plotted where the shot crosses the sign plane). Hit counts = screen damage ÷ per-hit damage.

Standouts under the strict protocol: perpendicular sprint is near-untouchable for everyone (the flight-time tax — only the wide-spread guns clip it at all), and the stationary column tracks each gun's sure-hit range faithfully.


Projectiles fly straight (homing is zeroed universally). The targeting reticle is an **enemy-firing indicator**, not a range indicator: green by default, it flashes red while your current target is firing and stays red for the whole time a sniper is mid-charge with you as the target (see the sniper section). Being inside lock range is not signalled to players at all — the number only shapes bot behavior (bots hold their engage band around it). A faint in-lock tracer tint that once keyed to it was removed 2026-08-01.

### Units 2 & 11 — the shotgun blast

- A trigger pull fires **one flying pellet cluster** carrying a fixed 8-point pattern (randomly rotated each shot, so no two blasts look alike while the spacing geometry never clumps). Each pellet keeps its **own hitbox** and dies individually on walls or the target; damage = pellets landed × 5 (all 8 point-blank = 40, both shotguns).
- The pattern leaves the muzzle bunched and grows toward full width (~5.8 across) over the first **70 units** of flight. At lock range (40) it is ~57% open (~3.3 across), so locked-fire blasts land as a concentrated cluster rather than a full spread.
- **Unit 11's wide fan:** her pattern is stretched **1.4× horizontally** after the per-shot rotation — the cloud is 1.4× wider and exactly as tall as Unit 2's (at lock 40: ~4.6 × 3.3; fully open: ~8.1 × 5.8). More graze coverage along the dodge axis, lighter pellets — the dodge-catcher to Unit 2's concentrated slug.
- One blast = one simulated/networked object instead of 8 — the wire-cost half of the old online "shotgun lag" fix; the projectile broadphase (see Implementation notes) removed the other half, the dense-map CPU cost.

### Unit 7 — laser bolts

- The flight kit was **removed in this demo build**: Unit 7 plays as a normal ground unit (standard jump, 1.5 s cooldown, no air re-jumps, no sustained climb).
- Sprinting into a jump **carries the sprint momentum** through the air.
- Her shot is a **64-unit-long laser bolt**: the thin cyan cylinder you see *is* the hitbox (both derive from one spec entry). It grows out of the muzzle — the body never reaches behind the spawn point — and hits with its whole length, so a dodge must clear the entire passing beam, not just its nose.

### Sniper charge & sprint-cancel

- Both snipers hold their shot on a **1 s charge** (locked in place). Holding sprint cancels the charge and fires early — but never before a **0.5 s floor** (costs ½ a dodge's boost). So the shooter picks any release point in the **0.5–1 s** window, and the target always gets at least that much glint-to-bullet warning.
- **Online floating unlock:** against a human defender the 0.5 s floor counts from the moment their client *actually rendered* the glint — the defender's client acks the glint's first frame and the server slides the earliest release to that ack + 0.5 s — the defender's half-second of SEEN warning is absolute. If the ack never arrives (defender's tab backgrounded, client stalled; the server waits up to 0.5 s), the earliest release becomes press + 1.0 s — exactly a normal full charge, so the attacker's worst case is simply losing the fast cancel for that shot. Offline play and bot defenders (who see server truth instantly) are unchanged.

**Sniper timing at a glance** (worked example: defender's network delay 0.05 s each way; projectile flight and 16 ms tick rounding excluded). Column definitions — *release time*: server clock, from processing the attacker's FIRE input to creating the projectile; *glint duration*: on each player's own display, from the frame the glint is first drawn to the frame the shot is drawn; *read & decide*: on the defender's side, from the glint's first drawn frame to the latest DODGE press that still reaches the server before the projectile exists.

| Release time | Glint duration (attacker's screen) | Glint duration (defender's screen) | Read & decide time |
|---|---|---|---|
| 0.60 (earliest the server permits) | 0.60 | 0.60 | **0.50** |
| 0.70 | 0.70 | 0.70 | 0.60 |
| 0.80 | 0.80 | 0.80 | 0.70 |
| 0.90 | 0.90 | 0.90 | 0.80 |
| 1.00 (server auto-fires) | 1.00 | 1.00 | **0.90** |

Three properties the table encodes: glint duration equals the release time on **every** screen (both endpoints of the interval shift by the same delivery delay, so its length is preserved for any observer); the defender's read & decide time is always the release time minus their round trip (one delivery lost at each end); and the earliest-release fence sits at ack + 0.5 s precisely so the read & decide column can never fall below 0.50 — the guarantee is produced by *placing the fence*, not by adjusting any clock. The full charge is the one release with no fence involvement: it fires at press + 1.0 s flat, so its read & decide time shrinks with the defender's round trip (lag-taxed like every ordinary attack), while the fast cancel's 0.50 is lag-proof.
- The **dodge** is the counter: a step grants **0.3 s** of i-frame immunity, so a well-timed dodge passes through the shot. Unit 3's bullet speed is **2500 u/s** (near-hitscan — only ~0.05 s flight even at max range); Unit 6's beam is instant.

### Unit 3 — range zones & the lock reticle

- Damage is tiered by distance, **locked at fire time**: under 15 units → **20**, 15–50 → **35**, beyond 50 → **50**. Rushing a sniper is real counterplay; long range stays lethal.
- The lock reticle shows the current zone — plain brackets (<15), **+ cross ticks** (15–50), **+ inner bars** (50+). It appears both when *you* play Unit 3 (your tier on the target) and when your lock target *is* an Unit 3 (which of her zones you're standing in).
- The reticle turns **red** not just when your target fires, but for the whole time a sniper (Unit 3 **or** Unit 6) is **mid-charge with you as the target** — a continuous danger signal from glint to shot.

### Unit 6 — 照射ビーム laser

- Fires an instant **hitscan beam** (30 damage, one hit per enemy per beam, blocked by walls, ~0.5 s fade) instead of a bullet. The beam also **deletes projectiles** it touches.
- Holding the charge to the full **1 s** fires a **sweep channel**: a 1 s locked, steerable beam (1.5× width, **20 damage**, one hit per enemy for the whole channel). The stick steers it — horizontal and vertical — at ~10°/s; sprint cancels the channel. The fire cooldown is paused during the channel and starts when it ends.
- Her glint grows toward **2×** size as the charge fills, telegraphing a full-charge sweep.

**Bots vs. the sniper.**
- **As the shooter:** both sniper bots flip a **50/50 coin** per shot — release at the **0.5 s floor** (a fast snap; for Unit 6, the quick beam) or hold to the **full 1 s charge** (for Unit 6, the sweep channel). No in-between releases.
- **On defense:** when a glint aimed at it appears — from **any** enemy, locked or not (mirroring the human's edge-indicator awareness; earliest active charge wins) — the bot **rolls its reaction per charge**, and the slow roll is charger-aware:
  - **Anti-Unit 3** (bullet snipers): **50% at 0.4 s** (i-frames open ahead of the earliest possible cancel, covering **every floor snap at any range** — but a full hold sails in after they end) / **50% at 0.8 s** (deliberately late: a snap lands first and cancels the pending dodge, but the i-frames ~0.8–1.1 s sit exactly on the **full hold's** impact). Against the shooter's 50/50 snap/hold flip neither side can be read; equilibrium **~50% of charges convert** (snaps beat slow rolls, holds beat fast rolls).
  - **Anti-Unit 6** (beam snipers): **50% at 0.4 s** (covers the instant quick beam) / **50% at 0.9 s** — the dodge starts just ahead of the **sweep channel's** aimed opening (i-frames ~0.9–1.2 s blanket it) and the follow-up sprint outruns the beam's steering at normal fighting ranges. (An 0.8 s roll would be dead weight here: the quick beam pre-empts it and the sweep outlives it.)

  Either way it's one dodge (0.3 s i-frames) plus a **0.52 s** committed sprint, both perpendicular to that sniper's line of fire; lock and return fire stay on the current target throughout. Mid-charge hits still cancel a pending dodge, and a cooldown- or boost-blocked defender still eats the shot. After the committed sprint expires the bot has no awareness of a still-live sweep — it can wander back into the channel.

**Bot trigger discipline.** A bot fires in continuous bursts of a fixed per-unit length (`botFireCap` — the "fire cap"), resting ~0.8–1.5 s between bursts. Shots inside a burst pace at the weapon's own RPM-derived cooldown, so retuning a fire rate retunes the bot with it. Every auto's cap equals its **full magazine** — an auto bot fires until the mag runs dry and rolls straight into the reload; the shotguns are burst-gated at 4 blasts per pull; the snipers run their charge cycle instead of bursting.

| Unit | Fire cap | Meaning |
|---|---|---|
| Unit 1 | 30 | full mag |
| Unit 9 | 25 | full mag |
| Unit 4 | 30 | full mag |
| Unit 13 | 71 | full drum |
| Unit 10 | 30 | full mag |
| Unit 12 | 100 | full mag |
| Unit 5 | 250 | full drum (~12 s of continuous fire) |
| Unit 2 / Unit 11 | 4 | 4 blasts per trigger pull |
| Unit 7 | 4 | legacy formula (half mag) |
| Unit 3 / Unit 6 | — | charge cycle, no bursts |

A burst ends early if the mag runs dry (straight into the reload), if line of sight breaks (re-checked every 0.22 s; the burst then restarts from full), or if the target is **spawn-immune** — bots hold fire at immune targets and wake the moment immunity lapses. A bot's OWN spawn immunity does **not** hold its fire: a freshly spawned bot shoots from behind its protection window, same as a player would.

## Controls

| | |
|---|---|
| **Mobile** | On-screen joystick + buttons |
| **PC** | `WASD` move · `J` fire · `K` sprint · `L` dodge · `Space` jump · `U` switch target (2v2) |

Double-tap `K` (or the sprint button) to lock sprint. The lock releases only after the stick/keys stay **neutral for a sustained 0.18 s** — flipping direction through the joystick center (left→right) or swapping movement keys keeps the locked sprint alive; letting go still stops it almost instantly. Dodge (step) grants 0.3 s of damage immunity (i-frames) — the full duration holds even when the dodge runs into a wall (the unit stops at the wall; the animation and i-frames don't cut short).

## Maps

Nine arenas: Plain Field, Streets, Factory, Factory 2, Square, Lobby, Station, Flashpoint, Airport. Each has its own cover layout and elevation; Station has raised platforms players jump up onto, and Airport centers on a raised security plateau — glass-fenced rims, four ramp entrances, and a metal-detector checkpoint as the only way across the middle. On Streets, the storefront towers are solid to their full height (they block movement, fire, and bot sight) and their **rooftops are standable** (originally flight-only high ground; with the demo's flight kit removed, no unit reaches them). The offline map list also carries the **Shooting Range** — the no-opponent practice map behind the measured hit-rate tables above (target sliders, per-lane score screens); the map Random card never rolls it.

**Factory 2** is the industrial remake of Factory built on Airport's design philosophy: one central organizing anchor — a raised **assembly deck** with four railed walk-up ramps plus jump-through fence openings (two 16-wide mid-side gaps and four corner notches) that bots use too, via the pathfinder's shortcut links — surrounded by dense, trustworthy cover (CNC machines, shipping containers, double-height crate stacks, partition walls, solid workstations) that passes the sizing rules everywhere: true cover is 8+ tall with real depth, vault clutter stays under 2.5. Two walkable conveyors flank the deck; everything is ramp-accessible (no flight-only spots). The layout is point-symmetric, and its online collision data is auto-exported from the offline builder so both modes are guaranteed identical.

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
- **Bot AI** has one logical state machine (Defense > Maze > Engage > Pursue) with identical numbers in both offline (`updateEnemy` in `client/src/main.js`) and online (`tickBot` in `shared/src/sim/ai.js`) implementations.
- **Universal pathfinder.** Maze is route-first: a nav grid is derived from each map's collision data (4-unit cells, A* plus a firing-position search), with jump-links bridging separated walk islands (e.g. Station's raised platforms) so bots climb instead of grinding walls. Heuristic wall-following remains the no-route fallback. Bots hold a per-weapon range band centered on their lock range (sweet spot ±7) — one rule for every weapon.
- **Stamina economy** is shared by humans and bots — same cap (250), drain (1.1/tick), regen (4.59/tick), and empty-recovery lockout. Bot decisions layer a **strategic reserve (250 boost — the full cap)** on top: travel spending (sprint dispatch, pursuit, route jumps) never voluntarily digs below it, so bots only start travel sprints from a topped-up tank. Two survival exemptions spend through the reserve — Defense escapes under live fire (down to the hard floor of 8) and the anti-glint dodge (gated only by the unit's raw step cost — 48 by default; step cost/duration/cooldown/distance are per-unit tunable like the jump family). The reserve is purely a decision threshold; the mechanics underneath stay human-identical.
- **Friendly fire** in 2v2 is off — bullets pass through teammates.
- **Map collision data** for the online server is auto-extracted from offline at build time. Visual mesh is always rendered by the offline arena-build code on the client.
- **Pre-game loading.** Every unit visible in a pick (offline pickers) or in the lobby config (online queue room) starts its sprite-art downloads immediately — menu dead time absorbs the network wait — and GPU uploads are drip-fed one texture per frame. At match load, each Trio slot's 2nd/3rd roster units are additionally pre-built as complete (hidden) mechs, so a mid-match respawn is a pure swap-in: no construction, no decode, no upload during the fight.
- **Projectile broadphase (online sim).** Each map's obstacle boxes are indexed once into a 24-unit ground grid; every tick, each projectile (bullets, sniper rounds, laser bolts, every shotgun pellet) tests only the obstacles near its own flight segment for that tick instead of the whole map. The precise sweep test stays the final authority, so hit results are bit-identical to a full scan (differential-verified on all maps) — but dense maps (Factory: 380 boxes) now cost the same as open ones, which removed the server-side lag during shotgun / high-RPM fights. Unit 6's hitscan beams and all non-weapon scans (bot sight, pathfinding, movement) deliberately keep the plain full scan.

## Status

Prototype. Phases 0–4 from `PLAN.md` are landed (boot, sim extraction, naive networking, prediction & interpolation, robustness). 2v2 mode and the Duel / Trio main-mode split (Trio = three-unit stock rosters with in-place respawns) have been added on top of the original 1v1 scope, both offline and online.
