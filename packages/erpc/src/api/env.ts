import type { JsonValue } from "@eleplug/transport";

/**
 * Represents the full environment available within a procedure's handler
 * or a middleware function. It encapsulates all contextual information
 * for a single RPC call.
 *
 * @template C The type of the final, processed context object. This context
 * is the result of the initial context being passed through all applicable
 * middleware.
 */
export interface Env<C> {
  /**
   * The context object for the current call. It starts as the initial
   * context and is then transformed by any middleware in the chain.
   */
  readonly ctx: C;

  /**
   * Optional metadata passed from the client alongside the procedure call.
   *
   * This is useful for passing call-specific, out-of-band information like
   * authentication tokens or tracing IDs, without including them as formal
   * procedure parameters. It is always an array of JSON-compatible values.
   */
  readonly meta?: JsonValue[];

  /**
   * Returns `true` if the server has initiated its shutdown process.
   *
   * Procedures can check this flag to avoid starting new long-running tasks
   * or to perform cleanup during a graceful shutdown.
   */
  readonly isClosing: () => boolean;
}
