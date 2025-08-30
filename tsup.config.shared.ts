import { defineConfig } from 'tsup';

export default defineConfig({
  outDir: 'dist',
  dts: true,
  format: ['esm', 'cjs'],
  target: 'es2024',
  clean: true,
});
