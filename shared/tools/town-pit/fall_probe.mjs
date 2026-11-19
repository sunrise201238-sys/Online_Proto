// fall_probe.mjs <tree> — a body on Town's raised deck walked east at the map's edge by the reported spot (arena z 168), then
// tries to get back: walk west, and walk west with jumps. The shared sim's own tick (online rules; the offline client runs the
// same body rule). Prints where the body stands after each part.
import { pathToFileURL } from 'node:url';
const tree = process.argv[2];
await import(pathToFileURL(tree + '/shared/tools/maps/arena_files.mjs').href);
const { createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, GROUND_BASE_Y } = await import(pathToFileURL(tree + '/shared/src/sim/index.js').href);
const out = [];
for (const z of (process.env.ZS ? process.env.ZS.split(",").map(Number) : [146, 152, 160, 168, 176, 182])) {
  const m = createMatchState({ mapKey: 'town', p1UnitKey: 'unit1', p2UnitKey: 'unit1', startTime: 1000 });
  const f = m.fighters.p1, e = m.fighters.p2;
  f.pos.x = 262; f.pos.z = z; f.pos.y = GROUND_BASE_Y + 15.51; f.vel.x = f.vel.y = f.vel.z = 0; f.grounded = true;
  e.pos.x = -200; e.pos.z = -150; e.hp = 1e9; f.invulnerableUntil = 1e15; e.invulnerableUntil = 1e15;
  let now = 1000;
  const run = (ms, inp) => { for (let t = 0; t < ms; t += TICK_RATE_MS) { now += TICK_RATE_MS; tickMatch(m, { p1: { ...emptyInput(), ...(typeof inp === 'function' ? inp(t) : inp) }, p2: emptyInput() }, now, TICK_DT); } };
  const at = () => `x ${f.pos.x.toFixed(2)} z ${f.pos.z.toFixed(2)} feet ${((f.pos.y - GROUND_BASE_Y) / 4).toFixed(2)} m`;
  run(2000, { moveX: 1 }); const a = at();
  run(2500, { moveX: -1 }); const b = at();
  run(3000, (t) => ({ moveX: -1, jump: (t % 800) < 100 })); const c = at();
  out.push(`z ${z}: east 2 s -> ${a} | west 2.5 s -> ${b} | west with jumps -> ${c}`);
}
console.log(out.join('\n'));
