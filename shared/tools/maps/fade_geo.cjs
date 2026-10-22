// A geometric check of the fade around a spot, without the game's camera: the camera placed at a measured offset from the
// player (metres: dx, dy, dz), the segment to the player's chest tested against every thing's hull columns (slab test, as
// the game's), at points on a ring around the spot. usage: NODE_PATH=$(npm root -g) node fade_geo.cjs <client/dist> <mapKey> <cxM> <czM> <radiusM> [dx dy dz = -0.3 5.3 -3.1]
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, cxS, czS, rS, dxS, dyS, dzS] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS), R = Number(rS); const OFF = [Number(dxS ?? -0.3), Number(dyS ?? 5.3), Number(dzS ?? -3.1)];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate(([CX, CZ, R, OFF]) => { const U = (m, c) => (m - c) * 4; const M = (v, c) => (v / 4 + c).toFixed(1); const list = window.__gvgState.wallFadeMeshes ?? []; const things = new Map(); for (const m of list) { const bx = m.userData.fadeBox; if (bx && !things.has(m.userData.fadeGroup)) things.set(m.userData.fadeGroup, bx); }
    const hit = (a, c, o) => { let t0 = 0, t1 = 1; for (const [k0, k1, pa, pc] of [['minX', 'maxX', a.x, c.x], ['minY', 'maxY', a.y, c.y], ['minZ', 'maxZ', a.z, c.z]]) { const d = pc - pa; if (Math.abs(d) < 1e-9) { if (pa < o[k0] || pa > o[k1]) return false; continue; } let ta = (o[k0] - pa) / d, tb = (o[k1] - pa) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } return true; };
    const floorAt = (x, z) => 0;   // (the street; the spots here lie on it)
    const out = []; for (let i = 0; i < 12; i += 1) { const ang = i * Math.PI / 6; const px = CX + Math.cos(ang) * R, pz = CZ + Math.sin(ang) * R; const target = { x: U(px, 49.8), y: 4.8 + 1.6, z: U(pz, -32) }; const cam = { x: target.x + OFF[0] * 4, y: 4.8 + OFF[1] * 4, z: target.z + OFF[2] * 4 };
      const blocking = []; for (const [g, bx] of things) { if (!hit(cam, target, bx)) continue; for (const part of bx.parts ?? []) if (hit(cam, target, part)) { blocking.push(`${g} x ${M(bx.minX, 49.8)}..${M(bx.maxX, 49.8)} z ${M(bx.minZ, -32)}..${M(bx.maxZ, -32)}`); break; } }
      out.push(`${(ang * 180 / Math.PI).toFixed(0).padStart(3)} deg (${px.toFixed(1)}, ${pz.toFixed(1)}): ${blocking.length ? blocking.join(' | ') : '-'}`); }
    return out; }, [CX, CZ, R, OFF]);
  console.log(r.join('\n')); await b.close(); server.close();
})();
