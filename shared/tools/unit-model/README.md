# Unit model tools (2026-11-08)

The scripts that made Minori's model (`client/public/models/minori.glb` on the line, PT b1105dn) and the inspectors used to read a
new character's file before building it. They read and write glTF binaries with glTF Transform: install it once in this folder
(`npm i --no-save @gltf-transform/core @gltf-transform/functions`; `node_modules` is ignored by git), node 22.

| file | usage | what |
| --- | --- | --- |
| `build_minori.mjs` | `node build_minori.mjs <Minori.glb> <saori.glb> <out.glb>` | Minori from her bind pose, without her skill props (the `CH0214_SkillProp_Outline` mesh and the `bone_acc` skeleton under it), her AKM kept, none of her own clips; Saori's seven battle clips — the ones the game plays for Saori: `Normal_Idle`, `Move_Ing`, `Normal_Attack_Ing`, `Move_Jump`, `Normal_Reload`, `Vital_Death`, `Vital_Retreat` — put on her rig by exact bone name. Prints what each clip carried over |
| `rigcmp.mjs` | `node rigcmp.mjs <new.glb> <saori.glb>` | Saori's battle clips' bones matched onto the new rig by name: rest turn and place gaps, the bones with no partner, the skins' joints on each side, where the gun bones hang |
| `gun.mjs` | `node gun.mjs <glb>` | the gun bone's rest place, turn and scale, which clips key it and to what scale, the gun mesh's extent in the bone's frame |
| `mouth.mjs` | `node mouth.mjs <glb>` | each `Mouth_*` mesh: its morph targets, default weights, which clips switch them |
| `scale.mjs` | `node scale.mjs <glb>` | the scene's top nodes with their scale, the chain above `Bip001`, the body joints' bind scale, the body's bind height |

How the build carries a motion over (the rules came from Hiyori's model, b1105cz, and Minori's):

- Bones are matched by their exact name, never by letter case: matching `bone_hair_F_L_01` onto `bone_hair_f_l_01` gave Hiyori's
  front hair the swimsuit's hair motion, a strand standing out from her face.
- A translated bone's keys move by the gap between the two rigs' rest places; a bone whose rest turn differs by more than 10
  degrees takes the motion as a turn from its own rest.
- What the clips should not move stays in the bind pose: her hair (rests up to 159 degrees apart from Saori's), three gun parts
  (`bone_buttstock`, `fire_01`, `fire_02`) and the mouth switches.
- The gun bone rests at scale 0.001 in Minori's bind pose (hidden); each clip keys it to 1 for the whole clip, so the AKM shows.

For another unit, change the prop mesh and bone names, `CLIPS` (the clips the game plays for the unit's base), `GUN_SKIP` and what
is left out, after reading the new file with the inspectors. The game side — `UNIT_MODELS` in `client/src/main.js` (the file, the
height, the clips: Minori's dodge is Subaru's jump clip, `models/subaru_dodge_clip.json`) — is in the line; the PT site serves
models under a `.wasm` name.
