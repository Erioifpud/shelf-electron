/**
 * @fileoverview
 * Provides a powerful, glob-based path rewriting utility for the Elep container.
 * This module is the core engine for interpreting the `rewrites` configuration
 * in `elep.prod.ts` and `elep.dev.ts`, enabling complex path transformations.
 * It supports both named (`<name:glob>`) and anonymous (`<glob>`) capture groups
 * and uses an LRU cache for compiled patterns to optimize performance.
 */

import micromatch from "micromatch";
import { LRUCache } from "lru-cache";

/**
 * Represents the compiled form of a rewrite pattern.
 * @internal
 */
interface CompiledPattern {
  regex: RegExp;
  /** The total number of capture groups (both named and anonymous). */
  groupCount: number;
}

const compiledPatternCache = new LRUCache<string, CompiledPattern>({
  max: 200,
});

/**
 * Compiles a custom pattern string containing named (`<name:glob>`) or anonymous (`<glob>`)
 * captures into a standard, executable regular expression.
 *
 * It checks a high-performance LRU cache for a pre-compiled pattern. If not found,
 * it parses the pattern, converting glob expressions into regex segments and assembling
 * a final RegExp object, which is then stored in the cache.
 *
 * @param pattern - The custom rewrite pattern, e.g., "/assets/<**> OR /src/<path:**>".
 * @returns A `CompiledPattern` object containing the RegExp and total group count.
 */
function compilePattern(pattern: string): CompiledPattern {
  const cached = compiledPatternCache.get(pattern);
  if (cached) {
    return cached;
  }

  // This new regex can match both `<name:glob>` and `<glob>`.
  // `match[1]` will be the name (or undefined if anonymous).
  // `match[2]` will be the glob pattern.
  const captureGroupRegex = /<(?:(\w+):)?([^>]+)>/g;

  let finalRegexString = "^";
  let lastIndex = 0;
  let groupCount = 0;
  let match;

  while ((match = captureGroupRegex.exec(pattern)) !== null) {
    const literalPart = pattern.substring(lastIndex, match.index);
    finalRegexString += literalPart.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");

    groupCount++;
    const groupName = match[1]; // Will be undefined for anonymous groups
    const globPattern = match[2];

    const globRegexSourceWithAnchors = micromatch.makeRe(globPattern, {
      dot: true,
    }).source;
    const globRegexSource = globRegexSourceWithAnchors.slice(1, -1);

    // Generate a named or a standard (anonymous) capture group based on syntax.
    if (groupName) {
      finalRegexString += `(?<${groupName}>${globRegexSource})`;
    } else {
      finalRegexString += `(${globRegexSource})`;
    }

    lastIndex = captureGroupRegex.lastIndex;
  }

  const remainingPart = pattern.substring(lastIndex);
  finalRegexString += remainingPart.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
  finalRegexString += "$";

  const compiled: CompiledPattern = {
    regex: new RegExp(finalRegexString),
    groupCount,
  };

  compiledPatternCache.set(pattern, compiled);
  return compiled;
}

/**
 * Applies a set of rewrite rules to a given source path.
 *
 * It iterates through the rules, using the `compilePattern` function (with caching)
 * to get a RegExp. The first rule that matches is applied. The target template can
 * reference captures by name (`<name>`) or by 1-based index (`<1>`, `<2>`, etc.).
 *
 * @param sourcePath - The original path to be rewritten.
 * @param rules - A record mapping source patterns to target templates.
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
    console.log("[ffffffffffffff]", pattern + "   " + targetTemplate);
    try {
      const { regex, groupCount } = compilePattern(pattern);
      const match = normalizedPath.match(regex);
      console.log("[fffffffffffffg]", regex + "   " + normalizedPath + "  " + match);

      if (match) {
        // A match was found (groups may or may not exist).
        // This new regex matches both `<name>` and `<number>` placeholders.
        const placeholderRegex = /<(\w+|\d+)>/g;

        let rewrittenPath = targetTemplate.replace(
          placeholderRegex,
          (_, placeholder) => {
            const isNumeric = /^\d+$/.test(placeholder);

            if (isNumeric) {
              const index = parseInt(placeholder, 10);
              if (index > 0 && index <= groupCount) {
                return match[index] || "";
              } else {
                console.warn(
                  `[Elep Rewrite] Warning: Invalid index <${index}> referenced in target for pattern '${pattern}'. There are only ${groupCount} capture groups.`
                );
                return "";
              }
            } else {
              // It's a named placeholder
              if (match.groups && placeholder in match.groups) {
                return match.groups[placeholder] || "";
              } else {
                console.warn(
                  `[Elep Rewrite] Warning: Named group '<${placeholder}>' is used in the target but not defined in the source pattern '${pattern}'.`
                );
                return "";
              }
            }
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

/**
 * Merges development and production rewrite rules, ensuring correct priority.
 * The merging strategy is as follows:
 * 1. All development rules are given higher priority than production rules.
 * 2. If a rule with the same source pattern exists in both sets, the development
 *    version is used, and the production version is discarded.
 * 3. The internal order of rules within each set is preserved.
 *
 * @param devRules - The rewrite rules from `elep.dev.ts`.
 * @param prodRules - The rewrite rules from `elep.prod.ts`.
 * @returns A single, ordered record of rewrite rules to be processed.
 * @internal
 */
export function mergeRewriteRules(
  devRules: Record<string, string> | null | undefined,
  prodRules: Record<string, string> | null | undefined
): Record<string, string> {
  const finalRules = new Map<string, string>();
  
  // 1. Add all dev rules first. Their order is preserved.
  if (devRules) {
    for (const [pattern, target] of Object.entries(devRules)) {
      finalRules.set(pattern, target);
    }
  }

  // 2. Add prod rules only if a rule with the same pattern
  //    doesn't already exist from the dev rules.
  if (prodRules) {
    for (const [pattern, target] of Object.entries(prodRules)) {
      if (!finalRules.has(pattern)) {
        finalRules.set(pattern, target);
      }
    }
  }
  
  // A Map preserves insertion order, so converting back to an object is safe.
  return Object.fromEntries(finalRules);
}
