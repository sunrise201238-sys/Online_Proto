// THE BOX VIEW (2026-10-29, user: "very simple geometry cboxes that MATCH THE VISUAL"): a picture of the model with the
// installed data's boxes drawn over it, from any point — three.js in headless Chromium renders the map's GLB, and beside it
// the same view with the data: boxes orange with their edges, flat floors blue, sloped planes green. One 2048 by 1024 picture
// per shot, the model left and the boxes over it right (mode 'overlay': the right half alone, 1024 square). The game's own
// F8 view, a photo at a time through the running client, took a minute a shot and was one orange haze at a block's scale.
// usage: node box_view.cjs <repo root> <mapKey> <out dir> <shots file>
//   the shots file: a line per picture — name cx cz [dist=30] [yaw=0.9] [pitch=0.7] [mode=both] [cy=ground+1] — cx, cz, cy, dist in
//   model metres (cy: the height the camera looks at), yaw in radians from +x toward +z (the camera stands that way from the
//   centre), pitch in radians above the horizon.
//   The map's file, scale, centre, ground and dropped nodes are read from the client's GLB_MAPS line (client/src/main.js),
//   the data from client/public/maps/<mapKey>_data.json (install it first: data_install.mjs). env DATA= another data file.
const { chromium } = require('playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [rootArg, mapKey, outDir, shotsFile] = process.argv.slice(2); const root = path.resolve(rootArg);
const main = fs.readFileSync(path.join(root, 'client/src/main.js'), 'utf8');
const line = main.split('\n').find((l) => new RegExp(`^\\s*${mapKey}: \\{ file: '`).test(l)); if (!line) { console.error(`no GLB_MAPS line for ${mapKey}`); process.exit(1); }
const pick = (k, d) => { const m = line.match(new RegExp(`\\b${k}: (-?[\\d.]+)`)); return m ? Number(m[1]) : d; };
const file = line.match(/file: '([^']+)'/)[1], SCALE = pick('scale', 1), CX = pick('cx', 0), CZ = pick('cz', 0), GROUND = pick('ground', 0);
const dropM = line.match(/drop: \[([^\]]*)\]/); const drop = dropM ? dropM[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
const dataFile = process.env.DATA ? path.resolve(process.env.DATA) : path.join(root, 'client/public/maps', `${mapKey}_data.json`);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/octet-stream', '.glb': 'model/gltf-binary' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#222}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script></head>
<body><canvas id="c" width="1024" height="1024"></canvas><script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const Q = new URLSearchParams(location.search); const P = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);
const SCALE = P('scale', 1), CX = P('cx', 0), CZ = P('cz', 0), GROUND = P('ground', 0); const drop = (Q.get('drop') ?? '').split(',').filter(Boolean);
const canvas = document.getElementById('c'); const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1024, 1024, false); renderer.setClearColor(0x9fb4c8);
const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(40, 80, 20); scene.add(sun);
const gltf = await new GLTFLoader().loadAsync(Q.get('file')); gltf.scene.traverse((o) => { if (drop.some((d) => o.name && o.name.startsWith(d))) o.visible = false; }); scene.add(gltf.scene);
const D = await (await fetch(Q.get('data'))).json(); const mx = (v) => v / SCALE + CX, mz = (v) => v / SCALE + CZ, my = (v) => v / SCALE + GROUND;
// the data, in model metres: boxes, flat floors, planes — each a merged mesh and a merged set of edges
const boxGeos = [], boxEdges = [], flatGeos = [], flatEdges = [], planeGeos = [], planeEdges = [];
const place = (g, x, y, z) => { g.translate(x, y, z); return g; };
for (const o of D.obstacles) { const x0 = mx(o.minX), x1 = mx(o.maxX), y0 = my(o.minY), y1 = my(o.maxY), z0 = mz(o.minZ), z1 = mz(o.maxZ); const g = new THREE.BoxGeometry(Math.max(x1 - x0, 0.03), Math.max(y1 - y0, 0.03), Math.max(z1 - z0, 0.03)); place(g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); boxGeos.push(g); boxEdges.push(new THREE.EdgesGeometry(g)); }
for (const s of D.surfaces) { const x0 = mx(s.minX), x1 = mx(s.maxX), z0 = mz(s.minZ), z1 = mz(s.maxZ);
  if (s.type === 'plane') { const h = (x, z) => my(s.y0 + s.gx * (x - mx(s.minX)) * SCALE + s.gz * (z - mz(s.minZ)) * SCALE); const g = new THREE.BufferGeometry(); const v = new Float32Array([x0, h(x0, z0), z0, x1, h(x1, z0), z0, x1, h(x1, z1), z1, x0, h(x0, z1), z1]); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); planeGeos.push(g); planeEdges.push(new THREE.EdgesGeometry(g)); }
  else { const g = new THREE.PlaneGeometry(Math.max(x1 - x0, 0.03), Math.max(z1 - z0, 0.03)); g.rotateX(-Math.PI / 2); place(g, (x0 + x1) / 2, my(s.top) + 0.01, (z0 + z1) / 2); flatGeos.push(g); flatEdges.push(new THREE.EdgesGeometry(g)); } }
const G = new THREE.Group(); const add = (geos, mat) => { if (geos.length) G.add(mat.isLineBasicMaterial ? new THREE.LineSegments(mergeGeometries(geos), mat) : new THREE.Mesh(mergeGeometries(geos), mat)); };
add(boxGeos, new THREE.MeshBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })); add(boxEdges, new THREE.LineBasicMaterial({ color: 0x8a3300 }));
add(flatGeos, new THREE.MeshBasicMaterial({ color: 0x2a7fff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })); add(flatEdges, new THREE.LineBasicMaterial({ color: 0x0a2a80 }));
add(planeGeos, new THREE.MeshBasicMaterial({ color: 0x22cc44, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); add(planeEdges, new THREE.LineBasicMaterial({ color: 0x0a5a1a, depthTest: false }));   // (a flight's plane runs through the model's treads, under their tops: drawn over everything, or it would not show)
G.visible = false; scene.add(G);
const cam = new THREE.PerspectiveCamera(40, 1, 0.2, 3000);
window.__shoot = (tx, tz, dist, yaw, pitch, mode, label, ty0) => { const ty = Number.isFinite(ty0) ? ty0 : GROUND + 1; cam.position.set(tx + Math.cos(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, tz + Math.sin(yaw) * Math.cos(pitch) * dist); cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix();
  G.visible = false; renderer.render(scene, cam); const a = new Image(); a.src = canvas.toDataURL(); G.visible = true; renderer.render(scene, cam); const b = new Image(); b.src = canvas.toDataURL();
  return new Promise((res) => { let n = 0; const done = () => { if (++n < 2) return; const both = mode !== 'overlay'; const out = document.createElement('canvas'); out.width = both ? 2048 : 1024; out.height = 1024; const c = out.getContext('2d'); if (both) { c.drawImage(a, 0, 0); c.drawImage(b, 1024, 0); } else c.drawImage(b, 0, 0);
    c.font = 'bold 26px sans-serif'; c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, out.width, 40); c.fillStyle = '#fff'; c.fillText(label + (both ? '   |   model' : ''), 12, 29); if (both) c.fillText('model + data: boxes orange, floors blue, planes green', 1036, 29); res(out.toDataURL('image/png')); }; a.onload = done; b.onload = done; }); };
window.__ready = true;
</script></body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); if (u === '/__view.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; } if (u === '/__data.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); fs.createReadStream(dataFile).pipe(res); return; }
    const f = path.join(root, u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const q = new URLSearchParams({ file: `/client/public/${file}.wasm`, data: '/__data.json', scale: String(SCALE), cx: String(CX), cz: String(CZ), ground: String(GROUND), drop: drop.join(',') });
  if (!fs.existsSync(path.join(root, 'client/public', `${file}.wasm`))) q.set('file', `/client/public/${file}.glb`);
  await p.goto(`http://127.0.0.1:${port}/__view.html?${q}`); for (let i = 0; i < 240 && !(await p.evaluate(() => window.__ready === true)); i += 1) await sleep(500);
  if (!(await p.evaluate(() => window.__ready === true))) { console.error('the page did not load the model', errs.join(' | ')); await b.close(); server.close(); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  for (const l of fs.readFileSync(shotsFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))) { const [name, cx, cz, dist = '30', yaw = '0.9', pitch = '0.7', mode = 'both', cy = 'NaN'] = l.split(/\s+/);
    const url = await p.evaluate(([tx, tz, d, y, pt, m, label, ty]) => window.__shoot(tx, tz, d, y, pt, m, label, ty), [Number(cx), Number(cz), Number(dist), Number(yaw), Number(pitch), mode, `${name}  centre (${cx}, ${cz}) m, ${dist} m out, yaw ${yaw}, pitch ${pitch}`, Number(cy)]);
    const out = path.join(outDir, `${name}.png`); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log(`${out} (${fs.statSync(out).size} bytes)`); }
  if (errs.length) console.log('page errors:', errs.join(' | '));
  await b.close(); server.close();
})();
