# Migracijski atlas županija — React

Interactive atlas of Croatian county migration 1998–2025 (DZS series + measured 2018
OD matrix + IPF estimates + natural change + citizenship panel + JLS drill + PNG/SVG
export). React port of a verified single-file D3 app; the original v4 and its full
project handoff live in `reference/` — read `reference/HANDOFF-v4-singlefile.md` for
data provenance details, methodology, and project history (DZS zahtjev, outreach).

**v1.0.0** was behaviorally 1:1 with single-file v4 (32-check suite). **v2.0.0**
extends it with permalink state, Nalazi story presets, a corridor pair card, the
Matrica (21×21 OD heatmap) and JLS-2018 municipal map views, a relative
klasifikacija threshold, a dob/spol panel + zemlje tab, map labels, and SVG export
— the suite grew to **67 checks**. New surfaces obey the same rules: honesty labels,
generated-data-stays-generated, hr-HR formatting, and green verify before "done".

## Commands

```
npm run dev        # vite dev server
npm run build      # production build -> dist/ (base './', works from any subpath)
npm run verify     # build + run the 32-check puppeteer suite against dist/
npm run lint       # oxlint
npm run typecheck  # tsc --noEmit (strict)
```

`verify` needs puppeteer: `npm i -D puppeteer` once (kept out of default deps to
spare the ~170 MB Chrome download), or set `PUPPETEER_PATH` to an existing install.

## House rules (non-negotiable)

1. **No "looks fine".** Visual claims require measurements: DOM checks, numeric
   invariants, bounding-box math. The original v1 shipped a broken map because
   verification was "described a screenshot" — and the description was confabulated.
   If you cannot actually perceive an image, say so. `npm run verify` green is the
   minimum bar before calling anything done; UI-geometry changes additionally get
   measured (element rects, overlap areas) at 1440 and 390 px.
2. **DOM contract = test API.** `scripts/verify.cjs` selects on ids/classes
   (`#map .cnt[data-iso]`, `#map .jl[data-j]`, `.mxc[data-a][data-b]`,
   `#railList .rrow .rname/.rval`, `#legend`, `#citzHd`, `#jcardHd`, `#ageHd`,
   `#segView button[data-v]`, `#bigYear`, `#story`, `#storyCap`, `#labBtn`,
   `#cardRow`, `#pairName/#pairRow`, `window.__exportPNG/__exportSVG`, …).
   Renaming them breaks verification; change both sides deliberately or not at all.
3. **Honesty labels are load-bearing.** 2018 godišnje tokovi = "izmjereno"; every
   other tokovi year = "procjena (IPF)"; cumulative = "kumulativna procjena"; pair
   nets carry the extra structural-estimate note. The **Matrica** view inherits the
   same badge logic; its diagonal is hatched with a "not part of the matrix" note.
   The **JLS drill and the JLS-2018 map** are 2018-only, internal-moves-only, and
   say so (the map adds a √-scale note and OSM/ODbL attribution). The citizenship
   panel is national-scope 2021–2025; its **zemlje** tab and the **dob/spol** panel
   are national **2025-only** (STAN one-year tables) and labelled so — the time
   scrubber does not change them. "Mig. + prirodno" is the identity sum of two
   published components, not DZS total population change. The relative
   klasifikacija threshold states it is % popisa 2011. Never weaken these.
4. **Generated data stays generated.** `src/data/*.json` are outputs of
   `tools/pipeline/` — edit the pipeline, rerun, never hand-edit the JSONs.
5. **hr-HR formatting** everywhere (`Intl 'hr-HR'`), display minus is U+2212 `−`
   (verify.cjs matches on it), UI copy is Croatian, declension avoided via arrow
   phrasing ("X → ostale županije").

## Architecture

```
src/lib/types.ts         State shape (literal unions) + generated-payload types
src/lib/metrics.ts       pure computation layer: series, domains (DOM/RDOM),
                         scales, klas, flows (ODM), flowMax/mxMax/jmap caches,
                         exportDesc. No DOM, no React. Most logic changes go here.
src/lib/hash.ts          permalink codec (whitelisted State ⇄ location.hash)
src/lib/stories.ts       Nalazi presets (State patch + Croatian caption per finding)
src/lib/exportPng.ts     canvas PNG + vector SVG composition (title band + baked
                         map SVG + legend); both share bakeMapClone/legendSpec
src/App.tsx              state machine (single S object; v4 semantics + mx/jmap
                         transitions, first-entry 2018 jump, klas/cum clamps, play
                         loop, keyboard, hash sync, body classes, panel exclusion)
src/components/          Header (segments + PNG/SVG), MapView (projection fit +
                         county/JLS paths + region outlines + arcs + labels; owns
                         overlay panels; delegates to MatrixView for mx), Legend,
                         Rail, DetailCard, PairCard, JlsCard, CitzPanel (+ zemlje
                         tab), AgePanel, StoryBar, MatrixView, Scrubber, Tooltip
src/index.css            design system from single-file v4 + v2 additions; class
                         names are part of the DOM contract
src/data/                generated payloads (see tools/pipeline/)
scripts/verify.cjs       the executable verification protocol (67 checks)
```

State flows one way: controls mutate `S` in App → components derive everything per
render from `S` + `metrics.ts`. Imperative escape hatches: tooltip positioning (ref
mutation on pointermove, documented in Tooltip.tsx) and hash sync
(`history.replaceState` in an App effect). `INITIAL = {...BASE, ...decodeHash(hash)}`,
so a shared URL boots straight into its view; `decodeHash` repairs invariants
(flow needs a hub, klas/cum clamp to ≥2011, panels mutually exclusive).

## Design tokens (keep)

Karst-grey bg `#F4F5F2`, ink `#20262B`, Adriatic teal `#0F7D8C` for **controls
only**, vermilion `#B5341F` ↔ indigo `#1D4E89` diverging data scale (Lab
interpolation), Oswald display + IBM Plex Sans/Mono. Citizenship group colors are
in `metrics.ts CGROUPS`. Don't introduce new hues without a reason tied to
semantics.

## Ground truths (independently derived; verify.cjs asserts them)

| Check | Value |
|---|---|
| saldo rail top, kum 2011–2024 | Grad Zagreb +41.986 |
| klasifikacija counts at −4.500 | 7 / 5 / 9 |
| prirodno kum 2011–2024 | best Međimurska −1.782, worst Primorsko-goranska −22.890, all 21 negative |
| mig+prirodno kum 2011–2024 | GZ +27.521 / Istarska +11.531 / Zadarska +3.292 / bottom Osječko-baranjska −48.271 |
| Istarska decomposition (tooltip) | +22.537 mig / −11.006 nat / +11.531 total |
| citizenship 2024 | +70.391 / −38.997 / saldo +31.394; Azija +26.601 |
| tokovi 2018 HR-21 odlasci top-3 | Zagrebačka 2.311 / Splitsko-dalm. 469 / Primorsko-gor. 447, badge "izmjereno" |
| JLS drill | Grad Zagreb → Velika Gorica 426; Split → Solin 354; GZ unutar = empty state |
| regije rail kum 2011–2024 | +55.281 / +26.987 / +18.419 / −46.669 / −97.195 |
| geometry | 21 `.cnt` paths, max county bbox ≤ 5 % of canvas, Istra west of Vukovar |
| Matrica cell GZ↔Zagrebačka 2018 | 2.311 / 1.977 / neto −334; 420 directed cells; badge "izmjereno" |
| klasifikacija counts at 1,5 % popisa 2011 | 7 / 3 / 11 (Karlovačka + Koprivničko-kr. flip to gubitnice) |
| JLS-2018 map (measured, internal only) | 556 polygons; net top Grad Zagreb +3.413, bottom Split −691; Split tip +1.693 / −2.384 / −691; max JLS bbox ≤ 5 % |
| dob/spol 2025 (STAN I T3/II T2) | vanjska +56.665 / −37.485, 66 % M doseljeni, vrh 25–29; unutarnja 73.838, 54 % žene |
| zemlje 2025 (STAN I T4) | Njemačka +9.628/−6.238, Nepal +6.264; total +56.665 |

If a data refresh legitimately changes these (DZS revises series), recompute the
constants from the raw sources (see `tools/pipeline/README.md`), update verify.cjs
**and** this table in the same commit, and say which vintage moved them.
