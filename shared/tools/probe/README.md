# Probes: the headless harness the bot and map work was measured with

Each script runs the shared sim in Node, with no browser, against any checkout: `<tree root>` is the path to that checkout
(this one, the 0.8.9 worktree, a PT rebuild), and the script imports its `shared/src/sim/`. Node 22. Points are given in the
served model's metres unless a script says units; arena x = m·4, z = (m − cz)·4, and Compound's cz is 1.34.

The two that draw (`frame_probe.cjs`, `glb_topdown.cjs`) use Playwright's Chromium and global `three`:
`NODE_PATH=$(npm root -g) node …`. Nothing here starts the game client's gameplay for a user; `frame_probe` opens the built
client headless to time frames and was run with the user's leave.

## Cost

- `tickspikes.mjs <tree root> <seconds> <map>…` — bot cost per tick on a two-bot match: mean ms, ticks over 4/8/16 ms, worst.
  The Compound perch-search change (b1024z15) was measured with it: 0.65 → 0.29 ms mean.
- `tickcost.mjs <tree root> <seconds> <map>…` — the same with the nav grid's build time, and tickMatch separated from tickBot.
- `frame_probe.cjs <client/dist> <map>…` — frame intervals of the built client, software GL, an offline match on each map.
- `glb_stats.cjs <file.glb>…` — meshes, triangles, materials, textures of a model.
- `tex_stats.cjs <file.glb>…` — each texture's pixel size and the decoded bytes they add up to.

## Bots, watched

- `botmatch3.mjs <tree root> <seconds> [seed]` — Station: platform leaves counted once each, split into crossings and same-side returns.
- `stuckmatch.mjs <tree root> <seconds> [seed]` — Station: ticks a bot stands pressed still in the trench while being shot at, with its state.
- `dropdiag.mjs <tree root> <seconds> [seed]` — Station: what a bot was doing the tick it left a platform.
- `beltmatch.mjs <tree root> <seconds> [seed]` — Factory: belt crossings and time spent on a belt top.
- `hop_sim.mjs <tree root> <mapKey> <cxM> <czM> xM,zM dirX,dirZ [jumpAtS] [sprint] [seconds] [--data] [--release s]` — one hop,
  tick by tick: feet height and the floor under them every 50 ms, and where the body rests.

## Walking the map

- `walkprobe.mjs <tree root> <map> x,z,feetM moveX,moveZ <seconds>` — a body walked by the real sim, logged every few ticks.
- `holescan.mjs <tree root> <map> x0 x1 z0 z1 feetM step` — where a walking body finds no floor under its centre, on a fine grid.
- `sim_probe.mjs <tree root> <generator json> <feetM> x,z…` — the floor under a body set down at a point, and the boxes in its way.

## The nav grid

`<navgrid module>` is a path to a `navgrid.js`, normally the tree's own `shared/src/sim/navgrid.js`; the b1024z8 experiment
variants it was written for (snapped nodes, 16/24/32-sample fits) were scratch files and are not kept — the snapped one shipped.

- `navcheck.mjs <tree root> <map>` — walkable cells, and a path from the first home to every other spawn place.
- `navprobe.mjs <tree root> <map> "sx,sz[,floorM]"… -- "tx,tz[,floorM]"…` — the grid at given points, and paths between them.
- `navprobe3.mjs <tree root> <map> x,z,floorM…` — why a cell is or is not walkable at a floor.
- `navexp.mjs <tree root> <map> <navgrid module> x,z,floorM…` — a grid variant: area, build time, paths, a plan of one level.
- `navarea.mjs <tree root> <navgrid module> <map>…` — walkable area per map under a variant.
- `navtime.mjs <tree root> <map> <navgrid module>…` — build time per variant.
- `navroutes.mjs <tree root> <modA> <modB> <map>…` — route node counts, two variants side by side.
- `navlen.mjs <tree root> <modA> <modB> <map>…` — route lengths in units walked, two variants side by side.
- `navdiff.mjs <tree root> <map> <modA> <modB> [planAt]` — the nodes B adds over A, by floor, and how many sit inside a box.
- `navjumps.mjs <tree root> <map> <navgrid module> [filter]` — the jump links: count, and both ends' positions and floors.

## Plans

- `glb_topdown.cjs <file.glb> <out.png> [pxPerM=8] [gridM=20] [x0 x1 z0 z1]` — the model photographed straight down with a metre
  grid, for the user to mark spawn places on; `shared/tools/maps/spawn_plan.cjs` then draws the places back onto it.
