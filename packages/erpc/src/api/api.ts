import type { Procedure } from "./procedure";

/**
 * Represents a composable API definition in erpc.
 *
 * An `Api` can be either a single endpoint (a `Procedure`) or a nested
 * collection of endpoints (a `Router`).
 *
 * @template TInput The expected type of the input arguments array for procedures within this API.
 * @template TOutput The expected return type for procedures within this API.
 */
export type Api<
  TInput extends Array<unknown>, TOutput
> = Router<TInput, TOutput> | Procedure<any, TInput, TOutput>;

/**
 * Represents a collection of named API endpoints, which can be other Routers
 * or Procedures.
 *
 * This allows for creating nested, organized API structures, for example:
 * `e.router({ posts: { create: e.procedure.ask(...) } })`.
 *
 * @template TInput The expected type of the input arguments array for procedures within this router.
 * @template TOutput The expected return type for procedures within this router.
 */
export type Router<TInput extends Array<unknown>, TOutput> = {
  [key: string]: Api<TInput, TOutput>
}