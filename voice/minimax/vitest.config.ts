import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit:voice/minimax',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
