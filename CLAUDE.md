# Migracijski atlas županija — React

Interactive atlas of Croatian county migration 1998–2025 (DZS series + measured 2018
OD matrix + IPF estimates + natural change + citizenship panel + JLS drill + PNG
export). React port of a verified single-file D3 app; the original v4 and its full
project handoff live in `reference/` — read `reference/HANDOFF-v4-singlefile.md` for
data provenance details, methodology, and project history (DZS zahtjev, outreach).

This port is behaviorally 1:1 with single-file v4 and passes the same 32-check
verification suite. Keep it that way.

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
   (`#map .cnt[data-iso]`, `#railList .rrow .rname/.rval`, `#legend`, `#citzHd`,
   `#jcardHd`, `#segView button[data-v]`, `#bigYear`, `window.__exportPNG`, …).
   Renaming them breaks verification; change both sides deliberately or not at all.
3. **Honesty labels are load-bearing.** 2018 godišnje tokovi = "izmjereno"; every
   other tokovi year = "procjena (IPF)"; cumulative = "kumulativna procjena"; pair
   nets carry the extra structural-estimate note. The JLS drill is 2018-only and
   says so. The citizenship panel is national-scope 2021–2025 only. "Mig. +
   prirodno" is the identity sum of two published components, not DZS total
   population change. Never weaken these while adding features.
4. **Generated data stays generated.** `src/data/*.json` are outputs of
   `tools/pipeline/` — edit the pipeline, rerun, never hand-edit the JSONs.
5. **hr-HR formatting** everywhere (`Intl 'hr-HR'`), display minus is U+2212 `−`
   (verify.cjs matches on it), UI copy is Croatian, declension avoided via arrow
   phrasing ("X → ostale županije").

## Architecture

```
src/lib/types.ts         State shape (literal unions) + generated-payload types
src/lib/metrics.ts       pure computation layer: series, domains (DOM/RDOM),
                         scales, klas, flows (ODM), flowMax cache, exportDesc.
                         No DOM, no React. Most logic changes belong here.
src/lib/exportPng.ts     canvas PNG composition (title band + baked SVG + legend)
src/App.tsx              state machine (single S object; v4 transition semantics:
                         flow-view autoselect + first-entry 2018 jump, klas/cum
                         year clamps, play loop, keyboard, body classes)
src/components/          Header (segments), MapView (projection fit + county paths
                         + region outlines + arcs; owns overlay panels), Legend,
                         Rail, DetailCard, JlsCard, CitzPanel, Scrubber, Tooltip
src/index.css            verbatim design system from single-file v4; class names
                         are part of the DOM contract
src/data/                generated payloads (see tools/pipeline/)
scripts/verify.cjs       the executable verification protocol (32 checks)
```

State flows one way: controls mutate `S` in App → components derive everything per
render from `S` + `metrics.ts`. The only imperative escape hatch is tooltip
positioning (ref mutation on pointermove, documented in Tooltip.tsx).

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

If a data refresh legitimately changes these (DZS revises series), recompute the
constants from the raw sources (see `tools/pipeline/README.md`), update verify.cjs
**and** this table in the same commit, and say which vintage moved them.
