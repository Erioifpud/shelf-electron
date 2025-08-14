/**
 * Parses a canonical plugin URI string into its constituent parts.
 *
 * This function is the standard way to deconstruct a `plugin://` URI
 * to get the container name and the path within that container.
 *
 * @param uri The full plugin URI string, e.g., "plugin://my-container/my-plugin/assets/icon.svg".
 * @returns An object containing the `containerName` and `path`.
 * @throws An `Error` if the URI is malformed, does not start with "plugin://",
 *         or is missing a container name or path.
 * @internal
 */
export function parseUri(uri: string): { containerName: string; path: string } {
  if (!uri.startsWith("plugin://")) {
    throw new Error(
      `Invalid plugin URI format: "${uri}". URI must start with "plugin://".`
    );
  }

  try {
    const url = new URL(uri);
    // The container name is the "hostname" part of the URI.
    const containerName = url.hostname;

    // The path is everything after the hostname, excluding the leading slash.
    const path = (url.pathname + url.search + url.hash).substring(1);

    if (!containerName || !path) {
      throw new Error(
        `Invalid plugin URI: "${uri}". URI must include a container name and a path.`
      );
    }

    return { containerName, path };
  } catch (e) {
    throw new Error(
      `Failed to parse plugin URI: "${uri}". Please ensure it follows the format "plugin://<container-name>/<path>".`
    );
  }
}
