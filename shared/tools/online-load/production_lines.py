# usage: python3 -I production_lines.py <out.tsv> <name>=<prefix> [<name>=<prefix> ...]
# The production servers' own lines in time order, and a summary by the kind of match. A <prefix> is what render_tick_lines.sh wrote
# (<prefix>_tick.json and <prefix>_match.json); <name> is what the server is called in the table (its region, say).
# A [tick] line is the server's own count of a 30 s window; it is given to the match whose start line came last before it on that server.
import json, sys, re, collections
out = sys.argv[1]; rows = []
for arg in sys.argv[2:]:
    name, prefix = arg.split('=', 1); ev = []
    for kind in ('tick', 'match'):
        j = json.load(open('%s_%s.json' % (prefix, kind))); logs = j.get('logs', []) if isinstance(j, dict) else j
        for l in logs: ev.append((l.get('timestamp', '')[:19], (l.get('message') or '').strip()))
    ev.sort(); cur = None
    for t, m in ev:
        s = re.match(r'\[(\w+)\] (1v1|2v2)( SUDDEN DEATH)? match started \(bots: ([^;]*);', m)
        if s: cur = (s.group(2) + (' SD' if s.group(3) else ''), 0 if s.group(4) == 'none' else len(s.group(4).split(','))); rows.append((name, t, 'start', '%s, %d bot(s)' % cur, '', '', '', '', '')); continue
        if 'match ended' in m: rows.append((name, t, 'end', m.split('match ended')[1].strip(' —-')[:40], '', '', '', '', '')); continue
        k = re.search(r'mean ([\d.]+) ms, max (\d+) ms, over 16 ms (\d+), late starts (\d+) of (\d+)', m)
        if k and cur: rows.append((name, t, 'tick', '%s, %d bot(s)' % cur) + k.groups())
times = sorted(r[1] for r in rows)
head = '# the production servers\' own lines%s: server, time (UTC), kind, the match the line belongs to, and for a [tick] line of 30 s: mean ms, max ms, ticks over 16 ms, late starts, ticks run\n' % ((', %s to %s' % (times[0], times[-1])) if times else '')
open(out, 'w', encoding='utf-8').write(head + ''.join('\t'.join(map(str, r)) + '\n' for r in rows))
g = collections.defaultdict(list)
for r in rows:
    if r[2] == 'tick': g[r[3]].append(tuple(float(x) for x in r[4:]))
print('| the match | 30 s windows | mean ms a tick | worst tick, ms | ticks over 16 ms | late starts | ticks run of about 1,875 |'); print('| --- | --- | --- | --- | --- | --- | --- |')
for k in sorted(g):
    w = g[k]; f = lambda i, fmt='%.0f': (fmt % min(x[i] for x in w)) + ' to ' + (fmt % max(x[i] for x in w))
    print('| %s | %d | %s | %s | %s | %s | %s |' % (k, len(w), f(0, '%.2f'), f(1), f(2), f(3), f(4)))
print(len(rows), 'lines')
