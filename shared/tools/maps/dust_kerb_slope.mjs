// dust_kerb_slope.mjs <in dust_data.json> <out dust_data.json> — DUST, THE KERB BEFORE THE RAISED YARD (b1105jz; user 2026-11-22, standing at model
// x 61.88, z -42.11, feet 3.03 m, with the boxes #1876 and #1877 named by the collision view: "Add a little slope or smth at this gap so the units can
// walk up here instead of needing to jump."). The kerb between the street (3.03 m) and the yard north of it is two slabs the shots pass (noProjectile),
// model x 57.15..61.65 to 3.70 m and x 61.65..64.38 to 3.80 m, z -42.63..-42.40: 0.67 and 0.77 m over the street, where a body steps 0.65 m
// (SURFACE_STEP_HEIGHT, 2.6 units), so a body walking at it was held, 2 and 12 cm short, and went up by a jump. Two things are written:
//   THE SLOPE                        on the street along the kerb's whole length, 0.5 m deep (z -42.40..-41.90), from the street's height at its outer
//                                    edge to each slab's top at the kerb's face: two planes (floors), one a slab, added at the end of the floors
//   THE KERB'S TOP REACHES THE YARD  the two floors on the slabs' tops reach 2 cm further north, to where the yard's floors begin (at its code, below)
// Nothing else changes: the slabs, the street's floor under the slope and every box stay as they are, and the ground rule takes the highest floor
// within a step, so the slope is what a body there stands on. It is not drawn (the model has no slope here): a unit on it stands over the paving it is
// seen on, by up to the kerb's height at the kerb's face.
// Why this shape (measured on the sim at places along the kerb: a walk, a sprint, a dodge and a diagonal walk at each): the full slope 0.5 m deep
// takes all four up at every place; 0.37 m deep, a dodge was held at half the places; a low flat step let a body up but left the route grid's links
// here jumps. The lines the shots and the bots' sight use (muzzle, eye and the hit capsule's lowest, both ways between the street and the yard) are
// the same with and without it: they pass over the kerb's top, and the slope lies under that.
// In the route grid the eighteen links at the kerb's three rows of nodes become eighteen walk edges and nothing else differs (README: Dust).
// The file's other text is kept byte for byte (the two planes go at the end of the floors; the two floors on the slabs are written again in their
// places). A run on its own output changes nothing. The route grid file is built again after it (navgrid_build.mjs).
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!inF || !outF) throw new Error('usage: dust_kerb_slope.mjs <in dust_data.json> <out dust_data.json>');
const text = fs.readFileSync(inF, 'utf8');
const iO = text.indexOf('"obstacles":['), iS = text.indexOf('],"surfaces":['); if (iO !== 1 || iS < 0 || !text.endsWith(']}')) throw new Error('layout not as expected');
const midS = '],"surfaces":[', bodyO = text.slice(iO + 13, iS), bodyS = text.slice(iS + midS.length, text.length - 2);
const objs = (body) => { const out = []; let d = 0, s = -1; for (let i = 0; i < body.length; i += 1) { const c = body[i]; if (c === '{') { if (d === 0) s = i; d += 1; } else if (c === '}') { d -= 1; if (d === 0) out.push(body.slice(s, i + 1)); } } return out; };
const oT = objs(bodyO), sT = objs(bodyS); if (text.slice(0, iO + 13) + oT.join(',') + midS + sT.join(',') + ']}' !== text) throw new Error('the text does not rebuild from its objects');
const O = oT.map((t) => JSON.parse(t)), S = sT.map((t) => JSON.parse(t));
const DEPTH = 2;       // how far the slope reaches into the street, arena units (4 a metre): 0.5 m
const FACE = -41.6;    // the kerb's street face (model z -42.40)
const near = (a, b) => Math.abs(a - b) < 0.011;
const find = (name, list, f) => { const hit = list.filter(f); if (hit.length !== 1) throw new Error(`${name}: ${hit.length} match`); return hit[0]; };
// the kerb's two slabs and the street before them, by what they are (not by index: a run on the output finds them too)
const slab = (name, minX, maxX, top) => find(name, O, (o) => o.noProjectile && near(o.minX, minX) && near(o.maxX, maxX) && near(o.minZ, -42.51) && near(o.maxZ, FACE) && o.minY === 0 && near(o.maxY, top));
const slabs = [slab('the west slab (#1876)', 29.4, 47.4, 14.8), slab('the east slab (#1877)', 47.4, 58.33, 15.2)];
const street = find('the street before the kerb', S, (s) => s.type === 'flat' && near(s.top, 12.12) && s.minX <= slabs[0].minX + 1e-9 && s.maxX >= slabs[1].maxX - 1e-9 && s.minZ <= FACE + 1e-9 && s.maxZ >= FACE + DEPTH - 1e-9);
const r4 = (v) => +v.toFixed(4);
const planes = slabs.map((k) => ({ minX: k.minX, maxX: k.maxX, minZ: FACE, maxZ: r4(FACE + DEPTH), maxTop: k.maxY, type: 'plane', y0: k.maxY, gx: 0, gz: r4((street.top - k.maxY) / DEPTH) }));
const same = (a, b) => a.type === b.type && ['minX', 'maxX', 'minZ', 'maxZ', 'y0', 'gx', 'gz'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-9);
const over = (a, b) => a.maxX > b.minX + 0.01 && a.minX < b.maxX - 0.01 && a.maxZ > b.minZ + 0.01 && a.minZ < b.maxZ - 0.01;
const add = [];
for (const q of planes) {
  if (S.some((s) => same(s, q))) continue;   // (there already: a run on the output)
  // nothing but the street lies on the strip the slope takes: no other floor, no box standing over the street
  const floors = S.filter((s) => s !== street && over(s, q) && !planes.some((p) => same(s, p))); if (floors.length) throw new Error('another floor lies on the strip: ' + JSON.stringify(floors[0]));
  const boxes = O.filter((o) => over(o, q) && o.maxY > street.top + 0.01); if (boxes.length) throw new Error('a box stands on the strip: ' + JSON.stringify(boxes[0]));
  const low = q.y0 + q.gz * (q.maxZ - q.minZ); if (Math.abs(low - street.top) > 0.01) throw new Error('the slope does not come down to the street: ' + low);
  add.push(q);
}
// THE KERB'S TOP REACHES THE YARD. The floors on the two slabs' tops end at the slabs' backs, z -42.51 (arena), and the yard's floors begin at -42.6:
// a slit of 0.09 units (2 cm) with no floor in it, the kerb's whole length. A body crossing it is in the air for a few ticks and nothing more, but
// the route grid's walk test stands in it (walkFloorTo's sample a unit north of the kerb's row of nodes), so the kerb's top and the yard were joined
// by a link alone, never by a walk. A link within one walk component needs a jump's rise (JUMP_RISE_MIN) — and the slope makes the kerb's top part of
// the street's component, which the yard is too (round by the east end). So with the slope alone that link was no longer built: the kerb's row of
// nodes was a dead end, and a bot sent from the street into the yard went round by the east end (measured: 27 to 38 units to get over the kerb's line
// where it had jumped straight over in 14 to 16). The two floors reach the yard's floors instead (their north edge from -42.51 to -42.6), and the walk
// is unbroken: street, slope, kerb, yard.
const BACK = -42.51, YARD = -42.6;
const hAt = (s, x, z) => (s.type === 'plane' ? s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : s.top);
let lids = 0, lidsThere = 0;
for (const k of slabs) {
  const hit = S.map((s, i) => i).filter((i) => { const s = S[i]; return s.type === 'flat' && near(s.top, k.maxY) && near(s.minX, k.minX) && near(s.maxX, k.maxX) && near(s.maxZ, FACE) && (near(s.minZ, BACK) || near(s.minZ, YARD)); });
  if (hit.length !== 1) throw new Error(`the floor on a slab's top: ${hit.length} match`);
  const i = hit[0], s = S[i];
  if (near(s.minZ, YARD)) { lidsThere += 1; continue; }   // (there already: a run on the output)
  if (JSON.stringify(s) !== sT[i]) throw new Error('the floor on a slab does not come back the same from a read and a write');
  // the yard's floors do begin at YARD all along the slab, within a step of its top, and no box stands in the slit over the top
  for (let x = k.minX + 0.5; x < k.maxX; x += 0.5) if (!S.some((t) => t !== s && x >= t.minX && x <= t.maxX && YARD >= t.minZ && YARD <= t.maxZ && Math.abs(hAt(t, x, YARD) - s.top) <= 2.6)) throw new Error(`no floor of the yard behind the kerb at x ${x}`);
  const inSlit = O.filter((o) => o.maxX > k.minX + 0.01 && o.minX < k.maxX - 0.01 && o.maxZ > YARD + 1e-6 && o.minZ < BACK - 1e-6 && o.maxY > s.top + 0.01); if (inSlit.length) throw new Error('a box stands in the slit: ' + JSON.stringify(inSlit[0]));
  sT[i] = JSON.stringify({ ...s, minZ: YARD }); lids += 1;
}
const out = text.slice(0, iS + midS.length) + [...sT, ...add.map((q) => JSON.stringify(q))].join(',') + ']}'; JSON.parse(out);
fs.writeFileSync(outF, out);
const CX = 49.8, CZ = -32, m = (v) => (v / 4).toFixed(2);
for (const q of add) console.log(`slope added: model x ${(q.minX / 4 + CX).toFixed(2)}..${(q.maxX / 4 + CX).toFixed(2)} z ${(q.minZ / 4 + CZ).toFixed(2)}..${(q.maxZ / 4 + CZ).toFixed(2)}, from ${m(street.top)} m at its outer edge to ${m(q.y0)} m at the kerb's face  ${JSON.stringify(q)}`);
console.log(`${add.length} floors added, ${planes.length - add.length} there already; ${lids} floors on the slabs' tops brought to the yard's edge (z ${BACK} to ${YARD}), ${lidsThere} there already: ${O.length} boxes, ${S.length + add.length} floors`);
