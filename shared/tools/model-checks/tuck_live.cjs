// tuck_live.cjs <client/dist> [unit] [seconds] — the unit played by its bot in an offline 1v1: for each rig entry it shows, the
// size of its left finger bones (1 = their own, 0.001 = put away) seen while that entry played alone at full weight, and the
// number of tracks of the run clip.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, UNIT = 'unit22', SECS = '30'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'warning' && /clip|model|PropertyBinding/i.test(m.text())) errs.push('warn: ' + m.text().slice(0, 160)); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate(({ UNIT }) => { const st = window.__gvgState; st.spectatorMode = true; st.freePov = false; window.__startMatch({ mapKey: 'warehouse', mode: '1v1', mainMode: 'duel', player: UNIT, enemy: 'unit1' }); }, { UNIT });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  // the page's own log, every frame: the entry shown, its weight, the fingers' size
  await p.evaluate(() => { const seen = window.__seen = {}; const st = window.__gvgState;
    const tick = () => { const m = st.player, rig = m?.modelHolder?.userData?.modelRig; if (rig?.ready && rig.currentAction) { const w = rig.currentAction.getEffectiveWeight(); const others = rig.mixer._actions.filter((a) => a !== rig.currentAction && a.isRunning() && a.getEffectiveWeight() > 0.001).length;
        const f = ['Bip001_L_Finger0', 'Bip001_L_Finger1', 'Bip001_L_Finger2'].map((n) => m.modelHolder.getObjectByName(n)?.scale.x); const r = m.modelHolder.getObjectByName('Bip001_R_Finger1')?.scale.x;
        const k = rig.current + (w > 0.999 && !others ? '' : ' (blending)'); const e = seen[k] ?? (seen[k] = { n: 0, min: Infinity, max: -Infinity, rmin: Infinity, rmax: -Infinity });
        e.n += 1; e.min = Math.min(e.min, ...f); e.max = Math.max(e.max, ...f); e.rmin = Math.min(e.rmin, r); e.rmax = Math.max(e.rmax, r); }
      requestAnimationFrame(tick); }; tick(); });
  await sleep(Number(SECS) * 1000);
  const out = await p.evaluate(() => { const rig = window.__gvgState.player.modelHolder.userData.modelRig; const fmt = (x) => +x.toFixed(4);
    return { seen: Object.fromEntries(Object.entries(window.__seen).map(([k, e]) => [k, { frames: e.n, leftFingers: [fmt(e.min), fmt(e.max)], rightFinger: [fmt(e.rmin), fmt(e.rmax)] }])), runTracks: rig.actions.sprint.action.getClip().tracks.length, scaleTracks: rig.actions.sprint.action.getClip().tracks.filter((t) => t.name.endsWith('.scale')).map((t) => t.name), shared: ['walk', 'sprint', 'sprintShoot'].every((k) => rig.actions[k].action === rig.actions.sprint.action) }; });
  console.log(JSON.stringify({ unit: UNIT, ...out, errs: errs.slice(0, 5) }, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
