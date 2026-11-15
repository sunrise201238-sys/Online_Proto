// unit_anims.mjs <tree root> [write] — EVERY UNIT'S MODEL WITH ONLY THE ANIMATIONS THE GAME PLAYS (b1105im; glb_keep_anims.mjs beside this
// file does one model, and says why). What the game plays is read off the tree's own table — client/src/main.js, MODEL_CLIPS_DEFAULT and UNIT_MODELS,
// evaluated as they stand: each clip's `name`, or its `base` where the clip itself comes from another unit's file (`from`); the climb's is left out
// where the file never had it (the game borrows it then: borrowClimbClip).
// Without `write`: the plan — for each unit, the animations its file holds and the ones the table names. With `write`: each file that holds more
// is written again beside itself under the next name — saori.glb as saori_v2.glb, hiyori_v2.glb as hiyori_v3.glb — and the lines to change in the
// table are printed: its `file:` entries are then changed to the new names and the old files removed (the game busts no cache, so a changed file
// takes a new name).
// A file that holds nothing but what is played is left as it is. A name the table asks for that a file lacks is an error: that file was cut for
// an older table, and the motion has to come from the full model again.
import { readFileSync, existsSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [tree, write] = process.argv.slice(2);
if (!tree || (write && write !== 'write')) { console.error('usage: node unit_anims.mjs <tree root> [write]'); process.exit(2); }
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'glb_keep_anims.mjs');
const root = path.resolve(tree), pub = path.join(root, 'client/public');
const src = readFileSync(path.join(root, 'client/src/main.js'), 'utf8');
const a = src.indexOf('const MODEL_CLIPS_DEFAULT = {'), b = src.indexOf('const MODEL_FADE_S'); if (a < 0 || b < a) throw new Error('the tables were not found in main.js');
const { UNIT_MODELS } = new Function('UNIT_SPRITE_HEIGHT', src.slice(a, b) + '\nreturn { UNIT_MODELS };')(1);
const read = (f) => { const buf = readFileSync(f); const jl = buf.readUInt32LE(12); return { json: JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')), bytes: buf.length }; };
const mb = (n) => (n / 1048576).toFixed(1); const rows = [], renamed = []; let before = 0, after = 0;
for (const [key, m] of Object.entries(UNIT_MODELS)) {
  const inFile = ['.glb', '.wasm'].map((e) => path.join(pub, m.file + e)).find(existsSync); if (!inFile) throw new Error(`${key}: no file for ${m.file}`);
  const { json, bytes } = read(inFile); const has = (json.animations ?? []).map((x) => x.name); before += bytes;
  const want = new Set();
  for (const [ck, c] of Object.entries(m.clips ?? {})) { if (!c) continue; const n = c.from ? c.base : c.name; if (!n) continue; if (ck === 'climb' && !has.includes(n)) continue; want.add(n); }
  const miss = [...want].filter((n) => !has.includes(n)); if (miss.length) throw new Error(`${key}: the table names ${miss.join(', ')}, which ${path.basename(inFile)} does not have`);
  const extra = has.filter((n) => !want.has(n));
  const name = path.basename(inFile).padEnd(16);
  if (!extra.length) { after += bytes; rows.push(`${key.padEnd(8)} ${name} ${String(has.length).padStart(2)} animations, all played: left as it is (${mb(bytes)} MB)`); continue; }
  if (!write) { rows.push(`${key.padEnd(8)} ${name} ${String(has.length).padStart(2)} animations, ${String(want.size).padStart(2)} played: ${[...want].join(', ')}`); continue; }
  const ver = Number(/_v(\d+)$/.exec(m.file)?.[1] ?? 1), next = `${m.file.replace(/_v\d+$/, '')}_v${ver + 1}`; const outFile = path.join(pub, next + '.glb');
  if (existsSync(outFile)) throw new Error(`${key}: ${path.basename(outFile)} is there already`);
  renamed.push(`  ${key}: file: '${m.file}' -> '${next}'`);
  const r = JSON.parse(execFileSync('node', [tool, inFile, outFile, [...want].join(',')], { encoding: 'utf8' })); after += r.bytes[1];
  rows.push(`${key.padEnd(8)} ${name} ${String(r.animations[0]).padStart(2)} -> ${String(r.animations[1]).padStart(2)} animations, ${String(r.channels[0]).padStart(5)} -> ${String(r.channels[1]).padStart(5)} channels, ${mb(r.bytes[0]).padStart(5)} -> ${mb(r.bytes[1]).padStart(4)} MB  ${path.basename(outFile)}`);
}
console.log(rows.join('\n')); console.log(`the files together: ${mb(before)} MB${write ? ` -> ${mb(after)} MB` : ''}`);
if (renamed.length) console.log(`the table's entries to change (client/src/main.js UNIT_MODELS), the old files then removed:\n${renamed.join('\n')}`);
