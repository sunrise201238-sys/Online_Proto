// sim.mjs <jobs.json> <slot> <slots> — headless bot-vs-bot matches on a checkout's shared sim (the server's rules); each job:
// { mode, mapKey, units[2|4], seed, ... }; one JSON line per match: winner team, seconds, damage dealt and kills per slot, HP left.
// Runs the jobs whose index % slots == slot, so several copies share one jobs file.
// GVG_ROOT: the checkout whose sim runs (default: the checkout this file is in); it must be the line from 0.9.5 on (FILE_DATA_MAPS,
// the nav grid files, the units of the jobs). OVERRIDE='{"unit22":{"damage":4}}' patches unit fields for the run; CAP: a match's
// length in seconds (90).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(process.env.GVG_ROOT || fileURLToPath(new URL('../../../', import.meta.url)));
const sim = async (f) => {
  try { return await import(pathToFileURL(path.join(ROOT, 'shared/src/sim', f)).href); }
  catch (e) { console.error(`cannot load shared/src/sim/${f} from ${ROOT}: ${e.message}\nset GVG_ROOT to a checkout of the line from 0.9.5 on`); process.exit(2); }
};
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, getArena, registerGeneratedData, hasGeneratedData, generatedDataFile, FILE_DATA_MAPS } = await sim('index.js');
const { tickBot, navGridFor, registerNavGridData, hasNavGrid } = await sim('ai.js');
const { navDataFile } = await sim('navgrid.js');
if (!FILE_DATA_MAPS || !navDataFile) { console.error(`${ROOT}: no FILE_DATA_MAPS / navDataFile — set GVG_ROOT to a checkout of the line from 0.9.5 on`); process.exit(2); }
const PUB = path.join(ROOT, 'client/public') + '/';
const warm = (k) => { if (FILE_DATA_MAPS.includes(k) && !hasGeneratedData(k)) registerGeneratedData(k, JSON.parse(readFileSync(PUB + generatedDataFile(k), 'utf8'))); const ar = getArena(k); if (!hasNavGrid(ar)) { const f = PUB + navDataFile(k); if (existsSync(f)) registerNavGridData(ar, new Uint8Array(readFileSync(f))); navGridFor(ar); } };
const [jobsF, slot, slots] = process.argv.slice(2);
if (!jobsF) { console.error('usage: [GVG_ROOT=<checkout>] node sim.mjs <jobs.json> <slot> <slots>'); process.exit(2); }
const jobs = JSON.parse(readFileSync(jobsF, 'utf8')).filter((_, i) => i % Number(slots || 1) === Number(slot || 0));
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
{ const C = await sim('constants.js'); const U = C.UNIT_DATA || Object.values(C).find((v) => v && v.unit20 && v.unit20.hp); const O = JSON.parse(process.env.OVERRIDE || '{}'); for (const [k, f] of Object.entries(O)) Object.assign(U[k], f); }
for (const job of jobs) {
  warm(job.mapKey);
  const o = { mapKey: job.mapKey, mode: job.mode, startTime: 1000, p1UnitKey: job.units[0], p2UnitKey: job.units[1] }; if (job.mode === '2v2') { o.p3UnitKey = job.units[2]; o.p4UnitKey = job.units[3]; }
  const ms = createMatchState(o); const ids = Object.keys(ms.fighters); const inputs = Object.fromEntries(ids.map((id) => [id, emptyInput()]));
  const dmg = Object.fromEntries(ids.map((id) => [id, 0])); const kills = Object.fromEntries(ids.map((id) => [id, 0])); const real = Math.random; Math.random = mulberry32(job.seed); let now = 1000, t = 0; const cap = (Number(process.env.CAP || 90) * 1000) / TICK_RATE_MS; const t0 = Date.now();
  try { for (; t < cap; t += 1) { now += TICK_RATE_MS; for (const id of ids) if (ms.fighters[id].hp > 0) tickBot(ms, id, now); tickMatch(ms, inputs, now, TICK_DT, ids);
      for (const e of ms.events || []) if (e.type === 'hit' && dmg[e.ownerId] != null) { dmg[e.ownerId] += e.damage || 0; if (e.targetHp != null && e.targetHp <= 0 && e.targetHp + (e.damage || 0) > 0) kills[e.ownerId] += 1; }
      const alive = (team) => ids.some((id) => ms.fighters[id].team === team && ms.fighters[id].hp > 0); if (!alive('A') || !alive('B')) break; } }
  finally { Math.random = real; }
  const aliveA = ids.filter((id) => ms.fighters[id].team === 'A' && ms.fighters[id].hp > 0).length, aliveB = ids.filter((id) => ms.fighters[id].team === 'B' && ms.fighters[id].hp > 0).length;
  const winner = aliveA && !aliveB ? 'A' : aliveB && !aliveA ? 'B' : 'draw';
  console.log(JSON.stringify({ ...job, winner, seconds: +((t * TICK_RATE_MS) / 1000).toFixed(1), dmg, kills, team: Object.fromEntries(ids.map((id) => [id, ms.fighters[id].team])), hp: Object.fromEntries(ids.map((id) => [id, Math.max(0, Math.round(ms.fighters[id].hp))])), cpuMs: Date.now() - t0 }));
}
