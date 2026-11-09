// rigcmp.mjs <minori.glb> <saori.glb> — Saori's battle clips' bones matched onto Minori's rig by name: rest turn and place gaps,
// what has no partner, the skins' joints on each side, and where the gun bones hang
import { NodeIO } from '@gltf-transform/core';
const [mF, sF] = process.argv.slice(2); const io = new NodeIO();
const M = await io.read(mF), Sd = await io.read(sF);
const san = (s) => (s || '').replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
const idx = (doc) => { const ex = new Map(), lo = new Map(); for (const n of doc.getRoot().listNodes()) { const k = san(n.getName()); if (!ex.has(k)) ex.set(k, n); if (!lo.has(k.toLowerCase())) lo.set(k.toLowerCase(), n); } return { ex, lo }; };
const mi = idx(M);
const CLIPS = ['Normal_Idle', 'Move_Ing', 'Normal_Attack_Ing', 'Move_Jump', 'Normal_Reload', 'Vital_Death', 'Vital_Retreat'];
const targets = new Map();
for (const a of Sd.getRoot().listAnimations()) if (CLIPS.includes(a.getName())) for (const c of a.listChannels()) { const n = c.getTargetNode(); if (!n) continue; const e = targets.get(n) ?? new Set(); e.add(c.getTargetPath()); targets.set(n, e); }
const rows = [], miss = [];
for (const [sn, paths] of targets) {
  const k = san(sn.getName()); let tn = mi.ex.get(k), how = 'exact'; if (!tn) { tn = mi.lo.get(k.toLowerCase()); how = 'case'; }
  if (!tn) { miss.push(`${sn.getName()} [${[...paths].join(',')}]`); continue; }
  const a = sn.getRotation(), b = tn.getRotation(); const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])); const deg = 2 * Math.acos(dot) * 180 / Math.PI;
  const ta = sn.getTranslation(), tb = tn.getTranslation(); const d = Math.hypot(ta[0] - tb[0], ta[1] - tb[1], ta[2] - tb[2]);
  const sa = sn.getScale(), sb = tn.getScale(); const ds = Math.hypot(sa[0] - sb[0], sa[1] - sb[1], sa[2] - sb[2]);
  rows.push({ name: sn.getName(), m: tn.getName(), how, deg, d, ds, paths: [...paths].join(','), parentS: sn.getParentNode()?.getName(), parentM: tn.getParentNode()?.getName() });
}
rows.sort((x, y) => y.deg - x.deg || y.d - x.d);
console.log(`Saori clip bones ${targets.size}: matched ${rows.length} (by case ${rows.filter((r) => r.how === 'case').length}), no partner in Minori ${miss.length}`);
console.log('-- no partner:', miss.join(' | '));
console.log('-- matched with rest gaps (turn > 2 deg or place > 0.005 or scale > 0.01, or another parent):');
for (const r of rows) if (r.how !== 'exact' || r.deg > 2 || r.d > 0.005 || r.ds > 0.01 || r.parentS !== r.parentM) console.log(`  ${r.how.padEnd(5)} ${r.name.padEnd(26)} turn ${r.deg.toFixed(1).padStart(6)} place ${r.d.toFixed(4)} scale ${r.ds.toFixed(3)} [${r.paths}] parent ${r.parentS}${r.parentS !== r.parentM ? ' vs ' + r.parentM : ''}`);
const driven = new Set(rows.map((r) => r.m));
for (const [label, doc] of [['Minori', M], ['Saori', Sd]]) for (const sk of doc.getRoot().listSkins()) { const users = doc.getRoot().listNodes().filter((n) => n.getSkin() === sk).map((n) => n.getName()); console.log(`-- ${label} skin (${users.slice(0, 2).join(', ')}${users.length > 2 ? ' +' + (users.length - 2) : ''}) joints ${sk.listJoints().length}`); if (sk.listJoints().length < 30) console.log('   ', sk.listJoints().map((j) => `${j.getName()}<${j.getParentNode()?.getName()}`).join(' | ')); }
const body = M.getRoot().listSkins()[0].listJoints();
const still = body.filter((j) => !driven.has(j.getName())).map((j) => j.getName());
console.log(`-- Minori body joints Saori's clips leave still: ${still.length}:`, still.join(', '));
