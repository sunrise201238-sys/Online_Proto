// last_tag.cjs <repo root> <page dir> <out dir> <label> [server url rewrite] — the LAST tag on a tapped card, in the online
// pickers: the repo's own server on port 3001 and one page as the room's host. The page is told what "the last match" was
// (the three fields a real RESELECT leaves on it: lastUnitKeys, lastUnitKey, lastMapKey) and then walks its own pages: Trio,
// 2v2, the unit picker — a LAST card tapped, measured and photographed — three picks, the map picker — the LAST map tapped,
// measured and photographed. Measured: the two boxes a card can wear (::before, ::after): their words and their size.
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { spawn } = require('node:child_process');
const [repo, dir, out, LABEL = 'run'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['src/index.js'], { cwd: path.join(repo, 'server'), env: { ...process.env, PORT: '3001' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = ''; srv.stdout.on('data', (d) => { srvLog += d; }); srv.stderr.on('data', (d) => { srvLog += d; });
  for (let i = 0; i < 600 && !/listening/i.test(srvLog); i += 1) await sleep(200);
  const root = path.resolve(dir);
  const web = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => web.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${web.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 960, height: 520 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(400);
    await p.click('button[data-online]');
    const until = async (what, f, ms = 60000) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await sleep(150); } };
    await until('seated', () => p.evaluate(() => { const c = window.__gvgState.online?.conn; return !!c && c.isConnected() && c.getPlayerId(); }));
    // what a RESELECT leaves on the page: the last match's roster, unit and map
    await p.evaluate(() => { const o = window.__gvgState.online; o.lastUnitKeys = ['unit1', 'unit14', 'unit17']; o.lastUnitKey = 'unit17'; o.lastMapKey = 'town'; });
    const press = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true })); if (e.matches('.unit-card')) e.click(); return true; }, sel);   // (a card acts on the click that follows the press; a page's buttons on the press itself)
    await until('the mode page', () => p.evaluate(() => !!document.querySelector('button[data-main-mode-pick="trio"]'))); await sleep(700);
    await press('button[data-main-mode-pick="trio"]'); await until('the team size page', () => p.evaluate(() => !!document.querySelector('button[data-mode-pick="2v2"]'))); await sleep(700);
    await press('button[data-mode-pick="2v2"]');
    await until('the unit picker', () => p.evaluate(() => !!document.querySelector('.menu [data-unit-card].last-pick')), 30000); await sleep(900);
    const measure = (sel) => p.evaluate((sel) => { const card = document.querySelector(sel); if (!card) return null; const box = card.getBoundingClientRect();
      const one = (ps) => { const c = getComputedStyle(card, ps); return c.content === 'none' || c.content === 'normal' ? null : { words: c.content.replace(/^"|"$/g, '').trim(), w: Math.round(parseFloat(c.width)), h: Math.round(parseFloat(c.height)), top: c.top, bottom: c.bottom, bg: c.backgroundColor }; };
      return { card: card.dataset.unitCard ?? card.dataset.mapCard, classes: card.className, cardH: Math.round(box.height), before: one('::before'), after: one('::after') }; }, sel);
    const report = {};
    const lastCards = await p.evaluate(() => [...document.querySelectorAll('.menu [data-unit-card].last-pick')].map((c) => `${c.dataset.unitCard}:${c.dataset.last}`));
    report.unitMarks = lastCards;
    report.unitIdle = await measure('.menu [data-unit-card="unit17"]');
    await press('.menu [data-unit-card="unit17"]'); await sleep(900);
    report.unitTapped = await measure('.menu [data-unit-card="unit17"]');
    await p.screenshot({ path: path.join(out, `${LABEL}_unit.png`) });
    // three picks: the tapped card's second tap confirms it, then two more cards twice each
    await press('.menu [data-unit-card="unit17"]'); await sleep(900);
    for (const k of ['unit1', 'unit14']) { await until('the picker again', () => p.evaluate((k) => !!document.querySelector(`.menu [data-unit-card="${k}"]`), k)); await sleep(500); await press(`.menu [data-unit-card="${k}"]`); await sleep(500); await press(`.menu [data-unit-card="${k}"]`); await sleep(900); }
    await until('the map picker', () => p.evaluate(() => !!document.querySelector('.menu [data-map-card].last-pick')), 30000); await sleep(900);
    report.mapIdle = await measure('.menu [data-map-card="town"]');
    await press('.menu [data-map-card="town"]'); await sleep(900);
    report.mapTapped = await measure('.menu [data-map-card="town"]');
    await p.screenshot({ path: path.join(out, `${LABEL}_map.png`) });
    report.tag = await p.evaluate(() => (document.body.innerText.match(/b\d{4}[a-z]{2} \d\d-\d\d/) || [null])[0]); report.errs = errs.slice(0, 3);
    fs.writeFileSync(path.join(out, `${LABEL}_report.json`), JSON.stringify(report, null, 1));
    const line = (name, m) => console.log(`${name.padEnd(12)} card ${m?.card} h ${m?.cardH}  ::before ${m?.before ? `"${m.before.words}" ${m.before.w}x${m.before.h}` : '—'}   ::after ${m?.after ? `"${m.after.words}" ${m.after.w}x${m.after.h}` : '—'}`);
    console.log('marks', JSON.stringify(report.unitMarks), 'errs', JSON.stringify(report.errs));
    line('unit idle', report.unitIdle); line('unit tapped', report.unitTapped); line('map idle', report.mapIdle); line('map tapped', report.mapTapped);
  } catch (e) { console.error('RIG ERROR', e.message); console.log(srvLog.split('\n').slice(-5).join('\n').slice(0, 600)); }
  try { await b.close(); } catch { /* gone */ } try { srv.kill('SIGTERM'); } catch { /* gone */ } web.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
