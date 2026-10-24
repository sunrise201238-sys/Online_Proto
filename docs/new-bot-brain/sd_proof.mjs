// SD UNCHANGED, THE PROOF: an older sim (SD_OLD — another checkout's shared/src/sim, e.g. this branch's
// second commit, where the Sudden Death brain is switched on by the botSD flag) against this tree, 1 HP, same
// seeds, both seats bot-driven; every tick the OBSERVABLE state of both fighters must agree — the body (pos,
// vel, airborne, step, momentum), the tank, the gun (ammo, reload, bloom, the fire clocks), hp, hit-stun — and
// every botSD* field. The plain brain's scratch (gone in b1019a) is not compared.
// usage: SD_OLD=/path/to/older/shared/src/sim node sd_proof.mjs
// Result on 2026-10-17 (b1018c sim vs b1019a sim): sd_proof_result.txt — 8/8 identical.
const LIVE = new URL('../../shared/src/sim/', import.meta.url).href;
if (!process.env.SD_OLD) { console.error('SD_OLD (the older sim directory) is required'); process.exit(2); }
const OLDP = new URL(process.env.SD_OLD.replace(/\/?$/, '/'), 'file://').href;
const OLD = await import(OLDP + 'index.js'); const { tickBot: tickOld } = await import(OLDP + 'ai.js');
const NEW = await import(LIVE + 'index.js'); const { tickBot: tickNew } = await import(LIVE + 'ai.js');

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ['pos', 'vel', 'hp', 'boost', 'ammo', 'action', 'nextFireAt', 'lastFireAt', 'stepUntil', 'stepCooldownUntil', 'momentumVX', 'momentumVZ', 'airborne', 'jumpCooldownUntil', 'reloadingUntil', 'bloom', 'hitStunUntil', 'sniperChargeUntil', 'sniperChargeTargetId'];
const stable = (v, depth = 0) => {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
  if (depth > 12) return '…';
  if (ArrayBuffer.isView(v)) return `typed[${v.length}]`;
  if (v instanceof Map || v instanceof Set) return `${v.constructor.name}[${v.size}]`;
  if (Array.isArray(v)) return v.map((x) => stable(x, depth + 1));
  const o = {}; for (const k of Object.keys(v).sort()) { if (k === 'unit' || k === 'unitKey' || typeof v[k] === 'function') continue; o[k] = stable(v[k], depth + 1); } return o;
};
const view = (f) => { const o = {}; for (const k of Object.keys(f).sort()) if (KEYS.includes(k) || (k.startsWith('botSD') && k !== 'botSD' && k !== 'botSDOpts' && k !== 'botSDTape')) o[k] = stable(f[k]); return o; };
const SCEN = [
  { mapKey: 'arena1', p1: 'unit1', p2: 'unit2', seed: 11, ticks: 4000 },
  { mapKey: 'factory', p1: 'unit4', p2: 'unit5', seed: 22, ticks: 4000 },
  { mapKey: 'airport', p1: 'unit1', p2: 'unit7', seed: 33, ticks: 4000 },
  { mapKey: 'station', p1: 'unit2', p2: 'unit4', seed: 44, ticks: 4000 },
  { mapKey: 'lobby', p1: 'unit5', p2: 'unit1', seed: 55, ticks: 4000 },
  { mapKey: 'flashpoint', p1: 'unit7', p2: 'unit9', seed: 66, ticks: 4000 },
  { mapKey: 'airport', p1: 'unit3', p2: 'unit10', seed: 77, ticks: 4000 },   // a sniper: the glint dodge's run changed shape
  { mapKey: 'factory', p1: 'unit6', p2: 'unit1', seed: 88, ticks: 4000 },
];
let pass = 0;
for (const sc of SCEN) {
  const mA = OLD.createMatchState({ mapKey: sc.mapKey, p1UnitKey: sc.p1, p2UnitKey: sc.p2, startTime: 1000 });
  const mB = NEW.createMatchState({ mapKey: sc.mapKey, p1UnitKey: sc.p1, p2UnitKey: sc.p2, startTime: 1000 });
  for (const id of ['p1', 'p2']) { mA.fighters[id].botSD = true; mA.fighters[id].hp = 1; mB.fighters[id].botSD = true; mB.fighters[id].hp = 1; }
  const rA = mulberry32(sc.seed), rB = mulberry32(sc.seed), real = Math.random;
  let now = 1000, diverged = null, ran = 0;
  try {
    for (let i = 0; i < sc.ticks; i += 1) {
      now += OLD.TICK_RATE_MS;
      Math.random = rA; tickOld(mA, 'p1', now); tickOld(mA, 'p2', now); OLD.tickMatch(mA, { p1: OLD.emptyInput(), p2: OLD.emptyInput() }, now, OLD.TICK_DT, ['p1', 'p2']);
      Math.random = rB; tickNew(mB, 'p1', now); tickNew(mB, 'p2', now); NEW.tickMatch(mB, { p1: NEW.emptyInput(), p2: NEW.emptyInput() }, now, NEW.TICK_DT, ['p1', 'p2']);
      for (const id of ['p1', 'p2']) {
        const a = view(mA.fighters[id]), b = view(mB.fighters[id]);
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]);
          if (x !== y) { diverged = `tick ${i} (${((now - 1000) / 1000).toFixed(2)} s) ${id}.${k}: old=${x?.slice(0, 90)} new=${y?.slice(0, 90)}`; break; }
        }
        if (diverged) break;
      }
      ran = i + 1;
      if (diverged || mA.fighters.p1.hp <= 0 || mA.fighters.p2.hp <= 0) break;
    }
  } finally { Math.random = real; }
  console.log(`${sc.mapKey} ${sc.p1} vs ${sc.p2}: ${diverged ? 'DIVERGED at ' + diverged : 'same for ' + ran + ' ticks'}`);
  if (!diverged) pass += 1;
}
console.log(`${pass}/${SCEN.length} scenarios identical in every observable field and every botSD* field`);
