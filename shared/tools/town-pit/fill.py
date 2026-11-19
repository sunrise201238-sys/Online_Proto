# fill.py <town_data.json> — b1105jp: the strip between the raised deck's east edge (x 268) and the map's east edge (x 270),
# z 128..184, filled as the strip south of it already is (x 268..270, z 56..128): a box from under the street to the deck's
# 15.51 and a floor on it. Appended; nothing else in the file changes. Asserts the strip is empty at street level first.
import json, sys
p = sys.argv[1]; d = json.load(open(p))
BOX = {"minX": 268, "maxX": 270, "minZ": 128, "maxZ": 184, "minY": -2, "maxY": 15.51, "topBuffer": 0.8}
FLOOR = {"minX": 267.92, "maxX": 270.08, "minZ": 127.92, "maxZ": 184.08, "maxTop": 15.51, "type": "flat", "top": 15.51}
assert BOX not in d['obstacles'] and FLOOR not in d['surfaces'], 'already there'
# nothing stands in the strip from the street to the deck's height but the box roofed at 15.33 and the low rail
inside = [o for o in d['obstacles'] if o['minX'] < 269.9 and o['maxX'] > 268.1 and o['minZ'] < 183.9 and o['maxZ'] > 128.1 and o.get('minY', 0) < 15.0]
print('boxes in the strip below 15 before:', inside)
d['obstacles'].append(BOX); d['surfaces'].append(FLOOR)
open(p, 'w').write(json.dumps(d, separators=(',', ':')))
print('boxes', len(d['obstacles']), 'floors', len(d['surfaces']))
