import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/* The two geometry payloads are JSON, so their chunks have no statements to map:
   557 kB of the ~2 MB of shipped maps was `"mappings": ""` carrying the whole
   JSON duplicated into `sourcesContent` — a second copy of geo_jls.json sitting
   in dist for nobody. A stack trace can never point into them. The entry chunk,
   which one can, keeps its map untouched. */
/* The one monotonic thing the deployed page can be asked about. scripts/smoke
   probes production without a local build, and its staleness markers were
   *strings that had entered the bundle at some past release* — 'en-GB' and
   'County Migration Atlas' (v2.2.0), 'ascent-override' (v2.1.1) — against a repo
   at v2.5.1. A production alias pinned to the v2.2.0 build, which is the exact
   failure smoke was written after, contains all three and satisfied every one of
   them; nothing in the bundle carried a version at all to substitute.
   Stamped into the markup rather than defined into the JS, so it is legible in
   what the origin actually serves — before any script runs, and in the no-JS
   case too. */
const stampVersion = {
  name: 'stamp-version',
  transformIndexHtml(html: string) {
    /* An exact-string replace that silently returns the input when it misses.
       Add any attribute to the root tag — a class, a dir, a reordering — and the
       anchor is gone: `vite build` succeeds, the whole suite passes (it asserted
       canonical, hreflang and the cards, never the stamp), CI goes green and the
       deploy ships unstamped. The one monotonic staleness signal the README
       sells is then absent, and the next manual smoke run misdiagnoses a current
       deploy as "older than v2.6.0" — the confusion this stamp was built to
       end. A build that cannot stamp is a build that must not finish. */
    const out = html.replace('<html lang="hr">', `<html lang="hr" data-v="${pkg.version}">`);
    if (out === html) throw new Error('stamp-version: <html lang="hr"> not found in index.html');
    return out;
  },
};

const dropDataChunkMaps = {
  name: 'drop-data-chunk-maps',
  generateBundle(_opts: unknown, bundle: Record<string, { type: string; code?: string }>) {
    const isData = (n: string) => /geo_(jls|regions5)-[\w-]+\.js$/.test(n);
    for (const name of Object.keys(bundle)) {
      if (isData(name.replace(/\.map$/, '')) && name.endsWith('.map')) { delete bundle[name]; continue; }
      const c = bundle[name];
      if (c.type === 'chunk' && isData(name) && typeof c.code === 'string') {
        c.code = c.code.replace(/\r?\n?\/\/# sourceMappingURL=[^\r\n]*\r?\n?$/, '\n');
      }
    }
  },
};

// base '/' — root-absolute asset URLs. This used to be './', "so the production
// build works from any subpath", and that property is in direct conflict with the
// catch-all rewrite the deploy needs: vercel.json renders index.html for any
// path, and a relative `./assets/index-*.js` inside a document served at /a/b
// resolves to /a/assets/index-*.js, which the SAME rewrite matched — so Chrome
// received text/html for a module script, refused it on strict MIME checking and
// React never mounted. Measured against the real rule: / and /atlas boot; /atlas/
// and /a/b and /en/saldo do not — #map absent, the boot placeholder is the
// permanent UI, and its own "Reload the page" link resolves back into the same
// dead path forever. Every trailing-slash or two-segment URL a crawler mints, a
// reader mistypes or somebody shares landed there.
// Root-absolute URLs resolve at the origin whatever path served the document, so
// all of those boot now. The cost is the subpath property, which nothing
// deployed here used and which is what produced the defect. (Still NOT file://:
// the entry is an ES module and a module fetched from a null origin is
// CORS-blocked — measured, blank page, "blocked by CORS policy". Serve it.)
export default defineConfig({
  plugins: [react(), dropDataChunkMaps, stampVersion],
  base: '/',
  // Source maps are BUILT and not advertised. They were shipped with a
  // sourceMappingURL on the reasoning that "a stack trace from the deployed app
  // names a line in src/ instead of a column in a minified chunk" and that it
  // cleared Lighthouse's "Missing source maps for large first-party JavaScript".
  // The deploy target denies both: the origin answers
  // /assets/index-*.js.map with 403 (Cache-Control: no-store, X-Robots-Tag:
  // noindex) while a nonexistent name under the same directory returns 404 — so
  // the file is uploaded and the platform withholds it. Against production a
  // maintainer still got minified columns, Lighthouse still reported the maps
  // missing, and every devtools-open visitor triggered a failed request for
  // 1,69 MB nobody can fetch.
  // 'hidden' keeps the maps in dist — `node --enable-source-maps`, `npx
  // source-map` and a local server all still resolve a trace against them — and
  // stops the bundle naming a URL that 403s.
  build: { sourcemap: 'hidden' },
});
