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
   * This is a critical piece of configuration that decouples your source code's
   * logical paths from the final build output structure. It uses a powerful
   * glob-based capture and substitution engine.
   *
   * **Syntax Guide:**
   *
   * **1. Source Pattern (the key):**
   *    - **Named Capture:** Use `<name:glob>` to capture a path segment into a
   *      variable named `name`. The `glob` can be any valid pattern like `*`
   *      (single segment), `**` (multiple segments), or `*.{js,css}`.
   *    - **Anonymous Capture:** Use `<glob>` for a simpler capture when a name
   *      isn't needed.
   *
   * **2. Target Template (the value):**
   *    - **Named Reference:** Use `<name>` to substitute the value captured by
   *      the corresponding named group.
   *    - **Indexed Reference:** Use `<1>`, `<2>`, etc., to substitute values from
   *      all capture groups (both named and anonymous) in the order they appear
   *      from left to right.
   *
   * **Example Breakdown (`/@renderer/<rest:**>` -> `/dist/renderer/<rest>`):**
   * A call to `context.resolve('@renderer/assets/icon.svg')` is processed as follows:
   * 1. The pattern `"/@renderer/<rest:**>"` matches the path.
   * 2. The glob `**` captures the substring "assets/icon.svg" into a group named `rest`.
   * 3. The system substitutes `<rest>` in the target template with the captured value.
   * 4. The final, rewritten path becomes `/dist/renderer/assets/icon.svg`.
   * This correctly generates the production URI: "plugin://.../dist/renderer/index.html".
   */
  rewrites: {
   '/@renderer/index.html</**>': '/dist/renderer/index.html',
   "/@renderer/<**>": "/dist/renderer/<1>",
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