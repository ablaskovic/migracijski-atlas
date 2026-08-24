# Data pipeline

Regenerates `src/data/*.json` from raw sources. Run from this directory.

```
pip install numpy openpyxl
python3 parse_nat.py     # raw/pregled-zupanije.xlsx 7.4.1 -> nat arrays in atlas_data2.json
python3 parse_cit.py     # raw/stan-2026-2-1_tablice-hr.xlsx I T2 -> citizen.json
python3 parse_demo.py    # raw/stan-2026-2-1_tablice-hr.xlsx I T3 / II T2 / I T4 -> demo.json
python3 parse_jls.py     # ext/pitoski.xlsx GRAVITY + raw/po-jls.xlsx 7.5.18 -> jls_drill.json
python3 parse_jlsmap.py  # ext/pitoski.xlsx GRAVITY -> ext/jls_stats.json (per-JLS in/out)
node   geo_jls.cjs       # ext/jls_stats.json + raw/jls_geo_osm.geojson -> geo_jls.json
python3 ipf.py           # od2018.json + margins -> odm.json (2018 measured, rest IPF)
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

DZS hash-URLs rot when workbooks are republished; navigate from
`https://podaci.dzs.hr/hr/podaci/stanovnistvo/migracija-stanovnistva/` to find
current links. Sheet 7.4.2/7.4.3 parsing lives upstream (see
`reference/HANDOFF-v4-singlefile.md` §4) — the full series JSON was built there and
is committed; only nat/citizen/jls/odm are regenerated here.

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

The Python docstrings still cite the pre-port paths in their prose; the code
itself opens the correct relative paths from `tools/pipeline/`.

## What this pipeline does *not* regenerate

- **`geo_counties.json`**, **`geo_regions5.json`** — mapshaper one-liners over
  geoBoundaries ADM1, recorded only in the handoff's provenance section.
- **`odm.json`**, **`jls_drill.json`** and the statistics baked into
  `geo_jls.json` — these descend from the 31 MB Pitoski figshare edge list, which
  is downloaded separately and is not committed here.

### The OSM extract holds 557 features and 556 ship — that is expected

`geo_jls.cjs` asserts "a perfect 1:1 cover of all 556 JLS" before writing, and
throws otherwise, so a run that produced `geo_jls.json` proved the claim for
itself. Counting the committed files from outside does not reproduce it, and an
audit flagged the difference; both halves check out:

- `raw/jls_geo_osm.geojson` has **557** features to **556** shipped, and the
  arithmetic is 557 − 2 + 1. **Two** features come from outside Croatia, picked up
  by the Overpass bounding box: `Град Сомбор` (Sombor, Serbia) and
  `Upravna enota Piran / Unità amministrativa Pirano` (Slovenia). Neither is
  dropped by the county-centroid test — both score **zero** hits in all three name
  indices, so `uni.length >= 1` is false and that test never runs for them; they
  are dropped at the name stage. That leaves 555 matched from the extract, and the
  556th shipped feature is **Grad Zagreb**, substituted from `geo_counties.json`
  because it is admin_level 6 in OSM and the level-7 pull cannot contain it — the
  same substitution this file describes further up.
- **25** shipped names do not appear verbatim in the extract. **24** are naming
  variants, not missing geometry: the extract carries official forms
  (`Grad Dugo Selo`, `Općina Lupoglav`) while the shipped data carries short
  ones, and the Istrian municipalities are bilingual in one and not the other
  (`Bale ‒ Valle`, `Poreč ‒ Parenzo`, `Kaštelir-Labinci ‒ Castelliere-S.
  Domenica`). The matcher normalises; a string comparison from outside does not.
  The 25th is `Grad Zagreb`, which genuinely has no geometry in the extract.

No pipeline script was executed in either audit, and none is executed by
`npm run verify` — the data files are inputs to the app, and the suite verifies
them by recomputing the ground-truth table from what ships.

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
