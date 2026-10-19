// a glb's materials: which are double-sided, and the flat area each side's faces carry. usage: node glb_materials.mjs <glb>
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]); const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12; const chunks = []; while (off < buf.length) { const len = dv.getUint32(off, true); chunks.push(buf.subarray(off + 8, off + 8 + len)); off += 8 + len; }
const json = JSON.parse(new TextDecoder().decode(chunks[0]));
const ds = (json.materials ?? []).map((m, i) => [i, m.name, !!m.doubleSided]);
console.log(`${ds.length} materials, ${ds.filter((x) => x[2]).length} double-sided:`, ds.filter((x) => x[2]).map((x) => `${x[0]}:${x[1]}`).join(', ') || 'none');
const used = new Map(); for (const m of json.meshes) for (const p of m.primitives) { const k = p.material ?? -1; used.set(k, (used.get(k) ?? 0) + 1); }
console.log('primitives per double-sided material:', [...used.entries()].filter(([k]) => ds[k]?.[2]).map(([k, n]) => `${ds[k][1]}:${n}`).join(', ') || 'none');
