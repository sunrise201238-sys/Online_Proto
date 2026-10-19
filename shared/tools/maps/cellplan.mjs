// A plan of the generator's cells as a PNG: floors coloured by height (dim where no node walks), walls black, low cover
// orange, the void dark grey, a ceiling over a reached floor stippled magenta, ramps stippled white; a 1 m grid faint.
// usage: node cellplan.mjs <cells.json> <out.png> [x0 z0 x1 z1 in metres] [pxPerCell=3]
import { readFileSync, writeFileSync } from 'node:fs'; import { deflateSync } from 'node:zlib';
const [file, out, ...r] = process.argv.slice(2); const d = JSON.parse(readFileSync(file, 'utf8')); const { nx, nz, X0, Z0, CELL } = d;
const win = r.length >= 4 ? r.slice(0, 4).map(Number) : [X0, Z0, X0 + nx * CELL, Z0 + nz * CELL]; const P = Number(r[4] ?? 3);
const cx0 = Math.max(0, Math.floor((win[0] - X0) / CELL)), cz0 = Math.max(0, Math.floor((win[1] - Z0) / CELL)), cx1 = Math.min(nx, Math.ceil((win[2] - X0) / CELL)), cz1 = Math.min(nz, Math.ceil((win[3] - Z0) / CELL));
const W = (cx1 - cx0) * P, H = (cz1 - cz0) * P; const img = Buffer.alloc(W * H * 3);
const ramp = (h) => { // -3 blue .. 0 green .. 2.5 yellow .. 5.5 red .. 8 purple
  const stops = [[-3, [40, 80, 220]], [0, [60, 180, 80]], [2.5, [235, 220, 60]], [5.5, [230, 70, 50]], [8, [150, 60, 180]]];
  if (h <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i += 1) if (h <= stops[i][0]) { const t = (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return stops[i - 1][1].map((v, k) => Math.round(v + (stops[i][1][k] - v) * t)); } return stops[stops.length - 1][1]; };
const put = (px, pz, c) => { if (px < 0 || pz < 0 || px >= W || pz >= H) return; const o = (pz * W + px) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
for (let cz = cz0; cz < cz1; cz += 1) for (let cx = cx0; cx < cx1; cx += 1) { const i = cz * nx + cx; const f = d.floorH[i], w = d.wallH[i], wk = d.wallKey[i], reach = d.reach[i]; let col;
  if (w > 0) col = w >= 25 ? [70, 70, 70] : wk >= 1000 ? [240, 150, 40] : [0, 0, 0];
  else if (f == null) col = [205, 205, 200];
  else { col = ramp(f); if (!reach) col = col.map((v) => Math.round(v * 0.45 + 150 * 0.55)); }
  const ceil = f != null && reach && d.ceilH[i] != null, rampc = d.kind[i] === 1;
  for (let dz = 0; dz < P; dz += 1) for (let dx = 0; dx < P; dx += 1) { let c = col; if (ceil && ((dx + dz) % 2 === 0)) c = [200, 40, 200]; else if (rampc && dx === dz) c = [255, 255, 255]; put((cx - cx0) * P + dx, (cz - cz0) * P + dz, c); } }
// metre grid (every 5 m stronger)
for (let m = Math.ceil(win[0]); m <= win[2]; m += 1) { const px = Math.round((m - X0) / CELL - cx0) * P; const s = m % 10 === 0 ? 0 : m % 5 === 0 ? 90 : 150; if (m % 5 === 0 || P >= 6) for (let pz = 0; pz < H; pz += 1) { const o = (pz * W + px) * 3; if (px >= 0 && px < W) { img[o] = s; img[o + 1] = s; img[o + 2] = s; } } }
for (let m = Math.ceil(win[1]); m <= win[3]; m += 1) { const pz = Math.round((m - Z0) / CELL - cz0) * P; const s = m % 10 === 0 ? 0 : m % 5 === 0 ? 90 : 150; if (m % 5 === 0 || P >= 6) for (let px = 0; px < W; px += 1) { const o = (pz * W + px) * 3; if (pz >= 0 && pz < H) { img[o] = s; img[o + 1] = s; img[o + 2] = s; } } }
// png
const crcT = new Int32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(t), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y += 1) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`plan -> ${out} ${W}x${H} px, x ${win[0]}..${win[2]} z ${win[1]}..${win[3]} m, ${P} px per ${CELL} m cell; grid lines every metre (5 m darker, 10 m black)`);
