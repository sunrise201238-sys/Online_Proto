# build.py [--units <dir>] [--out <file>] — the Line-up Card Crop page: template.html with each unit's profile picture embedded, so
# the page is one file that opens anywhere. Every __IMG_<KEY>__ mark in the template takes <dir>/<key>_profile.png.
# <dir>: a checkout's client/public/units (default: this checkout's). <file>: default line_up_card_crop.html beside this script.
import argparse, base64, re
from pathlib import Path

here = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description='Embed the units\' profile pictures into the Line-up Card Crop page.')
ap.add_argument('--units', default=str(here.parents[2] / 'client' / 'public' / 'units'), help='folder with <key>_profile.png')
ap.add_argument('--out', default=str(here / 'line_up_card_crop.html'), help='the page to write')
args = ap.parse_args()

page = (here / 'template.html').read_text(encoding='utf-8')
keys = sorted(set(re.findall(r'__IMG_([A-Z0-9_]+)__', page)))
for key in keys:
    src = Path(args.units) / f'{key.lower()}_profile.png'
    page = page.replace(f'__IMG_{key}__', 'data:image/png;base64,' + base64.b64encode(src.read_bytes()).decode())
assert '__IMG_' not in page
Path(args.out).write_text(page, encoding='utf-8')
print('built', args.out, 'with', ', '.join(k.lower() for k in keys) + ';', len(page), 'bytes')
