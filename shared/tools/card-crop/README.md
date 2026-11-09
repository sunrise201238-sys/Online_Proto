# Line-up Card Crop (2026-11-09)

The 1v1 lobby's line-up card (the YOUR UNIT sheet in the LINE-UP folder) shows the unit's picture in a box of 190 × 118 CSS px on a
screen at least 440 px tall (`style.css`, `@media (min-height: 440px)`) and 190 × 108 on a shorter one (a phone in landscape). Until
b1105dw every unit's picture there was its square thumbnail (`client/public/units/<key>_profile_thumbnail.png`), cropped by
`.face-box` around the unit's face point (`UNIT_FACE` in `client/src/main.js`). From b1105dw a unit can have a cut of its own,
taken from its profile art (`UNIT_CARD_ART`, `client/public/units/<key>_card.png`), and this page is how the cut is chosen: the
user frames it, copies the numbers, and the cut goes into the game as it is.

Made for the line from 0.9.5 (`Proto_0.9.5_BA_UI`), which has `UNIT_CARD_ART`; this branch's own client is older and has no such card.

## Files

| file | what |
| --- | --- |
| `line_up_card_crop.html` | the page: one file with the units' profile pictures inside, opens in any browser |
| `template.html` | its source, with `__IMG_<KEY>__` where each unit's picture goes |
| `build.py` | `python3 build.py [--units <checkout>/client/public/units] [--out <file>]` — the template with the pictures embedded, written to `line_up_card_crop.html` (the units folder defaults to this checkout's; Saori's and Yuuka's pictures are the same here as on 0.9.5) |
| `check.cjs` | `node check.cjs line_up_card_crop.html <checkout>/client/dist <out dir> [unit ...]` — each unit's "Now in game" against the card the game draws, on both screen heights; prints `match` or `DIFFERS` for each and exits 1 on a difference. Needs Playwright and a built client (`npm run build` in `client/`) |
| `register.py` | `python3 register.py <thumb.png> <profile.png>` — where a thumbnail sits in its profile picture: the square (x0, y0, size) that, scaled to the thumbnail, matches it best (FFT search; numpy, Pillow) |
| `face_sheet.mjs` | `node face_sheet.mjs <checkout>/client/public/units` — a contact sheet of every thumbnail with a 10% grid, to read the face points by eye (writes `face_sheet.html` and `face_sheet.png` in the current folder; Playwright) |

The published copy of the page is https://claude.ai/artifact/VtZ1PpZGihwUo1K59bq8dr (private to its owner).

## Using the page

- Choose the unit at the top. Drag the box to move it, drag a corner to resize it, tap the picture anywhere to bring the box there;
  zoom with the slider, the mouse wheel or + / −; Higher, Lower, Left and Right move it 2 px, the arrow keys 1 px (5 with Shift).
- **Now in game** is what the card shows today, **Original** what it showed before the unit had a cut of its own. Zoom 100% is the
  size the unit has in the card today. The picture behind the box is the unit's class colour, as the card's.
- The two cards beside the editor are the line-up card at its real size, on a computer and on a phone.
- **Copy numbers** puts, for example, `Yuuka card crop, yuuka_profile.png 532x532: x 50, y 91, w 429, h 266` on the clipboard
  (where a browser blocks it, the numbers are selected for copying by hand). The numbers are profile-picture pixels.
- The page keeps the last crop of each unit in the browser (`localStorage`, `line-up-crop:<key>`); it works without it.

## Putting a crop into the game

1. Cut the picture from the profile art as it is, no resampling:
   `python3 -c "from PIL import Image; Image.open('client/public/units/<key>_profile.png').crop((x, y, x + w, y + h)).save('client/public/units/<key>_card.png', optimize=True)"`
2. In `client/src/main.js`, add `<key>: '<key>_card.png'` to `UNIT_CARD_ART`. `renderTeamCard` then shows it, and `style.css`
   `.card-art` lets it fill the box (`object-fit: cover`); the 108 px box loses 44% of the 10 px above and the rest below, as
   `.face-box` keeps a face at 44% of its box. Nothing else shows the file.
3. In `template.html`, make the cut the unit's **Now in game** and keep the old one as **Original**; `python3 build.py`, then
   `node check.cjs ...` against a fresh build: `match` on both heights.
4. For the PT site, publish `units/<key>_card.png` with the new bundle.

## Adding a unit to the page

1. Find its thumbnail in its profile picture:
   `python3 register.py client/public/units/<key>_profile_thumbnail.png client/public/units/<key>_profile.png` → `crop x0 .. y0 ..
   size ..` (the scale should read 1.000; every thumbnail so far is a plain square of its profile).
2. Its face point: `UNIT_FACE[<key>]` in `client/src/main.js` (x, y), 0.5 / 0.62 when it has none. Check the unit has no
   `UNIT_CARD_ART` entry yet; if it has, that cut is its Now in game.
3. What the card shows today, in profile pixels: the square thumbnail is drawn 190 px wide in the 190 × 118 box, so its whole width
   shows and its height is cut around the eye line, which `.face-box` puts at 44% of the box:
   `x = x0`, `w = size`, `y = y0 + size × min(72, max(0, 190 × fy − 51.92)) / 190` (51.92 = 0.44 × 118; 72 = 190 − 118).
   Yuuka (b1105dx's before): x0 86, y0 0, size 369, fy 0.62 → x 86, y 127.9, w 369.
4. In `template.html`: a `UNITS` entry (name, profile file and size, the card's second line — class · weapon, as the lobby shows it —
   its class colour from `style.css` `.menu [data-class=...]`, and the presets) and a `data-unit` button.
5. `python3 build.py`, then `node check.cjs line_up_card_crop.html <dist> <out> <key>`: `match` on both heights.

## History

- b1105du, b1105dv (2026-11-09): Saori's face point moved in this card alone, 0.62 → 0.55 → 0.585 ("Saori in this specific photo
  style should be cropped a bit more higher"; "crop it in the height between these yellow marked versions").
- 2026-11-09, the page, for Saori: "Still not satisfied with that specific Saori photo. Make a quick tool for me to crop that photo
  from Saori profile image."
- b1105dw: Saori's cut, x 120 y 117 w 339 h 210 — `UNIT_CARD_ART` and `.card-art` came with it. Then "I also want to recrop some
  other unit": Yuuka joined the page; b1105dx: her cut, x 50 y 91 w 429 h 266.
- Checked (2026-11-09, `check.cjs` on the b1105dx build): each unit's Now in game and the game's card differ by 2–4.5 levels on
  average, within half a CSS pixel of offset, on both heights; a crop before the change reads 40 and more against them.
