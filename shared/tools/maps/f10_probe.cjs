// F10 and F8 on the PT build: a match on a map, F8 on, a screenshot of the classic view, F10 pressed twice with the switch read each time.
// usage: NODE_PATH=$(npm root -g) node f10_probe.cjs <client/dist> <mapKey> <out.png>
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, out] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(9000);
  const r = { start: await p.evaluate(() => window.__PT?.infiniteBoost) };
  await p.keyboard.press('F10'); await sleep(300); r.afterF10 = await p.evaluate(() => window.__PT?.infiniteBoost); r.toast = await p.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => t.includes('infinite boost')) ?? null);
  const gauge = () => p.evaluate(() => { const st = window.__gvgState.player?.state; return st ? [Math.round(st.boost), st.action] : null; });
  const hold = async () => { await p.keyboard.down('w'); await p.keyboard.down('k'); await sleep(1500); r.during = await gauge(); await p.keyboard.up('k'); await p.keyboard.up('w'); };
  await hold(); r.offAfterHold = r.during;
  await p.keyboard.press('F10'); await sleep(300); r.afterF10again = await p.evaluate(() => window.__PT?.infiniteBoost);
  await sleep(1500); await hold(); r.onAfterHold = r.during;
  await p.keyboard.press('F8'); await sleep(1500); r.collisionView = await p.evaluate(() => !!window.__gvgState && [...document.querySelectorAll('canvas')].length);
  await p.screenshot({ path: out }); r.errors = errors.slice(0, 3); console.log(JSON.stringify(r)); await b.close(); server.close();
})();
