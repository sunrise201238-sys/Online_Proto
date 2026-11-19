// pair.cjs <client/dist> <out dir> [map] [clip] [time] [scale] — Aris's winner camera at one frozen pose, twice: as the build
// draws it, and with the meshes the build hides (visible === false under her model, never her silhouettes) shown again, which
// is how the build before the fix drew her. For each, the stretched triangles among the meshes that are drawn are counted
// (posed edge over 3 times its bind edge and over 8 % of the model's size).
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, MAP = 'town', CLIP = 'Normal_Idle', TS = '0.77', SC = '2'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: Number(SC) }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  const tag = await p.evaluate(() => document.body.innerText.match(/b\d{4}[a-z]{2} \d\d-\d\d/)?.[0] ?? null);
  await p.evaluate((MAP) => { const st = window.__gvgState; st.dummyMode = true; st.spectatorMode = true; st.freePov = false; window.__startMatch({ mapKey: MAP, mode: '1v1', mainMode: 'duel', player: 'unit7', enemy: 'unit1' }); }, MAP);
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await p.evaluate(() => { const st = window.__gvgState; st.enemy.state.hp = 1; });
  let t0 = Date.now(); for (; Date.now() - t0 < 300000 && await p.evaluate(() => (window.__finale?.shot ?? 0) !== 2); ) { await sleep(100); await p.evaluate(() => { const e = window.__gvgState.enemy; if (e?.state && e.state.hp > 1) e.state.hp = 1; }); }
  if (await p.evaluate(() => (window.__finale?.shot ?? 0) !== 2)) { console.log('NO WINNER CAMERA within 300 s'); await b.close(); server.close(); process.exit(2); }
  await p.setViewportSize({ width: 1280, height: 720 });
  await sleep(Number(process.env.SETTLE_MS ?? 12000));   // (the winner camera's move is over: both pictures from one place)
  const measure = (showHidden) => p.evaluate(({ CLIP, T, showHidden }) => {
    const st = window.__gvgState; const m = st.player; const rig = m.modelHolder.userData.modelRig; const mix = rig.mixer;
    mix.timeScale = 0;
    for (const a of mix._actions) { if (a.getClip().name === CLIP) { a.enabled = true; a.setEffectiveWeight(1); a.paused = false; a.play(); a.time = T; } else { a.setEffectiveWeight(0); } }
    mix.update(0);
    const ghosts = new Set(rig.silhouettes); const meshes = []; m.modelHolder.traverse((o) => { if (o.isSkinnedMesh && !ghosts.has(o)) meshes.push(o); });
    const hidden = meshes.filter((o) => !o.visible || o.userData.__wasHidden);
    if (showHidden) for (const o of hidden) { o.userData.__wasHidden = true; o.visible = true; }
    m.modelHolder.updateMatrixWorld(true); for (const o of meshes) o.skeleton.update();
    let size = 0; for (const o of meshes) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; size = Math.max(size, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
    const V = m.modelHolder.position.constructor; const a = new V(); let bad = 0, drawn = 0, tris = 0; const per = [];
    for (const o of meshes) {
      if (!o.visible) continue; drawn += 1;
      const g = o.geometry, pos = g.attributes.position, idx = g.index, n = pos.count, posed = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) { o.getVertexPosition(i, a); posed[i * 3] = a.x; posed[i * 3 + 1] = a.y; posed[i * 3 + 2] = a.z; }
      const d = (i, j) => Math.hypot(posed[i * 3] - posed[j * 3], posed[i * 3 + 1] - posed[j * 3 + 1], posed[i * 3 + 2] - posed[j * 3 + 2]);
      const bd = (i, j) => Math.hypot(pos.getX(i) - pos.getX(j), pos.getY(i) - pos.getY(j), pos.getZ(i) - pos.getZ(j));
      const nt = idx ? idx.count / 3 : n / 3; let mb = 0; tris += nt;
      for (let t = 0; t < nt; t += 1) { const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        let is = false; for (const [x, y] of [[i0, i1], [i1, i2], [i2, i0]]) { const pl = d(x, y); if (pl > 0.08 * size && pl > 3 * Math.max(bd(x, y), 1e-6)) is = true; }
        if (is) mb += 1; }
      bad += mb; if (mb) per.push([o.name, mb]);
    }
    return { drawn, of: meshes.length, hidden: hidden.map((o) => o.name), tris, bad, per, ghostsDrawn: rig.silhouettes.filter((g) => g.visible && g.parent?.visible !== false).length, ghosts: rig.silhouettes.length };
  }, { CLIP, T: Number(TS), showHidden });
  const shot = async (name) => { await sleep(900); await p.screenshot({ path: path.join(out, name), timeout: 240000 }); };
  const after = await measure(false); await shot('after.png');
  const before = await measure(true); await shot('before.png');
  console.log(JSON.stringify({ tag, clip: CLIP, t: Number(TS), after, before, errs: errs.slice(0, 3) }, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
