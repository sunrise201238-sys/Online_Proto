// hand_opts.cjs <client/dist> <out dir> <fingers.json> [options] [phases] [angles] [dist] — Minori's left hand on her gun in
// her run (Subaru's clip), close up, as the build draws it and with a change tried on the page alone (nothing of the project
// is changed: the bones are set by hand after the clip has posed them, one picture is drawn, and they are put back).
//   options: now — as built;  handOff — the left hand's bone shrunk to a thousandth (the hand and its fingers gone);
//            fingersOff — the three finger bones shrunk (the palm stays);  fingersRest — the fingers at their rest pose (open);
//            fingersOwn — the fingers as her own run clip (Saori's) holds them
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, FJ, OPTS = 'now,handOff,fingersOff,fingersRest,fingersOwn', PH = '0,0.25,0.5,0.75', ANG = '330', DIST = '0.5'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const fingers = JSON.parse(fs.readFileSync(FJ, 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
  await p.evaluate(() => { const st = window.__gvgState; st.dummyMode = true; window.__startMatch({ mapKey: 'warehouse', mode: '1v1', mainMode: 'duel', player: 'unit22', enemy: 'unit1' }); });
  await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
  await sleep(800);
  for (let i = 0; i < 100 && !(await p.evaluate(() => !!window.__gvgState.player?.modelHolder?.userData?.modelRig?.actions?.sprint)); i += 1) await sleep(100);
  for (const opt of OPTS.split(',')) for (const ph of PH.split(',').map(Number)) for (const ang of ANG.split(',').map(Number)) {
    const r = await p.evaluate(({ opt, ph, ang, fingers, DIST }) => {
      const THREE = window.__THREE, st = window.__gvgState, m = st.player, rig = m.modelHolder.userData.modelRig, mix = rig.mixer, e = rig.actions.sprint;
      mix.stopAllAction(); e.action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play(); e.action.time = e.dur * ph; mix.update(0); rig.current = null; rig.currentAction = null;
      const bone = (n) => m.modelHolder.getObjectByName(n); const F = ['Bip001_L_Finger0', 'Bip001_L_Finger01', 'Bip001_L_Finger1', 'Bip001_L_Finger11', 'Bip001_L_Finger2', 'Bip001_L_Finger21'];
      const undo = [];
      const shrink = (n) => { const o = bone(n); if (!o) return; const was = o.scale.clone(); undo.push(() => o.scale.copy(was)); o.scale.setScalar(0.001); };
      if (opt === 'handOff') shrink('Bip001_L_Hand');
      if (opt === 'fingersOff') for (const n of ['Bip001_L_Finger0', 'Bip001_L_Finger1', 'Bip001_L_Finger2']) shrink(n);
      if (opt === 'fingersRest') for (const n of F) { const o = bone(n), q = fingers.rest[n]; if (o && q) o.quaternion.set(q[0], q[1], q[2], q[3]); }
      if (opt === 'fingersOwn') for (const n of F) { const o = bone(n), t = fingers.own[n]; if (!o || !t) continue; const tt = ph * fingers.duration; let k = 0; while (k < t.times.length - 2 && t.times[k + 1] <= tt) k += 1;
        const a = new THREE.Quaternion().fromArray(t.values, k * 4), bq = new THREE.Quaternion().fromArray(t.values, Math.min(t.times.length - 1, k + 1) * 4); const span = (t.times[k + 1] ?? t.times[k]) - t.times[k]; o.quaternion.copy(a).slerp(bq, span > 0 ? Math.min(1, Math.max(0, (tt - t.times[k]) / span)) : 0); }
      m.root.updateMatrixWorld(true);
      let scene = m.root; while (scene.parent) scene = scene.parent;
      const yaw = (rig.yaw ?? m.root.rotation.y), a = yaw + ang * Math.PI / 180;
      const hand = bone('Bip001_L_Hand').getWorldPosition(new THREE.Vector3());
      const box = new THREE.Box3().setFromObject(m.modelHolder); const h = Math.max(2, box.max.y - box.min.y);
      const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 4000); const d = h * DIST;
      cam.position.set(hand.x + Math.sin(a) * d, hand.y + d * 0.45, hand.z + Math.cos(a) * d); cam.lookAt(hand.x, hand.y, hand.z); cam.updateMatrixWorld(true);
      const ren = window.__gvgRenderer; ren.render(scene, cam); const url = ren.domElement.toDataURL('image/png');
      for (const u of undo) u(); m.root.updateMatrixWorld(true);
      return { url, found: F.filter((n) => !!bone(n)).length, hand: !!bone('Bip001_L_Hand') };
    }, { opt, ph, ang, fingers, DIST: Number(DIST) });
    fs.writeFileSync(path.join(out, `${opt}_p${String(ph).replace('.', '')}_a${ang}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
    if (opt === OPTS.split(',')[0] && ph === Number(PH.split(',')[0])) console.log('bones found', r.found, 'of 6; hand', r.hand);
  }
  console.log('done', JSON.stringify(errs.slice(0, 3)));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
