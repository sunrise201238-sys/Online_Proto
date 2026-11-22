// dust_cube_piles.mjs <in dust_data.json> <out dust_data.json> — DUST, THE TWO PILES OF STONE BLOCKS ON PALLETS (b1105ka; user 2026-11-22, with the
// collision view's marks where they stood at model x 54.11, z 8.50 and x 45.65, z 22.63: "Replace the cboxes of these two cube clutches to one simple
// cube cbox for each."). The model has two of them, each a pallet with a dozen blocks, about two metres square and standing square to the map: one by
// the blue container at the tunnel's mouth, one under the cafe's window by the wooden crates. The reading had made of each a heap of quarter-metre
// cells — low boxes and lids at 0.75 to 0.90 m, little slopes off the pallet's edges — and, standing in among them, columns from the ground to 8.5 to
// 11 m: the timber deck, the ledge and the awnings' frames high over the piles, read down to the ground through the blocks. The model has nothing
// between a pile's top and 7.3 m (the cafe's) or 9.9 m (the container's); a body or a shot met those columns as walls in the air over the blocks.
//   the pile by the container   model x 52.37..54.41, z 5.37..7.30, its top 0.90 m   (21 boxes, 14 floors and 14 slopes out at b1105jz's data)
//   the pile under the window   model x 41.33..43.63, z 18.72..21.08, its top 0.77 m  (28 boxes, 11 floors and 2 slopes out)
// Each is now one box of the blocks' own measure, read off the model's faces (Object_9; the pallet under them, Object_15, shows 2 to 8 cm past
// them on two sides, low, where no body's centre comes) — standing from 0.75 m under the street's zero (the ground here lies 0.2 to 0.7 m under it) to the highest block's top, with the
// reading's topBuffer 0.8 and a lid: a flat floor on its top, 0.08 units wider each side, `lid` 1, as data_boxes.mjs makes them. A body stands on it.
// The first pile's south face is the reading's own, z 7.30, 2 cm inside the blocks' outermost corner (7.32): at 7.32 a body no longer fits at the
// centres of the two cells south of it (by 7 mm), the route grid stands those nodes a quarter cell aside, and on the sloping ground there a node
// stood aside keeps its centre's height and is joined to its neighbours by links, not by a walk (measured: four walk edges became links).
// What goes is what data_boxes.mjs would take with no growth: a box, floor or slope whose plan lies half or more inside the new box and whose top
// (a slope's highest corner) lies between 0.5 m under the street's zero and the band's top (11.5 m and 9.5 m: over the columns, under nothing else
// that stands there), and anything wholly inside the box and no higher than its top. The walls stay: the container's side and the cafe's wall lie
// less than a third inside. The cell at the crates' corner by the second pile (1.70 m) stays with the crates. And the reading's skirts go with
// the slopes they stood by: a box the shots pass, no higher than the pile's top, wholly within a quarter metre of the new box (one, 10 by 16 cm to
// 0.5 m, at the first pile's north-east corner, with nothing of the model in it).
// This tool and not data_boxes.mjs itself: that one writes the whole file again, and Dust's file has 153 numbers spelled as another writer left them
// (16.0, -0.0, 1e-05). Here the file's other text is kept byte for byte: the entries are cut out of the one line and the four new ones go at the ends
// of their lists. A run on its own output changes nothing. The route grid file is built again after it (navgrid_build.mjs).
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!inF || !outF) throw new Error('usage: dust_cube_piles.mjs <in dust_data.json> <out dust_data.json>');
const text = fs.readFileSync(inF, 'utf8');
const iO = text.indexOf('"obstacles":['), iS = text.indexOf('],"surfaces":['); if (iO !== 1 || iS < 0 || !text.endsWith(']}')) throw new Error('layout not as expected');
const midS = '],"surfaces":[', bodyO = text.slice(iO + 13, iS), bodyS = text.slice(iS + midS.length, text.length - 2);
const objs = (body) => { const out = []; let d = 0, s = -1; for (let i = 0; i < body.length; i += 1) { const c = body[i]; if (c === '{') { if (d === 0) s = i; d += 1; } else if (c === '}') { d -= 1; if (d === 0) out.push(body.slice(s, i + 1)); } } return out; };
const oT = objs(bodyO), sT = objs(bodyS); if (text.slice(0, iO + 13) + oT.join(',') + midS + sT.join(',') + ']}' !== text) throw new Error('the text does not rebuild from its objects');
const O = oT.map((t) => JSON.parse(t)), S = sT.map((t) => JSON.parse(t));
const SCALE = 4, CX = 49.8, CZ = -32;   // (arena = (model - c) * scale: the client's GLB_MAPS line for Dust)
const du = (v) => Math.round(v * 100) / 100;
// the piles: model metres, heights over the street's zero; h1 the band's top
const PILES = [
  { name: 'the pile by the container', x0: 52.37, x1: 54.41, z0: 5.37, z1: 7.30, top: 0.90, base: -0.75, h0: -0.5, h1: 11.5 },
  { name: 'the pile under the window', x0: 41.33, x1: 43.63, z0: 18.72, z1: 21.08, top: 0.77, base: -0.75, h0: -0.5, h1: 9.5 },
];
const topOf = (e) => (e.type === 'plane' ? Math.max(e.y0, e.y0 + e.gx * (e.maxX - e.minX), e.y0 + e.gz * (e.maxZ - e.minZ), e.y0 + e.gx * (e.maxX - e.minX) + e.gz * (e.maxZ - e.minZ))
  : e.type === 'flat' ? e.top : e.type ? (e.maxTop ?? e.top) : e.maxY);
const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => (typeof a[k] === 'number' ? Math.abs(a[k] - b[k]) < 1e-9 : a[k] === b[k])); };
const M = (e) => `x ${(e.minX / SCALE + CX).toFixed(2)}..${(e.maxX / SCALE + CX).toFixed(2)} z ${(e.minZ / SCALE + CZ).toFixed(2)}..${(e.maxZ / SCALE + CZ).toFixed(2)}`;
const dropO = new Set(), dropS = new Set(), addO = [], addS = [];
for (const p of PILES) {
  const box = { minX: du((p.x0 - CX) * SCALE), maxX: du((p.x1 - CX) * SCALE), minZ: du((p.z0 - CZ) * SCALE), maxZ: du((p.z1 - CZ) * SCALE), minY: du(p.base * SCALE), maxY: du(p.top * SCALE), topBuffer: 0.8 };
  const lid = { minX: du(box.minX - 0.08), maxX: du(box.maxX + 0.08), minZ: du(box.minZ - 0.08), maxZ: du(box.maxZ + 0.08), maxTop: box.maxY, type: 'flat', top: box.maxY, lid: 1 };
  const h0 = p.h0 * SCALE, h1 = p.h1 * SCALE;
  // the share of a plan inside the box, and the plan wholly in it and no higher than its top
  const share = (e) => { const w = e.maxX - e.minX, d = e.maxZ - e.minZ; if (!(w > 0 && d > 0)) return 0;
    return (Math.max(0, Math.min(e.maxX, box.maxX) - Math.max(e.minX, box.minX)) * Math.max(0, Math.min(e.maxZ, box.maxZ) - Math.max(e.minZ, box.minZ))) / (w * d); };
  const hidden = (e) => e.minX >= box.minX && e.maxX <= box.maxX && e.minZ >= box.minZ && e.maxZ <= box.maxZ && topOf(e) <= box.maxY + 1e-6;
  const skirt = (e) => !e.type && e.noProjectile && e.maxY <= box.maxY + 1e-6 && e.minX >= box.minX - 1 && e.maxX <= box.maxX + 1 && e.minZ >= box.minZ - 1 && e.maxZ <= box.maxZ + 1;
  const goes = (e) => { const t = topOf(e); return (t >= h0 && t <= h1 && share(e) >= 0.5) || hidden(e) || skirt(e); };
  // (nothing far from the pile may go, whatever the data holds: a plan that reaches more than 0.4 m out of the box stops the run)
  const near = (e) => e.minX >= box.minX - 1.6 && e.maxX <= box.maxX + 1.6 && e.minZ >= box.minZ - 1.6 && e.maxZ <= box.maxZ + 1.6;
  const tally = { box: 0, tall: 0, floor: 0, slope: 0 }; let hasBox = false, hasLid = false;
  O.forEach((e, i) => { if (same(e, box)) { hasBox = true; return; } if (!goes(e)) return; if (!near(e)) throw new Error(`${p.name}: a box far from it would go: ${M(e)}`); dropO.add(i); tally.box += 1; if (e.maxY > box.maxY + 4) tally.tall += 1; });
  S.forEach((e, i) => { if (same(e, lid)) { hasLid = true; return; } if (!goes(e)) return; if (!near(e)) throw new Error(`${p.name}: a floor far from it would go: ${M(e)}`); dropS.add(i); tally[e.type === 'plane' ? 'slope' : 'floor'] += 1; });
  if (!hasBox) addO.push(box); if (!hasLid) addS.push(lid);
  console.log(`${p.name}: out ${tally.box} boxes (${tally.tall} of them columns over a metre above its top), ${tally.floor} floors, ${tally.slope} slopes; ${hasBox ? 'its box there already' : 'in one box'} model ${M(box)}, ${p.base.toFixed(2)}..${p.top.toFixed(2)} m, ${hasLid ? 'its lid there already' : 'with its lid'}`);
}
const out = text.slice(0, iO + 13) + [...oT.filter((_, i) => !dropO.has(i)), ...addO.map((e) => JSON.stringify(e))].join(',') + midS + [...sT.filter((_, i) => !dropS.has(i)), ...addS.map((e) => JSON.stringify(e))].join(',') + ']}';
JSON.parse(out); fs.writeFileSync(outF, out);
console.log(`${O.length - dropO.size + addO.length} boxes, ${S.length - dropS.size + addS.length} floors`);
