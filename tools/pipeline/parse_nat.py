#!/usr/bin/env python3
"""Patch data/atlas_data2.json with `nat` (prirodni prirast) per county per year,
parsed from DZS sheet 7.4.1. in data/raw/pregled-zupanije.xlsx.
Also stores national row as top-level `natRH` for cross-checks.
Idempotent: overwrites nat arrays on each run."""
import json, openpyxl

atlas = json.load(open('../../src/data/atlas_data2.json'))
YEARS = atlas['years']; C = atlas['c']
NAMES = {C[iso]['n']: iso for iso in C}

wb = openpyxl.load_workbook('raw/pregled-zupanije.xlsx', read_only=True, data_only=True)
ws = wb['7.4.1.']
rows = list(ws.iter_rows(values_only=True))

# header row: find the row whose col C is '1998.'
hdr = next(r for r in rows if r[2] == '1998.')
years_in_sheet = []
for cell in hdr[2:]:
    if cell is None: break
    years_in_sheet.append(int(str(cell).rstrip('.')))
assert years_in_sheet[0] == YEARS[0], years_in_sheet[:3]

def to_int(x):
    if x is None: return None
    s = str(x).strip().replace('\u2212','-')
    if s in ('', '-', '–', '...', 'z'): return None
    return int(float(s))

cur = None; got = {}
natRH = None
for r in rows:
    a = (str(r[0]).strip() if r[0] is not None else '')
    if a == 'Republika Hrvatska': cur = 'RH'; continue
    if a in NAMES: cur = NAMES[a]; continue
    if a == 'Prirodni prirast' and cur:
        vals = [to_int(v) for v in r[2:2+len(years_in_sheet)]]
        if cur == 'RH': natRH = vals
        else: got[cur] = vals
        cur = None

assert len(got) == 21, ('counties found', len(got), sorted(set(C)-set(got)))
n = len(YEARS)
for iso, vals in got.items():
    vals = (vals + [None]*n)[:n]
    C[iso]['nat'] = vals

# cross-check: county nat sums == RH nat wherever all present
for yi, y in enumerate(YEARS):
    col = [got[iso][yi] for iso in got]
    if all(v is not None for v in col) and natRH[yi] is not None:
        assert sum(col) == natRH[yi], (y, sum(col), natRH[yi])

atlas['natRH'] = (natRH + [None]*n)[:n]
json.dump(atlas, open('../../src/data/atlas_data2.json','w'), ensure_ascii=False, separators=(',',':'))
missing = {iso: [YEARS[i] for i,v in enumerate(C[iso]['nat']) if v is None] for iso in got if any(v is None for v in C[iso]['nat'])}
print('nat patched. years in sheet:', years_in_sheet[0], '-', years_in_sheet[-1])
print('missing cells:', missing or 'none')
print('RH nat 2024/2025:', natRH[YEARS.index(2024)], natRH[YEARS.index(2025)])
print('sample Istarska nat[2011..]:', C['HR-18']['nat'][YEARS.index(2011):YEARS.index(2011)+5])
