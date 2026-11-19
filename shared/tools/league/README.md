# The bot league (2026-11-19)

Bot against bot on the shared sim — the server's rules, no client — to rank the twenty units in 1v1 and in 2v2 and to find the
strong teams. Made for the user's "Run some sims, try to figure out the strong units in 1V1, 2V2 and strong 2V2 comp. Complete
in 20 mins." and, an hour later, "Since you are capable of running 4.5K games, use map random card pool instead (both scene
and concept). Run again. Complete in 20mins." Both runs are on the line at `95a7b99` (build b1105ju).

| file | what |
| --- | --- |
| `league.mjs` | `[MAPS=a,b,c] [TEAMS=u+u,u+u,...] [SECS=n] node league.mjs <line checkout> <out.jsonl> <job> <part> <parts> [n]` — plays the job's matches, one JSON line each (`job, map, a, b, w` the winning side A / B / D, `t` seconds, `ha` `hb` the HP left, `ko`). The jobs are in its header: `1v1`, `2v2`, `set` in order; `1v1s`, `2v2s`, `sets` shuffled, for a run with a time limit |
| `agg.py` | `python3 -I agg.py names.json <1v1 files> -- <2v2 files> [-- <round robin files>]` — the tables for a few maps: each unit's 1v1 win rate with a column per map and how many of the 19 others it beats; its 2v2 win rate and a fitted strength (a team's chance from the sum of its two units' strengths); the teams that won most; the round robin |
| `agg2.py` | the same call, for a map pool: scene and concept maps apart (the eight scene maps are named at its top), each unit's best and worst map and the spread over the maps, the unit-by-map table. `MINN` (20): the fewest matches a team needs to be listed. It ends with a `TEAMS=` line — the fit's six strongest teams of two different units and the six that won most — for the round robin |
| `names.json` | unit key to character |
| `warm_t.mjs` | `node warm_t.mjs <line checkout> <map,map,...>` — loads each map and its route grid and says how long it took: a map list tried before a long job |
| `results/three-maps/` | the first run: Warehouse, Square, Town. 2,280 1v1s (`r1`), 1,700 random 2v2s (`r2`), two round robins of ten teams (`r3`, `r4`, 270 each); `tables.txt` |
| `results/random-pool/` | the second run: the sixteen maps of the Random cards. 9,120 1v1s (`m1`), 4,168 random 2v2s (`m2`), a round robin of twelve teams (`m3`, 2,558); `tables.txt` |
| `slides/` | the ten slides the user asked for ("make these findings an easy slides"), below |

**How a match is played.** `createMatchState`, then every tick each unit still standing takes `pickBotTargetId` and `tickBot`,
and `tickMatch` runs with every seat driven: the way the server drives its bots (`server/src/index.js`). `warmup.js`'s
`warmMap` loads the map and its route grid first. A match ends when a side has no unit standing; a cap of 150 s gives it to the
side with more HP left (no match of either run reached the cap). The shot seed is random, so no two matches are alike.

**The second run, as it was made** (four cores, twelve minutes; about 17 1v1s a second on two processes, 8 2v2s a second on
two, 15 on four):

```sh
export MAPS=arena2,factory,factory2,square,lobby,station,flashpoint,airport,town,neon,compound,dust,warehouse,hospital,spacecraft,backrooms
T=shared/tools/league; L=<line checkout>
SECS=530 node $T/league.mjs $L m1_0.jsonl 1v1s 0 2 3 &  SECS=530 node $T/league.mjs $L m1_1.jsonl 1v1s 1 2 3 &
SECS=530 node $T/league.mjs $L m2_0.jsonl 2v2s 0 2 &    SECS=530 node $T/league.mjs $L m2_1.jsonl 2v2s 1 2 &   wait
python3 -I $T/agg2.py $T/names.json m1_*.jsonl -- m2_*.jsonl                 # its last line is TEAMS=...
for p in 0 1 2 3; do TEAMS=<that line> SECS=165 node $T/league.mjs $L m3_$p.jsonl sets $p 4 4 & done; wait
python3 -I $T/agg2.py $T/names.json m1_*.jsonl -- m2_*.jsonl -- m3_*.jsonl
```

**The map pool** is what the client's Random cards and the lobby's die draw: every map of `MAP_DATA` (client `main.js`) not
marked `noRandom`. Eight scene maps (town, neon, spacecraft, dust, warehouse, compound, hospital, backrooms) and eight concept
maps (arena2 Streets, factory, factory2 Scrapyard, square, lobby, station, flashpoint, airport). Not drawn, so not played:
arena1 Plain Field, district, backrooms_anomaly, range.

## What the second run said

Win rates over the sixteen maps (1v1: 912 matches a unit, about ±3 points; 2v2: about 800 a unit, ±3 to 4):

| unit | 1v1 | 2v2 | | unit | 1v1 | 2v2 |
| --- | --- | --- | --- | --- | --- | --- |
| Koyuki | 73.7 | 64.3 | | Atsuko | 48.0 | 45.9 |
| Iori | 67.6 | 54.1 | | Rabu | 48.0 | 51.0 |
| Minori | 63.7 | 53.5 | | Aru | 47.9 | 49.0 |
| Maki | 63.5 | 56.0 | | Subaru | 44.5 | 48.2 |
| Asuna | 60.7 | 56.8 | | Hiyori | 43.6 | 45.5 |
| Fubuki | 60.1 | 53.7 | | Marina | 42.6 | 43.6 |
| Kurumi | 57.9 | 55.3 | | Aris | 39.5 | 46.7 |
| Hina | 55.0 | 54.8 | | Saori | 37.8 | 44.4 |
| Hoshino | 51.0 | 53.2 | | Yuuka | 29.3 | 36.7 |
| Haruka | 48.2 | 48.7 | | Kei | 17.2 | 37.0 |

The round robin of twelve teams (about 420 matches a team, ±5): Koyuki + Asuna 64.0, Koyuki + Kurumi 57.1, Koyuki + Iori 57.1,
Koyuki + Maki 55.6, Kurumi + Hina 55.4, Koyuki + Hina 54.5, Koyuki + Fubuki 49.0, Maki + Hina 48.0, Koyuki + Minori 45.7,
Rabu + Iori 38.5, Hoshino + Asuna 38.5, Iori + Hina 37.9.

The maps move the result more than the units do. On three maps Maki led the 1v1 (70.6) and the shotguns stood at 35 to 40; on
sixteen Koyuki leads and the shotguns stand at 48 to 51. A unit's own maps differ as much: Rabu 84 on Neon and 9 on Spacecraft,
Iori 92 on Airport and 29 on Neon, Hiyori 81 on Square and 22 on Flashpoint; Minori is the steadiest (55 to 75). A cell of the
unit-by-map table is 57 matches, about ±13.

**What these numbers are not.** They are bots, not players.

- A bot's trigger (`botMayFire`, `shared/src/sim/bloom.js`, called from `nbrain.js`) reads its line of sight, the distance and
  its own bloom, never whether the target is sprinting. A unit whose strength is in the timing — Saori: 100 damage on a
  standing target in 2.6 s, on a sprinting one in 13.7 s (`../field-dps/`) — is sold short. The user keeps Saori as the unit
  a new player learns on for that reason (2026-11-19).
- A bot whose target is a shotgun fights from 160 unless its own lock range is longer or it is a shotgun itself
  (`BOT_SHOTGUN_ENGAGE_RANGE`, `nbrain.js`).
- The random 2v2s may draw the same unit twice for a team; the round robins use teams of two different units.
- Seven of the twelve teams of the last round robin hold Koyuki, so its order mostly says who goes best with Koyuki.

## The roster by school

The user's note of 2026-11-19 (the Blue Archive schools), matched to the twenty units: Arius 4 (Saori, Atsuko, Hiyori, Subaru),
Millennium 6 (Yuuka, Asuna, Koyuki, Maki, Aris, Kei), Gehenna 4 (Hina, Iori, Aru, Haruka), Red Winter 2 (Marina, Minori),
Abydos 1 (Hoshino), Valkyrie 1 (Fubuki), SRT 1 (Kurumi), Trinity 1 (Rabu). The hidden unit 8 (Mika) is outside the twenty.

## The slides

`slides/project/` is a ten-slide deck in Traditional Chinese, 強角與強組合模擬結果, of the second run: the method, the answer,
the 1v1 and 2v2 rates as bars, what changed from three maps to sixteen, the maps' pull, the round robin, the weakest teams,
the limits. It was made on claude.ai's Slides type (it stood at `https://claude.ai/artifact/USRaMieMgWgrLAuoaLWxZ8`):
`deck.json` is the index, `deck.css` the shared rules, `slides/<id>.html` one slide each. To put it back, start a deck from
the Slides type and publish these files with `root` = `slides/`. `slides/preview.cjs <slides folder> <out dir>` draws every
slide to a PNG with the page's scripts off, for a look before publishing (the Playwright and Chromium paths at its top are
the cloud session's).
