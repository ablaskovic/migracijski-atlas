#!/usr/bin/env python3
"""Build data/demo.json: national migrant demography for 2025 (single published year).
Source: data/raw/stan-2026-2-1_tablice-hr.xlsx (DZS priopcenje STAN-2026-2-1):
  I T3  — vanjska migracija by age group and sex
  II T2 — unutarnja (preseljeno stanovnistvo) by age group and sex
  I T4  — vanjska migracija by country of origin/destination
Cross-checks: I T3 totals == I T4 Ukupno == citizen.json 2025 totals; II T2
among-counties column == sum of oi margins for 2025 in atlas_data2.json."""
# The CONSOLE is encoded too, not only the files. Commit 85a1086's encoding sweep
# gave every open() an explicit encoding='utf-8' and left sys.stdout
# locale-derived, so on Windows a REDIRECTED stdout is cp1252 — and every script
# in this pipeline prints Croatian place, country or group names AFTER it has
# written its payload.
# Measured with parse_demo.py: `python parse_demo.py > refresh.log` writes
# src/data/demo.json correctly, then raises UnicodeEncodeError on the first č of
# the top-countries line and exits 1, so every post-write line after it — the
# read-backs and totals that are these scripts' only self-check — never runs.
# The operator is left with a failed run over a file that has in fact been
# overwritten, which is exactly the signal README.md tells them to trust and go
# hunting for a DZS revision behind.
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
# …and those two columns are IDENTIFIED, not counted off. Both were taken by
# position out of four adjacent integer columns, so a DZS C/D swap would ship
# 15.935 — moves within one town — as the national total and the within-town
# series as the age breakdown, with every assert below still balancing: they
# compare rows to each other in the same columns, so all of them are invariant
# under any uniform column transformation. Exit 0, wrong payload.
# Two anchors, because either alone is weak. The header names the columns, and
# the total column is the one the other three sum to — which a sub-column
# cannot satisfy.
_hdr = next((i for i, r in enumerate(rows)
             if r[0] is not None and str(r[0]).strip() == 'Starost'), None)
assert _hdr is not None, 'II T2 header row (Starost) not found — did the sheet layout change?'
assert str(rows[_hdr][2]).strip() == 'Ukupno', ('II T2 col C is not Ukupno', rows[_hdr][2])
assert 'županijama' in str(rows[_hdr + 1][5]), ('II T2 col F is not the among-counties column', rows[_hdr + 1][5])
intm, int_ages, int_tot, int_m, int_cty = [], [], None, 0, None
cur_age = None
for r in rows:
    a = str(r[0]).strip() if r[0] is not None else ''
    sex = str(r[1]).strip() if r[1] is not None else ''
    if a:
        cur_age = a
    if sex == 'ukupno' and cur_age == 'Ukupno':
        # the identity that says C is the total: it is D + E + F, the three
        # published components of an internal move. Holds on all 51 data rows
        # of the shipped sheet; asserted on the one this script reads.
        assert to_int(r[2]) == to_int(r[3]) + to_int(r[4]) + to_int(r[5]), \
            ('II T2 col C is not the total of the three components', r[2:6])
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
# …and the filter is no stricter than the converter it feeds. DZS writes a
# suppressed or zero cell as '-' — the shipped I T2 has exactly that in the
# Nepoznato row — and to_int has always mapped '-' to 0, while this test
# accepted numbers only. A vintage in which Nepoznato or Oceanija has no
# immigrants by origin therefore had no entry at all, and the continent-sum
# assert below died with a bare KeyError from inside a generator expression:
# it reads like a bug in the parser rather than like the source revision it is,
# and the README's "if an assert fires, the source revision is real" rule never
# got its assert. This is the KeyError half of MA4M-166, fixed in parse_cit.py
# and not applied here.
def cell_ok(v):
    return isinstance(v, (int, float)) or (isinstance(v, str) and v.strip() in ('-', '–'))
for r in rows:
    name = str(r[0]).strip() if r[0] is not None else ''
    if name and cell_ok(r[1]):
        R[name] = (to_int(r[1]), to_int(r[5]))

def row(n):
    assert n in R, ('row missing from I T4: ' + n)
    return R[n]
assert row('Ukupno') == (tot_d, tot_o), (row('Ukupno'), tot_d, tot_o)
# …and each of these says what it found, so the operator gets the sentence the
# README tells them to investigate rather than a bare AssertionError.
assert sum(row(c)[0] for c in CONT) == tot_d and sum(row(c)[1] for c in CONT) == tot_o,     ('continents != Ukupno', sum(row(c)[0] for c in CONT), tot_d,
     sum(row(c)[1] for c in CONT), tot_o)
# both columns, not just doseljeni: the same drift in odseljeni was unguarded
assert row('Europska unija')[0] + row('Ostale europske zemlje')[0] == row('Europa')[0],     ('Europa != EU + ostale europske, doseljeni', row('Europa')[0],
     row('Europska unija')[0], row('Ostale europske zemlje')[0])
assert row('Europska unija')[1] + row('Ostale europske zemlje')[1] == row('Europa')[1],     ('Europa != EU + ostale europske, odseljeni', row('Europa')[1],
     row('Europska unija')[1], row('Ostale europske zemlje')[1])
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
write_json('../../src/data/demo.json', out, ensure_ascii=False, separators=(',', ':'))
print('vanjska 2025: %d / %d (muskarci %.0f%% / %.0f%%)' % (tot_d, tot_o, 100*dm/tot_d, 100*om/tot_o))
print('unutarnja 2025: %d preseljenih (medu zupanijama %d == oi margins)' % (int_tot, int_cty))
print('top countries:', ', '.join('%s %d' % (c[0], c[1]) for c in countries[:5]))
# 'rb', as parse_jls.py:149 already does. In text mode this counted CHARACTERS:
# every multi-byte UTF-8 character was counted once instead of by its length, so
# the preamble's "only post-write self-check" printed 784 for a file that is 816
# bytes on disk, and an operator comparing it against ls -l would read a short
# write. citizen.json is pure ASCII today, so its count was right by accident —
# one non-ASCII country name would have made it wrong too.
print('bytes:', len(open('../../src/data/demo.json', 'rb').read()))
