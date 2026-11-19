// live_run.cjs <client/dist> <unit key> [seconds] [map] — the unit played by its bot (Spectator) in an offline 1v1: which rig
// entry and clip it shows while it moves, sampled four times a second; and the steps the game read off the clips it walked on.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, UNIT = 'unit22', SECS = '20', MAP = 'warehouse'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if ((m.type() === 'warning' || m.type() === 'error') && !/GPU|WebGL|swiftshader|Automatic fallback/i.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  const tag = await p.evaluate(() => { for (const el of document.querySelectorAll('*')) { if (el.children.length === 0) { const m = (el.textContent || '').match(/b\d{4}[a-z]{2} \d\d-\d\d/); if (m) return m[0]; } } return null; });
  await p.evaluate(({ MAP, UNIT }) => { const st = window.__gvgState; st.spectatorMode = true; st.freePov = false; window.__startMatch({ mapKey: MAP, mode: '1v1', mainMode: 'duel', player: UNIT, enemy: 'unit1' }); }, { MAP, UNIT });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  const seen = {}; const t0 = Date.now();
  while (Date.now() - t0 < Number(SECS) * 1000) {
    const r = await p.evaluate(() => { const m = window.__gvgState.player; const rig = m?.modelHolder?.userData?.modelRig; if (!rig?.ready) return null; const a = rig.currentAction; return { cur: rig.current, clip: a?.getClip?.().name ?? null, scale: a ? +a.getEffectiveTimeScale().toFixed(2) : null, w: a ? +a.getEffectiveWeight().toFixed(2) : null, act: m.state.action }; });
    if (r) { const k = `${r.cur} | ${r.clip} | x${r.scale}`; seen[k] = (seen[k] ?? 0) + 1; }
    await sleep(250);
  }
  const strides = await p.evaluate(() => { const rig = window.__gvgState.player.modelHolder.userData.modelRig; return [...(rig.strides ?? new Map()).entries()].map(([c, f]) => [c.name, f.map((x) => +x.toFixed(3))]); });
  const gun = await p.evaluate(() => { const rig = window.__gvgState.player.modelHolder.userData.modelRig; let w = null; window.__gvgState.player.modelHolder.traverse((o) => { if (o.name === 'Bip001_Weapon') w = o; }); return w ? { scale: [w.scale.x, w.scale.y, w.scale.z].map((x) => +x.toFixed(3)) } : null; });
  console.log(JSON.stringify({ tag, unit: UNIT, seen, strides, gun, errs: errs.slice(0, 5) }, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
