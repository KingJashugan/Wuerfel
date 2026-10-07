import { defineConfig } from 'vitest/config';
export default defineConfig({
  build: { target: ['es2022', 'safari16', 'chrome100'] },
  test: { include: ['tests/**/*.test.ts'] },
});
