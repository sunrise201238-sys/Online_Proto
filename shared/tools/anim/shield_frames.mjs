// shield_frames.mjs <tree root> <unit key> <model key> [write] — WHERE A UNIT'S SHIELD STANDS IN EACH OF ITS MOTIONS, FOR THE SERVER (b1105ly).
// The client stops what is shot at a shield bearer with a box on a bone of its model (main.js, THE SHIELD), wherever the motion in play has put
// that bone. The server plays no motions: it reads the same moments off the fighter (shared/src/sim/shield.js, as history.js does for the
// crouching capsule) and takes the box's place for that motion from a table. This tool makes the table from the unit's own file:
//   - the model stood as the client stands it (makeUnitModel: its body's bind-pose box brought to the unit's height, its feet on the foot
//     line, centred), the unit facing +z, the origin its hit centre (the root: 2.35 over the body's feet point);
//   - for every motion the client's table names for the model (UNIT_MODELS, the default map under it), the bone's place taken through the
//     motion: a motion that goes round (stand, walk, sprint, shoot) gives ONE frame, its mean — the server cannot know where in the round a
//     client's copy is; a motion played once from its first frame (dodge, jump, reload) gives a frame every STEP seconds of its play, at the
//     rate the client plays it (a dodge fitted to the dodge's length, a reload to the reload's), and holds its last;
//   - a frame = the box's centre [x = to her left, y = up from the hit centre, z = ahead] and its turn as a quaternion [x, y, z, w], in
//     game units; the box's half sizes are the unit's `shield.h` times the model's scale, times the motion's own `k` where the motion
//     itself sizes the bone (Kurumi's stand draws her shield 0.954 of its size).
// Without `write` the table and a reading of it are printed (how much of the round a shot from dead ahead is stopped in, frame by frame against
// the mean). With `write`, shared/src/sim/shield_poses.js is written. Run it again whenever the model's file, its motions or the box change.
import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { readGlb, accessor } from '../maps/glb_read.mjs';
const [tree, unitKey, modelKey, write] = process.argv.slice(2);
if (!tree || !unitKey || !modelKey || (write && write !== 'write')) { console.error('usage: node shield_frames.mjs <tree root> <unit key> <model key> [write]'); process.exit(2); }
const root = path.resolve(tree); const STEP = 1 / 15; const SPRITE_H = 6.4, FOOT_Y = -3.2, FIRE_Y = 0.8;
const { UNIT_DATA, STEP_DURATION_MS } = await import(pathToFileURL(path.join(root, 'shared/src/sim/constants.js')).href);
const unit = UNIT_DATA[unitKey]; const sh = unit?.shield; if (!sh) throw new Error(`${unitKey} carries no shield in shared/src/sim/constants.js`);
const src = readFileSync(path.join(root, 'client/src/main.js'), 'utf8');
const a0 = src.indexOf('const MODEL_CLIPS_DEFAULT = {'), b0 = src.indexOf('const MODEL_FADE_S'); if (a0 < 0 || b0 < a0) throw new Error('the motion tables were not found in main.js');
const { UNIT_MODELS } = new Function('UNIT_SPRITE_HEIGHT', src.slice(a0, b0) + '\nreturn { UNIT_MODELS };')(SPRITE_H);
const model = UNIT_MODELS[modelKey]; if (!model) throw new Error(`no model ${modelKey} in main.js`);
const file = ['.glb', '.wasm'].map((e) => path.join(root, 'client/public', model.file + e)).find((f) => { try { readFileSync(f); return true; } catch { return false; } });
if (!file) throw new Error(`no file for ${model.file}`);

// the file as three.js objects (named as GLTFLoader names them) and its animations as three.js clips (a smooth-curve channel sampled at 60 Hz)
const g = readGlb(file), j = g.json; const sanitize = (n) => n.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
const objs = j.nodes.map((n) => { const o = new THREE.Object3D(); o.name = sanitize(n.name ?? ''); if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); } return o; });
j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
const scene = new THREE.Object3D(); for (const r of j.scenes[j.scene ?? 0].nodes) scene.add(objs[r]); scene.updateMatrixWorld(true);
const TYPE = { translation: ['position', 'vector'], rotation: ['quaternion', 'quaternion'], scale: ['scale', 'vector'] };
const clipOf = (anim) => { const tracks = []; let duration = 0;
  for (const ch of anim.channels) { const s = anim.samplers[ch.sampler]; const n = j.nodes[ch.target.node]; const [prop, type] = TYPE[ch.target.path] ?? []; if (!prop) continue;
    let times = Array.from(accessor(g, s.input)), values = Array.from(accessor(g, s.output));
    if (s.interpolation === 'CUBICSPLINE') { const w = values.length / times.length / 3; const at = (k, part, c) => values[(3 * k + part) * w + c]; const oT = [], oV = []; const t0 = times[0], t1 = times[times.length - 1]; const steps = Math.max(1, Math.round((t1 - t0) * 60));
      for (let i = 0, k = 0; i <= steps; i += 1) { const t = i === steps ? t1 : t0 + (t1 - t0) * i / steps; while (k < times.length - 2 && t > times[k + 1]) k += 1; const dt = times.length > 1 ? times[k + 1] - times[k] : 0; const u = dt > 0 ? Math.min(1, Math.max(0, (t - times[k]) / dt)) : 0;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2; const v = []; for (let c = 0; c < w; c += 1) v.push(times.length > 1 ? h00 * at(k, 1, c) + h10 * dt * at(k, 2, c) + h01 * at(k + 1, 1, c) + h11 * dt * at(k + 1, 0, c) : at(0, 1, c));
        if (prop === 'quaternion') { const L = Math.hypot(...v) || 1; for (let c = 0; c < w; c += 1) v[c] /= L; } oT.push(t); oV.push(...v); } times = oT; values = oV; }
    duration = Math.max(duration, times[times.length - 1] ?? 0); const track = { name: `${sanitize(n.name)}.${prop}`, type, times, values }; if (s.interpolation === 'STEP') track.interpolation = 2300; tracks.push(track); }
  return THREE.AnimationClip.parse({ name: anim.name, duration, tracks }); };
const clips = new Map((j.animations ?? []).map((a) => [a.name, clipOf(a)]));

// the body's bind-pose box, as the client's modelBounds takes it: every mesh but the weapon's, a skinned one by its skinned corners in its own frame
const box = new THREE.Box3();
j.nodes.forEach((n, i) => { if (n.mesh == null || /weapon/i.test(n.name ?? '')) return; const o = objs[i]; const local = new THREE.Box3(); const inv = o.matrixWorld.clone().invert();
  const skin = n.skin != null ? j.skins[n.skin] : null; const ibm = skin ? accessor(g, skin.inverseBindMatrices) : null; const jm = skin ? skin.joints.map((jn, k) => objs[jn].matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(ibm, 16 * k))) : null;
  for (const prim of j.meshes[n.mesh].primitives) { const P = accessor(g, prim.attributes.POSITION); const J = skin ? accessor(g, prim.attributes.JOINTS_0) : null, W = skin ? accessor(g, prim.attributes.WEIGHTS_0) : null; const v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
    for (let k = 0; k < P.length / 3; k += 1) { v.set(P[3 * k], P[3 * k + 1], P[3 * k + 2]);
      if (skin) { acc.set(0, 0, 0); let ws = 0; for (let c = 0; c < 4; c += 1) { const w = W[4 * k + c]; if (!(w > 0)) continue; acc.addScaledVector(t.copy(v).applyMatrix4(jm[J[4 * k + c]]), w); ws += w; } if (ws > 0) acc.multiplyScalar(1 / ws); local.expandByPoint(acc.applyMatrix4(inv)); }
      else local.expandByPoint(v); } }
  if (!local.isEmpty()) box.union(local.applyMatrix4(o.matrixWorld)); });
const height = Math.max(0.01, box.max.y - box.min.y), scale = (model.height ?? SPRITE_H) / height;
const stand = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2 * scale, FOOT_Y - box.min.y * scale, -(box.min.z + box.max.z) / 2 * scale).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
const bone = objs.find((o) => o.name === sh.bone); if (!bone) throw new Error(`${path.basename(file)} has no bone ${sh.bone}`);
const rest = objs.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);

// the bone's frame through a motion: the box's centre and turn in the unit's frame
let mixer = null, clipNow = null, action = null;
const frameAt = (clip, t) => { if (clipNow !== clip) { objs.forEach((o, i) => { o.position.copy(rest[i][0]); o.quaternion.copy(rest[i][1]); o.scale.copy(rest[i][2]); }); mixer = new THREE.AnimationMixer(scene); action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); clipNow = clip; }
  mixer.setTime(Math.min(Math.max(0, t), clip.duration - 1e-6)); scene.updateMatrixWorld(true);
  const m = stand.clone().multiply(bone.matrixWorld); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s);
  const c = new THREE.Vector3(sh.c[0], sh.c[1], sh.c[2]).applyMatrix4(m); return { c, q, s }; };
const mean = (fs) => { const c = new THREE.Vector3(); const q = [0, 0, 0, 0]; for (const f of fs) { c.addScaledVector(f.c, 1 / fs.length); const d = fs[0].q.dot(f.q) < 0 ? -1 : 1; q[0] += d * f.q.x; q[1] += d * f.q.y; q[2] += d * f.q.z; q[3] += d * f.q.w; } const L = Math.hypot(...q); return { c, q: new THREE.Quaternion(q[0] / L, q[1] / L, q[2] / L, q[3] / L), s: fs[0].s }; };
const r3 = (x) => Math.round(x * 1000) / 1000; const row = (f) => [r3(f.c.x), r3(f.c.y), r3(f.c.z), r3(f.q.x), r3(f.q.y), r3(f.q.z), r3(f.q.w)];
// a round flown as the game flies one at a body on level ground — from 22 u, 0.8 over the shooter's root, at 0.8 over hers — against a frame's box
const half = sh.h.map((v) => v * scale);
const stops = (f, bearingDeg, k = 1) => { const a = bearingDeg * Math.PI / 180; const from = new THREE.Vector3(Math.sin(a) * 22, FIRE_Y, Math.cos(a) * 22), to = new THREE.Vector3(0, FIRE_Y, 0); const inv = f.q.clone().invert(); const A = from.sub(f.c).applyQuaternion(inv), B = to.sub(f.c).applyQuaternion(inv); let t0 = 0, t1 = 1; const kk = k;
  for (let k = 0; k < 3; k += 1) { const o = A.getComponent(k), d = B.getComponent(k) - o, h = half[k] * kk; if (Math.abs(d) < 1e-9) { if (o < -h || o > h) return false; } else { let x = (-h - o) / d, y = (h - o) / d; if (x > y) [x, y] = [y, x]; if (x > t0) t0 = x; if (y < t1) t1 = y; if (t0 > t1) return false; } } return true; };
const arc = (list) => { if (!list.length) return 'none'; const runs = []; let s0 = list[0], prev = list[0]; for (const v of list.slice(1)) { if (v !== prev + 5) { runs.push([s0, prev]); s0 = v; } prev = v; } runs.push([s0, prev]); return runs.map(([a, z]) => (a === z ? String(a) : `${a}..${z}`)).join(', '); };
const bearings = []; for (let b = -180; b < 180; b += 5) bearings.push(b);

const out = {}; const lines = [];
for (const [key, cfg] of Object.entries(model.clips ?? {})) { if (!cfg || cfg.from || key === 'death' || key === 'victoryIdle' || key === 'hit') continue; const clip = clips.get(cfg.name); if (!clip) continue;
  const once = !!cfg.once; const dur = clip.duration;
  // how long one pass lasts in play (seconds): a dodge the dodge's length, a reload the reload's, else the clip at its speed
  const played = cfg.fit === 'step' ? Math.max(50, unit.stepDurationMs ?? STEP_DURATION_MS) / 1000 : cfg.fit === 'reload' ? Math.max(100, unit.reloadMs ?? 1500) / 1000 : dur / (cfg.speed ?? 1);
  const N = 48; const all = []; for (let i = 0; i < N; i += 1) all.push(frameAt(clip, dur * i / N));
  const ks = all.flatMap((f) => [f.s.x / scale, f.s.y / scale, f.s.z / scale]); const kMotion = ks.reduce((a, v) => a + v, 0) / ks.length;
  if (ks.some((v) => Math.abs(v - kMotion) > 2e-3)) throw new Error(`${key}: the motion sizes the bone unevenly or changes its size on the way (${Math.min(...ks).toFixed(4)}..${Math.max(...ks).toFixed(4)}) — one factor a motion cannot say it`);
  let frames, entry;
  if (once) { const n = Math.max(1, Math.ceil(played / STEP - 1e-6)); frames = []; for (let i = 0; i <= n; i += 1) frames.push(frameAt(clip, dur * i / n)); entry = { dur: r3(played), frames: frames.map(row) }; }
  else { frames = [mean(all)]; entry = { frames: frames.map(row) }; }
  if (Math.abs(kMotion - 1) > 2e-3) entry.k = r3(kMotion);
  entry.clip = cfg.name;
  out[key] = entry;
  const ahead = all.filter((f) => stops(f, 0, kMotion)).length / N; const halfArc = bearings.filter((b) => all.filter((f) => stops(f, b, kMotion)).length / N >= 0.5); const tblArc = once ? bearings.filter((b) => frames.filter((f) => stops(f, b, kMotion)).length / frames.length >= 0.5) : bearings.filter((b) => stops(frames[0], b, kMotion));
  const m = mean(all); const nz = new THREE.Vector3(0, 0, 1).applyQuaternion(m.q); const top = Math.max(...all.map((f) => { let t = -1e9; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) t = Math.max(t, new THREE.Vector3(sx * half[0] * kMotion, sy * half[1] * kMotion, sz * half[2] * kMotion).applyQuaternion(f.q).add(f.c).y); return t; }));
  lines.push(`${key.padEnd(12)} ${String(cfg.name).padEnd(20)} ${once ? `once, ${played.toFixed(2)} s, ${frames.length} frames` : 'round, its mean'.padEnd(24)} | centre ahead ${m.c.z.toFixed(2)} left ${m.c.x.toFixed(2)} up ${m.c.y.toFixed(2)}, faces ${(Math.atan2(nz.x, nz.z) * 180 / Math.PI).toFixed(0)}, top to ${top.toFixed(2)} | dead ahead stopped ${Math.round(ahead * 100)}% of the motion; half or more of it from ${arc(halfArc)}; the table: ${arc(tblArc)}`); }
console.log(`${path.basename(file)}: the body ${height.toFixed(4)} tall in its file, drawn ${(model.height ?? SPRITE_H)} tall: x${scale.toFixed(4)}; the box's half sizes ${half.map((v) => v.toFixed(3)).join(' x ')} (${half.map((v) => (2 * v).toFixed(2)).join(' x ')} whole)`);
for (const l of lines) console.log(l);
const text = `// WHERE A SHIELD STANDS IN EACH MOTION — written by shared/tools/anim/shield_frames.mjs (node shield_frames.mjs <tree root> ${unitKey} ${modelKey} write);\n// not by hand. half: the box's half sizes in game units. A motion's frames: [centre x (to her left), y (up from the hit centre), z (ahead), then the\n// box's turn as a quaternion x, y, z, w], the unit facing +z; a motion with a \`dur\` is played once from its first frame over that many seconds, a frame\n// every dur / (frames - 1), and holds its last; one without goes round and has its mean alone; \`k\`: the motion's own sizing of the box (times half); \`clip\`: the motion's name in the file (two motions on one clip cut into each other, any other pair fades). Read by shield.js.\nexport const SHIELD_POSES = {\n  ${unitKey}: {\n    half: ${JSON.stringify(half.map(r3))},\n${Object.entries(out).map(([k, e]) => `    ${k}: { clip: '${e.clip}', ${e.k != null ? `k: ${e.k}, ` : ''}${e.dur != null ? `dur: ${e.dur}, ` : ''}frames: [${e.frames.map((f) => JSON.stringify(f)).join(', ')}] }`).join(',\n')}\n  }\n};\n`;
if (write) { writeFileSync(path.join(root, 'shared/src/sim/shield_poses.js'), text); console.log('written: shared/src/sim/shield_poses.js'); } else console.log('\n' + text);
