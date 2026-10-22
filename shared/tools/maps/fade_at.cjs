// The fade's things whose hull columns lie over a window (metres): each thing's box, and its columns in the window with their tops.
// usage: NODE_PATH=$(npm root -g) node fade_at.cjs <client/dist> <mapKey> x0 z0 x1 z1
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, ...w] = process.argv.slice(2); const [x0, z0, x1, z1] = w.map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate(([x0, z0, x1, z1]) => { const U = (m, c) => (m - c) * 4; const M = (v, c) => (v / 4 + c).toFixed(1); const wx0 = U(x0, 49.8), wx1 = U(x1, 49.8), wz0 = U(z0, -32), wz1 = U(z1, -32); const list = window.__gvgState.wallFadeMeshes ?? []; const seen = new Set(); const out = [];
    for (const m of list) { const bx = m.userData.fadeBox; const g = m.userData.fadeGroup; if (!bx || seen.has(g)) continue; const cols = (bx.parts ?? []).filter((c) => c.maxX > wx0 && c.minX < wx1 && c.maxZ > wz0 && c.minZ < wz1); if (!cols.length) continue; seen.add(g);
      out.push({ group: g, box: `x ${M(bx.minX, 49.8)}..${M(bx.maxX, 49.8)} z ${M(bx.minZ, -32)}..${M(bx.maxZ, -32)}`, allColumns: bx.parts.length, here: cols.slice(0, 10).map((c) => `x ${M(c.minX, 49.8)}..${M(c.maxX, 49.8)} z ${M(c.minZ, -32)}..${M(c.maxZ, -32)} y ${(c.minY / 4).toFixed(1)}..${(c.maxY / 4).toFixed(1)}`) }); }
    return out; }, [x0, z0, x1, z1]);
  console.log(JSON.stringify(r, null, 1)); await b.close(); server.close();
})();
