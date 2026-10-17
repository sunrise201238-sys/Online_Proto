// THE PROBE: brain A (this tree) against brain B (a frozen opponent — another checkout's shared/src/sim,
// NB_BASE; by default this tree against itself), Health Point mode, both seats, N seeds x maps x unit pairs.
// Per brain: wins, kill time, damage dealt per damage taken, rounds, the share of time in each of its states,
// its own counters per game (one brain: peeks / engages / reacts / approaches / waits / dodges; plain brain:
// maze entries / stuck), slow seconds (net movement under 1.7 u in a second), jumps, CPU per bot-tick.
// A plain-brain opponent's gate and burst knobs (botFireCap, botGateWidth, botSuppressBurst) are restored on
// its units from ITS constants, which the one-brain unit data no longer carries.
// usage: NB_BASE=/path/to/other/shared/src/sim node nb_probe.mjs [seeds] [secs] [maps,comma] [pairs: a:b,c:d]
const LIVE = new URL('../../shared/src/sim/', import.meta.url).href;
const BASE = process.env.NB_BASE ? new URL(process.env.NB_BASE.replace(/\/?$/, '/'), 'file://').href : LIVE;
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT } = await import(LIVE + 'index.js');
const { tickBot: tickA } = await import(LIVE + 'ai.js');
const { tickBot: tickB } = await import(BASE + 'ai.js');
const { UNIT_DATA: UNIT_DATA_B } = await import(BASE + 'constants.js');
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const [, , seedsArg = '8', secsArg = '90', mapsArg = 'flashpoint,factory,airport', pairsArg = 'unit10:unit4,unit1:unit5'] = process.argv;
const seeds = Number(seedsArg), secs = Number(secsArg);
const maps = mapsArg.split(','), pairs = pairsArg.split(',').map((p) => p.split(':'));
const BOT_FIELDS = ['botFireCap', 'botGateWidth', 'botSuppressBurst'];
const restoreB = (f, key) => { const u = UNIT_DATA_B[key] ?? {}; const own = {}; for (const k of BOT_FIELDS) if (u[k] !== undefined) own[k] = u[k]; f.unit = { ...f.unit, ...own }; };
const stateOf = (me) => me.botSDState ?? me.botState ?? '-';
const COUNTERS = ['botSDPeeks', 'botSDEngages', 'botSDReacts', 'botSDApproaches', 'botSDWaits', 'botSDDodges'];
const fresh = () => ({ games: 0, wins: 0, draws: 0, killMs: [], dealt: 0, taken: 0, rounds: 0, state: {}, ticks: 0, counters: {}, mazeEntries: 0, stuck: 0, slowSec: 0, jumps: 0, cpu: [] });
const acc = { A: fresh(), B: fresh() };
const t0 = Date.now();
for (const [ua, ub] of pairs) for (const mapKey of maps) for (let seed = 1; seed <= seeds; seed += 1) for (const swap of [false, true]) {
  const brains = swap ? { p1: 'B', p2: 'A' } : { p1: 'A', p2: 'B' };
  const m = createMatchState({ mapKey, p1UnitKey: ua, p2UnitKey: ub, startTime: 1000 });
  const F = { p1: m.fighters.p1, p2: m.fighters.p2 };
  if (brains.p1 === 'B') restoreB(F.p1, ua); else restoreB(F.p2, ub);
  const hp0 = { p1: F.p1.hp, p2: F.p2.hp };
  const real = Math.random; Math.random = mulberry32(seed * 7919 + (swap ? 1 : 0));
  let now = 1000, winner = null, endAt = null;
  const per = { p1: { prevState: null, prevStuck: null, prevFire: F.p1.lastFireAt, prevAct: null, winAt: 1000, winX: F.p1.pos.x, winZ: F.p1.pos.z }, p2: { prevState: null, prevStuck: null, prevFire: F.p2.lastFireAt, prevAct: null, winAt: 1000, winX: F.p2.pos.x, winZ: F.p2.pos.z } };
  try {
    for (let i = 0; i < secs * 1000 / TICK_RATE_MS; i += 1) {
      now += TICK_RATE_MS;
      for (const id of ['p1', 'p2']) {
        const me = F[id], a = acc[brains[id]], p = per[id];
        if (me.hp <= 0) continue;
        const tick = brains[id] === 'A' ? tickA : tickB;
        const c0 = performance.now(); tick(m, id, now); a.cpu.push(performance.now() - c0);
        a.ticks += 1;
        const st = stateOf(me);
        a.state[st] = (a.state[st] ?? 0) + 1;
        if (st === 'maze' && p.prevState !== 'maze') a.mazeEntries += 1;
        p.prevState = st;
        if (me.botStuckMemAt != null && me.botStuckMemAt !== p.prevStuck) { a.stuck += 1; p.prevStuck = me.botStuckMemAt; }
        if (me.lastFireAt !== p.prevFire) { a.rounds += 1; p.prevFire = me.lastFireAt; }
        if (me.action === 'jump' && p.prevAct !== 'jump') a.jumps += 1;
        p.prevAct = me.action;
        if (now - p.winAt >= 1000) { if (Math.hypot(me.pos.x - p.winX, me.pos.z - p.winZ) < 1.7) a.slowSec += 1; p.winAt = now; p.winX = me.pos.x; p.winZ = me.pos.z; }
      }
      tickMatch(m, { p1: emptyInput(), p2: emptyInput() }, now, TICK_DT, ['p1', 'p2']);
      if (F.p1.hp <= 0 || F.p2.hp <= 0) { winner = F.p1.hp <= 0 ? (F.p2.hp <= 0 ? null : 'p2') : 'p1'; endAt = now; break; }
    }
  } finally { Math.random = real; }
  for (const id of ['p1', 'p2']) {
    const a = acc[brains[id]], other = id === 'p1' ? 'p2' : 'p1';
    a.games += 1;
    a.dealt += hp0[other] - Math.max(0, F[other].hp);
    a.taken += hp0[id] - Math.max(0, F[id].hp);
    for (const k of COUNTERS) if (F[id][k] != null) a.counters[k] = (a.counters[k] ?? 0) + F[id][k];
    if (winner === id) { a.wins += 1; a.killMs.push(endAt - 1000); } else if (winner == null) a.draws += 1;
  }
}
const q = (arr, p) => { if (!arr.length) return NaN; const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const secsOf = (ticks) => ticks * TICK_RATE_MS / 1000;
for (const k of ['A', 'B']) {
  const a = acc[k];
  const decided = a.games - a.draws;
  const st = Object.entries(a.state).sort((x, y) => y[1] - x[1]).map(([s, n]) => `${s} ${(100 * n / Math.max(1, a.ticks)).toFixed(0)}%`).join(' ');
  const ctr = Object.keys(a.counters).length ? COUNTERS.filter((c) => a.counters[c] != null).map((c) => `${c.replace('botSD', '').toLowerCase()} ${(a.counters[c] / a.games).toFixed(1)}`).join(' ') : `maze entries ${(a.mazeEntries / a.games).toFixed(1)} stuck ${(a.stuck / a.games).toFixed(2)}`;
  console.log(`${k === 'A' ? 'A (this tree)' : 'B (NB_BASE)  '}: games ${a.games} | wins ${a.wins} draws ${a.draws} (${decided ? (100 * a.wins / decided).toFixed(0) : '-'}% of decided) | kill time median ${(q(a.killMs, 0.5) / 1000).toFixed(1)} s | damage dealt/taken ${(a.dealt / Math.max(1, a.taken)).toFixed(2)} | rounds per game ${(a.rounds / a.games).toFixed(0)} | ${st} | per game: ${ctr} | slow seconds per game ${(a.slowSec / a.games).toFixed(1)} of ${secsOf(a.ticks / a.games).toFixed(0)} | jumps per game ${(a.jumps / a.games).toFixed(1)} | cpu mean ${(a.cpu.reduce((x, y) => x + y, 0) / a.cpu.length).toFixed(3)} ms p99 ${q(a.cpu, 0.99).toFixed(2)}`);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s, ${maps.join('/')}, ${pairs.map((p) => p.join(' vs ')).join(', ')}, ${seeds} seeds x 2 seats)`);
