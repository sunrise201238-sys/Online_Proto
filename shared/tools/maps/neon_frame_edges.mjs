// NEON, A FRAME'S BOXES CUT BACK TO THE FRAME ONE SEES (b1105ku, 2026-11-24). The user, with a box of the low rail on the west street ramp's south side picked on the
// page (#8315): "This mini fence is visually floating in the air. make sure it visually connects with the platform slope."
// A low rail stands on the outer edge of the floors it guards (neon_rails.mjs), and the floors are the solid reading's: cells a quarter metre wide, a cell solid when
// anything of the model is in it. Where a frame's face lies a little way into a cell the floor goes on to the cell's far line, up to a quarter metre beyond the
// frame, and the rail stands there, beside the frame and not on it. The ramp from the west street up to the 5.78 m deck is 8 m wide in the model, its side tubes'
// outer edges at z 32.37 and z 40.37 (model metres); the north side's boxes are flush with their tube, the south side's went on to z 40.62, and the rail hung 19 cm
// beside the tube.
// Moving the rail alone will not do: it must stay on the boxes' outer face. A body that sinks into a box with no floor on all of its top is put out at the box's
// nearest face (physics.js resolveUnitObstacleCollisions), which is the far side of a rail that stands in the middle of the box — tried: a walk down along the rail
// went out through it, 3 m down. So the boxes and the floors are cut back to the tube's edge, and the rails tool, run after this one, sets the rail on it.
// A CUT (model metres): a side of the pieces; the line it is cut back to; where that side lies now; the window along the other plan axis the pieces lie in; their
// tops over the street; how many boxes and floors it must find to cut, and how many that lie wholly beyond the line and go out. A piece is a box that is no wall and
// stops rounds (no rail, no fence), or a flat floor. The tool stops on any other count; a cut that finds nothing has been made already, and a file with nothing left
// to cut is not written. The file's other text is kept byte for byte.
// WHERE THIS IS NOT THE WAY (the same day; user, of the 12.59 m top platform's north and east rails at its north-east corner, #8213 and #8222: "this particular
// corner's mini fences also floats a bit in visual. Make them visually connect with the platform."). That platform's frame is blocks with their outer face at z 29.85
// and x 17.43 and lengths between them 13 cm and 10 cm farther in, its corner cut slantwise; the floors go on to z 29.62 and x 17.56, and the rails hang 17 to 31 cm
// and 7 to 17 cm beside the frame. A line that the frame's top lies under all along is z 29.995 and x 17.31. Cut back to it, the platform's north row of the route
// grid is gone: a place stands at its cell's centre or a quarter cell beside it (navgrid.js SAMPLES), that row's centres are at z 29.87 and its bodies stand at
// 30.12, and a body 0.2875 m in radius fits there only while the rail's inner face is no farther in than 29.83 — short of the frame by 2 cm. With the row go its
// four hops off the north side. And the bodies under the floor that are cut with it open the strip of the lower ramp's steps beneath the edge: seven new places of
// the grid, and two rails the plan then wants on them. So that corner's collision is left as it is and its two rails are given a foot plate from the rail in to the
// frame: neon_rails.mjs, FOOT_PLATES.
// usage: node neon_frame_edges.mjs <in neon_data.json> <out neon_data.json>      then neon_rails.mjs (the rails' lines follow the floors), and the route grid again.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!outF) { console.error('usage: node neon_frame_edges.mjs <in neon_data.json> <out neon_data.json>'); process.exit(2); }
const text = fs.readFileSync(inF, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37, AX = (x) => (x + 12.44) * 4, AZ = (z) => (z - 40.37) * 4, r4 = (v) => +v.toFixed(4);   // (model metres and the arena's units)
const CUTS = [
  { name: 'the west street ramp\'s south side', side: 'maxZ', to: 40.37, from: [40.615, 40.625], win: [-15.6, -11.7], top: [2.0, 5.2], cut: [33, 32], out: [0, 0] },   // (tops under the deck's own lip at 5.25 m and the post at its corner, which stay)
  { name: 'the west street ramp\'s north side', side: 'minZ', to: 32.39, from: [32.365, 32.375], win: [-15.6, -11.7], top: [2.0, 5.2], cut: [35, 33], out: [0, 0] },   // (b1105kv; user, with a box of that rail picked: "This mini fence is slightly floating outside in the air as well." The beam's outer face is at 32.374 and the rail's outer 1.6 cm hung outside it: neon_rails.mjs SLOPE_LINES sets the rail 3 cm farther in, and these boxes are cut back to its line with it)
];
let done = 0;
for (const c of CUTS) { const alongZ = c.side.endsWith('Z'), max = c.side.startsWith('max'); const M = alongZ ? MZ : MX, A = alongZ ? AZ : AX; const lo = alongZ ? 'minX' : 'minZ', hi = alongZ ? 'maxX' : 'maxZ', W = alongZ ? MX : MZ, near = max ? (alongZ ? 'minZ' : 'minX') : (alongZ ? 'maxZ' : 'maxX');
  const here = (o, top) => M(o[c.side]) >= c.from[0] && M(o[c.side]) <= c.from[1] && W(o[lo]) >= c.win[0] && W(o[hi]) <= c.win[1] && top / 4 >= c.top[0] && top / 4 <= c.top[1];
  const beyond = (o) => (max ? M(o[near]) >= c.to - 0.001 : M(o[near]) <= c.to + 0.001);   // (the piece's other side is past the line too: nothing of it is left)
  const boxes = D.obstacles.filter((o) => o.topBuffer != null && o.noProjectile !== true && here(o, o.maxY)), floors = D.surfaces.filter((s) => s.type === 'flat' && here(s, s.maxTop));
  if (!boxes.length && !floors.length) { console.log(`${c.name}: cut already`); continue; }
  const outB = boxes.filter(beyond), outS = floors.filter(beyond), cutB = boxes.filter((o) => !beyond(o)), cutS = floors.filter((s) => !beyond(s));
  if (cutB.length !== c.cut[0] || cutS.length !== c.cut[1] || outB.length !== c.out[0] || outS.length !== c.out[1]) throw new Error(`${c.name}: found ${cutB.length} boxes and ${cutS.length} floors to cut, ${outB.length} and ${outS.length} to take out; it is ${c.cut[0]} and ${c.cut[1]}, ${c.out[0]} and ${c.out[1]}`);
  for (const o of [...cutB, ...cutS]) o[c.side] = r4(A(c.to));
  if (outB.length) D.obstacles = D.obstacles.filter((o) => !outB.includes(o)); if (outS.length) D.surfaces = D.surfaces.filter((s) => !outS.includes(s));
  for (const o of outB) console.log(`  box out   x ${MX(o.minX).toFixed(2)}..${MX(o.maxX).toFixed(2)} z ${MZ(o.minZ).toFixed(2)}..${MZ(o.maxZ).toFixed(2)}  ${(o.minY / 4).toFixed(2)}..${(o.maxY / 4).toFixed(2)} m`);
  console.log(`${c.name}: ${cutB.length} boxes and ${cutS.length} floors cut back to ${alongZ ? 'z' : 'x'} ${c.to}${outB.length + outS.length ? `, ${outB.length} boxes and ${outS.length} floors out` : ''}`); done += 1; }
if (!done) { console.log('every frame ends at its line already: nothing written'); process.exit(0); }
fs.writeFileSync(outF, JSON.stringify(D)); console.log(`${outF}: ${D.obstacles.length} boxes, ${D.surfaces.length} floors`);
