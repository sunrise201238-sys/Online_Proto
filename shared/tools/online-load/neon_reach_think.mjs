// usage: THINK_EVERY=n node neon_reach_think.mjs <line checkout> <an earlier scan's out.json> <seconds> <out.json> : the same bot starts and target places as that scan, on this tree — : Neon: for each bot start and each target place (the route grid's nodes
// on the given floors inside the box, every `step` metres; the target stands still), when the bot first has sight of its target or stands within 3 m of it on its floor — or never in the run, and then where it stands
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const EVERY = Number(process.env.THINK_EVERY ?? 1);   // (the bot thinks on every EVERY-th tick alone)
const root = path.resolve(process.argv[2]); const PREV = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); const SECS = Number(process.argv[4]); const OUT = process.argv[5];
const uniq = (rows, k) => { const seen = new Set(), out = []; for (const r of rows) { const key = r[k].join(','); if (!seen.has(key)) { seen.add(key); out.push(r[k]); } } return out; }; const starts = uniq(PREV, 'B'), wanted = uniq(PREV, 'T');
const SIM = pathToFileURL(root + '/shared/src/sim/').href; await import(pathToFileURL(root + '/shared/tools/maps/arena_files.mjs').href);
const C = await import(SIM + 'constants.js'); const { createMatchState, tickMatch, emptyInput, getArena } = await import(SIM + 'index.js'); const { tickBot, navGridFor, registerNavGridData, hasNavGrid, botHasLineOfSight } = await import(SIM + 'ai.js'); const { navDataFile } = await import(SIM + 'navgrid.js');
const G = C.GROUND_BASE_Y, DT = C.TICK_DT, MS = C.TICK_RATE_MS, EYE = C.BOT_LOS_EYE_HEIGHT; const AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4, MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37;
const arena = getArena('neon'); if (!hasNavGrid(arena)) registerNavGridData(arena, new Uint8Array(fs.readFileSync(path.join(root, 'client/public', navDataFile('neon'))))); const grid = navGridFor(arena);
const targets = wanted.map((t) => { for (let i = 0; i < grid.N; i += 1) { const x = MX(grid.posX[i]), z = MZ(grid.posZ[i]), f = grid.floor[i] / 4; if (Math.abs(x - t[0]) < 0.011 && Math.abs(z - t[1]) < 0.011 && Math.abs(f - t[2]) < 0.011) return [x, z, f]; } throw new Error('no node at ' + t.join(',')); });
const FL = [...new Set(targets.map((t) => +t[2].toFixed(2)))].sort((a, b) => a - b);
const rows = []; let never = 0, sum = 0, n = 0; const where = {};
for (const B0 of starts) for (const T0 of targets) { const m = createMatchState({ mapKey: 'neon', mode: '1v1', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 }); for (const f of Object.values(m.fighters)) { f.hp = 1e9; f.invulnerableUntil = 0; }
  const p = m.fighters.p1, b = m.fighters.p2; p.pos = { x: AX(T0[0]), y: T0[2] * 4 + G, z: AZ(T0[1]) }; p.floorY = p.pos.y; const p0 = { ...p.pos };
  b.pos = { x: AX(B0[0]), y: B0[2] * 4 + G, z: AZ(B0[1]) }; b.floorY = b.pos.y; b.botControlled = true; b.targetId = 'p1'; p.targetId = 'p2';
  let now = 1000, at = null; const N = SECS * 1000 / MS;
  for (let t = 0; t < N && at == null; t += 1) { now += MS; m.tick = (m.tick ?? 0) + 1; if (t % EVERY === 0) tickBot(m, 'p2', now); tickMatch(m, { p1: emptyInput() }, now, DT, ['p2']); p.pos.x = p0.x; p.pos.z = p0.z; p.pos.y = p0.y; p.vel.x = p.vel.y = p.vel.z = 0; p.airborne = false; p.grounded = true;
    const see = botHasLineOfSight({ x: b.pos.x, y: b.pos.y + EYE, z: b.pos.z }, { x: p.pos.x, y: p.pos.y + EYE, z: p.pos.z }, arena.obstacles, arena.surfaces);
    const near = !b.airborne && Math.abs(b.pos.y - p.pos.y) < 2 && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 12;
    if (see || near) at = (now - 1000) / 1000; }
  n += 1; const e = [+MX(b.pos.x).toFixed(1), +MZ(b.pos.z).toFixed(1), +((b.pos.y - G) / 4).toFixed(1)]; rows.push({ B: B0, T: T0.map((v) => +v.toFixed(2)), at, end: e });
  if (at == null) { never += 1; const k = `(${(Math.round(e[0] * 2) / 2).toFixed(1)}, ${Math.round(e[1])} | ${e[2].toFixed(1)})`; (where[k] ??= []).push(`T(${T0[0].toFixed(1)},${T0[1].toFixed(1)})`); } else sum += at; }
console.log(`${targets.length} target places on floors ${FL.join(', ')} m, ${starts.length} bot starts, ${SECS} s a run: the bot NEVER has sight of its target or comes within 3 m of it on its floor in ${never} of ${n} runs; in the others after ${(sum / Math.max(1, n - never)).toFixed(1)} s on average`);
for (const [k, v] of Object.entries(where).sort((a, b) => b[1].length - a[1].length).slice(0, 14)) console.log(`  the bot ends at ${k}: ${v.length} runs: ${[...new Set(v)].slice(0, 8).join(' ')}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows));
