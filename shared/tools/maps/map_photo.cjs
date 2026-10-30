// A map card's photo from the client's own __mapPhoto hook (one 3/4 aerial, the same look as every other card): a
// static server on the built client, headless Chromium, an offline match started on the map by __startMatch, the
// model given time to load, the photo saved. Run only with the user's leave (it runs the game client).
// usage: NODE_PATH=$(npm root -g) node map_photo.cjs <client/dist> <mapKey> <out.png> [dist=300] [yaw=2.4] [height=0.85] [cx=0] [cz=0] [waitMs=12000]
const { chromium } = require('playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, outPng, distArg, yawArg, heightArg, cxArg, czArg, waitArg] = process.argv.slice(2);
const opts = { size: 1024, dist: Number(distArg ?? 300), yaw: Number(yawArg ?? 2.4), height: Number(heightArg ?? 0.85), cx: Number(cxArg ?? 0), cz: Number(czArg ?? 0) };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  const started = await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(Number(waitArg ?? 12000));
  for (const key of (process.env.KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) { await p.keyboard.press(key); await sleep(1500); }   // (KEYS=F8: the PT site's keys before the photo — the collision view over the model)
  if (process.env.CMD) { await p.evaluate(() => window.__diorama.toggle()); await sleep(2500); }   // (CMD=1: command mode on before the photo — its grade, its board view)
  const url = await p.evaluate((o) => window.__mapPhoto(o), opts);
  fs.writeFileSync(outPng, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`started ${started}, photo -> ${outPng} (${fs.statSync(outPng).size} bytes)`, errs.length ? 'page errors: ' + errs.join(' | ') : '');
  await b.close(); server.close();
})();
