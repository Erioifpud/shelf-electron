import { defineConfig } from 'vite';
import sharedConfig from '../../vite.config.shared';

export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    lib: {
      entry: "src/index.ts",
      formats: ['es'],
      fileName: () => "index.mjs",
    },
    outDir: "./dist",
    emptyOutDir: true,
    minify: false,
  }
  // ...sharedConfig,
});