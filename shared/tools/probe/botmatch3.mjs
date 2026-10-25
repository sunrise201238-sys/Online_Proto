// Station: platform leaves counted once each, split into crossings (landing on the other platform within 4 s), same-side returns (back up the platform just left within 4 s), and stays below; by the state that left.
import { pathToFileURL } from 'node:url';
const [root, secs, seedArg] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const S = await import(SIM + 'index.js'); const C = await import(SIM + 'constants.js');
let seed = Number(seedArg ?? 7); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const m = S.createMatchState({ mapKey: 'station', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit4', startTime: 1000 }); const ids = Object.keys(m.fighters); for (const id of ids) m.fighters[id].invulnerableUntil = 0;
const inputs = {}; for (const id of ids) inputs[id] = S.emptyInput(); let now = 1000; const GB = C.GROUND_BASE_Y; const surfaces = S.getArena('station').surfaces;
const side = (z) => (z < -11 ? 'S' : z > 11 ? 'N' : 'trench'); const st = Object.fromEntries(ids.map((id) => [id, { leaves: 0, returns: 0, crossings: 0, stays: 0, byState: {}, pending: null, onPlat: 0 }])); const standing = {};
const ticks = Math.round(Number(secs) * 1000 / C.TICK_RATE_MS);
for (let t = 0; t < ticks; t += 1) { now += C.TICK_RATE_MS; m.searchDeadline = performance.now() + 6; const stateBefore = {};
  for (const id of ids) { const me = m.fighters[id]; if (me.hp <= 0) me.hp = 1000; me.targetId = S.pickBotTargetId(m, me) ?? me.targetId; stateBefore[id] = me.botState; S.tickBot(m, id, now); }
  S.tickMatch(m, inputs, now, C.TICK_DT, ids);
  for (const id of ids) { const me = m.fighters[id]; const s = st[id]; if (me.airborne) continue; const floor = S.groundHeightAt(me.pos.x, me.pos.z, surfaces, me.pos.y - GB); const sd = floor > 2 ? side(me.pos.z) : 'trench'; if (sd !== 'trench') s.onPlat += 1;
    const prev = standing[id]; standing[id] = { sd, t };
    if (prev && prev.sd !== 'trench' && sd === 'trench') { s.leaves += 1; s.pending = { from: prev.sd, t, state: stateBefore[id] }; const k = stateBefore[id] ?? '?'; s.byState[k] = (s.byState[k] ?? 0) + 1; }
    if (prev && prev.sd === 'trench' && sd !== 'trench' && s.pending) { const dt = (t - s.pending.t) * C.TICK_RATE_MS / 1000; if (dt <= 4) { if (sd === s.pending.from) s.returns += 1; else s.crossings += 1; } else s.stays += 1; s.pending = null; } } }
for (const id of ids) { const s = st[id]; console.log(`station ${id}: left a platform ${s.leaves}× (${Object.entries(s.byState).map(([k, v]) => k + ' ' + v).join(', ')}); back up the SAME side within 4 s ${s.returns}, crossed to the other within 4 s ${s.crossings}, stayed down longer ${s.stays}; time on a platform ${(s.onPlat / ticks * 100).toFixed(0)}%`); }
