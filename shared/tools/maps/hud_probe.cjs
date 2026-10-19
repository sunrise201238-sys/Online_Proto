// The HUD and command mode checked headlessly on a modelled map: a 2v2 offline match, then the HUD's class and the
// corner bars' display, the lock bracket, the edge arrows and every unit's floating bar; then command mode (the 'v'
// key) — the background's colour, the roof meshes' visibility, the HUD class again; the renderer's draw calls and
// triangles of one frame. Run only with the user's leave (it runs the game client).
// usage: NODE_PATH=$(npm root -g) node hud_probe.cjs <client/dist> <mapKey>
const { chromium } = require('playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '2v2', player: 'unit1', enemy: 'unit2', ally: 'unit3', enemy2: 'unit4' }); }, mapKey); await sleep(12000);
  const snap = () => p.evaluate(() => { const st = window.__gvgState; const hud = document.querySelector('.touch-hud'); const disp = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : 'none-el'; };
    const bars = {}; for (const [name, m] of [['player', st.player], ['enemy', st.enemy], ['ally', st.ally], ['enemy2', st.enemy2]]) if (m?.healthBar) bars[name] = `${m.healthBar.visible ? 'shown' : 'hidden'}${m.healthBar.userData.barAnomaly ? ' pill-only' : ''}`;
    let sc = st.player.root; while (sc.parent) sc = sc.parent; const r = window.__gvgRenderer; const info = r ? { calls: r.info.render.calls, tris: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures } : null;
    return { hudClass: hud?.className ?? null, enemyBar: disp('.enemy-health'), ownBar: disp('.health'), reticle: st.reticle?.visible ?? null, bars, background: sc.background?.getHexString?.() ?? null, running: st.running, player: st.player?.root?.position ? { x: Math.round(st.player.root.position.x), y: Math.round(st.player.root.position.y * 100) / 100, z: Math.round(st.player.root.position.z) } : null, hp: st.player?.state?.hp, info }; });
  const classic = await snap();
  await p.keyboard.press('v'); await sleep(3000);
  const command = await snap();
  console.log('classic', JSON.stringify(classic)); console.log('command', JSON.stringify(command));
  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
  await b.close(); server.close();
})();
