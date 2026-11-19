// win_frames.cjs <client/dist> <out dir> [map] [frames] — Aris's winner camera, frame by frame: an offline 1v1, Aris played by her
// bot (Spectator) against a dummy whose HP is cut to 1 once the match is live, so her first hit is the final blow. In shot 2
// (the winner camera) the centre of the screen is captured repeatedly with the time into the shot and the clip she plays.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, MAP = 'town', NS = '60'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate((MAP) => { const st = window.__gvgState; st.dummyMode = true; st.spectatorMode = true; st.freePov = false; window.__startMatch({ mapKey: MAP, mode: '1v1', mainMode: 'duel', player: 'unit7', enemy: 'unit1' }); }, MAP);
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await p.evaluate(() => { const st = window.__gvgState; st.enemy.state.hp = 1; });
  let t0 = Date.now(); for (; Date.now() - t0 < 90000 && await p.evaluate(() => (window.__finale?.shot ?? 0) !== 2); ) await sleep(50);
  const info = []; const N = Number(NS); const start = Date.now();
  for (let k = 0; k < N; k += 1) {
    const s = await p.evaluate(() => { const f = window.__finale; const st = window.__gvgState; const m = st.player; const mix = m?.modelHolder?.userData?.modelRig?.mixer ?? null;
      const acts = mix && mix._actions ? mix._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.001).map((a) => `${a.getClip().name}@${a.time.toFixed(2)}x${a.getEffectiveWeight().toFixed(2)}`) : null;
      return { shot: f?.shot, acts }; });
    await p.screenshot({ path: path.join(out, `f${String(k).padStart(3, '0')}.png`), clip: { x: 390, y: 110, width: 500, height: 500 }, timeout: 240000 });
    info.push({ k, ms: Date.now() - start, ...s });
  }
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify(info));
  console.log(JSON.stringify({ frames: info.length, first: info[0], last: info[info.length - 1], errs: errs.slice(0, 3) }));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
