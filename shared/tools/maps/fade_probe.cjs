// Whether a modelled map's things fade for the player's own character: a 1v1 started headlessly, the player teleported to
// given spots (units), and after a second the meshes whose material has gone translucent are counted and named.
// Run only with the user's leave (it runs the game client). usage: NODE_PATH=$(npm root -g) node fade_probe.cjs <client/dist> <mapKey> x,z x,z ...
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, ...spots] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(12000);
  const total = await p.evaluate(() => { const st = window.__gvgState; let sc = st.player.root; while (sc.parent) sc = sc.parent; let n = 0, fade = 0; sc.traverse((o) => { if (o.isMesh) { n += 1; if (o.userData?.fadeDepthToggle || o.userData?.wallFade) fade += 1; } }); return { meshes: n, fadeFlagged: fade, fields: Object.keys(st.player.state).filter((k) => /pos|^x$|^z$/.test(k)).join(","), hp: st.player.state?.hp }; });
  console.log('scene', JSON.stringify(total));
  for (const s of spots) { const [x, z] = s.split(',').map(Number);
    const r = await p.evaluate(async ([x, z]) => { const st = window.__gvgState; const P = st.player.root.position; for (const Q of [P, st.player.body.position]) { Q.x = x; Q.z = z; } st.player.state.hp = 100;   // (the offline client's root is its place, the physics body what the camera follows) await new Promise((r) => setTimeout(r, 7000)); let sc = st.player.root; while (sc.parent) sc = sc.parent; const names = []; const seenG = new Set(); sc.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && o.material.opacity < 0.995 && o.visible) { const g = o.userData.fadeGroup ?? o.id; if (seenG.has(g)) return; seenG.add(g); const bx = o.userData.fadeBox; names.push(bx ? `x ${(bx.minX / 4 + 49.8).toFixed(0)}..${(bx.maxX / 4 + 49.8).toFixed(0)} z ${(bx.minZ / 4 - 32).toFixed(0)}..${(bx.maxZ / 4 - 32).toFixed(0)} (${bx.parts?.length ?? 0} cols)` : o.name); } }); const cam = st.camera ?? window.__camera; return { at: { x: Math.round(P.x), y: Math.round(P.y * 10) / 10, z: Math.round(P.z) }, fading: names.length, things: names.length, names: names.slice(0, 8) }; }, [x, z]);
    console.log(`spot (${x}, ${z}) u:`, JSON.stringify(r)); }
  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors'); await b.close(); server.close();
})();
