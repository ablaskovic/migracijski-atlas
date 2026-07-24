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
writing. Its geometry input `raw/jls_geo_osm.geojson` (472 KB, committed) came from
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
