// A hop in the shared sim, in Node, tick by tick (no browser, no frame rate): the player put on the standable top under a
// spot (model metres), walking a direction (sprinting if asked) and tapping jump at a given time; the feet's height and the
// floor under them every 50 ms, and where the body rests. The sim is the server's and the client's shared physics.
// usage: node hop_sim.mjs <tree root> <mapKey> <cxM> <czM> xM,zM dirX,dirZ [jumpAtS=0.3] [sprint=1] [seconds=2.5] [--data] [--release s]
import path from 'node:path';
const [root, mapKey, cxS, czS, spot, dirS, jumpAtS = '0.3', sprintS = '1', secS = '2.5', ...rest] = process.argv.slice(2); const ri = rest.indexOf('--release'); const releaseAt = ri >= 0 ? Number(rest[ri + 1]) * 1000 : Infinity;   // (--release s: the stick and sprint let go from then on)
const SIM = new URL(path.resolve(root).replace(/\/?$/, '/') + 'shared/src/sim/', 'file://').href;
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, getArena, GROUND_BASE_Y, groundHeightAt } = await import(SIM + 'index.js');
const CX = Number(cxS), CZ = Number(czS); const [xm, zm] = spot.split(',').map(Number); const [dx, dz] = dirS.split(',').map(Number); const dl = Math.hypot(dx, dz) || 1;
const X = (xm - CX) * 4, Z = (zm - CZ) * 4; const a = getArena(mapKey);
let top = 0; for (const o of a.obstacles) if (o.topBuffer != null && X >= o.minX && X <= o.maxX && Z >= o.minZ && Z <= o.maxZ && o.maxY > top && o.maxY < 40) top = o.maxY;
if (rest.includes('--data')) { const near = (o) => X >= o.minX - 8 && X <= o.maxX + 8 && Z >= o.minZ - 8 && Z <= o.maxZ + 8; console.log('boxes:'); for (const o of a.obstacles.filter(near)) console.log('  ', JSON.stringify(o)); console.log('surfaces:'); for (const s of a.surfaces.filter(near)) console.log('  ', JSON.stringify({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, top: s.top, type: s.type, lid: s.lid })); }
const m = createMatchState({ mapKey, p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000, mode: '1v1' });
const p1 = m.fighters.p1, p2 = m.fighters.p2; p1.invulnerableUntil = 0; p2.invulnerableUntil = 0; p1.hp = 1e9; p2.hp = 1e9;
p2.pos.x = X + dx / dl * 300; p2.pos.z = Z + dz / dl * 300;   // (the enemy far off in the walking direction: no fight)
p1.pos.x = X; p1.pos.z = Z; p1.pos.y = GROUND_BASE_Y + top; p1.vy = 0; p1.boost = 250;
let now = 1000; const feet = () => p1.pos.y - GROUND_BASE_Y; const floor = () => groundHeightAt(p1.pos.x, p1.pos.z, a.surfaces, feet());
console.log(`start on ${(top / 4).toFixed(2)} m at (${xm}, ${zm}), walking (${dx}, ${dz})${sprintS === '1' ? ' sprinting' : ''}, jump at ${jumpAtS} s`);
let maxFeet = -Infinity, lastLine = '';
for (let t = 0; t <= Number(secS) * 1000; t += TICK_RATE_MS) {
  const inp = emptyInput(); const held = t < releaseAt; inp.moveX = held ? dx / dl : 0; inp.moveZ = held ? dz / dl : 0; inp.boost = held && sprintS === '1'; inp.jump = t >= Number(jumpAtS) * 1000 && t < Number(jumpAtS) * 1000 + TICK_RATE_MS * 2;
  tickMatch(m, { p1: inp, p2: emptyInput() }, now, TICK_DT, []); now += TICK_RATE_MS;
  const f = feet(); if (f > maxFeet) maxFeet = f;
  if (t % 50 < TICK_RATE_MS) { const line = `t ${(t / 1000).toFixed(2)} at (${(p1.pos.x / 4 + CX).toFixed(2)}, ${(p1.pos.z / 4 + CZ).toFixed(2)}) feet ${(f / 4).toFixed(2)} m floor ${(floor() / 4).toFixed(2)} m${p1.airborne ? ' air' : ''}`; if (line !== lastLine) console.log(line); lastLine = line; }
}
console.log(`feet rose to ${(maxFeet / 4).toFixed(2)} m; rests at (${(p1.pos.x / 4 + CX).toFixed(2)}, ${(p1.pos.z / 4 + CZ).toFixed(2)}) on ${(feet() / 4).toFixed(2)} m`);
