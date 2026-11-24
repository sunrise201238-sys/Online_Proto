// NEON, ONE PANEL OF THE NORTH-EAST FENCE OUT OF THE DATA (b1105kv, 2026-11-24). The user, standing before it at model x 26.77 z 5.62 with the fence's long box picked
// (#2145, x 27.06..27.31 z 2.37..24.37, 3 m tall) and the panel marked in a picture: "Remove this piece of fence here physically and visually. Not the whole fence wall."
// The fence along the pavement's east side is four panels 5.8 m long, each an object of the model with its mesh (Node_55_55 and Node_56_56 are the first: z 2.57..8.38).
// The solid reading wrote the four as boxes that run the fence's whole length, with the feet and the posts beside them. Here everything of the fence that lies in the
// first panel's opening goes: the window x 26.81..27.81, z 2.87..8.37 (from the north fence's end, whose boxes go to 2.87, to the second panel's first post), tops from
// 0.25 m over the street to 4 m. A piece wholly in the window is taken out; one that goes on past an end of it is cut at that end; one that goes on past both ends —
// the fence's long boxes — is made two. Boxes and flat floors alike; nothing wider than the window is touched (the pavement, the street), and nothing that goes on beyond the fence's own length, z 2.3..25.7 (the kerb's strip beside it).
// The tool stops if it does not find what the list below names, or finds nothing (a second run: nothing to do, nothing written). The file's other text is kept.
// usage: node neon_fence_panel_out.mjs <in neon_data.json> <out neon_data.json>
//        the model: glb_drop_nodes.mjs <in neon.glb> <out> "names=Node_55_55,Node_56_56" (the panel's frame with its feet, and its mesh), and the route grid again.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!outF) { console.error('usage: node neon_fence_panel_out.mjs <in neon_data.json> <out neon_data.json>'); process.exit(2); }
const text = fs.readFileSync(inF, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37, AZ = (z) => (z - 40.37) * 4, r4 = (v) => +v.toFixed(4);   // (model metres and the arena's units)
const WIN = { x0: 26.81, x1: 27.81, z0: 2.87, z1: 8.37, top0: 0.25, top1: 4.0 }, FENCE = [2.3, 25.7], E = 0.004; const EXPECT = { out: [4, 1], cut: [8, 3], two: [2, 1] };   // (boxes and floors: taken out, cut at an end, made two)
const inWin = (o, top) => MZ(o.minZ) >= FENCE[0] && MZ(o.maxZ) <= FENCE[1] && MX(o.minX) >= WIN.x0 - E && MX(o.maxX) <= WIN.x1 + E && MZ(o.maxZ) > WIN.z0 + E && MZ(o.minZ) < WIN.z1 - E && top / 4 >= WIN.top0 && top / 4 <= WIN.top1;
const say = (o, top) => `x ${MX(o.minX).toFixed(2)}..${MX(o.maxX).toFixed(2)} z ${MZ(o.minZ).toFixed(2)}..${MZ(o.maxZ).toFixed(2)} top ${(top / 4).toFixed(2)} m`;
const n = { out: [0, 0], cut: [0, 0], two: [0, 0] };
function clear(list, top, k) { const res = []; for (const o of list) { if (!inWin(o, top(o))) { res.push(o); continue; } const a = MZ(o.minZ) < WIN.z0 - E, b = MZ(o.maxZ) > WIN.z1 + E;
    if (a && b) { n.two[k] += 1; console.log(`  made two: ${say(o, top(o))}`); res.push({ ...o, maxZ: r4(AZ(WIN.z0)) }, { ...o, minZ: r4(AZ(WIN.z1)) }); }
    else if (a) { n.cut[k] += 1; console.log(`  cut at its south end: ${say(o, top(o))}`); res.push({ ...o, maxZ: r4(AZ(WIN.z0)) }); }
    else if (b) { n.cut[k] += 1; console.log(`  cut at its north end: ${say(o, top(o))}`); res.push({ ...o, minZ: r4(AZ(WIN.z1)) }); }
    else { n.out[k] += 1; console.log(`  out: ${say(o, top(o))}`); } } return res; }
const boxes = clear(D.obstacles.map((o) => o), (o) => o.maxY, 0); const floors = clear(D.surfaces.map((s) => s), (s) => (s.type === 'flat' ? s.maxTop : -1), 1);
if (!n.out[0] && !n.cut[0] && !n.two[0] && !n.out[1] && !n.cut[1] && !n.two[1]) { console.log('the panel is out of this file already: nothing written'); process.exit(0); }
if (process.env.LIST) { console.log(JSON.stringify(n)); process.exit(0); }
if (JSON.stringify(n) !== JSON.stringify(EXPECT)) throw new Error(`found ${JSON.stringify(n)}: the panel is ${JSON.stringify(EXPECT)}`);
D.obstacles = boxes; D.surfaces = floors; fs.writeFileSync(outF, JSON.stringify(D)); console.log(`${outF}: ${D.obstacles.length} boxes, ${D.surfaces.length} floors`);
