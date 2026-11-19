# pt_patch2.py <PT bundle in> <PT bundle out> — the b1105jr change (Minori walks and sprints with Subaru's motion) written into
# PT's published script, each edit at a place that occurs exactly once; fails without writing if any place is not found once.
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
old_fn = ('function Ok(i,e,t,n,s=[]){W3(n.from).then(o=>{const a=new Set;e.traverse(g=>{g.name&&a.add(g.name)});const r=g=>/^Bip001/.test(g)&&!/eye|Xtra|Weapon/i.test(g),'
          'l=Ns.parse({...o,tracks:o.tracks.filter(g=>{const p=g.name.split(".")[0];return g.type==="quaternion"&&a.has(p)&&r(p)})});if(!l.tracks.length||!i.mixer)return;'
          'const c=new Set(l.tracks.map(g=>g.name.split(".")[0])),u=n.base?Ns.findByName(s,n.base):null,m=u?u.tracks.filter(g=>!c.has(g.name.split(".")[0])).map(g=>g.clone().scale(l.duration/u.duration)):[],'
          'd=new Ns(`${l.name}+${n.base??""}`,l.duration,[...l.tracks,...m]),h=i.mixer.clipAction(d);n.once&&(h.setLoop(kr,1),h.clampWhenFinished=!0);'
          'const f=/Shield|Plate|Pistol|Bullet|Holster|Pocket|Grenade/i,y=[...new Set(d.tracks.map(g=>g.name.split(".")[0]))].filter(g=>!f.test(g)).map(g=>e.getObjectByName(g)).filter(g=>g&&!g.isMesh);'
          'i.actions[t]={action:h,cfg:n,dur:d.duration,body:y}}).catch(o=>console.warn("borrowed clip",n.from,o))}')
new_fn = ('function Ok(i,e,t,n,s=[]){W3(n.from).then(o=>{if(!i.mixer)return;const kept_=i.borrowed??(i.borrowed=new Map),id_=`${n.from}|${n.base??""}|${n.once?1:0}|${n.whole?1:0}`;let made_=kept_.get(id_);'
          'if(!made_){const a=new Set;e.traverse(g=>{g.name&&a.add(g.name)});const whole_=!!n.whole,r=g=>/^Bip001/.test(g)&&!/eye|Xtra/i.test(g)&&(whole_||!/Weapon/i.test(g)),'
          'l=Ns.parse({...o,tracks:o.tracks.filter(g=>{const p=g.name.split(".")[0];return(g.type==="quaternion"||whole_&&g.name.endsWith(".position"))&&a.has(p)&&r(p)})});if(!l.tracks.length)return;'
          'const c=new Set(l.tracks.map(g=>g.name.split(".")[0])),u=n.base?Ns.findByName(s,n.base):null,m=u?u.tracks.filter(g=>!c.has(g.name.split(".")[0])||whole_&&g.name.endsWith(".scale")).map(g=>g.clone().scale(l.duration/u.duration)):[],'
          'd=new Ns(`${l.name}+${n.base??""}`,l.duration,[...l.tracks,...m]),'
          'f=/Shield|Plate|Pistol|Bullet|Holster|Pocket|Grenade/i,y=[...new Set(d.tracks.map(g=>g.name.split(".")[0]))].filter(g=>!f.test(g)).map(g=>e.getObjectByName(g)).filter(g=>g&&!g.isMesh);'
          'kept_.set(id_,made_={clip:d,eased:y})}const h=i.mixer.clipAction(made_.clip);n.once&&(h.setLoop(kr,1),h.clampWhenFinished=!0);'
          'i.actions[t]={action:h,cfg:n,dur:made_.clip.duration,body:made_.eased}}).catch(o=>console.warn("borrowed clip",n.from,o))}')
mv = 'name:"Move_Ing",from:"models/subaru_move_clip.json",base:"Move_Ing",whole:!0,speed:'
edits = [
  (old_fn, new_fn),
  ('minori:{file:"models/minori",height:yn,clips:{...ii,dodge:{',
   'minori:{file:"models/minori",height:yn,clips:{...ii,walk:{' + mv + '.5},sprint:{' + mv + '1},sprintShoot:{' + mv + '1},dodge:{'),
  ('b1105jq 11-18', 'b1105jr 11-18'),
]
for nm in ('kept_', 'id_=', 'made_', 'whole_', 'subaru_move_clip'):
    assert s.count(nm) == 0, nm
for old, new in edits:
    n = s.count(old)
    if n != 1: print('NOT FOUND ONCE:', n, old[:70]); sys.exit(1)
    s = s.replace(old, new)
open(dst, 'w', encoding='utf-8').write(s)
print('patched', len(edits), 'places; bytes', len(s.encode('utf-8')))
