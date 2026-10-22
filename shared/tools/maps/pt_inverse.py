"""The PT tree's files put back into the 0.8.9 line's form: every replacement of pt_deltas.py undone (new -> old, each asserted
once) and the appended PT switch stripped, so a file edited on the PT site can be copied into the 0.8.9 tree.
usage: python3 -I pt_inverse.py <pt_deltas.py> <pt tree root> <out dir>   (writes the five files pt_deltas.py touches, same relative paths)"""
import ast, os, re, sys
deltas, root, out = sys.argv[1:4]
src = open(deltas, encoding='utf-8').read()
tree = ast.parse(src)
# (the tag: whatever the PT tree carries)
main = open(os.path.join(root, 'client/src/main.js'), encoding='utf-8').read()
tag = re.search(r"const CLIENT_BUILD_TAG = '([^']+)';", main).group(1)
env = {'tag': tag}
# (VIEW and the other module-level string constants, so the pairs that use them evaluate)
for node in tree.body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and isinstance(node.value, ast.Constant):
        env[node.targets[0].id] = node.value.value
pairs = {}
for node in tree.body:
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and getattr(node.value.func, 'id', None) == 'edit':
        rel = node.value.args[0].value
        lst = eval(compile(ast.Expression(node.value.args[1]), '<pairs>', 'eval'), dict(env))
        pairs.setdefault(rel, []).extend(lst)
for rel, ps in pairs.items():
    t = open(os.path.join(root, rel), encoding='utf-8').read(); ok = True
    for old, new in reversed(ps):
        if t.count(new) != 1: print('NOT undone', rel, repr(new[:70]), 'found', t.count(new)); ok = False; break
        t = t.replace(new, old)
    if not ok: continue
    p = os.path.join(out, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(t); print('undone', rel, len(ps))
# (the appended switch in constants.js)
rel = 'shared/src/sim/constants.js'; t = open(os.path.join(root, rel), encoding='utf-8').read()
tail = "\n// (PT site only, pt_deltas.py: no fighter's boost drains — the maps are tested on foot and in the air without the gauge)\nexport const PT = { infiniteBoost: true };   // (a switch: F10 on the page flips it)\n"
assert t.endswith(tail), 'constants.js does not end with the PT switch'; t = t[:-len(tail)]
p = os.path.join(out, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(t); print('undone', rel, 'append')
print('tag was', tag)
