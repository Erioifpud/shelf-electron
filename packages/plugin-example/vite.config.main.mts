/**
 * @fileoverview Vite configuration for the Electron Main process.
 *
 * This configuration is specifically tailored to bundle the plugin's backend
 * code into a format that Electron can load and execute.
 */

import { defineConfig } from "vite";

export default defineConfig({
  // Specifies that the source code for this build is in the 'src' directory.
  root: "./src",

  build: {
    // Set the target environment to Node.js 18, which is compatible with recent Electron versions.
    target: 'node18',

    // CRITICAL: Build as an SSR (Server-Side Rendering) module. This tells Vite
    // to produce a CommonJS module suitable for Node.js environments like Electron's
    // main process. It ensures that `require`, `__dirname`, etc., work correctly.
    ssr: true,

    // Use Vite's library mode to create a single output file from our entry point.
    lib: {
      entry: "main.ts",
      formats: ["cjs"], // Output format must be CommonJS ('cjs').
      fileName: () => "main.js",
    },

    // The output directory for the compiled main process code.
    outDir: "../dist/main",

    rollupOptions: {
      // CRITICAL: Mark Node.js built-ins and Electron as external.
      // These modules are provided by the Node.js/Electron runtime and should
      // NOT be bundled into the final file.
      external: [
        "electron",
        "path",
        "fs",
        "url"
      ],
    },

    // Standard build options.
    emptyOutDir: true, // Clean the output directory before building.
    minify: false,     // Disable minification for easier debugging in the template. Can be set to 'true' for production.
  }
});