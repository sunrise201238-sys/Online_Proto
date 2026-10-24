"""The PT site, defined as what it adds to a tree of this line (2026-10-24; the first of 2026-10-21 carried the tools
themselves, now in the tree as dev tools): the served models' extension .wasm (the artifact host serves no .glb), the build
tag, and the dev tools switched on — DEV_TOOLS_DEFAULT in the client (the F-keys, the photo mode, the build line) and the
sim's DEV_SIM.infiniteBoost (the gauge never drains; F10 flips it). Every replacement asserted once.
usage: python3 -I pt_deltas.py <tree root> <tag>"""
import os, sys
root, tag = sys.argv[1:3]
def edit(rel, pairs):
    p = os.path.join(root, rel); t = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert t.count(old) == 1, (rel, old[:80], t.count(old)); t = t.replace(old, new)
    open(p, 'w', encoding='utf-8').write(t); print('edited', rel, len(pairs))
tagline = [l for l in open(os.path.join(root, 'client/src/main.js'), encoding='utf-8').read().split('\n') if l.startswith('const CLIENT_BUILD_TAG = ')]
assert len(tagline) == 1, tagline
edit('client/src/main.js', [
    ("const MODEL_FILE_EXT = '.glb';", "const MODEL_FILE_EXT = '.wasm';"),
    ("const MAP_FILE_EXT = '.glb';", "const MAP_FILE_EXT = '.wasm';"),
    (tagline[0], f"const CLIENT_BUILD_TAG = '{tag}';"),
    ("const DEV_TOOLS_DEFAULT = false;", "const DEV_TOOLS_DEFAULT = true;   // (PT site, pt_deltas.py: the dev tools on)"),
])
edit('shared/src/sim/constants.js', [
    ("export const DEV_SIM = { infiniteBoost: false };", "export const DEV_SIM = { infiniteBoost: true };   // (PT site, pt_deltas.py: the boost never drains, F10 flips it)"),
])
print('PT site deltas applied to', root, 'as', tag)
