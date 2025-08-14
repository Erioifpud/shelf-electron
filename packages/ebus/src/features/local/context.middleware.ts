import { middleware } from "@eleplug/erpc";
import type { BusContext, TopicContext } from "../../types/common";
import { EbusError } from "../../types/errors";

// --- Type Guards ---

/**
 * A runtime type guard to check if an object conforms to the `BusContext` shape.
 * It specifically ensures that a 'topic' property does NOT exist to differentiate
 * it from a `TopicContext`.
 * @internal
 */
function isBusContext(obj: any): obj is BusContext {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.sourceNodeId === "string" &&
    typeof obj.localNodeId === "string" &&
    !("topic" in obj)
  );
}

/**
 * A runtime type guard to check if an object conforms to the `TopicContext` shape.
 * @internal
 */
function isTopicContext(obj: any): obj is TopicContext {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.sourceNodeId === "string" &&
    typeof obj.localNodeId === "string" &&
    typeof obj.topic === "string"
  );
}

// --- Middleware Factory ---

/**
 * A factory for creating a specialized context-injecting middleware.
 * This pattern avoids code duplication while maintaining strong type safety for
 * different context types. The created middleware consumes the first element
 * from the `meta` array and injects it as the new `ctx`.
 *
 * @param validator A type guard to validate the consumed context object.
 * @param errorMessage The error message to throw if the context is missing or invalid.
 * @returns A configured erpc middleware.
 * @internal
 */
function createContextInjectorMiddleware<
  TContext extends BusContext | TopicContext,
>(validator: (obj: any) => obj is TContext, errorMessage: string) {
  return middleware<{
    CtxIn: unknown; // Accepts any incoming context, as it will be replaced.
    CtxOut: TContext; // Outputs the specific, validated context type.
  }>(async ({ meta, next, input }) => {
    if (!Array.isArray(meta) || meta.length === 0) {
      throw new EbusError(`Internal Error: ${errorMessage}`);
    }

    const remainingMeta = [...meta];
    const context = remainingMeta.shift(); // Consume the context from the meta array.

    if (!validator(context)) {
      throw new EbusError(
        `Internal Error: Invalid context object found in meta array. It did not match the expected shape for this procedure type.`
      );
    }

    // Call the next middleware with the validated context and remaining metadata.
    return next({
      ctx: context, // `context` is now correctly typed as TContext.
      meta: remainingMeta,
      input,
    });
  });
}

// --- Exported Middlewares ---

/**
 * An erpc middleware for P2P procedures.
 * It consumes the first `meta` element, validates it as a `BusContext`,
 * and injects it into `env.ctx`.
 */
export const p2pContextMiddleware = createContextInjectorMiddleware(
  isBusContext,
  "EBUS P2P context was not prepended to the meta array."
);

/**
 * An erpc middleware for Pub/Sub procedures.
 * It consumes the first `meta` element, validates it as a `TopicContext`,
 * and injects it into `env.ctx`.
 */
export const pubsubContextMiddleware = createContextInjectorMiddleware(
  isTopicContext,
  "EBUS Pub/Sub context was not prepended to the meta array."
);
