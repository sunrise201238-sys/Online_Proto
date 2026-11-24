// NEON, THE STAIR FENCES' FEET DOWN TO THE STAIR (b1105lc, 2026-11-24). The user, with boxes of the two stairs' side fences picked on the page (#8187, #8188, #8192,
// #8196, #8197, #8199 on the stair up to the bridge; #8177, #8178, #8182 on the stair up to the tower): "Seal the tiny gap at the foot of these fences so the BOT won't
// try to aim through them from beneath. Don't make it too complicated."
// A stair's side fence is a row of upright boxes in steps, one a step of the solid reading, and each box's base is the fence's foot at the box's MIDDLE: at the box's
// lower end the base stands half a step over the stair's floor (0.52 m on the bridge's stair, 0.55 m on the tower's), a three-cornered hole under every box, and the
// bots' sight test passes through it from a place beneath. Each box's base is brought down by that half step, to the stair's floor at the box's lower end: the hole is
// shut, and the box goes no farther under the stair than a step at its upper end.
// usage: node neon_fence_feet.mjs <neon_data.json in> <neon_data.json out>     (run again on its own output: "down already", nothing written)
import fs from 'node:fs';
const [IN, OUT] = process.argv.slice(2); if (!IN || !OUT) { console.error('usage: node neon_fence_feet.mjs <neon_data.json in> <neon_data.json out>'); process.exit(1); }
const D = JSON.parse(fs.readFileSync(IN, 'utf8')); const O = D.obstacles; const MX = (u) => u / 4 - 12.44, MZ = (u) => u / 4 + 40.37; const r3 = (v) => Math.round(v * 1000) / 1000;
// (model metres: the fence's line across and its run along z; how many boxes it has; a box's height as the reading made it)
const RUNS = [
  { name: 'the bridge stair\'s east fence', x: [16.84, 17.43], z: [33.85, 45.87], n: 9, tall: 2.611 },
  { name: 'the bridge stair\'s west fence', x: [13.43, 14.02], z: [33.85, 45.87], n: 9, tall: 2.611 },
  { name: 'the tower stair\'s east fence', x: [-2.90, -2.31], z: [25.71, 29.72], n: 4, tall: 2.611 },
  { name: 'the tower stair\'s west fence', x: [-6.31, -5.72], z: [25.71, 29.72], n: 4, tall: 2.611 } ];
let moved = 0;
for (const R of RUNS) {
  const L = O.filter((o) => !o.noProjectile && o.topBuffer == null && Math.abs(MX(o.minX) - R.x[0]) < 0.02 && Math.abs(MX(o.maxX) - R.x[1]) < 0.02 && MZ(o.minZ) > R.z[0] - 0.02 && MZ(o.maxZ) < R.z[1] + 0.02).sort((a, b) => a.maxY - b.maxY);
  if (L.length !== R.n) throw new Error(`${R.name}: ${L.length} boxes found, ${R.n} looked for`);
  const step = (L[L.length - 1].maxY - L[0].maxY) / (L.length - 1); const half = step / 2;   // (units; the tops keep the reading's steps)
  for (let i = 1; i < L.length; i += 1) if (Math.abs(L[i].maxY - L[i - 1].maxY - step) > 0.02) throw new Error(`${R.name}: its steps are not even`);
  const asRead = L.filter((o) => Math.abs((o.maxY - o.minY) / 4 - R.tall) < 0.005), down = L.filter((o) => Math.abs((o.maxY - o.minY - half) / 4 - R.tall) < 0.005);
  if (down.length === L.length) { console.log(`${R.name}: down already`); continue; }
  if (asRead.length !== L.length) throw new Error(`${R.name}: ${asRead.length} boxes as the reading made them and ${down.length} down, of ${L.length}`);
  for (const o of L) o.minY = r3(o.minY - half); moved += L.length;
  console.log(`${R.name}: ${L.length} boxes, each base down ${(half / 4).toFixed(3)} m (a step is ${(step / 4).toFixed(3)} m): ${(L[0].minY / 4).toFixed(2)} m to ${(L[L.length - 1].minY / 4).toFixed(2)} m`); }
if (!moved) { console.log('every fence stands on its stair already: nothing written'); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify(D)); console.log(`${OUT}: ${moved} boxes' bases moved; ${O.length} boxes, ${D.surfaces.length} floors`);
