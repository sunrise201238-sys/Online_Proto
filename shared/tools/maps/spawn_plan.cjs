// The spawn places on a plan: a labelled metre grid (model metres, the F7 panel's numbers) and a marker per spawn.
// usage: NODE_PATH=$(npm root -g) node spawn_plan.cjs <plan.png> <x0> <z0> <pxPerM> <out.png> "<label>=x,z;<label>=x,z" [title]
const { chromium } = require('playwright'); const fs = require('node:fs');
const [plan, x0S, z0S, ppmS, out, marksS, title] = process.argv.slice(2); const X0 = Number(x0S), Z0 = Number(z0S), PPM = Number(ppmS);
const marks = marksS.split(';').filter(Boolean).map((m) => { const [label, xz] = m.split('='); const [x, z] = xz.split(',').map(Number); return { label, x, z }; });
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); const p = await b.newPage();
  const png = await p.evaluate(async ([src, marks, X0, Z0, PPM, title]) => {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const M = 56;   // (a margin for the axis numbers)
    const c = document.createElement('canvas'); c.width = img.width + M + 16; c.height = img.height + M + 16; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, M, M);
    const px = (x) => M + (x - X0) * PPM, pz = (z) => M + (z - Z0) * PPM;
    const xEnd = X0 + img.width / PPM, zEnd = Z0 + img.height / PPM;
    const step = (xEnd - X0) > 80 ? 10 : 5;
    g.fillStyle = '#000'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let m = Math.ceil(X0 / step) * step; m <= xEnd; m += step) { g.fillText(String(m), px(m), M - 6); g.fillRect(px(m) - 1, M - 4, 2, 4); }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let m = Math.ceil(Z0 / step) * step; m <= zEnd; m += step) { g.fillText(String(m), M - 8, pz(m)); g.fillRect(M - 4, pz(m) - 1, 4, 2); }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = 'bold 15px sans-serif';
    g.fillText('x →', M + 4, 18); g.save(); g.translate(16, M + 4); g.rotate(Math.PI / 2); g.fillText('z ↓', 0, 0); g.restore();
    if (title) { g.font = 'bold 18px sans-serif'; g.textAlign = 'right'; g.fillText(title, c.width - 8, 22); }
    const R = Math.max(10, Math.min(22, PPM * 0.9));
    for (const m of marks) { const x = px(m.x), z = pz(m.z);
      g.beginPath(); g.arc(x, z, R, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#d00'; g.stroke();
      g.beginPath(); g.moveTo(x - R * 1.6, z); g.lineTo(x + R * 1.6, z); g.moveTo(x, z - R * 1.6); g.lineTo(x, z + R * 1.6); g.lineWidth = 2; g.stroke();
      g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d00'; g.fillText(m.label, x, z);
      g.font = 'bold 16px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; const t = `${m.label} (${m.x}, ${m.z})`; const w = g.measureText(t).width;
      let tx = x + R + 6, tz = z + R + 2; if (tx + w + 4 > c.width) tx = x - R - 6 - w; if (tz + 20 > c.height) tz = z - R - 22;
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(tx - 3, tz - 2, w + 6, 20); g.fillStyle = '#d00'; g.fillText(t, tx, tz); }
    return c.toDataURL('image/png'); }, ['data:image/png;base64,' + fs.readFileSync(plan).toString('base64'), marks, X0, Z0, PPM, title ?? '']);
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64')); console.log('spawn plan ->', out); await b.close(); })();
