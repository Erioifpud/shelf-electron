import { DependencyGraph } from "./dependency-graph.js";
import { DependencyResolver } from "./dependency-resolver.js";
import type { ResolverOptions } from "./types.js";

/**
 * Manages the top-level dependency requirements and the resulting locked graph.
 *
 * This class serves as the primary user-facing entry point for defining a
 * desired state and triggering a resolution against that state. It encapsulates
 * the logic for incremental resolutions by passing its current locked graph
 * to the resolver as a set of preferred versions.
 */
export class Requirements {
  private userRequirements: Record<string, string> = {};
  private lockedGraph: DependencyGraph = new DependencyGraph();

  /**
   * Adds or updates a top-level dependency requirement.
   * @param name The name of the package/plugin.
   * @param range The semantic version range required (e.g., "^1.0.0").
   */
  public add(name: string, range: string): void {
    this.userRequirements[name] = range;
  }

  /**
   * Removes a top-level dependency requirement.
   * @param name The name of the package/plugin to remove.
   */
  public remove(name: string): void {
    delete this.userRequirements[name];
  }

  /**
   * Gets a copy of the current top-level user requirements.
   * @returns A record of package names to their required version ranges.
   */
  public get(): Record<string, string> {
    return { ...this.userRequirements };
  }

  /**
   * Gets the current locked dependency graph resulting from the last successful resolution.
   * @returns The `DependencyGraph` instance.
   */
  public getGraph(): DependencyGraph {
    return this.lockedGraph;
  }

  /**
   * Creates a deep copy of this Requirements instance, including its user requirements
   * and the locked dependency graph.
   * @returns A new `Requirements` instance with identical state.
   */
  public clone(): Requirements {
    const copy = new Requirements();
    copy.userRequirements = { ...this.userRequirements };
    copy.lockedGraph = this.lockedGraph.clone();
    return copy;
  }

  /**
   * Resolves the current user requirements against the registered providers
   * and updates the internal locked graph with the result.
   *
   * @param resolver The `DependencyResolver` instance to use for the resolution.
   * @param options Options to configure the resolution process.
   */
  public async resolve(
    resolver: DependencyResolver,
    options: ResolverOptions = {}
  ): Promise<void> {
    const newGraph = await resolver.resolve(
      this.userRequirements,
      options,
      this.lockedGraph // The current graph is passed to prefer locked versions.
    );
    this.lockedGraph = newGraph;
  }
}
