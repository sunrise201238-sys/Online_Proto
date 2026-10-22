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
| Dust | `DUMP=1 SCALE=4 GROUND=83.92 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=3.6 node glb_collision.mjs client/public/maps/dust.glb dust -7.1 106.7 -120.9 56.9 <out>` |
| Town | `DUMP=1 node glb_collision.mjs client/public/maps/invasion.glb town -68 67 -60 40 <out>` (the served copy is the original minus its billboard logo) |
| Spacecraft | `DUMP=1 GROUND=0 EXCLUDE= UNDER_STREET=3 CEIL=1.3 node glb_collision.mjs client/public/maps/spacecraft.glb spacecraft 2 122 -70 0 <out>` |
| Backrooms | `DUMP=1 SCALE=4 GROUND=0 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 CEIL=3.8 node glb_collision.mjs client/public/maps/backrooms.glb backrooms -26.8 28 -27.2 30 <out>` |

Then the spawns, in game units (`spawn_set.mjs <tree root> <json> x,z x,z [more...] [--random]`; the floor height is
read off the nav grid, a point off it is refused):

| map | places |
| --- | --- |
| Dust | `49,-65 27,228 -52,-5 103,33 -50,102 21,105 -15,174 102,189` (the user's marks, 2026-10-19: the homes at the long path's gate and the lower yard's south end, six more) |
| Town | `-208,10 168,22 -124,-74 116,-78 -104,118 236,122` |
| Spacecraft | `198,-10 -200,-2 85,-20 -75,-11 -121,-3 82,21 -72,31 117,69 51,112 5,115 --random` |
| Backrooms | `-88,-92 84,68 21,-64 -90,38 --random` (Backrooms (Anomaly) shares the data) |

Town, Spacecraft and Backrooms on this line still carry the data the v5 generator read (2026-10-19, before v6); Dust is v6.

- `glb_rescale.mjs <in> <out> <factor>`: a served copy at another size (a root scale node). Dust's `.glb` is already at
  142.23 m per model unit; it was made from the x40 copy by 3.55575.
- `dust_splice.py <tree> <dust.json> <tag> <ext>`: the one-shot that put Dust into this tree (already applied here);
  the pattern for the next map. `v6_apply.py <glb_collision.mjs>`: the v6 rules as replacements on the v5 generator
  (already applied to the copy one level up; kept as the record of what changed).

## Looking at a reading

- `cellplan.mjs <cells.json> <out.png> [x0 z0 x1 z1 metres] [px per cell]`: the plan — floors by height, walls black,
  low cover and standable things orange, void dark grey, covered floors stippled, ramps hatched.
- `regions.mjs <tree> <json> <cxM> <czM> [top]`: the walked regions of the nav grid (size, floor range, box).
- `walk_diff.mjs <tree> <a.json> <b.json> <cxM> <czM>`: walkable points lost and gained between two readings.
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

## The PT site from this tree

The PT site is this tree plus `pt_deltas.py <tree> <tag>` (2026-10-21): the served models' extension `.wasm` (the artifact
host serves no `.glb`) and the build tag; the infinite boost (the human's gauge refilled each tick; the offline bots keep their own drain); the collision
view (F8 / `__COLLISION_VIEW()`: the arena as the sim holds it — boxes, floors, the bodies — the model hidden meanwhile);
the map scale test (F7 / `__MAP_SCALE(mPerUnit)`, `__MAP_SCALE_PANEL()`: a modelled map tried at another size, model and
data scaled alike, the match restarted). So: a worktree of this branch, `pt_deltas.py`, copy each `client/public/maps/*.glb`
to `*.wasm`, `npm install`, `cd client && npx vite build`. The page is `dist/index.html` with the built asset names;
publish it to the PT artifact with `assets/index-*.js`, `assets/debugPanel-*.js`, `assets/index-*.css` and whichever
`maps/*.wasm` / `maps/*.png` changed, and null for the assets replaced. On that tree one test fails by design (the
travel sprint latch: no boost drains). `pt_probe.cjs <client/dist> <mapKey> <mPerUnit>` checks the three hooks headlessly;
`fade_probe.cjs <client/dist> <mapKey> x,z ...` counts what fades around the player at given spots; `fade_things.cjs`, `fade_hist.cjs` and `fade_one.cjs <client/dist> <mapKey> [rank]` list the fade's things — the biggest, by size, and one looked into (its columns, cells, rows across); `fade_at.cjs <client/dist> <mapKey> x0 z0 x1 z1` the things with hull columns over a window (metres); `fade_why.cjs <client/dist> <mapKey> x,z` what fades at a spot with the camera's place (the headless camera does not follow a teleported body, so read the camera's place with it); `fade_geo.cjs <client/dist> <mapKey> cx cz radius [dx dy dz]` the game's own line test against the hull on a ring around a spot, the camera at a fixed offset from the player (metres; the classic camera sits about 3 m north and 5 m up).

The fade, map-wide (2026-10-22, after a wall between the camera and the player stayed black, then crate lids blocked the sight): `fade_sweep.mjs <tree> <client/dist> <mapKey> cxM czM [stepU]` puts the camera at the classic offset, turned to four headings, at every standable spot of the arena's floors, and asks of each line to the chest which model faces cross it (flat ones too) and which things' hulls do — a face crossed that belongs to no fading thing is a texture blocking the sight, classed as a post face (narrower than a body both ways: no hull by design), a face in no thing (under the street: never claimed; a low lid), or a face in a thing whose hull the line misses (the bug); and a hull crossed with no face on the line is a fade with nothing in the way (the approach fades). Dust, 1,076 lines crossed by a face: blocking textures 363 before the day, 86 after (57 posts, 22 under the street at the sunken spot x 41.7 z −28..−20, 7 pieces of the street's rim over that pit — a floor, which never fades); fades with nothing in the way 100 before, 0 after — the hull is the thing's own faces now. A floor is a walked surface of the arena (the generator's planes), a lid a 'flat' surface (a thing's top too high to walk onto) or no surface at all; the sim's materialised surfaces keep their type for this. `fade_case.mjs <tree> <client/dist> <mapKey> cxM czM xM zM yawDeg group [hxM hzM hyM]` shows one case: the line, the first box it enters, the thing's hull and triangles around the entry (or around a given hit point); `fade_region.mjs <tree> <client/dist> <mapKey> cxM czM x0 x1 z0 z1` what the fade did with the model's triangles in a region, and the seed test's reading of those it left; `fade_empty.cjs <client/dist> <mapKey>` the things with no hull at all; `fade_floors.mjs <tree> <client/dist> <mapKey> cxM czM` the flat faces inside things that overlap a walked surface at their height — floor pieces that would fade with their thing, 353 on Dust before the overlap test, 0 after; with `BESIDE=<units>` it also counts the pieces within that distance of a walked floor at its height — the ground in the strips along walls and in yards no body walks, 205 within a metre and 283 within three before the floor rule took them in, 0 and 15 after; `f10_probe.cjs <client/dist> <mapKey> <out.png>` the PT keys F10 (the infinite boost switch: the gauge read while dashing with the switch off and on) and F8, with a screenshot. The tree is the checkout whose arena data the probe reads (the PT worktree).

## Replacing a map's data

`data_splice.py <tree> <key> <json> "<source note>"` replaces the map's entry in `arena.js` and keeps the old one as
`<key>_old.json` beside the new (compare with `regions.mjs` and `walk_diff.mjs`); Backrooms (Anomaly) takes a copy of
Backrooms' json. The spawn lines are not touched: set them by hand when the places change.
