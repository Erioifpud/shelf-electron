import type { MaybePromise } from "packages/transport/dist/index.mjs";
import type { Env } from "../api/env";
import type { Middleware } from "../api/middleware";
import { mark, type PhantomData } from "../types/common";

/**
 * A unique symbol used to brand procedure objects.
 * This allows for reliable runtime type checking via `isProcedure`.
 * @internal
 */
export const __procedure_brand: unique symbol = Symbol("__procedure_brand");

/**
 * The base type for all erpc procedures.
 * It carries compile-time type information about its context, input, and output,
 * as well as runtime information like its type and associated middlewares.
 *
 * @template InitCtx The required initial context type.
 * @template FinalCtx The context type after all middlewares have run.
 * @template Input The tuple type of the procedure's input arguments.
 * @template Output The return type of the procedure.
 */
export type Procedure<
  InitCtx,
  FinalCtx,
  Input extends Array<unknown>,
  Output,
> = {
  /** @internal */
  [__procedure_brand]: void;
  /** A phantom type carrying the procedure's required initial context type. */
  initialContext: PhantomData<InitCtx>;
  /** A phantom type carrying the procedure's final context type for the handler. */
  context: PhantomData<FinalCtx>;
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
  InitCtx,
  FinalCtx,
  Input extends Array<unknown>,
  Output,
> = Procedure<InitCtx, FinalCtx, Input, Output> & {
  type: "ask";
  /** @internal The internal handler function for this procedure. */
  _handler: (env: Env<FinalCtx>, ...args: Input) => MaybePromise<Output>;
};

/**
 * A procedure for fire-and-forget (notification) style communication.
 * It does not return a value to the caller.
 */
export type TellProcedure<
  InitCtx,
  FinalCtx,
  Input extends Array<unknown>,
> = Procedure<InitCtx, FinalCtx, Input, void> & {
  type: "tell";
  /** @internal The internal handler function for this procedure. */
  _handler: (env: Env<FinalCtx>, ...args: Input) => MaybePromise<void>;
};

/**
 * A procedure that can handle calls to any sub-path.
 * Useful for implementing dynamic routing or forwarding.
 */
export type DynamicProcedure<
  InitCtx,
  FinalCtx,
  TInput extends Array<unknown>,
  TOutput,
> = Procedure<InitCtx, FinalCtx, TInput, TOutput> & {
  type: "dynamic";
  /** @internal The internal handler function for this procedure. */
  _handler: (
    env: Env<FinalCtx>,
    path: string[],
    args: TInput,
    type: "ask" | "tell"
  ) => Promise<TOutput>;
};

/**
 * Creates a new 'ask' (request-response) procedure.
 * @param handler The function to execute when this procedure is called.
 * @param middlewares An array of middlewares to apply before the handler.
 * @returns An `AskProcedure` object.
 * @internal
 */
export function createAskProcedure<
  InitCtx,
  FinalCtx,
  Input extends Array<unknown>,
  Output,
>(
  handler: (env: Env<FinalCtx>, ...args: Input) => MaybePromise<Output>,
  middlewares: Middleware<any>[] = []
): AskProcedure<InitCtx, FinalCtx, Input, Output> {
  return {
    [__procedure_brand]: undefined,
    initialContext: mark<InitCtx>(),
    context: mark<FinalCtx>(),
    input: mark<Input>(),
    output: mark<Output>(),
    middlewares,
    type: "ask",
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
export function createTellProcedure<InitCtx, FinalCtx, Input extends Array<unknown>>(
  handler: (env: Env<FinalCtx>, ...args: Input) => MaybePromise<void>,
  middlewares: Middleware<any>[] = []
): TellProcedure<InitCtx, FinalCtx, Input> {
  return {
    [__procedure_brand]: undefined,
    initialContext: mark<InitCtx>(),
    context: mark<FinalCtx>(),
    input: mark<Input>(),
    output: mark<void>(),
    middlewares,
    type: "tell",
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
  InitCtx,
  FinalCtx,
  TInput extends Array<unknown>,
  TOutput,
>(
  handler: (
    env: Env<FinalCtx>,
    path: string[],
    args: TInput,
    type: "ask" | "tell"
  ) => Promise<TOutput>,
  middlewares: Middleware<any>[] = []
): DynamicProcedure<InitCtx, FinalCtx, TInput, TOutput> {
  return {
    [__procedure_brand]: undefined,
    initialContext: mark<InitCtx>(),
    context: mark<FinalCtx>(),
    input: mark<TInput>(),
    output: mark<TOutput>(),
    middlewares,
    type: "dynamic",
    _handler: handler,
  };
}
