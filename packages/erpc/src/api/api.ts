import type { Procedure } from "./procedure";

/**
 * Represents a composable API definition in erpc.
 * @template InitCtx The initial context type required by procedures in this API.
 */
export type Api<InitCtx, TInput extends Array<unknown>, TOutput> =
  | Router<InitCtx, TInput, TOutput>
  | Procedure<InitCtx, any, TInput, TOutput>; // Procedure generics will be updated

/**
 * Represents a collection of named API endpoints.
 * @template InitCtx The initial context type required by procedures in this router.
 */
export type Router<InitCtx, TInput extends Array<unknown>, TOutput> = {
  [key: string]: Api<InitCtx, TInput, TOutput>;
};