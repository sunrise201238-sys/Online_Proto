// dust_door_fix.mjs <in dust_data.json> <out dust_data.json> — DUST, THE BUILDING WITH THE DECORATIVE DOOR (b1105il; user 2026-11-15, at model x 48.28,
// z -19.19, feet -1.17 m: "This is not an enterable area, the door at ... x 47.80 z -19.69 ... is merely a decoration."). The building's street face (the
// model's plaster wall, z -19.93, x 41.30..53.46, down to -2.93 m) had boxes over the door alone (from 1.5 and 2.0 m up) and east of it; the building's
// body behind (z -19.34 / -19.15 / -18.90 on) stands from the street's zero, and the street here slopes from -2.8 m at the west end up to -0.1 m at the
// east, so a body on it has its centre more than 2 units under those bottoms and no box holds it (boxHoldsAt): it walked in under the door's lintel and
// along the hollow between the face and the body, and jumping or sprinting it flew on under the whole building. This writes the face as a wall from
// under the street and fills the hollow behind it:
//   K1  the face west of the door, x 41.40..44.65, back to the body's own face, to the body's 9.5 m
//   K2  the face west of the door, x 44.65..46.15, back to the body, to its 18 m
//   K3, K4  the door, under its two lintel boxes (to 1.5 and 2.0 m), on the lintel's own line
//   K5  the 25 cm slit between the lintel and the wall east of it, to 18 m
//   K6  behind the door, the hollow from the lintel's line back to the body, to 18 m
//   K7, K8  the corridor behind the wall east of the door (1 m deep, x 48.655..53.15), to that wall's own tops (18 m; 8 m with its top buffer)
// and takes out the floors that lay in there (the door sill's seven steep pieces and five strips of street), two strips of street cut at the face.
// The file's other text is kept byte for byte (objects spliced in and out of the one line). A run on its own output changes nothing.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); const text = fs.readFileSync(inF, 'utf8');
const iO = text.indexOf('"obstacles":['), iS = text.indexOf('],"surfaces":['); if (iO !== 1 || iS < 0 || !text.endsWith(']}')) throw new Error('layout not as expected');
const headO = text.slice(0, iO + 13), bodyO = text.slice(iO + 13, iS), midS = '],"surfaces":[', bodyS = text.slice(iS + midS.length, text.length - 2);
const objs = (body) => { const out = []; let d = 0, s = -1; for (let i = 0; i < body.length; i += 1) { const c = body[i]; if (c === '{') { if (d === 0) s = i; d += 1; } else if (c === '}') { d -= 1; if (d === 0) out.push(body.slice(s, i + 1)); } } return out; };
const oT = objs(bodyO), sT = objs(bodyS); if (headO + oT.join(',') + midS + sT.join(',') + ']}' !== text) throw new Error('the text does not rebuild from its objects');
const O = oT.map((t) => JSON.parse(t)), S = sT.map((t) => JSON.parse(t));
const CX = 49.8, CZ = -32, ax = (m) => +((m - CX) * 4).toFixed(3), az = (m) => +((m - CZ) * 4).toFixed(3);
const FACE = az(-19.90), LINE = az(-19.65), X0 = ax(41.40), X1 = ax(53.15), BOTTOM = -12;
// the neighbours, by what they are (not by index: a run on the output finds them too)
const find = (name, f) => { const hit = O.filter(f); if (hit.length !== 1) throw new Error(`${name}: ${hit.length} boxes match`); return hit[0]; };
const near = (a, b) => Math.abs(a - b) < 0.011;
const body408 = find('#408', (o) => near(o.maxX, ax(44.65)) && near(o.minZ, az(-19.343)) && o.minY === 0 && near(o.maxY, 38));
const body409 = find('#409', (o) => near(o.minX, ax(44.65)) && near(o.maxX, ax(48.65)) && near(o.minZ, az(-19.15)) && o.minY === 0 && near(o.maxY, 72));
const body410 = find('#410', (o) => near(o.minX, ax(48.65)) && near(o.maxX, ax(52.40)) && near(o.minZ, az(-18.90)) && o.minY === 0 && near(o.maxY, 72));
const wall403 = find('#403', (o) => near(o.minX, ax(48.655)) && near(o.maxX, ax(50.40)) && near(o.maxZ, FACE) && o.minY === 0 && near(o.maxY, 72));
const wall404 = find('#404', (o) => near(o.minX, ax(50.40)) && near(o.maxX, ax(53.15)) && near(o.maxZ, FACE) && o.minY === 0 && near(o.maxY, 32));
const end401 = find('#401', (o) => near(o.minX, ax(53.15)) && near(o.maxX, ax(53.40)) && o.minY === 0 && near(o.maxY, 32) && o.minZ < FACE && o.maxZ > az(-18.9));
const lin1605 = find('#1605', (o) => near(o.minX, ax(46.15)) && near(o.maxX, ax(46.65)) && near(o.minZ, FACE) && near(o.maxZ, LINE) && near(o.minY, 6));
const lin1606 = find('#1606', (o) => near(o.minX, ax(46.65)) && near(o.maxX, ax(48.15)) && near(o.minZ, FACE) && near(o.maxZ, LINE) && near(o.minY, 8));
const lin1607 = find('#1607', (o) => near(o.minX, ax(48.15)) && near(o.maxX, ax(48.40)) && near(o.minZ, FACE) && near(o.maxZ, LINE) && near(o.minY, 8));
const box = (minX, maxX, minZ, maxZ, minY, maxY, extra = {}) => ({ minX, maxX, minZ, maxZ, minY, maxY, ...extra });
const K = [
  box(X0, body408.maxX, FACE, body408.minZ, BOTTOM, body408.maxY),                                       // K1
  box(body409.minX, lin1605.minX, FACE, body409.minZ, BOTTOM, body409.maxY),                             // K2
  box(lin1605.minX, lin1605.maxX, FACE, LINE, BOTTOM, lin1605.minY),                                     // K3
  box(lin1606.minX, lin1607.maxX, FACE, LINE, BOTTOM, lin1606.minY),                                     // K4
  box(lin1607.maxX, wall403.minX, FACE, LINE, BOTTOM, lin1607.maxY),                                     // K5
  box(lin1605.minX, wall403.minX, LINE, body409.minZ, BOTTOM, body409.maxY),                             // K6
  box(wall403.minX, wall403.maxX, FACE, body410.minZ, BOTTOM, wall403.maxY),                             // K7
  box(wall404.minX, end401.minX, FACE, body410.minZ, BOTTOM, wall404.maxY, { topBuffer: wall404.topBuffer }),   // K8
];
const same = (a, b) => ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);
const addT = K.filter((k) => !O.some((o) => same(o, k))).map((k) => JSON.stringify(k));
// the floors in there: wholly at or behind the face → out; reaching it from the street → cut at the face (a plane keeps its y0, gx, gz: its heights are as they were)
const inX = (s) => s.maxX > X0 + 1e-9 && s.minX < X1 - 1e-9; const backZ = az(-18.90);
const outS = [], cutS = []; const sOut = [];
S.forEach((s, i) => { const t = sT[i];
  if (!inX(s) || s.maxZ <= FACE + 1e-9 || s.minZ >= backZ - 1e-9 || s.maxTop > 0.5) { sOut.push(t); return; }     // (not in the strip, or a thing's top above the street: none is)
  if (s.minZ >= FACE - 1e-9) { outS.push(i); return; }
  if (s.type !== 'plane') throw new Error('a flat floor across the face: s' + i);
  const c = { ...s, maxZ: FACE }; c.maxTop = +Math.max(...[[c.minX, c.minZ], [c.maxX, c.minZ], [c.minX, c.maxZ], [c.maxX, c.maxZ]].map(([x, z]) => s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ))).toFixed(3);
  cutS.push(i); sOut.push(JSON.stringify(c)); });
const out = headO + [...oT, ...addT].join(',') + midS + sOut.join(',') + ']}'; JSON.parse(out);
const M = (o) => `x ${(o.minX / 4 + CX).toFixed(3)}..${(o.maxX / 4 + CX).toFixed(3)} z ${(o.minZ / 4 + CZ).toFixed(3)}..${(o.maxZ / 4 + CZ).toFixed(3)}`;
K.forEach((k, i) => console.log(`K${i + 1} ${M(k)} h ${(k.minY / 4).toFixed(2)}..${(k.maxY / 4).toFixed(2)} m${k.topBuffer ? ' topBuffer ' + k.topBuffer : ''}${addT.includes(JSON.stringify(k)) ? '' : '  (already there)'}`));
console.log('floors out:', outS.map((i) => `s${i} ${M(S[i])}`).join(' | ') || 'none');
console.log('floors cut at the face:', cutS.map((i) => `s${i} ${M(S[i])}`).join(' | ') || 'none');
console.log(`boxes ${O.length} -> ${O.length + addT.length} | surfaces ${S.length} -> ${sOut.length} | bytes ${text.length} -> ${out.length}`);
if (outF) { fs.writeFileSync(outF, out); console.log('written', outF); }
