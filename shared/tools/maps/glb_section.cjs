// A model photographed straight down, orthographic, with a metre grid: to read a plan the user marked against the model's own
// coordinates. usage: NODE_PATH=$(npm root -g) node glb_section.cjs <file.glb> <out.png> <cutY> [pxPerM=8] [gridM=20] [x0 x1 z0 z1]  — everything above cutY is cut away (the camera sits there, looking down)
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [glb, out, cutArg, ppmArg, gridArg, ...win] = process.argv.slice(2); const CUT = Number(cutArg); const PPM = Number(ppmArg ?? 8), GRID = Number(gridArg ?? 20);
const THREE_DIR = '/home/user/v089/node_modules/three';
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };
(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let f = null;
    if (u === '/model.glb') f = path.resolve(glb); else if (u === '/three.module.js' || u === '/three.core.js') f = path.join(THREE_DIR, 'build' + u); else if (u.startsWith('/jsm/')) f = path.join(THREE_DIR, 'examples/jsm', u.slice(5));
    else if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    if (!f || !fs.existsSync(f)) { if (u !== '/favicon.ico') console.log('404', u); res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${port}/`);
  try { await p.waitForFunction(() => typeof window.__render === 'function', null, { timeout: 60000 }); } catch (e) { console.log('the page did not come up:', errs.join(' | ') || String(e).slice(0, 200)); await b.close(); server.close(); return; }
  const r = await p.evaluate(async ([ppm, win, cut]) => await window.__render(ppm, win, cut), [PPM, win.map(Number), CUT]);
  if (!r || !r.dataUrl) { console.log('render failed', errs.join(' | ')); await b.close(); server.close(); return; }
  fs.writeFileSync(out, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
  console.log(JSON.stringify({ out, bounds: r.bounds, window: r.window, px: r.px, pxPerM: PPM, note: 'image x right = +x, image y down = +z; the grid every ' + GRID + ' m is drawn by the caller (pillow) from window and pxPerM' }));
  if (errs.length) console.log('errors:', errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
})();
const PAGE = `<!doctype html><html><body style="margin:0"><script type="importmap">{"imports":{"three":"/three.module.js","three/addons/":"/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.__render = (ppm, win, cut) => new Promise((resolve) => {
  const loader = new GLTFLoader(); loader.load('/model.glb', (gltf) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x202020); scene.add(gltf.scene);
    scene.add(new THREE.AmbientLight(0xffffff, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(100, 300, 150); scene.add(sun);
    const box = new THREE.Box3().setFromObject(gltf.scene); const bounds = { x: [box.min.x, box.max.x], y: [box.min.y, box.max.y], z: [box.min.z, box.max.z] };
    const [x0, x1, z0, z1] = win.length === 4 ? win : [box.min.x, box.max.x, box.min.z, box.max.z];
    const w = Math.round((x1 - x0) * ppm), h = Math.round((z1 - z0) * ppm);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(w, h); document.body.appendChild(renderer.domElement);
    const cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 1, 2000);   // (top = -z0: with up = (0,0,-1), the camera's +y is world -z, so world z grows downward in the image)
    cam.position.set(0, cut + 1, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    renderer.render(scene, cam); resolve({ dataUrl: renderer.domElement.toDataURL('image/png'), bounds, window: [x0, x1, z0, z1], px: [w, h] });
  }, undefined, (e) => resolve({ error: String(e) }));
});
</script></body></html>`;
