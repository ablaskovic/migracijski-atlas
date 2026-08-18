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
Back-as-undo, and a **390 px geometry pass**. **v2.0.3** is a review pass over
those surfaces: the permalink's story guard no longer passes vacuously on omitted
keys, the Nalazi caption moved out of the map's overlay layer (it was making the
Dob i spol chip unclickable at every desktop width), the two chip panels became one
stacked dock, Escape and focus-return reach every dismissible surface, the scrubber
implements the whole slider key set, county paths speak their own values, and the
export bakes the presentation the stylesheet used to supply — the suite reached
**134 checks**. **v2.0.4** is a second review pass over v2.0.3: a truncated
permalink no longer boots a cumulative view before 2011 (the whole atlas read
zero while the tooltip reported 2011's numbers), matrix cell labels state the
direction of their own number, the export carries the structural-estimate note
and its own cumulative badge, a focused county keeps its ring when the pointer
wanders, highlights die with the view that made them, every segment group has a
name, and the two big geometry payloads left the entry chunk — **166 checks**.
**v2.0.5** is a third review pass: the on-demand geometry chunk can now fail
(it had no `.catch`, cached its own rejection for the session, and left an
eternal spinner), Space on a focused county no longer starts the 28-year
animation, Alt+← is Back again instead of Back-plus-a-year-step, a county
selection dies with the view that could describe it, focus rings became
**two-tone** because a single tone measured 1.02:1 against the data it sits on,
matrix numbers got a halo because no ink/white threshold clears 4.5:1 on these
ramps, the glossary stopped covering live tab stops, the JLS export stopped
crediting the wrong boundary source, `storyHolds` became the *only* definition
of caption validity, and the harness stopped leaking a Chromium on failure —
**211 checks** (this line long said 209; the pinned constant was always 211),
and the suite now asserts its own size. **v2.0.6** is an attribution pass: the
companion study was **not published yet**, so the atlas did not name it. It
said the reference was *pending* and that the project is unaffiliated, on every
layer that used to name it or lean on it — header subtitle, footer, a "Rad i
atribucija" glossary section, the `rad` term entry that makes the legend's "iz
rada" shorthand resolvable, and both export formats for the two views that
reproduce the study's method. `src/lib/credits.ts` is the single switch that
publication flips — **221 checks**. **v2.0.7** fixes two things a user found in
one sitting: activating a matrix cell used to answer a corridor question with a
county one (it switched to Tokovi and drew all 20 of the hub's arcs, the corridor
demoted to a card in the corner) — a corridor now opens *in place*, marked in the
grid, with its card docked in the rail; and every stroke in the map scaled with
the zoom, so at k=6,55 the county outlines drew 6,55 px and the focus ring 29,5 px
of white under 13,1 px of dashed ink, which is the "thick border on some parts" it
was reported as. Strokes are now non-scaling and the ring is keyboard-only —
**243 checks**. **v2.0.8** is the publication the attribution pass was built
for: the companion study appeared on 27 July 2026, so `credits.ts` flipped and
the atlas now names, cites and **links** it on every surface that used to say
"pending" — subtitle, footer, glossary (full citation + DOI, `CC BY-NC`) and
both export formats, which carry the DOI because an exported image has no link
to click. The non-affiliation statement is unchanged, by design — **244
checks**. **v2.0.9** is what publication actually costs: while the study was a
manuscript, "differs a little from the paper" was a claim nobody could audit, and
three surfaces were quietly carrying one. The klasifikacija legend showed 7 / 5 / 9
under a heading saying "iz rada" while the study publishes **7 / 7 / 7**; the
Regije legend attributed a 21-county partition to a paper that prints **no
membership table**, and called it undecided about Lika when it is not; and the
export cited the study by DOI while dropping the one sentence explaining why its
numbers differ. All three now answer for themselves, the divergence is **derived**
from the published classification rather than written out, the glossary carries the
study's *own* five data caveats (it carried only the atlas's), and Nalaz 2 stopped
saying "samo tri županije" over a rail listing five. It also **self-hosts the fonts** (they were on a third-party CDN, so every visitor's IP went there on first paint and the suite measured the *fallback* face) and adds **six Nalazi** for the study's argument, which the first seven barely touched. It links every upstream source it names (CC BY §3(a) asks for one), states the terms of the exported figure, and **fixes an export that did not fit inside itself** — a user reported a title running through the period and the credit rows running off the right edge — **275 checks**.
**v2.1.0** adds the view the atlas was missing: **Godine**, a 21-county × 28-year
grid. Six views could show every county for one year (the map) or every year for
one county (the detail card, one at a time) and *nothing* showed both, so "when
did this turn" was a question you answered by scrubbing 28 times and holding 21
colours in your head. It reuses Saldo's ramp on Saldo's own `DOM` domain, so a
cell and the map at that year are the same colour by construction (asserted by
measuring the same county twice); the grid doubles as the year picker every other
view reads; and godišnje mode is the first surface that renders 1998–2006 beside
the rest, so it is the first that can hatch them. The four-placement search that
steers a grid around the legend and the chip dock moved to `lib/gridfit.ts`
because two views now need it. It also **fixes two accuracy defects in the atlas's
own copy**: the glossary said the klas divergence was "a few hundred people",
which is true of the distance to the threshold (606 and 302, now derived) and
false of the distance to the study's figures (1.593 and 583); and Nalaz 5 wrote
out the two divergent county names, the one surface still hardcoding what
`PAPER_KLAS_DIFF` exists to derive. Two Nalazi were added for findings only a grid
can show. The seventh segment button cost the header its budget — measured, 138 →
192 px and the map box 572 → 518 — and desktop segment padding went 7 → 5 px
rather than shortening a label, because "JLS 2018." is an honesty marker and not
just a name — **295 checks**.
**v2.1.1** is a PageSpeed pass — the first review driven by an external
measurement rather than a reading. Six defects, all reproduced locally before
being touched. `/robots.txt` did not exist, so `vercel.json`'s catch-all rewrite
answered it with the app's HTML and a crawler read **31 invalid directives** out
of `<!DOCTYPE html>`. All 21 rail rows failed WCAG 2.5.3: the visible label of a
grid row is its text children joined with **no separator**, so `Grad Zagreb` +
`+41.986` reads `Grad Zagreb+41.986`, which the label `Grad Zagreb +41.986` does
not contain — and the other two row shapes failed it worse, a JLS row saying
`, ` where it showed ` ` and a corridor row dropping the rank it leads with. The
scrubber's collapse toggle was a **64×18** target; its `::before` hit extension
is invisible to axe and to WCAG 2.5.8, which measure the element's own box. The
**entire** measured CLS was one shift at the font swap (0,1038 of 0,1038), moving
`main`, the fixed scrubber, the footer and the citizenship chip together — fixed
with metric-matched fallback faces, so the fallback lays out at the webfont's
advance widths and line box and only the glyph shapes change. On a phone
**3,68 %** of rendered text was ≥ 12 px, with `.ft` alone 50,97 % of all text on
the page. And the build shipped no source maps. It also found that
`npm run verify` had been **red since the analytics commit** — two Vercel
platform routes 404 on any non-Vercel host — **305 checks** (the suite's own pin
said 296 while this file said 295; the suite was right).
**v2.2.0** adds the second language. The atlas is Croatian and stays Croatian
by default; English exists so it can be shown to people who do not read
Croatian. Three things make it more than a word swap. **Numbers are part of the
translation**: Croatian writes `41.986` where English writes `41,986`, so an
untranslated figure is not merely foreign to an English reader, it is wrong by
three orders of magnitude — `fmtI`/`fmtR` became locale-aware proxies, which
left all 112 of their call sites untouched. **The sources are not translated**:
county and municipality names, DZS table numbers and the study's citation are
identifiers a reader checks against the source, so they stay put, while
everything the atlas says *about* them moves — including every honesty label,
because a badge nobody can read is not a label. And **who gets which language**
is decided by the reader: `hr`/`bs`/`sr`/`sh`/`me`/`cnr` (any region) get
Croatian, everyone else English, a chosen language is stored, and `l=` in the
permalink outranks both so a link shared in English arrives in English — while
a link at the reader's own default carries no `l=` at all and stays
language-neutral. The suite had to pin its own language first: headless Chrome
reports `en-US`, so without `--lang=hr-HR` plus a `navigator.languages`
override the atlas booted in English and ~50 Croatian-matching checks failed at
once — **318 checks**.
New surfaces obey the same rules: honesty labels,
generated-data-stays-generated, hr-HR formatting **in Croatian and en-GB in
English**, and green verify before "done".
**v2.3.0** is three things a user asked for in one sitting. The first: the
English title now **names the country**. `Migracijski atlas županija` reaches a
reader who already knows whose counties these are; `County Migration Atlas` does
not, and "county" is a unit some forty countries use — so English reads
`County Migration Atlas (CROATIA)` and Croatian is untouched, because there the
qualifier would be noise. It reaches three surfaces, not one: the `<h1>`, the
**tab title** (which `index.html` ships in Croatian because it is static markup
parsed before the language is known, and App now corrects), and the **eyebrow of
an exported figure** — which was still hardcoded Croatian, so an English export
carried `MIGRACIJSKI ATLAS ŽUPANIJA · DZS` across an otherwise English document.
That eyebrow was also the last run in the export band drawn **without ever being
fitted**, which was invisible only because Croatian happens to fit at every width
the suite exercises: the English string is four characters longer and lands
within ~1 px of the 390 px canvas edge. It shrinks now, like the title, the
credits and the legend caveat before it — 10 → 9,5 px at 390.

## Commands

```
npm run dev        # vite dev server
npm run build      # production build -> dist/ (base './', works from any subpath;
                   #   NOT from file:// — the entry is an ES module, CORS-blocked
                   #   from a null origin. Measured: blank page.)
npm run verify     # typecheck + lint + build + the 318-check puppeteer suite
                   #   (960–1600 px + 390 px; asserts its own check count)
                   #   Serves dist itself and STUBS /_vercel/{insights,speed-
                   #   insights}/script.js — Vercel serves those from its own
                   #   platform layer, so they 404 on any other host and both
                   #   "zero console errors" checks fail without the stub.
npm run lint       # oxlint
npm run typecheck  # tsc --noEmit (strict)
```

`verify` needs puppeteer: `npm i -D puppeteer` once (kept out of default deps to
spare the ~170 MB Chrome download). `PUPPETEER_PATH` points at a puppeteer
*package directory*; to reuse a Chrome you already have, set puppeteer's own
`PUPPETEER_EXECUTABLE_PATH` — the old fallback re-tried the `require` that had
just failed and could never have helped.

## House rules (non-negotiable)

1. **No "looks fine".** Visual claims require measurements: DOM checks, numeric
   invariants, bounding-box math. The original v1 shipped a broken map because
   verification was "described a screenshot" — and the description was confabulated.
   If you cannot actually perceive an image, say so. `npm run verify` green is the
   minimum bar before calling anything done; UI-geometry changes additionally get
   measured (element rects, overlap areas) across 960–1600 px and at 390 px.
   **Rect overlap is not the same as reachable**: the Nalazi banner overlapped the
   Dob i spol chip by only a few hundred px² at 1440 yet made it unclickable at
   every desktop width, so controls are also probed with `elementFromPoint`.
2. **DOM contract = test API.** `scripts/verify.cjs` selects on ids/classes
   (`#map .cnt[data-iso]`, `#map .jl[data-j]`, `.mxc[data-a][data-b]`,
   `.mxd[data-a][data-b]`, `.mxband`, `.arch`, `#railList .rrow[data-iso] .rname/.rval`,
   `#legend`, `#citzHd`, `#jcardHd`, `#ageHd`, `.chipdock`, `#segView button[data-v]`,
   `#bigYear`, `#story`, `#storyCap`, `#labBtn`, `#helpBtn`, `#helpCard`,
   `#resetBtn`, `#zoomRst`, `#srLive`, `#spark[role=slider]`, `#play[aria-pressed]`,
   `#cardRow`, `#cardNote`, `#pairName/#pairRow`, `.cls-tag.meas/.est`,
   `#segViewLab`/`#segFlowLab`/… (the `aria-labelledby` targets), `#segExp`,
   `window.__exportPNG/__exportSVG`, …).
   v2.0.5 adds: `.focusring .fr-halo/.fr-ink`, `.mxnum`, `#jstatus/#jloading/
   #jerror/#jretry`, `a.skip`, `aside.rail[aria-labelledby]`, `#cardSvg[role=img]`,
   `#pairSvg[role=img]`, `#thr[aria-valuetext]`, `#citzClamp[role=status]`,
   `.cnt[role=button][aria-expanded]`, `.jl[role=img]`, `#card[inert]`,
   `#jcard[inert]`, `#helpCard[tabindex]`, `#helpTitle`.
   v2.0.6 adds the attribution surfaces, matched on **text**, not only on ids:
   `.hd-sub`, `.ft`, `noscript`, `.legend-title`, `.map-box`, and inside the
   glossary `.help-h` (the "Rad i atribucija" heading) and the `.help-dl dt`
   whose text is exactly `rad` — the check reads the `dd` at the *same index*,
   so reordering the definition list is fine but dropping the term is not.
   v2.0.8 adds `a.paper-link` (one in `.hd-sub`, one in `.ft`, one in
   `.help-cite`) — asserted on `href`, on `rel=noopener`, and on the accessible
   name *containing* the visible text (2.5.3), which is how the first cut was
   caught naming the link "Rad: Maras, M. i Vinovrški, L. …" over visible text
   reading "Maras i Vinovrški (2026.)".
   v2.0.7 adds the corridor-selection and stroke surfaces: `.mxsel` (+ its
   `.mxsel-halo/.mxsel-ink` rects), `.rrow.selrow`, `.mxc[aria-expanded]`,
   `.rrow[aria-expanded]`, `.rail .paircard` (the card's Matrica mount — the
   check asserts `#pair.closest('aside.rail')`), and
   `vector-effect="non-scaling-stroke"` on every `.cnt`/`.jl`/`.jbord`/`.regline`/
   `.mxc`/`.mxd`/`.mxband rect`/`.mxsel rect`/`.focusring` child. That attribute
   is asserted **by pixel measurement**, not only by presence: the check
   rasterises the exported SVG twice, once as it ships and once with the
   attribute stripped, and compares ink-run medians (1 px vs 7 px at k=6,55).
   Renaming them breaks verification; change both sides deliberately or not at all.
   Two caveats on that sentence, both measured: `#segExp` is **not** selected by
   id anywhere, and the `*Lab` ids are resolved *generically* through
   `aria-labelledby`, so renaming one on both sides passes. The contract there is
   the association, not the id. The `…` hides ~40 more hard dependencies —
   `#tip`, `#citz*`, `#age*`, `#zemList`, `#jcard*`, `#card*`, `#pairX`, `#helpX`,
   `#railLab/#railYear`, `#bigYearSub`, `#realMark`, `#scrubBox`, `.scrub.inert`,
   `.arc[stroke-dasharray="7 4"]`, `.clab`, `.mxhit`, `body.panel-open` — before
   renaming anything, grep `scripts/verify.cjs` for it.
   v2.1.0 adds the Godine grid: `#map .yrc[data-iso][data-y]` (the cell — matched
   on **both** attributes, since the pair is its identity), `.yrsel`, `.yrband
   rect`, `.yrpre` (the pre-2007 hatch), `.yrhit` (the coarse-pointer overlay),
   and the seventh `#segView button[data-v="yrs"]`. The cell reuses `.mxnum` for
   its in-cell number **on purpose** — that is the class `bakeMapClone` bakes the
   white halo onto, so reusing it is what makes the export legible; a new class
   name would silently ship ink-on-indigo at ~2,5:1. `.yrband`/`.yrsel` take
   fill/stroke from **attributes**, not from `index.css`, so unlike `.mxband` they
   need no baking at all.
   Roving tabindex is asserted by count: exactly one `.mxc[tabindex="0"]` of 420,
   one `.jl[tabindex="0"]` of 556, one `.yrc[tabindex="0"]` of 315 — a change to
   plain `tabIndex={0}` fails.
   `role` is asserted on rail rows both ways: `button` exactly when activating does
   something, `img` otherwise — never absent. A focusable element with an
   `aria-label` and no role is a name ARIA does not guarantee AT will expose, so
   "drop the role" is not the fix for "must not claim button".
3. **Honesty labels are load-bearing.** 2018 godišnje tokovi = "izmjereno"; every
   other tokovi year = "procjena (IPF)"; cumulative = "kumulativna procjena"; pair
   nets carry the extra structural-estimate note. Badges are also **visually**
   distinct, not only worded: `.cls-tag.meas` is solid, `.cls-tag.est` is a dashed
   outline (verify asserts `borderStyle`). The **Matrica** view inherits the same
   badge logic and the scrubber's measured-2018 ring; its diagonal is hatched and
   returns an explanatory tooltip rather than silence.
   **These rules bind three layers, not one.** They also apply to what the export
   ships (it left the pair-net caveat behind and badged a cumulative view
   "procjena (IPF)" under its own "KUMULATIVNA PROCJENA" title) and to what
   assistive tech is told (a matrix cell labelled `a → b` while its number was
   `b → a`). `#tip` is `aria-hidden`, so every aria-label is the *only* copy of
   its number — it is a load-bearing honesty surface, not a convenience.
   The **JLS drill and the JLS-2018 map** are 2018-only, internal-moves-only, and
   say so (the map adds a √-scale note and OSM/ODbL attribution). The citizenship
   panel is national-scope 2021–2025; its **zemlje** tab and the **dob/spol** panel
   are national **2025-only** (STAN one-year tables) and labelled so — the time
   scrubber does not change them. "Mig. + prirodno" is the identity sum of two
   published components, not DZS total population change. The relative
   klasifikacija threshold states it is % popisa 2011. Never weaken these.
   **The companion study is the same rule applied to a reference.** A bare
   "iz rada" pointing at nothing a reader can retrieve is an unlabelled claim
   exactly like an unbadged estimate. The paper was unpublished until 27 July
   2026 and the atlas therefore did not name it, stating the reference as
   *pending* instead; it is published now, so every surface names it, cites it
   and links to it — and the glossary still says what the study contributes (the
   klas threshold, the Regije grouping) and what it does not (no figure — every
   number is DZS or computed here). What did **not** change with publication:
   the project is **unaffiliated** and unendorsed, and says so. All of it comes
   from `src/lib/credits.ts`; `index.html`'s `<noscript>` is the one copy that
   cannot import it and is compared against the footer. `paperPending()` still
   exists and still drives every string — the unpublished wording is one edit
   away, not deleted.
4. **Generated data stays generated.** Never hand-edit `src/data/*.json`.
   Five of the eight are regenerable here — `odm.json` (`ipf.py`), `citizen.json`
   (`parse_cit.py`), `demo.json` (`parse_demo.py`), `jls_drill.json`
   (`parse_jls.py`) and `geo_jls.json` (`geo_jls.cjs`; the last two need the
   31 MB `ext/` download). **Three are not:** `atlas_data2.json`'s leaf series
   (`ii/oi/ie/oe`, `pe`, `p` — `parse_nat.py` only patches `nat` into an existing
   file), `geo_counties.json` and `geo_regions5.json` (mapshaper one-liners
   recorded only in `reference/HANDOFF-v4-singlefile.md` §provenance). A DZS
   revision of sheet 7.4.2 therefore cannot be absorbed by "rerun the pipeline" —
   the parser does not live in this repo. See `tools/pipeline/README.md`.
5. **Locale-correct formatting**, which since v2.2.0 means two locales, not one.
   Croatian formats through `Intl 'hr-HR'` and English through `'en-GB'`; the
   display minus is U+2212 `−` in **both**, because that is a glyph choice this
   project pins rather than a locale convention (verify.cjs matches on it).
   Nothing constructs an `Intl.NumberFormat` outside `lib/i18n.ts` — `fmtI` and
   `fmtR` are proxies over its two instances, so a call site cannot pick a
   locale by accident. Croatian ordinals keep their trailing dot (`2024.`,
   `2011.–2024.`) and English does not, which is why every year that reaches the
   screen goes through `yr()`/`yrSpan()` rather than being interpolated.
   UI copy exists in both languages; declension is still avoided via arrow
   phrasing ("X → ostale županije"), which is also what keeps one string correct
   for all 21 counties in each language.

## Architecture

```
src/main.tsx             React root; #root is display:contents so body owns layout
src/lib/types.ts         State shape (literal unions) + generated-payload types
src/lib/metrics.ts       pure computation layer: series, domains (DOM/RDOM),
                         scales, klas, flows (ODM), flowMax/mxMax/jmap caches,
                         VLAB, countyAria, exportDesc. No DOM and no React *in
                         this file* — it does import geoAsync, which imports
                         React, so the graph is not React-free. Most logic here.
src/lib/i18n.ts          the language: `Lang`, `detectLang()` (hr/bs/sr/sh/me/cnr
                         → Croatian, else English), `storedLang`/`storeLang`,
                         `setLang`, the `L(hr, en)` inline pair, the `t()`
                         dictionary of shared enumerated labels, `numI`/`numR`
                         and `yr`/`yrSpan`. `LANG` is a module mirror of
                         `S.lang`, set by App *before* it renders — an effect
                         would paint one frame of the wrong language, and one
                         frame of `41.986` meaning something else entirely
src/lib/state.ts         BASE (the boot state) + STORY_KEYS + focusSoon; shared by
                         App and the codec so "omitted from the hash" and
                         "still at its default" cannot drift apart. focusSoon walks
                         its matches and skips anything with no client rects — a
                         .focus() on a display:none target is a silent no-op that
                         leaves focus on <body>, the very bug it exists to prevent
src/lib/hash.ts          permalink codec (whitelisted State ⇄ location.hash);
                         decodeHash repairs invariants first, then drops an `st`
                         that contradicts the state the link actually boots. Every
                         repair reads `at(k)` = `{...BASE, ...decoded}[k]`, never
                         the raw patch — see the invariants table below
src/lib/stories.ts       Nalazi presets (State patch + Croatian caption per finding)
                         + `asserts`: the keys a caption claims *beyond* STORY_KEYS.
                         storyKeys/storyHolds are the single definition of "this
                         caption still describes the screen", read by App and by
                         both halves of the codec
src/lib/gridfit.ts       fitGrid() — the four-placement search that steers a
                         full-bleed grid around the floating legend and chip dock.
                         Shared by MatrixView (21×21) and YearsView (21×28); the
                         objective is min(cellW, cellH), which for a square grid
                         is the ordering MatrixView was verified with, so the
                         extraction is behaviour-preserving there
src/lib/geoAsync.ts      on-demand geo_jls.json (475 KB) + geo_regions5.json (68 KB),
                         which served two of seven views and were 53 % of the bundle.
                         Sync accessors for the render path; App subscribes once via
                         useGeo() and its re-render feeds Rail/Legend/Tooltip too
src/lib/state.ts (cont.)  `isKeyFocus(el)` — `:focus-visible` behind a try/catch.
                         The two-tone rings are a keyboard affordance and were
                         drawn from the `focus` event, which a mouse click fires
                         too. Chrome answers this correctly in both directions:
                         false after a real click on the element, true for a
                         programmatic `.focus()` (which is how verify drives it)
src/lib/credits.ts       the companion study's reference, in one place because it
                         is unpublished: `PAPER {published, citation, url}` plus
                         the per-surface copy derived from it (header subtitle,
                         footer, glossary intro + `rad` term, export line) and
                         the unconditional NO_AFFIL statement. Publication is one
                         edit here + index.html's <noscript> + one pinned check
src/lib/tip.ts           tooltip placement (imperative, cursor-following) + the
                         COARSE flag every hover/leave handler branches on
src/lib/useZoom.ts       wheel/pinch/keyboard zoom + drag pan on Pointer Events
                         (KMIN 1, KMAX 8, DEAD 4 px so clicks survive a gesture;
                         touch keeps one finger for page scroll). + / − / 0 are
                         bound to the window — the map is not itself a tab stop.
                         Map and matrix share it.
src/lib/exportPng.ts     canvas PNG + vector SVG composition (title band + baked
                         map SVG + legend); both share bakeMapClone/legendSpec
src/App.tsx              state machine (single S object; v4 semantics + mx/jmap
                         transitions, first-entry 2018 jump, per-view year memory,
                         klas/cum clamps, play loop, keyboard, hash sync +
                         pushState/popstate undo, aria-live status, reduced-motion,
                         story-invalidation on divergence, body classes, panels)
src/components/          Header (segments + PNG/SVG + reset), MapView (projection
                         fit + county/JLS paths + region outlines + arcs with
                         arrowheads + labels; measures the legend and the open
                         chip dock and feeds both to MatrixView, which lays the
                         grid out around them; delegates to MatrixView for mx),
                         Legend, Rail, DetailCard, PairCard (two mounts, one
                         active: floating over the map in Tokovi, docked inside
                         the rail in Matrica — a floating card over a heatmap
                         covers live corridors, measured ~12×9 cells at 960 px,
                         and steering the grid around it crushes the cell to
                         ~10 px), JlsCard,
                         YearsView (Godine: 21 counties × the rendered years;
                         cells are rectangles, not squares, so rows and columns
                         get their own floors — 10 px and 7 px — and the shared
                         zoom recovers anything tighter),
                         CitzPanel (+ zemlje tab), AgePanel, HelpPanel
                         ("Kako čitati" glossary + the "Rad i atribucija"
                         disclosure), StoryBar, MatrixView, Scrubber,
                         Tooltip
                         NB: DetailCard, PairCard and StoryBar render *outside*
                         .map-box on purpose — that is what lets the cards drop
                         into normal flow above the map below 960 px instead of
                         covering it, and what keeps the Nalazi caption off the
                         map's bottom edge, which the legend and the chip dock
                         already own. CitzPanel + AgePanel share one `.chipdock`
                         so they stack instead of claiming 656 px side by side.
src/index.css            design system from single-file v4 + v2 additions; class
                         names are part of the DOM contract
src/data/                generated payloads (see tools/pipeline/). Only what the
                         app imports lives here — od2018.json is a pipeline input,
                         so it sits in tools/pipeline/ref/
public/robots.txt        served, not rewritten — see the v2.1.1 invariants. The
                         only file in public/ besides the favicon and the two OFL
                         licence texts, and for the same reason: it must exist at
                         a fixed URL rather than be emitted with a hashed name
scripts/verify.cjs       the executable verification protocol (318 checks; the
                         390 px block re-runs geometry with hasTouch, the
                         v2.0.4 block after it pins the review-pass-2 findings,
                         and the v2.0.6 block pins the attribution surfaces)
```

State flows one way: controls mutate `S` in App → components derive everything per
render from `S` + `metrics.ts`. Imperative escape hatches: tooltip positioning (ref
mutation on pointermove, documented in Tooltip.tsx), zoom transforms (`useZoom`
binds a non-passive wheel listener itself), and hash sync — a **view** change is
`history.pushState` so Back is an undo, everything finer is `replaceState`, and a
`popstate` listener decodes back into `S`. `INITIAL = {...BASE, ...decodeHash(hash)}`,
so a shared URL boots straight into its view; `decodeHash` repairs invariants
(flow needs a hub, klas/cum clamp to ≥2011, the JLS chip only exists in Tokovi,
citz/jls/age mutually exclusive, and a corridor — `sel` + `pair` — exists only in
Tokovi and Matrica, never as half of itself and never as a county paired with
itself).

**Every repair must test the state the link boots, not the decoded patch.** They
are two different objects and the difference is invisible in the common case:
`encodeHash` omits any field still at its `BASE` value, so an absent key means
"still at the default", never "false". Reading `o.cum` directly meant the cum/2011
clamp never fired on a link with no `c=` — and `#v=saldo&y=2005` booted a
*cumulative* view at 2005, where `val()` returns 0. All 21 counties, the rail and
every aria-label read 0, while the tooltip (which clamps to ≥2011) reported 2011's
real numbers under an impossible "2011.–2005." heading; `encodeHash` then rewrote
the URL into a complete, shareable link to that blank state. `at(k)` in `hash.ts`
is the fix and every repair goes through it.

Two pieces of state are deliberately **outside** `S` and the permalink: the
per-view `{yi, cum}` memory (a `vmem` ref in App — restoring a shared link must not
depend on where a previous session had been) and the scrubber's collapsed flag
(presentation only, `Scrubber.tsx`). `help` is a State field but is *not* part of
the panel-exclusion group — the glossary can sit open over any view.

`up()` is the only writer: it clears `S.story` whenever a patch changes any key in
`storyKeys(i)` = `STORY_KEYS` **plus that preset's own `asserts` list**, which is
what stops a Nalaz caption asserting numbers the view no longer produces. Nalaz 4's
claim is about the Državljanstvo panel, so it declares `asserts: ['citz','citzTab']`
and closing that panel kills the caption. Anything that mutates state without going
through `up()` re-opens that bug.

`asserts` is deliberately **not** "the keys the patch sets". It used to be, and a
preset became panel-sensitive by accident of carrying a defensive `age: false` in
its patch: measured, opening "Dob i spol" killed Nalaz 7's caption — which never
mentions a panel — while the other six survived. A caption dies when what it
*claims* stops holding, not when a key it happened to write moves.

The same rule has a permalink half, and getting it wrong is subtle: `encodeHash`
omits every field still at its `BASE` value, so `decodeHash` must validate a stored
`st` against `{...BASE, ...decoded}` — the state the link actually boots. Seeding
that comparison from the preset instead made every omitted key compare against its
own value and pass, so `#v=saldo&c=1&y=2024&st=2` shipped a caption citing +27.521
over a view rendering +41.986. `storyHolds()` in `stories.ts` is now the one
definition both halves and `up()` share.

## Design tokens (keep)

Karst-grey bg `#F4F5F2`, ink `#20262B`, Adriatic teal `#0F7D8C` for **controls
only**, vermilion `#B5341F` ↔ indigo `#1D4E89` diverging data scale (Lab
interpolation), Oswald display + IBM Plex Sans/Mono. Citizenship group colors are
in `metrics.ts CGROUPS`. Don't introduce new hues without a reason tied to
semantics.

Two measured guardrails on those tokens:
- Teal on the karst bg computes to **4.43:1** — fine for controls and focus rings
  **on the chrome** (3:1 threshold), below AA for normal text. Keep teal *text* on
  `--panel` (4.72:1) or larger than 18 px. `--mut #5F6A72` is 5.06:1 on bg and is
  the safe body-muted.
- **That 4.43:1 is against the background, and says nothing about the data.** A
  focus ring drawn as a feature's own stroke is measured against the *fill*, and
  on the diverging ramp teal bottoms out at **1.02:1** (+0.75·m), 1.25 at −1·m,
  1.99 on the Tokovi hub; ink fails at both ends (2.53 at −1·m, 1.82 at +1·m).
  So `.cnt`/`.jl`/`.mxc` focus is a **two-tone overlay** (`.focusring`: white
  halo under an ink dash). White↔ink is 15.29:1, and at least one of them clears
  3:1 at every point on the ramp — worst case 3.21. Never collapse it to one tone.
  Two v2.0.7 riders: the ring is drawn only for **keyboard** focus (`isKeyFocus`,
  i.e. `:focus-visible`) — from the `focus` event alone a mouse click painted it
  too — and it carries `vector-effect="non-scaling-stroke"` like every other
  stroke in the map, because inside the zoom transform its 4.5/2 px measured
  29.5/13.1 px at k=6.55.
- Category swatches carry a `--mut` border, not `rgba(0,0,0,.15)`: the pale
  "neutralne" chip `#C6CCC4` is 1.59:1 against panel, so its own edge is what
  satisfies 1.4.11.
- **In-cell matrix numbers use a white halo, not an ink/white flip.** There is no
  threshold that works: on the Dolasci ramp `t≈0.60–0.70` peaks at 4.42 (ink) /
  4.30 (white) and on Odlasci `t≈0.70–0.80` at 4.43 / 4.14 — bands where *neither*
  colour reaches the 4.5:1 this ≤8.5 px text owes. `.mxnum` paints ink over a
  `paint-order:stroke` white outline (15.29:1 on every fill) and the export bakes
  the same halo. The old `0.85·m` flip left 0.6–0.85 of the indigo ramp at
  2.5–3.6:1.

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
| klasifikacija counts at 1,5 % popisa 2011 | 7 / 3 / 11 (Šibensko-kninska −3.257 + Međimurska −4.125 flip to gubitnice) |
| JLS-2018 map (measured, internal only) | 556 polygons; net top Grad Zagreb +3.413, bottom Split −691; Split tip +1.693 / −2.384 / −691; max JLS bbox ≤ 5 % |
| dob/spol 2025 (STAN I T3/II T2) | vanjska +56.665 / −37.485, 66 % M doseljeni, vrh 25–29; unutarnja 73.838, 54 % žene |
| zemlje 2025 (STAN I T4) | Njemačka +9.628/−6.238, Nepal +6.264; total +56.665 |
| Godine grid | 21 rows; 315 cells cumulative (15 years from 2011), 588 godišnje (28 from 1998) |
| GZ internal saldo, godišnje | peak +4.420 (2015), +3.309 (2019), turns negative 2021 (−145), −622 (2022) |
| Zagrebačka internal saldo | +1.047 (2019) → +2.238 (2022), still +1.937 in 2025 |
| prirodno, godišnje | last positive county-year is 2016; 21 × 2017–2025 = 189 cells, all negative |
| klas divergence margins | Karlovačka −5.106 and Koprivničko-križevačka −4.802 sit 606 / 302 past −4.500 |

If a data refresh legitimately changes these (DZS revises series), recompute the
constants from the raw sources (see `tools/pipeline/README.md`), update verify.cjs
**and** this table in the same commit, and say which vintage moved them.

## Behavioural invariants (verify.cjs pins these too)

Not data facts, but regressions that are cheap to reintroduce and invisible
without a browser:

| Invariant | Why |
|---|---|
| Space with a control focused activates it; Space on the body toggles play | the global handler used to `preventDefault` both, so tabbing to a segment and pressing Space started playback instead — and a rail row is a control too, including the inert ones, which carry no button role and so fell straight through to the global handler |
| Changing any `STORY_KEYS` field **or a key in that preset's `asserts`** clears the banner **and** drops `st=` from the hash | a caption citing −334 must not survive a change of Smjer, or ship in a link — and Nalaz 4's caption must not survive closing the panel it describes. Running over the *patch* keys instead made Nalaz 7 die when an unrelated panel opened |
| A link carrying `st=` must render the numbers its caption cites | the guard compares against `{...BASE, ...decoded}`; comparing against the preset made omitted keys pass vacuously |
| **Every `decodeHash` repair tests `{...BASE, ...decoded}`, never the raw patch** | an absent key means "still at its default", not "false": reading `o.cum` let `#v=saldo&y=2005` boot a cumulative view before 2011, where the whole atlas reads 0 while the tooltip reports 2011's numbers |
| No panel flag without a panel behind it | the JLS chip exists only in Tokovi; carried elsewhere it still set `body.panel-open` (which hides the legend outright below 900 px) and still ate an Escape press |
| Nothing dimmed is also focusable | `disabled`, never `opacity` + `pointer-events:none` — fixed once for the segment groups, again on the play button, and the scrubber chart was still doing it in the JLS view with a live `role="slider"` and no `aria-disabled` |
| A rail row claims `role="button"` only if activating it does something — and `role="img"` when it does not | Regije and JLS rows have nothing to open; 25 tab stops announced as buttons did nothing. Dropping the role entirely left the `aria-label` on a generic element, which ARIA does not guarantee AT will expose |
| Escape reaches every dismissible surface, and closing one returns focus to whatever opened it | help and pair were handled, the three chip panels and the detail card were not; every `×` dropped focus to `<body>` |
| The exported document is self-contained | nothing may take `fill`/`stroke` from the stylesheet: `.mxband` did, and exported as a solid black bar across the matrix |
| The export says everything the screen says | its badge must match its own title (a cumulative view carried "· procjena (IPF)" under "KUMULATIVNA PROCJENA") and it must carry the pair-net structural caveat, which reached neither format. It is the artifact that leaves the app — there is no footnote to click through to |
| The exported SVG title shrinks like the PNG's | fixed at 21 px it ran 73 px through the right-aligned period at a 732 px map — a 1024 px browser window |
| Matrica: the rail row, the cell it lights, its tooltip, its **aria-label** and the legend mark carry one sign *and one direction* | a neto row read +517 while the cell it highlighted read −517; separately, every cell label said `a → b` while under Dolasci the number was `b → a` |
| The matrix rail paints a corridor the colour the grid paints it | the rail normalised to its own top-20 and the legend describes the grid: one number, two colours, one key |
| Exactly one `.mxc[tabindex="0"]` of 420, one `.jl[tabindex="0"]` of 556 | roving tabindex; plain `tabIndex={0}` would mean 420/556 tab stops |
| Matrix arrow keys `stopPropagation` | otherwise they also step the year via App's window handler |
| Returning to a view restores its own `{yi, cum}` | `vmem`; the flow-entry 2018 jump used to overwrite Saldo's window permanently |
| Matrix grid never intersects the open chip dock, cell ≥ 12 px | clearing the panel *vertically* alone crushes cells to the 8 px floor — the placement search must be free to step left instead |
| No map overlay rect intersects another, at **960–1440** and 390 | `.zoomrst` and `.paircard` once shared `top:44/right:16`; the 901–1150 px band was unmeasured and had four separate collisions in it |
| Every chip header and `×` passes an `elementFromPoint` probe, 960–1600 px | the only test that catches an overlay that covers a control without overlapping much of it |
| `.paircard` is `position:static` below 960 px | floating, it lands under the 312 px JLS chip once the map box drops under ~652 px wide |
| `.helpcard` and `.jcard` reserve 164 px for the legend | the tallest legend (klas + % threshold) rises 136 px off the map's bottom edge; a glossary that explains the colour scale must not cover it |
| Below 900 px `.helpcard` is `position:fixed` and reserves the scrubber's lane | anchored inside `.map-box` with `max-height:70vh` it ran to y 1152 in an 844 px viewport and sat on the fixed bar: `elementFromPoint` over the **play button** returned the glossary |
| Page `scrollWidth ≤ clientWidth` at 390 | `.seg` is `overflow:hidden`, so anything too wide is clipped, not scrolled |
| `.chip-hd` / segment / rail row ≥ 44 px on coarse pointers | these open and dismiss every panel on touch |
| The entry chunk stays under 600 KB | `geo_jls.json` (475 KB) + `geo_regions5.json` (68 KB) were static imports in `metrics.ts` — 53 % of the bundle, parsed before the default view could paint, for two of seven views |

The 390 px geometry block runs before the v2.0.4 block in `verify.cjs` and re-boots the app under
`isMobile + hasTouch`, so `(pointer:coarse)` and the `COARSE` flag in `tip.ts`
are genuinely exercised — reading them at 1440 tests nothing.

Two more, on the keyboard and the screen reader:

| Invariant | Why |
|---|---|
| `#spark` implements Home / End / PageUp / PageDown, not just the arrows | it declares `role="slider"`, and arrows alone meant 27 presses to cross 28 years |
| A `.cnt` says its own value, like a `.jl` already did | the tooltip is `aria-hidden` decoration; without the label the primary view is 21 tab stops that read out a bare name |
| A focused `.cnt` keeps a ring the pointer cannot take away | focus leaned on `.hl`, which is *shared with hover* and is one value: hovering any other county overwrote it and the following `pointerleave` cleared it, leaving the still-focused county at plain `#fff` 0.8 px. Focus now draws its own dashed stroke, orthogonal to hover (ink) and selection (teal) |
| A highlight dies with the view that made it | `hl` survived a view change and the tip's visibility test was view-agnostic, so a county focused in Saldo carried its saldo tooltip onto the JLS map — keyboard-only, since a focused county never gets a `pointerleave` |
| Every segment group is a named `role="group"` | the visible `.ctrl-lab` beside each was decoration: AT heard seven indistinguishable runs of pressed/not-pressed buttons |
| The map zooms from the keyboard (`+` `−` `0`) | wheel/pinch/drag only meant the whole feature failed 2.1.1 — and so did the county labels, which only appear once a county is *zoomed* wide enough |
| The matrix diagonal is a named `gridcell` at `tabindex="-1"` | the roving tabindex steps over it by design, so its "not part of the matrix" explanation was pointer-only |

### v2.0.5 invariants (review pass 3)

| Invariant | Why |
|---|---|
| An on-demand geometry chunk that fails **says so and offers a retry** | `geoAsync` had no `.catch`: the rejection was unhandled, `??=` cached it for the session so leaving and re-entering the view never retried, and `jlsGeo()` returns `null` both before the fetch *and* after it fails — so the loading placeholder was the permanent post-failure UI. The retry **reloads**, because a failed module fetch is cached in the browser's module map and a second `import()` of the same specifier never hits the network (measured: 0 of 556) |
| `.cnt` is a `role="button"` that handles **Enter *and* Space** | an SVG `<path>` matches none of App's Space exemptions (`tagName` is `path`, no role, not in `.rrow`), so Space on the primary view's 21 tab stops started the 28-year animation — v2.0.4's rail-row fix, one element short |
| The global key handler ignores **Ctrl / Meta / Alt** chords | Alt+← is the browser's Back, which this app deliberately makes an undo; stepping the year on it mutated the history entry the user was leaving. `useZoom` guarded the same window correctly and the two disagreed |
| Space yields when the document can actually scroll | below 900 px `body` scrolls, and Space / Shift+Space are the primary keyboard scroll keys — a 1440 px window at 200 % zoom is in that band too |
| A **lone** `sel` dies entering Matrica or the JLS map | there is no county card for those views, so it painted a 1998–2025 county card over a 21×21 grid, and its `×` aimed `focusSoon` at a `.cnt` that does not exist there → focus to `<body>`. Same defect as the stale tooltip, on the fifth key that fix did not clear. Enforced in `setView` **and** `decodeHash`. Amended in v2.0.7: in Matrica `sel` survives as one half of a *corridor* (`sel` + `pair`), which the grid can point at — DetailCard is what must stay out, and it now checks the view, not just `sel` |
| A dead `pp=` is dropped on decode, like `jl=` | `PairCard` renders null outside Tokovi but App's Escape cascade still consumed a press for it and `encodeHash` re-emitted it — `#v=reg&pp=HR-01&cz=1` booted with an invisible pair whose Escape closed nothing and never reached the open panel |
| Re-hubbing in Tokovi **closes** the corridor card | it silently re-pointed at a pair the user never chose. Carried open as "finding 27" through two passes; the hub is what was picked, so the pair is stale by construction |
| `storyHolds()` is the **only** definition of caption validity | `up()` walked `storyKeys` against the patch directly and invalidated on STORY_KEYS fields a preset never sets, while the codec skipped them — two rules for one question, and this file claimed they were one |
| Focus rings on data surfaces are **two-tone** | see Design tokens: one tone measured 1.02:1 against the ramp it sits on. `.focusring` is an overlay above every fill, and `bakeMapClone` **removes** it — UI state must not reach a figure in a paper |
| Matrix numbers carry a baked white halo | no ink/white threshold clears 4.5:1 on these ramps (see Design tokens). `.mxnum` gets its halo from a class, so the export bakes it or reverts to ~2.5:1 |
| The glossary makes what it covers **inert** | `.helpcard`, `.card` and `.jcard` all resolve to `top:14/left:16` and the glossary is wider and above; `#cardX` and `#jcardHd` were fully covered and still tab stops (2.4.11). Opening it also moves focus *into* the dialog it declares |
| Every activation that unmounts its own control hands focus on | matrix cell, matrix rail row, `#zoomRst` and `#pngBtn` each dropped focus to `<body>` — `focusSoon` covered the `×` buttons and the Escape cascade only |
| The map **pans** from the keyboard (Shift + arrows) | `zoomBy` anchors on the box centre, so zoom alone only ever magnified the middle of Croatia; Istria and Vukovar were unreachable at k > 1, and so were their labels |
| The grid and the JLS list have jump keys | 21×21 is ~40 presses corner to corner and 556 features is 555; App scoped Home/End to `#spark`, so on a cell they did nothing |
| Escape dismisses the tooltip, last in the cascade | 1.4.13: it is `pointer-events:none` and cursor-following, so it can never be hovered either, and in Matrica/JLS it is the only *visible* readout — up to 260 px sitting on the neighbours being compared. Runs after every real surface so Escape still closes panels first |
| The boundary credit is **two** credits, and names ODbL | `geo_jls.json` is a raw Overpass `admin_level=7` pull, not geoBoundaries — a JLS export carried an attribution that was both wrong and licence-free. ODbL §4.3 wants the licence named; see `LICENSE` |
| The corridor card encodes its two series by **shape** | they differed by hue alone and the caption said "(crvena)/(plava)" — 1.4.1, and the two hues are 1.39:1 apart in luminance |
| One `<h1>`, real `<h2>`/`<h3>`, a skip link, named landmarks | there was exactly one heading in the whole app and everything else was a styled `div`; heading navigation reached one target and a sighted keyboard user had no bypass |
| `verify.cjs` closes the browser on **failure** | there was no `try/finally`, and most DOM regressions surface as a throw (`querySelector(...).textContent`), so a failed run orphaned a Chromium and leaked a socket |
| The suite asserts **its own check count** | three documents once claimed three different counts and none was right; a deleted `ck()` was a quieter green run |
| No check depends on the network | `waitUntil:'networkidle0'` waited on fonts.googleapis.com and four checks are font-metric-dependent, so a box with no egress silently measured the fallback. The host is stubbed |
| `#v=jmap` waits on **556 features**, not a stopwatch | the 464 kB chunk loads from a `useEffect` *after* `networkidle0` resolves; every jmap check was racing it against `settle(400)` |
| Overlay sweeps assert what they compared | filtering to `position === 'absolute'` meant a refactor to static/fixed shrank the set to nothing and the check passed having compared no pairs — and it silently excluded `.helpcard`, which is `fixed` below 900 px |
| `.paircard` is asserted `static` below 960 px directly | it was documented and never tested, and the sweeps *exclude* static elements, so a regression to floating would have been caught only if it happened to overlap |

### v2.0.6 invariants (unpublished companion study)

| Invariant | Why |
|---|---|
| ~~The study's authors appear **nowhere in the built app**~~ → **the citation ships in the built app** | while it was unpublished, naming it would have circulated it before its authors did; since 27 July 2026 the same scan runs inverted and requires the names, the Hrčak URL and the DOI to be *present*. Asserted against the *bundle* (index.html + every same-origin script and stylesheet, fetched and scanned), because a component that never renders proves nothing. The scanned count is asserted either way, so a failed fetch cannot pass as a result |
| Every surface that names the study **links** to it | prominence was the ask: the first line under the `<h1>`, the always-visible footer and the glossary each reach the record in one click, and the exports carry the DOI as text because an image has nothing to click. All from `credits.ts`, so the four cannot drift |
| Header, footer and `<noscript>` **agree** on whether it is published | `index.html` is static markup and cannot import `credits.ts`, so it is the copy that gets left behind. The invariant is agreement, not any one wording — that check survives publication instead of silently pinning today's state. One further check is pinned to the *current* state — it read "unpublished" until 27 July 2026 and now asserts the citation is live; a future change of state updates `credits.ts`, the `<noscript>` and that line, in one commit |
| The footer always carries a reference clause **and** the non-affiliation statement | it is the only always-visible surface. A disclosure reachable only through a panel is one most readers never meet — the glossary is where it gets room, not where it lives |
| The disclosure costs the map ≤ 11 px | measured: the footer went 56 → 67 px at 1440 and `.map-box` 593 → 582. Three separate `<span>`s cost 23 px because each flex item wraps on its own; one merged span costs 11. Both numbers are pinned, so the next copy edit cannot quietly eat the map |
| `rad` is a glossary term | the legend and the rail say "iz rada" in three places (`Klasifikacija iz rada`, `prijedlog iz rada`, `Regije — prijedlog iz rada`). Once the names are gone, the shorthand resolves to nothing unless the glossary defines it, and the entry points at the section that explains it |
| The export carries it for **klas and reg only**, on its own line | those two reproduce the study's threshold and its grouping; the other four take nothing from it and must not imply otherwise. Own line because `srcLine` already runs ~950 px at 8,5 px mono — appended, the disclaimer is the half the canvas edge clips. Asserted by parsing the two 8,5 px `x="20"` rows out of the SVG and checking the 14 px gap and ≥ 12 px clearance from the legend |
| ~~The subject may be described, the title may not~~ | that held while the manuscript was unpublished — the glossary once opened with a near-verbatim paraphrase of its title, which identifies it as surely as the names do. Published, the title is simply cited |

### v2.0.7 invariants (a corridor opens where it was picked; strokes)

| Invariant | Why |
|---|---|
| Activating a matrix cell or a matrix rail row opens the corridor **in place** | it used to set `{view:'flow', sel:a, pair:b}`, i.e. answer a corridor question with a county one: measured, Istarska→Zadarska (31 people) unmounted the grid, drew 20 arcs from Istarska and listed all 20 partners summing 996 — the county's whole outflow — with the corridor demoted to a card in the corner. The matrix is *the* view for comparing corridors and one click threw it away |
| A corridor is `sel` **+** `pair`, and it lives in Tokovi **and** Matrica | the same pair, hub/partner there and row/column here, so those two views carry it between them and every other view drops both halves. Half a corridor is dropped on decode too — `#v=mx&s=…` alone marked a row with no card, `#v=mx&pp=…` was an Escape-eating flag with nothing on screen, and `s=X&pp=X` is not a corridor at all |
| The corridor card docks in the **rail** in Matrica | a floating card is free over a map (it lands on sea) and expensive over a heatmap: measured at 960 px it covered ~12 columns × 9 rows, and steering the grid around it (the placement search) drops the cell to ~10 px, under the 12 px floor. Asserted both ways — where the card is, and that opening it changed no cell's size |
| The grid marks the corridor its card describes | one cell in 420 is not findable from memory: two teal trace bands plus a two-tone ring on the cell (teal alone is 1.02:1 against the ramp — see Design tokens). Painted with **attributes**, so unlike `.mxband` the export needs no new baking |
| The cell and the rail row own the disclosure (`aria-expanded`) | activating either opens the card and leaves the control mounted, so it is a toggle and says so — the contract `.cnt` already has with the county card. Focus therefore stays put instead of being handed on, and Escape / the card's `×` come back to that exact cell |
| No county detail card in Matrica, even though `sel` is set | DetailCard keyed off `sel` alone and painted a 1998–2025 county card for the corridor's *row* — a county the user never picked. Same rule as v2.0.5, reached by a new route |
| **Strokes do not scale with the zoom** | every stroke is inside the zoom transform: at k=6,55 the county outlines on the JLS map drew 6,55 px, a highlighted municipality 8,5 px, and the focus ring 29,5 px of white under 13,1 px of dashed ink — reported as "weird thick border on some parts", which is what a scaled dash looks like. `vector-effect="non-scaling-stroke"` as an **attribute**, because the export clones the live SVG *with* its transform and a stylesheet rule would not travel with it. Arc widths are excluded on purpose: they encode magnitude |
| That is asserted in **pixels**, differentially | `getBoundingClientRect` excludes an SVG element's stroke (measured: 0 px of contribution either way), so presence of the attribute is not evidence. The check rasterises the exported SVG twice — as it ships, and with the attribute stripped — and compares ink-run medians: **1 px vs 7 px** at k=6,55 |
| The two-tone ring is **keyboard-only** | it was drawn from the `focus` event, which a mouse click fires too, so clicking a municipality painted the ring meant for Tab. `isKeyFocus` (`:focus-visible`) gates it, and the CSS `:focus` rules became `:focus-visible`. The check drives a **real** mouse through CDP: an in-page `dispatchEvent` + `.focus()` reports focus-visible and passed the bug |
| **No graphic ever shows a UA focus ring**, and `outline:none` is unconditional | an outline on an SVG element is drawn round its **bbox** — a rounded rectangle, nothing like the shape — and inside the zoom transform it scales with k (~20 px of ink at k=4,1). Chrome's own is `auto 5px rgb(16,16,16)`, which wrapped the whole 1.100 px timeline in a black rounded rect on every click of it. One rule does all of them: `svg :focus,#spark:focus{outline:none}` — `#spark` needs naming because it *is* the `<svg>`, not a child. Unconditional on `:focus`, because a mouse click is deliberately not `:focus-visible` and that is the case the ring appears in; the keyboard indicators stay on `:focus-visible` |
| That is a **sweep**, not a list of selectors | the first cut of this check covered `.cnt`, `.jl` and `.mxc` and passed while `#spark` (all four views) and `.mxd` still rang. The check now clicks every focusable graphic and control with a real mouse across four views — measured 31 targets — and asserts none of them ends up with a visible outline. Form controls are excluded on purpose: Chrome reports focus-visible for `<select>`/`<input>` however they were focused, and the teal 2 px ring there is the app's own |

### v2.0.9 invariants (answering to a source a reader can now open)

| Invariant | Why |
|---|---|
| The klasifikacija legend states what the study published, and **names the counties that differ** | same rule, newer DZS pull: the study publishes 7 / 7 / 7 for 2011–2024, the atlas computes **7 / 5 / 9**. Karlovačka (−5.106) and Koprivničko-križevačka (−4.802) sit 606 and 302 people past the −4.500 line that the study's own figures (−3.513 and ≈ −4.219) put them inside. That was disclosed only in the footer and inside one Nalaz caption — never on the panel showing the counts |
| The difference is **derived**, never written out | `PAPER_KLAS` in `credits.ts` records the study's published membership (§4.2.1–4.2.3) as a citable fact; `PAPER_KLAS_DIFF` in `metrics.ts` computes the delta at the study's own settings. A hardcoded pair of county names would keep asserting a difference a revision had closed, or hide one it opened — the exact defect the ground-truth table exists to prevent. The suite pins 7 / 5 / 9 so the note cannot become decorative |
| Off the study's threshold or endpoint the legend **stops comparing** | at 2011–2025 the same "iz rada" heading reads **9 / 3 / 9** (Krapinsko-zagorska −68 → +43, Ličko-senjska −376 → +400) for a window the study never analysed. Comparable only at `thr === 4500 && !thrRel && YEARS[yi] === 2024`; otherwise the note states the study's period instead of asserting agreement |
| Exactly **one** klas legend note, and the legend still fits 164 px | this is the tallest legend in the app and both `.helpcard` and `.jcard` reserve its lane. Two notes cost a control over there, so the relative-threshold caveat and the divergence note are branches of one string, not two elements |
| Regije says the county partition is the **atlas's reading** | the study proposes five regions and their centres in prose and prints no membership table, so all 21 assignments are interpretation. The old note footnoted Lika alone and said the study was "neodređeno" about it — its nine-region passage names Lika alongside Zadar, so that was checkable and wrong. Šibensko-kninska in Dalmatinska was undisclosed entirely (the study never lists it among the Dalmatian winners). Measured: moving Lika to Dalmatinska costs 376 people absolutely but **flips which region ranks first** in `% popisa 2011.` (4,99 % vs 4,86 % → 5,43 %) |
| The glossary carries the **study's** data caveats, not only the atlas's | undercounted emigration via MUP deregistration, post-2011 temporary-stay inflation of both flows, no unified population register, coastal holiday-home registration, commuting excluded. All five are about the exact series the atlas paints as a first-class `Sastavnica`, and the app repeated none of them while being scrupulous about its own — which reads as selective once the source is one click away |
| Pre-2007 says so **in the mode where it renders** | measured on `atlas_data2.json`: the national inter-county margin Σ(ii) − Σ(oi) is −550/−519/−464/−489/−490 for 2002–06 and **exactly 0** from 2007. The scrubber's hatched pre-2011 band is drawn at `opacity 0` unless cumulative or klas — precisely the modes that already exclude those years — so godišnje mode, the only mode that renders them, had no marking at all |
| The export carries the **caveat**, not only the reference | a PNG in a slide has no footer to scroll to and no link to click, and it now cites the study by DOI: an image asserting "prema radu" over a count the study did not publish owes the reason on the same image. `BOT` 88 → 102 for a third 8,5 px row rather than tightening the rhythm, because the top row still owes the legend 12 px |
| "Nijedna brojka nije preuzeta iz rada" **exempts the threshold** | −4.500 *is* a number from the study, named in the sentence before. The intent (no migration figure is copied) was right and is kept; the exception is stated instead of contradicted |
| Both denominators are defined, and the estimate's **clamp** is stated | `pe` covers 2001–2024, so `peAt` divides 2025 by the 2024 estimate and 1998–2000 by the 2001 one while the label says only "% tek. procjene". Neither denominator appeared in the glossary, and nothing said `rel11` is the study's like-for-like measure |
| A Nalaz states the count the rail beneath it lists | Nalaz 2 said "samo tri županije" grow on mig+prirodno 2011–2024. Five do — Zagrebačka +2.240 and Dubrovačko-neretvanska +125 as well — and the rail the preset opens listed all five directly under the caption denying two of them |

### v2.0.9 invariants (self-hosted fonts, and Nalazi for the study's argument)

| Invariant | Why |
|---|---|
| The page reaches **no third-party origin** | fonts came from a CDN on the critical path: every visitor's IP reached it before first paint, for a public Croatian-hosted site, and nothing here needed it. The suite no longer *stubs* the font host — it records every off-origin request and asserts the list is empty, so privacy and determinism are one check |
| Font-metric checks now measure the **real** face | stubbing the host made four checks (header height, scrubber tick clipping, exported-SVG title fit, PNG dims) deterministic against Arial Narrow — deterministic, but not what a visitor sees. Consequence, measured on the first honest run: the footer is **75 px**, not the 72 px the fallback suggested, and `.map-box` 572. IBM Plex Sans sets wider; the number moved because the measurement got honest, not because the copy grew |
| 14 declarations, **8 files**, 169,6 kB | Oswald and IBM Plex Sans ship as variable fonts — the CDN returns one file for every weight requested (verified by hash), so deduping costs nothing and saves 189 kB. Only latin + latin-ext: latin-ext is **not** optional for Croatian, č ć š ž đ live at U+0107–017E, and the suite asserts a latin-ext face is among the loaded ones |
| Fonts are emitted **by Vite from `src/`**, not served from `public/` | `base: './'` is what makes the build work from any subpath; a `public/` path with a leading slash would 404 there. The licence texts are the opposite case — they must be *served*, so they live in `public/fonts/` and reach `dist/fonts/`, because OFL §2 requires the licence to travel with any copy of the font software |
| `document.fonts.check()` is the wrong question | it asks "would this exact shorthand resolve to a **loaded** face", and IBM Plex Sans answered false at 600 simply because no visible run of text requests that weight in latin. The check counts loaded faces per family instead |
| Every Nalaz cites numbers **its own view renders** | unchanged rule, newly enforced on the six additions: the rail is read back and compared against the caption (Zagrebačka +15.287 internal, Istarska top at +10,8 %, 21 negative rows on prirodno, the corridor's 4.288 / −517) |
| The Nalazi cover the **study's** argument, not only the atlas's apparatus | measured against the paper, the first seven used no internal/external split (its central analytic move), no "% popisa 2011." lens (half its own keyword list), nothing about *when* the turn happened, nothing of its Osijek conclusion — and the Matrica, an entire view, had no story at all. Six presets, one per gap |
| The Matrica Nalaz opens its corridor **in the grid** | it would have been trivial to write it as `{view:'flow', …}`; that is exactly the v2.0.7 defect. The check asserts 420 cells survive, the corridor is marked, and the card docks in the rail |

### v2.0.9 invariants (sources reachable, terms stated)

| Invariant | Why |
|---|---|
| Every upstream source the footer **names**, it **links** | the atlas named four and linked none. For the 2018 flows that is closer to an obligation than a courtesy: they are Pitoski et al. under **CC BY 4.0**, whose §3(a) asks for a URI or hyperlink to the material "to the extent reasonably practicable" — on a web page it is — and OSM's own attribution guidance asks for a link to its copyright page. `src/lib/licences.ts` is the one list; the footer and the glossary are two renderings of it |
| The **legend** keeps plain text on purpose | `.legend` is `pointer-events:none`, so a link inside it could never be clicked. Attribution there stays wording, and the reachable copy lives in the footer and the glossary |
| The links cost the map **nothing** | threaded into the sentence already there rather than appended to it, and "nekomercijalan" is one word inside `NO_AFFIL` rather than its own clause — a separate sentence costs the footer a wrapped line, and the footer is a fixed lane above the map (~13 px at 1440). Pinned at ≤ 78 px |
| Exported figures carry **their own licence**, every view | an exported map is a **Produced Work** under ODbL §4.3, not a derived database, so §4.4 share-alike does not reach it and its terms are ours to set: **CC BY 4.0**, so the next researcher can use it without asking. Unconditional, unlike the study line — the terms apply to all seven views, the study reference only to the two that reproduce its method |
| The band grew again rather than the rows tightening | `BOT` 88 → 102 → 116. Bottom-up at a 14 px rhythm: source credit, figure licence, study reference, revision caveat. The top row still owes the legend 12 px, and the suite asserts the rhythm and the clearance in both directions — four rows for a study view, two for the others, one page geometry either way |
| The IPF caveat travels with the licence | granting CC BY on the figure must not read as granting it on the estimates. The glossary says so in the same paragraph: the IPF layers are this atlas's computation, not published statistics, and must not be passed on as DZS figures |

### v2.1.0 invariants (Godine, and two accuracy fixes)

| Invariant | Why |
|---|---|
| A cell's readout is computed for **its own year**, never `S.yi` | the hovered cell names a year that is generally not the selected one, so `yrHl` is `[county, yearIndex]` and `countyBlock()` takes the year explicitly. Reading `S.yi` would have printed a different column's numbers under that cell's county — the same class of defect as the matrix labelling a cell `a → b` over `b → a`'s number, and `#tip` being `aria-hidden` means the cell's own `aria-label` is the only other copy |
| Godine and Saldo are **colour-comparable by construction** | both read `DOM[flow+den+cum]`, which is already the max over every county and every rendered year, and both use `divScale`. Asserted by measuring the computed `fill` of the same county-year in both views rather than by inspecting the code — that is the only way the claim is falsifiable |
| Cumulative mode starts the columns at **2011**, not 1998 | `val()` returns 0 before `IX2011` when `cum` is set, because that is where the accumulation starts, not because anything was measured. Nine columns of zeros is the same lie `#v=saldo&y=2005` told on the map |
| The grid **is** the year picker | activating a cell writes the same `S.yi` the scrubber, the map and every other view read, and it lands in the permalink. That is what makes the view a control rather than a poster — and why cells are `gridcell`s that do something, while the rail rows here are `role="img"` (there is no county card to open; the row already *is* the county's series) |
| No county card in Godine, and a carried `sel` dies on the way in | enforced in `setView` **and** `decodeHash`, like `jmap`. A floating 1998–2025 card over a grid both covers live cells and duplicates the row beneath it — the fifth and sixth routes to the v2.0.5 defect |
| Arrow keys `stopPropagation`; Home/End/PageUp/PageDown exist | 21×28 is ~47 presses corner to corner, and App scopes its own Home/End to `#spark`. Without the stop, one arrow press moves the roving cell *and* steps the year |
| The pre-2007 hatch appears only in the mode that renders those years | godišnje renders 1998–2006, cumulative does not — measured, Σ(ii) − Σ(oi) is −550…−490 for 2002–06 and exactly 0 from 2007. Same hatch pattern the scrubber uses, so the idiom is one a reader has already met, and the **export carries the words** because the hatch has no caption of its own |
| In-cell numbers reuse `.mxnum`, deliberately | that is the class `bakeMapClone` bakes the white halo onto. A new class name would look identical on screen and export at ~2,5:1 on the dark end of the ramp. `.yrband`/`.yrsel` take the opposite route — fill/stroke as attributes — so they need no baking at all |
| A seventh segment button is a **header-budget** change | measured: `.ctrls` went three rows → four at 1440, the header 138 → 192 px and `.map-box` 572 → 518. Desktop segment padding went 7 → 5 px (≈76 px back across 19 buttons) rather than shortening a label — "JLS 2018." carries the view's 2018-only scope, so it is an honesty marker, not just a name. Touch is untouched: the coarse rule re-pads to its own 44 px |
| `fitGrid` is one function, and its objective is the **cell** | two views need the four-placement search now. `min(cellW, cellH)` rather than `min(w, h)`, because a 21×28 grid and a 21×21 grid want different boxes out of the same four candidates — and for the square case the two orderings are identical, so Matrica keeps the geometry it was verified with |
| The klas divergence states the distance it can **recompute** | the glossary said "a few hundred people", which is true of the distance to the threshold (606 and 302) and false of the distance to the study's own figures (1.593 and 583). Only the first is derivable here, so `PAPER_KLAS_DIFF` carries `v` and the sentence computes `|v| − thr`; the ambiguous claim is gone rather than re-worded |
| No Nalaz writes out a county the data can name | Nalaz 5 hardcoded "Karlovačku i Koprivničko-križevačku" — the one surface still asserting a pair `PAPER_KLAS_DIFF` exists to derive, and so the one that would keep asserting the difference after a revision closed it. It now points at the legend, which derives them |

### v2.0.9 invariants (the export fits inside itself)

| Invariant | Why |
|---|---|
| **Nothing is drawn into the export band without being fitted first** | reported by a user, one root cause with two faces. The title shrank towards a floor and then drew anyway, so at a narrow map "NETO TOKOVI: SISAČKO-MOSLAVAČKA ↔ PARTNERI · KUMULATIVNA PROCJENA" ran straight through the right-aligned period; and the credit rows were drawn at `x=20` with no fitting at all, so the source row — ~950 px at 8,5 px mono, wider than the canvas at any browser window under ~1000 px — simply ran off the edge. The licence row made it visible, it did not cause it |
| The title **wraps** rather than truncating | its tail is the honesty badge (`· KUMULATIVNA PROCJENA`), so an ellipsis would drop an honesty label and turn a labelled estimate into an unlabelled one. Degradation order is shrink-then-wrap: measured, 23 px at 1440, 17 px at 700, the 12 px floor at 560, and **two lines from 480 down**. `top` grows by 26 px per extra line so the rule and the map move with it |
| The band heights are **computed, not pinned** | `bandLayout()` measures every string and returns `top`/`bot`; `BOT` had been a constant three times over (88 → 102 → 116) and each value was only ever right at one viewport width. The suite therefore stopped pinning a height and now asserts the PNG is exactly 2× the SVG the same state emits — the two formats are twins, which is the invariant that actually matters |
| The legend caveat is fitted too | it sits beside the gradient bar at `x=222`, which leaves 148 px on a 390 px canvas — measured, "Neto parova je strukturna procjena." ran to 401 there. It wraps, and below a 140 px floor it drops to `x=20` on its own line under the scale labels rather than being squeezed; `bot` is sized from where the legend actually ended up |
| Fit is asserted by **measuring the document**, not by reading the source | the strings are built from data at runtime, so no amount of inspecting the code shows the overflow. The check inserts the exported SVG into the page and asks every band `<text>` for its own `getComputedTextLength()`, at 1440 / 1024 / 390 across two views, and fails on any run past the canvas edge or any two runs overlapping on one baseline. It also asserts it inspected ≥ 6 runs, so a selector change cannot pass by comparing nothing |

### v2.1.1 invariants (what an external audit found)

| Invariant | Why |
|---|---|
| The page is **never blank**, and the placeholder clears itself | `#root` was empty until React mounted: measured, that was 2.054 ms of "render delay", 76 % of LCP, spent looking at the background colour. A static placeholder in `index.html` makes first paint the browser's job instead of React's. Measured A/B, cache off, 4× CPU / 1,6 Mbps: **FCP 4.244 → 768 ms**, and CLS **0,0035 → 0** — the app replacing the placeholder shifts nothing, because nothing that was on screen moves. It lives **inside `#root`** so `createRoot()` removes it as part of the first render: no teardown code to forget, and no window with both on screen. That React behaviour is asserted, not assumed |
| No JS means no placeholder | without JavaScript React never runs, so it would sit there claiming to load something forever, directly above a `<noscript>` explaining that it cannot. A `<noscript>` in `<head>` may carry a `<style>`, and that is what hides it. This is why the attribution check now selects **`body > noscript`**: there are two, and only the one in `<body>` is copy |
| Its styles are inline, and its colours name their tokens | inline so the placeholder is self-contained and cannot be broken by a change to the CSS bundle; `var(--bg,#F4F5F2)` so it uses the design token once `index.css` has arrived and a literal before that. The two halves are written next to each other so they cannot drift silently |
| **Every** crawler is allowed, by construction | search engines, archivers and AI/dataset crawlers alike. Enforced as "exactly one `User-agent` group, and it is `*`", because that is the way it regresses without anyone touching the `Allow`: a named `User-agent: <bot>` group **replaces** the wildcard group for that agent, so one narrow block silently exempts it. `Disallow` with a path is a failure outright, and `/assets/` in particular stays crawlable — a robots.txt that hides the CSS and JS of a JavaScript-rendered atlas hides the atlas |
| The `Sitemap:` line leads somewhere | `public/sitemap.xml`, one entry, `changefreq monthly`, no `<lastmod>` — it would have to be hand-edited on every data change and would otherwise sit there quietly lying, and the protocol makes it optional. The URL is absolute because the protocol requires it; that is safe despite the host-agnostic build, because robots.txt is only ever fetched from an **origin root**, so a subpath deployment's copy is never read by a crawler and cannot mislead one. The check validates the XML, the namespace and that the `Sitemap:` origin matches the `<loc>` origin |
| `/robots.txt` is a **file**, and every directive in it parses | `vercel.json` rewrites `/(.*)` to `/index.html`, so without a real file that path served the app's HTML with a 200 and Lighthouse read **31 syntax errors** out of it. Static files are matched before rewrites — verified against the deployed site, not assumed — so the file alone is the fix. No `Sitemap:` line: a sitemap must state absolute URLs and this build is deliberately host-agnostic (`base: './'`, "works from any subpath"), so it would be the one place that stops being true. The check tests the **directives**, not the whole file, because a `#` comment may legitimately contain the words `<!DOCTYPE html>` |
| A rail row's accessible name **contains** its visible one | WCAG 2.5.3, and the reason it failed is not obvious: the visible label of an element is its text children joined with **no separator at all**, so `Grad Zagreb` + `+41.986` is `Grad Zagreb+41.986` and the label `Grad Zagreb +41.986` does not contain it. All 21 rows failed in Saldo alone. `rowName()` is now the single source for both — `.rname` renders it and `rowAria()` extends it — and the separator the label claims is a real space text node in `.rrow` (white-space-only text in a grid container generates no grid item, so it costs no layout). Asserted across all six row shapes by reimplementing axe's rule, so the suite takes no new package and stays off the network |
| `.jc` survives as its own element | the county tag is a test selector (`jRow.county`), so the JLS row renders `name`, a bare `, `, then `<span class="jc">` — the comma outside the span, which keeps `.jc` the county and nothing else while putting the separator in the visible text where 2.5.3 needs it |
| A rail row that activates is a **24 px** target | the other half of 2.5.8, and the half that failed at *every* desktop width, not just on a phone: 21 rows at **291×19**, with 14 px of safe clickable space between neighbours. `min-height`, not padding, because padding would push the `1fr` bar column around and the bar is a comparison aid with its own rhythm. Checked only where rows activate — a `role="img"` row is not a target — which is the same distinction the role rule already makes |
| …and the rail scrolls sooner for it | measured and not free: 21 rows need **508 px** where they needed 411. Still fits at 1440×900, 1600×1000 and 1920×1080; scrolls 4 px at 1350×940 and **26 px at 1536×864**, a 1920×1080 laptop at 125 % that fit before. Taken anyway: the rail is an `overflow-y:auto` scroller by construction and already scrolled at 1280×800 and below — "all 21 at once" was a property of tall windows, never of the layout — while 19 px was a failure at every window. `.rail-list` padding went 6 → 2 px to give back what it could. WCAG 2.5.8's **"Equivalent"** exception was available (a county row does what clicking the county does, and the map target is huge) and was **not** claimed, because it does not cover the Matrica corridor rows, whose equivalent is a matrix cell already near its own 12 px floor |
| A touch target's **own box** is what gets measured | `#scrubTog` was 64×18 with a `::before` extending the hit area, and that is not the same thing: axe and WCAG 2.5.8 measure the element, so it was reported at "should be at least 24px by 24px". The box grew to 24 px **upwards**, into the page, never down into the chart — the 18 px of `.scrub` padding above the chart is the handle's lane and a handle that grew into the chart would swallow taps meant for the year. The chrome moved to `::after` so the visible handle stays 18 px. Not 44 px like `.chip-hd`: those grow inside their own panels, this one can only grow over the live map, and 26 px of invisible tap-eater is worse than the defect |
| **The font swap moves nothing** | the whole measured CLS was one shift, at t=988 ms, worth 0,1038 of 0,1038 — Lighthouse scored 0,105 on desktop and named "Web font loaded" as the cause. It moved `main`, the fixed scrubber, the footer (67 → 75 px, one wrapped line of 9,5 px mono) and the citizenship chip at once, which is why a 3–8 px nudge scores that high: the union of what moves is most of the viewport. Metric-matched fallback faces make the swap dimensionally invisible. Preloading the woff2 would have hidden it on a fast connection only, at 82 kB of critical-path bandwidth against the entry chunk on the profile that is already the weak one |
| That is asserted by **laying the page out twice** | with the woff2 blocked and with them allowed, diffing `header`, `main`, `.ft` and `#scrubBox`. It must be **0**, not small. This is also the only way to test the fallback faces at all: with the real faces present the fallback is never used, so nothing else in the suite can see it. Measured: 0,0 on all four at 1350×940, CLS 0,1038 → 0,001 |
| The fallback numbers are **fitted and re-measured**, never copied | `scratchpad/font-metrics.cjs` takes size-adjust as a width ratio and ascent/descent from the real face's `fontBoundingBox` divided by it, then re-measures the declared face and corrects. The correction is not optional: at weight 600 the raw probe gets Arial Bold while `local('Arial')` inside `@font-face` gets Arial Regular, so the analytic ratio was 6,5 % wrong. Residuals ≤ 0,16 % |
| Oswald is fitted on **caps alone** | one scalar cannot match a condensed display face's caps and its figures — they differ by ~11 % against Arial Narrow. Fitted on both together it left the title 3,83 % out where the *unadjusted* fallback was 1,88 %, i.e. the adjustment made that string worse. The caps are the only Oswald run long enough to wrap; the figures sit in fixed-width boxes. The suite therefore asserts each fallback is **closer than doing nothing**, comparing against the raw system font rather than against a tolerance — a fixed tolerance can always be satisfied by fitting the check to the fit, and only this comparison caught the regression |
| The generic families stay **behind** the fallback faces in the stack | `local()` resolves to nothing on plenty of systems — Arial Narrow is frequently absent on Linux — and then the face is skipped and the stack behaves exactly as it did before |
| A phone reads mostly ≥ 12 px text | measured **3,68 %** of rendered characters, against Lighthouse's > 60 % bar, with `.ft` alone 50,97 % of all text on the page — the longest prose there is (sources, licences, the citation, the non-affiliation statement), i.e. the surfaces the house rules call load-bearing, at 9 px. `.ft` and the rail's `.rname`/`.rval` go to 12 px below 560 px and clear the bar at **67,13 %**. It costs scroll, not map: below 900 px the body scrolls and the footer is its last element. The desktop footer stays 9,5 px and ≤ 78 px, because there it is a fixed lane over `.map-box` |
| The rail's name column widened with the type | 120 px was already a pixel short of the longest county names at 11 px (Dubrovačko-neretvanska wanted 123,8) and 12 px wants 135, so three of 21 reached the ellipsis. 140 px, taken from the bar — a comparison aid with 168 px to spare — never from the number. Asserted directly: no `.rname`/`.rval` may have `scrollWidth > clientWidth` |
| The build ships **source maps** | `build.sourcemap: true`. ~2 MB of `.map` files no visitor fetches unless devtools is open, in exchange for stack traces that name a line in `src/`. The source is MIT and public, so they disclose nothing the repo does not. Asserted over HTTP — fetch the entry chunk, follow its `sourceMappingURL`, parse the map and require real `sources` — so the check means the same thing when the suite is pointed at a running server |
| The suite **stubs** the two Vercel platform routes, and asserts they were asked for | `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` exist only on Vercel, so a local run 404s twice on every page load and both "zero page/console errors" checks fail — which is what had been happening on every run since the analytics commit, undetected because the suite was not re-run with it. The stub keeps those checks meaningful (a *new* 404 still fails them), the paths are same-origin so the no-third-party-origin check is unaffected, and a further check asserts both were actually requested — a silent analytics regression must not read as green |
