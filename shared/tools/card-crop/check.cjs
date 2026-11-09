// check.cjs <page.html> <client dist> <outDir> [unit ...] — the Line-up Card Crop page against the game. For each unit (default: every
// unit the page has), the page's "Now in game" preview and the 1v1 lobby card the game draws for that unit, both unrotated, at device
// scale 2, on a computer-height screen (960 x 540: the card's picture 190 x 118) and a phone-height one (960 x 420: 190 x 108).
// Prints each pair's mean difference (0-255, per channel, the pictures' rounded corners left out) at no offset and at the best offset
// within 3 device px, and writes the pictures to <outDir>. A crop that matches reads a few levels (2-4.5 for Saori and Yuuka,
// 2026-11-09); a wrong one 40 and more. Needs Playwright with its Chromium, and a built client of the line from 0.9.5 on
// (client/: npm run build, then client/dist).
const { chromium } = require('playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [page, dist, outDir, ...only] = process.argv.slice(2);
if (!page || !dist || !outDir) { console.error('usage: node check.cjs <page.html> <client dist> <outDir> [unit ...]'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };
const UNROT_GAME = '.menu .lobby-folder .slot-card.unit-slot { transform: none !important; } .menu .lobby-grid { zoom: 1 !important; }';
const UNROT_PAGE = '.card { transform: none !important; }';

function serve(root) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
// the lobby's 1v1 card picture for one unit: the default card, or the unit picked in the picker (tap its tile, then CONFIRM!)
async function gameShot(browser, base, name, vh, file) {
  const p = await browser.newPage({ viewport: { width: 960, height: vh }, deviceScaleFactor: 2 });
  try {
    await p.goto(base, { waitUntil: 'load' }); await p.waitForSelector('.unit-slot .slot-art img', { timeout: 60000 }); await p.waitForTimeout(900);
    const lead = await p.$eval('.unit-slot .slot-name', (el) => el.textContent.trim()).catch(() => '');
    if (lead !== name) {
      await p.click('.unit-slot'); await p.waitForSelector('.unit-grid .unit-card', { timeout: 20000 }); await p.waitForTimeout(700);
      await p.locator('.unit-grid .unit-card', { hasText: name }).first().click(); await p.waitForTimeout(800);
      await p.click('.picker-confirm'); await p.waitForSelector('.unit-slot .slot-art img', { timeout: 20000 }); await p.waitForTimeout(900);
    }
    await p.addStyleTag({ content: UNROT_GAME }); await p.waitForTimeout(250);
    const art = await p.$('.unit-slot .slot-art');
    const info = await art.evaluate((el) => ({ src: el.querySelector('img').getAttribute('src').split('/').pop(), box: `${el.offsetWidth}x${el.offsetHeight}` }));
    await art.screenshot({ path: file });
    return info;
  } finally { await p.close(); }
}
// mean absolute difference of two same-size PNGs, inner area (inset 30 px), at offsets up to 3 px: drawn on canvases in a page
async function compare(browser, fileA, fileB) {
  const p = await browser.newPage();
  try {
    const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    return await p.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
      const [A, B] = await Promise.all([load(a), load(b)]);
      if (A.width !== B.width || A.height !== B.height) return { sizes: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
      const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
      const da = px(A), db = px(B), W = A.width, H = A.height, I = 30;
      const at = (dx, dy) => { let s = 0, n = 0; for (let y = I; y < H - I; y += 1) for (let x = I; x < W - I; x += 1) { const i = (y * W + x) * 4, j = ((y + dy) * W + (x + dx)) * 4; for (let c = 0; c < 3; c += 1) s += Math.abs(da[i + c] - db[j + c]); n += 3; } return s / n; };
      let best = { d: Infinity }; for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) { const d = at(dx, dy); if (d < best.d) best = { d, dx, dy }; }
      return { zero: at(0, 0), best };
    }, [url(fileA), url(fileB)]);
  } finally { await p.close(); }
}
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve(path.resolve(dist)); const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(); let bad = 0;
  try {
    const tool = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await tool.goto('file://' + path.resolve(page), { waitUntil: 'load' }); await tool.waitForTimeout(800);
    const units = (await tool.$$eval('[data-unit]', (bs) => bs.map((b) => [b.dataset.unit, b.textContent.trim()]))).filter(([k]) => !only.length || only.includes(k));
    await tool.addStyleTag({ content: UNROT_PAGE });
    for (const [key, name] of units) {
      await tool.click(`[data-unit="${key}"]`); await tool.click('[data-preset="now"]'); await tool.waitForTimeout(250);
      const crop = await tool.$eval('#readout', (el) => el.textContent);
      await (await tool.$('.card:not(.short) .photo')).screenshot({ path: path.join(outDir, `${key}_page_computer.png`) });
      await (await tool.$('.card.short .photo')).screenshot({ path: path.join(outDir, `${key}_page_phone.png`) });
      for (const [vh, where] of [[540, 'computer'], [420, 'phone']]) {
        const info = await gameShot(browser, base, name, vh, path.join(outDir, `${key}_game_${where}.png`));
        const r = await compare(browser, path.join(outDir, `${key}_page_${where}.png`), path.join(outDir, `${key}_game_${where}.png`));
        const ok = r.best && r.best.d <= 6; if (!ok) bad += 1;
        console.log(`${name.padEnd(8)} ${where.padEnd(8)} game ${info.src} ${info.box}, page "Now in game" ${crop}: ` +
          (r.sizes ? `sizes differ (${r.sizes})` : `mean difference ${r.zero.toFixed(2)}, best ${r.best.d.toFixed(2)} at dx ${r.best.dx} dy ${r.best.dy}`) + (ok ? '  match' : '  DIFFERS'));
      }
    }
    await tool.close();
  } finally { await browser.close(); server.close(); }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
