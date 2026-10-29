// A wall photographed from inside, orthographic: the camera on a line at `camX` (or camZ) looking along -x/+x/-z/+z, seeing
// only what lies between `near` and `far` from it. usage: NODE_PATH=$(npm root -g) node glb_elevation.cjs <glb> <out.png> <axis x|z> <camCoord> <dir +|-> <u0> <u1> <y0> <y1> <near> <far> [pxPerUnit=10]
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [glb, out, axis, camS, dir, u0S, u1S, y0S, y1S, nearS, farS, ppuS] = process.argv.slice(2); const A = { axis, cam: Number(camS), dir, u0: Number(u0S), u1: Number(u1S), y0: Number(y0S), y1: Number(y1S), near: Number(nearS), far: Number(farS), ppu: Number(ppuS ?? 10) };
const THREE_DIR = '/home/user/v089/node_modules/three'; const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };
(async () => {
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); let f = null;
    if (u === '/model.glb') f = path.resolve(glb); else if (u === '/three.module.js' || u === '/three.core.js') f = path.join(THREE_DIR, 'build' + u); else if (u.startsWith('/jsm/')) f = path.join(THREE_DIR, 'examples/jsm', u.slice(5));
    else if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${port}/`); await p.waitForFunction(() => typeof window.__render === 'function', null, { timeout: 60000 });
  const r = await p.evaluate(async (A) => await window.__render(A), A); if (!r || !r.dataUrl) { console.log('render failed', errs.join(' | ')); await b.close(); server.close(); return; }
  fs.writeFileSync(out, Buffer.from(r.dataUrl.split(',')[1], 'base64')); console.log(JSON.stringify({ out, px: r.px })); await b.close(); server.close();
})();
const PAGE = `<!doctype html><html><body style="margin:0"><script type="importmap">{"imports":{"three":"/three.module.js","three/addons/":"/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.__render = (A) => new Promise((resolve) => { new GLTFLoader().load('/model.glb', (gltf) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x202020); scene.add(gltf.scene); scene.add(new THREE.AmbientLight(0xffffff, 2.5));
  const w = Math.round((A.u1 - A.u0) * A.ppu), h = Math.round((A.y1 - A.y0) * A.ppu); const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(w, h); document.body.appendChild(renderer.domElement);
  const s = A.dir === '-' ? -1 : 1;   // looking along -axis or +axis
  // the camera's right must be +u when looking along -x: right = -z... keep it simple: build with lookAt and set left/right so the image reads u increasing to the right as seen in the plan when looking along -x (right = -z) and along +x (right = +z); along -z right = +x; along +z right = -x
  const rightSign = A.axis === 'x' ? (s < 0 ? -1 : 1) : (s < 0 ? 1 : -1);
  const cam = new THREE.OrthographicCamera(rightSign > 0 ? A.u0 : -A.u1, rightSign > 0 ? A.u1 : -A.u0, A.y1, A.y0, A.near, A.far);
  const mid = (A.u0 + A.u1) / 2; if (A.axis === 'x') { cam.position.set(A.cam, 0, 0); cam.lookAt(A.cam + s, 0, 0); } else { cam.position.set(0, 0, A.cam); cam.lookAt(0, 0, A.cam + s); }
  cam.up.set(0, 1, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  // shift the view so u0..u1 and y0..y1 map: the ortho box is in camera space; set the camera's position so camera-space right axis coordinate 0 corresponds to world u = 0 (it does, camera at u=0) — frames are absolute in world units along the right axis
  renderer.render(scene, cam); resolve({ dataUrl: renderer.domElement.toDataURL('image/png'), px: [w, h] }); }, undefined, (e) => resolve({ error: String(e) })); });
</script></body></html>`;
