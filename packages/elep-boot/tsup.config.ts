import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  entry: ['src/main.ts'],
  ...sharedConfig,
  format: ['cjs'],
});
