// usage: node snapshot_bench.mjs <line checkout> <mapKey> : a 2v2 match with one player and three bots, run 6000 ticks; each tick the snapshot is built and turned to text in four ways, each timed:
//   as now (both teams built, the player's team's sent); the player's team alone built; that, with the three other units cut to what a picture of them needs (a guess at the fields: 20 of them); every second tick alone
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const root = path.resolve(process.argv[2]); const mapKey = process.argv[3];
const SIM = pathToFileURL(root + '/shared/src/sim/').href; await import(pathToFileURL(root + '/shared/tools/maps/arena_files.mjs').href);
const { createMatchState, tickMatch, tickBot, pickBotTargetId, emptyInput, TICK_RATE_MS, TICK_DT, getArena } = await import(SIM + 'index.js'); const { buildSnapshotFor } = await import(SIM + 'state.js');
const { navGridFor, registerNavGridData, hasNavGrid } = await import(SIM + 'ai.js'); const { navDataFile } = await import(SIM + 'navgrid.js');
const a = getArena(mapKey); const file = path.join(root, 'client/public', navDataFile(mapKey)); if (!hasNavGrid(a) && fs.existsSync(file)) registerNavGridData(a, new Uint8Array(fs.readFileSync(file))); navGridFor(a);
const m = createMatchState({ mapKey, mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit4', p3UnitKey: 'unit5', p4UnitKey: 'unit12', startTime: 1000 }); const ids = Object.keys(m.fighters); const bots = ['p2', 'p3', 'p4'];
const enemyOf = { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p1' }; for (const id of ids) { const f = m.fighters[id]; f.hp = 1e9; f.invulnerableUntil = 0; f.targetId = enemyOf[id]; if (bots.includes(id)) f.botControlled = true; }
const inputs = {}; for (const id of ids) inputs[id] = emptyInput(); let now = 1000; const driven = new Set(bots);
const KEEP = ['id', 'team', 'unitKey', 'pos', 'vel', 'yaw', 'hp', 'action', 'airborne', 'grounded', 'targetId', 'boost', 'lastFireAt', 'overheatedUntil', 'invulnerableUntil', 'stepUntil', 'redLock', 'freeAim', 'aimYaw', 'aimPitch'];
const slim = (snap, me) => { const f = {}; for (const id in snap.fighters) { if (id === me) { f[id] = snap.fighters[id]; continue; } const o = {}, s = snap.fighters[id]; for (const k of KEEP) if (k in s) o[k] = s[k]; f[id] = o; } return { ...snap, fighters: f }; };
const T = { now: 0, one: 0, slim: 0 }; const B = { now: 0, one: 0, slim: 0 }; let n = 0;
for (let t = 0; t < 6600; t += 1) { now += TICK_RATE_MS; m.searchClosed = false; m.searchDeadline = performance.now() + 2; const rot = (m.tick ?? 0) % 3; const order = bots.slice(rot).concat(bots.slice(0, rot));
  for (const id of order) { const me = m.fighters[id]; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); } tickMatch(m, inputs, now, TICK_DT, driven); if (t % 300 === 0) for (const id of ids) m.fighters[id].hp = 1e9;
  if (t < 600) continue; n += 1;
  let t0 = performance.now(); { const A = buildSnapshotFor(m, 'A'), Bt = buildSnapshotFor(m, 'B'); const s = JSON.stringify(A); B.now += s.length; } T.now += performance.now() - t0;
  t0 = performance.now(); { const A = buildSnapshotFor(m, 'A'); const s = JSON.stringify(A); B.one += s.length; } T.one += performance.now() - t0;
  t0 = performance.now(); { const A = slim(buildSnapshotFor(m, 'A'), 'p1'); const s = JSON.stringify(A); B.slim += s.length; } T.slim += performance.now() - t0; }
const f = (k) => `${(T[k] / n).toFixed(3)} ms a tick, ${(B[k] / n).toFixed(0)} bytes`;
console.log(`${mapKey}, ${n} ticks: as now ${f('now')} | the player's team alone built ${f('one')} | and the other three units cut down ${f('slim')}`);
console.log(`a second of it: as now ${(T.now / n * 62.5).toFixed(1)} ms and ${(B.now / n * 62.5 / 1000).toFixed(0)} kB; team alone ${(T.one / n * 62.5).toFixed(1)} ms; cut down ${(T.slim / n * 62.5).toFixed(1)} ms and ${(B.slim / n * 62.5 / 1000).toFixed(0)} kB; cut down and every second tick ${(T.slim / n * 31.25).toFixed(1)} ms and ${(B.slim / n * 31.25 / 1000).toFixed(0)} kB`);
