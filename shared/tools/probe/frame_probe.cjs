// Headless frame timing per map on the built client (software GL): an offline match started, then rAF frame intervals sampled.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, ...maps] = process.argv.slice(2); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  for (const mapKey of maps) { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${port}/`); await sleep(1500);
    const t0 = Date.now(); await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey);
    await p.waitForFunction(() => window.__gvgState?.player?.body, null, { timeout: 60000 }).catch(() => {}); const startMs = Date.now() - t0; await sleep(6000);
    const r = await p.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const prof0 = window.__modelProf ? { ...window.__modelProf } : null; const loop = () => { const n = performance.now(); ts.push(n - last); last = n; if (ts.length < 150) requestAnimationFrame(loop); else { ts.sort((a, b) => a - b); const prof = window.__modelProf; res({ median: ts[75], p90: ts[135], mean: ts.reduce((a, b) => a + b, 0) / ts.length, modelMsPerFrame: prof && prof0 ? (prof.ms - prof0.ms) / Math.max(1, prof.frames - prof0.frames) : null, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }); } }; requestAnimationFrame(loop); }));
    console.log(`${mapKey.padEnd(11)} start→match ${(startMs / 1000).toFixed(1)} s | frame ms median ${r.median.toFixed(1)}  p90 ${r.p90.toFixed(1)}  mean ${r.mean.toFixed(1)} | model pass ${r.modelMsPerFrame == null ? '-' : r.modelMsPerFrame.toFixed(2) + ' ms'} | JS heap ${r.mem ?? '-'} MB${errs.length ? ' | errors ' + errs[0] : ''}`); await p.close(); }
  await b.close(); server.close();
})();
