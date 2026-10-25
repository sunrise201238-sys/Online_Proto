// A map's nav grid built once and written as data (user 2026-10-25): client/public/maps/<mapKey>_nav<NAV_FILE_EXT>, read
// back by the server's warm-up and the client instead of building (navgrid.js, "THE GRID AS DATA"). Run after any change
// to a map's collision data or to the grid builder; shared/test/navdata.test.js fails until the files match a fresh build.
// usage: node navgrid_build.mjs <tree root> <mapKey>...      (e.g. node navgrid_build.mjs ../../.. town compound dust warehouse spacecraft)
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const [root, ...maps] = process.argv.slice(2);
if (!root || !maps.length) { console.error('usage: node navgrid_build.mjs <tree root> <mapKey>...'); process.exit(2); }
const SIM = pathToFileURL(path.resolve(root) + '/shared/src/sim/').href;
const { getArena } = await import(SIM + 'arena.js');
const { buildNavGrid, serializeNavGrid, navDataSignature, navDataFile } = await import(SIM + 'navgrid.js');
for (const mapKey of maps) {
  const arena = getArena(mapKey);
  const t0 = performance.now();
  const grid = buildNavGrid(arena.obstacles, arena.surfaces);
  const built = performance.now() - t0;
  const bytes = serializeNavGrid(grid, navDataSignature(arena.obstacles, arena.surfaces));
  const out = path.join(path.resolve(root), 'client/public', navDataFile(mapKey));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  let walkable = 0; for (let i = 0; i < grid.walk.length; i += 1) if (grid.walk[i]) walkable += 1;
  console.log(`${mapKey.padEnd(12)} ${path.basename(out)}  ${(bytes.length / 1048576).toFixed(2)} MB  (${walkable} walkable nodes, ${grid.jumpLinkCount} jump links, built in ${built.toFixed(0)} ms)`);
}
