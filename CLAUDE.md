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
New surfaces obey the same rules: honesty labels,
generated-data-stays-generated, hr-HR formatting, and green verify before "done".

## Commands

```
npm run dev        # vite dev server
npm run build      # production build -> dist/ (base './', works from any subpath;
                   #   NOT from file:// — the entry is an ES module, CORS-blocked
                   #   from a null origin. Measured: blank page.)
npm run verify     # build + run the 166-check puppeteer suite (960–1600 px + 390 px)
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
   Renaming them breaks verification; change both sides deliberately or not at all.
   Roving tabindex is asserted by count: exactly one `.mxc[tabindex="0"]` of 420
   and one `.jl[tabindex="0"]` of 556 — a change to plain `tabIndex={0}` fails.
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
src/lib/geoAsync.ts      on-demand geo_jls.json (475 KB) + geo_regions5.json (68 KB),
                         which served two of six views and were 53 % of the bundle.
                         Sync accessors for the render path; App subscribes once via
                         useGeo() and its re-render feeds Rail/Legend/Tooltip too
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
                         Legend, Rail, DetailCard, PairCard, JlsCard,
                         CitzPanel (+ zemlje tab), AgePanel, HelpPanel
                         ("Kako čitati" glossary), StoryBar, MatrixView, Scrubber,
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
scripts/verify.cjs       the executable verification protocol (166 checks; the
                         390 px block re-runs geometry with hasTouch, and the
                         v2.0.4 block after it pins the review-pass-2 findings)
```

State flows one way: controls mutate `S` in App → components derive everything per
render from `S` + `metrics.ts`. Imperative escape hatches: tooltip positioning (ref
mutation on pointermove, documented in Tooltip.tsx), zoom transforms (`useZoom`
binds a non-passive wheel listener itself), and hash sync — a **view** change is
`history.pushState` so Back is an undo, everything finer is `replaceState`, and a
`popstate` listener decodes back into `S`. `INITIAL = {...BASE, ...decodeHash(hash)}`,
so a shared URL boots straight into its view; `decodeHash` repairs invariants
(flow needs a hub, klas/cum clamp to ≥2011, the JLS chip only exists in Tokovi,
citz/jls/age mutually exclusive).

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
| The entry chunk stays under 600 KB | `geo_jls.json` (475 KB) + `geo_regions5.json` (68 KB) were static imports in `metrics.ts` — 53 % of the bundle, parsed before the default view could paint, for two of six views |

The 390 px block runs last in `verify.cjs` and re-boots the app under
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
