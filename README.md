# Gun VS Gun

A fast-paced 1v1 / 2v2 arena prototype with two main modes — **Duel** (single stock) and **Trio** (three-unit rosters). Auto-aim — no manual targeting. The fight is about resource management: when to sprint, when to dodge, when to break line of sight, when to fire.

> **Demo build** (branch `Demo_0.6.5_Update`): all character art and character names are removed. In-game, fighters render as neutral stick figures colored by role — blue you, green ally, red/orange enemies — with a dark through-wall silhouette for your own unit; every unit in the same slot shares the same figure. In menus, units are identified by their gun's name and silhouette; the in-game roster indicator shows the same silhouettes, and every fighter carries its weapon name on a tag above its head — all weapon-identity UI shares one dark-plate style.

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
- **1v1**: the host presses **Start Match** when ready. The opponent slot holds a bot (default **M4**) until a second human queues in and takes it — start early to play the bot, or wait for a player.
- **2v2**: the host presses **Start Match** when ready; empty player slots fill with bots. Up to four humans can play (any split between teams); bots fill any remaining slots.
- **Bot unit selection**: in the lobby, the host can tap any bot slot to pick which unit that bot plays — in Trio, its three units in order (default: three copies of the slot's usual unit). Untouched slots fall back to a per-slot default (2v2 rooms open as M4 / M1014 / PSG1 / evo3). A human joining the slot always overrides the bot.
- **Trio queue room**: every slot's roster is shown in three lines and updates live as picks land.
- **Host migration**: if the host leaves in the lobby or at the end menu, the longest-waiting player is promoted to host (their unit picks carry over; they re-choose mode and map).
- Multi-lobby — when an existing lobby is full or running, new joiners spawn their own lobby and become host.
- Team swap in 2v2: any non-host player can `Join` an empty slot to switch teams (e.g. two humans want to co-op on one side against two bots).

### Random & All Random cards

Both offline and online pickers carry them:

- Every unit grid has a gray **Random** card (question-mark thumbnail): it rolls a unit the roster being built doesn't already contain (different players can still land on the same unit). The map grid's Random skips **Shooting Range** and **Plain Field**.
- Unit grids in a multi-pick flow also carry a golden **All Random** card: one confirm fills every remaining unit slot of the current flow at once and advances it (offline Trio: the rest of your roster, then each bot's as its picks come up; online: the rest of your roster). The map picker deliberately has no All Random.

## Units

Twelve pickable units, near-identical base stats (100 HP, 250 boost, 16 walk, 11.76 sprint base — AA12, RPK and NEGEV walk at 12):

**Weapons:**

| | Mag | Damage | Fire rate | Projectile speed | Lock range (1v1 / 2v2) | Reload |
|---|---|---|---|---|---|---|
| M4 — Assault Rifle | 30 | 4.5 / shot | ~700 RPM | 600 | 56 / 60 | 1.5 s |
| FAMAS — Assault Rifle | 25 | 4 / shot | ~900 RPM | 600 | 56 / 60 | 1.5 s |
| evo3 — Submachine Gun | 30 | 3.5 / shot | ~1100 RPM | 600 | 50 / 55 | 1.5 s |
| P90 — Submachine Gun | 50 | 3.5 / shot | ~900 RPM | 600 | 50 / 55 | 2 s |
| AA12 — Shotgun | 20 | 3 × 8 pellets | ~300 RPM (auto) | 300 | 40 / 50 | 4 s (full drum) |
| M1014 — Shotgun | 7 | 3 × 8 pellets | ~250 RPM (auto) | 300 | 40 / 50 | 1.2 s (auto, per round) |
| RPK — Machine Gun | 100 | 5 / shot | ~600 RPM | 600 | 80 / 65 | 5 s |
| NEGEV — Machine Gun | 100 | 4 / shot | ~1100 RPM | 600 | 80 / 65 | 5 s |
| M14 — Rifle | 20 | 10 / shot | 180 RPM | 600 | 56 / 65 | 1.5 s |
| SVD — Rifle | 10 | 12 / shot | 180 RPM | 600 | 56 / 65 | 1.5 s |
| PSG1 — Sniper Rifle | 5 | 50 / 35 / 20 by range | 60 RPM | 2500 | 120 / 70 | 2.5 s + 1 s charge |
| Railgun — Sniper Rifle | 5 | 30 / beam (charged sweep: 20) | 60 RPM | instant (hitscan) | 120 / 70 | 2.5 s + 1 s charge |

**Theoretical DPS** (every shot landing; cadences are the real 16 ms tick slots, not label RPM):

| Weapon | Real cadence | Dmg/shot | Burst DPS | Sustained (incl. reload) |
|---|---|---|---|---|
| AA12 | 4.8 blasts/s (208 ms) | 24 (8×3, point-blank) | **115.4** | ~60.4 (20-drum + 4 s reload) |
| M1014 | 4.17 blasts/s | 24 (8×3, point-blank) | **100.0** | ~20.0 (shell-regen limited) |
| NEGEV | 15.6/s (64 ms) | 4 | **62.5** | ~35.3 |
| evo3 | 15.6/s (64 ms) | 3.5 | **54.7** | 31.3 |
| FAMAS | 12.5/s (80 ms) | 4 | **50.0** | 29.2 |
| M4 | 10.4/s (96 ms) | 4.5 | **46.9** | 31.5 |
| RPK | 8.9/s (112 ms) | 5 | **44.6** | 31.1 |
| P90 | 12.5/s (80 ms) | 3.5 | **43.8** | 29.6 |
| SVD | 2.98/s (336 ms) | 12 | **35.7** | 26.5 |
| PSG1 | 1 per ~1.5 s (snap cycle) | 50 / 35 / 20 by range | **~33.3** (full-damage snaps) | ~33.3 |
| M14 | 2.98/s (336 ms) | 10 | **29.8** | 25.4 |
| Railgun | 1 per ~1.5 s | 30 quick beam | **~20.0** | ~20.0 |

Reading the DPS table: the shotgun rows are the most theoretical — all 8 pellets only land point-blank. M1014's 7-shell magazine burns in ~1.7 s before per-shell regen throttles the long run; AA12 empties her 20-drum in ~4 s of auto fire and then pays one full 4 s reload. The sniper rows use cycle math (cooldown + floor charge) at full range-tier damage. The tight 43–55 spread across the five mid-table autos (evo3, FAMAS, M4, RPK, P90) is deliberate — fights are decided by accuracy curves, uptime, and positioning rather than raw DPS. The two marksman rifles sit below that band on burst but hold ~24 sustained, close to the autos: their damage arrives in fewer, larger pieces rather than more slowly.

**Handling (stun + spread):**

| | Stun | Spread (SA) | Horizontal spread (HA) | Sure-hit vs standing |
|---|---|---|---|---|
| M4 | 100 ms @ 0.25 | 0.02 | 0.04 | ~53 |
| FAMAS | 100 ms @ 0.25 | 0.02 | 0.04 | ~53 |
| evo3 | 50 ms @ 0.50 | 0.06 | — | ~53 |
| P90 | 50 ms @ 0.50 | 0.02 | 0.04 | ~53 |
| AA12 | 100 ms @ 0.25 | pattern (see below) | — | pattern |
| M1014 | 100 ms @ 0.25 | pattern, 1.4× wide (see below) | — | pattern |
| RPK | 100 ms @ 0.25 | 0.04 | — | ~80 |
| NEGEV | 50 ms @ 0.85 | 0.04 | 0.04 | ~40 |
| M14 | 100 ms @ 0.25 | 0.02 | — | ~160 |
| SVD | 100 ms @ 0.25 | 0.04 | — | ~80 |
| PSG1 | 100 ms @ 0.25 | 0.02 | — | ~160 |
| Railgun | 100 ms @ 0.25 | — (beam) | — | instant |

P90 is the FAMAS's cadence in an SMG chassis: the 80 ms tick slot (12.5 shots/s) at 3.5 damage on a 50-round mag behind a 2 s reload — 4 s of continuous fire (175 damage per mag). She wears the AR spread profile (SA 0.02 + HA 0.04 — sure-hit ~53, the same accuracy family as the M4 and FAMAS) with the SMG's light 50 ms stun: a long-trigger chip gun that trades the ARs' per-shot weight for staying on the trigger twice as long.

**Reading the stun column** (`duration @ move-scale`): every landed hit slows the victim's movement to *move-scale* for *duration* — e.g. `100 ms @ 0.25` means crawling at 25% speed for 100 ms. Each new hit refreshes it; when two stuns compete, the heavier slow (lower scale) wins. **In practice the slow itself is a minor stat**: sprinting pays straight through it (and everyone sprints away from fire anyway, stun or not), while a walking target was already highly hittable — so the currencies that actually decide fights are the damage actually landed and the boost the target burns escaping, not the movement penalty.

**Reading the spread columns:** both are random cone angles in radians. **SA** is a perfectly ROUND random cone (equal scatter in both axes); **HA** adds extra scatter on the *horizontal axis only* — the axis enemies dodge along — so HA is pure anti-dodge coverage with no vertical waste. Total horizontal cone = SA + HA. Since angular error grows with distance, each gun has a **sure-hit range** against a stationary target (≈ 3.2 ÷ (SA + HA)); beyond it, hit chance falls off roughly as sure-hit ÷ distance. Wide-HA guns deliberately trade standing-target accuracy at range for taxing dodgers. The shotguns ignore the cones entirely: their pellets fly a fixed 8-point pattern that opens toward ~5.8 wide over the first 70 units of flight — at lock range it is still a tight ~3.3-wide cluster; M1014's pattern is additionally stretched 1.4× horizontally (details below).

**Preferred engage distance:** every unit's fighting range is its **lock range ± 7** — the band where bots hold position, orbit, and fire (in 1v1: shotgun 33–47, SMGs 43–57, snipers 113–127). One rule for all weapons: retune a lock range and the combat distance follows. **In 2v2 every bot switches to its 2v2 lock value** (the second number in the weapons table): the team's fighting bands compress into 50–70 so long-lock units stop hanging back — and letting a teammate die alone at the front — while short-lock units step up slightly. 1v1 keeps the classic values, and the change is bot-behavior only.

**Simulated hit rates** (Monte-Carlo of the range protocol; every weapon fires from **50 units**; 200,000 shots per cell — shotgun rows show per-pellet rates):

| @50 | Stationary | Walk (16 u/s) | Sprint (27.8 u/s) |
|---|---|---|---|
| M4 | 100% | 64% | 15% |
| FAMAS | 100% | 64% | 15% |
| evo3 | 100% | 61% | 21% |
| P90 | 100% | 63% | 15% |
| AA12 | 71% | 25% | 0% |
| M1014 | 52% | 31% | 2% |
| RPK | 100% | 67% | 9% |
| NEGEV | 98% | 63% | 19% |
| M14 | 100% | 82% | 0% |
| SVD | 100% | 67% | 9% |
| PSG1 | 100% | 100% | 100% |
| Railgun | 100% | 100% | 100% |

*How the simulation works:* the engine's exact fire math (SA sampled as a true round cone, HA as horizontal-only scatter, shotgun volleys carrying the real 8-point pattern with per-blast rotation, 71%-open growth at 50, and M1014's 1.4× stretch) fired against the game's real hit capsule — 3.2 wide, 6.4 tall, with the Railgun beam adding its 1.6 hitbox radius. Lock-fire aims at the target's **current** position, so a moving target displaces by its speed × the projectile's flight time before impact; every shot is a mid-trail, perpendicular engagement (the same strict window the retired physical runs enforced). Earlier physical Shooting Range runs (fired from each gun's own lock range at 100 shots per lane) agreed with the simulation within roughly ±10 points; their score screens have been retired. **Hit-stun is NOT modeled**: every shot is an independent trial against a target that never flinches, so the mover columns are a floor for sustained fire — in real combat a landed hit slows the target and makes the next hit easier, and high-cadence stun guns chain that advantage.

Standouts at the common 50: perpendicular sprint is near-untouchable for ordinary bullets (the flight-time tax), but the snipers break the rule — PSG1's 2500-speed bolt and the Railgun's hitscan beam simply outrun it (100% everywhere). M14's tight no-HA cone makes it the best walker-tracker among ordinary bullets (82%), SVD trades half that cone for punch and lands where the MGs sit (67%), and the shotgun pattern at 50 is ~71% open, so pellet rates are a coverage statement, not a weakness.


Projectiles fly straight (homing is zeroed universally). The targeting reticle is an **enemy-firing indicator**, not a range indicator: green by default, it flashes red while your current target is firing and stays red for the whole time a sniper is mid-charge with you as the target (see the sniper section). Being inside lock range is not signalled to players at all — the number only shapes bot behavior (bots hold their engage band around it). A faint in-lock tracer tint that once keyed to it was removed 2026-08-01.

### AA12 & M1014 — the shotgun blast

- A trigger pull fires **one flying pellet cluster** carrying a fixed 8-point pattern (randomly rotated each shot, so no two blasts look alike while the spacing geometry never clumps). Each pellet keeps its **own hitbox** and dies individually on walls or the target; damage = pellets landed × 3 (all 8 point-blank = 24, both shotguns).
- The pattern leaves the muzzle bunched and grows toward full width (~5.8 across) over the first **70 units** of flight. At lock range (40) it is ~57% open (~3.3 across), so locked-fire blasts land as a concentrated cluster rather than a full spread.
- **AA12's drum:** unlike M1014's per-shell regen, AA12 fires her 20-shell drum full-auto (~4.8 blasts/s) and reloads it in one 4 s stroke — the sustained-pressure half of the pair, walking at the MGs' 12 to pay for it.
- **M1014's wide fan:** her pattern is stretched **1.4× horizontally** after the per-shot rotation — the cloud is 1.4× wider and exactly as tall as AA12's (at lock 40: ~4.6 × 3.3; fully open: ~8.1 × 5.8). More graze coverage along the dodge axis — the dodge-catcher to AA12's concentrated cluster.
- One blast = one simulated/networked object instead of 8 — the wire-cost half of the old online "shotgun lag" fix; the projectile broadphase (see Implementation notes) removed the other half, the dense-map CPU cost.

### M14 & SVD — the marksman rifles

Both fire an ordinary bullet on the same **336 ms cycle (180 RPM)** and hold the same 56 / 65 band, and neither charges — the "Rifle" label is literal, not a softer word for sniper. They split on reach versus punch:

- **M14** — 10 damage on a 20-round mag, SA 0.02, sure-hit ~160. Ten shots to kill leaves ten in reserve, and its tight no-HA cone gives the best walker tracking of any ordinary bullet (82% at 50 units).
- **SVD** — 12 damage on a 10-round mag, SA 0.04, sure-hit ~80. Nine shots to kill leaves exactly **one** spare — able to finish a full-HP target on one magazine, where the retired Laser's 8-bolt mag capped at 96 and always fell four short. Half the reach of the M14 buys a quarter off the kill time.

**Cadence and reload (2026-08-09, was ~250 RPM / 2 s).** These two hold-to-fire like any other single-projectile gun, but at the old 240 ms the cooldown sat *inside* the length of a normal press: a tap unpredictably produced one round or two, which read as the fire rate randomly running fast. 180 RPM puts the real slot at **336 ms** — a press has to run past a third of a second before it doubles, so ordinary taps land one round while a deliberate hold still gives ~3/s. The slower trigger is paid back by a **1.5 s reload**, so the net cost to sustained damage is small (M14 30.5 → 25.4, SVD 28.8 → 26.5) even though burst fell hard. SVD gains more from the shorter reload — its 10-round mag hits the reload twice as often — so it now edges M14 on sustained as well as burst, where before the two were level. The hidden Laser has the same trigger problem but keeps its 250 RPM, so it is instead flagged `semiAuto` and opts out of hold-to-fire entirely — the only unit in the game that does.

Sprinting into a jump **carries the sprint momentum** through the air — a general rule, most visible on these two.

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
- The **dodge** is the counter: a step grants **0.3 s** of i-frame immunity, so a well-timed dodge passes through the shot. PSG1's bullet speed is **2500 u/s** (near-hitscan — only ~0.05 s flight even at max range); Railgun's beam is instant.

### PSG1 — range zones & the lock reticle

- Damage is tiered by distance, **locked at fire time**: under 15 units → **20**, 15–50 → **35**, beyond 50 → **50**. Rushing a sniper is real counterplay; long range stays lethal.
- The lock reticle shows the current zone — plain brackets (<15), **+ cross ticks** (15–50), **+ inner bars** (50+). It appears both when *you* play PSG1 (your tier on the target) and when your lock target *is* a PSG1 (which of her zones you're standing in).
- The reticle turns **red** not just when your target fires, but for the whole time a sniper (PSG1 **or** Railgun) is **mid-charge with you as the target** — a continuous danger signal from glint to shot.

### Railgun — beam & sweep channel

- Fires an instant **hitscan beam** (30 damage, one hit per enemy per beam, blocked by walls, ~0.5 s fade) instead of a bullet. The beam also **deletes projectiles** it touches.
- Holding the charge to the full **1 s** fires a **sweep channel**: a 1 s locked, steerable beam (1.5× width, **20 damage**, one hit per enemy for the whole channel). The stick steers it — horizontal and vertical — at ~10°/s; sprint cancels the channel. The fire cooldown is paused during the channel and starts when it ends.
- Her glint grows toward **2×** size as the charge fills, telegraphing a full-charge sweep.

**Bots vs. the sniper.**
- **As the shooter:** both sniper bots flip a **50/50 coin** per shot — release at the **0.5 s floor** (a fast snap; for Railgun, the quick beam) or hold to the **full 1 s charge** (for Railgun, the sweep channel). No in-between releases.
- **On defense:** when a glint aimed at it appears — from **any** enemy, locked or not (mirroring the human's edge-indicator awareness; earliest active charge wins) — the bot **rolls its reaction per charge**, and the slow roll is charger-aware:
  - **Anti-PSG1** (bullet snipers): **50% at 0.4 s** (i-frames open ahead of the earliest possible cancel, covering **every floor snap at any range** — but a full hold sails in after they end) / **50% at 0.8 s** (deliberately late: a snap lands first and cancels the pending dodge, but the i-frames ~0.8–1.1 s sit exactly on the **full hold's** impact). Against the shooter's 50/50 snap/hold flip neither side can be read; equilibrium **~50% of charges convert** (snaps beat slow rolls, holds beat fast rolls).
  - **Anti-Railgun** (beam snipers): **50% at 0.4 s** (covers the instant quick beam) / **50% at 0.9 s** — the dodge starts just ahead of the **sweep channel's** aimed opening (i-frames ~0.9–1.2 s blanket it) and the follow-up sprint outruns the beam's steering at normal fighting ranges. (An 0.8 s roll would be dead weight here: the quick beam pre-empts it and the sweep outlives it.)

  Either way it's one dodge (0.3 s i-frames) plus a **0.52 s** committed sprint, both perpendicular to that sniper's line of fire; lock and return fire stay on the current target throughout. Mid-charge hits still cancel a pending dodge, and a cooldown- or boost-blocked defender still eats the shot. After the committed sprint expires the bot has no awareness of a still-live sweep — it can wander back into the channel.

**Bot trigger discipline.** A bot fires in continuous bursts of a fixed per-unit length (`botFireCap` — the "fire cap"), resting ~0.8–1.5 s between bursts. Shots inside a burst pace at the weapon's own RPM-derived cooldown, so retuning a fire rate retunes the bot with it. Every auto's cap equals its **full magazine** — an auto bot fires until the mag runs dry and rolls straight into the reload; the shotguns are burst-gated at 4 blasts per pull; the snipers run their charge cycle instead of bursting.

| Weapon | Fire cap | Meaning |
|---|---|---|
| M4 | 30 | full mag |
| FAMAS | 25 | full mag |
| evo3 | 30 | full mag |
| P90 | 50 | full mag |
| M14 | 20 | full mag |
| RPK | 100 | full mag |
| NEGEV | 100 | full mag (~6.4 s of continuous fire) |
| AA12 | 20 | full drum |
| M1014 | 4 | 4 blasts per trigger pull |
| SVD | 10 | full mag |
| PSG1 / Railgun | — | charge cycle, no bursts |

A burst ends early if the mag runs dry (straight into the reload), if line of sight breaks (re-checked every 0.22 s; the burst then restarts from full), or if the target is **spawn-immune** — bots hold fire at immune targets and wake the moment immunity lapses. A bot's OWN spawn immunity does **not** hold its fire: a freshly spawned bot shoots from behind its protection window, same as a player would.

## Bot logic

One bot brain drives every bot — all maps, all modes, offline and online (the offline client and the server run mirrored copies of the same rules; every bot slot in 1v1 / 2v2 / Trio / spectator uses the identical body).

**State machine** — `Defense > Maze > Engage > Pursue`, re-evaluated every tick:

- **Pursue** — closes to (or backs off to) the fighting band, **lock range ± 7**. Sprint spends down to the strategic reserve (250 — a full dodge plus margin always stays banked). Elevation aids: jump up toward a higher target when close, hop off ledges toward a lower one, and on low ground hop onto any mountable ledge it brushes within jump reach.
- **Engage** — the in-band fight: orbits the target with a range correction toward the sweet spot, flips orbit direction to stay inside sight, and runs the peek-cover rhythm (tuck behind cover while the weapon cycles, drift out exactly when it's ready to fire). Two consecutive ticks of driving into a wall also flip the orbit — the tangent is perpendicular to the aim line, so reversing it always points away from the face just hit, and the bot unsticks itself inside the fight instead of breaking off to re-route. Opportunistically hops onto reachable ledges — high ground is the better vantage.
- **Defense** — triggered by a fresh hit: a committed straight cover-sprint (may spend boost to the hard floor — survival overrides the reserve), then a tuck-and-peek once cover breaks line of sight. A jumpable ledge lying **dead ahead** on the committed escape line (within ~37°) is hopped without breaking stride — never while a sniper dodge is scheduled (airborne can't dodge), and funded at raw jump cost (survival funding, like the anti-glint dodge). If the escape wedges anyway, a wider-angle vault, then a direction flip.
- **Maze** — the router. Asks the nav grid for a real walk route (waypoint-followed, cut at the first spot that can already fire) and retries it on every stall signal; when no route exists it keeps moving on a minimal steer biased away from the last spot it got pinned at (a short back-out frees a truly wedged body first). Entered **proactively**: the moment the straight walk toward an out-of-band target is blocked (instantly when sightless; after 0.25 s when the target is visible over a low obstacle), plus the classic stuck detectors (a 1 s wedged/spinning window, a 1.5 s no-progress clock). "Wedged" is judged on **net** movement — under 1.7 units in a second is stuck no matter how much wall the bot rubbed getting nowhere, which is what catches a slow slide along a face rather than only a dead stop.

**Steering** — each tick, a moving bot's direction is the sum of two pulls: "toward where it's going" plus "away from any wall it's about to touch"; the second pull is what makes bots slide around obstacles instead of walking into them. Invisible unit-only fences (the kind bullets fly through) get special sorting by height: a fence low enough to jump (Station's / Flashpoint's 4-high platform edges) gives **no push at all**, so the bot can walk right up to it — the hop itself is then fired by the jump reflexes above (the Pursue/Engage perch jump, or Defense's en-route hop) once the ledge is within jump reach; a fence too tall to jump (Square's 14-high fountain colonnade, the tall panes under Streets' bridge) pushes like any solid wall, since walking into it is pure grinding. And a fence the bot is already standing **above** (crossing the Streets bridge deck over its under-deck panes) pushes nothing — the bot passes over it freely.

**Sight** — a bot "sees" its target only along lines a bullet could actually fly: the sight ray is blocked by every solid obstacle, and (since 0.6.7) by walkable **ramps and elevated decks** too — a ramp is solid fill, so nothing sees through the wedge; a bridge deck on open pillars blocks only rays that cross the deck plane, so two units both *under* the bridge still see each other. Before this, bots kept their locks straight through the Streets bridge slope and stood there firing into it; now losing the line of sight hands them to the router, which walks around.

**Sniper play** — covered in the sniper section above: 50/50 snap-or-hold as the shooter; as the defender, a per-charge dodge roll timed against the charger's kit, one committed perpendicular dodge + sprint.

**Cover reload** — weapons with a manual reload of 3 s or more (AA12, RPK, NEGEV) don't stand in the open through it. When the drum runs dry the bot picks the nearest reachable spot that breaks its target's line of sight — scored to prefer cover it can still fight from — sprints there, and waits out the famine pacing a narrow arc behind the wall rather than standing frozen. It steps back out with 0.4 s left so the magazine fills as it re-enters the fight. Getting shot outranks all of it: Defense takes over and the plan resumes afterwards. Per-shell reloaders (M1014) are excluded by design — they're always mid-reload, so they'd never come out. The counterplay is to push: hiding beats a stationary opponent, not a committed one.

**Shelved: map-specific rules (present but switched off).** A set of Station-only behaviors was built and field-tested — steering pulls toward the platform edges during approach, a "don't linger fighting on the track level" timer that drifted sustained low fights up onto the decks, and an anti-yo-yo hold that kept bots from hopping right back down after mounting. They worked, but repositioning Station's spawn points onto the platforms solved the railway-hugging problem more cleanly, so the whole set is parked behind a single master switch (`STATION_BOT_RULES`, off in both sims) rather than deleted. The bot rules that shipped are therefore **fully map-agnostic**; the switch exists if a map ever needs the special treatment again.

## Controls

| | |
|---|---|
| **Mobile** | On-screen joystick + buttons |
| **PC** | `WASD` move · `J` fire · `K` sprint · `L` dodge · `Space` jump · `U` switch target (2v2) |

Double-tap `K` (or the sprint button) to lock sprint. The lock releases only after the stick/keys stay **neutral for a sustained 0.18 s** — flipping direction through the joystick center (left→right) or swapping movement keys keeps the locked sprint alive; letting go still stops it almost instantly. Dodge (step) grants 0.3 s of damage immunity (i-frames) — the full duration holds even when the dodge runs into a wall (the unit stops at the wall; the animation and i-frames don't cut short).

## HUD & unit displays (0.6.6)

- **Overhead weapon tag + HP bar** above every unit: the tag shows the unit's weapon *silhouette* on a fixed-size plate (white ink for your team, orange for enemies), with its HP bar underneath. Both hold a **constant on-screen size at any distance** (compensated by true view depth, so edge-of-screen tags don't inflate) and show through cover. Your team's stacks ride the head at a fixed screen gap; the **locked** enemy's stack rides just above the crosshair brackets (off-lock enemies use the head rule). In spectator mode the whole scheme is **relative to the watched unit** — its side reads white, its opponents orange.
- **Camera-facing art**: whichever unit the camera rides (your own, or the spectated one) renders its rear-view art with a through-wall X-ray silhouette; every other unit faces the camera. Cycling the spectate TARGET re-skins units live, and the watched unit's corner HP bar carries a **white glow rim** so spectators always know which roster row they're riding.
- **Corner HUD**: each side stacks weapon icons above HP bars, per team member (icons then bar, ally pair below); the in-play weapon renders golden. Online, unit figure colors follow the **server slot** — p1 blue / p2 red / p3 green / p4 orange, identical for every viewer.
- **Profile cards** carry seven live-read stats (Mag / Dmg / RPM / Spd / Reload / Stun / Spread). Tiered damages show all tiers (PSG1 `50/35/20`, Railgun `30/20`, shotguns per-pellet `5 ×8`); speed and stun use tier words (Slow/Normal/Fast/Instant; Heavy/Normal/Light). The **Spread cell is a true simulation**: the ring is a standing target's width at range 60 (shotguns at their lock 40) and the dots are the engine's real fire math — the in-ring fraction lines up with the measured standing hit rates above.

## Maps

Nine arenas: Plain Field, Streets, Factory, Factory 2, Square, Lobby, Station, Flashpoint, Airport. Each has its own cover layout and elevation; Station has raised platforms players jump up onto, and Airport centers on a raised security plateau — glass-fenced rims, four ramp entrances, and a metal-detector checkpoint as the only way across the middle. On Streets, the storefront towers are solid to their full height (they block movement, fire, and bot sight) and their **rooftops are standable** (originally flight-only high ground; with the demo's flight kit removed, no unit reaches them). The offline map list also carries the **Shooting Range** — the no-opponent practice map the hit-rate protocol comes from (target sliders, per-lane score screens); the map Random card never rolls it.

**Spawns:** Station spawns sit in the platforms' far corners (±128, ±112 on the decks — the old track-corridor spawns anchored every fight to the railway axis), and Streets spawns moved from the road ends to the diagonal corners (±118, ±82). Airport spawns sit on the ground at the mouth of a corner ramp (±130, ±56 — ramp feet at |z| 50), close enough that every bot climbs to the security plateau within seconds and the fight happens up top. 2v2 teammates offset along **X** there, as on Station, so both members start side by side at the ramp mouth and equidistant from it; Streets offsets along Z toward the map center (a plain +Z would bury the teammate in the boundary wall). Keeping the pair equidistant is what matters: an offset that leaves one team nearer the objective than the other hands that team the opening and pins the loser on the ground for the match. Streets' four corner smokestacks turn transparent while they block the camera, like the storefronts.

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
- **Universal pathfinder.** Maze is route-first: a nav grid is derived from each map's collision data (4-unit cells, A* plus a firing-position search), with jump-links bridging separated walk islands (e.g. Station's raised platforms) so bots climb instead of grinding walls. The old heuristic wall-following was retired once the grid covered every map; no-route ticks now run a minimal steer with a stuck-memory bias, re-planned on every stall signal. Cells are graded by how much room a body actually has, and A* pays extra to enter a tight one — a cell qualifies as walkable the moment the body just fits, so without that price routes would hug walls with zero margin and the follower's normal drift would rub along them. It's a price, never a ban: a genuinely narrow chokepoint costs more and still gets used. Bots hold a per-weapon range band centered on their lock range (sweet spot ±7) — one rule for every weapon; in 2v2 the band derives from the compressed 2v2 lock value instead (see Weapons).
- **Stamina economy** is shared by humans and bots — same cap (250), drain (1.1/tick), regen (4.59/tick), and empty-recovery lockout. Bot decisions layer a **strategic reserve (250 boost — the full cap)** on top: travel spending (sprint dispatch, pursuit, route jumps) never voluntarily digs below it, so bots only start travel sprints from a topped-up tank. Two survival exemptions spend through the reserve — Defense escapes under live fire (down to the hard floor of 8) and the anti-glint dodge (gated only by the unit's raw step cost — 48 by default; step cost/duration/cooldown/distance are per-unit tunable like the jump family). The reserve is purely a decision threshold; the mechanics underneath stay human-identical.
- **Friendly fire** in 2v2 is off — bullets pass through teammates.
- **Map collision data** for the online server is auto-extracted from offline at build time. Visual mesh is always rendered by the offline arena-build code on the client.
- **Pre-game loading.** Every unit visible in a pick (offline pickers) or in the lobby config (online queue room) starts its sprite-art downloads immediately — menu dead time absorbs the network wait — and GPU uploads are drip-fed one texture per frame. At match load, each Trio slot's 2nd/3rd roster units are additionally pre-built as complete (hidden) mechs, so a mid-match respawn is a pure swap-in: no construction, no decode, no upload during the fight.
- **Projectile broadphase (online sim).** Each map's obstacle boxes are indexed once into a 24-unit ground grid; every tick, each projectile (bullets, sniper rounds, laser bolts, every shotgun pellet) tests only the obstacles near its own flight segment for that tick instead of the whole map. The precise sweep test stays the final authority, so hit results are bit-identical to a full scan (differential-verified on all maps) — but dense maps (Factory: 380 boxes) now cost the same as open ones, which removed the server-side lag during shotgun / high-RPM fights. Railgun's hitscan beams and all non-weapon scans (bot sight, pathfinding, movement) deliberately keep the plain full scan.

## Status

Prototype. Phases 0–4 from `PLAN.md` are landed (boot, sim extraction, naive networking, prediction & interpolation, robustness). 2v2 mode and the Duel / Trio main-mode split (Trio = three-unit stock rosters with in-place respawns) have been added on top of the original 1v1 scope, both offline and online.
