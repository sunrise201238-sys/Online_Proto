# Motion maps (2026-10-10)

One page per unit, made when the units' 3D models came in: for each motion the game plays (standing, walking, sprinting, firing
standing, firing on the run, the dodge, the jump and the air, the reload, the hit, death, the intro / victory), pick the model's
clip and its playback speed in percent (100 = as authored). Each row says when the motion shows and which 2D picture the game
used for it until then; the defaults are the suggested clips. The user's picks were taken from these pages into the game: the
clips and speeds live in `client/src/main.js` (`UNIT_MODELS`, `MODEL_CLIPS_DEFAULT`) on the line.

| page | unit | notes |
| --- | --- | --- |
| `saori_motion_map.html` | Saori | the template the others follow |
| `hoshino_motion_map.html` | Hoshino | the model carries two forms' clips, `01_` and `02_`; no `Move_Jump` (the dodge took `02_Vital_Retreat`, the jump `02_Move_End_Normal` by default) |
| `asuna_motion_map.html` | Asuna | Normal and Stand firing sets; a drone clip |
| `aru_motion_map.html` | Aru | no `Move_Jump` |
| `kei_motion_map.html` | Kei | no `Move_Jump` |
| `aris_motion_map.html` | Aris | an extra row, flight (sprint in the air); no `Move_Jump` |
| `fubuki_motion_map.html` | Fubuki | no `Move_Jump` |
| `hina_motion_map.html` | Hina | Normal and Stand firing sets; no `Move_Jump` |
| `koyuki_motion_map.html` | Koyuki | no `Move_Jump` |
| `haruka_motion_map.html` | Haruka | Normal and Stand firing sets |
| `marina_motion_map.html` | Marina | Normal, Stand and Kneel sets |
| `atsuko_motion_map.html` | Atsuko | |

The pages are as they were published on 2026-10-10 (the published copies: Saori https://claude.ai/artifact/MG8cNbHBvUwze9ZFTWTHLH,
Hoshino PUJqfPvwctvUPybiZ57SSh, Asuna YYbSqEykXNxWuvVzqzesr6, Aru 29ct45f6zSfG2qa6FHue6N, Kei PkR7yYptBXk5wrhD2iZgR5, Aris
1PezXDPKUcTQgfsmSszJP1, Fubuki 7Et7cECd123NrSN8gKhaTA, Hina UvZZQTuESUW2Fn9kYPix26, Koyuki J5B3z73nnQj8NAqpfv24GE, Haruka
SQCBSd4kHTvsak8dybTkHX, Marina 3K3SYWTdgGiDxzyDzdWYgs, Atsuko U9ZmjmgDGgwhPoZTv1nAAP, each under claude.ai/artifact/; private to
their owner). There, a page saved the picks in its own store (document `motions/<unit>`); opened from a file it has no store, says
so, and the **複製清單** (copy list) button gives the picks as text to paste instead.

For a new unit: copy a page whose model is alike, set `CLIPS` to the new model's clip names (with `DUR`, each clip's seconds, where
the page lists lengths), the suggested clips and speeds in `MOTIONS`, the title, and the store's document name.
