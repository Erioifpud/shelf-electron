import type { MaybePromise } from "packages/transport/dist/index.mjs";
import type { Env } from "../api/env";
import { Trie } from "../utils/trie";
import type { Api } from "./api";
import type { Middleware } from "./middleware";
import {
  __procedure_brand,
  type AskProcedure,
  type DynamicProcedure,
  type Procedure,
  type TellProcedure,
} from "./procedure";

/**
 * Executes a chain of middlewares followed by a final handler.
 * This function implements the "onion model" where each middleware can execute
 * code before and after calling the next middleware in the chain.
 *
 * @param options - The execution options.
 * @param options.middlewares - The array of middlewares to execute.
 * @param options.env - The base environment for the call.
 * @param options.path - The procedure path.
 * @param options.type - The call type ('ask' or 'tell').
 * @param options.input - The initial input arguments.
 * @param options.finalHandler - The actual procedure handler to call after all middlewares have run.
 * @returns The result from the final handler, potentially modified by the middleware chain.
 * @internal
 */
async function executeMiddlewareChain<
  TInput extends Array<unknown>,
  Output,
>(options: {
  middlewares: Middleware<any>[];
  env: Env<any>;
  path: string;
  type: "ask" | "tell";
  input: TInput;
  finalHandler: (env: Env<any>, input: TInput) => MaybePromise<Output | void>;
}): Promise<any> {
  const { middlewares, env, path, type, input, finalHandler } = options;

  // The dispatch function recursively calls the next middleware in the chain.
  const dispatch = async (
    index: number,
    currentOpts: { ctx: any; input: TInput; meta: any }
  ): Promise<any> => {
    // If we've run out of middlewares, call the final procedure handler.
    if (index >= middlewares.length) {
      const finalEnv: Env<any> = {
        ...env,
        ctx: currentOpts.ctx,
        meta: currentOpts.meta,
      };
      return finalHandler(finalEnv, currentOpts.input);
    }

    const middleware = middlewares[index];
    const next = (nextPartialOpts?: {
      ctx?: any;
      input?: TInput;
      meta?: any;
    }) => {
      // The `next` function passed to the middleware allows it to call the next one in the chain.
      const newOpts = { ...currentOpts, ...nextPartialOpts };
      return dispatch(index + 1, newOpts);
    };

    // The context (`ctx`, `input`, `meta`) can be transformed by each middleware.
    // The `any` type is used here for internal flexibility, as type safety is
    // enforced at the procedure definition level by the `ProcedureBuilder`.
    const middlewareEnv = { ...env, ...currentOpts };
    return middleware.handler({ ...middlewareEnv, path, type, next });
  };

  // Start the execution chain from the first middleware.
  return dispatch(0, { ctx: env.ctx, meta: env.meta, input });
}

/**
 * A discriminated union representing the result of a procedure execution.
 * @template TOutput The type of the data on success.
 */
export type ProcedureExecutionResult<TOutput> =
  | {
      success: true;
      data: TOutput;
    }
  | {
      success: false;
      error: Error;
    };

/**
 * A collection of pure functions for handling RPC requests for a given API definition.
 * These handlers are decoupled from the transport layer, focusing solely on
 * procedure lookup and execution.
 * @internal
 */
export type ProcedureHandlers<TInput extends Array<unknown>, TOutput> = {
  /** A function to execute an 'ask' (request-response) call. */
  handleAsk: (
    env: Env<any>,
    path: string,
    input: TInput
  ) => Promise<ProcedureExecutionResult<TOutput> | void>;
  /** A function to execute a 'tell' (fire-and-forget) call. */
  handleTell: (env: Env<any>, path: string, input: TInput) => Promise<void>;
};

/**
 * A type guard to check if an API object is a `Procedure`.
 * @param api The API object to check.
 * @returns `true` if the object is a branded procedure.
 */
export function isProcedure(
  api: Api<any, any, any>
): api is Procedure<any, any, any, any> {
  return __procedure_brand in api;
}

/**
 * Creates a set of pure handlers for a given API definition.
 *
 * This function is a cornerstone of the server-side implementation. It traverses
 * the user-defined API router, indexes all procedures, and returns a simple
 * object with methods to execute those procedures. This decouples the core
 * execution logic from the transport and protocol layers.
 *
 * @param api The complete API definition (a router or a single procedure).
 * @returns An object with `handleAsk` and `handleTell` methods for executing procedures.
 */
export function createProcedureHandlers<
  TInput extends Array<unknown>,
  TOutput,
  TApi extends Api<void, TInput, TOutput>,
>(api: TApi): ProcedureHandlers<TInput, TOutput> {
  const staticProcedureMap = new Map<string, Procedure<any, any, TInput, TOutput>>();
  const dynamicProcedureTrie = new Trie<
    DynamicProcedure<any, any, TInput, TOutput>
  >();

  /** Recursively traverses the API tree to populate the procedure maps. */
  const buildProcedureMaps = (
    currentApi: Api<any, TInput, TOutput>,
    prefix = ""
  ): void => {
    if (isProcedure(currentApi)) {
      if (currentApi.type === "dynamic") {
        dynamicProcedureTrie.insert(
          prefix,
          currentApi as DynamicProcedure<any, any, TInput, TOutput>
        );
      } else {
        staticProcedureMap.set(prefix, currentApi);
      }
    } else {
      // It's a router
      for (const key in currentApi) {
        if (Object.prototype.hasOwnProperty.call(currentApi, key)) {
          const prop = currentApi[key];
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          buildProcedureMaps(prop, newPrefix);
        }
      }
    }
  };
  buildProcedureMaps(api);

  /** Finds a procedure matching a given path, prioritizing static over dynamic matches. */
  const findProcedure = (
    path: string
  ):
    | { procedure: Procedure<any, any, any, any>; relativePath?: string[] }
    | undefined => {
    // 1. Check for a direct match in the static map (most common and fastest).
    const staticProc = staticProcedureMap.get(path);
    if (staticProc) return { procedure: staticProc };

    // 2. If not found, search the Trie for the longest matching dynamic procedure prefix.
    const dynamicMatch = dynamicProcedureTrie.findLongestPrefix(path);
    if (dynamicMatch)
      return {
        procedure: dynamicMatch.value,
        relativePath: dynamicMatch.relativePath,
      };

    return undefined;
  };

  /** The core execution logic for any procedure call. */
  const execute = async (
    env: Env<any>,
    path: string,
    input: TInput,
    type: "ask" | "tell"
  ): Promise<ProcedureExecutionResult<TOutput> | void> => {
    const found = findProcedure(path);
    if (!found) {
      const error = new Error(`Procedure '${path}' not found.`);
      if (type === "ask") return { success: false, error };
      // For 'tell' calls, we log the error server-side but don't throw,
      // as the client is not awaiting a response.
      console.error(
        `[erpc executor] Fire-and-forget procedure '${path}' not found. Request ignored.`
      );
      return;
    }

    const { procedure, relativePath } = found;

    try {
      const result = await executeMiddlewareChain({
        middlewares: procedure.middlewares,
        env,
        path,
        type,
        input,
        finalHandler: (finalEnv, finalInput) => {
          // Based on the procedure type, call the appropriate internal handler.
          switch (procedure.type) {
            case "dynamic":
              return (
                procedure as DynamicProcedure<any, any, TInput, TOutput>
              )._handler(finalEnv, relativePath!, finalInput, type);
            case "ask":
              return (procedure as AskProcedure<any, any, TInput, TOutput>)._handler(
                finalEnv,
                ...finalInput
              );
            case "tell":
              return (procedure as TellProcedure<any, any, TInput>)._handler(
                finalEnv,
                ...finalInput
              );
          }
        },
      });

      if (type === "ask") {
        return { success: true, data: result };
      }
      return; // 'tell' calls resolve with no data.
    } catch (error: any) {
      if (type === "ask") {
        return { success: false, error };
      } else {
        console.error(
          `[erpc server] Error in fire-and-forget procedure '${path}':`,
          error
        );
        return;
      }
    }
  };

  return {
    handleAsk: (env, path, input) => execute(env, path, input, "ask"),
    handleTell: async (env, path, input) => {
      await execute(env, path, input, "tell");
    },
  };
}
