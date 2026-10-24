"""The hit-rate chart drawn from hitcurve.mjs's json (PIL; the 0.8.4 picture's layout: a panel per unit, three curves,
a footer with the series means). usage: python3 hitcurve_png.py <curves.json> <out.png> <title>"""
import json, sys
from PIL import Image, ImageDraw, ImageFont
src, out, title = sys.argv[1:4]
D = json.load(open(src))
NAMES = {'unit1': 'Saori', 'unit9': 'Asuna', 'unit14': 'Subaru', 'unit4': 'Atsuko', 'unit13': 'Marina', 'unit15': 'Yuuka', 'unit17': 'Kurumi', 'unit2': 'Hoshino', 'unit11': 'Haruka', 'unit18': 'Rabu', 'unit12': 'Koyuki', 'unit5': 'Hina', 'unit10': 'Fubuki', 'unit7': 'Aris', 'unit3': 'Aru', 'unit6': 'Kei'}
ORDER = ['unit1', 'unit9', 'unit14', 'unit4', 'unit13', 'unit15', 'unit17', 'unit2', 'unit11', 'unit18', 'unit12', 'unit5', 'unit10', 'unit7', 'unit3', 'unit6']
COL = {'still': (45, 111, 214), 'walk': (232, 112, 42), 'sprint': (31, 163, 109)}
LABEL = {'still': 'Stationary', 'walk': 'Walk', 'sprint': 'Sprint'}
F = lambda s, b=False: ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if b else ''}.ttf", s)
SC = 2   # drawn at 2x for crisp lines
W, COLS, ROWS = 2000, 4, 4; PW, PH, GX, GY = 470, 250, 20, 20; TOP = 125
H = TOP + ROWS * (PH + GY) + 10
im = Image.new('RGB', (W * SC, H * SC), (255, 255, 255)); d = ImageDraw.Draw(im)
def text(x, y, s, size, fill=(40, 40, 40), bold=False, anchor='la'): d.text((x * SC, y * SC), s, font=F(size * SC, bold), fill=fill, anchor=anchor)
def line(pts, fill, width): d.line([(x * SC, y * SC) for x, y in pts], fill=fill, width=width * SC, joint='curve')
text(20, 18, title, 17, bold=True)
text(20, 46, "Target orbits the shooter at her lock range, tangentially at 0 / her walk speed / walk + 11.76 u/s; the shooter strafes at her walk speed and holds the trigger through one magazine, obeying the bot fire gate", 10.5, (80, 80, 80))
text(20, 62, "(Fubuki and Aris: one round per 0.6 s from a recovered cone). Lines are a short moving average; dots are raw rounds (magazines <= 40). 200 runs per series, on the shared sim, Plain Field.", 10.5, (80, 80, 80))
lx = 20
for k in ('still', 'walk', 'sprint'):
    line([(lx, 93), (lx + 14, 93)], COL[k], 3); text(lx + 20, 86, LABEL[k] + ' target', 12); lx += 150
def smooth(v, w=3):
    o = []
    for i in range(len(v)):
        a = max(0, i - w // 2); b = min(len(v), i + w // 2 + 1); xs = [x for x in v[a:b] if x is not None]; o.append(sum(xs) / len(xs) if xs else None)
    return o
for n, key in enumerate(ORDER):
    u = D[key]; r, c = divmod(n, COLS); x0 = 20 + c * (PW + GX); y0 = TOP + r * (PH + GY)
    d.rounded_rectangle([x0 * SC, y0 * SC, (x0 + PW) * SC, (y0 + PH) * SC], radius=6 * SC, outline=(205, 205, 205), width=SC, fill=(252, 252, 252))
    text(x0 + 12, y0 + 8, NAMES[key], 13, bold=True); text(x0 + PW - 12, y0 + 10, f"@{u['lock']} u · walk {u['walk']} · mag {u['mag']}", 10, (90, 90, 90), anchor='ra')
    px0, px1, py0, py1 = x0 + 44, x0 + PW - 14, y0 + 34, y0 + PH - 50; mag = u['mag']
    for pct in (0, 50, 100):
        y = py1 - (py1 - py0) * pct / 100; line([(px0, y), (px1, y)], (225, 225, 225), 1); text(px0 - 6, y - 6, f"{pct}%", 9, (110, 110, 110), anchor='ra')
    xs = lambda i: px0 + (px1 - px0) * (i / max(1, mag - 1))
    for k in ('still', 'walk', 'sprint'):
        cv = u['series'][k]['curve']; sm = smooth(cv, 3 if mag <= 40 else 7)
        if mag <= 40:
            for i, v in enumerate(cv):
                if v is None: continue
                cx, cy = xs(i), py1 - (py1 - py0) * v; d.ellipse([(cx - 2) * SC, (cy - 2) * SC, (cx + 2) * SC, (cy + 2) * SC], fill=tuple(int(c * 0.45 + 255 * 0.55) for c in COL[k]))
        pts = [(xs(i), py1 - (py1 - py0) * v) for i, v in enumerate(sm) if v is not None]
        if len(pts) >= 2: line(pts, COL[k], 2)
        elif pts: cx, cy = pts[0]; d.ellipse([(cx - 3) * SC, (cy - 3) * SC, (cx + 3) * SC, (cy + 3) * SC], fill=COL[k])
    ticks = [1, mag] if mag <= 10 else [1] + [t for t in (10, 20, 50, 100, 150, 200) if t < mag] + [mag]
    for t in ticks: text(xs(t - 1), py1 + 6, str(t), 9, (110, 110, 110), anchor='ma')
    text(x0 + 12, y0 + PH - 20, 'round', 9, (110, 110, 110))
    fx = x0 + PW - 12
    for k in ('sprint', 'walk', 'still'):
        s = u['series'][k]; label = f"{LABEL[k]} {round(s['mean'] * 100, 1) if s['mean'] is not None else '—'}%"
        tw = d.textlength(label, font=F(10 * SC, True)) / SC; fx -= tw; text(fx, y0 + PH - 22, label, 10, (40, 40, 40), bold=True); fx -= 16; line([(fx + 2, y0 + PH - 16), (fx + 11, y0 + PH - 16)], COL[k], 3); fx -= 8
im = im.resize((W * SC // 1, H * SC // 1)) if False else im
im.save(out, optimize=True); print('wrote', out, im.size)
