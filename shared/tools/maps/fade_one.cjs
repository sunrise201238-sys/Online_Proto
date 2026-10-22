// One fade thing of a map looked at: the biggest by columns — its columns' heights, its cells, and the rows across. usage: NODE_PATH=$(npm root -g) node fade_one.cjs <client/dist> <mapKey> [rank=0]
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, rankS] = process.argv.slice(2); const RANK = Number(rankS ?? 0);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate((RANK) => { const list = window.__gvgState.wallFadeMeshes ?? []; const seen = new Map(); for (const m of list) { const g = m.userData.fadeGroup; if (!seen.has(g)) seen.set(g, m.userData.fadeBox); }
    const arr = [...seen.entries()].sort((a, c) => (c[1].parts?.length ?? 0) - (a[1].parts?.length ?? 0)); const [g, bx] = arr[RANK]; const parts = bx.parts ?? [];
    const cells = new Map(); for (const c of parts) { const k = `${Math.floor((c.minX + c.maxX) / 8)},${Math.floor((c.minZ + c.maxZ) / 8)}`; cells.set(k, (cells.get(k) ?? 0) + 1); }
    const hs = parts.map((c) => c.maxY - c.minY); const low = hs.filter((h) => h <= 1.01).length, tall = hs.filter((h) => h >= 8).length;
    const rows = new Map(); for (const k of cells.keys()) { const [ix, iz] = k.split(',').map(Number); rows.set(iz, (rows.get(iz) ?? 0) + 1); } const maxAcross = Math.max(...rows.values());
    const meshes = list.filter((m) => m.userData.fadeGroup === g).map((m) => ({ tris: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, mat: m.material.name || m.material.map?.name || '?' }));
    return { group: g, axis: bx.axis, box: `x ${(bx.minX / 4 + 49.8).toFixed(0)}..${(bx.maxX / 4 + 49.8).toFixed(0)} z ${(bx.minZ / 4 - 32).toFixed(0)}..${(bx.maxZ / 4 - 32).toFixed(0)}`, columns: parts.length, cells: cells.size, columnsUnder1u: low, columnsOver8u: tall, maxCellsAcrossARow: maxAcross, meshes, sampleCols: parts.slice(0, 6).map((c) => `y ${(c.minY / 4).toFixed(1)}..${(c.maxY / 4).toFixed(1)} at x ${(c.minX / 4 + 49.8).toFixed(1)} z ${(c.minZ / 4 - 32).toFixed(1)}`) }; }, RANK);
  console.log(JSON.stringify(r, null, 1)); await b.close(); server.close();
})();
