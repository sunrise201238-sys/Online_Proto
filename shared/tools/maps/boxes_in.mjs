// the boxes and surfaces of a map json touching a window (metres), with the rule tag when a cells dump sits beside it. usage: node boxes_in.mjs <json> <cxM> <czM> x0 z0 x1 z1
import { readFileSync, existsSync } from 'node:fs';
const [f, cxS, czS, ...w] = process.argv.slice(2); const CX = Number(cxS), CZ = Number(czS); const [x0, z0, x1, z1] = w.map(Number);
const d = JSON.parse(readFileSync(f, 'utf8')); const cf = f.replace(/\.json$/, '.cells.json'); const tags = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')).tags : null;
const M = (u, c) => (u / 4 + c).toFixed(1); const U = (m, c) => (m - c) * 4;
const hit = (o) => o.maxX > U(x0, CX) && o.minX < U(x1, CX) && o.maxZ > U(z0, CZ) && o.minZ < U(z1, CZ);
console.log(`boxes in x ${x0}..${x1} z ${z0}..${z1}:`); d.obstacles.forEach((o, i) => { if (hit(o)) console.log(`  x ${M(o.minX, CX)}..${M(o.maxX, CX)} z ${M(o.minZ, CZ)}..${M(o.maxZ, CZ)} y ${(o.minY / 4).toFixed(2)}..${(o.maxY / 4).toFixed(2)}${o.topBuffer ? ' top' : ''}${o.noProjectile ? ' thin' : ''} ${tags ? tags[i] : ''}`); });
console.log('surfaces:'); for (const s of d.surfaces) if (hit(s)) console.log(`  x ${M(s.minX, CX)}..${M(s.maxX, CX)} z ${M(s.minZ, CZ)}..${M(s.maxZ, CZ)} ${s.type} ${s.type === 'flat' ? (s.top / 4).toFixed(2) : `y0 ${(s.y0 / 4).toFixed(2)} g ${s.gx},${s.gz}`}`);
