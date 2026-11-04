// Hand-made boxes in place of what a reading made of a thing: each box (model metres, x0,x1,z0,z1,top — the top over the street, as
// the F4 line and the other data tools give heights) goes in from the street up with the reading's topBuffer 0.8 and a lid — a flat
// floor on its top, 0.08 units wider each side, `lid` 1, as the parts reading's own tops (Town's car; Compound's reading makes them
// flush): a body stands on it and a landing on it plants. Out go the reading's entries the boxes stand for: a box, floor or slope whose plan lies half or more inside the
// boxes grown by <grow> metres and whose top (a slope's highest corner) lies in the band h0..h1 metres over the street — below h0 the
// ground the things stand on stays, above h1 what stands behind them (a wall) — and any entry whose plan lies wholly inside one new
// box and no higher than its top (hidden in it: no body reaches it). Made for Compound's yellow car and blue flatbed by the curved
// wall (user 2026-11-03, of the collision view: "how about just make those cboxes clean and simple like they are in Town
// reference?", then of two layouts the one with the car's body and its cabin apart; of the trailer behind the wall the same day,
// "use the same simple cbox logic"): the reading had made the car and the flatbed 142 boxes — 131 of them a cell thin — 123 floors
// and 32 slopes, and the route grid climbed a one-unit slope behind the car onto its roof where no body can, so a bot sent that way
// stood against the car. A plan's share inside the grown boxes is exact (the rectangles' edges split it into cells). Each box's top
// must lie in the band, so a run again over the output takes out the boxes it put in and puts them back as they were. The transform: scale,cx,cz as the client's GLB_MAPS line has them (arena = (model - c) * scale), or `-` for
// the input's own `transform` (a generator's json; the installed file has none).
// A box on a raised floor takes a sixth number, its base over the street (x0,x1,z0,z1,top,base — Town's car on the deck, 2026-11-04):
// it stands from there, and an entry under that base is never "hidden" in it.
// usage: node data_boxes.mjs <in.json> <scale,cx,cz|-> "<x0,x1,z0,z1,top[,base];...>" <grow> <h0,h1> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, tS, boxesS, growS, bandS, outF] = process.argv.slice(2);
if (!outF) { console.error('usage: node data_boxes.mjs <in.json> <scale,cx,cz|-> "<x0,x1,z0,z1,top[,base];...>" <grow> <h0,h1> <out.json>'); process.exit(2); }
// numbers from a comma list: n of them, none blank (Number('') is 0 and would pass as one)
const nums = (str, n, what) => { const t = String(str).split(',').map((x) => x.trim()); const v = t.map(Number);
  if (t.length !== n || t.some((x) => x === '') || v.some((x) => !Number.isFinite(x))) throw new Error(`${what}: ${n} number${n === 1 ? '' : 's'} — ${str}`); return v; };
const D = JSON.parse(readFileSync(inF, 'utf8'));
const T = tS === '-' ? D.transform : (([scale, cx, cz]) => ({ scale, cx, cz }))(nums(tS, 3, 'the transform scale,cx,cz'));
if (!T || ![T.scale, T.cx, T.cz].every(Number.isFinite)) throw new Error('the transform: scale,cx,cz (or - with a transform in the input)');
const s = T.scale, grow = nums(growS, 1, 'grow (metres)')[0] * s; const [h0, h1] = nums(bandS, 2, 'the band h0,h1').map((v) => v * s);
if (!(grow >= 0) || !(h1 > h0)) throw new Error('grow >= 0 and h0 < h1');
const du = (v) => Math.round(v * 100) / 100;
const NEW = boxesS.split(';').map((b) => b.trim()).filter(Boolean).map((b) => { const v = nums(b, b.split(',').length === 6 ? 6 : 5, 'a box x0,x1,z0,z1,top[,base]'); const base = v[5] ?? 0;
  if (!(v[1] > v[0] && v[3] > v[2] && v[4] > base && base >= 0)) throw new Error(`a box: x0 < x1, z0 < z1, 0 <= base < top — ${b}`);
  const o = { minX: du((v[0] - T.cx) * s), maxX: du((v[1] - T.cx) * s), minZ: du((v[2] - T.cz) * s), maxZ: du((v[3] - T.cz) * s), minY: du(base * s), maxY: du(v[4] * s), topBuffer: 0.8 };
  if (o.maxY < h0 || o.maxY > h1) throw new Error(`a box's top outside the band (a run over the output would keep its old lid): ${b}`); return o; });
if (!NEW.length) throw new Error('no boxes');
const GROWN = NEW.map((b) => ({ minX: b.minX - grow, maxX: b.maxX + grow, minZ: b.minZ - grow, maxZ: b.maxZ + grow }));
// the share of a plan inside the grown boxes: the rectangles' edges inside the plan split it into cells, each wholly in or out
const share = (e) => { const w = e.maxX - e.minX, d = e.maxZ - e.minZ;
  if (!(w > 0 && d > 0)) { const x = (e.minX + e.maxX) / 2, z = (e.minZ + e.maxZ) / 2; return GROWN.some((g) => x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ) ? 1 : 0; }
  const xs = new Set([e.minX, e.maxX]), zs = new Set([e.minZ, e.maxZ]);
  for (const g of GROWN) { for (const x of [g.minX, g.maxX]) if (x > e.minX && x < e.maxX) xs.add(x); for (const z of [g.minZ, g.maxZ]) if (z > e.minZ && z < e.maxZ) zs.add(z); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b); let a = 0;
  for (let i = 0; i + 1 < X.length; i += 1) for (let j = 0; j + 1 < Z.length; j += 1) { const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
    if (GROWN.some((g) => cx >= g.minX && cx <= g.maxX && cz >= g.minZ && cz <= g.maxZ)) a += (X[i + 1] - X[i]) * (Z[j + 1] - Z[j]); }
  return a / (w * d); };
const topOf = (e) => (e.type === 'plane' ? Math.max(e.y0, e.y0 + e.gx * (e.maxX - e.minX), e.y0 + e.gz * (e.maxZ - e.minZ), e.y0 + e.gx * (e.maxX - e.minX) + e.gz * (e.maxZ - e.minZ))
  : e.type === 'flat' ? e.top : e.type ? (e.maxTop ?? e.top) : e.maxY);   // (another kind of surface by its maxTop)
const hidden = (e) => NEW.some((b) => e.minX >= b.minX && e.maxX <= b.maxX && e.minZ >= b.minZ && e.maxZ <= b.maxZ && topOf(e) <= b.maxY + 1e-6 && (b.minY <= 0 || topOf(e) >= b.minY - 1e-6));
const out = (e) => { const t = topOf(e); return (t >= h0 && t <= h1 && share(e) >= 0.5) || hidden(e); };
const tally = { box: 0, flat: 0, plane: 0 };
const obstacles = D.obstacles.filter((e) => { if (!out(e)) return true; tally.box += 1; return false; });
const surfaces = D.surfaces.filter((e) => { if (!out(e)) return true; tally[e.type === 'plane' ? 'plane' : 'flat'] += 1; return false; });
for (const b of NEW) { obstacles.push(b); surfaces.push({ minX: du(b.minX - 0.08), maxX: du(b.maxX + 0.08), minZ: du(b.minZ - 0.08), maxZ: du(b.maxZ + 0.08), maxTop: b.maxY, type: 'flat', top: b.maxY, lid: 1 }); }
writeFileSync(outF, JSON.stringify({ ...D, obstacles, surfaces }));
console.log(`out: ${tally.box} boxes, ${tally.flat} floors, ${tally.plane} slopes; in: ${NEW.length} boxes with their lids -> ${obstacles.length} boxes, ${surfaces.length} surfaces, ${outF}`);
for (const b of NEW) console.log(`  box x ${b.minX}..${b.maxX} z ${b.minZ}..${b.maxZ} y ${b.minY}..${b.maxY} (units)`);
