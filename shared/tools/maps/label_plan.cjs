// Labels drawn on a plan: each entry's label at its centre, with its extent outlined. usage: NODE_PATH=$(npm root -g) node label_plan.cjs <plan.png> <walls.json> <x0> <z0> <pxPerM> <out.png>
const { chromium } = require('playwright'); const fs = require('node:fs');
const [plan, wallsF, x0S, z0S, ppmS, out] = process.argv.slice(2); const X0 = Number(x0S), Z0 = Number(z0S), PPM = Number(ppmS); const walls = JSON.parse(fs.readFileSync(wallsF));
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); const p = await b.newPage();
  const png = await p.evaluate(async ([src, walls, X0, Z0, PPM]) => { const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; }); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = (x) => (x - X0) * PPM, pz = (z) => (z - Z0) * PPM;
    for (const w of walls) { const col = w.kind === 'wall' ? '#e8102a' : w.kind === 'Vents' ? '#1060e0' : '#108a30'; g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(px(w.x0), pz(w.z0), Math.max(4, (w.x1 - w.x0) * PPM), Math.max(4, (w.z1 - w.z0) * PPM)); const cx = px((w.x0 + w.x1) / 2), cz = pz((w.z0 + w.z1) / 2); g.font = 'bold 30px sans-serif'; const tw = g.measureText(w.label).width + 10; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - tw / 2, cz - 19, tw, 38); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w.label, cx, cz); }
    g.font = 'bold 26px sans-serif'; g.fillStyle = '#000'; g.textAlign = 'left'; g.fillText('N (z -)', 12, 30); g.fillText('x -> east', 12, 60);
    return c.toDataURL('image/png'); }, ['data:image/png;base64,' + fs.readFileSync(plan).toString('base64'), walls, X0, Z0, PPM]);
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64')); console.log('labelled plan ->', out); await b.close(); })();
