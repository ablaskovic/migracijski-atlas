# Review pass 3 — Migracijski atlas · found and fixed (v2.0.5)

> **Status: every finding below is fixed on `review-pass-3-v2.0.5`.** The suite
> went 166 → **211 checks** and is green, `tsc --noEmit` and `oxlint` are clean,
> and `npm run verify` now runs all three gates plus an assertion on its own
> check count. The one thing NOT closed is §8 — four of six review threads never
> ran, so CSS/responsive and React-perf were never *reviewed*, and nothing below
> should be read as coverage of them.
>
> Two corrections to the report as originally written, both found while fixing:
> - **§2.2 was re-measured and is confirmed**, worse than reported at the ends of
>   the ramp. The fix is a two-tone ring, because no single tone works.
> - **§1.3's retry could not work as first written.** A failed dynamic `import()`
>   is cached in the browser's *module map*, so clearing the promise slot still
>   returned 0 of 556 features (measured). The retry reloads instead.

## Original report (findings as filed)


Scope: full UX / bug / code / docs review of the `review-pass-2-v2.0.4` branch.
**No project file was modified.** `git status` is clean; puppeteer was installed
with `--no-save`, so `package.json` and `package-lock.json` are untouched.

Findings already fixed in `UX-REVIEW-2026-07-26.md` (v2.0.3) and
`REVIEW-2026-07-26-pass2.md` (v2.0.4) are **not** restated. Everything below is
new, or is an old fix applied to only part of its surface.

## Coverage status — read this first

Six review threads were dispatched. **Four were lost to an API session limit
before reporting.** This document is therefore *partial*, and the gaps are not
"checked and clean" — they are unchecked.

| Thread | Status | In this report |
|---|---|---|
| Docs vs reality + verify-suite quality + pipeline | ✅ complete | §4, §5, §6 |
| Accessibility / keyboard / AT | ✅ complete | §2, §3 |
| State machine, permalink codec, App.tsx | ❌ lost | partial — my own reading only (§1) |
| Metrics, honesty labels, export fidelity | ❌ lost | partial — §1.2 only |
| CSS / layout / responsive / visual polish | ❌ lost | **not covered** |
| React perf / bundle / type safety / bad patterns | ❌ lost | partial — §7 |

The two completed threads ran without their safety classifier available, so every
claim of theirs that drives a change was re-verified by hand before landing here.
Items marked **[verified]** were reproduced independently; items marked
**[reported, unverified]** come from a thread and were not re-checked.

---

# §1 — Findings from my own reading

## 1.1 An SVG export failure lights the error on the *PNG* button · **MEDIUM** [verified]

`Header.tsx:36` holds one `err` flag shared by both exporters. `onSvg`
(`Header.tsx:44-47`) sets it on failure — but only the PNG button renders it:

```jsx
<button id="pngBtn" …>{err ? 'greška' : busy ? '…' : 'PNG'}</button>   // :103
<button id="svgBtn" …>SVG</button>                                     // :104-105
```

So a failed **SVG** export leaves the SVG button looking like nothing happened and
makes the **PNG** button read `greška` for 1.6 s — an error reported against the
control that did not fail. Nothing in `verify.cjs` exercises an export failure at
all, so neither branch of this is tested.

Compounding it (and independently found by the a11y thread, §2 C5): the
`aria-label` on both buttons is static, so neither the busy nor the error state
reaches assistive tech. This is the app's only user-visible error surface.

## 1.2 `storyHolds()` and `up()` are not the same predicate · **MEDIUM** [verified]

`CLAUDE.md:118-121` states that `storyKeys`/`storyHolds` are "the single definition
of 'this caption still describes the screen', read by App and by both halves of the
codec". They are two different tests:

```ts
// stories.ts:74 — skips any key the preset's patch does not set
return storyKeys(ix).every(k => !(k in patch) || cur[k] === patch[k]);

// App.tsx:43-44 — runs over every storyKey, patch or not
for (const k of storyKeys(s.story)) {
  if (k in patch && patch[k] !== s[k]) { n.story = null; break; }
}
```

`up()` invalidates on any `STORY_KEYS` field moving. `storyHolds()` ignores every
field the preset itself does not set. Nalaz 2's patch, for example, sets no `thr`,
so `#v=saldo&f=all&c=1&y=2024&t=9000&st=2` keeps its caption on decode, whereas
reaching the same state by moving the slider in-app would have cleared it.

**Impact is currently low** — `thr`/`den`/`dir` are `disabled` in the views where
the affected presets live (`Header.tsx:49-50, 95`), so the divergent states are
reachable only by hand-editing a URL, and the keys involved don't change the
numbers those captions cite. But it is a real asymmetry in the mechanism that the
last two passes twice found bugs in, and the documentation asserts it does not
exist. Worth either aligning the two or correcting `CLAUDE.md`.

## 1.3 The on-demand geo chunks have no failure path at all · **HIGH** [verified]

`geoAsync.ts:29-44`:

```ts
jlsP ??= import('../data/geo_jls.json').then(m => { jls = …; subs.forEach(f => f()); });
```

There is no `.catch`. Three consequences, none of them handled anywhere:

1. **An unhandled promise rejection** on any network failure, stale deploy or
   chunk-hash mismatch.
2. **The failure is permanent.** `jlsP` is memoised with `??=`, so the rejected
   promise is cached forever. Every later `loadJlsGeo()` returns the same rejected
   promise — leaving the view and returning does not retry; only a page reload does.
3. **The user sees the loading placeholder forever.** `MapView.tsx:264-267` renders
   `#jloading` ("Učitavanje geometrije JLS…") while `jlsGeo()` is null, and null is
   exactly the permanent post-failure state. The JLS view becomes an empty map
   under a spinner with no error, no retry and no explanation.

This is a regression risk created by the v2.0.4 code-splitting win: before the
split the geometry could not fail separately from the app. 464 kB over a mobile
connection is precisely where it will. `verify.cjs` serves from local disk and
never simulates a failed chunk.

## 1.4 `npm run verify` does not run `lint` or `typecheck` · **LOW** [verified]

`package.json:11` — `"verify": "vite build && node scripts/verify.cjs dist"`.
`CLAUDE.md:41` calls verify "the minimum bar before calling anything done", but the
two fastest gates are not in it, so "green" can coexist with type errors that
`vite build` does not typecheck (esbuild strips types without checking them).
Both currently pass, so this is a gap in the gate, not a live defect.

## 1.5 No copy-link affordance for the app's headline feature · **LOW (QoL)**

Shareable permalinks are the stated point of the app (`index.html:7-8`), and the
whole `hash.ts` codec exists to serve them — but there is no UI for it. The user
must know to copy the browser's address bar, which on mobile is often hidden. A
single "Kopiraj poveznicu" button next to the PNG/SVG group would complete the
feature, and would pair naturally with the honesty labels (the link carries the
state the caption describes).

## 1.6 Type/lint configuration leaves the app's main hazard unlinted · **LOW**

- `tsconfig.json` is `strict` but omits **`noUncheckedIndexedAccess`**. The
  codebase indexes arrays by computed index constantly (`YEARS[S.yi]`,
  `c.ii[yi]`, `pe[i]`, `ODM[a][b][yi]`), which is exactly the class this flag
  guards. `metrics.ts:96-98` already hand-rolls the null-walk that the flag would
  have forced everywhere.
- `.oxlintrc.json` enables only `react/rules-of-hooks` and
  `react/only-export-components`. **`react-hooks/exhaustive-deps` is not
  enabled**, so the stale-closure / missing-dep class is entirely unlinted — in a
  codebase whose central file is a hand-managed effect graph reading `ref.current`
  to dodge exactly that problem.

---

# §2 — Accessibility: highest-severity items

Full thread output was extensive; this is the ranked core. Two items I re-verified
by hand are marked; the rest are **[reported, unverified]** but were traced to
specific lines.

## 2.1 Space on a focused county starts the 28-year animation · **HIGH** [verified]

`MapView.tsx:281-285` renders each county as `<path className="cnt" tabIndex={0}
aria-label=… onClick={selectCounty} onKeyDown={e => { if (e.key === 'Enter') … }} />`
— **Enter only**.

`App.tsx:241-242` exempts from the global Space handler:
`tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'gridcell' || closest('.rrow')`.

An SVG `<path>` has `tagName === 'path'`, carries no role, and is not inside
`.rrow` — so it matches none of them. Space therefore falls through to
`ev.preventDefault(); togglePlay()`.

The primary view is 21 tab stops where Enter opens the county card and **Space
starts autoplay**. This is v2.0.4's finding #11 (Space on an inert rail row)
verbatim on a different element: the fix added `.rrow` to the exemption list and
stopped there. `verify.cjs` checks Space on `#segView button` and on rail rows;
it never focuses a `.cnt` and presses Space.

## 2.2 Focus rings on the data surfaces fail 1.4.11, measured 1.02–2.53:1 · **HIGH** [reported, unverified]

`index.css:73, 74, 304, 313` all set `outline:none` and replace the ring with a
stroke drawn **against the data fill**, which spans the full diverging ramp. The
thread computed the shipping `divScale` through a WCAG luminance calculator:

| fill position | hex | teal ring | ink ring |
|---|---|---|---|
| −1.00 vermilion | `#b5341f` | **1.25** | **2.53** |
| 0.00 midpoint | `#f1eee9` | 4.19 | 13.21 |
| +0.75 | `#5b73a1` | **1.02** | **3.21** |
| +1.00 indigo | `#1d4e89` | **1.73** | **1.82** |
| flow hub | `#3B4650` | **1.99** | **1.59** |

The CLAUDE.md guardrail ("teal … 4.43:1 — fine for controls and focus rings")
computes teal against the **karst background**. That is true on the chrome and
false on the data — and the map, matrix and JLS map are where the last two passes
put the keyboard support. `verify.cjs` asserts the ring's *identity*
(`stroke === 'rgb(32,38,43)'`), never its luminance against what is underneath.

**This is the one finding I would re-measure before acting on** — it is the most
consequential and I did not reproduce the ramp math myself.

## 2.3 The glossary covers two tabbable controls · **HIGH** [reported, unverified]

`.card` (`index.css:92`), `.jcard` (`:205`) and `.helpcard` (`:271`) all resolve to
`top:14px; left:16px`. The glossary is wider (330 px vs 308/312) and has
`z-index:9` vs `5`, so with it open `#jcardHd` (in Tokovi) and `#cardX` (with a
county selected) are 100 % covered **and still in the tab order** — WCAG 2.2
SC 2.4.11 Focus Not Obscured. `index.css:264-266` documents the overlap as
deliberate; what was not done is removing the covered controls from the tab order.

The existing `elementFromPoint` sweep runs with the glossary **closed**; re-running
it with the glossary open would fail today.

## 2.4 `role="dialog"` with no focus management · **HIGH** [reported, unverified]

`HelpPanel.tsx:12` declares `role="dialog" aria-modal="false"`, and `toggleHelp`
(`App.tsx:102`) only flips state — nothing moves focus in, and there is no
`aria-labelledby`. At ≤900 px `index.css:374-376` makes it
`position:fixed; left:8; right:8; top:56; bottom:144` — visually modal over a
background that is neither `inert` nor `aria-hidden`. It is currently neither a
dialog nor a disclosure.

## 2.5 Four activations drop focus to `<body>` · **HIGH** [reported, unverified]

`focusSoon` covers every `×` and the Escape cascade, but not activations that
unmount the activated element:

| Control | Line | Unmounts |
|---|---|---|
| matrix cell, Enter | `MatrixView.tsx:91-94` | the whole `role="grid"` svg |
| matrix rail row, Enter | `Rail.tsx:189-191` → `App.tsx:94` | every row (React key changes) |
| `#zoomRst` | `MapView.tsx:314-318` | the button removes itself |
| `#pngBtn`, Enter | `Header.tsx:38-42` | `disabled` mid-export blurs it |

## 2.6 `sel` survives a view change — the county card renders over the matrix and JLS map · **MEDIUM** [reported, unverified]

`setView` (`App.tsx:65`) clears `hl`, `pairHl`, `jlsHl`, `regHl` — the v2.0.4 fix
for the stale tooltip — but clears `sel` only when *leaving* `flow` (`:75`), and
`DetailCard.tsx:11` bails only on `!sel || view === 'flow'`. So a county selected
in Saldo keeps its 1998–2025 county card painted over the 21×21 grid or the
556-municipality map. Pressing its `×` then calls `focusSoon` with a `.cnt`
selector that matches nothing in those views → focus to `<body>`.

Same defect class as v2.0.4's finding #6, on the fifth key the fix did not clear.

## 2.7 Other confirmed-shape items

- **`.cnt` and `.jl` are focusable, interactive, aria-labelled and role-less**
  (`MapView.tsx:281`, `:230-236`) — **[verified]**. CLAUDE.md rule 2 states the
  principle ("a focusable element with an `aria-label` and no role is a name ARIA
  does not guarantee AT will expose"); it was applied to rail rows and the matrix
  diagonal, not to the 577 map paths, which are also genuinely interactive.
- **`role="grid"` owns no `row`** (`MatrixView.tsx:191`) — no `row`, `rowgroup`,
  `columnheader`, `aria-rowindex`/`colindex`. AT table navigation does not engage
  on the 21×21 matrix.
- **Unguarded modifiers**: `App.tsx:230-231` has no `ctrlKey/metaKey/altKey`
  check, so **Alt+← (browser Back) also steps the year** — damaging the
  Back-as-undo feature the app deliberately added. `useZoom.ts:76` guards
  correctly on the same window; the two handlers disagree. **[verified by read]**
- **Space/Shift+Space hijacked below 900 px**, where `index.css:337` makes the body
  scroll — removing the primary keyboard scroll key.
- **No keyboard pan.** `zoomBy` (`useZoom.ts:62-64`) anchors on the box centre
  only, so from the keyboard you can magnify only the centre of Croatia; Istria
  and Vukovar are unreachable at k > 1, and so are their labels.
- **One heading in the whole app** (`Header.tsx:55`). The five-section glossary
  uses styled `div`s. No skip link.
- **Dead `pp=` swallows Escape** outside Tokovi (`hash.ts:58` has no view guard,
  unlike `jl` at `:86`) — the same shape as v2.0.4 finding #9, in the key it missed.
- **Corridor card distinguishes two series by colour alone** (`PairCard.tsx:44-45`),
  caption names them "(crvena)/(plava)" — 1.4.1. Every sibling chart in the
  codebase uses shape instead.
- **Tooltip fails 1.4.13** — not dismissible without moving focus, not hoverable.

---

# §3 — Correctly done (recorded so a fourth pass doesn't re-litigate)

`lang="hr"`; landmark set complete; viewport allows zoom; `focusSoon` itself is
correctly written (every `<body>` landing found is a call site, not the helper);
the Escape cascade order; `useZoom`'s modifier guard; the seven named
`role="group"` segment groups; the `role="button"` vs `role="img"` rail split;
`prefers-reduced-motion` (live media query, three transitions killed, play loop
slowed not removed); nothing `aria-hidden` is focusable; **no keyboard trap**; the
`role="slider"` scrubber is otherwise APG-conformant including `aria-valuetext`
and the correct `aria-disabled` treatment.

---

# §4 — Documentation drift

## 4.1 The ground-truth table names the wrong two counties · **HIGH** [verified]

`CLAUDE.md:250`:

> `| klasifikacija counts at 1,5 % popisa 2011 | 7 / 3 / 11 (Karlovačka + Koprivničko-kr. flip to gubitnice) |`

Recomputed from `src/data/atlas_data2.json` using the shipping `klasOf`/`val`
(cum 2011–2024, flow `tot`):

```
counts abs −4.500 : 7 / 5 / 9      ✓ matches the table
counts rel 1,5 %  : 7 / 3 / 11     ✓ matches the table

CHANGED between the two thresholds:
  Šibensko-kninska    v=−3.257  limRel=1.640,6   neu -> loss
  Međimurska          v=−4.125  limRel=1.707,1   neu -> loss

  Karlovačka          v=−5.106  limRel=1.933,5   loss -> loss   (already loss)
  Koprivničko-križ.   v=−4.802  limRel=1.733,8   loss -> loss   (already loss)
```

The counts are right; the parenthetical is wrong. Karlovačka and
Koprivničko-križevačka are **already gubitnice at −4.500** and do not flip. The
two that flip are **Šibensko-kninska and Međimurska**. The wrong pair appears to
have been carried over from `stories.ts:47` (Nalaz 5), whose claim is a different
one — the *revised DZS series vs the paper* at the absolute threshold, where those
two counties genuinely are the movers.

`verify.cjs:411` asserts only the counts `7 / 3 / 11`, never which counties moved,
so nothing catches it.

## 4.2 Other doc drift

| # | Claim | Reality | Sev |
|---|---|---|---|
| D1 | `CLAUDE.md:292` "the 390 px block runs **last**" | contradicts `:165-167`, which is the correct one. There are two 390 px blocks (`verify.cjs:959-1034`, `:1348-1366`); the v2.0.4 block runs between them and the last check is at `:1369`, at 1440 px | MED |
| D2 | `CLAUDE.md:46-47` "set `PUPPETEER_PATH` to an existing install" to "spare the ~170 MB Chrome download" | `verify.cjs:15-19` falls back to `require(process.env.PUPPETEER_PATH \|\| 'puppeteer')` — retrying the require that just failed. It only works as an absolute path to a *puppeteer package dir*, never to an existing Chrome. Puppeteer's own variable is `PUPPETEER_EXECUTABLE_PATH`, and `launch()` passes no `executablePath` | MED |
| D3 | `REVIEW…pass2.md:463` "finding 22 fixed — `zoomAt` … backs the keyboard zoom" | `zoomAt` is **still dead**: defined `useZoom.ts:58`, returned `:167`, consumed nowhere. `zoomBy` alone backs the keyboard zoom. `noUnusedLocals` can't see it because it escapes through the return object | MED |
| D4 | `CLAUDE.md:107-109` "metrics.ts … No DOM, **no React**" | `metrics.ts:22` imports `geoAsync.ts`, which imports `useEffect`/`useState`. Also omits `countyAria` from the export list — a load-bearing honesty surface and the only source of every `.cnt` label | LOW |
| D5 | `README.md:29-31` "~492 KB … rather than ~995 KB" | mixes decimal kB (492) against KiB (995) in one comparison, understating the win. The pre-split figure is 1.019.138 B = 1019 kB | LOW |
| D6 | `README.md:29-30` payloads "load … when the JLS or Regije view needs them" | `geoAsync.ts:59-62` unconditionally warms **both** on a 1500 ms timer in every view. The entry-chunk claim holds; the stated user benefit does not — every session still downloads 531 kB | LOW |
| D7 | `CLAUDE.md:232` "white flips at 0.85·m, **where white finally beats ink**" | the value is safe but the reason is wrong: crossover is ≈0.78 (red arm) and ≈0.65 (blue arm). At 0.85 white is already well past both. See §4.4 for the consequence | LOW |

## 4.3 Licensing and attribution · **HIGH**

- **No `LICENSE` file anywhere** [verified] — `package.json` has only
  `"private": true`, no `license` field, and `README.md` has no license section.
  The repo redistributes third-party data under two attribution/share-alike
  regimes (Pitoski CC BY 4.0, boundaries ODbL). ODbL §4.4 additionally requires a
  statement of the licence under which the *derived* database
  (`geo_jls.json`) is redistributed. This is the one omission a downstream reuser
  cannot work around.
- **ODbL is named on one surface of six** [reported, unverified]:

| Surface | Says | Names ODbL? |
|---|---|---|
| JLS legend, `Legend.tsx:116` | "Granice: OSM/ODbL." | ✓ |
| Footer, `App.tsx:271` | "granice: geoBoundaries/OSM." | ✗ |
| **PNG + SVG export**, `exportPng.ts:126` | "granice: geoBoundaries/OSM" | ✗ |
| `README.md:45` | "Boundaries: geoBoundaries/OSM." | ✗ |
| `README.md:7` | "boundaries OSM/ODbL" | ✓ (contradicts `:45`) |
| `index.html:24` noscript | Pitoski CC BY only | ✗ |

  Worse, **the export misattributes the JLS map**: `geo_jls.json` comes from a raw
  Overpass `admin_level=7` pull (`tools/pipeline/geo_jls.cjs:5-10`), *not* from
  geoBoundaries — geoBoundaries is the **county** source. A jmap export therefore
  carries a boundary attribution that is both wrong and licence-free, against
  CLAUDE.md's own invariant that the export "is the artifact that leaves the app —
  there is no footnote to click through to". `verify.cjs:213` asserts
  `svgDoc.includes('geoBoundaries')`, which is precisely the wrong string for jmap.

## 4.4 The white/ink flip is wrong for the indigo ramp · **MEDIUM** [reported, unverified]

`MatrixView.tsx:181` uses one threshold (`0.85·m`) for all three ramps, at
`fontSize ≤ 8.5` — small text, 4.5:1 required. Measured by the thread:

| ramp | t | cell | ink | white | app paints |
|---|---|---|---|---|---|
| in (indigo) | 0.70 | `#657aa6` | **3.56** | 4.30 | ink |
| in | 0.85 | `#456497` | **2.56** | 5.96 | ink |
| net (div, +) | 0.75 | `#5b73a1` | **3.21** | 4.45 | ink |
| out (vermilion) | 0.80 | `#c75d44` | **3.70** | **4.14** | ink |

Under **Dolasci** and on the positive half of **Neto**, in-cell numbers from
≈0.6·m to 0.85·m are ink at 2.5–3.6:1. There is also a band on the vermilion arm
(t ≈ 0.70–0.84) where *neither* colour reaches 4.5:1 — that one needs the ramp
endpoints adjusted, not just the threshold. Numbers only render at `cell >= 22`,
so this is a wide-viewport failure. None of the five contrast constants in
CLAUDE.md is asserted anywhere in `verify.cjs`.

---

# §5 — Verify-suite quality

The suite is honest and well-maintained — the stated **166 checks is exactly what
runs**, and 14 of 15 ground-truth rows reproduce exactly from the shipped JSON.
The residue:

## 5.1 The browser is not closed on failure · **HIGH**

`verify.cjs:1371-1375` has no `try/finally`. Any thrown error — and *most* DOM
regressions surface here as a throw, because `querySelector(...).textContent`
throws rather than returning falsy — lands in the outer `.catch(e => process.exit(2))`
**without `browser.close()` and without `srv.close()`**, orphaning a Chromium
process and leaking a listening socket. On Windows this accumulates across runs.
Exit codes are otherwise correct (0/1/2).

## 5.2 Vacuous and flaky assertions

| # | Location | Problem | Sev |
|---|---|---|---|
| V1 | `:1327` | `t.includes('0')` is **tautological** — the glossary text contains `2021.–2025.`, `−4.500`, `1.4`. Asserting a value equals itself | HIGH |
| V2 | `:609-622`, `:744-757` | `overlaps()`/`allOv()` filter to `position === 'absolute'`. If overlays become static or `display:none`, `els` shrinks to 0 and **the check passes having compared nothing**. At 390 px the sweep realistically compares 3 pairs | HIGH |
| V3 | `:745` | `#storyBar` is in the sweep list but `.storybar` has no `position` declaration → `static` → filtered out **every iteration**. A permanently dead entry that reads as coverage of the exact regression the sweep was built for | MED |
| V4 | `:726-734` | the `reach` probe `continue`s on a missing element and never asserts how many it probed. Rename `#ageHd` and it passes vacuously. `offsetParent` is also null for `position:fixed`, so fixed overlays silently drop out | MED |
| V5 | `:917-918` | `img.onerror = r` — the same resolver as `onload`; a failed rasterisation resolves silently | MED |
| V6 | `:1373` | **the check count is never asserted.** Three docs already drifted on this number once; a deleted `ck()` silently reduces the total and re-opens that drift | MED |
| V7 | `:63`, `:265` | `waitUntil:'networkidle0'` waits on **live Google Fonts**. Four checks are font-metric-dependent (header height, tick clipping, exported-title overrun, PNG dims), so a CI box with no egress silently tests the Arial Narrow fallback | HIGH |
| V8 | `:265` | `fresh()` uses a fixed `settle(400)`, but `geo_jls.json` (464 kB) loads via a dynamic `import()` fired from a `useEffect` — i.e. *after* `networkidle0` resolves. Every `#v=jmap` check races a 464 kB chunk against 400 ms. **Most likely flake in the suite** | HIGH |
| V9 | 41 × `settle(ms)` | values 60–700 ms, none condition-based, tuned to one machine | MED |
| V10 | `:81-260` | one ~40-check chain with no `fresh()`; several checks only hold because of what an earlier one clicked | MED |

## 5.3 Coverage gaps, ranked by "would have caught a real bug"

1. **`den` (Vrijednosti) has zero coverage.** No hits for `segDen`, `d=rel11`,
   `d=relest` anywhere in `verify.cjs`. Untested: `peAt()`'s gap-filling walk,
   `denom()`, `RDOM`, the `%` rail formatting, `denName`, the `den` clause in
   `exportDesc`, and the `%` branch of `countyAria`. **An entire three-state
   segment group and a whole numeric formatting path.**
2. **Four of five `decodeHash` repairs are never reached from a URL.** Only the
   cum/2011 clamp is tested (three times). Specifically untested: `#v=flow` with
   no `s=` — and without that repair `Tooltip.tsx:52` does `D[S.sel!].n` on `null`
   and throws.
3. **The play loop never actually plays.** Checks toggle `aria-pressed` only.
   Nothing asserts the year advances, that it stops at the end, that it clears
   `S.story` per step, or the 650→1400 ms reduced-motion swap.
4. **`prefers-reduced-motion` has zero coverage** — one `emulateMediaFeatures` line.
5. **`#thr` is never dragged**; the abs↔rel round-trip through React's controlled
   input is hand-checked only.
6. **`#citzClamp` / `#zemFixed` untested** — the honesty message shown when the
   scrubber sits outside 2021–2025 is exactly the class House Rule 3 exists for.
7. **Export covers 2 of ~12 states** — no klas, reg or jmap export. The jmap
   export is where the wrong-attribution bug (§4.3) lives.
8. **`#jloading` never asserted** — the honest UI for v2.0.4's own optimisation.
9. **No width between 390 and 960** is ever visited, including the 560 px
   two-column control breakpoint.

## 5.4 Documented invariants with no assertion

Most load-bearing: **`.paircard` is `position:static` below 960 px** has **no
assertion at all**, and the two overlay sweeps *filter out* static elements — so a
regression to floating would be included in the sweep and caught only if it
happened to overlap, while the correct behaviour is silently dropped. Also
unasserted or partial: `PageUp` on `#spark` (implemented, never pressed); the `−`
zoom key (never dispatched); Escape on `jls`/`age`/`help`/`pair` (only `citz` and
the detail card are tested); the ≤900 px `panel-open` legend hiding; two of three
`legendNote` export branches; the matrix-vs-chipdock placement search at any
width or panel other than 1440/citz.

## 5.5 `serve()` is path-traversal-open · **LOW**

`verify.cjs:25-27` joins `decodeURIComponent(req.url)` with no containment check.
Localhost-only and test-scoped, but one `path.resolve(...).startsWith(dir)` guard
closes it.

---

# §6 — Pipeline and provenance

**House Rule 4 is being honoured in practice** — the thread re-derived the
pipeline's own invariants from the committed JSON and found **no sign of
hand-editing anywhere**: `odm.json`'s 2018 layer is cell-exact against
`ref/od2018.json` (420/420), row margins are exact for all 28 × 21 (588/588),
`geo_jls.json` sums Σi = Σo = 57.465 across 556 features, and `demo.json` /
`citizen.json` reproduce every documented percentage.

## 6.1 House Rule 4's blanket claim is false for 3 of 8 payloads · **HIGH**

`CLAUDE.md:96-97` says "`src/data/*.json` are outputs of `tools/pipeline/` — edit
the pipeline, rerun". What the scripts actually write:

| File | Written by | Regenerable here? |
|---|---|---|
| `odm.json`, `citizen.json`, `demo.json` | `ipf.py`, `parse_cit.py`, `parse_demo.py` | ✓ |
| `jls_drill.json`, `geo_jls.json` | `parse_jls.py`, `geo_jls.cjs` | ⚠ needs the documented 31 MB `ext/` download |
| **`atlas_data2.json`** | `parse_nat.py:55` — but it only **patches `nat`** into an existing file | ✗ `ii/oi/ie/oe`, `pe`, `p` have **no committed parser** |
| **`geo_counties.json`** | nothing | ✗ mapshaper CLI line, documented only in the handoff |
| **`geo_regions5.json`** | nothing | ✗ same |

`tools/pipeline/README.md:37-40` is *honest* about this, so the drift is CLAUDE.md
overstating. Practical consequence: **a DZS revision of sheet 7.4.2 cannot be
absorbed by "edit the pipeline, rerun"** — the parser does not exist in this repo.

## 6.2 The handoff's every path is stale · **MEDIUM**

`CLAUDE.md:5-7` sends newcomers to `reference/HANDOFF-v4-singlefile.md` for
provenance, but its file map still says `src/data/hrv21_fixed.geojson`,
`src/data/raw/*.xlsx`, `src/ipf.py`, `src/verify.js` (32 checks) — none of which
exist at those paths. A five-line "v4 → React port" mapping table in
`tools/pipeline/README.md` closes it. Same class: every Python docstring cites the
pre-port paths while the code opens the correct ones.

## 6.3 No `engines` field · **MEDIUM**

`vite@8` requires `node ^20.19 || >=22.12`. `package.json` declares no `engines`
and no doc states a floor; a newcomer on Node 18 gets an opaque build failure.

---

# §7 — Known-open, carried forward

`REVIEW-2026-07-26-pass2.md:475-479` records finding 27 as still open: **in Tokovi,
clicking a new county on the map re-hubs but leaves the corridor card open, so it
silently re-points at a pair the user never chose** (`App.tsx:86` clears `pair`
only when `s.pair === iso`). It is live, it is recorded only in a dated review
file, CLAUDE.md has no "known open" section, and `verify.cjs` asserts nothing
either way. A known honesty-adjacent defect with no home. Whichever way it is
resolved, it should end up in CLAUDE.md rather than in a review archive.

---

# §8 — What was NOT reviewed

Stated plainly, because House Rule 1's whole point is not claiming coverage that
does not exist:

- **CSS / layout / responsive / visual polish** — no thread completed. The
  unmeasured viewport bands (320, 360, 414, 480, 600, 640, 768, 820, 900, 1024,
  1180, 1280, 1920, 2560, landscape phone, short viewports), print styles,
  forced-colors mode, and 200 % text zoom are all still unexamined.
- **React render performance and bundle composition beyond the entry-chunk
  figure** — no measurement of per-hover render cost, listener hygiene, or
  memoisation correctness this pass.
- **The state machine and permalink codec** got my own read (§1.2, §1.3) but not
  the systematic fuzz that was commissioned: round-trip `encodeHash(decodeHash(x))`,
  hostile input (NaN, out-of-range, injected values), repair ordering
  dependencies, and play-loop/popstate interaction remain unexplored.
- **The honesty-label matrix across all six views × cumulative × panel-open ×
  export** — the systematic per-surface audit did not run. §4.3 and §4.4 are
  fragments of it.

Re-running those four threads is the obvious next step, and they are independent
of every fix listed above.

---

# Suggested priority

| # | Finding | § |
|---|---|---|
| 1 | Ground-truth table names the wrong two counties | 4.1 |
| 2 | Geo chunk failure is permanent, unhandled, and shows a spinner forever | 1.3 |
| 3 | Space on a focused county starts the animation | 2.1 |
| 4 | Focus rings 1.02–2.53:1 on the data surfaces *(re-measure first)* | 2.2 |
| 5 | No LICENSE; ODbL named on 1 of 6 surfaces; export misattributes JLS boundaries | 4.3 |
| 6 | `verify.cjs` leaks Chromium + socket on any failure | 5.1 |
| 7 | Glossary covers two tabbable controls; dialog has no focus management | 2.3, 2.4 |
| 8 | Alt+← steps the year *and* navigates back | 2.7 |
| 9 | `den` has zero test coverage; 4 of 5 `decodeHash` repairs untested | 5.3 |
| 10 | `.paircard` static invariant untested — and the sweep excludes static elements | 5.4 |
| 11 | Suite depends on live Google Fonts; jmap checks race a 464 kB chunk | 5.2 |
| 12 | House Rule 4 false for three payloads; handoff paths all stale | 6.1, 6.2 |
| 13 | SVG export failure lights the PNG button | 1.1 |
| 14 | `storyHolds()` ≠ `up()` despite the docs saying they are one definition | 1.2 |
