import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build works from any subpath. NOT from file://:
// the entry is an ES module, and a module fetched from a null origin is
// CORS-blocked (measured — blank page, "blocked by CORS policy"). Serve it.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Source maps ship. The cost is ~2 MB of .map files sitting in dist that a
  // browser fetches only when devtools is open, so no visitor pays for them;
  // the benefit is that a stack trace from the deployed app names a line in
  // src/ instead of a column in a minified chunk. The source is MIT and public
  // anyway, so there is nothing here they disclose that the repo does not.
  // (Lighthouse best-practices, "Missing source maps for large first-party
  // JavaScript" — it was the only failing non-informative audit left in that
  // category once the http:// artifact is excluded.)
  build: { sourcemap: true },
});
