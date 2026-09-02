#!/usr/bin/env python3
"""Patch data/atlas_data2.json with `nat` (prirodni prirast) per county per year,
parsed from DZS sheet 7.4.1. in data/raw/pregled-zupanije.xlsx.
Also stores national row as top-level `natRH` for cross-checks.
Idempotent: overwrites nat arrays on each run."""
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


atlas = json.load(open('../../src/data/atlas_data2.json', encoding='utf-8'))
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
write_json('../../src/data/atlas_data2.json', atlas, ensure_ascii=False, separators=(',',':'))
missing = {iso: [YEARS[i] for i,v in enumerate(C[iso]['nat']) if v is None] for iso in got if any(v is None for v in C[iso]['nat'])}
print('nat patched. years in sheet:', years_in_sheet[0], '-', years_in_sheet[-1])
print('missing cells:', missing or 'none')
print('RH nat 2024/2025:', natRH[YEARS.index(2024)], natRH[YEARS.index(2025)])
print('sample Istarska nat[2011..]:', C['HR-18']['nat'][YEARS.index(2011):YEARS.index(2011)+5])
