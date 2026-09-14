import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // TYMCZASOWE (etap 2, Task 2) — usuwa Task 3
    include: ['test/schema.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
