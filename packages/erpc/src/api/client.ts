import type { JsonValue, MaybePromise } from "packages/transport/dist/index.mjs";
import type { Api } from "./api";
import type { BuildStub } from "./stub";

/**
 * The user-facing eRPC client type.
 * It takes a server-side `Api` definition and resolves to a strongly-typed
 * client-side interface via the `BuildStub` utility type.
 */
export type Client<TApi extends Api<any, any>> = BuildStub<TApi>;

/**
 * A function that executes a remote procedure call.
 *
 * This type defines the contract for the transport-agnostic call executor,
 * using function overloading to provide distinct return types for 'ask' and 'tell'.
 * The client proxy relies on this function to send requests to the remote peer.
 */
export type CallProcedure<TInput extends Array<unknown>, TOutput> = {
  (path: string, action: 'ask', args: TInput, meta?: JsonValue[]): Promise<TOutput>;
  (path: string, action: 'tell', args: TInput, meta?: JsonValue[]): Promise<void>;
};

/**
 * The handler for the dynamic proxy, processing property access and function calls.
 * @internal
 */
export type ProxyCallHandler<
  TInput extends Array<unknown>, TOuput
> = (path: string[], args: TInput, meta?: JsonValue[]) => MaybePromise<TOuput>;

/**
 * Recursively creates a proxy object to build the client's API structure.
 *
 * @param handler The function that handles the final call when a path is invoked.
 * @param path The current path segments being built.
 * @param meta The metadata accumulated so far.
 * @returns A new proxy.
 * @internal
 */
export function createProxy<
  TInput extends Array<unknown>, TOuput
>(handler: ProxyCallHandler<TInput, TOuput>, path: string[] = [], meta?: JsonValue[]) {
  // A proxy is created around a dummy function.
  const proxy: any = new Proxy(() => { }, {
    get: (_target, prop: string) => {
      // Prevent the proxy from being treated as a Promise by promise-chaining libraries.
      if (prop === 'then') return undefined;
      // Ignore symbols to prevent conflicts with runtime mechanics.
      if (typeof prop === 'symbol') return undefined;
      // Recursively build the path.
      return createProxy(handler, [...path, prop], meta);
    },
    apply: (_target, _thisArg, args: TInput) => {
      // When the end of a path is called like a function, execute the handler.
      return handler(path, args, meta);
    },
  });
  return proxy;
}

/**
 * Builds the runtime proxy for the eRPC client.
 *
 * This function is decoupled from any specific transport. It accepts a `callProcedure`
 * function, which encapsulates the logic for sending an RPC call and receiving a response.
 *
 * @param callProcedure A function that executes the remote procedure.
 * @returns A fully-typed, runtime eRPC client proxy.
 * @internal
 */
export function buildClient<TApi extends Api<any, any> = any>(
  callProcedure: CallProcedure<any, any>
): Client<TApi> {
  const handler: ProxyCallHandler<any, any> = (path, args, meta) => {
    const action = path.at(-1);
    const procedurePathSegments = path.slice(0, -1);
    const procedurePathString = procedurePathSegments.join('.');

    switch (action) {
      // Standard procedure calls.
      case 'ask':
        return callProcedure(procedurePathString, action, args, meta);
      case 'tell':
        return callProcedure(procedurePathString, action, args, meta);

      // Metadata attachment.
      case 'meta':
        const newMetas = args;
        const existingMeta = Array.isArray(meta) ? meta : [];
        const newMetaArray = [...existingMeta, ...newMetas];
        // Return a new proxy with the updated metadata.
        return createProxy(handler, procedurePathSegments, newMetaArray);

      // Dynamic invocation.
      case 'invoke':
        const [subPath, invokeAction, ...procedureArgs] = args;
        if (typeof subPath !== 'string' || !['ask', 'tell'].includes(invokeAction)) {
          return Promise.reject(new Error(
            `Invalid .invoke() usage on path '${procedurePathString}'. Expected: .invoke('procedure.path', 'ask' | 'tell', ...args)`
          ));
        }
        const fullPath = procedurePathString ? `${procedurePathString}.${subPath}` : subPath;
        return callProcedure(fullPath, invokeAction, procedureArgs, meta);

      // Invalid termination of a call chain.
      default:
        const fullInvalidPath = path.join('.');
        return Promise.reject(new Error(
          `Invalid RPC call on path '${fullInvalidPath}'. A procedure path must be terminated with .ask(...), .tell(...), or manipulated with .meta(...) / .invoke(...).`
        ));
    }
  };

  return createProxy(handler, [], undefined) as Client<TApi>;
}