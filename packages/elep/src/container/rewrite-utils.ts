/**
 * @fileoverview
 * Provides path rewriting and SPA fallback utilities for the Elep container.
 * It uses a high-performance LRU cache for memoizing sorted rewrite keys.
 */

import { LRUCache } from "lru-cache";

// A high-performance LRU cache for storing sorted rewrite keys.
const sortedKeysCache = new LRUCache<Record<string, string>, string[]>({
  max: 200,
});

/**
 * Applies a set of simple prefix-based rewrite rules to a given source path.
 * It deterministically finds the longest matching prefix from the rules and replaces it.
 *
 * @param sourcePath - The original path to be rewritten (e.g., "@renderer/main.js").
 * @param rules - A record mapping virtual prefixes to their corresponding physical prefixes.
 * @returns The rewritten path, or the original path if no rules matched.
 */
export function applyPrefixRewriteRules(
  sourcePath: string,
  rules: Record<string, string>
): string {
  let sortedKeys = sortedKeysCache.get(rules);
  if (!sortedKeys) {
    sortedKeys = Object.keys(rules).sort((a, b) => b.length - a.length);
    sortedKeysCache.set(rules, sortedKeys);
  }

  const normalizedPath = sourcePath.startsWith("/")
    ? sourcePath
    : `/${sourcePath}`;

  for (const from of sortedKeys) {
    if (normalizedPath.startsWith(from)) {
      const to = rules[from];
      const rewrittenPath = to + normalizedPath.substring(from.length);
      return rewrittenPath.startsWith("/")
        ? rewrittenPath.substring(1)
        : rewrittenPath;
    }
  }

  return sourcePath;
}

// A pre-compiled regex to efficiently test for common web page file extensions.
const WEB_PAGE_EXTENSIONS_REGEX = /\.(html|htm|xhtml)$/;
// A pre-compiled regex to check if a path segment looks like a static asset.
const STATIC_ASSET_REGEX = /[^/]+\.[^/]+$/;

/**
 * Applies a configured SPA (Single Page Application) fallback strategy to a path.
 *
 * This function is the core of Elep's SPA routing. Based on the `spaConfig`, it
 * intelligently rewrites paths that look like client-side routes to an appropriate
 * HTML entry point, while leaving direct requests for static assets untouched.
 *
 * @param originalPath - The path to potentially apply the fallback to.
 * @param spaConfig - The SPA configuration (`true`, a string, or an array of strings).
 * @returns The rewritten path if a fallback was applied, otherwise the original path.
 */
export function applySpaFallback(
  originalPath: string,
  spaConfig: boolean | string | string[]
): string {
  // Heuristic: If the path looks like a direct request for a static asset (e.g., 'main.js', 'logo.svg'),
  // we should never apply the SPA fallback, regardless of the configuration.
  if (STATIC_ASSET_REGEX.test(originalPath)) {
    return originalPath;
  }

  // --- Strategy 1: `spa: string` (Single Entry Point Mode) ---
  if (typeof spaConfig === "string") {
    console.debug(
      `[Elep SPA Fallback] Path '${originalPath}' rewritten to single entry point '${spaConfig}'.`
    );
    // Unconditionally rewrite to the specified entry point.
    return spaConfig.startsWith("/") ? spaConfig.substring(1) : spaConfig;
  }

  // --- Strategy 2: `spa: string[]` (Multi-App Mode) ---
  if (Array.isArray(spaConfig)) {
    // Sort entry points by length, descending, to find the most specific match first.
    // E.g., '/app/admin/index.html' should be checked before '/app/index.html'.
    const sortedEntryPoints = [...spaConfig].sort(
      (a, b) => b.length - a.length
    );

    for (const entryPoint of sortedEntryPoints) {
      // If the request path starts with a known entry point, fall back to it.
      if (originalPath.startsWith(entryPoint)) {
        console.debug(
          `[Elep SPA Fallback] Path '${originalPath}' rewritten to multi-app entry point '${entryPoint}'.`
        );
        return entryPoint;
      }
    }
    // If no entry point is a prefix of the path, do nothing.
    return originalPath;
  }

  // --- Strategy 3: `spa: true` (Smart Detection Mode) ---
  if (spaConfig === true) {
    const pathSegments = originalPath.split("/");
    let htmlEntryIndex = -1;

    // Find the index of the last segment that ends with a common web page extension.
    for (let i = pathSegments.length - 1; i >= 0; i--) {
      if (WEB_PAGE_EXTENSIONS_REGEX.test(pathSegments[i])) {
        htmlEntryIndex = i;
        break;
      }
    }

    // If an HTML-like segment was found, rewrite the path to include only up to that segment.
    if (htmlEntryIndex !== -1) {
      const spaRootPath = pathSegments.slice(0, htmlEntryIndex + 1).join("/");
      console.debug(
        `[Elep SPA Fallback] Path '${originalPath}' smartly rewritten to '${spaRootPath}'.`
      );
      return spaRootPath;
    }
  }

  // If SPA is not enabled, or if no applicable fallback logic was matched, return the original path.
  return originalPath;
}
