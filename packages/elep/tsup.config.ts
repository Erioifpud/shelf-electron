import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  entry: ['src/index.ts', 'src/render.ts', 'src/preload.ts'],
  ...sharedConfig,
});
