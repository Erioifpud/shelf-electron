import type { JsonValue } from "@eleplug/transport";
import { middleware, type Middleware } from "./middleware";
import type { Api, Router } from "./api";
import {
  createAskProcedure,
  createTellProcedure,
  createDynamicProcedure,
  type Procedure,
  type AskProcedure,
  type TellProcedure,
  type DynamicProcedure,
} from "./procedure";
import { isProcedure } from "./router";

/**
 * The function signature for an injector, which creates the initial context
 * for a request. It can optionally receive metadata from the client and can
 * also transform it before it's passed to the middleware chain.
 *
 * @template InitCtx The type of the context object to be created.
 */
export type InjectorFn<InitCtx> = (
  meta?: JsonValue[]
) => Promise<{ context: InitCtx; meta?: JsonValue[] }>;

/**
 * Creates a special middleware that runs first, creates the initial context
 * using the provided injector function, and passes it down the chain.
 *
 * This middleware transforms a `void` context into the `TInitCtx` required
 * by the rest of the procedure's middleware chain.
 *
 * @param injector The user-provided function to create the context.
 * @returns A middleware that performs the context injection.
 * @internal
 */
function createInjectorMiddleware<InitCtx>(
  injector: InjectorFn<InitCtx>
): Middleware<{
  CtxIn: void;
  CtxOut: InitCtx;
}> {
  return middleware(async (opts) => {
    // 1. Call the user's injector function to create the initial context.
    const { context: initialContext, meta: transformedMeta } = await injector(
      opts.meta
    );

    // 2. Call the next middleware in the chain, providing the newly created context.
    // If the injector returned a new metadata array, use that; otherwise, preserve the original.
    return opts.next({
      ...opts,
      ctx: initialContext,
      meta: transformedMeta ?? opts.meta,
    });
  });
}

/**
 * Recursively traverses an API definition, prepending an injector middleware
 * to every procedure found.
 *
 * This function effectively "bakes in" the context creation logic into the API
 * definition itself by transforming an API that requires an initial context into one
 * that is self-sufficient and ready for the server.
 *
 * @param api The API definition to transform.
 * @param injectorMiddleware The middleware to prepend to each procedure.
 * @returns A new API definition with the middleware applied, whose `InitCtx` is now `void`.
 * @internal
 */
function applyInjectorRecursively<
  InitCtx,
  TInput extends Array<unknown>,
  TOutput,
>(
  api: Api<InitCtx, TInput, TOutput>,
  injectorMiddleware: Middleware<any>
): Api<void, TInput, TOutput> {
  // Base case: If the current node is a Procedure.
  if (isProcedure(api)) {
    // We can be confident about the type cast due to the function's call signature.
    const proc = api as Procedure<InitCtx, any, any, any>;

    // Create a new middleware array with the injector at the beginning.
    const newMiddlewares = [injectorMiddleware, ...proc.middlewares];

    // Re-create the procedure with the new middleware chain. This is crucial for immutability
    // and ensures the new procedure's type correctly reflects InitCtx=void.
    // The `as any` casts are safe here because we are reconstructing an identical
    // procedure, only changing the middleware array. The final return type of `inject`
    // will enforce the overall type safety.
    switch (proc.type) {
      case "ask":
        return createAskProcedure(
          (proc as AskProcedure<InitCtx, any, TInput, TOutput>)._handler,
          newMiddlewares
        );
      case "tell":
        return createTellProcedure(
          (proc as TellProcedure<InitCtx, any, TInput>)._handler,
          newMiddlewares
        );
      case "dynamic":
        return createDynamicProcedure(
          (proc as DynamicProcedure<InitCtx, any, TInput, TOutput>)._handler,
          newMiddlewares
        );
    }
  }

  // Recursive step: If the current node is a Router.
  const router = api as Router<InitCtx, TInput, TOutput>;
  const newRouter: Router<void, TInput, TOutput> = {};

  // Iterate over the keys of the router and apply the function to each child.
  for (const key in router) {
    if (Object.prototype.hasOwnProperty.call(router, key)) {
      newRouter[key] = applyInjectorRecursively(
        router[key],
        injectorMiddleware
      );
    }
  }
  return newRouter;
}

/**
 * Injects a context provider into an API definition by prepending a special
 * middleware to every procedure in the API tree.
 *
 * This function takes an API that declares a required initial context (`InitCtx`)
 * and a function (`injector`) that knows how to create this context. It returns
 * a new, transformed API definition that is self-contained (its `InitCtx` becomes `void`).
 * This makes the resulting API suitable for direct use with `createServer`.
 *
 * @template InitCtx The initial context type required by the input API.
 * @template TApi The specific type of the input API (router or procedure).
 * @param api The API definition that requires an initial context.
 * @param injector An async function that creates the context for each incoming request.
 * @returns A new, self-contained API definition ready to be served.
 *
 * @example
 * ```ts
 * // 1. An API declaring its need for a `Database` context.
 * const dbApi: Api<Database, ...> = {
 *   users: {
 *     get: p2p.ask((env: Env<Database>, id: number) => env.ctx.users.find(id))
 *   }
 * };
 *
 * // 2. An injector function that provides the `Database` context.
 * const dbInjector: InjectorFn<Database> = async () => {
 *   const dbConnection = await connectToDatabase();
 *   return { context: dbConnection };
 * };
 *
 * // 3. Inject the context provider into the API.
 * const serverReadyApi = inject(dbApi, dbInjector);
 * // serverReadyApi is now of type `Api<void, ...>`
 *
 * // 4. Use the resulting API to create a server.
 * const server = await createServer(transport, serverReadyApi);
 * ```
 */
export function inject<InitCtx, TApi extends Api<InitCtx, any, any>>(
  api: TApi,
  injector: InjectorFn<InitCtx>
): Api<
  void,
  TApi extends Api<any, infer TInput, any> ? TInput : never,
  TApi extends Api<any, any, infer TOutput> ? TOutput : never
> {
  // Create the single injector middleware instance.
  const injectorMiddleware = createInjectorMiddleware(injector);

  // Start the recursive transformation process.
  // The final type cast is safe due to the function's generic constraints.
  return applyInjectorRecursively(api, injectorMiddleware);
}
