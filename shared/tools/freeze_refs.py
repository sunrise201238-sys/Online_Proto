"""The bots' frozen references re-frozen at a build (shared/test/nb_equiv.test.js and sdbrain_equiv.test.js play the live
brain tick for tick against them): nbrain.js, ai.js and sdbrain.js copied to shared/test/<name>_<tag>_ref.js with their
imports pointed at the live sim and at each other's frozen copies, a FROZEN header on each, the two equivalence tests'
imports moved to the new tag, and the previous tag's copies removed. Run after a brain change made by design (the user's
call), never to paper over drift: the tests exist to catch the drift.
usage: python3 -I freeze_refs.py <tree root> <tag>     (e.g. freeze_refs.py . b1023n; the previous tag is read off the tests)"""
import os, re, sys
root, tag = sys.argv[1:3]
sim = os.path.join(root, 'shared/src/sim'); tests = os.path.join(root, 'shared/test')
MODULES = ['nbrain', 'ai', 'sdbrain']
HEADER = ("// FROZEN at {tag} for the bots' equivalence tests (nb_equiv.test.js, sdbrain_equiv.test.js): a copy of\n"
          "// shared/src/sim/{name}.js with its imports pointed at the live sim and at the other frozen copies. Not edited by hand;\n"
          "// re-frozen with the build whose play it must match (shared/tools/freeze_refs.py).\n")
def refname(name): return f'{name}_{tag}_ref.js'
for name in MODULES:
    src = open(os.path.join(sim, name + '.js'), encoding='utf-8').read()
    def point(m):
        target = m.group(2)
        if target in MODULES: return f"{m.group(1)}'./{refname(target)}'"
        return f"{m.group(1)}'../src/sim/{target}.js'"
    out = re.sub(r"(from )'\./([A-Za-z0-9_]+)\.js'", point, src)
    # (a frozen copy of an earlier freeze would carry its own header; the live file never does)
    open(os.path.join(tests, refname(name)), 'w', encoding='utf-8').write(HEADER.format(tag=tag, name=name) + out)
    print('frozen', refname(name))
old_tags = set()
for tf in ('nb_equiv.test.js', 'sdbrain_equiv.test.js'):
    p = os.path.join(tests, tf); t = open(p, encoding='utf-8').read()
    for m in re.finditer(r"'\./(?:nbrain|ai|sdbrain)_([A-Za-z0-9]+)_ref\.js'", t): old_tags.add(m.group(1))
    t2 = re.sub(r"'\./(nbrain|ai|sdbrain)_[A-Za-z0-9]+_ref\.js'", lambda m: f"'./{m.group(1)}_{tag}_ref.js'", t)
    assert t2 != t or tag in t, tf
    open(p, 'w', encoding='utf-8').write(t2); print('tests ->', tag, tf)
for old in old_tags - {tag}:
    for name in MODULES:
        p = os.path.join(tests, f'{name}_{old}_ref.js')
        if os.path.exists(p): os.remove(p); print('removed', os.path.basename(p))
