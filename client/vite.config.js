import { defineConfig } from 'vite';

export default defineConfig({
  // './': every asset and runtime image URL (`${import.meta.env.BASE_URL}units/...`)
  // is relative to the page, so the same build serves from the site root
  // (Render) and from a folder (the playtest artifact, where the absolute
  // paths left every portrait, map and weapon icon at 404 — owner 2026-10-08).
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist' }
});
