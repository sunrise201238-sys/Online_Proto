// online_keys.cjs <repo root> <out dir> (the keyboard round: E opens the four messages, a pick by the mouse, the pointer lock let go) — THE TEAMMATE'S MESSAGES on the real thing: the repo's own server on port 3001, the
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
    const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200))); return p; };
    const A = await mk(480, 270), B = await mk(480, 270);   // (small pages: the less a page draws, the nearer it keeps to the server's 60 snapshots a second)
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
    for (const p of [A, B]) await p.evaluate(() => { try { window.__gvgRenderer.setPixelRatio(0.25); } catch { /* as it is */ } });
    await sleep(800);
    // THE KEYS (9.8 b1105js): E brings the four up and gives a held mouse back; W and S pick no message; E again puts them away
    const k1 = await A.evaluate(() => { const T = window.__tactic, el = T.hud.el, c = window.__gvgState.online.conn; const canvas = window.__gvgRenderer.domElement;
      let locked = canvas; window.__exits = 0; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked }); document.exitPointerLock = () => { window.__exits += 1; locked = null; };
      window.__relock = () => { locked = canvas; };
      window.__key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      window.__up = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
      window.__press = (sel) => { const e = document.querySelector(sel); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true })); return true; };
      const pills = () => [...el.querySelectorAll('.tac-opt')].filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length).map((e) => e.textContent);
      const msgs = () => c.getEvents().filter((e) => e.kind === 'ally:msg').length; const open = () => el.classList.contains('open');
      const out = { version: T.version() };
      window.__key('e'); window.__up('e'); out.afterE = { open: open(), pills: pills(), exits: window.__exits };
      window.__key('w'); window.__up('w'); window.__key('s'); window.__up('s'); out.afterWS = { open: open(), cooling: T.cooling() };
      window.__key('e'); window.__up('e'); out.afterE2 = { open: open() };
      window.__relock(); window.__key('e'); window.__up('e'); const sent = window.__press('.tac-msgs .tac-opt[data-msg="askBack"]'); out.afterClick = { sent, open: open(), cooling: T.cooling(), exits: window.__exits };
      window.__key('e'); window.__up('e'); out.eWhileCooling = { open: open() };
      return out; });
    note('E brings up the four and gives the held mouse back', k1.version === 'msg' && k1.afterE.open && k1.afterE.pills.length === 4 && k1.afterE.exits === 1, k1.afterE);
    note('W and S pick no message: the four stay up, nothing is sent', k1.afterWS.open && !k1.afterWS.cooling, k1.afterWS);
    note('E again puts them away', !k1.afterE2.open, k1.afterE2);
    note('a mouse click on a message sends it', k1.afterClick.sent && !k1.afterClick.open && k1.afterClick.cooling, k1.afterClick);
    note('E does nothing inside the 3 s', !k1.eWhileCooling.open, k1.eWhileCooling);
    const count = (p) => p.evaluate(() => window.__gvgState.online.conn.getEvents().filter((e) => e.kind === 'ally:msg').map((e) => `${e.payload.from}:${e.payload.kind}`).join(' '));
    await until('the clicked message at both', async () => (await count(A)) === 'p1:askBack' && (await count(B)) === 'p1:askBack', 60000);
    note('the clicked message reached both pages, and only it', true, { A: await count(A), B: await count(B) });
    // the mate leaves: E, then S, is the bot's PULL BACK as before, and the mouse is left alone
    await B.context().close();
    await until('A sees the bot', () => A.evaluate(() => (window.__gvgState.online.conn.getLatestSnapshot()?.botSlots ?? []).includes('p3')), 30000); await sleep(1000);
    const k2 = await A.evaluate(() => { const T = window.__tactic, el = T.hud.el; const pills = () => [...el.querySelectorAll('.tac-opt')].filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length).map((e) => e.textContent);
      window.__relock(); const before = window.__exits; const out = { version: T.version() };
      window.__key('e'); window.__up('e'); out.afterE = { open: el.classList.contains('open'), pills: pills(), exitsAdded: window.__exits - before };
      window.__key('s'); window.__up('s'); out.afterS = { open: el.classList.contains('open') }; return out; });
    note("beside a bot, E brings up FORWARD and PULL BACK and leaves the mouse held", k2.version === 'bot' && k2.afterE.open && k2.afterE.pills.join('|') === 'FORWARD|PULL BACK' && k2.afterE.exitsAdded === 0, k2.afterE);
    await until('the call stands', () => A.evaluate(() => (window.__gvgState.ally?.cmdTactic?.kind ?? null) === 'hide'), 60000).catch(() => null);
    const cmd = await A.evaluate(() => window.__gvgState.ally?.cmdTactic?.kind ?? null);
    note('and S is PULL BACK, taken by the bot', !k2.afterS.open && cmd === 'hide', { cmd, open: k2.afterS.open });
    note('no page error', !A.errs.length, A.errs.slice(0, 3));
    const bad = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - bad} of ${results.length} passed${bad ? ' — FAILED: ' + results.filter((r) => !r.ok).map((r) => r.name).join('; ') : ''}`);
    fs.writeFileSync(path.join(out, 'keys_results.json'), JSON.stringify(results, null, 1));
  } catch (e) { if (e.message !== 'done') console.error('RIG ERROR', e.message); if (e.message !== 'done') console.log(srvLog.split('\n').slice(-6).join('\n').slice(0, 800)); }
  try { await b.close(); } catch { /* gone */ } try { srv.kill('SIGTERM'); } catch { /* gone */ } web.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
