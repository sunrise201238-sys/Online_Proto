#!/usr/bin/env node
// Shows a saved Design board folder with its pictures.
//
//   node view.cjs <folder> [port]        e.g.  node view.cjs ui-rework
//
// then open http://localhost:8098/ : a list of the folder's boards, each a link.
//
// A board asks for its pictures at /_blob/<id>; this answers each from <folder>/blob/<id>.<ext>.
// A board also asks for ./support.js, the Design type's own script, which is not kept here.
// This answers with the small stand-in below: it runs the board's renderVals() and fills
// {{path}}, <sc-for list as> and <sc-if value>, which is all these boards use. It is not the
// type's script, so a board here is a close reading of the page, not the page itself.
//
// Nothing is written and nothing outside the folder is read.
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8098);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

const blobDir = path.join(dir, 'blob');
const blobs = {};
if (fs.existsSync(blobDir)) for (const f of fs.readdirSync(blobDir)) blobs[f.split('.')[0]] = f;

// The stand-in for ./support.js. It runs in the board's page.
const STAND_IN = `(function () {
  class DCLogic { constructor(props) { this.props = props || {}; } }
  window.DCLogic = DCLogic;
  const value = (expr, scope) => {
    const p = expr.replace(/^\\s*\\{\\{|\\}\\}\\s*$/g, '').trim();
    if (p === 'true') return true;
    if (p === 'false') return false;
    return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  };
  const fill = (s, scope) => s.replace(/\\{\\{([^}]*)\\}\\}/g, (m, p) => { const v = value(p, scope); return v == null ? '' : String(v); });
  function render(node, scope) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) { if (child.nodeValue.indexOf('{{') >= 0) child.nodeValue = fill(child.nodeValue, scope); continue; }
      if (child.nodeType !== 1) continue;
      if (child.localName === 'sc-for') {
        const list = value(child.getAttribute('list') || '', scope);
        const as = child.getAttribute('as') || 'item';
        // the repeated part waits in a template, where a picture does not load until it is filled in
        const mould = document.createElement('template');
        mould.content.append(...Array.from(child.childNodes));
        const out = document.createDocumentFragment();
        for (const item of Array.isArray(list) ? list : []) {
          const copy = mould.content.cloneNode(true);
          render(copy, Object.assign({}, scope, { [as]: item }));
          out.appendChild(copy);
        }
        child.replaceWith(out);
        continue;
      }
      if (child.localName === 'sc-if') {
        if (value(child.getAttribute('value') || '', scope)) { render(child, scope); child.replaceWith(...Array.from(child.childNodes)); }
        else child.remove();
        continue;
      }
      for (const a of Array.from(child.attributes)) if (a.value.indexOf('{{') >= 0) child.setAttribute(a.name, fill(a.value, scope));
      render(child, scope);
    }
  }
  document.addEventListener('DOMContentLoaded', function () {
    const script = document.querySelector('script[data-dc-script]');
    const root = document.querySelector('x-dc');
    if (!script || !root) return;
    const props = {};
    try {
      const decl = JSON.parse(script.getAttribute('data-props') || '{}');
      for (const k of Object.keys(decl)) if (k[0] !== '$' && decl[k] && 'default' in decl[k]) props[k] = decl[k].default;
    } catch (e) { /* the board declares no settings */ }
    let vals = {};
    try {
      const Component = new Function('DCLogic', script.textContent + '\\nreturn Component;')(DCLogic);
      vals = new Component(props).renderVals() || {};
    } catch (e) { console.error('board script:', e); }
    render(root, vals);
  });
})();
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function index() {
  let boards = {};
  let title = path.basename(dir);
  let order = [];
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8'));
    boards = c.boards || {};
    title = c.title || title;
    order = Array.isArray(c.order) ? c.order : [];
  } catch (e) { /* no index: list the files */ }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dc.html'));
  const names = [...order.filter((n) => files.includes(n)), ...files.filter((n) => !order.includes(n)).sort()];
  const rows = names.map((n) => {
    const b = boards[n] || {};
    return `<li><a href="/${encodeURIComponent(n)}">${esc(n.replace(/\.dc\.html$/, ''))}</a>` +
      `<span>${b.w && b.h ? esc(b.w + ' x ' + b.h) : ''}</span><p>${esc(b.title || '')}</p></li>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{margin:0;padding:24px 16px 48px;background:#F4F2EA;color:#1B1B2F;font:15px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}
.sub{margin:0 0 18px;color:#5A5A74}
ol{list-style:none;margin:0;padding:0;display:grid;gap:8px}
li{background:#fff;border:1px solid #D8D4C6;padding:10px 14px;display:grid;grid-template-columns:1fr auto;gap:2px 12px}
li a{font-weight:700;color:#1B1B2F}
li span{color:#5A5A74;font-variant-numeric:tabular-nums}
li p{grid-column:1 / -1;margin:0;color:#44445C}
</style></head><body><main>
<h1>${esc(title)}</h1>
<p class="sub">${names.length} boards, ${Object.keys(blobs).length} pictures. Each board opens at its own size.</p>
<ol>
${rows}
</ol>
</main></body></html>`;
}

http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (u === '/') return send(200, TYPES['.html'], index());
  if (u === '/support.js') return send(200, TYPES['.js'], STAND_IN);
  // a picture whose address is still a {{placeholder}}: asked for before the stand-in fills it in
  if (u.includes('{{')) { res.writeHead(204); res.end(); return; }
  let file = null;
  const m = /^\/_blob\/([0-9a-f]{32})$/.exec(u);
  if (m) file = blobs[m[1]] ? path.join(blobDir, blobs[m[1]]) : null;
  else {
    const f = path.join(dir, u);
    if (f.startsWith(dir + path.sep)) file = f;
  }
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, 'text/plain; charset=utf-8', 'not here: ' + u);
  send(200, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => {
  console.log(`${path.basename(dir)}: ${Object.keys(blobs).length} pictures, http://localhost:${port}/`);
});
