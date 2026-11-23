# The result files of the online load assessment (2026-11-23)

What the tools of `shared/tools/online-load/` wrote, on `Proto_0.9.9_BA_Finalizing` at `33a1512` (build b1105kl), on one
machine (Intel Xeon 2.1 GHz, 4 cores, Node v22.23.5). The account of them is `../online_load_2026-11-23.md`. All times are
that machine's: compare within a file, or between files made in the same sitting.

`python3 -I shared/tools/online-load/report_tables.py docs/reports/online_load_data` prints the report's tables from
these files.

## `sim/`: the shared sim alone (`bench.mjs`)

| file | what it is |
| --- | --- |
| `all_maps_first_run.json`, `.txt` | every map, five kinds of match, 3,000 ticks counted and two rounds: **the numbers given on 2026-11-23**. The `.txt` is the ranking `bench_table.py` makes of it |
| `all_maps_second_run.json`, `.txt`, `_ranked.txt` | the same again, made with the tool as it is stored here. It adds how often a route search ran |
| `players_standing.json`, `.txt` | Town, Neon, Compound, Spacecraft and District with the players standing where they spawn (`STILL=1`) |
| `search_share_first_measure.txt` | the first count of the route searches, walking and standing: the lines the answer of 2026-11-23 was written from |
| `build_b1105kf.json` ... `build_b1105kl.json`, `builds.txt` | Town, Neon and Compound on four builds of the line: before the week's Neon changes (kf) and after each (kg, kj, kl) |
| `bots_every1_four_rounds.json` ... `bots_every3_six_rounds.json`, `bots_every_n.txt` | the bots thinking on every tick, every second and every third, the same seeds: four rounds on Town and Neon, six rounds on Town, Neon, Compound and District |

## `replica/`: the server itself (`replica/`)

| file | what it is |
| --- | --- |
| `batch0.txt` ... `batch4.txt` | the fifty-three measured matches as the runner printed them: the driver's line and the server's `[prof]` lines, a window of 10 s a line. `batch0.txt` also holds what one snapshot is made of |
| `batch5_check_of_the_stored_tools.txt` | one short match more (Neon, a player and three bots, 25 s), run with the tools as they are stored in this branch, to see that they work from here: 102.7 ms a second |
| `server_tick_lines.txt` | the measuring server's own `[tick] 30 s:` lines of each of the fifty-three matches (the worst tick is here) |
| `table.txt` | all of it as a table, a match a line (`replica_table.py`) |

The labels: `n3_...` Neon, 2v2, one player and three bots; `a_...` Airport, the same; `A_...` the other maps, the same;
`C_4p_...` four players; `D_2p_...` two players; `E_bot_...` a player and a bot; `F_...` two knobs together;
`B_sd_...` and `S_...` Sudden Death. `shared/tools/online-load/replica/batches.sh` is the list they were run from.

## `production/`: the production servers' own lines

| file | what it is |
| --- | --- |
| `production_lines.tsv` | 146 lines of the two production servers (both on the host's free plan), 2026-11-16 to 2026-11-22, in time order: each match's start and end, and each `[tick] 30 s:` window with the match it fell in. No map: the server does not log it |

## `side_effects/`: what thinking on every third tick does to a bot

| file | what it is |
| --- | --- |
| `bot_think_damage.txt` | a bot's damage in 60 s against a body that stands still, on every tick and on every third, by the bot's unit |
| `neon_reach_every1.json`, `.txt` | Neon: 150 target places and 3 bot starts, 25 s a run, the bot thinking on every tick: how often it never gets to its target (18 of 450). The `.json` is also the list of starts and places `neon_reach_think.mjs` reads |
| `neon_reach_every2.txt`, `neon_reach_every3.txt` | the same starts and places, the bot thinking on every second tick (14 of 450) and every third (5 of 450) |

## `other/`

| file | what it is |
| --- | --- |
| `profile_neon_2v2_three_bots.txt`, `profile_town_2v2_three_bots.txt` | where the time goes in 6,000 ticks of a 2v2 with three bots, by function (`profile_one.mjs`, `profile_sum.py`) |
| `snapshot_bench.txt` | the snapshot alone, built and turned to text in three ways (`snapshot_bench.mjs`): the run whose numbers were given, and the stored tool's own |
| `map_models.txt` | the nine map models: size, mesh nodes, draws, triangles, materials, textures (`glb_count.py`) |

Not kept: the profiler's own dumps (some megabytes each; `profile_one.mjs` makes them again in a second), the host's raw
log answers and its list of services (they carry the account's ids).
