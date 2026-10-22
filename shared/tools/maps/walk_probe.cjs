// A body walked in the game towards an edge, headlessly: the player's body put at a spot, the enemy far away in the given
// direction (so the camera faces it and 'w' walks that way), the W key held, the body's position and floor sampled.
// usage: NODE_PATH=$(npm root -g) node walk_probe.cjs <client/dist> <mapKey> <xM> <zM> <cxM> <czM> <yawDeg> <seconds>
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, xS, zS, cxS, czS, yawS, secS] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS); const X = (Number(xS) - CX) * 4, Z = (Number(zS) - CZ) * 4; const YAW = Number(yawS) * Math.PI / 180; const SEC = Number(secS ?? 3);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(9000);
  await p.evaluate(([X, Z, YAW]) => { const st = window.__gvgState; const pl = st.player, en = st.enemy; const obs = window.__gvgArenaObstacles ?? []; let h = 0; for (const o of obs) if (o.topBuffer != null && X >= o.minX && X <= o.maxX && Z >= o.minZ && Z <= o.maxZ && o.maxY > h && o.maxY < 40) h = o.maxY;
    const put = (m, x, z, hh) => { m.body.position.set(x, hh + 2.45 + 0.2, z); m.root.position.set(x, hh + 2.45 + 0.2 + (m.modelYOffset ?? 2.35), z); if (m.body.velocity) m.body.velocity.set(0, 0, 0); if (m.state) m.state.vy = 0; };
    put(pl, X, Z, h); put(en, X + Math.sin(YAW) * 200, Z - Math.cos(YAW) * 200, 0);
    const c = window.__camera ?? window.__gvgCamera; const p0 = pl.root.position, e0 = en.root.position; const lx = e0.x - p0.x, lz = e0.z - p0.z, ll = Math.hypot(lx, lz) || 1; c.position.set(p0.x - lx / ll * 13 - lz / ll * 2, p0.y + 6.8, p0.z - lz / ll * 13 + lx / ll * 2); }, [X, Z, YAW]);
  await sleep(1500);
  const samples = []; const read = async (t) => { const s = await p.evaluate(() => { const st = window.__gvgState; const q = st.player.body.position; return [q.x, q.y, q.z]; }); samples.push({ t, xM: +(s[0] / 4 + CX).toFixed(2), zM: +(s[2] / 4 + CZ).toFixed(2), floorM: +((s[1] - 2.45) / 4).toFixed(2) }); };
  await read(0); await p.keyboard.down('w'); for (let t = 250; t <= SEC * 1000; t += 250) { await sleep(250); await read(t / 1000); } await p.keyboard.up('w');
  console.log(JSON.stringify(samples)); await b.close(); server.close();
})();
