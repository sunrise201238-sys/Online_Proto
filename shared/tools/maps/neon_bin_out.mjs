// NEON'S BIN BY THE NORTH-EAST FENCE OUT OF THE DATA (b1105ks, 2026-11-23; on the PT site b1105kr). The user, with a box of it picked on the page — #2111, model
// x 26.06..26.31 z 0.62..1.37, 2.75 m tall: "Also remove this garbage can stuff visually and physically.", then: "垃圾桶移除. To 9.9".
// The bin is the model's Object_275 where it stands on the pavement (a box 1.2 m square turned a little, 2.75 m tall, at x 24.35..26.16 z -0.22..1.59) with its label,
// Object_277. The solid reading made of it twelve boxes and eleven floors, among them a box and a floor 0.5 m high east of it and a floor on the wall's ledge north of it,
// which are the reading's own joins of the bin with what stands by it: nothing of the model is there.
// Out go: every box that is no wall and lets no round pass (so none of a rail's) whose middle lies in the bin's window and whose top is no higher than the bin's; every
// flat floor there between 0.4 m and the bin's top; and the ledge's one floor. The tool stops if it does not find 12 boxes and 11 floors, or none at all (a second run:
// nothing to do, nothing written). The file's other text is kept byte for byte.
// usage: node neon_bin_out.mjs <in neon_data.json> <out neon_data.json>
//        the model: glb_delete_boxes.mjs <in neon.glb> <out> "24.2,26.5,-0.5,1.9,4.2,7.3" (Object_275's 96 triangles there and Object_277's 2), and the route grid again.
import fs from 'node:fs';
const [inF, outF] = process.argv.slice(2); if (!outF) { console.error('usage: node neon_bin_out.mjs <in neon_data.json> <out neon_data.json>'); process.exit(2); }
const text = fs.readFileSync(inF, 'utf8'); const D = JSON.parse(text); if (JSON.stringify(D) !== text) throw new Error('the file does not come back the same from a read and a write');
const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37;   // (model metres)
const WIN = [24.30, 26.85, -0.30, 1.65], TOP = 2.76, LEDGE = [24.56, 26.06, -0.88, -0.38, 1.50];
const inWin = (o) => { const x = MX((o.minX + o.maxX) / 2), z = MZ((o.minZ + o.maxZ) / 2); return x >= WIN[0] && x <= WIN[1] && z >= WIN[2] && z <= WIN[3]; };
const isBox = (o) => o.topBuffer != null && o.noProjectile !== true && inWin(o) && o.maxY / 4 <= TOP;
const near = (a, b) => Math.abs(a - b) < 0.011;
const isFloor = (s) => s.type === 'flat' && ((inWin(s) && s.maxTop / 4 >= 0.4 && s.maxTop / 4 <= TOP)
  || (near(MX(s.minX), LEDGE[0]) && near(MX(s.maxX), LEDGE[1]) && near(MZ(s.minZ), LEDGE[2]) && near(MZ(s.maxZ), LEDGE[3]) && near(s.maxTop / 4, LEDGE[4])));
const boxes = D.obstacles.filter(isBox), floors = D.surfaces.filter(isFloor);
if (!boxes.length && !floors.length) { console.log('the bin is out of this file already: nothing written'); process.exit(0); }
if (boxes.length !== 12 || floors.length !== 11) throw new Error(`found ${boxes.length} boxes and ${floors.length} floors: the bin is 12 and 11`);
for (const o of boxes) console.log(`  box out   x ${MX(o.minX).toFixed(2)}..${MX(o.maxX).toFixed(2)} z ${MZ(o.minZ).toFixed(2)}..${MZ(o.maxZ).toFixed(2)}  ${(o.minY / 4).toFixed(2)}..${(o.maxY / 4).toFixed(2)} m`);
for (const s of floors) console.log(`  floor out x ${MX(s.minX).toFixed(2)}..${MX(s.maxX).toFixed(2)} z ${MZ(s.minZ).toFixed(2)}..${MZ(s.maxZ).toFixed(2)}  ${(s.maxTop / 4).toFixed(2)} m`);
D.obstacles = D.obstacles.filter((o) => !isBox(o)); D.surfaces = D.surfaces.filter((s) => !isFloor(s));
fs.writeFileSync(outF, JSON.stringify(D)); console.log(`${outF}: ${boxes.length} boxes and ${floors.length} floors out; ${D.obstacles.length} boxes, ${D.surfaces.length} floors left`);
