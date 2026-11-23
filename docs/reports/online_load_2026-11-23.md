# Online load: what a match costs the server, and what would make it lighter (2026-11-23)

An assessment made for the user on 2026-11-23, in four answers. Nothing of the game was changed for it: every measure was
made outside the project, on a copy or by reading. **The decision is on hold** (the user, 2026-11-23: "Need time to think.
Hold this up."), so nothing below has been built.

- The four answers as the user read them, in Traditional Chinese: `online_load_2026-11-23_answers_zh.md`.
- Every result file: `online_load_data/` (its README names each).
- The tools, and how to measure again: `shared/tools/online-load/`.

The line measured is `Proto_0.9.9_BA_Finalizing` at `33a1512` (build b1105kl). All times are in milliseconds on one machine
(Intel Xeon 2.1 GHz, 4 cores, Node v22.23.5) unless a table says they are the production servers' own.

## What was asked

1. "is Neon on the heavier stress side in online mode? reply only."
2. "also assess if there's any cheating method we can use to significantly make it smoother in online Neon. assess only."
3. "on a second thought, not only Neon but every online games. Assess only. and my understanding is that a non-free render
   tiec can solve current stress in all online maps, correct? reply only."
4. Quoting one row of the second answer ("BOT 每 3 格想一次 / BOT 運算少 56%，整場降到 74 / BOT 反應最多慢 0.03 秒"):
   "Explain the side effects in plain words."

Then: "Need time to think. Hold this up." and "store these measuring results you gathered from online cost down assessment
along with these suggestions somewhere in 9.0 branch, so we can gather these data easily in the future."

## The short of it

- **The root of the roughness online is the host's free plan, not a map.** A free server may use 100 ms of CPU a second. One
  match, alone on the server, uses 46 to 115 of them under the normal rules. The production servers' own lines show the
  result: in 2v2 with bots, 2 to 28 % of the ticks of a 30 s window are not run (half the windows lose more than 9 %), and
  single stops last up to 0.68 s.
- **Neon is the heaviest map for the server when bots play 2v2**: in the sim alone its tick costs about one and a half to
  two times the next map's; on the whole server, where the snapshots and the sockets cost every map the same, 99 ms a
  second against 93 for Compound. Without bots it is third or fourth of nineteen. The cause is the bots' route searches
  for a place to fire from. It was so before the week's Neon changes (b1105kg to b1105kl).
- **A paid plan answers the normal rules on every map.** The cheapest gives five times the allowance (500 ms a second); the
  heaviest normal match measured uses 115.
- **It does not answer Sudden Death with bots on a big map** (259 to 448 ms a second for one match, and single ticks of 0.09
  to 0.32 s on a machine with no limit at all), **and it does not make the data smaller**: a player of a 2v2 is sent about
  1.5 GB an hour, against 5 GB a month included in the workspace.
- **Shortcuts in the code, measured**: snapshots on every second or third tick (the data halves or thirds; a match of four
  players costs 15 to 20 % less CPU); bots thinking on every third tick (the bots' part falls by 35 to 59 % in most matches
  under the normal rules, with side effects that need care); a slimmer snapshot (over half the data again, little CPU, the
  riskiest); a smaller search budget (no gain).

## Where it stands

On hold, by the user's word. No code of the line and no plan of the host was changed.

What was recommended in the third answer, the widest question and the last word on it:

1. If only the normal rules are played: move the server that is used most to the 0.5 CPU plan. No code changes.
2. With or without that, send fewer snapshots, because of the data: one player of a 2v2 uses the month's 5 GB in a little
   over three hours.
3. Sudden Death with bots is its own piece of work. A 1 CPU plan carries the average, but the single stops come from the
   Sudden Death brain and no plan removes them. No saving for it was found.

And from the second answer, still standing:

4. The first step in the code would be the bots thinking on every third tick together with the snapshots on every second
   or third. Both are universal rules: they touch every map, so they wait for the user's word. (The fourth answer adds
   what such a change must keep on every tick: see the side effects.)
5. The slimmer snapshot is the riskiest and comes after those two, and only if the host's lines still call for it.

## How it was measured

| source | what it is | what it cannot tell |
| --- | --- | --- |
| **the production servers' own lines** | the server prints a line every 30 s while a room is active (the tick's mean cost, the worst tick, the ticks over 16 ms, the late starts, the ticks run). 146 lines of the two servers, 2026-11-16 to 2026-11-22, read from the host's log | the map: the server does not log it. Which window was Neon is not known |
| **the shared sim alone** (`bench.mjs`) | every map, five kinds of match, driven as the server drives a room, the same seeds on every map, 3,000 ticks counted a match after 600 not counted, two rounds | the snapshots, the sockets, the timer |
| **the server itself** (`replica/`) | the line's own server file with timers added, one room, a driver that plays the match over real sockets. Fifty-three matches of 45 to 62 s. The process's CPU in ms a second is the number to hold against the host's allowance | the host's own CPU. See the limits |

The limits, which hold for every number below:

- **The machine is not the host.** Only one comparison was possible: a 1v1 without bots cost 0.28 ms a tick in one window
  of a production server and 0.39 to 0.45 ms in the replica. The two are of the same order, and the numbers are read as if
  the machines were about as fast. That is an assumption.
- **A single match swings by about a fifth.** Neon with three bots, as the server is, four matches of 52 to 62 s: 88.8,
  91.4, 102.8 and 114.8 ms a second (mean 99). A fifth, short one, run with the tools as they are stored here, to see that
  they work from this branch: 102.7. The bots' part of a tick ran from 0.24 to 0.98 ms between 10 s windows.
- In most measured matches nobody could fall (health was topped up), so that a match ran for the whole time.
- The players' input was a random walk with jumps, the sprint and the trigger held by chance. Real players are not that.
- Not measured at all: the frame rate on a player's device, and the players' networks.

## The production servers

Two game servers, `gvg-server-sg` (Singapore) and `gvg-server` (Oregon), both on the host's free plan when they were read
on 2026-11-23: 0.1 CPU, which is 100 ms of CPU a second, and 512 MB.

| the match | 30 s windows | mean ms a tick | worst tick, ms | ticks over 16 ms | late starts | ticks run of about 1,875 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1v1, 0 bot(s) | 6 | 0.28 to 1.06 | 12 to 200 | 0 to 4 | 3 to 17 | 1775 to 1852 |
| 1v1, 1 bot(s) | 22 | 0.02 to 1.89 | 1 to 400 | 0 to 30 | 0 to 44 | 1691 to 1865 |
| 2v2, 2 bot(s) | 18 | 0.31 to 6.15 | 78 to 681 | 3 to 118 | 7 to 122 | 1350 to 1838 |
| 2v2, 3 bot(s) | 35 | 0.27 to 6.80 | 18 to 630 | 2 to 110 | 14 to 123 | 1385 to 1820 |

- "Ticks run": 1,875 would be every tick of 30 s. In 2v2 with bots a window lost 2.0 to 28.0 % of them (the middle window
  9.3 % with two bots, 9.7 % with three); in 1v1, 0.5 to 9.8 %.
- **The worst ticks stand at multiples of 100 ms.** Of the 68 windows whose worst tick was 90 ms or more, 63 had it within
  10 ms of 100, 200, 300 or 400 ms (16, 21, 23 and 11 windows; one each near 500, 600 and 700). That is the mark of a
  process stopped by its host until its next allowance, not of a slow tick. It is read so here; the host was not asked.
- Even a 1v1 without bots was stopped for 0.1 to 0.2 s in three of six windows.

## The sim alone, map by map

What each map holds (the first three decide the cost of a body's tick, the last two the size of the route grid):

| map | boxes | floors | route nodes | jump and drop links |
| --- | ---: | ---: | ---: | ---: |
| compound | 22349 | 16580 | 20011 | 3977 |
| district | 9332 | 8700 | 96931 | 8561 |
| neon | 8224 | 3730 | 20892 | 3507 |
| town | 7714 | 8336 | 15500 | 2980 |
| spacecraft | 3333 | 1780 | 3239 | 118 |
| dust | 1769 | 1463 | 2911 | 538 |
| hospital | 1750 | 694 | 3516 | 219 |
| warehouse | 802 | 676 | 2291 | 382 |
| factory | 404 | 2 | 3229 | 66 |
| factory2 | 323 | 7 | 3191 | 144 |
| arena2 | 168 | 19 | 3190 | 322 |
| lobby | 155 | 2 | 5602 | 210 |
| square | 125 | 0 | 2879 | 16 |
| station | 80 | 2 | 4145 | 80 |
| airport | 73 | 5 | 3486 | 4 |
| backrooms | 73 | 5 | 2296 | 0 |
| backrooms_anomaly | 61 | 9 | 2612 | 3 |
| flashpoint | 55 | 1 | 1867 | 12 |
| arena1 | 4 | 0 | 3600 | 0 |

A tick's mean cost in ms, each kind of match, the maps by the last column's cost (the run whose numbers were given):

| map | 1v1 two players | 1v1 player and bot | 2v2 four players | 2v2 two players two bots | 2v2 player and three bots | of the last: the bots | ticks over 1.6 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neon | 0.029 | 0.080 | 0.055 | 0.399 | 0.565 | 0.494 | 772 of 6000 |
| compound | 0.041 | 0.160 | 0.099 | 0.136 | 0.299 | 0.214 | 106 of 6000 |
| town | 0.035 | 0.082 | 0.086 | 0.220 | 0.293 | 0.221 | 57 of 6000 |
| spacecraft | 0.023 | 0.083 | 0.052 | 0.121 | 0.247 | 0.189 | 60 of 6000 |
| district | 0.015 | 0.084 | 0.023 | 0.142 | 0.197 | 0.159 | 131 of 6000 |
| dust | 0.029 | 0.046 | 0.038 | 0.126 | 0.175 | 0.132 | 33 of 6000 |
| hospital | 0.012 | 0.015 | 0.027 | 0.095 | 0.170 | 0.138 | 88 of 6000 |
| warehouse | 0.008 | 0.034 | 0.024 | 0.105 | 0.120 | 0.097 | 42 of 6000 |
| arena2 | 0.010 | 0.024 | 0.015 | 0.053 | 0.059 | 0.042 | 6 of 6000 |
| factory2 | 0.006 | 0.013 | 0.013 | 0.034 | 0.051 | 0.039 | 10 of 6000 |
| factory | 0.008 | 0.023 | 0.014 | 0.040 | 0.049 | 0.036 | 1 of 6000 |
| backrooms | 0.005 | 0.010 | 0.010 | 0.027 | 0.041 | 0.030 | 9 of 6000 |
| backrooms_anomaly | 0.005 | 0.011 | 0.011 | 0.026 | 0.040 | 0.029 | 1 of 6000 |
| square | 0.006 | 0.010 | 0.010 | 0.035 | 0.037 | 0.027 | 1 of 6000 |
| station | 0.004 | 0.010 | 0.009 | 0.025 | 0.035 | 0.026 | 2 of 6000 |
| flashpoint | 0.005 | 0.011 | 0.009 | 0.027 | 0.035 | 0.025 | 2 of 6000 |
| arena1 | 0.004 | 0.008 | 0.008 | 0.024 | 0.032 | 0.023 | 1 of 6000 |
| lobby | 0.005 | 0.011 | 0.010 | 0.028 | 0.030 | 0.021 | 0 of 6000 |
| airport | 0.006 | 0.012 | 0.011 | 0.024 | 0.030 | 0.022 | 1 of 6000 |

- Neon: fourth of nineteen with two players, third with four players, fifth with a player and a bot, **first in both 2v2
  matches with bots**. In the second run (`online_load_data/sim/all_maps_second_run.json`) it is first in both again
  (0.392 and 0.548); the maps behind it change places.
- Without bots Compound, the map with the most boxes, is the heaviest.
- The absolute numbers are small because this is the sim alone on a fast core. What matters is the order and the ratios.

**Why Neon: the route searches.** A match grants its bots one route search a tick, under a budget of 2 ms
(`server/src/index.js`, `SEARCH_BUDGET_MS`). The share of ticks on which a bot took it, in the first measure
(`online_load_data/sim/search_share_first_measure.txt`):

| map | 1v1, a player and a bot | 2v2, two players and two bots | 2v2, a player and three bots | the bots on such a tick, ms (three bots) |
| --- | ---: | ---: | ---: | ---: |
| neon | 0.4 % | 7.3 % | 15.8 % | 2.13 |
| district | 0.9 % | 1.6 % | 4.0 % | 1.97 |
| spacecraft | 1.9 % | 1.8 % | 2.5 % | 1.31 |
| compound | 1.1 % | 1.6 % | 2.4 % | 1.19 |
| town | 0.8 % | 1.5 % | 1.2 % | 0.81 |

With the players standing still at their spawns it is the same picture (Neon 0.0, 3.4 and 14.0 %; Town 0.7, 1.0, 1.3;
Compound 1.0, 1.5, 1.9), so it is not the players' movement that sets the searches off. Measured again with the stored
tool, every map, the players walking:

| map | 1v1 player and bot: % of ticks with a search | 2v2 two players two bots: % of ticks with a search | 2v2 player and three bots: % of ticks with a search | the bots on a search tick, ms (three bots) | on the other ticks |
| --- | ---: | ---: | ---: | ---: | ---: |
| neon | 0.6 | 7.2 | 9.8 | 2.15 | 0.28 |
| hospital | 0.1 | 1.9 | 4.3 | 1.20 | 0.09 |
| airport | 1.0 | 1.4 | 3.2 | 0.20 | 0.02 |
| warehouse | 1.6 | 2.5 | 3.2 | 0.93 | 0.07 |
| compound | 0.8 | 1.7 | 2.9 | 1.13 | 0.14 |
| district | 0.9 | 1.3 | 2.8 | 1.85 | 0.11 |
| backrooms_anomaly | 0.7 | 1.9 | 2.7 | 0.38 | 0.02 |
| arena1 | 0.0 | 4.1 | 2.6 | 0.24 | 0.01 |
| factory2 | 0.7 | 1.9 | 2.4 | 0.38 | 0.02 |
| dust | 0.8 | 2.0 | 2.4 | 0.82 | 0.09 |
| flashpoint | 1.1 | 1.6 | 2.1 | 0.25 | 0.02 |
| spacecraft | 1.9 | 1.8 | 2.1 | 1.00 | 0.15 |
| station | 0.6 | 1.3 | 1.9 | 0.23 | 0.02 |
| town | 0.9 | 1.9 | 1.9 | 1.06 | 0.17 |
| factory | 0.6 | 1.7 | 1.8 | 0.21 | 0.04 |
| arena2 | 0.8 | 1.6 | 1.8 | 0.28 | 0.03 |
| lobby | 0.1 | 2.2 | 1.8 | 0.38 | 0.02 |
| backrooms | 0.4 | 1.2 | 1.8 | 0.24 | 0.02 |
| square | 0.2 | 0.8 | 1.5 | 0.48 | 0.03 |

and standing:

| map | 1v1 player and bot: % of ticks with a search | 2v2 two players two bots: % of ticks with a search | 2v2 player and three bots: % of ticks with a search | the bots on a search tick, ms (three bots) | on the other ticks |
| --- | ---: | ---: | ---: | ---: | ---: |
| neon | 0.1 | 8.3 | 15.8 | 2.09 | 0.29 |
| compound | 0.8 | 1.6 | 3.2 | 1.83 | 0.20 |
| spacecraft | 0.6 | 2.7 | 2.5 | 1.03 | 0.15 |
| district | 0.2 | 1.4 | 2.4 | 1.79 | 0.10 |
| town | 0.8 | 1.1 | 2.1 | 0.70 | 0.14 |

The share on Neon moves between runs (9.8 to 15.8 % with three bots, 3.4 to 8.3 % with two); it is the highest in every
run, and each search on Neon uses the whole budget.

Where the time goes in a 2v2 with three bots (Node's profiler, 6,000 ticks; shares of the whole run, each including what
it calls):

| | Neon | Town |
| --- | ---: | ---: |
| the bots' thinking (`tickBot`) | 59.0 % | 46.8 % |
| of it, the search for a firing place (`findFiringPath`) | 23.8 % | 5.1 % |
| of it, the sight checks (`botHasLineOfSight`) | 22.0 % | 22.1 % |
| the shared tick (`tickMatch`) | 12.3 % | 19.9 % |

**Not this week's changes.** Town, Neon and Compound on four builds, the mean of a tick in ms:

| map | match | b1105kf | b1105kg | b1105kj | b1105kl |
| --- | --- | ---: | ---: | ---: | ---: |
| town | 1v1 player and bot | 0.074 | 0.073 | 0.074 | 0.072 |
| town | 2v2 two players two bots | 0.190 | 0.185 | 0.237 | 0.208 |
| town | 2v2 player and three bots | 0.254 | 0.230 | 0.213 | 0.229 |
| neon | 1v1 player and bot | 0.081 | 0.058 | 0.047 | 0.049 |
| neon | 2v2 two players two bots | 0.321 | 0.384 | 0.290 | 0.329 |
| neon | 2v2 player and three bots | 0.357 | 0.493 | 0.548 | 0.463 |
| compound | 1v1 player and bot | 0.168 | 0.157 | 0.176 | 0.177 |
| compound | 2v2 two players two bots | 0.163 | 0.145 | 0.185 | 0.206 |
| compound | 2v2 player and three bots | 0.254 | 0.308 | 0.232 | 0.292 |

Neon's two 2v2 numbers with bots were 0.321 and 0.357 on b1105kf, before the ways up were added, already above Town's and
Compound's. With three bots it reads 0.46 to 0.55 after; that difference is inside the swing between runs, and whether the
ways up made it heavier cannot be said.

## The server itself

The process's CPU in ms a second is what the host's allowance is counted in: 100 on the free plan, 500 on the cheapest
paid one, 1,000 on a whole core. One match, the server as it is, the normal rules:

| match | map | CPU ms a second | the bots, ms a tick | the shared tick | snapshots | worst tick, ms | memory, MB | sent to one player | label |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1v1, a player and a bot | compound | 65.9 | 0.227 | 0.142 | 0.271 | 11 | 179 | 62.0/s x 3161 B = 196 kB/s | E_bot_compound |
| 1v1, a player and a bot | neon | 54.7 | 0.163 | 0.088 | 0.261 | 4 | 179 | 61.9/s x 3288 B = 204 kB/s | E_bot_neon |
| 1v1, two players | compound | 55.5 | 0.001 | 0.171 | 0.308 | 9 | 177 | 61.9/s x 3173 B = 196 kB/s | D_2p_compound |
| 1v1, two players | neon | 45.6 | 0.001 | 0.112 | 0.273 | 12 | - | 61.9/s x 3289 B = 204 kB/s | n_1v1_2p |
| 2v2, a player and three bots | neon | 114.8 | 0.839 | 0.169 | 0.349 | 7 | - | 61.8/s x 6963 B = 430 kB/s | n_base_3 |
| 2v2, a player and three bots | neon | 102.8 | 0.639 | 0.169 | 0.335 | 6 | - | 61.9/s x 7063 B = 437 kB/s | n3_first |
| 2v2, a player and three bots | neon | 102.7 | 0.598 | 0.153 | 0.355 | - | 178 | 61.8/s x 6588 B = 407 kB/s | check_neon |
| 2v2, a player and three bots | compound | 93.4 | 0.493 | 0.186 | 0.337 | 14 | 181 | 61.9/s x 6986 B = 432 kB/s | A_compound |
| 2v2, a player and three bots | neon | 91.4 | 0.497 | 0.152 | 0.338 | 8 | - | 61.9/s x 7087 B = 439 kB/s | n3_base |
| 2v2, a player and three bots | neon | 88.8 | 0.432 | 0.134 | 0.353 | 8 | - | 61.9/s x 7000 B = 433 kB/s | n_base_2 |
| 2v2, a player and three bots | spacecraft | 82.9 | 0.337 | 0.149 | 0.349 | 5 | 182 | 61.9/s x 6782 B = 420 kB/s | A_spacecraft |
| 2v2, a player and three bots | dust | 79.0 | 0.294 | 0.131 | 0.343 | 8 | 179 | 61.9/s x 7093 B = 439 kB/s | A_dust |
| 2v2, a player and three bots | airport | 75.4 | 0.186 | 0.098 | 0.373 | 6 | - | 61.9/s x 6845 B = 424 kB/s | a_base |
| 2v2, a player and three bots | district | 75.3 | 0.373 | 0.103 | 0.322 | 16 | 193 | 62.0/s x 6857 B = 425 kB/s | A_district |
| 2v2, a player and three bots | town | 73.1 | 0.294 | 0.129 | 0.329 | 14 | - | 61.9/s x 7322 B = 453 kB/s | town3 |
| 2v2, a player and three bots | warehouse | 72.0 | 0.257 | 0.114 | 0.342 | 7 | 207 | 61.9/s x 6805 B = 421 kB/s | A_warehouse |
| 2v2, a player and three bots | hospital | 71.6 | 0.291 | 0.111 | 0.343 | 5 | 180 | 61.9/s x 6834 B = 423 kB/s | A_hospital |
| 2v2, a player and three bots | factory | 60.9 | 0.162 | 0.078 | 0.342 | 5 | 176 | 61.9/s x 6942 B = 430 kB/s | A_factory |
| 2v2, a player and three bots | airport | 56.5 | 0.151 | 0.077 | 0.300 | 4 | - | 61.9/s x 7004 B = 434 kB/s | airport3 |
| 2v2, four players | compound | 78.6 | 0.001 | 0.274 | 0.518 | 5 | 177 | 61.9/s x 6075 B = 376 kB/s | C_4p_compound |
| 2v2, four players | neon | 67.7 | 0.000 | 0.158 | 0.485 | 3 | 180 | 61.9/s x 6227 B = 385 kB/s | C_4p_neon |
| 2v2, two players and two bots | neon | 95.9 | 0.449 | 0.144 | 0.482 | 8 | - | 61.9/s x 7018 B = 434 kB/s | n_2v2_2p2b |

- By kind of match: two players 46 to 56; a player and a bot 55 to 66; four players 68 to 79; a player and three bots 57
  to 115 (Airport and Factory at the low end, Neon and Compound at the top).
- On the free plan every one of these is half to all of the allowance, with nothing else running.
- The worst single tick in these matches: 3 to 16 ms. Memory: 174 to 234 MB over all matches, of 512.

Where Neon's 99 ms a second go, a match of one player and three bots (the means of the four matches):

| | ms a tick | ms a second |
| --- | ---: | ---: |
| the bots | 0.60 | 38 |
| the snapshots, built and sent | 0.34 | 21 |
| the shared tick | 0.16 | 10 |
| the rest: the sockets, the players' input, the timer, Node itself | | about 30 |

(The second answer's table gave 34, 21, 9 and 30; the four matches' means read a little higher for the bots.)

The snapshots cost more than the shared tick on every map, and with four players (0.49 ms a tick on Neon) they are the
largest single part.

**Sudden Death** is another matter:

| match | map | CPU ms a second | the bots, ms a tick | the shared tick | snapshots | worst tick, ms | memory, MB | sent to one player | label | knobs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2v2, a player and three bots | neon | 447.8 | 6.262 | 0.170 | 0.322 | 153 | 188 | 61.6/s x 5892 B = 363 kB/s | B_sd_neon | - |
| 2v2, a player and three bots | neon | 379.1 | 5.260 | 0.165 | 0.309 | 150 | 184 | 61.7/s x 5777 B = 356 kB/s | S_neon_bot3 | BOT_EVERY=3 |
| 2v2, a player and three bots | neon | 378.9 | 5.295 | 0.133 | 0.308 | 135 | 180 | 61.7/s x 5722 B = 353 kB/s | S_neon_real | - (units can fall) |
| 2v2, a player and three bots | neon | 366.2 | 4.848 | 0.148 | 0.315 | 138 | 207 | 61.6/s x 6244 B = 385 kB/s | S_neon_god2 | - |
| 2v2, two players and two bots | neon | 317.1 | 3.955 | 0.134 | 0.427 | 134 | 200 | 61.5/s x 6254 B = 385 kB/s | S_neon_2p2b | - |
| 2v2, a player and three bots | compound | 286.2 | 3.560 | 0.191 | 0.324 | 174 | 192 | 61.7/s x 6214 B = 383 kB/s | B_sd_compound | - |
| 2v2, a player and three bots | district | 274.7 | 3.358 | 0.113 | 0.313 | 317 | 234 | 61.4/s x 6097 B = 374 kB/s | S_district | - |
| 2v2, a player and three bots | town | 259.2 | 3.181 | 0.130 | 0.317 | 87 | 192 | 61.8/s x 6339 B = 392 kB/s | S_town | - |
| 1v1, a player and a bot | neon | 135.9 | 1.399 | 0.094 | 0.245 | 154 | 185 | 61.7/s x 3074 B = 190 kB/s | S_neon_1v1 | - |
| 2v2, a player and three bots | airport | 103.4 | 0.731 | 0.070 | 0.312 | 7 | 179 | 61.9/s x 6229 B = 386 kB/s | S_airport | - |

- One match of a player and three bots on a big map uses 259 to 448 ms a second: half to nine tenths of the 0.5 CPU plan.
- Single ticks of 87 to 317 ms on this machine, which has no limit. Under the normal rules the worst was 16 ms. A plan
  cannot remove these: they are the Sudden Death brain's own work on one tick.
- Airport, a small map, stays near a normal match (103, worst tick 7 ms).
- Thinking on every third tick changes nothing here (379 against 366 to 448).

## What a player is sent

The server builds both teams' snapshots every tick and sends one to every player, 62 times a second (measured 61.4 to 62.0).

| | bytes a snapshot, as text | a second | an hour |
| --- | ---: | ---: | ---: |
| 1v1 | 3,074 to 3,300 | 190 to 204 kB | about 0.7 GB |
| 2v2 | 5,722 to 7,322 | 353 to 453 kB | 1.3 to 1.6 GB |

One 2v2 snapshot of 6,378 bytes was made of: the four units 5,685, the shots in the air 371, the input acks 34, and some
dozen bytes each of the rest. One unit is 1,199 to 1,891 bytes (`online_load_data/replica/batch0.txt`).

The host counts what a service sends: the workspace's free allowance was 5 GB a month on 2026-11-23, then $0.15 a GB, and
without a payment method the services are stopped until the next month. Four players of a 2v2 are sent about 5.5 GB in
an hour between them.

## The shortcuts

Each was measured with a knob on the measuring server or in the sim. The knobs are measuring devices: none is a finished
change. All the replica's matches with a knob:

| match | map | CPU ms a second | the bots, ms a tick | the shared tick | snapshots | worst tick, ms | memory, MB | sent to one player | label | knobs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2v2, a player and three bots | neon | 100.8 | 0.784 | 0.165 | 0.200 | 7 | - | 30.9/s x 6936 B = 214 kB/s | n3_snap2 | SNAP_EVERY=2 |
| 2v2, a player and three bots | neon | 73.8 | 0.386 | 0.139 | 0.164 | 6 | - | 20.6/s x 7128 B = 147 kB/s | n3_snap3 | SNAP_EVERY=3 |
| 2v2, a player and three bots | neon | 99.9 | 0.639 | 0.180 | 0.353 | 9 | - | 61.9/s x 6935 B = 429 kB/s | n3_bot2 | BOT_EVERY=2 |
| 2v2, a player and three bots | neon | 74.3 | 0.333 | 0.156 | 0.332 | 7 | - | 61.9/s x 7159 B = 443 kB/s | n3_bot3 | BOT_EVERY=3 |
| 2v2, a player and three bots | neon | 90.3 | 0.523 | 0.139 | 0.329 | 11 | - | 61.9/s x 7033 B = 435 kB/s | n3_search1 | SEARCH_MS=1 |
| 2v2, a player and three bots | neon | 61.6 | 0.302 | 0.134 | 0.185 | 10 | - | 30.9/s x 7069 B = 218 kB/s | n3_bot2snap2 | BOT_EVERY=2 SNAP_EVERY=2 |
| 2v2, a player and three bots | neon | 59.1 | 0.243 | 0.144 | 0.128 | 8 | - | 20.6/s x 7021 B = 145 kB/s | n3_all | BOT_EVERY=3 SNAP_EVERY=3 SEARCH_MS=1 |
| 2v2, a player and three bots | airport | 67.0 | 0.166 | 0.089 | 0.339 | 6 | - | 61.8/s x 6817 B = 421 kB/s | a_one | SNAP_ONE=1 |
| 2v2, a player and three bots | airport | 68.9 | 0.172 | 0.092 | 0.347 | 4 | - | 61.9/s x 6905 B = 427 kB/s | a_str | SNAP_STR=1 |
| 2v2, a player and three bots | airport | 67.5 | 0.186 | 0.097 | 0.324 | 24 | - | 61.9/s x 7043 B = 436 kB/s | a_one_str | SNAP_ONE=1 SNAP_STR=1 |
| 2v2, a player and three bots | airport | 61.9 | 0.184 | 0.096 | 0.261 | 12 | - | 61.9/s x 3165 B = 196 kB/s | a_one_str_slim | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 |
| 2v2, a player and three bots | airport | 57.7 | 0.164 | 0.093 | 0.150 | 3 | - | 30.9/s x 3107 B = 96 kB/s | a_slim_every2 | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 |
| 2v2, a player and three bots | airport | 47.9 | 0.124 | 0.087 | 0.144 | 3 | - | 30.9/s x 3046 B = 94 kB/s | a_all | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2 |
| 2v2, a player and three bots | neon | 91.2 | 0.640 | 0.187 | 0.155 | 6 | - | 30.9/s x 3197 B = 99 kB/s | n_all_1 | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2 |
| 2v2, a player and three bots | neon | 87.8 | 0.549 | 0.213 | 0.174 | 12 | - | 30.9/s x 3210 B = 99 kB/s | n_all_2 | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2 |
| 2v2, a player and three bots | neon | 58.4 | 0.240 | 0.158 | 0.110 | 20 | - | 20.6/s x 3213 B = 66 kB/s | n_all3_1 | SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=3 BOT_EVERY=3 |
| 2v2, four players | neon | 57.4 | 0.001 | 0.167 | 0.272 | 12 | 174 | 30.9/s x 6240 B = 193 kB/s | C_4p_neon_snap2 | SNAP_EVERY=2 |
| 2v2, four players | neon | 54.4 | 0.001 | 0.177 | 0.210 | 2 | 176 | 20.6/s x 6246 B = 129 kB/s | C_4p_neon_snap3 | SNAP_EVERY=3 |
| 1v1, two players | neon | 44.2 | 0.001 | 0.103 | 0.174 | 6 | 177 | 30.9/s x 3300 B = 102 kB/s | D_2p_neon_snap2 | SNAP_EVERY=2 |
| 2v2, a player and three bots | neon | 88.6 | 0.612 | 0.193 | 0.194 | 9 | 195 | 30.9/s x 6899 B = 213 kB/s | F_neon | BOT_EVERY=3 SNAP_EVERY=2 |
| 2v2, a player and three bots | compound | 85.8 | 0.453 | 0.263 | 0.204 | 12 | 183 | 30.9/s x 7091 B = 219 kB/s | F_compound | BOT_EVERY=3 SNAP_EVERY=2 |
| 2v2, a player and three bots | town | 57.0 | 0.173 | 0.166 | 0.193 | 7 | 177 | 31.0/s x 7168 B = 222 kB/s | F_town | BOT_EVERY=3 SNAP_EVERY=2 |

### 1. Bots think on every third tick

The bots' turn (`tickBot`, `tickCommandDriver`) runs on every third tick for each bot, the bots staggered so that one
thinks each tick. The physics, the shots, the hits and the players' own input stay on every tick.

The sim, the same seeds, six rounds; the bots' part of a tick and the whole tick, ms:

| map | match | the bots, every tick | the bots, every tick in 3 | change, first to last | the whole tick, every tick | the whole tick, every tick in 3 | change |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| town | 1v1 player and bot | 0.041 | 0.019 | -53 % | 0.069 | 0.045 | -34 % |
| town | 2v2 two players two bots | 0.139 | 0.081 | -42 % | 0.213 | 0.158 | -26 % |
| town | 2v2 player and three bots | 0.175 | 0.103 | -41 % | 0.237 | 0.170 | -28 % |
| neon | 1v1 player and bot | 0.049 | 0.020 | -59 % | 0.069 | 0.039 | -43 % |
| neon | 2v2 two players two bots | 0.245 | 0.103 | -58 % | 0.310 | 0.159 | -49 % |
| neon | 2v2 player and three bots | 0.473 | 0.276 | -42 % | 0.554 | 0.348 | -37 % |
| compound | 1v1 player and bot | 0.109 | 0.071 | -35 % | 0.168 | 0.132 | -21 % |
| compound | 2v2 two players two bots | 0.094 | 0.061 | -35 % | 0.153 | 0.130 | -16 % |
| compound | 2v2 player and three bots | 0.190 | 0.113 | -41 % | 0.260 | 0.194 | -25 % |
| district | 1v1 player and bot | 0.044 | 0.023 | -48 % | 0.055 | 0.036 | -35 % |
| district | 2v2 two players two bots | 0.102 | 0.139 | +37 % | 0.137 | 0.178 | +30 % |
| district | 2v2 player and three bots | 0.158 | 0.140 | -11 % | 0.197 | 0.185 | -6 % |

Four rounds, every second tick as well:

| map | match | the bots, every tick | the bots, every tick in 2 | the bots, every tick in 3 | change, first to last | the whole tick, every tick | the whole tick, every tick in 2 | the whole tick, every tick in 3 | change |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| town | 1v1 player and bot | 0.034 | 0.025 | 0.017 | -50 % | 0.056 | 0.052 | 0.039 | -30 % |
| town | 2v2 two players two bots | 0.132 | 0.102 | 0.070 | -47 % | 0.202 | 0.169 | 0.129 | -36 % |
| town | 2v2 player and three bots | 0.177 | 0.144 | 0.088 | -50 % | 0.242 | 0.215 | 0.148 | -39 % |
| neon | 1v1 player and bot | 0.060 | 0.013 | 0.023 | -62 % | 0.085 | 0.032 | 0.044 | -48 % |
| neon | 2v2 two players two bots | 0.213 | 0.085 | 0.081 | -62 % | 0.275 | 0.141 | 0.132 | -52 % |
| neon | 2v2 player and three bots | 0.416 | 0.378 | 0.181 | -56 % | 0.497 | 0.468 | 0.244 | -51 % |

- The bots' part falls by 35 to 59 % in ten cases of twelve. On District it fell by 11 % with three bots and rose by 37 %
  with two; why was not looked into. The saving is not steady from match to match.
- On the server one match showed 91 to 74 ms a second on Neon (one run each; the swing between runs is as large), and
  the later runs with two knobs together showed Neon 88.6, Compound 85.8, Town 57.0. "A tenth to a fifth of the whole
  match" is the honest reading.
- Every second tick gave nothing with three bots (99.9 against 91.4).
- No effect in Sudden Death.

**The side effects**, checked in the code and measured where it says so:

1. *Reactions 0 to 0.03 s later*: seeing a target, a target going behind cover, dodging a shot, changing target. A
   person reacts in about 0.2 s.
2. *Coarser steering*: the heading is corrected every 0.05 s, about 10 cm more at walking speed before a turn or a stop
   at an edge. Measured on Neon, 450 chases of 25 s: the bot never got to its target in 18 with every tick, 14 with
   every second, 5 with every third. So no worse; why it was better is not known.
3. *The dodge step turns into hops*, unless it is kept on every tick. The step is moved along by the brain
   (`shared/src/sim/nbrain.js`, `host.tickStep()`): 9.2 units over 300 ms is 12 cm a tick, and becomes 37 cm every third
   tick. The body rules (`shared/src/sim/ai.js`, `botBodyRules`: the slowing when hit, standing still to reload) would
   likewise start and end up to 0.03 s late. **A real change keeps these two on every tick** and skips only the deciding.
4. *Some guns change strength*, because a bot can pull the trigger only on a thinking tick: every 0.05 s. A bot's damage
   in 60 s against a body standing still:

   | the bot's gun | every tick | every third | change |
   | --- | ---: | ---: | ---: |
   | SMG, 1,100 a minute (`unit4`) | 1,680 | 1,357 | -19 % |
   | AR, 900 a minute (`unit9`) | 1,529 | 1,471 | -4 % |
   | AR, 700 a minute (`unit1`) | 1,463 | 1,560 | +7 % |
   | MG, 1,250 a minute (`unit5`) | 1,924 | 2,101 | +9 % |
   | SMG, 1,250 a minute (`unit13`) | 1,730 | 1,778 | +3 % |

   A real change would have to let the trigger act on every tick too, or accept this.
5. *Online bots and offline bots differ*: offline the bots run on the player's device and think on every tick.
6. *Command mode's units* go through the same turn and would act on an order up to 0.03 s later.
7. *Not for Sudden Death*: nothing is saved there, and that brain lives by quick dodges.

### 2. Snapshots on every second or third tick

| | as it is | every second tick | every third |
| --- | ---: | ---: | ---: |
| 2v2, four players, Neon: CPU ms a second | 67.7 | 57.4 | 54.4 |
| 1v1, two players, Neon | 45.6 | 44.2 | |
| 2v2, a player and three bots, Neon | 91.4 | 100.8 | 73.8 |
| sent to one player of a 2v2, kB a second | 385 to 439 | 193 to 218 | 129 to 147 |

- The data halves or thirds, exactly. That is the sure gain.
- The CPU saved is the snapshot's part: 15 % of a match of four players at every second tick, 20 % at every third; next to
  nothing in 1v1. In the matches with bots the swing of the bots hides it (100.8 is not a rise: the snapshot's own part
  fell from 0.34 to 0.20 ms a tick in that match).
- **What a real change must do**, none of which the knob does: the sim keeps events for one tick
  (`shared/src/sim/tick.js`, `matchState.events = []`), so the events of the skipped ticks must be gathered and sent with
  the next snapshot; the page moves the other units between two snapshots over one tick's time (`client/src/main.js`,
  the `elapsed / SIM_TICK_RATE_MS` blend) and must be told the new spacing; the input acks ride on the snapshot, so the
  page's own prediction is corrected half or a third as often. The other units are then seen about 0.016 s later at every
  second tick and 0.03 s at every third. Both ends change together.

### 3. A slimmer snapshot

Every unit but the reader's own cut to twenty fields: 6.8 to 3.2 kB a snapshot on Airport and 7.0 to 3.2 on Neon (54 %
less), and the snapshot's part of a tick from 0.37 to 0.26 ms on Airport. Building only the team that somebody reads, and
making the text once, saved little (75 to 67 ms a second, inside the swing). Most of a snapshot's cost is in sending it at all, which is why the rate
matters more than the size for the CPU.

The risk: the page replays its own unit from the snapshot and reads many of the fields; the twenty were a guess. A field
cut that the page reads shows as a unit behaving wrongly in ways that are slow to trace. The riskiest of the shortcuts.

### 4. The search budget at 1 ms

No gain (90.3 against 91.4 ms a second, one match each).

### 5. A paid plan

The host's plans as read on 2026-11-23 (see the sources):

| plan | CPU | CPU a second | memory | a month |
| --- | ---: | ---: | ---: | ---: |
| free | 0.1 | 100 ms | 512 MB | $0 |
| Starter | 0.5 | 500 ms | 512 MB | $7 |
| Standard | 1 | 1,000 ms | 2 GB | $25 |
| Pro | 2 | 2,000 ms | 4 GB | $85 |

- **The normal rules: solved on every map.** A match uses 46 to 115 ms a second, so the 0.5 CPU plan carries four to ten
  at once. A plan is bought for one server; there are two.
- **Sudden Death with bots on a big map: not solved.** 259 to 448 ms a second for one match, and the single stops stay.
- **The data: unchanged.** A plan does not make a snapshot smaller.
- The server ticks all its rooms in one loop on one thread (`server/src/index.js`, `tickAllLobbies`), so more than one
  whole core adds nothing to the tick.

### Neon alone

Its extra cost is the searches for a firing place: 24 % of the run against 5 % on Town. Removing all of that difference
would save an estimated 5 to 8 % of a whole match on the server. That is an estimate, not a measure, and it would not be
enough by itself.

## The player's device

The nine map models (`glb_count.py`), which bear on the frame rate and not on the server:

| model | size | mesh nodes | draws | triangles |
| --- | ---: | ---: | ---: | ---: |
| invasion | 14.1 MB | 52 | 52 | 228,176 |
| spacecraft | 11.8 MB | 121 | 121 | 222,125 |
| compound | 12.3 MB | 116 | 116 | 202,633 |
| warehouse | 12.2 MB | 71 | 71 | 171,356 |
| hospital | 11.5 MB | 90 | 90 | 170,400 |
| district | 4.5 MB | 1,380 | 2,044 | 147,600 |
| neon | 9.9 MB | 333 | 335 | 143,897 |
| dust | 4.3 MB | 9 | 9 | 24,156 |
| backrooms | 4.9 MB | 11 | 11 | 13,763 |

Neon is seventh of nine by triangles and second by draws. No frame rate was measured on a device, and nothing here shows
the roughness to be the picture's.

## Corrected along the way

- The second answer's row for the bots thinking on every third tick named one side effect ("反應最多慢 0.03 秒"). The
  fourth answer gives all seven.
- The same row's "整場降到 74" was one match. The third answer has it as a tenth to a fifth of the whole match.
- The second answer said that a bot's damage does not change in the sim. That was one gun. By gun it changes by -19 %
  to +9 % (the table above).
- The second answer said that 2v2 with bots loses "7 到 28%" of its ticks. The windows read 2.0 to 28.0 %, the middle
  one a little over 9 %.
- The third answer's line on the single stops in Sudden Death did not say on which maps. They were on Town, District,
  Compound and Neon; on Airport there were none (worst tick 7 ms).
- The answers give the slimmer snapshot as 55 % less data; the files read 54 %.

## To measure again

`shared/tools/online-load/README.md` has each tool and the steps. For a later build: run `bench.mjs` on a checkout of it,
make a measuring copy and run `replica/batches.sh` (the patch stops and says so if the server file has moved on), read the
production lines again, and `report_tables.py` prints these tables from the new files.

## Sources

The host's pages, read on 2026-11-23:

- [Render: Compute Plans](https://render.com/docs/compute-plans)
- [Render: Pricing](https://render.com/pricing)
- [Render: Outbound Bandwidth](https://render.com/docs/outbound-bandwidth)
- [Render: Node.js Hosting](https://render.com/hosting/nodejs)
