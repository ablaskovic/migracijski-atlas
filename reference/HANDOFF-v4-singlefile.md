# MIGRACIJSKI ATLAS ŽUPANIJA — project handoff

> For the assistant reading this in a new chat: this document is the full context transfer
> for an ongoing project. The previous chat's memory and transcript do not carry over —
> everything needed is here and in the accompanying zip. Read this top to bottom before
> touching anything. The user's working style is described in §1; follow it.

Current state: **v4**, working, shipped as a single-file HTML artifact
(`migracijski-atlas.html`). No known open bugs. v4 adds the four backlog features
(prirodno kretanje, citizenship panel, JLS drill, PNG export) — all verified by the
committed harness `src/verify.js` (32 checks, all passing on both variants).

---

## 1. User context

- Ante (handle: TypicalHog). Junior full-stack dev at a small Croatian GIS firm.
  Day job: PERN + PostGIS, multi-tenant GIS platform for municipalities. Rust is his
  personal primary language; self-taught, no degree. Lives in rural Croatia.
- Communication preferences (his explicit, standing instructions):
  - brutally honest feedback, no sugarcoating; own mistakes plainly
  - mechanistic, substrate-level explanations ("gears, not sermons"); no
    lifestyle/behavioral advice framing
  - lowercase casual style in chat; assistant complements with slightly more structure
    but doesn't go corporate
  - English or Croatian, match context (this project mixes both; UI copy is Croatian)
- Verification culture established in this project: after one bad incident (§3, v1),
  visual "looks fine" claims are not accepted — verify with measurements (DOM checks,
  numeric invariants), and if the assistant can't actually see a screenshot, it must
  say so instead of describing it.

## 2. Why this project exists

Paper: **Maras, M. & Vinovrški, L. (2026): "Unutarnje i vanjske migracije stanovništva
županija kao kriterij regionalizacije Hrvatske"** (Croatian; county-level migration
2011–2024 from DZS, winners/neutral/losers classification with a −4.500 threshold,
proposes 5 macro-regions: Zagreb, Split, Rijeka, Osijek centers + a centerless
Središnja Hrvatska; 9-region interim variant).

Ante had previously deep-dived Marin Maras's earlier paper on EU structural funds and
prepared outreach questions; the collaboration angle is **interactive GIS mapping for
his NUTS-3 / regionalization work** (Maras is at Veleučilište u Karlovcu). This atlas
is the concrete door-opener: the paper itself contains **zero maps**.

Critique of the paper (from the analysis turn; usable in outreach, phrased kindly):
1. Works only with **net saldos** — origin→destination structure is destroyed, so
   "gravity centers" are asserted, not shown. The atlas's tokovi view is the answer.
2. The **−4.500 threshold** for "gubitnice" is arbitrary and absolute (while figures
   show relatives). The atlas puts the threshold on a slider; on DZS's **revised**
   series, Karlovačka and Koprivničko-križevačka flip from neutralne to gubitnice at
   the paper's own threshold — same method, different data vintage, different result.
3. Known data problems (emigration undercount per Pokos & Turk; fake coastal
   residence registrations) acknowledged but used uncorrected.
4. The 5-region proposal restates Toskić/Klarić/Magaš rather than deriving regions
   from the migration data.
5. Sloppiness: "Slavonsko-brodska županija" (doesn't exist), Stojčić 2015 vs 2016
   citation mismatch, a DZS 2025 reference titled "u 2015", internal inconsistency
   Brodsko-posavska "−19 tisuća" vs "−9,2 %" (actual: −12.6 %).
6. Genuinely interesting in the paper: 2024 flip to net immigration (80 %+ foreign
   nationals; Asia overtakes BiH/Serbia as origin), and Zagrebačka absorbing Grad
   Zagreb's pull post-2019.

## 3. Session log (what happened, in order)

**T1 — paper critique.** Ante uploaded the PDF; produced the analysis in §2.

**T2 — "prototype the map" → v1.**
- Boundaries: geoBoundaries HRV ADM1 (21 županije, `shapeISO` HR-01…HR-21) →
  mapshaper visvalingam 25 %, islands < 2 km² dropped, precision 1e-4 → 92 KB.
- Found the real data: DZS "statistika u nizu" workbook, sheet **7.4.2.** has, per
  county per year **1998–2025**, the four leaf series: doseljeni **iz druge županije**
  (`ii`), **iz inozemstva** (`ie`), odseljeni **u drugu županiju** (`oi`),
  **u inozemstvo** (`oe`). Internal saldo = ii−oi, external = ie−oe.
- Validation vs paper: Šibensko-kninska (−285/−2.972) and Ličko-senjska (−26/−350)
  match **exactly** → same source. Others differ slightly (DZS revises series; the
  authors used an older vintage). Vukovarsko-srijemska −28.292 (−15,8 %),
  Grad Zagreb +28.529 int / +13.457 ext, Istarska +7,68 % ext — all consistent with
  the paper's roundings. Classification at 4.500 reproduces the paper's exact 7
  pobjednice.
- Built the D3 artifact (design system in §5). **v1 shipped broken**: the map rendered
  as a giant pac-man donut. Worse: the assistant's own verification screenshots showed
  the donut and it *described them as a correct map* (confabulated). Ante caught it
  from his screenshot next turn. Root cause and the lesson are in §7 — this is why the
  verification protocol exists.

**T3 — bug fix + big expansion → v2.**
- Bug mechanism: polygon ring **winding order**. d3-geo interprets rings spherically;
  wrong winding = each polygon covers "the whole planet except the county". All 21
  features were inverted; rewound at build time (test: `geoArea(feature) > π` →
  reverse rings). After fix, features sum to 56.230 km² (Croatia: 56.594; diff =
  simplification + dropped islets).
- OD matrix hunt: the county×county matrix is **not published** in any DZS priopćenje,
  any vintage (old web.dzs.hr format checked back to 2016+; new format 2023–2026
  checked) — only row/column margins. The matrix exists only via **"posebna obrada"**
  (custom tabulation on request). Two known escapes: Zagreb's demography office
  (charts-only PDF, useless) and **Pitoski, Lampoltshammer & Parycek (2021), "Network
  analysis of internal migration in Croatia"** — they requested the **2018
  municipality-level directed edge list** from DZS and republished the raw
  supplementary data on figshare under **CC BY 4.0**. That is the only open matrix.
- Aggregated their 13.487 municipal edges (57.465 movers) to 21×21 via the DZS
  JLS→county registry (sheet 7.5.18. = year 2018). Name-matching hazards solved:
  đ/Đ does not NFKD-decompose (fold manually before diacritic stripping); "Stari
  Grad" (Hvar) vs "Starigrad" (Paklenica) collide if spaces are stripped (two-tier
  match: space-preserving first); three duplicate JLS names (Privlaka, Otok, Sveta
  Nedelja) — Pitoski disambiguates them with "(… županija)" suffixes in node names;
  bilingual Istrian names ("Buje - Buie") matched by prefix after folding.
- **Validation was exact to the person**: inter-county total 30.384 and same-county
  27.081 match DZS 2018; **all 21 row sums and all 21 column sums** match the 7.4.2
  series. The matrix is genuine.
- v2 features added: Tokovi view (arcs, smjer odlasci/dolasci/neto), Regije view
  (paper's 5 regions dissolved into outlines + aggregated choropleth; cumulative
  2011–2024: Zagrebačka regija +55.281, Sjevernojadranska +26.987, Dalmatinska
  +18.419, Središnja −46.669, **Istočna −97.195**), per-county detail card (annual
  1998–2025 chart: vanjske as signed area, unutarnje as line), third denominator
  "% tek. procjene" (mid-year estimates, sheet 7.4.3., 2001–2024), legend made
  wrap-safe, Croatian declension avoided via arrow phrasing ("X → ostale županije").
- Headline finding: **Zagreb's only net-losing relationship is with its own ring** —
  GZ→Zagrebačka 2.311 vs 1.977 back (−334) in 2018; every other county feeds Zagreb
  (Split 938, Osijek 668, Sisak 665…). The gravity structure net saldos can't show.

**T4 — "why only 2018?"** Explained: DZS has full MUP-based microdata every year but
disseminates only margins; cells only via posebna obrada; margins don't determine
cells (that's literally why Pitoski fit gravity/radiation models); IPF proposed as the
estimate; a **zahtjev to DZS** for 2011–2025 county matrices is the real fix (no
disclosure issue at county level; an academic co-signer helps → Maras hook again).

**T5 — "make it so we have tokovi for more years" → v3 (current).**
- **IPF/RAS** at build time: 2018 matrix as structural seed, iteratively rescaled so
  each year's row sums equal that year's `oi` margins and column sums equal `ii`
  margins. Converges ≤ 18 iterations at 1e-7. Integer rounding by largest remainder
  per row → **row sums exact**, max column drift 5 persons. 2018 passes through
  unchanged (verified col-exact). Matrix totals match the DZS inter-county series
  exactly for every year. 1 structural zero among 420 directed pairs (a pair with no
  2018 flow stays zero in all estimates).
- **Data discovery**: DZS margins **don't balance 1998–2006** (national doseljeni-iz ≠
  odseljeni-u; max |550| in 2002; 1998 = +218). Prijava/odjava landing in different
  reference years under old methodology. From 2007 the system is exactly closed.
  Handling: rows anchored exactly, in-margins rescaled proportionally for those years.
- Honesty labeling in UI: 2018 godišnje badge "**izmjereno**"; everything else
  "**procjena (IPF)**"; cumulative always "kumulativna procjena"; legend carries the
  method note, neto adds "Neto parova je strukturna procjena" (pair-level nets are
  the most assumption-dependent output — margins pin totals, not who-trades-with-whom);
  small accent ring on the scrubber axis marks 2018.
- Vrijeme unlocked in Tokovi → cumulative 2011–20xx net-exchange maps work.
- Estimated GZ↔ring net series as sanity check (margin-driven, not assumed):
  −2.289 (1998) → −952 (2008) → **−9 (2015**, emigration wave froze suburbanization)
  → −334 (2018, measured) → −1.553 (2021) → −1.542 (2025).
- Known limit stated to user: IPF cannot detect **structural** change (rewiring of
  who-trades-with-whom); only the DZS zahtjev settles that. Comparing measured vs IPF
  matrices once obtained is itself a publishable-adjacent mini-result.

**T6 — v3 packaging.**

**T7 — backlog build → v4 (current).**
- **Prirodno kretanje** (sheet 7.4.1., same workbook; parsed by `src/parse_nat.py`
  into `nat` arrays + national `natRH`; county sums cross-check against the RH row
  for every year 1998–2025, zero missing cells). UI: "Sastavnica" segment gains
  **Prirodno** and **Mig. + prirodno** ('all'); tooltip gains prirodni prirast +
  ukupna promjena rows; detail card gains a dashed nat line. Finding worth leading
  with: **every county is natural-negative 2011–2024** (best: Međimurska −1.782;
  worst: Primorsko-goranska −22.890) and only **three** counties are positive on
  total change: Grad Zagreb +27.521, Istarska +11.531, Zadarska +3.292 — Istarska's
  +22.537 migration gain is halved by −11.006 natural loss. Osječko-baranjska is
  −48.271 total. The paper's migration-only lens hides all of this.
- **Citizenship panel**: DZS published **STAN-2026-2-1** ("Migracija stanovništva RH
  u 2025.", 17. 07. 2026.) — tables xlsx has sheet **I T2** = vanjska migracija
  prema **zemlji državljanstva 2021–2025**. Parsed by `src/parse_cit.py` into
  `data/citizen.json` (550 B; groups hr / susjedstvo(BiH·SRB·XK·MK·AL·CG) / ukr /
  EU / Azija / ostalo; residual checksum-verified per year). UI: collapsible chip
  panel bottom-right, mirrored stacked bars (doseljeni up / odseljeni down), active
  year follows the scrubber within 2021–2025. New findings the paper predates:
  **hrvatski državljani flip to net-positive in 2025 (+3.705**, from −6.857 in 2024)
  and the **Asian wave cools** (doseljeni 26.601→16.036, odseljeni 4.926→9.190 —
  churn, not just arrival slowdown). National saldos cross-check the atlas exactly
  (2024 +31.394, 2025 +19.180).
- **JLS drill**: reused the full Pitoski municipal edge list (13.487 edges,
  57.465 movers — re-downloaded, 31 MB, not committed). `src/parse_jls.py`
  re-derives the name matching (three-tier: exact-full → bilingual-part → stripped;
  dash-variant normalization U+2012/13/14/15; "(… županija)" suffix hints;
  footnote-row skip; Grad Zagreb appended as its own JLS), **re-validates the 21×21
  aggregate cell-for-cell against `od2018.json`**, then emits per-county top
  corridors (12 out / 12 in / 10 unutar) → `data/jls_drill.json` (13 KB, 275 JLS
  referenced). UI: collapsible card top-left in Tokovi view; tabs Među žup. /
  Unutar žup.; respects Smjer (net shows gross corridors, labeled — JLS-level net
  is not published). Always 2018 · izmjereno, said explicitly. Split→Solin 354 is
  the top within-county corridor nationally after the Zagreb ring.
- **PNG export**: header button; canvas composition (2× scale) = title band
  (view descriptor via `exportDesc()`, shrink-to-fit) + serialized map SVG (CSS-var
  and class-provided attrs baked onto the clone) + redrawn legend (gradient /
  swatches / badge) + attribution band. Fonts render via canvas 2D from the
  document (Oswald/Plex online; graceful fallback offline). `window.__exportPNG(false)`
  returns `{w,h,bytes}` for testing.
- **Layout verified by measurement** (no "looks fine"): header stays 138 px at
  1280/1440 (was regressing to 194 before seg-padding + label compaction);
  phone 390 px: segFlow overflow 0, all panel-pair overlaps 0 (chip panels are
  mutually exclusive, bodies cap at 26vh and scroll, legend hides under an open
  panel on phone only).
- `src/verify.js` codifies §7 as an executable 32-check suite; both variants pass.

## 4. Data provenance (all of it)

| What | Source | Notes |
|---|---|---|
| County boundaries | geoBoundaries gbOpen HRV ADM1 (OSM-derived, ODbL) — `https://www.geoboundaries.org/api/current/gbOpen/HRV/ADM1/` → simplified geojson from the `simplifiedGeometryGeoJSON` link | mapshaper visvalingam 25 % keep-shapes, `-filter-islands min-area=2km2`, precision 1e-4; **all 21 rings rewound** for d3 (`geoArea>π` test). File: `src/data/hrv21_fixed.geojson` (92 KB). |
| Migration series 1998–2025 | DZS, Stanovništvo – pregled po županijama, sheet **7.4.2.** — `https://podaci.dzs.hr/media/ueajlqe5/stanovnistvo-pregled-po-zupanijama.xlsx` (⚠ the `/media/<hash>/` part **changes** when DZS republishes; navigate from `https://podaci.dzs.hr/hr/podaci/stanovnistvo/migracija-stanovnistva/` if dead) | Four leaf series per county per year (`ii, ie, oi, oe`); parse `data_only=True` (aggregate rows contain formulas). Raw xlsx included: `src/data/raw/pregled-zupanije.xlsx`. |
| Mid-year population estimates 2001–2024 | same workbook, sheet **7.4.3.** | merged as `pe` arrays; pre-2001 and 2025 clamped to nearest available in UI (`peAt`). |
| 2011 census populations | constants in `atlas_data2.json` (`p`) | verified against the paper's own % figures (e.g. Istarska 208.055 → +7,59 % ≈ paper's +7,6). |
| 2018 OD matrix | Pitoski, Lampoltshammer & Parycek 2021 supplementary, figshare article **12497177**, file `https://ndownloader.figshare.com/files/23184374` (31 MB xlsx, **CC BY 4.0** — attribution required and present in UI) | `GRAVITY` sheet = full directed municipal edge list (source, target, …, `w_ij` real flow at col 7). Aggregated to counties. |
| JLS→county registry | DZS, Stanovništvo – pregled po gradovima i općinama, sheet **7.5.18.** (= year 2018) — `https://podaci.dzs.hr/media/2gihgkfh/stanovnistvo-pregled-po-gradovima-i-opcinama.xlsx` | county header rows followed by their JLS rows. Raw xlsx included: `src/data/raw/po-jls.xlsx`. |
| IPF matrices 1998–2025 | computed (`src/ipf.py`) | see §3-T5 for method + guarantees. `src/data/odm.json` (39 KB): `{"HR-xx":{"HR-yy":[28 ints]}}`, zero-pairs omitted. |
| Prirodno kretanje 1998–2025 | same workbook, sheet **7.4.1.** (živorođeni/umrli/prirodni prirast blocks per county) | parsed by `src/parse_nat.py` into `nat` arrays + `natRH`; county sums == RH row every year. |
| Citizenship 2021–2025 | DZS priopćenje **STAN-2026-2-1** tables — `https://podaci.dzs.hr/media/r4yd1ly4/stan-2026-2-1_tablice-hr.xlsx` (⚠ hash-URL rots; navigate from the migracija-stanovnistva page, priopćenje link `/2026/hr/121583`), sheet **I T2** | parsed by `src/parse_cit.py` → `data/citizen.json`; group residual ("ost") checksum-verified. Raw xlsx included: `src/data/raw/stan-2026-2-1_tablice-hr.xlsx`. Also re-checked **II T3**: internal migration by county = **margins only** — the county×county matrix is still unpublished (zahtjev thread stands). |
| JLS corridors 2018 | Pitoski figshare file above, `GRAVITY` sheet, municipal resolution | `src/parse_jls.py` re-validates vs `od2018.json` exactly, emits `data/jls_drill.json` (top 12/12/10 per county). |
| Region definition | interpretation of the paper's 5-region proposal | zg: 21+01 · sr: 02,05,20,06,07,03,04 · sj: 08,18,09 · da: 13,15,17,19 · is: 14,16,12,11,10. **Ličko-senjska→Sjeverni Jadran is our call** (paper leaves Lika open, may gravitate to Zadar) — footnoted in the UI legend. `src/data/regions5.geojson` = mapshaper `-dissolve`, rewound. |

Numbers a fresh instance can use as ground truth: national internal saldo ≡ 0 every
year from 2007 (closed system); 2024 national external saldo +31.394; 2025 +19.180
(both also in STAN-2026-2-1 I T1 — cross-source match); 2018 inter-county movers
30.384; same-county-inter-JLS 27.081; RH prirodni prirast 2024 −19.011, 2025 −17.528;
citizenship 2024: doseljeni 70.391 (81,1 % strani), Azija 26.601.

## 5. The artifact — technical doc

Single self-contained HTML file, no build step at runtime, no storage APIs, no
network data fetches. Two variants in this package:
- `migracijski-atlas.html` (286 KB) — loads **d3 7.9.0 from cdnjs** and Google Fonts
  (Oswald / IBM Plex Sans / IBM Plex Mono). Needs internet. This is the one that
  renders as a claude.ai artifact (cdnjs is allowed there).
- `migracijski-atlas-offline.html` (565 KB) — identical but with d3 **inlined**
  (`src/vendor_d3.min.js`, built by `src/build_offline.py`); verified rendering with
  networking disabled. Fonts fall back to Arial Narrow / system stacks offline
  (by design; faces not embedded — PNG export offline uses the same fallbacks).

Build system: `src/atlas_template2.html` holds the code with six placeholders —
`__GEO__ __REGGEO__ __DATA__ __ODM__ __CIT__ __JLS__` — and `src/build.py` injects
`hrv21_fixed.geojson / regions5.geojson / atlas_data2.json / odm.json / citizen.json /
jls_drill.json`. Always edit the **template**, then rebuild; never hand-edit the
built file.

Data shapes:
- `atlas_data2.json`: `{years:[1998..2025], natRH[28], c:{"HR-01":{n,p,ii[28],ie[28],oi[28],oe[28],pe[28|null],nat[28]}}}`
- `odm.json`: `{"HR-a":{"HR-b":[28 ints]}}` (directed, off-diagonal, sparse)
- `citizen.json`: `{years:[2021..2025], tot:{d,o}, g:{hr|sus|ukr|eu|az|ost:{d[5],o[5]}}}`
- `jls_drill.json`: `{names:[[display,countyIdx0-20]…], c:{"HR-xx":{out[≤12],in[≤12],loc[≤10]}}}`
  where each entry is `[srcNameIdx,dstNameIdx,persons]` — measured 2018 only

App state `S`: `{view: saldo|klas|reg|flow, flow: tot|int|ext|nat|all, den:
abs|rel11|relest, cum, yi, thr, sel, dir: out|in|net, flowSeen, citz, jls,
jlsTab: inter|loc}`. `netAt` covers all five flow components ('all' = migration +
natural); domains precomputed for all of them.

Views:
- **Saldo** — diverging choropleth (`#B5341F ↔ #F1EEE9 ↔ #1D4E89`, Lab interpolation),
  domains precomputed per (flow×den×cum) combo and **fixed across years** so scrubbing
  is comparable (`DOM`, `RDOM` for regions).
- **Klasifikacija** — paper's three classes on cumulative total absolute saldo,
  threshold slider (default 4.500); other segments locked.
- **Regije** — county fills = region-aggregate value on region-level domain; dissolved
  outlines overlay (`gR`); rail lists 5 regions.
- **Tokovi** — select county (click; default HR-21), quad-bezier arcs, width
  `scaleSqrt` 0.6–13 px on the per-(sel,dir,cum) max **across all years** (cache `FC`);
  `getOD/fsum/flowOf` read `ODM`; badge via `flowBadge()`; tok/den segments locked,
  vrijeme unlocked.
- Detail card (non-flow views, click county): annual 1998–2025 chart, external as
  sign-split area (clipPath pair), internal as line, cursor synced to `S.yi`.
- Scrubber = national signed-area chart of external saldo + dashed gross inter-county
  volume line + EU-2013 marker + hatched pre-2011 (cum modes) + 2018 ring (flow view)
  + draggable cursor + big Oswald year numeral. Keyboard: ←/→ year, space play.
- **Chip panels** (v4, shared `.chipcard` pattern, mutually exclusive, keyboard
  operable): `#citz` bottom-right (national citizenship, mirrored stacked bars,
  active year synced to scrubber within 2021–2025, group legend with active-year
  numbers) and `#jcard` top-left in Tokovi (JLS corridors; tabs među/unutar;
  follows Smjer; empty-state for Grad Zagreb unutar). On ≤900 px an open panel
  hides the legend (`body.panel-open`), bodies cap at 26vh and scroll.
- **PNG export** `#pngBtn`: see §3-T7; `exportDesc()` builds the caption from state;
  `VARS` maps CSS vars to literals for the SVG clone.
- hr-HR number formatting; `−` U+2212 for display minus (verify.js matches on this).

Design tokens (deliberate, keep): karst-grey bg `#F4F5F2`, ink `#20262B`, Adriatic
teal accent `#0F7D8C` (controls only), vermilion↔indigo data scale matching the
paper's red/blue semantics; Oswald display (echo of DZS's own site type), IBM Plex
Sans/Mono for UI/data. Croatian UI copy; declension avoided via arrow phrasing.

## 6. Methodological caveats (keep these attached to any claims)

1. DZS revises series; the paper's vintage differs from current pulls (that's the
   Karlovačka/Koprivničko class-flip demo, and why atlas ≠ paper on some values).
2. "% popisa 2011." inherits the paper's shrinking-denominator problem — that's why
   "% tek. procjene" exists (estimates themselves rebased after census 2021).
3. 1998–2006 margin imbalance (§3-T5) — pre-2007 flows are the softest part of the
   series even before IPF.
4. IPF assumes stable 2018 flow *structure*; only volumes move with margins. Weakest
   for pair-level **neto** and for structurally weird years (COVID 2020, wave
   2013–2018). All labeled in-UI.
4a. "Mig. + prirodno" (ukupna promjena) is the demographic-identity sum of the two
   published components; it is **not** the DZS total population change (which also
   carries statistical adjustment between vintages). Citizenship panel is
   **national-scope, 2021–2025 only** (I T2 doesn't exist per county). JLS drill is
   **2018-only and top-K truncated** (12/12/10) — the full edge list is on figshare.
5. Lika region assignment is interpretation (footnoted).
6. Geometry: islands < 2 km² dropped, simplified — fine at country scale, not for
   parcel-level anything.
7. Emigration undercount / fake coastal registrations (paper's own citations) apply
   to the underlying data everywhere.

## 7. Verification protocol (house rule after the v1 incident)

The v1 map bug shipped because verification was "looked at screenshots and described
them" — and the description was confabulated. Also note: in the previous environment
the screenshot viewer sometimes returned images the assistant could not actually see;
if that happens, **say so** — never narrate an image you didn't perceive.

The protocol is now **executable**: `cd src && node verify.js ../migracijski-atlas.html`
(puppeteer; run it against the offline variant too). 32 checks, all hard numbers.
What it asserts (superset of the v3 list):
- zero `pageerror`s / console errors across all views and interactions
- 21 `.cnt` paths; **max county getBBox area ≤ 5 % of canvas** (the winding bug
  makes it ~100 %); Istria bbox left of Vukovar's
- saldo rail top (kum. 2011–2024, migracije, aps.): Grad Zagreb **+41.986**
- klasifikacija counts at −4.500: **7 / 5 / 9**
- prirodno rail (kum. 2011–2024): best Međimurska **−1.782**, worst
  Primorsko-goranska **−22.890**, all 21 negative
- mig.+prirodno rail: GZ **+27.521** / Istarska **+11.531** / Zadarska **+3.292** /
  bottom Osječko-baranjska **−48.271**; tooltip decomposition for Istarska
  (+22.537 / −11.006 / +11.531); dashed nat line present in the detail card
- citizenship panel 2024: **+70.391 / −38.997 / +31.394**, Azija **+26.601**,
  source note "STAN-2026-2-1"
- tokovi 2018 godišnje, HR-21, odlasci — rail top-3: Zagrebačka **2.311**,
  Splitsko-dalmatinska **469**, Primorsko-goranska **447**; badge "izmjereno"
- JLS drill: GZ top corridor **Grad Zagreb → Velika Gorica 426**; GZ unutar
  empty-state; HR-17 unutar top **Split → Solin 354**; card hidden outside Tokovi
- regije rail (kum. 2011–2024): +55.281 / +26.987 / +18.419 / −46.669 / −97.195
- PNG export: dims = 2× map + 174 px bands, blob > 50 KB
- any rebuilt `odm.json`: row sums exact vs `oi` every year; 2018 col-exact;
  totals match DZS inter-county series (asserted inside `ipf.py`)
Layout is checked by **measurement** when UI geometry changes (see T7: header
heights at 1280/1440, panel-pair overlap areas at 390 px = all zero).

## 8. Open threads / next steps (as discussed with Ante)

1. **DZS zahtjev** for county×county tables 2011–2025 (the real multi-year data).
   Draft skeleton (Croatian, adjust sender/affiliation):
   > **Predmet:** Zahtjev za posebnu obradu — matrica međužupanijske migracije, 2011.–2025.
   > Poštovani, za potrebe istraživanja regionalne strukture unutarnjih migracija
   > molimo tablice preseljenog stanovništva između županija (21×21, po županiji
   > odseljenja i županiji doseljenja), po godinama za razdoblje 2011.–2025.
   > Na razini županija podaci ne otvaraju pitanje statističke povjerljivosti
   > (usp. istovrsne podatke za 2018. objavljene uz Pitoski i sur., 2021).
   > Format: XLSX ili CSV. Zahvaljujemo.
   Academic co-signer (Maras) makes this smoother — which is also the outreach hook.
2. **Maras email** — atlas link + findings + zahtjev co-sign offer. v4 upgraded the
   ammunition; strongest set now: (a) GZ↔ring net loss (tokovi); (b) threshold flip
   on revised data; (c) only 3 counties positive on **ukupna promjena** — the
   migration-only lens hides that Istarska's gain is halved by natural loss;
   (d) **2025 citizenship turn**: hrvatski državljani +3.705 (first positive),
   Azija cooling with rising odseljeni — both post-date the paper's data.
   Ante has prior outreach questions prepared from the EU-funds paper deep-dive.
3. When measured 2011–2025 matrices arrive: **measured-vs-IPF comparison** (where
   structure actually shifted) — small standalone result.
4. v3 feature backlog: **all four built in v4** (§3-T7). Candidate next features,
   deliberately unbuilt: per-county citizenship (not published — would need its own
   zahtjev); JLS-level flows for more years (falls out of the DZS zahtjev if
   granted at JLS resolution); embedding Oswald/Plex subsets for offline-faithful
   PNG export (~120 KB cost); measured-vs-IPF diff view (needs thread 1).

## 9. Rebuild instructions

```
cd src
pip install numpy openpyxl   # openpyxl only if re-parsing xlsx
python3 parse_nat.py         # optional: re-patch nat from raw 7.4.1
python3 parse_cit.py         # optional: rebuild citizen.json from raw I T2
python3 parse_jls.py         # optional: rebuild jls_drill.json (needs ../ext/pitoski.xlsx, 31 MB figshare)
python3 ipf.py               # optional: regenerate data/odm.json
python3 build.py             # -> ../migracijski-atlas.html
python3 build_offline.py     # -> ../migracijski-atlas-offline.html (inlines vendor_d3.min.js)
node verify.js ../migracijski-atlas.html          # 32 checks — must all pass
node verify.js ../migracijski-atlas-offline.html  # same, offline variant
```
(`verify.js` expects puppeteer; `npm i puppeteer` once, anywhere on the path in the
script's `require`, or adjust the require path at the top.)

## 10. Package manifest

```
migracijski-atlas.html            built app v4, CDN d3 (use as claude.ai artifact)
migracijski-atlas-offline.html    built app v4, d3 inlined (works with no network)
HANDOFF.md                        this file
src/atlas_template2.html          source of truth (placeholders __GEO__ __REGGEO__ __DATA__ __ODM__ __CIT__ __JLS__)
src/build.py                      injector (6 payloads)
src/build_offline.py              CDN→inline d3 swap
src/vendor_d3.min.js              d3 7.9.0 (for the offline build)
src/ipf.py                        IPF matrix generator (documented, asserting)
src/parse_nat.py                  7.4.1 → nat arrays (asserting)
src/parse_cit.py                  I T2 → citizen.json (checksummed)
src/parse_jls.py                  Pitoski GRAVITY + 7.5.18 → jls_drill.json (validated vs od2018)
src/verify.js                     executable verification protocol (32 checks)
src/data/hrv21_fixed.geojson      21 counties, simplified, d3-winding-corrected
src/data/regions5.geojson         5-region dissolve (paper's proposal, Lika→SJ)
src/data/atlas_data2.json         full DZS series 1998–2025 + pop estimates + nat/natRH
src/data/od2018.json              measured 2018 matrix (Pitoski CC BY, validated exact)
src/data/odm.json                 per-year matrices (2018 measured + IPF)
src/data/citizen.json             national citizenship groups 2021–2025
src/data/jls_drill.json           per-county top JLS corridors, 2018 measured
src/data/raw/pregled-zupanije.xlsx       DZS source workbook (7.4.1/7.4.2/7.4.3) — hash-URLs rot
src/data/raw/po-jls.xlsx                 DZS JLS registry workbook (7.5.18)
src/data/raw/stan-2026-2-1_tablice-hr.xlsx  DZS priopćenje tables (I T2 citizenship)
```
(Pitoski xlsx is 31 MB and not included — figshare DOI 10.6084/m9.figshare.12497177 is stable;
`parse_jls.py` expects it at `../ext/pitoski.xlsx`.)
