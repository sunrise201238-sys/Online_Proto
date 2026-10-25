// A body walked by the real sim: start at a model point and height, hold a direction, log where it stands each few ticks.
// usage: node walkprobe.mjs <tree> <map> x,z,feetM moveX,moveZ seconds
import { pathToFileURL } from 'node:url';
const [root, map, start, dir, secs] = process.argv.slice(2); const SIM = pathToFileURL(root.replace(/\/?$/, '/') + 'shared/src/sim/').href; const S = await import(SIM + 'index.js'); const C = await import(SIM + 'constants.js');
const [mx, mz, fm] = start.split(',').map(Number); const [dx, dz] = dir.split(',').map(Number); const GB = C.GROUND_BASE_Y;
const m = S.createMatchState({ mapKey: map, mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit2', startTime: 1000 }); const ids = Object.keys(m.fighters); const me = m.fighters[ids[0]];
me.pos.x = mx * 4; me.pos.z = (mz - 1.34) * 4; me.pos.y = fm * 4 + GB; me.invulnerableUntil = 0; for (const id of ids) m.fighters[id].hp = 1000;
const inputs = {}; for (const id of ids) inputs[id] = S.emptyInput(); inputs[ids[0]].moveX = dx; inputs[ids[0]].moveZ = dz;
const other = m.fighters[ids[1]]; other.pos.x = 400; other.pos.z = 400;   // the opponent parked far away
let now = 1000; const ticks = Math.round(Number(secs) * 1000 / C.TICK_RATE_MS); let last = '';
for (let t = 0; t < ticks; t += 1) { now += C.TICK_RATE_MS; S.tickMatch(m, inputs, now, C.TICK_DT, [ids[1]]); const feet = (me.pos.y - GB) / 4; const line = `t${t} (${(me.pos.x / 4).toFixed(2)}, ${(me.pos.z / 4 + 1.34).toFixed(2)}) feet ${feet.toFixed(2)}${me.airborne ? ' air' : ''}`; if (t % 4 === 0 || (t === ticks - 1)) console.log(line); last = line; }
