import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // TYMCZASOWE (etap 2, Task 2) — usuwa Task 3
    exclude: ['src/modules/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['reflect-metadata'],
  },
});
