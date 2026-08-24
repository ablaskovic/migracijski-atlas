#!/usr/bin/env python3
"""Build data/citizen.json: national external migration by citizenship group, 2021-2025.
Source: data/raw/stan-2026-2-1_tablice-hr.xlsx sheet 'I T2' (DZS priopcenje STAN-2026-2-1).
Groups: hr=Hrvatska, sus=BiH+Srbija+Kosovo+Sj.Makedonija+Albanija+Crna Gora,
ukr=Ukrajina, eu=Europska unija, az=Azija, ost=residual (checksum-verified)."""
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
for i in range(5):
    assert sum(G[k]['d'][i] for k in G) == tot['d'][i]
    assert sum(G[k]['o'][i] for k in G) == tot['o'][i]
out = {'years': years, 'tot': tot, 'g': G}
json.dump(out, open('../../src/data/citizen.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
# headline checks
i24, i25 = years.index(2024), years.index(2025)
print('foreign share of doseljeni 2024: %.1f%%' % (100*(1-G['hr']['d'][i24]/tot['d'][i24])))
print('Azija dos 2024 vs sus+ukr:', G['az']['d'][i24], 'vs', G['sus']['d'][i24]+G['ukr']['d'][i24])
print('HR-citizen saldo 2024, 2025:', G['hr']['d'][i24]-G['hr']['o'][i24], G['hr']['d'][i25]-G['hr']['o'][i25])
print('Azija saldo 2024, 2025:', G['az']['d'][i24]-G['az']['o'][i24], G['az']['d'][i25]-G['az']['o'][i25])
print('bytes:', len(open('../../src/data/citizen.json', encoding='utf-8').read()))
