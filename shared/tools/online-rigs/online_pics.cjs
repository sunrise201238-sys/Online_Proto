// online_pics.cjs <repo root> <out dir> (the pictures: both pages at 2x with the messages on screen) — THE TEAMMATE'S MESSAGES on the real thing: the repo's own server on port 3001, the
// built page served beside it, and two pages in one room on one side of a 2v2 (A in p1, the host; B in p3), the other side
// bots. A headless page draws a frame or two a second and answers the rig seconds late, so nothing here is timed from
// outside: each page keeps its own log on its own clock (what its message line shows, frame by frame; what a press did), the
// presses are made by timers inside the page, and the logs are read afterwards.
//   sd: the room plays Sudden Death
const { chromium } = require('playwright'); const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { spawn } = require('node:child_process');
const [repo, out, ARG = 'msgs'] = process.argv.slice(2); const SD = ARG === 'sd', LEAVE = ARG === 'leave';   // msgs: the messages both ways; leave: the mate leaves at once; sd: Sudden Death, one message, then the mate leaves fs.mkdirSync(out, { recursive: true });
const dir = path.join(repo, 'client/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const note = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); };
(async () => {
  const srv = spawn('node', ['src/index.js'], { cwd: path.join(repo, 'server'), env: { ...process.env, PORT: '3001' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = ''; srv.stdout.on('data', (d) => { srvLog += d; }); srv.stderr.on('data', (d) => { srvLog += d; });
  for (let i = 0; i < 600 && !/listening/i.test(srvLog); i += 1) await sleep(200);
  const root = path.resolve(dir);
  const web = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => web.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${web.address().port}/`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  try {
    const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200))); return p; };
    const A = await mk(844, 390), B = await mk(844, 390);   // (small pages: the less a page draws, the nearer it keeps to the server's 60 snapshots a second)
    const online = async (p) => { await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.menu.lobby .opt-groups', { timeout: 90000 }); await sleep(400); await p.click('button[data-online]'); };
    const conn = (p, fn, arg) => p.evaluate(({ fn, arg }) => { const c = window.__gvgState.online?.conn; return c ? (new Function('c', 'arg', `return (${fn})(c, arg)`))(c, arg) : null; }, { fn: fn.toString(), arg });
    const until = async (what, f, ms = 60000) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await sleep(200); } };
    await online(A); await until('A seated', () => conn(A, (c) => c.isConnected() && c.getPlayerId()));
    await online(B); await until('B seated', () => conn(B, (c) => c.isConnected() && c.getPlayerId()));
    await conn(A, (c, sd) => c.sendSetMode('2v2', 'sd', sd), SD); await sleep(500);
    await conn(B, (c) => c.sendJoinSlot('p3')); await until('B in p3', () => conn(B, (c) => c.getPlayerId() === 'p3'));
    // slow killers on a big map against sturdy units: the two idle players outlive the checks
    await conn(A, (c) => { c.sendConfigure({ unitKey: 'unit17' }); c.sendConfigure({ mapKey: 'town' }); c.sendConfigure({ botSlot: 'p2', botUnitKey: 'unit7' }); c.sendConfigure({ botSlot: 'p4', botUnitKey: 'unit7' }); });
    await conn(B, (c) => c.sendConfigure({ unitKey: 'unit22' })); await sleep(700);
    await conn(A, (c) => c.sendStartNow());
    const live = (p) => p.evaluate(() => { const st = window.__gvgState; return st.online?.conn?.getMatchState?.() === 'active' && !(window.__loading?.up?.()) && !window.__intro?.active && !!st.ally && !!st.hud && !!window.__tactic?.hud?.el; });
    await until('A live', () => live(A), 240000); await until('B live', () => live(B), 240000);
    // each page's own log, on its own clock: the line it shows (every frame it changes), the button's look, and the frames' pace
    const arm = (p) => p.evaluate(() => { const L = window.__log = [], T = window.__tactic, el = T.hud.el; let last = '', lastF = performance.now(); const gaps = window.__gaps = [];
      window.__say = (what, data) => L.push({ t: Math.round(performance.now()), what, ...(data ?? {}) });
      window.__press = (sel) => { const e = document.querySelector(sel); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true })); return true; };
      const tick = () => { const now = performance.now(); gaps.push(now - lastF); lastF = now;
        const am = [...document.querySelectorAll('#ally-msg .am:not(.out)')].map((e) => `${e.classList.contains('own') ? 'own' : 'mate'}/${e.querySelector('.am-who')?.textContent}/${e.querySelector('.am-txt')?.textContent}`).join(',');
        const v = `${am}|${el.classList.contains('cool') ? 'cool' : ''}|${T.version()}`;
        if (v !== last) { last = v; window.__say('frame', { line: am, cool: el.classList.contains('cool'), version: T.version() }); }
        requestAnimationFrame(tick); }; tick(); });
    // the pictures: the sender's four, the sender's receipt, the mate's line — each held on its page while it is photographed
    const shot = (p, name) => p.screenshot({ path: path.join(out, name), timeout: 240000 });
    for (const p of [A, B]) await p.evaluate(() => { try { window.__gvgRenderer.setPixelRatio(0.5); } catch { /* as it is */ } });   // (the field drawn coarse so the page keeps up with the server; the HUD is the page's own and stays sharp)
    for (const p of [A, B]) await p.evaluate(() => { const T = window.__tactic; T.cfg.closeMs = 600000;
      window.__press = (sel) => { const e = document.querySelector(sel); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true })); return true; };
      setInterval(() => { for (const k of ['recv', 'echo']) { const m = T.msgs[k]; if (m && !m.held) { m.until += 600000; m.held = true; } } }, 30); });
    const count = (p) => p.evaluate(() => window.__gvgState.online.conn.getEvents().filter((e) => e.kind === 'ally:msg').length);
    console.log('versions', await A.evaluate(() => window.__tactic.version()), await B.evaluate(() => window.__tactic.version()));
    // (the loading screen and the intro well away before the first picture)
    for (const p of [A, B]) await until('the HUD on the screen', () => p.evaluate(() => { const e = document.querySelector('#tac-btn'); const q = e?.getBoundingClientRect(); const top = q ? document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) : null; return !!top && (top === e || e.contains(top)); }), 120000);
    await sleep(3000);
    await A.evaluate(() => window.__press('#tac-btn')); await sleep(1500); await shot(A, 'online_1_sender_menu.png');
    await A.evaluate(() => { window.__press('.tac-msgs .tac-opt[data-msg="askGo"]'); window.__tactic.hud.msgSentAt = performance.now() + 590000; });   // (the button's three dim seconds held for the picture)
    await until('the message at both', async () => (await count(A)) >= 1 && (await count(B)) >= 1, 90000); await sleep(1500);
    await shot(A, 'online_3_sender_receipt.png'); await shot(B, 'online_2_mate_line.png');
    console.log('lag ms', await A.evaluate(() => Math.round(Date.now() - window.__gvgState.online.conn.getLatestSnapshot().serverTime)), 'hp', await A.evaluate(() => [window.__gvgState.player?.state?.hp, window.__gvgState.ally?.state?.hp]), 'state', await A.evaluate(() => window.__gvgState.online.conn.getMatchState()));
    console.log('pictures taken', await A.evaluate(() => [...document.querySelectorAll('#ally-msg .am')].map((e) => e.textContent)), await B.evaluate(() => [...document.querySelectorAll('#ally-msg .am')].map((e) => e.textContent)));
  } catch (e) { if (e.message !== 'done') console.error('RIG ERROR', e.message); if (e.message !== 'done') console.log(srvLog.split('\n').slice(-6).join('\n').slice(0, 800)); }
  try { await b.close(); } catch { /* gone */ } try { srv.kill('SIGTERM'); } catch { /* gone */ } web.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
