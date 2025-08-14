import type { DiffEntry, PluginMeta } from "./types.js";
import type { DependencyGraph } from "./dependency-graph.js";

/**
 * Represents the result of comparing two dependency graphs.
 * This class not only holds the lists of added, removed, and modified plugins
 * but also provides a crucial `sort` method to generate a safe, deterministic
 * execution plan for applying these changes.
 */
export class DiffResult {
  #added: PluginMeta[];
  #removed: PluginMeta[];
  #modified: [PluginMeta, PluginMeta][]; // [old, new]

  #newGraph: DependencyGraph;
  #oldGraph: DependencyGraph;

  // A cached set for quick lookup of plugins that were modified.
  #modifiedOldIds: Set<string>;

  constructor(
    added: PluginMeta[],
    removed: PluginMeta[],
    modified: [PluginMeta, PluginMeta][],
    newGraph: DependencyGraph,
    oldGraph: DependencyGraph
  ) {
    this.#added = added;
    this.#removed = removed;
    this.#modified = modified;
    this.#newGraph = newGraph;
    this.#oldGraph = oldGraph;

    this.#modifiedOldIds = new Set(
      modified.map(([oldMeta]) => `${oldMeta.name}@${oldMeta.version}`)
    );
  }

  /**
   * Returns an array of plugins that exist in the new graph but not in the old one.
   */
  public added(): PluginMeta[] {
    return this.#added;
  }

  /**
   * Returns an array of plugins that exist in the old graph but not in the new one.
   */
  public removed(): PluginMeta[] {
    return this.#removed;
  }

  /**
   * Returns an array of plugins that exist in both graphs but have been modified.
   * The returned metadata is from the *new* graph.
   */
  public modified(): PluginMeta[] {
    return this.#modified.map(([, newMeta]) => newMeta);
  }

  /**
   * Generates a deterministic, topologically sorted execution plan to transition
   * from the old graph state to the new graph state.
   *
   * The process is as follows:
   * 1.  **Deactivation Plan:** It identifies all plugins that need to be deactivated
   *     (`removed` + `modified`). It then sorts the *old* graph in reverse topological
   *     order to find a safe deactivation sequence (dependents are deactivated before
   *     their dependencies).
   * 2.  **Activation Plan:** It identifies all plugins that need to be activated
   *     (`added` + `modified`). It then sorts the *new* graph in forward topological
   *     order to find a safe activation sequence (dependencies are activated before
   *     their dependents).
   * 3.  **Combine:** The final plan is the deactivation plan followed by the activation plan.
   *
   * @returns An array of `DiffEntry` objects representing the ordered execution plan.
   */
  public sort(): DiffEntry[] {
    const deactivationPlan: DiffEntry[] = [];
    const activationPlan: DiffEntry[] = [];

    // --- Step 1: Formulate the Deactivation Plan ---
    const deactivationTargetIds = new Set([
      ...this.#removed.map((p) => `${p.name}@${p.version}`),
      ...this.#modifiedOldIds,
    ]);

    if (deactivationTargetIds.size > 0) {
      // Get the deactivation order by sorting the OLD graph and reversing it.
      const fullDeactivationOrder = this.#oldGraph.sort().reverse();

      for (const meta of fullDeactivationOrder) {
        const id = `${meta.name}@${meta.version}`;
        if (deactivationTargetIds.has(id)) {
          // 'replaced' is used for the deactivation half of a modification.
          const type = this.#modifiedOldIds.has(id) ? "replaced" : "removed";
          deactivationPlan.push({ type, meta });
        }
      }
    }

    // --- Step 2: Formulate the Activation Plan ---
    const addedMetas = this.added();
    const modifiedNewMetas = this.modified();
    const activationTargetIds = new Set(
      [...addedMetas, ...modifiedNewMetas].map((p) => `${p.name}@${p.version}`)
    );

    if (activationTargetIds.size > 0) {
      // Get the activation order by sorting the NEW graph.
      const fullActivationOrder = this.#newGraph.sort();
      const addedIds = new Set(addedMetas.map((p) => `${p.name}@${p.version}`));

      for (const meta of fullActivationOrder) {
        const id = `${meta.name}@${meta.version}`;
        if (activationTargetIds.has(id)) {
          const type = addedIds.has(id) ? "added" : "modified";
          activationPlan.push({ type, meta });
        }
      }
    }

    // --- Step 3: Combine Plans ---
    // All deactivations must occur before any activations to ensure a safe transition.
    return [...deactivationPlan, ...activationPlan];
  }
}
