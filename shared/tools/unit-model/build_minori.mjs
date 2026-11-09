// build_minori.mjs <Minori.glb> <saori.glb> <out.glb> — how client/public/models/minori.glb was made (PT b1105dn, 2026-11-08)
// Minori from her bind pose, without her skill props (cone, megaphone, flag, crate, barricades, placard and their bones), her AKM
// kept; none of her own clips; Saori's seven battle clips the game plays for Saori (MODEL_CLIPS_DEFAULT) put on her rig by bone name.
// User 2026-11-08: "Extract her model from bind pose; no need the accessories, except gun. Apply every Saori's motion to Minori."
// What Saori's clips do not move (Minori's hair, scarf, hood, helmet, coat tails, chinstrap, armband, lights) stays as her bind pose.
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const [minF, saoF, outF] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(minF); const root = doc.getRoot(); const buf = root.listBuffers()[0];
const sao = await io.read(saoF);
const san = (s) => (s || '').replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
const node = (name) => root.listNodes().find((n) => n.getName() === name);
// 1. the skill props go: their mesh node, then their skeleton (bone_acc and all under it)
const props = root.listNodes().find((n) => n.getName() === 'CH0214_SkillProp_Outline' && n.getMesh()); if (!props) throw new Error('no prop mesh');
props.dispose();
const acc = node('bone_acc'); if (!acc) throw new Error('no bone_acc');
const sub = (n) => [n, ...n.listChildren().flatMap(sub)]; for (const n of sub(acc).reverse()) n.dispose();
// 2. none of her own clips
for (const a of root.listAnimations()) a.dispose();
// 3. Saori's clips by exact bone name (no letter-case matching: Hiyori's b1105cz lesson)
const byName = new Map(); for (const n of root.listNodes()) { const k = san(n.getName()); if (!byName.has(k)) byName.set(k, n); }
const floats = (a) => { const n = a.getCount(), e = a.getElementSize(), out = new Float32Array(n * e), el = []; for (let i = 0; i < n; i += 1) { a.getElement(i, el); for (let c = 0; c < e; c += 1) out[i * e + c] = el[c]; } return out; };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
function addSampler(anim, times, values, type, interp) {
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf);
  const output = doc.createAccessor().setType(type).setArray(values).setBuffer(buf);
  const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(interp); anim.addSampler(s); return s;
}
const addChannel = (anim, n, path, s) => anim.addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath(path).setSampler(s));
function copySampler(anim, src, offset = null, rotK = null) {   // offset: added to each key (a place about her own rest); rotK: each turn right-multiplied (a turn from her own rest)
  const t = floats(src.getInput()); const o = floats(src.getOutput()); const interp = src.getInterpolation(); const cub = interp === 'CUBICSPLINE';
  if (offset) { const keys = t.length, w = offset.length; for (let i = 0; i < keys; i += 1) for (let c = 0; c < w; c += 1) o[(cub ? 3 * i + 1 : i) * w + c] += offset[c]; }
  if (rotK) for (let i = 0; i < o.length; i += 4) { const r = qmul([o[i], o[i + 1], o[i + 2], o[i + 3]], rotK); o.set(r, i); }
  return addSampler(anim, t, o, src.getOutput().getType(), interp);
}
const CLIPS = ['Normal_Idle', 'Move_Ing', 'Normal_Attack_Ing', 'Move_Jump', 'Normal_Reload', 'Vital_Death', 'Vital_Retreat'];
const GUN_SKIP = new Set(['bone_buttstock', 'fire_01', 'fire_02']);   // (rests 90..120 degrees apart, or another parent: they stay as her bind pose)
const wpn = node('Bip001_Weapon');
const report = []; const turned = new Set(); let worstPlace = [0, ''];
for (const name of CLIPS) {
  const src = sao.getRoot().listAnimations().find((a) => a.getName() === name); if (!src) throw new Error('Saori has no ' + name);
  const anim = doc.createAnimation(name); let copied = 0, noPartner = 0, hair = 0, gunKept = 0, weights = 0; let dur = 0;
  for (const ch of src.listChannels()) {
    const sn = ch.getTargetNode(); const path = ch.getTargetPath(); if (!sn) continue;
    dur = Math.max(dur, floats(ch.getSampler().getInput()).at(-1));
    if (path === 'weights') { weights += 1; continue; }   // (her mouth stays her bind pose's, Mouth_401 — Saori's battle clips show that same mouth)
    const tn = byName.get(san(sn.getName())); if (!tn) { noPartner += 1; continue; }
    if (/hair/i.test(tn.getName())) { hair += 1; continue; }   // (her hair: rests up to 159 degrees from Saori's and other parents)
    if (GUN_SKIP.has(tn.getName())) { gunKept += 1; continue; }
    let off = null, rotK = null;
    if (path === 'translation' && tn !== wpn) { const a = tn.getTranslation(), b = sn.getTranslation(); const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d > 1e-5) off = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; if (d > worstPlace[0]) worstPlace = [d, tn.getName()]; }
    if (path === 'rotation') { const a = sn.getRotation(), b = tn.getRotation(); const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])); if (2 * Math.acos(dot) > 10 * Math.PI / 180) { rotK = qmul([-a[0], -a[1], -a[2], a[3]], b); turned.add(tn.getName()); } }
    addChannel(anim, tn, path, copySampler(anim, ch.getSampler(), off, rotK)); copied += 1;
  }
  // the AKM shown all through: her gun bone rests at scale 0.001 (hidden in the bind pose); Saori's clips keep hers at her rest, 1
  addChannel(anim, wpn, 'scale', addSampler(anim, Float32Array.from([0, dur]), Float32Array.from([1, 1, 1, 1, 1, 1]), 'VEC3', 'LINEAR'));
  report.push(`${name.padEnd(18)} ${dur.toFixed(2)} s: ${copied} channels from Saori, ${noPartner} without a part here, ${hair} hair left out, ${gunKept} gun parts left at rest, ${weights} mouth switches left out`);
}
await doc.transform(prune({ keepLeaves: false }));
await io.write(outF, doc);
console.log(report.join('\n'));
console.log('turned from her own rest (> 10 degrees apart):', [...turned].join(', '));
console.log('largest rest-place gap on a translated bone:', worstPlace[0].toFixed(4), worstPlace[1]);
console.log('animations:', root.listAnimations().map((a) => a.getName()).join(', '));
console.log('meshes:', root.listMeshes().map((m) => m.getName()).join(', '), '| skins', root.listSkins().length, '| materials', root.listMaterials().length, '| textures', root.listTextures().length, '| nodes', root.listNodes().length);
