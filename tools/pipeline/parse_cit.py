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
ws = wb['I T2']
rows = list(ws.iter_rows(values_only=True))
def to_int(x):
    s = str(x).strip() if x is not None else ''
    return 0 if s in ('','-','–') else int(float(s))
hdr = next(r for r in rows if r[0] == 'Zemlja državljanstva')
years = [int(str(v).rstrip('.')) for v in hdr[1:] if v not in (None,'')]
assert years == [2021,2022,2023,2024,2025], years
# ── the columns are anchored, not assumed ────────────────────────────────────
# Every assert below this point compares rows to each other in the SAME columns,
# so all of them are invariant under any uniform column transformation — and the
# year check filtered blanks out before comparing, so a merged or spacer column a
# republication introduces was invisible to it. Executed on the shipped workbook
# with one blank column inserted before the data: the script ran to exit 0 with
# every assert green and wrote a citizen.json whose arrivals series was
# [0, 40424, 46287, 39218, 38997] — a zero followed by the real DEPARTURES of
# 2021-2024 — and whose departures were the real arrivals. Outer nets would have
# caught it before ship, but this parser is the tool the README tells an operator
# to trust after a refresh, and it said all checks passed.
# So: the year labels must sit where the slice below assumes they do, and the
# sub-header must say which of each pair is which.
ycols = [i for i, v in enumerate(hdr[:12]) if v not in (None, '')]
assert ycols == [0, 1, 3, 5, 7, 9], ('year labels moved', ycols)
sub = rows[rows.index(hdr) + 1]
assert [str(v).strip() if v is not None else None for v in sub[1:11]] == \
    ['doseljeni', 'odseljeni'] * 5, ('doseljeni/odseljeni order moved', sub[1:11])
R = {}
for r in rows:
    if r[0] is None: continue
    name = str(r[0]).strip()
    vals = [to_int(v) for v in r[1:11]]
    if name and any(vals): R[name] = {'d': vals[0::2], 'o': vals[1::2]}
def add(*names):
    return {'d':[sum(R[n]['d'][i] for n in names) for i in range(5)],
            'o':[sum(R[n]['o'][i] for n in names) for i in range(5)]}
SUS = ('Bosna i Hercegovina','Srbija','Kosovo','Sjeverna Makedonija','Albanija','Crna Gora')
G = {'hr': R['Hrvatska'], 'sus': add(*SUS),
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
# double count exceeds the whole residual. Neither identity below closes that
# gap either; the third assert in the loop is the one that does.
# These two identities are the sheet's own and are checked, not derived.
# Through `row()`, because R only holds rows that had a non-zero value: a
# republication in which a referenced row goes all-zero — Nepoznato and Oceanija
# are the plausible ones — made this die with a bare KeyError from inside a
# generator expression, which reads like a bug in the parser rather than like
# the source revision it is. The assert below says the same thing in the words
# the README tells the operator to look for.
def row(n):
    assert n in R, ('row missing or all-zero in the workbook: ' + n)
    return R[n]
for i in range(5):
    for f in ('d','o'):
        assert row('Europa')[f][i] == row('Europska unija')[f][i] + row('Ostale europske zemlje')[f][i],             ('Europa != EU + ostale europske', years[i], f)
        assert tot[f][i] == sum(row(n)[f][i] for n in
            ('Hrvatska','Europa','Azija','Afrika','Sjeverna i Srednja Amerika',
             'Južna Amerika','Oceanija','Nepoznato')), ('Ukupno != sum of continents', years[i], f)
        # …and the leaf composition of the groups, which neither identity above
        # constrains. Both are invariant under a CONSISTENT transfer between two
        # rows: report Ukrajina's movers inside the 'Europska unija' aggregate
        # and take them out of 'Ostale europske zemlje' — the re-scoping named
        # above, and the one an accession actually produces — and Europa still
        # equals EU + ostale, Ukupno still equals the eight top-level rows, and
        # the whole double count lands in 'ost', the top-down remainder.
        # Executed on a workbook edited exactly that way: ost doseljeni 2024
        # 5.409 -> 1.879, a residual 65% short, every assert green, exit 0.
        # Re-deriving 'ost' bottom-up out of the leaf rows does NOT catch it:
        # substitute the two identities above and OstEur - sus - ukr + Afrika +
        # … is the same expression as tot minus the five groups, so it passes on
        # both edited workbooks. What is independent of them is containment: the
        # seven rows this script lifts out of 'Ostale europske zemlje' have to
        # still be inside it. On the shipped sheet they are, with 270 to 2.490 of
        # unlisted headroom per year and flow; the Ukrajina edit puts them 1.746
        # over. A transfer smaller than that headroom — the Crna Gora variant's
        # 253 — still passes: this bounds the double count, it does not forbid it.
        assert (sum(row(n)[f][i] for n in SUS) + row('Ukrajina')[f][i]
            <= row('Ostale europske zemlje')[f][i]), (
            'sus + Ukrajina no longer inside Ostale europske zemlje', years[i], f)
out = {'years': years, 'tot': tot, 'g': G}
write_json('../../src/data/citizen.json', out, ensure_ascii=False, separators=(',',':'))
# headline checks
i24, i25 = years.index(2024), years.index(2025)
print('foreign share of doseljeni 2024: %.1f%%' % (100*(1-G['hr']['d'][i24]/tot['d'][i24])))
print('Azija dos 2024 vs sus+ukr:', G['az']['d'][i24], 'vs', G['sus']['d'][i24]+G['ukr']['d'][i24])
print('HR-citizen saldo 2024, 2025:', G['hr']['d'][i24]-G['hr']['o'][i24], G['hr']['d'][i25]-G['hr']['o'][i25])
print('Azija saldo 2024, 2025:', G['az']['d'][i24]-G['az']['o'][i24], G['az']['d'][i25]-G['az']['o'][i25])
print('bytes:', len(open('../../src/data/citizen.json', encoding='utf-8').read()))
