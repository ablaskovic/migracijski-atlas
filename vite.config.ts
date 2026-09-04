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

/* The four faces first paint actually draws with, asked for at the same moment
   as the stylesheet that names them instead of one round trip later.

   A @font-face src is discoverable only after index-*.css has arrived AND
   parsed, so the preload scanner — which reads the raw HTML before any CSS
   exists — cannot see it. Measured on the built output over a uniform 60 ms
   link: the stylesheet is requested at 104 ms and these four at 214-216 ms,
   which is exactly one round trip of pure serialisation. The other four woff2
   the page requests (Sans, and Mono 500) come at 377 ms, a further hop later,
   because nothing above the fold needs them at first paint; preloading those
   would spend bandwidth on the critical path to no effect, so this list is the
   four and not the eight.

   The names are read from the bundle rather than written down, because they are
   content-hashed and a literal here would silently rot into a preload of a file
   that no longer exists — a warning in the console and a wasted request, which
   is worse than not preloading. A face this cannot find is a build that must
   not finish, for the same reason stamp-version throws.

   crossorigin is not optional even though the fonts are same-origin: a font is
   always fetched in anonymous CORS mode, so a preload without it lands in a
   different cache partition than the @font-face fetch and the file is
   downloaded twice. */
const FIRST_PAINT_FACES = ['ibm-plex-mono-400-latin', 'ibm-plex-mono-400-latin-ext',
  'oswald-latin', 'oswald-latin-ext'];
const preloadFaces = {
  name: 'preload-faces',
  enforce: 'post' as const,
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string, ctx: { bundle?: Record<string, { originalFileNames?: string[] }> }) {
      if (!ctx.bundle) return html;   // dev server: the faces are unhashed and already discoverable
      const bundle = ctx.bundle;
      const tags = FIRST_PAINT_FACES.map(f => {
        /* Matched on the SOURCE name the bundle records, not on the emitted one.
           A hash may contain '-' (oswald-latin-9AWb_KF-.woff2 is a real emitted
           name), so a pattern over the output cannot tell where the face name
           ends: 'ibm-plex-mono-400-latin-<hash>' and
           'ibm-plex-mono-400-latin-ext-<hash>' both matched the shorter of the
           two names, which is the build this threw on. */
        const want = 'src/fonts/' + f + '.woff2';
        const hit = Object.keys(bundle).filter(n => (bundle[n].originalFileNames || [])
          .some(o => o.replace(/\\/g, '/').endsWith(want)));
        if (hit.length !== 1) throw new Error(`preload-faces: ${f} matched ${hit.length} assets`);
        return { tag: 'link', injectTo: 'head-prepend' as const,
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/' + hit[0] } };
      });
      return { html, tags };
    },
  },
};

const dropDataChunkMaps = {
  name: 'drop-data-chunk-maps',
  /* Deleting the two .map assets is the whole of it. This also stripped a
     `//# sourceMappingURL` comment off the data chunks, and with
     `build.sourcemap: 'hidden'` below there is never one to strip: hidden is
     precisely 'emit the map, emit no comment'. Verified against the shipped
     dist — 0 chunks carrying a sourceMappingURL comment — so that branch had
     nothing to match and its removal changes no byte of the output. It read as
     the thing doing the work, which is worse than doing nothing.
     `appdata` joins them: it is the same kind of chunk for the same reason —
     five JSON payloads with no statements to map, whose 168 kB map is the JSON
     over again in sourcesContent. */
  generateBundle(_opts: unknown, bundle: Record<string, { type: string }>) {
    const isData = (n: string) => /(?:geo_(?:jls|regions5)|appdata)-[\w-]+\.js$/.test(n);
    for (const name of Object.keys(bundle)) {
      if (name.endsWith('.map') && isData(name.replace(/\.map$/, ''))) delete bundle[name];
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
  plugins: [react(), dropDataChunkMaps, stampVersion, preloadFaces],
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
  // …and the size warning says something. Rollup's default fires at 500 kB, so
  // every build of this app has printed "(!) Some chunks are larger than 500
  // kB" about the entry chunk since long before the chunk was a concern — a
  // line a maintainer learns to scroll past, which is the opposite of a signal.
  // The number that matters is verify.cjs's, which fails the suite when the
  // entry exceeds 600 KiB. The two are not in the same unit — Rollup's limit is
  // kB of 1000, the check divides by 1024 — so 600 KiB is 614 here. The entry
  // was 601,5 kB when this line was written and the split below took it to
  // 194: the limit stays where it is, because what it guards is the ceiling,
  // and the vendor chunk is the one now closest to it.
  build: {
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 608,
    // A face is a file, always. The default inlines any asset under 4 kB as a
    // base64 data: URI, and the two symbol subsets are 1,2 kB each — so they
    // alone of the eight went into the entry chunk, which is the one thing
    // exportFonts is written not to do ("a static import puts base64 in the
    // entry chunk for a feature most readers never use"). Every reader paid
    // 3,2 kB for the export's arrows. It also split the eight faces into two
    // kinds for anything that watches them: verify.cjs's font-404 arm blocks by
    // resourceType 'fetch' on a .woff2 URL, and a data: URI is neither.
    assetsInlineLimit: (f: string) => (f.endsWith('.woff2') ? false : undefined),
    // …and three chunks instead of one, so a release does not re-send what did
    // not change. The entry carried react-dom, six d3 packages and ~165 kB of
    // static JSON along with the app code, and the app code is the only part
    // that moves between releases — every deploy invalidated the whole 601 kB
    // under a year-long immutable header. Split: entry 194 kB, vendor 243 kB,
    // appdata 161 KiB. Measured on the built output: the three together gzip to
    // 191,6 KiB against the single chunk's 192,9, so a cold visit is not paying
    // for the split — and a returning reader after a release fetches 62,3 KiB
    // instead of 192,9.
    // The two geometry payloads are NOT in this: they are dynamic imports and
    // must stay their own lazy chunks, which is what the `geo_` exclusion below
    // is for — naming them here would pull them into the boot waterfall.
    // Sizes above are kB of 1000 where the build log prints them and KiB where
    // this file measures dist; the two units are the reason the limit is 608.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (/node_modules[\\/](react|react-dom|scheduler|d3-)/.test(id)) return 'vendor';
          if (/src[\\/]data[\\/].*\.json$/.test(id) && !/geo_(jls|regions5)/.test(id)) return 'appdata';
          return undefined;
        },
      },
    },
  },
});
