// What a modelled map's fade registered: each thing's box (units) — how many are flat and low (a raised floor read as a thing), how many tall.
// usage: NODE_PATH=$(npm root -g) node fade_things.cjs <client/dist> <mapKey>
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
  const r = await p.evaluate(() => { const list = window.__gvgState.wallFadeMeshes ?? []; const groups = new Map(); for (const m of list) { const b = m.userData.fadeBox; const g = m.userData.fadeGroup ?? m.id; const e = groups.get(g) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, meshes: 0, parts: 0 }; e.minX = Math.min(e.minX, b.minX); e.maxX = Math.max(e.maxX, b.maxX); e.minY = Math.min(e.minY, b.minY); e.maxY = Math.max(e.maxY, b.maxY); e.minZ = Math.min(e.minZ, b.minZ); e.maxZ = Math.max(e.maxZ, b.maxZ); e.meshes += 1; e.parts += (b.parts?.length ?? 0); groups.set(g, e); }
    const arr = [...groups.values()]; const flat = arr.filter((e) => e.maxY - e.minY < 4); const big = arr.sort((a, c) => (c.maxX - c.minX) * (c.maxZ - c.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ)).slice(0, 8);
    const f = (e) => `x ${(e.minX / 4 + 49.8).toFixed(0)}..${(e.maxX / 4 + 49.8).toFixed(0)} z ${(e.minZ / 4 - 32).toFixed(0)}..${(e.maxZ / 4 - 32).toFixed(0)} y ${(e.minY / 4).toFixed(1)}..${(e.maxY / 4).toFixed(1)} m, ${e.meshes} meshes, ${e.parts} columns`;
    return { meshes: list.length, things: arr.length, flatThings: flat.length, flatSample: flat.slice(0, 6).map(f), biggest: big.map(f) }; });
  console.log(JSON.stringify(r, null, 1)); await b.close(); server.close();
})();
