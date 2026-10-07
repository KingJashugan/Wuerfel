import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative Asset-Pfade: funktioniert unter jedem Unterpfad (GitHub Pages: /<repo>/) und lokal.
  base: './',
  build: { target: ['es2022', 'safari16', 'chrome100'] },
  test: { include: ['tests/**/*.test.ts'] },
});
