#!/usr/bin/env python3
"""Build data/citizen.json: national external migration by citizenship group, 2021-2025.
Source: data/raw/stan-2026-2-1_tablice-hr.xlsx sheet 'I T2' (DZS priopcenje STAN-2026-2-1).
Groups: hr=Hrvatska, sus=BiH+Srbija+Kosovo+Sj.Makedonija+Albanija+Crna Gora,
ukr=Ukrajina, eu=Europska unija, az=Azija, ost=residual.
The sheet's own hierarchy is checked before the residual is derived: Europa ==
EU + ostale europske, and Ukupno == the eight top-level rows."""
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
import json, openpyxl
wb = openpyxl.load_workbook('raw/stan-2026-2-1_tablice-hr.xlsx', read_only=True, data_only=True)
ws = wb['I T2']
rows = list(ws.iter_rows(values_only=True))
def to_int(x):
    s = str(x).strip() if x is not None else ''
    return 0 if s in ('','-','–') else int(float(s))
hdr = next(r for r in rows if r[0] == 'Zemlja državljanstva')
years = [int(str(v).rstrip('.')) for v in hdr[1:] if v not in (None,'')]
assert years == [2021,2022,2023,2024,2025], years
R = {}
for r in rows:
    if r[0] is None: continue
    name = str(r[0]).strip()
    vals = [to_int(v) for v in r[1:11]]
    if name and any(vals): R[name] = {'d': vals[0::2], 'o': vals[1::2]}
def add(*names):
    return {'d':[sum(R[n]['d'][i] for n in names) for i in range(5)],
            'o':[sum(R[n]['o'][i] for n in names) for i in range(5)]}
G = {'hr': R['Hrvatska'],
     'sus': add('Bosna i Hercegovina','Srbija','Kosovo','Sjeverna Makedonija','Albanija','Crna Gora'),
     'ukr': R['Ukrajina'], 'eu': R['Europska unija'], 'az': R['Azija']}
tot = R['Ukupno']
G['ost'] = {'d':[tot['d'][i]-sum(G[k]['d'][i] for k in G) for i in range(5)],
            'o':[tot['o'][i]-sum(G[k]['o'][i] for k in G) for i in range(5)]}
assert all(v >= 0 for k in G for v in G[k]['d']+G[k]['o']), 'negative residual'
# The checksum the docstring advertises, against the sheet's OWN hierarchy.
# It used to be `sum(G[k] for k in G) == tot` over all six groups — but 'ost' is
# defined two lines up as tot minus the other five, so that expands to
# (five) + (tot - five) == tot: true for any inputs whatsoever, and it could not
# fail. So nothing reconciled the groups against the DZS 'Ukupno' row at all.
# Concretely: if a republication renamed a row so 'Europska unija' picked up a
# differently-scoped aggregate that double-counted movers already in 'sus', the
# double count would flow straight into a smaller 'ost', and the only assert that
# could catch it is the non-negativity one above — which fires only once the
# double count exceeds the whole residual.
# These two identities are the sheet's own and are checked, not derived:
for i in range(5):
    for f in ('d','o'):
        assert R['Europa'][f][i] == R['Europska unija'][f][i] + R['Ostale europske zemlje'][f][i],             ('Europa != EU + ostale europske', years[i], f)
        assert tot[f][i] == sum(R[n][f][i] for n in
            ('Hrvatska','Europa','Azija','Afrika','Sjeverna i Srednja Amerika',
             'Južna Amerika','Oceanija','Nepoznato')), ('Ukupno != sum of continents', years[i], f)
out = {'years': years, 'tot': tot, 'g': G}
json.dump(out, open('../../src/data/citizen.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
# headline checks
i24, i25 = years.index(2024), years.index(2025)
print('foreign share of doseljeni 2024: %.1f%%' % (100*(1-G['hr']['d'][i24]/tot['d'][i24])))
print('Azija dos 2024 vs sus+ukr:', G['az']['d'][i24], 'vs', G['sus']['d'][i24]+G['ukr']['d'][i24])
print('HR-citizen saldo 2024, 2025:', G['hr']['d'][i24]-G['hr']['o'][i24], G['hr']['d'][i25]-G['hr']['o'][i25])
print('Azija saldo 2024, 2025:', G['az']['d'][i24]-G['az']['o'][i24], G['az']['d'][i25]-G['az']['o'][i25])
print('bytes:', len(open('../../src/data/citizen.json', encoding='utf-8').read()))
