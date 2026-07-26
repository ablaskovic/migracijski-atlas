# Review pass 2 — Migracijski atlas · found and fixed

Date: 2026-07-26 · reviewed at `d6b6022` (v2.0.3) · **fixed in v2.0.4**
Method: full source read (3.985 lines) + four scripted puppeteer probes against the
production build at 390 / 900 / 1024 / 1100 / 1150 / 1280 / 1366 / 1440 px, plus a
`file://` boot test. Baseline re-run first: **`npm run verify` → ALL 134 CHECKS PASS**,
`npm run lint` clean, `npm run typecheck` clean.

Every bracketed value below is probe output, not a description. This pass looks for
what the 134 checks and the v2.0.3 review could not see; findings that repeat
`UX-REVIEW-2026-07-26.md` are not restated.

**Suite: 134 → 166 checks, all green.** Every finding below is now pinned by a
named check in the `v2.0.4` block at the end of `scripts/verify.cjs`, and each was
re-measured with the *original* probe after the fix — not only with the check
written alongside it. One item is deliberately not done; see the last section.

> **Correction to this report as first written.** Finding 12 claimed "same
> structure applies to `#v=jmap`". It does not: the JLS rail already fills from
> `jmapScale(dir)`, the same global scale the map uses, and only the *bar length*
> is normalised to the visible rows. That was an unverified extrapolation from the
> matrix case. Only the matrix rail was wrong, and only the matrix rail changed.

---

## P1 — a permalink can boot the atlas into a silent, wrong, shareable zero state

### 1. `decodeHash`'s cum/2011 clamp tests the decoded patch, not the state that boots

[hash.ts:71](src/lib/hash.ts#L71) repairs the pre-2011 cumulative invariant with:

```ts
if ((o.view === 'klas' || o.cum) && (o.yi ?? ix2011) < ix2011) o.yi = ix2011;
```

`o.cum` is only set when the link carries `c=` ([hash.ts:49](src/lib/hash.ts#L49)).
Omit it and `o.cum` is `undefined` — falsy — so the clamp never fires, while the
state that actually boots is `{...BASE, ...o}` and **`BASE.cum` is `true`**
([state.ts:10](src/lib/state.ts#L10)).

This is structurally the same defect as the story guard fixed in v2.0.3 (which was
corrected to compare against `{...BASE, ...decoded}` four lines below, at
[hash.ts:87](src/lib/hash.ts#L87)) — the repair block above it never got the same
treatment.

Measured, booting `#v=saldo&y=2005`:

| | value |
|---|---|
| rail, all 21 counties | `0` [`allZero: true`] |
| Grad Zagreb fill | `rgb(241,238,233)` — the neutral zero colour |
| `.cnt` aria-label | `Grad Zagreb: migracijski saldo 0 · 2011.–2005.` |
| **tooltip, same county, same moment** | `migracije · 2011.–2005. +2.139 (+0,3 % pop. 2011.)` |
| big-year sub / rail title | `2011.–2005.` |
| legend | still declares the full `−44.383 … +44.383` domain |
| `#srLive` | `2005. · saldo · kumulativno` |

Three problems compound:

1. **The atlas renders a blank country and says nothing.** `val()` returns 0 for
   `yi < IX2011` ([metrics.ts:106](src/lib/metrics.ts#L106)), so every county, every
   rail row and every aria-label reads 0.
2. **The tooltip contradicts the map.** `tipHTML` clamps with
   `Math.max(S.yi, IX2011)` ([Tooltip.tsx:58](src/components/Tooltip.tsx#L58)) and so
   reports 2011's real numbers under a `2011.–2005.` heading. The map says 0, the
   tooltip says +2.139, both labelled with an impossible period. This breaks the
   documented family of invariants ("the rail row, the cell it lights, its tooltip …
   carry one sign") in a way no current check covers.
3. **The app canonicalises the broken link.** `encodeHash` always emits `c`
   ([hash.ts:21](src/lib/hash.ts#L21)), so the URL is immediately rewritten to
   `#v=saldo&c=1&y=2005` — a complete, well-formed, permanently reproducible link to
   the zero state. A hand-shortened or truncated URL becomes a shareable artifact.

Reproduced identically on `#v=saldo&f=nat&y=2003` and `#v=reg&y=2000`. Any hash with
a pre-2011 `y` and no `c` hits it; `#y=2005` alone does too (both `o.view` and
`o.cum` undefined).

*Not reachable through the UI* — `scrubTo` clamps ([Scrubber.tsx:48](src/components/Scrubber.tsx#L48))
and so do the arrow keys — which is exactly why it survived 134 checks.

---

## P2 — honesty labels are wrong or missing in two layers

### 2. Matrix cell labels state the wrong direction for two of three Smjer values

[MatrixView.tsx:150](src/components/MatrixView.tsx#L150) builds every cell's
accessible name as a fixed `a → b`, while the value comes from `mxCell(a, b, S.dir, …)`,
whose direction flips with Smjer ([metrics.ts:174-178](src/lib/metrics.ts#L174-L178)).

Measured on cell `[data-a="HR-21"][data-b="HR-01"]`, 2018:

| Smjer | aria-label | what the number is |
|---|---|---|
| Odlasci | `Grad Zagreb → Zagrebačka: 2.311` | ✅ correct |
| **Dolasci** | `Grad Zagreb → Zagrebačka: 1.977` | ❌ 1.977 is **Zagrebačka → Grad Zagreb** |
| **Neto** | `Grad Zagreb → Zagrebačka: −334` | ❌ a net balance stated as a directed flow |

This is the defect finding #6 fixed for the rail, still live in the AT layer: a
screen-reader user is told a false fact about the data in 2 of 3 modes. The visible
tooltip gets it right ([Tooltip.tsx:39-42](src/components/Tooltip.tsx#L39-L42)) — but
`#tip` is now `aria-hidden`, so the label is the *only* thing AT sees.

### 3. The exported PNG/SVG loses the structural-estimate note and contradicts its own title

`legendSpec` badges every flow-ish export with `flowBadge(S.yi, S.cum)`
([exportPng.ts:90](src/lib/exportPng.ts#L90)), which never returns the cumulative
wording — while `exportDesc` in the same image does
([metrics.ts:250](src/lib/metrics.ts#L250)). Measured on three cumulative states:

| state | export title | export legend badge | on-screen legend carries |
|---|---|---|---|
| `#v=flow&s=HR-21&dir=net&c=1&y=2024` | `… · KUMULATIVNA PROCJENA` | `· procjena (IPF)` | "Neto parova je strukturna procjena." |
| `#v=mx&dir=net&c=1&y=2024` | `… · KUMULATIVNA PROCJENA` | `· procjena (IPF)` | "Neto parova je strukturna procjena." |
| `#v=flow&s=HR-21&dir=out&c=1&y=2024` | `… · KUMULATIVNA PROCJENA` | `· procjena (IPF)` | — |

Two failures:

- **One image, two different honesty labels** for the same data.
- `strukturna` appears **nowhere** in the exported document [`hasStructural: false`
  on all three]. House rule 3 says "pair nets carry the extra structural-estimate
  note" — and the export is precisely the artifact that leaves the app and ends up
  in a paper, i.e. the one place the caveat cannot be recovered by clicking around.

Verify's export checks assert self-containment and dimensions, never wording parity
with the screen.

### 4. At 390 px the open glossary makes the play button unclickable

`.helpcard` is `z-index:9` ([index.css:257](src/index.css#L257)); the mobile scrubber
is `position:fixed; z-index:8` ([index.css:359](src/index.css#L359)). Measured at
390×844 with `#helpCard` open:

```
#helpCard   top 561  bottom 1152  (viewport height 844)
#scrubBox   top 721  bottom  844
overlap     46.002 px²
elementFromPoint(centre of #play) → DIV.help-p     isPlayOrChild: false
```

The identical failure mode as finding #3 of the last review (banner over the Dob i
spol chip), on a surface the sweeps do not reach: the `elementFromPoint` probe covers
chip headers and close buttons at 960–1600 px, and the 390 px block probes map
overlays against each other — neither looks at the scrubber. The glossary's own
bottom (1152) is also 308 px below the viewport.

### 5. Keyboard focus on a county is erased by an unrelated mouse hover

`.cnt` has `outline:none` and relies on `.hl` for its focus ring
([index.css:67](src/index.css#L67)), but `.hl` is a single shared value driven by
hover *and* focus through the same setter
([MapView.tsx:263-265](src/components/MapView.tsx#L263-L265)). Clean repro:

| step | `document.activeElement` | class | stroke |
|---|---|---|---|
| focus HR-18 | HR-18 | `cnt hl` | `rgb(32,38,43)` 1.6px ✅ |
| mouse hovers HR-14 | **still HR-18** | `cnt` | — |
| mouse leaves the map | **still HR-18** | `cnt` | `rgb(255,255,255)` 0.8px, `outline:none` |

The focused element ends with **no visible focus indicator at all** — WCAG 2.4.7.
CLAUDE.md's "Checked and already correct" list claims this indicator works; the claim
holds only while the pointer never touches another county. `.jl` and `.mxc` are
unaffected — both have their own `:focus` stroke rules
([index.css:290](src/index.css#L290), [index.css:299](src/index.css#L299)); `.cnt`
alone opted out.

### 6. A stale county tooltip survives into the JLS map and the matrix

`show` is `!!S.hl && !COARSE` regardless of view
([Tooltip.tsx:92](src/components/Tooltip.tsx#L92)), and `setView` never clears `hl`.
Measured — focus a county with the keyboard (no pointer at all), then click *Prikaz →
JLS 2018.*:

```
tipShown: true
text: "Istarska  doseljeni iz žup. +1.482  odseljeni u žup. −996 … saldo vanjske +913 …"
```

A county-level saldo tooltip sits on a map of 556 municipalities. The same path
reaches the matrix, where `tipHTML` falls through the `S.view === 'mx' && S.pairHl`
branch into the generic county branch.

### 7. Seven segment groups have no accessible name

Every `.seg` is a bare `<div>` ([Header.tsx:15](src/components/Header.tsx#L15)); the
visible `.ctrl-lab` next to it is not associated. Measured:

```
segView   role: null  aria-label: null  aria-labelledby: null   visible label "Prikaz"
segFlow   role: null  aria-label: null  aria-labelledby: null   visible label "Sastavnica"
segDen    role: null  aria-label: null  aria-labelledby: null   visible label "Vrijednosti"
… (all 7 identical)
```

A screen-reader user hears `"Saldo, pressed"` / `"Migracije, not pressed"` with no
indication of which of seven groups they are in. `#railList` likewise has no
`aria-labelledby` pointing at `#railLab`.

---

## P3

### 8. The JLS-view scrubber is the "dimmed, not disabled" pattern the house rules ban

`.scrub.inert .scrub-chart{opacity:.35;pointer-events:none}`
([index.css:114](src/index.css#L114)) — the exact construction CLAUDE.md forbids and
that was fixed twice already (segment groups, then the play button). It escapes the
letter of the invariant only because `tabIndex` is `-1`. Measured in `#v=jmap`:

```
role: "slider"   aria-valuenow: "2018"   aria-disabled: null
tabindex: "-1"   parent opacity: 0.35    parent pointer-events: "none"
(#play.disabled: true — correctly handled)
```

AT browsing by control still finds an operable-looking slider that cannot be operated.

### 9. Dead panel flags in the permalink hide the legend on mobile and eat an Escape

`decodeHash` accepts `jl=`/`cz=`/`ag=` in any view ([hash.ts:62-64](src/lib/hash.ts#L62-L64))
without checking whether that panel can exist there. `#v=saldo&c=1&y=2024&jl=1`:

```
1440 px  body.panel-open: true   #jcard display: none   #jcardHd box: 0x0
 390 px  body.panel-open: true   #legend display: none  (no panel is open)
```

At 390 px `body.panel-open .legend{display:none}` ([index.css:343](src/index.css#L343))
hides the colour key with nothing on screen to justify it. And Escape is consumed by
the invisible panel ([App.tsx:190-193](src/App.tsx#L190-L193)), which then calls
`focusSoon('#jcardHd')` on a `display:none` element:

```
after Escape → hash "#v=saldo&c=1&y=2024"   document.activeElement: BODY
```

Focus dropped to `<body>` — the defect finding #10 of the last review set out to
eliminate everywhere.

### 10. The exported SVG title overruns the period; the PNG shrinks and the SVG does not

`exportPNG` measures and shrinks the title from 23px down to 13px until it fits
([exportPng.ts:126-131](src/lib/exportPng.ts#L126-L131)). `exportSVG` emits a fixed
`font-size="21"` with no equivalent ([exportPng.ts:218](src/lib/exportPng.ts#L218)).
Measured on `#v=flow&s=HR-08&dir=net&c=1&y=2024`:

| viewport | map width | title end | period start | overrun |
|---|---|---|---|---|
| 1440 | 1148 | 682 | 1025 | — |
| 1366 | 1074 | 682 | 951 | — |
| 1150 | 858 | 682 | 735 | — |
| 1100 | 808 | 682 | 685 | −3 px (grazing) |
| **1024** | **732** | **682** | **609** | **+73 px — collides** |

`NETO TOKOVI: PRIMORSKO-GORANSKA ↔ PARTNERI · KUMULATIVNA PROCJENA` runs straight
through `2011.–2024.` on a 1024×768 browser window. Longest county names in the flow
view are the trigger; PNG at the same viewport is fine.

### 11. Space on an inert rail row starts playback

Rail rows opt out of key handling when they cannot activate
([Rail.tsx:164](src/components/Rail.tsx#L164)), so the event reaches App's global
handler, which only exempts `BUTTON`/`A`/`role=button`/`role=gridcell`
([App.tsx:221-222](src/App.tsx#L221-L222)). Measured in `#v=reg`, first region row
focused:

```
row: DIV  role: null  tabIndex: 0  aria-label "Zagrebačka regija +55.281"
Space →  #play aria-pressed: false → true
```

The stated invariant is "Space with a control focused activates it; Space on the body
toggles play". A focused rail row is a control, and it neither activates nor stays
neutral. (In `jmap` the handler returns early, so the same row does nothing there —
inconsistent between views.)

### 12. The matrix rail and the matrix grid paint the same corridor two different colours

`Rail` normalises to the top-20 maximum (`m = rows[0]?.v`,
[Rail.tsx:83](src/components/Rail.tsx#L83)); the grid normalises to `mxMax`, the whole
network across all years ([MatrixView.tsx:57](src/components/MatrixView.tsx#L57)).
Measured on `#v=mx&c=0&y=2018&dir=out`, top corridor `Grad Zagreb → Zagrebačka 2.311`:

```
rail bar    rgb(181, 52, 31)   = #B5341F, the extreme end of the ramp
grid cell   rgb(214,131,107)   ≈ 60 % of the ramp
legend      "0 … 3.868"        — describes the grid's scale only
```

Sign is consistent (the v2.0.3 invariant holds), intensity is not, and the only key on
screen explains one of the two encodings. Same structure applies to `#v=jmap`.

### 13. Nalaz invalidation is asymmetric by accident of defensive patch keys

`up()` invalidates on `STORY_KEYS` **plus the preset's own patch keys**
([App.tsx:40](src/App.tsx#L40)) — correct for Nalaz 4, whose claim *is* about a panel.
But several presets carry defensive `panel: false` entries
([stories.ts:48](src/lib/stories.ts#L48)), which silently enrols them. Measured —
apply each Nalaz, then open the Dob i spol chip:

| Nalaz | caption survives? |
|---|---|
| 1, 2, 3, 5, 6 | ✅ yes |
| **7** ("Gradovi gube, prstenovi rastu") | ❌ **caption and `st=` dropped** |

Nalaz 7's caption says nothing about any panel; it dies only because its patch lists
`age: false`. Which findings are panel-sensitive is currently an artifact of how each
patch was written, not of what each caption claims.

### 14. Inert rail rows are focusable `<div>`s with an `aria-label` and no role

[Rail.tsx:151](src/components/Rail.tsx#L151) drops `role="button"` for Regije/JLS rows
(correct — that was the v2.0.3 fix) but keeps `tabIndex={0}` + `aria-label`:

```
{ tag: "DIV", role: null, tab: 0, ariaLabel: "Zagrebačka regija +55.281" }
```

`aria-label` on a generic element with no role is not reliably exposed by AT. It
degrades gracefully here (the visible text matches the label), but the row is a tab
stop announced by an attribute the spec does not guarantee will be read.

### 15. The detail card calls mig + prirodno "uk." with none of the caveat

[DetailCard.tsx:57](src/components/DetailCard.tsx#L57) renders `uk.` for
`ints + exts + nats`. The tooltip deliberately avoids that word and adds a hint
([Tooltip.tsx:72-75](src/components/Tooltip.tsx#L72-L75)), the glossary spells it out
([HelpPanel.tsx:42](src/components/HelpPanel.tsx#L42)), and CLAUDE.md's house rule 3
names it explicitly. "uk." reads as *ukupna promjena broja stanovnika* — the one
reading every other surface in the app is careful to deny.

### 16. Map zoom and pan are pointer-only

Measured: `#map` has no `tabindex`, is not focusable, and no key changes the
transform [`before` and `after` both `translate(0,0) scale(1)`; `#zoomRst` never
mounts]. The whole zoom feature — documented in the glossary as "Kotačić miša zumira
kartu i matricu" — has no keyboard equivalent (WCAG 2.1.1). The label-visibility rule
is tied to zoom too ([MapView.tsx:174](src/components/MapView.tsx#L174)), so small
counties' names are unreachable without a mouse. Partly mitigated: the rail carries
the same values.

### 17. The matrix diagonal explains itself only to a pointer

`.mxd` has no `tabindex` and no `role` [`diagTabbable: false`, `role: null`]; the
roving tabindex skips it by design ([MatrixView.tsx:82](src/components/MatrixView.tsx#L82)).
The v2.0.3 fix gave the diagonal a voice ("Selidbe unutar iste županije nisu dio
međužupanijske matrice") — a keyboard user still cannot hear it.

---

## Optimizations (no defect, measured cost)

| # | Finding | Numbers |
|---|---|---|
| 18 | **One 1 MB chunk, half of it for two secondary views.** `geo_jls.json` (474.951 B — 47 % of the raw bundle) serves only *JLS 2018.*; `geo_regions5.json` (67.673 B) only *Regije*. Both are static imports in [metrics.ts:20-21](src/lib/metrics.ts#L20-L21), so both load before first paint of the default Saldo view. | bundle `1.019.138 B raw / 294.756 B gzip`, single chunk; ~540 KB is deferrable |
| 19 | **`Rail` builds a 556-entry `Map` on every render, in every view.** [Rail.tsx:105](src/components/Rail.tsx#L105) is unconditional but `JNAME` is read only in `jmap`. Rail re-renders on every hover. | 556 allocations per hover frame |
| 20 | **`MapView.fill()` constructs a fresh d3 scale per county.** [MapView.tsx:115-125](src/components/MapView.tsx#L115-L125) calls `divScale`/`seqScale` inside the per-county function; `Rail` correctly hoists its equivalent ([Rail.tsx:94](src/components/Rail.tsx#L94)). | 21 scale objects per render |
| 21 | **`Legend.markPct()` evaluated 2–3× per render**, once for the null test and again for the value ([Legend.tsx:101](src/components/Legend.tsx#L101), [Legend.tsx:122](src/components/Legend.tsx#L122), [Legend.tsx:151](src/components/Legend.tsx#L151)). In `jmap` each call is a linear `find` over 556 features. | ~1.100 extra feature comparisons per render |
| — | Aggregate effect, measured: 60 simulated county hovers | **8,18 ms per hover-driven re-render** (~½ of a 60 Hz frame) |
| 22 | **`zoomAt` is dead code** — defined at [useZoom.ts:47](src/lib/useZoom.ts#L47), returned at [useZoom.ts:137](src/lib/useZoom.ts#L137), consumed nowhere. (Would be the natural home for finding #16.) | — |
| 23 | `src/data/od2018.json` is a **pipeline input**, not an app payload — nothing in `src/` imports it. It sits in the directory CLAUDE.md describes as generated app payloads. | 4.794 B, not bundled |

---

## Documentation

### 24. Three documents claim three different check counts, none of them right

| source | claims | actual |
|---|---|---|
| `npm run verify` | — | **134** |
| [CLAUDE.md:24](CLAUDE.md#L24) and [CLAUDE.md:32](CLAUDE.md#L32) | 133 | ✗ |
| [CLAUDE.md:130](CLAUDE.md#L130) (architecture block) | 106 | ✗ |
| [README.md](README.md) quickstart | 67 | ✗ |
| `UX-REVIEW-2026-07-26.md` | 134 | ✓ |

CLAUDE.md also disagrees with itself between line 24 and line 130.

### 25. The build does not work from `file://`, contrary to the comment that says it does

[vite.config.ts:3](vite.config.ts#L3): *"base './' so the production build also works
from file:// or any subpath"*. The subpath half is true. The `file://` half is not —
ES modules are CORS-blocked from a `null` origin. Measured:

```
file:///…/dist/index.html →  { rootChildren: 0, hasMap: false }
"Access to script at 'file:///…/index-RET_25Kh.js' from origin 'null'
 has been blocked by CORS policy"  (same for the stylesheet)
```

A blank page. [CLAUDE.md:31](CLAUDE.md#L31) repeats a softer version of the claim.

### 26. `index.html` has no sharing metadata, on a tool whose main feature is shareable links

[index.html](index.html) carries `lang="hr"`, viewport, title and favicon — and no
`<meta name="description">`, no Open Graph or Twitter card tags. Every permalink the
atlas produces (its headline v2.0.0 feature) renders as a bare URL when pasted into
Slack, a mail client or a social post. A static OG image plus a description would
cost four lines.

Also: fonts load from `fonts.googleapis.com` at runtime. That is a third-party network
dependency on the critical path (the app degrades to Arial Narrow / system-ui without
it) and, for a Croatian public-sector-adjacent research tool, a GDPR consideration —
Google Fonts transmits visitor IPs to Google. Self-hosting the four woff2 files removes
both. No `<noscript>` fallback either.

### 27. The one item the last review left open is still open

`UX-REVIEW-2026-07-26.md` § "Known, unchanged": in Tokovi, clicking a new county on
the map re-hubs but leaves the corridor card open, so it silently re-points at a pair
the user never chose. Confirmed still present at `d6b6022`. Flagged there as a design
question — it needs a decision, not a re-discovery.

---

## Where the 134 checks cannot see

Each finding above maps to a gap in the protocol, not to carelessness:

1. **`decodeHash` is only tested with complete, app-generated links.** The story guard
   got a "truncated link" check in v2.0.3; the invariant-repair block above it did not.
   → a check that every clamp compares against `{...BASE, ...decoded}`, and a fuzz over
   hashes with keys omitted.
2. **Nothing compares an aria-label against the number it names.** Cell labels, rail
   labels and county labels are asserted for *presence* and for *containing* a value,
   never for stating the right direction under each Smjer.
3. **Nothing compares the export's wording to the screen's.** Export checks cover
   dimensions, self-containment and a pixel sample.
4. **The `elementFromPoint` sweep covers chip headers and close buttons at 960–1600 px.**
   It does not cover the play button, the scrubber, the export buttons or the reset —
   and it does not run at 390 px, which is where the glossary defect lives.
5. **Focus indicators are asserted statically, never after pointer interference.**
   The `.cnt` ring passes when checked immediately after `focus()`.
6. **`hl` / `pairHl` / `jlsHl` are never asserted to be empty after a view change.**
7. **The exported SVG is measured at 1440 only.** The title-overrun band is ≲1100 px.

## What was fixed, and what it measures now

Re-run of the **original** probes against the v2.0.4 build (not the checks written
with the fixes):

| # | Was | Is |
|---|---|---|
| 1 | `#v=saldo&y=2005` → rail all `0`, tooltip `+2.139`, sub `2011.–2005.` | repaired to `#v=saldo&c=1&y=2011`; rail `+2.139`, aria `+2.139`, tooltip `+2.139`, sub `2011.–2011.` — all four agree |
| 2 | Dolasci cell label `Grad Zagreb → Zagrebačka: 1.977` | `Zagrebačka → Grad Zagreb: 1.977`; Neto now `Grad Zagreb ↔ Zagrebačka: neto −334 za Grad Zagreb` |
| 3 | export badge `· procjena (IPF)` under a `KUMULATIVNA PROCJENA` title, no structural note | badge `· kumulativna procjena`; `Neto parova je strukturna procjena.` present in both formats |
| 4 | 390 px: glossary ↔ scrubber overlap 46.002 px², `elementFromPoint(#play)` → `DIV.help-p` | overlap **0**, glossary 56→700 inside an 844 px viewport, `elementFromPoint(#play)` → `isPlayOrChild: true` |
| 5 | focused county after an unrelated hover: `stroke #fff 0.8px`, no indicator | `stroke rgb(32,38,43) 2.2px` dashed, still `document.activeElement` |
| 6 | county tooltip visible over the JLS map after a view switch | `tipShown: false` |
| 7 | 7 segment groups, no role, no name | 7 × `role="group"` with a resolved name each; `#railList` named by `railLab railYear` |
| 8 | `#spark` inert via `opacity + pointer-events:none`, no `aria-disabled` | handlers detached, `aria-disabled="true"`, `pointer-events` back to normal |
| 9 | `#jl=1` outside Tokovi → `panel-open`, legend `display:none` at 390 | flag dropped on decode *and* on leaving Tokovi; `panel-open: false`, legend `block` |
| 10 | SVG title overran the period by **+73 px** at a 732 px map | `titleEnd 587 < perStart 609` — shrinks like the PNG |
| 11 | Space on an inert rail row → `#play aria-pressed: false → true` | stays `false` |
| 12 | rail bar `rgb(181,52,31)` vs grid cell `rgb(214,131,107)` | both `rgb(214,131,107)` |
| 13 | Nalaz 7 alone lost its caption when "Dob i spol" opened | all six unrelated presets keep caption **and** `st=`; Nalaz 4 still dies with its own panel |
| 14 | inert rows: focusable `<div>`, `role: null` | `role="img"` + label; JLS rows now name their county too |
| 15 | detail card `uk. +3.678` | `mig.+prir. +3.678` + the caveat line |
| 16 | `+`/`−`/`0` did nothing | `+` → `scale(2.56)`, `#zoomRst` mounts, `0` returns to `scale(1)`; documented in the glossary |
| 17 | `.mxd` `role: null`, unreachable | `role="gridcell"`, named, `tabindex="-1"` — no new tab stop |
| 18 | one 1.019.138 B chunk (294.756 B gz) | entry **492.30 kB / 163.98 kB gz**; `geo_jls` (463.85 kB) and `geo_regions5` (67.63 kB) are separate on-demand chunks |
| 19–21 | 556-entry Map per render; 21 d3 scales per render; `markPct` 2–3× | Map only in `jmap`; one scale per render via `useMemo`; one `markPct` per render via `SeqBar` |
| 22 | `zoomAt` dead | it and the new `zoomBy` back the keyboard zoom; `zoomTo` deduplicates wheel/pinch/keyboard |
| 23 | `od2018.json` in `src/data/` | `tools/pipeline/ref/`, pipeline paths updated |
| 24 | 133 / 106 / 67 checks claimed | 166 everywhere |
| 25 | `vite.config.ts` claimed `file://` works | corrected in the config, CLAUDE.md and README — measured blank page, CORS |
| 26 | no description, no OG tags, no `noscript` | added, plus `preconnect` for the font host |
| 27 | corridor card silently re-points on a map re-hub | **still open** — see below |

## Deliberately not done

**Self-hosting the fonts.** The report flagged `fonts.googleapis.com` as both a
critical-path dependency and a GDPR consideration. `preconnect` is in, which takes
the DNS+TLS round trip off the path, but vendoring the woff2 files is a change I
should not make blind: it means committing ~200 KB of binary assets whose exact
subsets and licence files I would be guessing at, and it is trivially reversible in
either direction. It needs a deliberate decision plus the actual files.

**Finding 27** (Tokovi: clicking a new county on the map re-hubs but leaves the
corridor card open, re-pointing it at a pair the user did not choose) is unchanged.
`UX-REVIEW-2026-07-26.md` already flagged it as a design question rather than a
defect, and it still is — the two defensible answers (close the card, or keep the
partner) are a product call, not a correctness one.

## Checked and found correct

Re-verified independently this pass, no defect: the abs↔% threshold slider round-trips
its range and value through React's controlled-input reconciliation
[`4500/500–15000` → `1,5/0.5–5` → `4500/500–15000`]; the Escape cascade closes one
layer per press and returns focus correctly with both a chip panel and the detail card
open [`citz → #citzHd`, then `card → path`]; matrix cell size on a clean boot is 19 px,
comfortably over the asserted 12 px floor (an earlier 8 px reading was an artifact of
same-document navigation in my own probe, not the app); `Intl 'hr-HR'` genuinely emits
U+2212 so `fmtI.format` is minus-sign-correct everywhere, including the aria-labels;
matrix Enter/click hubs the correct county under every Smjer; the aria-live status
updates on view change; boot is fast [`DCL 58 ms`, `FCP 112 ms`]; zero console errors.
