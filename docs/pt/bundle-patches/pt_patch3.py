# pt_patch3.py <PT bundle in> <PT bundle out> — the b1105jt change (Minori's left fingers put away while she walks and sprints)
# written into PT's published script, each edit at a place counted first; fails without writing if a count is off.
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
edits = [
  # borrowClip: the kept clip's id carries the tucked bones
  ('|${n.whole?1:0}`;', '|${n.whole?1:0}|${(n.tuck??[]).join(",")}`;', 1),
  # borrowClip: one track of one key for each tucked bone the rig has; the rig's own clip gives a tucked bone no scale
  ('m=u?u.tracks.filter(g=>!c.has(g.name.split(".")[0])||whole_&&g.name.endsWith(".scale")).map(g=>g.clone().scale(l.duration/u.duration)):[],d=new Ns(`${l.name}+${n.base??""}`,l.duration,[...l.tracks,...m]),',
   'tucked_=(n.tuck??[]).filter(g=>a.has(g)),tuck_=tucked_.map(g=>new Wr(`${g}.scale`,[0],[.001,.001,.001])),m=u?u.tracks.filter(g=>{const[p,q]=g.name.split(".");return q==="scale"&&tucked_.includes(p)?!1:!c.has(p)||whole_&&q==="scale"}).map(g=>g.clone().scale(l.duration/u.duration)):[],d=new Ns(`${l.name}+${n.base??""}`,l.duration,[...l.tracks,...m,...tuck_]),', 1),
  # UNIT_MODELS.minori: the three run entries tuck her left fingers
  ('from:"models/subaru_move_clip.json",base:"Move_Ing",whole:!0,',
   'from:"models/subaru_move_clip.json",base:"Move_Ing",whole:!0,tuck:["Bip001_L_Finger0","Bip001_L_Finger1","Bip001_L_Finger2"],', 3),
  # the build tag
  ('b1105jr 11-18', 'b1105jt 11-19', 1),
]
for nm in ('tucked_', 'tuck_', 'tuck:'):
    assert s.count(nm) == 0, nm
assert s.count('class Wr extends Ss{constructor(e,t,n,s){super(e,t,n,s)}}Wr.prototype.ValueTypeName="vector"') == 1   # (Wr is the vector track)
for old, new, n in edits:
    k = s.count(old)
    if k != n: print('COUNT OFF:', k, 'for', old[:70]); sys.exit(1)
    s = s.replace(old, new)
open(dst, 'w', encoding='utf-8').write(s)
print('patched', len(edits), 'edits; bytes', len(s.encode('utf-8')))
