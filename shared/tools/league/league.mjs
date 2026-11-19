// league.mjs <tree root> <out.jsonl> <job> <part> <parts> [n] — bot against bot on the shared sim, the server's own way of
// driving them (warmup.js / index.js tickLobby: pickBotTargetId, tickBot, tickMatch). One line per match.
//   job 1v1:  every pair of the twenty units, on each map, `n` matches a pair and map, the sides swapped every other match
//   job 2v2:  `n` matches of two random teams of two (units may repeat) on a random map
//   job set:  a round robin of the teams listed in env TEAMS ("unit1+unit2,unit3+unit4,..."), `n` matches a pairing and map
// The three above run their lists in order. The three below are for a run with a time limit (env SECS, wall seconds): the
// list is shuffled by a seed every part shares, so whatever has been played when the time is up is a fair sample.
//   job 1v1s: the 1v1 list, `n` passes over it (every pair on every map once a pass, the sides swapped from pass to pass)
//   job sets: the round robin of TEAMS, `n` passes (every pairing on every map once a pass)
//   job 2v2s: random 2v2s until SECS is up
// env MAPS: the maps, comma-separated (default warehouse,square,town). <part> <parts>: this process plays every
// parts-th match of the list, starting at part (four processes: 0 4, 1 4, 2 4, 3 4), each to its own out file.
// A match ends when a side has no unit standing; at 150 s it goes to the side with more HP left in all (a draw if level).
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
const [root, out, job, partS, partsS, nS] = process.argv.slice(2); const part = Number(partS), parts = Number(partsS), N = Number(nS ?? 4);
const base = root.replace(/\/?$/, '/');
const S = await import(pathToFileURL(base + 'shared/src/sim/index.js').href);
const W = await import(pathToFileURL(base + 'server/src/warmup.js').href);
const { createMatchState, tickMatch, tickBot, pickBotTargetId, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA } = S;
const UNITS = ['unit1', 'unit9', 'unit14', 'unit22', 'unit4', 'unit13', 'unit15', 'unit17', 'unit2', 'unit11', 'unit18', 'unit12', 'unit5', 'unit21', 'unit10', 'unit7', 'unit20', 'unit3', 'unit6', 'unit19'];
const MAPS = (process.env.MAPS ?? 'warehouse,square,town').split(',');
for (const mk of MAPS) W.warmMap(mk);
const MAX_S = 150;
function play(mapKey, mode, a, b) {   // a, b: arrays of unit keys (one or two); side A sits in p1 (p3), side B in p2 (p4)
  const ids = mode === '2v2' ? ['p1', 'p2', 'p3', 'p4'] : ['p1', 'p2'];
  const m = createMatchState({ mapKey, mode, p1UnitKey: a[0], p2UnitKey: b[0], p3UnitKey: a[1] ?? a[0], p4UnitKey: b[1] ?? b[0], startTime: 1000 });
  m.shotSeed = (Math.random() * 4294967296) >>> 0;
  const inputs = { p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput() };
  const driven = new Set(ids); let now = 1000; const hpOf = (side) => ids.filter((s) => (side === 'A') === (s === 'p1' || s === 'p3')).reduce((t, s) => t + Math.max(0, m.fighters[s]?.hp ?? 0), 0);
  const maxTicks = Math.round(MAX_S * 1000 / TICK_RATE_MS);
  for (let tick = 0; tick < maxTicks; tick += 1) {
    now += TICK_RATE_MS; m.searchClosed = false;
    const rot = m.tick % ids.length; const order = ids.slice(rot).concat(ids.slice(0, rot));
    for (const id of order) { const me = m.fighters[id]; if (!me || me.hp <= 0) continue; me.targetId = pickBotTargetId(m, me) ?? me.targetId; tickBot(m, id, now); }
    tickMatch(m, inputs, now, TICK_DT, driven);
    if ((tick & 15) === 0) { const ha = hpOf('A'), hb = hpOf('B'); if (ha <= 0 || hb <= 0) return { w: ha <= 0 && hb <= 0 ? 'D' : (ha > 0 ? 'A' : 'B'), t: +((now - 1000) / 1000).toFixed(1), ha: Math.round(ha), hb: Math.round(hb), ko: true }; }
  }
  const ha = hpOf('A'), hb = hpOf('B'); const fa = ha / a.reduce((t, k) => t + (UNIT_DATA[k].hp ?? 100), 0) * (a.length === 1 && mode === '2v2' ? 0.5 : 1), fb = hb / b.reduce((t, k) => t + (UNIT_DATA[k].hp ?? 100), 0);
  return { w: Math.abs(fa - fb) < 0.02 ? 'D' : (fa > fb ? 'A' : 'B'), t: MAX_S, ha: Math.round(ha), hb: Math.round(hb), ko: false };
}
const emit = (o) => appendFileSync(out, JSON.stringify(o) + '\n');
const END = Date.now() + Number(process.env.SECS ?? 1e9) * 1000; const timeUp = () => Date.now() > END;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (arr, seed) => { const r = rng(seed); for (let i = arr.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const robin = (sides, mode, tag, seed) => { let kk = 0;
  for (let pass = 0; pass < N && !timeUp(); pass += 1) {
    const list = []; for (let i = 0; i < sides.length; i += 1) for (let j = i + 1; j < sides.length; j += 1) MAPS.forEach((map, mi) => list.push({ i, j, map, swap: (i + j + mi + pass) % 2 === 1 }));
    shuffle(list, seed + pass);
    for (const it of list) { if ((kk++ % parts) !== part) continue; if (timeUp()) break; const a = it.swap ? sides[it.j] : sides[it.i], b = it.swap ? sides[it.i] : sides[it.j]; const res = play(it.map, mode, a, b); emit({ job: tag, map: it.map, a, b, ...res }); }
  } };
if (job === '1v1s') robin(UNITS.map((u) => [u]), '1v1', '1v1', 12345);
if (job === 'sets') robin(process.env.TEAMS.split(',').map((t) => t.split('+')), '2v2', 'set', 777);
if (job === '2v2s') { const pick = () => UNITS[Math.floor(Math.random() * UNITS.length)]; while (!timeUp()) { const a = [pick(), pick()], b = [pick(), pick()], map = MAPS[Math.floor(Math.random() * MAPS.length)]; const res = play(map, '2v2', a, b); emit({ job: '2v2', map, a, b, ...res }); } }

let k = 0; const mine = () => (k++ % parts) === part;
if (job === '1v1') {
  for (let i = 0; i < UNITS.length; i += 1) for (let j = i + 1; j < UNITS.length; j += 1) for (const map of MAPS) for (let r = 0; r < N; r += 1) {
    if (!mine()) continue; const swap = r % 2 === 1; const a = swap ? UNITS[j] : UNITS[i], b = swap ? UNITS[i] : UNITS[j];
    const res = play(map, '1v1', [a], [b]); emit({ job, map, a: [a], b: [b], ...res });
  }
} else if (job === '2v2') {
  const pick = () => UNITS[Math.floor(Math.random() * UNITS.length)];
  for (let r = 0; r < N; r += 1) { if (!mine()) continue; const a = [pick(), pick()], b = [pick(), pick()], map = MAPS[Math.floor(Math.random() * MAPS.length)]; const res = play(map, '2v2', a, b); emit({ job, map, a, b, ...res }); }
} else if (job === 'set') {
  const teams = process.env.TEAMS.split(',').map((t) => t.split('+'));
  for (let i = 0; i < teams.length; i += 1) for (let j = i + 1; j < teams.length; j += 1) for (const map of MAPS) for (let r = 0; r < N; r += 1) {
    if (!mine()) continue; const swap = r % 2 === 1; const a = swap ? teams[j] : teams[i], b = swap ? teams[i] : teams[j];
    const res = play(map, '2v2', a, b); emit({ job, map, a, b, ...res });
  }
}
