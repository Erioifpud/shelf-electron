import { defineConfig } from 'tsup';
import sharedConfig from '../../tsup.config.shared';

export default defineConfig({
  ...sharedConfig,
  entry: ['src/main.ts'],
  format: ['cjs'],
  external: ['@eleplug/elep-boot'],
});
