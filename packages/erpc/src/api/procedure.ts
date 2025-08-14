import type { MaybePromise } from "packages/transport/dist/index.mjs";
import type { Env } from "../api/env";
import type { Middleware } from "../api/middleware";
import { mark, type PhantomData } from "../types/common";

/**
 * A unique symbol used to brand procedure objects.
 * This allows for reliable runtime type checking via `isProcedure`.
 * @internal
 */
export const __procedure_brand: unique symbol = Symbol('__procedure_brand');

/**
 * The base type for all erpc procedures.
 * It carries compile-time type information about its context, input, and output,
 * as well as runtime information like its type and associated middlewares.
 *
 * @template Ctx The context type required by the procedure's handler.
 * @template Input The tuple type of the procedure's input arguments.
 * @template Output The return type of the procedure.
 */
export type Procedure<
  Ctx, Input extends Array<unknown>, Output
> = {
  /** @internal */
  [__procedure_brand]: void;
  /** A phantom type carrying the procedure's expected context type. */
  context: PhantomData<Ctx>;
  /** A phantom type carrying the procedure's expected input arguments type. */
  input: PhantomData<Input>;
  /** A phantom type carrying the procedure's expected output type. */
  output: PhantomData<Output>;
  /** The type of the procedure, e.g., 'ask', 'tell', or 'dynamic'. */
  type: string;
  /** An array of middlewares to be executed before the handler. */
  middlewares: Middleware<any>[];
};

/**
 * A procedure for request-response (RPC) style communication.
 * It expects a handler that returns a value.
 */
export type AskProcedure<
  Ctx, Input extends Array<unknown>, Output
> = Procedure<Ctx, Input, Output> & {
  type: 'ask';
  /** @internal The internal handler function for this procedure. */
  _handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<Output>;
};

/**
 * A procedure for fire-and-forget (notification) style communication.
 * It does not return a value to the caller.
 */
export type TellProcedure<
  Ctx, Input extends Array<unknown>
> = Procedure<Ctx, Input, void> & {
  type: 'tell';
  /** @internal The internal handler function for this procedure. */
  _handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<void>;
};

/**
 * A procedure that can handle calls to any sub-path.
 * Useful for implementing dynamic routing or forwarding.
 */
export type DynamicProcedure<
  Ctx, TInput extends Array<unknown>, TOutput
> = Procedure<Ctx, TInput, TOutput> & {
  type: 'dynamic';
  /** @internal The internal handler function for this procedure. */
  _handler: (env: Env<Ctx>, path: string[], args: TInput, type: 'ask' | 'tell') => Promise<TOutput>;
}

/**
 * Creates a new 'ask' (request-response) procedure.
 * @param handler The function to execute when this procedure is called.
 * @param middlewares An array of middlewares to apply before the handler.
 * @returns An `AskProcedure` object.
 * @internal
 */
export function createAskProcedure<
  Ctx, Input extends Array<unknown>, Output
>(
  handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<Output>,
  middlewares: Middleware<any>[] = []
): AskProcedure<Ctx, Input, Output> {
  return {
    [__procedure_brand]: undefined,
    context: mark<Ctx>(),
    input: mark<Input>(),
    output: mark<Output>(),
    middlewares,
    type: 'ask',
    _handler: handler,
  };
}

/**
 * Creates a new 'tell' (fire-and-forget) procedure.
 * @param handler The function to execute when this procedure is called.
 * @param middlewares An array of middlewares to apply before the handler.
 * @returns A `TellProcedure` object.
 * @internal
 */
export function createTellProcedure<
  Ctx, Input extends Array<unknown>
>(
  handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<void>,
  middlewares: Middleware<any>[] = []
): TellProcedure<Ctx, Input> {
  return {
    [__procedure_brand]: undefined,
    context: mark<Ctx>(),
    input: mark<Input>(),
    output: mark<void>(),
    middlewares,
    type: 'tell',
    _handler: handler,
  };
}

/**
 * Creates a new 'dynamic' procedure that handles all sub-paths.
 * @param handler The function to execute for any call under this procedure's path.
 * @param middlewares An array of middlewares to apply before the handler.
 * @returns A `DynamicProcedure` object.
 * @internal
 */
export function createDynamicProcedure<
  Ctx, TInput extends Array<unknown>, TOutput
>(
  handler: (env: Env<Ctx>, path: string[], args: TInput, type: 'ask' | 'tell') => Promise<TOutput>,
  middlewares: Middleware<any>[] = []
): DynamicProcedure<Ctx, TInput, TOutput> {
  return {
    [__procedure_brand]: undefined,
    context: mark<Ctx>(),
    input: mark<TInput>(),
    output: mark<TOutput>(),
    middlewares,
    type: 'dynamic', 
    _handler: handler,
  };
}