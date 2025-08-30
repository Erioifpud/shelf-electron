/**
 * @fileoverview Vite configuration for the Electron Renderer process.
 *
 * This configuration handles the bundling of the UI (HTML, CSS, TypeScript),
 * and is also used by the `elep-vite-adapter` to power the development server with HMR.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  // The root is the project directory. This is because the build entry point
  // is `renderer/index.html`, and Vite needs to resolve asset paths from there.
  root: ".",

  plugins: [react()],

  // Ensures that asset paths in the generated HTML are absolute (e.g., /renderer.js),
  // which works seamlessly with the `plugin://` protocol.
  base: "/",

  build: {
    // The output directory for the compiled renderer assets.
    outDir: "./dist/renderer",
    emptyOutDir: true,

    // Target a recent version of Chrome, corresponding to the Electron version you're using.
    target: "chrome128",

    rollupOptions: {
      // The entry point for the renderer build is the HTML file itself.
      // Vite will automatically find and bundle the linked CSS and scripts.
      input: "./renderer/index.html",
    },
  },

  // This section configures the Vite development server, which is used by the
  // `@eleplug/elep-vite-adapter` to provide Hot Module Replacement (HMR).
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      // The port must be unique per plugin if you run multiple dev servers.
      port: 1573,
    }
  }
});