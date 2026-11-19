# PT: the play-test page

PT is the page the user plays at `https://claude.ai/artifact/XGYXTJd12wfiwnPee1qMhy`. It never had a branch of its own. This
folder holds two things: **the site itself as it was served on 2026-11-19** (below), and the older recipe that rebuilt it from
0.8.9 in October (further down).

## The site as served (saved 2026-11-19)

The user (2026-11-19): "Put everything you need in \"Testing_0.9.0_Develop-Tools\", along with the PT site stuffs there. We're
about to clean up the artifact here." So the whole site is here, byte for byte, and the page can be put back from this folder
alone.

| here | what |
| --- | --- |
| `site/` | every file the artifact served, at its served path: 217 files, 171 MB. `site/index.html` is the page as the host served it (the host wraps the page file in a document) |
| `site_page.html` | the page file that is published (the host adds the wrapping) |
| `site.sha256` | `sha256sum` of the 217 files: `cd site && sha256sum -c ../site.sha256` |
| `site_sources.tsv` | for each file: its size, its sha256, and the file of the line (`Proto_0.9.8_BA_Optimizing` at `95a7b99`) that holds the same bytes, or `PT only` |
| `bundle-patches/` | the four scripts that wrote the last four builds into the published script and style sheet (below) |
| `pt_tree.sh` | builds a folder a probe can serve as PT out of a built checkout of the line plus PT's page and script |
| `which404.cjs` | `node which404.cjs <folder> [unit key]`: which requests the page makes, through a match's start, that the folder cannot serve |

**What it is.** Build `b1105ju 11-19` (the tag in the pause menu), the artifact's version `1795050497-4746`. The page's title is
ArchiveVS. 203 of the 217 files are the line's own bytes: the pictures and the map data under their own names, the five
fonts under the build's hashed names, and 81 files under `.wasm` (29 `.glb` models and maps, 8 `.nav` route grids, 39 `.mp3`
and 5 `.wav` sounds), because the page host serves `.wasm` and not those types. 14 files are PT's own: the script
`assets/index-BUZtMzc6.js`, the style sheet `assets/index-9COOofA9.css`, `assets/debugPanel-B9sb70Hz.js`, the served
`index.html`, and the ten pieces of music under `bgm/` (smaller encodings than the line's).

Checked on 2026-11-19: ten files across the folders, the script among them, have the sha256 the artifact reported for them;
and `site/`, served by `which404.cjs` and played to a match's start, asks for nothing the folder lacks but `/favicon.ico`,
which a browser asks for by itself.

**How it differs from the line at `95a7b99`.**

- PT carries the testing tools, which the line does not: the collision view and its inspector, the map scale test, the
  infinite boost switch, the map card's photo mode (**Dev tools** in this branch's README describes them), with their console
  hooks `__COLLISION_VIEW`, `__MAP_SCALE`, `__INFINITE_BOOST`, `__POS_PANEL`, `__PICK`, `__photoEnter`.
- It asks for the maps, the models, the route grids and the sounds under `.wasm`.
- Its script calls the game server at `http://localhost:3001` (`y_` in the script; what the line's client also falls back to
  when it is built with no `VITE_SERVER_URL`), so PT's online modes need a server on the same machine.
- The teammate's messages of b1105js are not in PT (the user: "no need this on PT. I'll verify it on 9.8"), and its bot
  command reads BACK OFF where the line reads PULL BACK.

**Run it from here.** Any static file server over `site/` plays it: the offline modes whole, the online ones if the line's
server runs on port 3001 of the same machine.

```sh
cd docs/pt/site && python3 -m http.server 8080      # then open http://localhost:8080/
```

**Put it back on an artifact.** Publish `site_page.html` as the page, with `root` = `site/` and a `files` map of the other
216 paths (not `index.html`: that is the page). One publish carries at most 255 files and 64 MB, so a new artifact takes the
site in several publishes to the same address; the maps' and the models' `.wasm` files are the weight. An existing artifact
keeps the files a publish does not name, so a change sends only what changed. Read the files back afterwards and compare with
`site.sha256`.

## How PT was kept after its source was lost

PT's source worktree did not outlive the session it lived in. From then on a change went into PT by **editing the published
script in place**: the script is fetched from the artifact, a Python script replaces exact strings in it, and the result is
published under the same file name, so the page file does not change. `bundle-patches/` holds the last four, as the pattern:

| script | build | what it writes |
| --- | --- | --- |
| `pt_patch.py <in> <out>` | b1105jq | Aris's plain body is not drawn (the winner motion's flicker) |
| `pt_patch2.py <in> <out>` | b1105jr | Minori walks and sprints with Subaru's motion (with `models/subaru_move_clip.json` added to the site) |
| `pt_patch3.py <in> <out>` | b1105jt | Minori's left fingers put away while she walks and sprints |
| `pt_patch4.py <css in> <js in> <out dir>` | b1105ju | the LAST tag is the card's `::before`; the build tag |

b1105jp, the Town pit, was data: `maps/town_data.json` and `maps/town_nav.wasm` replaced, and the tag. b1105js is not in PT.
Each script is good for the one bundle it was written against; they are kept as the pattern, not to be run again.

The rules that made this safe:

- Every edit names a string and the number of times it must occur (almost always once). The script counts first and writes
  nothing if any count is off.
- The script is minified, so the line's names are not in it. Found for this bundle: `Ok` = `borrowClip`, `W3` =
  `warmBorrowedClip`, `Ns` = `AnimationClip`, `Wr` = `VectorKeyframeTrack`, `kr` = `LoopOnce`, `yn` = `UNIT_SPRITE_HEIGHT`,
  `ii` = `MODEL_CLIPS_DEFAULT`, `W` = the scene, `Ya` / `Qr` = the ground and the grid, `Tt` = the renderer, `y_` = the
  server's address. Names a patch adds end in an underscore (`awayRx_`, `kept_`, `id_`, `made_`, `whole_`, `tucked_`,
  `tuck_`) so they cannot meet a minified one. Find a place by what the minifier keeps: property names, clip names, file
  names, the words on the screen.
- Optional chaining is compiled away in this bundle (write `a&&a.b`, as it does); `??` is kept.
- Check in a browser before publishing, not by reading: `pt_tree.sh <line client/dist> <page> <patched script> <out dir>`
  makes a PT folder from a built checkout of the line (its files linked under PT's names), and the page rigs of
  `shared/tools/model-checks/` and `shared/tools/online-rigs/` take that folder as they take a `client/dist`. With `site/`
  here, a patched script can also be dropped into a copy of `site/`.
- After publishing, read the script back from the artifact and compare its sha256 with the file that was sent.

No recipe builds PT from the line today. `shared/tools/maps/pt_deltas.py` in the line (2026-10-21) defined PT as edits to a
tree of that time and stops at its first assert on the tree of `95a7b99`. A PT built afresh would be the line with the
testing tools ported onto it (their source as of 2026-10-24 is in this branch's `client/src/main.js`), the assets served under
`.wasm`, and a build with no `VITE_SERVER_URL`.

## The older recipe: PT rebuilt from 0.8.9 (2026-10-25)

Its source was never a branch: it lived in a detached worktree beside the 0.8.9 checkout, and the published page was the
deliverable. This part is what rebuilt it at the time; the game has moved far since, and the site above is what was last
served.

**PT = 0.8.9 + one patch + the assets copied under `.wasm`.** The base is `Proto_0.8.9_BA_Testing` at `7ecd57e`
("Bots: look for a perch only among the floors within the seek radius", 2026-10-25). Everything the game does is the same in
both; the patch carries only what PT has and 0.8.9 does not:

- the collision view and the inspector (F4, F8), the photo mode, the map-scale test (F7), the F9/F10 keys, the build tag line
  (`CLIENT_BUILD_TAG`, `b1024z15 10-24` at the time of writing), all in `client/src/main.js` and `client/src/style.css`;
- `MAP_FILE_EXT = '.wasm'`: PT serves the maps and the unit models under `.wasm`, because the page host serves that type and not
  `.glb`; 0.8.9 serves `.glb`;
- `PT = { infiniteBoost: true, freezeEnemies: false }` in `shared/src/sim/constants.js`, and the lines that read it in
  `shared/src/sim/index.js` and `movement.js`;
- `mapScale` / `scaleArena` in `shared/src/sim/arena.js` (the F7 test's model);
- the PT wording of `README.md`, and two tool scripts (`cellplan.mjs`, `spawn_set.mjs`) that 0.8.9 moved on from.

Nine files, 93 KB: `pt_from_089.patch`. `sd_index.html` is the page itself, as published then.

### Rebuild

```sh
git worktree add --detach ../pt 7ecd57e          # or any later 0.8.9 commit; re-check the patch then
cd ../pt
git apply --check <this folder>/pt_from_089.patch && git apply <this folder>/pt_from_089.patch
for f in client/public/maps/*.glb client/public/models/*.glb; do cp "$f" "${f%.glb}.wasm"; done
npm install && (cd client && npm install && npm run build)
(cd shared && npm test)                           # 97/98: "travel sprint latch" fails under PT's infinite boost, known
```

Checked on 2026-10-25: a fresh worktree of `7ecd57e` taken through these lines passed 97/98 and built bundles byte-identical to
the live page's (`assets/index-RK5Rucut.js`, `assets/debugPanel-B42p0YIA.js`).

### Publish

The page is `sd_index.html`; its one `<script>` names the bundle, so after a build change that hash to the new
`client/dist/assets/index-<hash>.js`. Then publish, from the artifact tool, with the URL above, `root` = `client/dist`, and a
`files` map that adds the new `assets/index-<hash>.js` and `assets/debugPanel-<hash>.js` and sets the previous two to `null`.
The artifact has a 256 MiB cap; stale bundles once filled it, so never leave the old pair in. The maps (`maps/*.wasm`,
`maps/*.png`), the models (`models/*.wasm`) and the unit images are already on the artifact: publish one only when it changes,
and list what is there with the files listing before guessing.

Working rules the user set: PT first; port to 0.8.9 (`Proto_0.8.9_BA_Testing`) only when asked, by patch and not by file copy;
`Demo_0.8.8_Steady` is never touched; this branch is the toolbox and is touched only when asked.

### Differences this recipe does not carry, on purpose

- `docs/img/hitcurve/hit_curves.png` differed between the PT worktree and 0.8.9 (an older render in PT); the 0.8.9 one stands.
- The PT worktree lacked the tool scripts 0.8.9 gained after the worktrees parted; having them changes nothing in the game or the build.
- The PT worktree carried only four unit models under `.wasm` on disk; the copy loop above makes all of them, which is a superset.
