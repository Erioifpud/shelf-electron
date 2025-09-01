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
   * logical paths from the final build output structure using a powerful
   * glob-based capture and substitution syntax.
   *
   * **Syntax:**
   * - Source Pattern: Use `<name:glob>` to define a named capture group.
   *   - `name`: A name for your captured value (e.g., `path`, `file`).
   *   - `glob`: Any valid glob pattern (`*`, `**`, `*.js`, etc.).
   * - Target Template: Use `<name>` to substitute the value captured by the group.
   *
   * **Example Breakdown:**
   * In the rule `"/@renderer/<rest:**>": "/dist/renderer/<rest>"`, a request for a path
   * like `/@renderer/assets/icon.svg` will be processed as follows:
   * 1. The pattern matches the path.
   * 2. The glob `**` captures the substring "assets/icon.svg" into a group named `rest`.
   * 3. The system substitutes `<rest>` in the target template with the captured value.
   * 4. The final, rewritten path becomes `/dist/renderer/assets/icon.svg`.
   *
   * This allows `context.resolve('@renderer/index.html')` to correctly generate the
   * URI "plugin://.../dist/renderer/index.html" in a production environment.
   */
  rewrites: {
    "/@renderer/<rest:**>": "/dist/renderer/<rest>",
  },

  /**
   * (Optional) MIME type overrides.
   * Useful for files with uncommon extensions or when the default MIME type
   * detection is incorrect. Uses micromatch glob patterns.
   *
   * @example
   * mimes: {
   *   "**\/*.my-custom-ext": "application/octet-stream"
   * }
   */
});