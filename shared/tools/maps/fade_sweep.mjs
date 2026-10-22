// The fade, map-wide, against the model itself: at every standable spot and four camera headings, does a steep model face
// (a wall) cross the line from the camera to the chest, and does a thing's hull then cross it too? A wall face crossed with
// no hull crossed is a bad case: the wall is there, black, and fades nothing. Classed by the thing the face belongs to.
// Every face counts here, the flat ones too (a crate's lid, a roof): a face crossed that is not in a thing whose hull the line
// crosses is a texture blocking the sight (user 2026-10-22).
// usage: NODE_PATH=$(npm root -g) node fade_sweep4.mjs <tree> <client/dist> <mapKey> <cxM> <czM> [stepU=8]
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [tree, dir, mapKey, cxS, czS, stepS] = process.argv.slice(2); const CXM = Number(cxS), CZM = Number(czS), STEP = Number(stepS ?? 8);
const arena = await import(path.resolve(tree, 'shared/src/sim/arena.js')); const C = await import(path.resolve(tree, 'shared/src/sim/constants.js'));
const obstacles = arena.getArenaObstacles(mapKey), surfaces = arena.getArenaSurfaces(mapKey), bounds = arena.getArenaBounds(mapKey);
const GB = C.GROUND_BASE_Y, TALL = 2 * GB; const OFF = [-1.2, 21.2, -12.4];
const hAt = (s, x, z) => s.heightAt ? s.heightAt(x, z) : s.type === 'plane' ? s.y0 + s.gx * (Math.max(s.minX, Math.min(x, s.maxX)) - s.minX) + s.gz * (Math.max(s.minZ, Math.min(z, s.maxZ)) - s.minZ) : s.top;
const floorAt = (x, z, below) => { let f = -Infinity; for (const s of surfaces) { if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue; const h = hAt(s, x, z); if (h <= below && h > f) f = h; } return f; };
const segs = [];
for (let x = -bounds.halfX + 4; x < bounds.halfX; x += STEP) for (let z = -bounds.halfZ + 4; z < bounds.halfZ; z += STEP) {
  const h = floorAt(x, z, Infinity); if (!Number.isFinite(h)) continue;
  if (obstacles.some((o) => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && o.minY < h + TALL && o.maxY > h + 0.6)) continue;
  const rootY = h + GB; for (let yaw = 0; yaw < 4; yaw += 1) { const s = Math.sin(yaw * Math.PI / 2), c = Math.cos(yaw * Math.PI / 2); segs.push({ x, z, h, yaw, cam: [x + OFF[0] * c - OFF[2] * s, rootY + OFF[1], z + OFF[0] * s + OFF[2] * c], tgt: [x, rootY + 1.6, z] }); } }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
if (process.env.OLDFILTER) await p.evaluate(() => { window.__OLDFILTER = true; });
const res = await p.evaluate((segs) => { const T = window.__THREE; const CELL = 8; const w = [new T.Vector3(), new T.Vector3(), new T.Vector3()]; const fade = window.__gvgState.wallFadeMeshes ?? []; const fadeSet = new Set(fade);
  let sceneRoot = fade[0]; while (sceneRoot?.parent) sceneRoot = sceneRoot.parent;
  const things = new Map(); for (const m of fade) { const bx = m.userData.fadeBox; const g = m.userData.fadeGroup; if (!bx || !g?.startsWith('glb-fade')) continue; const e = things.get(g) ?? { parts: [], tris: 0 }; e.parts.push(...(bx.parts ?? []).map((c) => ({ minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY, minZ: c.minZ, maxZ: c.maxZ, tri: c.tri ? [...c.tri] : null }))); things.set(g, e); }
  // (the steep faces of the model, by 2 m cell of their box; a face in several cells is listed in each)
  const cells = new Map(); let nTri = 0;
  sceneRoot.traverse((m) => { if (!m.isMesh || !m.geometry?.attributes?.position) return; const isFade = fadeSet.has(m); if (!isFade && !(m.name?.startsWith('Object_') || m.parent?.name?.startsWith('Object_') || m.parent?.name?.startsWith('_Combined'))) return; const g = m.geometry; const pos = g.attributes.position; const idx = g.index ? g.index.array : null; const n = idx ? idx.length : pos.count; const grp = isFade ? m.userData.fadeGroup : null;
    for (let t = 0; t + 2 < n; t += 3) { for (let k = 0; k < 3; k += 1) w[k].fromBufferAttribute(pos, idx ? idx[t + k] : t + k).applyMatrix4(m.matrixWorld); const ax = w[1].x - w[0].x, ay = w[1].y - w[0].y, az = w[1].z - w[0].z, bx = w[2].x - w[0].x, by = w[2].y - w[0].y, bz = w[2].z - w[0].z; const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const len = Math.hypot(nx, ny, nz); if (len < 1e-6) continue; const flat = Math.abs(ny) >= 0.7 * len;
      const tri = { a: [w[0].x, w[0].y, w[0].z], b: [w[1].x, w[1].y, w[1].z], c: [w[2].x, w[2].y, w[2].z], g: grp, flat, ymin: Math.min(w[0].y, w[1].y, w[2].y), ymax: Math.max(w[0].y, w[1].y, w[2].y), post: Math.max(w[0].x, w[1].x, w[2].x) - Math.min(w[0].x, w[1].x, w[2].x) < 2.3 && Math.max(w[0].z, w[1].z, w[2].z) - Math.min(w[0].z, w[1].z, w[2].z) < 2.3 }; nTri += 1;
      const x0 = Math.floor(Math.min(w[0].x, w[1].x, w[2].x) / CELL), x1 = Math.floor(Math.max(w[0].x, w[1].x, w[2].x) / CELL), z0 = Math.floor(Math.min(w[0].z, w[1].z, w[2].z) / CELL), z1 = Math.floor(Math.max(w[0].z, w[1].z, w[2].z) / CELL);
      for (let ix = x0; ix <= x1; ix += 1) for (let iz = z0; iz <= z1; iz += 1) { const key = `${ix},${iz}`; let l = cells.get(key); if (!l) { l = []; cells.set(key, l); } l.push(tri); } } });
  const segTri = (o, d, tri) => { const e1 = [tri.b[0] - tri.a[0], tri.b[1] - tri.a[1], tri.b[2] - tri.a[2]], e2 = [tri.c[0] - tri.a[0], tri.c[1] - tri.a[1], tri.c[2] - tri.a[2]]; const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]; const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2]; if (Math.abs(det) < 1e-9) return -1; const inv = 1 / det; const tv = [o[0] - tri.a[0], o[1] - tri.a[1], o[2] - tri.a[2]]; const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv; if (u < 0 || u > 1) return -1; const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]]; const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv; if (v < 0 || u + v > 1) return -1; const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv; return t >= 0 && t <= 1 ? t : -1; };
  const hit = (a, c, o) => { let t0 = 0, t1 = 1; for (const [k0, k1, pa, pc] of [['minX', 'maxX', a[0], c[0]], ['minY', 'maxY', a[1], c[1]], ['minZ', 'maxZ', a[2], c[2]]]) { const d = pc - pa; if (Math.abs(d) < 1e-9) { if (pa < o[k0] || pa > o[k1]) return false; continue; } let ta = (o[k0] - pa) / d, tb = (o[k1] - pa) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } return true; };
  const out = [];
  for (const s of segs) { const d = [s.tgt[0] - s.cam[0], s.tgt[1] - s.cam[1], s.tgt[2] - s.cam[2]]; const keys = new Set(); for (let k = 0; k <= 8; k += 1) { const f = k / 8; keys.add(`${Math.floor((s.cam[0] + d[0] * f) / CELL)},${Math.floor((s.cam[2] + d[2] * f) / CELL)}`); }
    const crossed = []; const seen = new Set(); for (const key of keys) for (const tri of cells.get(key) ?? []) { if (seen.has(tri)) continue; seen.add(tri); if (tri.ymax < s.h + 2) continue; const t = segTri(s.cam, d, tri); if (t >= 0) crossed.push({ t, g: tri.g ?? '-', flat: tri.flat, post: tri.post }); }
    const fading = new Set(); for (const [g, e] of things) { for (const part of e.parts) if (hit(s.cam, s.tgt, part) && (!part.tri || segTri(s.cam, d, { a: part.tri.slice(0, 3), b: part.tri.slice(3, 6), c: part.tri.slice(6, 9) }) >= 0)) { fading.add(g); break; } }
    if (!crossed.length) { out.push(fading.size ? { approach: true, fading: [...fading] } : null); continue; }
    const blocking = crossed.filter((c) => !fading.has(c.g)); blocking.sort((a, b) => a.t - b.t);
    out.push({ crossed: crossed.length, fading: [...fading], blocking: blocking.slice(0, 3) }); }
  return { out, nTri, things: things.size }; }, segs);
await b.close(); server.close();
const M = (u, c) => (u / 4 + c).toFixed(1);
let crossed = 0, bad = 0, approach = 0; const cls = {}; const byG = new Map();
const byA = new Map();
res.out.forEach((r, i) => { if (!r) return; if (r.approach) { approach += 1; const s = segs[i]; const e = byA.get(r.fading[0]) ?? { n: 0, eg: [] }; e.n += 1; if (e.eg.length < 3) e.eg.push(`(${M(s.x, CXM)}, ${M(s.z, CZM)}) yaw ${s.yaw * 90}`); byA.set(r.fading[0], e); return; } crossed += 1; if (!r.blocking.length) return; bad += 1; const b = r.blocking[0]; const k = b.g === '-' ? (b.flat ? 'a flat face in no thing (a lid, a roof)' : 'a steep face in no thing') : b.post ? 'a post face in a thing (no column by design)' : b.flat ? 'a flat face in a thing whose hull is not crossed' : 'a steep face in a thing whose hull is not crossed'; cls[k] = (cls[k] ?? 0) + 1; const s = segs[i]; const hp = [s.cam[0] + (s.tgt[0] - s.cam[0]) * b.t, s.cam[1] + (s.tgt[1] - s.cam[1]) * b.t, s.cam[2] + (s.tgt[2] - s.cam[2]) * b.t]; const gk = `${b.g} ${b.flat ? 'flat' : 'steep'}`; const e = byG.get(gk) ?? { n: 0, eg: [], fading: new Set() }; e.n += 1; r.fading.forEach((g) => e.fading.add(g)); if (e.eg.length < 3) e.eg.push(`(${M(s.x, CXM)}, ${M(s.z, CZM)}) yaw ${s.yaw * 90} hits (${M(hp[0], CXM)}, ${M(hp[2], CZM)}) y ${(hp[1] / 4).toFixed(1)} m`); byG.set(gk, e); });
console.log(`segments ${segs.length}; faces ${res.nTri}; things ${res.things}; lines crossing a face ${crossed}; of these with a face that fades nothing ${bad} ${JSON.stringify(cls)}; lines that fade with no face on them ${approach}`);
console.log('fading with no face on the line, by thing:'); for (const [g, e] of [...byA.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) console.log(`  ${g}: ${e.n} — ${e.eg.join(' | ')}`);
for (const [g, e] of [...byG.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 24)) console.log(`  ${g}: ${e.n} (fading meanwhile: ${[...e.fading].slice(0, 3).join(' ') || 'nothing'}) — ${e.eg.join(' | ')}`);
