# Design samples (2026-10-10 to 2026-11-16)

The sample pages the game's looks were chosen from, saved on 2026-11-19 before the artifacts were cleaned up; the pictures on
the boards were added on 2026-11-20. They are records of what was shown and what was picked, not parts of the game.

| here | what | it stood at |
| --- | --- | --- |
| `ui-rework/` | **GunVS UI Rework Samples**: 39 boards, from the seven first directions (A Tactical to G Ops; F, Splat, was taken) and the rounds on F up to the sixteenth — the lobby's folder and memo, the HP chips, the end page, the crayon, the paper clip, the stickers, the option groups, the unit's photos, the finale HUD, the kill HUD, the intro HUD, the loading screen, the weapon in hand | `https://claude.ai/artifact/1489ieHXfUJZ3okkbwshBu` |
| `mg-card-colour/` | **MG Card Colour** (2026-11-08): five candidates on the three machine gun cards, each with its distance from the girls' hair; Cobalt `#2F5BEA` marked as the pick | `https://claude.ai/artifact/9sfEv6oAwHdsNn6ewVGus9` |
| `sr-card-colour/` | **SR Card Colour** (2026-11-08): six candidates on the three sniper cards, each with how much of the outline melts into it; Leaf `#04A322` marked as the pick | `https://claude.ai/artifact/4tsa6qRqZJdgMmiTmPo6B3` |
| `boost_gauge_edges.html` | **Boost Gauge Edges** (2026-10-10), Boost 條的邊: the candidates for the boost bar's edge, one page that stands alone (open the file) | `https://claude.ai/artifact/Wav8Mo2tnK4WA27jpk26jf` |
| `view.cjs` | shows one of the three folders in a browser, boards and pictures together (below) | |

## The three folders: boards and their pictures

Each was a board set of claude.ai's Design type. In a folder:

- `canvas.json` is the index: every board's title, its size and its place on the canvas.
- `<name>.dc.html` is one board, plain HTML and CSS inside `<x-dc>`.
- `blob/` holds the pictures the boards show: unit thumbnails, weapon and map pictures, screenshots of the game. On the
  artifact they were uploads, and a board names one as `/_blob/<id>`. Here the same picture is `blob/<id>.png` (one is a
  `.jpg`), the very bytes the artifact served.
- `blob.tsv` lists the pictures: the id, the file, the size, when it was uploaded, its sha256, and the boards that use it.

| folder | boards | pictures | used by no board |
| --- | --- | --- | --- |
| `ui-rework/` | 39 | 117, 25.8 MB | 10 |
| `mg-card-colour/` | 2 | 8, 0.7 MB | 0 |
| `sr-card-colour/` | 2 | 8, 0.6 MB | 0 |

Of the 117 pictures of `ui-rework/`, 101 are different pictures: sixteen are a picture uploaded a second or a third time
under a new id. All are kept, because a board names its picture by id. Ten uploads (4.6 MB) are named by no board of the last
version; they are kept too, and `blob.tsv` marks them with `-`.

Some of the pictures are the game's own files: 28 of the 101 in `ui-rework/`, and 7 of the 8 in each colour set, are byte for
byte a picture under `client/public/` of the line at `95a7b99`. The others (screenshots of the game, cut-outs, pictures made
for one board) are not in that checkout.

`ui-rework/canvas.json` lists the boards in the order they were made; a board's title says its round and what it asks, for
example `Kill_HUD` — "F · round 13: a kill HUD under PAUSE, face, mark, face: an arrow A, a K.O. burst B, a hit marker C, the
weapon…".

## Looking at a set

```
node view.cjs ui-rework          # run from this folder, then open http://localhost:8098/
node view.cjs mg-card-colour 8099
```

`view.cjs` serves one folder to a browser on the same machine: a list of the folder's boards, each a link, and each board
with its pictures. It needs Node and nothing else, writes nothing, and reads nothing outside the folder.

A board asks for two things this folder does not hold under those names, and the script answers both. A picture asked for at
`/_blob/<id>` comes from `blob/`. And `./support.js`, the Design type's own script, which belongs to the type and is not kept,
is answered with a small stand-in that fills in what these boards use of it: the `{{name}}` holes, `<sc-for>` and `<sc-if>`,
from the board's own `renderVals()`. Only the four boards of the two colour sets use those; the 39 UI boards are plain
markup. A board seen this way is a close reading of the page, not the Design type's own drawing of it: there is no canvas
with every board side by side, and a board's tweaks (the colour to try on the two "in context" boards) stay at their defaults.

Checked on 2026-11-20: every board of the three folders opened through it, 674 pictures on 43 boards, none missing.

Opened straight from the file, without the script, a board shows its layout, its colours and its words with empty picture
frames, and the colour boards show their holes unfilled.

## Putting a set back on a Design artifact

Start an artifact from the Design type and publish the folder's `canvas.json` and boards under `project/`. Upload each picture
of `blob/` again: an upload gets a new id, so put the new `/_blob/<id>` in place of the old one in every board that names it
(`blob.tsv` says which boards those are).
