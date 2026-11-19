// hud_now.cjs <client/dist> <out dir> — the 2v2 HUD as it is, at three screen sizes: the ally command's two calls open and two
// knockouts in the kill feed, so the free room round them can be seen. Offline 2v2 on Warehouse.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  for (const [name, w, h, touch] of [['phone_wide', 844, 390, true], ['desktop', 1366, 768, false], ['phone_tall', 390, 844, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
    await p.evaluate(() => { const st = window.__gvgState; st.dummyMode = true; window.__startMatch({ mapKey: 'warehouse', mode: '2v2', mainMode: 'duel', player: 'unit7', ally: 'unit22', enemy: 'unit1', enemy2: 'unit14' }); });
    await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
    await sleep(800);
    const info = await p.evaluate(() => { const st = window.__gvgState; window.__killFeed.note(st.enemy, st.player); window.__killFeed.note(st.enemy2, st.ally); window.__tactic.cfg.closeMs = 600000; window.__tactic.open(true);
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; };
      return { cls: document.documentElement.className, tacBtn: r('#tac-btn'), pop: r('.tac-pop'), feed: r('#kill-feed'), pause: r('.pause-btn, #pause-btn, [data-act="pause"]') }; });
    await sleep(700);
    const kf = await p.evaluate(() => [...document.querySelectorAll('.kf')].map((e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; }));
    await p.screenshot({ path: path.join(out, `${name}.png`), timeout: 240000 });
    console.log(name, JSON.stringify({ ...info, kf }));
    await ctx.close();
  }
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
