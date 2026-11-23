// What a bot's gun does when the bot thinks on every n-th tick alone (THINK_EVERY=n; BOT_UNIT=unit4 picks the bot's unit).
// usage: node bot_think_damage.mjs <line checkout> <B|D> [runs=10] [seconds=60] : Neon; a bot against a body that stands still by the top pad (B: the tower top; D: in the bridge), the bot starting on the street by the pad's pair.
// (The "sight" time is counted on the bot's thinking ticks alone, so it reads a third with THINK_EVERY=3: read the damage.)
// Per run: when the pad first moved it, how often it was moved, how often it came down from the top level, the time it stood up there, the time it had sight of the body, and the damage it did.
import { pathToFileURL } from 'node:url'; import path from 'node:path';
const EVERY = Number(process.env.THINK_EVERY ?? 1);   // (the bot thinks on every EVERY-th tick alone)
const root = path.resolve(process.argv[2]); const which = process.argv[3] ?? 'B'; const RUNS = Number(process.argv[4] ?? 10), SECS = Number(process.argv[5] ?? 60);
const SIM = pathToFileURL(root + '/shared/src/sim/').href; await import(pathToFileURL(root + '/shared/tools/maps/arena_files.mjs').href);
const C = await import(SIM + 'constants.js'); const { createMatchState, tickMatch, emptyInput, getArenaPads } = await import(SIM + 'index.js'); const { tickBot } = await import(SIM + 'ai.js');
const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS; const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37;
const pads = getArenaPads('neon'); const top = which === 'B' ? 1 : 3, low = pads[top].to; const rows = [];
for (let r = 0; r < RUNS; r += 1) {
  const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: process.env.BOT_UNIT ?? 'unit1', startTime: 1000 }); for (const f of Object.values(m.fighters)) { f.hp = 1e9; f.invulnerableUntil = 0; }
  const p = m.fighters.p1, b = m.fighters.p2; const T = pads[top], A = pads[low];
  p.pos = which === 'B' ? { x: T.x, y: T.y + G, z: T.z - 6 } : { x: T.x, y: T.y + G, z: T.z - 24 }; p.floorY = p.pos.y;
  b.pos = { x: A.x + 8, y: A.y + G, z: A.z + (which === 'B' ? 10 : -10) }; b.floorY = b.pos.y; b.botControlled = true; b.targetId = 'p1'; p.targetId = 'p2';
  const p0 = { ...p.pos }; const hp0 = p.hp; let now = 1000, first = null, downs = 0, wasUp = false, upMs = 0, losMs = 0, lowest = 1e9, nearMs = 0; const UP = (pads[top].y / 4) - 5;
  for (let t = 0; t < SECS * 1000 / MS; t += 1) { now += MS; m.tick = (m.tick ?? 0) + 1; if (t % EVERY === 0) tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']);
    p.pos.x = p0.x; p.pos.z = p0.z; p.pos.y = p0.y; p.vel.x = p.vel.y = p.vel.z = 0; p.airborne = false; p.grounded = true;   // (the body stands where it was put, whatever hits it)
    if (b.padMoves && first == null) first = now - 1000; const feet = (b.pos.y - G) / 4; const up = feet >= UP && !b.airborne;
    if (b.airborne ? feet >= UP : up) upMs += MS; if (wasUp && !b.airborne && feet < UP) { downs += 1; wasUp = false; } if (up) wasUp = true;
    if (b.botLastLoSAt === now) losMs += MS; if (Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) / 4 < 14 && Math.abs(feet - (p.pos.y - G) / 4) < 6) nearMs += MS; }
  rows.push({ first, moves: b.padMoves ?? 0, downs, upS: upMs / 1000, losS: losMs / 1000, nearS: nearMs / 1000, dmg: hp0 - p.hp, end: `(${MX(b.pos.x).toFixed(1)}, ${MZ(b.pos.z).toFixed(1)} | ${((b.pos.y - G) / 4).toFixed(1)})` }); }
for (const [i, r] of rows.entries()) console.log(`  run ${i + 1}: first moved at ${r.first == null ? 'never' : (r.first / 1000).toFixed(1) + ' s'}, pad moves ${r.moves}, came down ${r.downs} times, up for ${r.upS.toFixed(1)} s, sight for ${r.losS.toFixed(1)} s, within 14 m on the level for ${r.nearS.toFixed(1)} s, damage ${Math.round(r.dmg)}, ends ${r.end}`);
const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length; const med = (k) => { const v = rows.map((r) => r[k]).sort((x, y) => x - y); return v[v.length >> 1]; };
console.log(`${which}, ${RUNS} runs of ${SECS} s: MEAN pad moves ${mean('moves').toFixed(1)}, came down ${mean('downs').toFixed(1)} times, up ${mean('upS').toFixed(1)} s, sight ${mean('losS').toFixed(1)} s, near ${mean('nearS').toFixed(1)} s, damage ${Math.round(mean('dmg'))} (middle ${Math.round(med('dmg'))})`);
