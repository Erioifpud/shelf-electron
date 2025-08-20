import type { Env } from "../api/env";
import type {
  InferSchemaTuple,
  Schema,
  Transferable,
  TransferableArray,
} from "../types/common";
import { IllegalParameterError, IllegalResultError } from "../types/errors";
import {
  middleware,
  type GetCtxIn,
  type GetCtxOut,
  type GetEntrIn,
  type GetEntrOut,
  type GetExitIn,
  type GetExitOut,
  type Middleware,
  type MiddlewareDef,
  type PassThrough,
} from "./middleware";
import {
  createAskProcedure,
  createDynamicProcedure,
  createTellProcedure,
  type AskProcedure,
  type DynamicProcedure,
  type TellProcedure,
} from "./procedure";

/**
 * A type-safe, fluent builder for creating procedures.
 *
 * This builder uses generic parameters to track the state of the procedure's
 * types (`CurrentCtx`, `NextInput`, `ExpectedExit`) as middlewares and
 * validators are applied, providing excellent autocompletion and compile-time
 * error checking.
 */
export type ProcedureBuilder<
  InitCtx,
  TInput extends Array<unknown>,
  TOutput,
  CurrentCtx,
  NextInput extends Array<unknown>,
  ExpectedExit,
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
    middleware: Middleware<NextDef> &
      // Context compatibility check
      ([CurrentCtx] extends [GetCtxIn<NextDef>]
        ? unknown
        : GetCtxIn<NextDef> extends PassThrough
          ? unknown
          : {
              readonly __error: "Middleware context mismatch: The context from the preceding chain is incompatible with this middleware's expected input context.";
              readonly expected_context_type: GetCtxIn<NextDef>;
              readonly actual_context_type: CurrentCtx;
            }) &
      // Input arguments compatibility check
      ([NextInput] extends [GetEntrIn<NextDef>]
        ? unknown
        : GetEntrIn<NextDef> extends PassThrough[]
          ? unknown
          : {
              readonly __error: "Middleware input mismatch: The arguments from the preceding chain are incompatible with this middleware's expected input arguments.";
              readonly expected_input_type: GetEntrIn<NextDef>;
              readonly actual_input_type: NextInput;
            }) &
      // Output compatibility check
      ([GetExitOut<NextDef>] extends [ExpectedExit]
        ? unknown
        : ExpectedExit extends PassThrough
          ? unknown
          : {
              readonly __error: "Middleware output mismatch: The final return value from this middleware is incompatible with what the preceding chain expects to receive.";
              readonly middleware_returns: GetExitOut<NextDef>;
              readonly chain_expects: ExpectedExit;
            })
  ): ProcedureBuilder<
    InitCtx,
    TInput,
    TOutput,
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
    InitCtx,
    TInput,
    TOutput,
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
    InitCtx,
    TInput,
    TOutput,
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
    Output extends ExpectedExit extends PassThrough ? TOutput : ExpectedExit,
  >(
    handler: ((
      env: Env<CurrentCtx>,
      ...args: Input
    ) => Output | Promise<Output>) &
      // Provides a clear error message if the handler's input doesn't match the builder's state.
      (Input extends NextInput
        ? unknown
        : {
            __error: "Handler's input type does not match the middleware chain's output type";
            expected: NextInput;
            got: Input;
          })
  ): AskProcedure<
    InitCtx,
    CurrentCtx,
    NextInput extends PassThrough[] | unknown[] ? Input : NextInput,
    Output extends Transferable ? Output : void
  >;

  /**
   * Defines a fire-and-forget procedure ('tell').
   * The chain is terminated, and a final handler is provided.
   *
   * @param handler The final logic to execute. Its return value is ignored.
   */
  tell<Input extends TInput>(
    handler: ((
      env: Env<CurrentCtx>,
      ...args: Input
    ) =>
      | (PassThrough extends ExpectedExit ? void : ExpectedExit)
      | Promise<PassThrough extends ExpectedExit ? void : ExpectedExit>) &
      (Input extends NextInput
        ? unknown
        : {
            __error: "Handler's input type does not match the middleware chain's output type";
            expected: NextInput;
            got: Input;
          })
  ): TellProcedure<
    InitCtx,
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
    handler: (
      env: Env<CurrentCtx>,
      path: string[],
      args: TInput,
      type: "ask" | "tell"
    ) => Promise<void | TOutput>
  ): DynamicProcedure<InitCtx, CurrentCtx, TInput, TOutput>;
};

/**
 * The internal implementation that constructs a ProcedureBuilder.
 * @internal
 */
export function createProcedureBuilder<InitCtx, TInput extends Array<unknown>, TOutput>(
  initialMiddlewares: Middleware<any>[] = []
): ProcedureBuilder<InitCtx, TInput, TOutput, InitCtx, any, any> {
  // This is a factory function that creates a new builder object.
  // Using a function ensures that chaining `.use()` creates a new immutable object.
  const builderFactory = (
    middlewares: Middleware<any>[]
  ): ProcedureBuilder<InitCtx, TInput, TOutput, any, any, any> => {
    return {
      use(
        middlewareToAdd: any
      ): ProcedureBuilder<InitCtx, TInput, TOutput, any, any, any> {
        return builderFactory([...middlewares, middlewareToAdd]);
      },

      input<const TSchemas extends readonly Schema[]>(
        ...schemas: TSchemas
      ): ProcedureBuilder<InitCtx, TInput, TOutput, any, any, any> {
        const validationMiddleware = middleware<{
          EntrIn: any[];
          EntrOut: InferSchemaTuple<TSchemas>;
        }>((opts) => {
          const { input, next } = opts;
          try {
            if (schemas.length !== input.length) {
              throw new Error(
                `Expected ${schemas.length} arguments, but received ${input.length}.`
              );
            }
            const parsedInput = schemas.map((schema, i) =>
              schema.parse(input[i])
            );
            return next({ ...opts, input: parsedInput as any });
          } catch (error: any) {
            throw new IllegalParameterError(
              `Input validation failed: ${error.message}`,
              error
            );
          }
        });
        // 'this' here refers to the current builder object.
        return this.use(validationMiddleware);
      },

      output<const TSchema extends Schema>(
        schema: TSchema
      ): ProcedureBuilder<InitCtx, TInput, TOutput, any, any, any> {
        const validationMiddleware = middleware<{
          ExitIn: unknown;
          ExitOut: TSchema extends Schema<infer T> ? T : never;
        }>(async (opts) => {
          const result = await opts.next();
          try {
            return schema.parse(result);
          } catch (error: any) {
            throw new IllegalResultError(
              `Output validation failed: ${error.message}`,
              error
            );
          }
        });
        return this.use(validationMiddleware);
      },

      ask(handler: any): AskProcedure<InitCtx, any, any, any> {
        return createAskProcedure(handler, middlewares);
      },

      tell(handler: any): TellProcedure<InitCtx, any, any> {
        return createTellProcedure(handler, middlewares);
      },

      dynamic(handler: any): DynamicProcedure<InitCtx, any, any, any> {
        return createDynamicProcedure(handler, middlewares);
      },
    };
  };

  return builderFactory(initialMiddlewares);
}

/**
 * The main entry point for creating an eRPC procedure.
 * This is a default, root-level procedure builder that you can use to define
 * your API endpoints.
 *
 * @example
 * ```ts
 * import { p2p } from 'erpc';
 *
 * // A simple procedure
 * const greet = p2p.ask((env, name: string) => `Hello, ${name}!`);
 *
 * // A procedure with input validation
 * const createUser = p2p
 *   .input(z.string().min(3))
 *   .ask((env, name) => {
 *     // ... create user logic
 *   });
 *
 * // An API router definition
 * const appRouter = {
 *   greet,
 *   user: {
 *     create: createUser,
 *   }
 * };
 *
 * // This router can now be passed to `createServer`.
 * ```
 */
export const rpc: ProcedureBuilder<
  void,
  TransferableArray,
  Transferable,
  void, // Initial Context is void
  any[], // Initial Input is any array before validation
  PassThrough // Initial Expected Exit type is PassThrough
> = createProcedureBuilder<void, TransferableArray, Transferable>();
