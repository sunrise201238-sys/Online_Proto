# Online load: what a match costs the server (2026-11-23)

The tools behind the assessment of 2026-11-23: how heavy each map and each kind of match is for the game server, where the
time goes, and what each shortcut would save. The record, with every table and the answers given, is
`docs/reports/online_load_2026-11-23.md`; the result files are in `docs/reports/online_load_data/`.

Nothing here changes the line. Every tool reads a checkout of the line that is named on its command line (below:
`<line>`), and the one tool that edits a file, `replica/patch_srv.py`, is for a copy made outside the repository. The
numbers were made on `Proto_0.9.9_BA_Finalizing` at `33a1512` (build b1105kl).

Three things to know before reading a number made with these:

- **They are times on the machine that ran them.** Compare maps, kinds of match and knobs with each other, on one machine,
  in one sitting. The machine of 2026-11-23: Intel Xeon 2.1 GHz, 4 cores, Node v22.23.5.
- **A single match swings.** The same match run again differs by about a fifth; on Neon the bots' part of a tick ran from
  0.24 to 0.98 ms between 10 s windows. Run a thing several times before believing a difference under that size.
  `bench.mjs` uses the same seeds on every map and takes a number of rounds for this reason.
- **One thing at a time.** Nothing else heavy on the machine while one of these runs, and never two of them together.

## The tools

| file | what it does | how it is run |
| --- | --- | --- |
| `bench.mjs` | **the shared sim alone, every map.** Five matches a map (1v1 two players; 1v1 a player and a bot; 2v2 four players; 2v2 two players and two bots; 2v2 a player and three bots), driven as the server drives a room: the bots think first, in a turning order, under the route search's budget, then the shared tick. Gives a tick's mean cost, the bots' part, the tick under which 99 in 100 fall, the worst, the ticks over 1.6 ms, and how often a route search ran | `node bench.mjs <line> [ticks=3000] [rounds=2] [out.json]`; `MAPS=neon,town` for some maps; `BOT_EVERY=3` a bot thinks on every third tick; `SEARCH_MS=1` the search budget; `STILL=1` the players stand where they spawn |
| `bench_table.py` | what `bench.mjs` wrote, ranked by each kind of match | `python3 -I bench_table.py <bench.json>` |
| `profile_one.mjs`, `profile_sum.py` | **where the time goes**: one 2v2 match with three bots under Node's profiler, then the time by function and under a few named functions (`tickBot`, `findFiringPath`, `botHasLineOfSight`, `tickMatch`, ...) | `node --cpu-prof --cpu-prof-dir=<empty dir> profile_one.mjs <line> <map> [ticks=6000]`, then `python3 -I profile_sum.py <that dir> [top=16]` |
| `snapshot_bench.mjs` | **the snapshot alone**: built and turned to text each tick in three ways (as now; the reader's team alone built; the other units cut to twenty fields), each timed and sized | `node snapshot_bench.mjs <line> <map>` |
| `replica/` | **the repo's own server, measured**: see below | |
| `bot_think_damage.mjs` | **what thinking less often does to a bot's gun**: a bot on Neon against a body that stands still, 60 s a run, the damage done | `THINK_EVERY=3 BOT_UNIT=unit4 node bot_think_damage.mjs <line> <B or D> [runs=10] [seconds=60]` |
| `neon_reach_think.mjs` | **whether a bot that thinks less often still gets to its target**: Neon, every bot start and target place of an earlier scan, run again | `THINK_EVERY=3 node neon_reach_think.mjs <line> <an earlier scan's .json> <seconds> <out.json>`; the scan of the line at `33a1512` is `docs/reports/online_load_data/side_effects/neon_reach_every1.json` |
| `glb_count.py` | a map model's size, mesh nodes, draws, triangles, materials and textures (the player's device, not the server) | `python3 -I glb_count.py <file.glb>...` |
| `render_tick_lines.sh`, `production_lines.py` | **the production servers' own lines**: the host's log is asked for the server's `[tick] 30 s:` lines and its match lines, and they are put in time order and summed up by the kind of match | see "The production servers' lines" below |
| `report_tables.py` | the report's tables as Markdown, from a folder of results laid out as `docs/reports/online_load_data/` is | `python3 -I report_tables.py <data dir>` |

`bench.mjs`, `profile_one.mjs` and `snapshot_bench.mjs` read the line's `shared/src/sim/` and its
`shared/tools/maps/arena_files.mjs`, and take the route grids from `client/public/maps/` where a map has a grid file.
They need no `node_modules`.

## The replica: the server itself, with timers

`bench.mjs` leaves out everything a real server does around the sim: building and sending the snapshots, taking the
players' input frames, socket.io, the timer. The replica runs the line's own `server/src/index.js` with a patch that adds
timers and knobs, and a driver that plays a match against it over real sockets.

| file | what it does |
| --- | --- |
| `replica/patch_srv.py` | adds to a **copy** of the line's `server/src/index.js`: a `[prof]` line every 10 s (a tick's three parts in ms: the bots, the shared tick, the snapshots; the process's CPU in ms a second; ticks over 16 ms; memory), and the knobs below. Written against the file at `33a1512`: every piece it replaces must be found exactly once, so on a later server it stops and names the piece it missed |
| `replica/drive.mjs` | `node drive.mjs <port> <map> <1v1 or 2v2> <players> <seconds>`: that many players join one room, the first sets the mode and the map and starts, the empty seats are bots, and each sends a random walk of input frames 62 times a second. Counts and sizes the snapshots that come back. `SD=1` asks for Sudden Death; `DUMP=1` prints what one snapshot is made of |
| `replica/run_one.sh` | one measured match: starts the measuring server on port 3055 with the knobs, runs the driver, stops the server, prints the driver's line and the server's `[prof]` and `[tick]` lines. `SRV=<copy> run_one.sh <label> <map> <1v1 or 2v2> <players> <seconds> [KNOB=value ...]` |
| `replica/batches.sh` | the fifty-three matches of 2026-11-23, as they were run (about fifty minutes) |
| `replica/replica_table.py` | the batches' output as a table, a match a line |

The knobs, set in the environment of the measuring server (`run_one.sh` passes them on):

| knob | what it does |
| --- | --- |
| `GOD=1` | every unit's health is topped up each tick, so nobody falls and the match runs for the whole time |
| `BOT_EVERY=n` | a bot's whole turn (its target, `tickBot`, `tickCommandDriver`) runs on every n-th tick alone, the bots staggered by seat |
| `SNAP_EVERY=n` | the snapshots are built and sent on every n-th tick alone |
| `SEARCH_MS=n` | the route search's budget a tick (the server's `SEARCH_BUDGET_MS`, 2) |
| `SNAP_ONE=1` | a team's snapshot is built only when somebody reads it (the server builds both teams' every tick) |
| `SNAP_SLIM=1` | every unit but the reader's own is cut to twenty fields before it is sent (a guess at what a picture of it needs) |
| `SNAP_STR=1` | the snapshot is sent as text made once, rather than handed to socket.io as an object |

**The knobs are measuring devices, not finished changes.** `SNAP_EVERY` drops the events of the ticks it skips (the sim
keeps events for one tick) and the page is not told the new spacing; `SNAP_SLIM` sends a page less than its prediction
reads; `BOT_EVERY` skips the part of a bot's turn that moves its dodge step along. A match played by a person against the
measuring server would look wrong. What a real change would have to keep is in the report, under each shortcut.

### To make the measuring copy and run it

```
mkdir <copy> && git -C <line> archive <commit> | tar -x -C <copy>      # a plain copy: no branch, no worktree, nothing to clean in git
ln -s <line>/node_modules <copy>/node_modules
python3 -I shared/tools/online-load/replica/patch_srv.py <copy>/server/src/index.js
SRV=<copy> shared/tools/online-load/replica/run_one.sh try neon 2v2 1 45 GOD=1
SRV=<copy> shared/tools/online-load/replica/batches.sh > batches.txt
python3 -I shared/tools/online-load/replica/replica_table.py batches.txt
```

- **Which shared code runs.** The server reads the sim through `node_modules/@gvg/shared`, a link into the checkout the
  `node_modules` folder belongs to. With a borrowed `node_modules` the copy's server file runs that checkout's
  `shared/`, not the copy's. Keep `<line>` at the commit the copy was made of, or run `npm install` in the copy.
- **The driver's one dependency.** `drive.mjs` imports `socket.io-client` and Node looks for it in a `node_modules`
  above the file: run `npm install` at this branch's root (the branch carries the game's package files), or put a
  link named `node_modules` at this branch's root to a line checkout's. Such a link shows as untracked (`.gitignore`
  names the folder, not a link): take it away after, never add it.
- **A left-over server.** `run_one.sh` refuses to start while a `node src/index.js` runs. `pgrep -f "node src/index.js"`
  shows it. The first `[prof]` window of a match holds the start and is left out of the means.
- A match of 45 to 62 s gives three to five windows. The measuring server warms every map's route grid before it
  takes a room (a few seconds; the runner waits for it).

## The production servers' lines

The server prints its own count every 30 s while a room is active (`server/src/index.js`, the `[tick] 30 s:` line): the
mean cost of a tick, the worst tick, the ticks over 16 ms, the late starts and the ticks run (1,875 would be all of
them). On the host these are the only measure of what players get. The map is not in these lines or in the match
lines, so a window cannot be given to a map.

```
render_tick_lines.sh <owner id> <service id> 2026-11-15T00:00:00Z 2026-11-23T23:59:00Z out/sg
render_tick_lines.sh <owner id> <other service id> 2026-11-15T00:00:00Z 2026-11-23T23:59:00Z out/us
python3 -I production_lines.py out/production_lines.tsv singapore=out/sg oregon=out/us
```

- The ids are read from the host's API (`GET https://api.render.com/v1/services`: each service names its id and its
  owner's). They are not kept in this branch, and neither are the raw log files.
- **The key is never written into a file, a command line that is kept, or a message.** `render_tick_lines.sh` sends
  `RENDER_API_KEY` from the environment when it is set. In the cloud session of 2026-11-23 it was not set at all: the
  key was a network secret of the session's environment for `api.render.com`, added to the request by the network, and
  no tool saw it.
- A request returns a hundred lines at most, the newest first. For a longer stretch, ask again with an earlier end.

## What was found, in one paragraph

On the free plan a server may use 100 ms of CPU a second, and one match uses 46 to 115 of them, so a single room is
enough to be stopped by the host for a tenth of a second at a time. Neon is the heaviest map when bots play 2v2,
because of the bots' searches for a firing place. Sudden Death with bots on a big map costs three to five times a
normal match. The full account, the shortcuts with what each saves and costs, and what was recommended are in the
report.
