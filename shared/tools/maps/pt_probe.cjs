// The PT site's dev hooks checked headlessly on a modelled map: a 2v2 started, the boost after ten seconds of fighting (the
// infinite boost: every gauge still full), the collision view switched on (its meshes, the model's hidden), the scale
// panel's text, then the map tried at another scale (the panel's text again, the arena's bounds). Run only with the
// user's leave (it runs the game client). usage: NODE_PATH=$(npm root -g) node pt_probe.cjs <client/dist> <mapKey> <mPerUnit>
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, mArg] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '2v2', player: 'unit1', enemy: 'unit2', ally: 'unit3', enemy2: 'unit4' }); }, mapKey); await sleep(12000);
  const boost = await p.evaluate(() => { const st = window.__gvgState; const r = {}; for (const [n, m] of [['player', st.player], ['enemy', st.enemy], ['ally', st.ally], ['enemy2', st.enemy2]]) if (m?.state) r[n] = `${Math.round(m.state.boost)}/${m.state.unit?.boostCap ?? '?'}${m.state.hp <= 0 ? ' dead' : ''}`; return r; });
  console.log('boost after 10 s', JSON.stringify(boost));
  const view = await p.evaluate(async () => { const st = window.__gvgState; let sc = st.player.root; while (sc.parent) sc = sc.parent; const vis = () => { let n = 0; sc.traverse((o) => { if (o.isMesh && o.visible) n += 1; }); return n; }; const before = vis(); const on = window.__COLLISION_VIEW(); await new Promise((r) => setTimeout(r, 500)); const during = vis(); const info = window.__gvgRenderer.info.render.calls; window.__COLLISION_VIEW(); const after = vis(); return { on, visibleMeshesBefore: before, during, after, drawCallsDuring: info }; });
  console.log('collision view', JSON.stringify(view));
  const panel = await p.evaluate(() => { window.__MAP_SCALE_PANEL(); return document.querySelector('#mapScalePanel .ms-text')?.textContent; });
  console.log('scale panel:', panel);
  const scaled = await p.evaluate(async (m) => { const k = window.__MAP_SCALE(m); await new Promise((r) => setTimeout(r, 8000)); const st = window.__gvgState; return { k, text: document.querySelector('#mapScalePanel .ms-text')?.textContent, running: st.running, player: { x: Math.round(st.player.root.position.x), y: Math.round(st.player.root.position.y * 10) / 10, z: Math.round(st.player.root.position.z) } }; }, Number(mArg));
  console.log('scaled:', JSON.stringify(scaled));
  const reset = await p.evaluate(async () => { const cfg = { }; const k = window.__MAP_SCALE(Number(document.querySelector('#mapScalePanel .ms-text').textContent.match(/: ([\d.]+) m per/)[1]) / 1); return k; });
  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors'); await b.close(); server.close();
})();
