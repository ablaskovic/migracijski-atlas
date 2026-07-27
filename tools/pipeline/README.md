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
- `scripts/verify.cjs` ground-truth constants + the table in `CLAUDE.md` — recompute
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
| `src/verify.js` (32 checks) | `scripts/verify.cjs` (209 checks) |

The Python docstrings still cite the pre-port paths in their prose; the code
itself opens the correct relative paths from `tools/pipeline/`.

## What this pipeline does *not* regenerate

Three payloads in `src/data/` have no parser here, and CLAUDE.md House Rule 4 is
scoped accordingly:

- **`atlas_data2.json`** — `parse_nat.py` only *patches* the `nat` arrays into an
  existing file. The leaf series (`ii`, `oi`, `ie`, `oe`), `pe` and `p` come from
  the upstream sheet 7.4.2/7.4.3 parser, which lives outside this repo. A DZS
  revision of those sheets cannot be absorbed by "rerun the pipeline".
- **`geo_counties.json`**, **`geo_regions5.json`** — mapshaper one-liners over
  geoBoundaries ADM1, recorded only in the handoff's provenance section.

Committing the upstream series parser as `parse_series.py` would close the first
gap and is the single most useful addition here.
