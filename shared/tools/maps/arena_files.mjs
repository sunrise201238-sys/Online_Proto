// THE MAPS' DATA AS FILES (arena.js, 2026-10-29): the seven modelled maps' collision data read from client/public/maps and
// registered with the shared sim — on import, so a test or a tool that imports this first finds every map as it was
// when the data lived in arena.js. usage: import '../tools/maps/arena_files.mjs'; or loadArenaFiles(<tree root>).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerGeneratedData, hasGeneratedData, generatedDataFile, FILE_DATA_MAPS } from '../../src/sim/arena.js';
export function loadArenaFiles(root = fileURLToPath(new URL('../../../', import.meta.url))) {
  for (const mapKey of FILE_DATA_MAPS) {
    if (hasGeneratedData(mapKey)) continue;
    registerGeneratedData(mapKey, JSON.parse(readFileSync(path.join(root, 'client/public', generatedDataFile(mapKey)), 'utf8')));
  }
}
loadArenaFiles();
