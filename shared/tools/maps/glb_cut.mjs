// A node's mesh cut by a world z plane: the part on one side kept, the triangles across the plane clipped (every attribute
// interpolated), and the cut closed with cap faces where it opens a box (the loops of cut edges triangulated), in the
// mesh's own material. The new buffers are appended to the GLB; the old data stays in the file, unreferenced.
// usage: node glb_cut.mjs <in.glb> <out.glb> <nodeName> <zWorld> <keep: below|above> [capUvScale m per uv unit]
import { writeFileSync } from 'node:fs'; import { readGlb, accessor, worlds, apply, TYPES, COMPS } from './glb_read.mjs';
const [inF, outF, nodeName, zS, keepS, uvS] = process.argv.slice(2); const Z = Number(zS); const KEEP_BELOW = (keepS ?? 'below') === 'below'; const EPS = 1e-4;
const g = readGlb(inF); const json = g.json; const W = worlds(json); const ni = json.nodes.findIndex((n) => n.name === nodeName); if (ni < 0) throw new Error(`no node ${nodeName}`); const n = json.nodes[ni]; const mesh = json.meshes[n.mesh]; const Wn = W[ni];
// the inverse of the node's world matrix, to put cap faces (made in world space) back into local space
const inv = (M) => { const m = M; const r = new Array(16); const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]; const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32; let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; det = 1 / det; r[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; r[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; r[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; r[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det; r[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; r[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; r[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; r[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det; r[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; r[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; r[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; r[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det; r[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; r[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; r[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; r[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det; return r; };
const Wi = inv(Wn);
let added = [];   // new bufferViews' bytes
const appendView = (arr) => { const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (bytes.length % 4)) % 4; const offset = g.bl + added.reduce((a, b) => a + b.length, 0); added.push(Buffer.concat([bytes, Buffer.alloc(pad)])); json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }); return json.bufferViews.length - 1; };
const addAccessor = (arr, type, componentType, withMinMax) => { const bv = appendView(arr); const nC = COMPS[type]; const a = { bufferView: bv, componentType, count: arr.length / nC, type }; if (withMinMax) { a.min = new Array(nC).fill(Infinity); a.max = new Array(nC).fill(-Infinity); for (let k = 0; k < arr.length; k += nC) for (let c = 0; c < nC; c += 1) { a.min[c] = Math.min(a.min[c], arr[k + c]); a.max[c] = Math.max(a.max[c], arr[k + c]); } } json.accessors.push(a); return json.accessors.length - 1; };
let totalKept = 0, totalClipped = 0, totalDropped = 0, capTris = 0;
mesh.primitives.forEach((p) => {
  const names = Object.keys(p.attributes); const attrs = {}; for (const k of names) attrs[k] = { arr: accessor(g, p.attributes[k]), n: COMPS[json.accessors[p.attributes[k]].type], ct: json.accessors[p.attributes[k]].componentType };
  const pos = attrs.POSITION.arr; const idx = p.indices != null ? accessor(g, p.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, k) => k); const nv = pos.length / 3;
  const wz = new Float64Array(nv); for (let k = 0; k < nv; k += 1) wz[k] = apply(Wn, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2])[2];
  const side = (i) => KEEP_BELOW ? wz[i] - Z : Z - wz[i];   // (< 0: kept side)
  const out = {}; for (const k of names) out[k] = []; const oidx = []; let count = 0;
  const pushV = (vals) => { for (const k of names) out[k].push(...vals[k]); return count++; };
  const vertVals = (i) => { const v = {}; for (const k of names) v[k] = Array.from(attrs[k].arr.subarray(i * attrs[k].n, (i + 1) * attrs[k].n)); return v; };
  const lerpVals = (a, b, t) => { const v = {}; for (const k of names) { v[k] = a[k].map((x, c) => x + (b[k][c] - x) * t); if (k === 'NORMAL') { const l = Math.hypot(...v[k]) || 1; v[k] = v[k].map((x) => x / l); } } return v; };
  const segs = [];   // cut edges on the plane, in world xy
  for (let t = 0; t + 2 < idx.length; t += 3) { const ids = [idx[t], idx[t + 1], idx[t + 2]]; const s = ids.map(side); const inside = ids.filter((_, k) => s[k] <= EPS);
    if (inside.length === 3) { totalKept += 1; oidx.push(...ids.map((i) => pushV(vertVals(i)))); continue; }
    if (inside.length === 0) { totalDropped += 1; continue; }
    totalClipped += 1;
    // the polygon of the kept side: walk the triangle's edges, keeping inside vertices and the crossings
    const poly = []; const cuts = []; for (let k = 0; k < 3; k += 1) { const a = ids[k], b = ids[(k + 1) % 3]; const sa = s[k], sb = s[(k + 1) % 3]; if (sa <= EPS) poly.push(vertVals(a)); if ((sa <= EPS) !== (sb <= EPS)) { const tt = sa / (sa - sb); const v = lerpVals(vertVals(a), vertVals(b), tt); poly.push(v); cuts.push(v); } }
    for (let k = 1; k + 1 < poly.length; k += 1) oidx.push(pushV(poly[0]), pushV(poly[k]), pushV(poly[k + 1]));
    if (cuts.length === 2) { const a = apply(Wn, ...cuts[0].POSITION), b = apply(Wn, ...cuts[1].POSITION); segs.push([[a[0], a[1]], [b[0], b[1]]]); } }
  // caps: the cut segments joined into loops (ends welded at 2 mm), each loop ear-clipped in the plane's xy
  const key = (q) => `${q[0].toFixed(3)},${q[1].toFixed(3)}`; const adj = new Map(); for (const [a, b] of segs) { for (const [p0, p1] of [[a, b], [b, a]]) { const k = key(p0); if (!adj.has(k)) adj.set(k, { p: p0, next: [] }); adj.get(k).next.push(key(p1)); } }
  // (chains: from each end point (one neighbour) along the cut edges to the other end; a chain is closed by the straight
  // line between its ends — a box open at its bottom, a raised floor on the hall's floor, gets its cap; a lone wall plane
  // makes a chain of one segment, two points, no area, no cap. Closed rings are walked from any point.)
  const usedSeg = new Set(); const loops = []; const walkFrom = (k0) => { let prev = null, cur = k0; const chain = []; for (let guard = 0; guard < 10000; guard += 1) { const e = adj.get(cur); if (!e) break; chain.push(e.p); const nx = e.next.find((q) => q !== prev && !usedSeg.has([cur, q].sort().join('|'))); if (nx == null) break; usedSeg.add([cur, nx].sort().join('|')); prev = cur; cur = nx; if (cur === k0) break; } return chain; };
  for (const [k0, e0] of adj) if (e0.next.length === 1) { const c = walkFrom(k0); if (c.length >= 3) loops.push(c); }
  for (const [k0, e0] of adj) if (e0.next.length === 2 && !e0.next.every((q) => usedSeg.has([k0, q].sort().join('|')))) { const c = walkFrom(k0); if (c.length >= 3) loops.push(c); }
  const uvScale = Number(uvS ?? 2.5); const capN = KEEP_BELOW ? [0, 0, 1] : [0, 0, -1];
  for (const loop of loops) { const pts = loop.map((q) => [q[0], q[1]]); let area = 0; for (let i = 0; i < pts.length; i += 1) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; } if (Math.abs(area) < 1e-4) continue; if (area < 0) pts.reverse();
    const vIdx = pts.map((q) => { const wp = [q[0], q[1], Z]; const lp = apply(Wi, ...wp); const v = {}; for (const k of names) v[k] = k === 'POSITION' ? lp : k === 'NORMAL' ? capN : k === 'TEXCOORD_0' ? [q[0] / uvScale, q[1] / uvScale] : new Array(attrs[k].n).fill(k === 'COLOR_0' ? 1 : 0); return pushV(v); });
    const P = pts.slice(); const I = vIdx.slice(); const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const inTri = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
    let guard = 0; while (P.length > 3 && guard++ < 5000) { let cut = false; for (let i = 0; i < P.length; i += 1) { const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length]; if (cross(a, b, c) <= 1e-9) continue; let ok = true; for (let j = 0; j < P.length && ok; j += 1) { if (j === i || j === (i + P.length - 1) % P.length || j === (i + 1) % P.length) continue; if (inTri(P[j], a, b, c)) ok = false; } if (!ok) continue; oidx.push(I[(i + P.length - 1) % P.length], I[i], I[(i + 1) % P.length]); capTris += 1; P.splice(i, 1); I.splice(i, 1); cut = true; break; } if (!cut) break; } if (P.length === 3) { oidx.push(I[0], I[1], I[2]); capTris += 1; } }
  for (const k of names) { const T = TYPES[attrs[k].ct]; const arr = new T(out[k]); p.attributes[k] = addAccessor(arr, json.accessors[p.attributes[k]].type, attrs[k].ct, k === 'POSITION'); if (k !== 'POSITION') { delete json.accessors[p.attributes[k]].min; delete json.accessors[p.attributes[k]].max; } }
  p.indices = addAccessor(new Uint32Array(oidx), 'SCALAR', 5125, false); json.accessors[p.indices].count = oidx.length; console.log(`primitive: kept ${totalKept}, clipped ${totalClipped}, dropped ${totalDropped}, cap loops ${loops.length}, cap triangles ${capTris}; ${count} vertices out`); });
// write the GLB: the JSON chunk (padded with spaces), the binary chunk with the new views appended
const binAll = Buffer.concat([g.bin, ...added]); json.buffers[0].byteLength = binAll.length;
let jsonBytes = Buffer.from(JSON.stringify(json)); const jp = (4 - (jsonBytes.length % 4)) % 4; if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binAll.length, 8);
const ch1 = Buffer.alloc(8); ch1.writeUInt32LE(jsonBytes.length, 0); ch1.write('JSON', 4); const ch2 = Buffer.alloc(8); ch2.writeUInt32LE(binAll.length, 0); ch2.write('BIN\0', 4);
writeFileSync(outF, Buffer.concat([header, ch1, jsonBytes, ch2, binAll])); console.log(`-> ${outF} (${(12 + 16 + jsonBytes.length + binAll.length) / 1048576 | 0} MB)`);
