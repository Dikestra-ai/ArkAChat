import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'src/__tests__/e2e/**', 'src/__tests__/shield-compatibility.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Increase timeout for WASM initialization
    testTimeout: 30000,
  },
});
