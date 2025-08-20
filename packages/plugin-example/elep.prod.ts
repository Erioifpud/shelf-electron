/**
 * @fileoverview Elep Production Environment Configuration
 *
 * This file is loaded by the `FileContainer` in production mode. It provides
 * essential metadata that allows the runtime to correctly resolve resource paths
 * after the project has been built.
 */

import { defineProdConfig } from '@eleplug/elep/config';

export default defineProdConfig({
  /**
   * Production-specific path rewrites.
   *
   * This is a critical piece of configuration. It decouples your source code's
   * logical paths from the final build output structure.
   *
   * Here, we map the abstract path "/@renderer/" to the actual build output
   * directory "/dist/renderer/". When `context.resolve('@renderer/index.html')`
   * is called in production, the system will use this rule to generate the
   * correct URI: "plugin://.../dist/renderer/index.html".
   */
  rewrites: {
    "/@renderer/": "/dist/renderer/",
  },

  /**
   * (Optional) MIME type overrides.
   * Useful for files with uncommon extensions or when the default MIME type
   * detection is incorrect.
   *
   * mimes: {
   *   "**\/*.my-custom-ext": "application/octet-stream"
   * }
   */
});