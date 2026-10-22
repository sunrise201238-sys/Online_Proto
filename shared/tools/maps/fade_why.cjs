// At one spot: every fading mesh with its name, its thing's box and the extent of the thing's hull columns, the camera's place and the target.
// usage: NODE_PATH=$(npm root -g) node fade_why.cjs <client/dist> <mapKey> x,z
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, spot] = process.argv.slice(2); const [X, Z] = spot.split(',').map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate(async ([x, z]) => { const st = window.__gvgState; for (const P of [st.player.root.position, st.player.body.position]) { P.x = x; P.z = z; } st.player.state.hp = 100;   // (the offline client's root is its place, the physics body what the camera follows) await new Promise((r) => setTimeout(r, 7000));
    let sc = st.player.root; while (sc.parent) sc = sc.parent; const M = (v, c) => (v / 4 + c).toFixed(1); const out = []; const seen = new Set();
    sc.traverse((o) => { if (!(o.isMesh && o.material && o.material.transparent && o.material.opacity < 0.995 && o.visible)) return; const bx = o.userData.fadeBox; const g = o.userData.fadeGroup ?? ('mesh' + o.id); if (seen.has(g)) return; seen.add(g);
      if (!bx) { out.push({ kind: 'not a fade thing', name: o.name || o.parent?.name || o.type, opacity: +o.material.opacity.toFixed(2), tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 }); return; }
      let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity, py1 = -Infinity; for (const c of bx.parts ?? []) { px0 = Math.min(px0, c.minX); px1 = Math.max(px1, c.maxX); pz0 = Math.min(pz0, c.minZ); pz1 = Math.max(pz1, c.maxZ); py1 = Math.max(py1, c.maxY); }
      out.push({ kind: 'thing', group: g, box: `x ${M(bx.minX, 49.8)}..${M(bx.maxX, 49.8)} z ${M(bx.minZ, -32)}..${M(bx.maxZ, -32)}`, parts: bx.parts?.length ?? 0, partsExtent: `x ${M(px0, 49.8)}..${M(px1, 49.8)} z ${M(pz0, -32)}..${M(pz1, -32)} top ${(py1 / 4).toFixed(1)} m`, blocking: o.userData.fadeBlocking, opacity: +o.material.opacity.toFixed(2) }); });
    const root_ = st.player.root; const cam = window.__camera; const en = st.enemy?.root?.position; return { camera: cam ? { x: M(cam.position.x, 49.8), y: (cam.position.y / 4).toFixed(1), z: M(cam.position.z, -32) } : null, enemy: en ? { x: M(en.x, 49.8), z: M(en.z, -32) } : null, player: { x: M(root_.position.x, 49.8), y: (root_.position.y / 4).toFixed(1), z: M(root_.position.z, -32) }, fading: out }; }, [X, Z]);
  console.log(JSON.stringify(r, null, 1)); await b.close(); server.close();
})();
