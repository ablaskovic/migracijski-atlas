import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build works from any subpath. NOT from file://:
// the entry is an ES module, and a module fetched from a null origin is
// CORS-blocked (measured — blank page, "blocked by CORS policy"). Serve it.
export default defineConfig({
  plugins: [react()],
  base: './',
});
