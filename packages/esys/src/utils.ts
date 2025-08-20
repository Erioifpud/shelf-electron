/**
 * @fileoverview
 * Provides utility functions for parsing and validating canonical plugin URIs.
 * This module is the single source of truth for URI handling logic.
 */

/**
 * The deconstructed parts of a canonical plugin or resource URI.
 */
export interface ParsedUri {
  /** The full, normalized root URI of the plugin. e.g., "plugin://container.path.to-plugin" */
  pluginUri: string;
  /** The resource sub-path, or null if the URI points only to the plugin's root. e.g., "assets/icon.svg" */
  subPath: string | null;
  /** The name of the container. e.g., "container" */
  containerName: string;
  /** The decoded path of the plugin within its container. e.g., "path/to/plugin" */
  pluginPathInContainer: string;
}

/**
 * Parses a canonical plugin or resource URI into its constituent parts.
 *
 * @see {@link https://eleplug.io/docs/uri-scheme} for the full specification.
 *
 * @param uri The full plugin URI string to parse.
 * @returns An object containing the deconstructed parts of the URI.
 * @throws An `Error` if the URI is malformed.
 * @internal
 */
export function parseUri(uri: string): ParsedUri {
  if (!uri.startsWith("plugin://")) {
    throw new Error(
      `Invalid URI format: "${uri}". URI must start with "plugin://".`
    );
  }

  try {
    const url = new URL(uri);

    if (url.protocol !== "plugin:") {
      throw new Error(`Invalid protocol. Expected "plugin:".`);
    }

    const hostParts = url.hostname.split(".");

    if (hostParts.length < 1 || !hostParts[0]) {
      throw new Error(
        `Invalid plugin host: "${url.hostname}". Must contain at least a container name.`
      );
    }

    const containerName = decodeURIComponent(hostParts[0]);
    const pluginPathInContainer = hostParts
      .slice(1)
      .map(decodeURIComponent)
      .join("/");

    const pluginUri = `${url.protocol}//${url.hostname}`;
    const subPath =
      url.pathname && url.pathname !== "/" ? url.pathname.substring(1) : null;

    return {
      pluginUri,
      subPath,
      containerName,
      pluginPathInContainer,
    };
  } catch (e: any) {
    throw new Error(
      `Failed to parse plugin URI: "${uri}". Ensure it follows the format "plugin://<container>[.<path>]/[<resource>]". Original error: ${e.message}`
    );
  }
}

/**
 * Asserts that a given URI is a valid plugin root URI (i.e., it does not have a resource sub-path).
 * @param uri The URI to validate.
 * @returns The parsed URI components if valid.
 * @throws An `Error` if the URI specifies a resource sub-path.
 */
export function assertIsPluginRootUri(uri: string): ParsedUri {
  const parsed = parseUri(uri);
  if (parsed.subPath !== null) {
    throw new Error(
      `Invalid URI: Expected a plugin root URI, but found a resource path. URI: "${uri}"`
    );
  }
  return parsed;
}

/**
 * Asserts that a given URI is a valid plugin resource URI (i.e., it must have a resource sub-path).
 * @param uri The URI to validate.
 * @returns The parsed URI components if valid.
 * @throws An `Error` if the URI does not specify a resource sub-path.
 */
export function assertIsPluginResourceUri(uri: string): ParsedUri {
  const parsed = parseUri(uri);
  if (parsed.subPath === null) {
    throw new Error(
      `Invalid URI: Expected a resource URI with a path, but found a plugin root URI. URI: "${uri}"`
    );
  }
  return parsed;
}
