// usage: node drive.mjs <port> <mapKey> <1v1|2v2> <clients> <seconds> : `clients` players join one room on a local server, the first picks the map and the mode and starts
// (the empty seats are bots), and each sends a random walk of input frames every 16 ms, a tick's time; the snapshots that come back are counted and sized.
import { io } from 'socket.io-client';
const [port, mapKey, mode, nS, secS] = process.argv.slice(2); const N = Number(nS), SECS = Number(secS);
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dirs = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const stat = { snaps: 0, bytes: 0, started: 0, ended: 0, firstSnap: 0 }; const socks = [];
const join = (i) => new Promise((res) => { const s = io(`http://localhost:${port}`, { transports: ['websocket'] }); socks.push(s); let seq = 0, left = 0, cur = null; const r = rng(100 + i); let timer = null, slot = null;
  s.on('player:assigned', (a) => { slot = a.playerId; res(s); });
  s.on('match:start', (m) => { stat.started = Date.now(); s.emit('match:loaded', { startTime: m.startTime }); if (!timer) timer = setInterval(() => { if (left <= 0) { left = 20 + Math.floor(r() * 70); const [dx, dz] = dirs[Math.floor(r() * 9)]; cur = { moveX: dx, moveZ: dz, boost: r() < 0.25, shootHold: r() < 0.6, j: r() < 0.3, first: true }; }
    s.emit('input:frame', { seq: seq += 1, moveX: cur.moveX, moveZ: cur.moveZ, boost: cur.boost, shootHold: cur.shootHold, shootTap: cur.shootHold && cur.first, jump: cur.j && cur.first }); cur.first = false; left -= 1; }, 16); });
  s.on('match:snapshot', (p) => { if (typeof p === 'string') p = JSON.parse(p); if (i === 0) { stat.snaps += 1; if (stat.snaps % 20 === 1) stat.bytes += JSON.stringify(p).length * 20; if (!stat.firstSnap) stat.firstSnap = Date.now(); if (stat.snaps === 600 && process.env.DUMP) { const sz = (v) => JSON.stringify(v ?? null).length; console.log('one snapshot, ' + sz(p) + ' bytes as text: ' + Object.keys(p).map((k) => `${k} ${sz(p[k])}`).sort((x, y) => Number(y.split(' ').pop()) - Number(x.split(' ').pop())).slice(0, 14).join(', ')); const f = p.fighters && Object.values(p.fighters)[0]; if (f) console.log('one fighter in it, ' + sz(f) + ' bytes: ' + Object.keys(f).map((k) => `${k} ${sz(f[k])}`).sort((x, y) => Number(y.split(' ').pop()) - Number(x.split(' ').pop())).slice(0, 22).join(', ')); console.log('fighters ' + Object.keys(p.fighters ?? {}).length + ', each ' + Object.values(p.fighters ?? {}).map(sz).join(' ') + '; projectiles ' + (p.projectiles?.length ?? '-') + ', beams ' + (p.beams?.length ?? '-')); } } });
  s.on('match:end', () => { stat.ended = Date.now(); }); s.on('match:ended', () => { stat.ended = Date.now(); }); });
const first = await join(0); first.emit('match:set-mode', process.env.SD ? { mode, suddenDeath: true } : { mode }); await new Promise((r) => setTimeout(r, 400));   // (the room's mode first: the seats the others are given are the mode's)
for (let i = 1; i < N; i += 1) await join(i); await new Promise((r) => setTimeout(r, 300));
first.emit('match:configure', { unitKey: 'unit1', mapKey }); await new Promise((r) => setTimeout(r, 300));
for (let i = 1; i < N; i += 1) socks[i].emit('match:configure', { unitKey: 'unit1' }); await new Promise((r) => setTimeout(r, 300)); first.emit('match:start-now');
await new Promise((r) => setTimeout(r, SECS * 1000));
const dur = ((stat.ended || Date.now()) - (stat.firstSnap || Date.now())) / 1000;
console.log(`driver: ${mapKey} ${mode}${process.env.SD ? ' SUDDEN DEATH' : ''}, ${N} player(s): match ${stat.started ? 'started' : 'NOT started'}${stat.ended ? `, ended after ${((stat.ended - stat.started) / 1000).toFixed(0)} s` : ''}; snapshots to one player ${(stat.snaps / Math.max(1, dur)).toFixed(1)} a second, about ${(stat.bytes / Math.max(1, stat.snaps)).toFixed(0)} bytes each as text`);
for (const s of socks) s.close(); process.exit(0);
