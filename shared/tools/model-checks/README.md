# Unit model checks (2026-11-18 and 19)

The readers and the page rigs behind three fixes on the unit models: Aris's winner motion flickering on her back (b1105jq),
Minori given Subaru's walk and sprint (b1105jr), and Minori's left fingers passing through her gun in that run (b1105jt).
`../unit-model/` holds the older inspectors (rig matching, gun bone, mouths, scale); these add to them.

## Reading a model file

Plain Python, nothing to install, read-only: `python3 -I <tool> <file.glb> ...`.

| file | what |
| --- | --- |
| `nodes.py <glb>` | the nodes that carry a mesh, with their parents; every name that appears more than once |
| `morph.py <glb>` | every morph target: which vertices it moves, how far, where they end up, which bones they hang on |
| `scan_all.py <glb>...` | per file: every mesh with a morph target, whether the target gathers all its vertices in one place, and the values every clip gives that morph |
| `spread.py <glb>...` | per morph target: the widest gap between the places its vertices end up (0 = one place exactly), beside the mesh's own size |
| `weights.py <glb>` | per clip, the morph-weight tracks: node, key times, values |
| `glb_anim.py <glb>` | per clip: channels by path, length, and the nodes whose scale goes near 0 (a part hidden by scale), with the times |
| `weapon_bone.py <glb>...` | the weapon bone: its parent chain, its rest pose, the `Move_Ing` clip's tracks on it, and the arm bones' rest lengths (two rigs' proportions compared) |
| `hand_bones.py <glb> [L\|R]` | one hand: the bones under the hand bone, the meshes and vertices on them (wholly, or shared with bones outside), the triangles wholly on them |
| `energy.py <glb>`, `packverts.py <glb>` | Aris's energy pack: its bones' tracks in every clip; the vertices weighted to them |

## Looking at the game's own drawing

Page rigs: each serves a built client (`cd client && npm run build`, then `client/dist`; or a PT folder, `docs/pt/`), opens it
headless with Playwright and Chromium, starts an offline match through the page's hooks and measures or photographs.

| file | what |
| --- | --- |
| `live_run.cjs <dist> <unit key> [seconds] [map]` | the unit played by its bot: which rig entry and clip it shows while it moves, four times a second |
| `run_frames.cjs <dist> <out dir> <unit key> <rig clip key> [phases] [angle] [map]` | a clip pose by pose: the rig is given one entry alone at each phase and the scene is drawn from a camera `angle` degrees round from the unit's front |
| `win_frames.cjs <dist> <out dir> [map] [frames]` | Aris's winner camera frame by frame: her bot against a dummy at 1 HP, so her first hit is the final blow |
| `spikes.cjs <dist> <out dir> [map] [clip] [times]` | which triangles of Aris's model are stretched in a pose: posed edge over 3 times its bind edge and over 8 % of the model's height |
| `pair.cjs <dist> <out dir> [map] [clip] [time] [scale]` | one frozen pose of the winner camera twice: as the build draws it, and with the meshes the build hides shown again; the stretched triangles counted in each |
| `tuck_live.cjs <dist> [unit] [seconds]` | per rig entry the unit shows: the size of its left finger bones (1 = their own, 0.001 = put away) |
| `hand_opts.cjs <dist> <out dir> <fingers.json> [options] [phases] [angles] [dist]` | Minori's left hand on her gun in her run, close up, as built and with a change tried on the page alone (the hand off, the fingers off, the fingers at rest, the fingers as her own clip holds them). `fingers.json` is that input: her fingers' rest pose and her own run clip's finger tracks |

The hooks they lean on (the line's `client/src/main.js`): `__startMatch({ mapKey, mode, mainMode, player, ally, enemy, enemy2,
suddenDeath })`, `__gvgState`, `__gvgRenderer`, `__gvgCamera`, `__THREE`, `__loading.up()`, `__intro.active`, `__finale.shot`.
A match is live once `__loading.up()` and `__intro.active` are both false.

## What they found

- Every morph target in the twenty units' files (201 of them) gathers its mesh at one point: it is how the files hide a part.
  A mesh drawn while its morph is on shows as stretched triangles.
- Aris has two bodies, `CH0334_Body` (plain, hidden by a morph in every clip) and `CH0334_Arms_Body` (armoured): 23 skinned
  meshes, 12 of them mouths. The flicker was the plain body, which the file hides by its morph, showing as stretched
  triangles in the winner motion; the fix does not draw it at all (`UNIT_MODELS.aris.away`), and the stretched triangles
  went from 166 to 0.
- `Bip001_Weapon` is a child of the root `Bip001`, not of a hand. A borrowed clip must bring the weapon bone's tracks with it,
  and the positions as well as the rotations (`borrowClip`'s `whole`), or the gun hangs at the hip.
- Minori's Biped rest proportions equal Subaru's, which is why Subaru's motion fits her. Minori has three finger chains a hand
  (`Finger0`, `Finger1`, `Finger2`), Subaru five. Her weapon bone rests at scale 0.001 and her clips scale it to 1.
- The loader turns the spaces in a bone's name into underscores (`Bip001 L Finger0` is `Bip001_L_Finger0` in the page).
- A part is put away for the length of a clip by one constant scale track at 0.001 (`borrowClip`'s `tuck`); it costs the mixer
  three more tracks and the sim nothing.
