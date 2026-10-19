import { readFileSync } from 'node:fs';
const [file, cellS, what] = process.argv.slice(2); const C = Number(cellS ?? 2);   // metres per char
const d = JSON.parse(readFileSync(file, 'utf8')); const { nx, nz, X0, Z0, CELL, GROUND } = d; const k = Math.round(C / CELL);
const rel = (h) => h - GROUND;
// histogram of floor heights (0.25 m bins) over cells with a floor
const hist = new Map(); let n = 0; for (let i = 0; i < nx * nz; i += 1) { const h = d.floorH[i]; if (h == null) continue; n += 1; const b = Math.round(rel(h) * 4) / 4; hist.set(b, (hist.get(b) ?? 0) + 1); }
console.log('floor cells', n, 'levels (m, cells): ' + [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([h, c]) => `${h}:${c}`).join(' '));
const W = Math.ceil(nx / k), H = Math.ceil(nz / k); const rows = [];
for (let r = 0; r < H; r += 1) { let s = ''; for (let c = 0; c < W; c += 1) { let best = null, ceil = 0, cnt = 0, reach = 0; for (let dz = 0; dz < k; dz += 1) for (let dx = 0; dx < k; dx += 1) { const ix = c * k + dx, iz = r * k + dz; if (ix >= nx || iz >= nz) continue; const i = iz * nx + ix; const h = d.floorH[i]; if (h == null) continue; cnt += 1; if (best == null || h > best) best = h; if (d.ceilH[i] != null) ceil += 1; if (d.reach[i]) reach += 1; }
  if (best == null) { s += ' '; continue; } const m = rel(best);
  if (what === 'ceil') { s += ceil > cnt / 2 ? (reach ? 'C' : 'c') : (reach ? '.' : ','); continue; }
  if (what === 'reach') { s += reach ? '#' : '.'; continue; }
  s += m < -0.5 ? (m < -2.5 ? 'B' : 'b') : m < 0.5 ? '0' : String.fromCharCode(48 + Math.min(9, Math.round(m))); } rows.push(s); }
console.log(`x ${X0}..${X0 + nx * CELL} m across ${W} chars, z ${Z0}.. down ${H} rows; ${what === 'ceil' ? 'C/c a ceiling over the floor (reached / not), . a reached open floor, , unreached' : what === 'reach' ? '# reached' : 'digit = floor m above ground (rounded), b -0.5..-2.5, B lower'}`);
let r0 = 0; for (const row of rows) { console.log(String(Math.round(Z0 + r0 * C)).padStart(5) + '|' + row); r0 += 1; }
