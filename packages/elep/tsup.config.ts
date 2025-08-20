import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts', 'src/renderer.ts', 'src/preload.ts', 'src/dev.ts', 'src/config.ts'],
  ...sharedConfig,
  external: ['esbuild']
});
