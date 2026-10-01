# Compare two links.mjs runs case by case: python3 links-cmp.py a.json b.json [--loose]  (--loose ignores scroll and y)
import json, sys
a, b = (json.load(open(f)) for f in sys.argv[1:3])
loose = '--loose' in sys.argv
def key(g):
    g = dict(g)
    g.pop('status', None)
    if loose:
        g.pop('scrollY', None)
        if g.get('el'): g['el'] = {k: v for k, v in g['el'].items() if k not in ('top', 'onScreen')}
    return g
A = {c['id']: c for c in a['cases']}; B = {c['id']: c for c in b['cases']}
n = 0
for k in A:
    if k not in B: print('missing', k); n += 1; continue
    x, y = key(A[k]['got']), key(B[k]['got'])
    if x != y:
        n += 1
        print(k)
        for f in sorted(set(x) | set(y)):
            if x.get(f) != y.get(f): print('   ', f, json.dumps(x.get(f))[:200], '→', json.dumps(y.get(f))[:200])
for k in B:
    if k not in A: print('only in', sys.argv[2], k)
pa = [(p['patient'], p['i'], p['got']['tab'], p['got']['dialogs'], p['got']['url']) for p in a['presses']]
pb = [(p['patient'], p['i'], p['got']['tab'], p['got']['dialogs'], p['got']['url']) for p in b['presses']]
if pa != pb:
    n += 1; print('presses differ'); [print('  ', x, '→', y) for x, y in zip(pa, pb) if x != y]
print(f'{len(A)} links, {len(pa)} presses compared; {n} differences')
