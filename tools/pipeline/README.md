# Data pipeline

Regenerates `src/data/*.json` from raw sources. Run from this directory.

```
# `python`, not `python3`: this pipeline's only documented habitat is the
# Windows dev machine, where the launcher is `python` (3.13) and both `python3`
# and `py` are ‘command not found’ — so every block below used to fail verbatim
# before a parser ran, on the one platform they are run from. On macOS and Linux
# `python` may be absent or point at 2.x; there, spell it `python3`.
pip install numpy openpyxl
python parse_nat.py     # raw/pregled-zupanije.xlsx 7.4.1 -> nat arrays in atlas_data2.json
python parse_cit.py     # raw/stan-2026-2-1_tablice-hr.xlsx I T2 -> citizen.json
python parse_demo.py    # raw/stan-2026-2-1_tablice-hr.xlsx I T3 / II T2 / I T4 -> demo.json
python parse_jls.py     # ext/pitoski.xlsx GRAVITY + raw/po-jls.xlsx 7.5.18
                         #   + ../../src/data/atlas_data2.json (county ISO list, line 64)
                         #   + ref/od2018.json (the exact 21x21 check, line 145) -> jls_drill.json
python parse_jlsmap.py  # ext/pitoski.xlsx GRAVITY + raw/po-jls.xlsx + ref/od2018.json
                         #   + atlas_data2.json -> ext/jls_stats.json (per-JLS in/out)
node   geo_jls.cjs       # ext/jls_stats.json + raw/jls_geo_osm.geojson
                         #   + src/data/geo_counties.json -> geo_jls.json
python ipf.py           # od2018.json + margins -> odm.json (2018 measured, rest IPF)
```

`parse_jls.py`, `parse_jlsmap.py` need the full Pitoski edge list at
`ext/pitoski.xlsx` (31 MB, not committed): download from figshare
`https://ndownloader.figshare.com/files/23184374` (article 12497177, CC BY 4.0).

`geo_jls.cjs` needs `d3-geo` (already a project dep) and runs from repo root's
`node_modules`; it joins `parse_jlsmap.py`'s per-JLS 2018 totals onto OSM municipal
geometry and asserts a perfect 1:1 cover (556 JLS) plus the d3 winding test before
writing. Its geometry input `raw/jls_geo_osm.geojson` (480.545 B, committed) came from
an Overpass query — `area["ISO3166-1"="HR"][admin_level=2]; rel(area)[admin_level=7]
[boundary=administrative]; out geom;` (© OpenStreetMap contributors, **ODbL**) — run
through `osmtogeojson` then `mapshaper -simplify visvalingam 2% keep-shapes
-filter-islands min-area=0.5km2 -o precision=0.0001`. Grad Zagreb is admin_level 6 in
OSM (it is simultaneously a county), so it is not in the level-7 pull; `geo_jls.cjs`
substitutes the HR-21 county polygon already in `geo_counties.json`. To rebuild the
geometry input from scratch, re-run that Overpass→osmtogeojson→mapshaper chain.

Every script asserts its own validation (county sums vs RH row, group checksums,
cell-exact match vs od2018.json, exact row margins). If an assert fires after a DZS
refresh, the source revision is real — investigate before "fixing" the assert.
One exception, and it is the routine one: the single-year literals listed in the
checklist below move with the workbook by design, and an assert that names a year
is asking to be moved, not investigated.

DZS hash-URLs rot when workbooks are republished; navigate from
`https://podaci.dzs.hr/hr/podaci/stanovnistvo/migracija-stanovnistva/` to find
current links.

Everything the step list at the top of this file names is regenerated here:
the `nat` arrays inside `atlas_data2.json`, `citizen.json`, `demo.json`,
`jls_drill.json`, `ext/jls_stats.json`, `geo_jls.json` and `odm.json` — the
three JLS products among them only if you have fetched the uncommitted
`ext/pitoski.xlsx` named above. What a rerun does NOT rebuild is the county
leaf series inside `atlas_data2.json`
(`ii`, `oi`, `ie`, `oe`, `pe`, `p`) — and not because that parsing lives
upstream, which is what this paragraph used to say. `raw/pregled-zupanije.xlsx`
is committed and sheets 7.4.1.–7.4.3. hold every one of those values; what is
missing is a `parse_series.py` to read them. See "`atlas_data2.json` is
reproducible here — the old note was wrong" below, which records the audit that
re-derived all 2.352 leaf values from that workbook and contradicted this
sentence for as long as both stood.

## Refresh checklist — manual copy spots

Year spans in the UI derive from the payloads (`YEND` in `src/lib/metrics.ts`,
`CIT.years` in the citizenship panel), so a series extension propagates on its own.
These do NOT, and need a manual sweep in the same commit as the data refresh:

- `index.html` `<title>` — series span is literal text
- `src/App.tsx` footer — workbook vintage "(srpanj 2026.)" and the STAN priopćenje id
- `src/components/CitzPanel.tsx` + `AgePanel.tsx` + `scripts/verify.cjs` — the
  STAN-2026-2-1 source name and the single-year scope (`DEMO.year`, 2025);
  verify asserts these appear in `#citzNote` / `#ageNote`
- `src/lib/stories.ts` — Nalazi captions quote hard numbers (−334, +27.521, +3.413,
  Split −691, …); a data refresh that moves a headline must update its caption too
  (same rule as the ground-truth table)
- `scripts/verify.cjs` ground-truth constants — recompute
  from raw sources if DZS revised the series, and say which vintage moved them
- `tools/pipeline/parse_demo.py` — the single published year is a literal in three
  places: `atlas['years'].index(2025)`, `cit['years'].index(2025)` and the
  `'year': 2025` written into `demo.json` (which is the `DEMO.year` the UI copy
  spot above refers to — it is SET here). Miss them and the cross-checks compare
  the new year's totals against the old year's columns.
  `parse_nat.py`'s closing `RH nat 2024/2025` print carries two more, which raise
  ValueError after the write if the atlas span moves.
  `parse_cit.py` no longer needs an edit: its window assert takes any five
  consecutive years.

## v4 → React port: where things moved

`reference/HANDOFF-v4-singlefile.md` is a frozen record of the single-file v4 and
is still the authority on *provenance and methodology* — but every path in its
file map predates the port. Translation table:

| Handoff says | Repo has |
|---|---|
| `src/data/hrv21_fixed.geojson` | `src/data/geo_counties.json` |
| `src/data/regions5.geojson` | `src/data/geo_regions5.json` |
| `src/data/od2018.json` | `tools/pipeline/ref/od2018.json` (a pipeline *input*) |
| `src/data/raw/*.xlsx` | `tools/pipeline/raw/*.xlsx` |
| `src/ipf.py`, `src/parse_*.py` | `tools/pipeline/` |
| `src/verify.js` (32 checks) | `scripts/verify.cjs` (the count is pinned in that file) |

`ref/od2018.json` is legitimately SPARSE: 419 of the 420 ordered county pairs,
missing HR-20 → HR-11 (Međimurska → Požeško-slavonska), which is a measured zero
in 2018 and simply carries no key. Every consumer reads it through `.get(b, 0)`
— `ipf.py`, `parse_jls.py`, `parse_jlsmap.py` — and the shipped `odm.json` is
dense at 420 (MA3-070), so nothing downstream sees the gap. Written down because
a 419 next to a 420 is the shape of a defect, and an audit has re-raised it.

The Python docstrings still cite the pre-port paths in their prose; the code
itself opens the correct relative paths from `tools/pipeline/`.

## What this pipeline does *not* regenerate

- **`geo_counties.json`**, **`geo_regions5.json`** — mapshaper one-liners over
  geoBoundaries ADM1, recorded only in the handoff's provenance section.
  `geo_counties.json` is nonetheless an INPUT to `geo_jls.cjs`, twice over: it is
  the county-containment test that disambiguates duplicate JLS names, and Grad
  Zagreb's municipality polygon in `geo_jls.json` is a verbatim copy of HR-21's
  geometry from it (checked: the two are byte-identical). Re-run the mapshaper
  one-liner and `geo_jls.cjs` has to run again, or the JLS map keeps the old
  boundary for its own headline value while the county map shows the new one.
  The feature order matters too — `geo_jls.cjs` re-sorts it numerically to line
  up with `atlas_data2`'s key order, and the stored county index depends on that.
- **`jls_drill.json`** — rebuilt by `python parse_jls.py`, but only from the 31 MB
  Pitoski figshare download at `ext/pitoski.xlsx`, which is not committed. So it
  is reproducible, and not from a fresh clone alone; the same holds for
  `ext/jls_stats.json` and, through it, `geo_jls.json`. (This bullet used to say
  flatly that the pipeline does not regenerate it, which disagreed with the step
  list at the top of the file that names the script which does.)

`odm.json` is NOT in that list: it is regenerated by `python ipf.py`, the step
already named at the top of this file, from `ref/od2018.json` (committed) and the
DZS margins in `atlas_data2.json`. Verified — rerunning it reproduces the shipped
file byte for byte. The per-JLS totals baked into `geo_jls.json` are recoverable
too, from the committed `raw/po-jls.xlsx`; only the edge list above needs the
uncommitted figshare file.

### The OSM extract holds 557 features and 556 ship — that is expected

`geo_jls.cjs` asserts "a perfect 1:1 cover of all 556 JLS" before writing, and
throws otherwise, so a run that produced `geo_jls.json` proved the claim for
itself. Counting the committed files from outside does not reproduce it, and an
audit flagged the difference; both halves check out:

- `raw/jls_geo_osm.geojson` has **557** features to **556** shipped, and the
  arithmetic is 557 − 2 + 1. **Two** features come from outside Croatia. There is
  no bounding box — the query is `rel(area.hr)`, and Overpass returns a relation
  whose members touch the area, so a municipality sharing a border way with
  Croatia comes back with it: `Град Сомбор` (Sombor, Serbia) and
  `Upravna enota Piran / Unità amministrativa Pirano` (Slovenia). Neither is
  dropped by the county-centroid test — both score **zero** hits in all three name
  indices, so `uni.length >= 1` is false and that test never runs for them; they
  are dropped at the name stage. That leaves 555 matched from the extract, and the
  556th shipped feature is **Grad Zagreb**, substituted from `geo_counties.json`
  because it is admin_level 6 in OSM and the level-7 pull cannot contain it — the
  same substitution this file describes further up.
- **25** shipped names do not appear in the extract **once the OSM `Grad `/
  `Općina ` prefix is stripped**, which is the comparison the matcher makes and
  the one this count is about. Say it without the strip and the answer is 555,
  because 554 of the 557 extract names carry the prefix — that is the figure a
  reader gets from a plain string comparison, and the reason an audit read this
  paragraph as still wrong. `Grad Dugo Selo` and `Općina Lupoglav` are not
  examples of the 25 for the same reason: stripped, they match exactly.
  **24** of the 25 are naming variants, not missing geometry — 20 Istrian
  municipalities bilingual in one file and not the other (`Bale ‒ Valle`,
  `Poreč ‒ Parenzo`, `Kaštelir-Labinci ‒ Castelliere-S. Domenica`), three č/ć
  swaps (shipped `Budinščina`, `Hrašćina`, `Okučani` against OSM
  `Budinšćina`, `Hraščina`, `Okućani`) and one hyphen (`Zlatar-Bistrica`
  against `Zlatar Bistrica`). The matcher folds all of that; a string comparison
  from outside does not. The 25th is `Grad Zagreb`, which genuinely has no
  geometry in the extract.

No audit has executed a pipeline script in place, and none is executed by
`npm run verify` — the data files are inputs to the app, and the suite verifies
them by recomputing the ground-truth table from what ships. The byte-for-byte
rerun of `ipf.py` reported above was done in a fix pass rather than an audit,
in a scratch copy with the output path redirected and the repo left clean; the
pass after 2.6.1 repeated it and did the same for `parse_cit.py`. (The sentence
this replaces said "in either audit", which named the two that existed when it
was written; more have run since, and the paragraph above it now reports a
rerun — so a maintainer met "it was rerun and verified" and "nothing was
executed" thirty lines apart with no way to tell which was stale. Both were
true. Only one said whose run it was.)

### `atlas_data2.json` is reproducible here — the old note was wrong

This section used to claim that the county leaf series (`ii`, `oi`, `ie`, `oe`),
`pe` and `p` came from a parser living outside the repository, so that a DZS
revision could not be absorbed by rerunning the pipeline. That claim is false,
and it was load-bearing: it scoped a house rule, and it stopped two independent
auditors from checking the largest payload in the app.

`raw/pregled-zupanije.xlsx` is committed, and every one of those values is in it:
sheets 7.4.1.–7.4.3. An audit re-derived the whole series from that workbook with
a hand-rolled xlsx reader and matched it exactly — 21 counties × {ii, ie, oi, oe}
× 28 years = 2.352 leaf values, Σcounties − the RH row = 0 for all four series in
all 28 years, the 21 `nat` arrays plus `natRH` from sheet 7.4.1., and `pe` from
sheet 7.4.3. (2001–2024) with 504 matched and 0 mismatches.

`parse_nat.py` only *patches* the `nat` arrays into an existing file, so there is
still no committed script that rebuilds the leaf series from the workbook —
which is a missing `parse_series.py`, not missing provenance. Writing it is the
single most useful addition here, and it is now known to be possible.
