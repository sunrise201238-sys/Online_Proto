// gun.mjs <glb> — the gun bone's rest TRS, which clips key it (and its scale values), and the gun mesh's extent in the bone's own frame
import { NodeIO } from '@gltf-transform/core';
const [f] = process.argv.slice(2); const io = new NodeIO(); const doc = await io.read(f); const root = doc.getRoot();
const wpn = root.listNodes().find((n) => n.getName() === 'Bip001_Weapon');
const fmt = (a) => '[' + a.map((v) => v.toFixed(3)).join(', ') + ']';
console.log('Bip001_Weapon rest T', fmt(wpn.getTranslation()), 'R', fmt(wpn.getRotation()), 'S', fmt(wpn.getScale()), 'parent', wpn.getParentNode()?.getName());
const floats = (acc) => { const n = acc.getCount(), e = acc.getElementSize(), out = []; const el = []; for (let i = 0; i < n; i += 1) { acc.getElement(i, el); out.push([...el]); } return out; };
for (const a of root.listAnimations()) { const chs = a.listChannels().filter((c) => c.getTargetNode() === wpn); if (!chs.length) continue;
  const desc = chs.map((c) => { const v = floats(c.getSampler().getOutput()); if (c.getTargetPath() === 'scale') { const xs = v.map((x) => x[0]); return `scale ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}`; } if (c.getTargetPath() === 'translation') return `T0 ${fmt(v[0])}`; return c.getTargetPath(); });
  console.log(`  ${a.getName().padEnd(24)} ${desc.join(' | ')}`); }
// the gun mesh in its joints' bind frames
for (const n of root.listNodes()) { const m = n.getMesh(); const sk = n.getSkin(); if (!m || !sk || !/Weapon/i.test(n.getName())) continue;
  const joints = sk.listJoints(); const ibm = floats(sk.getInverseBindMatrices());
  const wi = joints.indexOf(wpn); if (wi < 0) { console.log(n.getName(), 'not on Bip001_Weapon'); continue; }
  const M = ibm[wi]; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of m.listPrimitives()) { const pos = floats(p.getAttribute('POSITION')); for (const v of pos) { const x = M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], y = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], z = M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]; const q = [x, y, z]; for (let c = 0; c < 3; c += 1) { mn[c] = Math.min(mn[c], q[c]); mx[c] = Math.max(mx[c], q[c]); } } }
  console.log(`  mesh ${n.getName()} in Bip001_Weapon's bind frame: min ${fmt(mn)} max ${fmt(mx)}; ibm scale ~ ${Math.hypot(M[0], M[1], M[2]).toFixed(3)}`); }
