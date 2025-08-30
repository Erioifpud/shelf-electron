/**
 * Defines the standard interface for a pluggable module in erpc.
 *
 * A Feature encapsulates a piece of functionality (e.g., streaming, pinning)
 * and manages its own lifecycle. The erpc runtime orchestrates features in
 * a three-phase process: contribute, initialize, and close.
 *
 * @template C The capabilities that this Feature **C**ontributes to the system.
 *   This is an object type that will be merged into the global capabilities object.
 * @template R The dependencies that this Feature **R**equires from other features.
 *   This is an object type that the global capabilities object must satisfy.
 */
export interface Feature<C extends object = {}, R extends object = {}> {
  /**
   * **Phase 1: Contribute**
   * This method is called first for all features. It should return the
   * capabilities object that this feature provides to the system. The returned
   * object must not depend on any other features, as they have not been
   * initialized yet.
   */
  contribute(): C;

  /**
   * **Phase 2: Initialize**
   * This method is called after all features have contributed their capabilities.
   * It receives the fully assembled `capability` object, which contains the
   * contributions from all features, allowing this feature to access its
   * required dependencies in a type-safe manner.
   *
   * @param capability The complete capabilities object, satisfying this feature's requirements `R`.
   */
  init(capability: R): Promise<void> | void;

  /**
   * **Phase 3: Close**
   * This method is called when the erpc node is shutting down. It should be
   * used to clean up resources, such as event listeners or timers. Features
   * are closed in the reverse order of their initialization.
   *
   * @param contribution The specific capabilities object that this feature contributed.
   * @param error An optional error indicating the reason for the shutdown.
   */
  close(contribution: C, error?: Error): Promise<void> | void;
}

// =================================================================
// SECTION: Type Gymnastics for Dependency Injection
// These utility types are used to statically extract and combine types from an
// array of Features, enabling compile-time dependency checking in `buildFeatures`.
// =================================================================

/** Extracts the contributed type `C` from a Feature type. @internal */
export type Contributes<T> = T extends Feature<infer C, any> ? C : {};

/** Extracts the required type `R` from a Feature type. @internal */
export type Requires<T> = T extends Feature<any, infer R> ? R : {};

/**
 * A standard utility to convert a union type (e.g., `A | B`) into an
 * intersection type (e.g., `A & B`). This is key to combining the capabilities
 * from multiple features into a single object type.
 * @internal
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Aggregates all contributed types `C` from a tuple of Features into a single
 * intersection type.
 *
 * It works by:
 * 1. Mapping over the feature tuple to get each feature's contribution type.
 * 2. Creating a union of all these contribution types.
 * 3. Converting this union into a single intersection type.
 *
 * @template T A `readonly` tuple of `Feature` types.
 */
export type AllContributions<T extends readonly Feature<any, any>[]> =
  UnionToIntersection<{ [K in keyof T]: Contributes<T[K]> }[number]>;

/**
 * Aggregates all required types `R` from a tuple of Features into a single
 * intersection type, using the same mechanism as `AllContributions`.
 *
 * @template T A `readonly` tuple of `Feature` types.
 */
export type AllRequirements<T extends readonly Feature<any, any>[]> =
  UnionToIntersection<{ [K in keyof T]: Requires<T[K]> }[number]>;
