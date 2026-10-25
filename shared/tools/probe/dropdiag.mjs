// Station: what a bot is doing the tick it leaves a platform (floor 4 -> 0): state, action, a jump just before, the edge hold's count, speed.
import { pathToFileURL } from 'node:url';
const [root, secs, seedArg] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const S = await import(SIM + 'index.js'); const C = await import(SIM + 'constants.js');
let seed = Number(seedArg ?? 7); Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const m = S.createMatchState({ mapKey: 'station', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit4', startTime: 1000 }); const ids = Object.keys(m.fighters); for (const id of ids) m.fighters[id].invulnerableUntil = 0;
const inputs = {}; for (const id of ids) inputs[id] = S.emptyInput(); let now = 1000; const GB = C.GROUND_BASE_Y; const lastFloor = {}, lastJumpT = {}, prevAir = {}, lastHolds = {}, lastState = {}; const byState = {}, byKind = { jumped: 0, walkedOff: 0 };
const ticks = Math.round(Number(secs) * 1000 / C.TICK_RATE_MS);
for (let t = 0; t < ticks; t += 1) { now += C.TICK_RATE_MS; m.searchDeadline = performance.now() + 6;
  for (const id of ids) { const me = m.fighters[id]; if (me.hp <= 0) me.hp = 1000; me.targetId = S.pickBotTargetId(m, me) ?? me.targetId; lastState[id] = me.botState; S.tickBot(m, id, now); }
  S.tickMatch(m, inputs, now, C.TICK_DT, ids);
  for (const id of ids) { const me = m.fighters[id]; if (me.airborne && !prevAir[id]) lastJumpT[id] = t; prevAir[id] = me.airborne;
    const floor = S.groundHeightAt(me.pos.x, me.pos.z, S.getArena('station').surfaces, me.pos.y - GB); const lf = lastFloor[id];
    if (lf != null && lf - floor > 2.7) { const jumped = lastJumpT[id] != null && t - lastJumpT[id] <= 0.5 * 1000 / C.TICK_RATE_MS; byKind[jumped ? 'jumped' : 'walkedOff'] += 1; const k = `${lastState[id]}${jumped ? '/jump:' + (me.botHopWhy ?? '?') : '/walk-off'}`; byState[k] = (byState[k] ?? 0) + 1;
      if (Object.values(byState).reduce((a, b) => a + b, 0) <= 10) console.log(`t=${(t * C.TICK_RATE_MS / 1000).toFixed(1)}s ${id} left ${lf.toFixed(1)}→${floor.toFixed(1)} at (${me.pos.x.toFixed(0)}, ${me.pos.z.toFixed(0)}) u; state before the tick ${lastState[id]}, action ${me.action}, ${jumped ? 'JUMPED (' + (me.botHopWhy ?? '?') + ')' : 'walked off'}, speed ${Math.hypot(me.vel.x, me.vel.z).toFixed(1)}, edge holds so far ${me.botEdgeHolds ?? 0}`); }
    if (!me.airborne) lastFloor[id] = floor; } }
console.log('drops by state/kind:', JSON.stringify(byState), '| total', JSON.stringify(byKind), '| edge holds', ids.map((id) => m.fighters[id].botEdgeHolds ?? 0).join('/'));
