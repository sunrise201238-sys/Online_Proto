// BOOT WARM-UP (owner 2026-10-07, "SD bot seems to be still when in
// immunity/spawned"). A fresh server paid every first-use cost at the
// moment the Sudden Death start hold released: the map's nav grid
// (25-95 ms per map on a fast core) and the SD brain's first ticks (JIT:
// ~30 ms for the first, ~40 ms more over the next nine). On the free
// instance's tenth of a core that burst is a 1-2 s stall in which no
// snapshot leaves the server — the bots stand on their spawns, immunity
// shimmering, then jump. The same costs hit a normal match at its start.
//
// So the work moves here, to boot, in small chunks between event-loop
// turns (connections keep flowing): every map's grid, the engage floors of
// every gun, and a few seconds of dry Sudden Death and normal matches so
// both brains are compiled before anyone plays. Nothing here may throw
// out: a failed step is logged and the server runs as before.
import {
  createMatchState,
  tickMatch,
  tickBot,
  pickBotTargetId,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  getArena,
  MAP_DATA,
  UNIT_DATA
} from '@gvg/shared/src/sim/index.js';
import { navGridFor, sdEngageFloor, BOT_SD } from '@gvg/shared/src/sim/ai.js';

// Build (or fetch) the map's nav grid — a no-op once built. startMatchFor
// calls it too, so a match on a map the boot pass has not reached yet pays
// the build inside the Sudden Death hold rather than at its release.
export function warmMap(mapKey) {
  try {
    if (!MAP_DATA[mapKey]) return false;
    navGridFor(getArena(mapKey));
    return true;
  } catch (e) {
    console.warn(`[warmup] grid for ${mapKey} failed:`, e?.message ?? e);
    return false;
  }
}

// A short bot-vs-bot match nobody sees: compiles the brain's code paths
// (route search, risk model, fire rules) and fills the per-gun caches. It
// runs in slices of a few ticks (one per event-loop turn), so on the free
// instance's slow core a slice still fits between two socket events.
function dryMatch(mapKey, mode, suddenDeath) {
  const m = createMatchState({ mapKey, mode, p1UnitKey: 'unit1', p2UnitKey: 'unit4', p3UnitKey: 'unit5', p4UnitKey: 'unit12', startTime: 1000 });
  const ids = Object.keys(m.fighters);
  for (const id of ids) {
    const f = m.fighters[id];
    f.invulnerableUntil = 0;   // straight into contact: the immune opening is the plain brain's
    if (suddenDeath) { f.hp = 1; f.botSD = true; }
  }
  const inputs = {};
  for (const id of ids) inputs[id] = emptyInput();
  let now = 1000;
  return (ticks) => {
    for (let t = 0; t < ticks; t += 1) {
      now += TICK_RATE_MS;
      m.searchDeadline = performance.now() + 6;
      for (const id of ids) {
        const me = m.fighters[id];
        if (me.hp <= 0) continue;
        me.targetId = pickBotTargetId(m, me) ?? me.targetId;
        tickBot(m, id, now);
      }
      tickMatch(m, inputs, now, TICK_DT, ids);
    }
  };
}

const DRY_TICKS = 60;        // a second of each dry match ...
const DRY_SLICE = 10;        // ... in slices this long

export function warmSimulation() {
  const t0 = performance.now();
  const steps = [];
  for (const mapKey of Object.keys(MAP_DATA)) steps.push([`grid ${mapKey}`, () => warmMap(mapKey)]);
  steps.push(['engage floors', () => {
    // (the SD band: cached per target gun and mover sprint — every pair)
    const units = Object.values(UNIT_DATA);
    for (const mover of units) {
      for (const target of units) sdEngageFloor(target, BOT_SD, (mover.sprintSpeed ?? 1) * BOT_SD.riskSprintFactor);
    }
  }]);
  // both brains, both team sizes, a few maps
  const dry = (name, mapKey, mode, suddenDeath) => {
    let step = null;
    for (let done = 0; done < DRY_TICKS; done += DRY_SLICE) {
      steps.push([name, () => { if (!step) step = dryMatch(mapKey, mode, suddenDeath); step(DRY_SLICE); }]);
    }
  };
  dry('dry SD 2v2 factory', 'factory', '2v2', true);
  dry('dry SD 1v1 airport', 'airport', '1v1', true);
  dry('dry SD 2v2 station', 'station', '2v2', true);
  dry('dry normal 2v2 factory', 'factory', '2v2', false);
  dry('dry normal 1v1 lobby', 'lobby', '1v1', false);
  let i = 0;
  let failed = 0;
  const runNext = () => {
    if (i >= steps.length) {
      console.log(`[warmup] ${steps.length - failed}/${steps.length} steps in ${(performance.now() - t0).toFixed(0)} ms`);
      return;
    }
    const [name, fn] = steps[i];
    i += 1;
    try { fn(); } catch (e) { failed += 1; console.warn(`[warmup] ${name} failed:`, e?.message ?? e); }
    setImmediate(runNext);   // one step per event-loop turn: sockets keep being served between steps
  };
  setImmediate(runNext);
}
