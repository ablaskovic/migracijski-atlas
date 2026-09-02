#!/usr/bin/env python3
"""Build ext/jls_stats.json: per-JLS totals of the measured 2018 internal-migration
edge list (Pitoski et al. 2021, figshare 12497177, GRAVITY sheet, CC BY 4.0) —
in/out sums over ALL JLS-to-JLS moves (both intra- and inter-county). This is the
data half of the JLS map; geo_jls.cjs joins it onto OSM geometry.
Needs ext/pitoski.xlsx (31 MB, not in repo - figshare files/23184374).
Name matching is identical to parse_jls.py (three-tier, dash/đ folding)."""
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

# ── atomic write ─────────────────────────────────────────────────────────────
# open(path, 'w') truncates the target the moment it opens, and json.dump
# streams incrementally — so a Ctrl+C, a full disk or an OOM part-way through
# leaves the payload truncated and unparseable, and an interruption before the
# first chunk leaves it empty. Fault-injected on the dump call this replaces:
# 19.241 bytes -> 17.126 and a JSONDecodeError on reload.
# parse_nat is the sharp case, because it is the only read-modify-write here:
# its input IS src/data/atlas_data2.json, and the README says the leaf series
# has no committed parser, so absorbing a DZS revision means editing that file
# by hand and re-running this. An interruption there destroys uncommitted work
# `git checkout` cannot bring back. The others write regenerable files, but they
# write them the same way and there is no reason to keep two habits.
# os.replace is atomic on the same volume on Windows and POSIX alike.
# An interrupted run leaves the .tmp behind, which the next successful one
# overwrites — a stray temp file is a better outcome than a destroyed payload.
import os as _os, json as _json

def write_json(path, obj, **kw):
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        _json.dump(obj, f, **kw)
        f.flush()
        _os.fsync(f.fileno())
    _os.replace(tmp, path)


def fold(s):
    s = s.lower().replace('đ','d').replace('Đ','d')
    s = s.replace('‒','-').replace('–','-').replace('—','-').replace('―','-').replace('−','-')
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', s).strip()
def k2(s): return fold(s).replace(' ','').replace('-','')

atlas = json.load(open('../../src/data/atlas_data2.json', encoding='utf-8'))
ISOS = list(atlas['c'].keys())
CNAMES = {atlas['c'][iso]['n']: iso for iso in ISOS}

wb = openpyxl.load_workbook('raw/po-jls.xlsx', read_only=True, data_only=True)
ws = wb['7.5.18.']
reg = []
cur = None
for r in ws.iter_rows(min_row=9, values_only=True):
    a = str(r[0]).strip() if r[0] is not None else ''
    if not a or a == 'Republika Hrvatska': continue
    if re.match(r'^\d\)', a): continue
    if a in CNAMES: cur = CNAMES[a]; continue
    if cur: reg.append((cur, a))
reg.append(('HR-21', 'Grad Zagreb'))
assert len(reg) == 556, len(reg)

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

wbp = openpyxl.load_workbook('ext/pitoski.xlsx', read_only=True)
wsp = wbp['GRAVITY']
IN, OUT = defaultdict(int), defaultdict(int)
NODEC = {}
tot = inter = intra = 0
for r in wsp.iter_rows(min_row=2, values_only=True):
    if r[0] is None: break
    s, t, w = str(r[0]).strip(), str(r[1]).strip(), int(r[6])
    for nm in (s,t):
        if nm not in NODEC: NODEC[nm] = resolve(nm)
    si, ti = NODEC[s], NODEC[t]
    OUT[si] += w; IN[ti] += w; tot += w
    if reg[si][0] == reg[ti][0]: intra += w
    else: inter += w

assert tot == 57465 and inter == 30384 and intra == 27081, (tot, inter, intra)
# NOT `sum(IN) == sum(OUT) == tot`: the loop above adds the same `w` to one OUT
# bucket, one IN bucket and `tot` once per edge, so that identity cannot fail for
# any input at all - not a mis-join, not a truncated edge list, not a duplicated
# row, not a swapped source/target column. It re-derived the sums it asserted,
# exactly like the parse_cit checksum did. The real check is the column margin
# below, which is the half of the payload nothing validated: `IN` drives the JLS
# map's Dolasci ramp and the whole Neto direction, and only the OUT margins were
# ever compared against od2018. parse_jls.py walks both directions of the same
# edge list, so this was an asymmetry between two scripts documented as sharing
# their matching logic.

# per-county out-to-other-counties must equal od2018 row sums (margin cross-check)
od = json.load(open('ref/od2018.json', encoding='utf-8'))
by_cty_out = defaultdict(int)
for i, w in OUT.items(): by_cty_out[reg[i][0]] += w
by_cty_intra = defaultdict(int)
# recompute intra per county for the margin identity
wsp2 = wbp['GRAVITY']
for r in wsp2.iter_rows(min_row=2, values_only=True):
    if r[0] is None: break
    s, t, w = str(r[0]).strip(), str(r[1]).strip(), int(r[6])
    if reg[NODEC[s]][0] == reg[NODEC[t]][0]: by_cty_intra[reg[NODEC[s]][0]] += w
by_cty_in = defaultdict(int)
for i, w in IN.items(): by_cty_in[reg[i][0]] += w
for iso in ISOS:
    row = sum(od.get(iso, {}).values())
    assert by_cty_out[iso] - by_cty_intra[iso] == row, (iso, by_cty_out[iso], by_cty_intra[iso], row)
    # …and the same identity down the columns, for the IN half of the payload
    col = sum(od.get(a, {}).get(iso, 0) for a in ISOS)
    assert by_cty_in[iso] - by_cty_intra[iso] == col, (iso, by_cty_in[iso], by_cty_intra[iso], col)

out = [[name, ISOS.index(iso), IN.get(i, 0), OUT.get(i, 0)] for i, (iso, name) in enumerate(reg)]
write_json('ext/jls_stats.json', out, ensure_ascii=False, separators=(',',':'))

net = sorted(out, key=lambda r: (r[2]-r[3]))
print('556 JLS · movers', tot, '· inter', inter, '· intra', intra)
print('top net gain:', [(r[0], r[2]-r[3]) for r in net[-5:][::-1]])
print('top net loss:', [(r[0], r[2]-r[3]) for r in net[:5]])
gz = next(r for r in out if r[0] == 'Grad Zagreb')
print('Grad Zagreb: in', gz[2], 'out', gz[3], 'net', gz[2]-gz[3])
