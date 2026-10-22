// Each fade thing of a modelled map: its triangles' box (model metres), its source nodes, its triangle count and its hull —
// how many faces the hull holds, and how many of the thing's faces are narrow both ways (the post rule) by cell.
// usage: NODE_PATH=$(npm root -g) node fade_hull.cjs <client/dist> <mapKey> <cxM> <czM>
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, mapKey, cxS, czS] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir); const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
  await p.evaluate((k) => { window.__gvgState.spectatorMode = false; return window.__startMatch({ mapKey: k, mode: '1v1', player: 'unit1', enemy: 'unit2' }); }, mapKey); await sleep(10000);
  const r = await p.evaluate(([CX, CZ]) => { const list = window.__gvgState.wallFadeMeshes ?? []; const groups = new Map(); const v = [0, 0, 0];
    for (const m of list) { const bx = m.userData.fadeBox; const g = m.userData.fadeGroup ?? m.id; const e = groups.get(g) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, nodes: new Set(), tris: 0, hull: 0, meshes: 0 };
      e.meshes += 1; e.hull += bx.parts?.length ?? 0; e.nodes.add(m.parent?.name ?? '?'); m.updateMatrixWorld(true);
      const pos = m.geometry.attributes.position, idx = m.geometry.index.array; e.tris += idx.length / 3; const el = m.matrixWorld.elements;
      for (let i = 0; i < idx.length; i += 1) { const k = idx[i]; const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k); const wx = el[0] * x + el[4] * y + el[8] * z + el[12], wy = el[1] * x + el[5] * y + el[9] * z + el[13], wz = el[2] * x + el[6] * y + el[10] * z + el[14];
        if (wx < e.minX) e.minX = wx; if (wx > e.maxX) e.maxX = wx; if (wy < e.minY) e.minY = wy; if (wy > e.maxY) e.maxY = wy; if (wz < e.minZ) e.minZ = wz; if (wz > e.maxZ) e.maxZ = wz; }
      groups.set(g, e); }
    const out = []; for (const [g, e] of groups) out.push(`${g}: x ${(e.minX / 4 + CX).toFixed(1)}..${(e.maxX / 4 + CX).toFixed(1)} z ${(e.minZ / 4 + CZ).toFixed(1)}..${(e.maxZ / 4 + CZ).toFixed(1)} y ${(e.minY / 4).toFixed(2)}..${(e.maxY / 4).toFixed(2)} m | ${e.meshes} meshes ${e.tris} tris hull ${e.hull} | ${[...e.nodes].slice(0, 6).join(', ')}`);
    return out; }, [CX, CZ]);
  console.log(r.join('\n')); await b.close(); server.close();
})();
