// Read-only probe: ladders as District models them — rails (thin vertical pieces) with rungs (short horizontal bars) between, at any pitch.
// usage: node scan_ladders.mjs <glb> <ground>   (model metres; heights printed over the street = y - ground)
import { readGlb, accessor, worlds, apply } from './glb_read.mjs';
const [file, gS] = process.argv.slice(2); const G = +gS;
const g = readGlb(file); const j = g.json; const W = worlds(j); const pieces = [];
for (let ni = 0; ni < j.nodes.length; ni += 1) { const n = j.nodes[ni]; if (n.mesh == null || !W[ni]) continue;
  for (const p of j.meshes[n.mesh].primitives) { if ((p.mode ?? 4) !== 4) continue; const pos = accessor(g, p.attributes.POSITION); const cnt = pos.length / 3; const idx = p.indices != null ? accessor(g, p.indices) : Int32Array.from({ length: cnt }, (_, i) => i);
    const wp = new Float64Array(cnt * 3); for (let v = 0; v < cnt; v += 1) { const q = apply(W[ni], pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); wp.set(q, 3 * v); }
    const key = new Map(); const wid = new Int32Array(cnt); for (let v = 0; v < cnt; v += 1) { const k = `${Math.round(wp[3 * v] * 500)},${Math.round(wp[3 * v + 1] * 500)},${Math.round(wp[3 * v + 2] * 500)}`; let id = key.get(k); if (id == null) { id = key.size; key.set(k, id); } wid[v] = id; }
    const par = Int32Array.from({ length: key.size }, (_, k) => k); const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t + 2 < idx.length; t += 3) { const a = find(wid[idx[t]]); for (const o of [idx[t + 1], idx[t + 2]]) { const b = find(wid[o]); if (b !== find(a)) par[b] = find(a); } }
    const bb = new Map(); for (let t = 0; t < idx.length; t += 1) { const v = idx[t]; const r = find(wid[v]); let e = bb.get(r); if (!e) { e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity, tris: 0 }; bb.set(r, e); }
      const x = wp[3 * v], y = wp[3 * v + 1], z = wp[3 * v + 2]; if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y; if (z < e.z0) e.z0 = z; if (z > e.z1) e.z1 = z; e.tris += 1 / 3; }
    const mat = p.material != null ? j.materials[p.material]?.name : ''; for (const e of bb.values()) pieces.push({ ...e, node: n.name, mat }); } }
const dx = (e) => e.x1 - e.x0, dy = (e) => e.y1 - e.y0, dz = (e) => e.z1 - e.z0;
// rungs: flat short bars; rails: thin tall posts
const rungs = pieces.filter((e) => dy(e) <= 0.2 && ((dx(e) <= 0.2 && dz(e) >= 0.45 && dz(e) <= 1.2) || (dz(e) <= 0.2 && dx(e) >= 0.45 && dx(e) <= 1.2)));
const rails = pieces.filter((e) => dx(e) <= 0.2 && dz(e) <= 0.2 && dy(e) >= 1.2);
// stack rungs: same plan centre (within 6 cm), same axis
const groups = new Map();
for (const r of rungs) { const ax = dx(r) > dz(r) ? 'x' : 'z'; const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; const k = `${ax}|${Math.round(cx / 0.06)}|${Math.round(cz / 0.06)}`; if (!groups.has(k)) groups.set(k, { ax, cx, cz, list: [] }); groups.get(k).list.push(r); }
const stacks = [];
for (const gr of groups.values()) { const ys = gr.list.map((r) => (r.y0 + r.y1) / 2).sort((a, b) => a - b); let run = [ys[0]];
  const flush = () => { if (run.length >= 3) { const pitch = (run[run.length - 1] - run[0]) / (run.length - 1); stacks.push({ ...gr, n: run.length, yLow: run[0], yHigh: run[run.length - 1], pitch, len: dx(gr.list[0]) > dz(gr.list[0]) ? dx(gr.list[0]) : dz(gr.list[0]) }); } };
  for (let i = 1; i < ys.length; i += 1) { if (ys[i] - ys[i - 1] <= 0.8) run.push(ys[i]); else { flush(); run = [ys[i]]; } } flush(); }
stacks.sort((a, b) => a.cx - b.cx || a.cz - b.cz);
console.log(`${pieces.length} pieces, ${rungs.length} rung-like bars, ${rails.length} rail-like posts, ${stacks.length} stacks of 3+ rungs`);
for (const s of stacks) { const near = rails.filter((r) => Math.abs((r.y0 + r.y1) / 2 - (s.yLow + s.yHigh) / 2) < (s.yHigh - s.yLow) / 2 + 1 && Math.hypot((r.x0 + r.x1) / 2 - s.cx, (r.z0 + r.z1) / 2 - s.cz) <= s.len / 2 + 0.3);
  console.log(`ladder? centre x ${s.cx.toFixed(2)} z ${s.cz.toFixed(2)} rungs along ${s.ax} ${s.len.toFixed(2)} m wide: ${s.n} rungs h ${(s.yLow - G).toFixed(2)}..${(s.yHigh - G).toFixed(2)} (pitch ${s.pitch.toFixed(2)}) rails ${near.length}${near.length ? ' h ' + near.map((r) => `${(r.y0 - G).toFixed(2)}..${(r.y1 - G).toFixed(2)}`).join(' / ') : ''}  [${s.list[0].node} ${s.list[0].mat}]`); }
