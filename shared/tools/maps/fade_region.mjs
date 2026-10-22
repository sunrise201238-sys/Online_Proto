// What the fade did with the model's triangles in a region: those in fade things (by thing, with its hull columns) and those
// left in the rest (never fade), with the seed test's reading of each rest triangle (flat?, outside?, floor under it, tall?).
// usage: NODE_PATH=$(npm root -g) node fade_region.mjs <tree> <client/dist> <mapKey> <cxM> <czM> <x0M> <x1M> <z0M> <z1M>
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [tree, dir, mapKey, cxS, czS, ...R] = process.argv.slice(2); const CXM = Number(cxS), CZM = Number(czS); const [X0, X1, Z0, Z1] = R.map(Number);
const U = (m, c) => (m - c) * 4; const reg = { minX: U(X0, CXM), maxX: U(X1, CXM), minZ: U(Z0, CZM), maxZ: U(Z1, CZM) };
const arena = await import(path.resolve(tree, 'shared/src/sim/arena.js')); const C = await import(path.resolve(tree, 'shared/src/sim/constants.js'));
const obstacles = arena.getArenaObstacles(mapKey), surfaces = arena.getArenaSurfaces(mapKey), bounds = arena.getArenaBounds(mapKey); const GB = C.GROUND_BASE_Y, TALL = 2 * GB, COL = 8;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
const tris = await p.evaluate((reg) => { const T = window.__THREE; const w = [new T.Vector3(), new T.Vector3(), new T.Vector3()]; const out = []; const fadeSet = new Set(window.__gvgState.wallFadeMeshes ?? []);
  let sceneRoot = (window.__gvgState.wallFadeMeshes ?? [])[0]; while (sceneRoot?.parent) sceneRoot = sceneRoot.parent;
  sceneRoot.traverse((m) => { if (!m.isMesh || !m.geometry?.attributes?.position) return; const g = m.geometry; const pos = g.attributes.position; const idx = g.index ? g.index.array : null; const n = idx ? idx.length : pos.count; if (n < 3) return;
    for (let t = 0; t + 2 < n; t += 3) { for (let k = 0; k < 3; k += 1) w[k].fromBufferAttribute(pos, idx ? idx[t + k] : t + k).applyMatrix4(m.matrixWorld); const cx = (w[0].x + w[1].x + w[2].x) / 3, cy = (w[0].y + w[1].y + w[2].y) / 3, cz = (w[0].z + w[1].z + w[2].z) / 3; if (cx < reg.minX || cx > reg.maxX || cz < reg.minZ || cz > reg.maxZ) continue;
      const ax = w[1].x - w[0].x, ay = w[1].y - w[0].y, az = w[1].z - w[0].z, bx = w[2].x - w[0].x, by = w[2].y - w[0].y, bz = w[2].z - w[0].z; const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const len = Math.hypot(nx, ny, nz); const ys = [w[0].y, w[1].y, w[2].y];
      out.push({ cx, cy, cz, flat: Math.abs(ny) >= 0.7 * len, area: len / 2, ymin: Math.min(...ys), ymax: Math.max(...ys), fade: fadeSet.has(m) ? m.userData.fadeGroup : null, parts: m.userData.fadeBox?.parts?.length ?? 0, mesh: m.name || m.parent?.name || '?', ds: m.material?.side === 2 }); } });
  return out; }, reg);
await b.close(); server.close();
const floorAt = (x, z, below) => { let f = 0; for (const s of surfaces) { if (x < s.minX - COL || x > s.maxX + COL || z < s.minZ - COL || z > s.maxZ + COL) continue; const h = s.type === 'plane' ? s.y0 + s.gx * (Math.max(s.minX, Math.min(x, s.maxX)) - s.minX) + s.gz * (Math.max(s.minZ, Math.min(z, s.maxZ)) - s.minZ) : s.top; if (h <= below && h > f) f = h; } return f; };
const solidAt = (x, y, z) => obstacles.some((o) => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && y >= o.minY && y <= o.maxY);
const M = (u, c) => (u / 4 + c).toFixed(1);
const byThing = new Map(); const rest = [];
for (const t of tris) { if (t.fade) { const e = byThing.get(t.fade) ?? { n: 0, parts: t.parts, area: 0, ymin: Infinity, ymax: -Infinity }; e.n += 1; e.area += t.area; e.ymin = Math.min(e.ymin, t.ymin); e.ymax = Math.max(e.ymax, t.ymax); byThing.set(t.fade, e); } else rest.push(t); }
console.log(`region x ${X0}..${X1} z ${Z0}..${Z1} m: ${tris.length} triangles; in things ${tris.length - rest.length}, in the rest ${rest.length}`);
for (const [g, e] of byThing) console.log(`  ${g}: ${e.n} tris, ${(e.area / 16).toFixed(1)} m², y ${(e.ymin / 4).toFixed(1)}..${(e.ymax / 4).toFixed(1)} m, hull ${e.parts} cols`);
const bins = new Map(); for (const t of rest) { const outside = Math.abs(t.cx) > bounds.halfX || Math.abs(t.cz) > bounds.halfZ; const fl = floorAt(t.cx, t.cz, t.flat ? t.cy - TALL : t.cy + 2); const seed = outside ? t.cy >= TALL : t.flat ? !solidAt(t.cx, t.cy - TALL, t.cz) && t.cy - fl >= TALL : t.cy - fl >= TALL; const k = `${t.mesh} ${t.flat ? 'flat' : 'steep'} ${outside ? 'outside' : 'inside'} ${seed ? 'SEEDS' : 'no seed'} ${t.ds ? 'ds' : 'ss'}`; const e = bins.get(k) ?? { n: 0, area: 0, ymin: Infinity, ymax: -Infinity, fl: [], eg: null }; e.n += 1; e.area += t.area; e.ymin = Math.min(e.ymin, t.ymin); e.ymax = Math.max(e.ymax, t.ymax); if (e.fl.length < 3) e.fl.push((fl / 4).toFixed(1)); if (!e.eg) e.eg = `(${M(t.cx, CXM)}, ${M(t.cz, CZM)}) y ${(t.cy / 4).toFixed(1)}`; bins.set(k, e); }
for (const [k, e] of [...bins.entries()].sort((a, b) => b[1].area - a[1].area).slice(0, 12)) console.log(`  rest: ${k}: ${e.n} tris, ${(e.area / 16).toFixed(1)} m², y ${(e.ymin / 4).toFixed(1)}..${(e.ymax / 4).toFixed(1)} m, floor read ${e.fl.join('/')} m, e.g. ${e.eg} m`);
