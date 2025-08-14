import type { Env } from "../api/env";
import type { InferSchemaTuple, Schema, TransferableArray } from "../types/common";
import { IllegalParameterError, IllegalResultError } from "../types/errors";
import type { Router } from "./api";
import { middleware, type GetCtxIn, type GetCtxOut, type GetEntrIn, type GetEntrOut, type GetExitIn, type GetExitOut, type Middleware, type MiddlewareDef, type PassThrough } from "./middleware";
import { createAskProcedure, createDynamicProcedure, createTellProcedure, type AskProcedure, type DynamicProcedure, type TellProcedure } from "./procedure";


/**
 * The core instance returned by `initERPC.create()`.
 * It provides the main building blocks for defining an API.
 */
export type ErpcInstance<
  Ctx,
  TInput extends Array<unknown>,
  TOutput,
> = {
  /**
   * The procedure builder for this erpc instance.
   * Use this to define individual RPC endpoints with middleware, validation, and handlers.
   */
  procedure: ProcedureBuilder<TInput, TOutput, Ctx, any[], any>;
  /**
   * The router factory. Use this to group procedures and other routers
   * into a nested API structure. It's an identity function that preserves types.
   */
  router: <TRouter extends Router<TInput, TOutput>>(
    route: TRouter,
  ) => TRouter;
};

/**
 * A type-safe, fluent builder for creating procedures.
 *
 * This builder uses generic parameters to track the state of the procedure's
 * types (`CurrentCtx`, `NextInput`, `ExpectedExit`) as middlewares and
 * validators are applied, providing excellent autocompletion and compile-time
 * error checking.
 */
export type ProcedureBuilder<
  TInput extends Array<unknown>, TOutput, CurrentCtx, NextInput extends Array<unknown>, ExpectedExit
> = {
  /**
   * Applies a middleware to the procedure.
   *
   * The complex conditional types in this method's signature are a key feature
   * of eRPC's developer experience. They perform compile-time checks to ensure
   * that the middleware being added is compatible with the current state of
   * the procedure chain (in terms of context, input, and output types).
   * If there's a mismatch, a descriptive error is shown in the IDE.
   */
  use<NextDef extends MiddlewareDef>(
    middleware: Middleware<NextDef> & (
      // Context compatibility check
      [CurrentCtx] extends [GetCtxIn<NextDef>] ? unknown :
      GetCtxIn<NextDef> extends PassThrough ? unknown : {
        readonly __error: "Middleware context mismatch: The context from the preceding chain is incompatible with this middleware's expected input context.";
        readonly expected_context_type: GetCtxIn<NextDef>;
        readonly actual_context_type: CurrentCtx;
      }
    ) & (
      // Input arguments compatibility check
      [NextInput] extends [GetEntrIn<NextDef>] ? unknown :
      GetEntrIn<NextDef> extends PassThrough[] ? unknown : {
        readonly __error: "Middleware input mismatch: The arguments from the preceding chain are incompatible with this middleware's expected input arguments.";
        readonly expected_input_type: GetEntrIn<NextDef>;
        readonly actual_input_type: NextInput;
      }
    ) & (
      // Output compatibility check
      [GetExitOut<NextDef>] extends [ExpectedExit] ? unknown :
      ExpectedExit extends PassThrough ? unknown : {
        readonly __error: "Middleware output mismatch: The final return value from this middleware is incompatible with what the preceding chain expects to receive.";
        readonly middleware_returns: GetExitOut<NextDef>;
        readonly chain_expects: ExpectedExit;
      }
    )
  ): ProcedureBuilder<
      TInput, TOutput,
      // Update the builder's state with the output types of the middleware.
      GetCtxOut<NextDef> extends PassThrough ? CurrentCtx : GetCtxOut<NextDef>,
      GetEntrOut<NextDef> extends PassThrough[] ? NextInput : GetEntrOut<NextDef>,
      GetExitIn<NextDef> extends PassThrough ? ExpectedExit : GetExitIn<NextDef>
  >;

  /**
   * Validates the input arguments of the procedure using an array of schemas.
   * This is syntactic sugar for applying a validation middleware.
   *
   * @param schemas An array of schemas (e.g., from Zod) to validate arguments.
   * The length of the array must match the number of expected arguments.
   */
  input<const TSchemas extends readonly Schema[]>(
    ...schemas: TSchemas
  ): ProcedureBuilder<
    TInput, TOutput,
    CurrentCtx,
    InferSchemaTuple<TSchemas>, // The parsed output becomes the new input for the next step.
    ExpectedExit
  >;

  /**
   * Validates the return value of the procedure.
   * This is syntactic sugar for applying a validation middleware.
   *
   * @param schema A schema (e.g., from Zod) to validate the return value.
   */
  output<const TSchema extends Schema>(
    schema: TSchema
  ): ProcedureBuilder<
    TInput, TOutput,
    CurrentCtx,
    NextInput,
    TSchema extends Schema<infer T> ? T : never // The parsed output becomes the new expected output.
  >;

  /**
   * Defines a request-response procedure ('ask').
   * The chain is terminated, and a final handler is provided.
   *
   * @param handler The final logic to execute. The type annotation ensures
   * the handler's input signature matches the output of the preceding middleware chain.
   */
  ask<
    Input extends TInput,
    Output extends (ExpectedExit extends PassThrough ? TOutput : ExpectedExit)
  >(
    handler: ((env: Env<CurrentCtx>, ...args: Input) => Output | Promise<Output>)
      // Provides a clear error message if the handler's input doesn't match the builder's state.
      & (Input extends NextInput ? unknown : { __error: "Handler's input type does not match the middleware chain's output type", expected: NextInput, got: Input })
  ): AskProcedure<
      CurrentCtx,
      NextInput extends PassThrough[] | unknown[] ? Input : NextInput,
      Output extends Transferable? Output : void
  >;

  /**
   * Defines a fire-and-forget procedure ('tell').
   * The chain is terminated, and a final handler is provided.
   *
   * @param handler The final logic to execute. Its return value is ignored.
   */
  tell<
    Input extends TInput
  >(
    handler: ((env: Env<CurrentCtx>, ...args: Input) => (void extends ExpectedExit ? void : ExpectedExit) | Promise<void extends ExpectedExit ? void : ExpectedExit>)
      & (Input extends NextInput ? unknown : { __error: "Handler's input type does not match the middleware chain's output type", expected: NextInput, got: Input })
  ): TellProcedure<
      CurrentCtx,
      NextInput extends PassThrough[] | unknown[] ? Input : NextInput
  >;

  /**
   * Defines a dynamic procedure that can handle any sub-path.
   * The chain is terminated, and a final handler is provided.
   *
   * @param handler A handler that receives the remaining path segments and arguments.
   */
  dynamic(
     handler: ((env: Env<CurrentCtx>, path: string[], args: TInput, type: 'ask' | 'tell') => Promise<void | TOutput>),
  ): DynamicProcedure<CurrentCtx, TInput, TOutput>;
}

/**
 * The internal implementation of the eRPC instance and procedure builder.
 * @internal
 */
class ErpcInstanceBuilder<CurrentCtx, TInput extends Array<unknown>, TOutput> {
  private readonly _middlewares: Middleware<any>[];
  constructor(middlewares: Middleware<any>[] = []) {
    this._middlewares = middlewares;
  }

  public use<NextDef extends MiddlewareDef>(
    middleware: Middleware<NextDef>
  ): ErpcInstanceBuilder<GetCtxOut<NextDef>, TInput, TOutput> {
    // Returns a new builder instance with the added middleware.
    return new ErpcInstanceBuilder<GetCtxOut<NextDef>, TInput, TOutput>([
      ...this._middlewares,
      middleware
    ]);
  }

  public create(): ErpcInstance<CurrentCtx, TInput, TOutput> {
    // The `procedure` function recursively builds a new `ProcedureBuilder`
    // by appending middlewares to its internal list.
    const procedure = (middlewares: Middleware<any>[]) => {return {
      use(middleware: any): ProcedureBuilder<TInput, TOutput, any, any, any> {
        return procedure([...middlewares, middleware]);
      },

      input<const TSchemas extends readonly Schema[]>(
        ...schemas: TSchemas
      ): ProcedureBuilder<TInput, TOutput, any, any, any> {
        // .input() is implemented by creating and applying a validation middleware.
        const validationMiddleware = middleware<{
          EntrIn: any[], // Accepts any raw input from the transport.
          EntrOut: InferSchemaTuple<TSchemas> // Outputs parsed, typed input for the next step.
        }>((opts) => {
          const { input, next } = opts;
          try {
            if (schemas.length !== input.length) {
              throw new Error(`Expected ${schemas.length} arguments, but received ${input.length}.`);
            }
            const parsedInput = schemas.map((schema, i) => schema.parse(input[i]));
            return next({ ...opts, input: parsedInput as any });
          } catch (error: any) {
            throw new IllegalParameterError(`Input validation failed: ${error.message}`, error);
          }
        });
        return this.use(validationMiddleware);
      },
    
      output<const TSchema extends Schema>(
        schema: TSchema
      ): ProcedureBuilder<TInput, TOutput, any, any, any> {
        // .output() is also implemented via a validation middleware.
        const validationMiddleware = middleware<{
          ExitIn: unknown; // Accepts any raw output from the handler.
          ExitOut: TSchema extends Schema<infer T> ? T : never; // Outputs parsed, typed output.
        }>(async (opts) => {
          const result = await opts.next();
          try {
            return schema.parse(result);
          } catch (error: any) {
            throw new IllegalResultError(`Output validation failed: ${error.message}`, error);
          }
        });
        return this.use(validationMiddleware);
      },
    
      ask(handler: any): AskProcedure<any, any, any> {
        return createAskProcedure(handler, middlewares);
      },
    
      tell(handler: any): TellProcedure<any, any> {
        return createTellProcedure(handler, middlewares);
      },

      dynamic(handler: any): DynamicProcedure<any, any, any> {
        return createDynamicProcedure(handler, middlewares);
      }
    }}

    const instance: ErpcInstance<CurrentCtx, TInput, TOutput> = {
      procedure: procedure(this._middlewares),
      // The router is a simple identity function for type-safe grouping.
      router: (route) => route,
    };
    return instance;
  }
}

/**
 * Creates the main `initERPC` entry point.
 * @internal
 */
function createInit() {
  return {
    /**
     * Creates a new erpc instance with a default `void` context.
     * This is the starting point for defining any eRPC API.
     *
     * @template TInput The default input type for procedures, defaults to `TransferableArray`.
     * @template TOutput The default output type for procedures, defaults to `Transferable`.
     */
    create<TInput extends Array<unknown> = TransferableArray, TOutput = Transferable>() {
      return new ErpcInstanceBuilder<void, TInput, TOutput>().create();
    },
  };
}

/**
 * The main entry point for creating an eRPC API definition.
 *
 * @example
 * ```ts
 * const e = initERPC.create();
 *
 * const appRouter = e.router({
 *   greeting: e.procedure.ask(
 *     (env, name: string) => `Hello, ${name}!`
 *   ),
 * });
 * ```
 */
export const initERPC = createInit();