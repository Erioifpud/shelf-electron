import type { AllContributions, AllRequirements, Feature } from './framework/feature';

/**
 * Constructs an erpc node by assembling a list of features, performing
 * compile-time dependency validation.
 *
 * This factory function is the heart of the erpc runtime. It orchestrates the
 * lifecycle of all provided features and produces a single `capability` object
 * that exposes all their functionalities, along with a `close` function for
 * graceful shutdown.
 *
 * @template TFeatures A `readonly` tuple of `Feature` instances. The `const`
 *   assertion is crucial for TypeScript to infer the exact feature types.
 * @param features An array of feature instances to assemble.
 * @returns A promise that resolves to an object containing the aggregated
 *   `capability` and a `close` function.
 *
 * @example
 * ```ts
 * const features = [new FeatureA(), new FeatureB()] as const;
 * const node = await buildFeatures(features);
 * // node.capability now has methods from both FeatureA and FeatureB.
 * await node.close();
 * ```
 *
 * **Compile-Time Dependency Check:**
 * The return type of this function includes a powerful conditional type:
 * `AllContributions<TFeatures> extends AllRequirements<TFeatures> ? ... : ...`
 * This check ensures that the union of all capabilities contributed by the
 * features satisfies the union of all their requirements. If a dependency is
* missing, this type resolves to an error object, causing a TypeScript
 * compilation error with a descriptive message.
 */
export async function buildFeatures<
  const TFeatures extends readonly Feature<any, any>[]
>(
  features: TFeatures,
): Promise<
  AllContributions<TFeatures> extends AllRequirements<TFeatures>
    // If dependencies are met, return the normal, fully-typed node.
    ? { capability: AllContributions<TFeatures>; close: (error?: Error) => Promise<void> }
    // Otherwise, return a type with an error message, causing a compile-time failure.
    : { readonly __error: "A feature's requirement was not met by the provided contributions. Please check the feature list." }
> {

  const contributions: any[] = [];
  const capability: any = {};

  // Phase 1: Call `contribute()` on all features to gather their capabilities.
  for (const feature of features) {
    const contribution = feature.contribute();
    contributions.push(contribution);
    Object.assign(capability, contribution);
  }

  // Phase 2: Call `init()` on all features, passing the fully assembled capability object.
  for (const feature of features) {
    await Promise.resolve(feature.init(capability));
  }

  /**
   * The shutdown function for the erpc node. It calls the `close()` method
   * on all features in the reverse order of their initialization.
   */
  const close = async (error?: Error) => {
    const reversedFeatures = [...features].reverse();
    const reversedContributions = [...contributions].reverse();
    for (let i = 0; i < reversedFeatures.length; i++) {
      try {
        await reversedFeatures[i].close(reversedContributions[i], error);
      } catch (e) {
        console.error(`[erpc] Error closing feature [${i}]:`, e);
      }
    }
  };

  // The type assertion is necessary because TypeScript cannot infer the result
  // of the conditional type within the function's implementation.
  // The compile-time check on the function's signature ensures this is safe.
  return { capability, close } as any;
}