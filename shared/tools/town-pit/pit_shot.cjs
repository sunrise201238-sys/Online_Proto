// pit_shot.cjs <client/dist> <out png> — Town, the reported spot: the player's unit is put on the east deck's edge strip
// (arena x 269, z 168) at the deck's height, left to settle, and the scene is drawn from the south-west above it.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate(() => { const st = window.__gvgState; st.dummyMode = true; window.__startMatch({ mapKey: 'town', mode: '1v1', mainMode: 'duel', player: 'unit1', enemy: 'unit1' }); });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await p.evaluate(() => { const m = window.__gvgState.player; const x = 269.0, z = 168, hh = 15.51; m.body.position.set(x, hh + 2.45 + 0.2, z); m.root.position.set(x, hh + 2.45 + 0.2 + (m.modelYOffset ?? 2.35), z); if (m.body.velocity) m.body.velocity.set(0, 0, 0); if (m.state) m.state.vy = 0; });
  await sleep(2500);
  const r = await p.evaluate(() => { const THREE = window.__THREE, m = window.__gvgState.player; const q = m.body.position; let scene = m.root; while (scene.parent) scene = scene.parent;
    const cam = new THREE.PerspectiveCamera(42, 1280 / 720, 0.5, 4000); cam.position.set(q.x - 34, q.y + 17, q.z + 20); cam.lookAt(q.x - 2, q.y + 1, q.z - 2); cam.updateMatrixWorld(true);
    const ren = window.__gvgRenderer; ren.render(scene, cam); return { url: ren.domElement.toDataURL('image/png'), pos: [q.x, q.y, q.z].map((v) => +v.toFixed(2)) }; });
  fs.writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64')); console.log(JSON.stringify({ pos: r.pos, feetModelM: +((r.pos[1] - 2.45) / 4).toFixed(2) }));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
