// A flag given to the boxes inside a box of model metres: x0,x1,z0,z1,h0,h1 (h over the street); a box across its faces is cut along
// them and only the pieces inside are flagged — a box of no height (a top to stand on: the reading keeps some) by its one height, as
// in data_region.mjs, cut in x and z alone. Made for Blockade's scaffold edits (user 2026-11-02, "bullets should be able to go through
// these gaps"): the solid reading fills a gap narrower than a body, so the slit the eye sees between two posts at a corner stopped
// bullets too; `noProjectile` on the boxes between the posts lets the rounds and the bots' sight through (the sim's flag, arena.js)
// and still holds a body. usage: node data_flag.mjs <in.json> <x0,x1,z0,z1,h0,h1> <flag[=json value]> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [inF, boxS, flagS, outF] = process.argv.slice(2);
const D = JSON.parse(readFileSync(inF, 'utf8')); const T = D.transform, s = T.scale;
const nums = boxS.split(',').map(Number); if (nums.length !== 6 || nums.some((v) => !Number.isFinite(v))) throw new Error('the box: x0,x1,z0,z1,h0,h1');
const [x0, x1, z0, z1, h0, h1] = nums; const du = (v) => Math.round(v * 1e6) / 1e6;
const R = { minX: du((x0 - T.cx) * s), maxX: du((x1 - T.cx) * s), minZ: du((z0 - T.cz) * s), maxZ: du((z1 - T.cz) * s), minY: du(h0 * s), maxY: du(h1 * s) };
if (!(R.maxX > R.minX && R.maxZ > R.minZ && R.maxY > R.minY)) throw new Error('an empty box');
const eq = flagS.indexOf('='); const key = eq < 0 ? flagS : flagS.slice(0, eq), val = eq < 0 ? true : JSON.parse(flagS.slice(eq + 1));   // (split at the first '=' alone: a JSON value may hold one)
const flat = (e) => e.maxY === e.minY;
const piece = (e, minX, maxX, minZ, maxZ, minY, maxY) => (maxX > minX && maxZ > minZ && (maxY > minY || (flat(e) && maxY === minY)) ? { ...e, minX, maxX, minZ, maxZ, minY, maxY } : null);
const out = []; let flagged = 0, cut = 0;
for (const e of D.obstacles) {
  const yIn = flat(e) ? e.minY >= R.minY && e.minY < R.maxY : e.maxY > R.minY && e.minY < R.maxY;
  // (as it was: a box of no width or depth — it holds nothing, and cut it would leave no piece — one outside the box, one flagged already)
  if (!(e.maxX > e.minX && e.maxZ > e.minZ && e.maxY >= e.minY) || e.maxX <= R.minX || e.minX >= R.maxX || e.maxZ <= R.minZ || e.minZ >= R.maxZ || !yIn || e[key] === val) { out.push(e); continue; }
  const ix0 = Math.max(e.minX, R.minX), ix1 = Math.min(e.maxX, R.maxX), iz0 = Math.max(e.minZ, R.minZ), iz1 = Math.min(e.maxZ, R.maxZ), iy0 = Math.max(e.minY, R.minY), iy1 = Math.min(e.maxY, R.maxY);
  const inner = piece(e, ix0, ix1, iz0, iz1, iy0, iy1); if (!inner) { out.push(e); continue; }
  const rest = [piece(e, e.minX, R.minX, e.minZ, e.maxZ, e.minY, e.maxY), piece(e, R.maxX, e.maxX, e.minZ, e.maxZ, e.minY, e.maxY),
    piece(e, ix0, ix1, e.minZ, R.minZ, e.minY, e.maxY), piece(e, ix0, ix1, R.maxZ, e.maxZ, e.minY, e.maxY),
    ...(flat(e) ? [] : [piece(e, ix0, ix1, iz0, iz1, e.minY, R.minY), piece(e, ix0, ix1, iz0, iz1, R.maxY, e.maxY)])].filter(Boolean);
  if (rest.length) cut += 1; out.push(...rest, { ...inner, [key]: val }); flagged += 1; }
writeFileSync(outF, JSON.stringify({ ...D, obstacles: out }));
console.log(`x ${x0}..${x1} z ${z0}..${z1} h ${h0}..${h1}: ${flagged} boxes given ${key}=${JSON.stringify(val)} inside (${cut} of them cut along the box) -> ${out.length} boxes, ${outF}`);
