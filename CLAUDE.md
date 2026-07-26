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
— the suite grew to **67 checks**. **v2.0.2** is a UX/a11y pass over those surfaces:
keyboard parity for the matrix and JLS map, a slider-semantic scrubber, an aria-live
year/view status, story presets that clear when state diverges from them, visually
distinct measured/estimate badges, a "Kako čitati" glossary, per-view year memory,
Back-as-undo, and a **390 px geometry pass** — the suite is now **106 checks**. New
surfaces obey the same rules: honesty labels, generated-data-stays-generated, hr-HR
formatting, and green verify before "done".

## Commands

```
npm run dev        # vite dev server
npm run build      # production build -> dist/ (base './', works from any subpath)
npm run verify     # build + run the 106-check puppeteer suite (1440 px + 390 px)
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
   `.mxd[data-a][data-b]`, `.mxband`, `.arch`, `#railList .rrow .rname/.rval`,
   `#legend`, `#citzHd`, `#jcardHd`, `#ageHd`, `#segView button[data-v]`,
   `#bigYear`, `#story`, `#storyCap`, `#labBtn`, `#helpBtn`, `#helpCard`,
   `#resetBtn`, `#zoomRst`, `#srLive`, `#spark[role=slider]`, `#play[aria-pressed]`,
   `#cardRow`, `#pairName/#pairRow`, `.cls-tag.meas/.est`,
   `window.__exportPNG/__exportSVG`, …).
   Renaming them breaks verification; change both sides deliberately or not at all.
   Roving tabindex is asserted by count: exactly one `.mxc[tabindex="0"]` of 420
   and one `.jl[tabindex="0"]` of 556 — a change to plain `tabIndex={0}` fails.
3. **Honesty labels are load-bearing.** 2018 godišnje tokovi = "izmjereno"; every
   other tokovi year = "procjena (IPF)"; cumulative = "kumulativna procjena"; pair
   nets carry the extra structural-estimate note. Badges are also **visually**
   distinct, not only worded: `.cls-tag.meas` is solid, `.cls-tag.est` is a dashed
   outline (verify asserts `borderStyle`). The **Matrica** view inherits the same
   badge logic and the scrubber's measured-2018 ring; its diagonal is hatched and
   returns an explanatory tooltip rather than silence.
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
src/main.tsx             React root; #root is display:contents so body owns layout
src/lib/types.ts         State shape (literal unions) + generated-payload types
src/lib/metrics.ts       pure computation layer: series, domains (DOM/RDOM),
                         scales, klas, flows (ODM), flowMax/mxMax/jmap caches,
                         VLAB, exportDesc. No DOM, no React. Most logic goes here.
src/lib/hash.ts          permalink codec (whitelisted State ⇄ location.hash);
                         decodeHash repairs invariants and drops an `st` that
                         contradicts the state it ships with
src/lib/stories.ts       Nalazi presets (State patch + Croatian caption per finding)
src/lib/tip.ts           tooltip placement (imperative, cursor-following) + the
                         COARSE flag every hover/leave handler branches on
src/lib/useZoom.ts       wheel/pinch zoom + drag pan on Pointer Events (KMIN 1,
                         KMAX 8, DEAD 4 px so clicks survive a gesture; touch
                         keeps one finger for page scroll). Map and matrix share it.
src/lib/exportPng.ts     canvas PNG + vector SVG composition (title band + baked
                         map SVG + legend); both share bakeMapClone/legendSpec
src/App.tsx              state machine (single S object; v4 semantics + mx/jmap
                         transitions, first-entry 2018 jump, per-view year memory,
                         klas/cum clamps, play loop, keyboard, hash sync +
                         pushState/popstate undo, aria-live status, reduced-motion,
                         story-invalidation on divergence, body classes, panels)
src/components/          Header (segments + PNG/SVG + reset), MapView (projection
                         fit + county/JLS paths + region outlines + arcs with
                         arrowheads + labels; measures the legend and any open
                         chip panel and feeds both to MatrixView, which lays the
                         grid out around them; delegates to MatrixView for mx),
                         Legend, Rail, DetailCard, PairCard, JlsCard,
                         CitzPanel (+ zemlje tab), AgePanel, HelpPanel
                         ("Kako čitati" glossary), StoryBar, MatrixView, Scrubber,
                         Tooltip
                         NB: DetailCard and PairCard render *outside* .map-box on
                         purpose — that is what lets them drop into normal flow
                         above the map below 900 px instead of covering it.
src/index.css            design system from single-file v4 + v2 additions; class
                         names are part of the DOM contract
src/data/                generated payloads (see tools/pipeline/)
scripts/verify.cjs       the executable verification protocol (106 checks; the
                         last block re-runs geometry at 390 px with hasTouch)
```

State flows one way: controls mutate `S` in App → components derive everything per
render from `S` + `metrics.ts`. Imperative escape hatches: tooltip positioning (ref
mutation on pointermove, documented in Tooltip.tsx), zoom transforms (`useZoom`
binds a non-passive wheel listener itself), and hash sync — a **view** change is
`history.pushState` so Back is an undo, everything finer is `replaceState`, and a
`popstate` listener decodes back into `S`. `INITIAL = {...BASE, ...decodeHash(hash)}`,
so a shared URL boots straight into its view; `decodeHash` repairs invariants
(flow needs a hub, klas/cum clamp to ≥2011, citz/jls/age mutually exclusive).

Two pieces of state are deliberately **outside** `S` and the permalink: the
per-view `{yi, cum}` memory (a `vmem` ref in App — restoring a shared link must not
depend on where a previous session had been) and the scrubber's collapsed flag
(presentation only, `Scrubber.tsx`). `help` is a State field but is *not* part of
the panel-exclusion group — the glossary can sit open over any view.

`up()` is the only writer: it clears `S.story` whenever a patch changes any key in
`STORY_KEYS`, which is what stops a Nalaz caption asserting numbers the view no
longer produces. Anything that mutates state without going through it re-opens
that bug.

## Design tokens (keep)

Karst-grey bg `#F4F5F2`, ink `#20262B`, Adriatic teal `#0F7D8C` for **controls
only**, vermilion `#B5341F` ↔ indigo `#1D4E89` diverging data scale (Lab
interpolation), Oswald display + IBM Plex Sans/Mono. Citizenship group colors are
in `metrics.ts CGROUPS`. Don't introduce new hues without a reason tied to
semantics.

Two measured guardrails on those tokens:
- Teal on the karst bg computes to **4.43:1** — fine for controls and focus rings
  (3:1 threshold), below AA for normal text. Keep teal *text* on `--panel` (4.72:1)
  or larger than 18 px. `--mut #5F6A72` is 5.06:1 on bg and is the safe body-muted.
- Category swatches carry a `--mut` border, not `rgba(0,0,0,.15)`: the pale
  "neutralne" chip `#C6CCC4` is 1.59:1 against panel, so its own edge is what
  satisfies 1.4.11. In-cell matrix numbers flip to white only above `0.85·m`,
  where white finally beats ink on contrast.

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

## Behavioural invariants (verify.cjs pins these too)

Not data facts, but regressions that are cheap to reintroduce and invisible
without a browser:

| Invariant | Why |
|---|---|
| Space with a control focused activates it; Space on the body toggles play | the global handler used to `preventDefault` both, so tabbing to a segment and pressing Space started playback instead |
| Changing any `STORY_KEYS` field clears the banner **and** drops `st=` from the hash | a caption citing −334 must not survive a change of Smjer, or ship in a link |
| Exactly one `.mxc[tabindex="0"]` of 420, one `.jl[tabindex="0"]` of 556 | roving tabindex; plain `tabIndex={0}` would mean 420/556 tab stops |
| Matrix arrow keys `stopPropagation` | otherwise they also step the year via App's window handler |
| Returning to a view restores its own `{yi, cum}` | `vmem`; the flow-entry 2018 jump used to overwrite Saldo's window permanently |
| Matrix grid never intersects an open chip panel, cell ≥ 12 px | clearing the panel *vertically* alone crushes cells to the 8 px floor — the placement search must be free to step left instead |
| No map overlay rect intersects another, at 1440 **and** 390 | `.zoomrst` and `.paircard` once shared `top:44/right:16` |
| `.paircard` is `position:static` below 900 px | floating, it is a 232 px panel over a 439 px map |
| Page `scrollWidth ≤ clientWidth` at 390 | `.seg` is `overflow:hidden`, so anything too wide is clipped, not scrolled |
| `.chip-hd` / segment / rail row ≥ 44 px on coarse pointers | these open and dismiss every panel on touch |

The 390 px block runs last in `verify.cjs` and re-boots the app under
`isMobile + hasTouch`, so `(pointer:coarse)` and the `COARSE` flag in `tip.ts`
are genuinely exercised — reading them at 1440 tests nothing.
