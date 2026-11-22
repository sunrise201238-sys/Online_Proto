// dust_crates.mjs <in dust_data.json> <out dust_data.json> — DUST, ITS CRATES, BOXES, BASKETS AND BARRELS AS SIMPLE BOXES (b1105kc the first two
// places, b1105kd nine more, b1105kf the baskets and the barrels; user 2026-11-22, with the collision view's marks on five columns that stood up out of them — #1171, #1168 and #1181 at the crates by
// the cafe, #589 and #578 on the stack in the east yard: "These are some more un-needed high pillar cboxes. Remove or reshape them in PT.", then:
// "make those crates, boxes objects' cboxes significantly simplified, like what we just did previously; simple cubes cboxes will do, no need to be
// pixel accurate.", and, asked whether the map's other crates and boxes should go the same way: "okay"; then, with the collision view's marks on the
// baskets in the raised yard's corner and on two columns over the barrels in the passage: "Simplify these two clusters as well").
// The reading had made of the first eleven places 194 boxes and 90 floors, a quarter-metre cell each or a few, and among them 23 columns from a
// crate's top to a thing high overhead (an awning's frame, roof beams, a balcony, a gallery's floor: 5 to 12 m up) with nothing of the model
// between. Each thing is now one box of its own measure, 27 in all, and the columns are gone with the cells they stood among. What stood overhead
// keeps no box: those columns were all the data had of it, and the same balcony or gallery has no box anywhere else along its length. The baskets
// and the barrels (two places more) follow the same rules, their counts on the tool's own lines.
//   place (model x, z of its middle)                 boxes   what they are
//   the crates by the cafe (44.0, 17.1)                3     two crates one on the other; the crate beside them; the crate lying across both
//   the stack in the east yard (68.1, -10.4)           3     the big crate on its pallet; the cardboard boxes on it; the crate beside
//   the big crate under the balcony (40.4, 0.0)        1     the crate
//   the raised yard's corner (45.7, -42.3)             6     cardboard boxes two high; crates two high at the walls and one on them; two crates on
//                                                            end in a row and one beside; the two crates lying on the row
//   south of the container (52.0, 13.4)                1     four green crates, two on two crosswise: one box
//   under the raised yard's wall (54.6, -29.4)         4     the west crate; the tall crate at the walls; the low crate; the crate lying askew on it
//   the crate with the small boxes (59.7, 12.0)        2     the crate; the eight small boxes on it as one
//   the passage's east mouth (65.2, -1.1)              3     the long crate by the wall; the square crate; the cardboard boxes on it
//   by the concrete wall (73.2, -9.7)                  1     four green crates, two on two crosswise: one box
//   by the plaster wall (73.3, -30.1)                  2     the long crate; the big crate on its pallet
//   the south-east corner (79.6, 12.5)                 1     the crate
//   the baskets in the raised yard (36.1, -41.0)       4     three big wicker baskets along the wall and one before them, a box each
//   the barrels in the passage (53.0, -2.2)            1     two steel drums side by side: one box; the five columns over them cut to hang, the plug under them drawn back
// (Each box's own numbers stand in PLACES below. Left as they were, each one box or one row of strips already: the crate at (63.2, -34.0), the
// crate at (66.2, -30.1), the two pairs at (57.5, -33.3) and (69.7, -44.6). Not crates, and left: the sacks, the container, the doorsteps, the
// poles' bases, the air conditioners on the walls; of barrels, the two in the passage alone are done.)
// THE RULES
//   its measure    a thing square to the map: its own box in the model (Object_15's faces). A thing turned on the map: the upright rectangle that
//                  overlaps its outline best, which is its own sides' lengths about its own middle, so as much of the box lies outside the thing at
//                  two corners as of the thing outside the box at the other two (up to 0.3 m). A top that slants (the crates on the sloping ground
//                  under the raised yard's wall, by the plaster wall; the one lying askew): the mean of its top face.
//   neighbours     two boxes that touch share a face, and a box that stands within a body's width of a wall or of another box where the reading
//                  had the gap filled is brought to it (the user's own fills of 2026-10-24 stay: arena.js, dust by hand): no slit a shot could
//                  pass, a floor could break at, or a body could come down into.
//   one on another a thing that lies on another stands from the lower one's top (its box hangs: a body on the ground passes under what overhangs,
//                  as under the crate itself; boxHoldsAt, physics.js), the others from under the ground.
//   lids           each box has the reading's topBuffer 0.8, and a lid — a flat floor on its top, 0.08 units wider each side, `lid` 1, as
//                  data_boxes.mjs makes them — where the reading had a floor on that thing's top: a body stands on it as before. Six boxes keep none
//                  (`lid: false`), as their cells had none: in the raised yard's corner the cardboard boxes, the crates two high, the crate on them
//                  and the two lying on the row (no jump reaches their tops, on the sim's own step and jump, and a floor would be a new place to
//                  stand should one ever); the crate under the small boxes and the square crate under the cardboard boxes (what lies on them
//                  leaves a body no room). One box gets a floor it could not have: the crate in the south-east corner, whose top was a 12.5 m
//                  column, and which a jump from the yard reaches (1.62 m up).
//   what goes      a box, floor or slope whose plan lies half or more inside the things' own boxes in the model grown by 0.3 m (the reading's cells
//                  stand up to that far out of them; a gap the reading had filled is named with them) and whose top (a slope's highest corner) lies
//                  in the place's band: over the ground, its low slopes and the solid under a raised yard, up to over the columns. What the rule
//                  would take and must not is named in `stays`: a wall's own cells behind the crates, the user's fill at the passage's mouth, the
//                  concrete wall's foot. Checked against the model after each run (every box that went, asked for a face of the building in its
//                  plan: four have one, three of them the concrete wall's foot inside the new box, one the gallery over the corner crate).
//   the ground     under three places one flat floor at the ground's lowest height about (by the cafe -0.67 m, in the east yard 0.28 m, by the
//                  concrete wall 0.35 m), over the things' own boxes grown by 0.3 m: the reading left no floor under its cells, and where the new
//                  box stands back from where cells stood a body's centre comes; a point with no floor is the street's zero (groundHeightAt). The
//                  ground's own floors are as high or higher and a body stands on the highest: nothing changes where they lie. The other places
//                  need none (looked for on the sim: every point a body's centre can come to about the new boxes has a floor, or lies at the
//                  street's zero where the ground is).
//   what hangs     over the barrels the passage's vault springs from the wall: the model's lowest face there rises from 3.6 m at the wall to
//                  4.2 m over the barrels' outer edge (over the five cells below 3.73 to 4.10 m each, 3.91 m by area). The five columns the
//                  reading stood from the ground to it through the barrels are cut from below, not taken (`hang`): their feet from the ground
//                  to 3.90 m, their plans and tops as they were. Not to the 3.50 m the vault's own boxes beside the barrels hang from: a box
//                  holds a body from half a metre under its foot (boxHoldsAt), and a jump from the barrels' top (feet to 2.63 m, the body's
//                  centre to 3.24 m) rose into cells at 3.50 m and was put out at their faces, up to 0.86 m in one tick (measured on the
//                  sim's tick: of nine places on the top, a jump straight up ended on the ground from five). From 3.90 m the jump is clear
//                  of them, as it is of the model's vault. Round things (the baskets, the barrels) take the upright
//                  rectangle that overlaps their outline best, as a thing turned on the map does.
//   the plug       b1105fb put flat boxes from the street's zero to 0.5 units, with no top, where a box outside play had held a body on bare
//                  street. One of them (model x 41.65..53.30, z -3.40..-1.18: the building west of the passage) reached in under the barrels'
//                  old boxes, whose outline was its own. Past the new box it would show 0.20 m at the north end (z -3.40 to -3.20) and
//                  0.12 m at the south (z -1.30 to -1.18), 0.30 m over the passage's floor, and hold a body there (measured: a walk at
//                  the box's ends stopped 0.49 and 0.41 m out, 0.29 m at its east face). Its east end is drawn back to the face of the
//                  wall it lies in, x 52.65 (`trim`): the passage's own floor lies under all of what that leaves bare, and the run stops
//                  if it does not.
//   on the barrels the top is a floor now (the reading had none: its columns stood in it). South of it the passage's arch crosses, 3.3 to
//                  3.8 m up, with boxes of its own from 3.50 m, and the vault's strip east of it hangs from 3.50 m too. A jump straight up
//                  from the top (248 places, every 6 cm) is moved by those in one tick by nothing at 76 places and by up to 0.29 m at the
//                  rest, and comes down off the top at 2 (its north-east corner); a jump held south rises into the arch's boxes and is put
//                  out at their faces, up to 0.74 m in one tick, onto the passage's floor. A walk off the top leaves it every way but
//                  into the wall. No place there holds a body (the flood: no pit).
// This tool and not data_boxes.mjs itself: that one writes the whole file again, and Dust's file has 153 numbers spelled as another writer left them
// (16.0, -0.0, 1e-05). Here the file's other text is kept byte for byte: the entries are cut out of the one line and the new ones go at the ends of
// their lists. A run on its own output changes nothing. The route grid file is built again after it (navgrid_build.mjs). env LIST=1 lists what goes.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!inF || !outF) throw new Error('usage: dust_crates.mjs <in dust_data.json> <out dust_data.json>');
const text = fs.readFileSync(inF, 'utf8');
const iO = text.indexOf('"obstacles":['), iS = text.indexOf('],"surfaces":['); if (iO !== 1 || iS < 0 || !text.endsWith(']}')) throw new Error('layout not as expected');
const midS = '],"surfaces":[', bodyO = text.slice(iO + 13, iS), bodyS = text.slice(iS + midS.length, text.length - 2);
const objs = (body) => { const out = []; let d = 0, s = -1; for (let i = 0; i < body.length; i += 1) { const c = body[i]; if (c === '{') { if (d === 0) s = i; d += 1; } else if (c === '}') { d -= 1; if (d === 0) out.push(body.slice(s, i + 1)); } } return out; };
const oT = objs(bodyO), sT = objs(bodyS); if (text.slice(0, iO + 13) + oT.join(',') + midS + sT.join(',') + ']}' !== text) throw new Error('the text does not rebuild from its objects');
const O = oT.map((t) => JSON.parse(t)), S = sT.map((t) => JSON.parse(t));
const SCALE = 4, CX = 49.8, CZ = -32;   // (arena = (model - c) * scale: the client's GLB_MAPS line for Dust)
const du = (v) => Math.round(v * 100) / 100;
// the places: model metres, heights over the street's zero. `model`: the things' own boxes in the model (x0, x1, z0, z1); `boxes`: what stands for them
const PLACES = [
  { name: 'the crates by the cafe', grow: 0.3, h0: -0.3, h1: 9.5, ground: -0.67,
    model: [[42.77, 43.96, 15.54, 17.90], [42.99, 44.60, 16.11, 18.33], [43.97, 45.26, 17.41, 18.63]],
    boxes: [
      { what: 'two crates, one on the other', x0: 42.77, x1: 43.96, z0: 15.55, z1: 17.89, base: -0.75, top: 1.62 },
      { what: 'the crate beside them', x0: 43.96, x1: 45.21, z0: 17.46, z1: 18.58, base: -0.75, top: 1.64 },
      { what: 'the crate lying across both', x0: 43.25, x1: 44.34, z0: 16.26, z1: 18.18, base: 1.62, top: 2.58 },
    ] },
  { name: 'the stack in the east yard', grow: 0.3, h0: 0.6, h1: 10.5, ground: 0.28,
    model: [[66.87, 69.34, -11.08, -8.60], [67.12, 69.27, -11.14, -8.99], [67.07, 68.19, -12.35, -11.10]],
    boxes: [
      { what: 'the crate beside the big one', x0: 67.07, x1: 68.19, z0: -12.35, z1: -11.10, base: 0, top: 2.64 },
      { what: 'the big crate on its pallet', x0: 67.05, x1: 69.17, z0: -11.10, z1: -8.78, base: 0, top: 2.68 },
      { what: 'the cardboard boxes on it', x0: 67.28, x1: 69.11, z0: -10.98, z1: -9.15, base: 2.68, top: 4.08 },
    ] },
  { name: 'the big crate under the balcony', grow: 0.3, h0: 0.3, h1: 7.5,
    model: [[39.19, 41.67, -1.27, 1.20]],
    boxes: [{ what: 'the crate', x0: 39.19, x1: 41.67, z0: -1.27, z1: 1.20, base: -0.35, top: 2.51 }] },
  { name: "the crates in the raised yard's corner", grow: 0.3, h0: 3.33, h1: 14.6,
    stays: [[41.90, 47.15, -44.65, -44.40], [47.15, 47.40, -44.65, -41.15]],
    model: [[47.07, 48.11, -41.05, -40.14], [46.09, 47.05, -41.13, -40.05], [46.22, 47.16, -42.30, -41.23], [43.26, 45.21, -44.53, -42.56], [45.23, 47.23, -43.28, -42.32], [45.14, 47.26, -44.45, -42.36], [45.90, 47.02, -42.02, -39.99]],
    boxes: [
      { what: 'the cardboard boxes, two high', x0: 43.33, x1: 45.21, z0: -44.49, z1: -42.62, base: 2.78, top: 6.09, lid: false },
      { what: 'the crates against the walls, two high', x0: 45.21, x1: 47.15, z0: -44.42, z1: -42.32, base: 2.78, top: 5.14, lid: false },
      { what: 'the crate on their east half', x0: 46.17, x1: 47.15, z0: -44.41, z1: -42.40, base: 5.14, top: 6.09, lid: false },
      { what: 'two crates on end, in a row', x0: 46.12, x1: 47.15, z0: -42.32, z1: -40.07, base: 2.78, top: 4.95 },
      { what: 'the crate on end beside them', x0: 47.07, x1: 48.11, z0: -41.15, z1: -40.14, base: 2.78, top: 4.95 },
      { what: 'the two crates lying on the row', x0: 45.92, x1: 47.00, z0: -42.01, z1: -39.99, base: 4.95, top: 7.00, lid: false },
    ] },
  { name: 'the four green crates south of the container', grow: 0.3, h0: -0.3, h1: 2.0,
    model: [[50.80, 53.20, 12.17, 14.71]],
    boxes: [{ what: 'the four crates, two on two', x0: 50.81, x1: 53.16, z0: 12.18, z1: 14.68, base: -0.75, top: 1.46 }] },
  { name: "the crates under the raised yard's wall", grow: 0.3, h0: 0.75, h1: 3.0,
    model: [[52.51, 54.47, -30.47, -28.63], [54.76, 56.19, -30.54, -29.34], [54.69, 56.79, -29.24, -28.26], [54.29, 56.43, -29.37, -28.38], [56.19, 56.65, -30.54, -28.26]],
    boxes: [
      { what: 'the west crate', x0: 52.51, x1: 54.47, z0: -30.47, z1: -28.63, base: -0.6, top: 1.57 },
      { what: 'the tall crate at the walls', x0: 54.76, x1: 56.65, z0: -30.54, z1: -29.35, base: -0.6, top: 2.37 },
      { what: 'the low crate before it', x0: 54.47, x1: 56.65, z0: -29.35, z1: -28.29, base: -0.6, top: 1.30 },
      { what: 'the crate lying askew on it', x0: 54.29, x1: 56.43, z0: -29.37, z1: -28.38, base: 1.30, top: 2.28 },
    ] },
  { name: 'the crate with the small boxes on it', grow: 0.3, h0: -0.3, h1: 2.7,
    model: [[58.68, 60.74, 10.94, 13.08]],
    boxes: [
      { what: 'the crate', x0: 58.68, x1: 60.75, z0: 10.94, z1: 13.01, base: -0.75, top: 1.21, lid: false },
      { what: 'the eight small boxes on it', x0: 58.74, x1: 60.55, z0: 10.96, z1: 13.01, base: 1.21, top: 2.19 },
    ] },
  { name: "the crates at the passage's east mouth", grow: 0.3, h0: 0.3, h1: 10.6,
    stays: [[63.65, 64.40, -1.40, 1.85]],
    model: [[64.12, 65.52, -1.22, 1.63], [64.02, 65.92, -3.67, -1.76], [64.14, 66.38, -3.75, -1.51], [63.90, 65.52, -1.76, -1.22]],
    boxes: [
      { what: 'the long crate by the wall', x0: 64.14, x1: 65.49, z0: -1.76, z1: 1.62, base: -0.5, top: 1.30 },
      { what: 'the square crate', x0: 63.90, x1: 65.93, z0: -3.67, z1: -1.76, base: -0.5, top: 1.89, lid: false },
      { what: 'the cardboard boxes on it', x0: 64.34, x1: 66.18, z0: -3.55, z1: -1.71, base: 1.89, top: 3.30 },
    ] },
  { name: 'the four green crates by the concrete wall', grow: 0.3, h0: 0.6, h1: 3.2, ground: 0.35,
    stays: [[74.90, 75.15, -11.39, -8.00]],
    model: [[71.68, 73.22, -11.19, -8.21], [73.06, 74.77, -11.08, -8.07], [71.72, 74.87, -11.24, -9.54], [71.54, 74.65, -9.78, -8.17]],
    boxes: [{ what: 'the four crates, two on two', x0: 71.70, x1: 74.90, z0: -11.10, z1: -8.20, base: 0.1, top: 2.94 }] },
  { name: 'the two crates by the plaster wall', grow: 0.3, h0: 1.2, h1: 4.8,
    stays: [[74.40, 74.65, -28.15, -27.18]],
    model: [[72.81, 74.19, -32.72, -29.99], [72.14, 74.46, -29.95, -27.44], [74.12, 74.40, -32.80, -27.44]],
    boxes: [
      { what: 'the long crate', x0: 72.88, x1: 74.40, z0: -32.69, z1: -29.86, base: 0.2, top: 2.12 },
      { what: 'the big crate on its pallet', x0: 72.22, x1: 74.40, z0: -29.86, z1: -27.53, base: 0.2, top: 2.87 },
    ] },
  { name: 'the crate in the south-east corner', grow: 0.3, h0: 1.3, h1: 12.6,
    stays: [[77.15, 80.40, 11.35, 11.85]],
    model: [[78.73, 80.37, 11.71, 13.35]],
    boxes: [{ what: 'the crate', x0: 78.73, x1: 80.40, z0: 11.71, z1: 13.35, base: 0.75, top: 2.60 }] },
  { name: "the four baskets in the raised yard's corner", grow: 0.3, h0: 3.33, h1: 9.6,
    stays: [[33.40, 33.65, -42.65, -41.15], [33.90, 34.15, -41.15, -40.65], [34.15, 34.40, -40.90, -40.40], [34.40, 34.65, -40.65, -39.90]],
    model: [[34.68, 36.36, -41.03, -39.42], [33.77, 35.45, -42.67, -41.06], [35.48, 37.17, -42.52, -40.91], [37.03, 38.41, -42.67, -41.36]],
    boxes: [
      { what: 'the west basket at the wall', x0: 33.88, x1: 35.46, z0: -42.62, z1: -41.05, base: 2.78, top: 4.67 },
      { what: 'the middle basket at the wall', x0: 35.46, x1: 37.10, z0: -42.47, z1: -40.97, base: 2.78, top: 4.67 },
      { what: 'the small basket at the wall', x0: 37.10, x1: 38.32, z0: -42.63, z1: -41.40, base: 2.78, top: 4.38 },
      { what: 'the basket before them', x0: 34.40, x1: 36.26, z0: -41.05, z1: -39.48, base: 2.78, top: 4.66 },
    ] },
  { name: 'the two barrels in the passage', grow: 0.3, h0: 0.3, h1: 2.0,
    model: [[52.49, 53.44, -2.20, -1.25], [52.49, 53.45, -3.25, -2.29]],
    boxes: [{ what: 'the two barrels', x0: 52.53, x1: 53.40, z0: -3.20, z1: -1.30, base: -0.35, top: 1.29 }],
    hang: [{ x0: 52.65, x1: 53.40, z0: -3.15, z1: -1.40, top: 5.47, from: 3.90 }],
    trim: [{ x0: 41.65, x1: 53.295, z0: -3.40, z1: -1.1775, to: 52.65 }] },
];
const topOf = (e) => (e.type === 'plane' ? Math.max(e.y0, e.y0 + e.gx * (e.maxX - e.minX), e.y0 + e.gz * (e.maxZ - e.minZ), e.y0 + e.gx * (e.maxX - e.minX) + e.gz * (e.maxZ - e.minZ))
  : e.type === 'flat' ? e.top : e.type ? (e.maxTop ?? e.top) : e.maxY);
const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => (typeof a[k] === 'number' ? Math.abs(a[k] - b[k]) < 1e-9 : a[k] === b[k])); };
const M = (e) => `x ${(e.minX / SCALE + CX).toFixed(2)}..${(e.maxX / SCALE + CX).toFixed(2)} z ${(e.minZ / SCALE + CZ).toFixed(2)}..${(e.maxZ / SCALE + CZ).toFixed(2)}`;
const dropO = new Set(), dropS = new Set(), addO = [], addS = []; const listed = new Set();
for (const p of PLACES) {
  // the things' own boxes grown, in arena units; a plan's share inside them (exact: their edges split the plan into cells)
  const R = p.model.map(([x0, x1, z0, z1]) => [(x0 - p.grow - CX) * SCALE, (x1 + p.grow - CX) * SCALE, (z0 - p.grow - CZ) * SCALE, (z1 + p.grow - CZ) * SCALE]);
  const share = (e) => { const w = e.maxX - e.minX, d = e.maxZ - e.minZ; if (!(w > 0 && d > 0)) return 0;
    const xs = [...new Set([e.minX, e.maxX, ...R.flatMap((r) => [r[0], r[1]])].filter((v) => v >= e.minX && v <= e.maxX))].sort((a, b) => a - b);
    const zs = [...new Set([e.minZ, e.maxZ, ...R.flatMap((r) => [r[2], r[3]])].filter((v) => v >= e.minZ && v <= e.maxZ))].sort((a, b) => a - b);
    let a = 0; for (let i = 0; i + 1 < xs.length; i += 1) for (let k = 0; k + 1 < zs.length; k += 1) { const x = (xs[i] + xs[i + 1]) / 2, z = (zs[k] + zs[k + 1]) / 2; if (R.some((r) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3])) a += (xs[i + 1] - xs[i]) * (zs[k + 1] - zs[k]); }
    return a / (w * d); };
  const h0 = p.h0 * SCALE, h1 = p.h1 * SCALE;
  const news = p.boxes.map((b) => { const box = { minX: du((b.x0 - CX) * SCALE), maxX: du((b.x1 - CX) * SCALE), minZ: du((b.z0 - CZ) * SCALE), maxZ: du((b.z1 - CZ) * SCALE), minY: du(b.base * SCALE), maxY: du(b.top * SCALE), topBuffer: 0.8 };
    return { b, box, lid: { minX: du(box.minX - 0.08), maxX: du(box.maxX + 0.08), minZ: du(box.minZ - 0.08), maxZ: du(box.maxZ + 0.08), maxTop: box.maxY, type: 'flat', top: box.maxY, lid: 1 } }; });
  // the floor under the place: the things' own boxes' common rectangle grown, at the lowest of the ground's heights around it
  const hasGround = p.ground !== undefined; const g = du((p.ground ?? 0) * SCALE); const under = { minX: du(Math.min(...R.map((r) => r[0]))), maxX: du(Math.max(...R.map((r) => r[1]))), minZ: du(Math.min(...R.map((r) => r[2]))), maxZ: du(Math.max(...R.map((r) => r[3]))), maxTop: g, type: 'flat', top: g };
  if (hasGround && !(g < h0)) throw new Error(`${p.name}: the floor under it must lie under the band`);
  // what stays whatever the rule says: an entry wholly inside one of the place's `stays` rectangles (a wall's own cells, a fill made by hand)
  const ST = (p.stays ?? []).map(([x0, x1, z0, z1]) => [(x0 - CX) * SCALE - 0.02, (x1 - CX) * SCALE + 0.02, (z0 - CZ) * SCALE - 0.02, (z1 - CZ) * SCALE + 0.02]);
  const stays = (e) => ST.some((r) => e.minX >= r[0] && e.maxX <= r[1] && e.minZ >= r[2] && e.maxZ <= r[3]);
  for (const n of news) if (!(n.box.maxY >= h0 && n.box.maxY <= h1)) throw new Error(`${p.name}: ${n.b.what} has its top outside the band`);
  const goes = (e) => { const t = topOf(e); return t >= h0 && t <= h1 && share(e) >= 0.5 && !stays(e); };
  // (nothing far from the place may go, whatever the data holds: a plan that reaches more than 0.35 m out of the grown boxes' common rectangle stops the run)
  const near = (e) => e.minX >= under.minX - 1.4 && e.maxX <= under.maxX + 1.4 && e.minZ >= under.minZ - 1.4 && e.maxZ <= under.maxZ + 1.4;
  const tally = { box: 0, tall: 0, floor: 0, slope: 0 }; const has = news.map(() => ({ box: false, lid: false })); let hasUnder = false;
  const tallOver = Math.max(...news.map((n) => n.box.maxY)) + 4;
  O.forEach((e, i) => { const k = news.findIndex((n) => same(e, n.box)); if (k >= 0) { has[k].box = true; return; } if (!goes(e)) return; if (!near(e)) throw new Error(`${p.name}: a box far from it would go: ${M(e)}`); dropO.add(i); tally.box += 1; if (e.maxY > tallOver) tally.tall += 1; });
  S.forEach((e, i) => { if (hasGround && same(e, under)) { hasUnder = true; return; } const k = news.findIndex((n) => same(e, n.lid)); if (k >= 0) { has[k].lid = true; return; } if (!goes(e)) return; if (!near(e)) throw new Error(`${p.name}: a floor far from it would go: ${M(e)}`); dropS.add(i); tally[e.type === 'plane' ? 'slope' : 'floor'] += 1; });
  news.forEach((n, k) => { if (!has[k].box) addO.push(n.box); if (!has[k].lid && n.b.lid !== false) addS.push(n.lid); }); if (hasGround && !hasUnder) addS.push(under);
  console.log(`${p.name}: out ${tally.box} boxes (${tally.tall} of them columns over a metre above the highest top), ${tally.floor} floors, ${tally.slope} slopes`);
  news.forEach((n, k) => console.log(`   ${n.b.what}: model ${M(n.box)}, ${n.b.base.toFixed(2)}..${n.b.top.toFixed(2)} m${n.b.lid === false ? ', no lid' : ''}${has[k].box ? ' (there already)' : ''}`));
  if (hasGround) console.log(`   the floor under it: model ${M(under)} at ${p.ground.toFixed(2)} m${hasUnder ? ' (there already)' : ''}`);
  // what hangs overhead and has boxes of its own beside the place: a column that stood from the ground to it is cut from below, not taken
  for (const hg of p.hang ?? []) { const r = [(hg.x0 - CX) * SCALE - 0.02, (hg.x1 - CX) * SCALE + 0.02, (hg.z0 - CZ) * SCALE - 0.02, (hg.z1 - CZ) * SCALE + 0.02]; const from = du(hg.from * SCALE), top = hg.top * SCALE; let cut = 0, was = 0;
    O.forEach((e, i) => { if (dropO.has(i) || e.type || !(e.minX >= r[0] && e.maxX <= r[1] && e.minZ >= r[2] && e.maxZ <= r[3]) || Math.abs(e.maxY - top) > 0.05) return;
      if (Math.abs(e.minY - from) < 1e-9) { was += 1; return; } if (e.minY !== 0) throw new Error(`${p.name}: a column over it stands from ${e.minY}, not from the ground: ${M(e)}`);
      const m = oT[i].match(/"minY":\s*(-?[\d.eE+-]+)/); if (!m || Number(m[1]) !== 0) throw new Error(`${p.name}: a column's foot is not read in its text: ${M(e)}`);
      oT[i] = oT[i].replace(m[0], m[0].slice(0, m[0].length - m[1].length) + String(from)); O[i] = JSON.parse(oT[i]); cut += 1; });
    console.log(`   over it: ${cut} columns cut to hang from ${hg.from.toFixed(2)} m (to ${hg.top.toFixed(2)} m)${was ? `, ${was} hanging already` : ''}`); }
  // a plug that reached in under the place's old boxes (the header: the plug): its east end drawn back to the face of the wall it lies in
  for (const tr of p.trim ?? []) { const want = { minX: du((tr.x0 - CX) * SCALE), maxX: du((tr.x1 - CX) * SCALE), minZ: du((tr.z0 - CZ) * SCALE), maxZ: du((tr.z1 - CZ) * SCALE) }; const to = du((tr.to - CX) * SCALE);
    const hit = O.map((e, i) => i).filter((i) => { const e = O[i]; return !dropO.has(i) && !e.type && e.minY === 0 && Math.abs(e.maxY - 0.5) < 1e-9 && e.topBuffer == null
      && ['minX', 'minZ', 'maxZ'].every((k) => Math.abs(e[k] - want[k]) < 0.006) && (Math.abs(e.maxX - want.maxX) < 0.006 || Math.abs(e.maxX - to) < 0.006); });
    if (hit.length !== 1) throw new Error(`${p.name}: ${hit.length} plugs match`);
    const i = hit[0], e = O[i]; if (Math.abs(e.maxX - to) < 0.006) { console.log(`   the plug under it: drawn back already`); continue; }
    // the wall stands over the plug's whole width at its new end, from the street up; and what is left bare has a floor of the ground's or a new box on it
    if (!O.some((w, k) => k !== i && !dropO.has(k) && !w.type && Math.abs(w.maxX - to) < 0.006 && w.minX < to - 1 && w.minZ <= e.minZ + 1e-9 && w.maxZ >= e.maxZ - 1e-9 && w.minY <= 0 && w.maxY >= 4)) throw new Error(`${p.name}: no wall's face at the plug's new end`);
    const floors = [...S.filter((f, k) => !dropS.has(k)), ...addS].filter((f) => !f.lid); const hAt = (f, x, z) => (f.type === 'plane' ? f.y0 + f.gx * (x - f.minX) + f.gz * (z - f.minZ) : f.top);
    for (let x = to + 0.1; x < e.maxX; x += 0.2) for (let z = e.minZ + 0.1; z < e.maxZ; z += 0.2) { if (news.some((n) => x >= n.box.minX && x <= n.box.maxX && z >= n.box.minZ && z <= n.box.maxZ)) continue;
      if (!floors.some((f) => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && hAt(f, x, z) <= 0.5 + 2.6)) throw new Error(`${p.name}: bare street would show where the plug is drawn back, at ${M({ minX: x, maxX: x, minZ: z, maxZ: z })}`); }
    const m = oT[i].match(/"maxX":\s*(-?[\d.eE+-]+)/); if (!m || Math.abs(Number(m[1]) - e.maxX) > 1e-9) throw new Error(`${p.name}: the plug's end is not read in its text`);
    oT[i] = oT[i].replace(m[0], m[0].slice(0, m[0].length - m[1].length) + String(to)); O[i] = JSON.parse(oT[i]);
    console.log(`   the plug under it (model ${M(e)}): its east end drawn back from ${tr.x1.toFixed(2)} to ${tr.to.toFixed(2)}, the wall's face`); }
  if (process.env.LIST) { for (const i of dropO) if (!listed.has('o' + i)) { listed.add('o' + i); console.log(`      out box   ${M(O[i])} y ${(O[i].minY / SCALE).toFixed(2)}..${(O[i].maxY / SCALE).toFixed(2)}`); } for (const i of dropS) if (!listed.has('s' + i)) { listed.add('s' + i); console.log(`      out floor ${M(S[i])} ${S[i].type} ${(topOf(S[i]) / SCALE).toFixed(2)}${S[i].lid ? ' lid' : ''}`); } }
}
const out = text.slice(0, iO + 13) + [...oT.filter((_, i) => !dropO.has(i)), ...addO.map((e) => JSON.stringify(e))].join(',') + midS + [...sT.filter((_, i) => !dropS.has(i)), ...addS.map((e) => JSON.stringify(e))].join(',') + ']}';
JSON.parse(out); fs.writeFileSync(outF, out);
console.log(`${O.length - dropO.size + addO.length} boxes, ${S.length - dropS.size + addS.length} floors`);
