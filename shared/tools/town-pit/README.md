# The Town pit (b1105jp, 2026-11-18)

The user, with the position line of the testing tools: "town x 66.79 z 31.99 feet 0.00 m (model) cam E 89° [arena x 269.1
y 2.45 z 168.0] build b1105jo 11-17 — Fix this pit. PT and 9.8. Don't take too long."

Between the raised deck's east edge (model x 66.5, its floor 3.88 m up) and the map's east edge (model x 67) a strip half a
metre wide had no floor from model z 22 to 36. A body that walked off the deck there fell to the street into a slot narrower
than itself and could neither walk nor jump out. South of z 22 the same strip was already filled.

| file | what |
| --- | --- |
| `fill.py <town_data.json>` | the fix: one box (arena x 268..270, z 128..184, from 2 under the street to the deck's 15.51) and one floor on it, appended as the strip south of it is. It asserts the strip is empty at street level first; nothing else in the file changes |
| `fall_probe.mjs <line checkout>` | on the shared sim: a body on the deck walked east at the edge by the reported spot, then trying to get back by walking and by walking with jumps; prints where it stands after each part |
| `walk_probe.cjs <dist> <mapKey> <xM> <zM> <cxM> <czM> <yawDeg> <seconds>` | the same in the built page: the player's body put at a spot and the W key held, its position and floor sampled |
| `pit_shot.cjs <dist> <out png>` | the reported spot photographed from the south-west above it |

After `fill.py` the route grid is built again with the line's own tool, `node shared/tools/maps/navgrid_build.mjs <tree root>
town` (`town_nav.nav`: 15,500 walkable nodes, 706 jump links, 2,274 drop links); the line's tests fail until the grid file
matches the data. PT took the two files as `maps/town_data.json` and `maps/town_nav.wasm`.

Measured: a body walked east off the deck at 29 places along the edge (arena z 128 to 184, every 2) fell into the slot at 21
before and none got out; after, none falls and every one walks back west.

The pattern for the next hole in a scene map: read the reported line (the bracket is the arena's units, which the data file
uses), look at what the data holds round it, fill as the neighbouring ground is filled, build the grid again, and walk a body
over it on the sim before looking at it in the page.
