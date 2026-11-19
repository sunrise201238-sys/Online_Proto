const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('node:fs'); const path = require('node:path');
const [deck, out] = process.argv.slice(2);
(async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(deck, 'project/deck.json'), 'utf8'));
  const base = `* { margin: 0 } body { font: 32px/1.2 sans-serif }
body > section { width: 1920px !important; height: 1080px !important; overflow: hidden !important; box-sizing: border-box !important; position: relative; isolation: isolate }
section[hidden], aside, noscript { display: none !important }
h1 { font-size: 96px; font-weight: 600 } h2 { font-size: 64px; font-weight: 600 } h3 { font-size: 44px; font-weight: 600 }
p, li, h1, h2, h3, td, th { overflow-wrap: break-word; text-wrap: pretty }
table { width: 100%; border-collapse: separate; border-spacing: 0; border: solid #0003; border-width: 2px 0 0 2px }
th, td { padding: .35em .6em; text-align: left; border: solid #0003; border-width: 0 2px 2px 0 }
x-shape, x-icon, x-embed { display: block } x-embed { background: #8884 !important }`;
  const slides = idx.order.map((id) => fs.readFileSync(path.join(deck, 'project/slides', id + '.html'), 'utf8')).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style><link rel="stylesheet" href="/project/deck.css"><style>.ans, .ans-row, .ans-d, .col, .stat { min-height: 0 }</style></head><body>${slides}</body></html>`;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--host-resolver-rules=MAP * ^NOTFOUND', '--no-sandbox'] });
  const ctx = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); let first = true; const root = fs.realpathSync(path.join(deck, 'project'));
  await p.route('**/*', (route) => { const rq = route.request(); const u = new URL(rq.url());
    if (rq.isNavigationRequest()) { if (!first) return route.abort('aborted'); first = false; return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }); }
    if (u.pathname.startsWith('/project/')) { const f = fs.realpathSync(path.join(deck, u.pathname)); if (f.startsWith(root + path.sep)) return route.fulfill({ path: f }); }
    return route.abort('aborted'); });
  await p.goto('http://deck.invalid/');
  const n = await p.locator('body > section').count();
  for (let i = 0; i < n; i += 1) { const s = p.locator('body > section').nth(i); await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await s.screenshot({ path: path.join(out, `s${String(i + 1).padStart(2, '0')}.png`), animations: 'disabled' }); }
  const rep = await p.evaluate(() => [...document.querySelectorAll('body > section')].map((sec) => { const sr = sec.getBoundingClientRect(); const out = { id: sec.id, low: 0, wide: [], lines: [], tight: [] };
    for (const e of sec.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue; const cs = getComputedStyle(e); const pinned = cs.position === 'absolute';
      if (!pinned) out.low = Math.max(out.low, Math.round(r.bottom - sr.top));
      if (r.right - sr.left > 1793 || r.left - sr.left < 127) out.wide.push(`${e.className || e.tagName}:${Math.round(r.left - sr.left)}-${Math.round(r.right - sr.left)}`);
      if (/^(P|H1|H2|H3|TD|TH)$/.test(e.tagName)) { const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2; const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth); const ln = Math.round((r.height - padV) / lh);
        if (ln > 1) out.lines.push(`${e.className || e.tagName}×${ln}:${e.textContent.slice(0, 14)}`);
        const rg = document.createRange(); rg.selectNodeContents(e); const tw = rg.getBoundingClientRect().width; const avail = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const fixed = /nm|ans-k|ans-v|rg-lo|rk/.test(e.className) || e.tagName === 'TD' || e.tagName === 'TH';
        if (fixed && tw / avail > 0.8) out.tight.push(`${e.className || e.tagName} ${Math.round(tw)}/${Math.round(avail)}:${e.textContent.slice(0, 16)}`); } }
    return out; }));
  for (const r of rep) console.log(JSON.stringify(r));
  await b.close();
})();
