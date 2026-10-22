// The user's marks on a spawn plan screenshot, read back in model metres: the screenshot is the plan PNG scaled and framed
// by the app's dark border; the plan's frame is found as the non-border area, the scale from its width, and the blue crosses
// and red markers clustered by colour. usage: NODE_PATH=$(npm root -g) node marks_read.cjs <shot.png> <origW> <origH> <margin> <pxPerM> <x0> <z0>
const { chromium } = require('playwright'); const fs = require('node:fs');
const [shot, oW, oH, mS, ppmS, x0S, z0S] = process.argv.slice(2); const OW = Number(oW), OH = Number(oH), M = Number(mS), PPM = Number(ppmS), X0 = Number(x0S), Z0 = Number(z0S);
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); const p = await b.newPage();
  const r = await p.evaluate(async ([src]) => { const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; }); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const W = c.width, H = c.height;
    const at = (x, y) => { const o = (y * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const border = at(0, 0); const isBorder = (x, y) => { const q = at(x, y); return Math.abs(q[0] - border[0]) < 12 && Math.abs(q[1] - border[1]) < 12 && Math.abs(q[2] - border[2]) < 12; };
    let fx0 = W, fx1 = -1, fy0 = H, fy1 = -1; for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (!isBorder(x, y)) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y; }
    const cluster = (test, gap) => { const pts = []; for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const q = at(x, y); if (test(q)) pts.push([x, y]); }
      const cl = []; for (const [x, y] of pts) { let hit = null; for (const k of cl) if (Math.abs(k.cx - x) < gap && Math.abs(k.cy - y) < gap) { hit = k; break; } if (hit) { hit.n += 1; hit.sx += x; hit.sy += y; hit.cx = hit.sx / hit.n; hit.cy = hit.sy / hit.n; hit.x0 = Math.min(hit.x0, x); hit.x1 = Math.max(hit.x1, x); hit.y0 = Math.min(hit.y0, y); hit.y1 = Math.max(hit.y1, y); } else cl.push({ n: 1, sx: x, sy: y, cx: x, cy: y, x0: x, x1: x, y0: y, y1: y }); }
      return cl.filter((k) => k.n >= 20); };
    const blue = cluster((q) => q[2] > 150 && q[0] < 110 && q[1] < 140 && q[2] - q[0] > 80, 28);
    const red = cluster((q) => q[0] > 170 && q[1] < 70 && q[2] < 70, 14);
    return { W, H, frame: [fx0, fy0, fx1, fy1], blue, red, border }; }, ['data:image/png;base64,' + fs.readFileSync(shot).toString('base64')]);
  const fw = r.frame[2] - r.frame[0] + 1, fh = r.frame[3] - r.frame[1] + 1; const s = fw / OW;
  console.log(`shot ${r.W}x${r.H}, border rgb ${r.border}, frame ${r.frame.join(',')} = ${fw}x${fh}; scale by width ${s.toFixed(4)}, by height ${(fh / OH).toFixed(4)}`);
  const toM = (px, py) => [((px - r.frame[0]) / s - M) / PPM + X0, ((py - r.frame[1]) / s - M) / PPM + Z0];
  for (const k of r.blue.sort((a, c) => a.cy - c.cy)) { const [x, z] = toM(k.cx, k.cy); console.log(`blue  px (${k.cx.toFixed(0)}, ${k.cy.toFixed(0)}) size ${k.x1 - k.x0}x${k.y1 - k.y0} n ${k.n} -> (${x.toFixed(1)}, ${z.toFixed(1)})`); }
  for (const k of r.red.sort((a, c) => a.cy - c.cy)) { const [x, z] = toM(k.cx, k.cy); console.log(`red   px (${k.cx.toFixed(0)}, ${k.cy.toFixed(0)}) size ${k.x1 - k.x0}x${k.y1 - k.y0} n ${k.n} -> (${x.toFixed(1)}, ${z.toFixed(1)})  bbox ${k.x0},${k.y0}..${k.x1},${k.y1}`); }
  await b.close(); })();
