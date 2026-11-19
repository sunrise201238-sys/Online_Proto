// hud_mock.cjs <client/dist> <out dir> <state> — the 2v2 HUD at three screen sizes with the teammate's messages forced on
// (an offline 2v2 stands in for the online one: the classes and the line are set by hand through the page's hooks).
//   state: menu — the four messages up;  recv — the mate's line;  own — my own receipt;  recv1 / recv2 — the mate's line beside
//   one / two knockouts;  cool — the button after a send
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const [dir, out, STATE = 'menu'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
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
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(500);
    await p.evaluate(() => { const st = window.__gvgState; st.dummyMode = true; window.__startMatch({ mapKey: 'warehouse', mode: '2v2', mainMode: 'duel', player: 'unit7', ally: 'unit22', enemy: 'unit1', enemy2: 'unit14' }); });
    await sleep(1500); for (let i = 0; i < 1500 && await p.evaluate(() => !!(window.__loading?.up?.()) || !!window.__intro?.active); i += 1) await sleep(100);
    await sleep(800);
    const info = await p.evaluate((STATE) => { const st = window.__gvgState, T = window.__tactic, el = T.hud.el; const far = performance.now() + 600000;
      const r = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; };
      T.hud.el = null;   // (the game's own update of the button stands down: the classes below stay as set)
      if (STATE === 'menu') el.classList.add('msg', 'open');
      if (STATE === 'cool') { el.classList.add('msg', 'cool'); el.classList.remove('live', 'open'); }
      if (STATE.startsWith('recv')) T.msgs.recv = { kind: 'askGo', from: 'p3', own: false, until: far };
      if (STATE === 'own') T.msgs.echo = { kind: 'askBack', from: 'p1', own: true, until: far };
      if (STATE === 'recv1' || STATE === 'recv2') { window.__killFeed.cfg.stayMs = 600000; window.__killFeed.note(st.enemy, st.player); if (STATE === 'recv2') window.__killFeed.note(st.enemy2, st.ally); }
      return { cls: document.documentElement.className }; }, STATE);
    await sleep(900);
    const rects = await p.evaluate(() => { const r = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; };
      return { opts: [...document.querySelectorAll('.tac-msgs .tac-opt')].filter((e) => e.offsetParent).map(r), am: [...document.querySelectorAll('.am .am-in')].map(r), kf: [...document.querySelectorAll('.kf')].map(r), btn: r(document.querySelector('#tac-btn')) }; });
    await p.screenshot({ path: path.join(out, `${STATE}_${name}.png`), timeout: 240000 });
    console.log(STATE, name, JSON.stringify({ ...info, ...rects, errs }));
    await ctx.close();
  }
  await b.close(); server.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
