// run_frames.cjs <client/dist> <out dir> <unit key> <rig clip key> [phases] [angle deg] [map] — a unit's clip, pose by pose.
// An offline 1v1 with the unit as the player's; once the match is live the unit's rig is given the named entry (walk, sprint,
// ...) alone at each phase of the clip, the scene is drawn once from a camera standing `angle` degrees round from the unit's
// front (0 = from the front, 90 = from its left side), and the canvas is saved. Prints what the entry plays.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, UNIT = 'unit22', KEY = 'sprint', NS = '8', ANG = '60', MAP = 'warehouse'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'warning' && /clip|model/i.test(m.text())) errs.push('warn: ' + m.text().slice(0, 160)); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate(({ MAP, UNIT }) => { const st = window.__gvgState; st.dummyMode = true; window.__startMatch({ mapKey: MAP, mode: '1v1', mainMode: 'duel', player: UNIT, enemy: 'unit1' }); }, { MAP, UNIT });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await sleep(800);
  for (let i = 0; i < 100 && !(await p.evaluate((KEY) => !!window.__gvgState.player?.modelHolder?.userData?.modelRig?.actions?.[KEY], KEY)); i += 1) await sleep(100);
  const N = Number(NS); const info = [];
  for (let k = 0; k < N; k += 1) {
    const r = await p.evaluate(({ KEY, k, N, ANG }) => {
      const THREE = window.__THREE, st = window.__gvgState, m = st.player, rig = m.modelHolder.userData.modelRig, mix = rig.mixer, e = rig.actions[KEY];
      if (!e) return { err: 'no entry ' + KEY, keys: Object.keys(rig.actions) };
      mix.stopAllAction(); e.action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play(); e.action.time = e.dur * k / N; mix.update(0);
      rig.current = null; rig.currentAction = null;
      m.root.updateMatrixWorld(true);
      let scene = m.root; while (scene.parent) scene = scene.parent;
      const yaw = (rig.yaw ?? m.root.rotation.y), a = yaw + ANG * Math.PI / 180;
      const p0 = m.root.getWorldPosition(new THREE.Vector3());
      const box = new THREE.Box3().setFromObject(m.modelHolder); const h = Math.max(2, box.max.y - box.min.y), midY = (box.max.y + box.min.y) / 2;
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
      const dist = h * 2.6; cam.position.set(p0.x + Math.sin(a) * dist, midY + h * 0.15, p0.z + Math.cos(a) * dist); cam.lookAt(p0.x, midY, p0.z); cam.updateMatrixWorld(true);
      const ren = window.__gvgRenderer; ren.render(scene, cam);
      const urlOut = ren.domElement.toDataURL('image/png');
      const clip = e.action.getClip();
      return { url: urlOut, clip: clip.name, dur: +e.dur.toFixed(4), t: +(e.dur * k / N).toFixed(3), tracks: clip.tracks.length, sameAs: Object.keys(rig.actions).filter((q) => rig.actions[q].action === e.action), cfg: e.cfg };
    }, { KEY, k, N, ANG: Number(ANG) });
    if (r.err) { console.log(JSON.stringify(r)); break; }
    fs.writeFileSync(path.join(out, `${UNIT}_${KEY}_${ANG}_${String(k).padStart(2, '0')}.png`), Buffer.from(r.url.split(',')[1], 'base64')); delete r.url; info.push(r);
  }
  console.log(JSON.stringify({ unit: UNIT, key: KEY, frames: info.length, first: info[0], errs: errs.slice(0, 4) }));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
