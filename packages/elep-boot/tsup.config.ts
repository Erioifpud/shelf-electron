import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  entry: ['src/main.ts', 'src/kernel.ts', 'src/config.ts'],
  ...sharedConfig,
  external: ['esbuild']
});
