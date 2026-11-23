# usage: python3 -I report_tables.py <data dir> : the tables of the report, as Markdown, made from the result files of a data folder laid out
# as docs/reports/online_load_data is (sim/, replica/, production/). Each table comes after a line "@@ <its name>".
# Run it on a new folder of results to get the same tables for a later build of the line.
import json, sys, os, re, collections
D = sys.argv[1]
def rows_of(rel):
    j = json.load(open(os.path.join(D, rel))); return j['rows'] if isinstance(j, dict) else j
def have(rel): return os.path.exists(os.path.join(D, rel))
SC = ['1v1 two players', '1v1 player and bot', '2v2 four players', '2v2 two players two bots', '2v2 player and three bots']
def scen(r, name): return next(s for s in r['scen'] if s['name'] == name)
def tbl(head, lines, left=1):
    print('| ' + ' | '.join(head) + ' |'); print('|' + '|'.join([' --- '] * left + [' ---: '] * (len(head) - left)) + '|')
    for l in lines: print('| ' + ' | '.join(str(x) for x in l) + ' |')
    print()
for run in ('first', 'second'):
    rel = 'sim/all_maps_%s_run.json' % run
    if not have(rel): continue
    rows = rows_of(rel)
    if run == 'first':
        print('@@ maps'); tbl(['map', 'boxes', 'floors', 'route nodes', 'jump and drop links'], [(r['map'], r['boxes'], r['floors'], r['nodes'], r['jumps'] + r['drops']) for r in sorted(rows, key=lambda r: -r['boxes'])])
    print('@@ sim %s run' % run); last = SC[-1]
    tbl(['map'] + SC + ['of the last: the bots', 'ticks over 1.6 ms'], [[r['map']] + ['%.3f' % scen(r, n)['mean'] for n in SC] + ['%.3f' % scen(r, last)['bots'], '%d of %d' % (scen(r, last)['over16'], scen(r, last)['n'])] for r in sorted(rows, key=lambda r: -scen(r, last)['mean'])])
for rel, name in (('sim/all_maps_second_run.json', 'search share, players walking'), ('sim/players_standing.json', 'search share, players standing')):
    if not have(rel): continue
    rows = [r for r in rows_of(rel) if 'searchShare' in scen(r, SC[-1])]; print('@@ ' + name)
    tbl(['map'] + ['%s: %% of ticks with a search' % n for n in (SC[1], SC[3], SC[4])] + ['the bots on a search tick, ms (three bots)', 'on the other ticks'],
        [[r['map']] + ['%.1f' % scen(r, n)['searchShare'] for n in (SC[1], SC[3], SC[4])] + ['%.2f' % scen(r, SC[4])['searchTickBots'], '%.2f' % scen(r, SC[4])['otherTickBots']] for r in sorted(rows, key=lambda r: -scen(r, SC[4])['searchShare'])])
builds = sorted(f for f in os.listdir(os.path.join(D, 'sim')) if re.match(r'build_.*\.json$', f))
if builds:
    print('@@ builds'); by = {b: {r['map']: r for r in rows_of('sim/' + b)} for b in builds}; maps = list(by[builds[0]])
    tbl(['map', 'match'] + [b[6:-5] for b in builds], [[m, n] + ['%.3f' % scen(by[b][m], n)['mean'] if m in by[b] else '-' for b in builds] for m in maps for n in (SC[1], SC[3], SC[4])], left=2)
for tag in ('four', 'six'):
    fs = sorted(f for f in os.listdir(os.path.join(D, 'sim')) if re.match(r'bots_every\d+_%s_rounds\.json$' % tag, f))
    if len(fs) < 2: continue
    print('@@ bots every n, %s rounds' % tag); by = {int(re.search(r'every(\d+)', f).group(1)): {r['map']: r for r in rows_of('sim/' + f)} for f in fs}; ns = sorted(by); lines = []
    for m in by[ns[0]]:
        for n in (SC[1], SC[3], SC[4]):
            b = [scen(by[k][m], n)['bots'] for k in ns]; t = [scen(by[k][m], n)['mean'] for k in ns]
            lines.append([m, n] + ['%.3f' % x for x in b] + ['%+.0f %%' % (100 * (b[-1] / b[0] - 1))] + ['%.3f' % x for x in t] + ['%+.0f %%' % (100 * (t[-1] / t[0] - 1))])
    tbl(['map', 'match'] + ['the bots, every %s' % ('tick' if k == 1 else 'tick in %d' % k) for k in ns] + ['change, first to last'] + ['the whole tick, every %s' % ('tick' if k == 1 else 'tick in %d' % k) for k in ns] + ['change'], lines, left=2)
if have('replica/table.txt'):
    recs = []
    for l in open(os.path.join(D, 'replica/table.txt'), encoding='utf-8').read().split('\n')[1:]:
        c = [x.strip() for x in l.split('|')]
        if len(c) < 7: continue
        h = c[0].split(); p = c[1].split(); recs.append(dict(label=h[0], map=h[1], mode=h[2], pl=h[3], sd=h[4] == 'SD', bots=p[0], tick=p[1], snap=p[2], cpu=c[2], mem=c[3], worst=c[4], sent=c[5], knobs=c[6]))
    kind = lambda r: '%s, %s' % (r['mode'], {('1v1', '2'): 'two players', ('1v1', '1'): 'a player and a bot', ('2v2', '4'): 'four players', ('2v2', '2'): 'two players and two bots', ('2v2', '1'): 'a player and three bots'}[(r['mode'], r['pl'])])
    head = ['match', 'map', 'CPU ms a second', 'the bots, ms a tick', 'the shared tick', 'snapshots', 'worst tick, ms', 'memory, MB', 'sent to one player', 'label']; line = lambda r: [kind(r), r['map'], r['cpu'], r['bots'], r['tick'], r['snap'], r['worst'], r['mem'], r['sent'], r['label']]
    plain = lambda r: r['knobs'].replace('(units can fall)', '').strip() in ('-', '')
    print('@@ replica, the server as it is'); tbl(head, [line(r) for r in sorted([r for r in recs if not r['sd'] and plain(r)], key=lambda r: (kind(r), -float(r['cpu'])))], left=2)
    print('@@ replica, Sudden Death'); tbl(head + ['knobs'], [line(r) + [r['knobs']] for r in sorted([r for r in recs if r['sd']], key=lambda r: -float(r['cpu']))], left=2)
    print('@@ replica, the knobs'); tbl(head + ['knobs'], [line(r) + [r['knobs']] for r in recs if not r['sd'] and not plain(r)], left=2)
if have('production/production_lines.tsv'):
    g = collections.defaultdict(list); n = 0
    for l in open(os.path.join(D, 'production/production_lines.tsv'), encoding='utf-8'):
        c = l.rstrip('\n').split('\t')
        if l.startswith('#') or len(c) < 9: continue
        n += 1
        if c[2] == 'tick': g[c[3]].append(tuple(float(x) for x in c[4:9]))
    print('@@ production'); f = lambda w, i, fmt='%.0f': (fmt % min(x[i] for x in w)) + ' to ' + (fmt % max(x[i] for x in w))
    tbl(['the match', '30 s windows', 'mean ms a tick', 'worst tick, ms', 'ticks over 16 ms', 'late starts', 'ticks run of about 1,875'], [(k, len(g[k]), f(g[k], 0, '%.2f'), f(g[k], 1), f(g[k], 2), f(g[k], 3), f(g[k], 4)) for k in sorted(g)])
