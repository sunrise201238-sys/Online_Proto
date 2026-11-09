// agg.mjs — paired results: Minori / Maki against their bases Saori / Koyuki, same configs; 1v1 vs the field, by foe class, by foe,
// by map, mirrors and head-to-heads, 2v2; win / loss / draw, time, damage dealt, HP left when winning
// Reads out_<slot>.jsonl in the current folder (sim.mjs's output). SUB / SN: the subjects, gen.mjs's SUBJECTS (the foe and map
// tables follow the first); NAME: the roster of 2026-11-08 (unit key, name, class) — add new units there.
import { readFileSync, readdirSync } from 'node:fs';
const rows = readdirSync('.').filter((f) => /^out_\d\.jsonl$/.test(f)).flatMap((f) => { const t = readFileSync(f, 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; });
const NAME = { unit1:'Saori AR', unit2:'Hoshino SG', unit3:'Aru SR', unit4:'Atsuko SMG', unit5:'Hina MG', unit6:'Kei SR', unit7:'Aris RF', unit9:'Asuna AR', unit10:'Fubuki RF', unit11:'Haruka SG', unit12:'Koyuki MG', unit13:'Marina SMG', unit14:'Subaru AR', unit15:'Yuuka SMG', unit17:'Kurumi SMG', unit18:'Rabu SG', unit19:'Hiyori SR', unit20:'Iori RF', unit21:'Maki MG', unit22:'Minori AR' };
const SUB = ['unit22', 'unit1', 'unit21', 'unit12']; const SN = { unit22: 'Minori', unit1: 'Saori', unit21: 'Maki', unit12: 'Koyuki' };
const ev = (r) => { const me = r.subId, T = r.team[me]; return { win: r.winner === T ? 1 : 0, loss: r.winner !== 'draw' && r.winner !== T ? 1 : 0, draw: r.winner === 'draw' ? 1 : 0, sec: r.seconds, dmg: r.dmg[me], hpLeft: r.winner === T ? r.hp[me] : null, kills: r.kills[me] }; };
const by = {}; for (const r of rows) (by[r.cfg] ||= {})[r.sub] = r;
const avg = (a, k) => { const v = a.map((x) => x[k]).filter((x) => x != null); return v.reduce((s, x) => s + x, 0) / (v.length || 1); }; const pct = (x) => (100 * x).toFixed(1) + '%';
const full = (kind) => Object.values(by).filter((p) => SUB.every((s) => p[s]) && p[SUB[0]].kind === kind);
const P = full('field'); console.log('== 1v1 vs the whole roster, paired configs', P.length);
for (const s of SUB) { const E = P.map((p) => ev(p[s])); console.log(' ', SN[s].padEnd(7), 'win', pct(avg(E, 'win')).padStart(6), 'loss', pct(avg(E, 'loss')).padStart(6), 'draw', pct(avg(E, 'draw')).padStart(5), '| sec', avg(E, 'sec').toFixed(1), '| dmg', avg(E, 'dmg').toFixed(1), '| hp left on a win', avg(E, 'hpLeft').toFixed(1)); }
const foeOf = (r) => r.units[r.subId === 'p1' ? 1 : 0]; const cat = (u) => NAME[u].split(' ')[1];
const cats = {}; for (const p of P) (cats[cat(foeOf(p[SUB[0]]))] ||= []).push(p);
console.log(' by foe class (win: Minori / Saori / Maki / Koyuki):'); for (const [c, Q] of Object.entries(cats)) console.log('   ', c.padEnd(4), 'n', String(Q.length).padStart(4), SUB.map((s) => pct(avg(Q.map((p) => ev(p[s])), 'win')).padStart(7)).join(''));
const opp = {}; for (const p of P) (opp[foeOf(p[SUB[0]])] ||= []).push(p);
console.log(' by foe (win: Minori / Saori / Maki / Koyuki):'); for (const [u, Q] of Object.entries(opp).sort((x, y) => NAME[x[0]].split(' ')[1].localeCompare(NAME[y[0]].split(' ')[1]))) console.log('   ', NAME[u].padEnd(11), SUB.map((s) => pct(avg(Q.map((p) => ev(p[s])), 'win')).padStart(7)).join(''));
const maps = {}; for (const p of P) (maps[p[SUB[0]].mapKey] ||= []).push(p);
console.log(' by map (win: Minori / Saori / Maki / Koyuki):'); for (const [m, Q] of Object.entries(maps)) console.log('   ', m.padEnd(11), SUB.map((s) => pct(avg(Q.map((p) => ev(p[s])), 'win')).padStart(7)).join(''));
const Q2 = full('2v2'); console.log('== 2v2 (random mate and foes), paired configs', Q2.length);
for (const s of SUB) { const E = Q2.map((p) => ev(p[s])); console.log(' ', SN[s].padEnd(7), 'win', pct(avg(E, 'win')).padStart(6), 'loss', pct(avg(E, 'loss')).padStart(6), 'draw', pct(avg(E, 'draw')).padStart(5), '| sec', avg(E, 'sec').toFixed(1), '| dmg', avg(E, 'dmg').toFixed(1), '| kills', avg(E, 'kills').toFixed(2)); }
console.log('rows', rows.length);
