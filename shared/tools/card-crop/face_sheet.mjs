// A contact sheet of the unit thumbnails (every *_profile_thumbnail.png in a folder) with a 10% grid, to read each face's centre (x)
// and eye line (y) by eye: the face points of UNIT_FACE in client/src/main.js (b1105r). The red line is the box's centre, the green
// one 62% down (the default eye line). usage: node face_sheet.mjs <checkout>/client/public/units — writes face_sheet.html and
// face_sheet.png in the current folder. Needs Playwright with its Chromium.
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const dir = resolve(process.argv[2]);
const files = (await readdir(dir)).filter((f) => f.endsWith('_profile_thumbnail.png')).sort();
const cells = files.map((f) => `<figure><div class="box"><img src="file://${dir}/${f}"><i></i></div><figcaption>${f.replace('_profile_thumbnail.png', '')}</figcaption></figure>`).join('');
const html = `<!doctype html><meta charset=utf-8><style>
body{margin:12px;background:#fff;font:12px/1.2 sans-serif;display:grid;grid-template-columns:repeat(6,200px);gap:10px}
figure{margin:0}.box{position:relative;width:200px;height:200px}.box img{width:200px;height:200px;display:block}
.box i{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(255,0,0,.55) 1px,transparent 1px),linear-gradient(to bottom,rgba(0,0,255,.55) 1px,transparent 1px);background-size:20px 20px}
.box i::after{content:'';position:absolute;left:99px;top:0;bottom:0;border-left:2px solid #f00}
.box i::before{content:'';position:absolute;top:123px;left:0;right:0;border-top:2px solid #0a0}
figcaption{text-align:center;font-weight:700}</style>${cells}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1290, height: 700 } });
const { writeFile } = await import('node:fs/promises'); await writeFile('face_sheet.html', html); await page.goto('file://' + resolve('face_sheet.html'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'face_sheet.png', fullPage: true });
await browser.close();
console.log(files.length, 'thumbnails');
