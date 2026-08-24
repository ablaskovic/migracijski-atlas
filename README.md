# Migracijski atlas županija — React

Interactive atlas of Croatian county migration 1998–2025. React + Vite port of the
verified single-file D3 atlas (kept in `reference/`, together with the full project
handoff). Data: DZS series 7.4.1–7.4.3, DZS STAN-2026-2-1 (citizenship + dob/spol +
zemlje), measured 2018 OD matrix, JLS corridors and a 556-municipality 2018 map
(Pitoski et al. 2021, CC BY; boundaries OSM/ODbL), IPF estimates for other years —
all honesty-labeled in the UI.

## Views & features

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
npm i -D puppeteer   # once, for verification (see below)
npm run verify       # typecheck + lint + build + 441-check suite (must pass)
npm run smoke        # probe the DEPLOYED origin (network; not part of verify)
```

`puppeteer` is deliberately **not** a default devDependency: it downloads
~170 MB of Chrome, which every fresh clone and every cold deploy would pay for a
tool only `npm run verify` uses. `scripts/verify.cjs` says so when it cannot find
it, and honours `PUPPETEER_PATH` (a puppeteer package directory) and
`PUPPETEER_EXECUTABLE_PATH` (an existing Chrome) if you would rather not install
a second copy. It shipped in devDependencies from 2026-07-31 until the audit
pass; this restores the documented state.

The suite pins its own size — `EXPECTED_CHECKS` in `scripts/verify.cjs` — so a
deleted check is a failure rather than a quieter green run. The number above is
the one that file runs; if the two disagree, the file is right.

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
Run it after a deploy.

The two large geometry payloads (`geo_jls.json` 475 kB, `geo_regions5.json` 68 kB)
are their own chunks: the view that needs one fetches it on entry, and the other is
warmed on a 1,5 s timer, so neither is ever on the first-paint path. The entry chunk
is 555.044 B / 182.659 B gzip rather than ~1.048.000 B / ~301.000 B, plus a
28.221 B / 5.775 B gzip stylesheet (measured on the current build; `npm run
verify` asserts the entry stays under 600 kB).

Requires Node ≥ 20.19 (vite 8).

`CLAUDE.md` carries general behavioural guidelines. The project's own hard rules
— the verification protocol, the DOM contract, honesty labelling and the design
tokens — live where they are enforced: `scripts/verify.cjs` is the protocol and
the contract, the honesty labels are `badge.*` in `src/lib/i18n.ts` reached only
through `flowKind()` / `badgeText()`, and the tokens are the `:root` block at the
top of `src/index.css`. Earlier revisions of this file pointed at a
project-specific `CLAUDE.md` that no longer exists at HEAD; its content is in git
history.

## Hosting

[`vercel.json`](vercel.json) is the whole configuration, and both of its lines
are load-bearing. The rewrite renders `index.html` for any path, because the
whole site is one page and state lives in the fragment — but it deliberately
does **not** match `/assets/` or `/fonts/`, **at any depth**. A catch-all that
also swallowed those answered a purged or mistyped hashed chunk with
`200 text/html`, so the browser reported a MIME error instead of a 404 and the
first-paint placeholder ran for ever. Missing assets 404 like assets.

The exclusion has to be depth-independent because the rewrite serves the same
document at `/a/b`, and a relative asset URL inside it resolves to
`/a/assets/…`, which a leading-anchored lookahead did not exclude. That is also
why the build is `base: '/'` rather than `'./'`: root-absolute URLs resolve at
the origin whatever path served the document, so a trailing-slash or
two-segment URL boots the app instead of hanging on the placeholder. The build
is no longer relocatable to a subpath — see the comment in
[`vite.config.ts`](vite.config.ts).

The placeholder itself gives up out loud after ten seconds, through a delayed
CSS animation rather than a timer, so the front door still ships no script of
its own.

## Data refresh

`src/data/*.json` are generated by `tools/pipeline/` from the raw DZS workbooks
(included) and the Pitoski figshare edge list (31 MB, download separately). See
`tools/pipeline/README.md`.

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
- **The atlas itself** — built by Ante Blašković, © 2026, code under **MIT**,
  source at
  [github.com/ablaskovic/migracijski-atlas](https://github.com/ablaskovic/migracijski-atlas).
  Named and linked in the footer and in the glossary's "Licencije i izvori"
  section, in `<meta name="author">`, and in the `<noscript>` fallback. Every
  upstream source above is credited by name; this is the atlas returning the
  favour for itself, which for a long time it did not.

See [LICENSE](LICENSE) for the full terms of all three.

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
