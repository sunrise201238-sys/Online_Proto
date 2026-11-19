# pt_patch4.py <PT css in> <PT js in> <out dir> — the b1105ju change (the LAST tag is the card's ::before) written into PT's
# published style sheet, and the build tag into its script; each edit at a place counted first, nothing written if a count is off.
import sys, os
css_in, js_in, out = sys.argv[1:4]
c = open(css_in, encoding='utf-8').read(); j = open(js_in, encoding='utf-8').read()
olds = [o for o in ('.menu .unit-card.last-pick:after{content:"LAST " attr(data-last)', '.menu .unit-card.last-pick::after{content:"LAST " attr(data-last)') if c.count(o) == 1]
if len(olds) != 1: print('the LAST rule not found once:', [c.count(o) for o in ('.menu .unit-card.last-pick:after{', '.menu .unit-card.last-pick::after{')]); sys.exit(1)
old = olds[0]; new = old.replace('last-pick::after{', 'last-pick::before{').replace('last-pick:after{', 'last-pick:before{')
assert c.count('.unit-card.last-pick:before') == 0 and c.count('.unit-card.last-pick::before') == 0
assert c.count('.menu .unit-card.selecting:after{content:"PICK!"') + c.count('.menu .unit-card.selecting::after{content:"PICK!"') == 1   # (the PICK! tag keeps the ::after)
c = c.replace(old, new)
assert j.count('b1105jt 11-19') == 1; j = j.replace('b1105jt 11-19', 'b1105ju 11-19')
os.makedirs(os.path.join(out, 'assets'), exist_ok=True)
open(os.path.join(out, 'assets', os.path.basename(css_in)), 'w', encoding='utf-8').write(c)
open(os.path.join(out, 'assets', os.path.basename(js_in)), 'w', encoding='utf-8').write(j)
print('css rule:', new[:64], '| css bytes', len(c.encode('utf-8')), '| js bytes', len(j.encode('utf-8')))
