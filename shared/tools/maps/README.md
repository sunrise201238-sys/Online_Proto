# Map tools (2026-10-19)

The generator itself is one level up: `shared/tools/glb_collision.mjs` (v6). These are the tools around it, kept here
after the session's scratch space was lost to a container restart. Every served model is in `client/public/maps/*.glb`,
every map's data in `shared/src/sim/arena.js` (`GENERATED_ARENA_COLLISION_DATA`, `ARENA_SPAWNS`, `MAP_BOUNDARY`,
`ARENAS`), its name in `shared/src/sim/constants.js` and `client/src/main.js` (`MAP_DATA`, `GLB_MAPS`).

## Reading a model

Run from a scratch directory; `node` 22. `<out>` gets `<key>.json` (the data), `.stats.json`, `.svg`, and with `DUMP=1`
`.cells.json` (every column's reading, plus `tags`: the rule behind each box).

| map | generator |
| --- | --- |
The generator reads a steep face over its whole area, not its edges alone (2026-10-22): a closed gate modelled as one 2 by 2 m quad left the cells between its edges reading floor and top rail, and a body walked through it at the long path's end (x 66..70, z −51.4). The maps' data were regenerated with it: Dust 4,518 → 4,637 boxes, 3,310 → 3,261 floors (the walked region behind that gate no longer reached, 447 walkable points lost there and at a few fences); Town 7,334 → 7,173 boxes (11 walkable points lost at 10 spots); Spacecraft 3,349 → 3,361 boxes (6 points lost); Backrooms unchanged. A thing's lid carries `lid: 1` on its surface.

| Dust | `DUMP=1 SCALE=4 GROUND=83.92 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=5.6 PIT_MAX=5.5 node glb_collision.mjs client/public/maps/dust.glb dust -7.1 106.7 -120.9 56.9 <out>` (the basin by the east wall, x 62..75 z 2..33, slopes 5 m under the street and is walked: read that deep) |
| Town | `DUMP=1 node glb_collision.mjs client/public/maps/invasion.glb town -68 67 -60 40 <out>` (the served copy is the original minus its billboard logo) |
| Spacecraft | `DUMP=1 GROUND=0 EXCLUDE= UNDER_STREET=3 CEIL=1.3 node glb_collision.mjs client/public/maps/spacecraft.glb spacecraft 2 122 -70 0 <out>` |
| Backrooms | `DUMP=1 SCALE=4 GROUND=0 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 CEIL=3.8 node glb_collision.mjs client/public/maps/backrooms.glb backrooms -26.8 28 -27.2 30 <out>` |
| Warehouse | the served model first: `glb_slim.cjs <map_79_void.glb> <slim.glb> [maxPx=1024] [quality=0.8]` (textures to 1024 px, JPEG where opaque, 29.9 → 11.6 MB, the geometry untouched), then `glb_clone.mjs <slim.glb> client/public/maps/warehouse.glb map_1_4 180 10 16 --skip Object_5_85_12 --suffix _copy` (the cluster's 22 objects copied, turned 180° about (5, 8) and set end to end over the original — the user's sketch, 2026-10-22; the ground plane skipped; nodes only, the meshes shared); then `glb_open_ends.mjs <doubled.glb> client/public/maps/warehouse.glb 9,29,31` (the six containers the user marked on the plan, 2026-10-22 — three meshes, each on a container and its copy — opened at both ends into tunnels, their materials double-sided); then `DUMP=1 SCALE=4 GROUND=0 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 node glb_collision.mjs client/public/maps/warehouse.glb warehouse -14 24 -23 39 <out>` |

Edges, voids and pits (2026-10-22, every map's data regenerated; bodies fell into Town's plaza slot and Dust's channel and
ditch walking their rims, and met invisible 25 m pillars): a reached floor cell beside a drop of more than a STEP that no
kerb ramp climbs back gets a GUARD on that edge — a slim box (10 cm, straddling the cell's edge) a step taller than the
floor: a body stops at the edge instead of falling, a jump clears it (the feet rise over its hold), a round and an eye pass
it (`noProjectile`), bots take the ramps. A void region is walled only where it is a body wide (cells whose GROUND_MIN
square is all void, and their square); the slivers hanging off it are gaps, and a gap no floor reaches joins the tallest
thing beside it (they used to be 25 m void walls each — the pillars). An unwalked floor column over the street, however
low, is solid (the sim stands a body on the street wherever no surface covers the point: Dust's retaining-wall top was
walked through at street level). A thing beside a floor under the street stands from that floor (its box went down to the
street only and floated over the yard beside it). `PIT_MAX` (default 3) is how far under
the street a sloping floor is still read. Counts after: Town 7,247 boxes (81 guards), Dust 4,434 (56), Spacecraft 3,298
(2), Backrooms 57 (0); walkable points lost 21 / 27 / 16 / 2 (edge cells), gained 1 / 75 (the basin) / 33 (slots between
hull parts that were void walls) / 0; boxes 1.5 m and taller on 2 m² or less holding no model face: Dust 22 (from 38),
Town 14, Spacecraft 5, the rest on real voids' edges (`phantom_boxes.mjs`).

The street the flood starts from (2026-10-24; a body hopped over the 0.4 m wall beside Town's west pavement ramp and
fell into a 0.9 m slot between the pavement's edge wall and its kerb skin, 2.4 m deep, no way out; the plaza's slot of
2026-10-22 was the same thing and had been lidded by hand): the flood used to start from EVERY street-level floor the
model has, so the plate inside a sealed kerb, the floor of a slot between two walls, the ground of a court no door opens
on all counted as walked — a sealed cavity read as a passage, the slab over it left hollow, its floor cells walked. It now
starts from the one connected street-level floor that is largest and walks everywhere else from there; what it does not
reach is solid by the rules above. The hand lid (`LIDS`) is gone with its one use. Two rules came with it, from what the
filled slot then showed: the GUARD rule reads what a body stands on past an edge by the sim's own box window — a thing
holds the body only while its top is `HOLD` (1.65 units, 0.41 m) or more over the floor, so a lower thing with no top to
stand on (a parapet a hand above the terrace, a filled slot's cap flush with the slab) is walked over onto air, and the
drop beyond it is to whatever lies under the thing (the slab's end over the filled slot read as level ground and a body
walking the slab fell into the slot's boxes); and a thing over columns no body walks stands from the ground (the fence
post's base over the slot floated at 2.65 m and left the slot hollow beneath it). Counts after: Town 7,258 boxes (110
guards), Dust 4,616 (58), Spacecraft 3,329 (6), Backrooms 69, Warehouse 798 unchanged. Floor the generator stopped calling
walked: Town 1,072 m², Dust 851, Spacecraft 145, Backrooms 293 — all of it enclosed (frontiers of walls, buildings and the
crop's edge; `lost_regions2.py`). What a body in the sim can reach from its spawn, walking and jumping (`reach_fill.mjs`),
against the data before: Backrooms and Warehouse unchanged; Town −36 m² (the slot 3.8, the old lid's top 4.9, a hidden
first-floor plate behind the south arcade 15.5, the 0.5 m slot beside the elevated road at x 39..48 z 11 that a 4.8 m drop
filled 2.4, roof slivers) and +11 (the garage ramps' lower reaches, no pit among them); Dust −2 m² (slivers) and +11 (more
of the east basin's floor); Spacecraft −72 m² — the two sunken engine bays at x 17..26 (1.85 m deep, entered by a hop over
their 1.25 m rim, no way out: pits, now solid) — and +3.5. Pits the probe still names, older than this change and unverified
in the client: Town's pocket under the overpass at x 33..48 z −31..−22 (entered off a 0.9 m kerb; the probe's apex test
is binary, so the ceiling there may only look like no way back) and the 1.25 m slot beside the elevated road at x 35.5..36
z −15..8 (a 5 m drop); Spacecraft's room at x 78..90 z −49..−41 (a 0.7 m step down under a low ceiling); Dust's four
terraces at x 65..81 z −61..−28 reached off higher roofs.

The Backrooms model served is the edited one (2026-10-22): the chamber cut at z 21.8, P18 and P19 closed blocks with the
lane between them open at both ends, the lane's walls and the south walls copied from the hall's own walls, the plinth kept
and its dark faces repainted. The recipe is `backrooms_ops.json` for `glb_edit.mjs` over the cut model
(`glb_cut.mjs <in> <out> <node> <zWorld> below|above` first); `glb_pieces.mjs` lists a model's pieces by id for the copy
ops; `glb_zfight.mjs <glb> x0 x1 z0 z1` finds coplanar overlaps; `glb_lum.mjs` / `glb_lumstrip.mjs` sample each face's
texture for dark faces and dark strips; `glb_box.mjs` / `glb_verts.mjs` / `glb_cutinfo.mjs` list faces and vertices in a
box; `glb_read.mjs` is what they share. `glb_open_ends.mjs <in> <out> <meshIds> [band=0.35]` drops the triangles within `band` m of either end
of a mesh's long axis and makes its material double-sided — a closed container prop becomes a tunnel, on every node sharing the mesh.

Then the spawns, in game units (`spawn_set.mjs <tree root> <json> x,z x,z [more...] [--random] [--bounds hx,hz]`; the floor
height is the sim's own at the point (`groundHeightAt`), a point the nav grid does not walk is refused; `--bounds` adds the
arena's boundary walls (MAP_BOUNDARY's halfX, halfZ) as the game does, or the grid ends at the last modelled thing and a
place on the open street beyond it is refused — Warehouse's north-west and east places, 2026-10-22):

| map | places |
| --- | --- |
| Dust | `49,-65 27,228 -42,-18 -25,33 -52,42 21,104 -86,118 104,187 -16,225 69,234 --bounds 227.6,355.6` (the homes, user 2026-10-19; the eight more from the user's marked plan, 2026-10-22; the last was on the south-east roof, 9.9 m up, until the user's green cross of 2026-10-24 moved it 7 m north-west onto the slope below, 3 m under the street — 1 m east of the cross for a 2 m clearance) |
| Town | `-208,10 168,22 -124,-74 116,-78 -104,118 236,122` |
| Spacecraft | `198,-10 -200,-2 85,-20 -75,-11 -121,-3 82,21 -72,31 117,69 51,112 5,115 --random` |
| Backrooms | `-88,-92 84,68 84,-96 -45,-67 -19,-66 37,-20 -87,-6 -64,54 -50,66 -92,79 --bounds 109.6,114.4` (the user's marked plan, 2026-10-22; Backrooms (Anomaly) shares the data) |
| Warehouse | `-58,102 58,-102 18,-81 -46,-46 34,-43 -28,-6 26,3 -36,41 44,42 -20,76 --bounds 76,124` (the homes at two corners of the doubled yard and the user's marked plan, 2026-10-22; the single cluster's ten places went with it) |

The user marks places on a plan: `spawn_plan.cjs <plan.png> <x0> <z0> <pxPerM> <out.png> "P1=x,z;P2=x,z;1=x,z" [title]`
draws the current places and a labelled metre grid on a `cellplan.mjs` plan (the plan's x0, z0 are its window's, px per
metre = 4 × px per cell); `marks_read.cjs <shot.png> <origW> <origH> <margin=56> <pxPerM> <x0> <z0>` reads the user's blue
crosses and red markers off a screenshot of it, in model metres (the plan's frame found as the non-border area; the red
markers' known places check the reading, ±0.5 m); `spot_check.mjs <tree> <json> <cxM> <czM> x,z ...` tells of each spot
the floor the grid walks there and the clear radius around it (a corridor's middle reads 1 m; the two Backrooms corridor
places and Warehouse's pile gap are such). Model metres to units: (x − cx) × 4, (z − cz) × 4.

Town, Spacecraft and Backrooms on this line still carry the data the v5 generator read (2026-10-19, before v6); Dust is v6.

- `glb_rescale.mjs <in> <out> <factor>`: a served copy at another size (a root scale node). Dust's `.glb` is already at
  142.23 m per model unit; it was made from the x40 copy by 3.55575.
- `dust_splice.py <tree> <dust.json> <tag> <ext>`: the one-shot that put Dust into this tree (already applied here).
  `map_splice.py <tree> <key> <Name> <json>` (its docstring names the environment it reads: the name tables' note, the
  data comment's source, the GLB_MAPS row, the README paragraph) puts a new modelled map into a tree: boundary, data and
  spawns in arena.js, the name in both MAP_DATA tables, the row, the README's count and paragraph — Warehouse went in this
  way (2026-10-22); `map_remove.py <tree> <key> <Name> [Count before,Count after]` takes one out again (the single-cluster
  Warehouse and the Yard, when the doubled yard took the name). `nav_corners.mjs <tree> <json>` finds the walkable points nearest a new map's four corners, for a first
  pair of homes. `v6_apply.py <glb_collision.mjs>`: the v6 rules as replacements on the v5 generator (already applied to
  the copy one level up; kept as the record of what changed).

## Looking at a reading

- `cellplan.mjs <cells.json> <out.png> [x0 z0 x1 z1 metres] [px per cell]`: the plan — floors by height, walls black,
  low cover and standable things orange, void dark grey, covered floors stippled, ramps hatched. `MARK="x0,z0,x1,z1;..."` outlines spots in red.
- `data_at.py <out dir> <key> x0 x1 z0 z1 [stride] [zTransect]`: the surfaces, boxes and a cell chart of a window, and a
  transect's every field. `phantom_boxes.mjs <json> <glb> <cxM> <czM> <groundM>`: boxes holding no model face.
- `walk_probe.cjs <client/dist> <map> xM zM cxM czM yawDeg seconds`: the W key held in the built client, the body's
  position and floor sampled (runs the game client — only with the user's leave). `label_plan.cjs`, `clone_cost.cjs`.
- `regions.mjs <tree> <json> <cxM> <czM> [top]`: the walked regions of the nav grid (size, floor range, box).
- `walk_diff.mjs <tree> <a.json> <b.json> <cxM> <czM>`: walkable points lost and gained between two readings.
- `reach_fill.mjs <tree> <map> <cxM> <czM> <x,z[,feetM]|spawn> x0 x1 z0 z1 [cell=0.25] [jumpM=1.4]`: the sim's own
  reach — a flood over cells with the sim's step rule and body test, walking (any drop) and jumping (the body at its apex
  carried up to `JUMP_REACH` 3 m, clear of boxes over every cell on the way) — and its PITS: states the body reaches with no
  path back to the start, as regions with the ways in. `REACHED_OUT=<json>` dumps the reached cells; `reach_diff.py <old>
  <new>` compares two dumps (reach lost and gained, pits). The apex test is binary, so a hop under a low ceiling that would
  still clear a 0.7–0.9 m step in the sim reads as no way back: a pit under a roof or in a low room wants a look before it
  is believed.
- `lost_regions2.py <old cells.json> <new cells.json> [top]`: the floor one reading walked and another does not, each region
  with its frontier classified (walked floor and the step to it, a column with no floor layer and its surfaces, a thing
  standing and its height, floor nobody walks). `cells_png.py <cells.json> <out.png> x0 x1 z0 z1 [px/m] [other cells.json]`
  (pillow): a reading as a picture, the other reading's lost cells magenta and gained cyan.
- `regen_all.sh <tree> <out> [map ...]`: every map's data from the committed generator (`<out>/old`) and the working copy
  (`<out>/new`), with the recipes above, and the stats that differ.
- `dust_frontier.mjs <tree> <json> [cxM czM]`: where two regions nearly meet and the boxes between them.
- `dust_tunnels.mjs <cells.json>`: walked floor under a ceiling, as blobs, with their rims (open / wall).
- `dust_hmap.mjs <cells.json> [m per char] [height|ceil|reach]`: ASCII maps of the columns.
- `boxes_in.mjs <json> <cxM> <czM> x0 z0 x1 z1`: the boxes and surfaces in a window (with their rule tags beside a
  cells dump). `flat_faces.mjs <glb> x0 z0 x1 z1`, `faces_over.mjs <glb> x z`, `glb_materials.mjs <glb>`: the model's
  faces and which way they face, the faces over a point, the double-sided materials.
- The crop centre (cxM, czM) is the generator's: Dust 49.8 -32, Town -0.5 -10, Spacecraft 62 -35, Backrooms 0.6 1.4.

## The built client, headlessly

Both need the global playwright and `/opt/pw-browsers/chromium` (`NODE_PATH=$(npm root -g)`); they run the game client —
only with the user's leave. `hud_probe.cjs <client/dist> <mapKey>`: a 2v2 started on the map, the HUD read, command
mode toggled, the renderer's draw calls. `map_photo.cjs <client/dist> <mapKey> <out.png> [dist yaw height cx cz waitMs]`:
the map card's photo (Dust's: `560 2.4 0.85 0 0 14000`).
`portrait_render.cjs <client tree> <model.glb> <idleClip> <outPrefix> [yaw frame thumbFrac thumbTop]`: a character's profile picture and picker
thumbnail rendered from its model (three.js from the tree's node_modules, the formation idle, yaw 345, a transparent ground) in the
existing set's framing — Rio and Kurumi were made with `Formation_Idle 345 0.6 0.42 -0.10` (user 2026-10-23).

## The PT site from this tree

The PT site is this tree plus `pt_deltas.py <tree> <tag>` (2026-10-21): the served models' extension `.wasm` (the artifact
host serves no `.glb`) and the build tag; the infinite boost (the human's gauge refilled each tick; the offline bots keep their own drain); the collision
view (F8 / `__COLLISION_VIEW()`: the arena as the sim holds it — boxes, floors, the bodies — the model hidden meanwhile);
the map scale test (F7 / `__MAP_SCALE(mPerUnit)`, `__MAP_SCALE_PANEL()`: a modelled map tried at another size, model and
data scaled alike, the match restarted). So: a worktree of this branch, `pt_deltas.py`, copy each `client/public/maps/*.glb`
to `*.wasm`, `npm install`, `cd client && npx vite build`. The page is `dist/index.html` with the built asset names;
publish it to the PT artifact with `assets/index-*.js`, `assets/debugPanel-*.js`, `assets/index-*.css` and whichever
`maps/*.wasm` / `maps/*.png` changed, and null for the assets replaced. On that tree one test fails by design (the
travel sprint latch: no boost drains). The way back (2026-10-22, after the PT tree was edited first for a day):
`pt_inverse.py <pt_deltas.py> <pt tree> <out dir>` undoes every replacement of `pt_deltas.py` on the PT tree's sim files
(the collision view's text in the PT tree may be an older copy, then main.js is reported and left alone) and strips the
switch from constants.js, so those files can be copied into this tree; `port_main.py <pt main.js> <this main.js>` is what
carried the day's main.js changes by their anchors instead (the Warehouse rows, the fade by node, the hull's span rule,
fadeAlpha) — a record of the method, not a tool for the next time. `pt_probe.cjs <client/dist> <mapKey> <mPerUnit>` checks the three hooks headlessly;
`fade_probe.cjs <client/dist> <mapKey> x,z ...` counts what fades around the player at given spots; `fade_hull.cjs <client/dist> <mapKey> <cxM> <czM>` lists every fade thing with its triangles' box in model metres, its source nodes, its triangle count and its hull's size (the Warehouse's 21 objects, 2026-10-22; `fade_things.cjs` converts with Dust's centre); `fade_things.cjs`, `fade_hist.cjs` and `fade_one.cjs <client/dist> <mapKey> [rank]` list the fade's things — the biggest, by size, and one looked into (its columns, cells, rows across); `fade_at.cjs <client/dist> <mapKey> x0 z0 x1 z1` the things with hull columns over a window (metres); `fade_why.cjs <client/dist> <mapKey> x,z` what fades at a spot with the camera's place (the headless camera does not follow a teleported body, so read the camera's place with it); `fade_geo.cjs <client/dist> <mapKey> cx cz radius [dx dy dz]` the game's own line test against the hull on a ring around a spot, the camera at a fixed offset from the player (metres; the classic camera sits about 3 m north and 5 m up).

The fade, map-wide (2026-10-22, after a wall between the camera and the player stayed black, then crate lids blocked the sight): `fade_sweep.mjs <tree> <client/dist> <mapKey> cxM czM [stepU]` puts the camera at the classic offset, turned to four headings, at every standable spot of the arena's floors, and asks of each line to the chest which model faces cross it (flat ones too) and which things' hulls do — a face crossed that belongs to no fading thing is a texture blocking the sight, classed as a post face (narrower than a body both ways: no hull by design), a face in no thing (under the street: never claimed; a low lid), or a face in a thing whose hull the line misses (the bug); and a hull crossed with no face on the line is a fade with nothing in the way (the approach fades). The camera is the classic one: 13 u behind the player away from the enemy, 2 u to the side, 6.8 u over the root (the sweep assumed 5 m up until 2026-10-22, and its earlier numbers were for that camera). Dust, 1,021 lines crossed by a face: 133 show a texture that fades nothing (70 posts, 37 low or under-street faces too short to be things, 26 lids of low boxes); fades with nothing in the way 0 — the hull is the thing's own faces now. A floor is every surface of the arena but a thing's lid — the generator marks a lid (`lid: 1`, a crate's or container's top); a plateau's level floor is a 'flat' surface like a lid, so the type alone is no guide — and the sim's materialised surfaces keep type and lid for this. `fade_view.cjs <client/dist> <mapKey> xM zM cxM czM <out.png> [yawDeg]` is the game's own classic view at a spot with the player put there, with what lies on the camera's line to the chest and which things fade. `load_rounds.cjs <client/dist> <mapKey> [rounds]` starts that many matches in a row and prints, per round, the arena's build time and what the renderer still holds (geometries, textures, programs) with the JS heap: a leak climbs round by round. Each match used to leave its ~750 part geometries on the GPU (the arena's group was removed, its children never disposed) and the map loads slowed over a session, user 2026-10-22; the fade's copies, parts and cloned materials are now the arena's own and go with it — Dust 747 → 751 over four rounds, Town 264 → 262 over three. Textures still climb by one to four a round (another, smaller leak, not this one). `fade_case.mjs <tree> <client/dist> <mapKey> cxM czM xM zM yawDeg group [hxM hzM hyM]` shows one case: the line, the first box it enters, the thing's hull and triangles around the entry (or around a given hit point); `fade_region.mjs <tree> <client/dist> <mapKey> cxM czM x0 x1 z0 z1` what the fade did with the model's triangles in a region, and the seed test's reading of those it left; `fade_empty.cjs <client/dist> <mapKey>` the things with no hull at all; `fade_floors.mjs <tree> <client/dist> <mapKey> cxM czM` the flat faces inside things that overlap a walked surface at their height — floor pieces that would fade with their thing, 0 on Dust; with `BESIDE=<units>` it also counts the pieces within that distance of a walked floor at its height — the ground in the strips along walls and in yards no body walks, taken in as floors when solid lies under them (127 pieces with air under them remain within 3 m: roofs beside floors); `f10_probe.cjs <client/dist> <mapKey> <out.png>` the PT keys F10 (the infinite boost switch: the gauge read while dashing with the switch off and on) and F8, with a screenshot. The tree is the checkout whose arena data the probe reads (the PT worktree).

## Replacing a map's data

`data_splice.py <tree> <key> <json> "<source note>"` replaces the map's entry in `arena.js` and keeps the old one as
`<key>_old.json` beside the new (compare with `regions.mjs` and `walk_diff.mjs`); Backrooms (Anomaly) takes a copy of
Backrooms' json. The spawn lines are not touched: set them by hand when the places change.

**Hand edits in the shipped data** (each sits under a `//` line in `arena.js` that says what and why; a regeneration overwrites
them, so they are re-applied after one — the user picked each spot in the game with the PT site's collision inspector,
2026-10-24): Dust — the guard along the deck's north edge at model x 38.15..41.4, z −16.4 lowered to the deck's top (a body
walks off the 3.2 m drop there); a 13 m "invisible pillar" at x 64.4..64.9, z −35.65..−34.4 and an 11.5 m one at x 72.9..73.4,
z −30.4..−30.15 removed (the generator read something; nothing is seen in the game) — the first one's slot, between the deck's
parapet and a 4.2 m thing, is a shelf at the deck's height (a body jumping the parapet fell to the street in it), the second
one's seam is crate-high and solid and its crate stack has a floor on its top (a body came down the seam); the thin slot at x 63.65..64.4,
z −1.4..1.85 filled solid and the 1.3 m crate east of it given a floor on its top (a body jumped over the crate into the slot
and the push-out parked it inside the wall); the pocket among the crates at x 72.4..74.17, z −29.65..−27.9 filled to the
crates' 3 m (entered over its 1.4 m south lip); the 1.8 m ledge beside the deck at x 73.9..74.9, z 18.85..31.85 given a floor
on its top (three 1.8 m things the generator left topless, so a body slid off them).
