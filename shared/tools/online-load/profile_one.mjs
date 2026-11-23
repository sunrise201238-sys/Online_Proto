// usage: node --cpu-prof --cpu-prof-dir=<an empty dir> profile_one.mjs <line checkout> <mapKey> [ticks=6000] : one 2v2 match with one player and three bots,
// run as the server runs it, for Node's profiler; `profile_sum.py <that dir>` then says where the time went.
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const root = path.resolve(process.argv[2]); const mapKey = process.argv[3]; const TICKS = Number(process.argv[4] ?? 6000);
const SIM = pathToFileURL(root + '/shared/src/sim/').href; await import(pathToFileURL(root + '/shared/tools/maps/arena_files.mjs').href);
const { createMatchState, tickMatch, tickBot, pickBotTargetId, emptyInput, TICK_RATE_MS, TICK_DT, getArena } = await import(SIM + 'index.js');
const { navGridFor, registerNavGridData, hasNavGrid } = await import(SIM + 'ai.js'); const { navDataFile } = await import(SIM + 'navgrid.js');
const a = getArena(mapKey); const file = path.join(root, 'client/public', navDataFile(mapKey)); if (!hasNavGrid(a) && fs.existsSync(file)) registerNavGridData(a, new Uint8Array(fs.readFileSync(file))); navGridFor(a);
const m = createMatchState({ mapKey, mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit4', p3UnitKey: 'unit5', p4UnitKey: 'unit12', startTime: 1000 }); const ids = Object.keys(m.fighters); const bots = ['p2', 'p3', 'p4'];
const enemyOf = { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p1' }; for (const id of ids) { const f = m.fighters[id]; f.hp = 1e9; f.invulnerableUntil = 0; f.targetId = enemyOf[id]; if (bots.includes(id)) f.botControlled = true; }
const inputs = {}; for (const id of ids) inputs[id] = emptyInput(); let now = 1000; const driven = new Set(bots);
for (let t = 0; t < TICKS; t += 1) { now += TICK_RATE_MS; m.searchClosed = false; m.searchDeadline = performance.now() + 2; const rot = (m.tick ?? 0) % 3; const order = bots.slice(rot).concat(bots.slice(0, rot));
  for (const id of order) { const me = m.fighters[id]; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); } tickMatch(m, inputs, now, TICK_DT, driven); if (t % 300 === 0) for (const id of ids) m.fighters[id].hp = 1e9; }
