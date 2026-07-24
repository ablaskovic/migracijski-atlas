# Data pipeline

Regenerates `src/data/*.json` from raw sources. Run from this directory.

```
pip install numpy openpyxl
python3 parse_nat.py    # raw/pregled-zupanije.xlsx 7.4.1 -> nat arrays in atlas_data2.json
python3 parse_cit.py    # raw/stan-2026-2-1_tablice-hr.xlsx I T2 -> citizen.json
python3 parse_jls.py    # ext/pitoski.xlsx GRAVITY + raw/po-jls.xlsx 7.5.18 -> jls_drill.json
python3 ipf.py          # od2018.json + margins -> odm.json (2018 measured, rest IPF)
```

`parse_jls.py` needs the full Pitoski edge list at `ext/pitoski.xlsx` (31 MB, not
committed): download from figshare `https://ndownloader.figshare.com/files/23184374`
(article 12497177, CC BY 4.0).

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
- `src/components/CitzPanel.tsx` + `scripts/verify.cjs` — the STAN-2026-2-1 source
  name (verify asserts it appears in `#citzNote`)
- `scripts/verify.cjs` ground-truth constants + the table in `CLAUDE.md` — recompute
  from raw sources if DZS revised the series, and say which vintage moved them
