# THE PLAIN BRAIN (Health Point mode) — INVENTORY, 2026-10-17

Read: shared/src/sim/ai.js in full (tickBot 530–2236 and the helpers 24–530); the client mirror (main.js updateEnemy,
1773 lines) compared by banners and normalized code, not read line by line. Nothing run.

## 1. The tick, in order (what the code actually does)

| # | Block | Lines | What it decides |
|---|---|---|---|
| 1 | Early returns | 530–561 | dead, no target, sniper charge lock, beam channel: stand still |
| 2 | Geometry | 563–573 | dist, dir, side (perpendicular) |
| 3 | Anti-sniper glint dodge | 575–664 | per charge a roll: 50% fast (400 ms) / 50% slow (800 ms, 900 vs a beam); step perpendicular to the attacker; then a 520 ms Defense commit |
| 4 | Step lifecycle | 666–678 | the plain bot sits the dodge out |
| 5 | The band | 680–693 | lockRange (lockRange2v2 in 2v2) ± 7; optimal = lockRange; lower ≥ 6 |
| 6 | Grounded sight | 699–735 | eye latched at the last grounded height; LoS, LoS-from-point, walk-toward-clear |
| 7 | Hit evade | 736–745 | a fresh hit → underFire for 350 ms |
| 8 | Clocks | 747–774 | no-LoS clock; progress clock (500 ms window, 3 u; hit-stun excused) |
| 9 | Avoidance, floors | 776–782 | obstacle repulsion (7 u), floor heights, high ground > 1.7 |
| 10 | Hide stance / reload hide / cover hide | 784–1171 | a sub-brain of 390 lines: hidden-from-all tiers, predicted eyes 0.5 s, slip when an enemy closes, pacing legs 2.5 u in a 6 u leash every 350 ms, route follow with a 700 ms bail, a 50/8 sprint latch, no-cover verdicts |
| 11 | Sudden Death brain | 1172–1213 | not the plain brain |
| 12 | Stuck detection | 1214–1267 | 1 s window: wedged (net < 1.7 and path < 12), spinning (path > 12 and net < 4), frozen (net < 0.8); stuck memory 3.5 s / 12 u / 0.7 |
| 13 | navPlan | 1275–1351 | findFiringPath in the band; else findPathOnGrid cut at the first firing sample (6 u samples); smoothPath; paths on matchState._navPaths |
| 14 | Transition by precedence | 1353–1424 | hide/SD park → Defense (underFire or grace) → Maze (stuck, no progress 1.5 s, no LoS 2 s, approach blocked: instant sightless / 250 ms sighted) → Maze latch (released by LoS + (in band or 50 u clear walk on the same floor), or 3 s after a sighted entry) → Engage (in band) → Pursue |
| 15 | Maze re-commit | 1426–1488 | stuck, escape due or 7 s → replan; a frozen bot whose fresh plan retraces the old route backs out 800 ms; no route and stuck → back out 500 ms away from the wall |
| 16 | State entry | 1490–1540 | Maze: navPlan; Engage: orbit sign by a 12 u sight probe (else coin flip); Defense: perpendicular on the orbit sign, flipped if into an obstacle, 1500 ms (stuck) / 600 (sniper) / 350 (hit) |
| 17 | Defense under fire | 1542–1599 | stuck-mode refresh; minimum duration; re-perpendicularize every 400 ms with a range pull ±0.4 |
| 18 | Pursue | 1626–1714 | toward the band or away from it (not when stacked vertically > 2.5); travel sprint latch 250 → 200; climb-aid jump (rise 2.5–4.8, dist < 32, 50%); descent hop off high ground (50%); perch hop onto any ledge (80%); station rules (dead) |
| 19 | Maze | 1715–1863 | arrival in the sweet spot with LoS on the same floor; final-waypoint drop with a replan; path follow (advance 1.5 u, refresh after 1 s when the target moved 12 u); jump links within 7 u; jump bank; statue back-out; minimal fallback with stuck memory; perch jump (no width floor) |
| 20 | Engage | 1864–1961 | orbit; flip when 12 u ahead loses sight and the other way keeps it (1 s cooldown); range pull ±0.5 × 0.12/u; wedge reverse after 2 ticks into a wall; station dwell (dead); perch hop (70%); crawl at 0.15 when an obstacle is near, no LoS and the gun is cycling; never sprints |
| 21 | Defense | 1962–2079 | committed direction, sprint to the floor; in cover: hold 300 ms, peek toward the target until the gun is ready or 1 s, then end; proactive hop onto a ledge dead ahead (survival jump, 60 boost); 2 ticks into a wall → vault, else flip, else wall slide, else bail to Maze |
| 22 | Dispatch | 2082–2138 | sprint floors (Defense / hide 8, travel 200), jump launch, air steer 900 ms, momentum, anti-freeze nudge 4.5 u/s sideways, hit-stun scale, random homing evade (homing is off: dead) |
| 23 | Fire block | 2140–2235 | ammo/reload, target immunity, bloom gate (bloom.js botMayFire, shared with SD), shot-can-land (220 ms poll), sniper 50/50 release, bursts (cap, else mag/2 in 3..20, else 6) with 800–1500 ms rests, capless pacing |

## 2. Numbers

| Item | Count |
|---|---|
| tickBot | 1707 lines (plus 500 of helpers and knobs above it) |
| client mirror updateEnemy | 1773 lines, hand-synced; banners mirrored; 784 of ~1050 normalized code lines identical, the rest naming differences (unverified) |
| knobs (BOT_* constants) | 46 in ai.js (4 unused: FIRE_REACT_MS, DIRE_SEARCH_MS, OBSTACLE_AVOID_WEIGHT, ELEV_STEER_WEIGHT); 48 in main.js |
| bot* fields on the fighter | 72 (22 time stamps) |
| dated comments (one report, one patch) | 63 |
| inline magic numbers (not knobs) | about 60: 12 u probes, 32 u, 50 u, 14 u, 6 u, 3 u, 2 u, 1.5 u, 0.5 u, 7 s, 3 s, 2 s, 1.5 s, 1 s, 800/700/500/400/300/250/220/120 ms, 0.12/u pulls, ±0.4/0.5 clamps, 0.8/0.6/0.3 avoidance blends, 0.15 crawl, 4.5 nudge |
| random gates | 7: jump aids 50% / 50% / 80% / 70%, sniper release 50/50, orbit coin flip, homing evade 10% |
| special cases | 2v2 band (lockRange2v2); snipers (charge lock, beam, glint rolls); shotgun fire cap; vertical stack; station (dead flag) |
| tests | sim.test.js 9, travel_sprint, command; no server/client equivalence test |

## 3. Dead code (delete first)

- `STATION_BOT_RULES = false`: 7 guarded sites, plus the fields botMountHoldUntil, botLowDwellSince, botLowDwellTickAt.
- Four unused knobs (above).
- The random homing evade (`evadeHomingUntil`, dispatch): projectiles fly straight in every line.
- The hide stance's 'nearest' tier: removed by the owner 2026-09-27, three branches still read it.
- Cover Defense: shelved 2026-09-27, no code left (nothing to delete).

## 4. Concepts the rule must carry (what is real, under the patches)

| Concept | Today | Already in the SD brain? |
|---|---|---|
| where to fight from | the band: lock range ± 7 | reach + slack (inReach) |
| seeing | grounded eye LoS to the enemy's eye | 8-point silhouette against every eye |
| being shot at | a fresh hit → Defense 350 ms | the price: streaming / aimed / cold reaction |
| moving under threat | committed perpendicular, re-aimed every 400 ms | the crossing legs, always across the line |
| getting to a firing position | navPlan (firing path, else path cut at sight) + 3 stuck clocks | relocation stages + the approach, priced |
| cover while vulnerable (reload) | the hide stance sub-brain | the wait, the escape, the silhouette test |
| the tank | 250/200 latch, 8 floor for survival | the reserve 86 and the valve |
| ledges and jumps | perch scan + jump links + hops with random gates | jump links on routes |
| snipers | glint rolls, charge lock | a round in the air is an eye (the in-flight eye) |
| orders (move, lock, hide), 2v2 targeting | host inputs, read in the tick | host inputs |
| firing | bloom gate + bursts (bloom.js) | the trigger + the same gate module |

## 5. What is not a rule anywhere: the price

Every decision above is a threshold or a timer. Nothing asks what an exposure costs or buys. That is the SD brain's whole
difference, and the reason its 1,000 lines replaced 3,000.

## 6. Next (approved): baseline probes, then delete the dead code, then one module with an equivalence test, then the price.
