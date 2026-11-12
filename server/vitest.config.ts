import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    setupFiles: ['tests/setup/setup.ts'],
    // One in-memory replica set is shared, so run files sequentially and give
    // each file its own database (see tests/setup/setup.ts).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
