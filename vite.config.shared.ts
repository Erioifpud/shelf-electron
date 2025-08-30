import { defineConfig } from 'vitest/config'
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@eleplug/mimic': path.resolve(__dirname, 'packages/mimic/dist/index.mjs'),

      '@eleplug/transport': path.resolve(__dirname, 'packages/transport/dist/index.mjs'),
      '@eleplug/transport-mem': path.resolve(__dirname, 'packages/transport-mem/dist/index.mjs'),
      '@eleplug/h2': path.resolve(__dirname, 'packages/h2/dist/index.mjs'),
      '@eleplug/h2-client': path.resolve(__dirname, 'packages/h2-client/dist/index.mjs'),
      '@eleplug/h2-server': path.resolve(__dirname, 'packages/h2-server/dist/index.mjs'),
      '@eleplug/muxen': path.resolve(__dirname, 'packages/muxen/dist/index.mjs'),

      '@eleplug/erpc': path.resolve(__dirname, 'packages/erpc/dist/index.mjs'),
      '@eleplug/ebus': path.resolve(__dirname, 'packages/ebus/dist/index.mjs'),

      '@eleplug/anvil': path.resolve(__dirname, 'packages/anvil/dist/index.mjs'),
    },
    preserveSymlinks: true,
  },
  test: {
    environment: 'node',
    include: ['**/tests/**/*.test.ts'],
    globals: true,
  },
});