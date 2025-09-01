/**
 * @fileoverview
 * Provides a powerful, glob-based path rewriting utility for the Elep container.
 * This module is the core engine for interpreting the `rewrites` configuration
 * in `elep.prod.ts` and `elep.dev.ts`, enabling complex path transformations.
 * It uses an LRU cache for compiled patterns to optimize performance.
 */

import micromatch from "micromatch";
import { LRUCache } from "lru-cache";

/**
 * Represents the compiled form of a rewrite pattern, including the final
 * regular expression and the names of the capture groups.
 * @internal
 */
interface CompiledPattern {
  regex: RegExp;
  groups: string[];
}

// Replace the simple Map with a more robust LRUCache instance.
// The `max` option defines the maximum number of compiled patterns to store.
// 200 is a generous number for most applications, preventing excessive memory usage
// while still providing significant performance benefits.
const compiledPatternCache = new LRUCache<string, CompiledPattern>({
  max: 200,
});

/**
 * Compiles a custom pattern string containing named glob captures (e.g., `<name:glob>`)
 * into a standard, executable regular expression.
 *
 * This function is the heart of the rewrite engine. It checks a high-performance
 * LRU cache for a pre-compiled pattern. If not found, it parses the pattern,
 * separates literal parts from capture groups, converts glob expressions
 * into regex segments using `micromatch`, and assembles a final RegExp object,
 * which is then stored in the cache for future use.
 *
 * @param pattern - The custom rewrite pattern, e.g., "/src/assets/<path:** *.{png,jpg}>".
 * @returns A `CompiledPattern` object containing the RegExp and group names.
 * @throws {Error} If the pattern is malformed (e.g., invalid glob).
 */
function compilePattern(pattern: string): CompiledPattern {
  // Check the LRU cache first.
  const cached = compiledPatternCache.get(pattern);
  if (cached) {
    return cached;
  }

  const groups: string[] = [];
  const captureGroupRegex = /<(\w+):([^>]+)>/g;

  let finalRegexString = "^";
  let lastIndex = 0;
  let match;

  while ((match = captureGroupRegex.exec(pattern)) !== null) {
    const literalPart = pattern.substring(lastIndex, match.index);
    finalRegexString += literalPart.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");

    const groupName = match[1];
    const globPattern = match[2];
    groups.push(groupName);

    const globRegexSourceWithAnchors = micromatch.makeRe(globPattern, {
      dot: true,
    }).source;
    const globRegexSource = globRegexSourceWithAnchors.slice(1, -1);

    finalRegexString += `(?<${groupName}>${globRegexSource})`;
    lastIndex = captureGroupRegex.lastIndex;
  }

  const remainingPart = pattern.substring(lastIndex);
  finalRegexString += remainingPart.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
  finalRegexString += "$";

  const compiled: CompiledPattern = {
    regex: new RegExp(finalRegexString),
    groups,
  };

  // Store the newly compiled pattern in the LRU cache.
  compiledPatternCache.set(pattern, compiled);

  return compiled;
}

/**
 * Applies a set of rewrite rules to a given source path.
 *
 * It iterates through the provided rules, compiles each pattern on its first encounter
 * (leveraging an LRU cache for performance), and executes the resulting regular
 * expression against the path. The first rule that matches will be applied, and its
 * target template will be populated with the captured values.
 *
 * @param sourcePath - The original path to be rewritten (e.g., "src/main.js").
 * @param rules - A record mapping source patterns to target templates,
 *                e.g., `{ "/src/<rest:*>": "/dist/<rest>" }`.
 * @returns The rewritten path, or the original path if no rules matched.
 */
export function applyRewriteRules(
  sourcePath: string,
  rules: Record<string, string>
): string {
  const normalizedPath = sourcePath.startsWith("/")
    ? sourcePath
    : `/${sourcePath}`;

  for (const [pattern, targetTemplate] of Object.entries(rules)) {
    try {
      const { regex } = compilePattern(pattern);
      const match = normalizedPath.match(regex);

      if (match?.groups) {
        let rewrittenPath = targetTemplate.replace(
          /<(\w+)>/g,
          (_, groupName) => {
            if (!(groupName in match.groups!)) {
              console.warn(
                `[Elep Rewrite] Warning: Capture group '<${groupName}>' is used in the target template but not defined in the source pattern '${pattern}'.`
              );
              return "";
            }
            return match.groups![groupName] || "";
          }
        );

        if (rewrittenPath.startsWith("/")) {
          rewrittenPath = rewrittenPath.substring(1);
        }

        return rewrittenPath;
      }
    } catch (e: any) {
      console.error(
        `[Elep Rewrite] Error compiling rewrite pattern '${pattern}': ${e.message}`
      );
    }
  }

  return sourcePath;
}
