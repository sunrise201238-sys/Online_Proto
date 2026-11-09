// gen.mjs — paired jobs: every config runs once per subject in the same seat — Minori unit22 and Maki unit21, with Saori unit1
// (Minori's base) and Koyuki unit12 (Maki's base) as references; 1v1 against the whole roster on every map, and random 2v2s
// (each config: both seats, two seeds per foe and map; 540 2v2s with a random mate and foes). Writes jobs.json in the current folder.
// For another study, set SUBJECTS (and agg.mjs's SUB / SN to match), POOL (the roster) and MAPS (the map keys) below.
import { writeFileSync } from 'node:fs';
let a = 13579; const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const SUBJECTS = ['unit22', 'unit21', 'unit1', 'unit12'];
const POOL = ['unit1','unit2','unit3','unit4','unit5','unit6','unit7','unit9','unit10','unit11','unit12','unit13','unit14','unit15','unit17','unit18','unit19','unit20','unit21','unit22'];
const MAPS = ['arena1','arena2','factory','factory2','square','lobby','station','flashpoint','airport','town','blockade','compound','dust','warehouse','hospital','spacecraft','district','backrooms'];
const cfgs = []; let seed = 1;
for (const opp of POOL) for (const map of MAPS) for (const side of ['A','B']) for (let k = 0; k < 2; k += 1) cfgs.push({ kind: 'field', mode: '1v1', map, side, seed: seed++, mates: [], foes: [opp] });
for (let i = 0; i < 540; i += 1) { const pool = [...POOL]; const take = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]; cfgs.push({ kind: '2v2', mode: '2v2', map: pick(MAPS), side: rnd() < 0.5 ? 'A' : 'B', seed: seed++, mates: [take()], foes: [take(), take()] }); }
for (let i = cfgs.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [cfgs[i], cfgs[j]] = [cfgs[j], cfgs[i]]; }
const jobs = [];
cfgs.forEach((c, id) => { for (const sub of SUBJECTS) { const mine = [sub, ...c.mates], theirs = c.foes; const [A, B] = c.side === 'A' ? [mine, theirs] : [theirs, mine];
  jobs.push({ cfg: id, kind: c.kind, sub, mode: c.mode, mapKey: c.map, side: c.side, seed: c.seed, units: c.mode === '1v1' ? [A[0], B[0]] : [A[0], B[0], A[1], B[1]], subId: c.side === 'A' ? 'p1' : 'p2' }); } });
writeFileSync('jobs.json', JSON.stringify(jobs)); console.log(jobs.length, 'jobs');
