// Several matches in a row on one map: the time each takes to build its arena, and what the renderer still holds afterwards
// (three's geometries and textures alive on the GPU, the JS heap) — a leak shows as counts that climb round after round.
// usage: NODE_PATH=$(npm root -g) node load_rounds.cjs <client/dist> <mapKey> [rounds=4]
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, roundsS] = process.argv.slice(2); const ROUNDS = Number(roundsS ?? 4);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  for (let r = 1; r <= ROUNDS; r += 1) {
    const t = await p.evaluate(async (k) => { const st = window.__gvgState; st.spectatorMode = false; const t0 = performance.now(); st.wallFadeMeshes = []; const pr = window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); let built = -1; for (let i = 0; i < 600; i += 1) { await new Promise((q) => setTimeout(q, 100)); if ((st.wallFadeMeshes ?? []).length > 0) { built = performance.now() - t0; break; } } try { await pr; } catch {} const ready = performance.now() - t0; await new Promise((q) => setTimeout(q, 1500)); const info = window.__gvgRenderer?.info; const mem = performance.memory; let scene = null; try { let n = 0; const top = (st.wallFadeMeshes[0]); let rootO = top; while (rootO?.parent) rootO = rootO.parent; rootO?.traverse?.(() => { n += 1; }); scene = n; } catch {} return { built: Math.round(built), ready: Math.round(ready), geometries: info?.memory?.geometries, textures: info?.memory?.textures, programs: info?.programs?.length, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, sceneObjects: scene, fadeMeshes: st.wallFadeMeshes.length }; }, mapKey);
    console.log(`round ${r}: arena built in ${t.built} ms, start resolved ${t.ready} ms; renderer holds ${t.geometries} geometries, ${t.textures} textures, ${t.programs} programs; scene objects ${t.sceneObjects}, fade meshes ${t.fadeMeshes}; JS heap ${t.heapMB} MB`);
  }
  await b.close(); server.close();
})();
