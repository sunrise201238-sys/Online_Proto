// scale.mjs <glb> — the scene's top nodes with their scale, the chain above Bip001, body joints' bind scale, the body's bind height
import { NodeIO } from '@gltf-transform/core';
const [f] = process.argv.slice(2); const io = new NodeIO(); const doc = await io.read(f); const root = doc.getRoot();
const fmt = (a) => '[' + a.map((v) => v.toFixed(3)).join(', ') + ']';
const scene = root.listScenes()[0]; console.log('scene top:', scene.listChildren().map((n) => `${n.getName()} S${fmt(n.getScale())} R${fmt(n.getRotation())}`).join(' | '));
const bip = root.listNodes().find((n) => n.getName() === 'Bip001'); const chain = []; for (let p = bip; p; p = p.getParentNode()) chain.unshift(`${p.getName()} T${fmt(p.getTranslation())} S${fmt(p.getScale())}`); console.log('chain to Bip001:', chain.join(' > '));
const floats = (acc) => { const n = acc.getCount(), out = []; const el = []; for (let i = 0; i < n; i += 1) { acc.getElement(i, el); out.push([...el]); } return out; };
const bodyNode = root.listNodes().find((n) => n.getMesh() && n.getSkin() && n.getSkin().listJoints().length > 100 && !/Mouth/.test(n.getName()));
const sk = bodyNode.getSkin(); const ibm = floats(sk.getInverseBindMatrices()); const js = sk.listJoints();
for (const name of ['Bip001', 'Bip001 Pelvis', 'Bip001 Head', 'Bip001 R Hand']) { const i = js.findIndex((j) => j.getName() === name); if (i < 0) continue; const M = ibm[i]; console.log(`  ibm ${name}: scale ${Math.hypot(M[0], M[1], M[2]).toFixed(3)} origin-at ${fmt(bodyNode.getWorldMatrix ? [0, 0, 0] : [0, 0, 0])} world T of joint ${fmt(js[i].getWorldTranslation())}`); }
let mn = 1e9, mx = -1e9; for (const p of bodyNode.getMesh().listPrimitives()) for (const v of floats(p.getAttribute('POSITION'))) { mn = Math.min(mn, v[1]); mx = Math.max(mx, v[1]); }
console.log(`  body mesh ${bodyNode.getName()} raw y ${mn.toFixed(3)}..${mx.toFixed(3)} (height ${(mx - mn).toFixed(3)}), node S ${fmt(bodyNode.getScale())}, parent ${bodyNode.getParentNode()?.getName() ?? 'scene'}`);
