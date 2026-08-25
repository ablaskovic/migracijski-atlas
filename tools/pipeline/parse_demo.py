#!/usr/bin/env python3
"""Build data/demo.json: national migrant demography for 2025 (single published year).
Source: data/raw/stan-2026-2-1_tablice-hr.xlsx (DZS priopcenje STAN-2026-2-1):
  I T3  — vanjska migracija by age group and sex
  II T2 — unutarnja (preseljeno stanovnistvo) by age group and sex
  I T4  — vanjska migracija by country of origin/destination
Cross-checks: I T3 totals == I T4 Ukupno == citizen.json 2025 totals; II T2
among-counties column == sum of oi margins for 2025 in atlas_data2.json."""
import json, openpyxl

wb = openpyxl.load_workbook('raw/stan-2026-2-1_tablice-hr.xlsx', read_only=True, data_only=True)

def to_int(x):
    s = str(x).strip() if x is not None else ''
    return 0 if s in ('', '-', '–') else int(float(s))

# ── I T3: vanjska by age × sex ──
ws = wb['I T3']
rows = list(ws.iter_rows(values_only=True))
ages, d, o, dm, om = [], [], [], 0, 0
tot_d = tot_o = None
for r in rows:
    name = str(r[0]).strip() if r[0] is not None else ''
    if name == 'Ukupno':
        tot_d, tot_o = to_int(r[1]), to_int(r[4])
        dm, om = to_int(r[2]), to_int(r[5])          # muskarci totals
    elif name and r[1] is not None and (name[0].isdigit() and '–' in name or name.startswith('75')):
        lab = name.replace(' – ', '–').replace('75 i više', '75+')
        ages.append(lab)
        d.append(to_int(r[1])); o.append(to_int(r[4]))
        assert to_int(r[2]) + to_int(r[3]) == to_int(r[1]), ('I T3 m+z != uk', name)
        assert to_int(r[5]) + to_int(r[6]) == to_int(r[4]), ('I T3 m+z != uk', name)
assert len(ages) == 16, ages
assert sum(d) == tot_d and sum(o) == tot_o, (sum(d), tot_d, sum(o), tot_o)

# ── II T2: unutarnja by age (ukupno rows; col2 = total preseljeno, col5 = among counties) ──
ws = wb['II T2']
rows = list(ws.iter_rows(values_only=True))
intm, int_ages, int_tot, int_m, int_cty = [], [], None, 0, None
cur_age = None
for r in rows:
    a = str(r[0]).strip() if r[0] is not None else ''
    sex = str(r[1]).strip() if r[1] is not None else ''
    if a:
        cur_age = a
    if sex == 'ukupno' and cur_age == 'Ukupno':
        int_tot, int_cty = to_int(r[2]), to_int(r[5])
    elif sex == 'muškarci' and cur_age == 'Ukupno':
        int_m = to_int(r[2])
    elif sex == 'ukupno' and cur_age and (cur_age[0].isdigit() or cur_age.startswith('75')):
        int_ages.append(cur_age.replace(' – ', '–').replace('75 i više', '75+'))
        intm.append(to_int(r[2]))
assert len(intm) == 16, len(intm)
# demo.json ships ONE `ages` array and AgePanel labels both tabs from it, indexing
# `intm[i]` against `ages[i]` — but `ages` comes from I T3 and `intm` from II T2,
# two different sheets, and the only thing tying them together was that both had
# 16 rows. A DZS re-banding of II T2 that kept the count (collapse 0–4/5–9, split
# 75+ into 75–79/80+) would plot every internal-migration bar against the wrong
# label and name the wrong band in the panel's "vrh:" readout, with nothing
# firing. Compare the labels, not the count.
assert int_ages == ages, (int_ages, ages)
assert sum(intm) == int_tot, (sum(intm), int_tot)

# cross-source: among-counties total == sum of oi margins for 2025 (closed system)
atlas = json.load(open('../../src/data/atlas_data2.json', encoding='utf-8'))
yi25 = atlas['years'].index(2025)
oi25 = sum(c['oi'][yi25] for c in atlas['c'].values())
assert int_cty == oi25, ('II T2 among-counties vs 7.4.2 oi margins', int_cty, oi25)

# ── I T4: countries (skip aggregate rows; verify continents sum to Ukupno) ──
ws = wb['I T4']
rows = list(ws.iter_rows(values_only=True))
AGG = {'Ukupno', 'Europa', 'Europska unija', 'Ostale europske zemlje', 'Azija',
       'Afrika', 'Sjeverna i Srednja Amerika', 'Južna Amerika', 'Oceanija', 'Nepoznato'}
CONT = ['Europa', 'Azija', 'Afrika', 'Sjeverna i Srednja Amerika', 'Južna Amerika', 'Oceanija', 'Nepoznato']
R = {}
for r in rows:
    name = str(r[0]).strip() if r[0] is not None else ''
    if name and isinstance(r[1], (int, float)):
        R[name] = (to_int(r[1]), to_int(r[5]))
assert R['Ukupno'] == (tot_d, tot_o), (R['Ukupno'], tot_d, tot_o)
assert sum(R[c][0] for c in CONT) == tot_d and sum(R[c][1] for c in CONT) == tot_o
# both columns, not just doseljeni: the same drift in odseljeni was unguarded
assert R['Europska unija'][0] + R['Ostale europske zemlje'][0] == R['Europa'][0]
assert R['Europska unija'][1] + R['Ostale europske zemlje'][1] == R['Europa'][1]
countries = sorted(((k,) + v for k, v in R.items() if k not in AGG),
                   key=lambda t: -t[1])[:12]
# AGG is a literal list of the ten aggregate names this vintage happens to use,
# and everything else is treated as a country. The sheet already nests residual
# sub-aggregates — 'Ostale europske zemlje' (19.506) sits under 'Europa' — and
# under 'Azija' it names only three countries, leaving 2.843 unlisted. The next
# vintage adding 'Ostale azijske zemlje', the pattern it already applies to
# Europe, would rank that row sixth and draw it in the Zemlje tab as a country,
# under a caption that says "najvećih 12 po doseljenima". Nothing above notices:
# a row nested inside a continent leaves every continent sum unchanged.
assert not [c for c in countries if c[0].startswith('Ostal')], countries

# cross-source: citizen.json 2025 totals
cit = json.load(open('../../src/data/citizen.json', encoding='utf-8'))
i25 = cit['years'].index(2025)
assert cit['tot']['d'][i25] == tot_d and cit['tot']['o'][i25] == tot_o

out = {
    'year': 2025,
    'ages': ages,
    'ext': {'d': d, 'o': o},
    'extM': {'d': dm, 'o': om},
    'intm': intm,
    'intTot': int_tot,
    'intM': int_m,
    'countries': [list(c) for c in countries],
    'cTot': [tot_d, tot_o],
}
json.dump(out, open('../../src/data/demo.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('vanjska 2025: %d / %d (muskarci %.0f%% / %.0f%%)' % (tot_d, tot_o, 100*dm/tot_d, 100*om/tot_o))
print('unutarnja 2025: %d preseljenih (medu zupanijama %d == oi margins)' % (int_tot, int_cty))
print('top countries:', ', '.join('%s %d' % (c[0], c[1]) for c in countries[:5]))
print('bytes:', len(open('../../src/data/demo.json', encoding='utf-8').read()))
