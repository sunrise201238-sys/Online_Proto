// The fade's things on a map by size: how many columns each, how many source meshes, and the share of draw calls the small ones take.
// usage: NODE_PATH=$(npm root -g) node fade_hist.cjs <client/dist> <mapKey>
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
  const r = await p.evaluate(() => { const list = window.__gvgState.wallFadeMeshes ?? []; const groups = new Map(); for (const m of list) { const bx = m.userData.fadeBox; const g = m.userData.fadeGroup ?? m.id; const e = groups.get(g) ?? { meshes: 0, columns: 0, tris: 0, h: 0, axis: bx.axis }; e.meshes += 1; e.columns = Math.max(e.columns, bx.parts?.length ?? 0); e.tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; let hi = 0; for (const c of bx.parts ?? []) hi = Math.max(hi, c.maxY - c.minY); e.h = Math.max(e.h, hi); groups.set(g, e); }
    const arr = [...groups.values()]; const bins = { 'cols<=2': 0, 'cols3-5': 0, 'cols6-15': 0, 'cols16-50': 0, 'cols>50': 0 }; const meshesIn = { ...bins }; const axes = {}; for (const e of arr) { const k = e.columns <= 2 ? 'cols<=2' : e.columns <= 5 ? 'cols3-5' : e.columns <= 15 ? 'cols6-15' : e.columns <= 50 ? 'cols16-50' : 'cols>50'; bins[k] += 1; meshesIn[k] += e.meshes; axes[e.axis] = (axes[e.axis] ?? 0) + 1; }
    const low = arr.filter((e) => e.h < 10).length; return { things: arr.length, meshes: list.length, byColumns: bins, meshesByColumns: meshesIn, byAxis: axes, thingsUnder2_5m: low, tris: Math.round(arr.reduce((s, e) => s + e.tris, 0)) }; });
  console.log(JSON.stringify(r)); await b.close(); server.close();
})();
