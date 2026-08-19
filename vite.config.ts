import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The two geometry payloads are JSON, so their chunks have no statements to map:
   557 kB of the ~2 MB of shipped maps was `"mappings": ""` carrying the whole
   JSON duplicated into `sourcesContent` — a second copy of geo_jls.json sitting
   in dist for nobody. A stack trace can never point into them. The entry chunk,
   which one can, keeps its map untouched. */
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

// base './' so the production build works from any subpath. NOT from file://:
// the entry is an ES module, and a module fetched from a null origin is
// CORS-blocked (measured — blank page, "blocked by CORS policy"). Serve it.
export default defineConfig({
  plugins: [react(), dropDataChunkMaps],
  base: './',
  // Source maps ship. The cost is ~1,5 MB of .map files sitting in dist that a
  // browser fetches only when devtools is open, so no visitor pays for them;
  // the benefit is that a stack trace from the deployed app names a line in
  // src/ instead of a column in a minified chunk. The source is MIT and public
  // anyway, so there is nothing here they disclose that the repo does not.
  // (Lighthouse best-practices, "Missing source maps for large first-party
  // JavaScript" — it was the only failing non-informative audit left in that
  // category once the http:// artifact is excluded.)
  build: { sourcemap: true },
});
