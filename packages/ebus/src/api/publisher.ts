import type {
  Api,
  AskProcedure,
  InferPhantomData,
  JsonValue,
  Procedure,
  Router,
  TellProcedure,
  Transferable,
} from "@eleplug/erpc";
import type { BroadcastableArray, Result, Topic } from "../types/common.js";
import { EbusError } from "../types/errors.js";

// =================================================================
// Section 1: Publisher Client Type Definition
// =================================================================

/** Transforms a server-side 'ask' procedure into its publisher client counterpart. */
type PublisherClientAskProcedure<TProc extends AskProcedure<any, any, any>> =
  /**
   * Broadcasts a request and returns an async iterable of all results.
   * @param args The arguments for the procedure, matching the consumer's API.
   * @returns An `AsyncIterable` that yields a `Result` for each responding subscriber.
   */
  (
    ...args: InferPhantomData<TProc["input"]>
  ) => AsyncIterable<Result<Awaited<InferPhantomData<TProc["output"]>>>>;

/** The 'tell' procedure signature remains the same in the publisher client. */
type PublisherClientTellProcedure<TProc extends TellProcedure<any, any>> =
  /**
   * Broadcasts a fire-and-forget notification to all subscribers.
   * @param args The arguments for the procedure.
   * @returns A promise that resolves when the broadcast has been initiated.
   */
  (...args: InferPhantomData<TProc["input"]>) => Promise<void>;

/** Maps a server-side procedure type to its corresponding publisher client method. */
type PublisherClientProcedure<TProc> =
  TProc extends AskProcedure<any, any, any>
    ? { all: PublisherClientAskProcedure<TProc> } // 'ask' procedures are called via '.all()'
    : TProc extends TellProcedure<any, any>
      ? { tell: PublisherClientTellProcedure<TProc> } // 'tell' procedures are called via '.tell()'
      : never;

/**
 * Recursively builds the publisher client's type from a consumer API definition.
 * This utility type is the core of the publisher's type-safety.
 * @internal
 */
type BuildPublisherClient<TApi> =
  // Fallback for untyped APIs.
  0 extends 1 & TApi
    ? any
    : // If it's a Procedure, transform it.
      TApi extends Procedure<any, any, any>
      ? PublisherClientProcedure<TApi>
      : // If it's a Router, recursively transform its properties.
        TApi extends Router<any, any>
        ? {
            [K in string & keyof TApi as TApi[K] extends Api<
              BroadcastableArray,
              Transferable
            >
              ? K
              : never]: BuildPublisherClient<TApi[K]>;
          }
        : never;

/**
 * The user-facing type for a Publisher Client.
 *
 * It is a deeply-typed proxy that transforms a consumer's `erpc` API shape
 * into a publisher's API. For example, a consumer procedure `add(a: number, b: number)`
 * is invoked on the publisher via `publisher.add.all(a, b)`.
 *
 * @template THandlerApi The API shape of the consumers of this topic.
 */
export type PublisherClient<
  THandlerApi extends Api<BroadcastableArray, Transferable>,
> = BuildPublisherClient<THandlerApi>;

// =================================================================
// Section 2: Publisher Client Proxy Builder
// =================================================================

/**
 * The function signature for the underlying broadcast implementation.
 * This contract is fulfilled by `PubSubHandlerFeature`.
 * @internal
 */
export type PublishProcedure = (
  topic: Topic,
  path: string,
  action: "all" | "tell",
  args: BroadcastableArray,
  meta?: JsonValue[]
) => Promise<void> | AsyncIterable<Result<Transferable>>;

/** @internal The internal handler for the proxy. */
type ProxyPublishHandler = (
  path: string[],
  args: BroadcastableArray,
  meta?: JsonValue[]
) => Promise<void> | AsyncIterable<Result<Transferable>>;

/**
 * Recursively creates the runtime proxy object.
 * @internal
 */
function createPublisherProxy(
  handler: ProxyPublishHandler,
  path: string[] = [],
  meta?: JsonValue[]
): any {
  // The proxy is built around a dummy function. The `get` and `apply` traps
  // intercept all property access and function calls to build the RPC path.
  const proxy = new Proxy(() => {}, {
    get: (_target, prop: string) => {
      // Standard proxy hygiene: ignore 'then' for promise-chaining and symbols.
      if (prop === "then" || typeof prop === "symbol") return undefined;

      // The `meta` function is a special case, returning a new proxy with updated metadata.
      if (prop === "meta") {
        return (...newMetas: JsonValue[]) => {
          const existingMeta = Array.isArray(meta) ? meta : [];
          return createPublisherProxy(handler, path, [
            ...existingMeta,
            ...newMetas,
          ]);
        };
      }
      // Recursively build the path by appending the current property name.
      return createPublisherProxy(handler, [...path, prop], meta);
    },
    apply: (_target, _thisArg, args: BroadcastableArray) => {
      // When a path is invoked as a function, execute the handler.
      return handler(path, args, meta);
    },
  });
  // The `any` type is necessary for the internal proxy mechanics, but the
  // final exported type from `buildPublisher` is strongly typed.
  return proxy;
}

/**
 * Builds a typed PublisherClient proxy for a specific topic.
 *
 * @param publishProcedure The callback function that performs the actual broadcast.
 * @param topic The topic this publisher is bound to.
 * @returns A fully typed `PublisherClient`.
 * @internal
 */
export function buildPublisher<
  THandlerApi extends Api<BroadcastableArray, Transferable>,
>(
  publishProcedure: PublishProcedure,
  topic: Topic
): PublisherClient<THandlerApi> {
  const handler: ProxyPublishHandler = (path, args, meta) => {
    const action = path.at(-1);
    const procedurePathSegments = path.slice(0, -1);
    const procedurePathString = procedurePathSegments.join(".");

    if (action === "all" || action === "tell") {
      return publishProcedure(topic, procedurePathString, action, args, meta);
    } else {
      // A proxy call chain must end in `.all()` or `.tell()`.
      const fullInvalidPath = path.join(".");
      // Returning a rejected promise is the correct behavior for an async-like proxy.
      return Promise.reject(
        new EbusError(
          `Invalid publisher call on path '${fullInvalidPath}'. A publisher path must be terminated with .all(...) or .tell(...).`
        )
      );
    }
  };
  return createPublisherProxy(handler) as PublisherClient<THandlerApi>;
}
