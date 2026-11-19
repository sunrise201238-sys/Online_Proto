# pt_patch.py <PT bundle in> <PT bundle out> — the b1105jq change (Aris's plain body is not drawn) written into PT's published
# script, each edit at a place that occurs exactly once; fails without writing if any place is not found once.
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
edits = [
  # UNIT_MODELS.aris: the `away` list
  ('aris:{file:"models/aris_v2",height:yn,clips:{',
   'aris:{file:"models/aris_v2",height:yn,away:/^CH0334_Body(_\\d+)?$/,clips:{'),
  # makeUnitModel: a model's `away` meshes are hidden, marked neverDrawn, and get no silhouette
  ('const c=[];o.traverse(u=>{u.isSkinnedMesh&&!/^Mouth_/i.test(u.name)&&c.push(u)});',
   'const c=[],awayRx_=n.cfg.away;awayRx_&&o.traverse(u=>{u.isMesh&&awayRx_.test(u.name)&&(u.visible=!1,u.userData.neverDrawn=!0)});o.traverse(u=>{u.isSkinnedMesh&&u.visible&&!/^Mouth_/i.test(u.name)&&c.push(u)});'),
  # matchWarmDraw: the warm frame leaves neverDrawn meshes alone
  ('W.traverse(l=>{l===Ya||l===Qr||(!l.visible&&!l.isLight&&(l.visible=!0,e.push(l)),',
   'W.traverse(l=>{l===Ya||l===Qr||l.userData.neverDrawn||(!l.visible&&!l.isLight&&(l.visible=!0,e.push(l)),'),
  # the build tag
  ('b1105jp 11-18', 'b1105jq 11-18'),
]
assert s.count('awayRx_') == 0 and s.count('neverDrawn') == 0
for old, new in edits:
    n = s.count(old)
    if n != 1: print('NOT FOUND ONCE:', n, old[:60]); sys.exit(1)
    s = s.replace(old, new)
open(dst, 'w', encoding='utf-8').write(s)
print('patched', len(edits), 'places; bytes', len(s.encode('utf-8')))
