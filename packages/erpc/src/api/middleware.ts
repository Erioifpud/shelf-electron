import type { JsonValue } from '@eleplug/transport';
import { mark, type PhantomData } from '../types/common';

/**
 * A unique symbol used to mark a type that should not be transformed by a
 * middleware, but rather passed through to the next link in the chain.
 * @internal
 */
export declare const __passThrough: unique symbol;

/**
 * A sentinel type indicating that a value (like context or input) should be
 * passed through a middleware without modification.
 */
export type PassThrough = {
  [__passThrough]: void
};

// =================================================================
// SECTION 1: Middleware Definition
// =================================================================

/**
 * Defines the type transformation signature of a middleware.
 *
 * This definition describes how a middleware modifies the four key aspects of a
 * procedure call as it flows through the "onion":
 * - `Ctx`: The context object.
 * - `Entr` (Entry): The input arguments array.
 * - `Exit`: The final return value (output).
 */
export type MiddlewareDef = {
  /** The context type the middleware expects to receive (`Ctx In`). */
  CtxIn?: unknown;
  /** The context type the middleware will pass to the next step (`Ctx Out`). */
  CtxOut?: unknown;
  /** The input arguments array the middleware expects from the previous step (`Entry In`). */
  EntrIn?: unknown[];
  /** The input arguments array the middleware will pass to the next step (`Entry Out`). */
  EntrOut?: unknown[];
  /** The output type (return value) the middleware expects from the next step (`Exit In`). */
  ExitIn?: unknown;
  /** The final output type the middleware will produce (`Exit Out`). */
  ExitOut?: unknown;
};

// #region Middleware Type Helpers
// These helpers safely extract specific types from a MiddlewareDef, defaulting to PassThrough.

/** @internal Extracts the input context type from a middleware definition. */
export type GetCtxIn<TDef extends MiddlewareDef> = TDef extends { CtxIn: any } ? TDef['CtxIn'] : PassThrough;
/** @internal Extracts the output context type from a middleware definition. */
export type GetCtxOut<TDef extends MiddlewareDef> = TDef extends { CtxOut: any } ? TDef['CtxOut'] : GetCtxIn<TDef>;
/** @internal Extracts the input arguments type from a middleware definition. */
export type GetEntrIn<TDef extends MiddlewareDef> = TDef extends { EntrIn: any[] } ? TDef['EntrIn'] : PassThrough[];
/** @internal Extracts the output arguments type from a middleware definition. */
export type GetEntrOut<TDef extends MiddlewareDef> = TDef extends { EntrOut: any[] } ? TDef['EntrOut'] : GetEntrIn<TDef>;
/** @internal Extracts the expected return type from the next step. */
export type GetExitIn<TDef extends MiddlewareDef> = TDef extends { ExitIn: any } ? TDef['ExitIn'] : PassThrough;
/** @internal Extracts the final return type of the middleware. */
export type GetExitOut<TDef extends MiddlewareDef> = TDef extends { ExitOut: any } ? TDef['ExitOut'] : GetExitIn<TDef>;
// #endregion

/**
 * The core implementation function for a middleware.
 *
 * @param opts An object containing the current state of the call.
 * @param opts.ctx The current context object.
 * @param opts.input The current input arguments.
 * @param opts.meta Optional metadata from the client.
 * @param opts.path The full path of the procedure being called.
 * @param opts.type The type of the call ('ask' or 'tell').
 * @param opts.next A function to call the next middleware or handler in the chain.
 *   It can be awaited and may be called with a transformed context or input.
 * @returns The final result of the call, possibly transformed by this middleware.
 */
export type MiddlewareHandler<TDef extends MiddlewareDef> = (opts: {
  ctx: GetCtxIn<TDef>;
  input: GetEntrIn<TDef>;
  meta: JsonValue[];
  path: string;
  type: 'ask' | 'tell';
  next: (opts?: {
    ctx?: GetCtxOut<TDef>;
    input?: GetEntrOut<TDef>;
    meta?: JsonValue[];
  }) => Promise<GetExitIn<TDef>>;
}) => Promise<GetExitOut<TDef>>;

/**
 * Represents a middleware, bundling its type definition and its handler function.
 */
export type Middleware<TDef extends MiddlewareDef> = {
  /** A phantom type carrying the middleware's type definition. */
  def: PhantomData<TDef>;
  /** The actual middleware implementation. */
  handler: MiddlewareHandler<TDef>;
};

/**
 * A factory function for creating a new, type-safe middleware.
 * This is the standard way to define a middleware, as it provides strong
 * type inference for the handler's options and return value.
 *
 * @example
 * ```ts
 * const loggingMiddleware = middleware(async (opts) => {
 *   console.log(`Calling ${opts.path}`);
 *   const result = await opts.next(); // Call the next middleware/handler
 *   console.log(`Finished ${opts.path}`);
 *   return result;
 * });
 * ```
 */
export function middleware<const TDef extends MiddlewareDef>(
  handler: MiddlewareHandler<TDef>
): Middleware<TDef> {
  return {
    def: mark<TDef>(),
    handler,
  };
}