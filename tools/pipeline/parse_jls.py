#!/usr/bin/env python3
"""Build data/jls_drill.json: top municipal (JLS-level) corridors per county from the
measured 2018 edge list (Pitoski et al. 2021, figshare 12497177, sheet GRAVITY, CC BY 4.0).
Validates against od2018.json (exact) and the DZS 2018 totals before emitting.
Needs ext/pitoski.xlsx (31 MB, not in repo - figshare files/23184374)."""
# …and the CONSOLE, not only the files. Commit 85a1086's encoding sweep gave
# every open() an explicit encoding='utf-8' and left sys.stdout locale-derived,
# so on Windows a REDIRECTED stdout is cp1252 — and every one of these scripts
# prints Croatian place, country or group names AFTER it has written its payload.
# Measured: `python parse_demo.py > refresh.log` writes src/data/demo.json
# correctly, then raises UnicodeEncodeError on the first č of the top-countries
# line and exits 1, so the byte-size read-back on the next line — the script's
# only post-write self-check — never runs. The operator is left with a failed run
# over a file that has in fact been overwritten, which is exactly the signal
# README.md tells them to trust and go hunting for a DZS revision behind.
# errors='replace' rather than a hard failure: a mangled glyph on a genuinely
# non-Unicode terminal is strictly better than aborting after the write.
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import json, re, unicodedata, openpyxl
from collections import defaultdict

def fold(s):
    s = s.lower().replace('đ','d').replace('Đ','d')
    s = s.replace('\u2012','-').replace('\u2013','-').replace('\u2014','-').replace('\u2015','-').replace('\u2212','-')
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', s).strip()
def k2(s): return fold(s).replace(' ','').replace('-','')

atlas = json.load(open('../../src/data/atlas_data2.json', encoding='utf-8'))
ISOS = list(atlas['c'].keys())
CNAMES = {atlas['c'][iso]['n']: iso for iso in ISOS}

# ---- registry: JLS -> county (sheet 7.5.18 = 2018) ----
wb = openpyxl.load_workbook('raw/po-jls.xlsx', read_only=True, data_only=True)
ws = wb['7.5.18.']
reg = []          # (county_iso, display_name)
cur = None
for r in ws.iter_rows(min_row=9, values_only=True):
    a = str(r[0]).strip() if r[0] is not None else ''
    if not a or a == 'Republika Hrvatska': continue
    if re.match(r'^\d\)', a): continue
    if a in CNAMES: cur = CNAMES[a]; continue
    if cur: reg.append((cur, a))
reg.append(('HR-21', 'Grad Zagreb'))
print('JLS in registry:', len(reg))

idx0, idx1, idx2 = defaultdict(list), defaultdict(list), defaultdict(list)
for i,(iso,name) in enumerate(reg):
    f = fold(name)
    if i not in idx0[f]: idx0[f].append(i)
    variants = {f} | set(p.strip() for p in re.split(r'\s-\s', f))
    for v in variants:
        if i not in idx1[v]: idx1[v].append(i)
        if i not in idx2[k2(v)]: idx2[k2(v)].append(i)

CFOLD = {fold(n): iso for n,iso in CNAMES.items()}
def resolve(node):
    hint = None; base = node
    m = re.match(r'^(.*?)\s*\((.*?)\s*[zž]upanija\)\s*$', node, re.I)
    if m:
        base = m.group(1); h = fold(m.group(2))
        for cf,iso in CFOLD.items():
            if cf.startswith(h) or h.startswith(cf.split()[0]): hint = iso; break
    cands = idx0.get(fold(base)) or idx1.get(fold(base)) or idx2.get(k2(base)) or []
    if len(cands) > 1 and hint: cands = [i for i in cands if reg[i][0] == hint]
    if len(cands) != 1: raise SystemExit(f'unresolved node: {node!r} -> {[reg[i] for i in cands]}')
    return cands[0]

# ---- edges ----
wbp = openpyxl.load_workbook('ext/pitoski.xlsx', read_only=True)
wsp = wbp['GRAVITY']
edges = []           # (srcRegIdx, dstRegIdx, w)
NODEC = {}
for r in wsp.iter_rows(min_row=2, values_only=True):
    if r[0] is None: break
    s, t, w = str(r[0]).strip(), str(r[1]).strip(), int(r[6])
    for n in (s,t):
        if n not in NODEC: NODEC[n] = resolve(n)
    edges.append((NODEC[s], NODEC[t], w))
print('edges:', len(edges), 'movers:', sum(w for _,_,w in edges))

# ---- validation vs od2018 + DZS totals ----
M = defaultdict(int)
inter = intra = 0
for si, ti, w in edges:
    a, b = reg[si][0], reg[ti][0]
    if a == b: intra += w
    else: inter += w; M[(a,b)] += w
assert sum(w for _,_,w in edges) == 57465, sum(w for _,_,w in edges)
assert inter == 30384 and intra == 27081, (inter, intra)
od = json.load(open('ref/od2018.json', encoding='utf-8'))
for a in ISOS:
    for b in ISOS:
        if a != b:
            assert M.get((a,b),0) == od.get(a,{}).get(b,0), (a,b,M.get((a,b),0),od.get(a,{}).get(b,0))
print('validation: 21x21 aggregate matches od2018.json exactly; totals 30.384 / 27.081 OK')

# ---- drill lists ----
K_DIR, K_LOC = 12, 10
used = {}
def nid(i):
    if i not in used: used[i] = len(used)
    return used[i]
drill = {}
for iso in ISOS:
    out_e = sorted([e for e in edges if reg[e[0]][0]==iso and reg[e[1]][0]!=iso], key=lambda e:-e[2])[:K_DIR]
    in_e  = sorted([e for e in edges if reg[e[1]][0]==iso and reg[e[0]][0]!=iso], key=lambda e:-e[2])[:K_DIR]
    loc_e = sorted([e for e in edges if reg[e[0]][0]==iso and reg[e[1]][0]==iso], key=lambda e:-e[2])[:K_LOC]
    drill[iso] = {'out':[[nid(s),nid(t),w] for s,t,w in out_e],
                  'in' :[[nid(s),nid(t),w] for s,t,w in in_e],
                  'loc':[[nid(s),nid(t),w] for s,t,w in loc_e]}
names = [None]*len(used)
for regidx, j in used.items():
    iso, name = reg[regidx]
    names[j] = [name, ISOS.index(iso)]
out = {'names': names, 'c': drill}
json.dump(out, open('../../src/data/jls_drill.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('jls_drill.json bytes:', len(open('../../src/data/jls_drill.json','rb').read()), '| names used:', len(names))
top = drill['HR-21']['out'][:3]
print('HR-21 top out:', [(names[s][0],'->',names[t][0],w) for s,t,w in top])
