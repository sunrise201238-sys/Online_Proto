# The New BOT Brain (b1018a – b1019a) — archive branch `Testing_0.9.0_New-BOT-Brain`

**Status: shelved by the owner on 2026-10-17, kept for the record.** The live lines (0.8.8 / 0.8.9)
keep the plain Health Point brain, trimmed (b1018a–c, the first two commits of this branch). The one-brain
version (b1019a, the third commit) is not merged anywhere. The owner's reason: the plain brain is cheap,
predictable and gives players an easy, fun time; the one brain fights from cover, kills in twice the time
and costs five times the CPU. Nothing here is broken — it is a different game.

This branch is 0.8.9 (`Proto_0.8.9_BA_Testing` at f1411c1) with the prototype site's bot work laid on it,
one commit per step, so `git diff HEAD~1` shows each step exactly:

| commit | tag | what |
|---|---|---|
| 1 | b1018a | the plain brain's dead code deleted (behaviour unchanged, tick for tick) |
| 2 | b1018c | one module for both hosts (`nbrain.js`), the client's eye at the body centre |
| 3 | b1019a | one brain for both modes: the Sudden Death brain priced in life, the plain brain gone |

Everything was developed and measured on the prototype site (the offline client, the claude.ai artifact
"GunVS Sudden Death Prototype", versions V161–V164) and the headless shared sim. The game client was never
run by the author; the owner playtested V161–V163.

---

## 1. The principle (b1019a)

One brain, two prices. The Sudden Death brain (`shared/src/sim/sdbrain.js`, b1017h) already is one rule in
four parts — hidden / the price / the plan / the legs (its header explains them). Its price was the chance
of dying in an exposure, which at 1 HP is the chance of being hit. b1019a generalises the unit of the price:

> A hit takes `damage / HP` of a life. At 1 HP that is the whole life and the price is the chance of
> dying, digit for digit the b1017h price. In Health Point mode it is a share of a life, and the unit
> behind on HP pays more per hit than the one ahead. No flag says which mode it is.

Concretely (`sdExposureRisk`, `sdOwnHitChance`, `sdRouteRisk` gained an `hp` parameter):

```
risk  = 1 − Π_k (1 − p_k · min(1, dmg_k / myHP))          the share of MY life an exposure costs
own   = 1 − Π_k (1 − q_k · min(1, myDmg_k / hisHP))       the share of HIS life my rounds take
trade = 1 − (1 − risk)^(1 / own)                          the share of my life spent to take the whole of his
```

A volley gun's hit is its mean pellets on the capsule times a pellet (`sdVolleyHit` returns the landing share
and that mean). The one cap `riskCap = 0.15` keeps its meaning in both modes: "spend at most 15 % of my life to
take all of the enemy's". It was not re-tuned for HP mode (see §7).

The hosts never read the enemy's magazine. They read: own HP, the enemy's current HP (the HUD shows it), the
enemy's weapon damage (weapons are public).

**The hold** (`host.hold`): while a Hide order or a Move order stands, the brain buys nothing — no attacks, no
approach, no relocation — the wait in cover and the escape only. The command driver (`command.js`) walks
the move order's legs after the brain, as before; the brain's reaction (dodge + crossing legs) still wins its
frames (`commandReflexActive`).

**The trigger** is the brain's in both modes: `me.botSDFire` (the unit's own reaction done and its silhouette
in sight) plus a clear line at the grounded muzzle, then rounds at the gun's own cooldown while the trigger
stays open. The bloom gate (`botMayFire` and its unit fields `botGateWidth`, `botSuppressBurst`,
`botFireCap`) is gone: a peek's window is "the first round and the way out", so the rifle's one-round-then-
cover discipline comes from the plan's shape, not from a gate.

**The anti-glint dodge** (the 50/50 per-charge reaction roll against the sniper's 50/50 snap/hold) is kept as
it was, in both modes, in `nbrain.js`. Its 520 ms follow-through is now a named knob (`BOT_GLINT_RUN_MS`) and
a committed sprint the brain pauses for (it used to be the plain brain's Defense state).

## 2. The structure

```
shared/src/sim/sdbrain.js   THE BRAIN: hidden, the price (in life), the plan, the legs; the tape      (~1,070 lines, 44 knobs)
shared/src/sim/nbrain.js    THE TICK around it, shared by both hosts: the charge lock and the beam
                            channel, the anti-glint dodge, the step's lerp, the grounded muzzle, the
                            arena reads, the velocity dispatch of the brain's order, the trigger      (~375 lines, 10 knobs)
shared/src/sim/ai.js        THE SERVER HOST: finds the unit and its target, builds the host views,
                            keeps the server's own pieces (nav-grid cache, 2v2 target pick, per-unit
                            SD overrides, hit-stun slowdown after the brain)                           (~135 lines)
client/src/main.js          THE CLIENT HOST (updateEnemy): the same host over the offline mechs, plus
                            the client's physics epilogue (hover floor, momentum, hit-stun, boost)     (~150 lines)
```

The host interface is documented at the top of `nbrain.js` and `sdbrain.js`. Positions are body centres on
both hosts; the one eye is the muzzle, `muzzleUp` above the body (3.15 online = `PROJECTILE_MUZZLE_Y_OFFSET`;
offline `modelYOffset 2.35 + BOT_MUZZLE_ABOVE_ROOT 0.8`, the same point). Timing: both hosts tick at a
nominal 16 ms (the server's fixed `TICK_RATE_MS`, the client once per rendered frame on the wall clock); the
brain is written in milliseconds, never in tick counts, and the one cadence-dependent thing (the trigger's
"poll next tick") is the host's `tickMs`. The two hosts are not tick-identical and are not meant to be
(different physics engines, frame jitter); equivalence is tested on the server only.

Files touched by b1019a beyond the four above: `bloom.js` (bot gate functions deleted), `constants.js`
(`BOT_GATE_WIDTH_AUTO`, `BOT_SUPPRESS_BURST`, 19 unit fields deleted), `command.js` (reflexes read the
brain's fields; `hideAuto` gone), `state.js` (burst/gate fields gone; snapshot trimming keys on
`botControlled`), `index.js` (exports), and the tests.

## 3. The steps, with their reports

### b1018a — the dead code (commit 1)
*Cause:* code no input could reach. *Deleted:* the Station rules behind `STATION_BOT_RULES` (7 sites, 3 fields),
four unread knobs, the hide stance's `'nearest'` tier branches, the random homing evade (homing is off:
the turn is 0°), both hosts. *Added:* the Health Point equivalence test (`nb_equiv.test.js`) and the frozen
host reference. *Verification:* 12/12 tick-for-tick against the frozen host minus the homing draw; the
96-game probe identical within noise. Knobs 46 → 42 (server), 48 → 44 (client).

### b1018b/c — one module (commit 2)
*Cause:* one brain written twice (server `tickBot` 1,630 lines, client `updateEnemy` 1,770 lines, hand-synced;
of 1,011 normalised lines 844 were identical, the rest host glue and drift — `docs/new-bot-brain/nb_mirror_diff.txt`).
*Deleted:* the client mirror and its helper copies; 44 client knobs → 2 (its root-space eye and muzzle offsets);
the server's `botShotCanLand` (the fire gate uses the same `clear` as the brain). *Added:* `nbrain.js` (the
brain's text moved, not rewritten; every host read behind a host interface), two thin hosts. *Verification:*
12/12 tick-for-tick on the server; the probe's numbers identical to b1018a's (same games). *Client-side
changes that came with one brain:* the hide goal's and firing-point eyes at the live eye's height; avoidance
and the opponent's floor read at the body centre (were the root); the SD jump-link vault at the raw jump cost;
the hide search under the same 4 ms frame budget as the SD search. **b1018c** then set the client's plain-brain
eye to the body centre + 1.6 as online (it had been root + 1.6 = body + 3.95).

### b1019a — one brain (commit 3)
*Cause:* the plain brain had no rule; every decision a threshold or a timer (63 dated patches, 7 random gates,
~60 magic numbers); the only rule in the code base is the price. *Deleted:* `nbrain.js` 2,041 → 375 lines
(the state machine Pursue/Engage/Defense/Maze, the hide stance, the cover hide, the reload hide, three stuck
detectors, Maze and navPlan, the travel sprint latch, the perch jumps, the burst/rest cadence, the bloom gate
branch); the bloom gate and its 19 unit fields; three fighter fields; the `botSD` flag; `hideAuto`;
travel_sprint.test.js, 7 gate tests, 9 command tests of deleted behaviour. *Added:* the `hp` parameter of the
three price functions; the volley's mean pellets; `host.hold`; the dodge run's three fields and
`BOT_GLINT_RUN_MS`. Knobs 88 → 56.
*Verification:* SD unchanged — the b1018c sim against the b1019a sim at 1 HP, 8 scenarios (two with snipers),
every observable field and every `botSD*` field identical tick for tick (`docs/new-bot-brain/sd_proof.mjs`,
result in `sd_proof_result.txt`); 44/44 shared tests on this branch; the hide-order tests pass under the hold.

## 4. Measurements (the probe `docs/new-bot-brain/nb_probe.mjs`, 96 games, HP mode, flashpoint/factory/airport, unit10 vs unit4 and unit1 vs unit5, 8 seeds × 2 seats, 90 s cap)

| | plain brain vs itself (b1018a) | one brain vs the frozen plain brain (b1019a) |
|---|---|---|
| wins | 50 % | 69 % |
| kill time, median | 16.3 s | 30.8 s |
| damage dealt / taken | 0.99 | 1.18 |
| rounds per game | 55 | 64 |
| slow seconds per game | 0.3 of 17 | 1.2 of 31 |
| CPU per bot-tick, mean / p99 | 0.022 / 0.11 ms | 0.107 / 1.95 ms |

One brain, per game: peeks 3.8, engage runs 0.2, reactions 11.7, waits 12.0, dodges 10.5; time: dash 26 %,
wait 20 %, walk 19 %, react 12 %, dodge 10 %, window 3 %. The 11.7 reactions per game say the unit is caught
exposed often against an opponent that hunts; worth watching in any future playtest.

Raw outputs: `nb_baseline.txt` (b1017h vs frozen b1017h), `nb_after.txt` (b1018a), `nb_after_b.txt` (b1018b),
`nb_after_c.txt` (b1019a).

## 5. Findings made on the way (true of the live lines too)

- **Online bots never ran the Sudden Death brain.** Nothing in `server/` or `shared/` ever set the `botSD`
  flag that `tickBot` keyed on; only the tests and the offline client (`state.suddenDeathActive`) did. In the
  live lines the online Duel's bots are plain-brain bots. b1019a removes the flag (one brain), so there the
  question disappears; on 0.8.8/0.8.9 it stands.
- **The two hosts' eyes differed**: the plain brain's sight test ran at body + 1.6 online and root + 1.6
  (= body + 3.95) offline. Fixed in b1018c (the client at body + 1.6). The Sudden Death brain's eye was
  already the same on both (the muzzle).
- **The client mirror had drifted** from the server in small ways (listed in §3, b1018b).
- The prototype site's own copy of `sim.test.js` had two failures (initial HP expected 150, found 100; the
  sniper charge on shootTap) that 0.8.9's copy does not; this branch keeps 0.8.9's. Older than this work.

## 6. How to run

```
cd shared && node --test                       # the shared tests, incl. the two equivalence tests
node docs/new-bot-brain/nb_probe.mjs 8 90      # the probe: this tree vs a frozen opponent (NB_BASE, see the file)
node docs/new-bot-brain/sd_proof.mjs           # the proof: this tree vs an older sim (SD_OLD, see the file)
cd client && npx vite build                    # the client
```

The equivalence tests compare the live brain against frozen copies (`shared/test/*_b1019a_ref.js`); any
change of logic breaks them, which is their purpose. To change the brain on purpose: change it, re-freeze
the references (copy the three files, rewrite the imports as the existing references do), and say so.

The edit scripts that produced each step are in `docs/new-bot-brain/scripts/` (`nb_dead.py`, `nb_module.py`,
`nb_client.py`, `nb_price.py`, `nb_hosts.py`); each asserts every string it replaces occurs exactly once.
`nb_inventory.md` is the line-by-line inventory of the plain brain before the work began.

## 7. Pending — what was designed and not built

1. **The charge as an announced round, the dodge reserved for it.** The brain prices every round in the air
   as an eye; a sniper's charge is a round announced in advance — the brain knows where it will come from
   (the charger) and when (`sniperChargeStartAt` + the charge, or the 50/50 early release). Design: price a
   charge as a round arriving at that moment; while a charge is on the unit, planned exposures are priced
   with no dodge in hand (`as.dodge = false`), so the dodge is there when the glint's roll comes due; the
   roll's 50/50 timing stays as the reaction's guess. Then the separate glint code in `nbrain.js` goes. Not
   measured: how often today's glint roll finds the dodge on cooldown (the brain spends it on peeks).
2. **Orders as the brain's destination (4b).** Today the command driver walks a move order after the brain
   (the brain holds). The structural version: the order point becomes the brain's goal, routed and priced
   like the Approach; a long reload with exposure ahead then waits hidden by the rule, no special case.
   Cost: the driver's travel legs, dash latch and jump bank (`CMD_TRAVEL_*`) fold into the brain's routes.
3. **The cap in Health Point mode.** `riskCap` 0.15 means the same in both modes but was tuned for Sudden
   Death; the probe's 30.8 s median kill time is the result. One number; measure with the probe before
   moving it.
4. The Sudden Death observations listed in the 0.8.8/0.8.9 README ("Open observations") apply to this
   brain unchanged: the reaction priced not ordered, the dodge's side vs the run's side, a gun aimed when it
   has seen the unit, routes re-priced under way, the approach's safest route and the price of waiting, the
   45° lean, the jump that walks the route, the flashpoint dead-end pocket.
