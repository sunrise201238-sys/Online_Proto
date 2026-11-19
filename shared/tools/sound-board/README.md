# ArchiveVS Sound Board (2026-11-13 to 16)

The page the user set the game's sounds on by ear: every gunshot, reload, step, menu sound and piece of music with a button
that plays it and a slider for its level, the user's own recordings beside the candidates, and the samples that were
synthesized when no recording fitted. It is the "listening site" of the line's README (**The game's sounds and its music**,
b1105hk, and the sound builds after it). It stood at `https://claude.ai/artifact/JubGqqrMKPcDjFkF4ivvyV`; this is that page as
served, saved on 2026-11-19 before the artifacts were cleaned up. The page is in Traditional Chinese.

| here | what |
| --- | --- |
| `index.html` | the page: 6.9 MB, with 146 sounds inside it (119 MP3, 27 WAV) |
| `bgm/` | the ten pieces of music it plays, the line's own files (`client/public/bgm/*.mp3`) under the `.wasm` names the page asks for |

```sh
cd shared/tools/sound-board && python3 -m http.server 8080      # then open http://localhost:8080/
```

Checked on 2026-11-19: served from this folder the page opens with its 10 sections, 139 sliders and 397 buttons, asks for
nothing the folder lacks, and throws no error.

What is on it, top to bottom: 新錄音 (the user's recordings, a group a gun, the one the game uses marked 遊戲用這個), 槍聲 (the
shots by weapon class), 上膛、換彈、開鏡 (bolt, reload, scope), 其他聲音 (steps, sprint, dodge, jump, landing, the hit marker,
being hit, the kill HUD, the intro, the menu buttons), 背景音樂 (the music, with each piece's level and loudness), 時間 (the
delays before a bolt or a reload sounds), 目前的數字 (the numbers as they stand, with a copy button), and the synthesized
samples, the older ones kept for comparison. A slider at 100 is the level the game has; the user moved sliders, sent the
numbers, and the numbers went into the game. The page keeps a visitor's own slider positions in that browser, so those are
not in this file.

In the game the levels live in the client (`client/src/main.js`), reachable from the console as `window.__sfx`: its `units`
field holds each unit's sounds, `move` the steps and jumps, `bgm` the music's state. The candidates that were not taken are
only here.
