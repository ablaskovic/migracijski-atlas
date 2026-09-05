/// <reference types="vite/client" />

/* The one VITE_* this project defines, declared so it is a property rather than
   an index-signature lookup — `noPropertyAccessFromIndexSignature` would
   otherwise demand bracket notation, and Vite's `define` substitutes the exact
   text `import.meta.env.VITE_TEST_HOOKS`, which bracket notation is not.
   It is not read from a .env file: vite.config.ts defines it from the build
   mode, true only for `--mode hooks`, which is what `npm run verify` uses. */
interface ImportMetaEnv {
  readonly VITE_TEST_HOOKS: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
