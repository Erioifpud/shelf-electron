import type { JsonValue } from "packages/transport/dist/index.mjs";
import type { Api, Router } from "./api";
import type {
  AskProcedure,
  DynamicProcedure,
  Procedure,
  TellProcedure,
} from "./procedure";
import type { InferPhantomData } from "../types/common";

/** The client-side type for an 'ask' procedure. */
export type StubAskProcedure<TProc extends AskProcedure<any, any, any>> = (
  ...args: InferPhantomData<TProc["input"]>
) => Promise<Awaited<InferPhantomData<TProc["output"]>>>;

/** The client-side type for a 'tell' procedure. */
export type StubTellProcedure<TProc extends TellProcedure<any, any>> = (
  ...args: InferPhantomData<TProc["input"]>
) => Promise<void>;

/** The client-side type for a 'dynamic' procedure. */
export type StubDynamicProcedure = StubDynamic;

/** Maps a server-side procedure type to its corresponding client-side stub type. */
export type StubProcedure<TProc> =
  TProc extends AskProcedure<any, any, any>
    ? { ask: StubAskProcedure<TProc> }
    : TProc extends TellProcedure<any, any>
      ? { tell: StubTellProcedure<TProc> }
      : TProc extends DynamicProcedure<any, any, any>
        ? StubDynamicProcedure
        : never;

/**
 * The client-side type for a dynamic router endpoint.
 * It allows arbitrary nesting and terminates with `ask`, `tell`, `invoke`, or `meta`.
 */
export type StubDynamic = {
  [key: string]: StubDynamic;
} & {
  ask: (...args: any[]) => Promise<any>;
  tell: (...args: any[]) => Promise<void>;
  invoke: Invoker;
  meta: (...meta: JsonValue[]) => StubDynamic;
};

/**
 * The type for the `.invoke()` method, allowing dynamic procedure calls
 * on a client instance with a string path.
 */
export type Invoker = <A extends "ask" | "tell", T = any>(
  path: string,
  action: A,
  ...args: any[]
) => A extends "ask" ? Promise<T> : Promise<void>;

/**
 * Recursively builds the client-side type definition (the "stub") from a
 * server-side `Api` definition.
 *
 * This powerful conditional type is the heart of eRPC's end-to-end type safety.
 * It inspects the structure of the API and generates a matching client interface.
 *
 * @template TApi The server-side API definition.
 */
export type BuildStub<TApi> =
  // A trick to check if TApi is `any`. If so, default to a fully dynamic stub.
  0 extends 1 & TApi
    ? StubDynamic
    : // If TApi is a single Procedure, generate its specific stub.
      TApi extends Procedure<any, any, any>
      ? StubProcedure<TApi>
      : TApi extends Api<any, any>
        ? // If TApi is a Router, recursively build stubs for each of its properties.
          {
            [K in string & keyof TApi as TApi[K] extends Api<any, any>
              ? K
              : never]: TApi[K] extends Procedure<any, any, any>
              ? StubProcedure<TApi[K]>
              : // Recursion step for nested routers.
                TApi[K] extends Router<any, any>
                ? BuildStub<TApi[K]>
                : never;
          } & {
            // Add special methods to every level of the router.
            /** Allows calling procedures dynamically using a string path. */
            invoke: Invoker;
            /** Attaches metadata to the next procedure call. */
            meta: (...meta: JsonValue[]) => BuildStub<TApi>;
          }
        : never;
