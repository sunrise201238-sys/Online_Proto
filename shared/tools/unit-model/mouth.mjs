// mouth.mjs <glb> — each Mouth_* mesh: morph targets, default weights; which clips key their weights and to what
import { NodeIO } from '@gltf-transform/core';
const [f] = process.argv.slice(2); const io = new NodeIO(); const doc = await io.read(f); const root = doc.getRoot();
const floats = (acc) => { const n = acc.getCount(), out = []; const el = []; for (let i = 0; i < n; i += 1) { acc.getElement(i, el); out.push(...el); } return out; };
const mouths = root.listNodes().filter((n) => /^Mouth_/.test(n.getName()) && n.getMesh());
for (const n of mouths) { const m = n.getMesh(); const p = m.listPrimitives()[0]; console.log(`${n.getName()}: targets ${p.listTargets().length}, mesh weights [${m.getWeights().join(',')}], node weights [${n.getWeights().join(',')}]`); }
for (const a of root.listAnimations()) { const chs = a.listChannels().filter((c) => c.getTargetPath() === 'weights'); if (!chs.length) continue;
  const vis = chs.map((c) => { const v = floats(c.getSampler().getOutput()); return `${c.getTargetNode()?.getName()}:${Math.min(...v).toFixed(1)}..${Math.max(...v).toFixed(1)}`; });
  console.log(`  ${a.getName().padEnd(22)} ${vis.join(' ')}`); }
