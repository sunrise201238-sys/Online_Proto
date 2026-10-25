// Factory: headless bot match counting belt crossings (a bot's x passing from one side of a belt to the other within 2 s) and time on a belt top.
import { pathToFileURL } from 'node:url';
const [root, secs, seedArg] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const S = await import(SIM + 'index.js'); const C = await import(SIM + 'constants.js');
let seed = Number(seedArg ?? 7); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const m = S.createMatchState({ mapKey: 'factory', mode: '2v2', p1UnitKey: 'unit1', p2UnitKey: 'unit4', p3UnitKey: 'unit5', p4UnitKey: 'unit12', startTime: 1000 }); const ids = Object.keys(m.fighters); for (const id of ids) m.fighters[id].invulnerableUntil = 0;
const inputs = {}; for (const id of ids) inputs[id] = S.emptyInput(); let now = 1000; const GB = C.GROUND_BASE_Y;
const side = (x) => (x < -27.5 ? 'W' : x <= -22.5 ? 'belt' : x < 22.5 ? 'mid' : x <= 27.5 ? 'belt' : 'E'); const last = {}; const lastAt = {}; const st = Object.fromEntries(ids.map((id) => [id, { cross: 0, onBelt: 0, jumps: 0 }])); const prevAir = {};
const ticks = Math.round(Number(secs) * 1000 / C.TICK_RATE_MS);
for (let t = 0; t < ticks; t += 1) { now += C.TICK_RATE_MS; m.searchDeadline = performance.now() + 6;
  for (const id of ids) { const me = m.fighters[id]; if (me.hp <= 0) me.hp = 1000; me.targetId = S.pickBotTargetId(m, me) ?? me.targetId; S.tickBot(m, id, now); }
  S.tickMatch(m, inputs, now, C.TICK_DT, ids);
  for (const id of ids) { const me = m.fighters[id]; const s = side(me.pos.x); if (Math.abs(me.pos.z) <= 45) { if (s === 'belt' && !me.airborne) st[id].onBelt += 1; if (s !== 'belt' && last[id] && last[id] !== s && last[id] !== 'belt' && t - lastAt[id] < 2000 / C.TICK_RATE_MS) st[id].cross += 1; if (s !== 'belt') { last[id] = s; lastAt[id] = t; } }
    if (me.airborne && !prevAir[id]) st[id].jumps += 1; prevAir[id] = me.airborne; } }
for (const id of ids) console.log(`factory 2v2 ${id}: belt crossings ${st[id].cross}, ticks standing on a belt ${st[id].onBelt}, jumps ${st[id].jumps}`);
