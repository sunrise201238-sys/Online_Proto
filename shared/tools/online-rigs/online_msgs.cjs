// online_msgs.cjs <repo root> <out dir> [msgs|leave|sd] — THE TEAMMATE'S MESSAGES on the real thing: the repo's own server on port 3001, the
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
    // (and a coarser picture still: the page's own renderer at a quarter of the pixels each way — nothing of the HUD or the rules reads it)
    for (const p of [A, B]) await p.evaluate(() => { try { window.__gvgRenderer.setPixelRatio(0.25); } catch { /* as it is */ } });
    await sleep(SD || LEAVE ? 800 : 4000); await arm(A); await arm(B);
    const lagOf = (p) => p.evaluate(() => { const s = window.__gvgState.online.conn.getLatestSnapshot(); return s ? Math.round(Date.now() - s.serverTime) : null; });   // (the rig's pages and server share one clock)
    const count = (p) => p.evaluate(() => window.__gvgState.online.conn.getEvents().filter((e) => e.kind === 'ally:msg').length);
    const first = await A.evaluate(() => ({ version: window.__tactic.version(), sd: !!window.__gvgState.suddenDeathActive, bots: window.__gvgState.online.conn.getLatestSnapshot()?.botSlots, vb: null }));
    first.vb = await B.evaluate(() => window.__tactic.version());
    note('both pages have the button as the four messages', first.version === 'msg' && first.vb === 'msg', first);
    if (!SD && !LEAVE) {
    // A's presses, by A's own timers: the four up, PLEASE GO FORWARD; 1.5 s on, the button again and a message straight at
    // the server; 3.3 s on, the button again
    await A.evaluate(() => { const T = window.__tactic, el = T.hud.el, c = window.__gvgState.online.conn; const open = () => el.classList.contains('open');
      window.__press('#tac-btn'); window.__say('press button', { open: open(), pills: [...el.querySelectorAll('.tac-opt')].filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length).map((e) => e.textContent) });
      const sent = window.__press('.tac-msgs .tac-opt[data-msg="askGo"]'); window.__say('press PLEASE GO FORWARD', { sent, open: open(), cooling: T.cooling() });
      c.sendAllyMsg('go'); window.__say('a second message sent past the page at once');
      const t0 = performance.now();
      setTimeout(() => { window.__press('#tac-btn'); window.__say('press button a while on', { open: open(), cooling: T.cooling(), after: Math.round(performance.now() - t0) }); }, 1500);
      const late = () => { if (performance.now() - t0 < 3050) { setTimeout(late, 50); return; } window.__press('#tac-btn'); window.__say('press button after 3 s', { open: open(), cooling: T.cooling(), after: Math.round(performance.now() - t0) }); if (open()) window.__press('.tac-msgs .tac-opt[data-msg="back"]'); window.__say("press I'LL PULL BACK", { cooling: T.cooling() }); };
      setTimeout(late, 3050); });
    await until('A has both receipts', async () => (await count(A)) >= 2 && (await count(B)) >= 2, 90000); await sleep(5000);
    // B answers: I'LL PULL BACK
    await B.evaluate(() => { window.__press('#tac-btn'); const sent = window.__press('.tac-msgs .tac-opt[data-msg="askBack"]'); window.__say('press PLEASE PULL BACK', { sent }); });
    await until("B's message at both", async () => (await count(A)) >= 3 && (await count(B)) >= 3, 90000); await sleep(5000);
    // a bot's call to a player's seat
    await conn(A, (c) => c.sendAllyTactic('push', 'p3')); await sleep(6000);
    const lag = [await lagOf(A), await lagOf(B)];
    const read = (p) => p.evaluate(() => ({ log: window.__log, msgs: window.__gvgState.online.conn.getEvents().filter((e) => e.kind === 'ally:msg').map((e) => ({ t: e.t, ...e.payload })), cmd: window.__gvgState.ally?.cmdTactic?.kind ?? null,
      gap: (() => { const g = window.__gaps.slice().sort((x, y) => x - y); return Math.round(g[Math.floor(g.length / 2)]); })(), hp: [window.__gvgState.player?.state?.hp, window.__gvgState.ally?.state?.hp] }));
    const la = await read(A), lb = await read(B);
    fs.writeFileSync(path.join(out, `${ARG}_logs.json`), JSON.stringify({ A: la, B: lb }, null, 1));
    const find = (L, what) => L.log.find((e) => e.what === what);
    const frames = (L) => L.log.filter((e) => e.what === 'frame');
    console.log(`(a frame every ${la.gap} ms on A, ${lb.gap} ms on B; the pages run ${lag[0]} and ${lag[1]} ms behind the server; units' HP now ${JSON.stringify(la.hp)})`);
    const p1 = find(la, 'press button'), p2 = find(la, 'press PLEASE GO FORWARD'), p3 = find(la, 'press button a while on'), p4 = find(la, 'press button after 3 s');
    note('a press on the button brings up the four', p1?.open && p1.pills.join('|') === "I'LL GO FORWARD|I'LL PULL BACK|PLEASE GO FORWARD|PLEASE PULL BACK", p1?.pills);
    note('a press on a message sends it, puts the four away and starts the 3 s', p2?.sent && !p2.open && p2.cooling, p2);
    note('inside the 3 s the button does not open', p3 && p3.after < 3000 && !p3.open && p3.cooling, p3);
    note('after the 3 s it opens again', p4 && p4.after >= 3000 && p4.open && !p4.cooling, p4);
    // what the server passed on: one message to each page for A's two tries, then B's
    const kinds = (L) => L.msgs.map((m) => `${m.from}:${m.kind}`).join(' ');
    const want = 'p1:askGo p1:back p3:askBack';
    note('the server passed on each message once to each of the two pages, and dropped the one sent at once after the first', kinds(la) === want && kinds(lb) === want, { A: kinds(la), B: kinds(lb) });
    // the lines: whose, what, how long (to the frame)
    const span = (L, text) => { const f = frames(L); const i = f.findIndex((e) => e.line === text); if (i < 0) return null; const j = f.findIndex((e, k) => k > i && e.line !== text); return { from: f[i].t, ms: j < 0 ? null : f[j].t - f[i].t }; };
    const sA = span(la, 'own/YOU/PLEASE GO FORWARD'), sB = span(lb, 'mate/ALLY/PLEASE GO FORWARD');
    const tol = (L) => Math.max(120, L.gap * 2 + 60);
    note("the mate's page shows it as the mate's, for 2 s", sB && Math.abs(sB.ms - 2000) <= tol(lb), { shown: sB, tolerance: tol(lb) });
    note("the sender's page shows its receipt as its own, for 2 s", sA && Math.abs(sA.ms - 2000) <= tol(la), { shown: sA, tolerance: tol(la) });
    const cool = (() => { const f = frames(la); const i = f.findIndex((e) => e.cool); const j = f.findIndex((e, k) => k > i && !e.cool); return i < 0 ? null : { ms: j < 0 ? null : f[j].t - f[i].t }; })();
    note('the button is dim for 3 s', cool && Math.abs(cool.ms - 3000) <= tol(la) + 100, cool);
    const sA2 = span(la, 'mate/ALLY/PLEASE PULL BACK'), sB2 = span(lb, 'own/YOU/PLEASE PULL BACK');
    note("the other way round: A shows B's line as the mate's, B its own receipt", sA2 && sB2 && Math.abs(sA2.ms - 2000) <= tol(la) && Math.abs(sB2.ms - 2000) <= tol(lb), { A: sA2, B: sB2 });
    note("a bot's call to a player's seat is still refused", la.cmd === null, { cmd: la.cmd });
    }
    if (SD) {
      await A.evaluate(() => { window.__press('#tac-btn'); const sent = window.__press('.tac-msgs .tac-opt[data-msg="go"]'); window.__say("press I'LL GO FORWARD", { sent }); });
      await until('the message at both', async () => (await count(A)) >= 1 && (await count(B)) >= 1, 60000); await sleep(1200);
      const fa = await A.evaluate(() => window.__log.filter((e) => e.what === 'frame').map((e) => e.line)), fb = await B.evaluate(() => window.__log.filter((e) => e.what === 'frame').map((e) => e.line));
      note('Sudden Death: a message goes through and shows on both pages', fa.includes("own/YOU/I'LL GO FORWARD") && fb.includes("mate/ALLY/I'LL GO FORWARD"), { sender: fa.filter(Boolean), mate: fb.filter(Boolean) });
    }
    // B leaves: the seat is a bot's
    if (!SD && !LEAVE) { note('no page error', !A.errs.length && !B.errs.length, [...A.errs, ...B.errs].slice(0, 3)); const bad0 = results.filter((r) => !r.ok).length; console.log(`\n${results.length - bad0} of ${results.length} passed`); fs.writeFileSync(path.join(out, `${ARG}_results.json`), JSON.stringify(results, null, 1)); throw new Error('done'); }
    await B.context().close();
    await until('A sees the bot', () => A.evaluate(() => (window.__gvgState.online.conn.getLatestSnapshot()?.botSlots ?? []).includes('p3')), 30000);
    await sleep(1200);
    if (SD) { const v = await A.evaluate(() => ({ version: window.__tactic.version(), on: document.querySelector('.touch-hud').classList.contains('tac-on') })); note('the mate left, Sudden Death: no button', v.version === null && !v.on, v); }
    else {
      const v = await A.evaluate(() => { const T = window.__tactic, el = T.hud.el, c = window.__gvgState.online.conn; const version = T.version(); window.__press('#tac-btn');
        const pills = [...el.querySelectorAll('.tac-opt')].filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length).map((e) => e.textContent);
        window.__press('.tac-pop .tac-opt[data-tactic="hide"]'); c.sendAllyMsg('go'); return { version, pills }; });
      note("the mate left: the button is the bot's two calls, FORWARD and PULL BACK", v.version === 'bot' && v.pills.join('|') === 'FORWARD|PULL BACK', v);
      await until('the call stands', () => A.evaluate(() => (window.__gvgState.ally?.cmdTactic?.kind ?? null) === 'hide'), 60000).catch(() => null); await sleep(3000);
      const w = await A.evaluate(() => ({ cmd: window.__gvgState.ally?.cmdTactic?.kind ?? null, msgs: window.__gvgState.online.conn.getEvents().filter((e) => e.kind === 'ally:msg').length }));
      note('PULL BACK is taken by the bot, and no message goes to a bot', w.cmd === 'hide' && w.msgs === 0, w);
    }
    note('no page error', !A.errs.length, A.errs.slice(0, 3));
    const bad = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - bad} of ${results.length} passed${bad ? ' — FAILED: ' + results.filter((r) => !r.ok).map((r) => r.name).join('; ') : ''}`);
    fs.writeFileSync(path.join(out, `${ARG}_results.json`), JSON.stringify(results, null, 1));
  } catch (e) { if (e.message !== 'done') console.error('RIG ERROR', e.message); if (e.message !== 'done') console.log(srvLog.split('\n').slice(-6).join('\n').slice(0, 800)); }
  try { await b.close(); } catch { /* gone */ } try { srv.kill('SIGTERM'); } catch { /* gone */ } web.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
