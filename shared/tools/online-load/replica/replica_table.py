# usage: python3 -I replica_table.py <batches.txt>... : each measured match on a line: the map, the kind of match, the rules, the knobs,
# then the mean of its [prof] windows (the first left out when there are more than two): a tick's three parts in ms, the process's CPU
# in ms a second, memory, the worst tick of the server's own [tick] lines, and what one player is sent.
# A match is known by its label; lines under the same label in several files are read together.
import re, sys
order = []; recs = {}
for path in sys.argv[1:]:
    cur = None
    for line in open(path, encoding='utf-8'):
        m = re.match(r'== (\S+) \((.*)\)', line)
        if m:
            cur = recs.get(m.group(1))
            if cur is None: cur = recs[m.group(1)] = {'what': '', 'w': [], 'drv': '', 'mem': None, 'max': None, 'over': 0}; order.append(m.group(1))
            if ';' in m.group(2): cur['what'] = m.group(2)
            continue
        if cur is None: continue
        if line.startswith('driver:'): cur['drv'] = line.strip()
        m = re.search(r"a tick: bots ([\d.]+) ms, shared tick ([\d.]+) ms, snapshots ([\d.]+) ms; the process's CPU ([\d.]+) ms a second", line)
        if m:
            cur['w'].append(tuple(float(x) for x in m.groups())); mm = re.search(r'memory (\d+) MB', line)
            if mm: cur['mem'] = int(mm.group(1))
        m = re.search(r'\[tick\] 30 s: mean [\d.]+ ms, max (\d+) ms, over 16 ms (\d+)', line)
        if m: cur['max'] = max(cur['max'] or 0, int(m.group(1))); cur['over'] += int(m.group(2))
print('%-16s %-11s %-4s %-3s %-3s | %7s %7s %7s | %9s | %6s | %8s | %-22s | %s' % ('label', 'map', 'mode', 'pl.', 'SD', 'bots', 'tick', 'snap', 'CPU ms/s', 'mem MB', 'worst ms', 'sent to one player', 'knobs'))
for label in order:
    r = recs[label]; w = r['w'][1:] if len(r['w']) > 2 else r['w']
    h = re.match(r'(\S+) (1v1|2v2), (\d+) player\(s\); ?(.*)', r['what']); mp, mode, pl, knobs = h.groups() if h else ('?', '?', '?', r['what'])
    knobs = ' '.join(k for k in knobs.split() if k != 'GOD=1') or '-'; god = 'GOD=1' in r['what']
    if not w: print('%-16s %-11s %-4s %-3s no [prof] lines | %s' % (label, mp, mode, pl, r['drv'][:100])); continue
    mean = [sum(x[i] for x in w) / len(w) for i in range(4)]
    sn = re.search(r'snapshots to one player ([\d.]+) a second, about (\d+) bytes', r['drv']); sent = ('%s/s x %s B = %.0f kB/s' % (sn.group(1), sn.group(2), float(sn.group(1)) * float(sn.group(2)) / 1000)) if sn else '?'
    print('%-16s %-11s %-4s %-3s %-3s | %7.3f %7.3f %7.3f | %9.1f | %6s | %8s | %-22s | %s%s' % (label, mp, mode, pl, 'SD' if 'SUDDEN DEATH' in r['drv'] else '-', mean[0], mean[1], mean[2], mean[3],
        r['mem'] if r['mem'] is not None else '-', r['max'] if r['max'] is not None else '-', sent, knobs, '' if god else ' (units can fall)'))
