
/**
 * Represents a node in the Trie data structure.
 * @template T The type of the value stored in the node.
 * @internal
 */
export class TrieNode<T> {
  /**
   * Child nodes, keyed by the path segment. A Map is used for clean key handling.
   */
  public readonly children: Map<string, TrieNode<T>> = new Map();
  /**
   * The value stored at this node. A non-null value indicates that this node
   * represents the end of a valid, registered path.
   */
  public value: T | null = null;
}

/**
 * A Trie (prefix tree) optimized for storing and looking up procedures
 * by their dot-delimited paths. It is essential for implementing dynamic procedures.
 * @template T The type of the value to store (e.g., a `DynamicProcedure`).
 * @internal
 */
export class Trie<T> {
  private static readonly DELIMITER = '.';
  private readonly root = new TrieNode<T>();

  /**
   * Inserts a value into the Trie associated with a given path.
   * @param path The path string, e.g., "posts.comments.create". An empty string
   * targets the root.
   * @param value The value to store at the end of the path.
   */
  public insert(path: string, value: T): void {
    let node = this.root;
    // An empty path corresponds to the root node itself.
    if (path === '') {
      node.value = value;
      return;
    }

    const segments = path.split(Trie.DELIMITER);
    for (const segment of segments) {
      if (!node.children.has(segment)) {
        node.children.set(segment, new TrieNode<T>());
      }
      node = node.children.get(segment)!;
    }
    node.value = value;
  }

  /**
   * Finds the value associated with the longest possible prefix of the given path.
   *
   * This is crucial for dynamic routing. For example, if the Trie contains a
   * dynamic procedure at "posts.dynamic" and the input path is
   * "posts.dynamic.123.author", this method will return the procedure
   * and the remaining relative path `['123', 'author']`.
   *
   * @param path The full path to search for a matching prefix.
   * @returns An object with the found value and the relative path, or `undefined` if no prefix matches.
   */
  public findLongestPrefix(path: string): { value: T; relativePath: string[] } | undefined {
    let node = this.root;
    const segments = path === '' ? [] : path.split(Trie.DELIMITER);
    let lastFound: { value: T; index: number } | undefined = undefined;

    // A dynamic procedure can be registered at the root, so check it first.
    if (this.root.value !== null) {
      lastFound = { value: this.root.value, index: 0 };
    }

    // Traverse the trie segment by segment.
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const childNode = node.children.get(segment);

      if (childNode) {
        node = childNode;
        // If the current node holds a value, it's a potential match.
        // We record it and continue, searching for a longer, more specific match.
        if (node.value !== null) {
          lastFound = { value: node.value, index: i + 1 };
        }
      } else {
        // No further matching path segments exist in the Trie, so we stop.
        break;
      }
    }

    if (lastFound) {
      return {
        value: lastFound.value,
        // The relative path is the part of the input path that comes after the matched prefix.
        relativePath: segments.slice(lastFound.index),
      };
    }

    return undefined;
  }
}