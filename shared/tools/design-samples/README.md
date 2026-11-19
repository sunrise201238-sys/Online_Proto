# Design samples (2026-10-10 to 2026-11-16)

The sample pages the game's looks were chosen from, saved on 2026-11-19 before the artifacts were cleaned up. They are records
of what was shown and what was picked, not parts of the game.

| here | what | it stood at |
| --- | --- | --- |
| `ui-rework/` | **GunVS UI Rework Samples**: 39 boards, from the seven first directions (A Tactical to G Ops; F, Splat, was taken) and the rounds on F up to the sixteenth — the lobby's folder and memo, the HP chips, the end page, the crayon, the paper clip, the stickers, the option groups, the unit's photos, the finale HUD, the kill HUD, the intro HUD, the loading screen, the weapon in hand | `https://claude.ai/artifact/1489ieHXfUJZ3okkbwshBu` |
| `mg-card-colour/` | **MG Card Colour** (2026-11-08): five candidates on the three machine gun cards, each with its distance from the girls' hair; Cobalt `#2F5BEA` marked as the pick | `https://claude.ai/artifact/9sfEv6oAwHdsNn6ewVGus9` |
| `sr-card-colour/` | **SR Card Colour** (2026-11-08): six candidates on the three sniper cards, each with how much of the outline melts into it; Leaf `#04A322` marked as the pick | `https://claude.ai/artifact/4tsa6qRqZJdgMmiTmPo6B3` |
| `boost_gauge_edges.html` | **Boost Gauge Edges** (2026-10-10), Boost 條的邊: the candidates for the boost bar's edge, one page that stands alone (open the file) | `https://claude.ai/artifact/Wav8Mo2tnK4WA27jpk26jf` |

**The three folders are source without pictures.** Each was a board file of claude.ai's Design type: `canvas.json` is the
index (every board's title and place), and each `<name>.dc.html` is one board, plain HTML and CSS inside `<x-dc>`. The
pictures on the boards — unit thumbnails, map photos, screenshots of the game — were uploads kept in each artifact's own
store and appear in the source as `/_blob/<id>`; they are not here, so a board opened from this folder shows its layout, its
colours and its words with empty picture frames. Most of those pictures are the game's own files (`client/public/units/`,
`client/public/maps/`); the screenshots were taken for the boards and exist nowhere else. What the boards are good for
without them: the exact colours, sizes and CSS of each look that was shown, and the wording of each option.

`ui-rework/canvas.json` lists the boards in the order they were made; a board's title says its round and what it asks, for
example `Kill_HUD` — "F · round 13: a kill HUD under PAUSE, face, mark, face: an arrow A, a K.O. burst B, a hit marker C, the
weapon…". To put a set back on a Design artifact, start one from the Design type and publish the folder's files under
`project/`, then upload the pictures again and replace the `/_blob/` ids.
