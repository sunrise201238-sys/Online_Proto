"""A modelled map taken out of a tree (the reverse of map_splice.py): its boundary row, data entry, spawn row (with the
comment lines over it) and arena row in arena.js, its name row (with the note over it) in constants.js, its rows in the
client's GLB_MAPS and MAP_DATA, the README's paragraph and count. The served model and card are left for the caller.
usage: python3 -I map_remove.py <tree root> <key> <Name> [Count before,Count after]   (e.g. Sixteen,Fifteen)"""
import os, re, sys
root, key, name = sys.argv[1:4]; before, after = (sys.argv[4] if len(sys.argv) > 4 else '').split(',') if len(sys.argv) > 4 else (None, None)
def rw(rel, f):
    p = os.path.join(root, rel); t = open(p, encoding='utf-8').read(); t2 = f(t); assert t2 != t, (rel, 'nothing removed'); open(p, 'w', encoding='utf-8').write(t2); print('edited', rel)
def drop_line(t, regex, with_comments=False, extra_lines=0):
    lines = t.split('\n'); hits = [i for i, l in enumerate(lines) if re.match(regex, l)]; assert len(hits) == 1, (regex, len(hits)); i = hits[0]
    j = i + 1 + extra_lines; k = i
    if with_comments:
        while k > 0 and lines[k - 1].startswith('  // '): k -= 1
    return '\n'.join(lines[:k] + lines[j:])
def arena(t):
    t = drop_line(t, rf"  {re.escape(key)}:\s+\{{ halfX")
    s = t.index(f'  "{key}": {{\n'); e = t.index('\n  },\n', s) + len('\n  },\n'); t = t[:s] + t[e:]
    lines = t.split('\n'); hits = [i for i, l in enumerate(lines) if l.startswith(f"  {key}: {{ p1:")]; assert len(hits) == 1; i = hits[0]
    extra = 0 if lines[i].rstrip().endswith('} },') else 1   # (the spawn row runs on to a `more` line)
    t = drop_line(t, rf"  {re.escape(key)}: \{{ p1:", with_comments=True, extra_lines=extra)
    return drop_line(t, rf"  {re.escape(key)}: buildGeneratedArena\(")
rw('shared/src/sim/arena.js', arena)
rw('shared/src/sim/constants.js', lambda t: drop_line(t, rf"  {re.escape(key)}: \{{ id: '{re.escape(key)}'", with_comments=True))
rw('client/src/main.js', lambda t: drop_line(drop_line(t, rf"  {re.escape(key)}: \{{ file: 'maps/"), rf"  {re.escape(key)}: \{{ name: '"))
def readme(t):
    s = t.index(f'**{name}** ('); e = t.index('\n\n', s) + 2; t = t[:s] + t[e:]
    if before: t = t.replace(f'{before} arenas: ', f'{after} arenas: ', 1)
    return t.replace(f'{name}, ', '', 1) if f'{name}, ' in t.split('arenas: ', 1)[1].split('\n', 1)[0] else t
rw('README.md', readme)
print(key, 'removed')
