// A modelled map's collision data installed as its file (arena.js, THE MAPS' DATA AS FILES): the generator's json — the
// key, transform, halfX, halfZ, spawns, obstacles, surfaces — becomes client/public/maps/<mapKey>_data.json with the
// obstacles and surfaces alone; the spawn row and the bounds stay in arena.js as before (data_splice.py's note).
// usage: node data_install.mjs <tree root> <mapKey> <json>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [root, mapKey, jsonFile] = process.argv.slice(2);
if (!root || !mapKey || !jsonFile) { console.error('usage: node data_install.mjs <tree root> <mapKey> <json>'); process.exit(2); }
const d = JSON.parse(readFileSync(jsonFile, 'utf8'));
if (!Array.isArray(d.obstacles) || !Array.isArray(d.surfaces)) { console.error('no obstacles and surfaces in ' + jsonFile); process.exit(1); }
const out = path.join(path.resolve(root), 'client/public/maps', `${mapKey}_data.json`);
writeFileSync(out, JSON.stringify({ obstacles: d.obstacles, surfaces: d.surfaces }));
console.log(`${path.basename(out)}: ${d.obstacles.length} boxes, ${d.surfaces.length} surfaces, ${(readFileSync(out).length / 1048576).toFixed(2)} MiB`);
