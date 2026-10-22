// The fade's things with no hull at all (they never fade) and those with few columns for their size, map-wide: box, triangles, columns.
// usage: NODE_PATH=$(npm root -g) node fade_empty.cjs <client/dist> <mapKey>
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate(() => { const M = (v, c) => (v / 4 + c).toFixed(0); const list = window.__gvgState.wallFadeMeshes ?? []; const things = new Map();
    for (const m of list) { const bx = m.userData.fadeBox; if (!bx) continue; const g = m.userData.fadeGroup; const e = things.get(g) ?? { box: `x ${M(bx.minX, 49.8)}..${M(bx.maxX, 49.8)} z ${M(bx.minZ, -32)}..${M(bx.maxZ, -32)}`, cols: bx.parts?.length ?? 0, tris: 0, area: (bx.maxX - bx.minX) * (bx.maxZ - bx.minZ) / 16, top: 0 }; e.tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; for (const c of bx.parts ?? []) e.top = Math.max(e.top, c.maxY / 4); things.set(g, e); }
    const arr = [...things.entries()]; const empty = arr.filter(([, e]) => e.cols === 0); const thin = arr.filter(([, e]) => e.cols > 0 && e.tris >= 40 && e.cols < Math.max(2, e.area / 8));
    return { things: arr.length, noHull: empty.length, noHullList: empty.slice(0, 12).map(([g, e]) => `${g} ${e.box} ${e.tris} tris`), fewColumns: thin.length, fewList: thin.slice(0, 8).map(([g, e]) => `${g} ${e.box} ${e.tris} tris ${e.cols} cols top ${e.top.toFixed(1)} m`) }; });
  console.log(JSON.stringify(r, null, 1)); await b.close(); server.close();
})();
