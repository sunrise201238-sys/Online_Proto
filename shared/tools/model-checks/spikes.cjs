// spikes.cjs <client/dist> <out dir> [map] [clip] [times] — which triangles of Aris's model are stretched in a pose.
// An offline 1v1 as win_frames.cjs; once the winner camera is up the mixer is frozen, the named clip is set alone at each
// time, and every skinned mesh's triangles are measured: posed edge against bind edge. A stretched triangle is one whose
// posed edge is over 3 times its bind edge and over 8 % of the model's height.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, MAP = 'town', CLIP = 'Normal_Idle', TIMES = '0.77'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
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
  const res = [];
  for (const T of TIMES.split(',').map(Number)) {
    const r = await p.evaluate(({ CLIP, T }) => {
      const st = window.__gvgState; const m = st.player; const rig = m.modelHolder.userData.modelRig; const mix = rig.mixer;
      mix.timeScale = 0;
      for (const a of mix._actions) { if (a.getClip().name === CLIP) { a.enabled = true; a.setEffectiveWeight(1); a.paused = false; a.play(); a.time = T; } else { a.setEffectiveWeight(0); } }
      mix.update(0); m.modelHolder.updateMatrixWorld(true);
      const ghosts = new Set(rig.silhouettes); const meshes = []; m.modelHolder.traverse((o) => { if (o.isSkinnedMesh && !ghosts.has(o)) meshes.push(o); });
      for (const o of meshes) o.skeleton.update();
      // the model's height in mesh-local units: the first mesh's bind box
      let hLocal = 0; for (const o of meshes) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; hLocal = Math.max(hLocal, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
      const V = window.__THREE_Vector3 ?? m.modelHolder.position.constructor; const a = new V(), b2 = new V(), c = new V();
      const out = [];
      for (const o of meshes) {
        const g = o.geometry; const pos = g.attributes.position; const idx = g.index; const si = g.attributes.skinIndex; const sw = g.attributes.skinWeight;
        const n = pos.count; const posed = new Float32Array(n * 3);
        for (let i = 0; i < n; i += 1) { o.getVertexPosition(i, a); posed[i * 3] = a.x; posed[i * 3 + 1] = a.y; posed[i * 3 + 2] = a.z; }
        const tri = idx ? idx.count / 3 : n / 3; let bad = 0; const boneHits = {}; let worst = 0; const badVerts = new Set();
        const d = (arr, i, j) => Math.hypot(arr[i * 3] - arr[j * 3], arr[i * 3 + 1] - arr[j * 3 + 1], arr[i * 3 + 2] - arr[j * 3 + 2]);
        const bindArr = pos.array; const stride = pos.isInterleavedBufferAttribute ? null : 3;
        const bd = (i, j) => Math.hypot(pos.getX(i) - pos.getX(j), pos.getY(i) - pos.getY(j), pos.getZ(i) - pos.getZ(j));
        for (let t = 0; t < tri; t += 1) {
          const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          const pairs = [[i0, i1], [i1, i2], [i2, i0]]; let isBad = false;
          for (const [x, y] of pairs) { const pl = d(posed, x, y); const bl = bd(x, y); if (pl > 0.08 * hLocal && pl > 3 * Math.max(bl, 1e-6)) { isBad = true; worst = Math.max(worst, pl / hLocal); } }
          if (isBad) { bad += 1; for (const v of [i0, i1, i2]) badVerts.add(v); }
        }
        for (const v of badVerts) { for (let k = 0; k < 4; k += 1) { const w = sw.getComponent(v, k); if (w > 0.001) { const bn = o.skeleton.bones[si.getComponent(v, k)]?.name ?? '?'; boneHits[bn] = (boneHits[bn] ?? 0) + 1; } } }
        const mats = Array.isArray(o.material) ? o.material.length : 1;
        out.push({ mesh: o.name, verts: n, tris: tri, bad, worst: +worst.toFixed(2), bones: Object.entries(boneHits).sort((x, y) => y[1] - x[1]).slice(0, 12), morph: !!o.morphTargetInfluences, infl: o.morphTargetInfluences ? Array.from(o.morphTargetInfluences).map((x) => +x.toFixed(3)) : null, visible: o.visible, mats });
      }
      // bones whose world scale is far from the model's
      const scales = []; const seen = new Set(); const s = new V(), q = m.modelHolder.quaternion.clone(), tpos = new V();
      for (const o of meshes) for (const bn of o.skeleton.bones) { if (seen.has(bn)) continue; seen.add(bn); bn.matrixWorld.decompose(tpos, q, s); const ls = bn.scale; if (Math.min(Math.abs(ls.x), Math.abs(ls.y), Math.abs(ls.z)) < 0.5 || Math.max(Math.abs(ls.x), Math.abs(ls.y), Math.abs(ls.z)) > 1.5 || ls.x < 0 || ls.y < 0 || ls.z < 0) scales.push({ bone: bn.name, local: [ls.x, ls.y, ls.z].map((x) => +x.toFixed(3)) }); }
      return { T, hLocal: +hLocal.toFixed(3), meshes: out, oddScales: scales };
    }, { CLIP, T });
    await sleep(600);
    await p.screenshot({ path: path.join(out, `pose_${CLIP}_${String(T).replace('.', 'p')}.png`), clip: { x: 390, y: 110, width: 500, height: 500 }, timeout: 240000 });
    res.push(r);
  }
  fs.writeFileSync(path.join(out, `spikes_${CLIP}.json`), JSON.stringify(res, null, 1));
  for (const r of res) { console.log('T', r.T, 'hLocal', r.hLocal); for (const mm of r.meshes) if (mm.bad) console.log('  ', mm.mesh, 'bad', mm.bad, 'of', mm.tris, 'worst', mm.worst, JSON.stringify(mm.bones)); console.log('  odd scales:', JSON.stringify(r.oddScales)); }
  console.log('errs', JSON.stringify(errs.slice(0, 3)));
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
