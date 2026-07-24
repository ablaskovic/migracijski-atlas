import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build also works from file:// or any subpath
export default defineConfig({
  plugins: [react()],
  base: './',
});
