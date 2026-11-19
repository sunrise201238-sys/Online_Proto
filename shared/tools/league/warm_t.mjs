import { pathToFileURL } from 'node:url';
const base = process.argv[2].replace(/\/?$/, '/');
const W = await import(pathToFileURL(base + 'server/src/warmup.js').href);
const S = await import(pathToFileURL(base + 'shared/src/sim/index.js').href);
for (const mk of process.argv[3].split(',')) { const t0 = Date.now(); try { W.warmMap(mk); const m = S.createMatchState({ mapKey: mk, mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit1', p3UnitKey: 'unit1', p4UnitKey: 'unit1', startTime: 1000 }); const f = m.fighters; console.log(mk.padEnd(12), `${Date.now() - t0} ms`, 'spawn gap', Math.hypot(f.p1.x - f.p2.x, f.p1.z - f.p2.z).toFixed(0)); } catch (e) { console.log(mk, 'FAILED', String(e.message).slice(0, 120)); } }
