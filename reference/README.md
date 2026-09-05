# reference/ — the frozen v4 record

Two files, both historical. Nothing here is built, served or imported: Vite's root is
the repository root and neither file is reachable from `index.html`, so no byte of this
directory reaches a reader of the deployed atlas. It is kept because the React app is a
port, and a port is only checkable against the thing it was ported from.

## `HANDOFF-v4-singlefile.md`

The context transfer written for the single-file version. Its §0 lists what has since
drifted; §1, §6 and the Ličko-senjska note in §4 still hold. Read that section before
trusting anything else in it.

## `migracijski-atlas-offline.html`

The v4 artifact itself, 565 kB, as it shipped. **It is not offline in the sense the
filename promises.** It carries one live third-party reference:

```html
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&…">
```

so opening it from disk makes a request to `fonts.googleapis.com` and, through the
stylesheet it returns, to `fonts.gstatic.com`. That is the whole of it — the only other
external hostnames in the file are the seven `http://www.w3.org` SVG and XHTML
namespace URIs, which are identifiers and are never fetched, and one
`// https://d3js.org v7.9.0 Copyright 2010-2023 Mike Bostock` banner inside the
vendored D3, which is a comment. The D3 itself is inlined; nothing is fetched for it.

Left as it shipped rather than repaired, because its value is being byte-identical to
what was verified. If the third-party request matters for how you intend to open it,
delete the one `<link>` line in a working copy — the font stack degrades to the system
faces and nothing else changes.

The current app does not have this problem: it self-hosts its faces in `src/fonts/`
behind metric-matched fallbacks, and `vercel.json`'s CSP names no font host.

## The cost of keeping them

Every clone carries 598 kB (584 KiB) it will never run — 565.213 B of offline
HTML and 32.520 B of handoff, this README not counted. The alternative is to delete both and
point at a tag — but there is no tag for v4 (the repository has `v1.0.0` and `v2.0.0`,
both of the React app, and the artifact arrived in the initial commit), so deleting
them today would lose the record rather than move it. Tag the v4 artifact first if that
trade is ever wanted.
