// dust_wall_end.mjs <in dust_data.json> <out dust_data.json> — DUST, THE PLASTER WALL'S NORTH END IS A WALL, NOT A LEDGE (b1105ke; user 2026-11-22,
// of what the crates' work had found on the sim — from the big crate's top by the plaster wall a jump east goes over the wall's end, and behind the
// wall there is no way back: "Fix in PT.").
// The plaster wall east of the two crates (model x 74.40..75.15, z -36.40..-27.15) stands 5.00 m, and its north end, three cells of it, 4.50 to
// 4.70 m. The reading had given every part of it a floor on its top (a lid) and the topBuffer of a thing a body steps onto. The big crate beside it
// stands 2.87 m (3.10 m before b1105kd), a jump from its top lifts a body's feet 1.34 m, and the ground rule steps a body in the air onto a floor
// within a step (0.65 m) over its feet: 4.86 m, so onto the end's 4.50 m, from there on over its 4.67 and 4.70 m, and off its east side into the
// corner behind the wall — low things 0.66 to 0.99 m high there, walls 4.5 m and more all round, outside the map (measured on the sim's own tick:
// from three places on the crate's top a jump held east ends behind the wall, feet 0.77 m, and no jump brings the body back).
// The end's three cells are walls now: their lids go and their topBuffer goes (a box without one holds a body until its feet are 0.39 m over its
// top — 4.89 m and more here, where a jump from the crate reaches 4.21 m). Their plans and heights stay as they are, so a shot meets what it met.
// The wall's long part keeps its lids at 5.00 m: no jump from the crates reaches them (4.86 m), and the way onto them was over the end.
// Each cell is found by what it is (its plan and its top; a run on the output finds it a wall already and leaves it). The file's other text is kept
// byte for byte: a cell's topBuffer is cut out of its own text, the three lids out of the floors' list. The route grid file is built again after it.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!inF || !outF) throw new Error('usage: dust_wall_end.mjs <in dust_data.json> <out dust_data.json>');
const text = fs.readFileSync(inF, 'utf8');
const iO = text.indexOf('"obstacles":['), iS = text.indexOf('],"surfaces":['); if (iO !== 1 || iS < 0 || !text.endsWith(']}')) throw new Error('layout not as expected');
const midS = '],"surfaces":[', bodyO = text.slice(iO + 13, iS), bodyS = text.slice(iS + midS.length, text.length - 2);
const objs = (body) => { const out = []; let d = 0, s = -1; for (let i = 0; i < body.length; i += 1) { const c = body[i]; if (c === '{') { if (d === 0) s = i; d += 1; } else if (c === '}') { d -= 1; if (d === 0) out.push(body.slice(s, i + 1)); } } return out; };
const oT = objs(bodyO), sT = objs(bodyS); if (text.slice(0, iO + 13) + oT.join(',') + midS + sT.join(',') + ']}' !== text) throw new Error('the text does not rebuild from its objects');
const O = oT.map((t) => JSON.parse(t)), S = sT.map((t) => JSON.parse(t));
// the end's cells: arena units (4 a metre; x = (model x - 49.8) * 4, z = (model z + 32) * 4), each with its top
const CELLS = [
  { minX: 98.4, maxX: 99.4, minZ: 15.4, maxZ: 19.28, top: 18 },       // model x 74.40..74.65  z -28.15..-27.18  4.50 m
  { minX: 99.4, maxX: 100.4, minZ: 11.4, maxZ: 18.4, top: 18.66 },    // model x 74.65..74.90  z -29.15..-27.40  4.67 m
  { minX: 100.4, maxX: 101.4, minZ: 10.4, maxZ: 19.4, top: 18.8 },    // model x 74.90..75.15  z -29.40..-27.15  4.70 m
];
const near = (a, b) => Math.abs(a - b) < 0.006;
const M = (e) => `model x ${(e.minX / 4 + 49.8).toFixed(2)}..${(e.maxX / 4 + 49.8).toFixed(2)} z ${(e.minZ / 4 - 32).toFixed(2)}..${(e.maxZ / 4 - 32).toFixed(2)}`;
const plan = (e, c) => near(e.minX, c.minX) && near(e.maxX, c.maxX) && near(e.minZ, c.minZ) && near(e.maxZ, c.maxZ);
let walls = 0, there = 0; const dropS = new Set();
for (const c of CELLS) {
  const hit = O.map((o, i) => i).filter((i) => plan(O[i], c) && O[i].minY === 0 && near(O[i].maxY, c.top));
  if (hit.length !== 1) throw new Error(`the cell ${M(c)}: ${hit.length} boxes match`);
  const i = hit[0];
  if (O[i].topBuffer == null) there += 1;
  else { const t = oT[i].replace(/,\s*"topBuffer":\s*-?[\d.eE+-]+/, ''); const o = JSON.parse(t); if (o.topBuffer != null || Object.keys(o).length !== Object.keys(O[i]).length - 1) throw new Error(`the cell ${M(c)}: its topBuffer is not cut out of its text`);
    oT[i] = t; O[i] = o; walls += 1; console.log(`${M(c)}, ${(c.top / 4).toFixed(2)} m: a wall now`); }
  const lids = S.map((s, k) => k).filter((k) => S[k].type === 'flat' && S[k].lid && plan(S[k], c) && near(S[k].top, c.top));
  if (lids.length > 1) throw new Error(`the cell ${M(c)}: ${lids.length} lids match`);
  for (const k of lids) dropS.add(k);
}
const out = text.slice(0, iO + 13) + oT.join(',') + midS + sT.filter((_, k) => !dropS.has(k)).join(',') + ']}'; JSON.parse(out); fs.writeFileSync(outF, out);
console.log(`${walls} cells made walls, ${there} walls already, ${dropS.size} lids out: ${O.length} boxes, ${S.length - dropS.size} floors`);
