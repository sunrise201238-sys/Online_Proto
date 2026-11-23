// which404.cjs <dir> [unit] [map] — which requests the page makes that the folder cannot serve, through a match's start (on Warehouse unless a map is named);
// with them the page's own line on the map's route grid (read from its file, or built) and the page's errors.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, UNIT = 'unit22', MAP = 'warehouse'] = process.argv.slice(2); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const miss = [];
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { miss.push(u); res.writeHead(404); res.end(); return; }
    const ext = path.extname(f); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' })[ext] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const lines = [], errors = []; p.on('console', (m) => { const t = m.text(); if (t.startsWith('[nav]')) lines.push(t); }); p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate(({ UNIT, MAP }) => { const st = window.__gvgState; st.spectatorMode = true; window.__startMatch({ mapKey: MAP, mode: '1v1', mainMode: 'duel', player: UNIT, enemy: 'unit1' }); }, { UNIT, MAP });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await sleep(3000);
  console.log(`${MAP}: missing: ${JSON.stringify([...new Set(miss)])}; route grid: ${lines.join(' | ') || '(no line)'}; page errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''}`); await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
