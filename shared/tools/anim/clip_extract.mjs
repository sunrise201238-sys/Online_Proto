// One animation clip out of a unit's glTF, as three.js's AnimationClip JSON (AnimationClip.parse reads it back): the
// climbing motion (user 2026-11-05, "Use Vital_Retreat motion for every character") — four of the sixteen unit files carry
// the clip (Kurumi, Rabu, Subaru, Yuuka, the full motion sets); the other twelve borrow Kurumi's, their Biped skeletons
// sharing her bone names (61..65 of her 67 Bip bones), the tracks of bones a rig lacks dropped when it is bound (client,
// loadClimbClip). Node names are sanitized as three's GLTFLoader sanitizes them (spaces to underscores; [ ] . : / removed), so
// the tracks bind by the same names the loaded rigs carry.
// usage: node clip_extract.mjs <unit.glb|.wasm> <clip name> <out.json> [--no-root-motion]
//   --no-root-motion: the root bone's (the first animated node's) sideways travel pinned to its first frame, its rise and fall
//   kept — a motion that walks its root would slide the body off its physics column.
import { readFileSync, writeFileSync } from 'node:fs';
import { readGlb, accessor } from '../maps/glb_read.mjs';
const [file, clipName, outF, ...flags] = process.argv.slice(2);
if (!file || !clipName || !outF) { console.error('usage: node clip_extract.mjs <glb> <clip name> <out.json> [--no-root-motion]'); process.exit(2); }
const g = readGlb(file); const j = g.json;
const anim = (j.animations ?? []).find((a) => a.name === clipName);
if (!anim) { console.error(`no clip ${clipName} in ${file}; clips: ${(j.animations ?? []).map((a) => a.name).join(' ')}`); process.exit(1); }
const sanitize = (name) => name.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
const TYPE = { translation: ['position', 'vector'], rotation: ['quaternion', 'quaternion'], scale: ['scale', 'vector'] };
const tracks = []; let duration = 0; let rootNode = null; let rootDropped = null;
for (const ch of anim.channels) {
  const s = anim.samplers[ch.sampler]; const n = j.nodes[ch.target.node]; const [prop, type] = TYPE[ch.target.path] ?? [];
  if (!prop) continue;
  const times = Array.from(accessor(g, s.input)); const values = Array.from(accessor(g, s.output));
  duration = Math.max(duration, times[times.length - 1] ?? 0);
  if (rootNode == null) rootNode = ch.target.node;
  // (--no-root-motion: the root's sideways travel pinned to its first frame — its rise and fall kept)
  if (flags.includes('--no-root-motion') && ch.target.node === rootNode && prop === 'position') { rootDropped = n.name; for (let k = 3; k < values.length; k += 3) { values[k] = values[0]; values[k + 2] = values[2]; } }
  const track = { name: `${sanitize(n.name)}.${prop}`, type, times: times.map((t) => +t.toFixed(4)), values: values.map((v) => +v.toFixed(5)) };
  if (s.interpolation && s.interpolation !== 'LINEAR') track.interpolation = s.interpolation === 'STEP' ? 2300 : 2302;   // InterpolateDiscrete / InterpolateSmooth
  tracks.push(track);
}
const clip = { name: clipName, duration: +duration.toFixed(4), tracks };
writeFileSync(outF, JSON.stringify(clip));
const bones = new Set(tracks.map((t) => t.name.split('.')[0]));
console.log(`${clipName} from ${file}: ${tracks.length} tracks on ${bones.size} nodes, ${clip.duration} s, ${readFileSync(outF).length} bytes${rootDropped ? `, root ${rootDropped} pinned in plan` : ''}`);
// a note of the root's travel, for the --no-root-motion decision
const root = tracks.find((t) => t.name.endsWith('.position') && t.name.split('.')[0] === sanitize(j.nodes[rootNode].name));
if (root) { const xs = root.values.filter((_, i) => i % 3 === 0), zs = root.values.filter((_, i) => i % 3 === 2); console.log(`root ${root.name}: x ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)} z ${Math.min(...zs).toFixed(3)}..${Math.max(...zs).toFixed(3)} (model units)`); }
