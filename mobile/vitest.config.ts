import path from 'path';
import { defineConfig } from 'vitest/config';

// Pure-module tests only: the API boundary, metrics and formatting helpers.
// No React Native rendering, so no jest-expo.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
