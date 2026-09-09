# Migracijski atlas županija — React

Interactive atlas of Croatian county migration 1998–2025. React + Vite port of the
verified single-file D3 atlas (kept in `reference/`, together with the full project
handoff). Data: DZS series 7.4.1.–7.4.3., DZS STAN-2026-2-1 (citizenship + dob/spol +
zemlje), measured 2018 OD matrix, JLS corridors and a 556-municipality 2018 map
(Pitoski et al. 2021, CC BY; boundaries OSM/ODbL), IPF estimates for other years —
all honesty-labeled in the UI.

## V3 and the classic atlas

The default experience is now a separate, dark-by-default **v3**. The version
switch is available in both interfaces: `?version=v3` opens the new explorer and
`?version=v2` opens the classic atlas. Existing v2 hash links keep opening v2.
On compact v2 screens, the switch follows the footer so it stays clear of the
map controls and fixed timeline.
Each version remembers its own last analysis in the current browser tab, and
explicit version URLs take precedence over that tab's preference.

V3 includes eight native views: county balances, annual/cumulative history,
migration corridors, classification, five regions, the 21 × 21 OD matrix,
556 municipalities, and population panels. Population panels cover age/sex,
citizenship, origin/destination countries and local corridors, with their actual
data years stated explicitly. All 15 guided findings are available in the
explorer. The Maras–Vinovrški study is linked prominently; About contains the
full citation, source licences, glossary and methodology.

Maps support pointer-anchored wheel zoom, dragging, pinch, consistent county
outlines and city/county label modes. Figures export as PNG/SVG with embedded
fonts, numerical legends and attribution; CSV retains complete data and method
labels. V3 starts in 2025, supports Croatian and English, offers light mode,
and shares analysis settings and population subtabs through its URL.

V2's `src/App.tsx`, `src/index.css`, components, calculations and datasets are
unchanged. The small loader in `src/main.tsx` imports one version and its styles;
switching versions navigates the document so CSS and module state stay isolated.
V3 lives in `src/v3/` and reuses the existing computation layer. Both interfaces
offer the original analysis tools and data.

Run `npm run verify:v3` for the v3 production build, browser regressions,
map gesture checks and data-parity checks against the source arrays.
This uses the same optional Puppeteer installation described below, writes its
build and screenshots under ignored `logs/`, and can run alongside
`npm run verify`. The original 650-check suite selects the real v2 URL before
loading each page; its behavior checks remain in place. CI runs both suites.

## Classic v2 views & features

Seven views — **Saldo**, **Klasifikacija** (absolute or % threshold), **Regije**,
**Godine** (21 counties × the whole series as a grid), **Tokovi** (arcs + corridor
pair card), **Matrica** (21×21 OD heatmap), **JLS 2018.** (measured municipal map)
— plus a **Nalazi** guided-findings menu, dob/spol and citizenship/zemlje panels,
county labels, shareable permalinks (`location.hash`), and PNG **and** SVG export.

**Godine** is the small-multiples view: rows are counties, columns are years,
colour is Saldo's own ramp on Saldo's own domain, so a cell and the map at that
year are the same colour by construction. It answers "*when* did this turn",
which previously meant scrubbing 28 times and remembering 21 colours. Clicking a
cell sets the year for every other view; godišnje mode renders 1998–2025 and
hatches the pre-2007 span, where the inter-county margins do not yet close.

## Quickstart

```
npm install
npm run dev          # develop
npm run build        # production build -> dist/ (serve it — the entry is an ES
                     #   module, so file:// is CORS-blocked and renders blank)
npm run lint         # oxlint
npm run typecheck    # tsc --noEmit (strict)
npm i --no-save puppeteer@25.8.0   # once, for verification (see below)
npm run verify       # typecheck + lint + build + 650-check suite (must pass)
npm run smoke        # probe the DEPLOYED origin (network; not part of verify)
node tools/regex-hunt.cjs   # regex literals that lost a backslash (also run by verify)
node scripts/i18n-sweep.cjs            # every L() pair, statically (<1 s)
node scripts/i18n-sweep.cjs dist-test  # …and 114 states in both languages
```

`scripts/i18n-sweep.cjs` is the bilingual sweep run by hand rather than by the
suite: the suite asks the same questions over sixteen states and has half an
hour of other work to do, this asks them over 57 states per language and over
all 420 `L()` pairs in `src/`. The static half catches what a browser cannot —
a pair whose two halves are identical, or that disagree about their named
placeholders — and found the English short citation hardcoding a year the
Croatian half read from a constant. Exit 1 on any finding.

`puppeteer` is deliberately **not** a default devDependency: it downloads
~170 MB of Chrome, which every fresh clone and every cold deploy would pay for a
tool only `npm run verify` uses. `scripts/verify.cjs` says so when it cannot find
it, and honours `PUPPETEER_PATH` (a puppeteer package directory) and
`PUPPETEER_EXECUTABLE_PATH` (an existing Chrome) if you would rather not install
a second copy. It shipped in devDependencies from 2026-07-31 until the audit
pass; this restores the documented state — so the install above is `--no-save`
and pinned. [CI](.github/workflows/verify.yml) does NOT run that command: an
`npm i puppeteer@25.8.0` pins one package by name out of the 27 it installs — six
resolve exactly and the other 21 by caret range from the live registry, with no
integrity at all —
so CI installs the same version from its own lockfile (`ci/package-lock.json`)
with `npm ci`, which pins all 27. The one-liner above stays as it is: it is a
maintainer's local convenience, not a supply chain. `-D` would
write the devDependency back into `package.json` and `package-lock.json`, which
is how it shipped the first time. A later `npm ci` removes it; repeat the line.

The suite pins its own size — `EXPECTED_CHECKS` in `scripts/verify.cjs` — so a
deleted check is a failure rather than a quieter green run. The number above is
the one that file runs; if the two disagree, the file is right.

`npm run verify` builds **twice**: a plain `vite build` into `dist/`, which is
the deploy artefact and what `npm run smoke` compares against the origin, and a
`vite build --mode hooks` into `dist-test/`, which is what the suite drives. The
only difference is four `window.__*` functions the suite needs to reach the
exporters and the wrapper's hard-break branch. They used to be installed for
every visitor; `vite.config.ts` now defines `import.meta.env.VITE_TEST_HOOKS`
from the build mode, so a plain build folds them to `if (false)` and the
minifier drops them. A check reads both directories and fails if the deploy
build carries any of the four, or if the tested build is missing one.

`npm run verify` can only test the build it is handed, so all of its checks can
be green while the origin readers actually reach serves something else — which
is what happened: an audit found the production alias pinned three releases
back, with the whole English language and the robots.txt fix live only in git,
and nothing in the repository could have said so. `npm run smoke` asks the three
questions the suite structurally cannot: do `robots.txt` and `sitemap.xml` serve
as static files or does the catch-all rewrite answer them with the SPA shell, is
the deployed entry chunk the one in `dist/`, and **is the deployed build the
current release**. That last one used to be marker analysis — three strings that
had entered the bundle at some past release — which a build pinned to v2.2.0
satisfied in full, i.e. it could not see the very failure this file was written
after. The build stamps its version into the served markup (`<html data-v>`, see
[`vite.config.ts`](vite.config.ts)) and smoke compares it with `package.json`.

[CI runs it](.github/workflows/verify.yml) on every successful production
deployment and once a day, because the first time this happened the remedy was a
script and a sentence telling a person to run it — and the same thing happened
again, undetected for weeks, until an audit looked. The daily run is the half
that matters: a deploy that never happened emits no event to react to.

One limit, stated plainly: CI smoke compares the deployed origin against the
commit CI checked out. Commits that exist only on your machine are invisible to
it, and a local `npm run smoke` is what reports those — which is what the
`git status -sb` line under its banner is for ("## main...origin/main
[ahead 277]"). The version comparison beside it moves per RELEASE, not per
build: every commit between two bumps stamps the same `data-v`, so a deploy
hundreds of commits behind a single version still answers "current".

The two large geometry payloads (`geo_jls.json` 475 kB, `geo_regions5.json` 68 kB)
are their own content-hashed **files**, fetched rather than imported as modules:
a failed module import is pinned in the browser's module map, which is why the
error UI's retry used to have to reload the whole document — and reloading took
the reader's zoom and per-view year memory with it, both deliberately outside
the hash. A fetch pins nothing, so the retry is a retry. The view that needs one
fetches it on entry, and the other is
warmed on a 1,5 s timer (skipped under Save-Data or 2g), so neither is ever on the
first-paint path. Splitting them out keeps roughly two fifths of the transfer a
first paint would otherwise carry off that path — on the v2.7.0 build, 46,0 % of
raw bytes and 39,8 % of the gzip a browser actually pulls. A proportion rather
than a byte count, because the counts drift every time a line of source changes;
“a little over half” was already under half when it replaced them — and the
proportion is stamped with the build it was taken on, which is the discipline the
paragraph below states and this one used to break by saying “the HEAD build”, a
phrase that is true of whatever build a reader happens to be on. `npm run build`
prints the current chunk sizes.

No byte counts here. They were stated as "measured on the current build" and were
neither — four numbers restated from a build several releases old, drifting every
time a line of source changed, and disagreeing with the same figures in
`geoAsync.ts` and `scripts/verify.cjs`. The bound is the thing worth writing down
because it is the thing that is enforced: **the entry chunk stays under 600 kB**,
asserted by `npm run verify`. `npm run build` prints the exact sizes of every
chunk on every run, which is where a current number belongs.

Requires Node ≥ 22.12 — the `engines.node` range in `package.json`. (This line
used to say 20.19, vite's own floor, which is not the floor this project sets.)

Vercel reads that range too, and because it is open it takes the **highest**
supported major rather than the floor — its build log warns that such a range
"will automatically upgrade when a new major Node.js version is released". CI's
`setup-node: '22.12'` resolves to 22.12.0 for ever, so the gate and the deploy
run different majors by construction. [CI](.github/workflows/verify.yml) closes
that with a second job, `build-on-latest`, which runs the deploy's own command
(`npm run build` — what `vercel.json` names as the buildCommand, and not the
puppeteer suite) on Node 24. Capping the range instead would work, and would
mean setting the Vercel project's Node version to match; the job is the half
this repository can carry on its own.

`CLAUDE.md` carries general behavioural guidelines. The project's own hard rules
— the verification protocol, the DOM contract, honesty labelling and the design
tokens — live where they are enforced: `scripts/verify.cjs` is the protocol and
the contract, the honesty labels are `badge.*` in `src/lib/i18n.ts` reached only
through `flowKind()` / `badgeText()`, and the tokens are the `:root` block at the
top of `src/index.css`. Earlier revisions of this file pointed at a
project-specific `CLAUDE.md` that no longer exists at HEAD; its content is in git
history.

## Hosting

[`vercel.json`](vercel.json) is the whole configuration, and every line of it is
load-bearing: the build command, the output directory, one rewrite, a block of
security headers and two cache policies. The rewrite renders `index.html` for
any path, because the whole site is one page and state lives in the fragment —
but it deliberately does **not** match `/assets/` or `/fonts/`, **at any
depth**. A catch-all that also swallowed those answered a purged or mistyped
hashed chunk with `200 text/html`, so the browser reported a MIME error instead
of a 404 and the first-paint placeholder ran for ever. Missing assets 404 like assets.

The exclusion has to be depth-independent because the rewrite serves the same
document at `/a/b`, and a relative asset URL inside it resolves to
`/a/assets/…`, which a leading-anchored lookahead did not exclude. That is also
why the build is `base: '/'` rather than `'./'`: root-absolute URLs resolve at
the origin whatever path served the document, so a trailing-slash or
two-segment URL boots the app instead of hanging on the placeholder. The build
is no longer relocatable to a subpath — see the comment in
[`vite.config.ts`](vite.config.ts).

The headers block is the other half. `script-src 'self'` and `connect-src
'self'` are why `index.html` carries no inline script it could *execute* and why
nothing in the app talks to a third-party origin — a CDN snippet, a
Google-Fonts `<link>` or an inline `<script>` is blocked in production, not
merely discouraged. The one `<script>` in the document is the
`type="application/ld+json"` block that gives a shared link its unfurl card:
`script-src` does not gate a data block, so it costs the policy nothing — but
this paragraph said "no inline script" flatly for the day between that block
landing and this sentence being corrected. The rest is
`default-src 'self'`, `style-src 'self' 'unsafe-inline'`,
`img-src 'self' data: blob:` (the PNG export goes through a blob URL),
`font-src 'self' data:` (the faces are self-hosted, and the SVG export embeds
its own copies as data URLs),
`object-src`/`base-uri`/`form-action`/`frame-ancestors` set to none, plus
nosniff, a referrer policy, a permissions policy, COOP, `X-Frame-Options: DENY`,
HSTS (two years, all subdomains) and `Vary: Accept-Encoding`.

`'unsafe-inline'` in `style-src` is not there for Vite's injected stylesheet
alone, and it is not removable by tidying the components. Counted across six
views: fifteen distinct inline-style shapes, and the largest by far is the rail
— 123 such rows across those six views (21 in Saldo, Klasifikacija and Godine,
one per county; 20 in Tokovi, Matrica and JLS), each with a `background`
gradient, a `left` and a `width` computed from its own value. The figure read
“123 rows a view”, which is the same count restated as a per-view one: no view
renders more than 21, and the argument only needs the total. The legend and citizenship bars are the same
shape, `--scrubh` and `--stageh` are custom properties React writes as inline
styles by construction, and the tooltip's `font-weight:400` and the class tag's
two colours round it out. Every one of them is data, not decoration: a class
cannot carry a per-county gradient stop. Moving the three hand-written ones
would shrink the surface and change nothing about the directive.

The frame header is redundant with `frame-ancestors 'none'` for anything that reads CSP, and
costs one line for anything that does not. There is no CSP `report-uri`: a
report needs a collector, and every collector is a third party — which the
page's own "reaches no third-party origin" guarantee forbids. HSTS carries no `preload` token: the
token does nothing until the apex is submitted to hstspreload.org, which this
repository cannot do, and leaving that list takes months.

Caching is two rules, and neither of them is about the fonts: `/fonts/` for a week — which covers the two OFL licence texts, the only
files in that directory — and the document `must-revalidate`. Every woff2 is
bundled — ten of them now, since the two mono symbol subsets landed and made a
count written when there were eight wrong — so they ship as hashed `/assets/` outputs and take the platform's
own default along with the JS and the CSS: `public, max-age=0, must-revalidate`, revalidated with an ETag and
answered 304 by the edge, because the Vite preset stamps no `immutable` of its own. A year on files that exist and nothing on a miss would take a Build Output API `hit`-phase route emitted by the build, the way Vercel's Next builder does it; measured, revalidating costs two parallel edge round-trips per full load and no bytes, so that is not done. There is deliberately no `/assets/` rule — a Vercel headers
source matches the request path rather than the response, so one declared there
stamped a year of `immutable` onto 404s as well. `verify.cjs`’s own server
applies these same headers, so the suite fails on a CSP the deploy would reject.

The placeholder itself gives up out loud after ten seconds, through a delayed
CSS animation rather than a timer, so the front door still ships no script of
its own.

## Data refresh

Most of `src/data/*.json` is regenerated by `tools/pipeline/` from the raw DZS
workbooks (included) and the Pitoski figshare edge list (31 MB, download
separately). Three payloads are not, and a pipeline run will not reproduce them:
`geo_counties.json` and `geo_regions5.json` are mapshaper one-liners over
geoBoundaries ADM1, and `atlas_data2.json`’s leaf series (`ii`/`ie`/`oi`/`oe`,
`p`, `pe`) has no committed rebuild script — `parse_nat.py` only *patches* the
`nat` arrays into the existing file. So a DZS revision does not reach those
numbers by running the pipeline, and the atlas would paint the old series under
the new vintage in the footer.

“Not reproduced” here means **no committed script rebuilds it**, which is the
question a maintainer absorbing a data revision is asking.
[`tools/pipeline/README.md`](tools/pipeline/README.md) answers a second one —
whether the *values* can be re-derived from committed inputs — and gives a
different list for it: the leaf series above **is** re-derivable, from the
committed `raw/pregled-zupanije.xlsx` (an audit matched all 2.352 values),
only the parser is missing; while `jls_drill.json` and `geo_jls.json` have their
scripts and need the uncommitted 31 MB figshare download instead. Neither list
is wrong; they answer different questions, and that file is the authority on
both.

## Attribution & licence

- **Code** — MIT.
- **2018 flows** — Pitoski, Lampoltshammer & Parycek (2021), figshare
  10.6084/m9.figshare.12497177, **CC BY 4.0**. Cite the paper.
- **Boundaries** — county outlines from geoBoundaries (ADM1), municipal
  outlines from an Overpass `admin_level=7` extract of OpenStreetMap.
  © OpenStreetMap contributors, **ODbL 1.0** — redistribution of these files,
  or of anything derived from them, must stay under ODbL and keep the credit.
- **Statistics** — DZS (podaci.dzs.hr), tables 7.4.1.–7.4.3. and STAN-2026-2-1.
- **IPF layers** — generated here, not published statistics. Labelled as
  estimates throughout the UI; do not redistribute them as DZS figures.
- **Companion study** — the classification threshold and the five-region
  grouping come from Maras, M. i Vinovrški, L. (2026), *Unutarnje i vanjske
  migracije stanovništva županija kao kriterij regionalizacije Hrvatske*,
  Elektronički zbornik radova Veleučilišta u Šibeniku, 20(1–2), 59–76 —
  [hrcak.srce.hr/349820](https://hrcak.srce.hr/349820),
  [doi:10.51650/ezrvs.20.1-2.4](https://doi.org/10.51650/ezrvs.20.1-2.4),
  **CC BY-NC**. Cited and linked from the header, the footer, the glossary and
  the exports of the two views that use its method. No figure in the atlas comes
  from it; every number is DZS or computed here.
- **Independence** — the atlas is an unaffiliated, unofficial project. Its
  author has no connection to the study's authors or their institutions, and
  they have neither reviewed nor endorsed it. Stated in the footer, the
  glossary, and on exports of the two views that use the study's method.
- **Fonts** — Oswald and IBM Plex Sans/Mono, self-hosted from `src/fonts/`,
  under the **SIL Open Font License 1.1**. The licence text ships with the build
  at `/fonts/OFL-*.txt`, as OFL §2 requires of anything redistributing the font
  files, and both holders are named and linked in the glossary's "Licencije i
  izvori" section. `src/fonts/` is carved out of the MIT grant in LICENSE §1 for
  exactly this reason.
- **The atlas itself** — built by Ante Blašković, © 2026, code under **MIT**,
  source at
  [github.com/ablaskovic/migracijski-atlas](https://github.com/ablaskovic/migracijski-atlas).
  Named and linked in the footer and in the glossary's "Licencije i izvori"
  section, in `<meta name="author">`, and in the `<noscript>` fallback. Every
  upstream source above is credited by name; this is the atlas returning the
  favour for itself, which for a long time it did not.

See [LICENSE](LICENSE) for the full terms of all five.

### Where the citation lives

[`src/lib/credits.ts`](src/lib/credits.ts) is the single source: authors, year,
title, journal, URL, DOI and licence are composed there, and the header
subtitle, footer, glossary section, the `rad` term entry and both export formats
derive from it. Two copies live outside that module and must move with it — the
`<noscript>` block in [index.html](index.html), which cannot import anything,
and one pinned check in `scripts/verify.cjs`. The suite compares the three, so a
half-done edit fails rather than shipping a page that cites the paper in one
place and calls it pending in another. It was written for the reverse case: the
paper was unpublished until 27 July 2026 and the atlas deliberately did not name
it, which is the state `paperPending()` still describes.

[`src/lib/licences.ts`](src/lib/licences.ts) is the same arrangement for
everything that is *not* the study — the four upstream sources, the image, code
and font licences, and `ATLAS_AUTHOR` / `CODE_YEAR` / `REPO`. The footer, the
glossary and the `<noscript>` all read those three, `LICENSE` §1 carries the
same year and holder, and `scripts/verify.cjs` checks the page and the fallback
agree on all of it.
