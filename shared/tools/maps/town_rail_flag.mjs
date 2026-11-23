// TOWN'S LOW RAILING LETS ROUNDS THROUGH (b1105ko; user 2026-11-23, with a picture of it: "how about the mini fences used in town?", and of those and Neon's new ones:
// "can you make these mini fences passable for bullets? both in town and neon.").
// usage: node town_rail_flag.mjs <in town_data.json> <out town_data.json> [list.json]
// The railing is the dark one round the sunken lot in the middle of Town, with the handrails of the lot's three flights of steps. The model has it in a merged mesh, and
// the data holds its BAR alone (the posts have no box): two thin boxes side by side, the bar's two faces, 0.11 m tall at the bar's own height, with a wider piece at each
// bend; on a flight of steps a pair of thin boxes a step, 0.25 m long. They held a body and stopped a round that met the bar. Given `noProjectile` they hold a body still,
// and rounds, beams and the bots' sight pass (arena.js; a box with it is no cover to a bot either). Known by shape and place alone: no list of numbers that a file made
// again would break. The file's other text is kept byte for byte, and a run on its own output changes nothing.
import fs from 'node:fs';
const [inF, outF, listF] = process.argv.slice(2); if (!outF) { console.error('usage: node town_rail_flag.mjs <in town_data.json> <out town_data.json> [list.json]'); process.exit(2); }
const text = fs.readFileSync(inF, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
const near = (a, b) => Math.abs(a - b) < 0.02;
// the bar round the lot: its own heights (units; the pavement is 2.4 m higher on the west side), within the lot's surroundings
const BAR_Y = [[3.34, 3.78], [13.82, 14.26], [13.42, 14.26], [13.30, 13.86]]; const LOT = { x0: -82, x1: 56, z0: -40, z1: 83 };
const isBar = (o) => BAR_Y.some(([a, b]) => near(o.minY, a) && near(o.maxY, b)) && o.minX >= LOT.x0 && o.maxX <= LOT.x1 && o.minZ >= LOT.z0 && o.maxZ <= LOT.z1 && Math.min(o.maxX - o.minX, o.maxZ - o.minZ) <= 1.4;   // (a bend's piece is 0.31 m wide at most)
// the handrails of the three flights: thin pieces no taller than 0.3 m, in the flights' places, over the steps (not a step's own side, which starts at the floor)
const FLIGHTS = [{ x0: 36.6, x1: 37.6, z0: 17.3, z1: 26.6 }, { x0: 27.6, x1: 28.6, z0: 56.5, z1: 64.6 }, { x0: 37.6, x1: 38.6, z0: 56.5, z1: 64.6 }];
const isHand = (o) => { const th = Math.min(o.maxX - o.minX, o.maxZ - o.minZ), tall = o.maxY - o.minY; if (th > 0.17 || tall > 1.2 || o.minY < 1.5) return false; return FLIGHTS.some((f) => o.minX >= f.x0 && o.maxX <= f.x1 && o.minZ >= f.z0 && o.maxZ <= f.z1); };
let bars = 0, hands = 0, had = 0; const list = [];
D.obstacles = D.obstacles.map((o, i) => { const b = isBar(o), h = !b && isHand(o); if (!b && !h) return o; if (o.noProjectile === true) { had += 1; return o; } if (b) bars += 1; else hands += 1; list.push({ i, kind: b ? 'bar' : 'hand', minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, minY: o.minY, maxY: o.maxY }); return { ...o, noProjectile: true }; });
if (bars + hands + had === 0) throw new Error('no piece of the railing found: the data is not Town\'s as this tool knows it');
fs.writeFileSync(outF, JSON.stringify(D)); if (listF) fs.writeFileSync(listF, JSON.stringify(list));
const len = (k) => list.filter((q) => q.kind === k).reduce((s, q) => s + Math.max(q.maxX - q.minX, q.maxZ - q.minZ) / 4, 0);
console.log(`${outF}: ${D.obstacles.length} boxes; given noProjectile: ${bars} of the bar round the lot (${len('bar').toFixed(1)} m of box, two a bar) and ${hands} of the steps' handrails (${len('hand').toFixed(1)} m); ${had} had it already`);
