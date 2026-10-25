# PT: the play-test page, and how to rebuild it

PT is the page the user plays at `https://claude.ai/artifact/XGYXTJd12wfiwnPee1qMhy`. Its source was never a branch: it lived in
a detached worktree beside the 0.8.9 checkout, and the published page was the deliverable. This folder is what rebuilds it when
that worktree is gone.

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

Nine files, 93 KB: `pt_from_089.patch`. `sd_index.html` is the page itself, as published.

## Rebuild

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

## Publish

The page is `sd_index.html`; its one `<script>` names the bundle, so after a build change that hash to the new
`client/dist/assets/index-<hash>.js`. Then publish, from the artifact tool, with the URL above, `root` = `client/dist`, and a
`files` map that adds the new `assets/index-<hash>.js` and `assets/debugPanel-<hash>.js` and sets the previous two to `null`.
The artifact has a 256 MiB cap; stale bundles once filled it, so never leave the old pair in. The maps (`maps/*.wasm`,
`maps/*.png`), the models (`models/*.wasm`) and the unit images are already on the artifact: publish one only when it changes,
and list what is there with the files listing before guessing.

Working rules the user set: PT first; port to 0.8.9 (`Proto_0.8.9_BA_Testing`) only when asked, by patch and not by file copy;
`Demo_0.8.8_Steady` is never touched; this branch is the toolbox and is touched only when asked.

## Differences this recipe does not carry, on purpose

- `docs/img/hitcurve/hit_curves.png` differed between the PT worktree and 0.8.9 (an older render in PT); the 0.8.9 one stands.
- The PT worktree lacked the tool scripts 0.8.9 gained after the worktrees parted; having them changes nothing in the game or the build.
- The PT worktree carried only four unit models under `.wasm` on disk; the copy loop above makes all of them, which is a superset.
