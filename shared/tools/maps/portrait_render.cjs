// A character's profile picture and picker thumbnail rendered from its model, in the style of the existing set: the
// whole figure in its idle pose, lit plainly, seen from the front a little to one side, on a transparent ground
// (profile, a 531 px square with the figure filling ~90 % of the height); the thumbnail a square crop from the top of
// the head's hair down to the chest (~300 px). three.js is served from the client tree's node_modules.
// usage: NODE_PATH=$(npm root -g) node portrait_render.cjs <sdplay root> <model.glb> <idleClip> <outPrefix> [yawDeg=22] [frameS=0.6] [thumbFrac=0.46] [thumbTop=0.02]
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const [root, glb, idle, out, yawS, frameS, thumbFracS, thumbTopS] = process.argv.slice(2); const yaw = Number(yawS ?? 22), frame = Number(frameS ?? 0.6), thumbFrac = Number(thumbFracS ?? 0.46), thumbTop = Number(thumbTopS ?? 0.02);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/octet-stream' };
const page_html = `<!doctype html><html><body style="margin:0;background:transparent"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const S = 1024; const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setSize(S, S); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 4, 3); scene.add(sun); const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-3, 2, 2); scene.add(fill);
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
new GLTFLoader().load('/model.glb', (gltf) => {
  const m = gltf.scene; scene.add(m);
  const mixer = new THREE.AnimationMixer(m); const clip = gltf.animations.find((c) => c.name === '${idle}') ?? gltf.animations[0]; if (clip) { mixer.clipAction(clip).play(); mixer.update(${frame}); }
  m.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(m); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const h = size.y; const dist = (h / 0.9 / 2) / Math.tan(camera.fov * Math.PI / 360); const a = ${yaw} * Math.PI / 180;
  camera.position.set(c.x + Math.sin(a) * dist, c.y + h * 0.04, c.z + Math.cos(a) * dist); camera.lookAt(c.x, c.y, c.z); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  const proj = (p) => { const v = p.clone().project(camera); return [(v.x + 1) / 2 * S, (1 - v.y) / 2 * S]; };
  const top = proj(new THREE.Vector3(c.x, box.max.y, c.z)), bot = proj(new THREE.Vector3(c.x, box.min.y, c.z)); const head = proj(new THREE.Vector3(c.x, box.min.y + h * 0.82, c.z));
  window.__done = { top: top[1], bottom: bot[1], headX: head[0], headY: head[1], h, clip: clip?.name, clips: gltf.animations.length };
}, undefined, (e) => { window.__done = { error: String(e) }; });
</script></body></html>`;
(async () => {
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); let f; if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html); return; } if (u === '/model.glb') f = path.resolve(glb); else f = path.join(path.resolve(root), u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto(`http://127.0.0.1:${port}/`); await p.waitForFunction(() => window.__done, null, { timeout: 60000 }); const info = await p.evaluate(() => window.__done);
  if (info.error) { console.log('error', info.error, errs.join(' | ')); await b.close(); server.close(); process.exit(1); }
  const raw = out + '_raw.png'; await p.screenshot({ path: raw, omitBackground: true }); await b.close(); server.close();
  // the profile: the square render scaled to 531 px; the thumbnail: a square of thumbFrac * the figure's pixel height, its top
  // thumbTop * that height above the head, centred on the head's x, scaled to 300 px
  const H = info.bottom - info.top; const side = Math.round(H * thumbFrac); const y0 = Math.max(0, Math.round(info.top - H * thumbTop)); const x0 = Math.max(0, Math.min(1024 - side, Math.round(info.headX - side / 2)));
  execFileSync('convert', [raw, '-resize', '531x531', out + '_profile.png']);
  execFileSync('convert', [raw, '-crop', `${side}x${side}+${x0}+${y0}`, '+repage', '-resize', '300x300', out + '_profile_thumbnail.png']);
  console.log(JSON.stringify({ clip: info.clip, clips: info.clips, figurePx: Math.round(H), thumb: { side, x0, y0 } }), errs.length ? '\nerrors: ' + errs.join(' | ') : '');
})();
