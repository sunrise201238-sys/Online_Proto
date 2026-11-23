// What a tick of a match costs the server on each map, without the network: the shared sim driven as the server drives it
// (server/src/index.js tickLobby: the bots think first, in a turning order, under the route search's budget; then the shared tick).
// usage: node bench.mjs <line checkout> [ticks=3000] [rounds=2] [out.json]
//   MAPS=neon,town     only these maps (all of MAP_DATA otherwise)
//   BOT_EVERY=3        a bot thinks on every third tick alone, the bots staggered (1: every tick, as the server does)
//   SEARCH_MS=2        the route search's budget a tick (the server's SEARCH_BUDGET_MS)
//   STILL=1            the players stand where they spawn (otherwise a random walk with jumps, the sprint and the trigger held by chance)
// Five matches a map: 1v1 two players; 1v1 a player and a bot; 2v2 four players; 2v2 two players and two bots; 2v2 a player and three bots.
// The same seeds on every map. Every match runs 600 ticks before it is counted. Nobody falls (hp is topped up), so a match runs on.
// Printed and written: a tick's mean cost in ms on this machine, the bots' part and the shared tick's, the tick under which 99 in 100
// fall, the worst, the ticks over 1.6 ms (a tenth of the 16 ms tick), and how often a route search ran (the share of ticks on which a
// bot took the match's one search slot) with the bots' cost on such a tick and on the others.
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const root = path.resolve(process.argv[2]); const TICKS = Number(process.argv[3] ?? 3000), ROUNDS = Number(process.argv[4] ?? 2), OUT = process.argv[5];
const EVERY = Number(process.env.BOT_EVERY ?? 1), BUDGET = Number(process.env.SEARCH_MS ?? 2), STILL = !!process.env.STILL;
const SIM = pathToFileURL(root + '/shared/src/sim/').href; await import(pathToFileURL(root + '/shared/tools/maps/arena_files.mjs').href);
const { createMatchState, tickMatch, tickBot, pickBotTargetId, emptyInput, TICK_RATE_MS, TICK_DT, getArena, MAP_DATA } = await import(SIM + 'index.js');
const { navGridFor, registerNavGridData, hasNavGrid } = await import(SIM + 'ai.js'); const { navDataFile } = await import(SIM + 'navgrid.js');
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dirs = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const maps = Object.keys(MAP_DATA).filter((k) => !process.env.MAPS || process.env.MAPS.split(',').includes(k)); const info = {};
for (const k of maps) { const a = getArena(k); const file = path.join(root, 'client/public', navDataFile(k)); let from = 'built';
  if (!hasNavGrid(a) && fs.existsSync(file) && registerNavGridData(a, new Uint8Array(fs.readFileSync(file)))) from = 'file'; const g = navGridFor(a);
  info[k] = { boxes: a.obstacles.length, floors: a.surfaces.length, nodes: g.N, jumps: g.jumpLinkCount ?? 0, drops: g.dropLinkCount ?? 0, grid: from }; }
const SCEN = [['1v1 two players', '1v1', []], ['1v1 player and bot', '1v1', ['p2']], ['2v2 four players', '2v2', []], ['2v2 two players two bots', '2v2', ['p3', 'p4']], ['2v2 player and three bots', '2v2', ['p2', 'p3', 'p4']]];
function run(mapKey, mode, bots, seed) {
  const m = createMatchState({ mapKey, mode, p1UnitKey: 'unit1', p2UnitKey: 'unit4', p3UnitKey: 'unit5', p4UnitKey: 'unit12', startTime: 1000 }); const ids = Object.keys(m.fighters);
  const enemyOf = { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p1' };
  for (const id of ids) { const f = m.fighters[id]; f.hp = 1e9; f.invulnerableUntil = 0; f.targetId = enemyOf[id]; if (bots.includes(id)) f.botControlled = true; }
  const humans = ids.filter((id) => !bots.includes(id)); const inputs = {}; for (const id of ids) inputs[id] = emptyInput();
  const plan = Object.fromEntries(humans.map((id, i) => [id, { r: rng(seed * 97 + i * 13 + 5), left: 0, cur: null }]));
  let now = 1000; const cost = []; const driven = new Set(bots); const acc = { bots: 0, sim: 0, sTicks: 0, sMs: 0, oMs: 0 };
  for (let t = 0; t < TICKS + 600; t += 1) {
    now += TICK_RATE_MS;
    for (const id of humans) { const p = plan[id]; if (p.left <= 0) { const r = p.r; p.left = 20 + Math.floor(r() * 70); const [dx, dz] = dirs[Math.floor(r() * 9)]; p.cur = { moveX: dx, moveZ: dz, boost: r() < 0.25, shootHold: r() < 0.6, jumpTap: r() < 0.3, first: true }; }
      const c = p.cur; inputs[id] = STILL ? emptyInput() : { ...emptyInput(), moveX: c.moveX, moveZ: c.moveZ, boost: c.boost, shootHold: c.shootHold, shootTap: c.shootHold && c.first, jump: c.jumpTap && c.first }; c.first = false; p.left -= 1; }
    const t0 = performance.now();
    m.searchClosed = false; m.searchDeadline = performance.now() + BUDGET;
    if (bots.length) { const rot = (m.tick ?? 0) % bots.length; const order = bots.slice(rot).concat(bots.slice(0, rot));
      for (const id of order) { if (EVERY > 1 && ((m.tick ?? 0) + bots.indexOf(id)) % EVERY !== 0) continue; const me = m.fighters[id]; if (!me || me.hp <= 0) continue; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); } }
    const t1 = performance.now(); const searched = bots.length > 0 && m.hideSearchTick === m.tick;   // (ai.js searchSlot marks the tick a search took)
    tickMatch(m, inputs, now, TICK_DT, driven);
    const t2 = performance.now();
    if (t >= 600) { cost.push(t2 - t0); acc.bots += t1 - t0; acc.sim += t2 - t1; if (searched) { acc.sTicks += 1; acc.sMs += t1 - t0; } else acc.oMs += t1 - t0; }
    if (t % 300 === 0) for (const id of ids) m.fighters[id].hp = 1e9;
  }
  return { cost, acc };
}
for (const [, mode, bots] of SCEN) run(maps[0], mode, bots, 1);   // (a warming pass nobody counts)
const res = {}; for (const k of maps) res[k] = SCEN.map(() => ({ cost: [], bots: 0, sim: 0, sTicks: 0, sMs: 0, oMs: 0, error: null }));
for (let round = 0; round < ROUNDS; round += 1) { const order = round % 2 ? [...maps].reverse() : maps;
  for (const k of order) for (const [si, [, mode, bots]] of SCEN.entries()) { const R = res[k][si]; try { const r = run(k, mode, bots, 11 + round); R.cost.push(...r.cost); for (const f of ['bots', 'sim', 'sTicks', 'sMs', 'oMs']) R[f] += r.acc[f]; } catch (e) { R.error = String(e?.message ?? e).slice(0, 80); } } }
const stat = (R) => { const a = R.cost, s = [...a].sort((x, y) => x - y), n = a.length; return { mean: +(a.reduce((p, q) => p + q, 0) / n).toFixed(4), bots: +(R.bots / n).toFixed(4), sim: +(R.sim / n).toFixed(4), p99: +s[Math.floor(n * 0.99)].toFixed(3), max: +s[n - 1].toFixed(2), over16: a.filter((v) => v > 1.6).length, n,
  searchShare: +(100 * R.sTicks / n).toFixed(2), searchTickBots: +(R.sMs / Math.max(1, R.sTicks)).toFixed(3), otherTickBots: +(R.oMs / Math.max(1, n - R.sTicks)).toFixed(4) }; };
const rows = maps.map((k) => ({ map: k, ...info[k], scen: SCEN.map(([name], si) => (res[k][si].cost.length ? { name, ...stat(res[k][si]) } : { name, error: res[k][si].error })) }));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ ticks: TICKS, rounds: ROUNDS, botEvery: EVERY, searchMs: BUDGET, still: STILL, node: process.version, rows }));
console.log(`ticks counted a match ${TICKS}, rounds ${ROUNDS}, bots think every ${EVERY} tick(s), search budget ${BUDGET} ms${STILL ? ', the players standing still' : ''}`);
console.log('a line a match: mean ms a tick (the bots / the shared tick) | 99 in 100 under | worst | ticks over 1.6 ms | a route search in % of ticks, the bots on such a tick ms');
for (const r of rows) { console.log(`${r.map}: boxes ${r.boxes}, floors ${r.floors}, nodes ${r.nodes}, links ${r.jumps + r.drops}, grid ${r.grid}`);
  for (const s of r.scen) console.log(s.error ? `   ${s.name}: ${s.error}` : `   ${s.name.padEnd(26)} ${s.mean.toFixed(3)} (${s.bots.toFixed(3)} / ${s.sim.toFixed(3)}) | ${s.p99.toFixed(2)} | ${s.max.toFixed(1)} | ${s.over16} | ${s.searchShare.toFixed(1)} %, ${s.searchTickBots.toFixed(2)}`); }
